import { expect, type Page } from "@playwright/test";

import {
  capturePatch,
  countChangedPixels,
  countPixelsIn,
  type CapturedPatch,
  type PixelRect,
} from "./support/pixels";
import {
  FAR_BASE_CABINET,
  FRIDGE,
  SINK_CABINET_FULL_WIDTH,
  SINK_PATCH,
} from "./support/desktop-scene-points";
import { readSelection, waitForFirstSave } from "./support/panel";
import { openSeededDesign, test } from "./support/seeded-design";

/**
 * Coordinates are page pixels, in two sets: the scene is 1440 px wide with nothing selected and 1020 px with the
 * rail open, so the same world point is a different pixel in each state.
 */

/** Centre of `SINK_PATCH` with the rail open; `SINK_CABINET_FULL_WIDTH` is a 1440 px-canvas point and selects
 *  nothing here. */
const SINK_CABINET_WITH_RAIL = {
  x: SINK_PATCH.x + SINK_PATCH.width / 2,
  y: SINK_PATCH.y + SINK_PATCH.height / 2,
};

const VIEWPORT_WIDTH_PX = 1440;
const RAIL_WIDTH_PX = 420;
const SCENE_WIDTH_WITH_RAIL_PX = VIEWPORT_WIDTH_PX - RAIL_WIDTH_PX;

/** The milestone's desktop spacing scale: rows 52–70 px, chips on the same larger scale. */
const MIN_ROW_HEIGHT_PX = 52;
const MAX_ROW_HEIGHT_PX = 70;
const MIN_CHIP_HEIGHT_PX = 52;

/** Patches are in page pixels; the canvas starts 76 px down.
 *
 *  The lower of the two voids the fridge leaves (`B|2.45:v0:0.00`), which DEVELOPMENT-SPEC §5.1 selects; a box around
 *  the whole column would add an unselected void's blue fill to the count. */
const VACATED_FRIDGE_PATCH: PixelRect = {
  x: 20,
  y: 585,
  width: 252,
  height: 268,
};

/**
 * A selection is counted by what changed between two captures, not by colour, so a customer finish equal to the
 * highlight hex cannot fake it (see ADR 0091 work item 2). Both captures have the rail open, so canvas size and
 * camera are identical.
 *
 * `NOISE_FLOOR` is 8: slack over a measured 0-pixel difference between same-state captures. The sink-patch count
 * (10 416) and void count (6 026) were measured at the pre-halving outline width and are stale; re-measure them
 * before moving `MIN_CHANGED_PIXELS`.
 */
const NOISE_FLOOR = 8;
const MIN_CHANGED_PIXELS = 3000;
const MAX_UNCHANGED_PIXELS = 10;

/**
 * The one counter that still names a colour: the void's blue fill is in both states of every pair, so differencing
 * cannot see it. Sound only while no placement wears a finish (`expectNoPlacementWearsAFinish`).
 */
const VOID_BLUE_EXCESS = 25;
const MIN_VOID_FILL_PIXELS = 300;
const MAX_ABSENT_VOID_FILL_PIXELS = 10;

const VOID_FILL = { kind: "blueTint", minExcess: VOID_BLUE_EXCESS } as const;

const SCENE_SETTLE_MS = 2500;
const RENDER_SETTLE_MS = 400;
const COMMAND_SETTLE_MS = 600;

test.beforeEach(async ({ page, seededDesign }) => {
  await openSeededDesign(page, seededDesign);
  await page.waitForTimeout(SCENE_SETTLE_MS);
});

/** Page coordinates: the canvas starts 76 px below the screen top (76 + 824 = 900), so a canvas-relative click
 *  is a different world point. */
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

async function changedPixels(
  page: Page,
  before: CapturedPatch,
  after: CapturedPatch,
): Promise<number> {
  return countChangedPixels(page, before, after, NOISE_FLOOR);
}

/** A bound, not an equality: `MAX_UNCHANGED_PIXELS` is antialiasing slack over a measured 0. */
async function expectUnchanged(
  page: Page,
  before: CapturedPatch,
  after: CapturedPatch,
): Promise<void> {
  expect(await changedPixels(page, before, after)).toBeLessThanOrEqual(
    MAX_UNCHANGED_PIXELS,
  );
}

/**
 * Reads the stored document (`GET /api/designs/{id}`) rather than `KITCHEN_L_DESIGN`, so fixture/scene drift shows.
 * The caller has confirmed the write landed; the placement count is asserted first so an empty design cannot pass
 * vacuously.
 */
async function expectNoPlacementWearsAFinish(
  page: Page,
  designId: string,
): Promise<void> {
  const worn = await page.evaluate(async (id: string) => {
    const loaded = await fetch(`/api/designs/${id}`);
    const { design } = (await loaded.json()) as {
      design: { placements: { id: string; body: { finish?: unknown } }[] };
    };
    return {
      placements: design.placements.length,
      finishes: design.placements
        .filter((placement) => placement.body.finish !== undefined)
        .map((placement) => placement.id),
    };
  }, designId);

  expect(worn.placements).toBeGreaterThan(0);
  expect(worn.finishes).toEqual([]);
}

test("with nothing selected the scene is full width and no panel exists", async ({
  page,
}) => {
  await expect(page.getByTestId("editor-panel")).toHaveCount(0);
  await expect(page.getByTestId("scene-hint")).toHaveCount(1);
  expect(await canvasWidth(page)).toBe(VIEWPORT_WIDTH_PX);
});

/** Camera stability is asserted by returning: after deselecting, the canvas is byte-identical to the first capture. */
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
 * Three pairs: `p0` vs `p2` moves the sink patch; the same pair leaves the vacated-fridge patch still; `p2` vs `p7`
 * leaves the sink patch still, so the change tracks this body's selection and not any selection change.
 */
