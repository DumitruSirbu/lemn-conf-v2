// **What a command owes a body it has just built** — the two re-checks every measurement gets, and
// the choices a new body carries from the one it replaces.
//
// It sits in a module of its own because **three** code paths now build a body through the probe:
// §5.2's insert, ADR 0031's width rebuild, and wave 6Z's dependent re-plan. All three owe the same
// checks, so one implementation is what stops an insert and a rebuild coming to disagree about what
// a usable measurement is (ADR 0055 decision 1: a rebuild goes through the same path an insert
// takes).
//
// Until wave 6Z these three lived in `insert-body.ts` and were exported from it with *"exported for
// ADR 0031's rebuild"* beside each. Wave 6Z made `insert-body.ts` import the re-plan, which imports
// the rebuild, which imported these back — an import cycle, which `dist-module-graph.test.ts`
// refuses for a measured reason: an ES module cycle does not error, it silently binds `undefined`.
// Nothing about the three functions changed on the way here.
import type { BodyMeasurement } from "../body-probe.js";
import type { InsertableBody } from "../catalog.js";
import type { CabinetBody } from "../design.js";
import { toMillimetres } from "../millimetres.js";
import { FIT_TOLERANCE_M, type PlacementRecord } from "../void-engine.js";
import type { InsertPlan } from "./insert-fit.js";
import type { RejectionDetail } from "./rejection.js";

/** §5.2: "gs = CARCASS box of g → re-check width & height, reject on mismatch". Fit is judged on
 *  the carcass, so the sink's faucet and the hood's chimney — which rise into free air — cannot
 *  refuse a body from an opening it fits perfectly (§11 row 7).
 *
 *  Called by all three build paths — see this file's head comment, and `refuseUnusableMeasurement`
 *  below. */
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
 *  Called by ADR 0031's rebuild too, which builds every member of a column through the same probe
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

/** "Choice beats default" (§5.4): a swap keeps the recorded finish and handle where the incoming
 *  body supports them, and drops them where it does not — an open shelf has no doors. The top
 *  row's push-open default is deliberately *not* recorded here; it is decided by the slot at
 *  render time (`isPushOpenByDefault`), so `canHandle` stays true and the choice stays available.
 *
 *  §11 rows 12 and 13 are the same requirement read from ADR 0031's end, so the resize rebuild
 *  calls this rather than repeating it — for **every member of the column it moves**, and since wave
 *  6Z for **every member an insert re-plans** as well, not only the body the customer selected. The
 *  recorded defect is a sage door with black bars silently reset to white with steel.
 *
 *  **It is a copy and it stays one** (ADR 0103 decision 6). `PlacementRecord.finishKey` is
 *  `placement.body.finish` and only that — the stored override, never the resolved colour — so
 *  absence is preserved as absence and a body that carried no `finish` key comes out of here with no
 *  `finish` key at all. Wave 6Z puts more cabinets through this function than any wave before it, so
 *  the obvious wiring W3's QA note describes — resolving the global colour here — would now stamp one
 *  into cabinets the customer never touched, which ADR 0099 decision 2 forbids. **No argument, no
 *  caller of `resolvedFinishOf`, and no second writer of `body.finish`.** */
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
