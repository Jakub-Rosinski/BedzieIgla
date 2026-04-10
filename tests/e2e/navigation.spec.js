import { test, expect } from "@playwright/test";

test.describe("Nawigacja — CircularMenu", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Poczekaj na wczytanie komponentu menu
    await expect(page.locator("svg").first()).toBeVisible();
  });

  test("menu kołowe jest widoczne na stronie", async ({ page }) => {
    // CircularMenu renderuje SVG z tekstem pozycji nawigacji
    const svg = page.locator("svg").first();
    await expect(svg).toBeVisible();
  });

  test("pozycje menu zawierają oczekiwane etykiety", async ({ page }) => {
    // Etykiety są renderowane jako text w SVG (textPath)
    await expect(page.locator("text=O MNIE").first()).toBeAttached();
    await expect(page.locator("text=GALERIA").first()).toBeAttached();
    await expect(page.locator("text=KONTAKT").first()).toBeAttached();
  });

  test("kliknięcie O MNIE przewija do sekcji #o-mnie", async ({ page }) => {
    const menuItem = page.locator("text=O MNIE").first();
    await menuItem.click();

    // Czekamy na animację (560ms + 650ms) i scroll
    await page.waitForTimeout(1400);

    const section = page.locator("#o-mnie");
    await expect(section).toBeInViewport({ ratio: 0.3 });
  });

  test("kliknięcie GALERIA przewija do sekcji #galeria", async ({ page }) => {
    const menuItem = page.locator("text=GALERIA").first();
    await menuItem.click();

    await page.waitForTimeout(1400);

    const section = page.locator("#galeria");
    await expect(section).toBeInViewport({ ratio: 0.3 });
  });

  test("kliknięcie KONTAKT przewija do sekcji #kontakt", async ({ page }) => {
    const menuItem = page.locator("text=KONTAKT").first();
    await menuItem.click();

    await page.waitForTimeout(1400);

    const section = page.locator("#kontakt");
    await expect(section).toBeInViewport({ ratio: 0.05 });
  });

  test("bezpośrednie linki hash (#o-mnie, #galeria, #kontakt) działają", async ({ page }) => {
    for (const hash of ["o-mnie", "galeria", "kontakt"]) {
      await page.goto(`/#${hash}`);
      await page.waitForTimeout(500);

      const section = page.locator(`#${hash}`);
      await expect(section).toBeAttached();
    }
  });
});
