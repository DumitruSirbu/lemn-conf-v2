import type { Page } from "@playwright/test";

/**
 * **Where a tap point found on one canvas stands on the canvas the page is showing now.**
 *
 * Every canvas constant in this suite was found the only way such a thing can be found — by tapping
 * a running WebGL scene and reading `[data-testid="selection-debug"]` back. That makes each one a
 * measurement of a *world* position expressed in the pixels of the canvas it was measured on, and
 * the canvas is whatever height the screen's chrome leaves. It has now been invalidated twice by a
 * band nobody was thinking about when the numbers were written: wave 6C's price bar took 92 px off
 * the bottom, and wave 6G's whole-kitchen chips took 46.94 px off the top. Wave 6M adds a
 * conditional warning band to the same column.
 *
 * So the constants stay where they are — their provenance is the point — and this converts them,
 * once, from the canvas they were found on to the canvas in front of the browser.
 *
 * **The conversion, and why it is exact rather than approximate.** The scene camera's *vertical*
 * field of view is fixed (`CAMERA_FIELD_OF_VIEW_DEGREES`), and only the canvas's height changes —
 * its width is the full viewport on this shell. Two consequences, and both were checked against the
 * running app rather than assumed:
 *
 * - **Vertically**, `ndc_y` does not depend on the aspect ratio at all, so a world point keeps its
 *   *fraction* of the canvas height: `y' = y · H'/H`.
 * - **Horizontally**, `ndc_x = x_camera / (tan(fov/2) · aspect · z)` and `aspect = W/H`, so a
 *   shorter canvas widens the horizontal field and pulls every world point *toward the centre* by
 *   the same ratio: `x' = W/2 + (x − W/2) · H'/H`.
 *
 * Measured 2026-09-04 at 390 × 844 against the seeded design: with the 6G band hidden the canvas is
 * 390 × 697 and with it shown 390 × 650.06. Every constant below, converted by this rule, selected
 * the identical placement id the original selected on the 697-high canvas — `p0` for the sink
 * cabinet, `p17` for the wall cabinet, `p7` for the fridge — while the unconverted constants
 * selected nothing at all.
 */

/** The canvas every constant in this suite was found on: 390 × 844 less the header (55 px) and wave
 *  6C's price bar (92 px), which is 697 — measured in the browser, not derived from the stylesheet.
 *  Written as the height it *was* rather than updated to today's 650.06, because a converted
 *  constant has to be able to say which canvas it came from. */
export const CANVAS_THE_TAPS_WERE_FOUND_ON = { width: 390, height: 697 };

/** §10.1's touch sizing. A strip of scene shorter than this is not a surface a finger can aim at,
 *  which is the failure the next band added to this column will produce. */
const MIN_TAPPABLE_STRIP_PX = 44;

export interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * **The seeded sink cabinet, `p0`, in the overview preset** — the one canvas constant four specs
 * all needed, and until 2026-09-16 the one four specs each declared for themselves.
 *
 * `kitchen-stage`, `editor-panel`, `price-footer-growth` and `read-only-panel` carried identical
 * copies of `{ x: 215, y: 500 }`, and they agreed only because they were written together. Wave 7H
 * moved the camera and all four went stale at once — so it is declared here, once, the way ADR 0083
 * decision 10 settled the same question for the overflowing design fixture.
 *
 * **Re-found by tapping on 2026-09-16, not computed.** A grid of real taps was walked across the
 * running scene and the selected id read back from `[data-testid="selection-debug"]`; this point
 * sits in the middle of p0's region in that map and was confirmed by a single tap. Deriving it from
 * the camera's own projection would have made every spec that uses it agree with the camera by
 * construction.
 */
export const SINK_CABINET_TAP: CanvasPoint = { x: 210, y: 400 };

/** A real touch at a point found on the reference canvas, converted to this one. */
export async function tapCanvas(page: Page, found: CanvasPoint): Promise<void> {
  await page.tap("canvas", { position: await atThisCanvas(page, found) });
}

