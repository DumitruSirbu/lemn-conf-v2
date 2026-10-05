import { assertSafeTestDatabaseUrl, loadEnvLocal } from "@lemnaria/persistence";
import { defineConfig, devices } from "@playwright/test";

import {
  SELECTION_DEBUG_FLAG,
  SELECTION_DEBUG_FLAG_ENABLED,
} from "./src/app/configurator/configure/selection-debug-availability";
import {
  SCENE_SHOT_ROUTE_FLAG,
  SCENE_SHOT_ROUTE_FLAG_ENABLED,
} from "./src/app/internal/scene-shot/route-availability";

// The application's own `DATABASE_URL` has to be readable here for `assertSafeTestDatabaseUrl` to
// have anything to compare against; without it the guard can only pass vacuously (finding DB-001).
loadEnvLocal();

/** GitHub Actions sets `CI`; nothing else here does. Read once, so the server
 *  command and the timeouts cannot disagree about which machine they are on. */
const isContinuousIntegration = process.env.CI !== undefined;

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
  // A CI runner is roughly ten times slower than this laptop at the same work —
  // two cores, a cold Turbopack cache, and a scene that compiles three.js on
  // first paint. Measured 2026-09-02, the first time this suite ran on GitHub:
  // 13.3 minutes wall-clock against about one locally, with three specs failing
  // on the 30 s default while doing nothing wrong. The timeout is raised rather
  // than `retries` — a retry hides a flake; a timeout that fits the machine
  // states what the machine costs.
  timeout: process.env.CI === undefined ? 30_000 : 120_000,
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
    // **A production build on CI, `next dev` locally**, and the difference is
    // not a preference. `next dev` compiles each route on its first request, so
    // on a runner every spec that opens a new page pays a Turbopack compile
    // inside its own timeout — which is what made `signature-flow` alone take
    // 5.8 minutes there. A build pays that once, up front, inside the server
    // window below, and it is also what Vercel actually serves.
    //
    // Locally `dev` stays, because the cost is reversed: a build on every
    // `pnpm test:e2e` would add a minute to a suite that finishes in one, and a
    // developer wants the tree they are editing, not a snapshot of it.
    command: isContinuousIntegration
      ? `pnpm run build && pnpm exec next start --port ${String(PORT)}`
      : `pnpm exec next dev --port ${String(PORT)}`,
    // `/ro/d/{id}` — a synthetic id that will not resolve — not `/`. Turbopack compiles a route on
    // first request, and `/` is a bare `redirect()` that compiles in milliseconds — so waiting on it
    // declares the server ready while the three.js editor has not been built yet, and the compile
    // lands inside a 30 s test instead of this 60 s window. Locally that is invisible on a warm
    // cache; on a cold CI runner it is the difference between a green suite and an intermittent
    // timeout nobody can reproduce. This is the route the specs now open (wave 7E4 D4): the id
    // resolves to nothing, so the request answers 200 through `DesignLoadError` rather than the
    // editor itself, which still compiles the same client graph on the way there.
    url: `${BASE_URL}/ro/d/e2e-readiness-probe`,
    // Never reused, even locally. The suite now *writes* — `design-write-path.e2e.spec.ts` mints a
    // design — and a server already listening on this port would be one started against
    // `.env.local`, i.e. the application's own database. ADR 0006 exists because a suite pointed
    // at real customer data needs only one careless statement to destroy it.
    reuseExistingServer: false,
    env: {
      DATABASE_URL: exportTestDatabaseUrl(),
      // `SelectionDebug` is off in every build that does not ask for it (finding WEB-004), and this
      // suite is the one thing that asks. It is set here rather than in an env file so the opt-in
      // travels with the runner that needs it: a developer running `next dev` by hand gets a
      // production-shaped page, and no deployed environment can inherit the flag by accident.
      [SELECTION_DEBUG_FLAG]: SELECTION_DEBUG_FLAG_ENABLED,
      // `/internal/scene-shot` and `/internal/mirror-shot` answer 404 on a production build
      // (`next start`, which CI runs) unless this flag opts in, and the capture specs drive them.
      // Same placement and reasoning as the flag above: it travels with this server only and is
      // in no env file, so nothing deployed inherits it. `next dev` serves the routes regardless.
      [SCENE_SHOT_ROUTE_FLAG]: SCENE_SHOT_ROUTE_FLAG_ENABLED,
    },
    // Long enough for a cold `next build` on CI; the local `dev` branch reaches
    // its URL in seconds and never approaches this.
    timeout: isContinuousIntegration ? 300_000 : 60_000,
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
