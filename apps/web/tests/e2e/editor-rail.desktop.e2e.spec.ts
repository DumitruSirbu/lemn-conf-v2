import { SELECTION_HIGHLIGHT_COLOR } from "@lemnaria/three-adapter";
import { expect, test, type Page } from "@playwright/test";

import { countPixels, toRgb, type PixelRect } from "./support/pixels";
import { readSelection } from "./support/panel";
import { deleteMintedDesigns } from "./support/minted-designs";

/**
 * M4's desktop line (`docs/milestones/M4-editor-surface.md`, "Surfaces" — Desktop): frames D2A and
 * D2B at 1440 × 900, where §9's panel is a 420 px right rail the scene re-lays out beside instead
 * of a sheet drawn over it. Same section components as mobile; the branch is the shell only, and
 * it is a CSS media query rather than a React one.
 *
 * This file also carries the two **visual** assertions that no longer have anywhere to stand at
 * 390 × 844. A selected body's highlight and a selected void's highlight were captured on mobile
 * until M4; §9's sheet now covers the scene the moment either is selected, and the strip left above
 * it is empty room in both camera presets — so the two captures would differ because a sheet
 * appeared, which is an assertion that passes with selection rendering entirely broken. Here the
 * scene is visible beside the panel, so both captures are taken **with the panel open**, at one
 * canvas size and one camera, and the only thing that differs between them is what is selected.
 *
 * Coordinates are **page** pixels found by clicking the running scene and reading
 * `[data-testid="selection-debug"]`, and there are two sets, because the scene is 1440 px wide with
 * nothing selected and 1020 px wide once the rail takes its space — the same world point is not the
 * same pixel in the two states.
 */

const SINK_CABINET_FULL_WIDTH = { x: 700, y: 560 };
/** The same scene once the rail has taken its 420 px and the world has re-projected into 1020 px:
 *  a base cabinet well clear of the patches below, and the fridge column. */
const FAR_BASE_CABINET = { x: 700, y: 560 };
const FRIDGE = { x: 200, y: 500 };

const VIEWPORT_WIDTH_PX = 1440;
const RAIL_WIDTH_PX = 420;
const SCENE_WIDTH_WITH_RAIL_PX = VIEWPORT_WIDTH_PX - RAIL_WIDTH_PX;

/** The milestone's desktop spacing scale: rows 52–70 px, chips on the same larger scale. */
const MIN_ROW_HEIGHT_PX = 52;
const MAX_ROW_HEIGHT_PX = 70;
const MIN_CHIP_HEIGHT_PX = 52;

/** Patches of **page** pixels around the two bodies under test; the canvas starts 55 px down. */
const SINK_PATCH: PixelRect = { x: 420, y: 520, width: 180, height: 180 };
/** The opening the fridge leaves behind, once §5.1 has selected it. Found the same way as the tap
 *  coordinates: by removing the fridge in the running app and reading where the vacated slot
 *  projects with the rail open. */
const VACATED_FRIDGE_PATCH: PixelRect = {
  x: 20,
  y: 560,
  width: 240,
  height: 280,
};

/**
 * The thresholds below are measured, not chosen. Captured at 1440 x 900 in the overview preset on
 * 2026-08-26, counting pixels within `HIGHLIGHT_TOLERANCE` of `SELECTION_HIGHLIGHT_COLOR`:
 *
 * | state                                   | sink patch | vacated-fridge patch |
 * | --------------------------------------- | ---------- | -------------------- |
 * | nothing selected                        |          0 |                    0 |
 * | sink cabinet selected                   |      3 075 |                    0 |
 * | a different body selected               |          0 |                    0 |
 * | the vacated fridge opening selected     |          0 |                1 694 |
 *
 * `MIN_HIGHLIGHT_PIXELS` is 800: under half of the sparser of the two positive cases (the void's
 * outline is dashed, so it covers less of its own frame than a body's solid one), which leaves
 * room for a modest camera or layout shift while still failing anything the eye would call faint.
 * The old assertion here — `Buffer.compare(selected, unselected) !== 0` — passed on **one** pixel.
 *
 * `MAX_ABSENT_PIXELS` is 10 against a measured 0 in every negative case: slack for antialiasing,
 * not for a highlight.
 */
const HIGHLIGHT_COLOR_RGB = toRgb(SELECTION_HIGHLIGHT_COLOR);
const HIGHLIGHT_TOLERANCE = 60;
const MIN_HIGHLIGHT_PIXELS = 800;
const MAX_ABSENT_PIXELS = 10;

/** A void's translucent blue fill, which is what keeps a selected slot distinguishable from a
 *  selected body (M2's mobile gate). Measured in the same run: 1 074 pixels in the vacated-fridge
 *  patch, and **0** in the sink patch with the sink cabinet selected. The floor is 300. */
const VOID_BLUE_EXCESS = 25;
const MIN_VOID_FILL_PIXELS = 300;

const HIGHLIGHT = {
  kind: "near",
  color: HIGHLIGHT_COLOR_RGB,
  tolerance: HIGHLIGHT_TOLERANCE,
} as const;
const VOID_FILL = { kind: "blueTint", minExcess: VOID_BLUE_EXCESS } as const;

