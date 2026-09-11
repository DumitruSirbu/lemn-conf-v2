/** ADR 0045's run-end panel, as a domain fact: where the finished end of wall A's base run stands,
 *  and when nothing may stand there.
 *
 *  **Why this is domain rather than adapter geometry** (ADR 0083 decision 5). The panel is part of
 *  wall A's occupied width — it stands in 19 of the wall's 60 remaining millimetres — so a coverage
 *  query and the scene both need its seat. Held in `three-adapter`, where the domain cannot read it,
 *  the two would have to derive it twice: ADR 0028's failure one seam over, and worse here, because
 *  two derivations would agree on the shipped kitchen and part exactly on the veto below, which is
 *  the case nobody screenshots.
 *
 *  **What did not move.** The panel's *existence* is still a literal entry in the adapter's shell
 *  manifest — `db9c402`'s boundary is not re-crossed. This module derives a seat and nothing else:
 *  it creates no record, removes none, and knows nothing about meshes. `RUN_END_PANEL_SEEDED_X_M`
 *  stays in the adapter too; it is a parking position for a hidden object and an M1 parity literal,
 *  not a product fact. */
import type { DesignRoom } from "./design.js";
import { toMetres } from "./millimetres.js";
import { wallLengthMm } from "./queries/overflowing-placements.js";
import type { PlacementRecord } from "./void-engine.js";

/** The panel's own slab, in metres: the reference room's `TH` door/panel thickness, and a
 *  base-height finished end that stands from the floor to the underside of the worktop.
 *
 *  The height is declared here beside the thickness because the veto below is the only rule that
 *  reads it as a *product* height — the adapter re-exports it to size the box, so the slab a
 *  customer sees and the interval this module tests for an obstruction cannot drift apart. */
export const RUN_END_PANEL_THICKNESS_M = 0.018;
export const RUN_END_PANEL_HEIGHT_M = 0.82;

/** The air gap the reference room leaves between the last cabinet's side and the panel's inner
 *  face, in metres.
 *
 *  **Authored, not measured, and it is the invariant the offset below preserves.** The seeded run
 *  ends at 3.50 (3.20 + 0.60/2) and the panel is placed at 3.51, which is half the slab plus this
 *  millimetre — so the reference deliberately does not butt the two faces together. Reading the
 *  10 mm as a measurement would be wrong in a way that only shows up later: were `TH` ever to
 *  change, a bare 10 mm would silently move the *gap* instead of keeping the overhang.
 *
 *  ADR 0083 decision 5 forbids the other direction too. The reference panel reads *3520 / 40 mm
 *  liberi* where this derivation gives **3519 / 41**, because the outer face is
 *  `3500 + 1 mm gap + 18 mm slab`; the reference rounded. Recovering 3520 by declaring a flat 20 mm
 *  constant would pin that rounding and stop the finished end tracking the run it closes. */
export const RUN_END_PANEL_GAP_M = 0.001;

/** How far the panel's centre stands past the right edge of the last base cabinet, in metres.
 *
 *  **Composed rather than written as a flat `0.01` because the 10 mm is authored, not measured** —
 *  the `RUN_END_PANEL_GAP_M` note above carries that argument, and it is the whole reason. A bare
 *  `0.01` would survive a change to `TH` by silently moving the *gap* instead of keeping the
 *  overhang. The metre form specifically is just the form wave 5B3 declared it in; nothing reads it
 *  in that form, and no earlier record composes it at all.
 *
 *  **Two things this does not buy, both of which have been claimed here before and were false.**
 *  M1's parity gate does not read this constant: the builder places the panel at
 *  `RUN_END_PANEL_SEEDED_X_M`, and that constant's own note says so. And the ported reference
 *  composes no offset — it bakes the seat and the thickness as literals.
 *
 *  A millimetre recomposition would also be **safe**, so it is not a hazard to warn about.
 *  `0.018 / 2 + 0.001` and `(18 / 2 + 1) / 1000` are exactly 1 ULP apart — `0.00999999999999999847`
 *  against `0.01000000000000000021`, a gap of 1.7e-18 — while 1 ULP at 3.5 m is 4.4e-16, some 256
 *  times larger, so the addition rounds them back together and the seeded seat is `3.51` in both
 *  forms. Swept over the whole reachable grid (`alongMm` and a carcass width are both integer
 *  millimetres, so a run end lands on a half-millimetre at worst) from 0 to 4000 mm, the two forms
 *  part on 52 of those positions, none above 50.5 mm — and none reachable, because the narrowest
 *  catalogue body is 200 mm wide and a run cannot end before its own width. The numbers are kept
 *  here because "provably unobservable" without them is how the last two false claims got in. */
export const RUN_END_PANEL_EDGE_OFFSET_M =
  RUN_END_PANEL_THICKNESS_M / 2 + RUN_END_PANEL_GAP_M;

/** M1's float-artefact allowance, which is what separates "touching" from "intersecting" here. It
 *  is not a product tolerance — `DEVELOPMENT-SPEC.md` §2 owns those. */
