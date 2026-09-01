// `DEVELOPMENT-SPEC.md` §5.2 and §5.3 — **one** code path. Filling an empty slot and swapping an
// occupied body differ only in where the target opening comes from.
//
// Forking them is on record as the cause of a silent, total failure of the replace feature: a void
// rewrite dropped the swap branch and every "Înlocuiește" row did nothing at all. One path also
// keeps the fit guards from drifting apart.
import type { BodyProbe, BodyMeasurement } from "../body-probe.js";
import {
  describeKindLabel,
  toInsertableBody,
  type InsertableBody,
} from "../catalog.js";
import type { CabinetBody, Design, DesignPlacement } from "../design.js";
import {
  MILLIMETRES_PER_METRE,
  toExactMillimetres,
  toMillimetres,
} from "../millimetres.js";
import {
  derivePlacementRecords,
  recomputeVoids,
  FIT_TOLERANCE_M,
  type BodyCatalog,
  type Column,
  type PlacementRecord,
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
import type { RejectionDetail } from "./rejection.js";
import { splitColumn, type ColumnSplit } from "./split-column.js";

export interface InsertBodyInput {
  readonly design: Design;
  readonly catalog: BodyCatalog;
  /** ADR 0011 Gap D: frozen load-time columns. No command recomputes them, and this one refuses
   *  rather than place a body that would fall outside the map. */
  readonly columns: ReadonlyMap<string, Column>;
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
  const target = resolveInsertOpening({
    records,
    voids: recomputeVoids(records, input.columns),
    columns: input.columns,
    target: input.target,
  });
  if (!target.ok) return refuse(design, target.detail);

  const fit = evaluateInsertFit({
    body: body.value,
    opening: target.value.opening,
    column: target.value.column,
  });
  if (!fit.ok) return refuse(design, fit.detail);

  return place(input, body.value, target.value, fit.plan);
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
      params: { label: describeKindLabel(definition.kind) },
    });
  }
  return { ok: true, value: body };
}

/** Builds the body through the probe, re-checks the built carcass, and writes the placement.
 *  Everything measured enters here; nothing before this point has touched geometry. */
function place(
  input: InsertBodyInput,
  body: InsertableBody,
  target: ResolvedOpening,
  plan: InsertPlan,
): InsertResult {
  const measurement = input.probe.measure({
    buildId: body.buildId,
    widthM: plan.widthM,
    heightM: plan.heightM,
    // §5.2's `b.mk(w, h, void.d)`: the **opening's** own depth, which on a §5.3 swap in place is
    // the outgoing body's. Never `target.column.d` — that is §3.2's MAX over the whole vertical
    // run, so a wall cabinet was built to the depth of the base cabinet below it and a swap
    // changed the body's depth. See `InsertOpening.d`.
    //
    // Read off the plan rather than off the opening, because §7's head-clearance cap
    // (`WALL_CARCASS_MAX_DEPTH_OVER_WORKTOP_M`) sits between the two and the offer list has to see
    // the same number this does.
    depthM: plan.depthM,
  });
  const mismatch = refuseBuiltSize(body, plan, measurement);
  if (mismatch) return refuse(input.design, mismatch);

  const unusable = refuseUnusableMeasurement(body, measurement);
  if (unusable) return refuse(input.design, unusable);

  const millimetres = resolvePlacementMillimetres(plan, target, measurement);
  if (!millimetres.ok) return refuse(input.design, millimetres.detail);

  const placement = buildPlacement(input, body, target, millimetres.value);
  return applyPlacement(input, body, { target, plan }, placement);
}

/** §5.2: "gs = CARCASS box of g → re-check width & height, reject on mismatch". Fit is judged on
 *  the carcass, so the sink's faucet and the hood's chimney — which rise into free air — cannot
 *  refuse a body from an opening it fits perfectly (§11 row 7).
 *
 *  Exported for ADR 0031's rebuild — see `refuseUnusableMeasurement` below. */
export function refuseBuiltSize(
  body: InsertableBody,
  plan: InsertPlan,
  measurement: BodyMeasurement,
): RejectionDetail | undefined {
  const checks = [
    { requiredM: plan.widthM, builtM: measurement.carcassWidthM },
    { requiredM: plan.heightM, builtM: measurement.carcassHeightM },
  ];
  // `Math.abs(NaN - required) > TOL` is **false**, so a builder that produced nothing sails
  // through the very gate that exists to catch it. The finiteness test has to come first.
  const wrong = checks.find(
    (check) =>
      !Number.isFinite(check.builtM) ||
      Math.abs(check.builtM - check.requiredM) > FIT_TOLERANCE_M,
  );
  if (!wrong) return undefined;
  return {
    code: "BUILT_SIZE_MISMATCH",
    params: {
      label: body.label,
      requiredMm: toMillimetres(wrong.requiredM),
      builtMm: toMillimetres(wrong.builtM),
    },
  };
}

