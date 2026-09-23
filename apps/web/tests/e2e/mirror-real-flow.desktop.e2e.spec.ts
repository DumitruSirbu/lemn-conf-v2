// M7 wave 7I, criterion A17 — the real flow, captured, at 1440 x 900 (desktop). See
// `mirror-real-flow.e2e.spec.ts` for the mobile half and the full claim; both run
// `runMirrorRealFlow` (`support/mirror-flow.ts`).
//
// **Must not run concurrently with any other persistence live run** — see the mobile spec.
import { test } from "@playwright/test";

import { deleteMintedDesigns } from "./support/minted-designs";
import { runMirrorRealFlow } from "./support/mirror-flow";

test.describe("the mirror, through the real flow (7I-A17, desktop)", () => {
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
