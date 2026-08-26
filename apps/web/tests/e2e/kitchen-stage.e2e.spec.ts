import { expect, test } from "@playwright/test";

import {
  dismissPanel,
  openFridgeColumnView,
  pressPanelControl,
  readSelection,
  requireInFridgeColumn,
  waitForMintedDesignId,
} from "./support/panel";
import { deleteMintedDesigns } from "./support/minted-designs";

/**
 * M2's mobile picking gate (`docs/milestones/M2-void-engine.md`, "Surfaces"): tapping a body and
 * tapping an empty slot must both select the intended target at 390 x 844 via real touch, and a
 * selected body must be visually distinguishable from a selected void without opening any panel.
 *
 * Coordinates below are pixel positions inside the canvas at the app's default "overview" camera
 * preset, found by tapping the running scene and reading `[data-testid="selection-debug"]` — the
 * one DOM hook the app renders (`selection-debug.tsx`) so a WebGL selection is queryable from
 * outside the canvas. Sensitive to any change in `CAMERA_PRESETS.overview` or the seeded design.
 *
 * **What changed in M4, and why every canvas tap below is preceded by a dismissal.** M3 had no
 * panel, so a selection left the whole canvas tappable. §9's sheet covers the bottom ~78 dvh of a
 * 390 x 844 viewport the moment anything is selected, and the ~130 px of scene left above it is
 * empty room in both camera presets — measured, not assumed (`PANEL_TOP_IN_CANVAS_Y`). So on this
 * viewport a second body cannot be tapped while the first is selected. That is §10's viewing model
 * rather than an obstacle to work around: the customer dismisses the sheet to look at the scene.
 */

const SINK_CABINET_TAP = { x: 215, y: 500 };
const WALL_CABINET_TAP = { x: 195, y: 165 };
/** Background in the overview preset that is **above** the sheet, so it can be tapped while a body
 *  is selected. M3's background constant, (195, 150), cannot be: it sits below the sheet's top
 *  edge, which at this viewport is canvas y ≈ 131. */
const BACKGROUND_ABOVE_SHEET_TAP = { x: 310, y: 100 };
const HIGHLIGHT_REGION = { x: 110, y: 380, width: 160, height: 280 };

/** The last case in this file works in the "Perete B" preset instead, where the fridge column is
 *  face on — see `support/panel.ts` for how its pixel constants were found. The void the fridge
 *  leaves behind is the 860 mm base slot of that column, whose id encodes its column and its floor
 *  line. The patch is in page coordinates: the canvas starts 55 px below the header. */
const VACATED_VOID_TAP = { x: 65, y: 560 };
/** Above the column's ceiling line, where nothing stands in this preset.
 *  `BACKGROUND_ABOVE_SHEET_TAP` is an overview-preset constant and means nothing here. */
const WALL_B_BACKGROUND_TAP = { x: 65, y: 120 };
const VACATED_VOID_ID = "B|2.45:v0:0.00";
/** ~30 real taps against a live WebGL scene to find the fridge, plus a command and three
 *  screenshots. */
const VOID_SELECTION_TIMEOUT_MS = 240_000;

const NOTHING_SELECTED = { kind: "", id: "" };

async function readTarget(page: import("@playwright/test").Page) {
  const { selectionKind, selectionId } = await readSelection(page);
  return { kind: selectionKind, id: selectionId };
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
  expect(await readTarget(page)).toEqual(NOTHING_SELECTED);

  await page.tap("canvas", { position: SINK_CABINET_TAP });

  await expect(async () => {
    expect(await readTarget(page)).toEqual({ kind: "placement", id: "p0" });
  }).toPass({ timeout: 2000 });
});

test("tapping a second body moves the selection to it", async ({ page }) => {
  await page.tap("canvas", { position: SINK_CABINET_TAP });
  await expect(async () => {
    expect((await readTarget(page)).kind).toBe("placement");
  }).toPass({ timeout: 2000 });
  const first = await readTarget(page);

  // §10's loop: the sheet is dismissed to reach the scene, then the next body is tapped.
  await dismissPanel(page);
  await page.tap("canvas", { position: WALL_CABINET_TAP });

  await expect(async () => {
    const second = await readTarget(page);
    expect(second.kind).toBe("placement");
    expect(second.id).not.toBe(first.id);
  }).toPass({ timeout: 2000 });
});

