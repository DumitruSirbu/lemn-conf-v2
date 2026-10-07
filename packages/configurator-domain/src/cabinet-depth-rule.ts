// Whether a catalogue entry's depth follows the cabinet-depth setting: declared per entry, never inferred
// from a band or a kind. A body that holds still because somebody wrote 600 down is indistinguishable
// from one nobody parameterised, so the pin is a greppable declaration and an entry that declares
// nothing throws (as `occupied-depth.ts` and `cabinet-handles.ts` do for theirs).
//
// The other half of the same subject (ADR 0060): what a cabinet in a given column is *built* to
// (`columnBuildDepthMm`), a declaration read off the map and the line, never a measurement of what
// stands there. That is why it lives here and not beside `occupiedDepthM`.
import { toMetres } from "./millimetres.js";
// Type-only, so this module gains no runtime dependency on the clearance side.
import type { ClearanceM } from "./occupied-depth.js";
import {
  requireDeclaredCabinetDepthMm,
  wallDepthMmForWorktop,
} from "./worktop-depth.js";

/** Which depth-derived corner chain moves a wall-B placement when the cabinet depth changes. */
export type AlongWallDepthChain = "base-formula" | "wall-map";

/** Whether this entry's depth follows the cabinet-depth setting, declared per catalogue entry
 *  (`BodyDefinition.depthRule`).
 *
 *  - `cabinet-depth`: cabinetry; its finished depth is a function of the setting, through the base
 *    formula, the wall map or the column carcass (ADR 0036 decision 5).
 *  - `manufactured-size`: an appliance whose depth is a real machine's (a freestanding fridge is 742 mm
 *    deep in a 600 mm kitchen and in a 700 mm one). A statement that the body is not cabinetry.
 *  - `pinned`: cabinetry deliberately held at one depth. The pin carries the body's own finished depth,
 *    not a setting it might coincide with: rebuilding a pinned row from a setting value would send it
 *    back through the wall map, and `wallCarcassSeatDepthMm(600)` is 291 where a pinned deep top seats
 *    at 561. No shipped entry declares it; the arm is kept so the next pin is a compile error away
 *    (ADR 0101 decision 3), and each suite that needs a pinned body declares its own.
 *
 *  There is no "unknown" arm and no default: an entry that answers none of these is refused by
 *  `cabinetDepthRuleOf`. */
export type CabinetDepthRule =
  | {
      readonly follows: "cabinet-depth";
      readonly alongWallPositionFollows: AlongWallDepthChain;
    }
  | {
      readonly follows: "manufactured-size";
      readonly alongWallPositionFollows: AlongWallDepthChain;
    }
  | {
      readonly follows: "pinned";
      readonly pinnedFinishedDepthMm: number;
      readonly alongWallPositionFollows: AlongWallDepthChain;
    };

/** Cabinetry: this body's depth is a function of the setting. */
export const FOLLOWS_CABINET_DEPTH: CabinetDepthRule = {
  follows: "cabinet-depth",
  alongWallPositionFollows: "base-formula",
};

/** Structural wall returns follow the wall-depth map rather than the base-run formula. */
export const FOLLOWS_CABINET_DEPTH_ON_WALL_MAP: CabinetDepthRule = {
  follows: "cabinet-depth",
  alongWallPositionFollows: "wall-map",
};

/** An appliance: its depth is a machine's and no setting reaches it. Named rather than written as a pin
 *  at every depth: a pin is a decision about a cabinet, this is a fact about a product. */
export const IS_A_MANUFACTURED_SIZE: CabinetDepthRule = {
  follows: "manufactured-size",
  alongWallPositionFollows: "base-formula",
};

/** Cabinetry deliberately held at one declared **finished** depth, the space the built body fills.
 *  Nothing in the shipped catalogue calls it (ADR 0101 decision 3); suites that declare their own pinned
 *  body keep the arm falsifiable. */
