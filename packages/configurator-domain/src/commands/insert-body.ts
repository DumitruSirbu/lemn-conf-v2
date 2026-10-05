// `DEVELOPMENT-SPEC.md` §5.2 and §5.3: one code path. Filling an empty slot and swapping an occupied
// body differ only in where the target opening comes from; forking them once dropped the swap branch
// and made every "Înlocuiește" row do nothing.
//
// It also drives the dependent re-plan (ADR 0103 decision 2): every body standing in a column this
// insert touched is re-planned at the column as it stands afterwards (`replan-dependent-members.ts`).
// What lives here is the one call and the atomicity: the placed body and every re-planned body are
// written, or the design comes back unchanged with one refusal.
import { measurableSeatOf } from "../seat-rule.js";
import type { BodyProbe, BodyMeasurement } from "../body-probe.js";
import {
  kindLabel,
  toInsertableBody,
  type InsertableBody,
} from "../catalog.js";
import { cabinetDepthMmOf } from "../design.js";
import type { Design, DesignPlacement } from "../design.js";
import {
  MILLIMETRES_PER_METRE,
  toExactMillimetres,
  toMillimetres,
} from "../millimetres.js";
import {
  derivePlacementRecords,
  type BodyCatalog,
  type Column,
  type PlacementRecord,
  type VoidRecord,
} from "../void-engine.js";
import {
  isValidOccurredAt,
  refuse,
  succeedWith,
  withPlacements,
  type BodyInsertedEffect,
  type CommandResult,
  type CommandTarget,
} from "./command-result.js";
import {
  evaluateInsertFit,
  resolveInsertOpening,
  type InsertPlan,
  type ResolvedOpening,
} from "./insert-fit.js";
import {
  carriedAppearance,
  refuseBuiltSize,
  refuseUnusableMeasurement,
} from "./built-body.js";
import type { RejectionDetail } from "./rejection.js";
import { replanDependentMembers } from "./replan-dependent-members.js";
import { splitColumn, type ColumnSplit } from "./split-column.js";

export interface InsertBodyInput {
  readonly design: Design;
  readonly catalog: BodyCatalog;
  /** Frozen load-time columns in their **recorded** face (ADR 0090 Amendment B): the face
   *  `effect.columns` replaces, so no room-derived cap may have touched it. No command recomputes them;
   *  this one refuses rather than place a body outside the map. Not where openings come from: see
   *  `voids`. */
  readonly columns: ReadonlyMap<string, Column>;
  /**
   * The published openings (§9's list), bounded by the wall (ADR 0069). Required, neither optional nor
   * recomputed here: the offer list and this command are one evaluation (§11 row 6) only if handed the
   * same openings, and one built from the recorded `columns` is uncapped: a 600 mm body 100 mm past
   * wall B's end where the published opening is 500 mm. Nor re-derived from a capped copy of
   * `columns`: the wall-end clip runs before the merge, so `clip(recorded)` is not the published map.
   */
  readonly voids: readonly VoidRecord[];
  readonly target: CommandTarget;
  readonly buildId: string;
  readonly probe: BodyProbe;
  readonly occurredAt: string;
}

type InsertResult = CommandResult<BodyInsertedEffect>;

type Resolved<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly detail: RejectionDetail };

function unresolved<T>(detail: RejectionDetail): Resolved<T> {
  return { ok: false, detail };
}

export function insertBody(input: InsertBodyInput): InsertResult {
  const { design } = input;
  if (!isValidOccurredAt(input.occurredAt)) {
    return refuse(design, { code: "INVALID_OCCURRED_AT", params: {} });
  }
  const body = resolveInsertableBody(input);
  if (!body.ok) return refuse(design, body.detail);

  const records = derivePlacementRecords(design, input.catalog);
  // The opening is resolved out of the published list, which the wall bounds; its column comes from the
  // recorded map, which the split then rewrites. This is `OffersInput` field for field (§11 row 6).
  const target = resolveInsertOpening({
    records,
    voids: input.voids,
    columns: input.columns,
    target: input.target,
  });
  if (!target.ok) return refuse(design, target.detail);

  const fit = evaluateInsertFit({
    body: body.value,
    opening: target.value.opening,
    column: target.value.column,
    cabinetDepthMm: cabinetDepthMmOf(design),
  });
  if (!fit.ok) return refuse(design, fit.detail);

  return place(input, body.value, {
    target: target.value,
    plan: fit.plan,
    // Carried, not re-derived below: the dependent re-plan compares `hasFullHeightUnder` over these
    // records with the post-insert ones, and two derivations of "as it stood" are two authors.
    recordsBefore: records,
  });
}

