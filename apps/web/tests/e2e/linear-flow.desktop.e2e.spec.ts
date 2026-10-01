// M7 wave 7J, criterion A16 — the straight kitchen's own real flow, at the desktop viewport. See
// `linear-flow.e2e.spec.ts` for the mobile half and `support/linear-flow.ts` for the shared journey
// both run.
//
// **Must not run concurrently with any other persistence live run**: this mints a real row (ADR
// 0006's per-row cleanup obligation applies, and `deleteMintedDesigns` in `afterAll` discharges it)
// against the same test database every other live suite writes to.
import { test } from "@playwright/test";

import { deleteMintedDesigns } from "./support/minted-designs";
import { runLinearFlow } from "./support/linear-flow";

test.describe("the straight kitchen, through the real flow (7J-A16, desktop)", () => {
  test.setTimeout(120_000);
  const mintedIds: string[] = [];

  test.afterAll(async () => {
    await deleteMintedDesigns(mintedIds);
  });

  test("1A -> Liniara -> 1B -> 1D -> 1F -> the editor, with both reloads and the share view", async ({
    page,
  }) => {
    await runLinearFlow(page, mintedIds);
  });
});