/** The conversion itself, published so a spec that needs the coordinate rather than the tap — a
 *  screenshot clip, a swipe origin — reads the same rule. */
export async function atThisCanvas(
  page: Page,
  found: CanvasPoint,
): Promise<CanvasPoint> {
  const canvas = await canvasBox(page);
  return {
    x: alongCanvas(found.x, canvas.height),
    y: found.y * (canvas.height / CANVAS_THE_TAPS_WERE_FOUND_ON.height),
  };
}

/** The horizontal half of the rule on its own, for the one constant whose vertical positions are
 *  already written as fractions of the live canvas (`support/panel.ts`'s column scan) and would be
 *  scaled twice if they came through `atThisCanvas`. */
export async function alongThisCanvas(
  page: Page,
  foundX: number,
): Promise<number> {
  return alongCanvas(foundX, (await canvasBox(page)).height);
}

/**
 * **A tap on the strip of scene left above §9's sheet, with the sheet open.**
 *
 * Derived rather than converted, and that is a real difference. The constants above name a *world*
 * position, so converting them keeps them pointing at the same cabinet. This one names a *region* —
 * "background the customer can still reach while a body is selected" — and the region is not the
 * scene's, it is the gap between the canvas's top and the sheet's. That gap shrinks faster than the
 * canvas does: measured at 390 × 844, it was 130.68 px before wave 6G's band and is **83.75 px**
 * after, because the sheet is pinned to the viewport at 78 dvh while the canvas moved down.
 *
 * So the shipped constant (canvas y = 100) converts to y = 93.3, which is *below* the sheet's top
 * edge and would land the tap on the sheet rather than on the scene behind it. Converting it would
 * have produced a test that passes for the wrong reason.
 *
 * **It throws rather than aiming at a sliver.** The next band added to this column takes the strip
 * with it, and a 28 px target is not one a finger can hit — this is where that becomes a sentence
 * somebody reads instead of an intermittent miss.
 */
export async function tapSceneStripAboveSheet(
  page: Page,
  found: CanvasPoint,
): Promise<void> {
  const canvas = await canvasBox(page);
  const sheet = await page.getByTestId("editor-panel").boundingBox();
  if (!sheet)
    throw new Error(
      "the scene strip is only reachable while §9's sheet is open, and no panel is on the page",
    );
  const stripHeight = sheet.y - canvas.y;
  if (stripHeight < MIN_TAPPABLE_STRIP_PX)
    throw new Error(
      `Only ${stripHeight.toFixed(2)} px of scene is left above the sheet, under the ` +
        `${String(MIN_TAPPABLE_STRIP_PX)} px touch target: a band added above the stage has taken ` +
        "the strip a customer dismisses the sheet from. This is a product problem, not a tap to re-find.",
    );
  await page.tap("canvas", {
    position: { x: alongCanvas(found.x, canvas.height), y: stripHeight / 2 },
  });
}

function alongCanvas(foundX: number, liveHeight: number): number {
  const centre = CANVAS_THE_TAPS_WERE_FOUND_ON.width / 2;
  return (
    centre +
    (foundX - centre) * (liveHeight / CANVAS_THE_TAPS_WERE_FOUND_ON.height)
  );
}

/** The live canvas, with the one assumption the conversion rests on checked rather than trusted:
 *  the rule above holds only while the canvas keeps the width it was measured at. A shell that
 *  narrows it — a desktop rail beside the scene — changes the horizontal field by a second factor,
 *  and silently converting under that would move every tap by an amount nobody could see. */
async function canvasBox(
  page: Page,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.locator("canvas").boundingBox();
  if (!box) throw new Error("the scene canvas is not on the page");
  if (box.width !== CANVAS_THE_TAPS_WERE_FOUND_ON.width)
    throw new Error(
      `These tap constants were found on a ${String(CANVAS_THE_TAPS_WERE_FOUND_ON.width)} px ` +
        `canvas and this one is ${String(box.width)} px. Converting across a width change needs ` +
        "the horizontal field re-derived; re-find the constants instead.",
    );
  return box;
}
