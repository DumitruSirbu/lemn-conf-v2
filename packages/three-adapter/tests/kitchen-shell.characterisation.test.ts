// Wave 7H, criterion 2: the one test in this repository that watches the room shell.
//
// **Why it has to exist.** The M1 fidelity gate — `kitchen-parts.parity.test.ts` — calls
// `kit.builders["kitchen-l"]()` directly and never calls `buildKitchenShell`. Everything the shell
// does downstream of that builder is invisible to it, so without this file the wave could move the
// floor, re-tile it, or scale a wall plane and every gate in the repository would stay green.
//
// **What it is, and is not.** It is a measurement, recorded so that a change to the shell is
// visible and deliberate. It is **not** an image to preserve. It was written in slice 1 against the
// fixed 4200 x 3400 x 2600 shell and **re-baselined in slice 2**, deliberately, because Q7H-1 rules
// that the drawn shell becomes the room the customer entered: at the seeded document the drawn
// floor goes from 4200 x 3400 to 3860 x 3220 and the backsplash from 3500 to 3560. A test asserting
// it did not would have been asserting the wrong thing. When a pin here goes red the question is
// *"is this the change I intended, and is it right"* — never *"how do I update the pin."*
//
// **The four numbers that live within 60 mm of each other at wall A's right-hand end**, measured
// here rather than carried over, because Q7H-4 rules the backsplash follows the room and the next
// reader will otherwise "make them consistent" and undo the ruling:
//
//   - the seeded base run ends at   3500 mm  (`RUN_END_PANEL_SEEDED_X_M` 3.51 minus
//                                             `RUN_END_PANEL_EDGE_OFFSET_M` 0.010)
//   - the run-end panel is seated at 3510 mm (`kitchen-parts.ts`'s `RUN_END_PANEL_SEEDED_X_M`)
//   - the seeded document's room is  3560 mm (`KITCHEN_L_DESIGN.room.widthMm`)
//   - `backsplash_wall_a` spanned     0 -> 3500 mm before this wave and spans 0 -> 3560 after it
//
// Nothing reconciles the first three and nothing ever has. Q7H-4 rules the backsplash follows the
// **room**, not the run and not the records, which is why the fourth is the one that moved.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import {
  kitOwnedResources,
  type KitOwnedResources,
} from "../src/kit-ownership.js";
import { buildKitchenShell } from "../src/kitchen-shell.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import {
  CAMERA_FIELD_OF_VIEW_DEGREES,
  findCameraPreset,
  type CameraPresetId,
} from "../src/stage.js";
import { isMesh, isTexture, toMaterials } from "../src/three-guards.js";
import { createHeadlessCanvas } from "./support/headless-canvas.js";

/** M1's fidelity tolerance, reused here so the shell is held to the same millimetre-free standard
 *  as the bodies the parity gate diffs. */
const SHELL_FIDELITY_EPSILON_M = 1e-6;

/** The viewport of the mobile gate, and the one backlog 16's framing failure was measured in. */
const MOBILE_VIEWPORT = { width: 390, height: 844 };

/** Everything criterion 2 records about one shell child. `mapRepeat` and the three ownership flags
 *  are the amendment fact B forced: a shared-texture re-tile moves no transform and changes two
 *  customer bodies, so a table of transforms alone cannot see it. */
interface ShellChildFacts {
  readonly name: string;
  readonly geometryType: string;
  /** The geometry's numeric constructor parameters. `ExtrudeGeometry` declares none — it carries a
   *  shape and an options object — so the run-end panel's size is pinned by `geometryExtentM`. */
  readonly geometryParameters: Readonly<Record<string, number>>;
  readonly geometryExtentM: readonly [number, number, number];
  readonly positionM: readonly [number, number, number];
  readonly rotationRad: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly visible: boolean;
  readonly materialName: string;
  /** `null` when the material samples no map at all, which is how `wall_paint` reads. */
  readonly mapRepeat: readonly [number, number] | null;
  /** Whether the kit's ownership record claims this resource. False means the teardown frees it
   *  only by finding it still attached to `stage.room` (`kit-disposal.ts`), which is why a
   *  *replaced* shell geometry would be freed by nobody. */
  readonly geometryIsKitOwned: boolean;
  readonly materialIsKitOwned: boolean;
  /** False both for an unowned map and for no map; `mapRepeat` distinguishes the two. */
  readonly mapIsKitOwned: boolean;
}

