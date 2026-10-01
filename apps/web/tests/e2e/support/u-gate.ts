// M7B U7 S1 and S2 — the U's gate on the phone (by touch) and on the desktop line (by click)
// (`docs/milestones/M7B-u-shaped-rooms.md`, *U7 — the plan*, D3 and D4). The steps, readouts and named
// assertions `u-gate-journeys.ts` is written from, run by `u-gate.e2e.spec.ts` and its desktop twin.
//
// **Imports, never copies** (D4): the Step 1 recorders and readouts come from `step-one-by-touch`,
// the shared U steps from `u-steps`, the design records and voids from `u-design`, the scene projection
// from `u-cutaway-scene` and `mirror-flow`, the raw-HTML readers from `ssr-html` and the per-frame
// sampler from `first-frame` (the spec imports the last two). What is written here is what none of them
// holds: a touch variant of the U's first steps (`u-steps` clicks), the wall-C edit steps, and the
// persistence and share readouts.
//
// **One gesture seam** (U7 S2): every control is reached through `press`, which taps where the browser
// has touch (the `mobile` project, 7K's rule) and clicks where it does not (the `desktop` project), and
// every digit is `pressSequentially`, which is what a soft or a hard keyboard produces. `tapScene`
// (`u-cutaway-scene`) already made the same choice for the canvas. The exception is a `goto` to a
// design's own URL, which is a reload rather than a gesture.
import { readFileSync } from "node:fs";

