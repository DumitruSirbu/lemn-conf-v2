/** ADR 0045's run-end panel as a domain fact: where the finished end of wall A's base run stands, and
 *  when nothing may stand there.
 *
 *  Domain, not adapter geometry (ADR 0083 decision 5): the panel is part of wall A's occupied width, so
 *  a coverage query and the scene both need its seat, and two derivations would agree on the shipped
 *  kitchen and part exactly on the veto below. The panel's *existence* stays a literal entry in the
 *  adapter's shell manifest; this module derives a seat only and creates no record.
 *  `RUN_END_PANEL_SEEDED_X_M` stays in the adapter: a parking position and an M1 parity literal, not a
 *  product fact. */
import type { DesignRoom } from "./design.js";
import { toMetres } from "./millimetres.js";
import { wallLengthMm } from "./queries/overflowing-placements.js";
import type { PlacementRecord } from "./void-engine.js";

/** The panel's slab in metres: the reference room's `TH` thickness, and a base-height finished end from
 *  the floor to the underside of the worktop. The height is declared beside the thickness because the
 *  veto is the only rule reading it as a product height; the adapter re-exports it to size the box, so
 *  the slab and the tested interval cannot drift apart. */
export const RUN_END_PANEL_THICKNESS_M = 0.018;
export const RUN_END_PANEL_HEIGHT_M = 0.82;

/** The air gap the reference room leaves between the last cabinet's side and the panel's inner face,
 *  in metres.
 *
 *  Authored, not measured, and the invariant the offset below preserves: the seeded run ends at 3.50
 *  and the panel is placed at 3.51, half the slab plus this millimetre, so the faces deliberately do
 *  not butt. Were `TH` to change, a bare 10 mm would silently move the gap instead of keeping the
 *  overhang.
 *
 *  The reference panel reads *3520 / 40 mm liberi* where this derivation gives 3519 / 41 (outer face =
 *  3500 + 1 mm gap + 18 mm slab); the reference rounded. A flat 20 mm constant would pin that rounding
 *  and stop the end tracking the run it closes (ADR 0083 decision 5). */
export const RUN_END_PANEL_GAP_M = 0.001;

/** How far the panel's centre stands past the right edge of the last base cabinet, in metres. Composed,
 *  not a flat `0.01`, because the 10 mm is authored (see `RUN_END_PANEL_GAP_M`).
 *
 *  This does not buy M1 parity: the parity gate does not read this constant (the builder places the
 *  panel at `RUN_END_PANEL_SEEDED_X_M`), and the ported reference bakes the seat and thickness as
 *  literals.
 *
 *  A millimetre recomposition would also be safe: `0.018 / 2 + 0.001` and `(18 / 2 + 1) / 1000` are
 *  1 ULP apart (1.7e-18) while 1 ULP at 3.5 m is 4.4e-16, so the addition rounds them back together.
 *  Swept over 0 to 4000 mm on the half-millimetre grid the two forms part at 52 positions, none above
 *  50.5 mm and none reachable (the narrowest catalogue body is 200 mm wide). The numbers are kept so
 *  "provably unobservable" is not asserted without them. */
export const RUN_END_PANEL_EDGE_OFFSET_M =
  RUN_END_PANEL_THICKNESS_M / 2 + RUN_END_PANEL_GAP_M;

/** M1's float-artefact allowance, which is what separates "touching" from "intersecting" here. It
 *  is not a product tolerance — `DEVELOPMENT-SPEC.md` §2 owns those. */
const TOUCHING_TOLERANCE_M = 1e-6;

const PANEL_HALF_THICKNESS_M = RUN_END_PANEL_THICKNESS_M / 2;

/** Where the run-end panel stands, in metres along wall A, or `undefined` when there is nowhere for it
 *  to stand and it is not shown.
 *
 *  ADR 0045: the panel closes the **last base cabinet on screen**, not the run's nominal extent, so a
 *  shrink, delete and insert all move it. A pure function of the records, so a design reached by
 *  deleting and one loaded directly into that state are one picture.
 *
 *  `blocksSeat` is ADR 0045's "if possible": the panel is hidden when something already occupies its
 *  seat (a full-height column can stand immediately right of the last base cabinet and bury the panel
 *  19 mm inside its side). Only the seat is contested, never the run: the run's end is read from base
 *  placements alone and every other wall-A body can only veto.
 *
 *  The second veto: a panel whose outer face would pass `wallLengthMm("A", room)` is not drawn
 *  (ADR 0045 Amendment A). That number is the stretch the customer asked to furnish, not a physical
 *  wall, so nothing is modelled past it. The authority is the owner's ruling alone: the fitter's
 *  filler-strip reason once written here assumed a wall the product never learns, so do not read the
 *  veto's correctness off it (ADR 0120 Amendment D2). Equality fits. `room` is required: a call without
 *  it would be a veto that silently never fires.
 *
 *  A U draws no run-end panel (ADR 0132 D11): wall A runs between two corners, so it has no free end to
 *  close. The shape guard reads first rather than leaving that to `passesWallAEnd`'s coincidence. */
export function runEndPanelSeatM(
  records: readonly PlacementRecord[],
  room: DesignRoom,
): number | undefined {
  if (room.shape === "U") return undefined;
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

/** Whether this record stands where the panel would, in the two axes it occupies. Both are needed:
 *  wall A's cabinets share an along-wall line with the base run (the seeded wall body over `p4` spans
 *  the same 2.90-3.50) and one hanging at 1500 mm is nowhere near a panel ending at 820. */
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

/** Open intervals: bodies that merely touch do not intersect. The tolerance is M1's float-artefact
 *  allowance, so a shared face arriving as 3.5189999 does not read as an overlap. */
function overlaps(
  [leftLow, leftHigh]: readonly [number, number],
  [rightLow, rightHigh]: readonly [number, number],
): boolean {
  return (
    leftLow < rightHigh - TOUCHING_TOLERANCE_M &&
    rightLow < leftHigh - TOUCHING_TOLERANCE_M
  );
}
