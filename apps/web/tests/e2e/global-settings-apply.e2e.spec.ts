import { expect, type Page } from "@playwright/test";

import {
  expectWriteAccessApplied,
  FIRST_FRAME_FREEZE_TIMEOUT_MS,
  openSeededDesign,
  test,
  type SeededDesign,
} from "./support/seeded-design";

/**
 * **What one press of *Aplică* does** — M6-AUD-012's recovery and M6-AUD-004's atomicity, measured
 * on the surface rather than at the store.
 *
 * Both defects were invisible from inside the sheet, and for the same structural reason: the sheet
 * closed. M6-AUD-012's press exited as "unchanged" and closed; M6-AUD-004's committed one half,
 * refused the other, and closed on the half it kept. So the assertions here are as much about the
 * sheet **staying open** as about what the document holds afterwards.
 *
 * **A withdrawn tier is recovered in the replacement sheet, not in this one.** Since Q3a a stored
 * tier id the book does not hold is `REPLACEMENT_REQUIRED`, and the customer meets the modal
 * replacement sheet (frames C4A-C4D) before the settings sheet can be reached: the settings sheet is
 * inert behind it. The settings sheet's own half of M6-AUD-012 (an applied press on a displayed
 * fallback) is no longer reachable from a browser, and is held by
 * `tests/settings/withdrawn-tier-recovery.test.ts`. What a browser can still show, and what the
 * recovery test below keeps, is the document: the choice is written, survives a reload, and is the
 * tier the settings sheet then paints as checked. `replacement-sheet.e2e.spec.ts` owns the sheet's
 * journey; this file adds the hardware group and the stored-document reading.
 *
 * **The withdrawn tier is written through the real authenticated API**, which is how the audit's own
 * witness produced it: `materialTierId: "material.withdrawn"` is schema-valid, so a document can
 * genuinely arrive in this state after a price-book edit. The reload is the point — a store that
 * merely *displayed* the choice would pass a same-session assertion and fail this one.
 *
 * Rows minted here are deleted afterwards — ADR 0006.
 */

const WITHDRAWN_MATERIAL_TIER_ID = "material.withdrawn";
const WITHDRAWN_HARDWARE_TIER_ID = "hardware.withdrawn";

/** The tiers the seeded price book holds, which the replacement sheet may offer. */
const HELD_TIER_IDS = {
  material: ["material.melamine", "material.painted-mdf", "material.veneer"],
  hardware: ["hardware.standard", "hardware.soft-close", "hardware.premium"],
} as const;

/** `openSeededDesign` waits for the trigger to be enabled, not for the price figure — a check taken
 *  the instant it returns can still race the price bar's own mount (review round 1, R1.2). */
const SCENE_SETTLE_MS = 2000;

interface StoredSettings {
  readonly materialTierId: string;
  readonly hardwareTierId: string;
  readonly cabinetDepth: string;
  readonly updatedAt: string;
}

async function storedSettings(page: Page): Promise<StoredSettings> {
  return page.getByTestId("selection-debug").evaluate((element) => ({
    materialTierId: element.getAttribute("data-material-tier") ?? "",
    hardwareTierId: element.getAttribute("data-hardware-tier") ?? "",
    cabinetDepth: element.getAttribute("data-cabinet-depth") ?? "",
    updatedAt: element.getAttribute("data-updated-at") ?? "",
  }));
}

/** Writes whole-kitchen settings onto the seeded design through the same route the client uses, so
 *  the document under test is one the server actually accepted. */
async function wearSettings(
  page: Page,
  seededDesign: SeededDesign,
  settings: Record<string, string>,
): Promise<void> {
  const status = await page.evaluate(
    async ({ id, chosen }) => {
      const loaded = await fetch(`/api/designs/${id}`);
      const { design, revision } = (await loaded.json()) as {
        design: Record<string, unknown>;
        revision: string;
      };
      const written = await fetch(`/api/designs/${id}`, {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-expected-revision": revision,
        },
        body: JSON.stringify({
          ...design,
          settings: { ...(design.settings as object), ...chosen },
        }),
      });
      return written.status;
    },
    { id: seededDesign.id, chosen: settings },
  );
  expect(status).toBe(200);
}

async function openSheet(page: Page): Promise<void> {
  await expectWriteAccessApplied(page);
  await page.getByTestId("global-settings-trigger").tap();
  await expect(page.getByTestId("global-settings-surface")).toBeVisible();
}

/** A new kitchen is stamped with a whole-kitchen colour (R4b3), so changing its material asks to give the colour up
 *  first; the change is applied only once the question is confirmed. */