/** ADR 0011 Gap A: only §7's parameterised entries are ever accepted. A seeded id describes one
 *  already-built body measured for one specific opening, so it is refused by name. */
function resolveInsertableBody(
  input: InsertBodyInput,
): Resolved<InsertableBody> {
  const definition = input.catalog.get(input.buildId);
  if (!definition) {
    return unresolved({
      code: "NOT_IN_LIBRARY",
      params: { buildId: input.buildId },
    });
  }
  const body = toInsertableBody(input.buildId, definition);
  if (!body) {
    return unresolved({
      code: "NOT_INSERTABLE",
      params: { label: kindLabel(definition.kind) },
    });
  }
  return { ok: true, value: body };
}

/** Builds the body through the probe, re-checks the built carcass, and writes the placement.
 *  Everything measured enters here; nothing before this point has touched geometry. */
function place(
  input: InsertBodyInput,
  body: InsertableBody,
  planned: PlannedInsert,
): InsertResult {
  const { target, plan } = planned;
  const measurement = input.probe.measure({
    buildId: body.buildId,
    // Read off the entry; a throw, not a default, if joint-seated: an insertable body always has its
    // own plane (ADR 0077 decision 3).
    seatedOn: measurableSeatOf({
      buildId: body.buildId,
      rule: input.catalog.get(body.buildId)?.seatRule,
    }),
    widthM: plan.widthM,
    heightM: plan.heightM,
    // §5.2's `b.mk(w, h, void.d)`: the **opening's** own depth, which on a swap is the outgoing body's.
    // Never `target.column.d` (§3.2's MAX over the vertical run): a wall cabinet would be built to the
    // base cabinet's depth. Read off the plan, not the opening, because §7's head-clearance cap sits
    // between the two and the offer list must see the same number.
    depthM: plan.depthM,
  });
  const mismatch = refuseBuiltSize(body, plan, measurement);
  if (mismatch) return refuse(input.design, mismatch);

  const unusable = refuseUnusableMeasurement(body, measurement);
  if (unusable) return refuse(input.design, unusable);

  const millimetres = resolvePlacementMillimetres(plan, target, measurement);
  if (!millimetres.ok) return refuse(input.design, millimetres.detail);

  const placement = buildPlacement(input, body, target, millimetres.value);
  return applyPlacement(input, body, planned, placement);
}

/** What `place` decided, carried to the write: the split needs both the column and the remainder. */
interface PlannedInsert {
  readonly target: ResolvedOpening;
  readonly plan: InsertPlan;
  /** The records before this insert, for the dependent re-plan: derived once by `insertBody`. */
  readonly recordsBefore: readonly PlacementRecord[];
}

interface PlacementMillimetres {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly y0Mm: number;
  readonly alongMm: number;
  readonly seatDepthMm: number;
}

/** Every *derived* coordinate must land on a whole millimetre. The measured seat is rounded instead,
 *  because ADR 0011 Gap B persists it as an integer; the built-carcass re-check guards that rounding. */
function resolvePlacementMillimetres(
  plan: InsertPlan,
  target: ResolvedOpening,
  measurement: BodyMeasurement,
): Resolved<PlacementMillimetres> {
  const widthMm = toExactMillimetres(plan.widthM);
  if (widthMm === undefined) return inexact("widthMm", plan.widthM);
  const heightMm = toExactMillimetres(plan.heightM);
  if (heightMm === undefined) return inexact("heightMm", plan.heightM);
  const y0Mm = toExactMillimetres(plan.y0M);
  if (y0Mm === undefined) return inexact("y0Mm", plan.y0M);
  // The **seated** centre, the opening's own only when the body fills its column; the occupied half of
  // a split falls between two millimetres when the column's width is odd. Refused here so an odd extent
  // never reaches `projectEmptyColumns`, which throws uncaught at the store seam. Never rounded:
  // rounding keys the body as its neighbour (ADR 0044).
  const alongMm = plan.alongMm;
  if (!Number.isInteger(alongMm)) return inexactMillimetres("alongMm", alongMm);

  return {
    ok: true,
    value: {
      widthMm,
      heightMm,
      y0Mm,
      alongMm,
      // The only persisted number that comes from a measurement; `refuseUnusableMeasurement` has already
      // proved `seatOffsetM` finite, so `toMillimetres`'s `UNMEASURABLE_MM` fallback cannot reach a document.
      seatDepthMm: toMillimetres(2 * measurement.seatOffsetM),
    },
  };
}

function inexact(
  field: string,
  valueM: number,
): Resolved<PlacementMillimetres> {
  return inexactMillimetres(field, valueM * MILLIMETRES_PER_METRE);
}