/** Measured at the seeded room — 3560 x 2920 x 2600 — by building the shell and reading the values
 *  back out. Re-baselined 2026-09-16 in the commit that made the drawn wall the entered wall.
 *
 *  The floor and both wall planes keep the 300 mm corner overhang and lose everything else: each
 *  runs from one overhang behind the corner to the end of the wall the customer entered, so the
 *  drawn floor spans x in [-0.30, 3.56] and z in [-0.30, 2.92]. Before this wave they spanned
 *  [-0.30, 3.90] and [-0.30, 3.10], from a builder that knew one L-shape. Q7H-2 keeps the overhang
 *  fixed and named; Q7H-1 takes the rest away. */
const SHELL_CHILDREN_AT_HEAD: readonly ShellChildFacts[] = [
  {
    name: "floor",
    geometryType: "BoxGeometry",
    geometryParameters: {
      // 3560 + 300 overhang, and 2920 + 300. Was 4.2 x 3.4.
      width: 3.86,
      height: 0.04,
      depth: 3.22,
      widthSegments: 1,
      heightSegments: 1,
      depthSegments: 1,
    },
    geometryExtentM: [3.86, 0.04, 3.22],
    // Was [1.8, -0.02, 1.4]. The slab's y is not a room dimension and did not move.
    positionM: [1.63, -0.02, 1.31],
    rotationRad: [0, 0, 0],
    scale: [1, 1, 1],
    visible: true,
    materialName: "floor_oak",
    // Was [4, 4] across a 4.2 x 3.4 floor, i.e. a plank of 1.05 x 0.85 m. The repeat now carries
    // that same plank across a smaller floor: 4 x 3.86/4.2 and 4 x 3.22/3.4.
    mapRepeat: [3.676190476190476, 3.788235294117647],
    geometryIsKitOwned: false,
    materialIsKitOwned: true,
    mapIsKitOwned: true,
  },
  {
    name: "wall_back",
    geometryType: "PlaneGeometry",
    geometryParameters: {
      // Was 4.2. The height follows `heightMm` and the seeded room's 2600 is what it already was.
      width: 3.86,
      height: 2.6,
      widthSegments: 1,
      heightSegments: 1,
    },
    geometryExtentM: [3.86, 2.6, 0],
    positionM: [1.63, 1.3, 0], // was [1.8, 1.3, 0]
    rotationRad: [0, 0, 0],
    scale: [1, 1, 1],
    visible: true,
    materialName: "wall_paint",
    mapRepeat: null,
    geometryIsKitOwned: false,
    // A clone of `M.wall`, so the kit's record does not claim it and both planes share the one
    // clone. Recorded because this wave must not turn that into a per-room allocation nobody frees
    // — and it did not: the planes carry no map, so the resize leaves their material alone.
    materialIsKitOwned: false,
    mapIsKitOwned: false,
  },
  {
    name: "wall_left",
    geometryType: "PlaneGeometry",
    geometryParameters: {
      // Rotated to face +X, so its geometry width is the world's z: 2920 + 300. Was 3.4.
      width: 3.22,
      height: 2.6,
      widthSegments: 1,
      heightSegments: 1,
    },
    geometryExtentM: [3.22, 2.6, 0],
    positionM: [0, 1.3, 1.31], // was [0, 1.3, 1.4]
    rotationRad: [0, Math.PI / 2, 0],
    scale: [1, 1, 1],
    visible: true,
    materialName: "wall_paint",
    mapRepeat: null,
    geometryIsKitOwned: false,
    materialIsKitOwned: false,
    mapIsKitOwned: false,
  },
  {
    name: "end_panel_right",
    geometryType: "ExtrudeGeometry",
    geometryParameters: {},
    // **Every value in this entry is unchanged by the wave, and that is the assertion.** ADR 0045
    // makes the panel a function of the records; the shell's new extent must reach it nowhere.
    geometryExtentM: [0.018, 0.82, 0.6],
    // `syncRunEndPanel` overwrites this x from `runEndPanelSeatM(records, room)` on every sync.
    // 3.51 is where an **unsynced** shell parks it, and the seat the seeded records produce.
    positionM: [3.51, 0.41, 0.29],
    rotationRad: [0, 0, 0],
    scale: [1, 1, 1],
    visible: true,
    materialName: "oak",
    mapRepeat: [1, 1],
    // The only shell geometry the kit owns: it comes from `chamferBox`, which memoises by size and
    // registers what it hands out, so two bodies of this size render from this one buffer.
    geometryIsKitOwned: true,
    materialIsKitOwned: true,
    mapIsKitOwned: true,
  },
  {
    name: "backsplash_wall_a",
    geometryType: "BoxGeometry",
    geometryParameters: {
      // Q7H-4: the room's wall A, with the start pinned at the corner — so no overhang, unlike the
      // floor and the planes. Was 3.5, the run's extent rather than the room's.
      width: 3.56,
      height: 0.59,
      depth: 0.014,
      widthSegments: 1,
      heightSegments: 1,
      depthSegments: 1,
    },
    geometryExtentM: [3.56, 0.59, 0.014],
    positionM: [1.78, 1.155, 0.037], // was [1.75, ...]: half the width, so x still starts at 0
    rotationRad: [0, 0, 0],
    scale: [1, 1, 1],
    visible: true,
    materialName: "backsplash_tile",
    // Was six tiles across 3.5 m, i.e. a tile 583 mm wide; now 6 x 3.56/3.5 across 3.56 m, which is
    // the same tile. `M.tile` also dresses the counter `backsplash` and the open shelf's
    // `back_panel`, so this repeat cannot be corrected in place without re-tiling two customer
    // bodies — Q7H-6 rules a per-mesh clone at constant world density, and this mesh now carries
    // its own map. The clone is registered, which is what `mapIsKitOwned` still being true says.
    mapRepeat: [6.102857142857143, 1],
    geometryIsKitOwned: false,
    materialIsKitOwned: true,
    mapIsKitOwned: true,
  },
];

