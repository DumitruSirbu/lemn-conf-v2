// What a command owes a body it has just built: the two re-checks every measurement gets, and the
// choices a new body carries from the one it replaces.
//
// Three build paths use it (§5.2's insert, ADR 0031's width rebuild, the dependent re-plan), so one
// implementation stops them disagreeing about what a usable measurement is. It is its own module
// because exporting these from `insert-body.ts` closed an import cycle, which `dist-module-graph.test.ts`
// refuses: an ES module cycle does not error, it silently binds `undefined`.
import type { BodyMeasurement } from "../body-probe.js";
import type { InsertableBody } from "../catalog.js";
import type { CabinetBody } from "../design.js";
import { toMillimetres } from "../millimetres.js";
import { FIT_TOLERANCE_M, type PlacementRecord } from "../void-engine.js";
import type { InsertPlan } from "./insert-fit.js";
import type { RejectionDetail } from "./rejection.js";

/** §5.2: re-check the built carcass's width and height and reject on mismatch. Fit is judged on the
 *  carcass, so the sink's faucet and the hood's chimney, which rise into free air, cannot refuse a
 *  body from an opening it fits (§11 row 7). Called by all three build paths. */
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

/** The rest of the measurement, which no size gate covers: the seat offset `insertBody` persists and
 *  the full extent it reports. A probe is an injected port, so a measurement that is not a number is a
 *  data condition for the `CommandResult`, never a thrown exception: the store calling this has no
 *  catch (ADR 0011 Gap E). Called by all three build paths. */
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

/** "Choice beats default" (§5.4): a swap keeps the recorded finish and handle where the incoming body
 *  supports them and drops them where it does not (an open shelf has no doors). The top row's
 *  push-open default is not recorded here: the slot decides it at render time (`isTopRowFloorMm`),
 *  so `canHandle` stays true.
 *
 *  Called for every member of a resized column and every member an insert re-plans (§11 rows 12 and
 *  13), not only the selected body: a sage door with black bars must not reset to white with steel.
 *
 *  It is a copy and stays one (ADR 0103 decision 6): `PlacementRecord.finishKey` is the stored
 *  override, never the resolved colour, so absence stays absence. Resolving the global colour here
 *  would stamp it into cabinets the customer never touched (ADR 0099 decision 2). No argument, no
 *  caller of `resolvedFinishOf`, and no second writer of `body.finish`. */
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
