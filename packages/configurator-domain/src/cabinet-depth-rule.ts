// Whether a catalogue entry's depth follows the cabinet-depth setting — **declared per entry, never
// inferred from a band or a kind, and never a constant that quietly stops tracking anything.**
//
// ADR 0058 decision 2. Two of the shipped top cabinets are deliberately deep because the columns
// they hang over are, and the owner ruled that they stay at 600 in a 700 mm kitchen. A body that
// holds still because somebody wrote 600 down is indistinguishable, six months later, from a body
// that holds still because somebody forgot to parameterise it — and the second is exactly what wave
// 6H found in `BASE_DEPTH_MM` and wave 6I found in `COLUMN_DEPTH_MM`. So the pin is a declaration a
// reader can grep and a test can sweep, and an entry that declares nothing **throws** rather than
// being read as pinned.
//
// The same stance `occupied-depth.ts` takes for an undeclared depth rule and `cabinet-handles.ts`
// takes for an undeclared handle count, for the same reason: the failure is invisible in a scene.
//
// **Wave 6I2 adds the other half of the same subject** (ADR 0060): what a cabinet standing in a
// given column is *built* to. The rule above says whether an entry's depth follows the setting;
// `columnBuildDepthMm` below says what the setting then makes it. Both are declarations read off
// the map and the line, never measurements of what happens to stand there — which is why they live
// together rather than beside `occupiedDepthM`, whose whole subject is the opposite: converting a
// recorded seat back into the space a placed body actually fills.
import { toMetres } from "./millimetres.js";
// Type-only, so this module gains no runtime dependency on the clearance side — it needs the
// *type* to refuse anything that is not a clearance, and none of its behaviour.
import type { ClearanceM } from "./occupied-depth.js";
import {
  requireDeclaredCabinetDepthMm,
  wallDepthMmForWorktop,
} from "./worktop-depth.js";

/** Which depth-derived corner chain moves a wall-B placement when the cabinet depth changes. */
export type AlongWallDepthChain = "base-formula" | "wall-map";

/** **Whether this entry's depth follows the cabinet-depth setting** — declared per catalogue entry
 *  (`BodyDefinition.depthRule`).
 *
 *  Three answers, because the shipped catalogue holds three kinds of body and no more:
 *
 *  - **`cabinet-depth`** — cabinetry. Its finished depth is a function of the setting, whether
 *    through the base formula, the wall map or the column carcass (ADR 0036 decision 5). Most of
 *    the catalogue.
 *  - **`manufactured-size`** — an appliance whose depth is a real machine's, so the setting cannot
 *    move it: a freestanding fridge is 742 mm deep in a 600 mm kitchen and in a 700 mm one. This is
 *    **not** an exception being granted; it is a statement that the body is not cabinetry.
 *  - **`pinned`** — cabinetry that is deliberately held at one depth anyway (ADR 0058 decision 1).
 *    The pin carries the body's own **finished** depth — the space it fills, ADR 0058 decision 3's
 *    "identical (600) at both" — so the declaration says what the body *is* rather than merely that
 *    it does not move. Deliberately **not** the cabinet-depth setting it might coincide with: a
 *    reader rebuilding a pinned row from a setting value would send it back through the wall map,
 *    and `wallCarcassSeatDepthMm(600)` is 291 where a pinned deep top would seat at 561.
 *
 *    **No shipped entry declares it since ADR 0101**, which unpinned the three deep tops so they
 *    follow the setting. The arm is kept rather than retired (ADR 0101 decision 3): a compile
 *    error is what should greet the next person who needs a pin, not a blank page. Each suite that
 *    needs a pinned body **declares its own** — ADR 0093 decision 2's pattern — so the rule's
 *    falsifiability is never a property of whichever bodies the demo kitchen happens to carry.
 *
 *  There is deliberately no arm meaning "unknown" and no default. An entry that answers none of
 *  these has not been thought about, and `cabinetDepthRuleOf` refuses it. */
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

