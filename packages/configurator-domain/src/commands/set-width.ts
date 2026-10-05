// ADR 0031: a resize moves a whole column, and an adjacent empty column funds it (superseding
// DEVELOPMENT-SPEC §5.4's donor rule). Selecting any body resizes every member of its column at every
// level; growing narrows the empty column beside it, shrinking widens it, and the run total is
// conserved. Every member's centre moves by the same amount, so no body leaves its column (see
// `rederiveTouchedColumns` in `void-engine.ts`).
//
// ADR 0035 decision 6: a column is one width at every level, except the hood. The hood is sized to
// its cooktop, so it keeps its own width and re-centres over the run beneath it (ADR 0039 decision 4);
// it is exempt from the width rule, not from the model, and is keyed off `EXTRACTOR_HOOD_KIND`.
// ADR 0035 decision 7: a shrink enters a new empty column at the extent it vacates.
import { resolveBuildableSizes, resolveWidthRangesMm } from "../catalog.js";
import type { Design, DesignPlacement } from "../design.js";
import {
  derivePlacementRecords,
  rederiveTouchedColumns,
  type BodyCatalog,
  type Column,
  type PlacementRecord,
  type WidthRangeMm,
} from "../void-engine.js";
import {
  frozenColumnKey,
  moveFrozenColumns,
  planMoves,
} from "./apply-column-moves.js";
import {
  isValidOccurredAt,
  refuse,
  succeedWith,
  withPlacements,
  type BodyResizedEffect,
  type CommandTarget,
} from "./command-result.js";
import { fundingScan, refuseNoSideFunds } from "./plan-width-funding.js";
import { moveHood, rebuild } from "./rebuild-resized-bodies.js";
import type { EmptySpaceSide, RejectionDetail } from "./rejection.js";
import {
  describeRecordLabel,
  isHood,
  resolveResizableBody,
  splitColumnMembers,
  toColumnMember,
} from "./resolve-column-members.js";
import {
  intersectColumnRanges,
  intersectColumnWidths,
  refuseIllegalWidth,
  resolveColumnExtent,
} from "./resolve-column-width.js";
import {
  bodiesUnderOpenings,
  opensAnOpeningOverABody,
  refuseColumnDrift,
  type OverlapSet,
} from "./validate-width-result.js";
import type {
  ColumnPlan,
  ColumnResize,
  Resolved,
  SetWidthInput,
  SetWidthResult,
} from "./width-resize-model.js";

export type { SetWidthInput } from "./width-resize-model.js";

/** What `columnWidthChoices` needs, less than `setWidth`: asking which widths exist builds nothing, so
 *  it needs no width, probe or timestamp, and never reads the frozen column map (a column's legal
 *  widths come from its members' catalogue rows, not its extent). */
export interface ColumnWidthChoicesInput {
  readonly design: Design;
  readonly catalog: BodyCatalog;
  readonly target: CommandTarget;
}

export interface ColumnWidthChoices {
  /** The width §9's `active` chip sits on, and the number its value label reads. */
  readonly currentWidthMm: number;
  /** Ascending, duplicate-free, and never empty — see `columnWidthChoices`. */
  readonly sizesMm: readonly number[];
  /** What the column may be built within, as ADR 0035 decision 3's discriminator: a range with
   *  `minMm < maxMm` means a stepper, every range a single width means a discrete choice. Published so
   *  §9 does not infer it from the spacing of `sizesMm`. */
  readonly widthRangesMm: readonly WidthRangeMm[];
  /** The engine's own reason this body may not be resized, present exactly when there is one. §9 still
   *  renders the section, with one `active` chip at the width the cabinet is made at. see ADR 0049 */
  readonly notResizable?: RejectionDetail;
}

export function setWidth(input: SetWidthInput): SetWidthResult {
  const { design } = input;
  if (input.target.kind === "void") {
    return refuse(design, { code: "VOID_SELECTED", params: {} });
  }
  if (!isValidOccurredAt(input.occurredAt)) {
    return refuse(design, { code: "INVALID_OCCURRED_AT", params: {} });
  }

  const records = derivePlacementRecords(design, input.catalog);
  const record = records.find((candidate) => candidate.id === input.target.id);
  if (!record) {
    return refuse(design, { code: "TARGET_NOT_FOUND", params: {} });
  }

  const plan = planColumnResize(input, records, record);
  if (!plan.ok) return refuse(design, plan.detail);
  return fundColumnResize(input, records, record, plan.value);
}

