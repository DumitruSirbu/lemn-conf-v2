// M7 wave 7I, criterion A17 — the real flow, captured, at 390 x 844 (mobile). The desktop half of
// this criterion is `mirror-real-flow.desktop.e2e.spec.ts`; both run `runMirrorRealFlow`
// (`support/mirror-flow.ts`), so the two viewports are one behavioural contract rather than two
// maintained copies of it.
//
// **Must not run concurrently with any other persistence live run**: this mints two real rows
// (ADR 0006's per-row cleanup obligation applies, and `deleteMintedDesigns` in `afterAll` discharges
// it) against the same test database every other live suite writes to.
import { test } from "@playwright/test";

import { deleteMintedDesigns } from "./support/minted-designs";
import { runMirrorRealFlow } from "./support/mirror-flow";

test.describe("the mirror, through the real flow (7I-A17, mobile)", () => {
  test.setTimeout(240_000);
  const mintedIds: string[] = [];

  test.afterAll(async () => {
    await deleteMintedDesigns(mintedIds);
  });

  test("a right-hand design mirrors its left-hand twin's projection, tap-selects, survives a reload, and its back link and share view agree", async ({
    page,
  }) => {
    await runMirrorRealFlow(page, mintedIds);
  });
});
