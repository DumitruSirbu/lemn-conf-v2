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
import { resolvedHandleOf } from "./kitchen-handle/kitchen-handle.js";

/** §6.5's mode: the bars are built and hidden rather than omitted, so the choice stays reversible
 *  wherever the customer has one. */
const PUSH_TO_OPEN: Handle = "push";

/** The top row's floor in millimetres: §6.5's module line in the document's unit (§12). A literal, not
 *  derived from `bands.ts`'s `TOP_ROW_Y0_M`: the two units are held together by a sweep over every floor
 *  a body can stand on (`push-to-open.test.ts`), which a derived constant would make vacuous. */
export const TOP_ROW_Y0_MM = 2_200;

/**
 * The facts the answer is made of: where the front's floor is, what mode the *document* records for this
 * cabinet and for the kitchen, and whether the body's definition permits a mode at all. A parameter
 * object so the facts cannot be transposed. `DisplayEntry.y0Mm` supplies the floor directly and a
 * `PlacementRecord`'s `frame.y0` through `toMillimetres`; the millimetre unit is the document's own (§12).
 */
export interface PushToOpenQuery {
  /** The front's floor, in whole millimetres — not its height. */
  readonly y0Mm: number;
  /** The mode the placement records, absent when the customer has chosen none (§6.5). */
  readonly recordedHandle: Handle | undefined;
  /** The mode the kitchen records (`design.settings.handle`), which a cabinet with no mode of its own
   *  follows below the top row (M10 wave H1). Absent is the document that has chosen none, and answers
   *  exactly as before the field existed. */
  readonly kitchenHandle?: Handle | undefined;
  /** Whether this body's own definition permits a recorded mode (`BodyDefinition.canHandle`). */
  readonly canHandle: boolean;
}

/**
 * True when this front's handle bar is not on it, so it opens by a latch and the latch is billed.
 *
 * - The resolved handle decides (`resolvedHandleOf`: the cabinet's own mode, else the kitchen's below
 *   the top row, else the slot's default), but only where the definition permits one:
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
  const isTopRow = front.y0Mm >= TOP_ROW_Y0_MM;
  // `canHandle` is read as `unknown` and compared against `true`: the catalogue is a supplied port, so a
  // definition can arrive from outside TypeScript with a truthy non-boolean, which
  // `derivePlacementRecords` copies through uncoerced. `hardware-mechanisms.ts` coerces with `=== true`,
  // so without this the two would answer differently. `resolvedHandleOf` applies the same stricter test.
  const handle = resolvedHandleOf({
    ownHandle: front.recordedHandle,
    kitchenHandle: front.kitchenHandle,
    canHandle: front.canHandle,
    isTopRow,
  });
  return handle === undefined ? isTopRow : handle === PUSH_TO_OPEN;
}
