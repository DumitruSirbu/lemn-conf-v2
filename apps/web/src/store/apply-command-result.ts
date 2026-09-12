// The store's half of `docs/milestones/M3-mutations.md` work item 9: turn a domain `CommandResult`
// into the exact state the store should hold next.
//
// It lives beside the store rather than inside it for two reasons. The store's four actions stay
// the "call, apply, schedule" adapter the milestone's Boundaries section requires, and the two
// invariants that are easiest to break here — frozen columns and a selection that never dangles —
// become testable without zustand.
//
// No product rule lives here. Every guard and the ADR-sensitive reconciliation live in the domain;
// this adapter decides which existing thing is selected and shapes the store update.
import {
  findVacatedVoid,
  reconcileSuccessfulCommandResult,
  type BodyCatalog,
  type Column,
  type CommandEffect,
  type CommandResult,
  type Design,
  type PlacementRecord,
  type RejectionReason,
  type VoidRecord,
} from "@lemnaria/configurator-domain";

export type Selection = {
  readonly kind: "placement" | "void";
  readonly id: string;
} | null;

/** The state a successful command replaces in one `set()`. `lastRejection` is part of it: a
 *  command that succeeds clears the sentence a previous refusal left on screen. */
export interface AppliedCommandState {
  readonly design: Design;
  readonly records: readonly PlacementRecord[];
  /** **The published face**: the frozen extents with `hasFullHeightUnder` re-answered from the new
   *  records, and every member-less column bounded by the length of the wall it stands on. This is
   *  what openings are derived from, what the scene draws and what an insert is matched against —
   *  ADR 0069's owner ruling, that nothing past the end of a wall is ever offered. */
  readonly columns: ReadonlyMap<string, Column>;
  /** **The recorded face**: the same map with ADR 0069's wall-end cap *not* applied, which is what
   *  the document is projected from (ADR 0090 Amendment B).
   *
   *  > A pass that derives its answer from the **room** may bound what the map publishes and may not
   *  > rewrite what the document records.
   *
   *  The cap is the only stage on that side of the line. The free-ground clip, ADR 0052's split and
   *  ADR 0046's merge derive from the placements or from a declared ceiling and are in both faces:
   *  no setting change undoes them. The cap is different because wave 6J-c made the wall's own
   *  length reversible from the customer's side — a space flush to wall B's end lost 100 mm at 700
   *  and kept the loss on the way back to 600, schema-valid and validator-silent. */
  readonly recordedColumns: ReadonlyMap<string, Column>;
  readonly voids: readonly VoidRecord[];
  readonly selection: Selection;
  readonly lastRejection: null;
}

/** A refusal touches nothing but the transient reason — same design, records, voids, selection. */
export interface RefusedCommandState {
  readonly lastRejection: RejectionReason;
}

export type CommandApplication =
  | { readonly applied: true; readonly state: AppliedCommandState }
  | { readonly applied: false; readonly state: RefusedCommandState };

export interface ApplyCommandResultInput {
  readonly result: CommandResult;
  readonly catalog: BodyCatalog;
  /** ADR 0011 Gap D: a column's **extent** is frozen at load time. It is an *input* to the
   *  recompute here, never an output — recomputing it from the mutated records would shrink a
   *  column to fit what is left, so a delete would free space that produces no void at all.
   *
   *  `hasFullHeightUnder` is the one field that is not part of that extent and *is* re-answered:
   *  frozen, a column whose full-height unit was deleted in this session went on reporting one
   *  standing there while the same design reloaded reported none.
   *
   *  **The store's recorded face, not its published one** (ADR 0090 Amendment B). Handing the
   *  wall-bounded map in would carry ADR 0069's cap into the next command's record and out through
   *  `projectFrozenMap`, which is the defect that amendment closes — one command per 100 mm, and
   *  each document valid on its own. */
  readonly columns: ReadonlyMap<string, Column>;
  /** What is selected right now, which a **whole-kitchen** command leaves exactly where it was: it
   *  points at no cabinet, so it moves no selection (wave 6E). Every other effect names the
   *  placement it acted on and decides this for itself, so this is only ever read on those two
   *  arms — and it is required rather than defaulted, because a default here would silently
   *  deselect whatever the caller forgot to pass. */
  readonly selection: Selection;
}