/** Tapped **while the body is still selected**, and above the sheet rather than through it, so
 *  what this proves is the canvas deselecting and not the sheet's × doing it. */
test("tapping empty background deselects", async ({ page }) => {
  await page.tap("canvas", { position: SINK_CABINET_TAP });
  await expect(async () => {
    expect((await readTarget(page)).kind).toBe("placement");
  }).toPass({ timeout: 2000 });

  await page.tap("canvas", { position: BACKGROUND_ABOVE_SHEET_TAP });

  await expect(async () => {
    expect(await readTarget(page)).toEqual(NOTHING_SELECTED);
  }).toPass({ timeout: 2000 });
  await expect(page.getByTestId("editor-panel")).toHaveCount(0);
});

/**
 * M2's highlight gate, **re-scoped by M4 and no longer proven at 390 x 844.**
 *
 * The original captured the same 160 x 280 px patch of scene unselected and then selected, and the
 * only difference between them was the selection frame. At this viewport that patch is now behind
 * §9's sheet, so the two captures would differ because a sheet appeared — an assertion that would
 * pass with selection rendering entirely broken. Weakening it to that is not an option, and there
 * is no patch of scene left to move it to: the strip above the sheet is empty room in both camera
 * presets.
 *
 * So it runs on desktop, where the rail takes its own space and the whole scene stays visible —
 * `editor-rail.desktop.e2e.spec.ts`. What is no longer covered anywhere is the highlight *at the
 * mobile viewport*; the selection itself still is, by the three cases above.
 */
test.skip("a selected body renders a visible highlight distinct from no selection", async ({
  page,
}) => {
  const before = await page.screenshot({ clip: HIGHLIGHT_REGION });
  await page.tap("canvas", { position: SINK_CABINET_TAP });
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
 * The delete is driven through §9's own footer control (`panel-remove`), which is what replaced
 * M3's dev panel here.
 *
 * **The screenshot half moved to desktop.** M3 captured the same 100 x 140 px patch of scene with
 * the void unselected and then selected, and the only difference between the two was the selection
 * frame. At 390 x 844 that patch is now behind §9's sheet, which opens the moment the void is
 * selected — the two captures would differ because a sheet appeared, which would pass with void
 * selection rendering entirely broken. It is asserted where the scene is still visible beside the
 * panel instead: `editor-rail.desktop.e2e.spec.ts`. What this case keeps is M2's gate proper —
 * that a real touch at 390 x 844 selects the intended empty slot.
 */
test("tapping an empty void slot selects it at 390 x 844", async ({ page }) => {
  test.setTimeout(VOID_SELECTION_TIMEOUT_MS);

  await openFridgeColumnView(page);
  const fridge = await requireInFridgeColumn(page, {
    matches: (readout) => readout.selectionId === "p7",
    description: "the seeded fridge, p7",
  });
  expect(fridge.metaKind).toBe("fridge_freestanding");

  await pressPanelControl(page, "panel-remove");
  // The mutation mints a design row. Registered for deletion before it is asserted on: a slow
  // mint must fail loudly without also leaking its row into the test database.
  const designId = await waitForMintedDesignId(page);
  if (designId) mintedDesignIds.push(designId);
  expect(designId).not.toBe("");

  // The remove leaves the vacated void selected. Deselect first, so what the tap below proves is
  // the tap and not the command that preceded it — and so the sheet is off the scene.
  await dismissPanel(page);
  await page.tap("canvas", { position: WALL_B_BACKGROUND_TAP });
  await expect(async () => {
    expect(await readTarget(page)).toEqual(NOTHING_SELECTED);
  }).toPass({ timeout: 2000 });

  await page.tap("canvas", { position: VACATED_VOID_TAP });

  await expect(async () => {
    expect(await readTarget(page)).toEqual({
      kind: "void",
      id: VACATED_VOID_ID,
    });
  }).toPass({ timeout: 2000 });
});
