// The two facts a rebuilt column is checked against before the resize is accepted: no opening may
// have appeared where a body physically stands, and every body the move touched must land under a
// column key the updated map actually holds.
import type { BodyLabel } from "../catalog.js";
import type { DesignPlacement } from "../design.js";
import {
  recomputeVoids,
  type Column,
  type PlacementRecord,
  type VoidRecord,
} from "../void-engine.js";
import { alongWallM } from "./along-wall.js";
import type { RejectionDetail } from "./rejection.js";

/** Float noise from the millimetre↔metre round trip, for the one comparison that must distinguish
 *  "these two runs touch" from "this opening lies over that body". Touching is not overlapping. */
const OVERLAP_EPSILON_M = 1e-6;

export type OverlapSet = ReadonlySet<string>;

/** **`RESIZE_OPENS_GAP`, re-stated by ADR 0031 rather than deleted**, and asked here as a question
 *  rather than answered as a verdict.
 *
 *  It used to compare §4's derived opening set before and after and refuse on any difference. Under
 *  ADR 0031 that fires on every legal resize, because the empty column funding the move shrinks —
 *  so the comparison had to go while the defect it guarded stayed. This is that defect said
 *  directly: **no opening may appear where a body physically stands.**
 *
 *  Still reachable, and for a reason worth knowing. The empty column's extent is frozen (ADR 0011
 *  Gap D) while its width moves, so widening it past what its own members used to cover can bring
 *  its load-time regions over a body in a *neighbouring* column. Measured on the shipped kitchen:
 *  clear `A|1.30`, narrow `A|0.75` to 200, and the empty column reaches 900 mm wide with a base
 *  opening across the corner leg `p25` is standing in.
 *
 *  Refusing is the conservative direction and the one §9 asks for: a resize that cannot be
 *  represented is refused **before** it is offered, and the customer keeps a kitchen whose empty
 *  slots are all real. But it is refused only when **both** sides answer this way — the caller
 *  treats a `true` here as one side declining to fund the move, not as the end of the scan.
 *
 *  **It asks about the difference, not about the world** (logic review R1.7). Scanning every opening
 *  against every body meant that one pre-existing overlap — from seeded data, from a future command,
 *  from the near-abutment R1.8 describes — would refuse *every* resize anywhere in the design, on
 *  both sides, with a sentence about neighbours that had nothing to do with the cause and no action
 *  the customer could take. A body already standing under an opening is not this move's doing; a
 *  body that was not, and now is, is exactly what this refusal exists for. */
export function opensAnOpeningOverABody(
  before: OverlapSet,
  records: readonly PlacementRecord[],
  columns: ReadonlyMap<string, Column>,
  exemptIds: ReadonlySet<string>,
): boolean {
  const after = bodiesUnderOpenings(records, columns, exemptIds);
  return [...after].some((placementId) => !before.has(placementId));
}

/** Which bodies currently have an opening derived on top of them — **by placement id**, not by
 *  opening, so the comparison survives the one thing a resize always does to an opening: move it
 *  onto a new column key. */
export function bodiesUnderOpenings(
  records: readonly PlacementRecord[],
  columns: ReadonlyMap<string, Column>,
  exemptIds: ReadonlySet<string>,
): OverlapSet {
  const covered = new Set<string>();
  for (const opening of recomputeVoids(records, columns)) {
    for (const record of records) {
      // **The hoods of the column being resized are not bodies an opening "appears where".** One
      // hangs *over* its run rather than sitting in it (ADR 0039), and ADR 0035 decision 6 makes
      // that structural: it keeps its own width while the cabinets beneath it change, so it
      // overhangs the strip its own shrink just vacated by construction. Every shrink of a column
      // holding one would otherwise refuse — measured at a 600 mm hood over a run narrowing
      // 600 → 550.
      //
      // **Scoped to this column's hoods, not to every hood in the design** (5D2b QA finding Q2).
      // The global skip let a real phantom opening through: a hood in a *different*, overlapping
      // column had an opening grow across 250 mm of it and the resize was accepted, where before
      // the wave it was correctly refused — and §9 would then offer inserts into a slot the hood
      // physically occupies.
      //
      // Excluded from the *before* set as well as the *after* one, so the comparison stays a
      // difference (logic review R1.7) rather than becoming a rule about the world.
      if (exemptIds.has(record.id)) continue;
      if (standsInOpening(record, opening)) covered.add(record.id);
    }
  }
  return covered;
}

/** Overlapping, not merely adjoining — the same distinction `overlapsAlongWall` draws in
 *  `void-engine.ts`. Two runs that meet on a boundary share a coordinate and nothing else, and an
 *  opening that starts exactly where a body ends is the normal case rather than the defect. */
function standsInOpening(
  record: PlacementRecord,
  opening: VoidRecord,
): boolean {
  if (record.wall !== opening.wall) return false;
  const recordAlongM = alongWallM(record.wall, record.frame);
  const openingAlongM = alongWallM(opening.wall, opening);
  return (
    overlaps(recordAlongM, record.frame.w, openingAlongM, opening.w) &&
    overlaps(
      record.frame.y0 + record.frame.h / 2,
      record.frame.h,
      opening.y0 + opening.h / 2,
      opening.h,
    )
  );
}

/** Two centred spans overlap when the gap between their edges is positive by more than float noise. */
function overlaps(
  leftCentre: number,
  leftSize: number,
  rightCentre: number,
  rightSize: number,
): boolean {
  const gap =
    Math.min(leftCentre + leftSize / 2, rightCentre + rightSize / 2) -
    Math.max(leftCentre - leftSize / 2, rightCentre - rightSize / 2);
  return gap > OVERLAP_EPSILON_M;
}

/** ADR 0011 Gap D, read for the one command that legitimately moves a body between columns: every
 *  body this operation moved must land in a key the updated map actually holds. A body filed under
 *  a key nothing derived is a phantom column, and §4 would simply never see it — no void, no
 *  opening, no way back. Asserted rather than assumed, the same way `insertBody` asserts it. */
export function refuseColumnDrift(
  columns: ReadonlyMap<string, Column>,
  records: readonly PlacementRecord[],
  rebuilt: ReadonlyMap<string, DesignPlacement>,
  label: BodyLabel,
): RejectionDetail | undefined {
  const drifted = records.find(
    (record) => rebuilt.has(record.id) && !columns.has(record.col),
  );
  if (!drifted) return undefined;
  return { code: "COLUMN_MISMATCH", params: { label } };
}
