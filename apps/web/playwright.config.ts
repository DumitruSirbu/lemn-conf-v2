import { assertSafeTestDatabaseUrl, loadEnvLocal } from "@lemnaria/persistence";
import { defineConfig, devices } from "@playwright/test";

// The application's own `DATABASE_URL` has to be readable here for `assertSafeTestDatabaseUrl` to
// have anything to compare against; without it the guard can only pass vacuously (finding DB-001).
loadEnvLocal();

const PORT = Number(process.env.E2E_PORT ?? 4320);
// `localhost`, not `127.0.0.1`: Next's dev server (Turbopack) 403s static chunk requests whose
// Host doesn't match the origin it printed as "Local" at boot.
const BASE_URL = `http://localhost:${String(PORT)}`;

/** M2's mobile picking gate (`docs/milestones/M2-void-engine.md`, "Surfaces") is specified at
 *  exactly 390 x 844 with real touch, so the project pins that viewport rather than reusing a
 *  Playwright device preset tuned for a different phone. */
export default defineConfig({
  testDir: "./tests/e2e",
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
      // Desktop specs are named apart rather than filtered by a tag, so a file's viewport is
      // readable from its name and a spec cannot silently run at the wrong one.
      testIgnore: "**/*.desktop.e2e.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        defaultBrowserType: "chromium",
      },
    },
    /** M4's desktop line (`docs/milestones/M4-editor-surface.md`, "Surfaces"): frames D2A and D2B,
     *  where the panel is a 420 px right rail the scene re-lays out beside. Above
     *  `editor-panel.module.css`'s 900 px branch by a wide margin, and with no touch — the rail is
     *  a pointer surface and asserting it under synthesised touch would prove the wrong thing. */
    {
      name: "desktop",
      testMatch: "**/*.desktop.e2e.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        defaultBrowserType: "chromium",
      },
    },
  ],
  webServer: {
    command: `pnpm exec next dev --port ${String(PORT)}`,
    url: BASE_URL,
    // Never reused, even locally. The suite now *writes* — `design-write-path.e2e.spec.ts` mints a
    // design — and a server already listening on this port would be one started against
    // `.env.local`, i.e. the application's own database. ADR 0006 exists because a suite pointed
    // at real customer data needs only one careless statement to destroy it.
    reuseExistingServer: false,
    env: { DATABASE_URL: exportTestDatabaseUrl() },
    timeout: 60_000,
  },
});

/**
 * The database the e2e dev server is allowed to write to (ADR 0006): `TEST_DATABASE_URL`, kept in
 * `.env.test.local`, which is where that record says to keep it.
 *
 * Passed to the dev server as `DATABASE_URL` because that is the only variable the application
 * reads — the application must not learn about a test variable. `loadEnvLocal()` above puts it on
 * this process's environment too, so the test workers — separate processes, spawned from here —
 * inherit it and can delete the rows a spec minted (ADR 0006's third mechanism).
 */
function exportTestDatabaseUrl(): string {
  const url = readTestDatabaseUrl();
  // Checking that the variable is *set* was the whole of the old check, and a value set to a
  // privileged application connection passed it. The guard compares host, port and database name
  // against `DATABASE_URL` and refuses a match, before any server is started (finding DB-001).
  assertSafeTestDatabaseUrl(url);
  return url;
}

/** `loadEnvLocal()` above has already read `.env.test.local`, so the environment is the only place
 *  this has to look. Throws rather than falling back to `.env.local`: a silent fallback is exactly
 *  the misconfiguration ADR 0006 requires to fail loudly. */
function readTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set and was not found in .env.test.local. The e2e suite writes " +
        "designs, so it must target the test database and never the application's own.",
    );
  }
  return url;
}
