import type { Page } from "@playwright/test";

import { alongThisCanvas } from "./canvas-taps";
import { openSeededDesign, type SeededDesign } from "./seeded-design";

/**
 * Navigation and selector helpers for the specs that drive §9's panel by touch. No assertion lives
 * here (`docs/best-practices/browser-and-visual-qa.md`): these only move the app and read what it
 * says.
 *
 * The verbs are driven through the real panel — `panel-remove` and the `offer-{buildId}` rows —
 * which is what M4 replaced `TemporaryDevControls` with. The numbers the specs assert on come from
 * `[data-testid="selection-debug"]`, the one hook `ConfigureScreen` renders for the purpose. That
 * hook exists only in a build that set `NEXT_PUBLIC_LEMNARIA_ENABLE_SELECTION_DEBUG=1` (finding
 * WEB-004); `playwright.config.ts` sets it on the server it starts, and nothing else does.
 *
 * The column under test is the fridge column of `KITCHEN_L_DESIGN` (`B|2.45`), which stands on
 * **wall B**. The overview preset frames it behind the near cabinets, so every helper here assumes
 * the "Perete B" camera preset; `openFridgeColumnView` is what selects it. The pixel constants
 * below were found by tapping the running scene in that preset and reading the selection back —
 * they are sensitive to `CAMERA_PRESETS.wallB` and to the seeded design, and to nothing else.
 */

/** A vertical line down the middle of the fridge column, clear of the camera preset buttons.
 *
 *  **Converted through `alongThisCanvas` at every use**, and only the horizontal half of the rule:
 *  the y positions below are already fractions of the live canvas, so running the whole point
 *  through `atThisCanvas` would scale them twice. A shorter canvas widens the camera's horizontal
 *  field, so a world position moves *toward* the centre — wave 6G's band moves this line from 65 to
 *  73.75 — which no fraction of the height can express. See `support/canvas-taps.ts`.
 *
 *  **Re-measured 2026-09-16: 65 → 45.** Wave 7H made the camera presets a function of the
 *  customer's room, so *Perete B* now frames that room rather than the reference one and the
 *  columns moved across the canvas. At 65 the scan walked the **next** column down and reported
 *  `p23, p6` and a void where it wanted `p24, p7` — which is the error this constant's own message
 *  was written to produce, working exactly as intended.
 *
 *  **Re-found by tapping, not computed.** A grid of real taps was walked across the running scene
 *  in this preset and the selected id read back; the fridge column stands at x ∈ [20, 45] and 45 was
 *  confirmed at every y in the scan. Deriving it from the new camera would have made this scan agree
 *  with the camera by construction. */
export const FRIDGE_COLUMN_TAP_X = 45;

/** Top of the column (the 2.6 m ceiling line) down to the floor, in steps of ~2.5% of the canvas.
 *  The column is ~62% of the canvas here, so the shortest opening M3 can produce in it — a 400 mm
 *  top slot, ~9.5% — is crossed by at least three of these.
 *
 *  **Fractions of the canvas, not page pixels.** They were found as 120 to 700 down a 789 px
 *  canvas, which is why they are written as those numbers over that one — the provenance is the
 *  point. Absolute pixels stopped being right the moment the screen's chrome changed: wave 6C's
 *  price bar takes 92 px of the 390 × 844 viewport, so the scene shrank, the column moved up with
 *  it, and the last few taps landed past the bottom of the canvas on the bar itself. A perspective
 *  projection scales with the viewport, so a fraction follows it and a pixel does not. */
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
/** The first mutation on `/d/{id}` writes — it no longer mints (wave 7E4 G4) — and a save is a real
 *  network round trip to the database, so it is polled for rather than assumed. */
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

/**
 * Clears the selection so the canvas is reachable again.
 *
 * This is the one thing M3's dev panel did not need. That panel was collapsed by default and sat
 * at the right of the stage; §9's sheet covers ~78 dvh of a 390 × 844 viewport whenever anything is
 * selected, so every canvas tap below its top edge would be intercepted by it. Dismissing between
 * taps is therefore part of scanning a column, not a tidiness step — and it is exactly §10's own
 * viewing model, which is what a customer does to look at the scene.
 */
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

/** Taps down the column until the wanted thing is selected, and leaves it selected — so the panel
 *  is open on it when this returns, which is what the caller then presses controls in.
 *
 *  Throws by name when the whole column goes by without a match, rather than returning
 *  `undefined` and letting the caller run on. The pixel constants at the top of this file are
 *  pinned to `CAMERA_PRESETS.wallB` and to the seeded design; when either moves, every tap misses
 *  and the next person should meet this sentence immediately instead of a ten-minute test timeout
 *  pointing at a tap. */
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

/** The design's own stored revision, read the same way the client repository does — a fresh `GET`,
 *  never the value a page happens to hold in memory. Throws by name on anything but `200`, rather
 *  than parsing a body that answered the failure instead of the design. */
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
 * Waits for the next save a test's edit produces to land, and returns its revision.
 *
 * On `/d/{id}` the first successful mutation **writes** — it does not mint (wave 7E4 G4): the id
 * was already fixed by the fixture's own mint, so "an id exists" proves nothing any more. This
 * polls the design's own stored revision until it has moved past a baseline, which only a
 * `PUT`/`PATCH` answered `200` can do — `saveAuthorized`'s whole contract refuses to move it
 * otherwise — rather than racing a single `page.waitForResponse` against a save that may already
 * have landed by the time this is called.
 *
 * **The baseline is `seededDesign.revision` by default, and that is only ever the *first* save.**
 * `seededDesign.revision` is fixed at mint time and this function never updates it, so a second call
 * against the same design — after some other write has already moved the row past it — would find
 * the revision already past that stale baseline and return at once, proving nothing about the write
 * it was asked to wait for. A caller confirming a **later** save passes the revision the previous
 * `waitForFirstSave` (or an equivalent read) returned, as `baselineRevision`.
 *
 * Throws by name if the deadline passes with the revision unmoved.
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
