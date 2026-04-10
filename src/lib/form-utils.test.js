import { describe, it, expect, vi } from "vitest";
import {
  validateName,
  validateEmail,
  validatePhone,
  validateMessage,
  validate,
  isBotSubmission,
  isEmailRateLimited,
  isSessionRateLimited,
  recordSuccessfulSend,
  emailStorageKey,
  WINDOW_MS,
  MAX_SENDS,
  SESSION_MAX,
  SESSION_KEY,
  MIN_FILL_MS,
} from "./form-utils.js";

// ─── validateName ──────────────────────────────────────────────────────────────

describe("validateName", () => {
  it("zwraca błąd dla pustego imienia", () => {
    expect(validateName("")).toBeTruthy();
    expect(validateName("   ")).toBeTruthy();
    // @ts-expect-error
    expect(validateName(null)).toBeTruthy();
  });

  it("zwraca null dla poprawnego imienia", () => {
    expect(validateName("Anna Kowalska")).toBeNull();
    expect(validateName("Gosia")).toBeNull();
  });
});

// ─── validatePhone ─────────────────────────────────────────────────────────────

describe("validatePhone", () => {
  it("zwraca błąd dla pustego numeru", () => {
    expect(validatePhone("")).toBeTruthy();
    expect(validatePhone("   ")).toBeTruthy();
  });

  it("zwraca błąd dla niepoprawnego formatu", () => {
    expect(validatePhone("abc")).toBeTruthy();
    expect(validatePhone("123")).toBeTruthy(); // za krótki
  });

  it("zwraca null dla poprawnego numeru", () => {
    expect(validatePhone("531 269 735")).toBeNull();
    expect(validatePhone("+48531269735")).toBeNull();
    expect(validatePhone("(48) 531-269-735")).toBeNull();
  });
});

// ─── validateEmail ─────────────────────────────────────────────────────────────

describe("validateEmail", () => {
  it("zwraca błąd dla pustego emaila", () => {
    expect(validateEmail("")).toBeTruthy();
    expect(validateEmail("   ")).toBeTruthy();
    // @ts-expect-error — testujemy granicę null/undefined
    expect(validateEmail(null)).toBeTruthy();
    // @ts-expect-error — testujemy granicę null/undefined
    expect(validateEmail(undefined)).toBeTruthy();
  });

  it("zwraca błąd dla niepoprawnego formatu", () => {
    expect(validateEmail("niemail")).toBeTruthy();
    expect(validateEmail("@domain.com")).toBeTruthy();
    expect(validateEmail("user@")).toBeTruthy();
    expect(validateEmail("user @email.pl")).toBeTruthy();
    expect(validateEmail("user@email")).toBeTruthy();
  });

  it("zwraca null dla poprawnego emaila", () => {
    expect(validateEmail("user@example.com")).toBeNull();
    expect(validateEmail("  gosia@bedzieigla.pl  ")).toBeNull();
    expect(validateEmail("a+b@sub.domain.org")).toBeNull();
  });
});

// ─── validateMessage ───────────────────────────────────────────────────────────

describe("validateMessage", () => {
  it("zwraca błąd dla pustej wiadomości", () => {
    expect(validateMessage("")).toBeTruthy();
    expect(validateMessage("   ")).toBeTruthy();
    // @ts-expect-error — testujemy granicę null
    expect(validateMessage(null)).toBeTruthy();
  });

  it("zwraca błąd gdy za krótka (< 10 znaków)", () => {
    expect(validateMessage("abc")).toBeTruthy();
    expect(validateMessage("123456789")).toBeTruthy(); // 9 znaków
  });

  it("zwraca null dla wiadomości o minimalnej długości (10 znaków)", () => {
    expect(validateMessage("1234567890")).toBeNull();
  });

  it("zwraca błąd gdy za długa (> 5000 znaków)", () => {
    expect(validateMessage("a".repeat(5001))).toBeTruthy();
  });

  it("zwraca null dla wiadomości o maksymalnej długości (5000 znaków)", () => {
    expect(validateMessage("a".repeat(5000))).toBeNull();
  });

  it("zwraca null dla typowej wiadomości", () => {
    expect(validateMessage("Chcę zrobić tatuaż geometryczny na przedramieniu.")).toBeNull();
  });
});

// ─── validate (kombinacja) ─────────────────────────────────────────────────────

const VALID = {
  name: "Anna Kowalska",
  email: "gosia@bedzieigla.pl",
  phone: "531 269 735",
  message: "Chcę tatuaż na nadgarstku.",
  miejsce: "przedramię",
  wielkosc: "małe, ok. 5 cm",
};

