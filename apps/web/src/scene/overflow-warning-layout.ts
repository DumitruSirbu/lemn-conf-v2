// **Where ADR 0065's scene warning stands, and why it moved.** The one number the stylesheet and the
// 390 × 844 gate both read, plus the measurement that decided its placement.
//
// **It is an overlay pinned to the bottom edge of the scene box, above the price bar.** It takes no
// flow height, so the canvas's box is the viewport's box whether or not anything overflows.
//
// ## The first answer was a flow band, and it was right on the tree it was measured against
//
// Wave 6M first placed the sentence as a flow row above the scene, the shape `price-bar-layout.ts`
// argues for: a flow sibling has nothing to overlap, so "it never covers the selected cabinet" is met
// structurally rather than by tuning. An overlay was measured and rejected — at 390 × 844 the
// `overview` preset frames the kitchen floor to ceiling, the camera chips take the top 58 px of the
// clearance above it, and only 61 px were left below them for a band whose height is a floor.
//
// **Wave 6G overturned it, and the reason is arithmetic rather than taste.** 6G adds an
// unconditional `.settingsRow` above the stage. §9's sheet is pinned to the *viewport* at 78 dvh, so
// its top edge does not move when the canvas shrinks: every band added above the stage comes
// straight out of the strip of scene left visible above the sheet, which is the only part of the
// scene a customer can tap while the panel is open (§10's viewing model, and how the sheet is
// dismissed). Measured in Chromium at 390 × 844 on the seeded design:
//
// | band above the stage | canvas top | canvas height | strip above the sheet |
// | -------------------- | ---------- | ------------- | --------------------- |
// | none                 |      55    |         697   |              130.68   |
// | 6G's settings row    |      98.94 |         653.06|               86.74   |
// | + a 56 px flow band  |     154.94 |         597.06|               30.74   |
//
// 30.74 px is below §10.1's 44 px touch target: the strip stops being tappable and the sheet stops
// being dismissable by tapping the scene. That alone settles it.
//
// **The middle and bottom rows were 101.94 / 650.06 / 83.75 and 158.88 / 593.12 / 26.81 until wave
// 6S's fix pass.** They composed a 46.94 px settings row measured on 6G's own branch, before the
// merge. On the merged tree `.settingsRow` measures 43.9375 and the header 55.0000 — 98.9375
// together, which is exactly where a capture reports the canvas's top. The conclusion is unchanged:
// 30.74 is still under the touch target, so the flow band is still ruled out.
//
// **And the band is conditional, which the price bar's is not.** A flow band that appears only while
// a body overflows makes the canvas a different height for a flagged design than for an unflagged
// one, so every canvas tap constant in the e2e suite would have two correct values. An overlay has
// one.
//
// ## Why the bottom edge specifically
//
// The clearance problem the first answer measured is a problem **above** the kitchen, where the
// camera chips live. The bottom edge of the scene box has no chips on it and sits directly above the
// price bar. That is where the band goes, stacked below the orbit hint by `.sceneFooter` so the two
// overlays cannot occupy the same pixels.
//
// **What it costs: nothing, measured on a capture of the running app** (wave 6S, owner-ruled).
// At 390 × 844 with 6G's row present, the band paints over **no cabinet at all** in any of the three
// camera presets — 25.05 px of clearance to the kitchen's lowest painted pixel on Perete A, 45.06 on
// Perete B and 49.06 on Vedere generală, and no red-marked body below it either. The band stands on
// bare floor. Measured off the WebGL buffer with `preserveDrawingBuffer` on, so the pixels behind the
// band are readable rather than inferred.
//
// **This corrects a figure that stood here and was wrong.** It read "paints over the bottom 6.8 to
// 13.7 px of the lowest cabinets", from a headless projection model with three errors in it: it let
// a body that is entirely off the left edge of the viewport drive the clearance, it modelled the
// canvas with the price bar's *reserved* height when an overflowing design's bar carries ADR 0065's
// flagged-total warning and is 33.7 px taller, and it projected bounding boxes, whose corners land
// about 18 px below the geometry they bound. `overflow-warning-viewport.test.ts` now holds the
// corrected model and records all three.
//
// It does **not** cover the *selected* cabinet either, which is the constraint M6 states: at
// 390 × 844 a selection opens §9's sheet, whose top edge sits at 86.74 px into the scene box while
// the nearest cabinet starts at 109.9 px, so the sheet has already covered the whole kitchen — and
// the band with it — before any cabinet can be selected.
//
// **A later reader must not "restore" the flow version.** It was correct while this band was the
// only thing competing for that column and it is not correct now; putting it back takes the strip to
// 30.74 px and breaks sheet dismissal.

/** The warning band's minimum height in CSS pixels, published to the stylesheet as
 *  `--overflow-warning-height` by `overflow-warning.tsx` — a stylesheet cannot import a constant, and
 *  `overflow-warning-layout.test.ts` pins the hop so the number cannot be re-inlined into the CSS.
 *
 *  Sized from the sentence at its narrowest: two lines of 11.5 px / 1.4 text (32 px) inside 9 px
 *  vertical padding and a 1 px rule. A floor, not a ceiling — a third line grows the band upward over
 *  more of the kitchen and costs the scene no layout at all. */
export const OVERFLOW_WARNING_RESERVED_HEIGHT_PX = 56;
