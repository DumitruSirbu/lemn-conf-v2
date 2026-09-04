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
// | 6G's settings row    |     101.94 |         650.06|               83.75   |
// | + a 56 px flow band  |     158.88 |         593.12|               26.81   |
//
// 26.81 px is below §10.1's 44 px touch target: the strip stops being tappable and the sheet stops
// being dismissable by tapping the scene. That alone settles it.
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
// **What it costs, measured rather than assumed** (`overflow-warning-viewport.test.ts` holds these):
// the kitchen's lowest projected pixel leaves 42.3–49.2 px of clearance at the bottom of the scene
// box at 390 × 844 with 6G's row present, swept across every header height the screen plausibly
// takes. A 56 px band therefore paints over the bottom **6.8 to 13.7 px** of the lowest cabinets —
// their plinth line, not their fronts. It does **not** cover the *selected* cabinet, which is the
// constraint M6 states: at 390 × 844 a selection opens §9's sheet, whose top edge sits at 83.75 px
// into the scene box while the nearest cabinet starts at 109.9 px, so the sheet has already covered
// the whole kitchen — and the band with it — before any cabinet can be selected.
//
// **A later reader must not "restore" the flow version.** It was correct while this band was the
// only thing competing for that column and it is not correct now; putting it back takes the strip to
// 26.81 px and breaks sheet dismissal.

/** The warning band's minimum height in CSS pixels, published to the stylesheet as
 *  `--overflow-warning-height` by `overflow-warning.tsx` — a stylesheet cannot import a constant, and
 *  `overflow-warning-layout.test.ts` pins the hop so the number cannot be re-inlined into the CSS.
 *
 *  Sized from the sentence at its narrowest: two lines of 11.5 px / 1.4 text (32 px) inside 9 px
 *  vertical padding and a 1 px rule. A floor, not a ceiling — a third line grows the band upward over
 *  more of the kitchen and costs the scene no layout at all. */
export const OVERFLOW_WARNING_RESERVED_HEIGHT_PX = 56;
