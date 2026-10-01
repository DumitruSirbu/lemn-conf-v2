import { expect, type Page } from "@playwright/test";

import { ro } from "../support/romanian-content.e2e";
import { openSeededDesign, test } from "./support/seeded-design";

/**
 * **M7 wave 7H criterion 11: §11 row 21, proved in a browser.**
 *
 * The 2.20–2.60 m band of every wall cabinet must project at least a tap target, at each of the
 * three camera presets, in the viewport the mobile gate is specified at. `stage.test.ts` proves the
 * same thing in node over the whole approved policy box; what a browser adds — and what node cannot
 * — is that the camera the customer is actually looking through is the one that was measured, after
 * a real ease, through a real projection matrix, at a real device pixel ratio.
 *
 * ## Three things this deliberately does not do
 *
 * **It does not measure screenshot pixels.** A count of coloured pixels answers "is something
 * there", not "how tall is that band", and the criterion rules it out.
 *
 * **It does not ask the production framing function what to expect.** The readout publishes the
 * camera's own two matrices *as the renderer holds them once the ease has landed* — the result of
 * `cameraPresetsForRoom` having been applied, not a second call to it — plus every mounted body's
 * world bounds. The band, the tap target, the choice of which bodies are the ceiling row and the
 * projection arithmetic are all this file's. Nothing is checked against the function that produced
 * it.
 *
 * **It does not wait on a timeout.** `CAMERA_EASE_SECONDS` is 0.7 s and a CI runner is roughly ten
 * times slower than a laptop at this work, so a fixed wait is a flake with a delay fuse. It waits
 * on the scene's own settle signal — and on a **counter**, because the scene is already settled
 * when a preset button is tapped and a boolean would hand back the frame before the move.
 *
 * **CI is the verdict.** The runner has a software rasteriser, its own device pixel ratio against
 * `MAX_DEVICE_PIXEL_RATIO`, and a slower ease. A green run here proves nothing about it.
 */

/** §11 row 21: the band, and what a finger needs. Declared here rather than imported, so the
 *  assertion cannot drift with the thing it is asserting about. */
const CEILING_ROW_BOTTOM_M = 2.2;
const CEILING_ROW_TOP_M = 2.6;
const MIN_TAP_TARGET_PX = 44;

/** The viewport this project pins, and the canvas inside it is shorter by whatever chrome the shell
 *  takes. The canvas's real height is read from the page rather than assumed: the band's pixel
 *  height is a fraction of the canvas, and this file must not carry a second opinion about how tall
 *  that is. */
const VIEWPORT_HEIGHT_PX = 844;

/** The three preset buttons, **by the message leaf `ConfigureScreen` renders them from** rather
 *  than by the Romanian they happen to say today. The copy is the copy lock's to own; a spec that
 *  spelled it out would be a second place it lives, and would go red for a wording change that
 *  broke nothing. */
const PRESET_LABELS = [
  ro.configure.cameraPresets.overview,
  ro.configure.cameraPresets.wallA,
  ro.configure.cameraPresets.wallB,
] as const;

interface SceneBodyBounds {
  readonly placementId: string;
  readonly min: [number, number, number];
  readonly max: [number, number, number];
}

interface SceneCamera {
  readonly projection: number[];
  readonly view: number[];
}

async function readSettleCount(page: Page): Promise<number> {
  const raw = await page
    .getByTestId("selection-debug")
    .getAttribute("data-scene-settle-count");
  return raw ? Number(raw) : 0;
}

/** Waits for the camera to land **after** `previous`, so an already-settled scene cannot answer. */
async function waitForSettleAfter(
  page: Page,
  previous: number,
): Promise<number> {
  await expect(async () => {
    expect(await readSettleCount(page)).toBeGreaterThan(previous);
  }).toPass({ timeout: 20_000 });
  return readSettleCount(page);
}

async function readScene(page: Page): Promise<{
  camera: SceneCamera;
  bodies: SceneBodyBounds[];
  canvasHeightPx: number;
}> {
  const readout = page.getByTestId("selection-debug");
  const camera = await readout.getAttribute("data-scene-camera");
  const bodies = await readout.getAttribute("data-scene-bodies");
  const canvas = await page.locator("canvas").boundingBox();
  if (!camera || !bodies)
    throw new Error(
      "the scene readout published no measurement: is NEXT_PUBLIC_LEMNARIA_ENABLE_SELECTION_DEBUG set on the server?",
    );
  if (!canvas) throw new Error("the scene canvas is not on the page");
  return {
    camera: JSON.parse(camera) as SceneCamera,
    bodies: JSON.parse(bodies) as SceneBodyBounds[],
    canvasHeightPx: canvas.height,
  };
}

/**
 * A world point through the published matrices, to a y in canvas pixels.
 *
 * Column-major, as three.js stores them: `clip = projection · view · world`, then the perspective
 * divide, then NDC to pixels. Written out rather than imported from three so that the arithmetic
 * under test is this file's own.
 */
