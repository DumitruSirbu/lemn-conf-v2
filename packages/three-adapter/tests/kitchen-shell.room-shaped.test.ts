// Wave 7H: the drawn room is the room the customer entered.
//
// The characterisation test beside this one pins the shell at **one** room. This file is the other
// half: that the shell is a correct function of the room at **every** room the owner approved, that
// nothing else in the scene moves when it changes, and that redrawing it frees what it replaces.
//
// **The seeded picture changes in this wave, by the owner's ruling.** A difference from any earlier
// capture or screenshot of the 4200 x 3400 room is expected rather than a finding.
import {
  APPROVED_ROOM_POLICY,
  derivePlacementRecords,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  OVERFLOWING_KITCHEN_L_DESIGN,
  runEndPanelSeatM,
  type DesignRoom,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import { fc, test as propertyTest } from "@fast-check/vitest";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { kitOwnedResources } from "../src/kit-ownership.js";
import {
  buildKitchenShell,
  resizeShellToRoom,
  syncRunEndPanel,
} from "../src/kitchen-shell.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import { isMesh, isTexture, toMaterials } from "../src/three-guards.js";
import { createHeadlessCanvas } from "./support/headless-canvas.js";
import { required } from "./support/required.js";

/** Ruled fixed at 300 mm (Q7H-2) and written here as the expectation rather than imported from the
 *  module under test: a constant read from the production file would agree with itself. */
const CORNER_OVERHANG_M = 0.3;

const METRE_EPSILON = 1e-6;

/** One plank and one tile, in metres, as the reference room draws them: 4 repeats across a
 *  4.2 x 3.4 m floor and 6 across a 3.5 m backsplash. A floorboard and a wall tile are manufactured
 *  sizes, so these are what must not move when the room does. */
const FLOOR_PLANK_SIZE_M = { alongWallA: 1.05, alongWallB: 0.85 };
const BACKSPLASH_TILE_WIDTH_M = 3.5 / 6;

const L_BOUNDS = required(
  APPROVED_ROOM_POLICY.buildableShapes.L,
  "the approved L bounds",
);
const WALL_A = L_BOUNDS.wallA;
const WALL_B = L_BOUNDS.wallB;
const HEIGHT = APPROVED_ROOM_POLICY.heightBounds;

const SEEDED_ROOM = KITCHEN_L_DESIGN.room;
const SEEDED_RECORDS = derivePlacementRecords(
  KITCHEN_L_DESIGN,
  KITCHEN_L_BODY_CATALOG,
);

/** The eight corners of the owner-approved policy box, plus the seeded triple.
 *
 *  The seeded room is explicit because a sweep over a 5400 x 4100 x 1700 mm box will essentially
 *  never generate 3560 x 2920 x 2600, and that room is the one the preset library is built on. */
const SAMPLED_ROOMS: readonly DesignRoom[] = [
  ...boxCornerRooms(),
  SEEDED_ROOM,
  roomOf(4000, 3000, 2700),
];

function roomOf(
  widthMm: number,
  depthMm: number,
  heightMm: number,
): DesignRoom {
  return { shape: "L", widthMm, depthMm, heightMm };
}

function boxCornerRooms(): DesignRoom[] {
  const rooms: DesignRoom[] = [];
  for (const widthMm of [WALL_A.minMm, WALL_A.maxMm]) {
    for (const depthMm of [WALL_B.minMm, WALL_B.maxMm]) {
      for (const heightMm of [HEIGHT.minMm, HEIGHT.maxMm]) {
        rooms.push(roomOf(widthMm, depthMm, heightMm));
      }
    }
  }
  return rooms;
}

const roomArbitrary = fc.record({
  shape: fc.constant("L" as const),
  widthMm: fc.integer({ min: WALL_A.minMm, max: WALL_A.maxMm }),
  depthMm: fc.integer({ min: WALL_B.minMm, max: WALL_B.maxMm }),
  heightMm: fc.integer({ min: HEIGHT.minMm, max: HEIGHT.maxMm }),
});

/** A kit is a whole room's worth of geometry and baked canvas textures, so a property that builds
 *  one per run is charged for it. Forty runs over three integer axes still crosses every band. */
const PROPERTY_RUNS = { numRuns: 40 };

describe("the drawn room is the entered room", () => {
  it.each(SAMPLED_ROOMS)(
    "draws wall A along +x and wall B along +z from the corner at $widthMm x $depthMm x $heightMm",
    (room) => {
      const drawn = drawnShellBoxes(room);
      const widthM = room.widthMm / 1000;
      const depthM = room.depthMm / 1000;
      const heightM = room.heightMm / 1000;

      // Wall A's plane is z = 0 and wall B's is x = 0 — the anchor this module adopts from wave
      // 7F1's criterion 12, declared in the domain at `room-transforms.ts:29-49`.
      expectMetres(drawn.wallA.min.z, 0);
      expectMetres(drawn.wallA.max.z, 0);
      expectMetres(drawn.wallB.min.x, 0);
      expectMetres(drawn.wallB.max.x, 0);

      // Each walks "along" from the corner they share, and runs one overhang behind it.
      expectMetres(drawn.wallA.min.x, -CORNER_OVERHANG_M);
      expectMetres(drawn.wallA.max.x, widthM);
      expectMetres(drawn.wallB.min.z, -CORNER_OVERHANG_M);
      expectMetres(drawn.wallB.max.z, depthM);

      // Both planes stand on the floor and reach the entered ceiling.
      expectMetres(drawn.wallA.min.y, 0);
      expectMetres(drawn.wallA.max.y, heightM);
      expectMetres(drawn.wallB.min.y, 0);
      expectMetres(drawn.wallB.max.y, heightM);

      // The floor carries the same overhang on both axes and reaches the end of both walls.
      expectMetres(drawn.floor.min.x, -CORNER_OVERHANG_M);
      expectMetres(drawn.floor.max.x, widthM);
      expectMetres(drawn.floor.min.z, -CORNER_OVERHANG_M);
      expectMetres(drawn.floor.max.z, depthM);
    },
  );

  it.each(SAMPLED_ROOMS)(
    "keeps the wall planes facing into the room at $widthMm x $depthMm x $heightMm",
    (room) => {
      const shell = shellFor(room).shell;

      expect(meshNamed(shell, "wall_back").rotation.y).toBe(0);
      expect(meshNamed(shell, "wall_left").rotation.y).toBe(Math.PI / 2);
    },
  );

  propertyTest.prop([roomArbitrary], PROPERTY_RUNS)(
    "draws every room in the policy with exactly one overhang behind the corner",
    (room) => {
      const drawn = drawnShellBoxes(room);

      expectMetres(
        drawn.floor.max.x - drawn.floor.min.x,
        room.widthMm / 1000 + CORNER_OVERHANG_M,
      );
      expectMetres(
        drawn.floor.max.z - drawn.floor.min.z,
        room.depthMm / 1000 + CORNER_OVERHANG_M,
      );
      expectMetres(drawn.wallA.max.y, room.heightMm / 1000);
      expectMetres(drawn.wallB.max.y, room.heightMm / 1000);
    },
  );
});

/** Q7H-4: the backsplash means *"behind the worktop"*, and it follows the **room's** wall A.
 *
 *  **Two readings were refused and are named here so the next reader does not restore one.** It
 *  does not follow the **records** as ADR 0045's run-end panel does — records never reach a shell
 *  build, and plumbing them there is a larger change than this wave's scaling rule. It is not left
 *  a **literal** 3.5 m either: that only made sense while the drawn wall ran past the entered one.
 *
 *  The four numbers the ruling was made on, at the seeded room: the base run ends at 3500 mm, the
 *  run-end panel seats at 3510, the backsplash spanned 0 -> 3500, and the room is 3560. */
describe("the wall-A backsplash follows the room", () => {
  it.each(SAMPLED_ROOMS)(
    "spans the corner to the end of wall A at $widthMm x $depthMm x $heightMm",
    (room) => {
      const backsplash = drawnShellBoxes(room).backsplash;

      expectMetres(backsplash.min.x, 0);
      expectMetres(backsplash.max.x, room.widthMm / 1000);
    },
  );

  propertyTest.prop([roomArbitrary], PROPERTY_RUNS)(
    "never leaves the corner, whatever the room",
    (room) => {
      expectMetres(drawnShellBoxes(room).backsplash.min.x, 0);
    },
  );
});

/** ADR 0083 decision 2: the room is never a function of the cabinet depth. */
describe("the shell reads no depth", () => {
  it("draws the same floor, wall planes and backsplash at 600 and at 700 mm cabinets", () => {
    const at600 = shellFor(SEEDED_ROOM, 600).shell;
    const at700 = shellFor(SEEDED_ROOM, 700).shell;

    for (const name of [
      "floor",
      "wall_back",
      "wall_left",
      "backsplash_wall_a",
    ]) {
      expect(sizeAndSeatOf(meshNamed(at600, name)), name).toEqual(
        sizeAndSeatOf(meshNamed(at700, name)),
      );
    }
  });

  /** **The fifth child does vary with the depth, and it is not the room doing it.** The finished
   *  end spans the cabinet's depth so that it closes the run it caps — 0.6 at 600 mm and 0.7 at
   *  700, which wave 6I2 established — and that is a property of the run, not of the shell's
   *  extent. Recorded rather than asserted away, because a reader comparing whole shells across
   *  depths will otherwise read it as this wave's defect. */
  it("draws the run-end panel at the cabinet's depth, which is the run's rule and not the room's", () => {
    const at600 = meshNamed(
      shellFor(SEEDED_ROOM, 600).shell,
      "end_panel_right",
    );
    const at700 = meshNamed(
      shellFor(SEEDED_ROOM, 700).shell,
      "end_panel_right",
    );

    expect(extentOf(at600)[2]).toBeCloseTo(0.6, 6);
    expect(extentOf(at700)[2]).toBeCloseTo(0.7, 6);
  });
});

/** ADR 0045: the panel closes the last base cabinet on screen, so its seat is a function of the
 *  **records**. The shell's new extent must reach it nowhere. */
describe("the run-end panel follows the records, not the shell", () => {
  propertyTest.prop([roomArbitrary], PROPERTY_RUNS)(
    "leaves the panel exactly where a seeded-room shell puts it",
    (drawnRoom) => {
      const atSeeded = panelAfterSync(SEEDED_ROOM, SEEDED_RECORDS, SEEDED_ROOM);
      const atSwept = panelAfterSync(drawnRoom, SEEDED_RECORDS, SEEDED_ROOM);

      expect(atSwept.x).toBe(atSeeded.x);
      expect(atSwept.visible).toBe(atSeeded.visible);
    },
  );

  /** Non-vacuity for the sweep above: the panel's seat and its visibility really are the records'
   *  to decide, so "it never moved" is a claim about the shell rather than about a panel that
   *  cannot move at all. */
  it("takes its seat and its visibility from the records", () => {
    const whole = panelAfterSync(SEEDED_ROOM, SEEDED_RECORDS, SEEDED_ROOM);
    const emptied = panelAfterSync(SEEDED_ROOM, [], SEEDED_ROOM);

    expect(whole.x).toBe(
      required(runEndPanelSeatM(SEEDED_RECORDS, SEEDED_ROOM), "seeded seat"),
    );
    expect(whole.visible).toBe(true);
    expect(emptied.visible).toBe(false);
  });
});

/** Criterion 4. A body is `syncSolidBodies`' and the shell is not its neighbour: no translation,
 *  rotation or scale of any body, appliance, sink, handle or chamfer may be attributable to the
 *  drawn room — **and no change to its material, its map, or that map's repeat**, which is the
 *  arm a transform comparison cannot see. */
describe("no body moves, and none is re-dressed", () => {
  propertyTest.prop([roomArbitrary], PROPERTY_RUNS)(
    "mounts every body exactly as a scene with no shell at all does",
    (room) => {
      expect(bodyFactsWithShellAt(room)).toEqual(bodyFactsWithoutAnyShell());
    },
  );

  it.each(SAMPLED_ROOMS)(
    "mounts every body unmoved at $widthMm x $depthMm x $heightMm",
    (room) => {
      expect(bodyFactsWithShellAt(room)).toEqual(bodyFactsWithoutAnyShell());
    },
  );
});

/** Criterion 19, stated as an assertion rather than a warning. `M.tile` dresses the counter's
 *  `backsplash` and the open shelf's `back_panel` as well as the shell's, so re-tiling it in place
 *  to correct the room would introduce a defect into the customer's kitchen while fixing the room
 *  around it — and nothing in the fidelity gate looks at a texture repeat. */
describe("the shell's own resources stay private to the shell", () => {
  it.each(SAMPLED_ROOMS)(
    "leaves the kit's shared materials and maps untouched at $widthMm x $depthMm x $heightMm",
    (room) => {
      const { kit, shell } = shellFor(room);

      expect(kit.M.tile.map?.repeat.toArray()).toEqual([6, 1]);
      expect(kit.M.floor.map?.repeat.toArray()).toEqual([4, 4]);
      for (const name of ["floor", "backsplash_wall_a"]) {
        const mesh = meshNamed(shell, name);
        expect(soleMaterialOf(mesh), name).not.toBe(kit.M.floor);
        expect(soleMaterialOf(mesh), name).not.toBe(kit.M.tile);
        expect(mapOf(mesh), name).not.toBe(kit.M.floor.map);
        expect(mapOf(mesh), name).not.toBe(kit.M.tile.map);
      }
    },
  );

  it("never renders the shell from a geometry another body shares", () => {
    const { kit, shell } = shellFor(SEEDED_ROOM);

    for (const name of [
      "floor",
      "wall_back",
      "wall_left",
      "backsplash_wall_a",
    ]) {
      expect(kit.ownsGeometry(meshNamed(shell, name).geometry), name).toBe(
        false,
      );
    }
  });
});

/** Criterion 17 (Q7H-6). The assertion is on the **density**, never on the repeat count: a count
 *  that happens to be right for one room is the defect restated, and a test that pins the count
 *  pins the defect. */
describe("a plank and a tile keep their world size in every room", () => {
  propertyTest.prop([roomArbitrary], PROPERTY_RUNS)(
    "tiles the floor and the backsplash at constant world density",
    (room) => {
      expectConstantWorldDensity(room);
    },
  );

  it.each(SAMPLED_ROOMS)(
    "tiles at constant world density at $widthMm x $depthMm x $heightMm",
    (room) => {
      expectConstantWorldDensity(room);
    },
  );
});

/** Criterion 18, and fact A's reason for it: the four resized shell geometries are outside the
 *  kit's geometry cache and outside its owned set, so **no existing teardown path frees a replaced
 *  one** and a leak here is invisible to every other criterion in this wave. */
describe("the shell frees what it replaces", () => {
  it("disposes every geometry it replaces, exactly once", () => {
    const { kit, shell } = shellFor(SEEDED_ROOM);
    const replaced = resizedChildren(shell).map((mesh) =>
      spyOnDispose(mesh.geometry),
    );

    resizeShellToRoom({ kit, shell, room: roomOf(5000, 4000, 3000) });

    for (const dispose of replaced) expect(dispose).toHaveBeenCalledOnce();
  });

  /** Only the two tiled children carry a material of their own; the wall planes share the paint the
   *  builder cloned and the resize never touches it, which is why they are not in this list. */
  it("disposes every material and map it replaces, exactly once", () => {
    const { kit, shell } = shellFor(SEEDED_ROOM);
    const replaced = ["floor", "backsplash_wall_a"].flatMap((name) => {
      const mesh = meshNamed(shell, name);
      return [
        spyOnDispose(soleMaterialOf(mesh)),
        spyOnDispose(required(mapOf(mesh), `${name} map`)),
      ];
    });

    resizeShellToRoom({ kit, shell, room: roomOf(5000, 4000, 3000) });

    for (const dispose of replaced) expect(dispose).toHaveBeenCalledOnce();
  });

  it("does not grow the kit's owned sets as the room is redrawn", () => {
    const { kit, shell } = shellFor(SEEDED_ROOM);
    const owned = kitOwnedResources(kit.M);
    const afterFirstDraw = {
      materials: owned.materials.size,
      textures: owned.textures.size,
    };

    for (const widthMm of [2000, 3000, 4000, 5000, 6000]) {
      resizeShellToRoom({ kit, shell, room: roomOf(widthMm, 3000, 2600) });
    }

    expect(owned.materials.size).toBe(afterFirstDraw.materials);
    expect(owned.textures.size).toBe(afterFirstDraw.textures);
  });

  it("records the map it clones, so a teardown frees it", () => {
    const { kit, shell } = shellFor(SEEDED_ROOM);
    const owned = kitOwnedResources(kit.M);

    for (const mesh of resizedChildren(shell)) {
      const map = mapOf(mesh);
      if (!map) continue;
      expect(owned.textures.has(map), mesh.name).toBe(true);
      expect(owned.materials.has(soleMaterialOf(mesh)), mesh.name).toBe(true);
    }
  });
});

/** Criterion 7's shell half, and the limit Q7H-3 names rather than hides.
 *
 *  **What is provable here and what is not.** That the drawn wall contains the entered wall is the
 *  shell's own claim and is asserted for every sampled room above. Whether a *body* is contained is
 *  a claim about the record set: the seeded records fit the seeded room, and
 *  `OVERFLOWING_KITCHEN_L_DESIGN` deliberately does not — ADR 0065 **marks** such a body rather
 *  than moving it, and since the drawn wall *is* the entered wall, past the end of the wall is past
 *  the end of the plane by construction. Both are pinned, so neither reading is lost. */
describe("a body inside its wall is drawn over the floor, and a marked one is not", () => {
  it("keeps every seeded body inside the drawn room", () => {
    const { withShell } = mountedSceneAt(SEEDED_ROOM, SEEDED_RECORDS);
    const drawn = drawnShellBoxes(SEEDED_ROOM);

    for (const body of placedBodies(withShell)) {
      const box = new THREE.Box3().setFromObject(body);
      expect(box.max.x, body.name).toBeLessThanOrEqual(
        drawn.floor.max.x + METRE_EPSILON,
      );
      expect(box.max.z, body.name).toBeLessThanOrEqual(
        drawn.floor.max.z + METRE_EPSILON,
      );
      expect(box.max.y, body.name).toBeLessThanOrEqual(
        drawn.wallA.max.y + METRE_EPSILON,
      );
    }
  });

  /** The fixture's one marked body stands a millimetre past the end of **wall B**, and the drawn
   *  wall B is the entered `depthMm`, so it is past the end of the plane by construction. */
  it("draws a marked body past the end of its drawn wall", () => {
    const overflowingRecords = derivePlacementRecords(
      OVERFLOWING_KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    );
    const room = OVERFLOWING_KITCHEN_L_DESIGN.room;
    const { withShell } = mountedSceneAt(room, overflowingRecords);
    const drawn = drawnShellBoxes(room);

    const past = placedBodies(withShell).filter(
      (body) =>
        new THREE.Box3().setFromObject(body).max.z >
        drawn.wallB.max.z + METRE_EPSILON,
    );

    expect(past.map((body) => String(body.userData["placementId"]))).toEqual([
      "dragged-past-wall-b",
    ]);
  });
});

interface BuiltShell {
  readonly kit: Kit;
  readonly shell: THREE.Group;
}

function shellFor(room: DesignRoom, cabinetDepthMm?: number): BuiltShell {
  const kit = makeKit(
    cabinetDepthMm === undefined
      ? { createCanvas: createHeadlessCanvas }
      : { createCanvas: createHeadlessCanvas, cabinetDepthMm },
  );
  return { kit, shell: buildKitchenShell(kit, room) };
}

interface DrawnShellBoxes {
  readonly floor: THREE.Box3;
  readonly wallA: THREE.Box3;
  readonly wallB: THREE.Box3;
  readonly backsplash: THREE.Box3;
}

function drawnShellBoxes(room: DesignRoom): DrawnShellBoxes {
  const shell = shellFor(room).shell;
  shell.updateWorldMatrix(true, true);
  return {
    floor: worldBoxOf(shell, "floor"),
    wallA: worldBoxOf(shell, "wall_back"),
    wallB: worldBoxOf(shell, "wall_left"),
    backsplash: worldBoxOf(shell, "backsplash_wall_a"),
  };
}

function expectConstantWorldDensity(room: DesignRoom): void {
  const { shell } = shellFor(room);
  const floor = meshNamed(shell, "floor");
  const backsplash = meshNamed(shell, "backsplash_wall_a");
  const floorRepeat = required(mapOf(floor), "floor map").repeat;
  const floorExtent = extentOf(floor);
  const backsplashRepeat = required(mapOf(backsplash), "tile map").repeat;

  expect(floorExtent[0] / floorRepeat.x).toBeCloseTo(
    FLOOR_PLANK_SIZE_M.alongWallA,
    6,
  );
  expect(floorExtent[2] / floorRepeat.y).toBeCloseTo(
    FLOOR_PLANK_SIZE_M.alongWallB,
    6,
  );
  expect(extentOf(backsplash)[0] / backsplashRepeat.x).toBeCloseTo(
    BACKSPLASH_TILE_WIDTH_M,
    6,
  );
}

interface PanelAfterSync {
  readonly x: number;
  readonly visible: boolean;
}

/** The panel of a shell **drawn** at `drawnRoom`, seated by records standing in `recordRoom`. The
 *  two rooms are separate arguments on purpose: that is the whole question. */
function panelAfterSync(
  drawnRoom: DesignRoom,
  records: readonly PlacementRecord[],
  recordRoom: DesignRoom,
): PanelAfterSync {
  const { shell } = shellFor(drawnRoom);
  const solidsRoot = new THREE.Group();
  solidsRoot.add(shell);
  syncRunEndPanel({ solidsRoot, records, room: recordRoom });
  const panel = meshNamed(shell, "end_panel_right");
  return { x: panel.position.x, visible: panel.visible };
}

interface MountedScene {
  readonly withShell: THREE.Group;
}

function mountedSceneAt(
  room: DesignRoom,
  records: readonly PlacementRecord[],
): MountedScene {
  const { kit, shell } = shellFor(room);
  const withShell = new THREE.Group();
  withShell.name = "solids";
  withShell.add(shell);
  syncSolidBodies({ kit, solidsRoot: withShell, records, room });
  withShell.updateWorldMatrix(true, true);
  return { withShell };
}

/** Every fact about a mounted body that the shell must not touch: where it stands and how it is
 *  dressed. Read as plain values, so the two sides can come from different kits. */
interface BodyFacts {
  readonly placementId: string;
  readonly meshes: readonly {
    readonly name: string;
    readonly worldMatrix: readonly number[];
    readonly materialName: string;
    readonly mapRepeat: readonly [number, number] | null;
  }[];
}

function bodyFactsWithShellAt(room: DesignRoom): BodyFacts[] {
  return bodyFactsOf(mountedSceneAt(room, SEEDED_RECORDS).withShell);
}

function bodyFactsWithoutAnyShell(): BodyFacts[] {
  const kit = makeKit({ createCanvas: createHeadlessCanvas });
  const solidsRoot = new THREE.Group();
  solidsRoot.name = "solids";
  syncSolidBodies({
    kit,
    solidsRoot,
    records: SEEDED_RECORDS,
    room: SEEDED_ROOM,
  });
  solidsRoot.updateWorldMatrix(true, true);
  return bodyFactsOf(solidsRoot);
}

function bodyFactsOf(solidsRoot: THREE.Group): BodyFacts[] {
  return placedBodies(solidsRoot)
    .map((body) => ({
      placementId: String(body.userData["placementId"]),
      meshes: meshFactsOf(body),
    }))
    .sort((a, b) => a.placementId.localeCompare(b.placementId));
}

function meshFactsOf(body: THREE.Object3D): BodyFacts["meshes"] {
  const facts: BodyFacts["meshes"][number][] = [];
  body.traverse((node) => {
    if (!isMesh(node)) return;
    const material = soleMaterialOf(node);
    const map = mapOf(node);
    facts.push({
      name: node.name,
      worldMatrix: [...node.matrixWorld.elements],
      materialName: material.name,
      mapRepeat: map ? [map.repeat.x, map.repeat.y] : null,
    });
  });
  return facts;
}

function placedBodies(solidsRoot: THREE.Group): THREE.Object3D[] {
  return solidsRoot.children.filter(
    (child) => child.userData["placementId"] !== undefined,
  );
}

/** The four children this wave redraws. The run-end panel is deliberately absent: it is the one
 *  shell child built through the kit's shared geometry cache, and nothing here may free it. */
function resizedChildren(shell: THREE.Group): THREE.Mesh[] {
  return ["floor", "wall_back", "wall_left", "backsplash_wall_a"].map((name) =>
    meshNamed(shell, name),
  );
}

function spyOnDispose(resource: { dispose: () => void }) {
  return vi.spyOn(resource, "dispose");
}

function sizeAndSeatOf(mesh: THREE.Mesh) {
  return {
    extent: extentOf(mesh).map((value) => Number(value.toFixed(6))),
    position: mesh.position.toArray().map((value) => Number(value.toFixed(6))),
  };
}

function worldBoxOf(shell: THREE.Group, name: string): THREE.Box3 {
  return new THREE.Box3().setFromObject(meshNamed(shell, name));
}

function meshNamed(shell: THREE.Group, name: string): THREE.Mesh {
  const child = shell.children.find((candidate) => candidate.name === name);
  if (!child || !isMesh(child)) throw new Error(`No shell mesh named ${name}`);
  return child;
}

function extentOf(mesh: THREE.Mesh): [number, number, number] {
  mesh.geometry.computeBoundingBox();
  const box = required(mesh.geometry.boundingBox, `${mesh.name} bounds`);
  return [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z];
}

function soleMaterialOf(mesh: THREE.Mesh): THREE.Material {
  return required(toMaterials(mesh.material)[0], `${mesh.name} material`);
}

function mapOf(mesh: THREE.Mesh): THREE.Texture | undefined {
  const map: unknown = (soleMaterialOf(mesh) as { map?: unknown }).map;
  return isTexture(map) ? map : undefined;
}

function expectMetres(actual: number, expected: number): void {
  expect(actual).toBeCloseTo(expected, 6);
}
