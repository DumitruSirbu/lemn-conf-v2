// Worlds built placement-by-placement, for openings the seeded L-kitchen cannot reach.
//
// `narrow-column.ts` covers the two shapes M3's own tests needed. The adversarial pass needs
// arbitrary member heights — a body 300 mm tall at the floor, a wall unit that stops 11 mm short
// of a module line — so this exposes the whole placement list rather than a named scenario.
import type { Design, DesignPlacement } from "../../src/design.js";
import { KITCHEN_L_BODY_CATALOG } from "../../src/fixtures/kitchen-l-design.js";
import { createWorld, type KitchenWorld } from "./kitchen-world.js";

const TIMESTAMP = "2026-08-25T00:00:00.000Z";

export function syntheticDesign(
  placements: readonly DesignPlacement[],
): Design {
  return {
    room: { shape: "L", widthMm: 3600, depthMm: 2400, heightMm: 2600 },
    presetId: null,
    placements: [...placements],
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
}

export function syntheticWorld(
  placements: readonly DesignPlacement[],
): KitchenWorld {
  return createWorld(syntheticDesign(placements), KITCHEN_L_BODY_CATALOG);
}

/** A member of a synthetic column. `buildId` defaults to entries whose catalogue definition has no
 *  `frameHeightMm`, so the placement's own `heightMm` is what the frame reports. */
export interface SyntheticMember {
  readonly id: string;
  readonly y0Mm: number;
  readonly heightMm: number;
  readonly buildId?: string;
  readonly widthMm?: number;
  readonly alongMm?: number;
}

/** One column on wall A at a single along-wall coordinate, stacked from the given members. */
export function columnWorld(
  alongMm: number,
  members: readonly SyntheticMember[],
): KitchenWorld {
  return syntheticWorld(
    members.map((member) => ({
      id: member.id,
      wall: "A" as const,
      alongMm: member.alongMm ?? alongMm,
      y0Mm: member.y0Mm,
      body: {
        buildId: member.buildId ?? "base-drawer2-600",
        widthMm: member.widthMm ?? 600,
        heightMm: member.heightMm,
      },
    })),
  );
}
