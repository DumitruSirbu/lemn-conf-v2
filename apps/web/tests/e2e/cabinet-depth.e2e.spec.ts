// **Wave 6K-b's depth control, at 390 x 844, by real touch** (ADR 0023 — the sheet sits over the
// canvas, so a tap must not also arrive as a click).
//
// These four are the criteria no unit test in this repository can reach, and three of them had no
// coverage of any kind before this file. `apps/web/tests/scene/kitchen-stage*.test.ts` mock
// `useMemo` to call its factory every time and never re-render, so they cannot observe the keying at
// all (ADR 0074's own Consequences say so); and the settings suites render with
// `renderToStaticMarkup`, which cannot press *Aplică*.
//
// **The apply guard is the reason the third test exists.** `setCabinetDepth` succeeds on the depth
// the design already carries — deliberately, so re-tapping the option you are on is not refused —
// so "pressing *Aplică* without choosing anything writes nothing" is a claim about the comparison in
// `global-settings.tsx` and about nothing else. Unguarded it is a full rebuild of every body plus a
// whole-scene teardown (ADR 0074 decision 1), which is the most expensive no-op in the product.
import { expect, type Page } from "@playwright/test";

import { openSeededDesign, test } from "./support/seeded-design";

const SCENE_SETTLE_MS = 2000;

test.beforeEach(async ({ page, seededDesign }) => {
  // Before app boot: the hook has to exist when three.js dispatches `observe` for the renderer.
  await page.addInitScript(CAMERA_SAMPLER);
  await openSeededDesign(page, seededDesign);
  await page.waitForTimeout(SCENE_SETTLE_MS);
});

/** The document's own fields, off the one observability hook this application renders
 *  (`selection-debug.tsx`). The sheet shows *"700 mm"* as an option label and the scene shows a
 *  deeper kitchen, but nothing on the page shows the number the **document** carries, so
 *  "wrote it" and "wrote nothing" are unreadable without this. */
async function storedDesign(page: Page): Promise<{
  readonly cabinetDepthMm: string;
  readonly updatedAt: string;
}> {
  return page.getByTestId("selection-debug").evaluate((element) => ({
    cabinetDepthMm: element.getAttribute("data-cabinet-depth") ?? "",
    updatedAt: element.getAttribute("data-updated-at") ?? "",
  }));
}

/** The depth option a fresh design is **not** on, whatever the declared map's order — so choosing it
 *  is always a change. Read off the rendered control rather than written as 700, because the map is
 *  what decides which depths exist (ADR 0056). */
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

  // **The depth adds no price line** — the criterion the sheet's own note explains. The figure is
  // the same kitchen at a different depth.
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
  // `updatedAt` is the assertion that matters: the command would have succeeded and moved it, so an
  // unchanged timestamp is the only evidence the guard ran at all.
  expect(await storedDesign(page)).toEqual(before);
});

/**
 * **ADR 0074 decision 7's anti-invariant.** The whole stage is rebuilt on a depth change, and
 * `seatObjectOnStage` must run for the new generation — it positions and un-hides the new contact
 * blob and shadow ground — but it also writes `camera.position`, `near` and `far`. Re-run unaltered
 * it throws away the customer's orbit on every toggle: read as the scene jumping rather than the
 * kitchen deepening, and expensive to rebuild on a handset.
 *
 * **The camera is read through three.js's own devtools hook, not through an R3F internal.** An
 * earlier version reached for `canvas.__r3f.root.getState()` and failed with `no R3F root on the
 * canvas` — a private field of one `@react-three/fiber` version, which rots on an upgrade.
 * `__THREE_DEVTOOLS__` is a documented three.js integration point: installed before app boot, it
 * receives the renderer on `observe`, and wrapping `render` gives the camera of every painted frame.
 * No production hook, so the ruling that instrumenting production code for a test is its own defect
 * stands.
 *
 * `near` and `far` are deliberately not asserted: the room's bounding sphere moves with the depth
 * and they are derived from the framing distance, so they are expected to move.
 */
