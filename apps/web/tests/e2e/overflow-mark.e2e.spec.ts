import { NARROWED_ROOM_OVERFLOWING_DESIGN } from "@lemnaria/configurator-domain";
import { SELECTION_HIGHLIGHT_COLOR } from "@lemnaria/three-adapter";
import { expect, type Page } from "@playwright/test";

import { ro } from "../support/romanian-content.e2e";
import { deleteMintedDesigns } from "./support/minted-designs";
import { atThisCanvas, SINK_CABINET_TAP } from "./support/canvas-taps";
import { countPixels, toRgb, type PixelRect } from "./support/pixels";
import { readSelection } from "./support/panel";
import {
  mintSeededDesign,
  openSeededDesign,
  test,
  type SeededDesign,
} from "./support/seeded-design";

/** This file's own background tap, not either existing one: §9's sheet is pinned to the viewport at 78 dvh (top edge
 *  at page y 185.68) and the canvas starts at page y 98.94, so the strip above the sheet is 86.74 px and the
 *  `(310, 100)` the other specs tap lands on the sheet. 40 is inside the strip. */
const BACKGROUND_ABOVE_SHEET_TAP = { x: 310, y: 40 };

/** The room this document declares and the bodies that then reach past wall A, in the byte order
 *  `findOverflowingPlacementIds` publishes them (`compareOpaqueIds`), which is why `p13` precedes `p2`. The width is
 *  the domain's narrowed-room fixture (ADR 0083 decision 10), shared with the visual gate; the document is still
 *  built from what the API returns. */
const NARROWED_ROOM_WIDTH_MM = NARROWED_ROOM_OVERFLOWING_DESIGN.room.widthMm;
const MARKED_PLACEMENT_IDS = ["p13", "p14", "p19", "p2", "p20", "p4"];

const SCENE_SETTLE_MS = 2500;
const RENDER_SETTLE_MS = 400;

/**
 * The mark is counted by its red excess, not by distance to `OVERFLOW_MARK_COLOR`: the 32 % wash blends with whatever
 * the body is painted, so the nearest scene pixel only moves from 108.71 to 62.32, and a ball wide enough to catch it
 * would also catch the selection highlight (about 90 away; `packages/three-adapter/tests/overflow-mark.test.ts` pins
 * the rounded distance). Differencing two captures is unavailable (ADR 0091 decision 6): the flagged total grows the
 * price row and shifts the canvas box, so 19 % to 43 % of any rectangle moves.
 *
 * The count is sound only on this fixture, asserted below: no body wears a finish (a `#ff2d2d` kitchen reports 16 416
 * such pixels with no mark) and nothing is selected (a selection outline counts as a mark).
 *
 * The threshold is 50 where the witness specs use 80, because it is a property of what the document under the wash is
 * painted: over this white kitchen the wash carries little red (7 494 marked pixels at 50, 252 at 80) and this is the
 * one counter with its own control (`fittingPixels`, 0). A counter that may meet a wood needs
 * `MARK_MIN_RED_EXCESS_OVER_ANY_FINISH`: an unmarked oak kitchen carries a red excess of 72 or more on at least
 * 10 000 pixels in every preset, well past 50 (`pixel-counter-witness.adversarial.desktop.e2e.spec.ts` asserts it).
 */
const MARK_MIN_RED_EXCESS = 50;
const MARK = { kind: "redTint", minExcess: MARK_MIN_RED_EXCESS } as const;

/** Under a third of the 7 875 the mark was measured at, before the marked bodies left the frame; the first case's
 *  tripwire uses it. */
const MIN_MARK_PIXELS = 2000;
/** Measured 0 on the fitting design in every preset; the slack is for antialiasing, not for a mark. */
const MAX_ABSENT_PIXELS = 40;

/** The ball the desktop selection spec counts highlight pixels in, used in the one direction still meaningful:
 *  with a mark on screen and nothing selected, no pixel may count as a highlight. */
const SELECTION_RGB = toRgb(SELECTION_HIGHLIGHT_COLOR);
const COLOR_TOLERANCE = 60;
const SELECTION = {
  kind: "near",
  color: SELECTION_RGB,
  tolerance: COLOR_TOLERANCE,
} as const;

/** The `seededDesign` fixture owns the one row each test narrows; the fitting-control captures need a second,
 *  unmutated row beside it, and this is that row's cleanup. */
const fittingControlIds: string[] = [];

test.afterAll(async () => {
  await deleteMintedDesigns(fittingControlIds);
});

async function mintFittingControl(page: Page): Promise<SeededDesign> {
  const control = await mintSeededDesign(page);
  fittingControlIds.push(control.id);
  return control;
}

/** Stores the seeded kitchen with wall A declared narrower than the run standing on it, built from the document the
 *  API just returned so it cannot drift, and returns the ids that then overflow. */
