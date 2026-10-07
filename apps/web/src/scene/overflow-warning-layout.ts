// Where ADR 0065's scene warning stands: an overlay pinned to the bottom edge of the scene box, above
// the price bar and stacked below the orbit hint by `.sceneFooter`, so the two cannot share pixels.
// It takes no flow height, so the canvas box is the same whether or not anything overflows.
//
// Do not restore it as a flow band above the scene. §9's sheet is pinned to the viewport at 78 dvh, so
// every band above the stage comes out of the strip of scene left visible above the sheet, which is
// how the sheet is dismissed. Measured in Chromium at 390 × 844 on the seeded design, that strip is
// 130.68 px with no band, 86.74 px with the settings row (43.9375 px) and header (55.0000 px), and
// 30.74 px with a further 56 px band, under §10.1's 44 px touch target. A conditional flow band would
// also give the canvas two heights, so every e2e canvas tap constant would have two correct values.
//
// The overlay paints over no cabinet in any camera preset at 390 × 844 (clearance to the lowest
// painted pixel: 25.05 px on Perete A, 45.06 on Perete B, 49.06 on Vedere generală), measured off the
// WebGL buffer with `preserveDrawingBuffer` on. It cannot cover the selected cabinet either: the
// sheet's top edge (86.74 px into the scene box) is above the nearest cabinet (109.9 px).
// `overflow-warning-viewport.test.ts` holds the projection model.

/** The warning band's minimum height in CSS pixels, published to the stylesheet as
 *  `--overflow-warning-height` by `overflow-warning.tsx` (a stylesheet cannot import a constant;
 *  `overflow-warning-layout.test.ts` pins the hop).
 *
 *  Sized from the sentence at its narrowest: two lines of 11.5 px / 1.4 text (32 px) inside 9 px
 *  vertical padding and a 1 px rule. A floor, not a ceiling: a third line grows the band upward over
 *  more of the kitchen and costs the scene no layout at all. */
export const OVERFLOW_WARNING_RESERVED_HEIGHT_PX = 56;