import {
  cabinetDepthMmOf,
  cornerAssemblyWidthsMm,
  cornerFarEdgeMm,
  type Design,
  type DesignPlacement,
  type DesignRoom,
  type DesignWall,
  type PlacementRecord,
  type VoidRecord,
} from "@lemnaria/configurator-domain";
import {
  expect,
  type BrowserContextOptions,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";

import { ro } from "../../support/romanian-content.e2e";
import type { FrameSample } from "./first-frame";
import {
  projectToCanvasX,
  projectToCanvasY,
  readScene,
  readSettleCount,
  waitForSettleAfter,
  type SceneBodyBounds,
} from "./mirror-flow";
import { storedRevision, waitForFirstSave } from "./panel";
import {
  continueButton,
  editorPath,
  idInEditorUrl,
  isEditorUrl,
  lengthField,
  readStoredDesign,
  roomScreen,
  stepSentence,
  type LengthField,
} from "./step-one-by-touch";
import {
  frontPointOf,
  pagePointOf,
  tapScene,
  type ScenePoint,
  type Vec3,
} from "./u-cutaway-scene";
import { recordsByPlacementId, voidsOf } from "./u-design";
import { cameraPresetButtons, ROOM, U_CAMERA_PRESETS } from "./u-steps";

// -------------------------------------------------------------------------------------------
// The rooms the gate types, in millimetres as a customer types them.
// -------------------------------------------------------------------------------------------

export type TypedRoom = Readonly<Record<LengthField, string>>;

const ROOM_FIELDS = [
  "wallA",
  "wallB",
  "wallC",
  "height",
] as const satisfies readonly LengthField[];

/** The middle U `u-flow` composes; wall C is 3600, so its run is longer than wall B's. */
export const MIDDLE_U = {
  wallA: "4500",
  wallB: "3000",
  wallC: "3600",
  height: "2600",
} as const satisfies TypedRoom;

/** Wall A at its approved minimum with both side walls at 1000: too small for the kitchen
 *  (`ROOM_TOO_SMALL_FOR_KITCHEN`, U7 G5), though every field is in range on its own. */
export const TOO_SMALL_U = {
  wallA: "2700",
  wallB: "1000",
  wallC: "1000",
  height: "2600",
} as const satisfies TypedRoom;

/** What wall B and wall C are corrected to from `TOO_SMALL_U`: the narrowest walkway (G5's first
 *  minimal corner, D1). */
export const NARROWEST_WALKWAY_MM = "1600";

/** `TOO_SMALL_U` with wall B and wall C corrected to the narrowest walkway: the room 1D accepts. */
export const NARROWEST_WALKWAY_U = {
  ...TOO_SMALL_U,
  wallB: NARROWEST_WALKWAY_MM,
  wallC: NARROWEST_WALKWAY_MM,
} as const satisfies TypedRoom;

/** RQ7's large U: wall A is long enough that its back wall is base-only. */
export const LARGE_U = {
  wallA: "6000",
  wallB: "6000",
  wallC: "6000",
  height: "2600",
} as const satisfies TypedRoom;

/** `room` as the settle writes it into the URL, in metres (ADR 0126). */
export function roomQueryOf(room: TypedRoom): string {
  const metres = (millimetres: string) => String(Number(millimetres) / 1000);
  return (
    `${ROOM}?shape=U&wallA=${metres(room.wallA)}&wallB=${metres(room.wallB)}` +
    `&wallC=${metres(room.wallC)}&height=${metres(room.height)}`
  );
}

/** The `DesignRoom` a stored U carries for `room`: a U has no `cornerDirection` (ADR 0132 decision 8). */
export function storedRoomOf(room: TypedRoom): DesignRoom {
  return {
    shape: "U",
    widthMm: Number(room.wallA),
    depthMm: Number(room.wallB),
    wallCMm: Number(room.wallC),
    heightMm: Number(room.height),
  };
}

// -------------------------------------------------------------------------------------------
// The gesture seam: tap on a phone, click on a desktop.
// -------------------------------------------------------------------------------------------

const pageHasTouch = new WeakMap<Page, boolean>();

async function hasTouch(page: Page): Promise<boolean> {
  const known = pageHasTouch.get(page);
  if (known !== undefined) return known;
  const isTouch = await page.evaluate(() => navigator.maxTouchPoints > 0);
  pageHasTouch.set(page, isTouch);
  return isTouch;
}

/** A finger where the browser has touch, a pointer where it does not. Never both, so a phone run is
 *  taps and nothing else, and a desktop run is clicks and nothing else. */
export async function press(page: Page, target: Locator): Promise<void> {
  if (await hasTouch(page)) await target.tap();
  else await target.click();
}

/** The line under test has the input device its name claims: a phone spec that ran without touch would
 *  click, and pass. */
export async function expectInputDevice(
  page: Page,
  device: "touch" | "pointer",
): Promise<void> {
  expect(await hasTouch(page), `the ${device} line's browser`).toBe(
    device === "touch",
  );
}

/** Focuses a length field with the line's gesture, then types its digits one keystroke at a time. */
export async function typeInField(
  page: Page,
  field: LengthField,
  digits: string,
): Promise<void> {
  const input = lengthField(page, field);
  await press(page, input);
  await input.pressSequentially(digits);
}

/** Takes the last `count` digits back off a field from the keyboard, so a correction is typed and
 *  never written over with `fill`. */
export async function eraseFromField(
  page: Page,
  field: LengthField,
  count: number,
): Promise<void> {
  const input = lengthField(page, field);
  await press(page, input);
  await input.press("End");
  for (let erased = 0; erased < count; erased += 1) {
    await input.press("Backspace");
  }
}

// -------------------------------------------------------------------------------------------
// Step 1.
// -------------------------------------------------------------------------------------------

/** 1A -> the U card -> *Continuă* -> 1B, with no shape refusal drawn on the way. */
export async function chooseU(page: Page): Promise<void> {
  await page.goto(ROOM);
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1A");
  await press(page, page.getByTestId("room-shape-card-U"));
  await expect(page.getByTestId("room-shape-refusal")).toHaveCount(0);
  await press(page, continueButton(page));
  // No `direction` key: a U has one hand and the URL it writes names none (ADR 0132 decision 8).
  await expect(page).toHaveURL(`${ROOM}?shape=U`);
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1B");
}

export async function typeRoom(page: Page, room: TypedRoom): Promise<void> {
  for (const field of ROOM_FIELDS) {
    await typeInField(page, field, room[field]);
  }
}

/** Corrects one field by the keyboard: its digits taken back off, then the new ones typed. */
export async function retype(
  page: Page,
  field: LengthField,
  { from, to }: { from: string; to: string },
): Promise<void> {
  await eraseFromField(page, field, from.length);
  await typeInField(page, field, to);
}

export async function expectStepPill(page: Page, step: number): Promise<void> {
  await expect(page.getByTestId("top-bar-step")).toHaveAttribute(
    "aria-label",
    stepSentence("ro", step),
  );
}

export async function expectRoomFields(
  page: Page,
  room: TypedRoom,
): Promise<void> {
  for (const field of ROOM_FIELDS) {
    await expect(lengthField(page, field)).toHaveValue(room[field]);
  }
}

const roMessages = JSON.parse(
  readFileSync(
    new URL("../../../src/messages/ro.json", import.meta.url),
    "utf8",
  ),
) as { room: { issue: { roomTooSmall: string } } };

/** The sentence `ROOM_TOO_SMALL_FOR_KITCHEN` is answered with (`room-issue-model.ts`), read from the
 *  catalogue the page renders and never spelled here. */
export const ROOM_TOO_SMALL_SENTENCE = roMessages.room.issue.roomTooSmall;

/** After a *client transition* to another design the page's main thread is busy for about 2.5 s under
 *  `next start` (3 s and more under `next dev`) linking the new stage's WebGL programs, and every
 *  read this test makes of the page waits behind it. The write-access check itself is not the wait: it
 *  is issued about 50 ms after the push and answers in about 50 ms (U7 S2's trace, backlog note). An
 *  assertion's default 5 s is too tight for that block under load, so the wait names its own bound,
 *  as `openSeededDesign`'s probe wait does. */
const WRITE_ACCESS_TIMEOUT_MS = 15_000;

/** The editor is drawn on `designId` with its own chips, the write-access check has answered, and the
 *  scene has settled once — the point from which a tap on the canvas means something. */
export async function expectEditorReady(
  page: Page,
  designId: string,
  expectedChips: number = U_CAMERA_PRESETS,
): Promise<void> {
  await expectStepPill(page, 2);
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByTestId("selection-debug")).toHaveAttribute(
    "data-design-id",
    designId,
  );
  await expect(cameraPresetButtons(page)).toHaveCount(expectedChips);
  await expect(page.getByTestId("global-settings-trigger")).toBeEnabled({
    timeout: WRITE_ACCESS_TIMEOUT_MS,
  });
  await waitForSettleAfter(page, 0);
}