const SHELL_CHILD_NAMES = SHELL_CHILDREN_AT_HEAD.map((child) => child.name);

let kit: Kit;
let shell: THREE.Group;

beforeAll(() => {
  kit = makeKit({ createCanvas: createHeadlessCanvas });
  shell = buildKitchenShell(kit, KITCHEN_L_DESIGN.room);
});

describe("the room shell, as HEAD builds it", () => {
  it("has exactly the five children this table describes, in this order", () => {
    expect(shell.children.map((child) => child.name)).toEqual(
      SHELL_CHILD_NAMES,
    );
  });

  it.each(SHELL_CHILDREN_AT_HEAD)(
    "$name is built at the recorded geometry, transform, material and tiling",
    (recorded) => {
      const built = characteriseShellChild(
        childNamed(shell, recorded.name),
        kitOwnedResources(kit.M),
      );

      expect(differencesFrom(recorded, built)).toEqual([]);
    },
  );

  it("takes the room, so no caller can build a shell without naming one", () => {
    expect(buildKitchenShell).toHaveLength(2);
  });
});

/** The mutation controls. Each applies one of the mechanisms wave 7H's own plan forbids, and pins
 *  **which** recorded facts that mechanism disturbs. A characterisation test nobody has watched
 *  fail is not a measurement, and three of these four failures move no transform at all. */
