// `DEVELOPMENT-SPEC.md` §6.1's "resolve accessories -> host cabinet", as placement logic.
//
// ADR 0011 Gap E: this used to live in the Three.js adapter and *threw* when an accessory had no
// host — a state `remove` can reach in one command (delete the cabinet under the hob), and a
// thrown exception out of a pointer handler is not an acceptable outcome for it. It returns "no
// host" instead, which the picking layer reads as "select the accessory itself" and `remove` reads
// as "nothing to cascade".
import { FIT_TOLERANCE_M, type PlacementRecord } from "./void-engine.js";

function isSeatedUnder(
  candidate: PlacementRecord,
  accessory: PlacementRecord,
): boolean {
  if (candidate.accessory) return false;
  if (candidate.col !== accessory.col) return false;
  const candidateTop = candidate.frame.y0 + candidate.frame.h;
  return candidateTop <= accessory.frame.y0 + FIT_TOLERANCE_M;
}

/** §6.1: the host is the tallest non-accessory member of the accessory's own column whose top
 *  sits at or below the accessory's bottom. `undefined` means the accessory was orphaned. */
export function resolveHostPlacement(
  accessory: PlacementRecord,
  records: readonly PlacementRecord[],
): PlacementRecord | undefined {
  let host: PlacementRecord | undefined;
  for (const candidate of records) {
    if (!isSeatedUnder(candidate, accessory)) continue;
    if (!host || candidate.frame.y0 > host.frame.y0) host = candidate;
  }
  return host;
}

/** §3.1 / ADR 0011 Gap E: an accessory belongs to its host and cannot exist without it, so
 *  removing a body removes everything it carried in the same command. */
export function findHostedAccessories(
  host: PlacementRecord,
  records: readonly PlacementRecord[],
): PlacementRecord[] {
  return records.filter(
    (record) =>
      record.accessory && resolveHostPlacement(record, records)?.id === host.id,
  );
}
