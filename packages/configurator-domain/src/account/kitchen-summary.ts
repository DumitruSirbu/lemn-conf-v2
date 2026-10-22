import type { Design } from "../design.js";
import {
  presetNameFactsOf,
  type PresetNameFacts,
} from "../preset/preset-name-facts.js";

// What a kitchen's card says about it, as codes and numbers: the shape, the walls in millimetres and the finish. The
// app writes the sentence per locale; it is the same set of facts a preset's generated name is made of, so there is
// one definition of them.

export type KitchenSummary = PresetNameFacts;

export function kitchenSummaryOf(design: Design): KitchenSummary {
  return presetNameFactsOf(design);
}
