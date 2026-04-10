import { test, expect } from "@playwright/test";

test.describe("Galeria — renderowanie", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#galeria");
  });

  test("sekcja galerii jest widoczna", async ({ page }) => {
    const section = page.locator("#galeria");
    await expect(section).toBeVisible();
  });

  test("nagłówek galerii jest obecny", async ({ page }) => {
    await expect(page.locator("#galeria h2")).toContainText("Wybrane");
  });

  test("zdjęcia testowe ładują się (tryb picsum)", async ({ page }) => {
    // Czekamy na zakończenie loading state
    const carousel = page.locator(".carousels");
    await expect(carousel).toBeVisible({ timeout: 10_000 });

    // Sprawdź czy są karty z obrazkami
    const cards = page.locator(".card");
    await expect(cards.first()).toBeVisible();

    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });

  test("karuzela ma dwa rzędy", async ({ page }) => {
    await expect(page.locator(".carousels")).toBeVisible({ timeout: 10_000 });

    const rows = page.locator(".track-wrapper");
    await expect(rows).toHaveCount(2);
  });

  test("zdjęcia mają atrybuty alt", async ({ page }) => {
    await expect(page.locator(".carousels")).toBeVisible({ timeout: 10_000 });

    const images = page.locator(".card img");
    const count = await images.count();
    expect(count).toBeGreaterThan(0);

    // Sprawdź kilka pierwszych obrazków
    for (let i = 0; i < Math.min(3, count); i++) {
      const alt = await images.nth(i).getAttribute("alt");
      expect(alt).toBeTruthy();
    }
  });

  test("zdjęcia mają loading=lazy", async ({ page }) => {
    await expect(page.locator(".carousels")).toBeVisible({ timeout: 10_000 });

    const images = page.locator(".card img");
    const count = await images.count();

    for (let i = 0; i < Math.min(3, count); i++) {
      await expect(images.nth(i)).toHaveAttribute("loading", "lazy");
    }
  });
});

test.describe("Galeria — interakcja", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#galeria");
    await expect(page.locator(".carousels")).toBeVisible({ timeout: 10_000 });
  });

  test("hover na karuzeli pauzuje animację", async ({ page }) => {
    const carousel = page.locator(".carousels");
    await carousel.hover();

    // Po hover, track powinien mieć klasę 'paused'
    const track = page.locator(".track").first();
    await expect(track).toHaveClass(/paused/);
  });

  test("opuszczenie hover wznawia animację", async ({ page }) => {
    const carousel = page.locator(".carousels");
    await carousel.hover();

    // Przesuń myszkę poza karuzele
    await page.mouse.move(0, 0);

    const track = page.locator(".track").first();
    await expect(track).not.toHaveClass(/paused/);
  });
});

test.describe("Galeria — błąd sieci", () => {
  test("pokazuje zdjęcia testowe gdy S3 nie odpowiada", async ({ page }) => {
    // Blokujemy wszystkie zapytania S3 (w trybie testowym S3 nie jest wywoływany)
    // Ten test weryfikuje że brak odpowiedzi S3 nie psuje galerii
    await page.route("**/s3.*.ovh.net/**", (route) => route.abort());

    await page.goto("/#galeria");

    // Galeria powinna wyświetlić zdjęcia testowe (fallback)
    const carousel = page.locator(".carousels");
    await expect(carousel).toBeVisible({ timeout: 10_000 });
  });
});