/** 1A -> 1D -> 1F -> the editor for `room`. Returns the minted design's id once the editor
 *  is ready. The caller's fixture deletes the row (`step-one-by-touch`'s `designWrites`, ADR 0006). */
export async function composeUThroughStepOne(
  page: Page,
  room: TypedRoom,
): Promise<string> {
  await chooseU(page);
  await typeRoom(page, room);
  await expect(page).toHaveURL(roomQueryOf(room));
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1D");
  await press(page, continueButton(page));
  await page.waitForURL((url) => isEditorUrl(url, "ro"));
  const designId = idInEditorUrl(page.url());
  await expectEditorReady(page, designId);
  return designId;
}

// -------------------------------------------------------------------------------------------
// The stored document, and edits that wait for it to be saved.
// -------------------------------------------------------------------------------------------

/** `GET /api/designs/{id}` from inside the page, requiring a 200. */
export async function storedDesignOf(
  page: Page,
  designId: string,
): Promise<Design> {
  const read = await readStoredDesign(page, designId);
  expect(read.status, `GET /api/designs/${designId}`).toBe(200);
  return read.design as Design;
}

/** Runs `edit`, waits until the stored revision has moved past where it stood, and returns the
 *  document the database now holds — so a claim about an edit is a claim about what was saved. */
export async function editAndAwaitSave(
  page: Page,
  designId: string,
  edit: () => Promise<void>,
): Promise<Design> {
  const baseline = await storedRevision(page, designId);
  await edit();
  await waitForFirstSave(page, { id: designId, revision: baseline }, baseline);
  return storedDesignOf(page, designId);
}

export function recordsOf(
  design: Design,
): ReadonlyMap<string, PlacementRecord> {
  return recordsByPlacementId(design, cabinetDepthMmOf(design));
}

export function voidsOfDesign(design: Design): readonly VoidRecord[] {
  return voidsOf(design, cabinetDepthMmOf(design));
}

export function placementOf(design: Design, id: string): DesignPlacement {
  const placement = design.placements.find((candidate) => candidate.id === id);
  if (placement === undefined) throw new Error(`no placement ${id} stored`);
  return placement;
}

// -------------------------------------------------------------------------------------------
// The camera, and the scene the customer looks at.
// -------------------------------------------------------------------------------------------

export const PRESET = ro.configure.cameraPresets;

/** Taps a camera chip and waits for the ease to land. A chip already pressed is left alone: pressing
 *  it again does not settle, so waiting for a settle would hang. */
export async function standAtChip(page: Page, label: string): Promise<void> {
  const chip = page.getByRole("button", { name: label });
  if ((await chip.getAttribute("aria-pressed")) === "true") return;
  const before = await readSettleCount(page);
  await press(page, chip);
  await waitForSettleAfter(page, before);
}

/**
 * The scene readout is published when the camera's ease lands, **not when the document changes**: after
 * an edit or a depth change it still describes the previous scene (measured while writing this gate —
 * the readout read a body 600 wide after a step to 550). A settle is what republishes it, so this
 * stands at another chip and returns to `label`.
 */
