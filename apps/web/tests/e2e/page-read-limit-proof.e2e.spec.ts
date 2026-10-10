import { deleteRateLimitCountersForTests } from "@lemnaria/persistence";
import { expect, test } from "@playwright/test";

import {
  blockOfAddress,
  SHARED_BLOCK,
} from "../../src/lib/server/rate-limit/client-network";
import { deleteMintedDesigns } from "./support/minted-designs";
import { READ_POLICY } from "../../src/lib/server/rate-limit/limit-policy";
import {
  bucketKeyOfBlock,
  secretOfThisRun,
} from "./support/e2e-rate-limit-run";
import {
  PAGE_READ_PROOF_SERVER_PORT,
  startProductionPolicyServer,
  type ProductionPolicyServer,
} from "./support/production-policy-server";

/**
 * A design's page, read through the request interceptor of a BUILT server (`next start`) that names a network source:
 * the interceptor loads the limiter by a dynamic import, the store's driver, `node:crypto` and the `server-only` chain
 * run in its layer, the hit lands, and the harness finds the one row under the key it computes. The forwarding header
 * is this spec's own, sent to the second server alone; the suite's server names no source and never sees one counted.
 */
const SERVER_START_TIMEOUT_MS = 300_000;
const A_DESIGN_PAGE = "/ro/d/e2e-readiness-probe";
const A_SUFFIXED_DESIGN_PAGE = "/ro/d/e2e-readiness-probe.png";
const A_DOCUMENTATION_ADDRESS = "192.0.2.77";
const LANDING_POLL_MS = 250;
const LANDING_TIMEOUT_MS = 15_000;
/** Long enough that a hit the suite's own server counted would have landed: the second server's landed within one
 *  poll of its response. */
const NO_HIT_WATCH_MS = 3000;

const RUN_UNDER_CI =
  "It needs the production build the first server makes under CI, and builds nothing itself. Run it with: " +
  "CI=1 pnpm --filter @lemnaria/web exec playwright test " +
  "tests/e2e/page-read-limit-proof.e2e.spec.ts --project=mobile";

