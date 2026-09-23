import { expect, test } from "@playwright/test";

import { deleteMintedDesigns } from "./support/minted-designs";
import { runConvergenceRounds } from "./support/s5-convergence";

/**
 * M7 wave 7E3b S5, criterion 1 (ADR 0114 Amendment H4) — the headline criterion, measured live in a
 * real browser: two concurrent in-page mints from one `O` both answer the same `N`, and every
 * design that browser held — three earlier ones and both new — opens under whichever value the jar
 * ends up holding. Run over 30 rounds in both projects (the plan's own bar: "failing a single round
 * is a failure").
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
