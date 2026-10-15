// Wave 8Q S6 item 4, QA's: the failed server render under the live policy. A second server is given a database it cannot
// reach (a well-formed URL naming a host that does not exist: never the application's database, never printed), and the
// owner's cookies, taken from a design minted on the suite's server, are replayed to it. Each of the design page, its
// review, its contact page and its confirmation then answers `500` with every `<script>` carrying that response's own
// nonce, and loading it makes no violation of either disposition, seen by all three observers (S0 M2's recipe).
//
// Controls that can fail the claim: (a) the same cookies against the suite's server answer `200`, so the 500 is the
// unreachable database's and not the cookies'; (b) without the cookies the second server answers `200` too (the page
// never reaches the database), which is why the cookies are needed; (c) the 500 document is not the prerendered global
// error page; (d) the document has scripts, so "every script is nonced" is not vacuous.
// THIS FILE IS A `CI=1` SPEC. Run it with:
//   CI=1 pnpm exec playwright test tests/e2e/qa-8q-failed-render.adversarial.e2e.spec.ts --project=mobile
// Writes: one design (removed). Nothing the second server counts is kept: its counter rows are removed.
import { deleteRateLimitCountersForTests } from "@lemnaria/persistence";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
} from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { SHARED_BLOCK } from "../../src/lib/server/rate-limit/client-network";
import { ALL_LIMIT_POLICIES } from "../../src/lib/server/rate-limit/limit-policy";
import {
  NO_VIOLATIONS,
  nonceOfPolicy,
  policyOf,
  violationsSeen,
  watchForViolations,
} from "./support/csp-violations";
import { bucketKeyOfBlock } from "./support/e2e-rate-limit-run";
import { deleteMintedDesigns } from "./support/minted-designs";
import {
  FAILED_RENDER_SERVER_PORT,
  startProductionPolicyServer,
  type ProductionPolicyServer,
} from "./support/production-policy-server";
import { mintSeededDesign } from "./support/seeded-design";

const RUN_UNDER_CI =
  "It starts the production build the first server makes under CI. Run it with: " +
  "CI=1 pnpm exec playwright test tests/e2e/qa-8q-failed-render.adversarial.e2e.spec.ts --project=mobile";

const SERVER_START_TIMEOUT_MS = 300_000;
/** Well formed, and no host answers: `.invalid` never resolves. A fake password, so nothing here is a credential. */
const UNREACHABLE_DATABASE_URL =
  "postgresql://qa8q_user:qa8q-not-a-password@qa8q-unreachable-host.invalid:5432/qa8q?sslmode=require";
const SCRIPT_TAG = /<script\b[^>]*>/g;
const NONCE_ATTRIBUTE = /\snonce="([^"]*)"/;
const PRERENDERED_GLOBAL_ERROR = join(
  process.cwd(),
  ".next",
  "server",
  "app",
  "_global-error.html",
);

type OwnerState = Awaited<ReturnType<BrowserContext["storageState"]>>;

const PAGES = [
  { name: "the design page", suffix: "" },
  { name: "the review", suffix: "/review" },
  { name: "the contact page", suffix: "/contact" },
  { name: "the confirmation", suffix: "/done" },
] as const;