async function storeANarrowedRoom(
  page: Page,
  stored: SeededDesign,
): Promise<readonly string[]> {
  const result = await page.evaluate(
    async (target: SeededDesign & { readonly widthMm: number }) => {
      const loaded = await fetch(`/api/designs/${target.id}`);
      const { design } = (await loaded.json()) as {
        design: {
          room: { widthMm: number; depthMm: number };
          placements: {
            id: string;
            wall: string;
            alongMm: number;
            body: { widthMm: number; finish?: unknown };
          }[];
        };
      };
      const narrowed = {
        ...design,
        room: { ...design.room, widthMm: target.widthMm },
      };
      const overflowing = narrowed.placements
        .filter(
          (placement) =>
            placement.alongMm + placement.body.widthMm / 2 >
            (placement.wall === "A"
              ? narrowed.room.widthMm
              : narrowed.room.depthMm),
        )
        .map((placement) => placement.id);
      // Carried out of the page beside the ids, so the counter's fixture premise is asserted on the stored document.
      const wearingAFinish = narrowed.placements
        .filter((placement) => placement.body.finish !== undefined)
        .map((placement) => placement.id);

      const saved = await fetch(`/api/designs/${target.id}`, {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-expected-revision": target.revision,
        },
        body: JSON.stringify(narrowed),
      });
      return {
        status: saved.status,
        overflowing,
        wearingAFinish,
        placements: narrowed.placements.length,
      };
    },
    { ...stored, widthMm: NARROWED_ROOM_WIDTH_MM },
  );

  // ADR 0065 decision 7 and ADR 0069: a design that does not fit still saves. If this is not 200 the
  // demotion has regressed and nothing below would mean anything.
  expect(result.status).toBe(200);
  expect([...result.overflowing].sort()).toEqual(MARKED_PLACEMENT_IDS);

  // The red counter's fixture property, asserted on the document about to be photographed: no body wears a finish.
  // The count is asserted first, since an empty design satisfies "every placement" vacuously.
  expect(result.placements).toBeGreaterThan(0);
  expect(result.wearingAFinish).toEqual([]);
  return result.overflowing;
}

/** The counter's other premise: a selection outline is red over both other channels by 210 and would count as a
 *  wash, so both counting states must be freshly opened documents with no selection. */
async function expectNothingIsSelected(page: Page): Promise<void> {
  await expect(page.getByTestId("editor-panel")).toHaveCount(0);
  expect((await readSelection(page)).selectionId).toBe("");
}

/** Opens a stored design and waits until the scene is mounted: `probe` is the store's `isBodyProbeAttached`, which
 *  gates the warning band. */
async function openAndSettle(page: Page, design: SeededDesign): Promise<void> {
  await openSeededDesign(page, design);
  await expect(async () => {
    expect((await readSelection(page)).probe).toBe("on");
  }).toPass({ timeout: 15_000 });
  await page.waitForTimeout(SCENE_SETTLE_MS);
}

async function boxOf(page: Page, testId: string): Promise<PixelRect> {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) throw new Error(`${testId} has no layout box`);
  return box;
}

async function canvasBox(page: Page): Promise<PixelRect> {
  const box = await page.locator("canvas").boundingBox();
  if (!box) throw new Error("the scene canvas has no layout box");
  return box;
}

/**
 * The scene's own pixels: the canvas clipped above the warning band, whose amber text (`#7c4a0c`) clears the counted
 * red excess. One rectangle serves both captures, so they stay comparable although the price bar shortens the canvas
 * on the marked document.
 */
function sceneClip(canvas: PixelRect, bandHeightPx: number): PixelRect {
  return {
    x: Math.round(canvas.x),
    y: Math.round(canvas.y),
    width: Math.round(canvas.width),
    height: Math.round(canvas.height - bandHeightPx),
  };
}

test("a stored overflowing design is marked in the scene and warned about, and a fitting one is neither", async ({
  page,
  seededDesign,
}) => {
  await storeANarrowedRoom(page, seededDesign);
  await openAndSettle(page, seededDesign);

  const warning = page.getByTestId("scene-overflow-warning");
  await expect(warning).toBeVisible();
  // ADR 0065 decision 7b's sentence, resolved through the catalogue. The copy lock pins the wording; what a browser
  // adds is that the band on the page carries that leaf and not a tidied one typed into the component.
  await expect(warning).toHaveText(ro.configure.overflowWarning);

  const band = await boxOf(page, "scene-overflow-warning");
  const clip = sceneClip(await canvasBox(page), band.height);
  await expectNothingIsSelected(page);
  const markedPixels = await countPixels(page, clip, MARK);
  const highlightPixels = await countPixels(page, clip, SELECTION);

  // The control: the design the product ships, through the same rectangle, on a second unmutated row because the row
  // under test is already narrowed.
  const fittingControl = await mintFittingControl(page);
  expect(fittingControl.id).not.toBe(seededDesign.id);
  await openAndSettle(page, fittingControl);
  await expect(page.getByTestId("scene-overflow-warning")).toHaveCount(0);
  await expectNothingIsSelected(page);
  const fittingPixels = await countPixels(page, clip, MARK);

  // The wash reaches the framebuffer, measured against the noise floor rather than a prominence bar: the preset frames
  // the middle of the room, so the marked bodies past the end of wall A are off screen and 333 marked pixels remain,
  // eightfold above `MAX_ABSENT_PIXELS`. The owner accepted a marked body framed off screen. A differential of two
  // counts, not of two captures: the header is taller on the flagged document, so the frames share no rectangle.
  expect(fittingPixels).toBeLessThanOrEqual(MAX_ABSENT_PIXELS);
  expect(markedPixels).toBeGreaterThan(fittingPixels + MAX_ABSENT_PIXELS);

  // Tripwire for that acceptance: if a later change frames the marked bodies again this goes red, and the prominence
  // assertion (`markedPixels > fittingPixels + MIN_MARK_PIXELS`) should be restored rather than this number raised.
  expect(markedPixels).toBeLessThan(MIN_MARK_PIXELS);

  // Nothing is selected, so a screen full of mark must contain no highlight: the two never read as each other.
  expect(highlightPixels).toBeLessThanOrEqual(MAX_ABSENT_PIXELS);
});

