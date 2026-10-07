import type { Page } from "@playwright/test";

import { alongThisCanvas } from "./canvas-taps";
import { openSeededDesign, type SeededDesign } from "./seeded-design";

/**
 * Navigation and selector helpers for the specs that drive §9's panel by touch; no assertion lives here
 * (`docs/best-practices/browser-and-visual-qa.md`). The numbers come from `[data-testid="selection-debug"]`, which
 * exists only in a build with `NEXT_PUBLIC_LEMNARIA_ENABLE_SELECTION_DEBUG=1` (`playwright.config.ts` sets it).
 * The column under test is the fridge column of `KITCHEN_L_DESIGN` (`B|2.45`) on wall B, framed by the "Perete B"
 * preset that `openFridgeColumnView` selects; the tap constants below depend on `CAMERA_PRESETS.wallB` and the seeded
 * design and nothing else.
 */

/** A vertical line down the middle of the fridge column, clear of the camera preset buttons. Converted through
 *  `alongThisCanvas` at every use, horizontal half only: the y positions are already fractions of the live canvas, and
 *  a shorter canvas moves a world position toward the centre (see `support/canvas-taps.ts`). Re-found by tapping (the
 *  column stands at x in [20, 45], 45 confirmed at every y), not derived from the camera, which would agree with the
 *  camera by construction. */
export const FRIDGE_COLUMN_TAP_X = 45;

/** Top of the column (the 2.6 m ceiling line) down to the floor in steps of ~2.5% of the canvas, so the shortest
 *  opening the column can hold (a 400 mm top slot, ~9.5%) is crossed by at least three taps. Fractions of the canvas,
 *  not page pixels (found as 120 to 700 down a 789 px canvas): a perspective projection scales with the viewport, and
 *  absolute pixels stopped being right when the screen's chrome changed. */
const CANVAS_HEIGHT_THE_TAPS_WERE_FOUND_ON = 789;
const FIRST_TAP_FRACTION = 120 / CANVAS_HEIGHT_THE_TAPS_WERE_FOUND_ON;
const LAST_TAP_FRACTION = 700 / CANVAS_HEIGHT_THE_TAPS_WERE_FOUND_ON;
const TAP_STEP_FRACTION = 20 / CANVAS_HEIGHT_THE_TAPS_WERE_FOUND_ON;

/** The canvas's own height, which is the viewport less whatever chrome the screen is carrying. */
async function canvasHeight(page: Page): Promise<number> {
  const box = await page.locator("canvas").boundingBox();
  if (!box) throw new Error("the scene canvas is not on the page");
  return box.height;
}

async function fridgeColumnTapYs(page: Page): Promise<number[]> {
  const height = await canvasHeight(page);
  const firstY = FIRST_TAP_FRACTION * height;
  const lastY = LAST_TAP_FRACTION * height;
  const stepY = TAP_STEP_FRACTION * height;
  return Array.from(
    { length: Math.floor((lastY - firstY) / stepY) + 1 },
    (_unused, index) => Math.round(firstY + index * stepY),
  );
}

/** The scene needs a moment to mount, seat its camera and settle its easing before a pick means
 *  anything, and again after a preset switch (`CAMERA_EASE_SECONDS` is 0.7). */
const SCENE_SETTLE_MS = 2500;
const CAMERA_SETTLE_MS = 1500;
/** One frame plus React's commit, after a tap or a command. */
const PICK_SETTLE_MS = 80;
const COMMAND_SETTLE_MS = 300;
/** The first mutation on `/d/{id}` writes rather than mints; a save is a network round trip, so it is polled for. */
const SAVE_TIMEOUT_MS = 5000;
const SAVE_POLL_MS = 100;

/** What `SelectionDebug` publishes: the selection, `describeSelection`'s `meta` numbers, and the
 *  write-path state. Every field is a string because it arrives through `dataset`; empty means
 *  "nothing selected". */
export interface SelectionReadout {
  /** The command target's own kind — `placement` or `void`. */
  readonly selectionKind: string;
  readonly selectionId: string;
  /** `meta.kind`: the body's catalogue kind, or `void` for an empty slot. */
  readonly metaKind: string;
  readonly openWMm: string;
  readonly openHMm: string;
  readonly spanHMm: string;
  readonly saveStatus: string;
  readonly designId: string;
  readonly probe: string;
  readonly rejection: string;
}

export async function openFridgeColumnView(
  page: Page,
  design: SeededDesign,
): Promise<void> {
  await openSeededDesign(page, design);
  await page.waitForTimeout(SCENE_SETTLE_MS);
  await page.getByRole("button", { name: "Perete B" }).tap();
  await page.waitForTimeout(CAMERA_SETTLE_MS);
}

/** Presses one control in the open panel — an `offer-{buildId}` row, `panel-remove`, a chip. */
export async function pressPanelControl(
  page: Page,
  testId: string,
): Promise<void> {
  await page.getByTestId(testId).tap();
  await page.waitForTimeout(COMMAND_SETTLE_MS);
}

