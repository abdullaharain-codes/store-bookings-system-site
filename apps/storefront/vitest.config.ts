import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Standalone test config (mirrors packages/ui/vitest.config.ts). Kept separate
 * from vite.config.ts on purpose: the app build needs the @react-router/dev
 * plugin for route manifest + typegen, none of which applies to a jsdom unit
 * test run, and loading it here would make `vitest run` depend on typegen
 * output. Tests import the real react-router runtime and assert on route
 * objects, so no plugin is required.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./app/test/setup.ts"],
    include: ["app/**/*.test.{ts,tsx}"],
    testTimeout: 10000,
    // maxWorkers was 2 (TASK T1, 2026-09-30) and is now removed (TASK T2,
    // 2026-10-01). Measured with no maxWorkers key on this machine:
    //   20 consecutive `npx vitest run` — 20/20 exit 0 with 143/143 passed,
    //   Duration mean 11.03s, max 12.03s, min 10.74s.
    //   3 concurrent storefront suites x 5 rounds — 15/15 exit 0 with
    //   143/143 passed.
    // No timeouts were raised to obtain these numbers.
    env: {
      // Matches server/.env APP_URL + the api-client default, so MSW handlers
      // and the axios instances in auth-store/api-client agree on the origin.
      VITE_API_URL: "http://localhost:8000/api/v1",
    },
  },
});
