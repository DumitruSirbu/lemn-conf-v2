import { expect, test } from "@playwright/test";

import {
  closeDevControls,
  openDevControls,
  openFridgeColumnView,
  pressDevControl,
  requireInFridgeColumn,
  waitForMintedDesignId,
} from "./support/dev-controls";
import { deleteMintedDesigns } from "./support/minted-designs";

/**
 * M2's mobile picking gate (`docs/milestones/M2-void-engine.md`, "Surfaces"): tapping a body and
 * tapping an empty slot must both select the intended target at 390 x 844 via real touch, and a
 * selected body must be visually distinguishable from a selected void without opening any panel.
 *
 * Coordinates below are pixel positions inside the canvas at the app's default "overview" camera
 * preset, found by tapping the running scene and reading `[data-testid="selection-debug"]` — the
 * one DOM hook this dispatch adds (`configure-screen.tsx`) so a WebGL selection is queryable from
 * outside the canvas. Sensitive to any change in `CAMERA_PRESETS.overview` or the seeded design.
 */

const SINK_CABINET_TAP = { x: 215, y: 500 };
const WALL_CABINET_TAP = { x: 195, y: 165 };
const BACKGROUND_TAP = { x: 195, y: 150 };
const HIGHLIGHT_REGION = { x: 110, y: 380, width: 160, height: 280 };

/** The last case in this file works in the "Perete B" preset instead, where the fridge column is
 *  face on — see `support/dev-controls.ts` for how its pixel constants were found. The void the
 *  fridge leaves behind is the 860 mm base slot of that column, whose id encodes its column and
 *  its floor line. The patch is in page coordinates: the canvas starts 55 px below the header. */
const VACATED_VOID_TAP = { x: 65, y: 560 };
/** Above the column's ceiling line, where nothing stands in this preset. `BACKGROUND_TAP` is an
 *  overview-preset constant and lands on a wall cabinet here. */
const WALL_B_BACKGROUND_TAP = { x: 65, y: 120 };
const VACATED_VOID_ID = "B|2.45:v0:0.00";
const COLUMN_PATCH = { x: 20, y: 555, width: 100, height: 140 };
/** ~30 real taps against a live WebGL scene to find the fridge, plus a command and three
 *  screenshots. */
const VOID_SELECTION_TIMEOUT_MS = 180_000;
async function readSelection(page: import("@playwright/test").Page) {
  return page
    .locator('[data-testid="selection-debug"]')
    .evaluate((element) => ({
      kind: (element as HTMLElement).dataset.selectionKind ?? "",
      id: (element as HTMLElement).dataset.selectionId ?? "",
    }));
}

/** The last case in this file deletes a body, and the first successful command mints a design row.
 *  Deleted afterwards: the suite writes to the test database and leaves it as it found it. */
const mintedDesignIds: string[] = [];

test.afterAll(async () => {
  await deleteMintedDesigns(mintedDesignIds);
});

test.beforeEach(async ({ page }) => {
  await page.goto("/configurator/configure");
  await page.waitForSelector("canvas", { state: "attached" });
  // The scene mounts, seats the camera, and settles its easing before picking is meaningful.
  await page.waitForTimeout(2000);
});

test("tapping a cabinet body selects it and starts with nothing selected", async ({
  page,
}) => {
  expect(await readSelection(page)).toEqual({ kind: "", id: "" });

  await page.tap("canvas", { position: SINK_CABINET_TAP });

  await expect(async () => {
    expect(await readSelection(page)).toEqual({ kind: "placement", id: "p0" });
  }).toPass({ timeout: 2000 });
});

test("tapping a second body moves the selection to it", async ({ page }) => {
  await page.tap("canvas", { position: SINK_CABINET_TAP });
  await expect(async () => {
    const selection = await readSelection(page);
    expect(selection.kind).toBe("placement");
  }).toPass({ timeout: 2000 });
  const first = await readSelection(page);

  await page.tap("canvas", { position: WALL_CABINET_TAP });

  await expect(async () => {
    const second = await readSelection(page);
    expect(second.kind).toBe("placement");
    expect(second.id).not.toBe(first.id);
  }).toPass({ timeout: 2000 });
});

