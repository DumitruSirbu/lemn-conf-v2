// M7 wave 7I adversarial QA — A18's capture set, written **outside the watched tree**
// (`QA_7I_CAPTURE_DIR`, default the OS temp dir), plus three claims no spec in S4 makes:
// - the right-hand design's width note reads `widthStepNoteRight` in the real panel (the only
//   evidence for `usePanelView`'s direction wiring — no unit test can render that hook);
// - the selection outline and the tap land on a right-hand body;
// - `/internal/mirror-shot` renders both panels with zero page errors.
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { SELECTION_HIGHLIGHT_COLOR } from "@lemnaria/three-adapter";
import { expect, type Page } from "@playwright/test";

import { ro } from "../../support/romanian-content.e2e";
import {
  centreOf,
  composeRoomThroughStepOne,
  projectToCanvasX,
  projectToCanvasY,
  readScene,
  standAt,
  waitForSettleAfter,
} from "./mirror-flow";
import { countPixels, toRgb } from "./pixels";
import { FIRST_FRAME_FREEZE_TIMEOUT_MS } from "./seeded-design";

/** Covers the 302 s or more this set took on the CI runner. See ADR 0144 d2. */
export const MIRROR_CAPTURE_SET_TIMEOUT_MS = 600_000;

const CAPTURE_DIR =
  process.env.QA_7I_CAPTURE_DIR ?? path.join(tmpdir(), "qa-7i-captures");

/** A demand-driven canvas draws the outline on the frame after the selection; a screenshot taken in
 *  the same tick as the attribute change can precede it. */
const OUTLINE_FRAME_MS = 500;

/** Euclidean RGB distance from the highlight colour. The designs here are the white default kitchen,
 *  so nothing but the outline reads near `#ff2d2d` — asserted per capture below as the fixture
 *  premise (`pixels.ts`, the "near" test's own condition). */
const HIGHLIGHT_TOLERANCE = 60;
/** The left control measures well above this; a drawn outline cannot fall below it. */
const MIN_OUTLINE_PIXELS = 200;

async function highlightPixels(page: Page): Promise<number> {
  const box = await page.locator("canvas").boundingBox();
  if (!box) throw new Error("no canvas");
  return countPixels(
    page,
    { x: box.x, y: box.y, width: box.width, height: box.height },
    {
      kind: "near",
      color: toRgb(SELECTION_HIGHLIGHT_COLOR),
      tolerance: HIGHLIGHT_TOLERANCE,
    },
  );
}

const PRESETS = [
  ["overview", ro.configure.cameraPresets.overview],
  ["wallA", ro.configure.cameraPresets.wallA],
  ["wallB", ro.configure.cameraPresets.wallB],
] as const;

function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function capture(page: Page, name: string): Promise<void> {
  mkdirSync(CAPTURE_DIR, { recursive: true });
  await page.screenshot({ path: path.join(CAPTURE_DIR, `${name}.png`) });
}

async function captureEveryPreset(
  page: Page,
  designId: string,
  prefix: string,
): Promise<void> {
  for (const [slug, label] of PRESETS) {
    await page.goto(`/ro/d/${designId}`);
    await waitForSettleAfter(page, 0);
    await standAt(page, label);
    await capture(page, `${prefix}-${slug}`);
  }
}

