// The four core roles' own declared priorities, read once for the U planner: `u-fridge-wall.ts` places
// the fridge and `u-back-wall-pack.ts` packs the rest, and both depend downward on this leaf rather
// than on each other.
import { GENERATION_PRIORITIES } from "./generation-priorities.js";
import type { GenerationCoreRole, GenerationPriority } from "./run-layout.js";

/** The core role's own declared priority: its build id and width, read rather than restated. */
export function declaredPriority(role: GenerationCoreRole): GenerationPriority {
  const priority = GENERATION_PRIORITIES.find(
    (candidate) => candidate.role === role,
  );
  if (!priority) {
    throw new Error(
      `u-core-priorities: GENERATION_PRIORITIES declares no ${role}`,
    );
  }
  return priority;
}

export const FRIDGE_PRIORITY = declaredPriority("fridge");
export const SINK_PRIORITY = declaredPriority("sink");
export const PREPARATION_PRIORITY = declaredPriority("preparation");
export const HOB_PRIORITY = declaredPriority("hob");
