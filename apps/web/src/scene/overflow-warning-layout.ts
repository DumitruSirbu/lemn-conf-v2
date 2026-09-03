// **Why the scene warning cannot cover the selected cabinet**, expressed as the one number both the
// stylesheet and the 390 × 844 gate read.
//
// **`price/price-bar-layout.ts` is the precedent for the layout and for nothing else, and the
// difference is the thing to read before changing anything here.** The bar's reserve is
// *unconditional*: it is on screen for every customer on every design, so it never resizes the scene.
// This band's is *conditional* — it appears only while a body reaches past the end of its wall — so
// `.sceneBox` **loses 56 px the instant a width step pushes a body past the wall and regains them
// when the next step pulls it back**. R3F resizes the canvas on both, and with a fixed vertical field
// of view the kitchen re-renders about 8% smaller and `.presets` jump 56 px under the customer's
// finger; stepping a width back and forth across the threshold makes the scene jump on every
// crossing.
//
// **That cost is accepted, not overlooked.** Reserving the band's height unconditionally would remove
// the jump by charging every customer 56 px of scene, permanently, to spare the few who overflow —
// and the scene is the product. Recorded here so a later reader does not take the price bar's
// precedent to cover this case; it does not.
//
// The hard constraint (M6 wave 6M: "it must not cover the selected cabinet") is met **structurally,
// not by tuning**: the warning is a flow sibling of the scene's box inside `styles.viewport`, never
// an overlay on it. Whatever height it takes, the scene's box is what is left below it, so the two
// boxes cannot intersect. A future edit that gives the warning `position: absolute` over the scene
// is what would break the constraint, and it would break this file's premise first.
//
// **An overlay was measured before it was rejected, so this is a finding rather than a preference.**
// At 390 × 844 in the `overview` preset the seeded kitchen fills nearly the whole scene box — the
// preset is required to frame it floor to ceiling. The camera-preset chips occupy the top 58 px of
// what clearance there is above the bodies, and `overflow-warning-viewport.test.ts` measures what is
// left below them at **61 px**. An overlaid band at the height below would therefore ship with 5 px
// of margin, and the height below is a *floor*: the sentence wraps, and a third line puts the band
// over the cabinets. An overlay could only be kept off them by tuning a number against a font
// metric, which is exactly what a flow layout exists to avoid.
//
// The band below is a **reserve**, not a ceiling: the sentence wraps on a narrow viewport and the
// band grows. Growing only shrinks the scene further, which is why the gate can assert against a
// reserve and stay honest — and why `overflow-warning-viewport.test.ts` sweeps the taller cases
// against §10.1's touch target rather than assuming the shipped height is the only one.

/** The warning band's minimum height in CSS pixels, published to the stylesheet as
 *  `--overflow-warning-height` by `overflow-warning.tsx` — a stylesheet cannot import a constant, and
 *  `overflow-warning-layout.test.ts` pins the hop so the number cannot be re-inlined into the CSS.
 *
 *  Sized from the sentence at its narrowest: two lines of 11.5 px / 1.4 text (32 px) inside 9 px
 *  vertical padding and a 1 px rule. */
export const OVERFLOW_WARNING_RESERVED_HEIGHT_PX = 56;
