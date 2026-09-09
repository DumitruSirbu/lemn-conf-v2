// **The owner's corner ruling of 2026-09-09, on screen** — *"support setting custom color for all
// corner cabinet parts."* The document half is
// `configurator-domain/tests/the-corner-wears-a-colour.test.ts`; this is the half the owner was
// actually looking at, and the reason a flag change alone would not have closed the report.
//
// **What they saw.** With `Stejar Halifax Natur` applied to the whole kitchen, every corner body's
// `door_front` was already the kitchen's wood — and the boxes behind those doors were not. Measured
// before the change, on the seeded kitchen at that colour:
//
// | Body | Mesh | Material | Colour |
// | --- | --- | --- | --- |
// | `base-corner-x-900` | `carcass` | `carcass_white` | `#d9d8d3` |
// | `base-corner-return-320` | `carcass` | `carcass_white` | `#d9d8d3` |
// | `wall-corner-return-570` | `carcass_shell` | `carcass_white` | `#d9d8d3` |
// | `wall-corner-return-570-top` | `carcass_shell` | `carcass_white` | `#d9d8d3` |
//
// `#d9d8d3` is `M.carcass`, the pale default of an unpainted cabinet, and on all four it is an
// **outward** face rather than an interior. `base-corner-return-320` is the plainest case: it
// declares `fronts: NO_OPENING_FRONTS`, so nothing stands in front of the box and its whole
// 320 × 720 face sits in the same plane as its neighbours' doors. That is the white slab in the
// owner's picture, and it is what ADR 0099 Amendment B read as "the box interior every cabinet
// shares". `base-corner-x-900` is the same face at the blind corner: 900 mm of box behind a 280 mm
// door.
//
// **What is deliberately left alone, and each has a reason of its own:**
//
// - `plinth` (`M.dark`) and `countertop` (`M.stone`) — the worktop is stone and the plinth is its
//   own dark material. Neither is the body's finish on any cabinet in this kit.
// - `handle_bar` / `handle_stem` (`M.steel`) — hardware, and `§5.5`'s handle chip is what colours
//   those.
// - `susan_pole` (`M.steel`) and `susan_tray` (`M.interior`) — fittings inside the X-leg, behind its
//   door.
// - `carcass_back` (`M.interior`) — the board *inside* the wall return's box.
// - `front_liner` (`M.shadowGap`) — 3 mm of near-black behind the door edges, whose whole job is to
//   read as a shadow. Painting it deletes the shadow gap.
//
// **Measured off the built object, never off a uuid.** A uuid is meaningful only inside one process,
// and what the owner reported is a colour. Every claim below reads `material.color` on a named mesh
// of a mounted body, with the ordinary cabinet `p1` in the same scene as the witness that the scene
// painted at all in that very run (ADR 0093 decision 1).
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

/** `M.carcass`'s own hex — what every one of these meshes wore in the owner's picture, and what none
 *  of them may still be wearing under a kitchen colour. */
const UNPAINTED_CARCASS_HEX = "#d9d8d3";

/** An ordinary base cabinet with real fronts, drawn in every scene below. */
const ORDINARY_ID = "p1";

interface Corner {
  readonly placementId: string;
  readonly buildId: string;
  /** **Every mesh of this body that must take the colour**, named. Written out rather than read back
   *  from the `userData` the builders write, because a test that asks the builder what it declared
   *  agrees with whatever it declared — including with nothing. */
  readonly painted: readonly string[];
  /** And every mesh that must **not**, with the material each keeps. A body asserted only on what it
   *  paints is satisfied by painting everything, which is the failure the census above exists to
   *  rule out. */
  readonly unpainted: readonly string[];
}

const CORNERS: readonly Corner[] = [
  {
    placementId: "p25",
    buildId: "base-corner-x-900",
    painted: ["carcass", "door_front"],
    // `susan_pole` and `susan_tray` are the distinction this body exists to hold: they are the
    // fittings *inside* the box, and the box is painted while they are not. See the block below.
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
    painted: ["carcass"],
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
  });
}

function mounted(placementId: string): THREE.Object3D {
  const body = solidsRoot.children.find(
    (child) => child.userData["placementId"] === placementId,
  );
  if (!body) throw new Error(`No body mounted for placement "${placementId}"`);
  return body;
}

/** Every mesh of this body under that name — plural, because a corner base builds two `susan_tray`s
 *  and a handle builds two `handle_stem`s, and an assertion that stopped at the first would leave the
 *  second unchecked. */
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

/** The scene painted **in this run**: an ordinary cabinet's fronts took the colour. Without it a
 *  green sweep is also what a scene that painted nothing and a hex that happened to match would
 *  produce. */
function expectTheSceneWasPainted(hex: string): void {
  const fronts = collectFronts(mounted(ORDINARY_ID));
  expect(fronts.length).toBeGreaterThan(0);
  for (const front of fronts) expect(colourOf(front)).toBe(hex);
}

/** The blind corner — 900 mm of box behind a 280 mm door, the one body in the kit whose carcass and
 *  whose fittings are both reachable. Looked up rather than written out a second time, and throwing
 *  rather than returning `undefined`, so the block below cannot go vacuous if the table above stops
 *  naming it. */
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

/** **The corners whose carcass the ruling reached** — all four of them. Kept as a derived set with a
 *  membership assertion rather than folded back into `CORNERS`, because it was three for an hour on
 *  2026-09-09 and the sweeps below must say *which* four rather than "however many the table
 *  happens to hold". A corner dropping out of it fails by name. */
const CORNERS_WITH_A_PAINTED_CARCASS = CORNERS.filter(
  (corner) => carcassMeshesOf(corner).length > 0,
);