export function pinnedAtFinishedDepthMm(
  pinnedFinishedDepthMm: number,
  alongWallPositionFollows: AlongWallDepthChain,
): CabinetDepthRule {
  return {
    follows: "pinned",
    pinnedFinishedDepthMm,
    alongWallPositionFollows,
  };
}

/** A catalogue entry that declares nothing about whether its depth follows the setting: a programming
 *  error, not a body to guess at. Read as "does not follow" it ships a cabinet that stopped tracking
 *  the setting; read as "follows" it silently unpins a pinned one; neither shows in a scene at the one
 *  shipped depth. */
export class UndeclaredCabinetDepthRuleError extends Error {
  constructor(buildId: string, declared: unknown) {
    super(
      `No cabinet-depth rule declared for buildId "${buildId}". ` +
        `Found: ${describeDeclared(declared)}.`,
    );
    this.name = "UndeclaredCabinetDepthRuleError";
  }
}

function describeDeclared(declared: unknown): string {
  return declared === undefined ? "nothing" : JSON.stringify(declared);
}

/** What this module needs and nothing more. `rule` is typed wider than `BodyDefinition` declares it, as
 *  in `occupied-depth.ts` and `cabinet-handles.ts`: `BodyCatalog` is a port, so a definition assembled
 *  outside TypeScript can arrive with no rule, and that must be refused rather than guessed at. */
export interface CabinetDepthRuleQuery {
  readonly buildId: string;
  readonly rule: CabinetDepthRule | undefined;
}

/** **The rule this entry declares**, or a refusal naming the entry. Fails closed. */
export function cabinetDepthRuleOf(
  query: CabinetDepthRuleQuery,
): CabinetDepthRule {
  if (
    query.rule?.alongWallPositionFollows !== "base-formula" &&
    query.rule?.alongWallPositionFollows !== "wall-map"
  ) {
    throw new UndeclaredCabinetDepthRuleError(query.buildId, query.rule);
  }
  // The guard above throws unless `alongWallPositionFollows` is one of two literals, which narrows
  // `rule` to non-nullish here — an optional chain would read as though it could still be absent.
  switch (query.rule.follows) {
    case "cabinet-depth":
    case "manufactured-size":
    case "pinned":
      return query.rule;
    default:
      throw new UndeclaredCabinetDepthRuleError(query.buildId, query.rule);
  }
}

/** Whether this entry's finished depth may differ between two cabinet depths: the one question the gate
 *  and the migration both ask, so neither restates the switch. Phrased as "may move" rather than "is
 *  pinned" so a fourth arm is a compile error here, not a silent `false` at every call site. */
export function depthFollowsSetting(rule: CabinetDepthRule): boolean {
  switch (rule.follows) {
    case "cabinet-depth":
      return true;
    case "manufactured-size":
    case "pinned":
      return false;
  }
}

/** What a cabinet standing in this column is built to: a manufactured size, and the type `resolveDepthM`
 *  and `InsertPlan.depthM` are stated in. Nominal on purpose (ADR 0060 decision 1): a column publishes
 *  two depth facts, `ClearanceM` (space occupied, handles included) and this (how deep the next body is
 *  built), and a plain `number` is not assignable here, so handing a clearance where a build depth is
 *  wanted is a compile error. Produced only by `columnBuildDepthM` or the one named crossing
 *  `buildToTheClearanceM`. */
export type BuildDepthM = number & { readonly __buildDepthM: unique symbol };

/** The two facts a build depth is derived from (ADR 0060 decision 2). */
export interface ColumnBuildDepthQuery {
  /** The kitchen's declared cabinet depth in millimetres. */
  readonly cabinetDepthMm: number;
  /** `Column.hasFullHeightUnder`: whether a full-height member stands under this column, which is
   *  what lifts §5.2's head-clearance cap. */
  readonly hasFullHeightUnder: boolean;
}