const SCENE_SETTLE_MS = 2500;
const RENDER_SETTLE_MS = 400;
const COMMAND_SETTLE_MS = 600;

const mintedDesignIds: string[] = [];

test.afterAll(async () => {
  await deleteMintedDesigns(mintedDesignIds);
});

test.beforeEach(async ({ page }) => {
  await page.goto("/configurator/configure");
  await page.waitForSelector("canvas", { state: "attached" });
  await page.waitForTimeout(SCENE_SETTLE_MS);
});

async function keepForDeletion(page: Page): Promise<void> {
  const { designId } = await readSelection(page);
  if (designId && !mintedDesignIds.includes(designId))
    mintedDesignIds.push(designId);
}

/** Page coordinates, which is how the constants above were found — the canvas fills the stage and
 *  starts 55 px below the header, so a canvas-relative click would be a different world point. */
async function clickScene(
  page: Page,
  position: { x: number; y: number },
): Promise<void> {
  await page.mouse.click(position.x, position.y);
  await page.waitForTimeout(RENDER_SETTLE_MS);
}

async function selectInRail(page: Page, id: string): Promise<void> {
  await expect(async () => {
    expect((await readSelection(page)).selectionId).toBe(id);
  }).toPass({ timeout: 3000 });
}

async function canvasWidth(page: Page): Promise<number> {
  const box = await page.locator("canvas").boundingBox();
  if (!box) throw new Error("expected the canvas to have a layout box");
  return box.width;
}

/** Frame D2A: with nothing selected there is no panel, and the scene has the whole width. */
test("with nothing selected the scene is full width and no panel exists", async ({
  page,
}) => {
  await expect(page.getByTestId("editor-panel")).toHaveCount(0);
  await expect(page.getByTestId("scene-hint")).toHaveCount(1);
  expect(await canvasWidth(page)).toBe(VIEWPORT_WIDTH_PX);
});

/**
 * Frame D2B, and the camera half of it.
 *
 * "The camera does not jump" is asserted by returning: the scene is captured full width, a body is
 * selected so the rail takes 420 px and the scene re-lays out, and then the selection is cleared —
 * and the scene comes back **byte-identical**. A camera that had been moved, re-seated or re-framed
 * by the layout change would not, and neither would one still easing when the capture was taken.
 */
test("selecting a body opens a 420 px rail, the scene re-lays out, and the camera does not jump", async ({
  page,
}) => {
  const beforeSelection = await page.locator("canvas").screenshot();

  await clickScene(page, SINK_CABINET_FULL_WIDTH);
  await selectInRail(page, "p0");

  const rail = await page.getByTestId("editor-panel").boundingBox();
  expect(rail?.width).toBe(RAIL_WIDTH_PX);
  expect(rail?.x).toBe(SCENE_WIDTH_WITH_RAIL_PX);
  expect(await canvasWidth(page)).toBe(SCENE_WIDTH_WITH_RAIL_PX);
  // The rail takes its own space rather than covering the scene: the two are side by side.
  await expect(page.getByTestId("scene-hint")).toHaveCount(0);

  await page.getByTestId("panel-close").click();
  await expect(page.getByTestId("editor-panel")).toHaveCount(0);
  expect(await canvasWidth(page)).toBe(VIEWPORT_WIDTH_PX);

  await expect(async () => {
    const afterDeselection = await page.locator("canvas").screenshot();
    expect(Buffer.compare(beforeSelection, afterDeselection)).toBe(0);
  }).toPass({ timeout: 5000 });
});

test("rows and chips use the larger desktop spacing scale", async ({
  page,
}) => {
  await clickScene(page, SINK_CABINET_FULL_WIDTH);
  await selectInRail(page, "p0");

  const rowHeights = await page
    .locator('[data-testid^="offer-"]')
    .evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().height),
    );
  expect(rowHeights.length).toBeGreaterThan(0);
  for (const height of rowHeights) {
    expect(height).toBeGreaterThanOrEqual(MIN_ROW_HEIGHT_PX);
    expect(height).toBeLessThanOrEqual(MAX_ROW_HEIGHT_PX);
  }

  const chipHeights = await page
    .locator('[data-testid^="handle-"], [data-testid^="finish-"]')
    .evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().height),
    );
  expect(chipHeights.length).toBeGreaterThan(0);
  for (const height of chipHeights)
    expect(height).toBeGreaterThanOrEqual(MIN_CHIP_HEIGHT_PX);
});

/**
 * M2's highlight gate, re-homed — and re-written, because what stood here proved nothing.
 *
 * It captured the patch with the sink cabinet selected and again with a different body selected
 * and asserted the two PNGs differed. One pixel of one antialiased edge satisfies that, which is
 * why a highlight the project owner could not see passed it. This counts the highlight's own
 * colour instead, in the region of the body it belongs to, and requires it to be absent from the
 * region of a body that is not selected — so it fails both when the highlight is invisible and
 * when it is drawn around the wrong cabinet.
 *
 * Both captures are taken with the rail open, one body selected in each, so the canvas size, the
 * camera and the design are identical and the selection frame is the only difference.
 */
