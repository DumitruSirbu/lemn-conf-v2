// Does this front open without a handle bar on it: the one predicate, called by everything that needs
// the answer (ADR 0092 decision 3).
//
// A front carries a bar or a latch, never both: a latch is a manufacturer cost that must be priced, and
// a front with a bar needs none. The scene and pricing once decided this separately (the scene
// privately in `scene-sync.ts`, pricing from the recorded handle mode alone) and disagreed in both
// directions, so the demo's top-row bars were hidden while their latches were billed at zero. Two
// predicates that agree more often are still two.
//
// Its own module: not in `bands.ts` (band vocabulary in metres), and not in `hardware-mechanisms.ts`,
// which the adapter must not import to decide whether to draw a bar.
import type { Handle } from "./design.js";
import {
  resolvedHandleOf,
  type KitchenHandleSettings,
} from "./kitchen-handle/kitchen-handle.js";

/** §6.5's mode: the bars are built and hidden rather than omitted, so the choice stays reversible
 *  wherever the customer has one. */
const PUSH_TO_OPEN: Handle = "push";

/** The top row's floor in millimetres: §6.5's module line in the document's unit (§12). The one place the
 *  line is written as a comparison; `push-to-open.test.ts` holds it to the literal 2200. */
export const TOP_ROW_Y0_MM = 2_200;

/** Whether a body standing on this floor is on the top row: §6.5's module line, derived here and nowhere else. Every
 *  reader (price, scene, panel) asks it, so a change to the line moves them all together. */
export function isTopRowFloorMm(y0Mm: number): boolean {
  return y0Mm >= TOP_ROW_Y0_MM;
}

/**
 * The three facts the answer is made of: where the front's floor is, what mode the *document* records,
 * and whether the body's definition permits a mode at all. A parameter object so the facts cannot be
 * transposed. `DisplayEntry.y0Mm` supplies the floor directly and a
 * `PlacementRecord`'s `frame.y0` through `toMillimetres`; the millimetre unit is the document's own (§12).
 */
export interface PushToOpenQuery {
  /** The front's floor, in whole millimetres — not its height. */
  readonly y0Mm: number;
  /** The mode the placement records, absent when the customer has chosen none (§6.5). */
  readonly recordedHandle: Handle | undefined;
  /** The design's kitchen handle settings, followed by a cabinet with none of its own below the top row. */
  readonly kitchenSettings: KitchenHandleSettings;
  /** Whether this body's own definition permits a recorded mode (`BodyDefinition.canHandle`). */
  readonly canHandle: boolean;
}

/**
 * True when this front's handle bar is not on it, so it opens by a latch and the latch is billed.
 *
 * - The resolved handle (`resolvedHandleOf`) decides, but only where the definition permits one:
 *   `carriedAppearance` refuses to carry a mode onto a body that cannot take it, but a hand-edited or
 *   migrated document can mismatch, and a `push` on `fridge-free` (whose doors build `handle_bar`
 *   meshes) would hide bars no panel control can turn back on and bill latches for them.
 * - Otherwise the slot decides (ADR 0011 Gap C): §6.5 ships the top row push-to-open by module line,
 *   not by catalogue band.
 *
 * `canHandle: false` disqualifies the recorded mode and nothing more. It does not exempt a body from
 * latches or claim the front has no bar: `wall-corner-return-570` at `y0` 1500 has a visible bar and
 * takes no latch, while its `-top` twin has the same bar hidden by the slot, cannot be turned back on,
 * and takes one.
 */
export function isPushToOpen(front: PushToOpenQuery): boolean {
  const handle = resolvedHandleAt(front);
  return handle === undefined
    ? isTopRowFloorMm(front.y0Mm)
    : handle === PUSH_TO_OPEN;
}

/**
 * The handle this front wears, the same resolution `isPushToOpen` decides by: `undefined` where the definition takes
 * none. Exported so the scene's bar colour reads what its bar visibility reads, never `recordedHandle` alone.
 */
export function resolvedHandleAt(front: PushToOpenQuery): Handle | undefined {
  return resolvedHandleOf({
    ownHandle: front.recordedHandle,
    kitchenSettings: front.kitchenSettings,
    canHandle: front.canHandle,
    isTopRow: isTopRowFloorMm(front.y0Mm),
  });
}

/** `PushToOpenQuery` plus how many fronts open, asked only when it decides the answer: counting fronts refuses a body
 *  whose declaration cannot be read, and a list of bodies must stay total over one (the price names that failure). */
export interface WornHandleQuery extends PushToOpenQuery {
  readonly countOpeningFronts: () => number;
}

/**
 * The handle this body is read as wearing: the resolved one, else push-to-open when the body is latched and has a front
 * to latch. A body with nothing that opens (an open shelf on the top row) is billed no latch and draws no bar, so it
 * wears nothing; a top-row body that takes no handle but has doors (`wall-corner-return-570-top`) wears push.
 */
export function wornHandleAt(front: WornHandleQuery): Handle | undefined {
  const resolved = resolvedHandleAt(front);
  if (resolved !== undefined) return resolved;
  return isPushToOpen(front) && front.countOpeningFronts() > 0
    ? PUSH_TO_OPEN
    : undefined;
}
