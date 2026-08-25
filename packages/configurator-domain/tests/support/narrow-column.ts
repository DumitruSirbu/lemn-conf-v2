// Synthetic worlds for openings the seeded L-kitchen does not contain.
//
// Built from the seeded catalogue's own entries, with the width and height carried by the
// *placement* rather than the definition — which is how the real schema works, and keeps these
// fixtures from asserting anything the shipped catalogue does not already allow.
import type { Design, DesignPlacement } from "../../src/design.js";
import { KITCHEN_L_BODY_CATALOG } from "../../src/fixtures/kitchen-l-design.js";
import { createWorld, type KitchenWorld } from "./kitchen-world.js";

const TIMESTAMP = "2026-08-25T00:00:00.000Z";

function design(placements: DesignPlacement[]): Design {
  return {
    room: { shape: "L", widthMm: 3600, depthMm: 2400, heightMm: 2600 },
    presetId: null,
    placements,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
}

/** One base cabinet of the given width with a top-row body above it, so the column's `top` reaches
 *  2.6 and its base level is a full 860 mm opening once the base body is removed. */
export function narrowColumnWorld(widthMm: number): KitchenWorld {
  const alongMm = widthMm;
  return createWorld(
    design([
      {
        id: "s0",
        wall: "A",
        alongMm,
        y0Mm: 0,
        body: { buildId: "base-drawer2-600", widthMm, heightMm: 820 },
      },
      {
        id: "s1",
        wall: "A",
        alongMm,
        y0Mm: 2200,
        body: { buildId: "wall-2door-600-top", widthMm, heightMm: 400 },
      },
    ]),
    KITCHEN_L_BODY_CATALOG,
  );
}

/** A column whose free span starts mid-level and runs to the top, producing the one opening in the
 *  model taller than a cabinet: §4 rule 4's single collapsed opening. */
export function collapsedSpanWorld(): KitchenWorld {
  return createWorld(
    design([
      {
        id: "s0",
        wall: "A",
        alongMm: 600,
        y0Mm: 0,
        body: { buildId: "base-drawer2-600", widthMm: 600, heightMm: 1600 },
      },
      {
        id: "s1",
        wall: "A",
        alongMm: 600,
        y0Mm: 2200,
        body: { buildId: "wall-2door-600-top", widthMm: 600, heightMm: 400 },
      },
    ]),
    KITCHEN_L_BODY_CATALOG,
  );
}
