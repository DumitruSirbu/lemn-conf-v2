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
} from "./insert-body.js";
import { evaluateInsertFit, openingFromPlacement } from "./insert-fit.js";
import { findPlacement } from "./resolve-column-members.js";
import type { Rebuild, Resolved, SetWidthInput } from "./width-resize-model.js";

/** A hood is **moved**, never rebuilt.
 *
 *  ADR 0035 decision 6 as amended says a hood keeps its own width and re-centres over the run; ADR
 *  0039 says its depth is standard and its front alignment fixed. Nothing about a hood is a function
 *  of the run beneath it except *where its centre is* — so a resize writes one field.
 *
 *  Rebuilding it through `evaluateInsertFit` was wrong in three visible ways (product-logic review
 *  R3.2), all of them from resolving the seeded instance to its catalogue equivalent: `hood-600`
 *  became `hood`, the height went 700 → 710 because the catalogue then declared `HOOD_HEIGHT_MM` as 710, and
 *  `fixedWidth` flipped true → false, handing the hood a width control the fixture deliberately
 *  withholds. A customer who resized the **cabinet underneath** got a taller hood and a new control.
 *  The extra 10 mm then ate into the level above and the next step refused with a sentence about
 *  height.
 *
 *  The 700/710 disagreement between the fixture and the catalogue was real and is **resolved the other
 *  way**: ADR 0039 decision 5 measured a built hood at 700, so the fixture was right and the
 *  catalogue over-declared by 10 mm nobody makes. `HOOD_HEIGHT_MM` is 700 since wave 5F. A resize
 *  must still not resolve such a thing by accident, which is why this function exists. */
export function moveHood(
  input: SetWidthInput,
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

/** One body rebuilt at its new width, through the identical path `insertBody` uses: §5.2's fit
 *  guards, the probe, and the built-carcass re-check behind it. A resize that would build a body
 *  the engine refuses — `BUILT_SIZE_MISMATCH`, the sink's `minWidthMm` (ADR 0017), the hood's fixed
 *  710 (ADR 0016) — is refused here, and §9 wants that refusal to be unreachable in the first
 *  place: this is the backstop, not the gate. */
export function rebuild(
  input: SetWidthInput,
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

  // §5.3's opening, with the new width written over it. Everything else — the level slot, the span
  // it belongs to and the **depth** — is the opening this body already stands in, because a resize
  // changes a width and nothing else. Reading the depth from anywhere but here is how a swap once
  // built a wall cabinet to the depth of the base cabinet below it.
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
    // Off the entry, as `insertBody` does — a rebuild goes through the same path an insert takes
    // (ADR 0055 decision 1), so it asks the same question the same way.
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
      // A resize moves a body along its wall and nowhere else, so `y0Mm` and `wall` come through
      // untouched: the module line a body stands on is not a function of its width.
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
