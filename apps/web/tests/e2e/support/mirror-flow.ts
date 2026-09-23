// Support for 7I-A17: the real flow, minted through Step 1 with a right-hand L, measured against
// its left-hand twin. Shared by the mobile and desktop specs so the two viewports run the same
// composition and comparison logic rather than each keeping its own copy.
import { expect, type Locator, type Page } from "@playwright/test";

import { ro } from "../../support/romanian-content.e2e";
import { issueShareLink, openSharedDesign } from "./seeded-design";

const ROOM = "/ro/configurator/room";

export interface ComposedRoom {
  readonly designId: string;
}

/** The room both twins are typed at — comfortably inside the approved bounds, so composition places
 *  every core role and the mirror is the subject rather than the generator's boundary. */
export const ROOM_DIMENSIONS = {
  wallA: "3560",
  wallB: "4250",
  height: "2700",
} as const;

function roomScreen(page: Page): Locator {
  return page.locator("main[data-room-substate]");
}

function lengthField(page: Page, field: keyof typeof ROOM_DIMENSIONS): Locator {
  return page.getByTestId(`room-length-${field}`);
}

async function typeLength(
  page: Page,
  field: keyof typeof ROOM_DIMENSIONS,
  text: string,
): Promise<void> {
  const input = lengthField(page, field);
  await input.click();
  await input.pressSequentially(text);
}

function idInEditorUrl(url: string): string {
  const id = new URL(url).pathname.split("/").pop();
  if (id === undefined || id === "") throw new Error(`no design id in ${url}`);
  return decodeURIComponent(id);
}

/**
 * Types `ROOM_DIMENSIONS` through the real Step 1 → *Continuă* → composition flow and returns the
 * minted design's id, once the editor has actually opened on it (`top-bar-title` visible, which
 * only draws after `GET /api/designs/{id}` came back with a document the schema accepted — the same
 * proof `room-to-editor.qa.e2e.spec.ts` reads).
 *
 * `direction` taps *La dreapta* before continuing when it is `"right"`; the left twin is the
 * unmodified default (D2: absent means left).
 */
export async function composeRoomThroughStepOne(
  page: Page,
  direction: "left" | "right",
): Promise<ComposedRoom> {
  await page.goto(ROOM);
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1A");

  await page.getByTestId("room-shape-card-L").click();
  await page.getByTestId("room-continue").click();
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1B");

  if (direction === "right") {
    await page.getByTestId("room-corner-control-right").check();
  }
  await typeLength(page, "wallA", ROOM_DIMENSIONS.wallA);
  await typeLength(page, "wallB", ROOM_DIMENSIONS.wallB);
  await typeLength(page, "height", ROOM_DIMENSIONS.height);
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1D");

  await page.getByTestId("room-continue").click();
  await expect(page.getByTestId("room-compose")).toBeVisible();

  await page.waitForURL(/\/ro\/d\/[^/]+$/);
  const designId = idInEditorUrl(page.url());
  await expect(page.getByTestId("top-bar-title")).toBeVisible();

  return { designId };
}

// -------------------------------------------------------------------------------------------
// The scene readout — the same instrument `ceiling-row-tappable.e2e.spec.ts` reads, restated
// here so this file owes it nothing: the projection arithmetic under test stays this file's own.
// -------------------------------------------------------------------------------------------

export interface SceneBodyBounds {
  readonly placementId: string;
  readonly min: [number, number, number];
  readonly max: [number, number, number];
}

interface SceneCamera {
  readonly projection: number[];
  readonly view: number[];
}

export async function readSettleCount(page: Page): Promise<number> {
  const raw = await page
    .getByTestId("selection-debug")
    .getAttribute("data-scene-settle-count");
  return raw ? Number(raw) : 0;
}

export async function waitForSettleAfter(
  page: Page,
  previous: number,
): Promise<number> {
  await expect(async () => {
    expect(await readSettleCount(page)).toBeGreaterThan(previous);
  }).toPass({ timeout: 20_000 });
  return readSettleCount(page);
}

export async function standAt(page: Page, label: string): Promise<void> {
  const button = page.getByRole("button", { name: label });
  if ((await button.getAttribute("aria-pressed")) === "true") return;
  const before = await readSettleCount(page);
  // `.click()`, not `.tap()`: this file runs at both viewports, and only the mobile project sets
  // `hasTouch` — a preset button's own handler reads no gesture distinction, unlike the canvas's
  // drag-vs-click check, so a plain click proves the same thing at either viewport.
  await button.click();
  await waitForSettleAfter(page, before);
}

