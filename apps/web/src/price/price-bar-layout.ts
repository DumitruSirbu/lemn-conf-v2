// **Why the price bar cannot cover the selected cabinet**, expressed as the one number both the
// stylesheet and the 390 × 844 gate read.
//
// The hard constraint (M6 acceptance criteria, frame 2A's own caption — *"Bara de preț nu acoperă
// corpul selectat"*) is met **structurally, not by tuning**: the bar is a flow sibling of the
// stage, never an overlay on it. Whatever height it takes, the scene's box is what is left above
// it, so the two boxes cannot intersect. A future edit that gives the bar `position: absolute` over
// the stage is what would break the constraint, and it would break this file's premise first.
//
// The band below is a **reserve**, not a ceiling: the flagged-total warning (ADR 0065 decision 7b)
// wraps on a narrow viewport and the bar grows. Growing only shrinks the scene further, which is
// why the gate can assert against a reserve and stay honest.

/** The bar's minimum height in CSS pixels, published to the stylesheet as `--price-bar-height` by
 *  `price-bar.tsx` — a stylesheet cannot import a constant, and `price-bar-layout.test.ts` pins the
 *  hop so the number cannot be re-inlined into the CSS.
 *
 *  Sized from frame 2A's bottom bar: a 10.5 px label over a 21 px figure inside 12 px / 20 px
 *  padding. */
export const PRICE_BAR_RESERVED_HEIGHT_PX = 92;
