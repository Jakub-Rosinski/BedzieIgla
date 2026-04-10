import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",

  use: {
    baseURL: "http://localhost:5173",
    // Wyłącz animacje dla stabilnych testów
    reducedMotion: "reduce",
    // Nie rejestruj wideo domyślnie — za duże pliki
    video: "off",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "pnpm dev",
    port: 5173,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    // No env override — Vite loads .env itself on startup.
    // Passing VITE_* here would override .env values since process.env wins over .env.
  },
});
