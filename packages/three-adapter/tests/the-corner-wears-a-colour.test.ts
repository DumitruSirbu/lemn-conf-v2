// The corner ruling on screen (ADR 0099 Amendment C); the document half is
// `configurator-domain/tests/the-corner-wears-a-colour.test.ts`. The carcass of all four corners is an outward face
// (`base-corner-return-320` declares `fronts: NO_OPENING_FRONTS`, so its whole face sits in the plane of its
// neighbours' doors) and takes the colour.
// Left alone on purpose: `plinth` and `countertop` (own dark and stone materials), handles (coloured by their own
// chip), `susan_pole` / `susan_tray` and `carcass_back` (fittings and board inside the box), and `front_liner` (a
// 3 mm shadow gap; painting it deletes the shadow).
// Read as `material.color` on a named mesh of a mounted body, never a uuid, which is meaningful only in one process.
import {
  derivePlacementRecords,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  paletteFinish,
  type Design,
  type Finish,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { collectFronts } from "../src/finishes.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import { isMesh } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

/** Drawn hexes, written out rather than read from `finishes.ts`: a constant taken from the table
 *  under test agrees with whatever that table says. */
const HALIFAX = paletteFinish("pal.stejar-halifax");
const HALIFAX_HEX = "#b09272";
const NUC_WARMIA = paletteFinish("pal.nuc-warmia");
const NUC_WARMIA_HEX = "#8a5c3b";

/**
 * `M.carcass`'s own hex, the pale default of an unpainted carcass: none of these meshes may wear it under a kitchen
 * colour.
 */
const UNPAINTED_CARCASS_HEX = "#d9d8d3";

/** An ordinary base cabinet with real fronts, drawn in every scene below. */
const ORDINARY_ID = "p1";

interface Corner {
  readonly placementId: string;
  readonly buildId: string;
  /**
   * Every mesh that must take the colour, written out rather than read from the builders' `userData`: a test asking
   * the builder agrees with whatever it declared, even nothing.
   */
  readonly painted: readonly string[];
  /** Every mesh that must not: asserting only on what a body paints is satisfied by painting everything. */
  readonly unpainted: readonly string[];
}

const CORNERS: readonly Corner[] = [
  {
    placementId: "p25",
    buildId: "base-corner-x-900",
    painted: ["carcass", "door_front"],
    // `susan_pole` and `susan_tray` are fittings inside the box: the box is painted, they are not.
    unpainted: [
      "plinth",
      "susan_pole",
      "susan_tray",
      "countertop",
      "handle_bar",
      "handle_stem",
    ],
  },
  {
    placementId: "p26",
    buildId: "base-corner-return-320",
    // `fixed_front` is the panel on the run's door plane, an outward face (ADR 0135).
    painted: ["carcass", "fixed_front"],
    unpainted: ["plinth", "countertop"],
  },
  {
    placementId: "p9",
    buildId: "wall-corner-return-570",
    painted: ["carcass_shell", "door_front"],
    unpainted: ["carcass_back", "front_liner", "handle_bar", "handle_stem"],
  },
  {
    placementId: "p21",
    buildId: "wall-corner-return-570-top",
    painted: ["carcass_shell", "door_front"],
    unpainted: ["carcass_back", "front_liner", "handle_bar", "handle_stem"],
  },
];

let kit: Kit;
let solidsRoot: THREE.Group;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
  kit.builders["kitchen-l"]();
});

beforeEach(() => {
  solidsRoot = new THREE.Group();
});

/** The seeded kitchen with every body's own `finish` removed, so what each one draws is the kitchen's
 *  colour unless this file puts one back. */
function following(
  finish?: Finish,
  materialTierId = "material.melamine",
): Design {
  return {
    ...KITCHEN_L_DESIGN,
    settings: {
      ...KITCHEN_L_DESIGN.settings,
      materialTierId,
      ...(finish ? { finish } : {}),
    },
    placements: KITCHEN_L_DESIGN.placements.map((placement) => {
      const body = { ...placement.body };
      delete body.finish;
      return { ...placement, body };
    }),
  };
}

function wearingOn(
  design: Design,
  placementId: string,
  finish: Finish,
): Design {
  return {
    ...design,
    placements: design.placements.map((placement) =>
      placement.id === placementId
        ? { ...placement, body: { ...placement.body, finish } }
        : placement,
    ),
  };
}

function drawn(design: Design): void {
  syncSolidBodies({
    kit,
    solidsRoot,
    records: derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG),
    room: design.room,
  });
}

function mounted(placementId: string): THREE.Object3D {
  const body = solidsRoot.children.find(
    (child) => child.userData["placementId"] === placementId,
  );
  if (!body) throw new Error(`No body mounted for placement "${placementId}"`);
  return body;
}

/**
 * Every mesh of this body under that name, plural: a corner base builds two `susan_tray`s and a handle two
 * `handle_stem`s.
 */
