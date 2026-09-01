// The store's half of `docs/milestones/M3-mutations.md` work item 9: turn a domain `CommandResult`
// into the exact state the store should hold next.
//
// It lives beside the store rather than inside it for two reasons. The store's four actions stay
// the "call, apply, schedule" adapter the milestone's Boundaries section requires, and the two
// invariants that are easiest to break here — frozen columns and a selection that never dangles —
// become testable without zustand.
//
// No product rule lives here. Every guard is in the domain command that produced the result; this
// module only re-derives what the design implies and decides which existing thing is selected.
import {
  withCurrentFullHeightMembers,
  derivePlacementRecords,
  findVacatedVoid,
  projectEmptyColumns,
  recomputeVoids,
  type BodyCatalog,
  type Column,
  type CommandEffect,
  type CommandResult,
  type Design,
  type EmptyColumn,
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
  /** The frozen extents, with `hasFullHeightUnder` re-answered from the new records — the one
   *  column field that describes what stands under an opening now rather than how far the run
   *  reaches. */
  readonly columns: ReadonlyMap<string, Column>;
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
   *  standing there while the same design reloaded reported none. */
  readonly columns: ReadonlyMap<string, Column>;
}

export function applyCommandResult(
  input: ApplyCommandResultInput,
): CommandApplication {
  const { result } = input;
  if (!result.ok) {
    return { applied: false, state: { lastRejection: result.reason } };
  }

  const records = derivePlacementRecords(result.design, input.catalog);
  const columns = resolveColumns(result.effect, input.columns, records);
  const voids = recomputeVoids(records, columns);
  return {
    applied: true,
    state: {
      // Uncaught by design. `projectEmptyColumns` throws `UnprojectableColumnError` only for a
      // frozen column the document cannot carry, and swallowing it here would save a design whose
      // empty space is silently missing — the defect ADR 0044 exists to fix, arriving by a new
      // route. A loud failure is the lesser harm, so this seam does not catch.
      design: withEmptyColumns(
        result.design,
        projectEmptyColumns(columns, records),
      ),
      records,
      columns,
      voids,
      selection: resolveSelection(result.effect, records, voids),
      lastRejection: null,
    },
  };
}

/** ADR 0044: the map's member-less columns, recorded on the design that is about to be held and
 *  saved. This is the **one** place it happens, and it is here rather than in a command because
 *  the frozen map is here: `removePlacement` never receives it, and a resize publishes its own
 *  answer into it through `effect.columns`, so projecting from the resolved map covers delete,
 *  resize, insert and every future effect with no per-command bookkeeping.
 *
 *  Written from `columns`, never re-derived from `result.design` — the design a command returns
 *  still carries the previous state's array, and the whole reason this runs is that the map, not
 *  the document, is what the command just moved.
 *
 *  The key is **removed** rather than set to `[]` when nothing is empty, so a kitchen with no free
 *  space serialises exactly as it did before ADR 0044: the field is optional precisely so an
 *  untouched document is not rewritten (ADR 0038), and an empty array would make every command
 *  produce a document that differs from the one it was given by a key with nothing in it. */
function withEmptyColumns(
  design: Design,
  emptyColumns: readonly EmptyColumn[],
): Design {
  if (emptyColumns.length > 0) {
    return { ...design, emptyColumns: [...emptyColumns] };
  }
  const withoutTheKey = { ...design };
  delete withoutTheKey.emptyColumns;
  return withoutTheKey;
}

/** ADR 0031 and ADR 0046: a resize and an **insert** are the two commands that move a frozen
 *  extent, so they are the two whose own answer replaces the map passed in. Every other command
 *  leaves the extents alone and gets `hasFullHeightUnder` re-answered over them (ADR 0011 Gap D).
 *
 *  The insert joined them on 2026-09-01: a body narrower than its column splits that column into an
 *  occupied half and an empty remainder, under two keys the one it replaced did not hold. Without
 *  this arm the effect's map is discarded, the map still carries the original wide column, and the
 *  level closes exactly as it did before the split existed — with every domain test still green,
 *  which is why this seam is asserted at the store.
 *
 *  The resized map arrives already current — `moveFrozenColumns` ends in the same
 *  `withCurrentFullHeightMembers` — so re-applying it here would be a second author for two fields.
 *  The reason the command owns this and the store does not is in `BodyResizedEffect`: *which* keys
 *  may change is a rule about the move, and a store that re-derived globally would make §10's delete
 *  produce no openings at all.
 *
 *  `voids` are recomputed against **this** map, not the one passed in. A resize moves the boundary
 *  between two columns, and an opening derived from the pre-move extents would be drawn where
 *  nothing is free any more. */
function resolveColumns(
  effect: CommandEffect,
  frozen: ReadonlyMap<string, Column>,
  records: readonly PlacementRecord[],
): ReadonlyMap<string, Column> {
  if (effect.type === "body_resized" || effect.type === "body_inserted") {
    return effect.columns;
  }
  // Re-answers `hasFullHeightUnder` over the frozen extents, and nothing else. ADR 0037's merge ran
  // here too until 2026-08-30, so the delete path backlog 2 was reported from still gives two
  // openings rather than one — see `void-engine.ts` for why the merge was withdrawn.
  return withCurrentFullHeightMembers(frozen, records);
}

/** §5.1's closing step and the milestone's "selection never dangles" criterion, as one function:
 *  decide what the command points at, then keep it only if it still exists. */
function resolveSelection(
  effect: CommandEffect,
  records: readonly PlacementRecord[],
  voids: readonly VoidRecord[],
): Selection {
  const intended = intendSelection(effect, voids);
  return isStillPresent(intended, records, voids) ? intended : null;
}

function intendSelection(
  effect: CommandEffect,
  voids: readonly VoidRecord[],
): Selection {
  if (effect.type === "placement_removed") {
    // Found by geometry, never by a remembered id: void ids are regenerated on every recompute and
    // a merge with a neighbouring opening changes them (§5.1).
    const vacated = findVacatedVoid(voids, effect.vacated);
    return vacated ? { kind: "void", id: vacated.id } : null;
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
