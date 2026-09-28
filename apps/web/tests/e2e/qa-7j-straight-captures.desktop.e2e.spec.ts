// M7 wave 7J QA, A17 at the desktop viewport. See `qa-7j-straight-captures.e2e.spec.ts` for the
// mobile half and `support/qa-7j-straight-captures.ts` for the shared capture set.
import { test } from "@playwright/test";

import { deleteMintedDesigns } from "./support/minted-designs";
import { runStraightCaptureSet } from "./support/qa-7j-straight-captures";

test.describe("7J QA — the straight kitchen's capture set (desktop)", () => {
  test.setTimeout(300_000);
  const mintedIds: string[] = [];

  test.afterAll(async () => {
    await deleteMintedDesigns(mintedIds);
  });

  test("captures every width at both depths and both presets", async ({
    page,
  }) => {
    await runStraightCaptureSet(page, "desktop", mintedIds);
  });
});