/** An appliance: this body's depth is a machine's, and no setting reaches it. Named rather than
 *  written as a pin at every depth, because the two are different facts — a pin is a decision about
 *  a cabinet and this is a fact about a product nobody here builds. */
export const IS_A_MANUFACTURED_SIZE: CabinetDepthRule = {
  follows: "manufactured-size",
  alongWallPositionFollows: "base-formula",
};

/** ADR 0058 decision 1: cabinetry deliberately held at one declared **finished** depth — the space
 *  the built body fills, which is what a 6J migration reading "rebuild it at the depth it is pinned
 *  at" has to be handed.
 *
 *  **Nothing in the shipped catalogue calls it since ADR 0101.** Its callers are the suites that
 *  declare a pinned body of their own to keep the arm falsifiable, and it stays exported for the
 *  next entry that genuinely needs a pin. */
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

/** A catalogue entry that says nothing about whether its depth follows the setting. **A programming
 *  error rather than a body to guess at**: read as "does not follow" it silently ships a cabinet
 *  that stopped tracking the setting, and read as "follows" it silently unpins one of ADR 0058's two
 *  deliberately deep tops. Neither failure is visible in a scene at the one depth the product ships
 *  at today, which is precisely how `COLUMN_DEPTH_MM` stayed a literal 560 with every suite green. */
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

/** What this module needs and nothing more: the declaration, and the id a refusal has to name.
 *
 *  `rule` is typed **wider than `BodyDefinition` declares it, on purpose**, for the reason
 *  `occupied-depth.ts` and `cabinet-handles.ts` widen their own: `BodyCatalog` is a port, a
 *  definition assembled outside TypeScript can arrive with no rule at all, and that is the case this
 *  module must refuse rather than guess at. */
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

/** **Whether this entry's finished depth is allowed to differ between two cabinet depths.** The one
 *  question wave 6I's gate and wave 6J's migration both ask, so neither restates the switch: an
 *  entry that tracks the setting must move, and one that declares an exception must not.
 *
 *  Phrased as "may move" rather than "is pinned" so that adding a fourth arm to the rule is a
 *  compile error here instead of a silent `false` at every call site. */
export function depthFollowsSetting(rule: CabinetDepthRule): boolean {
  switch (rule.follows) {
    case "cabinet-depth":
      return true;
    case "manufactured-size":
    case "pinned":
      return false;
  }
}

// ---------------------------------------------------------------------------------------------
// ADR 0060 — the build depth, the second fact a column publishes beside its clearance.
// ---------------------------------------------------------------------------------------------

/** **What a cabinet standing in this column is built to** — a manufactured size, and the type
 *  `resolveDepthM` and `InsertPlan.depthM` are stated in.
 *
 *  Nominal on purpose (ADR 0060 decision 1). A column publishes **two** depth facts and they answer
 *  different questions: `occupiedDepthM`'s `ClearanceM` is *"how much space does this occupy,
 *  handles included"* and this is *"how deep is the next body built"*. They were one `number` until
 *  this wave, which is how `resolveDepthM` came to hand the probe a clearance MAX — 703 and 742 mm,
 *  depths nobody manufactures (`docs/BACKLOG.md` entry 15). A plain `number` is not assignable
 *  here, so handing a clearance where a build depth is wanted is a **compile error** rather than a
 *  comment somebody has to read.
 *
 *  There is deliberately no constructor from a bare depth that does not say what it is: this type
 *  is produced by `columnBuildDepthM` — the declaration — or by `buildToTheClearanceM`, the one named
 *  crossing, and by nothing else. */
export type BuildDepthM = number & { readonly __buildDepthM: unique symbol };

/** The two facts ADR 0060 decision 2 derives a build depth from, and nothing else.
 *
 *  A named object rather than a number and a positional boolean, per the conventions: the boolean
 *  is a fact about the column being asked about, not a flag selecting a behaviour. */
