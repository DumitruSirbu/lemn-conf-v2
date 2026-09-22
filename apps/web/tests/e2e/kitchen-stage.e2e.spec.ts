import { expect } from "@playwright/test";

import {
  dismissPanel,
  openFridgeColumnView,
  pressPanelControl,
  readSelection,
  requireInFridgeColumn,
  waitForFirstSave,
} from "./support/panel";
import {
  SINK_CABINET_TAP,
  tapCanvas,
  tapSceneStripAboveSheet,
} from "./support/canvas-taps";
import { openSeededDesign, test } from "./support/seeded-design";

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

/** **In the coordinates of the canvas they were found on** — 390 × 697 — and converted to the
 *  canvas in front of the browser by `tapCanvas`. `support/canvas-taps.ts` carries the conversion
 *  and the measurements behind it. They are left as the numbers that were measured rather than
 *  re-typed for today's chrome: this is the second time a band added above the stage has moved them,
 *  and a constant silently re-typed each time stops being a measurement of anything.
 *
 *  **Re-measured 2026-09-16, and this time it was not a band above the stage — it was the camera.**
 *  Wave 7H made the three camera presets a function of the customer's room, so *Vedere generală*
 *  moved from the reference triple to the room's own and every world point took a different pixel:
 *  the seeded bodies shifted 36–49 px right and about 22 px up on this canvas, which put p2 off the
 *  right edge entirely. Twenty-eight e2e specs failed on it.
 *
 *  **Re-found by tapping, never computed.** A grid of real taps was walked across the running scene
 *  and the selected id read back out of `[data-testid="selection-debug"]`, exactly as the originals
 *  were found; both sit in the middle of their body's region in that map — `SINK_CABINET_TAP` on
 *  `p0`, `WALL_CABINET_TAP` on `p17` — and each was then confirmed by a single tap. Computing them from the new projection would have made these
 *  tests agree with the camera by construction — a wrong camera would have produced matching wrong
 *  constants and the suite would have gone green while testing nothing.
 *
 *  `SINK_CABINET_TAP` is **imported** rather than declared: four specs needed it and all four went
 *  stale together, so `support/canvas-taps.ts` holds it now. `WALL_CABINET_TAP` stays here because
 *  this file is its only user. */
const WALL_CABINET_TAP = { x: 230, y: 110 }; // was (195, 165); re-tapped, selects p17
/** Background in the overview preset that is **above** the sheet, so it can be tapped while a body
 *  is selected. M3's background constant, (195, 150), cannot be: it sits below the sheet's top edge.
 *
 *  **Only its `x` is used**, and that is the one constant here that is derived rather than
 *  converted. The strip above the sheet is not a piece of the scene — it is the gap between the
 *  canvas's top and a sheet pinned to the viewport at 78 dvh — so it shrinks faster than the canvas:
 *  130.68 px before wave 6G's band, **83.75 px** after. Converting this point's `y` gives 93.3,
 *  which is *below* the new edge and would land the tap on the sheet. */
const BACKGROUND_ABOVE_SHEET_TAP = { x: 310, y: 100 };
/** **Page** coordinates, for a screenshot clip rather than a tap — and therefore *not* converted by
 *  `tapCanvas`, which speaks canvas coordinates. The only case that reads it is skipped, so it has
 *  not moved with wave 6G's band and would need `atThisCanvas` plus the canvas's own origin the day
 *  that case is unskipped. */
const HIGHLIGHT_REGION = { x: 110, y: 380, width: 160, height: 280 };

/** The last case in this file works in the "Perete B" preset instead, where the fridge column is
 *  face on — see `support/panel.ts` for how its pixel constants were found. The void the fridge
 *  leaves behind is the 860 mm base slot of that column, whose id encodes its column and its floor
 *  line. Canvas coordinates on the reference canvas, like the two above, and converted the same way. */
const VACATED_VOID_TAP = { x: 65, y: 560 };
/** Empty scene in the *Perete B* preset. `BACKGROUND_ABOVE_SHEET_TAP` is an overview-preset
 *  constant and means nothing here.
 *
 *  **Re-measured 2026-09-16: (65, 120) → (370, 320).** Wave 7H's room-driven *Perete B* moved the
 *  columns across the canvas and (65, 120) now lands on `p23`. It is no longer *above* the ceiling
 *  line — the scan found no empty scene left up there at this preset — but to the right of the
 *  last column, which is the empty region this preset still has. Re-found by tapping the running
 *  scene, and empty at every y the scan sampled around it. */
