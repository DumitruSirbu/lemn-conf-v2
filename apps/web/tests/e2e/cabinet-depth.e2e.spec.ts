// Depth control at 390 x 844 by real touch (ADR 0023: the sheet sits over the canvas, so a tap must not also arrive
// as a click). `kitchen-stage*.test.ts` mock `useMemo` and never re-render, so only a browser observes the keying.
import { expect, type Page } from "@playwright/test";

import { openSeededDesign, test } from "./support/seeded-design";

const SCENE_SETTLE_MS = 2000;

test.beforeEach(async ({ page, seededDesign }) => {
  // Before app boot: the hook has to exist when three.js dispatches `observe` for the renderer.
  await page.addInitScript(CAMERA_SAMPLER);
  await openSeededDesign(page, seededDesign);
  await page.waitForTimeout(SCENE_SETTLE_MS);
});

/** The document's own fields, off `selection-debug.tsx`, the one observability hook: nothing else on the page shows
 *  the depth the document carries. */
async function storedDesign(page: Page): Promise<{
  readonly cabinetDepthMm: string;
  readonly updatedAt: string;
}> {
  return page.getByTestId("selection-debug").evaluate((element) => ({
    cabinetDepthMm: element.getAttribute("data-cabinet-depth") ?? "",
    updatedAt: element.getAttribute("data-updated-at") ?? "",
  }));
}

/** The depth option a fresh design is not on, read off the rendered control since the declared map decides which
 *  depths exist (ADR 0056). */
async function chooseADepthThatIsNotCurrent(page: Page): Promise<string> {
  const options = page.getByTestId("global-settings-depth-option");
  const count = await options.count();
  for (let at = 0; at < count; at += 1) {
    const option = options.nth(at);
    if ((await option.getAttribute("data-selected")) === "true") continue;
    const value = await option.getByRole("radio").inputValue();
    await option.getByRole("radio").check();
    return value;
  }
  throw new Error("every declared depth is already the current one");
}

test("applies a chosen depth, and the total does not move with it", async ({
  page,
}) => {
  const before = await storedDesign(page);

  await page.getByTestId("global-settings-trigger").tap();
  const figureBefore = await page
    .getByTestId("global-settings-figure")
    .innerText();
  const chosen = await chooseADepthThatIsNotCurrent(page);
  await page.getByTestId("global-settings-apply").tap();

  await expect(page.getByTestId("global-settings-surface")).toHaveCount(0);
  const after = await storedDesign(page);
  expect(after.cabinetDepthMm).toBe(chosen);
  expect(after.updatedAt).not.toBe(before.updatedAt);

  // The depth adds no price line (the sheet's own note): the figure is the same kitchen at a different depth.
  await page.getByTestId("global-settings-trigger").tap();
  expect(await page.getByTestId("global-settings-figure").innerText()).toBe(
    figureBefore,
  );
});

test("writes nothing when a chosen depth is cancelled", async ({ page }) => {
  const before = await storedDesign(page);

  await page.getByTestId("global-settings-trigger").tap();
  await chooseADepthThatIsNotCurrent(page);
  await page.getByTestId("global-settings-cancel").tap();

  await expect(page.getByTestId("global-settings-surface")).toHaveCount(0);
  expect(await storedDesign(page)).toEqual(before);
});

test("writes nothing when apply is pressed with nothing chosen", async ({
  page,
}) => {
  const before = await storedDesign(page);

  await page.getByTestId("global-settings-trigger").tap();
  await page.getByTestId("global-settings-apply").tap();

  await expect(page.getByTestId("global-settings-surface")).toHaveCount(0);
  // `setCabinetDepth` succeeds on the current depth, so only `global-settings.tsx`'s comparison keeps Aplică from a
  // full rebuild and scene teardown (ADR 0074 decision 1); an unchanged `updatedAt` is the only evidence it ran.
  expect(await storedDesign(page)).toEqual(before);
});

/**
 * ADR 0074 decision 7's anti-invariant: the stage is rebuilt on a depth change and `seatObjectOnStage` also writes
 * `camera.position`, `near` and `far`, so re-run unaltered it discards the customer's orbit. The camera is read
 * through three.js's `__THREE_DEVTOOLS__` hook (installed before app boot, wrapping `render`), not R3F's private
 * `canvas.__r3f` root, which rots on upgrade; no production hook is added for a test. `near` and `far` are not
 * asserted: they derive from the framing distance and move with the depth.
 */
const CAMERA_SAMPLER = () => {
  // `at` is what makes "the scene is quiet" observable: see `settledCamera`.
  const frames: { position: number[]; quaternion: number[]; at: number }[] = [];
  (window as unknown as { __cameraFrames: typeof frames }).__cameraFrames =
    frames;
  const hook = new EventTarget();
  Object.defineProperty(window, "__THREE_DEVTOOLS__", { value: hook });
  hook.addEventListener("observe", (event) => {
    // `detail` is whatever the dispatcher put there, so the guard below is a real check.
    const renderer = (event as CustomEvent).detail as
      | {
          render?: (scene: unknown, camera: unknown) => unknown;
          domElement?: unknown;
          __wrapped?: boolean;
        }
      | undefined
      | null;
    if (
      !renderer ||
      typeof renderer.render !== "function" ||
      !renderer.domElement ||
      renderer.__wrapped
    ) {
      return;
    }
    renderer.__wrapped = true;
    const original = renderer.render.bind(renderer);
    renderer.render = (scene: unknown, camera: unknown) => {
      const read = camera as {
        position: { toArray: () => number[] };
        quaternion: { toArray: () => number[] };
      };
      frames.push({
        position: read.position.toArray(),
        quaternion: read.quaternion.toArray(),
        at: performance.now(),
      });
      return original(scene, camera);
    };
  });
};

