// ADR 0103 decision 2: a body already standing in a column an insert touched is re-planned at the
// column as it stands after the insert.
//
// Put a full-height cabinet under a top and the top takes the lifted depth; put an ordinary one under it
// and it takes the capped depth. Both are what `resolveDepthM` already answers for a wall-band body, so
// this module decides *which* bodies are re-asked, hands each to `rebuild`, and must acquire no depth
// arithmetic.
//
// A remove re-plans nothing, by decision: a delete is usually the first half of a replacement, so
// re-planning there would do the work twice and make the scene jump. The interim deep top with nothing
// under it is accepted as transient, and no mirror of this file is to be written.
//
// It lives beside `insert-body.ts` because that file is one code path for §5.2 and §5.3, and
// re-planning a body the customer did not select is neither.
import { normaliseBand } from "../bands.js";
import { depthFollowsSetting } from "../cabinet-depth-rule.js";
import type { BodyLabel, InsertableBody } from "../catalog.js";
import { cabinetDepthMmOf } from "../design.js";
import type { DesignPlacement } from "../design.js";
import {
  overlapsAlongWall,
  withCurrentFullHeightMembers,
  type BodyDefinition,
  type Column,
  type PlacementRecord,
} from "../void-engine.js";
import {
  columnDecidesADifferentDepth,
  openingFromPlacement,
} from "./insert-fit.js";
import { rebuild } from "./rebuild-resized-bodies.js";
import { resolveRebuildBody } from "./resolve-column-members.js";
import type { RebuildInput, Resolved } from "./width-resize-model.js";

/** Everything the re-plan needs, all already held by `insertBody`'s `applyPlacement`. It extends
 *  `RebuildInput` because `rebuild` is the mechanism: `design` is the design **after** the insert,
 *  `columns` is `ColumnSplit.columns` (the recorded face with `hasFullHeightUnder` re-answered over the
 *  post-insert records), and `probe` is the caller's lease: the re-plan runs inside that bracket and
 *  takes none of its own (ADR 0103 decision 8). */
export interface DependentReplanInput extends RebuildInput {
  /** The records before the insert: one of the two operands of the `hasFullHeightUnder` comparison. */
  readonly recordsBefore: readonly PlacementRecord[];
  /** The records the design has **after** the insert — the same set `splitColumn` was handed. */
  readonly recordsAfter: readonly PlacementRecord[];
  /** The frozen map before `splitColumn` wrote to it, so the keys the split wrote are computable as the
   *  keys the map gained. */
  readonly columnsBeforeSplit: ReadonlyMap<string, Column>;
  /** `ColumnSplit.occupiedKey` — the key the body just placed now stands under. */
  readonly occupiedKey: string;
  /** The placement the customer just inserted; planned at this column a moment ago, never re-planned
   *  here. */
  readonly placedId: string;
  /** The body the customer asked to insert, named beside the dependent one in the refusal. */
  readonly placedLabel: BodyLabel;
}

/** The placements to write, in document order, or the one refusal that stops the whole insert. A body
 *  left alone is passed through by identity, so a caller can `toBe`-compare and catch a re-plan that
 *  rewrites an unchanged body. */
export function replanDependentMembers(
  input: DependentReplanInput,
): Resolved<readonly DesignPlacement[]> {
  const affected = affectedColumnKeys(input);
  const placements: DesignPlacement[] = [];
  for (const placement of input.design.placements) {
    const replanned = replanOne(input, affected, placement);
    if (!replanned.ok) return replanned;
    placements.push(replanned.value);
  }
  return { ok: true, value: placements };
}

/** The trigger, deliberately not a `hasFullHeightUnder` flip (ADR 0103 decision 3): delete the pantry
 *  and put an ordinary base cabinet under the deep top, and the flag is `false` before and after while
 *  the top still has to shallow out. The trigger is that this insert wrote to a column that already
 *  held a body whose depth the column decides.
 *
 *  Three clauses, none redundant. `isFullHeightUnder` asks about overlap along the wall, not column
 *  membership, so a full-height body wider than its column lifts its neighbours too, and a key the
 *  split never wrote can change its answer. The third clause is the same overlap read the other way:
 *  an ordinary body inserted into a slot that overhangs a neighbouring column leaves the flag false on
 *  both sides, so the overhung top would keep a lifted depth nothing justifies. Widening the set is
 *  free where nothing moved, since `replanOne` passes those bodies through by identity (on wall A,
 *  `A|0.45` spans 0..900 across `A|0.30` and `A|0.75`, so the clause does fire on the shipped kitchen).
 *
 *  Both operands are the recorded face (ADR 0090 Amendment B) over one key space: nothing here reads
 *  the published map or `deriveColumns`. */
