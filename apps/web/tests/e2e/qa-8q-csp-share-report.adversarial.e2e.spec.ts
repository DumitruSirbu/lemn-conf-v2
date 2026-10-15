// Wave 8Q S6 item 2, QA's: a real violation on a share view travels the whole way, browser to sink to log, on a SECOND
// server whose output this spec reads, and the share token is nowhere in what that server wrote. The report reaches the
// server (nothing intercepts it here), one hit is counted under the block's key, and each `[csp]` line is the reduced
// record of 8Q.3 with the share view's family as its page. The suite's own server is never sent a report, so the run's
// teardown stays at zero.
//
// Controls that can fail each claim: (a) the output capture is shown to see the server's own text and the `[csp]` lines
// it is searched in, so "the token is not there" is not "nothing was captured"; (b) the search function finds a token
// planted in a string; (c) the same page without the injection writes no `[csp]` line and counts no hit; (d) the
// address the browser sent the report from DID hold the token (the document's address, read from the browser), so the
// reduction had something to leak.
// THIS FILE IS A `CI=1` SPEC (it starts `next start` on the production build). Run it with:
//   CI=1 pnpm exec playwright test tests/e2e/qa-8q-csp-share-report.adversarial.e2e.spec.ts --project=mobile
// Writes: one design and one share link (removed), and the counter rows of the second server's own secret (removed).
import { deleteRateLimitCountersForTests } from "@lemnaria/persistence";
import { expect, test, type Browser } from "@playwright/test";

import { SHARED_BLOCK } from "../../src/lib/server/rate-limit/client-network";
import {
  ALL_LIMIT_POLICIES,
  CSP_REPORT_POLICY,
} from "../../src/lib/server/rate-limit/limit-policy";
import {
  NO_VIOLATIONS,
  violationsSeen,
  watchForViolations,
} from "./support/csp-violations";
import { bucketKeyOfBlock } from "./support/e2e-rate-limit-run";
import { deleteMintedDesigns } from "./support/minted-designs";
import {
  CSP_SHARE_REPORT_SERVER_PORT,
  startProductionPolicyServer,
  type ProductionPolicyServer,
} from "./support/production-policy-server";
import {
  dispositionOfTheLiveMode,
  injectIntoDocuments,
  injectionHtml,
  isEnforcing,
  markerOf,
  readMarker,
  FOREIGN_SCRIPT_URL,
} from "./support/qa-8q-injection";
import { issueShareLink, mintSeededDesign } from "./support/seeded-design";

const RUN_UNDER_CI =
  "It starts the production build the first server makes under CI. Run it with: " +
  "CI=1 pnpm exec playwright test tests/e2e/qa-8q-csp-share-report.adversarial.e2e.spec.ts --project=mobile";

const SERVER_START_TIMEOUT_MS = 300_000;
const SETTLE_MS = 1500;
const LOG_LABEL = "[csp]";
/** 8Q.3's list, and no other key may appear in a line. */
const ALLOWED_KEYS: readonly string[] = [
  "event",
  "directive",
  "blocked",
  "source",
  "line",
  "column",
  "page",
  "locale",
  "origin",
  "disposition",
  "status",
];
/** Text a log line must never hold, whatever else it holds. */
const FORBIDDEN_TEXT = [
  "document-uri",
  "referrer",
  "script-sample",
  "original-policy",
  "nonce-",
  "set-cookie",
];

interface Line {
  readonly raw: string;
  readonly record: Record<string, unknown>;
}

