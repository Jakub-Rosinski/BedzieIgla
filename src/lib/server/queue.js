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
 * @param {ContactFields & { attachments: Attachment[] }} submission
 * @returns {Promise<string>} identyfikator zgłoszenia
 */
export async function enqueue({ attachments = [], ...fields }) {
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
      const attachments = await Promise.all(
        job.attachments.map(async (a) => ({
          filename: a.filename,
          contentType: a.contentType,
          content: await fs.readFile(path.join(dir, a.file)),
        }))
      );

      await sendContactEmail({ ...job.fields, attachments });
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

/** @type {NodeJS.Timeout | null} */
let timer = null;
let running = false;

/** Uruchamia przebieg, o ile żaden nie trwa — przebiegi nie mogą się nakładać. */
async function tick() {
  if (running) return;
  running = true;
  try {
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
};
