/**
 * Trwała kolejka zgłoszeń z formularza kontaktowego.
 *
 * Zgłoszenie ląduje na dysku ZANIM spróbujemy je wysłać, a odpowiedź dla
 * klienta nie zależy od dostępności SMTP. Wcześniej awaria serwera pocztowego
 * kończyła się odpowiedzią 502 i bezpowrotną utratą treści, danych kontaktowych
 * i zdjęć — klient widział błąd i nie wiedział, czy wysyłać ponownie, a Gosia
 * nigdy się nie dowiadywała, że ktoś próbował.
 *
 * Trwałość opiera się na dwóch własnościach systemu plików:
 *   1. Zgłoszenie budujemy w katalogu tymczasowym i wsuwamy do `pending/`
 *      jednym `rename()`. Katalog w `pending/` jest więc zawsze kompletny —
 *      przerwany zapis nie zostawia zgłoszenia w połowie.
 *   2. `job.json` nadpisujemy przez zapis do `.tmp` i `rename()` na wierzch,
 *      więc licznik prób nigdy nie zostaje uszkodzony w trakcie zapisu.
 *
 * Dostarczanie jest typu at-least-once: jeśli proces zginie po tym, jak SMTP
 * przyjął wiadomość, ale przed usunięciem katalogu, zgłoszenie zostanie wysłane
 * ponownie. Wybór świadomy — duplikat w skrzynce Gosi jest znacznie mniej
 * kosztowny niż zgubione zapytanie.
 *
 * Zakłada JEDNĄ instancję procesu (PM2 fork mode — patrz rate-limit.js).
 * W trybie cluster kilka workerów wzięłoby to samo zgłoszenie naraz.
 */

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { sendContactEmail } from "./mailer.js";
import { uploadOriginal, thumbnail, inspirationLink } from "./inspiracje.js";

/** Odstępy przed kolejnymi próbami. Długość tablicy = liczba ponowień. */
const RETRY_DELAYS_MS = [
  60_000, // 1 min
  5 * 60_000, // 5 min
  15 * 60_000, // 15 min
  60 * 60_000, // 1 h
  6 * 60 * 60_000, // 6 h
];

/** Pierwsza próba + ponowienia. */
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

/** Jak często worker sprawdza, czy coś dojrzało do wysyłki. */
const TICK_MS = 30_000;

/**
 * Katalog kolejki. Czytany przy każdym wywołaniu, nie przy imporcie, żeby
 * testy mogły go podmienić. MUSI leżeć poza `build/` — deploy robi na tym
 * katalogu `rsync --delete` i skasowałby oczekujące zgłoszenia.
 */
function queueRoot() {
  return process.env.QUEUE_DIR || "queue";
}

const pendingDir = () => path.join(queueRoot(), "pending");
const deadDir = () => path.join(queueRoot(), "dead");

/**
 * Limity chroniące dysk (#31). Zapełniony dysk łamie sam mechanizm trwałości:
 * `enqueue()` dostaje ENOSPC i zgłoszenie przepada — lepiej odmówić wcześniej,
 * uczciwym 503, póki system ma jeszcze miejsce. Obiekt (a nie stałe), żeby
 * testy mogły je obniżyć.
 */
const limits = {
  /** × maks. ~120 MB na zgłoszenie (10 × 15 MB) ≈ 12 GB w najgorszym przypadku. */
  maxPending: 100,
  /** Zapas zostawiany systemowi, logom i buildowi. */
  minFreeBytes: 1024 ** 3,
};

/** Po tylu dniach zgłoszenie z dead/ jest kasowane — na ręczne odzyskanie jest miesiąc. */
const DEAD_TTL_MS = 30 * 24 * 60 * 60_000;

/** Porzucony katalog `.staging-*` (proces zginął w trakcie zapisu) — sprzątany po godzinie. */
const STAGING_TTL_MS = 60 * 60_000;