/** The build depth is a declared size, never a measurement of what happens to stand there
 *  (ADR 0060 decision 2). Two answers:
 *
 *  - The cap applies: the map's wall depth for this cabinet depth (330 at 600, 400 at 700), the row
 *    §7's `nominalDepthMm` reads. This is §7's `min(d, cap)` head-clearance rule, not a geometry limit
 *    (`wallCabinet(W, doors, H, D)` builds any depth it is handed). It lives in the domain because it
 *    depends on what stands under the opening, which the adapter cannot see.
 *  - A full-height member lifts it to the cabinet-depth line: 600 at 600, 700 at 700. The three deep
 *    tops on wall B answer through this arm.
 *
 *  Never the clearance MAX: a formula produced depths nobody makes (703 and 742 mm). A cabinet depth the
 *  map does not declare throws on either arm, checked once at the entry by
 *  `requireDeclaredCabinetDepthMm`: the lifted arm is an identity with no range of its own, and the
 *  number arrives from a stored document through `migrateDesign`. */
export function columnBuildDepthMm(column: ColumnBuildDepthQuery): number {
  const cabinetDepthMm = requireDeclaredCabinetDepthMm(column.cabinetDepthMm);
  return column.hasFullHeightUnder
    ? cabinetDepthLineMm(cabinetDepthMm)
    : wallDepthMmForWorktop(cabinetDepthMm);
}

/** `columnBuildDepthMm` in the unit the command layer plans in. */
export function columnBuildDepthM(column: ColumnBuildDepthQuery): BuildDepthM {
  return toMetres(columnBuildDepthMm(column)) as BuildDepthM;
}

/** Whether this entry declares that a rebuild answers its depth through the lifted arm above
 *  (ADR 0101 decision 1). The one reader of `BodyDefinition.builtDepthFollowsALiftedColumn`: an absent
 *  declaration reads as *no*, and a row the catalogue does not hold declares nothing, so the ordinary
 *  equivalence comparison applies. */
export function declaresALiftedColumnDepth(
  definition: { readonly builtDepthFollowsALiftedColumn?: boolean } | undefined,
): boolean {
  return definition?.builtDepthFollowsALiftedColumn === true;
}

/** The cabinet-depth line: the setting itself. Named because 600 stands for three facts here (the
 *  setting, the line a hood's front hangs on (ADR 0039 decision 2), a pinned body's finished depth)
 *  and only the first lifts the cap. */
function cabinetDepthLineMm(cabinetDepthMm: number): number {
  return cabinetDepthMm;
}

/** The one place a clearance crosses into a build depth: one greppable site instead of an implicit
 *  assignment at every call. It takes a `ClearanceM`, not a `number`, so a bare number cannot be
 *  laundered into a `BuildDepthM`; `recordedClearanceM` stays the only way a wire number becomes a
 *  clearance.
 *
 *  Three callers pass different clearances on purpose:
 *  - the capped arm's floor, the *column's* clearance: §7's cap is a maximum, never a target, so a
 *    column shallower than the declared depth keeps its own. Not the opening's: the two routes publish
 *    different openings (`openingFromVoid` the column's clearance, `openingFromPlacement` the outgoing
 *    body's);
 *  - a band the head-clearance rule does not reach, the opening's own clearance: base, full-height and
 *    appliance builders ignore the depth argument (the `wall-plane` rule), so §5.2's `b.mk(w, h, void.d)`
 *    governs;
 *  - `columnDecidesADifferentDepth`'s outcome test, a standing body's own clearance read off the swap
 *    opening, so both sides of the comparison share a type (ADR 0103 decision 3). */
export function buildToTheClearanceM(clearanceM: ClearanceM): BuildDepthM {
  // Through a plain `number` because the two brands do not overlap, so no direct assertion exists
  // between them.
  const metres: number = clearanceM;
  return metres as BuildDepthM;
}

/** The shallower of a declared build depth and what the space allows. Both are build depths, so no
 *  clearance reaches the result except through `buildToTheClearanceM`. */
export function shallowerBuildDepthM(
  declaredM: BuildDepthM,
  availableM: BuildDepthM,
): BuildDepthM {
  return Math.min(declaredM, availableM) as BuildDepthM;
}