test.describe("a violation on a share view, end to end on a second server", () => {
  test.skip(process.env.CI === undefined, RUN_UNDER_CI);

  let server: ProductionPolicyServer | undefined;
  const mintedIds: string[] = [];

  test.beforeAll(async () => {
    test.setTimeout(SERVER_START_TIMEOUT_MS);
    server = await startProductionPolicyServer(CSP_SHARE_REPORT_SERVER_PORT, {
      captureOutput: true,
    });
  });

  test.afterAll(async () => {
    await server?.stop();
    if (server !== undefined) await removeEveryCounterOf(server.secret);
    await deleteMintedDesigns(mintedIds);
  });

  test("the report is counted once per report, logged as one reduced line whose page is the share family, and the token is nowhere in the output", async ({
    browser,
  }) => {
    const live = requireServer(server);
    const { sharePath, token } = await shareLinkOf(browser, mintedIds);
    const context = await browser.newContext();
    const page = await context.newPage();
    const net = await watchForViolations(page);
    await injectIntoDocuments(page, () =>
      injectionHtml("inline", FOREIGN_SCRIPT_URL),
    );
    const countsBefore = await countersOf(live.secret);
    expect(
      countsBefore,
      "no report is counted before the page is opened",
    ).toEqual({ rowsRemoved: 0, hits: 0 });
    const outputBefore = live.output();

    await page.goto(`${live.origin}/ro${sharePath}`);
    await expect
      .poll(() => violationsSeen(net).events.length, { message: "the event" })
      .toBeGreaterThan(0);
    expect(
      page.url(),
      "(d) the address the report came from held the token",
    ).toContain(token);
    const violationLines = await linesWritten(live, outputBefore, 1);
    expect(await readMarker(page, markerOf("inline"))).toBe(
      isEnforcing() ? null : 1,
    );
    await context.close();

    const written = live.output();
    expect(violationLines.length).toBeGreaterThan(0);
    for (const line of violationLines) {
      expect(line.record.event).toBe("csp-violation");
      expect(line.record.page).toBe("/[locale]/s/[token]");
      expect(line.record.origin).toBe("own");
      expect(line.record.locale).toBe("ro");
      expect(line.record.directive).toBe("script-src-elem");
      expect(line.record.blocked).toBe("inline");
      expect(line.record.disposition).toBe(dispositionOfTheLiveMode());
      expect(
        Object.keys(line.record).filter((key) => !ALLOWED_KEYS.includes(key)),
      ).toEqual([]);
      for (const forbidden of FORBIDDEN_TEXT) {
        expect(line.raw.toLowerCase()).not.toContain(forbidden);
      }
    }
    expect(
      containsTokenOf(written, token),
      "the token, anywhere in the server's output",
    ).toBe(false);
    expect(
      containsTokenOf(written, token.slice(0, 8)),
      "the token's first characters",
    ).toBe(false);
    const counted = await countersOf(live.secret);
    expect(counted.rowsRemoved, "one counter row under the block's key").toBe(
      1,
    );
    expect(
      counted.hits,
      "every counted report is one line, and no more than the browser sent",
    ).toBe(violationLines.length);
    expect(violationsSeen(net).reportRequests.length).toBeGreaterThanOrEqual(1);
    test.info().annotations.push({
      type: "lines",
      description: violationLines.map((line) => line.raw).join(" | "),
    });
  });

  test("controls: the same share view without the injection writes no line and counts no hit; the capture holds the server's own text; the search finds a planted token", async ({
    browser,
  }) => {
    const live = requireServer(server);
    const { sharePath } = await shareLinkOf(browser, mintedIds);
    const context = await browser.newContext();
    const page = await context.newPage();
    const net = await watchForViolations(page);
    const outputBefore = live.output();
    await countersOf(live.secret);

    await page.goto(`${live.origin}/ro${sharePath}`);
    await expect(page.locator("canvas").first()).toBeVisible({
      timeout: 60_000,
    });
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    await context.close();

    expect(violationsSeen(net)).toEqual(NO_VIOLATIONS);
    expect(linesIn(live.output().slice(outputBefore.length))).toEqual([]);
    expect(await countersOf(live.secret)).toEqual({ rowsRemoved: 0, hits: 0 });
    // Controls (a) and (b): the capture holds the server's own text, and the search finds a token planted in it.

    expect(live.output(), "the server's own startup text").toMatch(
      /ready|started|local:/i,
    );
    expect(
      containsTokenOf(
        `${LOG_LABEL} {"x":"abcDEF123456789"}`,
        "abcDEF123456789",
      ),
    ).toBe(true);
    expect(containsTokenOf(`${LOG_LABEL} {"x":"abc"}`, "abcDEF123456789")).toBe(
      false,
    );
  });
});

function requireServer(
  server: ProductionPolicyServer | undefined,
): ProductionPolicyServer {
  if (server === undefined) throw new Error("the second server did not start");
  return server;
}

function requireBaseUrl(baseURL: string | undefined): string {
  if (baseURL === undefined) throw new Error("the project sets no baseURL");
  return baseURL;
}

function containsTokenOf(output: string, token: string): boolean {
  return output.includes(token);
}

/** A share link minted on the suite's server (the database is shared), and the token its path carries. */
async function shareLinkOf(
  browser: Browser,
  mintedIds: string[],
): Promise<{ sharePath: string; token: string }> {
  const context = await browser.newContext({
    baseURL: requireBaseUrl(test.info().project.use.baseURL),
  });
  try {
    const page = await context.newPage();
    const design = await mintSeededDesign(page);
    mintedIds.push(design.id);
    const sharePath = await issueShareLink(page, design);
    const token = sharePath.split("/").filter(Boolean).at(-1) ?? "";
    expect(token.length, "a token to look for").toBeGreaterThan(8);
    return { sharePath, token };
  } finally {
    await context.close();
  }
}

function linesIn(output: string): Line[] {
  return output
    .split("\n")
    .filter((text) => text.startsWith(LOG_LABEL))
    .map((raw) => ({
      raw,
      record: JSON.parse(raw.slice(LOG_LABEL.length).trim()) as Record<
        string,
        unknown
      >,
    }));
}

/** The `[csp]` lines the server wrote after `before`, once at least `atLeast` have arrived and the count has settled. */
async function linesWritten(
  server: ProductionPolicyServer,
  before: string,
  atLeast: number,
): Promise<Line[]> {
  const deadline = Date.now() + 15_000;
  while (linesIn(server.output().slice(before.length)).length < atLeast) {
    if (Date.now() > deadline) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  return linesIn(server.output().slice(before.length));
}

/** What the server counted under the block's key, removing it, so a second look finds none. */
async function countersOf(secret: string) {
  const removed = await deleteRateLimitCountersForTests([
    bucketKeyOfBlock(secret, CSP_REPORT_POLICY.name, SHARED_BLOCK),
  ]);
  return {
    rowsRemoved: removed.rowsRemoved,
    hits: removed.counts.reduce((sum, count) => sum + count, 0),
  };
}

/** Every row this server's secret made, under every policy: its readiness polls and page reads included. */
async function removeEveryCounterOf(secret: string): Promise<void> {
  await deleteRateLimitCountersForTests(
    ALL_LIMIT_POLICIES.map((policy) =>
      bucketKeyOfBlock(secret, policy.name, SHARED_BLOCK),
    ),
  );
}