const TOUCHING_TOLERANCE_M = 1e-6;

const PANEL_HALF_THICKNESS_M = RUN_END_PANEL_THICKNESS_M / 2;

/** Where the run-end panel stands, in metres along wall A, or `undefined` when there is nowhere for
 *  it to stand and the panel is therefore not shown.
 *
 *  ADR 0045: the panel closes the **last base cabinet on screen**, not the run's nominal extent, so
 *  a shrink, a delete and an insert all move it. The answer is a pure function of the records — no
 *  scene, no history — which is what makes a design reached by deleting and one loaded directly
 *  into that state one picture.
 *
 *  ADR 0045 says the panel closes the last base cabinet *"if possible"*, and `blocksSeat` is the "if
 *  possible": owner, 2026-09-01, the panel is hidden when something already occupies the seat it
 *  would take. A full-height column can stand immediately right of the last base cabinet — delete a
 *  base, a wall and a top body, let §10 merge the opening, insert `tall-pantry-600` — and the panel
 *  would otherwise be buried 19 mm inside its side, two solids sharing a face.
 *
 *  Only the seat is contested, never the run: a column is where a base run *ends*, not a member of
 *  it, and a base-height end panel finishes nothing against a 2200 mm body. So the run's end is
 *  still read from base placements alone, and every other wall-A body can only veto.
 *
 *  **The second veto is the wall's own end** (ADR 0045 Amendment A, owner: *"No panel when run hits
 *  wall"*): a panel whose outer face would pass wall A's end is not drawn — a fitter closes that gap
 *  with a filler strip. Equality fits, as everywhere else (ADR 0083 decision 3), so a run ending
 *  exactly the panel's gap and slab short of the wall keeps it. `room` is required rather than
 *  optional: a call without it would be a veto that silently never fires. */
export function runEndPanelSeatM(
  records: readonly PlacementRecord[],
  room: DesignRoom,
): number | undefined {
  const runEndM = baseRunRightEdgeM(records);
  if (runEndM === undefined) return undefined;

  const seatM = runEndM + RUN_END_PANEL_EDGE_OFFSET_M;
  if (records.some((record) => blocksSeat(record, seatM))) return undefined;
  return passesWallAEnd(seatM, room) ? undefined : seatM;
}

/** Whether the panel's outer face stands past wall A's end. The tolerance is M1's float-artefact
 *  allowance, so an outer face that lands on the wall's end as 3.5600000000000005 still fits. */
function passesWallAEnd(seatM: number, room: DesignRoom): boolean {
  const outerFaceM = seatM + PANEL_HALF_THICKNESS_M;
  return outerFaceM > toMetres(wallLengthMm("A", room)) + TOUCHING_TOLERANCE_M;
}

/** The right edge of the right-most wall-A base placement, or `undefined` when the wall carries
 *  none. `frame.x` is a wall-A body's centre along the wall and `frame.w` its carcass width, so
 *  the edge is the one plus half the other — the same arithmetic §12 validates a placement with. */
function baseRunRightEdgeM(
  records: readonly PlacementRecord[],
): number | undefined {
  let rightEdgeM: number | undefined;
  for (const record of records) {
    if (record.wall !== "A" || record.band !== "base") continue;
    const edgeM = record.frame.x + record.frame.w / 2;
    if (rightEdgeM === undefined || edgeM > rightEdgeM) rightEdgeM = edgeM;
  }
  return rightEdgeM;
}

/** Whether this record stands where the panel would, in the two axes the panel occupies.
 *
 *  Both are needed and neither alone is: wall A's cabinets share an along-wall line with the base
 *  run — the seeded wall body over `p4` spans the same 2.90–3.50 — and one hanging at 1500 mm is
 *  nowhere near a panel that ends at 820. A veto on `x` alone would hide the panel for a cabinet
 *  that is not touching it; a veto on `y` alone would hide it for every wall-A body in the room. */
function blocksSeat(record: PlacementRecord, seatM: number): boolean {
  if (record.wall !== "A" || record.band === "base") return false;
  return (
    overlaps(
      [
        record.frame.x - record.frame.w / 2,
        record.frame.x + record.frame.w / 2,
      ],
      [seatM - PANEL_HALF_THICKNESS_M, seatM + PANEL_HALF_THICKNESS_M],
    ) &&
    overlaps(
      [record.frame.y0, record.frame.y0 + record.frame.h],
      // The panel stands on the floor, so its own interval starts at 0.
      [0, RUN_END_PANEL_HEIGHT_M],
    )
  );
}

/** Open intervals: two bodies that merely touch, which is what a cabinet standing exactly beside
 *  the panel does, do not intersect. The tolerance is M1's own float-artefact allowance, so a
 *  shared face that arrives as 3.5189999 does not read as an overlap. */
function overlaps(
  [leftLow, leftHigh]: readonly [number, number],
  [rightLow, rightHigh]: readonly [number, number],
): boolean {
  return (
    leftLow < rightHigh - TOUCHING_TOLERANCE_M &&
    rightLow < leftHigh - TOUCHING_TOLERANCE_M
  );
}
