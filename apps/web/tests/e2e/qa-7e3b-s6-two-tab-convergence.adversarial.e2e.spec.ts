import { expect, test } from "@playwright/test";

import { deleteMintedDesigns } from "./support/minted-designs";
import {
  DEFAULT_MOBILE_ROUNDS,
  runOneTwoTabRound,
  twoTabRoundCount,
} from "./support/two-tab-convergence";

/**
 * M7 wave 7E3b S6, criterion 1 (ADR 0114 Amendment H6, D2) — the client-side Web Lock's headline
 * criterion, measured live: two tabs of one browser context, each through the real Step 1 path,
 * tapping the composing *Continuă* concurrently. A single failing round fails the criterion (see
 * `support/two-tab-convergence.ts` for why this runs one round per test, and for
 * `E2E_TWO_TAB_ROUNDS` — the opt-in for a longer local run, e.g.
 * `E2E_TWO_TAB_ROUNDS=30 pnpm test:e2e qa-7e3b-s6-two-tab-convergence`).
 */
const ROUNDS = twoTabRoundCount(DEFAULT_MOBILE_ROUNDS);

for (let round = 1; round <= ROUNDS; round += 1) {
  test(`round ${String(round)}/${String(ROUNDS)}: two tabs of one context converge on the lock, and every design stays reachable`, async ({
    context,
  }) => {
    const { mintedIds, failureReason } = await runOneTwoTabRound(context);
    try {
      expect(failureReason).toBeNull();
    } finally {
      await deleteMintedDesigns(mintedIds);
    }
  });
}