/** The rest of the measurement, which no size gate covers: the seat offset `insertBody` persists
 *  and the full extent it reports. A probe is an injected port, so a measurement that is not a
 *  number is a data condition and belongs in the `CommandResult`, never in a thrown exception —
 *  the store calling this has no catch (ADR 0011 Gap E's reasoning, applied to Gap B's port).
 *
 *  Exported for ADR 0031's rebuild, which builds every member of a column through the same probe
 *  and owes each of them the same two checks. One implementation, so an insert and a resize cannot
 *  come to disagree about what a usable measurement is. */
export function refuseUnusableMeasurement(
  body: InsertableBody,
  measurement: BodyMeasurement,
): RejectionDetail | undefined {
  const measured = [
    { field: "seatOffsetM", valueM: measurement.seatOffsetM },
    { field: "fullHeightM", valueM: measurement.fullHeightM },
  ];
  const unusable = measured.find((entry) => !Number.isFinite(entry.valueM));
  if (!unusable) return undefined;
  return {
    code: "MEASUREMENT_UNUSABLE",
    params: { label: body.label, field: unusable.field },
  };
}

/** What `place` decided, carried to the write: the opening resolved and the plan measured against
 *  it. They travel together because the split needs both — the column from one and the remainder
 *  from the other. */
interface PlannedInsert {
  readonly target: ResolvedOpening;
  readonly plan: InsertPlan;
}

interface PlacementMillimetres {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly y0Mm: number;
  readonly alongMm: number;
  readonly seatDepthMm: number;
}

/** Every *derived* coordinate must land on a whole millimetre. The measured seat is rounded
 *  instead, because a measurement never lands on one and ADR 0011 Gap B persists it as an integer
 *  on purpose — the built-carcass re-check above is what guards that rounding. */
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
  // ADR 0046: the **seated** centre, which is the opening's own only when the body fills its
  // column. The occupied half of a split sits at `C − (W − w) / 2` and falls between two
  // millimetres whenever the column's width is odd, so this refusal is what keeps an odd extent
  // from reaching `projectEmptyColumns` — where it would throw `UnprojectableColumnError`
  // uncaught at the store seam, a crash rather than a refusal. Never rounded: rounding keys the
  // body as its neighbour (ADR 0044).
  const alongMm = plan.alongMm;
  if (!Number.isInteger(alongMm)) return inexactMillimetres("alongMm", alongMm);

  return {
    ok: true,
    value: {
      widthMm,
      heightMm,
      y0Mm,
      alongMm,
      // The only persisted number that comes from a measurement, so it is the only one that could
      // carry `toMillimetres`'s `UNMEASURABLE_MM` fallback into a document. It cannot, because
      // `refuseUnusableMeasurement` has already proved `seatOffsetM` finite — the two are a pair.
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

/** The same refusal for a value that is already in millimetres — a seated centre is planned there
 *  (`InsertPlan.alongMm`), so converting it back to metres to state it would be inventing a number
 *  the customer's kitchen never held. */
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

/** "Choice beats default" (§5.4): a swap keeps the recorded finish and handle where the incoming
 *  body supports them, and drops them where it does not — an open shelf has no doors. The top
 *  row's push-open default is deliberately *not* recorded here; it is decided by the slot at
 *  render time (`isPushOpenByDefault`), so `canHandle` stays true and the choice stays available.
 *
 *  §11 rows 12 and 13 are the same requirement read from ADR 0031's end, so the resize rebuild
 *  calls this rather than repeating it — for **every member of the column it moves**, not only the
 *  body the customer selected. The recorded defect is a sage door with black bars silently reset to
 *  white with steel. */
export function carriedAppearance(
  body: InsertableBody,
  replaced: PlacementRecord | undefined,
): Pick<CabinetBody, "finish" | "handle"> {
  if (!replaced) return {};
  return {
    ...(body.definition.canFinish && replaced.finishKey !== undefined
      ? { finish: replaced.finishKey }
      : {}),
    ...(body.definition.canHandle && replaced.handleMode !== undefined
      ? { handle: replaced.handleMode }
      : {}),
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

  return succeedWith(design, {
    type: "body_inserted",
    placementId: placement.id,
    buildId: placement.body.buildId,
    ...(replacedId === undefined ? {} : { replacedPlacementId: replacedId }),
    columns: split.value.columns,
  });
}

/** ADR 0011 Gap D: an inserted placement's derived column must be the one the map holds for it —
 *  **the key the split planned**, which under ADR 0046 is the target opening's own only when
 *  nothing was divided. A derivation that does not satisfy it is a phantom column: refused, never
 *  placed.
 *
 *  Restated rather than deleted, and both sides come from **one** millimetre value — the placement's
 *  `alongMm` — so the planned key and the derived one cannot disagree at a `toFixed(2)` boundary
 *  (ADR 0046 rule 3, `frozenColumnKey`'s discipline). */
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
