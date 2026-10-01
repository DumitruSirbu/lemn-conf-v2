import type { BrowserContext, Page } from "@playwright/test";

import { mintSeededDesign, type DesignAccessProbe } from "./seeded-design";

/**
 * M7 wave 7E3b S6, criterion S6-1 (ADR 0114 Amendment H6, D2) — the headline criterion for the
 * client-side Web Lock: two tabs of **one** browser context, each driven through the real Step 1
 * path (shape → dimensions → *Continuă*), tapping the composing *Continuă* concurrently. A single
 * failing round fails the criterion.
 *
 * **One round per Playwright test** (QA round 2, finding Q10): a 30-round loop inside one test
 * needed `test.setTimeout(300_000)` to fit locally at all, and measured at roughly 3.2–3.6 s a
 * round on a production build — about ten times that on a CI runner — which put the mobile leg
 * alone near 18 minutes, over the per-test timeout and most of the suite's own 45-minute ceiling.
 * A round is its own test instead: each comfortably fits the config's default per-test timeout
 * even at CI's ten-times-slower pace, and a failing round is reported by name rather than by
 * number inside one long failure.
 *
 * **Round count.** `DEFAULT_MOBILE_ROUNDS`/`DEFAULT_DESKTOP_ROUNDS` below are what CI runs; set
 * `E2E_TWO_TAB_ROUNDS` to run more locally (30 was this criterion's own original bar). Desktop
 * defaults lower than mobile only to keep both projects' own share of the suite comparable — the
 * property under test does not vary by viewport (every other twin in this directory carries the
 * same reasoning).
 *
 * A fully-typed room query, matching `room-to-editor.qa.e2e.spec.ts`'s own `THE_TYPED_ROOM` — a
 * room comfortably inside the approved bounds, so composition is the thing under test rather than
 * the generator's own boundary. Navigating straight to it (rather than clicking through 1A and
 * typing digit by digit) is the same shortcut `qa-7f2-s4-shape-refusal.adversarial.e2e.spec.ts`
 * already takes: the room screen renders the filled-fields sub-state directly from the query, with
 * the same `room-continue` control ready to tap.
 */
const TYPED_ROOM_QUERY =
  "shape=L&wallA=3.56&wallB=4.25&height=2.7&direction=left";

export const DEFAULT_MOBILE_ROUNDS = 10;
export const DEFAULT_DESKTOP_ROUNDS = 3;

const ROUNDS_ENV_VAR = "E2E_TWO_TAB_ROUNDS";

/** `E2E_TWO_TAB_ROUNDS`, read once per spec file, or `defaultRounds` when it is unset — never a
 *  silent fallback for a value that *is* set but unusable, which would run a round count nobody
 *  chose. */
export function twoTabRoundCount(defaultRounds: number): number {
  const raw = process.env[ROUNDS_ENV_VAR];
  if (raw === undefined) return defaultRounds;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(
      `${ROUNDS_ENV_VAR} must be a positive integer; got ${JSON.stringify(raw)}.`,
    );
  }
  return parsed;
}

export interface TwoTabRoundResult {
  readonly mintedIds: readonly string[];
  readonly failureReason: string | null;
}

/** Navigates one page to the fully-typed room and returns once `room-continue` — the tap that
 *  triggers `compose()` and, on success, the hand-off — is ready. */
async function readyToContinue(page: Page): Promise<void> {
  await page.goto(`/ro/configurator/room?${TYPED_ROOM_QUERY}`);
  await page.getByTestId("room-continue").waitFor({ state: "visible" });
}

/** Taps the composing *Continuă* and waits for the hand-off's own navigation to `/ro/d/{id}` —
 *  nothing else is tapped for it (`use-generation.ts`: composition and the write are one wait). */
async function tapContinueAndAwaitDesign(page: Page): Promise<string> {
  await page.getByTestId("room-continue").click();
  await page.waitForURL(/\/ro\/d\/[^/]+$/);
  const id = new URL(page.url()).pathname.split("/").pop();
  if (id === undefined || id === "") {
    throw new Error(`two-tab-convergence: no design id in ${page.url()}`);
  }
  return decodeURIComponent(id);
}

/** `GET /api/designs/{id}`'s own `canWrite`, read from whichever page in the context — both share
 *  the one jar under test. */
async function canWriteDesign(page: Page, id: string): Promise<boolean> {
  const probe = await page.evaluate(async (designId: string) => {
    const response = await fetch(`/api/designs/${designId}`, {
      credentials: "same-origin",
    });
    if (response.status !== 200) return { canWrite: false };
    return (await response.json()) as DesignAccessProbe;
  }, id);
  return probe.canWrite;
}

/**
 * One round of S6-1: mints the prior design the criterion's own *"the context carries a prior
 * design"* names, then two tabs of `context` race through Step 1 concurrently, then every design —
 * the prior one and both new — is checked for `canWrite: true`.
 */
export async function runOneTwoTabRound(
  context: BrowserContext,
): Promise<TwoTabRoundResult> {
  const prior = await mintSeededDesign(await context.newPage());
  const mintedIds: string[] = [prior.id];

  const pageA = await context.newPage();
  const pageB = await context.newPage();
  try {
    await readyToContinue(pageA);
    await readyToContinue(pageB);

    const [idA, idB] = await Promise.all([
      tapContinueAndAwaitDesign(pageA),
      tapContinueAndAwaitDesign(pageB),
    ]);
    mintedIds.push(idA, idB);

    for (const id of [prior.id, idA, idB]) {
      if (!(await canWriteDesign(pageA, id))) {
        return {
          mintedIds,
          failureReason: `design ${id} did not open with canWrite: true`,
        };
      }
    }
  } finally {
    await pageA.close();
    await pageB.close();
  }

  return { mintedIds, failureReason: null };
}
