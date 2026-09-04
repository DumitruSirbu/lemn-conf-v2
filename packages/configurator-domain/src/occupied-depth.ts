// How deep the space a placed body fills actually is — which is **not** `frame.d`.
//
// ADR 0018: `frame.d` is twice a body's rear overhang, an encoding that exists so
// `deriveCabinetWorldTransform` can land any bounding box on the wall plane (§11 row 19). §3.1 says
// what a depth is — *"`h`, `d` from the **full extent** — a body must clear the ceiling with
// everything it carries"* — and the encoding is not that number. Everywhere the model reads a depth
// — the column extent §3.2 derives as the MAX over its members, and the opening a swap sees — has
// to convert first, and this is the one place that conversion lives (ADR 0040 decision 1).
//
// **What wave S9 changed (DOM-002).** The conversion used to be a two-armed `kind` switch with a
// catch-all `return record.frame.d`, and the catch-all was wrong for every body it caught: a base
// run publishes 580 for a 620 mm worktop, a pantry 560 for 599, a freestanding fridge 680 for 742,
// the corner leg 560 for 630. An opening derived from those is **shallower than the body that just
// vacated it**, so the body no longer fits back into the space it left. The catch-all is gone: a
// body's finished depth is now declared by its catalogue entry, and a definition that declares
// nothing throws instead of guessing.
//
// **This supersedes half of ADR 0040 decision 1, and that record carries the dated amendment saying
// so** (2026-08-31). It stated the rule as "the cabinet-depth line for a hood, `frame.d + 39` for a
// fronted wall carcass, `frame.d` for everything else", and the last clause is no longer true. What
// the decision is *about* — that a recorded seat is converted back and never read as a depth, in one
// place — is untouched and is what this module still is. Only the third arm changed, from a guess to
// a declaration.
//
// **What wave 6I2 changed (ADR 0060).** Nothing about the value or the meaning — the change is that
// the answer now has a **name and a type of its own**. `occupiedDepthM` is a *clearance*, and
// `resolveDepthM` was handing the same number to the probe as *"the depth to build the next body
// to"*, a manufactured size (`docs/BACKLOG.md` entry 15). The build depth is declared separately in
// `cabinet-depth-rule.ts` as `BuildDepthM`, and the two are different nominal types, so handing one
// where the other is wanted no longer compiles.
import { toMetres } from "./millimetres.js";
import type { PlacementRecord } from "./void-engine.js";

/** **How much space a body occupies, handles and appliances included** — §3.1's full extent on the
 *  depth axis, and the type the clearance fact is stated in (ADR 0060 decision 1).
 *
 *  Nominal on purpose, and the pairing with `BuildDepthM` is the point rather than either type
 *  alone: `Column.d` (§3.2's MAX), `VoidRecord.d` and `InsertOpening.d` are all this, and none of
 *  them is a depth anybody manufactures. A `ClearanceM` is a `number` and flows freely into the
 *  arithmetic a clearance belongs in; it is **not** a `BuildDepthM` and cannot become one except
 *  through the single named crossing `buildToTheOpeningM`. */
export type ClearanceM = number & { readonly __clearanceM: unique symbol };

/** A depth already measured as a clearance, re-entering the type that says so.
 *
 *  `Column.d` and `VoidRecord.d` carry §3.2's MAX as a plain `number` — the frozen map persists it
 *  and a stored extent arrives off the wire (ADR 0044, ADR 0053) — so this is where a wire number
 *  is restated as the clearance it is. Deliberately **not** a way to obtain a build depth: nothing
 *  here can produce a `BuildDepthM`. */
export function recordedClearanceM(depthM: number): ClearanceM {
  return depthM as ClearanceM;
}

