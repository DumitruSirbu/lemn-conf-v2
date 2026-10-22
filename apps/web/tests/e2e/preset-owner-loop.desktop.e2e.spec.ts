// M8C wave P9, plan criterion P-17 (ADR 0168 exception 4) — the owner's loop at 1440 x 900 (desktop). The mobile half is
// `preset-owner-loop.e2e.spec.ts`; both run `runPresetOwnerLoop` (`support/preset-owner-loop.ts`), which fakes
// the preset repository at the browser and writes no preset row anywhere. The person is a signed-in administrator: only
// a session holding `preset.create` is offered the button (ADR 0172 decision 7, L3-A1).
//
// **Must not run concurrently with any other persistence live run**: this mints two real design rows (ADR 0006's
// per-row cleanup obligation applies, and `deleteMintedDesigns` in `afterAll` discharges it).
import { expect, test } from "@playwright/test";

import { deleteMintedDesigns } from "./support/minted-designs";
import { runPresetOwnerLoop } from "./support/preset-owner-loop";
import {
  NOTHING_LEFT,
  plantSignedInAdministrator,
  removeSignedInAdministrator,
  signIn,
  type SignedInAdministrator,
} from "./support/staff-world";

test.describe("the owner's preset loop, against a fake preset repository (M8C P-17, desktop)", () => {
  test.setTimeout(120_000);
  const mintedIds: string[] = [];
  let author: SignedInAdministrator;

  test.beforeAll(async () => {
    author = await plantSignedInAdministrator();
  });

  test.afterAll(async () => {
    await deleteMintedDesigns(mintedIds);
    expect(await removeSignedInAdministrator(author)).toEqual(NOTHING_LEFT);
  });

  test("generate, save as preset, generate in a room within the window, Preview, Select: the editor opens on a copy carrying the preset's id", async ({
    context,
    page,
  }) => {
    await signIn(context, author.administrator);
    await runPresetOwnerLoop(page, mintedIds);
  });
});