export async function readScene(page: Page): Promise<{
  camera: SceneCamera;
  bodies: SceneBodyBounds[];
  canvasWidthPx: number;
  canvasHeightPx: number;
  canvasBox: { x: number; y: number; width: number; height: number };
}> {
  const readout = page.getByTestId("selection-debug");
  const camera = await readout.getAttribute("data-scene-camera");
  const bodies = await readout.getAttribute("data-scene-bodies");
  const canvas = await page.locator("canvas").boundingBox();
  if (!camera || !bodies) {
    throw new Error(
      "the scene readout published no measurement: is NEXT_PUBLIC_LEMNARIA_ENABLE_SELECTION_DEBUG set on the server?",
    );
  }
  if (!canvas) throw new Error("the scene canvas is not on the page");
  return {
    camera: JSON.parse(camera) as SceneCamera,
    bodies: JSON.parse(bodies) as SceneBodyBounds[],
    canvasWidthPx: canvas.width,
    canvasHeightPx: canvas.height,
    canvasBox: canvas,
  };
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

/** A world point through the published matrices, to an x in canvas pixels — `projectToCanvasY`'s
 *  own arithmetic (`ceiling-row-tappable.e2e.spec.ts`), the other axis. */
export function projectToCanvasX(
  point: readonly [number, number, number],
  camera: SceneCamera,
  canvasWidthPx: number,
): number {
  const [x, y, z] = point;
  const viewed = applyMatrix(camera.view, [x, y, z, 1]);
  const clipped = applyMatrix(camera.projection, viewed);
  const w = clipped[3];
  if (w === 0) throw new Error("a world point projected onto the camera plane");
  return ((clipped[0] / w + 1) / 2) * canvasWidthPx;
}

/** The other half of `projectToCanvasX`'s arithmetic, for the tap point's y. */
export function projectToCanvasY(
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

export function centreOf(body: SceneBodyBounds): [number, number, number] {
  return [
    (body.min[0] + body.max[0]) / 2,
    (body.min[1] + body.max[1]) / 2,
    (body.min[2] + body.max[2]) / 2,
  ];
}

export function byPlacementId(
  bodies: readonly SceneBodyBounds[],
): Map<string, SceneBodyBounds> {
  return new Map(bodies.map((body) => [body.placementId, body]));
}

// -------------------------------------------------------------------------------------------
// 7I-A17, the whole claim — run identically by the mobile and desktop specs, at each project's
// own viewport, so the two are one behavioural contract rather than two maintained copies of it.
// -------------------------------------------------------------------------------------------

const PRESET_LABELS = [
  ro.configure.cameraPresets.overview,
  ro.configure.cameraPresets.wallA,
  ro.configure.cameraPresets.wallB,
] as const;

const PIXEL_TOLERANCE_PX = 2;
const MINIMUM_COMPARED_PLACEMENTS = 5;

interface PresetMeasurement {
  readonly canvasWidthPx: number;
  readonly xPxByPlacement: ReadonlyMap<string, number>;
}

/** Every placement's projected canvas x at `label`, from a fresh load — one reload per sample
 *  (7H findings 1–2), never carried over from a previous preset's rail state. */
async function measureAtPreset(
  page: Page,
  designId: string,
  label: string,
): Promise<PresetMeasurement> {
  await page.goto(`/ro/d/${designId}`);
  await waitForSettleAfter(page, 0);
  await standAt(page, label);
  const scene = await readScene(page);
  return {
    canvasWidthPx: scene.canvasWidthPx,
    xPxByPlacement: new Map(
      scene.bodies.map((body) => [
        body.placementId,
        projectToCanvasX(centreOf(body), scene.camera, scene.canvasWidthPx),
      ]),
    ),
  };
}

/**
 * Step 1 → *La dreapta* → composition → `/d/{id}`; for every placement, its projected centre in
 * the right scene at each preset is `canvasWidth − x` of the left twin's within 2 px; a tap at that
 * reflected point selects the same placement; reload keeps the reflection; *configure*'s back link
 * lands Step 1 with *La dreapta* selected; the share view `/s/{token}` of that design is mirrored.
 *
 * `mintedIds` is the caller's own array — the caller's `afterAll` deletes it (ADR 0006), so this
 * function mints rows but never owns their cleanup.
 */
export async function runMirrorRealFlow(
  page: Page,
  mintedIds: string[],
): Promise<void> {
  const left = await composeRoomThroughStepOne(page, "left");
  mintedIds.push(left.designId);

  const leftByLabel = new Map<string, PresetMeasurement>();
  for (const label of PRESET_LABELS) {
    leftByLabel.set(label, await measureAtPreset(page, left.designId, label));
  }

  const right = await composeRoomThroughStepOne(page, "right");
  mintedIds.push(right.designId);

  let tapPoint: { x: number; y: number; placementId: string } | undefined;
  let tapPointDistanceFromCornerM = -Infinity;

  for (const label of PRESET_LABELS) {
    await page.goto(`/ro/d/${right.designId}`);
    await waitForSettleAfter(page, 0);
    await standAt(page, label);
    const rightScene = await readScene(page);
    const leftMeasurement = leftByLabel.get(label);
    if (!leftMeasurement) throw new Error(`no left measurement for ${label}`);
    expect(rightScene.canvasWidthPx, label).toBe(leftMeasurement.canvasWidthPx);

    let compared = 0;
    for (const rightBody of rightScene.bodies) {
      const leftXPx = leftMeasurement.xPxByPlacement.get(rightBody.placementId);
      // Composition is placement-id-stable under a direction flip (ADR 0129, S1's canonical-
      // generation property) — guarded rather than assumed, so a real mismatch fails loudly here
      // instead of silently comparing nothing.
      if (leftXPx === undefined) continue;
      compared += 1;

      const rightXPx = projectToCanvasX(
        centreOf(rightBody),
        rightScene.camera,
        rightScene.canvasWidthPx,
      );
      const expectedRightXPx = leftMeasurement.canvasWidthPx - leftXPx;
      expect(
        Math.abs(rightXPx - expectedRightXPx),
        `${label}/${rightBody.placementId}`,
      ).toBeLessThanOrEqual(PIXEL_TOLERANCE_PX);

      // The **base-row** placement farthest from the corner, projected safely inside the frame on
      // *Perete A*, becomes the tap target below. Base row (not wall or top) because it sits
      // mid-canvas at every preset the screenshot in this wave's QA round showed, clear of the top
      // bar and the chip row above the canvas and of the price bar below it. Farthest from the
      // corner — never the first candidate — because a corner return leg's own bounding-box centre
      // sits over empty air beside its L-shaped carcass (its footprint is not the rectangle the
      // box implies), so a tap aimed at that centre can land on the neighbouring body instead; an
      // ordinary rectangular cabinet away from the corner has no such gap.
      const isSafelyInside = (px: number, spanPx: number) =>
        px > spanPx * 0.1 && px < spanPx * 0.9;
      if (
        label === ro.configure.cameraPresets.wallA &&
        Math.abs(rightBody.min[1]) < 0.01
      ) {
        const [centreXM] = centreOf(rightBody);
        const distanceFromCornerM = Math.abs(centreXM);
        const rightYPx = projectToCanvasY(
          centreOf(rightBody),
          rightScene.camera,
          rightScene.canvasHeightPx,
        );
        if (
          distanceFromCornerM > tapPointDistanceFromCornerM &&
          isSafelyInside(rightYPx, rightScene.canvasHeightPx) &&
          isSafelyInside(rightXPx, rightScene.canvasWidthPx)
        ) {
          tapPointDistanceFromCornerM = distanceFromCornerM;
          tapPoint = {
            x: rightScene.canvasBox.x + rightXPx,
            y: rightScene.canvasBox.y + rightYPx,
            placementId: rightBody.placementId,
          };
        }
      }
    }
    expect(compared, label).toBeGreaterThanOrEqual(MINIMUM_COMPARED_PLACEMENTS);
  }

  if (!tapPoint) throw new Error("no tap point resolved on Perete A");

  // A tap at the reflected point selects the same placement.
  await page.goto(`/ro/d/${right.designId}`);
  await waitForSettleAfter(page, 0);
  await standAt(page, ro.configure.cameraPresets.wallA);
  await page.mouse.click(tapPoint.x, tapPoint.y);
  await expect(page.getByTestId("selection-debug")).toHaveAttribute(
    "data-selection-id",
    tapPoint.placementId,
  );

  // Reload keeps the reflection: the same swap holds again, from a cold load.
  await page.reload();
  await waitForSettleAfter(page, 0);
  await standAt(page, ro.configure.cameraPresets.wallA);
  const reloaded = await readScene(page);
  const leftWallA = leftByLabel.get(ro.configure.cameraPresets.wallA);
  if (!leftWallA) throw new Error("no left Perete A measurement");
  const leftXPx = leftWallA.xPxByPlacement.get(tapPoint.placementId);
  if (leftXPx === undefined) throw new Error("no left twin for tap target");
  const reloadedTarget = reloaded.bodies.find(
    (body) => body.placementId === tapPoint.placementId,
  );
  if (!reloadedTarget) throw new Error("tap target vanished after reload");
  const reloadedXPx = projectToCanvasX(
    centreOf(reloadedTarget),
    reloaded.camera,
    reloaded.canvasWidthPx,
  );
  expect(
    Math.abs(reloadedXPx - (leftWallA.canvasWidthPx - leftXPx)),
  ).toBeLessThanOrEqual(PIXEL_TOLERANCE_PX);

  // Configure's back link lands Step 1 with La dreapta selected.
  //
  // Read and followed, rather than clicked: `configure-module__I4GB0W__back` is one of D2A's two
  // top-bar arms and `configure.module.css` hides it at the desktop breakpoint in favour of the
  // wordmark (`configure-screen.tsx`'s own comment — "both are rendered and CSS hides one"), so a
  // click that first waits for it to be *visible* hangs forever on that project. The link, and
  // therefore the claim under test, exists on the page either way; following its own `href` is what
  // both viewports can prove alike.
  const backHref = await page.getByTestId("top-bar-back").getAttribute("href");
  if (!backHref) throw new Error("top-bar-back carries no href");
  expect(backHref).toContain("direction=right");
  await page.goto(backHref);
  await expect(page.getByTestId("room-corner-control-right")).toBeChecked();

  // The share view of that design is mirrored too — against its own left twin's **share** view,
  // not against the owner's `/d/{id}` measurement above: the share chrome carries no back link and
  // no owner controls, so its canvas is not the same height as the owner editor's, and comparing
  // across the two would be measuring a chrome difference rather than the mirror.
  const leftSharePath = await issueShareLink(page, {
    id: left.designId,
    revision: "",
  });
  const rightSharePath = await issueShareLink(page, {
    id: right.designId,
    revision: "",
  });
  const shareContext = await page.context().browser()?.newContext();
  if (!shareContext) throw new Error("could not open a fresh browser context");
  try {
    const leftSharePage = await shareContext.newPage();
    await openSharedDesign(leftSharePage, leftSharePath);
    await waitForSettleAfter(leftSharePage, 0);
    await standAt(leftSharePage, ro.configure.cameraPresets.wallA);
    const leftShared = await readScene(leftSharePage);

    const rightSharePage = await shareContext.newPage();
    await openSharedDesign(rightSharePage, rightSharePath);
    await waitForSettleAfter(rightSharePage, 0);
    await standAt(rightSharePage, ro.configure.cameraPresets.wallA);
    const rightShared = await readScene(rightSharePage);

    expect(rightShared.canvasWidthPx).toBe(leftShared.canvasWidthPx);
    const leftSharedByPlacement = byPlacementId(leftShared.bodies);
    let comparedInShareView = 0;
    for (const rightBody of rightShared.bodies) {
      const leftBody = leftSharedByPlacement.get(rightBody.placementId);
      if (!leftBody) continue;
      comparedInShareView += 1;
      const leftXPxShared = projectToCanvasX(
        centreOf(leftBody),
        leftShared.camera,
        leftShared.canvasWidthPx,
      );
      const rightXPxShared = projectToCanvasX(
        centreOf(rightBody),
        rightShared.camera,
        rightShared.canvasWidthPx,
      );
      expect(
        Math.abs(rightXPxShared - (leftShared.canvasWidthPx - leftXPxShared)),
        `share view/${rightBody.placementId}`,
      ).toBeLessThanOrEqual(PIXEL_TOLERANCE_PX);
    }
    expect(comparedInShareView).toBeGreaterThanOrEqual(
      MINIMUM_COMPARED_PLACEMENTS,
    );
  } finally {
    await shareContext.close();
  }
}
