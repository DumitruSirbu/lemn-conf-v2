// Wave 6Z, ADR 0103 decision 2: **a body already standing in a column an insert touched is
// re-planned at the column as it stands after the insert.**
//
// The owner's rule, positively: put a full-height cabinet under a top and the top takes the lifted
// depth; put an ordinary one under it and the top takes the capped depth. Those are not two branches
// here. They are what `resolveDepthM` already answers for a wall-band body, so **this module adds no
// depth arithmetic and must not acquire any** (decision 5). It decides *which* bodies are re-asked
// and hands each to `rebuild`, the same path an insert takes.
//
// **A remove re-plans nothing, and that asymmetry is a decision rather than a gap** (ADR 0103
// decision 2). The owner ruled it: a delete is usually the first half of a replacement, so
// re-planning there would do the work twice and make the scene jump. The interim state — a deep top
// with nothing under it — is accepted as transient. There is no mirror of this file and none is to be
// written.
//
// It lives beside `insert-body.ts` rather than inside it because that file's head comment says it is
// one code path for §5.2 and §5.3, and re-planning a body the customer did not select is neither.
import { normaliseBand } from "../bands.js";
import { depthFollowsSetting } from "../cabinet-depth-rule.js";
import type { InsertableBody } from "../catalog.js";
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

/** Everything the re-plan needs, and all of it already held by `insertBody`'s `applyPlacement`.
 *
 *  It extends `RebuildInput` because `rebuild` is the mechanism: `design` is the design **after** the
 *  insert, `columns` is `ColumnSplit.columns` — the recorded face with `hasFullHeightUnder`
 *  re-answered over the post-insert records — and `probe` is the one the caller already leased for
 *  this command — ADR 0103 decision 8: the re-plan runs inside the bracket the caller already
 *  opened, and takes no lease of its own. The greppable form of that claim is asserted in this
 *  wave's domain suite, over this file's source. */
export interface DependentReplanInput extends RebuildInput {
  /** The records the design had **before** the insert. One of the two operands of the
   *  `hasFullHeightUnder` comparison, and the only reason this module needs the past at all. */
  readonly recordsBefore: readonly PlacementRecord[];
  /** The records the design has **after** the insert — the same set `splitColumn` was handed. */
  readonly recordsAfter: readonly PlacementRecord[];
  /** The frozen map as it stood **before** `splitColumn` wrote to it, so "every key the split wrote"
   *  is computable as the keys the map has gained rather than being reported by the split. */
  readonly columnsBeforeSplit: ReadonlyMap<string, Column>;
  /** `ColumnSplit.occupiedKey` — the key the body just placed now stands under. */
  readonly occupiedKey: string;
  /** The placement the customer just inserted. It was planned at this column a moment ago and is
   *  never re-planned by this module. */
  readonly placedId: string;
  /** The body the customer asked to insert, named beside the dependent one in the refusal. */
  readonly placedLabel: string;
}

/** The placements to write, in document order, or the one refusal that stops the whole insert.
 *
 *  **A body this module leaves alone is passed through by identity**, so a caller can compare with
 *  `toBe` and a re-plan that rewrites an unchanged body is caught (ADR 0103's acceptance criteria).
 *  The re-plan is a no-op far more often than not: it fires on every insert and changes something
 *  only where a standing wall body's depth the column decides has moved. */
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

/** **The trigger, and it is deliberately not a `hasFullHeightUnder` flip** (ADR 0103 decision 3).
 *
 *  The flip is the design an implementer reaches for first and it is measurably wrong: in the case the
 *  owner reported — delete the pantry, put an ordinary base cabinet back under the deep top — the flag
 *  is `false` before the insert and `false` after it, and the top still has to shallow out. The
 *  trigger is *this insert wrote to a column that already held a body whose depth the column decides*.
 *
 *  Three clauses, and neither of the last two is redundant. `isFullHeightUnder` asks about **overlap
 *  along the wall, not column membership**, so a full-height body wider than its own column lifts
 *  its neighbours too — a key the split never wrote can still change its answer. The shipped kitchen
 *  cannot exercise that, so it owes a declared witness rather than a hopeful comment (ADR 0093
 *  decision 2).
 *
 *  **The third clause is the same overlap read in the other direction, and it was missing** (wave
 *  6Z's own adversarial QA). A flag *flip* catches an ordinary top being **lifted** by a full-height
 *  body arriving beside it, because the flag goes false -> true. It cannot catch the reverse: an
 *  **ordinary** body inserted into a slot that overhangs a neighbouring column leaves the flag false
 *  on both sides, so the overhung top kept a lifted depth nothing under it justified any more —
 *  which is exactly the case the owner reported as S1, and exactly why decision 3 rejects the
 *  flip-triggered design. The rejection had been applied to the column-membership route and not to
 *  the overlap route. So: every column this body reaches across is re-asked, whatever its band.
 *
 *  **Widening the set costs nothing where nothing moved**, and that — not "it never fires here" — is
 *  why the shipped kitchen's re-plan count is unchanged by this clause. It *does* fire: wall A's
 *  column extents overlap each other, `A|0.45` spanning 0..900 across `A|0.30` (0..600) and `A|0.75`
 *  (600..900), so an ordinary insert on that wall reaches two neighbouring keys one tap from load.
 *  What the clause reaches, `replanOne` then passes through by identity, because those bodies
 *  already stand at the depth their column decides. It changes *which* members are asked, never the
 *  answer. (`apps/web/tests/store/qa-6z-replan-triggers.adversarial.test.ts` pins that, so a later wave
 *  cannot read the unchanged count as "this clause is dead" and delete it.)
 *
 *  **Both operands are the recorded face** (ADR 0090 Amendment B), over the same extents and the same
 *  key space: one function, two record sets. Nothing here reads the published map and nothing reaches
 *  for `deriveColumns` — publishing-face inputs to a recording decision is M6-AUD-005. */
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
      // **Same wall first, and it is not a formality.** Both walls originate at the same corner and
      // walk their own axis, so `overlapsAlongWall` compares two numbers that mean different places
      // unless the wall is checked — the guard `isFullHeightUnder` applies for the same reason.
      // Without it this clause matched a wall-A insert against a wall-B column at the same
      // coordinate and re-planned a body on the other side of the room; wave 6Z's own offer sweep
      // caught it as 79 re-plans where 24 were expected.
      if (placed.wall === column.wall && overlapsAlongWall(placed, column))
        keys.add(key);
    }
  }
  return keys;
}

