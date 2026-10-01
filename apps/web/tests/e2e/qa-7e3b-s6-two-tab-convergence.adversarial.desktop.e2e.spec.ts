import { expect, test } from "@playwright/test";

import { deleteMintedDesigns } from "./support/minted-designs";
import {
  DEFAULT_DESKTOP_ROUNDS,
  runOneTwoTabRound,
  twoTabRoundCount,
} from "./support/two-tab-convergence";

/**
 * M7 wave 7E3b S6, criterion 1 — the desktop half of
 * `qa-7e3b-s6-two-tab-convergence.adversarial.e2e.spec.ts`. The plan asks for both projects; the
 * test body is identical on purpose, since the Web Lock's own guarantee is server- and
 * client-JS-level, not a viewport concern. Fewer default rounds than the mobile twin only to keep
 * both projects' own share of the suite comparable (see `support/two-tab-convergence.ts`); the
 * same `E2E_TWO_TAB_ROUNDS` opt-in raises this leg too.
 */
const ROUNDS = twoTabRoundCount(DEFAULT_DESKTOP_ROUNDS);

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