export async function republishScene(page: Page, label: string): Promise<void> {
  const detour = label === PRESET.overview ? PRESET.wallA : PRESET.overview;
  await standAtChip(page, detour);
  await standAtChip(page, label);
}

export async function bodiesInScene(
  page: Page,
): Promise<ReadonlyMap<string, SceneBodyBounds>> {
  const scene = await readScene(page);
  return new Map(scene.bodies.map((body) => [body.placementId, body]));
}

function midHeightOf(body: SceneBodyBounds): number {
  return (body.min[1] + body.max[1]) / 2;
}

/** The wall's world plane for a U: A at z = 0, B at x = 0, and C at x = the room's width. */
export function wallCPlaneM(design: Design): number {
  return design.room.widthMm / 1000;
}

// -------------------------------------------------------------------------------------------
// Taps on the scene, each proven by what the selection readout says it reached.
// -------------------------------------------------------------------------------------------

export async function expectSelection(
  page: Page,
  { id, kind }: { id: string | RegExp; kind: "placement" | "void" },
): Promise<void> {
  const readout = page.getByTestId("selection-debug");
  await expect(readout).toHaveAttribute("data-selection-kind", kind);
  await expect(readout).toHaveAttribute("data-selection-id", id);
}

export interface BodyTarget {
  readonly id: string;
  readonly wall: DesignWall;
  readonly point: ScenePoint;
}

/** The first deletable base-row body of `wall` whose front projects inside the canvas at the
 *  camera's current stand. The scene readout must be fresh (`republishScene`). */
export async function findBaseBodyInView(
  page: Page,
  design: Design,
  wall: DesignWall,
): Promise<BodyTarget> {
  const bodies = await bodiesInScene(page);
  for (const record of recordsOf(design).values()) {
    if (record.wall !== wall || record.band !== "base" || !record.canDelete) {
      continue;
    }
    const body = bodies.get(record.id);
    if (body === undefined) continue;
    const point = await pagePointOf(
      page,
      frontPointOf(body, wall, midHeightOf(body)),
    );
    if (point !== undefined) return { id: record.id, wall, point };
  }
  throw new Error(
    `no deletable wall-${wall} base body projects inside the canvas at this stand`,
  );
}

export async function tapBody(page: Page, target: BodyTarget): Promise<void> {
  await tapScene(page, target.point);
  await expectSelection(page, { id: target.id, kind: "placement" });
}

export interface WallCReplacement {
  readonly before: Design;
  readonly after: Design;
  /** The replaced body's index in `placements`: a swap keeps the slot (`insert-body.ts`), not the id. */
  readonly slot: number;
  readonly replacementBuildId: string;
}

/** From `Perete C`: taps a deletable wall-C base body, then takes the first other build the panel's
 *  swap list offers. Returns the stored design before and after. */
export async function replaceWallCBase(
  page: Page,
  designId: string,
): Promise<WallCReplacement> {
  await standAtChip(page, PRESET.wallC);
  const before = await storedDesignOf(page, designId);
  const target = await findBaseBodyInView(page, before, "C");
  await tapBody(page, target);
  const replacementBuildId = await firstOtherOffer(page);
  const after = await editAndAwaitSave(page, designId, async () => {
    await press(page, offerRow(page, replacementBuildId));
  });
  const slot = before.placements.findIndex(
    (placement) => placement.id === target.id,
  );
  return { before, after, slot, replacementBuildId };
}

/** A point on the front face of an empty opening, nudged inside it: A's fronts face +z, B's +x and
 *  C's −x, and a side wall's opening is turned a quarter so its depth runs along x. */
const INSIDE_FRONT_M = 0.02;

export function frontPointOfVoid(opening: VoidRecord): Vec3 {
  const middleM = opening.y0 + opening.h / 2;
  const halfDepthM = opening.d / 2;
  if (opening.wall === "A") {
    return [opening.x, middleM, opening.z + halfDepthM - INSIDE_FRONT_M];
  }
  if (opening.wall === "B") {
    return [opening.x + halfDepthM - INSIDE_FRONT_M, middleM, opening.z];
  }
  return [opening.x - halfDepthM + INSIDE_FRONT_M, middleM, opening.z];
}

export async function pointOfVoidInView(
  page: Page,
  opening: VoidRecord,
): Promise<ScenePoint | undefined> {
  return pagePointOf(page, frontPointOfVoid(opening));
}

export interface VoidTarget {
  readonly opening: VoidRecord;
  readonly point: ScenePoint;
}

/** The first of `candidates` whose front projects inside the canvas at the camera's current stand.
 *  Throws by name when none does, so a camera change surfaces as this sentence and not as a tap in
 *  empty air. */