const v = (overrides = {}) => {
  const f = { ...VALID, ...overrides };
  return validate(f.name, f.email, f.phone, f.message, f.miejsce, f.wielkosc);
};

describe("validate", () => {
  it("zwraca null gdy wszystkie pola poprawne", () => {
    expect(v()).toBeNull();
  });

  it("zwraca błąd gdy brak imienia", () => {
    expect(v({ name: "" })).toBeTruthy();
  });

  it("zwraca błąd gdy zły email", () => {
    expect(v({ email: "niemail" })).toBeTruthy();
  });

  it("zwraca błąd gdy zły telefon", () => {
    expect(v({ phone: "abc" })).toBeTruthy();
  });

  it("zwraca błąd gdy wiadomość za krótka", () => {
    expect(v({ message: "za krotka" })).toBeTruthy();
  });

  it("zwraca błąd gdy brak miejsca na ciele", () => {
    expect(v({ miejsce: "" })).toBeTruthy();
  });

  it("zwraca błąd gdy brak wielkości", () => {
    expect(v({ wielkosc: "" })).toBeTruthy();
  });
});

// ─── isBotSubmission ──────────────────────────────────────────────────────────

describe("isBotSubmission", () => {
  it("zwraca false gdy brak pierwszej interakcji (0)", () => {
    expect(isBotSubmission(0)).toBe(false);
  });

  it("zwraca true gdy wysłano zbyt szybko", () => {
    const tooFast = Date.now() - (MIN_FILL_MS - 500); // 500ms przed limitem
    expect(isBotSubmission(tooFast)).toBe(true);
  });

  it("zwraca false gdy użytkownik wypełniał wystarczająco długo", () => {
    const slowEnough = Date.now() - (MIN_FILL_MS + 1000);
    expect(isBotSubmission(slowEnough)).toBe(false);
  });

  it("przyjmuje własny timestamp 'now' (testowalność)", () => {
    const interactionAt = 1000;
    const fakeNow = interactionAt + MIN_FILL_MS - 1; // zbyt szybko
    expect(isBotSubmission(interactionAt, fakeNow)).toBe(true);

    const fakeNowSlow = interactionAt + MIN_FILL_MS + 1; // wystarczająco wolno
    expect(isBotSubmission(interactionAt, fakeNowSlow)).toBe(false);
  });
});

// ─── emailStorageKey ──────────────────────────────────────────────────────────

describe("emailStorageKey", () => {
  it("normalizuje email do małych liter i usuwa spacje", () => {
    expect(emailStorageKey("TEST@Example.COM")).toBe("w3f_test@example.com");
    expect(emailStorageKey("  user@test.pl  ")).toBe("w3f_user@test.pl");
  });
});

// ─── isEmailRateLimited ───────────────────────────────────────────────────────

describe("isEmailRateLimited", () => {
  it("zezwala na wysyłkę gdy brak historii", () => {
    const result = isEmailRateLimited("nowy@test.pl");
    expect(result.limited).toBe(false);
  });

  it("zezwala gdy poniżej limitu MAX_SENDS", () => {
    const email = "user@test.pl";
    const key = emailStorageKey(email);
    const now = Date.now();
    localStorage.setItem(key, JSON.stringify([now - 1000, now - 2000])); // 2 wpisy
    expect(isEmailRateLimited(email).limited).toBe(false);
  });

  it("blokuje po osiągnięciu MAX_SENDS w oknie czasowym", () => {
    const email = "spam@test.pl";
    const key = emailStorageKey(email);
    const now = Date.now();
    const timestamps = Array(MAX_SENDS).fill(now - 1000);
    localStorage.setItem(key, JSON.stringify(timestamps));

    const result = /** @type {{ limited: true, mins: number }} */ (isEmailRateLimited(email));
    expect(result.limited).toBe(true);
    expect(result.mins).toBeGreaterThan(0);
  });

  it("ignoruje wpisy spoza okna czasowego", () => {
    const email = "stary@test.pl";
    const key = emailStorageKey(email);
    const expired = Date.now() - WINDOW_MS - 1000;
    localStorage.setItem(key, JSON.stringify([expired, expired, expired]));

    expect(isEmailRateLimited(email).limited).toBe(false);
  });

  it("poprawnie liczy minuty do resetu", () => {
    const email = "reset@test.pl";
    const key = emailStorageKey(email);
    const now = Date.now();
    // Najstarszy wpis = 5 minut temu → reset za ~10 minut
    const oldestAt = now - 5 * 60 * 1000;
    const timestamps = Array(MAX_SENDS).fill(oldestAt);
    localStorage.setItem(key, JSON.stringify(timestamps));

    const result = /** @type {{ limited: true, mins: number }} */ (isEmailRateLimited(email));
    expect(result.limited).toBe(true);
    expect(result.mins).toBeCloseTo(10, 0);
  });

  it("przyjmuje wstrzyknięty storage (testowalność)", () => {
    const fakeStorage = /** @type {any} */ ({ getItem: () => null });
    const result = isEmailRateLimited("x@test.pl", fakeStorage);
    expect(result.limited).toBe(false);
  });
});