export interface ColumnBuildDepthQuery {
  /** The kitchen's declared cabinet depth in millimetres — `WORKTOP_DEPTH_MM` until wave 6J gives a
   *  design one of its own. */
  readonly cabinetDepthMm: number;
  /** `Column.hasFullHeightUnder`: whether a full-height member stands under this column, which is
   *  what lifts §5.2's head-clearance cap. */
  readonly hasFullHeightUnder: boolean;
}

/** **ADR 0060 decision 2: the build depth is a declared size, never a measurement of what happens
 *  to stand there.**
 *
 *  Two answers and no third:
 *
 *  - **The cap applies** — the map's wall depth for this cabinet depth: 330 at 600, 400 at 700. The
 *    same row §7's `nominalDepthMm` reads, so the cap and the catalogue nominal cannot drift apart
 *    (ADR 0028 decision 3). This arm **is** §7's `min(d, cap)` cap, and it is a head-clearance rule
 *    rather than a geometry limit: a wall cabinet above a worktop is shallow so nobody hits their
 *    head leaning over the counter, and `wallCabinet(W, doors, H, D)` builds any depth it is handed.
 *    Backlog entry 5, decided by the owner on 2026-08-26. It lives in the domain rather than beside
 *    the builders because it is a function of the **design** — of what stands under the opening —
 *    and the adapter cannot see one (§12: the domain owns product rules, the adapter owns builders).
 *    It had a second name of its own, `wallCarcassMaxDepthOverWorktopM`, until wave 6I2's own
 *    `resolveDepthM` stopped calling it and only tests were left; a gate reading the cap through a
 *    test-only alias is how the gate goes missing when the alias does.
 *  - **A full-height member lifts it** — the **cabinet-depth line**: 600 at 600, 700 at 700. The
 *    lift was always meant to raise the ceiling from the map's 330 to that line (ADR 0028
 *    decision 5), and was implemented as "return the opening's depth", which coincided with the
 *    intent only while nothing measured an appliance's handles. Wave S9 ended the coincidence.
 *
 *    **This is the arm the three deep tops on wall B answer through** (ADR 0101). ADR 0028
 *    decision 5 once added *"which is what keeps the two deep top cabinets at 600 over their
 *    columns"*; that clause is **struck** — it was true only while 600 was the product's one
 *    cabinet depth, and what held those rows still was ADR 0058's **pin**, never this lift. The
 *    pin is gone since ADR 0101 and the lift is what now takes them to 700, so the arm's rule is
 *    confirmed by the change that removed its supposed consequence.
 *
 *  **Never the clearance MAX.** That is ADR 0028 decision 4's rule — a declaration, not a
 *  computation — applied to the one arm that evaded it: `worktop-depth.ts` exists precisely so a
 *  formula cannot invent a cabinet nobody makes, and 703 and 742 are what a formula produced one
 *  module over.
 *
 *  **A cabinet depth the map does not declare throws on either arm**, checked once at the entry
 *  rather than left to whichever arm the caller lands on. The capped arm gets that for free from the
 *  map lookup; the lifted arm is an identity on its input and so has no range of its own, and an
 *  identity is a declaration only as far as *its* input is one. Today the sole caller passes
 *  `WORKTOP_DEPTH_MM`, but from wave 6J the number arrives in a stored document and through
 *  `migrateDesign`, where a worktop value threaded into a cabinet-depth argument would otherwise
 *  sail through the lifted arm and be built to. Raised by logic review, 2026-09-04.
 *
 *  **`requireDeclaredCabinetDepthMm` is that one check, and it is not a second copy of the declared
 *  set.** `wallDepthMmForWorktop` keeps its own guard — the map's fail-closed contract and the
 *  single statement of which rows exist — so this asks the same set, once, before the branch. */
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