export async function firstVoidInView(
  page: Page,
  candidates: readonly VoidRecord[],
): Promise<VoidTarget> {
  for (const opening of candidates) {
    const point = await pointOfVoidInView(page, opening);
    if (point !== undefined) return { opening, point };
  }
  throw new Error(
    `none of ${String(candidates.length)} candidate voids projects inside the canvas at this stand`,
  );
}

export async function tapVoid(
  page: Page,
  opening: VoidRecord,
  point: ScenePoint,
): Promise<void> {
  await tapScene(page, point);
  await expectSelection(page, { id: opening.id, kind: "void" });
}

// -------------------------------------------------------------------------------------------
// The panel.
// -------------------------------------------------------------------------------------------

/** The editor's back link to Step 1: tapped on a phone. A desktop hides that arm (the wordmark stands in
 *  for it), so a click would wait on an element that never shows — its own `href` is followed instead,
 *  as `u-flow.ts` does. Both land on 1D with the room the customer typed. */
export async function followBackLink(page: Page): Promise<void> {
  const back = page.getByTestId("top-bar-back");
  if (await hasTouch(page)) {
    await back.tap();
    return;
  }
  const href = await back.getAttribute("href");
  if (href === null) throw new Error("top-bar-back carries no href");
  await page.goto(href);
}

/** The sheet covers most of the canvas; closing it is what lets the next tap reach the scene. */
export async function closeSheet(page: Page): Promise<void> {
  await dismissSheet(page);
  await expect(page.getByTestId("editor-panel")).toHaveCount(0);
}

async function dismissSheet(page: Page): Promise<void> {
  if ((await page.getByTestId("editor-panel").count()) === 0) return;
  await press(page, page.getByTestId("panel-close"));
}

/** The offer row of `buildId`, in the replace list of an occupied slot or the insert list of a void. */
export function offerRow(page: Page, buildId: string) {
  return page.getByTestId(`offer-${buildId}`);
}

/** The first offer that is not the body already standing there, with its build id read off its own
 *  test id. Throws by name when the list offers nothing else. */
export async function firstOtherOffer(page: Page): Promise<string> {
  const others = page.locator(
    '[data-testid^="offer-"][data-current="false"]:not([disabled])',
  );
  await expect(others.first()).toBeVisible();
  const testId = await others.first().getAttribute("data-testid");
  if (testId === null) throw new Error("an offer row carries no test id");
  return testId.slice("offer-".length);
}

/** Applies a cabinet depth through the whole-kitchen sheet with the line's own gesture — `u-cutaway-scene`'s
 *  own `chooseCabinetDepth` always clicks, and ADR 0023 found a click and a tap differ under this sheet. */
export async function chooseCabinetDepth(
  page: Page,
  depthMm: string,
): Promise<void> {
  await press(page, page.getByTestId("global-settings-trigger"));
  const option = page
    .getByTestId("global-settings-depth-option")
    .filter({ has: page.locator(`input[value="${depthMm}"]`) });
  await press(page, option.getByRole("radio"));
  await press(page, page.getByTestId("global-settings-apply"));
  await expect(page.getByTestId("global-settings-surface")).toHaveCount(0);
  await expect(page.getByTestId("selection-debug")).toHaveAttribute(
    "data-cabinet-depth",
    depthMm,
  );
}

// -------------------------------------------------------------------------------------------
// Wall C's geometry, read off the scene the customer sees.
// -------------------------------------------------------------------------------------------

/** Half a millimetre. Every stored length is a whole millimetre, so a body off its plane by a
 *  millimetre reads as a real step, while three.js's single-precision bounds (about 1e-7 m here) do
 *  not. */
const PLANE_TOLERANCE_M = 0.0005;

/**
 * Every wall-C body's back face stands on wall C's plane (x = the room's width). Every stored
 * wall-C placement must be in the readout, so an empty scene cannot satisfy this.
 */
export async function expectBacksOnWallC(
  page: Page,
  design: Design,
): Promise<void> {
  const bodies = await bodiesInScene(page);
  const wallCIds = recordIdsOnWall(design, "C");
  expect(wallCIds.length, "the design stores no wall-C body").toBeGreaterThan(
    0,
  );
  for (const id of wallCIds) {
    const body = bodies.get(id);
    expect(body, `${id} is not in the scene readout`).toBeDefined();
    expect(
      Math.abs((body?.max[0] ?? Number.NaN) - wallCPlaneM(design)),
      `${id}'s back face`,
    ).toBeLessThanOrEqual(PLANE_TOLERANCE_M);
  }
}

