// How deep the space a placed body fills actually is, which is not `frame.d`.
//
// `frame.d` is twice a body's rear overhang, an encoding that lets `deriveCabinetWorldTransform` land
// any bounding box on the wall plane (ADR 0018; §11 row 19). §3.1's depth is the full extent, so
// everywhere the model reads a depth (§3.2's column MAX, a swap's opening) it converts first, and this
// is the one place that conversion lives (ADR 0040 decision 1).
//
// A body's finished depth is declared by its catalogue entry, and a definition that declares nothing
// throws rather than guessing: a `frame.d` catch-all under-reports base runs (580 for 620), pantries
// and the freestanding fridge, giving an opening shallower than the body that vacated it. Only ADR
// 0040 decision 1's third arm changed from a guess to a declaration; a recorded seat is still
// converted back and never read as a depth.
//
// The answer is a clearance with its own nominal type, distinct from the build depth declared in
// `cabinet-depth-rule.ts` as `BuildDepthM` (ADR 0060), so handing one where the other is wanted does
// not compile.
import { toMetres } from "./millimetres.js";
import type { BodyDefinition, PlacementRecord } from "./void-engine.js";

/** How much space a body occupies, handles and appliances included: §3.1's full extent on the depth
 *  axis (ADR 0060 decision 1). `Column.d` (§3.2's MAX), `VoidRecord.d` and `InsertOpening.d` are all
 *  this, and none is a depth anybody manufactures. A `ClearanceM` flows freely into clearance
 *  arithmetic but becomes a `BuildDepthM` only through the named crossing `buildToTheClearanceM`. */
export type ClearanceM = number & { readonly __clearanceM: unique symbol };

/** A depth already measured as a clearance, re-entering the type that says so. `Column.d` and
 *  `VoidRecord.d` carry §3.2's MAX as a plain `number` because the frozen map persists it and a stored
 *  extent arrives off the wire (ADR 0044, ADR 0053). Not a way to obtain a build depth. */
export function recordedClearanceM(depthM: number): ClearanceM {
  return depthM as ClearanceM;
}

/** How a body's finished front relates to the seat it records, declared per catalogue entry
 *  (`BodyDefinition.occupiedDepth`) and never inferred from a kind, a band or a builder name
 *  (ADR 0022).
 *
 *  - `recorded-shell`: the builder centres its shell on `z = 0`, so `frame.d` is that shell and the
 *    finished body is the shell plus whatever stands in front (a fronted wall carcass adds ADR 0036
 *    decision 1's 39 mm assembly; an open shelf adds nothing). Seeded wall/top rows are declared here
 *    too, so they answer through the same rule as the §7 row their `catalogEquivalentId` swaps to.
 *  - `wall-plane`: the builder ignores the depth it is handed, so the body fills one declared distance
 *    from the wall plane. Every base, full-height, appliance and corner body, and the front-hung hood
 *    (ADR 0039 decision 2).
 *
 *  No `recorded-shell` arm for a base or a column: `frame.d` is 580 for a base carcass whose shell is
 *  560, so "shell plus a front" would be arithmetic on a number that is not a shell (ADR 0028). */
export type OccupiedDepthRule =
  | { readonly measuredFrom: "wall-plane"; readonly finishedDepthMm: number }
  | {
      readonly measuredFrom: "recorded-shell";
      readonly frontAssemblyMm: number;
    };

/** A body whose builder always produces the same geometry: it finishes this far from the wall plane,
 *  whatever seat the placement recorded. */
export function finishesAtMm(finishedDepthMm: number): OccupiedDepthRule {
  return { measuredFrom: "wall-plane", finishedDepthMm };
}

/** A carcass whose depth is a placement variable and whose shell is what `frame.d` records: it
 *  finishes `frontAssemblyMm` in front of that shell. */
export function shellPlusFrontMm(frontAssemblyMm: number): OccupiedDepthRule {
  return { measuredFrom: "recorded-shell", frontAssemblyMm };
}

/** A body with no front in front of its shell (an open shelf). Named so the rule reads as a statement
 *  about the product, not an arithmetic no-op. */
