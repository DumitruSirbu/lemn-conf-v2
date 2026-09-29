// M7B U5 adversarial QA: the instruments the U cutaway specs read the running scene with. No assertion
// lives here (`browser-and-visual-qa.md`) — only where a body projects, where the eye is, and a tap.
//
// The scene readout publishes the camera's two matrices and every mounted body's world bounds — cut
// bodies included, since `Box3.setFromObject` does not read `visible`. So *what is drawn* is never read
// from it: whether a body is cut is answered by a tap (a cut body is not pickable, A2) and by pixels.
import { expect, type Page } from "@playwright/test";

import {
  centreOf,
  projectToCanvasX,
  projectToCanvasY,
  readScene,
  type SceneBodyBounds,
} from "./mirror-flow";

export type Vec3 = readonly [number, number, number];

export interface ScenePoint {
  readonly x: number;
  readonly y: number;
}

/** The middle of the §11 row 21 band (2.20–2.60 m): the row the side presets must keep tappable. */
export const TOP_ROW_MIDDLE_M = 2.4;

/** How far inside a body's front face a tap is aimed, so an antialiased edge never takes it. */
const INSIDE_FRONT_M = 0.02;

/** A tap's pick lands on the next frame; this is the same settle the panel helpers wait. */
const PICK_SETTLE_MS = 300;

/** Keeps a tap clear of the canvas edge, where the chip row and the price bar sit. */
const CANVAS_MARGIN_FRACTION = 0.05;

type WallPlane = "A" | "B" | "C";

/** A point on the front face of `body`, mid-along, at height `yM`, nudged into the body. Wall A's
 *  fronts face +z, B's +x and C's −x (C stands at x = W). */
export function frontPointOf(
  body: SceneBodyBounds,
  wall: WallPlane,
  yM: number,
): Vec3 {
  const [centreX, , centreZ] = centreOf(body);
  if (wall === "A") return [centreX, yM, body.max[2] - INSIDE_FRONT_M];
  if (wall === "B") return [body.max[0] - INSIDE_FRONT_M, yM, centreZ];
  return [body.min[0] + INSIDE_FRONT_M, yM, centreZ];
}

/** The page coordinates `point` projects to through the camera the scene last published, or
 *  `undefined` when it falls outside the canvas's safe middle. */
export async function pagePointOf(
  page: Page,
  point: Vec3,
): Promise<ScenePoint | undefined> {
  const scene = await readScene(page);
  const x = projectToCanvasX(point, scene.camera, scene.canvasWidthPx);
  const y = projectToCanvasY(point, scene.camera, scene.canvasHeightPx);
  const isInside = (value: number, span: number) =>
    value > span * CANVAS_MARGIN_FRACTION &&
    value < span * (1 - CANVAS_MARGIN_FRACTION);
  if (!isInside(x, scene.canvasWidthPx) || !isInside(y, scene.canvasHeightPx))
    return undefined;
  return { x: scene.canvasBox.x + x, y: scene.canvasBox.y + y };
}

/** The camera's world position, read back out of the published view matrix (column-major, the
 *  inverse of the camera's world matrix): `eye = −Rᵀ·t`. */
export async function eyeOf(page: Page): Promise<Vec3> {
  const { view } = (await readScene(page)).camera;
  const at = (index: number) => view[index] ?? 0;
  const component = (column: number) =>
    -(
      at(column * 4) * at(12) +
      at(column * 4 + 1) * at(13) +
      at(column * 4 + 2) * at(14)
    );
  return [component(0), component(1), component(2)];
}

/** Whether the segment from `from` to `to` passes through `body`'s box (the slab test). Used to
 *  prove a tap is not vacuous: the sight line really does cross the run the cutaway removes. */
export function segmentCrossesBody(
  from: Vec3,
  to: Vec3,
  body: SceneBodyBounds,
): boolean {
  let enter = 0;
  let leave = 1;
  for (const axis of [0, 1, 2] as const) {
    const delta = to[axis] - from[axis];
    if (Math.abs(delta) < 1e-12) {
      if (from[axis] < body.min[axis] || from[axis] > body.max[axis])
        return false;
      continue;
    }
    const first = (body.min[axis] - from[axis]) / delta;
    const second = (body.max[axis] - from[axis]) / delta;
    enter = Math.max(enter, Math.min(first, second));
    leave = Math.min(leave, Math.max(first, second));
  }
  return enter <= leave;
}

/** A real input at `point`: a touch where the project has touch, a click where it does not — the
 *  canvas's drag-vs-click check reads either the same way. */
export async function tapScene(page: Page, point: ScenePoint): Promise<void> {
  const hasTouch = await page.evaluate(() => navigator.maxTouchPoints > 0);
  if (hasTouch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(PICK_SETTLE_MS);
}

export async function selectedId(page: Page): Promise<string> {
  return (
    (await page
      .getByTestId("selection-debug")
      .getAttribute("data-selection-id")) ?? ""
  );
}

/** Closes the panel when one is open, so the next tap reaches the canvas and not the sheet. */
export async function closePanel(page: Page): Promise<void> {
  if ((await page.getByTestId("editor-panel").count()) === 0) return;
  await page.getByTestId("panel-close").click();
  await expect(page.getByTestId("editor-panel")).toHaveCount(0);
}

/** Applies a cabinet depth through the whole-kitchen sheet, and waits for the document to carry it. */
export async function chooseCabinetDepth(
  page: Page,
  depthMm: string,
): Promise<void> {
  await page.getByTestId("global-settings-trigger").click();
  const option = page
    .getByTestId("global-settings-depth-option")
    .filter({ has: page.locator(`input[value="${depthMm}"]`) });
  await option.getByRole("radio").check();
  await page.getByTestId("global-settings-apply").click();
  await expect(page.getByTestId("global-settings-surface")).toHaveCount(0);
  await expect(page.getByTestId("selection-debug")).toHaveAttribute(
    "data-cabinet-depth",
    depthMm,
  );
}