describe("the corner ruling — every visible part of a corner takes the kitchen's colour", () => {
  it("paints the carcass of every one of the four corners", () => {
    expect(
      CORNERS_WITH_A_PAINTED_CARCASS.map((corner) => corner.buildId).sort(),
    ).toEqual([
      "base-corner-return-320",
      "base-corner-x-900",
      "wall-corner-return-570",
      "wall-corner-return-570-top",
    ]);
    expect(
      CORNERS.filter((corner) => carcassMeshesOf(corner).length === 0),
    ).toEqual([]);
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

  /** **The before, asserted as a before.** Each of those meshes was `#d9d8d3` in the owner's picture,
   *  so a sweep that only checked the after would pass on a kit whose carcass default had simply been
   *  changed to a wood — and would say nothing about whether the colour is what moved it.
   *
   *  **Drawn on a design nothing paints**, which is the one reachable scene where no colour resolves
   *  at all: an undeclared `materialTierId` declares no default (ADR 0078 decision 3) and the kitchen
   *  carries none, so `drawnFinish` is `undefined` for every body. That state loads rather than being
   *  refused — wave 6G's recovery depends on it — and it is what the builders' own materials look
   *  like. */
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

  /** **And the parts that are not the body's finish keep theirs.** Asserted against the same scene
   *  that painted the carcass, so "left alone" is a refusal and not an unpainted room: every one of
   *  these must differ from the colour the declared meshes just took. */
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

/** **What the blind corner draws, and where its colour stops.** The same subject this block has had
 *  since it was written; only the answer moved.
 *
 *  **It asserted the opposite first, and that was a real decision rather than drift.**
 *  `base-corner-x-900` was left bare while the owner was asked whether a carcass a
 *  *door opens onto* should take the customer's colour — thought to be a different question from
 *  `base-corner-return-320`'s box, which no door covers. Two independent mesh censuses dissolved the
 *  question rather than answering it, and every clause of the premise turned out false:
 *
 *  - `carcass` is a **solid** `box(0.9, 0.72, 0.6)` with no cavity, so there is no inner surface for
 *    a declaration to reach.
 *  - `susan_pole` and both `susan_tray`s are **separate meshes** at z = −0.010, buried inside a
 *    volume spanning z ∈ [−0.30, +0.30], and visible from no camera.
 *  - **This kit has no open-door state at all.** Nothing in `scene-sync.ts` or the stage animates or
 *    hides a `door_front`, so the door never opens — and if it did it would show the same solid face
 *    that already stands bare for 620 mm beside it.
 *
 *  So the two base legs differ in *degree* — 620 of 900 mm uncovered against all of it — and not in
 *  kind, and the owner's *"all corner cabinet parts"* covered it from the start. Recorded at this
 *  length because a reader who finds only the final state will re-litigate it; one who finds why it
 *  was held and what dissolved it will not.
 *
 *  **The distinction that survived the reversal is the one worth a test of its own**, and it is what
 *  this block now pins: the box is the cabinet and takes the colour; the pole and the trays standing
 *  in it are fittings and keep their steel and their board. Asserted on exact hexes rather than on
 *  "not the applied colour", because a fitting that drifted to some third material would satisfy the
 *  weaker claim and still be a change nobody asked for. */
describe("the corner ruling — the blind corner paints its box and not its fittings", () => {
  const BLIND_CORNER = blindCorner();

  /** `M.steel` and `M.interior`'s own hexes — the materials `cornerBaseX` gives the pole and the
   *  trays, written out so "left alone" names the colour it was left on. */
  const STEEL_HEX = "#cfd4d9";
  const INTERIOR_BOARD_HEX = "#cfccc4";

  it("paints its carcass and its door in the kitchen's colour", () => {
    drawn(following(HALIFAX));

    expect(
      coloursOf(BLIND_CORNER.placementId, ["carcass", "door_front"]),
    ).toEqual([
      ["carcass", HALIFAX_HEX],
      ["door_front", HALIFAX_HEX],
    ]);
  });

  it("paints them in a colour chosen for that corner, over the kitchen's", () => {
    drawn(wearingOn(following(HALIFAX), BLIND_CORNER.placementId, NUC_WARMIA));

    expect(
      coloursOf(BLIND_CORNER.placementId, ["carcass", "door_front"]),
    ).toEqual([
      ["carcass", NUC_WARMIA_HEX],
      ["door_front", NUC_WARMIA_HEX],
    ]);
  });

  /** **And the colour stops at the box.** Both fittings, both trays, on their own materials — in the
   *  same scene that just painted the carcass, so this is a boundary and not an unpainted room. */
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
      // The witness, and the sharper one here: the kitchen is still Halifax, so this is *that*
      // corner overriding rather than the whole scene having moved to Nuc.
      expectTheSceneWasPainted(HALIFAX_HEX);
    },
  );

  /** One corner at a time. Three corners in the same scene stay on the kitchen's colour while the
   *  fourth wears its own, which is what `applyBodyFinish`'s "this body and nothing else" means and
   *  what a shared kit material would break. */
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

/** **The blast radius, measured rather than argued.** `carcass` and `carcass_shell` are built by
 *  `cornerBaseX`, `cornerBaseReturn` and `carcass` — and that last one is shared by every base, wall
 *  and tall body in the kit. The declaration is what keeps the corners' shells apart from theirs, and
 *  this is the assertion that says so: no body outside `CORNERS` may have gained a painted carcass. */
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

    // The premise: there were carcasses to check. A kit that stopped building them would otherwise
    // make this pass over nothing.
    expect(checked).toBeGreaterThan(0);
    expect(moved).toEqual([]);
    expectTheSceneWasPainted(HALIFAX_HEX);
  });
});