export function applyCommandResult(
  input: ApplyCommandResultInput,
): CommandApplication {
  const { result } = input;
  if (!result.ok) {
    return { applied: false, state: { lastRejection: result.reason } };
  }

  const reconciled = reconcileSuccessfulCommandResult({
    result,
    catalog: input.catalog,
    previousRecordedColumns: input.columns,
  });
  return {
    applied: true,
    state: {
      // Uncaught by design. `projectFrozenMap` throws `UnprojectableColumnError` only for a
      // frozen column the document cannot carry, and swallowing it here would save a design whose
      // empty space is silently missing — the defect ADR 0044 exists to fix, arriving by a new
      // route. A loud failure is the lesser harm, so this seam does not catch.
      // **Projected from the recorded face** (ADR 0090 Amendment B): the document keeps the width
      // the customer left, and a recorded extent the wall no longer covers is *marked* rather than
      // shortened — the same treatment ADR 0065 gives a placement the same slide pushes past the
      // same wall.
      design: reconciled.design,
      records: reconciled.records,
      columns: reconciled.columns,
      recordedColumns: reconciled.recordedColumns,
      voids: reconciled.voids,
      selection: resolveSelection(
        result.effect,
        reconciled.records,
        reconciled.voids,
        input.selection,
      ),
      lastRejection: null,
    },
  };
}

/** **The depth command's own map, and no arm of this module's own** — ADR 0090 decision 5.
 *
 *  ADR 0073's, ADR 0079's and ADR 0080's depth rules stood here until wave 6J-d and now live in
 *  `frozen-map-at-cabinet-depth.ts`. They moved for the reason ADR 0088 decision 2 requires a wave to
 *  state: once wave 6J-c made wall B's run slide, answering them needs the pre-command design, the
 *  catalogue at the depth being left and the shift itself, all three of which `setCabinetDepth` holds
 *  natively and none of which this module is given. Repairing that here would also have put a product
 *  rule in a file whose head comment says none lives here.
 *
 *  The domain-owned reconciliation now keeps that funnel and void recompute shared with generation;
 *  this adapter keeps the selection.
 */

/** §5.1's closing step and the milestone's "selection never dangles" criterion, as one function:
 *  decide what the command points at, then keep it only if it still exists. */
function resolveSelection(
  effect: CommandEffect,
  records: readonly PlacementRecord[],
  voids: readonly VoidRecord[],
  current: Selection,
): Selection {
  const intended = intendSelection(effect, voids, current);
  return isStillPresent(intended, records, voids) ? intended : null;
}

function intendSelection(
  effect: CommandEffect,
  voids: readonly VoidRecord[],
  current: Selection,
): Selection {
  if (effect.type === "placement_removed") {
    // Found by geometry, never by a remembered id: void ids are regenerated on every recompute and
    // a merge with a neighbouring opening changes them (§5.1).
    const vacated = findVacatedVoid(voids, effect.vacated);
    return vacated ? { kind: "void", id: vacated.id } : null;
  }
  // Wave 6E's two, wave 6J-b's third and ADR 0099's fourth: a whole-kitchen setting acts on no
  // cabinet, so it has no placement to point at and the selection the customer is holding is
  // carried through untouched. It is still put through `isStillPresent` below, which is what keeps
  // "the selection never dangles" one rule rather than one rule with an exception.
  //
  // A depth change rebuilds every body but keeps every placement **id**, so the held selection is
  // still the same cabinet afterwards — a deeper one. Carrying it through is what stops a customer
  // losing their place because the kitchen got deeper around them.
  //
  // A global colour change is the strongest case of the four: `setGlobalFinish` writes one settings
  // key and touches no placement at all (ADR 0099 decision 2), so there is nothing for a selection
  // to have lost.
  if (
    effect.type === "material_tier_set" ||
    effect.type === "hardware_tier_set" ||
    effect.type === "global_finish_set" ||
    effect.type === "cabinet_depth_set"
  ) {
    return current;
  }
  return { kind: "placement", id: effect.placementId };
}

function isStillPresent(
  selection: Selection,
  records: readonly PlacementRecord[],
  voids: readonly VoidRecord[],
): boolean {
  if (!selection) return false;
  return selection.kind === "placement"
    ? records.some((record) => record.id === selection.id)
    : voids.some((record) => record.id === selection.id);
}