/** Measured: OrbitControls' damping tail moves the camera ~8 mm between idle samples, so exact equality flakes; a
 *  real depth change moves it ~3 mm and an unaltered `seatObjectOnStage` reframes by hundreds of millimetres. */
const DAMPING_TAIL_M = 0.02;

interface CameraFrame {
  readonly position: readonly number[];
  readonly quaternion: readonly number[];
  readonly at: number;
}

/** The floor under "the renderer has stopped": once the orbit parks a warm laptop paints nothing for thirteen
 *  seconds, so a few frame slots is unambiguous. */
const QUIET_FLOOR_MS = 400;

/**
 * How many times the machine's recent frame gap must elapse with nothing painted before the scene counts as stopped.
 * A fixed 500 ms threshold failed on CI (run 34107334450), where the orbit drag ran at about 2.1 s per pointer move
 * and every frame is followed by a longer gap; scaling by the observed gap removes the dependency on paint speed.
 */
const QUIET_GAP_MULTIPLE = 6;

/** Frames the gap is measured over: long enough that the drag's own expensive frames fall out of the window once
 *  the decay is under way. */
const GAP_WINDOW_FRAMES = 9;

/**
 * The budget for reaching stillness, not a duration to wait out. The CI figure is sized from the runner's measured
 * cost (the decay is about sixty-four frames at some 2 s each, and the quiet threshold is six such gaps); if it is
 * exceeded the wait throws and says so.
 */
const SETTLE_BUDGET_MS = process.env.CI === undefined ? 20_000 : 150_000;

/** How many frames have been painted so far, so a later reading can be required to come from frames painted after
 *  an action. */
async function paintedFrameCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window as unknown as { __cameraFrames?: unknown[] }).__cameraFrames
        ?.length ?? 0,
  );
}

/**
 * The camera as the customer is left looking at it: the last frame painted before the scene went quiet, from frames
 * after `sinceIndex` (without it, quiet frames from before an action could answer and let a real reframe pass).
 * "Quiet" is the only honest definition of settled: damping is per painted frame and R3F paints on demand, so the
 * orbit parks about 3 mm short of its target and nothing is painted for thirteen seconds; waiting for two frames to
 * agree waits forever. An expired budget throws, since a number read off a moving camera fails an assertion the
 * product passes (run 34107334450 reported a 531 mm jump for a 3 mm move).
 */
async function settledCamera(
  page: Page,
  sinceIndex: number,
): Promise<CameraFrame> {
  const settled = await page
    .waitForFunction(
      ([floorMs, multiple, windowFrames, since]: readonly number[]) => {
        const frames = (window as unknown as { __cameraFrames?: CameraFrame[] })
          .__cameraFrames;
        if (!frames || frames.length < (since ?? 0) + 2) return null;

        const recent = frames.slice(-(windowFrames ?? 0));
        let widestGap = 0;
        for (let at = 1; at < recent.length; at += 1) {
          const later = recent[at];
          const earlier = recent[at - 1];
          if (!later || !earlier) return null;
          widestGap = Math.max(widestGap, later.at - earlier.at);
        }

        const last = frames[frames.length - 1];
        if (!last) return null;
        const quietMs = Math.max(floorMs ?? 0, (multiple ?? 0) * widestGap);
        return performance.now() - last.at >= quietMs ? last : null;
      },
      [
        QUIET_FLOOR_MS,
        QUIET_GAP_MULTIPLE,
        GAP_WINDOW_FRAMES,
        sinceIndex,
      ] as const,
      { timeout: SETTLE_BUDGET_MS },
    )
    .catch(() => null);

  // `waitForFunction` resolves with a handle to whatever the predicate returned, and "not yet" is `null`, so the
  // handle's value is nullable; reading it before the guard collapses both failures into a single throw.
  const frame = settled === null ? null : await settled.jsonValue();
  if (!frame) {
    throw new Error(
      `the scene was still painting after ${String(SETTLE_BUDGET_MS)} ms, so the camera never came ` +
        "to rest and no reading of it means anything",
    );
  }
  return frame;
}

test("keeps the camera where the customer left it across a depth change", async ({
  page,
}) => {
  // The runner paints this scene at about half a frame per second during the orbit drag and damping needs some sixty
  // frames: a software GL stack's cost, not something the test can hurry.
  test.slow();

  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("no canvas");

  // Orbit somewhere distinctive first, so the assertion is about the customer's own view and not the seeded one the
  // stage would seat to anyway.
  const beforeOrbit = await paintedFrameCount(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 90,
    box.y + box.height / 2 - 40,
    { steps: 12 },
  );
  await page.mouse.up();
  const before = await settledCamera(page, beforeOrbit);

  await page.getByTestId("global-settings-trigger").tap();
  await chooseADepthThatIsNotCurrent(page);
  // Read the count immediately before the tap that applies, so the reading below cannot be answered
  // by a frame the sheet painted while the depth was still the old one.
  const beforeApply = await paintedFrameCount(page);
  await page.getByTestId("global-settings-apply").tap();
  await expect(page.getByTestId("global-settings-surface")).toHaveCount(0);

  const after = await settledCamera(page, beforeApply);
  for (const axis of [0, 1, 2]) {
    expect(
      Math.abs((after.position[axis] ?? 0) - (before.position[axis] ?? 0)),
      `position axis ${String(axis)}`,
    ).toBeLessThan(DAMPING_TAIL_M);
  }
  // The orientation too: a reframed camera at the same distance would still be pointing somewhere else.
  for (const axis of [0, 1, 2, 3]) {
    expect(
      Math.abs((after.quaternion[axis] ?? 0) - (before.quaternion[axis] ?? 0)),
      `quaternion axis ${String(axis)}`,
    ).toBeLessThan(0.05);
  }
});
