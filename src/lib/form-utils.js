/**
 * Stałe i czyste funkcje walidacji oraz client-side rate limitingu
 * formularza kontaktowego.
 *
 * Oddzielone od komponentu dla testowalności. Wszystkie funkcje są
 * deterministyczne i nie mają efektów ubocznych poza recordSuccessfulSend.
 *
 * Rate limiting opiera się na localStorage (per email) i sessionStorage
 * (globalny limit sesji). Dostęp do storage jest zabezpieczony try/catch
 * na wypadek trybu prywatnego Safari (ITP) lub zablokowanych cookies —
 * w takim przypadku rate limiting jest cicho pomijany.
 */

export const WINDOW_MS         = 15 * 60 * 1000; // okno rate-limitu (ms)
export const MAX_SENDS         = 3;               // maks. wysyłek per email w oknie
export const SESSION_MAX       = 5;               // maks. wysyłek w całej sesji
export const MIN_FILL_MS       = 3000;            // min. czas wypełniania (ms)
export const MIN_MESSAGE_LEN   = 10;
export const MAX_MESSAGE_LEN   = 5000;
export const SESSION_KEY       = "w3f_session";

// ─── Walidacja ────────────────────────────────────────────────────────────────

/** @param {string} name @returns {string|null} */
export function validateName(name) {
  if (!name?.trim()) return "Podaj imię i nazwisko.";
  return null;
}

/** @param {string} email @returns {string|null} */
export function validateEmail(email) {
  if (!email?.trim()) return "Podaj adres e-mail.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    return "Nieprawidłowy adres e-mail.";
  return null;
}

/** @param {string} phone @returns {string|null} */
export function validatePhone(phone) {
  if (!phone?.trim()) return "Podaj numer telefonu.";
  if (!/^[\d\s\+\-\(\)]{6,20}$/.test(phone.trim()))
    return "Nieprawidłowy numer telefonu.";
  return null;
}

/** @param {string} message @returns {string|null} */
export function validateMessage(message) {
  if (!message?.trim()) return "Wpisz treść wiadomości.";
  const len = message.trim().length;
  if (len < MIN_MESSAGE_LEN)
    return `Wiadomość jest za krótka (min. ${MIN_MESSAGE_LEN} znaków).`;
  if (len > MAX_MESSAGE_LEN)
    return `Treść wiadomości jest za długa (max ${MAX_MESSAGE_LEN} znaków).`;
  return null;
}

/** @param {string} value @param {string} label @returns {string|null} */
function validateRequired(value, label) {
  return value?.trim() ? null : `Podaj ${label}.`;
}

/**
 * Waliduje wszystkie wymagane pola formularza.
 * Zwraca pierwszy napotkany błąd lub null.
 * @param {string} name @param {string} email @param {string} phone
 * @param {string} message @param {string} miejsce @param {string} wielkosc
 * @returns {string|null}
 */
export function validate(name, email, phone, message, miejsce, wielkosc) {
  return (
    validateName(name) ||
    validateEmail(email) ||
    validatePhone(phone) ||
    validateMessage(message) ||
    validateRequired(miejsce, "miejsce na ciele") ||
    validateRequired(wielkosc, "wielkość tatuażu") ||
    null
  );
}

// ─── Wykrywanie botów ─────────────────────────────────────────────────────────

/**
 * Zwraca true gdy formularz wypełniono zbyt szybko (prawdopodobny bot).
 * @param {number} firstInteractionAt — timestamp pierwszej interakcji (0 = brak)
 * @param {number} [now]
 */
export function isBotSubmission(firstInteractionAt, now = Date.now()) {
  return firstInteractionAt > 0 && now - firstInteractionAt < MIN_FILL_MS;
}

// ─── Rate limiting ────────────────────────────────────────────────────────────

/** @param {string} email */
export function emailStorageKey(email) {
  return `w3f_${email.toLowerCase().trim()}`;
}

/**
 * Sprawdza per-email rate limit w localStorage.
 * NIE zapisuje timestampa — tylko odczyt.
 * Zwraca { limited: false } gdy storage jest niedostępny (tryb prywatny, ITP).
 * @param {string} email
 * @param {Storage} [ls]
 * @returns {{ limited: false } | { limited: true, mins: number }}
 */
export function isEmailRateLimited(email, ls = localStorage) {
  try {
    const key  = emailStorageKey(email);
    const now  = Date.now();
    const raw  = ls.getItem(key);
    const timestamps = /** @type {number[]} */ (raw ? JSON.parse(raw) : []).filter((t) => now - t < WINDOW_MS);

    if (timestamps.length >= MAX_SENDS) {
      const oldest = Math.min(...timestamps);
      const mins   = Math.ceil((WINDOW_MS - (now - oldest)) / 60000);
      return { limited: true, mins };
    }
    return { limited: false };
  } catch {
    // Storage niedostępny (Safari ITP, tryb prywatny, blokada cookies)
    return { limited: false };
  }
}

/**
 * Sprawdza globalny limit sesji w sessionStorage.
 * Blokuje rotację adresów email.
 * Zwraca false gdy storage jest niedostępny.
 * @param {Storage} [ss]
 */
export function isSessionRateLimited(ss = sessionStorage) {
  try {
    return Number(ss.getItem(SESSION_KEY) ?? 0) >= SESSION_MAX;
  } catch {
    return false;
  }
}

/**
 * Zapisuje timestamp TYLKO po udanej wysyłce.
 * Błąd storage jest cicho ignorowany — rate limiting jest tylko warstwą UX.
 * @param {string} email
 * @param {Storage} [ls]
 * @param {Storage} [ss]
 */
export function recordSuccessfulSend(email, ls = localStorage, ss = sessionStorage) {
  try {
    const key  = emailStorageKey(email);
    const now  = Date.now();
    const raw  = ls.getItem(key);
    const timestamps = /** @type {number[]} */ (raw ? JSON.parse(raw) : []).filter((t) => now - t < WINDOW_MS);
    timestamps.push(now);
    ls.setItem(key, JSON.stringify(timestamps));

    const count = Number(ss.getItem(SESSION_KEY) ?? 0) + 1;
    ss.setItem(SESSION_KEY, String(count));
  } catch {
    // Storage niedostępny — ignorujemy, wysyłka już się powiodła
  }
}