test("the warning band is pinned to the scene's bottom edge and costs the canvas no height", async ({
  page,
  seededDesign,
}) => {
  // The band sits on the scene box's bottom edge and takes nothing from the canvas. The fitting baseline is the same
  // row read before it is narrowed: nothing measured here depends on the marked state.
  await openAndSettle(page, seededDesign);
  const fittingCanvas = await canvasBox(page);
  const fittingBar = await boxOf(page, "price-bar");

  await storeANarrowedRoom(page, seededDesign);
  await openAndSettle(page, seededDesign);

  const band = await boxOf(page, "scene-overflow-warning");
  const canvas = await canvasBox(page);
  const bar = await boxOf(page, "price-bar");

  expect(band.y + band.height).toBeCloseTo(canvas.y + canvas.height, 0);
  expect(band.height).toBeGreaterThanOrEqual(56);

  // Whatever the canvas loses, the price bar took it and the band took none: the bar holds a fixed height since the
  // flagged sentence moved to the scene (ADR 0104 decision 8b), so both are zero. The first assertion keeps the second
  // non-vacuous: the band is 56 px tall and the canvas loses less, so a band back in the flow fails.
  const canvasLossPx = fittingCanvas.height - canvas.height;
  const barGrowthPx = bar.height - fittingBar.height;
  expect(canvasLossPx).toBeLessThan(band.height);
  expect(canvasLossPx - barGrowthPx).toBeCloseTo(0, 0);

  expect(canvas.y).toBeCloseTo(fittingCanvas.y, 0);
  expect(canvas.height).toBeGreaterThan(200);
});

test("the orbit hint rides above the band rather than inside it", async ({
  page,
  seededDesign,
}) => {
  // Both are bottom-anchored overlays on one box: pinned independently, the 56 px band would be drawn through the
  // hint pill, which stands 16 px off the same edge.
  await storeANarrowedRoom(page, seededDesign);
  await openAndSettle(page, seededDesign);

  const hint = await boxOf(page, "scene-hint");
  const band = await boxOf(page, "scene-overflow-warning");

  expect(hint.y + hint.height).toBeLessThanOrEqual(band.y);
});

/**
 * No marked body is on screen at the preset (the camera frames the middle of the room and the six marked bodies stand
 * past wall A), so the browser-level proof that the wash is not a raycast target lives only in the adapter's suite;
 * it returns when a marked body can be framed again. This case keeps what still runs: an on-screen body is
 * selectable with the band up, the strip above the sheet is reachable, and dismissing leaves the mark.
 */
test("a body is selectable with the band up, and the strip above the sheet is still reachable", async ({
  page,
  seededDesign,
}) => {
  await storeANarrowedRoom(page, seededDesign);
  await openAndSettle(page, seededDesign);

  // An unmarked body, because no marked one is on screen: the seeded sink cabinet.
  await page.tap("canvas", {
    position: await atThisCanvas(page, SINK_CABINET_TAP),
  });
  await page.waitForTimeout(RENDER_SETTLE_MS);
  await expect(page.getByTestId("editor-panel")).toHaveCount(1);

  const selected = await readSelection(page);
  expect(selected.selectionKind).toBe("placement");

  // The strip above the sheet is reachable with the band up: why `BACKGROUND_ABOVE_SHEET_TAP` is this file's own.
  await page.tap("canvas", { position: BACKGROUND_ABOVE_SHEET_TAP });
  await page.waitForTimeout(RENDER_SETTLE_MS);
  await expect(page.getByTestId("editor-panel")).toHaveCount(0);

  // Deselecting clears the outline and leaves the mark: the body did not fit before it was selected
  // and does not fit after.
  await expect(page.getByTestId("scene-overflow-warning")).toBeVisible();
});