/** Kolejka odmawia przyjęcia — endpoint zamienia to na 503. */
export class QueueFullError extends Error {}

/** @param {string} dir */
const list = (dir) => fs.readdir(dir).catch(() => /** @type {string[]} */ ([]));

/**
 * Powód, dla którego kolejka nie może przyjąć zgłoszenia, albo `null`.
 * @returns {Promise<string | null>}
 */
async function capacityProblem() {
  const pending = (await list(pendingDir())).length;
  if (pending >= limits.maxPending) {
    return `pending/ ma ${pending} zgłoszeń (limit ${limits.maxPending})`;
  }
  await fs.mkdir(queueRoot(), { recursive: true });
  const { bavail, bsize } = await fs.statfs(queueRoot());
  const free = bavail * bsize;
  if (free < limits.minFreeBytes) {
    return `wolne miejsce na dysku ${Math.round(free / 1024 ** 2)} MB (próg ${Math.round(limits.minFreeBytes / 1024 ** 2)} MB)`;
  }
  return null;
}

/**
 * @typedef {{
 *   name: string, email: string, phone: string,
 *   miejsce: string, wielkosc: string, message: string
 * }} ContactFields
 * @typedef {{ filename: string, content: Buffer, contentType: string }} Attachment
 * @typedef {{
 *   id: string, createdAt: number, attempts: number, nextAttemptAt: number,
 *   lastError: string | null, fields: ContactFields,
 *   attachments: { file: string, filename: string, contentType: string }[]
 * }} Job
 */

/**
 * Zapis `job.json` odporny na przerwanie w połowie.
 * @param {string} dir @param {Job} job
 */
async function writeMeta(dir, job) {
  const target = path.join(dir, "job.json");
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(job, null, 2), "utf8");
  await fs.rename(tmp, target);
}

/**
 * Przyjmuje zgłoszenie do kolejki. Zwraca dopiero wtedy, gdy komplet danych
 * jest na dysku — od tego momentu zgłoszenie przetrwa restart procesu.
 *
 * Odmawia (`QueueFullError`), gdy kolejka jest pełna albo kończy się dysk —
 * zanim cokolwiek zapisze.
 *
 * @param {ContactFields & { attachments: Attachment[] }} submission
 * @returns {Promise<string>} identyfikator zgłoszenia
 */
export async function enqueue({ attachments = [], ...fields }) {
  const problem = await capacityProblem();
  if (problem) {
    console.error(`[kolejka] ALERT: odrzucono zgłoszenie od ${fields.email} — ${problem}`);
    throw new QueueFullError(problem);
  }

  const id = `${Date.now()}-${crypto.randomUUID()}`;
  const staging = path.join(queueRoot(), `.staging-${id}`);
  await fs.mkdir(staging, { recursive: true });

  /** @type {Job["attachments"]} */
  const manifest = [];
  for (const [index, att] of attachments.entries()) {
    const file = `att-${index}`;
    await fs.writeFile(path.join(staging, file), att.content);
    manifest.push({ file, filename: att.filename, contentType: att.contentType });
  }

  const now = Date.now();
  await writeMeta(staging, {
    id,
    createdAt: now,
    attempts: 0,
    nextAttemptAt: now, // pierwsza próba natychmiast
    lastError: null,
    fields: /** @type {ContactFields} */ (fields),
    attachments: manifest,
  });

  // Dopiero ten rename czyni zgłoszenie widocznym dla workera — w pending/
  // nigdy nie ma katalogu zapisanego w połowie.
  await fs.mkdir(pendingDir(), { recursive: true });
  await fs.rename(staging, path.join(pendingDir(), id));

  nudge();
  return id;
}

/** @param {string} dir @returns {Promise<Job | null>} */
async function readJob(dir) {
  try {
    return JSON.parse(await fs.readFile(path.join(dir, "job.json"), "utf8"));
  } catch {
    return null; // katalog w trakcie zapisu albo uszkodzony — pominie go następny przebieg
  }
}

