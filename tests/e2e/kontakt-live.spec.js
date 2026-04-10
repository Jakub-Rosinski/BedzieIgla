/**
 * Live send tests — require real VITE_EMAILJS_* credentials in .env.
 * These tests do NOT mock the EmailJS API endpoint.
 * They are automatically skipped in CI (no credentials available there).
 * Run locally with: pnpm exec playwright test tests/e2e/kontakt-live.spec.js
 */
import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IS_CI = !!process.env.CI;

/** @param {import('@playwright/test').Page} page */
async function fillForm(page) {
  await page.locator("#f-name").fill("Test Playwright");
  await page.locator("#f-email").fill("test@bedzieigla.pl");
  await page.locator("#f-phone").fill("531 269 735");
  await page.locator("#f-miejsce").fill("przedramię");
  await page.locator("#f-wielkosc").fill("małe, ok. 5 cm");
  await page.locator("#f-message").fill("Wiadomość testowa wysłana automatycznie przez Playwright — prosimy zignorować.");
}

/**
 * Generates a large JPEG buffer (1200×1600 px noise) entirely in-page via canvas.
 * No external file needed — works in any environment.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Buffer>}
 */
async function generateLargeJpeg(page) {
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200; canvas.height = 1600;
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
    const img = ctx.createImageData(1200, 1600);
    for (let i = 0; i < img.data.length; i++) img.data[i] = (i * 37 + 128) & 0xff;
    ctx.putImageData(img, 0, 0);
    const b64 = canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
    const bin = atob(b64);
    return Array.from({ length: bin.length }, (_, i) => bin.charCodeAt(i));
  });
  return Buffer.from(bytes);
}

test.describe("Live send — bez załącznika", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(IS_CI, "Pomijany w CI — wymaga prawdziwych danych EmailJS");
    await page.goto("/#kontakt");
    await page.waitForSelector("#kontakt form");
  });

  test("wysyła formularz bez załącznika i pokazuje sukces", async ({ page }) => {
    let emailjsStatus = 0, emailjsBody = "";
    page.on("response", async res => {
      if (res.url().includes("emailjs.com")) {
        emailjsStatus = res.status();
        emailjsBody = await res.text().catch(() => "(unreadable)");
      }
    });
    page.on("request", req => {
      if (req.url().includes("emailjs.com")) {
        const body = JSON.parse(req.postData() ?? "{}");
        console.log("EmailJS request — service_id:", body.service_id, "| template_id:", body.template_id);
      }
    });

    await fillForm(page);
    await page.waitForTimeout(3100);
    await page.locator("button[type=submit]").click();
    await page.waitForSelector('[role="status"],[role="alert"]', { timeout: 15_000 });

    const success = page.locator('[role="status"]');
    if (await success.isVisible()) {
      await expect(success).toContainText(/wysłana/i);
      console.log("✓ Formularz bez załącznika — wysłany pomyślnie");
    } else {
      console.error("EmailJS response —", emailjsStatus, emailjsBody);
      const msg = await page.locator('[role="alert"]').textContent();
      throw new Error(`EmailJS zwrócił błąd (HTTP ${emailjsStatus}): ${emailjsBody}\nUI: ${msg}`);
    }
  });
});