function affectedColumnKeys(input: DependentReplanInput): ReadonlySet<string> {
  const keys = new Set<string>([input.occupiedKey]);
  for (const key of input.columns.keys()) {
    if (!input.columnsBeforeSplit.has(key)) keys.add(key);
  }
  const before = withCurrentFullHeightMembers(
    input.columns,
    input.recordsBefore,
  );
  for (const [key, column] of input.columns) {
    if (before.get(key)?.hasFullHeightUnder !== column.hasFullHeightUnder) {
      keys.add(key);
    }
  }

  const placed = input.recordsAfter.find(
    (record) => record.id === input.placedId,
  );
  if (placed) {
    for (const [key, column] of input.columns) {
      // Same wall first: both walls originate at the same corner and walk their own axis, so
      // `overlapsAlongWall` compares numbers that mean different places unless the wall matches (the
      // guard `isFullHeightUnder` applies for the same reason).
      if (placed.wall === column.wall && overlapsAlongWall(placed, column))
        keys.add(key);
    }
  }
  return keys;
}

/** One placement, re-planned or passed through **by identity**. Asks what the column decides *before*
 *  building anything: a body the column decides no differently for is written through untouched,
 *  taking no measurement and raising no refusal (ADR 0103 decision 3). Building first and comparing
 *  afterwards would measure bodies nothing moved and turn a no-op into a refusal for a reason this
 *  insert has nothing to do with. */
function replanOne(
  input: DependentReplanInput,
  affected: ReadonlySet<string>,
  placement: DesignPlacement,
): Resolved<DesignPlacement> {
  const member = dependentMember(input, affected, placement);
  if (!member || !standsAtADifferentDepth(input, member)) {
    return { ok: true, value: placement };
  }

  const written = rebuild(input, input.recordsAfter, {
    record: member.record,
    body: member.body,
    // A re-plan moves a body's **depth** only: it keeps its along-wall centre and width, so `rebuild`
    // writes the same extent and only the seat, and with it the catalogue identity
    // `resolveRebuildBody` declares, moves.
    alongMm: placement.alongMm,
    widthMm: placement.body.widthMm,
  });
  if (!written.ok) {
    return {
      ok: false,
      detail: {
        code: "DEPENDENT_MEMBER_NOT_REBUILDABLE",
        params: { label: input.placedLabel, memberLabel: member.body.label },
      },
    };
  }
  return { ok: true, value: written.value };
}

/** The outcome test, asked of `resolveDepthM` through `columnDecidesADifferentDepth`, the authority the
 *  rebuild plans through (ADR 0103 decision 5). The column is present by construction: the affected
 *  keys are taken from the post-split map. */
function standsAtADifferentDepth(
  input: DependentReplanInput,
  member: DependentMember,
): boolean {
  const column = input.columns.get(member.record.col);
  if (!column) return false;
  return columnDecidesADifferentDepth({
    body: member.body,
    opening: openingFromPlacement(
      member.record,
      input.recordsAfter,
      input.columns,
    ),
    column,
    // An insert does not change `settings.cabinetDepthMm`, so there is no depth to pass around.
    cabinetDepthMm: cabinetDepthMmOf(input.design),
  });
}

/** A record and the §7 entry it would be rebuilt through, joined — or `undefined` where this
 *  placement is none of this module's business. */
interface DependentMember {
  readonly record: PlacementRecord;
  readonly body: InsertableBody;
}

/** Who is re-planned, decided by declaration and never by name (ADR 0103 decision 4): every clause
 *  reads a field the catalogue entry carries, since a list of build ids would rot silently. */
function dependentMember(
  input: DependentReplanInput,
  affected: ReadonlySet<string>,
  placement: DesignPlacement,
): DependentMember | undefined {
  if (placement.id === input.placedId) return undefined;
  const record = input.recordsAfter.find(
    (candidate) => candidate.id === placement.id,
  );
  if (!record || !affected.has(record.col)) return undefined;
  const definition = input.catalog.get(record.buildId);
  if (!definition || !columnDecidesItsDepth(definition)) return undefined;
  const body = resolveRebuildBody(input.catalog, record);
  // The wall corner returns are written through untouched: they are `recorded-shell`, follow the
  // setting and declare no `catalogEquivalentId`, so there is nothing to rebuild them through.
  // `setCabinetDepth` reseats them because the setting moved; an insert does not move it.
  if (!body) return undefined;
  return { record, body };
}

/** The three declarations that decide whether the column has any say in this body's depth.
 *
 *  1. Band: `resolveDepthM` never consults `hasFullHeightUnder` for a base or column body. Read off the
 *     entry and normalised, because `top` is a row rather than a band (ADR 0011 Gap C).
 *  2. Depth rule, asked as `setCabinetDepth`'s `movesWithTheSetting` asks it: a `pinned` or
 *     `manufactured-size` row's depth is not the column's to decide.
 *  3. Where its occupied depth is measured from: a `wall-plane` entry states where it finishes, so
 *     re-planning the hood could change nothing but its identity (`hood-600` would resolve to `hood`
 *     and `fixedWidth` flip to false, handing the customer a width control the fixture withholds;
 *     `moveHood` exists to prevent that). */
function columnDecidesItsDepth(definition: BodyDefinition): boolean {
  const rule = definition.depthRule;
  return (
    normaliseBand(definition.band) === "wall" &&
    // An entry that declares no rule is left alone rather than guessed at, as in `movesWithTheSetting`,
    // so the two cannot disagree about which bodies the setting reaches.
    rule !== undefined &&
    depthFollowsSetting(rule) &&
    definition.occupiedDepth.measuredFrom === "recorded-shell"
  );
}