/** Zgłoszenia, które właśnie wysyłamy — chroni przed podwójnym przetworzeniem. */
const inFlight = new Set();

/**
 * Jeden przebieg: wysyła wszystko, co dojrzało. Wyeksportowane dla testów —
 * pozwala przetestować kolejkę bez czekania na zegar.
 *
 * @returns {Promise<{ sent: number, failed: number, dead: number }>}
 */
export async function processDue() {
  const stats = { sent: 0, failed: 0, dead: 0 };

  let ids;
  try {
    ids = await fs.readdir(pendingDir());
  } catch {
    return stats; // kolejka jeszcze nie istnieje — nie ma czego wysyłać
  }

  for (const id of ids) {
    if (inFlight.has(id)) continue;

    const dir = path.join(pendingDir(), id);
    const job = await readJob(dir);
    if (!job || job.nextAttemptAt > Date.now()) continue;

    inFlight.add(id);
    try {
      // Oryginały → prywatny S3, do maila tylko miniatury i linki (#19).
      // Po kolei, nie równolegle: 10 × 15 MB naraz to zbędny szczyt pamięci.
      // Klucz zależy tylko od id zgłoszenia, więc ponowienie nadpisuje obiekt.
      /** @type {{ filename: string, content: Buffer, contentType: string }[]} */
      const thumbnails = [];
      /** @type {{ filename: string, url: string }[]} */
      const links = [];
      for (const [index, a] of job.attachments.entries()) {
        const file = path.join(dir, a.file);
        const key = `${job.id}/${index + 1}-${a.filename}`;
        await uploadOriginal(key, file, a.contentType);
        thumbnails.push({
          filename: `podglad-${a.filename.replace(/\.\w+$/, "")}.jpg`,
          content: await thumbnail(file),
          contentType: "image/jpeg",
        });
        links.push({ filename: a.filename, url: inspirationLink(key) });
      }

      await sendContactEmail({ ...job.fields, attachments: thumbnails, links });
      await fs.rm(dir, { recursive: true, force: true });
      stats.sent++;
    } catch (err) {
      job.attempts++;
      job.lastError = err instanceof Error ? err.message : String(err);

      if (job.attempts >= MAX_ATTEMPTS) {
        // Wyczerpaliśmy ponowienia. Zgłoszenie NIE ginie — ląduje w dead/,
        // skąd można je odzyskać ręcznie. Ten log jest sygnałem dla
        // monitoringu (#25); cisza w skrzynce Gosi nie może być jedynym objawem.
        await fs.mkdir(deadDir(), { recursive: true });
        await writeMeta(dir, job);
        await fs.rename(dir, path.join(deadDir(), id));
        console.error(
          `[kolejka] ALERT: zgłoszenie ${id} od ${job.fields.email} porzucone po ${job.attempts} próbach. ` +
            `Ostatni błąd: ${job.lastError}. Odzyskaj z ${deadDir()}/${id}`
        );
        stats.dead++;
      } else {
        job.nextAttemptAt = Date.now() + RETRY_DELAYS_MS[job.attempts - 1];
        await writeMeta(dir, job);
        console.warn(
          `[kolejka] Wysyłka ${id} nieudana (próba ${job.attempts}/${MAX_ATTEMPTS}): ${job.lastError}. ` +
            `Kolejna próba za ${Math.round(RETRY_DELAYS_MS[job.attempts - 1] / 1000)} s`
        );
        stats.failed++;
      }
    } finally {
      inFlight.delete(id);
    }
  }

  return stats;
}

/**
 * Zgłoszenie czekające dłużej niż tyle oznacza, że wysyłka nie działa: przy
 * odstępach 1 → 5 → 15 min po 30 minutach padły już co najmniej 3 próby.
 */
const STUCK_AFTER_MS = 30 * 60_000;