describe("the recorded facts are falsifiable", () => {
  it("catches a floor drawn for a different room", () => {
    const mutated = mutatedShell((built) => {
      const floor = asMesh(childNamed(built, "floor"));
      floor.geometry = new THREE.BoxGeometry(4.86, 0.04, 3.22);
    });

    expect(differingFieldsIn(mutated, "floor")).toEqual([
      "geometryExtentM[0]",
      "geometryParameters.width",
    ]);
  });

  it("catches a mesh scaled instead of rebuilt, which fact A.1 forbids", () => {
    const mutated = mutatedShell((built) => {
      childNamed(built, "floor").scale.x = 4.86 / 3.86;
    });

    expect(differingFieldsIn(mutated, "floor")).toEqual(["scale[0]"]);
  });

  it("catches a wall plane moved off the recorded corner offset", () => {
    const mutated = mutatedShell((built) => {
      childNamed(built, "wall_back").position.x = 1.93;
    });

    expect(differingFieldsIn(mutated, "wall_back")).toEqual(["positionM[0]"]);
  });

  it("catches a backsplash re-tiled off its constant world density", () => {
    const mutated = mutatedShell((built) => {
      const backsplash = asMesh(childNamed(built, "backsplash_wall_a"));
      mapOf(backsplash).repeat.set(6, 1);
    });

    expect(differingFieldsIn(mutated, "backsplash_wall_a")).toEqual([
      "mapRepeat[0]",
    ]);
  });

  /** The re-tile above is only evidence that this pin has teeth if the map it moved is the shell's
   *  own. Left as its own case because *"we corrected the shell's repeat and the open shelf
   *  changed"* is the failure Q7H-6 names, and it moves no transform. */
  it("re-tiles a map no customer body renders from", () => {
    const throwawayKit = makeKit({ createCanvas: createHeadlessCanvas });
    const built = buildKitchenShell(throwawayKit, KITCHEN_L_DESIGN.room);
    const backsplash = asMesh(childNamed(built, "backsplash_wall_a"));

    expect(soleMaterialOf(backsplash)).not.toBe(throwawayKit.M.tile);
    expect(mapOf(backsplash)).not.toBe(throwawayKit.M.tile.map);
    expect(throwawayKit.M.tile.map?.repeat.toArray()).toEqual([6, 1]);
  });
});

/** The reference presets' own framing of the seeded room. The three triples themselves are pinned by
 *  `qa-7h-preset-stands-clear.adversarial.test.ts`. */
describe("the camera presets at the seeded room, as HEAD declares them", () => {
  /** Backlog 16, reproduced by measurement rather than transcribed. The entry records *"x ~ 514 of
   *  a 390 px viewport"* from a browser session on 2026-09-01; projecting the panel's world box
   *  under the same preset and viewport puts its **nearest corner** at 514.9 px, which is the point
   *  that reading measured. The box centre is at 535.4 px and the far corner at 558.7 px.
   *
   *  Pinned as today's framing so slice 5 has a falsification case: a preset that still puts the
   *  run end past the right edge turns criterion 12 red instead of passing unnoticed. */
  it("puts the run end off the right edge under Perete A, which backlog 16 recorded", () => {
    const panelX = projectedPanelXAtMobile("wallA");

    expect(panelX.nearestCorner).toBeCloseTo(514.9, 1);
    expect(panelX.centre).toBeCloseTo(535.4, 1);
    expect(panelX.nearestCorner).toBeGreaterThan(MOBILE_VIEWPORT.width);
  });
});

/** `owned` is the ownership record of the kit that **built** this child, never the suite's: a
 *  mutation control builds from its own kit, and a flag must not go red merely because the kit is a
 *  different object. */
function characteriseShellChild(
  child: THREE.Object3D,
  owned: KitOwnedResources,
): ShellChildFacts {
  const mesh = asMesh(child);
  const material = soleMaterialOf(mesh);
  const map = optionalMapOf(material);
  return {
    name: mesh.name,
    geometryType: mesh.geometry.type,
    geometryParameters: numericParametersOf(mesh.geometry),
    geometryExtentM: extentOf(mesh.geometry),
    positionM: [mesh.position.x, mesh.position.y, mesh.position.z],
    rotationRad: [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z],
    scale: [mesh.scale.x, mesh.scale.y, mesh.scale.z],
    visible: mesh.visible,
    materialName: material.name,
    mapRepeat: map ? [map.repeat.x, map.repeat.y] : null,
    geometryIsKitOwned: owned.geometries.has(mesh.geometry),
    materialIsKitOwned: owned.materials.has(material),
    mapIsKitOwned: map ? owned.textures.has(map) : false,
  };
}

