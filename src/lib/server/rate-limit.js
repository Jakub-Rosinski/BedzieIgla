/**
 * Serwerowy rate limiting dla /api/contact — Mapy w pamięci procesu,
 * przesuwane okno czasowe per IP. Autorytatywny odpowiednik client-side
 * limitów w form-utils.js (te są tylko warstwą UX, łatwą do obejścia).
 *
 * Dwa niezależne liczniki, celowo:
 *  - ATTEMPTS  — liczy KAŻDE żądanie (również odrzucone przy walidacji).
 *    Bez tego licznika żądania niepoprawne nigdy nie były zliczane, więc atak
 *    typu flood (wielokrotne 25 MB multipart, parsowane w całości zanim
 *    walidacja je odrzuci) nie był w żaden sposób ograniczany.
 *  - SENDS     — liczy tylko realnie wysłane maile. Zostaje ostry (5/15 min),
 *    bo to on ogranicza spam docierający do skrzynki.
 *
 * Limit ATTEMPTS jest wyraźnie luźniejszy, żeby użytkownik kilkukrotnie
 * mylący się w formularzu nie został zablokowany.
 *
 * Zakłada pojedynczy proces PM2 w trybie fork — w trybie cluster każdy
 * worker miałby własne Mapy i limity efektywnie by się zwielokrotniły.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_SENDS_PER_IP = 5;
const MAX_ATTEMPTS_PER_IP = 30;

/** @type {Map<string, number[]>} */
const sends = new Map();
/** @type {Map<string, number[]>} */
const attempts = new Map();

/**
 * @param {Map<string, number[]>} store
 * @param {string} ip
 * @param {number} now
 */
function fresh(store, ip, now) {
  return (store.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
}

/**
 * Zlicza próbę (każde żądanie) i mówi, czy IP nie przekroczyło limitu żądań.
 * Wywoływane na samym początku obsługi żądania, ZANIM sparsujemy body.
 * @param {string} ip @param {number} [now]
 */
export function recordAttempt(ip, now = Date.now()) {
  const timestamps = fresh(attempts, ip, now);
  timestamps.push(now);
  attempts.set(ip, timestamps);
  return { allowed: timestamps.length <= MAX_ATTEMPTS_PER_IP };
}

/**
 * Czy IP może jeszcze wysłać maila (limit realnych wysyłek).
 * @param {string} ip @param {number} [now]
 */
export function checkRateLimit(ip, now = Date.now()) {
  return { allowed: fresh(sends, ip, now).length < MAX_SENDS_PER_IP };
}

/** @param {string} ip @param {number} [now] */
export function recordSend(ip, now = Date.now()) {
  const timestamps = fresh(sends, ip, now);
  timestamps.push(now);
  sends.set(ip, timestamps);
}

/** @param {number} [now] */
function cleanup(now = Date.now()) {
  for (const store of [sends, attempts]) {
    for (const [ip, timestamps] of store) {
      const kept = timestamps.filter((t) => now - t < WINDOW_MS);
      if (kept.length === 0) store.delete(ip);
      else store.set(ip, kept);
    }
  }
}

// Zapobiega nieograniczonemu wzrostowi Map przez pojedyncze/jednorazowe IP.
const cleanupTimer = setInterval(() => cleanup(), WINDOW_MS);
cleanupTimer.unref?.();

export const __testing = {
  sends,
  attempts,
  WINDOW_MS,
  MAX_SENDS_PER_IP,
  MAX_ATTEMPTS_PER_IP,
  cleanup,
};