function projectToCanvasY(
  point: readonly [number, number, number],
  camera: SceneCamera,
  canvasHeightPx: number,
): number {
  const [x, y, z] = point;
  const viewed = applyMatrix(camera.view, [x, y, z, 1]);
  const clipped = applyMatrix(camera.projection, viewed);
  const w = clipped[3];
  if (w === 0) throw new Error("a world point projected onto the camera plane");
  return ((1 - clipped[1] / w) / 2) * canvasHeightPx;
}

function applyMatrix(
  m: readonly number[],
  v: readonly [number, number, number, number],
): [number, number, number, number] {
  const at = (index: number) => m[index] ?? 0;
  return [
    at(0) * v[0] + at(4) * v[1] + at(8) * v[2] + at(12) * v[3],
    at(1) * v[0] + at(5) * v[1] + at(9) * v[2] + at(13) * v[3],
    at(2) * v[0] + at(6) * v[1] + at(10) * v[2] + at(14) * v[3],
    at(3) * v[0] + at(7) * v[1] + at(11) * v[2] + at(15) * v[3],
  ];
}

/** The ceiling row, chosen by **where a body stands** rather than by what it is called: a body whose
 *  bounds start at the band's floor is in the row. Wave 7D3's D8 keeps composition out of this band,
 *  so a generated kitchen has none — the seeded design does, and that is the one this route loads. */
function ceilingRowBodies(bodies: SceneBodyBounds[]): SceneBodyBounds[] {
  return bodies.filter(
    (body) => Math.abs(body.min[1] - CEILING_ROW_BOTTOM_M) < 0.01,
  );
}

/**
 * Puts the scene on `label` and returns once it is settled there.
 *
 * **Tapping the preset the customer is already standing at moves nothing**, and correctly so: the
 * resolved view is unchanged, so the goal effect does not re-run and no ease begins. A spec that
 * waited for a fresh settle after such a tap would wait forever — which is what the first version
 * of this file did, on *Vedere generală*, the preset the page opens at. So the already-pressed case
 * is answered from the standing frame, which is genuinely settled, and only a real change waits.
 */
async function standAt(page: Page, label: string): Promise<void> {
  const button = page.getByRole("button", { name: label });
  if ((await button.getAttribute("aria-pressed")) === "true") return;
  const before = await readSettleCount(page);
  await button.tap();
  await waitForSettleAfter(page, before);
}

test.describe("the ceiling row stays tappable in a browser", () => {
  // Three camera eases and a cold scene compile. The waits below are all on the scene's own signal;
  // this only stops the clock from being the thing that fails on a slow runner.
  test.setTimeout(120_000);

  test.beforeEach(async ({ page, seededDesign }) => {
    await openSeededDesign(page, seededDesign);
    // The first settle is the stage seating itself; every later one is a preset landing.
    await waitForSettleAfter(page, 0);
  });

  test("finds ceiling-row bodies to measure, so the sweep below is not vacuous", async ({
    page,
  }) => {
    const { bodies } = await readScene(page);

    expect(bodies.length).toBeGreaterThan(10);
    expect(ceilingRowBodies(bodies).length).toBeGreaterThan(3);
  });

  test("projects the 2.20-2.60 row taller than a tap target at every preset", async ({
    page,
  }) => {
    const measured: string[] = [];

    for (const label of PRESET_LABELS) {
      await standAt(page, label);

      const { camera, bodies, canvasHeightPx } = await readScene(page);
      expect(
        canvasHeightPx,
        "the canvas cannot be taller than the viewport it sits in",
      ).toBeLessThanOrEqual(VIEWPORT_HEIGHT_PX);

      const row = ceilingRowBodies(bodies);
      expect(
        row.length,
        `${label}: no ceiling-row body to measure`,
      ).toBeGreaterThan(3);

      for (const body of row) {
        const centreX = (body.min[0] + body.max[0]) / 2;
        const centreZ = (body.min[2] + body.max[2]) / 2;
        const bottom = projectToCanvasY(
          [centreX, CEILING_ROW_BOTTOM_M, centreZ],
          camera,
          canvasHeightPx,
        );
        const top = projectToCanvasY(
          [centreX, CEILING_ROW_TOP_M, centreZ],
          camera,
          canvasHeightPx,
        );
        const bandPx = Math.abs(bottom - top);
        measured.push(`${label}/${body.placementId}=${bandPx.toFixed(1)}`);
        expect(
          bandPx,
          `${label}: ${body.placementId} projects ${bandPx.toFixed(1)} px`,
        ).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX);
      }
    }

    // Non-vacuity: three presets were really visited and each really measured a row.
    expect(new Set(measured.map((entry) => entry.split("/")[0])).size).toBe(
      PRESET_LABELS.length,
    );
  });
});
