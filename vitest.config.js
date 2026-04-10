import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "path";

export default defineConfig({
  plugins: [svelte({ hot: false })],
  resolve: {
    // "browser" wymusza pakiety klienckie Svelte 5 (nie SSR) w środowisku testowym
    conditions: ["browser"],
    alias: {
      $lib: path.resolve("./src/lib"),
    },
  },
  test: {
    // Testy jednostkowe i komponentowe
    include: ["src/**/*.test.{js,ts}"],
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.js"],
    restoreMocks: true,
    clearMocks: true,
  },
});