/** What §9's width section may render for this selection: the widths to offer a chip for, and the one
 *  the `active` chip sits on.
 *
 *  Per column, not per selected body (ADR 0031 rule 1): the list comes from `intersectColumnWidths`, the
 *  function `setWidth` narrows against, so the panel never offers a width the column refuses. Candidates
 *  only: whether one is a legal move is `setWidth`'s answer (`queries/width-options.ts` asks it by
 *  running the command).
 *
 *  A column that cannot agree on a width (an unrebuildable member, or disjoint sets) falls back to the
 *  selected body's own set. `undefined` (no section) only where that set is empty: missing catalogue data
 *  must fail loudly, so the current width is folded into a set that exists and never conjures one
 *  (FINDING R2.7, see ADR 0049).
 *
 *  `currentWidthMm` is the selected body's width, read here and not inferred from a refusal code: §9
 *  needs exactly one `active` chip even when `setWidth` refuses every width. A `widthFlex: 'fit'` body
 *  can sit at a width no set contains (a `wall-2door` in a 700 mm opening), so it joins the list. */
export function columnWidthChoices(
  input: ColumnWidthChoicesInput,
): ColumnWidthChoices | undefined {
  if (input.target.kind === "void") return undefined;
  const records = derivePlacementRecords(input.design, input.catalog);
  const record = records.find((candidate) => candidate.id === input.target.id);
  if (!record) return undefined;

  // The selected body's own set is the floor of what may be rendered and the only thing whose absence
  // suppresses the section; resolved first because everything below narrows it.
  const declared = resolveBuildableSizes(input.catalog, record.buildId);
  if (declared.length === 0) return undefined;

  // §9's `canWidth` from the engine's end, the same call `setWidth` opens with, so the refusal and its
  // cause have one author. The cause must be read off the refusal: `resolveBuildableSizes` reads
  // `sizesMm` alone while `toInsertableBody` also needs `label`, `widthFlex` and `nominalHeightMm`, so an
  // unfinished row resolves a set and no body, and `record.fixedWidth` cannot separate the two causes
  // (they are not exclusive). Mistaking missing catalogue data for a fixed-width claim names a `kind`
  // string at the customer. The refusal is published, not swallowed (ADR 0049).
  const selectedBody = resolveResizableBody(input.catalog, record);
  if (!selectedBody.ok) return describeFixedWidth(record, selectedBody.detail);
  const selected = toColumnMember(input.design, record, selectedBody.value);
  if (!selected) return undefined;

  // The hood-exempt membership, as `setWidth` computes it (ADR 0035 decision 6): a hood narrows nothing.
  const split = splitColumnMembers(
    {
      design: input.design,
      catalog: input.catalog,
      records,
      label: describeRecordLabel(input.catalog, record),
    },
    selected,
  );
  const intersected = split.ok
    ? intersectColumnWidths(input.catalog, split.value)
    : [];
  const intersectedRanges = split.ok ? intersectColumnRanges(split.value) : [];
  // An empty intersection is a fact about the column, not "no set": both ways a column can fail to agree
  // (an unresizable member, or disjoint sets such as a 600 mm hood over a 200/300 cargo) fall back to the
  // body's own widths, so the engine's refusal is still rendered. Only missing catalogue data about the
  // body itself suppresses the section.
  const candidates = intersected.length > 0 ? intersected : declared;

  return {
    currentWidthMm: record.widthMm,
    sizesMm: [...new Set([...candidates, record.widthMm])].sort(
      (left, right) => left - right,
    ),
    // The same fallback as the widths, on the same condition: ranges conditioned on `!split.ok` instead
    // would leave a column with many widths and no ranges, rendering a row of identical chips instead
    // of the stepper.
    widthRangesMm:
      intersectedRanges.length > 0
        ? intersectedRanges
        : resolveWidthRangesMm(selectedBody.value),
  };
}

