// `DEVELOPMENT-SPEC.md` §5.2 and §5.3 — **one** code path. Filling an empty slot and swapping an
// occupied body differ only in where the target opening comes from.
//
// Forking them is on record as the cause of a silent, total failure of the replace feature: a void
// rewrite dropped the swap branch and every "Înlocuiește" row did nothing at all. One path also
// keeps the fit guards from drifting apart.
//
// **Since wave 6Z it also drives a dependent re-plan** (ADR 0103 decision 2): §5.2 described
// building one body into one opening, and it now describes the column. Every body already standing
// in a column this insert touched is re-planned at the column as it stands afterwards, through the
// same path the insert itself takes. The rule lives in `replan-dependent-members.ts`; what lives
// here is the one call and the atomicity — either the placed body and every re-planned body are
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
  /** ADR 0011 Gap D: frozen load-time columns, in their **recorded** face (ADR 0090 Amendment B).
   *  No command recomputes them, and this one refuses rather than place a body that would fall
   *  outside the map. This is the face `effect.columns` replaces, so it is the one a room-derived
   *  cap may never have touched.
   *
   *  It is deliberately **not** what the openings come from — see `voids`. */
  readonly columns: ReadonlyMap<string, Column>;
  /**
   * **The published openings** — §9's own list, bounded by the wall (ADR 0069's owner ruling, kept
   * in as many words by ADR 0090 Amendment B: *"no opening past the wall is ever derived, drawn or
   * offered"*).
   *
   * **Required, and deliberately neither optional nor recomputed here.** Until this wave the
   * command built its own list from `columns`, so once backlog 52 made that map the recorded face
   * the uncapped map became the uncapped opening: at a 700 mm kitchen the space flush to wall B's
   * end published a 500 mm opening and the command built a 600 mm body 100 mm past a 2920 mm wall,
   * while the offer list refused a `base-sink` in the same opening by name. §11 row 6 and ADR 0032
   * say the list and the command are *"the same evaluation `insertBody` runs"*, and they can only be
   * that if they are handed the same openings.
   *
   * **Nor re-derived from a capped copy of `columns`.** `deriveColumns` runs the wall-end clip
   * *before* ADR 0046's merge, so `clip(recorded)` is not the published map — a pair the clip
   * narrows below ADR 0052's 800 mm ceiling merges where the same pair uncapped declines
   * (`deriveRecordedColumns`' own comment carries that measurement). The published list is handed
   * in by the one seam that assembles it.
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
  // **The two faces, each in the role ADR 0090 Amendment B gives it**: the opening is resolved out
  // of the published list, which the wall bounds, and the column it is seated in comes from the
  // recorded map, which the split then rewrites. This is `OffersInput` field for field, which is
  // what makes §11 row 6's "one evaluation, two callers" structural rather than a promise.
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
    // Carried rather than re-derived below: the dependent re-plan compares the column's
    // `hasFullHeightUnder` answer over these records against its answer over the post-insert ones,
    // and two derivations of "the design as it stood" are two authors for it.
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
    // Read off the entry, and a throw rather than a default if it is joint-seated: an insertable
    // body always has a plane of its own (ADR 0077 decision 3).
    seatedOn: measurableSeatOf({
      buildId: body.buildId,
      rule: input.catalog.get(body.buildId)?.seatRule,
    }),
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
  return applyPlacement(input, body, planned, placement);
}

/** What `place` decided, carried to the write: the opening resolved and the plan measured against
 *  it. They travel together because the split needs both — the column from one and the remainder
 *  from the other. */
interface PlannedInsert {
  readonly target: ResolvedOpening;
  readonly plan: InsertPlan;
  /** The records the design had **before** this insert, for wave 6Z's dependent re-plan. Derived
   *  once by `insertBody` and carried, never re-derived here. */
  readonly recordsBefore: readonly PlacementRecord[];
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

  // **After the split and after the drift guard** (ADR 0103 decision 3), because the map the
  // dependent bodies are re-planned against is the one the split just wrote — with
  // `hasFullHeightUnder` re-answered over the records this insert produced.
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
  // **Atomic**: the insert refuses whole, and the design the caller gets back is the one it handed
  // in. A column with the new body in it and the standing one left at the old depth is the silent
  // mixture this wave exists to remove (ADR 0103 decision 7).
  if (!replanned.ok) return refuse(input.design, replanned.detail);

  return succeedWith(
    withPlacements(design, replanned.value, input.occurredAt),
    {
      type: "body_inserted",
      placementId: placement.id,
      buildId: placement.body.buildId,
      ...(replacedId === undefined ? {} : { replacedPlacementId: replacedId }),
      // **The split's map, unchanged** (ADR 0103 decision 9). The re-plan moves member seats and no
      // published extent: no `Column.d`, no `Column.w`, no key and no `depthFromBuildId` moves,
      // because this command publishes the map the split wrote and nothing re-derives it.
      columns: split.value.columns,
    },
  );
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
