// The whole-kitchen handle is one of the kinds a command can report (M10 H-6, wave Q2). The checks are mostly types: the
// file fails to compile if the union loses the kind, and the exhaustive switch fails to compile when a kind is added
// that nobody has decided whether it names a placement.
import { describe, expect, it } from "vitest";

import {
  setKitchenHandle,
  type CommandEffect,
  type CommandResult,
  type KitchenHandleResult,
  type KitchenHandleSetEffect,
} from "../../src/index.js";
import { KITCHEN_L_DESIGN } from "../../src/fixtures/kitchen-l-design.js";

/** What a consumer that reads `placementId` has to know: whether the kind names a placement. A kind added to the union
 *  and left out here is a compile error, which is the exhaustiveness the web store's selection fold depends on. */
function namesAPlacement(effect: CommandEffect): boolean {
  switch (effect.type) {
    case "placement_removed":
    case "body_inserted":
    case "body_resized":
    case "finish_set":
    case "finish_cleared":
    case "handle_set":
      return true;
    case "material_tier_set":
    case "hardware_tier_set":
    case "global_finish_set":
    case "kitchen_handle_set":
    case "cabinet_depth_set":
      return false;
  }
}

describe("the kitchen handle's effect in the CommandEffect union", () => {
  it("is assignable to the union and exported by the package, and names no placement", () => {
    const effect: KitchenHandleSetEffect = {
      type: "kitchen_handle_set",
      handle: "push",
    };
    const asUnion: CommandEffect = effect;

    expect(namesAPlacement(asUnion)).toBe(false);
    expect(asUnion).not.toHaveProperty("placementId");
  });

  it("is what the command answers, and the answer is accepted as any command's result", () => {
    const result: KitchenHandleResult = setKitchenHandle({
      design: KITCHEN_L_DESIGN,
      handle: "black",
      occurredAt: "2026-11-02T10:00:00.000Z",
    });
    const asAnyResult: CommandResult = result;

    expect(asAnyResult.ok).toBe(true);
    if (!asAnyResult.ok) return;
    expect(asAnyResult.effect).toEqual({
      type: "kitchen_handle_set",
      handle: "black",
    });
    expect(namesAPlacement(asAnyResult.effect)).toBe(false);
  });

  it("answers a refusal in the shared envelope too, with the design it was given", () => {
    const refused: CommandResult = setKitchenHandle({
      design: KITCHEN_L_DESIGN,
      handle: "gold" as never,
      occurredAt: "2026-11-02T10:00:00.000Z",
    });

    expect(refused.ok).toBe(false);
    expect(refused.design).toBe(KITCHEN_L_DESIGN);
  });
});
