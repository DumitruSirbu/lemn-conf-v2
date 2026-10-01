// What a generated U looks like against the plan it was generated from. The U planner
// (`u-composition.ts`) decides where every body stands; `generateKitchen` must put each one there
// through `insertBody` alone, so a test of generation compares the design with the plan, base by base,
// on all three walls (ADR 0110 N11.6).
import {
  generateKitchen,
  isUKitchenPlan,
  type DesignRoom,
  type GenerateKitchenResult,
  type UKitchenCompositionPlan,
} from "../../src/index.js";
import { createFakeProbeFactory } from "./fake-probe.js";

export const U_GENERATED_AT = "2026-09-29T12:00:00.000Z";

export function generateU(room: DesignRoom): GenerateKitchenResult {
  return generateKitchen({
    room,
    occurredAt: U_GENERATED_AT,
    probeAt: createFakeProbeFactory(),
  });
}

export type ComposedKitchen = Extract<GenerateKitchenResult, { ok: true }>;

/** `room` generated, which must have composed. */
export function composeU(room: DesignRoom): ComposedKitchen {
  const result = generateU(room);
  if (!result.ok) {
    throw new Error(`composeU: ${JSON.stringify(room)} did not compose`);
  }
  return result;
}

/** The three-wall plan a U's log carries. */
export function uPlanOf(
  result: GenerateKitchenResult,
): UKitchenCompositionPlan {
  const { plan } = result.log;
  if (!isUKitchenPlan(plan)) {
    throw new Error("uPlanOf: the log carries a two-wall plan, not a U's");
  }
  return plan;
}

/** Every planned base whose generated placement is not the plan's: not placed, on another wall, another
 *  body, another width, or another span. `[]` for a refused room, which places nothing. */
export function spanMismatchesOf(
  result: GenerateKitchenResult,
): readonly string[] {
  if (!result.ok) return [];
  const mismatches: string[] = [];
  for (const base of uPlanOf(result).bases) {
    const step = result.log.steps.find((candidate) => candidate.id === base.id);
    const placement =
      step?.status === "placed"
        ? result.design.placements.find(
            (candidate) => candidate.id === step.placementId,
          )
        : undefined;
    if (placement === undefined) {
      mismatches.push(`${base.id} was not placed`);
      continue;
    }
    const startMm = placement.alongMm - placement.body.widthMm / 2;
    const endMm = placement.alongMm + placement.body.widthMm / 2;
    const isPlanned =
      placement.wall === base.wall &&
      placement.body.buildId === base.buildId &&
      startMm === base.startMm &&
      endMm === base.endMm;
    if (!isPlanned) {
      mismatches.push(
        `${base.id}: planned ${base.buildId} ${base.wall} ${String(base.startMm)}-${String(base.endMm)}, generated ${placement.body.buildId} ${placement.wall} ${String(startMm)}-${String(endMm)}`,
      );
    }
  }
  return mismatches;
}
