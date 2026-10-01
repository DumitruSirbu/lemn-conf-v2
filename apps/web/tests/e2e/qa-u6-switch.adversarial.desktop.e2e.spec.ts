// M7B U6 adversarial QA (docs/WORKFLOW.md step 3), at the desktop viewport: the U's real flow through
// a room too small for its kitchen, to a stranger's share view. See `qa-u6-switch.adversarial.e2e.spec.ts`
// for the mobile half and `support/qa-u6-journey.ts` for the journey both run.
//
// **Must not run concurrently with any other persistence live run**: the journey mints a real row,
// and `deleteMintedDesigns` in `afterAll` deletes it (ADR 0006).
import { test } from "@playwright/test";

import { deleteMintedDesigns } from "./support/minted-designs";
import { runTooSmallUJourney } from "./support/qa-u6-journey";

test.describe("a too-small U, fixed, composed, reloaded and shared (U6 QA, desktop)", () => {
  test.setTimeout(120_000);
  const mintedIds: string[] = [];

  test.afterAll(async () => {
    await deleteMintedDesigns(mintedIds);
  });

  test("1A -> U -> 1B -> 1C for its kitchen -> 1D -> the editor -> reload -> a stranger's share view", async ({
    page,
    browser,
  }) => {
    await runTooSmallUJourney(page, browser, mintedIds);
  });
});
