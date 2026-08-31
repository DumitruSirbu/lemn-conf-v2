import type { Page } from "@playwright/test";

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

/** A vertical line down the middle of the fridge column, clear of the camera preset buttons. */
export const FRIDGE_COLUMN_TAP_X = 65;

/** Top of the column (the 2.6 m ceiling line) down to the floor, at 20 px. The column is ~490 px
 *  tall here, so the shortest opening M3 can produce in it — a 400 mm top slot, ~75 px — is
 *  crossed by at least three of these. */
const FIRST_TAP_Y = 120;
const LAST_TAP_Y = 700;
const TAP_Y_STEP = 20;

export const FRIDGE_COLUMN_TAP_YS: readonly number[] = Array.from(
  { length: Math.floor((LAST_TAP_Y - FIRST_TAP_Y) / TAP_Y_STEP) + 1 },
  (_unused, index) => FIRST_TAP_Y + index * TAP_Y_STEP,
);

/** The scene needs a moment to mount, seat its camera and settle its easing before a pick means
 *  anything, and again after a preset switch (`CAMERA_EASE_SECONDS` is 0.7). */
const SCENE_SETTLE_MS = 2500;
const CAMERA_SETTLE_MS = 1500;
/** One frame plus React's commit, after a tap or a command. */
const PICK_SETTLE_MS = 80;
const COMMAND_SETTLE_MS = 300;
/** The first mutation mints a design row, which is a real network round trip to the database —
 *  no fixed settle can be sized for one, so it is waited for rather than assumed. */
const MINT_TIMEOUT_MS = 5000;
const MINT_POLL_MS = 100;

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

export async function openFridgeColumnView(page: Page): Promise<void> {
  await page.goto("/configurator/configure");
  await page.waitForSelector("canvas", { state: "attached" });
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
  await page.tap("canvas", { position: { x: FRIDGE_COLUMN_TAP_X, y } });
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
  for (const y of FRIDGE_COLUMN_TAP_YS) {
    const readout = await tapFridgeColumn(page, y);
    if (target.matches(readout)) return readout;
    if (readout.selectionId && !seen.includes(readout.selectionId))
      seen.push(readout.selectionId);
  }
  throw new Error(
    `Nothing in the fridge column matched ${target.description}. ` +
      `${String(FRIDGE_COLUMN_TAP_YS.length)} taps down x=${String(FRIDGE_COLUMN_TAP_X)} selected: ` +
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
  for (const y of FRIDGE_COLUMN_TAP_YS) {
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

/**
 * Waits for the design id the first successful mutation mints, and returns `""` if it has not
 * arrived in time.
 *
 * Deliberately never throws. The caller's first job with this id is to register it for deletion
 * (ADR 0006) and only then to assert on it: a helper that threw on the slow case would skip that
 * registration and leak into the test database the very row that arrives a moment later — which
 * is the failure this helper exists to prevent.
 */
export async function waitForMintedDesignId(page: Page): Promise<string> {
  const deadline = Date.now() + MINT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const { designId } = await readSelection(page);
    if (designId) return designId;
    await page.waitForTimeout(MINT_POLL_MS);
  }
  return (await readSelection(page)).designId;
}