/** ADR 0049's fixed-width answer: the one width this cabinet is made at. `undefined` for every other
 *  refusal, tested on the refusal's own `cause` and not the record's flag: a row that is `fixedWidth`
 *  and unfinished is missing catalogue data.
 *
 *  Must run after `columnWidthChoices`'s empty-set guard: a row with no buildable width must never
 *  reach here, or a chip would be published at a width the catalogue cannot build. The column is not
 *  consulted: a body that cannot be resized takes and gives no width.
 *
 *  One degenerate range puts it on the discrete control (ADR 0035 decision 3's discriminator). Built
 *  from the width, not the row's bound: `hood-600` is `fixedWidth` while its `hood` entry is bounded
 *  600–800, which would give an unresizable cabinet a stepper that can never move. */
function describeFixedWidth(
  record: PlacementRecord,
  notResizable: RejectionDetail,
): ColumnWidthChoices | undefined {
  if (notResizable.code !== "NOT_RESIZABLE") return undefined;
  if (notResizable.params.cause !== "fixed") return undefined;
  return {
    currentWidthMm: record.widthMm,
    sizesMm: [record.widthMm],
    widthRangesMm: [{ minMm: record.widthMm, maxMm: record.widthMm }],
    notResizable,
  };
}

/** ADR 0031's column checks, before anything is built and before a side is chosen: the selected body
 *  has a width to change, every member can be rebuilt, and the width is in the intersection of their
 *  sets. A mixed column is squared up, not refused (ADR 0035 decision 6). Which side funds the move is
 *  `fundColumnResize`'s separate question. */
function planColumnResize(
  input: SetWidthInput,
  records: readonly PlacementRecord[],
  record: PlacementRecord,
): Resolved<ColumnPlan> {
  const selected = resolveResizableBody(input.catalog, record);
  if (!selected.ok) return selected;
  const label = selected.value.label;

  const column = input.columns.get(record.col);
  if (!column) {
    return {
      ok: false,
      detail: { code: "COLUMN_MISMATCH", params: { label } },
    };
  }

  const member = toColumnMember(input.design, record, selected.value);
  if (!member) {
    return {
      ok: false,
      detail: { code: "COLUMN_MISMATCH", params: { label } },
    };
  }

  const split = splitColumnMembers(
    { design: input.design, catalog: input.catalog, records, label },
    member,
  );
  if (!split.ok) return split;
  const { members, hoods } = split.value;

  const extent = resolveColumnExtent(members);
  const illegal = refuseIllegalWidth(input, label, split.value, extent);
  if (illegal) return { ok: false, detail: illegal };

  return { ok: true, value: { label, column, members, hoods, extent } };
}

/** ADR 0031 rule 2, including the phantom test: each side is carried all the way through the rebuild,
 *  and a phantom opening sends the scan to the other side. Choosing a side before the phantom check
 *  would let extra free space turn a legal move illegal (a right column widened to 900 mm over the
 *  corner leg `p25`). At most two attempts, so the probe runs up to twice. Any other rebuild refusal
 *  (a built-size mismatch, an unmeasurable body, a drifted column) is a fact about the bodies and the
 *  width, identical on both sides, and returns immediately. see FINDING Q1.2 in ADR 0031 */
