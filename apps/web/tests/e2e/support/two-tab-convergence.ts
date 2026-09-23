import type { BrowserContext, Page } from "@playwright/test";

import { mintSeededDesign } from "./seeded-design";

/**
 * M7 wave 7E3b S6, criterion S6-1 (ADR 0114 Amendment H6, D2) — the headline criterion for the
 * client-side Web Lock: two tabs of **one** browser context, each driven through the real Step 1
 * path (shape → dimensions → *Continuă*), tapping the composing *Continuă* concurrently. Run over
 * `ROUNDS` rounds; a single failing round fails the criterion.
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

const ROUNDS = 30;

interface DesignAccessProbe {
  readonly canWrite: boolean;
}

interface RoundFailure {
  readonly round: number;
  readonly reason: string;
}

export interface TwoTabConvergenceResult {
  readonly mintedIds: readonly string[];
  readonly failure: RoundFailure | null;
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
 * Runs S6-1's own rounds against `context`, which is expected to already hold a design (the
 * criterion's *"the context carries a prior design"*) — a caller mints one before calling this, so
 * every round's own reachability check has an established identity to hold onto, not only the two
 * it just created.
 */
export async function runTwoTabConvergenceRounds(
  context: BrowserContext,
): Promise<TwoTabConvergenceResult> {
  const prior = await mintSeededDesign(await context.newPage());
  const mintedIds: string[] = [prior.id];

  for (let round = 0; round < ROUNDS; round += 1) {
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
            failure: {
              round,
              reason: `design ${id} did not open with canWrite: true`,
            },
          };
        }
      }
    } finally {
      await pageA.close();
      await pageB.close();
    }
  }

  return { mintedIds, failure: null };
}
