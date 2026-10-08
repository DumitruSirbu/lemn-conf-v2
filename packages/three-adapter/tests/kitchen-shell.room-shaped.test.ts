import {
  derivePlacementRecords,
  KITCHEN_L_BODY_CATALOG,
  OVERFLOWING_KITCHEN_L_DESIGN,
  runEndPanelSeatM,
  type DesignRoom,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import { fc, test as propertyTest } from "@fast-check/vitest";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { deriveKitMaterial, kitOwnedResources } from "../src/kit-ownership.js";
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
import {
  APPROVED_HEIGHT,
  APPROVED_WALL_A,
  APPROVED_WALL_B,
  roomOf,
  SEEDED_RECORDS,
  SEEDED_ROOM,
} from "./support/approved-rooms.js";

/**
 * Fixed at 300 mm and written as the expectation rather than imported: a constant read from the production file
 * would agree with itself.
 */
const CORNER_OVERHANG_M = 0.3;

const METRE_EPSILON = 1e-6;

/**
 * One plank and one tile in metres, as the reference room draws them: manufactured sizes, so these are what must
 * not move when the room does.
 */
const FLOOR_PLANK_SIZE_M = { alongWallA: 1.05, alongWallB: 0.85 };
const BACKSPLASH_TILE_WIDTH_M = 3.5 / 6;

/** The eight corners of the policy box, plus the seeded room, which a sweep would essentially never generate. */
const SAMPLED_ROOMS: readonly DesignRoom[] = [
  ...boxCornerRooms(),
  SEEDED_ROOM,
  roomOf(4000, 3000, 2700),
];

function boxCornerRooms(): DesignRoom[] {
  const rooms: DesignRoom[] = [];
  for (const widthMm of [APPROVED_WALL_A.minMm, APPROVED_WALL_A.maxMm]) {
    for (const depthMm of [APPROVED_WALL_B.minMm, APPROVED_WALL_B.maxMm]) {
      for (const heightMm of [APPROVED_HEIGHT.minMm, APPROVED_HEIGHT.maxMm]) {
        rooms.push(roomOf(widthMm, depthMm, heightMm));
      }
    }
  }
  return rooms;
}

const roomArbitrary = fc.record({
  shape: fc.constant("L" as const),
  widthMm: fc.integer({
    min: APPROVED_WALL_A.minMm,
    max: APPROVED_WALL_A.maxMm,
  }),
  depthMm: fc.integer({
    min: APPROVED_WALL_B.minMm,
    max: APPROVED_WALL_B.maxMm,
  }),
  heightMm: fc.integer({
    min: APPROVED_HEIGHT.minMm,
    max: APPROVED_HEIGHT.maxMm,
  }),
});

/** A kit is a whole room's geometry and baked canvases, so a property that builds one per run is charged for it. */
const PROPERTY_RUNS = { numRuns: 40 };

describe("the drawn room is the entered room", () => {
  it.each(SAMPLED_ROOMS)(
    "draws wall A along +x and wall B along +z from the corner at $widthMm x $depthMm x $heightMm",
    (room) => {
      const drawn = drawnShellBoxes(room);
      const widthM = room.widthMm / 1000;
      const depthM = room.depthMm / 1000;
      const heightM = room.heightMm / 1000;

      // Wall A's plane is z = 0 and wall B's is x = 0: the anchor declared in the domain's `room-transforms.ts`.
      expectMetres(drawn.wallA.min.z, 0);
      expectMetres(drawn.wallA.max.z, 0);
      expectMetres(drawn.wallB.min.x, 0);
      expectMetres(drawn.wallB.max.x, 0);

      expectMetres(drawn.wallA.min.x, -CORNER_OVERHANG_M);
      expectMetres(drawn.wallA.max.x, widthM);
      expectMetres(drawn.wallB.min.z, -CORNER_OVERHANG_M);
      expectMetres(drawn.wallB.max.z, depthM);

      expectMetres(drawn.wallA.min.y, 0);
      expectMetres(drawn.wallA.max.y, heightM);
      expectMetres(drawn.wallB.min.y, 0);
      expectMetres(drawn.wallB.max.y, heightM);

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

/**
 * The backsplash follows the room's wall A. It must not follow the records (they never reach a shell build) and
 * must not stay a literal 3.5 m, which only made sense while the drawn wall ran past the entered one.
 */
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

  /**
   * The run-end panel does vary with depth (0.6 at 600 mm, 0.7 at 700): it closes the run, which is the run's rule,
   * not the room's.
   */
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

  /** Non-vacuity for the sweep above: the panel's seat and visibility really are the records' to decide. */
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

/**
 * No transform, material, map or map repeat of any body may be attributable to the drawn room; the material and
 * map arm is the one a transform comparison cannot see.
 */
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

/**
 * `M.tile` also dresses the counter's `backsplash` and the open shelf's `back_panel`, so re-tiling it in place
 * would corrupt the customer's kitchen, and no fidelity gate looks at a texture repeat.
 */
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

/** Asserted on density, never on the repeat count: a count right for one room is the defect restated. */
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

/**
 * The four resized shell geometries are outside the kit's cache and owned set, so no existing teardown path frees
 * a replaced one.
 */
describe("the shell frees what it replaces", () => {
  it("disposes every geometry it replaces, exactly once", () => {
    const { kit, shell } = shellFor(SEEDED_ROOM);
    const replaced = resizedChildren(shell).map((mesh) =>
      spyOnDispose(mesh.geometry),
    );

    resizeShellToRoom({ kit, shell, room: roomOf(5000, 4000, 3000) });

    for (const dispose of replaced) expect(dispose).toHaveBeenCalledOnce();
  });

  /** Only the two tiled children carry a material of their own; the wall planes share the paint the builder cloned. */
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

/**
 * The redraw leaves the kitchen untouched down to object identity: an identical replacement geometry would still
 * re-upload every buffer on a handset, and leak if the old one were not freed.
 */
describe("redrawing the room leaves the kitchen standing in it alone", () => {
  it("keeps every mounted body's geometry and material as the same objects, undisposed", () => {
    const { kit, shell, solidsRoot } = mountedKitchenAt(SEEDED_ROOM);
    const before = bodyResourcesOf(solidsRoot);
    const disposals = before.flatMap((resource) => [
      spyOnDispose(resource.geometry),
      spyOnDispose(resource.material),
    ]);

    resizeShellToRoom({ kit, shell, room: roomOf(5000, 4000, 3000) });

    const after = bodyResourcesOf(solidsRoot);
    expect(after).toHaveLength(before.length);
    after.forEach((resource, index) => {
      const original = required(
        before[index],
        `body resource ${String(index)}`,
      );
      expect(resource.mesh, original.label).toBe(original.mesh);
      expect(resource.geometry, original.label).toBe(original.geometry);
      expect(resource.material, original.label).toBe(original.material);
    });
    for (const dispose of disposals) expect(dispose).not.toHaveBeenCalled();
  });

  // `buildFinishMaterial` clones `M.oak` and three's `Material.copy` assigns `map` by reference, so a wood finish
  // carries the kit's own `oakTex`, shared by every oak surface. The release must refuse a material it did not
  // clone, else it frees `oakTex` (black oak everywhere, nothing thrown). Staged on `floor`: the painted
  // `end_panel_right` is the one shell child the resize never touches.
  it("refuses to free the kit's wood texture when a derived finish is painted onto a shell child", () => {
    const { kit, shell } = shellFor(SEEDED_ROOM);
    const floor = meshNamed(shell, "floor");
    const woodFinish = deriveKitMaterial(kit.M, "a-wood-decor", () =>
      kit.M.oak.clone(),
    );
    floor.material = woodFinish;

    const oakTexture = required(mapOf(floor), "the wood finish's map");
    expect(oakTexture).toBe(kit.M.oak.map);
    const owned = kitOwnedResources(kit.M);
    expect(owned.textures.has(oakTexture)).toBe(true);
    const disposeTexture = spyOnDispose(oakTexture);
    const disposeMaterial = spyOnDispose(woodFinish);

    resizeShellToRoom({ kit, shell, room: roomOf(5000, 4000, 3000) });

    expect(disposeTexture).not.toHaveBeenCalled();
    expect(disposeMaterial).not.toHaveBeenCalled();
    expect(owned.textures.has(oakTexture)).toBe(true);
    expect(owned.materials.has(woodFinish)).toBe(true);
  });

  // A room equal by value but not by identity must redraw nothing: a save round-trip, re-hydrate or `structuredClone`
  // rebuilds `room`, and an identity check would turn every mutation into geometry rebuilds on a handset.
  it("redraws nothing for a room rebuilt from the same three numbers", () => {
    const { kit, shell } = shellFor(SEEDED_ROOM);
    const resized = resizedChildren(shell);
    const before = resized.map((mesh) => ({
      geometry: mesh.geometry,
      material: soleMaterialOf(mesh),
    }));
    const disposals = resized.flatMap((mesh) => [
      spyOnDispose(mesh.geometry),
      spyOnDispose(soleMaterialOf(mesh)),
    ]);

    resizeShellToRoom({ kit, shell, room: structuredClone(SEEDED_ROOM) });

    resizedChildren(shell).forEach((mesh, index) => {
      const original = required(before[index], `child ${String(index)}`);
      expect(mesh.geometry, mesh.name).toBe(original.geometry);
      expect(soleMaterialOf(mesh), mesh.name).toBe(original.material);
    });
    for (const dispose of disposals) expect(dispose).not.toHaveBeenCalled();
  });

  /** Non-vacuity: the guard above must not be answering "nothing ever redraws". */
  it("still redraws when one millimetre of the room changes", () => {
    const { kit, shell } = shellFor(SEEDED_ROOM);
    const floor = meshNamed(shell, "floor");
    const before = floor.geometry;

    resizeShellToRoom({
      kit,
      shell,
      room: { ...SEEDED_ROOM, widthMm: SEEDED_ROOM.widthMm + 1 },
    });

    expect(floor.geometry).not.toBe(before);
  });

  /** The one shell child whose buffer the kit's cache owns and shares. Replacing it would free a
   *  geometry other bodies of that size still render from. */
  it("never replaces the run-end panel's kit-owned geometry", () => {
    const { kit, shell } = shellFor(SEEDED_ROOM);
    const panel = meshNamed(shell, "end_panel_right");
    const geometry = panel.geometry;
    const dispose = spyOnDispose(geometry);

    resizeShellToRoom({ kit, shell, room: roomOf(5000, 4000, 3000) });

    expect(panel.geometry).toBe(geometry);
    expect(dispose).not.toHaveBeenCalled();
  });
});

/**
 * The drawn wall is the entered wall, so a body past its end is past the plane by construction. The seeded
 * records fit; `OVERFLOWING_KITCHEN_L_DESIGN` deliberately does not, and ADR 0065 marks such a body, not moves it.
 */
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

  /** The fixture's one marked body stands a millimetre past the end of wall B. */
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

/** The panel of a shell drawn at `drawnRoom`, seated by records standing in `recordRoom`: two rooms on purpose. */
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
  return { withShell: mountedKitchenAt(room, records).solidsRoot };
}

interface MountedKitchen extends BuiltShell {
  readonly solidsRoot: THREE.Group;
}

function mountedKitchenAt(
  room: DesignRoom,
  records: readonly PlacementRecord[] = SEEDED_RECORDS,
): MountedKitchen {
  const { kit, shell } = shellFor(room);
  const solidsRoot = new THREE.Group();
  solidsRoot.name = "solids";
  solidsRoot.add(shell);
  syncSolidBodies({ kit, solidsRoot, records, room });
  solidsRoot.updateWorldMatrix(true, true);
  return { kit, shell, solidsRoot };
}

interface BodyResource {
  /** Which mesh of which placement, for a failure that names itself. */
  readonly label: string;
  readonly mesh: THREE.Mesh;
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.Material;
}

function bodyResourcesOf(solidsRoot: THREE.Group): BodyResource[] {
  return placedBodies(solidsRoot).flatMap((body) => {
    const placementId = String(body.userData["placementId"]);
    const resources: BodyResource[] = [];
    body.traverse((node) => {
      if (!isMesh(node)) return;
      resources.push({
        label: `${placementId} > ${node.name}`,
        mesh: node,
        geometry: node.geometry,
        material: soleMaterialOf(node),
      });
    });
    return resources;
  });
}

/** Facts about a mounted body the shell must not touch, as plain values so the two sides can use different kits. */
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

/**
 * The four children the resize redraws; the run-end panel is absent because it is built through the kit's shared
 * geometry cache and nothing here may free it.
 */
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
