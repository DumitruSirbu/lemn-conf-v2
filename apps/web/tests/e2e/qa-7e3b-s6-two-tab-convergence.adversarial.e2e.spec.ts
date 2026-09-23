import { expect, test } from "@playwright/test";

import { deleteMintedDesigns } from "./support/minted-designs";
import { runTwoTabConvergenceRounds } from "./support/two-tab-convergence";

/**
 * M7 wave 7E3b S6, criterion 1 (ADR 0114 Amendment H6, D2) — the client-side Web Lock's headline
 * criterion, measured live: two tabs of one browser context, each through the real Step 1 path,
 * tapping the composing *Continuă* concurrently. Over 30 rounds, in both projects (the plan's own
 * bar: "failing a single round is a failure").
 */
test("two tabs of one context converge on the lock, and every design stays reachable, over 30 rounds", async ({
  context,
}) => {
  // 30 rounds of two real Step 1 journeys each — composition, kit load, mint and save — well past
  // the config's own default (`ceiling-row-tappable.e2e.spec.ts`'s own reason for the same call).
  test.setTimeout(300_000);
  const { mintedIds, failure } = await runTwoTabConvergenceRounds(context);
  try {
    expect(failure).toBeNull();
  } finally {
    await deleteMintedDesigns(mintedIds);
  }
});
