import {
  isUKitchenPlan,
  type GenerationLog,
  type KitchenCompositionPlan,
} from "../../src/index.js";

/** The two-wall plan of a log an L or a straight room produced. A U's log carries a three-wall plan,
 *  and a test about the L reading one is a test that has the wrong room. */
export function twoWallPlanOf(log: GenerationLog): KitchenCompositionPlan {
  const { plan } = log;
  if (isUKitchenPlan(plan)) {
    throw new Error("twoWallPlanOf: the log carries a U plan, not an L's");
  }
  return plan;
}
