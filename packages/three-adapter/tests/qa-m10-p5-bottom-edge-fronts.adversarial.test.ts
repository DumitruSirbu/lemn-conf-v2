// M10 P5 (ADR 0177 A-20), the sweep the other way round: the domain prices a lift on the one row that declares `liftUp`,
// and the geometry draws a front hinged and barred as a lift-up is (a horizontal bar on its bottom edge, which is where
// a hand reaches an overhead flap) on a larger set of rows. Each such front is named here with what A-20 did with it, so
// a new one cannot ship as a plain leaf by silence: it fails this list and needs a ruling.
import {
  KITCHEN_L_BODY_CATALOG,
  type BodyDefinition,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { buildCatalogBody, isCatalogBuildId } from "../src/catalog-bodies.js";
import { buildDecomposedBody } from "../src/decomposed-bodies.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { isMesh } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { worldBox } from "./support/structure.js";

const DOOR_FRONT_MESH_NAME = "door_front";
const HANDLE_BAR_MESH_NAME = "handle_bar";
const METRES_TO_MM = 1000;
/** A bar sits 40 mm above the edge of its slab; anything within 60 mm of the bottom edge is a bottom-edge bar. */
const BOTTOM_EDGE_REACH_MM = 60;

let kit: Kit;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
});

interface GatedBody {
  readonly buildId: string;
  readonly widthMm: number;
  readonly frameHeightMm: number;
}

function definitionOf(buildId: string): BodyDefinition {
  const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
  if (definition === undefined) throw new Error(`no row ${buildId}`);
  return definition;
}

function bodiesAtEveryDeclaredWidth(): readonly GatedBody[] {
  return [...KITCHEN_L_BODY_CATALOG].flatMap(([buildId, definition]) =>
    definition.insertable === true
      ? (definition.sizesMm ?? []).map((widthMm) => ({
          buildId,
          widthMm,
          frameHeightMm: definition.nominalHeightMm ?? 0,
        }))
      : [{ buildId, widthMm: 0, frameHeightMm: 0 }],
  );
}

function build(body: GatedBody): THREE.Object3D {
  const definition = definitionOf(body.buildId);
  if (!isCatalogBuildId(body.buildId)) {
    return buildDecomposedBody(kit, body.buildId);
  }
  return buildCatalogBody(kit, body.buildId, {
    widthM: body.widthMm / METRES_TO_MM,
    heightM: body.frameHeightMm / METRES_TO_MM,
    depthM: (definition.nominalDepthMm ?? 0) / METRES_TO_MM,
  });
}

/** The doors of a built body that carry a horizontal bar on their bottom edge. */
function bottomBarredDoorCount(built: THREE.Object3D): number {
  built.updateMatrixWorld(true);
  const doors: THREE.Box3[] = [];
  const bars: THREE.Box3[] = [];
  built.traverse((node) => {
    if (!isMesh(node)) return;
    if (node.name === DOOR_FRONT_MESH_NAME) doors.push(worldBox(built, node));
    if (node.name === HANDLE_BAR_MESH_NAME) bars.push(worldBox(built, node));
  });
  return doors.filter((door) =>
    bars.some((bar) => {
      const isHorizontal = bar.max.x - bar.min.x > bar.max.y - bar.min.y;
      const centreXInside =
        (bar.min.x + bar.max.x) / 2 >= door.min.x &&
        (bar.min.x + bar.max.x) / 2 <= door.max.x;
      const barCentreY = (bar.min.y + bar.max.y) / 2;
      const isNearBottom =
        (barCentreY - door.min.y) * METRES_TO_MM <= BOTTOM_EDGE_REACH_MM &&
        barCentreY >= door.min.y;
      return isHorizontal && centreXInside && isNearBottom;
    }),
  ).length;
}

function rowsDrawingABottomBarredDoor(): readonly string[] {
  const rows = new Set<string>();
  for (const body of bodiesAtEveryDeclaredWidth()) {
    if (bottomBarredDoorCount(build(body)) > 0) rows.add(body.buildId);
  }
  return [...rows].sort();
}

/** The rows whose built doors carry a bottom-edge bar, and what A-20 did with each. Only `wall-lift` is declared lift-up:
 *  the owner named no other, so each remaining row is a hinged leaf or a flap that is reported, not priced. */
const ROWS_DRAWN_WITH_A_BOTTOM_EDGE_DOOR: Readonly<Record<string, string>> = {
  "wall-lift": "declared liftUp: one lift, hinges by width",
  "tall-fridge-housing":
    "the top box's flap over the fridge: a leaf of the height rule, reported not priced",
  "tall-oven-tower": "the upper leaf: a leaf of the height rule",
  "tall-oven-tower-600": "the upper leaf: a leaf of the height rule",
  "wall-1door-300-top": "top-row door at 400 mm: a hinged leaf, short-door bar",
  "wall-2door-600-top":
    "top-row doors at 400 mm: hinged leaves, short-door bar",
  "wall-2door-600-deep-top": "top-row doors at 400 mm: hinged leaves",
  "wall-2door-800-top": "top-row doors at 400 mm: hinged leaves",
  "wall-corner-return-570-top": "top-row corner leaf: a hinged leaf",
  "wall-corner-x-900-top": "top-row corner leaf: a hinged leaf",
};

describe("every row that draws a door barred on its bottom edge", () => {
  it("is named, with what A-20 did with it, so a new one cannot ship as a plain leaf unnoticed", () => {
    expect(rowsDrawingABottomBarredDoor()).toEqual(
      Object.keys(ROWS_DRAWN_WITH_A_BOTTOM_EDGE_DOOR).sort(),
    );
  });

  it("is declared lift-up on exactly one row of the catalogue", () => {
    const declaring = [...KITCHEN_L_BODY_CATALOG]
      .filter(([, definition]) => {
        const rule = definition.fronts;
        return rule?.countedFrom === "declared-leaves" && rule.liftUp === true;
      })
      .map(([buildId]) => buildId);

    expect(declaring).toEqual(["wall-lift"]);
  });

  it("is the wall-cabinet row too, once it is built short enough to take its bar on the bottom edge (a top-row box)", () => {
    const TALL_MM = 700;
    const SHORT_MM = 400;
    const definition = definitionOf("wall-cabinet");
    const builtAt = (heightMm: number, widthMm: number) =>
      bottomBarredDoorCount(
        build({ buildId: "wall-cabinet", widthMm, frameHeightMm: heightMm }),
      );

    expect(definition.fronts?.countedFrom).toBe("leaves-follow-width");
    for (const widthMm of [300, 600, 800]) {
      expect(builtAt(TALL_MM, widthMm), `${String(widthMm)} mm at 700`).toBe(0);
      expect(
        builtAt(SHORT_MM, widthMm),
        `${String(widthMm)} mm at 400`,
      ).toBeGreaterThan(0);
    }
  });
});
