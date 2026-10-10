import { assertSafeTestDatabaseUrl, loadEnvLocal } from "@lemnaria/persistence";
import { defineConfig, devices } from "@playwright/test";

import {
  E2E_RATE_LIMIT_POLICY_FLAG,
  E2E_RATE_LIMIT_POLICY_FLAG_ENABLED,
} from "./src/lib/server/rate-limit/limit-policy";
import {
  SELECTION_DEBUG_FLAG,
  SELECTION_DEBUG_FLAG_ENABLED,
} from "./src/app/configurator/configure/selection-debug-availability";
import {
  SCENE_SHOT_ROUTE_FLAG,
  SCENE_SHOT_ROUTE_FLAG_ENABLED,
} from "./src/app/internal/scene-shot/route-availability";

import { secretOfThisRun } from "./tests/e2e/support/e2e-rate-limit-run";
import {
  FAKE_MAIL_SERVER_ENVIRONMENT,
  requireNoMailVariable,
} from "./tests/e2e/support/fake-mail-server";

// The application's own `DATABASE_URL` must be readable here, or `assertSafeTestDatabaseUrl` has
// nothing to compare against and passes vacuously.
loadEnvLocal();

// The server inherits this process's environment, and refuses the fake sender beside any mail variable: a run that
// holds one fails here, naming it, rather than starting a server that could send for real.
requireNoMailVariable(process.env);

/**
 * The run's own secret for every digest the server makes: made once in the runner's main process, handed to the
 * server below and to the workers through the environment, and written nowhere (ADR 0149, the amendment).
 */
const runSecret = secretOfThisRun();

/** GitHub Actions sets `CI`. Read once, so the server command and timeouts agree on the machine. */
const isContinuousIntegration = process.env.CI !== undefined;

const PORT = Number(process.env.E2E_PORT ?? 4320);
// `localhost`, not `127.0.0.1`: Next's dev server (Turbopack) 403s static chunk requests whose
// Host doesn't match the origin it printed as "Local" at boot.
const BASE_URL = `http://localhost:${String(PORT)}`;

/** M2's mobile picking gate is specified at exactly 390 x 844 with real touch, so the project pins
 *  that viewport rather than reusing a Playwright device preset for a different phone. */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.e2e.spec.ts",
  fullyParallel: false,
  retries: 0,
  // A CI runner is roughly ten times slower (measured: 13.3 minutes against about one locally, with
  // three specs failing on the 30 s default). The timeout is raised, not `retries`, which hides a flake.
  timeout: process.env.CI === undefined ? 30_000 : 120_000,
  reporter: [["list"]],
  // Removes the counters this run made and says how many designs it minted; fails when it finds none.
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "mobile",
      // Desktop specs are named apart rather than tagged, so a spec cannot silently run at the wrong viewport.
      testIgnore: "**/*.desktop.e2e.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        defaultBrowserType: "chromium",
      },
    },
    /** The desktop line: the panel is a 420 px right rail, well above `editor-panel.module.css`'s
     *  900 px branch, with no touch, since the rail is a pointer surface. */
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
    // A production build on CI, `next dev` locally. `next dev` compiles each route on first request,
    // so on a runner every spec opening a new page would pay a Turbopack compile inside its own
    // timeout; a build pays it once, inside the server window below, and is what Vercel serves.
    command: isContinuousIntegration
      ? `pnpm run build && pnpm exec next start --port ${String(PORT)}`
      : `pnpm exec next dev --port ${String(PORT)}`,
    // Not `/`: a bare `redirect()` compiles in milliseconds and would declare the server ready before
    // the three.js editor has compiled, landing that compile inside a 30 s test. A synthetic id that
    // resolves to nothing answers 200 through `DesignLoadError` while compiling the same client graph.
    url: `${BASE_URL}/ro/d/e2e-readiness-probe`,
    // Never reused, even locally: the suite writes designs, and a server already on this port would be
    // one started against `.env.local`, the application's own database (ADR 0006).
    reuseExistingServer: false,
    env: {
      DATABASE_URL: exportTestDatabaseUrl(),
      // `SelectionDebug` is off in any build that does not ask for it. Set here, not in an env file,
      // so no deployed environment inherits the flag.
      [SELECTION_DEBUG_FLAG]: SELECTION_DEBUG_FLAG_ENABLED,
      // `/internal/scene-shot` and `/internal/mirror-shot` answer 404 on a production build
      // (`next start`, which CI runs) unless this opts in; the capture specs drive them. Same placement
      // as the flag above. `next dev` serves the routes regardless.
      [SCENE_SHOT_ROUTE_FLAG]: SCENE_SHOT_ROUTE_FLAG_ENABLED,
      // The mint's limiter runs under its own policy and its own secret here: a day's figure sized for one run, and
      // keys no other run, and no deployment, can share. `CLIENT_NETWORK_SOURCE` is never set, so every request is
      // in the one shared bucket and no forwarding header decides anything.
      [E2E_RATE_LIMIT_POLICY_FLAG]: E2E_RATE_LIMIT_POLICY_FLAG_ENABLED,
      DIGEST_SECRET: runSecret,
      // A contact request is passed on by the fake sender, which only this flag selects and only with no mail variable
      // present (ADR 0154). Set here and in no env file, so no deployed environment inherits it.
      ...FAKE_MAIL_SERVER_ENVIRONMENT,
    },
    // Long enough for a cold `next build` on CI.
    timeout: isContinuousIntegration ? 300_000 : 60_000,
  },
});

/**
 * The database the e2e server may write to (ADR 0006): `TEST_DATABASE_URL`, from `.env.test.local`.
 * Passed to the server as `DATABASE_URL`, the only variable the application reads, and inherited by
 * the test workers so they can delete the rows a spec minted.
 */
function exportTestDatabaseUrl(): string {
  const url = readTestDatabaseUrl();
  // A merely set variable can hold a privileged application connection; the guard compares host,
  // port and database name against `DATABASE_URL` and refuses a match before any server starts.
  assertSafeTestDatabaseUrl(url);
  return url;
}

/** Throws rather than falling back to `.env.local`: a silent fallback is the misconfiguration ADR
 *  0006 requires to fail loudly. */
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
