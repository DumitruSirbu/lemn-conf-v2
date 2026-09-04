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
import { expect, test, type Page } from "@playwright/test";

const SCENE_SETTLE_MS = 2000;

test.beforeEach(async ({ page }) => {
  // Before app boot: the hook has to exist when three.js dispatches `observe` for the renderer.
  await page.addInitScript(CAMERA_SAMPLER);
  await page.goto("/configurator/configure");
  await page.waitForSelector("canvas", { state: "attached" });
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
  const frames: { position: number[]; quaternion: number[] }[] = [];
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

/**
 * The camera once it has **stopped moving**, rather than after a fixed wait.
 *
 * OrbitControls damps, so a reading taken on a clock is a reading taken somewhere on the tail: the
 * same assertion passed alone and failed inside the full suite, where every step is slower and
 * 2000 ms lands earlier in the decay. Polling for two consecutive painted frames that agree removes
 * the wall clock from the measurement entirely — the test waits for the thing it is about to assert
 * on to be true of the scene, not for a duration someone guessed.
 *
 * The settle epsilon is far below `DAMPING_TAIL_M`: this asks "has it stopped", the assertion asks
 * "did it jump", and conflating the two would make the wait as loose as the claim.
 */
const SETTLED_M = 0.0002;

async function settledCamera(page: Page): Promise<{
  readonly position: readonly number[];
  readonly quaternion: readonly number[];
}> {
  // **Settling is best-effort, and the assertion's own tolerance is the guarantee.** R3F paints on
  // demand, so once the scene is quiet no further frame is recorded and there may be nothing left to
  // compare; under a full suite the machine is also slower, and waiting for a settle that has
  // already happened would hang. So this waits where it can and reads the last painted frame where
  // it cannot — never throwing on the wait, because a slow machine is not the defect under test.
  const settledFrame = await page
    .waitForFunction(
      (settledM: number) => {
        const frames = (
          window as unknown as {
            __cameraFrames?: { position: number[]; quaternion: number[] }[];
          }
        ).__cameraFrames;
        if (!frames || frames.length < 2) return null;
        const last = frames[frames.length - 1];
        const previous = frames[frames.length - 2];
        if (!last || !previous) return null;
        const moved = last.position.some(
          (value, axis) =>
            Math.abs(value - (previous.position[axis] ?? 0)) > settledM,
        );
        return moved ? null : last;
      },
      SETTLED_M,
      { timeout: 5_000 },
    )
    .then((handle) => handle.jsonValue())
    .catch(() => null);
  if (settledFrame) return settledFrame;

  const last = await page.evaluate(() => {
    const frames = (
      window as unknown as {
        __cameraFrames?: { position: number[]; quaternion: number[] }[];
      }
    ).__cameraFrames;
    return frames && frames.length > 0 ? frames[frames.length - 1] : null;
  });
  if (!last) throw new Error("the renderer painted no frame at all");
  return last;
}

test("keeps the camera where the customer left it across a depth change", async ({
  page,
}) => {
  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("no canvas");

  // Orbit somewhere distinctive first, so the assertion is about the customer's own view rather
  // than about the seeded one the stage would seat to anyway.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 90,
    box.y + box.height / 2 - 40,
    { steps: 12 },
  );
  await page.mouse.up();
  await page.waitForTimeout(SCENE_SETTLE_MS);
  const before = await settledCamera(page);

  await page.getByTestId("global-settings-trigger").tap();
  await chooseADepthThatIsNotCurrent(page);
  await page.getByTestId("global-settings-apply").tap();
  await expect(page.getByTestId("global-settings-surface")).toHaveCount(0);
  await page.waitForTimeout(SCENE_SETTLE_MS);

  const after = await settledCamera(page);
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
