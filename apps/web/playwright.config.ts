import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { defineConfig, devices } from "@playwright/test";

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
 * The database the e2e dev server is allowed to write to (ADR 0006): `TEST_DATABASE_URL`, read from
 * the environment or from `.env.test.local`, which is where that record says to keep it.
 *
 * Passed to the dev server as `DATABASE_URL` because that is the only variable the application
 * reads — the application must not learn about a test variable. Throws rather than falling back to
 * `.env.local`: a silent fallback is exactly the misconfiguration ADR 0006 requires to fail loudly.
 */
function exportTestDatabaseUrl(): string {
  const url = readTestDatabaseUrl();
  // Also placed on this process's environment so the test workers — separate processes, spawned
  // from here — inherit it. A spec that mints a design deletes it again afterwards (ADR 0006's
  // third mechanism), and that is the only way it can reach the database it wrote to.
  process.env.TEST_DATABASE_URL = url;
  return url;
}

function readTestDatabaseUrl(): string {
  const fromEnvironment = process.env.TEST_DATABASE_URL?.trim();
  if (fromEnvironment) return fromEnvironment;

  const envFile = resolve(import.meta.dirname, "../../.env.test.local");
  const match = /^TEST_DATABASE_URL\s*=\s*(.+)$/m.exec(
    readFileSync(envFile, "utf8"),
  );
  const url = match?.[1]?.trim().replace(/^["']|["']$/g, "");
  if (!url) {
    throw new Error(
      `TEST_DATABASE_URL is not set and was not found in ${envFile}. The e2e suite writes ` +
        `designs, so it must target the test database and never the application's own.`,
    );
  }
  return url;
}
