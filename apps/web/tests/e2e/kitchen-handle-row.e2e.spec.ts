// Wave Q2's whole-kitchen handle row (frame C2) at 390 x 844 by real touch, in a real browser (M10 Q2-a, as H1-a and
// H1-b end to end). `selection-debug.tsx` does not expose `settings.handle` and no production hook is added for a
// test, so the handle the document carries is read three ways that already exist: the stored document
// (`GET /api/designs/{id}`, the route the editor itself loads from), the marked option of the reopened sheet, and the
// number of saves the page sent.
import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

import {
  expectWriteAccessApplied,
  openSeededDesign,
  test as seededTest,
  type SeededDesign,
} from "./support/seeded-design";

const ro = JSON.parse(
  readFileSync(new URL("../../src/messages/ro.json", import.meta.url), "utf8"),
) as {
  readonly globalSettings: {
    readonly kitchenHandleHeading: string;
    readonly kitchenHandleHint: string;
  };
  readonly panel: { readonly handleLabels: Readonly<Record<string, string>> };
};

const HANDLE_ORDER = ["steel", "black", "push"] as const;
type HandleName = (typeof HANDLE_ORDER)[number];

const SHOT_DIRECTORY =
  "/private/tmp/claude-501/-Users-dimas-Documents-Personal-Projects-lemnaria-configurator-gbt/" +
  "617e1b99-28e5-4394-a5ac-0de5ce73ed5d/scratchpad/q2-shots";

const SCENE_SETTLE_MS = 2000;
const MIN_TARGET_PX = 44;
const SAVE_BUDGET_MS = 15_000;

/** A page error or a console error is a failure of the test that caused it. */
const test = seededTest.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") {
          errors.push(`console: ${message.text()}`);
        }
      });
      page.on("pageerror", (error) => {
        errors.push(`pageerror: ${error.message}`);
      });
      await use(errors);
      expect(errors, "console errors and page errors").toEqual([]);
    },
    { auto: true },
  ],
});

test.beforeEach(async ({ page, seededDesign }) => {
  // Before app boot: the hook has to exist when three.js dispatches `observe` for the renderer.
  await page.addInitScript(CAMERA_SAMPLER);
  await openSeededDesign(page, seededDesign);
  await page.waitForTimeout(SCENE_SETTLE_MS);
});

/** The document's own fields, off `selection-debug.tsx`. */
async function storedDesign(
  page: Page,
): Promise<{ readonly updatedAt: string }> {
  return page.getByTestId("selection-debug").evaluate((element) => ({
    updatedAt: element.getAttribute("data-updated-at") ?? "",
  }));
}

/** The handle the seeded mint carries since M10 R4b3: the default kitchen handle, stamped as a key while nothing is saved.
 *  These tests say the document is unchanged by what they abandon, and it holds that handle, not none. */
const MINTED_HANDLE = "steel";

/** The handle the database holds for this design, read by the route the editor loads from; `undefined` is a document
 *  that chose none. Same-origin from inside the page so the visitor and write-token cookies travel with it. */
async function handleInDatabase(
  page: Page,
  design: SeededDesign,
): Promise<string | undefined> {
  return page.evaluate(async (id) => {
    const response = await fetch(`/api/designs/${id}`, {
      credentials: "same-origin",
    });
    const body = (await response.json()) as {
      design: { settings?: { handle?: string } };
    };
    return body.design.settings?.handle;
  }, design.id);
}

async function openSheet(page: Page): Promise<void> {
  await page.getByTestId("global-settings-trigger").tap();
  await expect(page.getByTestId("global-settings-surface")).toBeVisible();
}

async function applyAndWaitForClose(page: Page): Promise<void> {
  await page.getByTestId("global-settings-apply").tap();
  await expect(page.getByTestId("global-settings-surface")).toHaveCount(0);
}

function handleOptionOf(page: Page, handle: HandleName) {
  return page
    .getByTestId("global-settings-handle-option")
    .nth(HANDLE_ORDER.indexOf(handle));
}

/** The handle the sheet marks, by the order the row renders them in. */
async function markedHandle(page: Page): Promise<HandleName | undefined> {
  for (const handle of HANDLE_ORDER) {
    const isMarked =
      (await handleOptionOf(page, handle).getAttribute("data-selected")) ===
      "true";
    if (isMarked) return handle;
  }
  return undefined;
}

