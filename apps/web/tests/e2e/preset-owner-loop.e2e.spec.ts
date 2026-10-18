// M8C wave P9, plan criterion P-17 (ADR 0168 exception 4) — the owner's loop at 390 x 844 (mobile). The desktop half is
// `preset-owner-loop.desktop.e2e.spec.ts`; both run `runPresetOwnerLoop` (`support/preset-owner-loop.ts`), which fakes
// the preset repository at the browser and writes no preset row anywhere.
//
// **Must not run concurrently with any other persistence live run**: this mints two real design rows (ADR 0006's
// per-row cleanup obligation applies, and `deleteMintedDesigns` in `afterAll` discharges it).
import { test } from "@playwright/test";

import { deleteMintedDesigns } from "./support/minted-designs";
import { runPresetOwnerLoop } from "./support/preset-owner-loop";

test.describe("the owner's preset loop, against a fake preset repository (M8C P-17, mobile)", () => {
  test.setTimeout(120_000);
  const mintedIds: string[] = [];

  test.afterAll(async () => {
    await deleteMintedDesigns(mintedIds);
  });

  test("generate, save as preset, generate in a room within the window, Preview, Select: the editor opens on a copy carrying the preset's id", async ({
    page,
  }) => {
    await runPresetOwnerLoop(page, mintedIds);
  });
});
