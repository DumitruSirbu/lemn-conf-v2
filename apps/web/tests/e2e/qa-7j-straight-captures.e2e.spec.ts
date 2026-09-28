// M7 wave 7J QA, A17 at the mobile viewport: 1200, 3700 (the owner's own witness, ADR 0130's G7)
// and 6000 mm x overview/wallA x 600/700 mm depth, captured outside the watched tree; zero page
// errors. Mints three rows and deletes them (ADR 0006) — never run concurrently with the
// persistence live suite.
import { test } from "@playwright/test";

import { deleteMintedDesigns } from "./support/minted-designs";
import { runStraightCaptureSet } from "./support/qa-7j-straight-captures";

test.describe("7J QA — the straight kitchen's capture set (mobile)", () => {
  test.setTimeout(300_000);
  const mintedIds: string[] = [];

  test.afterAll(async () => {
    await deleteMintedDesigns(mintedIds);
  });

  test("captures every width at both depths and both presets", async ({
    page,
  }) => {
    await runStraightCaptureSet(page, "mobile", mintedIds);
  });
});
