// One member of the column written at its new width — through the identical path `insertBody` takes —
// or, for a hood carried along by its neighbours' move, simply re-centred (ADR 0035 decision 6 as
// amended, ADR 0039 decision 4).
import { measurableSeatOf } from "../seat-rule.js";
import { cabinetDepthMmOf } from "../design.js";
import type { DesignPlacement } from "../design.js";
import {
  MILLIMETRES_PER_METRE,
  toExactMillimetres,
  toMetres,
  toMillimetres,
} from "../millimetres.js";
import type { PlacementRecord } from "../void-engine.js";
import {
  carriedAppearance,
  refuseBuiltSize,
  refuseUnusableMeasurement,
} from "./built-body.js";
import { evaluateInsertFit, openingFromPlacement } from "./insert-fit.js";
import { findPlacement } from "./resolve-column-members.js";
import type { Rebuild, RebuildInput, Resolved } from "./width-resize-model.js";

/** A hood is **moved**, never rebuilt: it keeps its width and re-centres over the run (ADR 0035
 *  decision 6 as amended), its depth is standard and its front alignment fixed (ADR 0039). Only its
 *  centre depends on the run beneath it, so a resize writes one field.
 *
 *  Rebuilding it through `evaluateInsertFit` resolves the seeded instance to its catalogue equivalent:
 *  `hood-600` becomes `hood`, the height changes, and `fixedWidth` flips true to false, handing the
 *  hood a width control the fixture withholds. A resize must not resolve such a thing by accident. */
export function moveHood(
  input: RebuildInput,
  plan: Rebuild,
): Resolved<DesignPlacement> {
  const placement = findPlacement(input.design, plan.record.id);
  if (!placement) {
    return {
      ok: false,
      detail: { code: "COLUMN_MISMATCH", params: { label: plan.body.label } },
    };
  }
  return { ok: true, value: { ...placement, alongMm: plan.alongMm } };
}

/** One body rebuilt at its new width through the identical path `insertBody` uses: §5.2's fit guards,
 *  the probe, and the built-carcass re-check. A resize that would build a body the engine refuses
 *  (`BUILT_SIZE_MISMATCH`, the sink's `minWidthMm` (ADR 0017), the hood's fixed height) is refused
 *  here; §9 makes that refusal unreachable in the first place, so this is the backstop, not the gate. */
export function rebuild(
  input: RebuildInput,
  records: readonly PlacementRecord[],
  plan: Rebuild,
): Resolved<DesignPlacement> {
  const placement = findPlacement(input.design, plan.record.id);
  const column = input.columns.get(plan.record.col);
  if (!placement || !column) {
    return {
      ok: false,
      detail: { code: "COLUMN_MISMATCH", params: { label: plan.body.label } },
    };
  }

  // §5.3's opening with the new width written over it. Everything else, the **depth** included, is the
  // opening this body already stands in, because a resize changes a width and nothing else; any other
  // depth source would build a wall cabinet to the depth of the base cabinet below it.
  const opening = {
    ...openingFromPlacement(plan.record, records, input.columns),
    alongM: toMetres(plan.alongMm),
    w: toMetres(plan.widthMm),
  };
  const fit = evaluateInsertFit({
    body: plan.body,
    opening,
    column,
    cabinetDepthMm: cabinetDepthMmOf(input.design),
  });
  if (!fit.ok) return { ok: false, detail: fit.detail };

  const measurement = input.probe.measure({
    buildId: plan.body.buildId,
    // Off the entry, as `insertBody` does.
    seatedOn: measurableSeatOf({
      buildId: plan.body.buildId,
      rule: input.catalog.get(plan.body.buildId)?.seatRule,
    }),
    widthM: fit.plan.widthM,
    heightM: fit.plan.heightM,
    depthM: fit.plan.depthM,
  });
  const mismatch = refuseBuiltSize(plan.body, fit.plan, measurement);
  if (mismatch) return { ok: false, detail: mismatch };
  const unusable = refuseUnusableMeasurement(plan.body, measurement);
  if (unusable) return { ok: false, detail: unusable };

  const heightMm = toExactMillimetres(fit.plan.heightM);
  if (heightMm === undefined) {
    return {
      ok: false,
      detail: {
        code: "NON_INTEGER_MILLIMETRES",
        params: {
          field: "heightMm",
          valueMm: fit.plan.heightM * MILLIMETRES_PER_METRE,
        },
      },
    };
  }

  return {
    ok: true,
    value: {
      ...placement,
      // A resize moves a body along its wall only, so `y0Mm` and `wall` come through untouched.
      alongMm: plan.alongMm,
      body: {
        buildId: plan.body.buildId,
        widthMm: plan.widthMm,
        heightMm,
        seatDepthMm: toMillimetres(2 * measurement.seatOffsetM),
        // §11 rows 12 and 13, now for **every** member of the resized column.
        ...carriedAppearance(plan.body, plan.record),
      },
    },
  };
}
