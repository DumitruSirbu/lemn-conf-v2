import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 4320);
// `localhost`, not `127.0.0.1`: Next's dev server (Turbopack) 403s static chunk requests whose
// Host doesn't match the origin it printed as "Local" at boot.
const BASE_URL = `http://localhost:${String(PORT)}`;

/** M2's mobile picking gate (`docs/milestones/M2-void-engine.md`, "Surfaces") is specified at
 *  exactly 390 x 844 with real touch, so the project pins that viewport rather than reusing a
 *  Playwright device preset tuned for a different phone. */
export default defineConfig({
  testDir: "./src",
  testMatch: "**/*.e2e.spec.ts",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        defaultBrowserType: "chromium",
      },
    },
  ],
  webServer: {
    command: `pnpm exec next dev --port ${String(PORT)}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
