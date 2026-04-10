import { test, expect } from "@playwright/test";

test.describe("Strona główna — struktura", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("ładuje stronę z poprawnym tytułem", async ({ page }) => {
    await expect(page).toHaveTitle(/Będzie Igła/);
  });

  test("renderuje sekcję hero z menu kołowym", async ({ page }) => {
    const hero = page.locator("#hero, section").first();
    await expect(hero).toBeVisible();

    // CircularMenu jest elementem SVG wewnątrz hero
    await expect(page.locator("svg").first()).toBeVisible();
  });

  test("renderuje sekcję O mnie", async ({ page }) => {
    const section = page.locator("#o-mnie");
    await expect(section).toBeAttached();
    await expect(section.getByText(/O mnie|o-mnie/i).first()).toBeAttached();
  });

  test("renderuje sekcję Galeria", async ({ page }) => {
    const section = page.locator("#galeria");
    await expect(section).toBeAttached();
  });

  test("renderuje sekcję Kontakt", async ({ page }) => {
    const section = page.locator("#kontakt");
    await expect(section).toBeAttached();
  });

  test("renderuje mapę Leaflet", async ({ page }) => {
    // Mapa renderuje się wewnątrz #kontakt
    const mapContainer = page.locator(".leaflet-container");
    await expect(mapContainer).toBeAttached({ timeout: 10_000 });
  });

  test("strona nie ma błędów konsoli JS", async ({ page }) => {
    const errors = /** @type {string[]} */ ([]);
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Ignorujemy błędy sieciowe (picsum.photos może nie działać w CI)
    const criticalErrors = errors.filter(
      (e) => !e.includes("net::") && !e.includes("fetch"),
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test("meta description jest obecny", async ({ page }) => {
    const meta = page.locator('meta[name="description"]');
    await expect(meta).toHaveAttribute("content", /.+/);
  });

  test("favicon jest dostępny", async ({ page }) => {
    const res = await page.goto("/favicon.png");
    expect(res?.status()).toBe(200);
    await page.goto("/");
  });
});