function meshesNamed(root: THREE.Object3D, name: string): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((node) => {
    if (isMesh(node) && node.name === name) found.push(node);
  });
  if (found.length === 0) {
    throw new Error(`No mesh named "${name}" under this body`);
  }
  return found;
}

/** The colour this mesh is drawn in, read off the built object. */
function colourOf(mesh: THREE.Mesh): string {
  const material = mesh.material;
  if (Array.isArray(material)) {
    throw new Error(`Mesh "${mesh.name}" carries a material array`);
  }
  return `#${(material as THREE.MeshStandardMaterial).color.getHexString()}`;
}

/** Every named mesh of this body and the colour it is drawn in, so a failure names the mesh. */
function coloursOf(placementId: string, names: readonly string[]) {
  const body = mounted(placementId);
  return names.flatMap((name) =>
    meshesNamed(body, name).map((mesh) => [name, colourOf(mesh)] as const),
  );
}

/**
 * The scene painted in this run: an ordinary cabinet's fronts took the colour, so green is not a scene that painted
 * nothing.
 */
function expectTheSceneWasPainted(hex: string): void {
  const fronts = collectFronts(mounted(ORDINARY_ID));
  expect(fronts.length).toBeGreaterThan(0);
  for (const front of fronts) expect(colourOf(front)).toBe(hex);
}

/**
 * The blind corner, looked up rather than restated, and throwing so the block below cannot go vacuous if the table
 * stops naming it.
 */
function blindCorner(): Corner {
  const blind = CORNERS.find(
    (corner) => corner.buildId === "base-corner-x-900",
  );
  if (!blind) throw new Error("No row for the blind corner");
  return blind;
}

/** A carcass mesh of this body, by the two names `kitchen-parts.ts` builds them under. */
function carcassMeshesOf(corner: Corner): readonly string[] {
  return corner.painted.filter((name) => CARCASS_MESH_NAMES.has(name));
}

const CARCASS_MESH_NAMES = new Set(["carcass", "carcass_shell"]);

/** What every seeded corner body's build id carries, and no other seeded body's. */
const CORNER_BUILD_ID_MARK = "corner";

/** The carcass meshes the scene actually mounted under this placement, which may be none. */
function mountedCarcassMeshesOf(placementId: string): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  mounted(placementId).traverse((node) => {
    if (isMesh(node) && CARCASS_MESH_NAMES.has(node.name)) found.push(node);
  });
  return found;
}

/** The four corners whose carcass is painted, as a derived set so a corner dropping out fails by name. */
const CORNERS_WITH_A_PAINTED_CARCASS = CORNERS.filter(
  (corner) => carcassMeshesOf(corner).length > 0,
);

describe("the corner ruling — every visible part of a corner takes the kitchen's colour", () => {
  // The corners are found in the seeded records and their carcass meshes in the mounted scene, by name: the
  // `CORNERS` table is this file's own, and comparing it with itself paints nothing.
  it("paints the carcass of every one of the four corners", () => {
    drawn(following(HALIFAX));

    const carcassColours = derivePlacementRecords(
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    )
      .filter((record) => record.buildId.includes(CORNER_BUILD_ID_MARK))
      .map((record) => [
        record.buildId,
        mountedCarcassMeshesOf(record.id).map(colourOf),
      ])
      .sort();

    expect(carcassColours).toEqual([
      ["base-corner-return-320", [HALIFAX_HEX]],
      ["base-corner-x-900", [HALIFAX_HEX]],
      ["wall-corner-return-570", [HALIFAX_HEX]],
      ["wall-corner-return-570-top", [HALIFAX_HEX]],
    ]);
    expectTheSceneWasPainted(HALIFAX_HEX);
  });

  it.each(CORNERS)(
    "$buildId paints every declared part in the kitchen's colour",
    (corner) => {
      drawn(following(HALIFAX));

      expect(coloursOf(corner.placementId, corner.painted)).toEqual(
        corner.painted.map((name) => [name, HALIFAX_HEX]),
      );
      expectTheSceneWasPainted(HALIFAX_HEX);
    },
  );

  /**
   * The before, asserted as a before: drawn on a design nothing paints (an undeclared `materialTierId` declares no
   * default and the kitchen has none, so `drawnFinish` is `undefined`), which shows the builders' own pale carcass.
   */
  it.each(CORNERS_WITH_A_PAINTED_CARCASS)(
    "$buildId leaves its carcass on the kit's pale default when no colour resolves",
    (corner) => {
      drawn(following(undefined, "material.laminate"));

      expect(coloursOf(corner.placementId, carcassMeshesOf(corner))).toEqual(
        carcassMeshesOf(corner).map((name) => [name, UNPAINTED_CARCASS_HEX]),
      );
      // The premise for *this* scene: nothing was painted in it, so the pale carcass above is the
      // builder's own material and not a colour that happened to match it.
      for (const front of collectFronts(mounted(ORDINARY_ID))) {
        expect(front.material).toBe(kit.M.door);
      }
    },
  );

  /** Asserted in the scene that painted the carcass, so "left alone" is a refusal and not an unpainted room. */
  it.each(CORNERS)(
    "$buildId leaves the stone, the plinth and the hardware alone",
    (corner) => {
      drawn(following(HALIFAX));

      for (const [name, colour] of coloursOf(
        corner.placementId,
        corner.unpainted,
      )) {
        expect([name, colour], corner.buildId).not.toEqual([name, HALIFAX_HEX]);
      }
      expectTheSceneWasPainted(HALIFAX_HEX);
    },
  );
});