async function figureOf(page: Page): Promise<number> {
  const text = await page.getByTestId("global-settings-figure").innerText();
  return Number(text.replace(/\D/g, ""));
}

/** How many saves this page sends from now on. Counted at the network, the one place "nothing was written" is
 *  observable independently of the store. */
function countSaves(page: Page): () => number {
  let saves = 0;
  page.on("request", (request) => {
    const isSave =
      ["PUT", "PATCH"].includes(request.method()) &&
      /\/api\/designs\/[^/]+$/.test(request.url());
    if (isSave) saves += 1;
  });
  return () => saves;
}

/** Brings the row to the middle of the sheet's scroll area, so a screenshot shows it and not the material group. */
async function centreHandleRow(page: Page): Promise<void> {
  await page.getByTestId("global-settings-handle-group").evaluate((group) => {
    group.scrollIntoView({ block: "center" });
  });
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${SHOT_DIRECTORY}/${name}.png` });
}

test("lists the handle row between colour and hardware with the three handles, steel marked", async ({
  page,
}) => {
  await openSheet(page);

  const heading = page
    .getByTestId("global-settings-handle-group")
    .getByRole("heading");
  await expect(heading).toHaveText(ro.globalSettings.kitchenHandleHeading);
  await expect(page.getByTestId("global-settings-handle-option")).toHaveCount(
    HANDLE_ORDER.length,
  );
  for (const handle of HANDLE_ORDER) {
    await expect(handleOptionOf(page, handle)).toContainText(
      ro.panel.handleLabels[handle] ?? "",
    );
  }
  await expect(page.getByTestId("global-settings-handle-hint")).toHaveText(
    ro.globalSettings.kitchenHandleHint,
  );
  // A design that chose no handle shows the slot's default, and only that one, as marked.
  expect(await markedHandle(page)).toBe("steel");

  // Document order: material group, colour, handle, hardware group (a second tier group), then depth.
  const order = await page.evaluate(() => {
    const surface = document.querySelector(
      '[data-testid="global-settings-surface"]',
    );
    const tierGroups = surface?.querySelectorAll(
      '[data-testid="global-settings-group"]',
    );
    const targets = [
      tierGroups?.[0],
      surface?.querySelector('[data-testid="global-settings-colour-group"]'),
      surface?.querySelector('[data-testid="global-settings-handle-group"]'),
      tierGroups?.[1],
      surface?.querySelector('[data-testid="global-settings-depth-group"]'),
    ];
    const present = targets.filter((target): target is Element =>
      Boolean(target),
    );
    if (present.length !== targets.length) return "missing";
    const followsPrevious = present.map((target, at) => {
      const previous = present[at - 1];
      return (
        previous === undefined ||
        Boolean(
          previous.compareDocumentPosition(target) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        )
      );
    });
    return followsPrevious.every(Boolean) ? "ordered" : "out of order";
  });
  expect(order).toBe("ordered");

  await shot(page, "mobile-1-sheet-open");
  await centreHandleRow(page);
  await shot(page, "mobile-1b-handle-row-default");
});

test("fits 390 px with every target at least 44 px, and apply stays reachable under the taller sheet", async ({
  page,
}) => {
  await openSheet(page);

  const widths = await page.evaluate(() => {
    const surface = document.querySelector(
      '[data-testid="global-settings-surface"]',
    );
    return {
      page: [
        document.documentElement.scrollWidth,
        document.documentElement.clientWidth,
      ],
      surface: [surface?.scrollWidth ?? -1, surface?.clientWidth ?? -2],
    };
  });
  expect(widths.page[0]).toBeLessThanOrEqual(widths.page[1] ?? 0);
  expect(widths.surface[0]).toBeLessThanOrEqual(widths.surface[1] ?? 0);

  const surfaceBox = await page
    .getByTestId("global-settings-surface")
    .boundingBox();
  if (!surfaceBox) throw new Error("no sheet");
  const targets = [
    ...(await page.getByTestId("global-settings-handle-option").all()),
    page.getByTestId("global-settings-cancel"),
    page.getByTestId("global-settings-apply"),
  ];
  for (const target of targets) {
    const box = await target.boundingBox();
    if (!box) throw new Error("a target has no box");
    expect(box.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    expect(box.width).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    expect(box.x).toBeGreaterThanOrEqual(surfaceBox.x);
    expect(box.x + box.width).toBeLessThanOrEqual(
      surfaceBox.x + surfaceBox.width + 0.5,
    );
  }

  // Apply sits inside the viewport without scrolling anything, and the content behind it scrolls: the last group is
  // reachable and ends above the footer, not under it.
  const applyBox = await page
    .getByTestId("global-settings-apply")
    .boundingBox();
  if (!applyBox) throw new Error("no apply");
  expect(applyBox.y).toBeGreaterThanOrEqual(0);
  expect(applyBox.y + applyBox.height).toBeLessThanOrEqual(844);

  const lastGroup = page.getByTestId("global-settings-depth-group");
  await lastGroup.scrollIntoViewIfNeeded();
  const scrolled = await lastGroup.evaluate((group) => {
    let scroller: HTMLElement | null = group.parentElement;
    while (scroller && scroller.scrollHeight <= scroller.clientHeight) {
      scroller = scroller.parentElement;
    }
    return scroller ? scroller.scrollHeight > scroller.clientHeight : false;
  });
  const lastBox = await lastGroup.boundingBox();
  if (!lastBox) throw new Error("no depth group");
  expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(applyBox.y + 1);
  expect(scrolled, "the sheet body scrolls: it is taller than its space").toBe(
    true,
  );

  await shot(page, "mobile-2-sheet-scrolled-to-apply");
  await page.getByTestId("global-settings-apply").tap();
  await expect(page.getByTestId("global-settings-surface")).toHaveCount(0);
});

test("choosing a handle changes nothing until apply, and cancel writes nothing", async ({
  page,
  seededDesign,
}) => {
  const savesSent = countSaves(page);
  const before = await storedDesign(page);
  expect(await handleInDatabase(page, seededDesign)).toBe(MINTED_HANDLE);

  await openSheet(page);
  const figureBefore = await figureOf(page);
  await handleOptionOf(page, "push").tap();
  expect(await markedHandle(page)).toBe("push");
  // Pending only: the stored document, the figure and the save count are where they were.
  expect(await storedDesign(page)).toEqual(before);
  expect(await figureOf(page)).toBe(figureBefore);
  await centreHandleRow(page);
  await shot(page, "mobile-3-push-chosen-pending");

  await page.getByTestId("global-settings-cancel").tap();
  await expect(page.getByTestId("global-settings-surface")).toHaveCount(0);
  await page.waitForTimeout(1500);

  expect(await storedDesign(page)).toEqual(before);
  expect(await handleInDatabase(page, seededDesign)).toBe(MINTED_HANDLE);
  expect(savesSent()).toBe(0);

  // The abandoned choice is not remembered by the next opening.
  await openSheet(page);
  expect(await markedHandle(page)).toBe("steel");
});

test("writes nothing when apply is pressed with no handle chosen", async ({
  page,
  seededDesign,
}) => {
  const savesSent = countSaves(page);
  const before = await storedDesign(page);

  await openSheet(page);
  await applyAndWaitForClose(page);
  await page.waitForTimeout(1500);

  expect(await storedDesign(page)).toEqual(before);
  expect(await handleInDatabase(page, seededDesign)).toBe(MINTED_HANDLE);
  expect(savesSent()).toBe(0);
});

test("push-to-open raises the figure and persists across a reload, and a bar handle brings the figure back", async ({
  page,
  seededDesign,
}) => {
  const savesSent = countSaves(page);
  const before = await storedDesign(page);
  await openSheet(page);
  const figureOnBars = await figureOf(page);
  await handleOptionOf(page, "push").tap();
  await applyAndWaitForClose(page);

  expect((await storedDesign(page)).updatedAt).not.toBe(before.updatedAt);
  await openSheet(page);
  expect(await markedHandle(page)).toBe("push");
  const figureOnPush = await figureOf(page);
  expect(figureOnPush).toBeGreaterThan(figureOnBars);
  await centreHandleRow(page);
  await shot(page, "mobile-4-push-applied-reopened");
  await page.getByTestId("global-settings-cancel").tap();

  // The write itself, not the store's word for it: poll the database before reloading.
  await expect
    .poll(() => handleInDatabase(page, seededDesign), {
      timeout: SAVE_BUDGET_MS,
    })
    .toBe("push");
  // The counter can count: the write that reached the database is one it saw, so its zeros above mean something.
  expect(savesSent()).toBeGreaterThanOrEqual(1);

  await page.reload();
  await expectWriteAccessApplied(page);
  await openSheet(page);
  expect(await markedHandle(page)).toBe("push");
  expect(await figureOf(page)).toBe(figureOnPush);

  await handleOptionOf(page, "steel").tap();
  await applyAndWaitForClose(page);
  await openSheet(page);
  expect(await markedHandle(page)).toBe("steel");
  expect(await figureOf(page)).toBe(figureOnBars);
  await expect
    .poll(() => handleInDatabase(page, seededDesign), {
      timeout: SAVE_BUDGET_MS,
    })
    .toBe("steel");
});

test("a second bar handle, Bara neagra, is stored without moving the figure", async ({
  page,
  seededDesign,
}) => {
  await openSheet(page);
  const figureOnSteel = await figureOf(page);
  await handleOptionOf(page, "black").tap();
  await applyAndWaitForClose(page);

  await openSheet(page);
  expect(await markedHandle(page)).toBe("black");
  expect(await figureOf(page)).toBe(figureOnSteel);
  await expect
    .poll(() => handleInDatabase(page, seededDesign), {
      timeout: SAVE_BUDGET_MS,
    })
    .toBe("black");
});

test("the scene shows the new handle and keeps the camera where the customer left it", async ({
  page,
}) => {
  // The runner paints this scene at about half a frame per second during the orbit drag and damping needs some sixty
  // frames: a software GL stack's cost, not something the test can hurry.
  test.slow();

  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("no canvas");

  // Orbit somewhere distinctive first, so the assertion is about the customer's own view.
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

  const handlesOnBars = await visibleHandleMeshes(page);
  expect(handlesOnBars, "a default kitchen draws bar handles").toBeGreaterThan(
    0,
  );
  await shot(page, "mobile-5a-scene-bar-handles");

  await openSheet(page);
  await handleOptionOf(page, "push").tap();
  const beforeApply = await paintedFrameCount(page);
  await page.getByTestId("global-settings-apply").tap();
  await expect(page.getByTestId("global-settings-surface")).toHaveCount(0);
  await expect
    .poll(() => paintedFrameCount(page), {
      message: "applying a handle paints at least one new frame",
    })
    .toBeGreaterThan(beforeApply);

  const after = await settledCamera(page, beforeApply);
  for (const axis of [0, 1, 2]) {
    expect(
      Math.abs((after.position[axis] ?? 0) - (before.position[axis] ?? 0)),
      `position axis ${String(axis)}`,
    ).toBeLessThan(DAMPING_TAIL_M);
  }
  for (const axis of [0, 1, 2, 3]) {
    expect(
      Math.abs((after.quaternion[axis] ?? 0) - (before.quaternion[axis] ?? 0)),
      `quaternion axis ${String(axis)}`,
    ).toBeLessThan(0.05);
  }

  await shot(page, "mobile-5b-scene-push-to-open");
  const handlesOnPush = await visibleHandleMeshes(page);

  // The way back: the same handles are drawn again.
  await openSheet(page);
  await handleOptionOf(page, "steel").tap();
  const beforeReturn = await paintedFrameCount(page);
  await page.getByTestId("global-settings-apply").tap();
  await expect(page.getByTestId("global-settings-surface")).toHaveCount(0);
  await expect
    .poll(() => paintedFrameCount(page), {
      message: "applying the way back paints at least one new frame",
    })
    .toBeGreaterThan(beforeReturn);
  await waitUntilNothingPaintsFor(page, RETURN_QUIET_MS);
  const handlesOnBarsAgain = await visibleHandleMeshes(page);

  // Counted off the scene graph three.js hands the renderer, not off pixels: the camera's few millimetres of damping
  // move more pixels than a handle does (measured: bars to bars-again 4397, bars to push 3379).
  expect(
    handlesOnPush,
    "push-to-open hides the cabinets' handles, so fewer are drawn",
  ).toBeLessThan(handlesOnBars);
  expect(handlesOnBarsAgain).toBe(handlesOnBars);
});

/**
 * ADR 0074 decision 7's anti-invariant, copied from `cabinet-depth.e2e.spec.ts` (nothing shared is moved): a rebuilt
 * stage must not discard the customer's orbit. The camera is read through three.js's `__THREE_DEVTOOLS__` hook,
 * installed before app boot and wrapping `render`; no production hook is added for a test.
 */
const CAMERA_SAMPLER = () => {
  const frames: { position: number[]; quaternion: number[]; at: number }[] = [];
  (window as unknown as { __cameraFrames: typeof frames }).__cameraFrames =
    frames;
  const hook = new EventTarget();
  Object.defineProperty(window, "__THREE_DEVTOOLS__", { value: hook });
  hook.addEventListener("observe", (event) => {
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
      (window as unknown as { __lastScene?: unknown }).__lastScene = scene;
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

/** OrbitControls' damping tail moves the camera ~8 mm between idle samples; an unaltered reframe moves it by hundreds
 *  of millimetres. */
const DAMPING_TAIL_M = 0.02;

interface CameraFrame {
  readonly position: readonly number[];
  readonly quaternion: readonly number[];
  readonly at: number;
}

const QUIET_FLOOR_MS = 400;
const QUIET_GAP_MULTIPLE = 6;
const GAP_WINDOW_FRAMES = 9;
const SETTLE_BUDGET_MS = process.env.CI === undefined ? 20_000 : 150_000;

async function paintedFrameCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window as unknown as { __cameraFrames?: unknown[] }).__cameraFrames
        ?.length ?? 0,
  );
}

/** How many meshes the last painted frame draws that belong to a group named `handle` (the name `barHandle` gives it,
 *  `cabinet-handle-meshes.ts`), counting only those whose own and every ancestor's `visible` is set. `push` hides the
 *  cabinets' bars by `visible = false`. Read off the scene three.js handed the renderer through the sampler. */
async function visibleHandleMeshes(page: Page): Promise<number> {
  return page.evaluate(() => {
    interface Node3D {
      name: string;
      visible: boolean;
      isMesh?: boolean;
      children: Node3D[];
    }
    const scene = (window as unknown as { __lastScene?: Node3D }).__lastScene;
    if (!scene) throw new Error("no scene was ever handed to the renderer");
    const count = (node: Node3D, isInsideHandle: boolean): number => {
      if (!node.visible) return 0;
      const isHandle = isInsideHandle || node.name === "handle";
      const own = node.isMesh === true && isHandle ? 1 : 0;
      return node.children.reduce(
        (total, child) => total + count(child, isHandle),
        own,
      );
    };
    return count(scene, false);
  });
}

/** Idle time that ends the return leg's wait. Not `settledCamera`'s rule: that scales by the widest recent frame gap,
 *  and here the window still holds the minutes-long idle gap from before the tap, so it would wait out its budget. */
const RETURN_QUIET_MS = 1500;

async function waitUntilNothingPaintsFor(
  page: Page,
  quietMs: number,
): Promise<void> {
  await page.waitForFunction(
    (quiet: number) => {
      const frames = (
        window as unknown as { __cameraFrames?: { at: number }[] }
      ).__cameraFrames;
      const last = frames?.[frames.length - 1];
      return last !== undefined && performance.now() - last.at >= quiet;
    },
    quietMs,
    { timeout: SETTLE_BUDGET_MS },
  );
}

/** The camera as the customer is left looking at it: the last frame painted, after `sinceIndex`, before the scene
 *  went quiet (see `cabinet-depth.e2e.spec.ts` for why "quiet" is the only honest definition of settled). */
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

  const frame = settled === null ? null : await settled.jsonValue();
  if (!frame) {
    throw new Error(
      `the scene was still painting after ${String(SETTLE_BUDGET_MS)} ms, so the camera never came ` +
        "to rest and no reading of it means anything",
    );
  }
  return frame;
}