interface FactDifference {
  readonly field: string;
  readonly detail: string;
}

function differencesFrom(
  recorded: ShellChildFacts,
  built: ShellChildFacts,
): FactDifference[] {
  return [
    ...exactDifferences(recorded, built),
    ...tupleDifferences("positionM", recorded.positionM, built.positionM),
    ...tupleDifferences("rotationRad", recorded.rotationRad, built.rotationRad),
    ...tupleDifferences("scale", recorded.scale, built.scale),
    ...tupleDifferences(
      "geometryExtentM",
      recorded.geometryExtentM,
      built.geometryExtentM,
    ),
    ...namedNumberDifferences(
      "geometryParameters",
      recorded.geometryParameters,
      built.geometryParameters,
    ),
    ...mapRepeatDifferences(recorded.mapRepeat, built.mapRepeat),
  ];
}

const EXACTLY_COMPARED_FIELDS = [
  "name",
  "geometryType",
  "visible",
  "materialName",
  "geometryIsKitOwned",
  "materialIsKitOwned",
  "mapIsKitOwned",
] as const;

function exactDifferences(
  recorded: ShellChildFacts,
  built: ShellChildFacts,
): FactDifference[] {
  return EXACTLY_COMPARED_FIELDS.filter(
    (field) => recorded[field] !== built[field],
  ).map((field) => ({
    field,
    detail: `${field}: recorded ${String(recorded[field])}, built ${String(built[field])}`,
  }));
}

function tupleDifferences(
  label: string,
  recorded: readonly number[],
  built: readonly number[],
): FactDifference[] {
  if (recorded.length !== built.length) {
    return [
      {
        field: label,
        detail: `${label}: recorded ${String(recorded.length)} values, built ${String(built.length)}`,
      },
    ];
  }
  return recorded.flatMap((value, index) =>
    scalarDifference(`${label}[${String(index)}]`, value, built[index] ?? NaN),
  );
}

function namedNumberDifferences(
  label: string,
  recorded: Readonly<Record<string, number>>,
  built: Readonly<Record<string, number>>,
): FactDifference[] {
  const keys = [
    ...new Set([...Object.keys(recorded), ...Object.keys(built)]),
  ].sort();
  return keys.flatMap((key) => {
    const field = `${label}.${key}`;
    if (!(key in recorded) || !(key in built)) {
      return [{ field, detail: `${field}: present on only one side` }];
    }
    return scalarDifference(field, recorded[key] ?? NaN, built[key] ?? NaN);
  });
}

function mapRepeatDifferences(
  recorded: readonly [number, number] | null,
  built: readonly [number, number] | null,
): FactDifference[] {
  if (recorded === null || built === null) {
    return recorded === built
      ? []
      : [
          {
            field: "mapRepeat",
            detail: `mapRepeat: recorded ${recorded ? "a map" : "no map"}, built ${built ? "a map" : "no map"}`,
          },
        ];
  }
  return tupleDifferences("mapRepeat", recorded, built);
}

function scalarDifference(
  field: string,
  recorded: number,
  built: number,
): FactDifference[] {
  if (Math.abs(recorded - built) <= SHELL_FIDELITY_EPSILON_M) return [];
  return [
    {
      field,
      detail: `${field}: recorded ${String(recorded)}, built ${String(built)}`,
    },
  ];
}

interface MutatedShell {
  readonly shell: THREE.Group;
  readonly owned: KitOwnedResources;
}

/** A shell built from its own kit and then deliberately broken, so a mutation that reaches a
 *  kit-owned resource — the re-tile below does — cannot escape into the suite's shared kit. */