/** **Does this entry declare that a rebuild answers its depth through the lifted arm above?**
 *  ADR 0101 decision 1, and the one reader of `BodyDefinition.builtDepthFollowsALiftedColumn`, so
 *  no caller spells the property access itself and no caller can read an absent declaration as
 *  anything but *no* — which is the right answer for every row but the deep tops.
 *
 *  It lives here rather than beside `catalogEquivalentId` because the fact it states is about
 *  **this module's own lifted arm**: a row carrying it is a row whose built depth is
 *  `columnBuildDepthMm({ …, hasFullHeightUnder: true })` and not the equivalent's `frameDepthMm`.
 *  The gate that skips such a row asserts exactly that identity in the skipped assertion's place.
 *
 *  Takes a possibly-absent definition because `BodyCatalog.get` answers one, and a row the
 *  catalogue does not hold declares nothing — a real answer here rather than a refusal, since the
 *  only consequence is that the ordinary equivalence comparison applies. */
export function declaresALiftedColumnDepth(
  definition: { readonly builtDepthFollowsALiftedColumn?: boolean } | undefined,
): boolean {
  return definition?.builtDepthFollowsALiftedColumn === true;
}

/** **The cabinet-depth line: the setting itself.** Named rather than passed through anonymously,
 *  because 600 stands for three different facts in this project — the setting, the line a hood's
 *  front hangs on (ADR 0039 decision 2), and the finished depth ADR 0058 pins two top cabinets at —
 *  and only the first of the three is what lifts the cap. */
function cabinetDepthLineMm(cabinetDepthMm: number): number {
  return cabinetDepthMm;
}

/** **The one place a clearance crosses into a build depth.** One greppable site with a stated
 *  reason, instead of an implicit assignment at every call — which is the whole point of the two
 *  types being different.
 *
 *  **It takes a `ClearanceM` and not a `number`, deliberately.** A bare-`number` parameter would
 *  launder *any* value into a `BuildDepthM`, which is a hole in the one criterion this wave exists
 *  to meet: the crossing has to be from a clearance, not from whatever a caller happens to hold.
 *  Narrowed on review, 2026-09-04. `recordedClearanceM` remains the only way a wire number becomes a
 *  clearance, and it is at the persistence boundary where that is the fact being stated.
 *
 *  Two callers, both in `resolveDepthM`, and they pass **different** clearances on purpose:
 *
 *  - **The capped arm's floor — the *column's* clearance.** §7's cap is a maximum and never a
 *    target (ADR 0028; wave 5A): a column shallower than the declared depth keeps its own depth, so
 *    a body can never be built past the space that actually exists. Measured against the column and
 *    not against the opening, because the two routes publish different openings — `openingFromVoid`
 *    the column's clearance, `openingFromPlacement` the outgoing body's — and a floor read from the
 *    opening therefore made ADR 0060 decision 3 false wherever the outgoing body was not the
 *    deepest thing in its column. Raised by logic review, 2026-09-04.
 *  - **A band the head-clearance rule does not reach — the opening's own clearance.** Base,
 *    full-height and appliance builders ignore the depth argument entirely (ADR 0040's `wall-plane`
 *    rule), so no manufactured size is being decided there and §5.2's literal
 *    `b.mk(w, h, void.d)` governs. */
export function buildToTheClearanceM(clearanceM: ClearanceM): BuildDepthM {
  // Through a plain `number` because the two brands deliberately do not overlap, so there is no
  // direct assertion between them — which is the property that makes this function necessary.
  const metres: number = clearanceM;
  return metres as BuildDepthM;
}

/** The shallower of a declared build depth and what the space itself allows, named rather than
 *  written as a bare `Math.min` at the call site. Both arguments are build depths, so no clearance
 *  can reach the result except through `buildToTheClearanceM` above. */
export function shallowerBuildDepthM(
  declaredM: BuildDepthM,
  availableM: BuildDepthM,
): BuildDepthM {
  return Math.min(declaredM, availableM) as BuildDepthM;
}