async function applyMaterialChangeAndAwaitSave(
  page: Page,
  seededDesign: SeededDesign,
): Promise<void> {
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === `/api/designs/${seededDesign.id}`,
  );
  await page.getByTestId("global-settings-apply").tap();
  await page.getByTestId("global-settings-confirm").tap();
  await expect(page.getByTestId("global-settings-surface")).toHaveCount(0);
  expect((await saved).status()).toBe(200);
}

/** The tier id the sheet paints as checked in a group, read off the rendered radios rather than off
 *  the model — the whole defect was the two disagreeing. */
async function displayedTierIn(
  page: Page,
  group: "material" | "hardware",
): Promise<string> {
  const checked = page
    .getByTestId("global-settings-group")
    .nth(group === "material" ? 0 : 1)
    .locator('input[type="radio"]:checked');
  await expect(checked).toHaveCount(1);
  return (await checked.getAttribute("value")) ?? "";
}

for (const group of ["material", "hardware"] as const) {
  const withdrawnTierId =
    group === "material"
      ? WITHDRAWN_MATERIAL_TIER_ID
      : WITHDRAWN_HARDWARE_TIER_ID;
  const settingKey = group === "material" ? "materialTierId" : "hardwareTierId";

  const otherSettingKey =
    group === "material" ? "hardwareTierId" : "materialTierId";

  test(`recovers a withdrawn ${group} tier by choosing in the replacement sheet, and the document keeps the choice`, async ({
    page,
    seededDesign,
  }) => {
    await wearSettings(page, seededDesign, { [settingKey]: withdrawnTierId });
    await openSeededDesign(page, seededDesign);
    const kitchenBefore = await storedSettings(page);

    // The state the recovery is for: the document cannot be priced, so the bar shows no figure, and the modal
    // sheet is up owing exactly the one row.
    const sheet = page.getByTestId("replacement-sheet");
    await expect(sheet).toBeVisible({ timeout: FIRST_FRAME_FREEZE_TIMEOUT_MS });
    await expect(page.getByTestId("price-bar-total")).toHaveCount(0);
    await expect(page.getByTestId("replacement-choose")).toHaveCount(1);

    // The response is what a reload must wait for: a reload taken before the `PUT` answers aborts it.
    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        new URL(response.url()).pathname === `/api/designs/${seededDesign.id}`,
    );
    await page.getByTestId("replacement-choose").tap();
    await expect(page.getByTestId("replacement-apply")).toBeDisabled();
    await page.locator("[data-option]:not([disabled])").first().tap();
    await page.getByTestId("replacement-apply").tap();
    expect((await saved).status()).toBe(200);
    await expect(sheet).toHaveCount(0);
    await expect(page.getByTestId("price-bar-total")).toBeVisible();

    // The reload is what makes this about the document rather than about the store's memory.
    await openSeededDesign(page, seededDesign);
    await page.waitForTimeout(SCENE_SETTLE_MS);
    await expect(page.getByTestId("replacement-sheet")).toHaveCount(0);
    await expect(page.getByTestId("price-bar-total")).toBeVisible();
    const stored = await storedSettings(page);
    expect(stored[settingKey]).not.toBe(withdrawnTierId);
    expect(HELD_TIER_IDS[group]).toContain(stored[settingKey]);
    // Choosing for one row leaves the other group as it was.
    expect(stored[otherSettingKey]).toBe(kitchenBefore[otherSettingKey]);

    // The settings sheet, reachable again, paints the stored tier as checked: the display and the document agree.
    await openSheet(page);
    expect(await displayedTierIn(page, group)).toBe(stored[settingKey]);
  });
}

test("commits a material and a depth in one press, as one write", async ({
  page,
  seededDesign,
}) => {
  // The commit half of M6-AUD-004's contract, which *is* reachable in a browser: two settings in one
  // press, one document afterwards, and both changes in it. The refusal half is below.
  await openSeededDesign(page, seededDesign);
  await page.waitForTimeout(SCENE_SETTLE_MS);

  const before = await storedSettings(page);
  await openSheet(page);

  await page
    .getByTestId("global-settings-group")
    .first()
    .getByRole("radio")
    .last()
    .tap();
  await page
    .getByTestId("global-settings-depth-option")
    .locator("input:not(:checked)")
    .first()
    .tap();
  await applyMaterialChangeAndAwaitSave(page, seededDesign);

  await openSeededDesign(page, seededDesign);
  await page.waitForTimeout(SCENE_SETTLE_MS);
  const after = await storedSettings(page);
  expect(after.materialTierId).not.toBe(before.materialTierId);
  expect(after.cabinetDepth).not.toBe(before.cabinetDepth);
});