/**
 * The blind corner paints its box and not its fittings. `carcass` is a solid box with no cavity, the pole and both
 * trays are separate meshes buried inside it, and the kit has no open-door state, so the box is the cabinet (ADR 0099
 * Amendment C4). Asserted on exact hexes: a fitting drifting to a third material would pass a weaker "not the applied
 * colour".
 */
describe("the corner ruling — the blind corner paints its box and not its fittings", () => {
  const BLIND_CORNER = blindCorner();

  /** `M.steel` and `M.interior`'s hexes, the materials `cornerBaseX` gives the pole and the trays. */
  const STEEL_HEX = "#cfd4d9";
  const INTERIOR_BOARD_HEX = "#cfccc4";

  // The same scene that painted the carcass, so this is a boundary and not an unpainted room.
  it("leaves the susan pole and both trays on their own materials", () => {
    drawn(following(HALIFAX));

    expect(
      coloursOf(BLIND_CORNER.placementId, ["susan_pole", "susan_tray"]),
    ).toEqual([
      ["susan_pole", STEEL_HEX],
      ["susan_tray", INTERIOR_BOARD_HEX],
      ["susan_tray", INTERIOR_BOARD_HEX],
    ]);
    expect(coloursOf(BLIND_CORNER.placementId, ["carcass"])).toEqual([
      ["carcass", HALIFAX_HEX],
    ]);
  });
});

describe("the corner ruling — every visible part takes a colour chosen for that corner", () => {
  it.each(CORNERS)(
    "$buildId paints every declared part in its own colour, over the kitchen's",
    (corner) => {
      drawn(wearingOn(following(HALIFAX), corner.placementId, NUC_WARMIA));

      expect(coloursOf(corner.placementId, corner.painted)).toEqual(
        corner.painted.map((name) => [name, NUC_WARMIA_HEX]),
      );
      // The sharper witness: the kitchen is still Halifax, so that corner is overriding, not the whole scene moving.
      expectTheSceneWasPainted(HALIFAX_HEX);
    },
  );

  /**
   * One corner at a time: the others stay on the kitchen's colour, which is what `applyBodyFinish`'s "this body and
   * nothing else" means and what a shared kit material would break.
   */
  it.each(CORNERS)("$buildId is the only corner that moves", (corner) => {
    drawn(wearingOn(following(HALIFAX), corner.placementId, NUC_WARMIA));

    for (const other of CORNERS) {
      if (other.placementId === corner.placementId) continue;
      expect(
        coloursOf(other.placementId, other.painted),
        `${corner.buildId} moved ${other.buildId}`,
      ).toEqual(other.painted.map((name) => [name, HALIFAX_HEX]));
    }
  });
});

/**
 * Blast radius: `carcass` is built by `cornerBaseX`, `cornerBaseReturn` and the shared builder behind every base,
 * wall and tall body, so no body outside `CORNERS` may have gained a painted carcass.
 */
describe("the corner ruling — no other body's carcass was painted with them", () => {
  const CARCASS_NAMES = CARCASS_MESH_NAMES;

  it("leaves every carcass outside the four corners on the material's pale default", () => {
    drawn(following(HALIFAX));

    const cornerIds = new Set(
      CORNERS_WITH_A_PAINTED_CARCASS.map((corner) => corner.placementId),
    );
    const moved: string[] = [];
    let checked = 0;
    for (const body of solidsRoot.children) {
      const placementId = body.userData["placementId"] as string;
      if (cornerIds.has(placementId)) continue;
      body.traverse((node) => {
        if (!isMesh(node) || !CARCASS_NAMES.has(node.name)) return;
        checked += 1;
        if (colourOf(node) !== UNPAINTED_CARCASS_HEX) {
          moved.push(`${placementId}/${node.name}`);
        }
      });
    }

    // Premise: there were carcasses to check, so a kit that stopped building them cannot pass over nothing.
    expect(checked).toBeGreaterThan(0);
    expect(moved).toEqual([]);
    expectTheSceneWasPainted(HALIFAX_HEX);
  });
});