/**
 * Stan kolejki dla monitoringu (#25). Celowo NIE łączy się z SMTP — sonda
 * co kilka minut na publicznym endpoincie oznaczałaby setki logowań na
 * `kontakt@` dziennie i dawała każdemu sposób na zablokowanie skrzynki przez
 * OVH. Awaria SMTP i tak widać tutaj: zgłoszenia utykają w `pending/`.
 *
 * `full` — kolejka odrzuca nowe zgłoszenia (#31); to też awaria.
 *
 * @param {number} [now]
 * @returns {Promise<{ ok: boolean, pending: number, stuck: number, dead: number, full: boolean }>}
 */
export async function queueHealth(now = Date.now()) {
  const pendingIds = await list(pendingDir());
  const dead = (await list(deadDir())).length;
  const full = (await capacityProblem()) !== null;

  let stuck = 0;
  for (const id of pendingIds) {
    const job = await readJob(path.join(pendingDir(), id));
    if (job && now - job.createdAt > STUCK_AFTER_MS) stuck++;
  }

  return { ok: stuck === 0 && dead === 0 && !full, pending: pendingIds.length, stuck, dead, full };
}

/**
 * Sprząta to, co inaczej rosłoby bez końca (#31): zgłoszenia w dead/ starsze
 * niż 30 dni (z logiem, żeby było wiadomo, co zniknęło) i porzucone katalogi
 * `.staging-*`. Wiek liczony od mtime katalogu — przy przenosinach do dead/
 * `writeMeta` go odświeża, więc to moment porzucenia, nie przyjęcia.
 *
 * @param {number} [now]
 */
export async function purgeExpired(now = Date.now()) {
  for (const id of await list(deadDir())) {
    const dir = path.join(deadDir(), id);
    const { mtimeMs } = await fs.stat(dir);
    if (now - mtimeMs < DEAD_TTL_MS) continue;
    const job = await readJob(dir);
    console.warn(
      `[kolejka] Usuwam z dead/ zgłoszenie ${id} od ${job?.fields.email ?? "?"} — nieodzyskane przez 30 dni`
    );
    await fs.rm(dir, { recursive: true, force: true });
  }

  for (const name of await list(queueRoot())) {
    if (!name.startsWith(".staging-")) continue;
    const dir = path.join(queueRoot(), name);
    const { mtimeMs } = await fs.stat(dir);
    if (now - mtimeMs >= STAGING_TTL_MS) await fs.rm(dir, { recursive: true, force: true });
  }
}

/** @type {NodeJS.Timeout | null} */
let timer = null;
let running = false;

/** Uruchamia przebieg, o ile żaden nie trwa — przebiegi nie mogą się nakładać. */
async function tick() {
  if (running) return;
  running = true;
  try {
    await purgeExpired();
    await processDue();
  } catch (err) {
    console.error("[kolejka] Nieoczekiwany błąd przebiegu:", err);
  } finally {
    running = false;
  }
}

/** Budzi workera natychmiast — dzięki temu typowe zgłoszenie idzie od razu, bez czekania na tik. */
function nudge() {
  if (timer) setTimeout(tick, 0);
}

/**
 * Startuje workera. Wywoływane raz, przy starcie serwera (hooks.server.js).
 * Zaległe zgłoszenia z poprzedniego uruchomienia zostaną podjęte na pierwszym
 * przebiegu — dlatego restart VPS-a czy `pm2 reload` nic nie gubi.
 *
 * @returns {() => void} funkcja zatrzymująca workera
 */
export function startQueueWorker() {
  if (timer) return stopQueueWorker;
  timer = setInterval(tick, TICK_MS);
  timer.unref?.(); // nie trzymaj procesu przy życiu wyłącznie z powodu kolejki
  tick();
  return stopQueueWorker;
}

export function stopQueueWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

export const __testing = {
  RETRY_DELAYS_MS,
  MAX_ATTEMPTS,
  TICK_MS,
  pendingDir,
  deadDir,
  inFlight,
  limits,
};