test("a selected body's outline changes its own region and nothing else", async ({
  page,
}) => {
  await clickScene(page, SINK_CABINET_FULL_WIDTH);
  await selectInRail(page, "p0");
  const sinkWithTheSinkSelected = await capturePatch(page, SINK_PATCH);
  const fridgeWithTheSinkSelected = await capturePatch(
    page,
    VACATED_FRIDGE_PATCH,
  );

  await clickScene(page, FAR_BASE_CABINET);
  await selectInRail(page, "p2");
  const sinkWithAnotherSelected = await capturePatch(page, SINK_PATCH);
  const fridgeWithAnotherSelected = await capturePatch(
    page,
    VACATED_FRIDGE_PATCH,
  );
  const sinkWithAnotherSelectedAgain = await capturePatch(page, SINK_PATCH);

  await clickScene(page, FRIDGE);
  await selectInRail(page, "p7");
  const sinkWithAThirdSelected = await capturePatch(page, SINK_PATCH);

  // The noise floor, re-measured in this run rather than taken on trust from the block above.
  await expectUnchanged(
    page,
    sinkWithAnotherSelected,
    sinkWithAnotherSelectedAgain,
  );

  expect(
    await changedPixels(page, sinkWithAnotherSelected, sinkWithTheSinkSelected),
  ).toBeGreaterThanOrEqual(MIN_CHANGED_PIXELS);
  await expectUnchanged(
    page,
    fridgeWithAnotherSelected,
    fridgeWithTheSinkSelected,
  );
  await expectUnchanged(page, sinkWithAnotherSelected, sinkWithAThirdSelected);
});

test("an edit repaints the scene while the panel is still open", async ({
  page,
}) => {
  await clickScene(page, SINK_CABINET_FULL_WIDTH);
  await selectInRail(page, "p0");
  const before = await page.screenshot({ clip: SINK_PATCH });

  await page.getByTestId("finish-pal.antracit").click();
  await page.waitForTimeout(COMMAND_SETTLE_MS);

  await expect(page.getByTestId("editor-panel")).toHaveCount(1);
  await expect(page.getByTestId("finish-pal.antracit")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const after = await page.screenshot({ clip: SINK_PATCH });
  expect(Buffer.compare(before, after)).not.toBe(0);
});

/**
 * The delete creates the void (`KITCHEN_L_DESIGN` is fully occupied) and §5.1 leaves it selected. Selection is
 * differenced; the fill is in both frames of every pair, so it is counted by colour.
 */
test("a selected void is highlighted, and is distinguishable from a selected body", async ({
  page,
  seededDesign,
}) => {
  await clickScene(page, SINK_CABINET_FULL_WIDTH);
  await selectInRail(page, "p0");

  await clickScene(page, FRIDGE);
  await selectInRail(page, "p7");
  await page.getByTestId("panel-remove").click();
  // `waitForFirstSave` throws unless the stored revision moved, so the fixture check below reads a written document.
  await waitForFirstSave(page, seededDesign);

  const vacated = await readSelection(page);
  expect(vacated.selectionKind).toBe("void");
  // The blue counter keys on colour: nothing else on screen may be blue, asserted against the stored document.
  await expectNoPlacementWearsAFinish(page, seededDesign.id);

  const vacatedWhileSelected = await capturePatch(page, VACATED_FRIDGE_PATCH);
  const sinkWhileTheVoidIsSelected = await capturePatch(page, SINK_PATCH);

  await clickScene(page, FAR_BASE_CABINET);
  await expect(async () => {
    expect((await readSelection(page)).selectionKind).toBe("placement");
  }).toPass({ timeout: 3000 });
  const vacatedWhileAnotherSelected = await capturePatch(
    page,
    VACATED_FRIDGE_PATCH,
  );
  const sinkWhileAnotherSelected = await capturePatch(page, SINK_PATCH);

  await clickScene(page, SINK_CABINET_WITH_RAIL);
  await selectInRail(page, "p0");
  const vacatedWhileTheSinkSelected = await capturePatch(
    page,
    VACATED_FRIDGE_PATCH,
  );
  const sinkWhileTheSinkSelected = await capturePatch(page, SINK_PATCH);

  expect(
    await changedPixels(
      page,
      vacatedWhileAnotherSelected,
      vacatedWhileSelected,
    ),
  ).toBeGreaterThanOrEqual(MIN_CHANGED_PIXELS);
  expect(
    await changedPixels(
      page,
      sinkWhileAnotherSelected,
      sinkWhileTheSinkSelected,
    ),
  ).toBeGreaterThanOrEqual(MIN_CHANGED_PIXELS);
  await expectUnchanged(
    page,
    sinkWhileAnotherSelected,
    sinkWhileTheVoidIsSelected,
  );
  await expectUnchanged(
    page,
    vacatedWhileAnotherSelected,
    vacatedWhileTheSinkSelected,
  );

  // The fill is present in the slot whether or not it is selected, and absent from the selected cabinet's region.
  expect(
    await countPixelsIn(page, vacatedWhileSelected, VOID_FILL),
  ).toBeGreaterThanOrEqual(MIN_VOID_FILL_PIXELS);
  expect(
    await countPixelsIn(page, vacatedWhileAnotherSelected, VOID_FILL),
  ).toBeGreaterThanOrEqual(MIN_VOID_FILL_PIXELS);
  expect(
    await countPixelsIn(page, sinkWhileTheSinkSelected, VOID_FILL),
  ).toBeLessThanOrEqual(MAX_ABSENT_VOID_FILL_PIXELS);
});