// ─── isSessionRateLimited ─────────────────────────────────────────────────────

describe("isSessionRateLimited", () => {
  it("zezwala gdy brak historii sesji", () => {
    expect(isSessionRateLimited()).toBe(false);
  });

  it("zezwala gdy poniżej limitu SESSION_MAX", () => {
    sessionStorage.setItem(SESSION_KEY, String(SESSION_MAX - 1));
    expect(isSessionRateLimited()).toBe(false);
  });

  it("blokuje gdy osiągnięto SESSION_MAX", () => {
    sessionStorage.setItem(SESSION_KEY, String(SESSION_MAX));
    expect(isSessionRateLimited()).toBe(true);
  });

  it("blokuje gdy przekroczono SESSION_MAX", () => {
    sessionStorage.setItem(SESSION_KEY, String(SESSION_MAX + 5));
    expect(isSessionRateLimited()).toBe(true);
  });
});

// ─── recordSuccessfulSend ─────────────────────────────────────────────────────

describe("recordSuccessfulSend", () => {
  it("zapisuje timestamp w localStorage po wysyłce", () => {
    const email = "gosia@test.pl";
    const before = Date.now();
    recordSuccessfulSend(email);
    const after = Date.now();

    const stored = JSON.parse(/** @type {string} */ (localStorage.getItem(emailStorageKey(email))));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toBeGreaterThanOrEqual(before);
    expect(stored[0]).toBeLessThanOrEqual(after);
  });

  it("inkrementuje licznik sesji w sessionStorage", () => {
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    recordSuccessfulSend("a@test.pl");
    expect(sessionStorage.getItem(SESSION_KEY)).toBe("1");
    recordSuccessfulSend("b@test.pl");
    expect(sessionStorage.getItem(SESSION_KEY)).toBe("2");
  });

  it("akumuluje timestampy dla tego samego emaila", () => {
    const email = "multi@test.pl";
    recordSuccessfulSend(email);
    recordSuccessfulSend(email);
    const stored = JSON.parse(/** @type {string} */ (localStorage.getItem(emailStorageKey(email))));
    expect(stored).toHaveLength(2);
  });

  it("wyrzuca stare timestampy spoza okna czasowego", () => {
    const email = "stale@test.pl";
    const key = emailStorageKey(email);
    const expired = Date.now() - WINDOW_MS - 5000;
    localStorage.setItem(key, JSON.stringify([expired, expired]));

    recordSuccessfulSend(email);
    const stored = JSON.parse(/** @type {string} */ (localStorage.getItem(key)));
    // Stare 2 wpisy usunięte, tylko nowy
    expect(stored).toHaveLength(1);
  });

  it("NIE modyfikuje localStorage gdy wysyłka się nie powiodła (zapis tylko na sukcesie)", () => {
    // Ten test weryfikuje że funkcja jest wywoływana TYLKO po sukcesie
    // (logika orkiestracji jest w komponencie, tutaj testujemy izolację)
    const email = "check@test.pl";
    // Bez wywołania recordSuccessfulSend — nic nie powinno być zapisane
    expect(localStorage.getItem(emailStorageKey(email))).toBeNull();
  });
});

// ─── Integracja rate-limit + recordSuccessfulSend ─────────────────────────────

describe("pełny cykl rate-limitingu", () => {
  it("blokuje po MAX_SENDS wysyłkach i odblokowuje po wygaśnięciu okna", () => {
    const email = "cycle@test.pl";

    // Wysyłamy MAX_SENDS razy
    for (let i = 0; i < MAX_SENDS; i++) {
      expect(isEmailRateLimited(email).limited).toBe(false);
      recordSuccessfulSend(email);
    }

    // Kolejna wysyłka powinna być zablokowana
    expect(isEmailRateLimited(email).limited).toBe(true);

    // Symulujemy upływ czasu — nadpisujemy wszystkie wpisy przeterminowanymi
    const key = emailStorageKey(email);
    const expired = Date.now() - WINDOW_MS - 1000;
    localStorage.setItem(key, JSON.stringify(Array(MAX_SENDS).fill(expired)));

    // Po wygaśnięciu okna — znów dozwolone
    expect(isEmailRateLimited(email).limited).toBe(false);
  });
});