export async function readSelection(page: Page): Promise<SelectionReadout> {
  return page.getByTestId("selection-debug").evaluate((element) => {
    const { dataset } = element as HTMLElement;
    return {
      selectionKind: dataset.selectionKind ?? "",
      selectionId: dataset.selectionId ?? "",
      metaKind: dataset.metaKind ?? "",
      openWMm: dataset.openWMm ?? "",
      openHMm: dataset.openHMm ?? "",
      spanHMm: dataset.spanHMm ?? "",
      saveStatus: dataset.saveStatus ?? "",
      designId: dataset.designId ?? "",
      probe: dataset.probe ?? "",
      rejection: dataset.rejection ?? "",
    };
  });
}

/** Clears the selection so the canvas is reachable: §9's sheet covers ~78 dvh whenever anything is selected, so every
 *  canvas tap below its top edge would be intercepted. Dismissing between taps is part of scanning a column. */
export async function dismissPanel(page: Page): Promise<void> {
  if ((await page.getByTestId("editor-panel").count()) === 0) return;
  await page.getByTestId("panel-close").tap();
  await page.waitForTimeout(PICK_SETTLE_MS);
}

/** A real touch on the canvas, at a point in the fridge column. */
export async function tapFridgeColumn(
  page: Page,
  y: number,
): Promise<SelectionReadout> {
  await dismissPanel(page);
  const x = await alongThisCanvas(page, FRIDGE_COLUMN_TAP_X);
  await page.tap("canvas", { position: { x, y } });
  await page.waitForTimeout(PICK_SETTLE_MS);
  return readSelection(page);
}

export interface ColumnTarget {
  readonly matches: (readout: SelectionReadout) => boolean;
  /** Named in the failure below, so a spec that stops says *what* it could not find. */
  readonly description: string;
}

/** Taps down the column until the wanted thing is selected and leaves it selected, so the panel is open on it.
 *  Throws by name when the whole column goes by without a match: the tap constants are pinned to
 *  `CAMERA_PRESETS.wallB` and the seeded design, and when either moves every tap misses. */
export async function requireInFridgeColumn(
  page: Page,
  target: ColumnTarget,
): Promise<SelectionReadout> {
  const seen: string[] = [];
  const tapYs = await fridgeColumnTapYs(page);
  for (const y of tapYs) {
    const readout = await tapFridgeColumn(page, y);
    if (target.matches(readout)) return readout;
    if (readout.selectionId && !seen.includes(readout.selectionId))
      seen.push(readout.selectionId);
  }
  throw new Error(
    `Nothing in the fridge column matched ${target.description}. ` +
      `${String(tapYs.length)} taps down x=${String(FRIDGE_COLUMN_TAP_X)} selected: ` +
      `${seen.join(", ") || "nothing at all"}. The tap constants in tests/e2e/support/panel.ts ` +
      `are pinned to CAMERA_PRESETS.wallB and to the seeded design — if either moved, re-find them.`,
  );
}

/** Everything the column currently contains, in top-to-bottom order, one entry per distinct
 *  selection the scan landed on. Empty taps (the background above the column) are dropped. */
export async function scanFridgeColumn(
  page: Page,
): Promise<SelectionReadout[]> {
  const found: SelectionReadout[] = [];
  for (const y of await fridgeColumnTapYs(page)) {
    const readout = await tapFridgeColumn(page, y);
    if (!readout.selectionId) continue;
    if (found.some((seen) => seen.selectionId === readout.selectionId))
      continue;
    found.push(readout);
  }
  return found;
}

/** What the scan found, reduced to the numbers the milestone's acceptance criteria are written
 *  in: an opening's width, its height, and the free span it belongs to. */
export function describeOpenings(
  readouts: readonly SelectionReadout[],
): { id: string; w: string; h: string; span: string }[] {
  return readouts.map((readout) => ({
    id: readout.selectionId,
    w: readout.openWMm,
    h: readout.openHMm,
    span: readout.spanHMm,
  }));
}

/** The design's stored revision, read as the client repository does: a fresh `GET`, never a value the page holds.
 *  Throws by name on anything but `200`. */
export async function storedRevision(page: Page, id: string): Promise<string> {
  return page.evaluate(async (designId) => {
    const response = await fetch(`/api/designs/${designId}`, {
      credentials: "same-origin",
    });
    if (!response.ok) {
      throw new Error(
        `storedRevision: GET /api/designs/${designId} answered ${String(response.status)}, wanted 200`,
      );
    }
    const payload = (await response.json()) as { revision: string };
    return payload.revision;
  }, id);
}

/**
 * Waits for the first save whose revision moves past `baselineRevision`, and returns it. On `/d/{id}` the first
 * mutation writes rather than mints, so the stored revision is polled (only a `PUT`/`PATCH` answered `200` moves it)
 * instead of racing one `waitForResponse` against a save that may already have landed. `baselineRevision` defaults
 * to `seededDesign.revision`, fixed at mint time and never updated: a second call with the default returns at once,
 * so a caller confirming a later save passes the previous call's revision. Throws by name if the deadline passes.
 */
export async function waitForFirstSave(
  page: Page,
  seededDesign: SeededDesign,
  baselineRevision: string = seededDesign.revision,
): Promise<string> {
  const deadline = Date.now() + SAVE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const revision = await storedRevision(page, seededDesign.id);
    if (BigInt(revision) > BigInt(baselineRevision)) return revision;
    await page.waitForTimeout(SAVE_POLL_MS);
  }
  throw new Error(
    `waitForFirstSave: no save for ${seededDesign.id} moved its revision past ` +
      `${baselineRevision} within ${String(SAVE_TIMEOUT_MS)}ms`,
  );
}
