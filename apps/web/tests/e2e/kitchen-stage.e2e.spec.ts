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

// Tap targets are canvas pixel positions at the default overview preset, found by tapping the running scene and
// reading `selection-debug`; they move with `CAMERA_PRESETS.overview` and the seeded design. §9's sheet covers the
// bottom ~78 dvh once anything is selected, so every canvas tap below is preceded by a dismissal (§10).

/** In the coordinates of the 390 × 697 canvas they were found on, converted by `tapCanvas` (`support/canvas-taps.ts`).
 *  Found by tapping, never computed from the camera: computing them would make the tests agree with it by
 *  construction. This one selects `p17`; `SINK_CABINET_TAP` (`p0`) is imported from `support/canvas-taps.ts`. */
const WALL_CABINET_TAP = { x: 230, y: 110 };
/** Background in the overview preset above the sheet, so it can be tapped while a body is selected. Only its `x` is
 *  used: the strip above a sheet pinned at 78 dvh shrinks faster than the canvas, so a converted `y` would land on
 *  the sheet. */
const BACKGROUND_ABOVE_SHEET_TAP = { x: 310, y: 100 };

/** The last case works in the *Perete B* preset, where the fridge column is face on (`support/panel.ts`); the vacated
 *  860 mm base slot's id encodes its column and floor line. Canvas coordinates, converted like the two above. */
const VACATED_VOID_TAP = { x: 65, y: 560 };
/** Empty scene to the right of the last column in the *Perete B* preset; `BACKGROUND_ABOVE_SHEET_TAP` is an overview
 *  constant and means nothing here. */
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

/** The delete goes through §9's footer control (`panel-remove`) and makes the void the tap then selects, since
 *  `KITCHEN_L_DESIGN` is fully occupied. The screenshot half is on desktop (`editor-rail.desktop.e2e.spec.ts`): at
 *  390 x 844 the sheet covers the patch the moment the void is selected. */
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
  // `waitForFirstSave` throws unless the stored revision moved past the seeded one, so nothing is left to check.
  await waitForFirstSave(page, seededDesign);

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
