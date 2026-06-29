import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    // Mirror tsconfig's "@/*" → "src/*" alias so tests import like app code.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // E2E (Playwright) lives separately and is not run by Vitest.
    exclude: ["tests/e2e/**", "node_modules/**"],
  },
});