/** One placement, re-planned or passed through **by identity**.
 *
 *  The order is the decision's: ask what the column decides *before* building anything. A body the
 *  column decides no differently for is written through untouched — it takes no measurement, it
 *  keeps its recorded identity, and it cannot raise a refusal. That is ADR 0103 decision 3's own
 *  sentence, and it is why an ordinary swap in place still probes exactly one body. Building first
 *  and comparing afterwards would look equivalent and is not: it measures bodies nothing moved and
 *  turns a no-op into a refusal wherever a standing body could not be rebuilt for a reason this
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
    // A re-plan moves a body's **depth** and nothing else: it takes the along-wall centre and the
    // width it is already standing at, so `rebuild` writes the same extent back, and only the seat —
    // and with it the catalogue identity `resolveRebuildBody` declares (ADR 0022, ADR 0103
    // decision 11) — moves.
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

/** The outcome test, asked of `resolveDepthM` through `columnDecidesADifferentDepth` — the same
 *  authority, in the same place, that the rebuild will plan through. **This module computes no
 *  depth**; it assembles the question out of the column the split just wrote and the swap opening
 *  the standing body already occupies (ADR 0103 decision 5).
 *
 *  The column is present by construction: the affected keys are taken *from* the post-split map, and
 *  a member's key is one of them or it is not a dependent member at all. */
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
    // An insert does not change `settings.cabinetDepthMm`, so the design this reads is at the same
    // setting the caller's probe was leased at (ADR 0103 decision 8). There is no depth to pass
    // around, which is the one respect in which this is simpler than `setCabinetDepth`.
    cabinetDepthMm: cabinetDepthMmOf(input.design),
  });
}

/** A record and the §7 entry it would be rebuilt through, joined — or `undefined` where this
 *  placement is none of this module's business. */
interface DependentMember {
  readonly record: PlacementRecord;
  readonly body: InsertableBody;
}

/** **Who is re-planned, decided by declaration and never by name** (ADR 0103 decision 4). A list of
 *  build ids here or in a test fails ADR 0058 decision 2 — *"a constant that silently stops tracking
 *  anything rots; a declaration is greppable and testable"* — so every clause below reads a field the
 *  catalogue entry already carries. */
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
  // **The wall corner returns, and they are written through untouched.** They are `recorded-shell`,
  // they follow the setting, and they declare no `catalogEquivalentId`, so there is nothing to
  // rebuild them through. `setCabinetDepth` *reseats* such a body because the setting it was measured
  // against has moved; an insert does not move the setting, so this wave neither rebuilds nor reseats
  // them. A measurement taken for no reason is what ADR 0077 decision 1's joint-seat case costs.
  if (!body) return undefined;
  return { record, body };
}

/** The three declarations that decide whether the column has any say in this body's depth.
 *
 *  1. **Band.** `resolveDepthM` never consults `hasFullHeightUnder` for a base or column body; it
 *     returns the opening's own clearance. There is nothing to re-answer. Read off the entry and
 *     normalised, because `top` is a row rather than a band (ADR 0011 Gap C) and the deep tops are
 *     exactly the bodies this wave exists for.
 *  2. **Depth rule.** ADR 0058's declaration, asked exactly as `setCabinetDepth`'s
 *     `movesWithTheSetting` asks it. A `pinned` or `manufactured-size` row's depth is not the
 *     column's to decide.
 *  3. **Where its occupied depth is measured from — and this one is the hood.** A `wall-plane` entry
 *     states where it finishes, so the column does not decide it, and re-planning one could change
 *     nothing *but* its identity: measured, `hood-600` resolves to `hood` and `fixedWidth` flips
 *     true → false, handing the customer a width control the fixture deliberately withholds. That is
 *     product-logic review R3.2's defect, which `moveHood` exists to prevent, and this wave will not
 *     deliver it through a new door. (`docs/BACKLOG.md` entry 57 records that a depth change already
 *     does — it is not this wave's.) */
function columnDecidesItsDepth(definition: BodyDefinition): boolean {
  const rule = definition.depthRule;
  return (
    normaliseBand(definition.band) === "wall" &&
    // An entry that declares no rule at all is left alone rather than guessed at — the stance
    // `movesWithTheSetting` takes for the same question one file over, so the two cannot come to
    // disagree about which bodies the setting reaches.
    rule !== undefined &&
    depthFollowsSetting(rule) &&
    definition.occupiedDepth.measuredFrom === "recorded-shell"
  );
}