function fundColumnResize(
  input: SetWidthInput,
  records: readonly PlacementRecord[],
  record: PlacementRecord,
  plan: ColumnPlan,
): SetWidthResult {
  // Measured once, before anything moves: a resize answers for the overlaps it creates and no others.
  // This column's own hoods overhang by design and only they are exempt (ADR 0035 decision 6).
  const exemptHoodIds = new Set(plan.hoods.map((hood) => hood.record.id));
  const covered = bodiesUnderOpenings(records, input.columns, exemptHoodIds);
  const refusedSides: EmptySpaceSide[] = [];
  for (const { side, space } of fundingScan(input, records, plan)) {
    if (!space.ok) {
      refusedSides.push({ side, reason: space.reason });
      continue;
    }
    const move = planMoves(input, plan, space.value);
    if (!move.ok) {
      // A key collision is a fact about this side: the new centre depends on which edge is held, so the
      // other side may be free. It falls through like `opens_a_gap`; every other planning failure is a
      // fact about the arithmetic and ends the scan.
      if (move.detail.code !== "COLUMN_KEY_COLLISION") {
        return refuse(input.design, move.detail);
      }
      refusedSides.push({ side, reason: "key_taken" });
      continue;
    }

    const attempt = applyColumnResize(
      { input, records, record, covered, exemptHoodIds },
      move.value,
    );
    if (attempt.outcome === "ok") return attempt.result;
    if (attempt.outcome === "refused") {
      return refuse(input.design, attempt.detail);
    }
    refusedSides.push({ side, reason: "opens_a_gap" });
  }
  return refuse(input.design, refuseNoSideFunds(input, plan, refusedSides));
}

/** What one attempt needs that is the same for both sides. */
interface AttemptContext {
  readonly input: SetWidthInput;
  readonly records: readonly PlacementRecord[];
  readonly record: PlacementRecord;
  readonly covered: OverlapSet;
  /** This column's own hoods, exempt from the phantom-opening comparison (ADR 0035 decision 6); carried
   *  so the before and after sets exempt the same bodies. */
  readonly exemptHoodIds: ReadonlySet<string>;
}

/** One side's move carried through the rebuild. `opens_a_gap` sends the scan to the other side;
 *  `refused` is a fact the other side would answer identically. */
type ColumnResizeAttempt =
  | { readonly outcome: "ok"; readonly result: SetWidthResult }
  | { readonly outcome: "opens_a_gap" }
  | { readonly outcome: "refused"; readonly detail: RejectionDetail };

/** Rebuild every member of the column, write them into the design, then update the two column keys the
 *  move touched. Atomic: nothing is written unless every rebuild passes every guard `insertBody` applies. */
function applyColumnResize(
  attempt: AttemptContext,
  move: ColumnResize,
): ColumnResizeAttempt {
  const { input, records, record } = attempt;
  const rebuilt = new Map<string, DesignPlacement>();
  for (const plan of move.members) {
    // The selected hood gets a full column resize; only a hood carried along by its neighbours' move is
    // moved rather than rebuilt.
    const built =
      isHood(plan.record) && plan.record.id !== record.id
        ? moveHood(input, plan)
        : rebuild(input, records, plan);
    if (!built.ok) return { outcome: "refused", detail: built.detail };
    rebuilt.set(built.value.id, built.value);
  }

  const design = withPlacements(
    input.design,
    input.design.placements.map(
      (placement) => rebuilt.get(placement.id) ?? placement,
    ),
    input.occurredAt,
  );

  const moved = derivePlacementRecords(design, input.catalog);
  const columns = moveFrozenColumns(
    rederiveTouchedColumns(input.columns, records, moved, input.design.room),
    move,
    moved,
  );
  const drift = refuseColumnDrift(columns, moved, rebuilt, move.label);
  if (drift) return { outcome: "refused", detail: drift };
  if (
    opensAnOpeningOverABody(
      attempt.covered,
      moved,
      columns,
      attempt.exemptHoodIds,
    )
  ) {
    return { outcome: "opens_a_gap" };
  }

  return {
    outcome: "ok",
    result: succeedWith(design, resizedEffect(record, move, rebuilt, columns)),
  };
}

function resizedEffect(
  record: PlacementRecord,
  move: ColumnResize,
  rebuilt: ReadonlyMap<string, DesignPlacement>,
  columns: ReadonlyMap<string, Column>,
): BodyResizedEffect {
  const selected = rebuilt.get(record.id);
  return {
    type: "body_resized",
    placementId: record.id,
    buildId: selected?.body.buildId ?? record.buildId,
    widthMm: move.widthMm,
    columnPlacementIds: move.members.map((member) => member.record.id),
    emptyColumnKey: move.empty.column.key,
    ...(move.empty.widthMm > 0
      ? { emptyColumnNewKey: frozenColumnKey(move.empty) }
      : {}),
    emptyColumnWidthMm: move.empty.widthMm,
    columns,
  };
}
