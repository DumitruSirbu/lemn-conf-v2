import type { Design, DesignPlacement } from "../design.js";
import type { BodyCatalog, BodyDefinition } from "../void-engine.js";

/**
 * The seeded L-kitchen: every placement M1's `builders['kitchen-l']()` renders whole, expressed as
 * individually mounted bodies. Excludes the two corner legs (`corner_base_x`, `corner_base_return`)
 * — their geometry is not centred on the wall-normal axis the way every other body is, so they need
 * a transform `deriveCabinetWorldTransform` does not yet cover; carried as a known gap, not silently
 * dropped (see the decomposition-parity test in `@lemnaria/three-adapter`). Also excludes the room
 * shell (floor, walls, backsplash, end panel) and `end_panel_right`, which are not placements.
 *
 * `frameDepthMm` values reproduce `kitchen-parts.ts`'s `buildKitchen()` placement coordinates
 * exactly (each is `2 ×` the wall-normal offset that its §6.2 wall-seating helper derives — the
 * body's own measured half-depth, not a round number), not a claim about a body's physical depth
 * — several bodies (the hob, the hood) are visually shallower than their `frameDepthMm`.
 */

const baseCarcass: Pick<
  BodyDefinition,
  "band" | "canFinish" | "canHandle" | "canReplace" | "canDelete" | "fixedWidth"
> = {
  band: "base",
  canFinish: true,
  canHandle: true,
  canReplace: true,
  canDelete: true,
  fixedWidth: false,
};

const wallCarcass = { ...baseCarcass, band: "wall" as const };
const topCarcass = { ...baseCarcass, band: "top" as const };
const columnCarcass = { ...baseCarcass, band: "column" as const };

export const KITCHEN_L_BODY_CATALOG: BodyCatalog = new Map<string, BodyDefinition>([
  ["base-sink-800", { ...baseCarcass, kind: "base_cabinet", frameDepthMm: 580 }],
  ["base-dishwasher-600", { ...baseCarcass, kind: "dishwasher_housing", frameDepthMm: 580 }],
  ["base-drawer2-600", { ...baseCarcass, kind: "base_cabinet", frameDepthMm: 580 }],
  ["base-drawer3-600", { ...baseCarcass, kind: "base_cabinet", frameDepthMm: 580 }],
  [
    "cooktop-600",
    {
      ...baseCarcass,
      kind: "induction_cooktop",
      frameDepthMm: 700,
      frameHeightMm: 40,
      canReplace: false,
      canDelete: false,
    },
  ],
  ["tall-oven-tower-600", { ...columnCarcass, kind: "tall_unit", frameDepthMm: 560, frameHeightMm: 2200 }],
  ["tall-pantry-600", { ...columnCarcass, kind: "tall_unit", frameDepthMm: 560, frameHeightMm: 2200 }],
  [
    "fridge-free-700",
    { ...columnCarcass, kind: "fridge_freestanding", frameDepthMm: 680, frameHeightMm: 1850, fixedWidth: true },
  ],
  ["wall-2door-600", { ...wallCarcass, kind: "wall_cabinet", frameDepthMm: 330 }],
  ["wall-corner-return-570", { ...wallCarcass, kind: "wall_cabinet", frameDepthMm: 330 }],
  ["wall-1door-300", { ...wallCarcass, kind: "wall_cabinet", frameDepthMm: 330 }],
  ["wall-2door-800", { ...wallCarcass, kind: "wall_cabinet", frameDepthMm: 330 }],
  ["open-shelf-600", { ...wallCarcass, kind: "open_shelf_unit", canHandle: false, frameDepthMm: 330 }],
  ["hood-600", { ...wallCarcass, kind: "extractor_hood", canHandle: false, fixedWidth: true, frameDepthMm: 500 }],
  ["wall-2door-600-top", { ...topCarcass, kind: "wall_cabinet", frameDepthMm: 330, frameHeightMm: 400 }],
  ["wall-1door-300-top", { ...topCarcass, kind: "wall_cabinet", frameDepthMm: 330, frameHeightMm: 400 }],
  ["wall-2door-800-top", { ...topCarcass, kind: "wall_cabinet", frameDepthMm: 330, frameHeightMm: 400 }],
  ["wall-corner-return-570-top", { ...topCarcass, kind: "wall_cabinet", frameDepthMm: 330, frameHeightMm: 400 }],
  ["wall-2door-600-deep-top", { ...topCarcass, kind: "wall_cabinet", frameDepthMm: 600, frameHeightMm: 400 }],
  ["wall-2door-700-over-fridge", { ...topCarcass, kind: "wall_cabinet", frameDepthMm: 600, frameHeightMm: 750 }],
]);

function placement(
  id: string,
  wall: "A" | "B",
  alongMm: number,
  y0Mm: number,
  buildId: string,
  widthMm: number,
  heightMm: number,
): DesignPlacement {
  return { id, wall, alongMm, y0Mm, body: { buildId, widthMm, heightMm } };
}

export const KITCHEN_L_PLACEMENTS: readonly DesignPlacement[] = [
  placement("p0", "A", 1300, 0, "base-sink-800", 800, 820),
  placement("p1", "A", 2000, 0, "base-dishwasher-600", 600, 820),
  placement("p2", "A", 2600, 0, "base-drawer2-600", 600, 820),
  placement("p3", "A", 2600, 860, "cooktop-600", 600, 40),
  placement("p4", "A", 3200, 0, "base-drawer3-600", 600, 820),
  placement("p5", "B", 1200, 0, "tall-oven-tower-600", 600, 2200),
  placement("p6", "B", 1800, 0, "tall-pantry-600", 600, 2200),
  placement("p7", "B", 2450, 0, "fridge-free-700", 700, 1850),
  placement("p8", "A", 300, 1500, "wall-2door-600", 600, 700),
  placement("p9", "B", 615, 1500, "wall-corner-return-570", 570, 700),
  placement("p10", "A", 750, 1500, "wall-1door-300", 300, 700),
  placement("p11", "A", 1300, 1500, "wall-2door-800", 800, 700),
  placement("p12", "A", 2000, 1500, "open-shelf-600", 600, 700),
  placement("p13", "A", 2600, 1500, "hood-600", 600, 700),
  placement("p14", "A", 3200, 1500, "wall-2door-600", 600, 700),
  placement("p15", "A", 300, 2200, "wall-2door-600-top", 600, 400),
  placement("p16", "A", 750, 2200, "wall-1door-300-top", 300, 400),
  placement("p17", "A", 1300, 2200, "wall-2door-800-top", 800, 400),
  placement("p18", "A", 2000, 2200, "wall-2door-600-top", 600, 400),
  placement("p19", "A", 2600, 2200, "wall-2door-600-top", 600, 400),
  placement("p20", "A", 3200, 2200, "wall-2door-600-top", 600, 400),
  placement("p21", "B", 615, 2200, "wall-corner-return-570-top", 570, 400),
  placement("p22", "B", 1200, 2200, "wall-2door-600-deep-top", 600, 400),
  placement("p23", "B", 1800, 2200, "wall-2door-600-deep-top", 600, 400),
  placement("p24", "B", 2450, 1850, "wall-2door-700-over-fridge", 700, 750),
];

export const KITCHEN_L_DESIGN: Design = {
  room: { shape: "L", widthMm: 3600, depthMm: 2400, heightMm: 2600 },
  presetId: null,
  placements: [...KITCHEN_L_PLACEMENTS],
  createdAt: "2026-08-25T00:00:00.000Z",
  updatedAt: "2026-08-25T00:00:00.000Z",
};