test.describe("a page read counted in the request interceptor of a built server", () => {
  test.skip(process.env.CI === undefined, RUN_UNDER_CI);

  const mintedIds: string[] = [];
  let server: ProductionPolicyServer | undefined;

  test.beforeAll(async () => {
    test.setTimeout(SERVER_START_TIMEOUT_MS);
    server = await startProductionPolicyServer(PAGE_READ_PROOF_SERVER_PORT, {
      networkSource: "vercel",
    });
  });

  test.afterAll(async () => {
    await server?.stop();
    await deleteMintedDesigns(mintedIds);
  });

  test("serves the page, loads the limiter in the interceptor, and lands one hit under the block's key", async () => {
    if (server === undefined)
      throw new Error("the second server did not start");
    const blockKey = bucketKeyOfBlock(
      server.secret,
      READ_POLICY.name,
      blockOfAddress(A_DOCUMENTATION_ADDRESS),
    );

    const response = await fetch(`${server.origin}${A_DESIGN_PAGE}`, {
      headers: { "x-forwarded-for": A_DOCUMENTATION_ADDRESS },
    });
    const landed = await removedWhenItLands(blockKey);
    const readiness = await removedForTheReadinessPolls(server.secret);

    expect(response.status).toBe(200);
    expect(
      response.headers.get("content-security-policy-report-only"),
    ).toBeTruthy();
    expect(landed).toEqual({ rowsRemoved: 1, counts: [1] });
    console.log(
      `page read proof: one hit under the block's key (rows removed ${String(landed.rowsRemoved)}, ` +
        `count ${String(landed.counts[0])}); the server's own readiness polls: ` +
        `${String(readiness.rowsRemoved)} rows removed`,
    );
  });

  test("counts a design's address that ends in a static file's extension, as the page it is routed to", async () => {
    if (server === undefined)
      throw new Error("the second server did not start");
    const blockKey = bucketKeyOfBlock(
      server.secret,
      READ_POLICY.name,
      blockOfAddress(A_DOCUMENTATION_ADDRESS),
    );

    const response = await fetch(`${server.origin}${A_SUFFIXED_DESIGN_PAGE}`, {
      headers: { "x-forwarded-for": A_DOCUMENTATION_ADDRESS },
    });
    const landed = await removedWhenItLands(blockKey);

    expect(response.status).toBe(200);
    expect(landed).toEqual({ rowsRemoved: 1, counts: [1] });
  });

  test("answers an address deeper than a family's page with a 404: no page is routed to it, no lookup runs", async () => {
    if (server === undefined)
      throw new Error("the second server did not start");
    const blockKey = bucketKeyOfBlock(
      server.secret,
      READ_POLICY.name,
      blockOfAddress(A_DOCUMENTATION_ADDRESS),
    );
    const addresses = [
      "/ro/d/e2e-readiness-probe/review.png",
      "/ro/d/e2e-readiness-probe/x.png",
      "/ro/s/abcdefghijkl/x.png",
    ];

    const statuses: number[] = [];
    for (const address of addresses) {
      const response = await fetch(`${server.origin}${address}`, {
        headers: { "x-forwarded-for": A_DOCUMENTATION_ADDRESS },
      });
      statuses.push(response.status);
    }

    expect(statuses).toEqual([404, 404, 404]);
    expect(await removedAtAnyPollOf([blockKey])).toBe(0);
  });

  test("is not counted by the suite's own server, which names no source, whatever header a request carries", async ({
    request,
  }) => {
    // One design is minted here so the run's teardown, which fails a run that minted none, has what it looks for.
    const minted = (await (
      await request.post("/api/designs", {
        headers: { "sec-fetch-site": "same-origin" },
      })
    ).json()) as { id?: string };
    if (typeof minted.id === "string") mintedIds.push(minted.id);

    const suiteKey = bucketKeyOfBlock(
      secretOfThisRun(),
      READ_POLICY.name,
      SHARED_BLOCK,
    );
    const blockKey = bucketKeyOfBlock(
      secretOfThisRun(),
      READ_POLICY.name,
      blockOfAddress(A_DOCUMENTATION_ADDRESS),
    );

    const response = await request.get(A_DESIGN_PAGE, {
      headers: { "x-forwarded-for": A_DOCUMENTATION_ADDRESS },
    });
    const removed = await removedAtAnyPollOf([suiteKey, blockKey]);

    expect(response.status()).toBe(200);
    expect(removed).toBe(0);
  });
});

/** The hit is counted beside the response, so it lands a moment after it: removed by its key when it does. */
async function removedWhenItLands(key: string) {
  const deadline = Date.now() + LANDING_TIMEOUT_MS;
  for (;;) {
    const removed = await deleteRateLimitCountersForTests([key]);
    if (removed.rowsRemoved > 0 || Date.now() >= deadline) return removed;
    await new Promise((resolve) => setTimeout(resolve, LANDING_POLL_MS));
  }
}

/** Polls the keys for a bounded time and answers how many rows any poll found: none is the answer for a hit that was
 *  never counted. A row found ends the watch at once. */
async function removedAtAnyPollOf(keys: string[]): Promise<number> {
  const deadline = Date.now() + NO_HIT_WATCH_MS;
  for (;;) {
    const removed = await deleteRateLimitCountersForTests(keys);
    if (removed.rowsRemoved > 0 || Date.now() >= deadline) {
      return removed.rowsRemoved;
    }
    await new Promise((resolve) => setTimeout(resolve, LANDING_POLL_MS));
  }
}

/** What a server that names a source counts its own readiness polls under, whichever block it takes them for. */
async function removedForTheReadinessPolls(secret: string) {
  const addresses = ["127.0.0.1", "::1"];
  const keys = [
    bucketKeyOfBlock(secret, READ_POLICY.name, SHARED_BLOCK),
    ...addresses.map((address) =>
      bucketKeyOfBlock(secret, READ_POLICY.name, blockOfAddress(address)),
    ),
  ];
  return deleteRateLimitCountersForTests(keys);
}
