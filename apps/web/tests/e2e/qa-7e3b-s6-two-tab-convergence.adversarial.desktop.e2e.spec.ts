import { expect, test } from "@playwright/test";

import { deleteMintedDesigns } from "./support/minted-designs";
import { runTwoTabConvergenceRounds } from "./support/two-tab-convergence";

/**
 * M7 wave 7E3b S6, criterion 1 — the desktop half of
 * `qa-7e3b-s6-two-tab-convergence.adversarial.e2e.spec.ts`. The plan asks for both projects; the
 * test body is identical on purpose, since the Web Lock's own guarantee is server- and
 * client-JS-level, not a viewport concern (`qa-7e3b-s5-convergence`'s own twin carried the same
 * reasoning before it was retired with H4).
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
