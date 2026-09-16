/**
 * The desktop scene's measured points, in **page** coordinates, declared once.
 *
 * `editor-rail.desktop`, `pixel-counter-witness.desktop` and
 * `pixel-counter-witness.adversarial.desktop` each carried their own identical copies of these four
 * until 2026-09-16, and they agreed only because they were written together. Wave 7H moved the
 * camera and every copy went stale in the same pass — the same defect ADR 0083 decision 10 settled
 * for the overflowing design fixture, and the same one `support/canvas-taps.ts` now holds
 * `SINK_CABINET_TAP` against on the mobile side.
 *
 * **Every value below was re-found by clicking the running scene and reading the selected id back
 * out of `[data-testid="selection-debug"]`, never computed from the camera.** Deriving them from
 * the new projection would have made these specs agree with the camera by construction: a wrong
 * camera would have produced matching wrong constants and the suite would have gone green while
 * testing nothing.
 *
 * **Two coordinate regimes, and they are not interchangeable.** With the rail closed the canvas is
 * 1440 px wide; with it open the rail takes 420 px and the scene re-projects into 1020. The same
 * world point has a different page x in each, which is why `SINK_CABINET_FULL_WIDTH` and
 * `SINK_CABINET_WITH_RAIL` both exist. `support/canvas-taps.ts`'s conversion refuses to cross a
 * width change for exactly this reason.
 *
 * **One measurement hazard, recorded because it corrupted a probe during this pass:** clicking
 * empty scene *deselects*, which closes the rail and re-widens the canvas mid-scan. Every reading
 * after such a click is in the other regime. A scan of the rail-open canvas has to keep something
 * selected throughout.
 */
export interface ScenePoint {
  readonly x: number;
  readonly y: number;
}

export interface PixelBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** `p0`, the sink cabinet, **with the rail closed** — the point a first click lands on.
 *
 *  **Moved 2026-09-16: (700, 610) → (700, 570), and it did not have to.** Re-probed at x = 700 in
 *  20 px steps, `p0` now runs page y 500–640 (background above 480, `p25` at 480). The old 610 is
 *  still inside that band and still selects `p0` — but with 30 px below it and 110 px above, which
 *  is the lopsided margin this file's own history says to avoid: the 2026-09-06 note on
 *  `FAR_BASE_CABINET` records a *flapping* `p0`/background boundary as the reason to take an anchor
 *  deep inside a band. 570 is the measured middle of the new one. */
export const SINK_CABINET_FULL_WIDTH: ScenePoint = { x: 700, y: 570 };

/** `p2`, a base cabinet well clear of the patches, **with the rail open**.
 *
 *  **Moved 2026-09-16: (680, 650) → (750, 630).** At the old point the scene now answers `p1`.
 *  Re-probed with the rail held open: at y = 650 `p2` runs page x 700–800 (`p1` at 680 and below,
 *  `p4` from 820), and at x = 740 it runs y 560–700. This point is 50 px from either vertical edge
 *  and 70 px from either horizontal one, and was confirmed by a click returning `p2`. */
export const FAR_BASE_CABINET: ScenePoint = { x: 750, y: 630 };

/** `p7`, the freestanding fridge, **with the rail open**.
 *
 *  **Re-measured 2026-09-16 and unchanged.** Probed down x = 140 in 20 px steps with the rail held
 *  open: `p7` answers at every y from 380 to 720, so this point keeps well over 100 px of margin on
 *  both sides, and a click at it returned `p7`. Recorded as re-measured rather than left untouched:
 *  a constant that still passes and one nobody looked at are the same colour in a diff. */
export const FRIDGE: ScenePoint = { x: 140, y: 560 };

/** `p0`'s highlight box, **with the rail open** — the rectangle the differencing specs capture.
 *
 *  **Moved 2026-09-16: (420, 468, 180 × 240) → (427, 389, 230 × 310).** Measured, not adjusted: two
 *  full-canvas captures were taken with the rail open — one with the fridge selected, one with the
 *  sink — and the pixels differing by more than 24 in Euclidean RGB were bounded, restricted to
 *  x ∈ [380, 700] so the fridge's own highlight on the left could not enter the box. The sink's
 *  highlight measures page x 450–635, y 412–676. The old box clipped it on two sides — its right
 *  edge stood at 600 and its top at 468 — which is why the differencing cases failed rather than
 *  merely drifted.
 *
 *  **Containment, checked the way this file's own note asks.** The box counts 8 847 changed pixels,
 *  and a box 40 px larger on every side counts **8 847** as well: identical, so nothing is being
 *  clipped at an edge. It carries 22–23 px of margin on all four sides. */
export const SINK_PATCH: PixelBox = {
  x: 427,
  y: 389,
  width: 230,
  height: 310,
};