test.describe("the failed server render, under the live policy", () => {
  test.skip(process.env.CI === undefined, RUN_UNDER_CI);

  let server: ProductionPolicyServer | undefined;
  let designId = "";
  let ownerState: OwnerState | undefined;

  test.beforeAll(async ({ browser }, workerInfo) => {
    test.setTimeout(SERVER_START_TIMEOUT_MS);
    const baseURL = requireBaseUrl(workerInfo.project.use.baseURL);
    const minted = await mintOnTheSuitesServer(browser, baseURL);
    designId = minted.id;
    ownerState = minted.state;
    server = await startProductionPolicyServer(FAILED_RENDER_SERVER_PORT, {
      unreachableDatabaseUrl: UNREACHABLE_DATABASE_URL,
    });
  });

  test.afterAll(async () => {
    await server?.stop();
    if (server !== undefined) {
      await deleteRateLimitCountersForTests(
        ALL_LIMIT_POLICIES.map((policy) =>
          bucketKeyOfBlock(server?.secret ?? "", policy.name, SHARED_BLOCK),
        ),
      );
    }
    await deleteMintedDesigns(designId === "" ? [] : [designId]);
  });

  // One test per language, a step per page: the e2e budget counts tests (`gate:e2e-shard-budget`).
  for (const locale of ["ro", "ru"] as const) {
    test(`${locale}: the design page, review, contact page and confirmation each answer 500, every script carries its own response's nonce, and loading one breaks no policy`, async ({
      browser,
    }) => {
      for (const { name, suffix } of PAGES) {
        await test.step(name, async () => {
          const live = requireServer(server);
          const context = await browser.newContext({
            storageState: requireState(ownerState),
          });
          const page = await context.newPage();
          const net = await watchForViolations(page);

          const response = await page.goto(
            `${live.origin}/${locale}/d/${designId}${suffix}`,
          );

          expect(response?.status()).toBe(500);
          const html = await response?.text();
          const scripts = html?.match(SCRIPT_TAG) ?? [];
          const nonce = nonceOfPolicy(policyOf(requireResponse(response)));
          expect(
            scripts.length,
            "(d) there are scripts to check",
          ).toBeGreaterThan(0);
          expect(nonce, "the 500 carries a policy with a nonce").toBeDefined();
          expect(
            scripts.filter((tag) => NONCE_ATTRIBUTE.exec(tag)?.[1] !== nonce),
            "scripts without this response's nonce",
          ).toEqual([]);
          expect(html, "(c) not the prerendered global error page").not.toBe(
            readFileSync(PRERENDERED_GLOBAL_ERROR, "utf8"),
          );
          await page.waitForLoadState("load");
          await new Promise((resolve) => setTimeout(resolve, 1000));
          expect(violationsSeen(net)).toEqual(NO_VIOLATIONS);
          await context.close();
        });
      }
    });
  }

  test("three loads carry three nonces; and the controls: the same cookies on the suite's own server answer 200, and without them the unreachable server answers 200 having read nothing", async ({
    browser,
  }, testInfo) => {
    const live = requireServer(server);
    const withCookies = await browser.newContext({
      storageState: requireState(ownerState),
    });
    const nonces = new Set<string | undefined>();
    for (let load = 0; load < 3; load += 1) {
      const response = await withCookies.request.get(
        `${live.origin}/ro/d/${designId}`,
      );
      expect(response.status()).toBe(500);
      nonces.add(nonceOfPolicy(policyOf(response)));
    }
    await withCookies.close();
    expect(nonces.has(undefined)).toBe(false);
    expect(nonces.size).toBe(3);

    const onTheSuitesServer = await browser.newContext({
      storageState: requireState(ownerState),
      baseURL: requireBaseUrl(testInfo.project.use.baseURL),
    });
    expect(
      (await onTheSuitesServer.request.get(`/ro/d/${designId}`)).status(),
      "control (a): the 500 is the unreachable database's, not the cookies'",
    ).toBe(200);
    await onTheSuitesServer.close();

    const withoutCookies = await browser.newContext();
    expect(
      (
        await withoutCookies.request.get(`${live.origin}/ro/d/${designId}`)
      ).status(),
      "control (b): the page reaches no database without the cookies",
    ).toBe(200);
    await withoutCookies.close();
  });
});

function requireBaseUrl(baseURL: string | undefined): string {
  if (baseURL === undefined) throw new Error("the project sets no baseURL");
  return baseURL;
}

function requireServer(
  server: ProductionPolicyServer | undefined,
): ProductionPolicyServer {
  if (server === undefined) throw new Error("the second server did not start");
  return server;
}

function requireState(state: OwnerState | undefined): OwnerState {
  if (state === undefined) throw new Error("no owner's cookies were taken");
  return state;
}

function requireResponse<T>(response: T | null | undefined): T {
  if (response === null || response === undefined) {
    throw new Error("the page answered nothing");
  }
  return response;
}

async function mintOnTheSuitesServer(
  browser: Browser,
  baseURL: string,
): Promise<{ id: string; state: OwnerState }> {
  const context = await browser.newContext({ baseURL });
  try {
    const page = await context.newPage();
    const design = await mintSeededDesign(page);
    return { id: design.id, state: await context.storageState() };
  } finally {
    await context.close();
  }
}