test.describe("Live send — z załącznikiem", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(IS_CI, "Pomijany w CI — wymaga prawdziwych danych EmailJS");
    await page.goto("/#kontakt");
    await page.waitForSelector("#kontakt form");
  });

  test("wysyła formularz z załącznikiem PNG (logo) i pokazuje sukces", async ({ page }) => {
    let emailjsStatus = 0, emailjsBody = "";
    page.on("response", async res => {
      if (res.url().includes("emailjs.com")) {
        emailjsStatus = res.status();
        emailjsBody = await res.text().catch(() => "(unreadable)");
      }
    });

    await fillForm(page);
    await page.locator("#f-inspiracje").setInputFiles(path.resolve(__dirname, "../../static/logo.png"));
    await expect(page.locator(".file-names")).toContainText("logo.png");

    await page.waitForTimeout(3100);
    await page.locator("button[type=submit]").click();
    await page.waitForSelector('[role="status"],[role="alert"]', { timeout: 20_000 });

    const success = page.locator('[role="status"]');
    if (await success.isVisible()) {
      await expect(success).toContainText(/wysłana/i);
      console.log("✓ Załącznik PNG (logo) — wysłany pomyślnie");
    } else {
      const msg = await page.locator('[role="alert"]').textContent();
      throw new Error(`HTTP ${emailjsStatus}: ${emailjsBody}\nUI: ${msg}`);
    }
  });

  test("wysyła formularz z dużym zdjęciem JPEG (1200×1600) i pokazuje sukces", async ({ page }) => {
    let emailjsStatus = 0, emailjsBody = "";
    page.on("response", async res => {
      if (res.url().includes("emailjs.com")) {
        emailjsStatus = res.status();
        emailjsBody = await res.text().catch(() => "(unreadable)");
      }
    });

    await fillForm(page);
    // Generate large JPEG in-page — no external file dependency
    const buffer = await generateLargeJpeg(page);
    await page.locator("#f-inspiracje").setInputFiles({
      name: "tattoo_inspiration.jpg",
      mimeType: "image/jpeg",
      buffer,
    });
    await expect(page.locator(".file-names")).toContainText("tattoo_inspiration.jpg");

    await page.waitForTimeout(3100);
    await page.locator("button[type=submit]").click();
    await page.waitForSelector('[role="status"],[role="alert"]', { timeout: 20_000 });

    const success = page.locator('[role="status"]');
    if (await success.isVisible()) {
      await expect(success).toContainText(/wysłana/i);
      console.log("✓ Duże zdjęcie JPEG 1200×1600 — skompresowane i wysłane pomyślnie");
    } else {
      const msg = await page.locator('[role="alert"]').textContent();
      throw new Error(`HTTP ${emailjsStatus}: ${emailjsBody}\nUI: ${msg}`);
    }
  });

  test("wysyła formularz z dwoma zdjęciami naraz i pokazuje sukces", async ({ page }) => {
    let emailjsStatus = 0, emailjsBody = "";
    page.on("response", async res => {
      if (res.url().includes("emailjs.com")) {
        emailjsStatus = res.status();
        emailjsBody = await res.text().catch(() => "(unreadable)");
      }
    });

    await fillForm(page);
    const buffer = await generateLargeJpeg(page);
    const logoBuffer = readFileSync(path.resolve(__dirname, "../../static/logo.png"));
    await page.locator("#f-inspiracje").setInputFiles([
      { name: "logo.png", mimeType: "image/png", buffer: logoBuffer },
      { name: "tattoo_inspiration.jpg", mimeType: "image/jpeg", buffer },
    ]);
    await expect(page.locator(".file-names")).toContainText("logo.png");
    await expect(page.locator(".file-names")).toContainText("tattoo_inspiration.jpg");

    await page.waitForTimeout(3100);
    await page.locator("button[type=submit]").click();
    await page.waitForSelector('[role="status"],[role="alert"]', { timeout: 25_000 });

    const success = page.locator('[role="status"]');
    if (await success.isVisible()) {
      await expect(success).toContainText(/wysłana/i);
      console.log("✓ Dwa zdjęcia naraz — skompresowane i wysłane pomyślnie");
    } else {
      const msg = await page.locator('[role="alert"]').textContent();
      throw new Error(`HTTP ${emailjsStatus}: ${emailjsBody}\nUI: ${msg}`);
    }
  });

  test("odrzuca plik nie będący obrazem", async ({ page }) => {
    await fillForm(page);
    await page.locator("#f-inspiracje").setInputFiles({
      name: "test.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("to nie jest obraz"),
    });

    await page.waitForTimeout(3100);
    await page.locator("button[type=submit]").click();

    const error = page.locator('[role="alert"]');
    await expect(error).toBeVisible({ timeout: 8_000 });
    await expect(error).toContainText(/nie jest obrazem/i);
    console.log("✓ Plik nie-obraz — poprawnie odrzucony");
  });
});