const WALL_B_BACKGROUND_TAP = { x: 370, y: 320 };
const VACATED_VOID_ID = "B|2.45:v0:0.00";
/** ~30 real taps against a live WebGL scene to find the fridge, plus a command and three
 *  screenshots. */
const VOID_SELECTION_TIMEOUT_MS = 240_000;

const NOTHING_SELECTED = { kind: "", id: "" };

async function readTarget(page: import("@playwright/test").Page) {
  const { selectionKind, selectionId } = await readSelection(page);
  return { kind: selectionKind, id: selectionId };
}

test.beforeEach(async ({ page, seededDesign }) => {
  await openSeededDesign(page, seededDesign);
  // The scene mounts, seats the camera, and settles its easing before picking is meaningful.
  await page.waitForTimeout(2000);
});

test("tapping a cabinet body selects it and starts with nothing selected", async ({
  page,
}) => {
  expect(await readTarget(page)).toEqual(NOTHING_SELECTED);

  await tapCanvas(page, SINK_CABINET_TAP);

  await expect(async () => {
    expect(await readTarget(page)).toEqual({ kind: "placement", id: "p0" });
  }).toPass({ timeout: 2000 });
});

test("tapping a second body moves the selection to it", async ({ page }) => {
  await tapCanvas(page, SINK_CABINET_TAP);
  await expect(async () => {
    expect((await readTarget(page)).kind).toBe("placement");
  }).toPass({ timeout: 2000 });
  const first = await readTarget(page);

  // §10's loop: the sheet is dismissed to reach the scene, then the next body is tapped.
  await dismissPanel(page);
  await tapCanvas(page, WALL_CABINET_TAP);

  await expect(async () => {
    const second = await readTarget(page);
    expect(second.kind).toBe("placement");
    expect(second.id).not.toBe(first.id);
  }).toPass({ timeout: 2000 });
});

/** Tapped **while the body is still selected**, and above the sheet rather than through it, so
 *  what this proves is the canvas deselecting and not the sheet's × doing it. */
test("tapping empty background deselects", async ({ page }) => {
  await tapCanvas(page, SINK_CABINET_TAP);
  await expect(async () => {
    expect((await readTarget(page)).kind).toBe("placement");
  }).toPass({ timeout: 2000 });

  await tapSceneStripAboveSheet(page, BACKGROUND_ABOVE_SHEET_TAP);

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
  await tapCanvas(page, SINK_CABINET_TAP);
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
test("tapping an empty void slot selects it at 390 x 844", async ({
  page,
  seededDesign,
}) => {
  test.setTimeout(VOID_SELECTION_TIMEOUT_MS);

  await openFridgeColumnView(page, seededDesign);
  const fridge = await requireInFridgeColumn(page, {
    matches: (readout) => readout.selectionId === "p7",
    description: "the seeded fridge, p7",
  });
  expect(fridge.metaKind).toBe("fridge_freestanding");

  await pressPanelControl(page, "panel-remove");
  // The mutation writes rather than mints (wave 7E4 G4): the id is the fixture's own, and this
  // is the stronger claim that the removal actually landed.
  const savedRevision = await waitForFirstSave(page, seededDesign);
  expect(savedRevision).not.toBe(seededDesign.revision);

  // The remove leaves the vacated void selected. Deselect first, so what the tap below proves is
  // the tap and not the command that preceded it — and so the sheet is off the scene.
  await dismissPanel(page);
  await tapCanvas(page, WALL_B_BACKGROUND_TAP);
  await expect(async () => {
    expect(await readTarget(page)).toEqual(NOTHING_SELECTED);
  }).toPass({ timeout: 2000 });

  await tapCanvas(page, VACATED_VOID_TAP);

  await expect(async () => {
    expect(await readTarget(page)).toEqual({
      kind: "void",
      id: VACATED_VOID_ID,
    });
  }).toPass({ timeout: 2000 });
});