export const NO_FRONT_ASSEMBLY_MM = 0;

/** A placement whose catalogue entry declares no depth rule, or one this module does not recognise: a
 *  programming error, not a number to guess at, as in `UnknownWorktopDepthError`. */
export class UndeclaredOccupiedDepthError extends Error {
  constructor(buildId: string, declared: unknown) {
    super(
      `No occupied-depth rule declared for buildId "${buildId}". ` +
        `Found: ${describeDeclared(declared)}.`,
    );
    this.name = "UndeclaredOccupiedDepthError";
  }
}

function describeDeclared(declared: unknown): string {
  return declared === undefined ? "nothing" : JSON.stringify(declared);
}

/** What `occupiedDepthFromSeat` needs: the declaration, the seat the rule may be relative to, and the
 *  id a refusal names. */
interface DeclaredSeat {
  readonly buildId: string;
  /** Typed wider than `BodyDefinition` declares it: `BodyCatalog` is a port, and a definition
   *  assembled outside TypeScript can arrive with no rule, which this module must refuse. */
  readonly rule: OccupiedDepthRule | undefined;
  readonly seatDepthM: number;
}

/** The declared rule, applied. Separate from `occupiedDepthM` so the widening above happens at a
 *  function boundary and the undeclared case is reachable. */
function occupiedDepthFromSeat(seat: DeclaredSeat): ClearanceM {
  switch (seat.rule?.measuredFrom) {
    case "wall-plane":
      return recordedClearanceM(toMetres(seat.rule.finishedDepthMm));
    case "recorded-shell":
      return recordedClearanceM(
        seat.seatDepthM + toMetres(seat.rule.frontAssemblyMm),
      );
    default:
      throw new UndeclaredOccupiedDepthError(seat.buildId, seat.rule);
  }
}

/** The distance from the wall plane to the front of the space this body fills: the single answer
 *  `deriveColumns` (§3.2's MAX) and `openingFromPlacement` (§5.3) both read.
 *
 *  A clearance, never a build depth (ADR 0060 decision 1): its MAX over a column includes an
 *  appliance's door bars (742 mm over the freestanding fridge), the right answer to "how much space
 *  does this occupy" and none to "how deep do we build the next body" (`columnBuildDepthM` in
 *  `cabinet-depth-rule.ts`).
 *
 *  Fails closed: every reachable placement has an entry (`derivePlacementRecords` throws
 *  `UnknownBodyError` first), so a missing rule is a defect in the `BodyCatalog`, not a fallback. */
export function occupiedDepthM(record: PlacementRecord): ClearanceM {
  return occupiedDepthFromSeat({
    buildId: record.buildId,
    rule: record.occupiedDepth,
    seatDepthM: record.frame.d,
  });
}

/** What `occupiedDepthOfEntryM` is asked about: one catalogue row and the id it is filed under, which
 *  a refusal names. */
export interface CatalogEntryDepthQuery {
  readonly buildId: string;
  readonly definition: BodyDefinition;
}

/** The same declared answer as `occupiedDepthM`, asked of a catalogue entry instead of a placed body
 *  (ADR 0073 decision 2), for a frozen extent whose member is gone. No second rule: `finishesAtMm`
 *  answers directly and is not a function of the setting, and `shellPlusFrontMm` answers over the
 *  entry's `frameDepthMm`, `deriveFrame`'s fallback for a placement with no measured seat (ADR 0011
 *  Gap B). Build the catalogue at the new cabinet depth and the answer follows the setting.
 *
 *  Lives here because this module is the one place the declaration is applied (ADR 0040 decision 1);
 *  a caller reading `occupiedDepth` itself would be a second author for the switch (ADR 0028). */
export function occupiedDepthOfEntryM(
  entry: CatalogEntryDepthQuery,
): ClearanceM {
  return occupiedDepthFromSeat({
    buildId: entry.buildId,
    rule: entry.definition.occupiedDepth,
    seatDepthM: toMetres(entry.definition.frameDepthMm),
  });
}
