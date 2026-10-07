// The store's half of `docs/milestones/M3-mutations.md` work item 9: turn a domain `CommandResult` into the exact
// state the store holds next. It lives beside the store so the store's actions stay the call/apply/schedule
// adapter and the two easiest invariants to break (frozen columns, a selection that never dangles) are testable
// without zustand. No product rule lives here: guards and the ADR-sensitive reconciliation live in the domain;
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
  /** The published face: frozen extents with `hasFullHeightUnder` re-answered from the new records and every
   *  member-less column bounded by its wall's length. Openings, the scene and inserts derive from it (ADR 0069:
   *  nothing past a wall's end is ever offered). */
  readonly columns: ReadonlyMap<string, Column>;
  /** The recorded face: the same map without ADR 0069's wall-end cap, which the document is projected from
   *  (ADR 0090 Amendment B). A pass that derives its answer from the room may bound what the map publishes and
   *  may not rewrite what the document records. The cap is the only such stage: the free-ground clip, ADR 0052's
   *  split and ADR 0046's merge derive from placements or a declared ceiling and are in both faces. The wall's
   *  own length is reversible, so a cap written into the document would not undo itself (a space flush to
   *  wall B's end lost 100 mm at 700 and kept the loss back at 600). */
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
  /** A column's extent is frozen at load time (ADR 0011 Gap D): an input to the recompute, never an output,
   *  since recomputing it from the mutated records would shrink a column to fit what is left and a delete would
   *  free space that produces no void. `hasFullHeightUnder` is the one field outside that extent and is
   *  re-answered. This is the store's recorded face, not its published one (ADR 0090 Amendment B): the
   *  wall-bounded map would carry ADR 0069's cap into the next command's record and out through
   *  `projectFrozenMap`. */
  readonly columns: ReadonlyMap<string, Column>;
  /** What is selected now, which a whole-kitchen command leaves where it was: it points at no cabinet. Every
   *  other effect names the placement it acted on, so this is read only on those arms. Required rather than
   *  defaulted: a default would silently deselect whatever the caller forgot to pass. */
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
      // Uncaught by design: `projectFrozenMap` throws `UnprojectableColumnError` only for a frozen column the
      // document cannot carry, and swallowing it would save a design whose empty space is silently missing
      // (ADR 0044). Projected from the recorded face (ADR 0090 Amendment B): the document keeps the width the
      // customer left, and an extent the wall no longer covers is marked rather than shortened (ADR 0065).
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

// The depth command's frozen map is its own (`frozen-map-at-cabinet-depth.ts`, ADR 0090 decision 5): answering
// the depth rules needs the pre-command design, the catalogue at the depth being left and the shift, which
// `setCabinetDepth` holds and this module is not given. No arm of this module repairs them.

/** §5.1's closing step and "the selection never dangles", as one function:
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
  // A whole-kitchen setting (material tier, hardware tier, global colour, cabinet depth) acts on no cabinet, so
  // the held selection is carried through, still put through `isStillPresent` so "the selection never dangles"
  // has no exception. A depth change keeps every placement id, so the same cabinet stays selected, now deeper;
  // `setGlobalFinish` touches no placement at all (ADR 0099 decision 2).
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
