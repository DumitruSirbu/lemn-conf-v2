// **Does this front open without a handle bar on it** — the one predicate, published once and
// called by everything that needs the answer.
//
// ADR 0092 decision 3, Amendment C (owner, 2026-09-06): *"push to open mechanisms cost money, and
// when you have a cabinet with handle you don't need a push to open mechanism"*. Two facts follow,
// and they are complementary: a latch is a manufacturer cost and must be priced, and a front that
// carries a bar does not carry a latch. Every opening front has one or the other.
//
// **It exists because two answers to that question shipped and disagreed in both directions.** The
// scene decided it privately in `scene-sync.ts` and hid the bars; pricing decided it again from the
// *recorded* handle mode alone. So the shipped demo's nine top-row placements had their bars hidden
// and their 16 latches billed at zero, while a migrated document recording `push` on a body whose
// definition refuses a mode was billed latches for bars the scene keeps drawing. Two predicates that
// agree more often are still two predicates, and the next divergence is not announced.
//
// **Its own module, deliberately.** Not in `bands.ts`, which owns band vocabulary in metres, and not
// in `hardware-mechanisms.ts`, which the adapter must not import to decide whether to draw a bar.
// One module, one declared fact, beside `cabinet-handles.ts` and `front-population.ts`.
import type { Handle } from "./design.js";

/** §6.5's mode: the bars are built and hidden rather than omitted, so the choice stays reversible
 *  wherever the customer has one. */
const PUSH_TO_OPEN: Handle = "push";

/** **The top row's floor, in millimetres** — §6.5's module line, in the unit the document states it
 *  in (§12).
 *
 *  **Written as a literal rather than derived from `bands.ts`'s `TOP_ROW_Y0_M`**, so that the two
 *  units are held together by a measured sweep over every floor a body can stand on
 *  (`push-to-open.test.ts`) instead of by one being computed from the other. A derived constant
 *  makes that sweep vacuous — it can only ever compare a conversion with itself — and it carries a
 *  metre literal's own rounding across a boundary this predicate is exact on either side of. */
export const TOP_ROW_Y0_MM = 2_200;

/**
 * The three facts the answer is made of, and nothing else: where the front's floor is, what mode
 * the *document* records, and whether the body's definition permits a mode at all.
 *
 * **A structural parameter object rather than three positions**, because two of the three are
 * booleans and a caller that transposed them would compile. `DisplayEntry.y0Mm` supplies the floor
 * directly and a `PlacementRecord`'s `frame.y0` supplies it through `toMillimetres`; the millimetre
 * unit is the document's own (§12), which is why it is the one this reads.
 */
export interface PushToOpenQuery {
  /** The front's floor, in whole millimetres — not its height. */
  readonly y0Mm: number;
  /** The mode the placement records, absent when the customer has chosen none (§6.5). */
  readonly recordedHandle: Handle | undefined;
  /** Whether this body's own definition permits a recorded mode (`BodyDefinition.canHandle`). */
  readonly canHandle: boolean;
}

/**
 * **True when this front's handle bar is not on it**, so it opens by a latch and the latch is
 * billed.
 *
 * Two rules, in this order:
 *
 * - **A recorded mode decides, but only where the definition permits one.** `insertBody`'s
 *   `carriedAppearance` refuses to carry a mode onto a body that cannot take it, so the command path
 *   cannot produce the mismatch — a hand-edited or migrated document can, and a `push` on
 *   `fridge-free` (whose doors do build `handle_bar` meshes) would hide bars no panel section exists
 *   to turn back on and bill latches for them.
 * - **Otherwise the slot decides** (ADR 0011 Gap C): §6.5 ships the top row push-to-open by module
 *   line, not by the body's catalogue band.
 *
 * **`canHandle: false` disqualifies the recorded mode and nothing more** (ADR 0092 decision 3,
 * Amendment C). It does not exempt a body from latches and it is not a claim that the front has no
 * bar: the corner returns declare it beside `carriesHandles(1)` and one door leaf, so
 * `wall-corner-return-570` at `y0` 1500 has a visible bar and takes no latch, while its `-top` twin
 * has the same bar hidden by the slot, cannot be turned back on, and takes one.
 */
export function isPushToOpen(front: PushToOpenQuery): boolean {
  if (front.recordedHandle && front.canHandle) {
    return front.recordedHandle === PUSH_TO_OPEN;
  }
  return front.y0Mm >= TOP_ROW_Y0_MM;
}