/** **How a body's finished front relates to the seat it records** — declared per catalogue entry
 *  (`BodyDefinition.occupiedDepth`), never inferred from a kind, a band or a builder name. ADR 0022:
 *  an entry declares what it is.
 *
 *  Two shapes, because the shipped builders come in two kinds and no more:
 *
 *  - **`recorded-shell`** — the builder centres its shell on `z = 0`, so `frame.d` *is* that shell
 *    and the finished body is the shell plus whatever stands in front of it. The wall carcasses are
 *    the whole of this set (ADR 0018's own note on which builders consume a depth): a fronted one
 *    adds ADR 0036 decision 1's 39 mm door-and-handle assembly, an open shelf adds nothing.
 *
 *    **A statement about where the shell sits, not about what the builder is handed.** The §7 rows
 *    take a depth argument and the seeded wall/top rows do not — `buildDecomposedBody` builds one
 *    fixed instance each — but both centre their shell on `z = 0`, which is the whole of what this
 *    rule needs. The seeded rows are declared here rather than as a `wall-plane` distance so that
 *    they and the §7 row their `catalogEquivalentId` swaps them for answer through the same rule.
 *  - **`wall-plane`** — the builder ignores the depth it is handed and always builds the same body,
 *    so the space it fills is one declared distance from the wall plane. Every base, full-height,
 *    appliance and corner body is in this set, and so is the front-hung hood (ADR 0039 decision 2),
 *    whose front face lands on the cabinet-depth line whatever seat it records.
 *
 *  There is deliberately no `recorded-shell` arm for a base or a column. `frame.d` is 580 for a base
 *  carcass whose shell is 560, so "shell plus a front" would be arithmetic on a number that is not a
 *  shell — a fiction that happens to land on the right answer, which is the class of defect ADR 0028
 *  exists to stop. */
export type OccupiedDepthRule =
  | { readonly measuredFrom: "wall-plane"; readonly finishedDepthMm: number }
  | {
      readonly measuredFrom: "recorded-shell";
      readonly frontAssemblyMm: number;
    };

/** A body whose builder always produces the same geometry: it finishes this far from the wall
 *  plane, whatever seat the placement recorded. */
export function finishesAtMm(finishedDepthMm: number): OccupiedDepthRule {
  return { measuredFrom: "wall-plane", finishedDepthMm };
}

/** A carcass whose depth is a placement variable and whose shell is what `frame.d` records: it
 *  finishes `frontAssemblyMm` in front of that shell. */
export function shellPlusFrontMm(frontAssemblyMm: number): OccupiedDepthRule {
  return { measuredFrom: "recorded-shell", frontAssemblyMm };
}

/** A body with no front standing in front of its shell — an open shelf, which is its declared depth
 *  all by itself. Named rather than written as a bare `0`, so the rule reads as a statement about
 *  the product instead of as an arithmetic no-op. */
export const NO_FRONT_ASSEMBLY_MM = 0;

/** A placement whose catalogue entry declares no depth rule, or declares one this module does not
 *  recognise. **It is a programming error rather than a number to guess at** — the same stance
 *  `UnknownWorktopDepthError` takes, and for the same reason: the guess that used to stand here
 *  (`return record.frame.d`) under-reported four body families and produced openings too shallow for
 *  the bodies that had just vacated them. */
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

/** What `occupiedDepthFromSeat` needs and nothing more: the declaration, the seat the rule may be
 *  relative to, and the id a refusal has to name. */
interface DeclaredSeat {
  readonly buildId: string;
  /** **Typed wider than `BodyDefinition` declares it, on purpose.** `BodyCatalog` is a port: a
   *  definition assembled outside TypeScript can arrive with no rule at all, and that is the case
   *  this module must refuse rather than guess at. */
  readonly rule: OccupiedDepthRule | undefined;
  readonly seatDepthM: number;
}

/** The declared rule, applied. Separate from `occupiedDepthM` so the widening above happens at a
 *  function boundary and the undeclared case is reachable instead of merely unrepresentable. */
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

/** The distance from the wall plane to the front of the space this body fills — §3.1's full extent
 *  on the depth axis, and the single answer `deriveColumns` (§3.2's MAX) and `openingFromPlacement`
 *  (§5.3's swap opening) both read.
 *
 *  **A clearance, and never a build depth** (ADR 0060 decision 1). Its MAX over a column includes an
 *  appliance's door bars — 742 mm over the freestanding fridge — which is the correct answer to
 *  "how much space does this occupy" and no answer at all to "how deep do we build the next body".
 *  `columnBuildDepthM` in `cabinet-depth-rule.ts` answers the second, and the `ClearanceM` /
 *  `BuildDepthM` pair is what stops one being read as the other.
 *
 *  Fails closed. Every reachable placement has a catalogue entry — `derivePlacementRecords` throws
 *  `UnknownBodyError` before this is called — so the only way here without a rule is a `BodyCatalog`
 *  that omitted one, which is a defect in that catalogue and not an occasion for a fallback. */
export function occupiedDepthM(record: PlacementRecord): ClearanceM {
  return occupiedDepthFromSeat({
    buildId: record.buildId,
    rule: record.occupiedDepth,
    seatDepthM: record.frame.d,
  });
}