/** The same refusal for a value already in millimetres: a seated centre is planned there
 *  (`InsertPlan.alongMm`), so converting to metres to state it would invent a number the kitchen never held. */
function inexactMillimetres(
  field: string,
  valueMm: number,
): Resolved<PlacementMillimetres> {
  return unresolved({
    code: "NON_INTEGER_MILLIMETRES",
    params: { field, valueMm },
  });
}

function buildPlacement(
  input: InsertBodyInput,
  body: InsertableBody,
  target: ResolvedOpening,
  millimetres: PlacementMillimetres,
): DesignPlacement {
  return {
    id: nextPlacementId(input.design),
    wall: target.opening.wall,
    alongMm: millimetres.alongMm,
    y0Mm: millimetres.y0Mm,
    body: {
      buildId: body.buildId,
      widthMm: millimetres.widthMm,
      heightMm: millimetres.heightMm,
      seatDepthMm: millimetres.seatDepthMm,
      ...carriedAppearance(body, target.replaced),
    },
  };
}

/** §5.3: the new body takes the old one's place in the array, so a swap does not reorder the
 *  document and its canonical serialisation stays comparable. */
function applyPlacement(
  input: InsertBodyInput,
  body: InsertableBody,
  planned: PlannedInsert,
  placement: DesignPlacement,
): InsertResult {
  const replacedId = planned.target.replaced?.id;
  const placements =
    replacedId === undefined
      ? [...input.design.placements, placement]
      : input.design.placements.map((existing) =>
          existing.id === replacedId ? placement : existing,
        );
  const design = withPlacements(input.design, placements, input.occurredAt);

  const records = derivePlacementRecords(design, input.catalog);
  // ADR 0046: the column the body did not fill becomes two, and the command owns that write.
  const split = splitColumn({
    columns: input.columns,
    column: planned.target.column,
    records,
    centreMm: placement.alongMm,
    widthMm: placement.body.widthMm,
    remainderMm: planned.plan.remainderMm,
  });
  if (!split.ok) return refuse(input.design, split.detail);

  const drift = refuseColumnDrift(records, split.value, body, placement.id);
  if (drift) return refuse(input.design, drift);

  // After the split and the drift guard (ADR 0103 decision 3): dependents are re-planned against the map
  // the split just wrote, with `hasFullHeightUnder` re-answered over this insert's records.
  const replanned = replanDependentMembers({
    design,
    catalog: input.catalog,
    columns: split.value.columns,
    probe: input.probe,
    occurredAt: input.occurredAt,
    recordsBefore: planned.recordsBefore,
    recordsAfter: records,
    columnsBeforeSplit: input.columns,
    occupiedKey: split.value.occupiedKey,
    placedId: placement.id,
    placedLabel: body.label,
  });
  // Atomic: the insert refuses whole and the caller gets back the design it handed in; a column with the
  // new body and a standing one left at the old depth is a silent mixture (ADR 0103 decision 7).
  if (!replanned.ok) return refuse(input.design, replanned.detail);

  return succeedWith(
    withPlacements(design, replanned.value, input.occurredAt),
    {
      type: "body_inserted",
      placementId: placement.id,
      buildId: placement.body.buildId,
      ...(replacedId === undefined ? {} : { replacedPlacementId: replacedId }),
      // The split's map, unchanged (ADR 0103 decision 9): the re-plan moves member seats, not any
      // published extent.
      columns: split.value.columns,
    },
  );
}

/** ADR 0011 Gap D: an inserted placement's derived column must be the one the map holds for it, the
 *  key the split planned (the opening's own only when nothing was divided); otherwise it is a phantom
 *  column, refused and never placed. Both sides come from one millimetre value, the placement's
 *  `alongMm`, so they cannot disagree at a `toFixed(2)` boundary (`frozenColumnKey`). */
function refuseColumnDrift(
  records: readonly PlacementRecord[],
  split: ColumnSplit,
  body: InsertableBody,
  placementId: string,
): RejectionDetail | undefined {
  const placed = records.find((record) => record.id === placementId);
  if (placed?.col === split.occupiedKey) return undefined;
  return { code: "COLUMN_MISMATCH", params: { label: body.label } };
}

/** §5.2: ids come from the design — the next free `n<index>` — never from a clock or a random
 *  source, so the same command on the same design yields the same document. */
function nextPlacementId(design: Design): string {
  const used = new Set(design.placements.map((placement) => placement.id));
  let index = 0;
  while (used.has(`n${String(index)}`)) index += 1;
  return `n${String(index)}`;
}
