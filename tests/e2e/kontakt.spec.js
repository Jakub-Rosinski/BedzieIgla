import { test, expect } from "@playwright/test";

// Helper: fill all required fields except the ones to omit
/** @param {import('@playwright/test').Page} page @param {Record<string,string|null>} [overrides] */
async function fillRequired(page, overrides = {}) {
  const defaults = {
    name:     "Anna Kowalska",
    email:    "anna@przykład.pl",
    phone:    "531 269 735",
    miejsce:  "przedramię",
    wielkosc: "małe",
    message:  "Chciałabym umówić się na konsultację tatuażu.",
  };
  const vals = { ...defaults, ...overrides };
  if (vals.name    !== null) await page.locator("#f-name").fill(vals.name);
  if (vals.email   !== null) await page.locator("#f-email").fill(vals.email);
  if (vals.phone   !== null) await page.locator("#f-phone").fill(vals.phone);
  if (vals.miejsce !== null) await page.locator("#f-miejsce").fill(vals.miejsce);
  if (vals.wielkosc!== null) await page.locator("#f-wielkosc").fill(vals.wielkosc);
  if (vals.message !== null) await page.locator("#f-message").fill(vals.message);
}

test.describe("Formularz kontaktowy — walidacja", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#kontakt");
    await page.waitForSelector("#kontakt form");
  });

  test("formularz ma pola: imię, email, telefon, miejsce, wielkość, wiadomość", async ({ page }) => {
    await expect(page.locator("#f-name")).toBeVisible();
    await expect(page.locator("#f-email")).toBeVisible();
    await expect(page.locator("#f-phone")).toBeVisible();
    await expect(page.locator("#f-miejsce")).toBeVisible();
    await expect(page.locator("#f-wielkosc")).toBeVisible();
    await expect(page.locator("#f-message")).toBeVisible();
  });

  test("przycisk wyślij jest widoczny", async ({ page }) => {
    const btn = page.locator("button[type=submit]");
    await expect(btn).toBeVisible();
    await expect(btn).toContainText("Wyślij wiadomość");
  });

  test("submit bez emaila pokazuje błąd walidacji", async ({ page }) => {
    // Fill name to pass name validation, leave email empty
    await fillRequired(page, { email: "" });
    await page.locator("button[type=submit]").click();

    const error = page.locator('[role="alert"]');
    await expect(error).toBeVisible();
    await expect(error).toContainText(/e-mail/i);
  });

  test("submit z niepoprawnym emailem pokazuje błąd", async ({ page }) => {
    await fillRequired(page, { email: "nieemail" });
    await page.locator("button[type=submit]").click();

    const error = page.locator('[role="alert"]');
    await expect(error).toBeVisible();
    await expect(error).toContainText(/Nieprawidłowy/i);
  });

  test("submit bez wiadomości pokazuje błąd", async ({ page }) => {
    // Fill name, email, phone to pass those validations; leave message empty
    await fillRequired(page, { message: "" });
    await page.locator("button[type=submit]").click();

    const error = page.locator('[role="alert"]');
    await expect(error).toBeVisible();
    await expect(error).toContainText(/wiadomoś/i);
  });

  test("wiadomość krótsza niż 10 znaków pokazuje błąd", async ({ page }) => {
    await fillRequired(page, { message: "za krotka" });
    await page.locator("button[type=submit]").click();

    const error = page.locator('[role="alert"]');
    await expect(error).toBeVisible();
    await expect(error).toContainText(/za krótka/i);
  });

  test("licznik znaków aktualizuje się podczas pisania", async ({ page }) => {
    const textarea = page.locator("#f-message");
    const counter = page.locator(".char-count");

    await textarea.fill("Testowa wiadomość.");
    await expect(counter).toContainText("18 / 5000");
  });

  test("licznik znaków zmienia kolor ostrzegawczy po przekroczeniu 4500", async ({ page }) => {
    const textarea = page.locator("#f-message");
    await textarea.fill("a".repeat(4501));

    const counter = page.locator(".char-count");
    await expect(counter).toHaveClass(/warn/);
  });
});

test.describe("Formularz kontaktowy — wysyłka", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/contact", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto("/#kontakt");
    await page.waitForSelector("#kontakt form");
  });

  test("poprawne wypełnienie i wysłanie pokazuje komunikat sukcesu", async ({ page }) => {
    await fillRequired(page);

    // Czekamy MIN_FILL_MS (3s) — zabezpieczenie przed botem
    await page.waitForTimeout(3100);

    await page.locator("button[type=submit]").click();

    const success = page.locator('[role="status"]');
    await expect(success).toBeVisible({ timeout: 8_000 });
    await expect(success).toContainText(/wysłana/i);
  });

  test("po sukcesie pojawia się przycisk 'Wyślij kolejną'", async ({ page }) => {
    await fillRequired(page);
    await page.waitForTimeout(3100);
    await page.locator("button[type=submit]").click();

    await expect(page.locator("button", { hasText: "Wyślij kolejną" })).toBeVisible({
      timeout: 8_000,
    });
  });

  test("kliknięcie 'Wyślij kolejną' resetuje formularz", async ({ page }) => {
    await fillRequired(page);
    await page.waitForTimeout(3100);
    await page.locator("button[type=submit]").click();

    await page.locator("button", { hasText: "Wyślij kolejną" }).click();

    // Formularz powinien być z powrotem widoczny i pusty
    await expect(page.locator("#kontakt form")).toBeVisible();
    await expect(page.locator("#f-email")).toHaveValue("");
    await expect(page.locator("#f-message")).toHaveValue("");
  });
});

test.describe("Formularz kontaktowy — błąd API", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/contact", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Nie udało się wysłać wiadomości." }),
      });
    });

    await page.goto("/#kontakt");
    await page.waitForSelector("#kontakt form");
  });

  test("błąd API pokazuje komunikat błędu", async ({ page }) => {
    await fillRequired(page);
    await page.waitForTimeout(3100);
    await page.locator("button[type=submit]").click();

    const error = page.locator('[role="alert"]');
    await expect(error).toBeVisible({ timeout: 8_000 });
  });
});

test.describe("Formularz kontaktowy — antyspam", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#kontakt");
    await page.waitForSelector("#kontakt form");
  });

  test("honeypot checkbox jest ukryty i niezaznaczony", async ({ page }) => {
    const honeypot = page.locator('input[name="botcheck"]');
    await expect(honeypot).toBeAttached();
    await expect(honeypot).toBeHidden();
    await expect(honeypot).not.toBeChecked();
  });

  test("linki social media prowadzą do zewnętrznych serwisów", async ({ page }) => {
    const links = page.locator("#kontakt a[target='_blank']");
    const count = await links.count();
    expect(count).toBeGreaterThanOrEqual(3); // Instagram, Facebook, TikTok

    for (let i = 0; i < count; i++) {
      const href = await links.nth(i).getAttribute("href");
      expect(href).toMatch(/^https:\/\//);
      const rel = await links.nth(i).getAttribute("rel");
      expect(rel).toContain("noopener");
    }
  });
});
