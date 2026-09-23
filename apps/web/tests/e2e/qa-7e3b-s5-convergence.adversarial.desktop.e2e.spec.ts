import { expect, test } from "@playwright/test";

import { deleteMintedDesigns } from "./support/minted-designs";
import { runConvergenceRounds } from "./support/s5-convergence";

/**
 * M7 wave 7E3b S5, criterion 1 — the desktop half of
 * `qa-7e3b-s5-convergence.adversarial.e2e.spec.ts`. The plan asks for both projects; the test body
 * is identical on purpose, since a mint race is a server-side property that does not vary with
 * viewport (`design-owner-gate.desktop.e2e.spec.ts`'s own twin carries the same reasoning).
 */
test("two concurrent in-page mints from one O converge, and every design opens under the jar's value, over 30 rounds", async ({
  page,
}) => {
  const { mintedIds, failure } = await runConvergenceRounds(page);
  try {
    expect(failure).toBeNull();
  } finally {
    await deleteMintedDesigns(mintedIds);
  }
});