export function recordIdsOnWall(design: Design, wall: DesignWall): string[] {
  return [...recordsOf(design).values()]
    .filter((record) => record.wall === wall)
    .map((record) => record.id);
}

export interface WallCRunStart {
  /** Where the right corner's base return ends along wall C (z, metres), from the scene. */
  readonly cornerFarEdgeM: number;
  /** Where the first free wall-C base body begins (z, metres), from the scene. */
  readonly firstFreeBodyStartM: number;
}

/** Reads wall C's run start off a fresh scene readout: the right corner's base return is the one
 *  wall-C base body the domain marks `corner: "right"`, and the first free body is the lowest-z wall-C
 *  base body that is not a corner piece. */
export async function readWallCRunStart(
  page: Page,
  design: Design,
): Promise<WallCRunStart> {
  const bodies = await bodiesInScene(page);
  const baseOnC = [...recordsOf(design).values()].filter(
    (record) => record.wall === "C" && record.band === "base",
  );
  const zOf = (record: PlacementRecord, edge: "min" | "max"): number => {
    const body = bodies.get(record.id);
    if (body === undefined) throw new Error(`${record.id} is not in the scene`);
    return body[edge][2];
  };
  const corner = baseOnC.find((record) => record.corner === "right");
  if (corner === undefined) throw new Error("no right-corner base return on C");
  const freeStarts = baseOnC
    .filter((record) => record.corner === undefined)
    .map((record) => zOf(record, "min"));
  return {
    cornerFarEdgeM: zOf(corner, "max"),
    firstFreeBodyStartM: Math.min(...freeStarts),
  };
}

/**
 * Where the corner rule ends the right corner's base return along wall C at `design`'s depth, from the
 * domain and independent of the scene: ADR 0132 decision 2 sizes it as *the L room (W, C)'s* left
 * corner, whose base return stands on wall B — so the answer is that L room's wall-B far edge.
 */
export function cornerRuleFarEdgeM(design: Design): number {
  const { wallCMm } = design.room;
  if (wallCMm === undefined) throw new Error("a U stores wall C's length");
  const cabinetDepthMm = cabinetDepthMmOf(design);
  const standIn: DesignRoom = {
    shape: "L",
    widthMm: design.room.widthMm,
    depthMm: wallCMm,
    heightMm: design.room.heightMm,
  };
  const widths = cornerAssemblyWidthsMm({ cabinetDepthMm, room: standIn });
  const farEdge = cornerFarEdgeMm({
    widths,
    cabinetDepthMm,
    wall: "B",
    band: "base",
  });
  return farEdge.farEdgeMm / 1000;
}

// -------------------------------------------------------------------------------------------
// The camera chip row, and where the `wallC` chip stands the eye.
// -------------------------------------------------------------------------------------------

export interface ChipMeasure {
  readonly name: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly rightPx: number;
  readonly isTopmostAtItsCentre: boolean;
}

export async function measureCameraChips(page: Page): Promise<ChipMeasure[]> {
  return cameraPresetButtons(page).evaluateAll((buttons) =>
    buttons.map((button) => {
      const box = button.getBoundingClientRect();
      const answered = document.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2,
      );
      return {
        name: button.textContent,
        widthPx: box.width,
        heightPx: box.height,
        rightPx: box.right,
        isTopmostAtItsCentre: answered !== null && button.contains(answered),
      };
    }),
  );
}

export interface SidewaysOverflow {
  readonly documentPx: number;
  readonly viewportPx: number;
  readonly chipRowPx: number;
  readonly chipRowVisiblePx: number;
}

/** How much wider than its box the page, and the chip row, are: zero is no horizontal overflow. */
export async function measureSidewaysOverflow(
  page: Page,
): Promise<SidewaysOverflow> {
  const row = page.getByRole("group", { name: ro.configure.cameraGroupLabel });
  const rowWidths = await row.evaluate((element) => ({
    scroll: element.scrollWidth,
    client: element.clientWidth,
  }));
  return page.evaluate(
    (widths) => ({
      documentPx:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      viewportPx: window.innerWidth,
      chipRowPx: widths.scroll - widths.client,
      chipRowVisiblePx: widths.client,
    }),
    rowWidths,
  );
}

/** The direction the eye looks along, from the published view matrix (column-major; the view's third
 *  row is the camera's backward axis in world coordinates). */