function mutatedShell(breakIt: (built: THREE.Group) => void): MutatedShell {
  const throwawayKit = makeKit({ createCanvas: createHeadlessCanvas });
  const built = buildKitchenShell(throwawayKit, KITCHEN_L_DESIGN.room);
  breakIt(built);
  return { shell: built, owned: kitOwnedResources(throwawayKit.M) };
}

/** The recorded facts a mutated child no longer satisfies, named. */
function differingFieldsIn(mutated: MutatedShell, name: string): string[] {
  const recorded = SHELL_CHILDREN_AT_HEAD.find((child) => child.name === name);
  if (!recorded) throw new Error(`No recorded child named ${name}`);
  const built = characteriseShellChild(
    childNamed(mutated.shell, name),
    mutated.owned,
  );
  return differencesFrom(recorded, built).map((difference) => difference.field);
}

interface ProjectedPanelX {
  readonly nearestCorner: number;
  readonly centre: number;
}

function projectedPanelXAtMobile(id: CameraPresetId): ProjectedPanelX {
  const preset = findCameraPreset(id);
  const camera = new THREE.PerspectiveCamera(
    CAMERA_FIELD_OF_VIEW_DEGREES,
    MOBILE_VIEWPORT.width / MOBILE_VIEWPORT.height,
    0.01,
    500,
  );
  camera.position.set(...preset.position);
  camera.lookAt(new THREE.Vector3(...preset.target));
  camera.updateMatrixWorld();

  shell.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(
    childNamed(shell, "end_panel_right"),
  );
  const xs = boxCorners(box).map((corner) => toPixelX(corner, camera));
  return {
    nearestCorner: Math.min(...xs),
    centre: toPixelX(box.getCenter(new THREE.Vector3()), camera),
  };
}

function boxCorners(box: THREE.Box3): THREE.Vector3[] {
  const corners: THREE.Vector3[] = [];
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        corners.push(new THREE.Vector3(x, y, z));
      }
    }
  }
  return corners;
}

function toPixelX(point: THREE.Vector3, camera: THREE.PerspectiveCamera) {
  return ((point.clone().project(camera).x + 1) / 2) * MOBILE_VIEWPORT.width;
}

function childNamed(root: THREE.Group, name: string): THREE.Object3D {
  const child = root.children.find((candidate) => candidate.name === name);
  if (!child) throw new Error(`No shell child named ${name}`);
  return child;
}

function asMesh(object: THREE.Object3D): THREE.Mesh {
  if (!isMesh(object)) throw new Error(`${object.name} is not a mesh`);
  return object;
}

function soleMaterialOf(mesh: THREE.Mesh): THREE.Material {
  const materials = toMaterials(mesh.material);
  const material = materials[0];
  if (materials.length !== 1 || !material) {
    throw new Error(`${mesh.name} has ${String(materials.length)} materials`);
  }
  return material;
}

function mapOf(mesh: THREE.Mesh): THREE.Texture {
  const map = optionalMapOf(soleMaterialOf(mesh));
  if (!map) throw new Error(`${mesh.name}'s material samples no map`);
  return map;
}

function optionalMapOf(material: THREE.Material): THREE.Texture | undefined {
  const map: unknown = (material as { map?: unknown }).map;
  return isTexture(map) ? map : undefined;
}

function numericParametersOf(
  geometry: THREE.BufferGeometry,
): Record<string, number> {
  const parameters: unknown = (geometry as { parameters?: unknown }).parameters;
  if (typeof parameters !== "object" || parameters === null) return {};
  return Object.fromEntries(
    Object.entries(parameters).filter(
      ([, value]) => typeof value === "number",
    ) as [string, number][],
  );
}

/** The geometry's own bounding extent, which is how a chamfered `ExtrudeGeometry` is measured: it
 *  declares no numeric constructor parameters to read. Float32 attributes put it within about
 *  2e-7 m of nominal, comfortably inside the 1e-6 m tolerance. */
function extentOf(geometry: THREE.BufferGeometry): [number, number, number] {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) throw new Error("Geometry has no computable bounding box");
  return [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z];
}