test("tapping empty background deselects", async ({ page }) => {
  await page.tap("canvas", { position: SINK_CABINET_TAP });
  await expect(async () => {
    expect((await readSelection(page)).kind).toBe("placement");
  }).toPass({ timeout: 2000 });

  await page.tap("canvas", { position: BACKGROUND_TAP });

  await expect(async () => {
    expect(await readSelection(page)).toEqual({ kind: "", id: "" });
  }).toPass({ timeout: 2000 });
});

test("a selected body renders a visible highlight distinct from no selection", async ({
  page,
}) => {
  const before = await page.screenshot({ clip: HIGHLIGHT_REGION });

  await page.tap("canvas", { position: SINK_CABINET_TAP });
  await expect(async () => {
    expect((await readSelection(page)).kind).toBe("placement");
  }).toPass({ timeout: 2000 });
  // Let the BoxHelper's frame render before capturing.
  await page.waitForTimeout(200);

  const after = await page.screenshot({ clip: HIGHLIGHT_REGION });

  expect(Buffer.compare(before, after)).not.toBe(0);
});

/**
 * M2's leftover, claimed by M3 work item 12.
 *
 * This case was a named `test.skip` for the whole of M2: `KITCHEN_L_DESIGN` is fully occupied by
 * construction, so `recomputeVoids()` returned `[]` and there was no void anywhere in the running
 * app for a real tap to land on. M3 is the first milestone that can create one, so the case is
 * verifiable now — the delete below is what makes the void that the tap then selects.
 *
 * The delete is driven through `TemporaryDevControls` (M3 work item 11); the panel is **closed**
 * for every tap and every screenshot, so nothing here depends on a panel being open.
 *
 * What the screenshots prove: the same 100 x 140 px patch of the same post-delete scene is
 * captured twice, unselected and then selected, so the only thing that differs between them is
 * the selection — and they differ. Selecting a void is visible on the canvas alone.
 *
 * What no assertion here proves is how a selected void differs from a selected *body*; two
 * captures either side of a delete would differ whether or not selection rendering worked at all,
 * so that assertion is deliberately absent rather than written weakly. That half was checked by
 * eye on captures taken while writing this: a selected void is the translucent blue box with
 * dashed edges of `void-mesh.ts` inside the yellow selection frame, an unselected void is the
 * same box without that frame, and a selected body is opaque cabinetry inside it.
 */
test("tapping an empty void slot selects it, and the selection is visible on the canvas", async ({
  page,
}) => {
  test.setTimeout(VOID_SELECTION_TIMEOUT_MS);

  await openFridgeColumnView(page);
  await openDevControls(page);
  const fridge = await requireInFridgeColumn(page, {
    matches: (readout) => readout.selectionId === "p7",
    description: "the seeded fridge, p7",
  });
  expect(fridge.metaKind).toBe("fridge_freestanding");

  await pressDevControl(page, "dev-remove");
  // The mutation mints a design row. Registered for deletion before it is asserted on: a slow
  // mint must fail loudly without also leaking its row into the test database.
  const designId = await waitForMintedDesignId(page);
  if (designId) mintedDesignIds.push(designId);
  expect(designId).not.toBe("");
  await closeDevControls(page);

  // The remove leaves the vacated void selected. Deselect first, so what the tap below proves is
  // the tap and not the command that preceded it.
  await page.tap("canvas", { position: WALL_B_BACKGROUND_TAP });
  await expect(async () => {
    expect(await readSelection(page)).toEqual({ kind: "", id: "" });
  }).toPass({ timeout: 2000 });
  const voidUnselected = await page.screenshot({ clip: COLUMN_PATCH });

  await page.tap("canvas", { position: VACATED_VOID_TAP });

  await expect(async () => {
    expect(await readSelection(page)).toEqual({
      kind: "void",
      id: VACATED_VOID_ID,
    });
  }).toPass({ timeout: 2000 });
  // Let the BoxHelper's frame render before capturing.
  await page.waitForTimeout(200);
  const voidSelected = await page.screenshot({ clip: COLUMN_PATCH });

  expect(Buffer.compare(voidSelected, voidUnselected)).not.toBe(0);
});