test("a selected body draws its highlight over its own region and nowhere else", async ({
  page,
}) => {
  await clickScene(page, SINK_CABINET_FULL_WIDTH);
  await selectInRail(page, "p0");

  const onSelectedBody = await countPixels(page, SINK_PATCH, HIGHLIGHT);
  const elsewhereWhileSelected = await countPixels(
    page,
    VACATED_FRIDGE_PATCH,
    HIGHLIGHT,
  );
  expect(onSelectedBody).toBeGreaterThanOrEqual(MIN_HIGHLIGHT_PIXELS);
  expect(elsewhereWhileSelected).toBeLessThanOrEqual(MAX_ABSENT_PIXELS);

  await clickScene(page, FAR_BASE_CABINET);
  await selectInRail(page, "p2");

  const onUnselectedBody = await countPixels(page, SINK_PATCH, HIGHLIGHT);
  expect(onUnselectedBody).toBeLessThanOrEqual(MAX_ABSENT_PIXELS);
});

/**
 * §5 and §10: every edit applies to the model immediately, on both viewports, and nothing is
 * staged for dismissal. Here that is visible rather than inferred — the 3D scene repaints while the
 * panel is still open, at one canvas size and one camera, with only the finish changed.
 */
test("an edit repaints the scene while the panel is still open", async ({
  page,
}) => {
  await clickScene(page, SINK_CABINET_FULL_WIDTH);
  await selectInRail(page, "p0");
  const before = await page.screenshot({ clip: SINK_PATCH });

  await page.getByTestId("finish-graphite").click();
  await page.waitForTimeout(COMMAND_SETTLE_MS);
  await keepForDeletion(page);

  await expect(page.getByTestId("editor-panel")).toHaveCount(1);
  await expect(page.getByTestId("finish-graphite")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const after = await page.screenshot({ clip: SINK_PATCH });
  expect(Buffer.compare(before, after)).not.toBe(0);
});

/**
 * M2's void-highlight gate, re-written for the same reason as the body one above, and carrying
 * the half M3 left to the eye: **how a selected void differs from a selected body**.
 *
 * The delete is what creates the void — `KITCHEN_L_DESIGN` is fully occupied by construction — and
 * §5.1 leaves the vacated opening selected, so the first capture is the selected void.
 *
 * The two selected states have different, measured signatures. A selected body's region carries
 * the highlight colour and **no** blue at all; a selected slot's region carries the highlight
 * colour **and** the void mesh's translucent blue fill, and its outline is dashed where the body's
 * is solid. The blue on its own is not a selection signal — an unselected void is blue too, which
 * is asserted here rather than assumed — so it is the pair that tells the two apart.
 */
test("a selected void is highlighted, and is distinguishable from a selected body", async ({
  page,
}) => {
  await clickScene(page, SINK_CABINET_FULL_WIDTH);
  await selectInRail(page, "p0");
  const bodyHighlight = await countPixels(page, SINK_PATCH, HIGHLIGHT);
  const bodyBlue = await countPixels(page, SINK_PATCH, VOID_FILL);

  await clickScene(page, FRIDGE);
  await selectInRail(page, "p7");
  await page.getByTestId("panel-remove").click();
  await page.waitForTimeout(COMMAND_SETTLE_MS);
  await keepForDeletion(page);

  const vacated = await readSelection(page);
  expect(vacated.selectionKind).toBe("void");

  const voidHighlight = await countPixels(
    page,
    VACATED_FRIDGE_PATCH,
    HIGHLIGHT,
  );
  const voidBlue = await countPixels(page, VACATED_FRIDGE_PATCH, VOID_FILL);
  expect(voidHighlight).toBeGreaterThanOrEqual(MIN_HIGHLIGHT_PIXELS);
  expect(voidBlue).toBeGreaterThanOrEqual(MIN_VOID_FILL_PIXELS);

  // The two selected states, side by side: both carry the highlight, only the slot carries blue.
  expect(bodyHighlight).toBeGreaterThanOrEqual(MIN_HIGHLIGHT_PIXELS);
  expect(bodyBlue).toBeLessThanOrEqual(MAX_ABSENT_PIXELS);

  await clickScene(page, FAR_BASE_CABINET);
  await expect(async () => {
    expect((await readSelection(page)).selectionKind).toBe("placement");
  }).toPass({ timeout: 3000 });

  const unselectedVoidHighlight = await countPixels(
    page,
    VACATED_FRIDGE_PATCH,
    HIGHLIGHT,
  );
  const unselectedVoidBlue = await countPixels(
    page,
    VACATED_FRIDGE_PATCH,
    VOID_FILL,
  );
  expect(unselectedVoidHighlight).toBeLessThanOrEqual(MAX_ABSENT_PIXELS);
  // Still blue, and still there: the fill is the void's own, not a selection state.
  expect(unselectedVoidBlue).toBeGreaterThanOrEqual(MIN_VOID_FILL_PIXELS);
});