const CAMERA_SAMPLER = () => {
  // `at` is what makes "the scene is quiet" observable: see `settledCamera`.
  const frames: { position: number[]; quaternion: number[]; at: number }[] = [];
  (window as unknown as { __cameraFrames: typeof frames }).__cameraFrames =
    frames;
  const hook = new EventTarget();
  Object.defineProperty(window, "__THREE_DEVTOOLS__", { value: hook });
  hook.addEventListener("observe", (event) => {
    // `detail` is whatever the dispatcher put there, so the type says so and the guard below is a
    // real check rather than one the compiler already knows the answer to.
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

/**
 * **The tolerance is measured, not chosen.** OrbitControls' damping tail moves the camera while
 * nothing is happening: two idle samples taken before any interaction differed by ~8 mm. An
 * exact-equality assertion therefore flakes. A real depth change measured ~3 mm, and re-running
 * `seatObjectOnStage` unaltered would reframe the room entirely — hundreds of millimetres — so this
 * clears the tail by a wide margin and still catches the defect it is about.
 */
const DAMPING_TAIL_M = 0.02;

interface CameraFrame {
  readonly position: readonly number[];
  readonly quaternion: readonly number[];
  readonly at: number;
}

/**
 * The floor under "the renderer has stopped", for a machine fast enough that its frame gaps are
 * negligible. Measured: once the orbit parks, a warm laptop paints nothing for thirteen seconds, so
 * anything past a few frame slots is unambiguous.
 */
const QUIET_FLOOR_MS = 400;

/**
 * How many times the machine's own recent frame gap must elapse with nothing painted before the
 * scene counts as stopped.
 *
 * **The multiple is the whole point, and CI is why it exists.** A fixed 500 ms threshold was tried
 * and it failed on run 34107334450, where the twelve-step orbit drag took 25.9 s — about 2.1 s per
 * pointer move. On a machine that paints that slowly *every* frame is followed by a gap longer than
 * half a second, so a fixed threshold reports "stopped" on the first frame it ever sees. Scaling by
 * the observed gap removes the dependency on how fast the machine paints, which is the only thing
 * that differed between this laptop and the runner.
 */
const QUIET_GAP_MULTIPLE = 6;

/** How many recent frames the gap is measured over. Long enough that the expensive input-driven
 *  frames of the drag itself fall out of the window once the decay is under way. */
const GAP_WINDOW_FRAMES = 9;

/**
 * The budget for reaching that stillness. Not a duration to wait out — the wait ends as soon as the
 * scene goes quiet.
 *
 * The CI figure is sized from the runner's measured cost rather than picked: the decay runs about
 * sixty-four frames, run 34107334450 painted the drag at some 2 s a frame, and the quiet threshold
 * is itself six of those gaps. That is the pessimistic case, where nothing but this scene's software
 * GL stack is the bottleneck; if it is ever exceeded the wait throws and says so, which is a
 * diagnosable failure rather than a wrong number.
 */
const SETTLE_BUDGET_MS = process.env.CI === undefined ? 20_000 : 150_000;

/** How many frames the renderer has painted so far, so a later reading can be required to come from
 *  frames painted *after* an action rather than from the settled ones that preceded it. */
async function paintedFrameCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window as unknown as { __cameraFrames?: unknown[] }).__cameraFrames
        ?.length ?? 0,
  );
}

/**
 * The camera as the customer is left looking at it: the last frame painted before the scene went
 * quiet, from frames painted after `sinceIndex`.
 *
 * **"Quiet" is the only honest definition of settled here, because the orbit never reaches its
 * target.** Damping is applied once per painted frame, shedding about 9% of the remaining travel
 * each time, and R3F paints on demand — so when the per-frame step falls under the controls' own
 * epsilon the loop simply stops asking for frames and the camera parks wherever it had got to.
 * Measured on this laptop: the decay halts at `x = -0.331422` with 0.83 mm of travel still being
 * spent per frame, some 3 mm short of the `-0.3345` it was heading for, and then nothing is painted
 * for thirteen seconds. A rule that waits for two consecutive frames to agree therefore waits
 * forever, which is what the version before this one did.
 *
 * The threshold scales with the machine because the failure it replaces did not. A flat 500 ms was
 * meaningless on a runner whose frames are 2 s apart; six times the observed gap means the same
 * thing everywhere. And because damping is per frame rather than per second, a slow machine parks at
 * the same point a fast one does — it just takes longer to get there.
 *
 * `sinceIndex` closes the other hole: without it a reading taken after an action can be answered by
 * the quiet frames that preceded it, which would let a genuine reframe pass unseen.
 *
 * An expired budget **throws**. A number read off a moving camera is worse than no number, because
 * it fails an assertion the product passes — which is precisely how run 34107334450 reported a
 * 531 mm camera jump across a depth change that moves it 3 mm.
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

  // `waitForFunction` resolves with a handle to whatever the predicate returned, and the predicate's
  // "not yet" is `null` — so the handle's own value is nullable even though a resolved wait never
  // carries one. Reading it before the guard collapses both failures into a single throw.
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
  // The runner paints this scene at roughly half a frame per second while the orbit is being
  // dragged, and the damping then needs some sixty frames to die. That is minutes, not seconds, and
  // it is a property of a software GL stack rather than of anything this test can hurry.
  test.slow();

  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("no canvas");

  // Orbit somewhere distinctive first, so the assertion is about the customer's own view rather
  // than about the seeded one the stage would seat to anyway.
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
  // The orientation too: a reframed camera that happened to land at the same distance would still
  // be pointing somewhere else.
  for (const axis of [0, 1, 2, 3]) {
    expect(
      Math.abs((after.quaternion[axis] ?? 0) - (before.quaternion[axis] ?? 0)),
      `quaternion axis ${String(axis)}`,
    ).toBeLessThan(0.05);
  }
});