export async function lookDirectionOf(page: Page): Promise<Vec3> {
  const { view } = (await readScene(page)).camera;
  const at = (index: number) => view[index] ?? 0;
  return [-at(2), -at(6), -at(10)];
}

export interface CanvasFootprint {
  readonly leftPx: number;
  readonly rightPx: number;
  readonly topPx: number;
  readonly bottomPx: number;
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
}

/** Where the union of `ids`' bounds projects, in canvas pixels, through the published camera. */
export async function footprintOfBodies(
  page: Page,
  ids: readonly string[],
): Promise<CanvasFootprint> {
  const scene = await readScene(page);
  const byId = new Map(scene.bodies.map((body) => [body.placementId, body]));
  const xs: number[] = [];
  const ys: number[] = [];
  for (const id of ids) {
    const body = byId.get(id);
    if (body === undefined) throw new Error(`${id} is not in the scene`);
    for (const corner of cornersOf(body)) {
      xs.push(projectToCanvasX(corner, scene.camera, scene.canvasWidthPx));
      ys.push(projectToCanvasY(corner, scene.camera, scene.canvasHeightPx));
    }
  }
  return {
    leftPx: Math.min(...xs),
    rightPx: Math.max(...xs),
    topPx: Math.min(...ys),
    bottomPx: Math.max(...ys),
    canvasWidthPx: scene.canvasWidthPx,
    canvasHeightPx: scene.canvasHeightPx,
  };
}

function cornersOf(body: SceneBodyBounds): Vec3[] {
  const corners: Vec3[] = [];
  for (const x of [body.min[0], body.max[0]]) {
    for (const y of [body.min[1], body.max[1]]) {
      for (const z of [body.min[2], body.max[2]]) corners.push([x, y, z]);
    }
  }
  return corners;
}

// -------------------------------------------------------------------------------------------
// The share view: the bodies it draws, and the builds its server sent.
// -------------------------------------------------------------------------------------------

/** The options of a browser of its own that looks like the project's: its viewport and touch, and
 *  nothing of the owner's cookies. */
export function contextOptionsLikeProject(
  use: TestInfo["project"]["use"],
): BrowserContextOptions {
  return {
    ...(use.viewport ? { viewport: use.viewport } : {}),
    ...(use.hasTouch ? { hasTouch: true } : {}),
    ...(use.isMobile ? { isMobile: true } : {}),
    ...(use.baseURL ? { baseURL: use.baseURL } : {}),
  };
}

export interface DrawnBody {
  readonly id: string;
  readonly min: readonly number[];
  readonly max: readonly number[];
}

/** Every mounted body's id and world bounds — camera-independent, so an editor and a share view of
 *  one design read equal wherever their cameras stand. */
export async function drawnBodies(page: Page): Promise<DrawnBody[]> {
  const scene = await readScene(page);
  return scene.bodies
    .map((body) => ({ id: body.placementId, min: body.min, max: body.max }))
    .sort((left, right) => compareCodeUnits(left.id, right.id));
}

