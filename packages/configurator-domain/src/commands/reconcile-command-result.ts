// The shared post-command seam for every in-memory consumer of a successful domain command.
//
// A command decides which frozen extents moved; this function performs the ADR 0090 Amendment B
// reconciliation that every holder of the resulting design owes. It deliberately has no selection
// concept: selection belongs to the web adapter, while generation and replay need the same recorded
// and published faces without depending on that adapter.
import type { Design } from "../design.js";
import {
  clipEmptyColumnsAtWallEnd,
  clipEmptyColumnsToFreeGround,
  derivePlacementRecords,
  mergeAdjacentEmptyColumns,
  projectFrozenMap,
  recomputeVoids,
  splitOversizedEmptyColumns,
  withCurrentFullHeightMembers,
  withFrozenMap,
  type BodyCatalog,
  type Column,
  type ColumnExtent,
  type PlacementRecord,
  type PlannedBoundariesMm,
  type VoidRecord,
} from "../void-engine.js";
import type { CommandSuccess } from "./command-result.js";

export interface ReconciledCommandResult {
  readonly design: Design;
  readonly records: readonly PlacementRecord[];
  /** ADR 0090's room-independent face, projected into `design`. */
  readonly recordedColumns: ReadonlyMap<string, Column>;
  /** The wall-bounded face used for offers and rendering. */
  readonly columns: ReadonlyMap<string, Column>;
  readonly voids: readonly VoidRecord[];
}

/** Applies the ADR-sensitive frozen-map pipeline to one successful command result. */
export function reconcileSuccessfulCommandResult(input: {
  readonly result: CommandSuccess;
  readonly catalog: BodyCatalog;
  readonly previousRecordedColumns: ReadonlyMap<string, Column>;
  /** The split's and the merge's limit. Omitted, each keeps the editor's own, which differ: the split cuts at
   *  `MAX_EMPTY_COLUMN_WIDTH_MM` and the merge is uncapped. Composition passes one for both (ADR 0110 decision 2). */
  readonly emptyColumnWidthLimitMm?: number;
  /** The edges composition's planned tiles share, which the merge never joins across (ADR 0167 D6). Omitted, as
   *  the editor does, none. The split does not read it. */
  readonly plannedBoundaries?: PlannedBoundariesMm;
}): ReconciledCommandResult {
  const records = derivePlacementRecords(input.result.design, input.catalog);
  const moved = movedColumns(input.result, input.previousRecordedColumns);
  const funnel = {
    records,
    widthLimitMm: input.emptyColumnWidthLimitMm,
    plannedBoundaries: input.plannedBoundaries,
  };
  const recordedColumns = reconcileColumns(moved, funnel);
  const columns = reconcileColumns(
    clipEmptyColumnsAtWallEnd(moved, records, input.result.design.room),
    funnel,
  );
  const design = withFrozenMap(
    input.result.design,
    projectFrozenMap(recordedColumns, records),
  );
  return {
    design,
    records,
    recordedColumns,
    columns,
    voids: recomputeVoids(records, columns),
  };
}

function movedColumns(
  result: CommandSuccess,
  previousRecordedColumns: ReadonlyMap<string, Column>,
): ReadonlyMap<string, Column> {
  return result.effect.type === "body_inserted" ||
    result.effect.type === "body_resized" ||
    result.effect.type === "cabinet_depth_set"
    ? result.effect.columns
    : previousRecordedColumns;
}

/** The records a reconcile reads and the width its split and merge hold member-less columns to; `undefined` leaves
 *  each at its own default (the split at 800 mm, the merge uncapped). `plannedBoundaries` is the merge's alone,
 *  and `undefined` leaves it with none. */
interface ReconcileFunnel {
  readonly records: readonly PlacementRecord[];
  readonly widthLimitMm: number | undefined;
  readonly plannedBoundaries: PlannedBoundariesMm | undefined;
}

/** Clip free ground, split, merge, then re-answer full-height membership—in that exact order. */
function reconcileColumns(
  columns: ReadonlyMap<string, ColumnExtent>,
  { records, widthLimitMm, plannedBoundaries }: ReconcileFunnel,
): ReadonlyMap<string, Column> {
  return withCurrentFullHeightMembers(
    mergeAdjacentEmptyColumns(
      splitOversizedEmptyColumns(
        clipEmptyColumnsToFreeGround(columns, records),
        records,
        widthLimitMm,
      ),
      records,
      widthLimitMm,
      plannedBoundaries,
    ),
    records,
  );
}