async function chooseDepth(page: Page, depthMm: string): Promise<void> {
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

/** Taps the base-row body farthest from the corner on *Perete A* and returns its id. */
async function tapABaseBody(page: Page): Promise<string> {
  const scene = await readScene(page);
  let best: { x: number; y: number; id: string; reach: number } | undefined;
  for (const body of scene.bodies) {
    // A base cabinet (under a metre tall), not the fridge: its panel carries the width *stepper*,
    // whose note is the sentence under test.
    if (Math.abs(body.min[1]) > 0.01 || body.max[1] - body.min[1] > 1) continue;
    const centre = centreOf(body);
    const x = projectToCanvasX(centre, scene.camera, scene.canvasWidthPx);
    const y = projectToCanvasY(centre, scene.camera, scene.canvasHeightPx);
    const inside =
      x > scene.canvasWidthPx * 0.1 &&
      x < scene.canvasWidthPx * 0.9 &&
      y > scene.canvasHeightPx * 0.1 &&
      y < scene.canvasHeightPx * 0.9;
    const reach = Math.abs(centre[0]);
    if (inside && (!best || reach > best.reach)) {
      best = {
        x: scene.canvasBox.x + x,
        y: scene.canvasBox.y + y,
        id: body.placementId,
        reach,
      };
    }
  }
  if (!best) throw new Error("no base body inside the frame");
  await page.mouse.click(best.x, best.y);
  await expect(page.getByTestId("selection-debug")).toHaveAttribute(
    "data-selection-id",
    best.id,
  );
  return best.id;
}

export async function runMirrorCaptureSet(
  page: Page,
  viewport: "mobile" | "desktop",
  mintedIds: string[],
): Promise<void> {
  const errors = trackPageErrors(page);

  const left = await composeRoomThroughStepOne(page, "left");
  mintedIds.push(left.designId);
  const right = await composeRoomThroughStepOne(page, "right");
  mintedIds.push(right.designId);

  for (const [direction, design] of [
    ["left", left],
    ["right", right],
  ] as const) {
    await captureEveryPreset(
      page,
      design.designId,
      `${viewport}-${direction}-600`,
    );
  }

  // The selected body, left twin first as the control the right-hand outline is compared against.
  await page.goto(`/ro/d/${left.designId}`);
  await waitForSettleAfter(page, 0);
  await standAt(page, ro.configure.cameraPresets.wallA);
  expect(
    await highlightPixels(page),
    "premise: nothing red before a selection",
  ).toBeLessThan(20);
  const leftSelected = await tapABaseBody(page);
  await page.waitForTimeout(OUTLINE_FRAME_MS);
  await capture(page, `${viewport}-left-600-selected`);
  const leftOutlinePixels = await highlightPixels(page);

  // The selected right-hand body: outline visible, and the panel's width note is the reflected one.
  await page.goto(`/ro/d/${right.designId}`);
  await waitForSettleAfter(page, 0);
  await standAt(page, ro.configure.cameraPresets.wallA);
  expect(
    await highlightPixels(page),
    "premise: nothing red before a selection",
  ).toBeLessThan(20);
  expect(await tapABaseBody(page)).toBe(leftSelected);
  await page.waitForTimeout(OUTLINE_FRAME_MS);
  await capture(page, `${viewport}-right-600-selected`);
  const rightOutlinePixels = await highlightPixels(page);
  // The mobile sheet covers the canvas once a body is selected, so the outline is measured where it
  // is on screen: the desktop rail leaves the scene beside it.
  if (viewport === "desktop") {
    expect(
      leftOutlinePixels,
      "control: the left-hand outline is drawn",
    ).toBeGreaterThan(MIN_OUTLINE_PIXELS);
    // Soft, so the rest of the capture set still runs and is written when this fails.
    expect
      .soft(rightOutlinePixels, "the right-hand outline is drawn")
      .toBeGreaterThan(MIN_OUTLINE_PIXELS);
  }
  const widthSection = page.getByTestId("section-width");
  await widthSection.scrollIntoViewIfNeeded();
  await expect(page.getByTestId("width-step-narrower")).toBeAttached();
  await expect(widthSection).toContainText(ro.panel.widthStepNoteRight);
  await expect(widthSection).not.toContainText(ro.panel.widthStepNote);
  await capture(page, `${viewport}-right-600-width-note`);

  for (const [direction, design] of [
    ["left", left],
    ["right", right],
  ] as const) {
    await page.goto(`/ro/d/${design.designId}`);
    await waitForSettleAfter(page, 0);
    await chooseDepth(page, "700");
    await captureEveryPreset(
      page,
      design.designId,
      `${viewport}-${direction}-700`,
    );
  }

  await page.goto("/internal/mirror-shot");
  await expect(page.getByTestId("mirror-shot-left")).toHaveAttribute(
    "data-ready",
    "true",
    { timeout: FIRST_FRAME_FREEZE_TIMEOUT_MS },
  );
  await expect(page.getByTestId("mirror-shot-right")).toHaveAttribute(
    "data-ready",
    "true",
    { timeout: FIRST_FRAME_FREEZE_TIMEOUT_MS },
  );
  await capture(page, `${viewport}-mirror-shot`);

  expect(errors).toEqual([]);
}