/** The order `Array.prototype.sort` gives strings, so a sorted id list compares with a sorted body list. */
function compareCodeUnits(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/** Equal to the third decimal of a metre: three.js's single-precision bounds read the same body a few
 *  1e-7 apart between two scenes, and a whole-millimetre difference is 1e-3. */
export function expectSameBodies(
  actual: readonly DrawnBody[],
  expected: readonly DrawnBody[],
): void {
  expect(actual.map((body) => body.id)).toEqual(
    expected.map((body) => body.id),
  );
  expected.forEach((body, index) => {
    const drawn = actual[index];
    for (const axis of [0, 1, 2] as const) {
      expect(drawn?.min[axis], `${body.id} min[${String(axis)}]`).toBeCloseTo(
        body.min[axis] ?? Number.NaN,
        3,
      );
      expect(drawn?.max[axis], `${body.id} max[${String(axis)}]`).toBeCloseTo(
        body.max[axis] ?? Number.NaN,
        3,
      );
    }
  });
}

/** The `id:buildId` of every placement the server put in the page's flight payload, sorted. The design
 *  reaches the client component as a prop, so the raw HTML carries it as escaped JSON. */
export function buildsSentInHtml(html: string): string[] {
  const flight = html.replaceAll('\\"', '"');
  const pairs = flight.matchAll(
    /"id":"([^"]+)","wall":"[ABC]","alongMm":\d+,"y0Mm":\d+,"body":\{"buildId":"([^"]+)"/g,
  );
  const builds = [...pairs].map(
    ([, id, buildId]) => `${id ?? ""}:${buildId ?? ""}`,
  );
  return [...new Set(builds)].sort();
}

export function buildsStoredIn(design: Design): string[] {
  return design.placements
    .map((placement) => `${placement.id}:${placement.body.buildId}`)
    .sort();
}

// -------------------------------------------------------------------------------------------
// Frames, and what a client transition to the editor costs.
// -------------------------------------------------------------------------------------------

/** Every painted frame carried the design's own chip count, and there were frames to judge (ADR
 *  0133: zero frames at the wrong count). */
export function expectNoWrongChipFrames(
  frames: readonly FrameSample[],
  expectedChips: number,
): void {
  expect(
    frames.length,
    "the sampler saw no frame with a camera row",
  ).toBeGreaterThan(0);
  expect(frames.filter((frame) => frame.chips !== expectedChips)).toEqual([]);
}

export interface TransitionMeasure {
  /** From the router's `push` to the first frame that shows the target design's own four chips. */
  readonly toChipsMs: number;
  /** Frames painted during the transition with a camera row whose chip count was not the design's. */
  readonly wrongChipFrames: number;
}

interface TransitionProbe {
  chipsAt: number;
  wrongChipFrames: number;
}

interface TransitionOptions {
  readonly key: string;
  readonly groupLabel: string;
  readonly expectedChips: number;
  readonly targetId: string;
  readonly path: string;
}

const TRANSITION_PROBE_KEY = "__uGateTransitionProbe";

/** A transition normally paints the target's chips in 60 to 500 ms, but now and then one lands behind
 *  the same main-thread block (2.3 s and 2.7 s were measured under `next start`). The bound only
 *  separates *slow* from *never*: the slow ones are the measurement, so they are reported and not
 *  failed. */
const TRANSITION_TIMEOUT_MS = 20_000;

/** Runs in the page (serialised, so it captures nothing): pushes `path` through Next's own client
 *  router, and watches every frame from that instant until the target design's chip row is drawn over
 *  a canvas. */
function pushAndWatchTheTransition(options: TransitionOptions): number {
  const probe: TransitionProbe = { chipsAt: -1, wrongChipFrames: 0 };
  Reflect.set(window, options.key, probe);
  const watch = (): void => {
    const row = document.querySelector(
      `[role="group"][aria-label="${options.groupLabel}"]`,
    );
    const chips = row?.querySelectorAll("button").length ?? 0;
    const shownId = document
      .querySelector('[data-testid="selection-debug"]')
      ?.getAttribute("data-design-id");
    if (row !== null && chips !== options.expectedChips) {
      probe.wrongChipFrames += 1;
    }
    const isTarget = shownId === options.targetId;
    if (
      isTarget &&
      chips === options.expectedChips &&
      document.querySelector("canvas")
    ) {
      probe.chipsAt = performance.now();
      return;
    }
    requestAnimationFrame(watch);
  };
  const startedAt = performance.now();
  const router = (
    window as unknown as { next: { router: { push: (path: string) => void } } }
  ).next.router;
  router.push(options.path);
  requestAnimationFrame(watch);
  return startedAt;
}

/**
 * ADR 0133 A5: a client transition to `/d/{id}` builds a snapshot store it never reads. This pushes the
 * editor of *another* design through Next's own client router — a different `id` is a different
 * segment, so the page remounts and `ConfiguratorSnapshotProvider` builds its store again — and times
 * the push to the first frame with the target's chips. It is a client navigation, not a document load.
 * The time includes the route's own server round trip, which is most of it: the snapshot store's cost
 * is what two builds of this same measurement differ by.
 */
export async function measureClientTransitionToEditor(
  page: Page,
  targetId: string,
): Promise<TransitionMeasure> {
  const startedAt = await page.evaluate(pushAndWatchTheTransition, {
    key: TRANSITION_PROBE_KEY,
    groupLabel: ro.configure.cameraGroupLabel,
    expectedChips: U_CAMERA_PRESETS,
    targetId,
    path: editorPath("ro", targetId),
  });
  await expect
    .poll(() => readTransitionProbe(page).then((probe) => probe.chipsAt), {
      timeout: TRANSITION_TIMEOUT_MS,
    })
    .toBeGreaterThanOrEqual(0);
  const probe = await readTransitionProbe(page);
  return {
    toChipsMs: probe.chipsAt - startedAt,
    wrongChipFrames: probe.wrongChipFrames,
  };
}

async function readTransitionProbe(page: Page): Promise<TransitionProbe> {
  return page.evaluate(
    (key) => Reflect.get(window, key) as TransitionProbe,
    TRANSITION_PROBE_KEY,
  );
}
