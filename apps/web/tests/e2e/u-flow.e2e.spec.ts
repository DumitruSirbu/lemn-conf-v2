// M7B wave U6 S1 (AC2's dated line) — the U's real flow, at 390 x 844 (mobile). The desktop half is
// `u-flow.desktop.e2e.spec.ts`; both run `runUFlow` (`support/u-flow.ts`), so the two viewports are one
// behavioural contract rather than two maintained copies of it.
//
// **Must not run concurrently with any other persistence live run**: this mints a real row (ADR
// 0006's per-row cleanup obligation applies, and `deleteMintedDesigns` in `afterAll` discharges it)
// against the same test database every other live suite writes to.
import { test } from "@playwright/test";

import { deleteMintedDesigns } from "./support/minted-designs";
import { runUFlow } from "./support/u-flow";

test.describe("the U, through the real flow (U6 S1, mobile)", () => {
  test.setTimeout(120_000);
  const mintedIds: string[] = [];

  test.afterAll(async () => {
    await deleteMintedDesigns(mintedIds);
  });

  test("1A -> the U card -> 1B -> 1D -> 1F -> the editor, with both reloads and the back link", async ({
    page,
  }) => {
    await runUFlow(page, mintedIds);
  });
});
