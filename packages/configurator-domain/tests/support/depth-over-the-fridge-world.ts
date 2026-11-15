// The worlds the depth-over-the-fridge suites build (ADR 0183 decision 4): one wall A of placed bodies at a chosen
// cabinet depth, and the depth `insertBody` hands the probe for a wall cabinet put into one of its voids. Both suites
// state their expectations in their own files; only the way a world is built is shared.
import { removePlacement } from "../../src/commands/remove-placement.js";
import type { Design, DesignPlacement } from "../../src/design.js";
import { buildKitchenLBodyCatalog } from "../../src/fixtures/kitchen-l-design.js";
import { toMillimetres } from "../../src/millimetres.js";
import { insertInto, OCCURRED_AT } from "./commands.js";
import { createFakeProbe } from "./fake-probe.js";
import {
  advance,
  createWorld,
  voidAt,
  type KitchenWorld,
} from "./kitchen-world.js";
import { syntheticDesign } from "./synthetic-world.js";

export type Setting = 600 | 700;

export interface Tall {
  readonly buildId: string;
  readonly heightMm: number;
  readonly widthMm: number;
}

export const FRIDGE: Tall = {
  buildId: "fridge-free",
  heightMm: 1850,
  widthMm: 700,
};

/** A body on wall A starting `startMm` from its corner. `seatDepthMm` is the seat the placement records, not the
 *  finished depth: absent, the body is planned at the depth its column decides. */
export function placement(
  id: string,
  buildId: string,
  startMm: number,
  widthMm: number,
  y0Mm: number,
  heightMm: number,
  seatDepthMm?: number,
): DesignPlacement {
  return {
    id,
    wall: "A",
    alongMm: startMm + widthMm / 2,
    y0Mm,
    body: {
      buildId,
      widthMm,
      heightMm,
      ...(seatDepthMm !== undefined ? { seatDepthMm } : {}),
    },
  };
}

export function designAt(
  setting: Setting,
  placements: readonly DesignPlacement[],
): Design {
  return {
    ...syntheticDesign(placements),
    settings: { cabinetDepthMm: setting },
  };
}

export function worldAt(
  setting: Setting,
  placements: readonly DesignPlacement[],
): KitchenWorld {
  return createWorld(
    designAt(setting, placements),
    buildKitchenLBodyCatalog(setting),
  );
}

export function withoutBodies(
  world: KitchenWorld,
  placementIds: readonly string[],
): KitchenWorld {
  return placementIds.reduce((current, id) => {
    const removed = removePlacement({
      design: current.design,
      catalog: current.catalog,
      target: { kind: "placement", id },
      occurredAt: OCCURRED_AT,
    });
    if (!removed.ok) throw new Error(`could not remove ${id}`);
    return advance(current, removed.design);
  }, world);
}

/** The depth `insertBody` hands the probe for a fresh wall cabinet in the void at `floorM` of `column`. */
export function builtDepthMm(
  world: KitchenWorld,
  column: string,
  floorM: number,
): number {
  const probe = createFakeProbe({ catalog: world.catalog });
  const result = insertInto(
    world,
    { kind: "void", id: voidAt(world, column, floorM).id },
    "wall-cabinet",
    probe,
  );
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
  const request = probe.requests[0];
  if (!request) throw new Error("the probe was not asked to build");
  return toMillimetres(request.depthM);
}
