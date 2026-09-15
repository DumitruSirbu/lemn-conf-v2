// Wave 7H slice 1, criterion 2: the one test in this repository that watches the room shell.
//
// **Why it has to exist.** The M1 fidelity gate — `kitchen-parts.parity.test.ts` — calls
// `kit.builders["kitchen-l"]()` directly and never calls `buildKitchenShell`. Everything the shell
// does downstream of that builder is invisible to it, so without this file wave 7H could move the
// floor, re-tile it, or scale a wall plane and every gate in the repository would stay green.
//
// **What it is, and is not.** It is a measurement of what `HEAD` builds, recorded before anything
// moves, so that slice 2's change is visible and deliberate. It is **not** an image to preserve:
// Q7H-1 rules that the drawn shell becomes the room the customer entered, so at the seeded document
// it changes from 4200 x 3400 to 3560 x 2920 and loses its -0.3 m corner offsets. This table is
// re-baselined in the commit that lands slice 2, with the before-and-after values in the message.
//
// **The four numbers that live within 60 mm of each other at wall A's right-hand end**, measured
// here rather than carried over, because Q7H-4 rules the backsplash follows the room and the next
// reader will otherwise "make them consistent" and undo the ruling:
//
//   - the seeded base run ends at   3500 mm  (`RUN_END_PANEL_SEEDED_X_M` 3.51 minus
//                                             `RUN_END_PANEL_EDGE_OFFSET_M` 0.010)
//   - the run-end panel is seated at 3510 mm (`kitchen-parts.ts`'s `RUN_END_PANEL_SEEDED_X_M`)
//   - `backsplash_wall_a` spans       0 -> 3500 mm (width 3.5 centred at 1.75, so it starts at the
//                                             corner exactly)
//   - the seeded document's room is  3560 mm (`KITCHEN_L_DESIGN.room.widthMm`)
//
// Nothing reconciles them and nothing ever has. Q7H-4 rules the backsplash follows the **room**,
// not the run and not the records.
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
  CAMERA_PRESETS,
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

/** Measured at `HEAD`, 2026-09-16, by building the shell and reading the values back out.
 *
 *  The floor and both wall planes carry the corner overhang as a `-0.3 m` offset on each floor
 *  axis (`RW / 2 - 0.3`, `RD / 2 - 0.3`), so the drawn floor spans x in [-0.30, 3.90] and z in
 *  [-0.30, 3.10]. Q7H-2 keeps the 300 mm overhang and Q7H-1 takes the rest away. */
const SHELL_CHILDREN_AT_HEAD: readonly ShellChildFacts[] = [
  {
    name: "floor",
    geometryType: "BoxGeometry",
    geometryParameters: {
      width: 4.2,
      height: 0.04,
      depth: 3.4,
      widthSegments: 1,
      heightSegments: 1,
      depthSegments: 1,
    },
    geometryExtentM: [4.2, 0.04, 3.4],
    positionM: [1.8, -0.02, 1.4],
    rotationRad: [0, 0, 0],
    scale: [1, 1, 1],
    visible: true,
    materialName: "floor_oak",
    mapRepeat: [4, 4],
    geometryIsKitOwned: false,
    materialIsKitOwned: true,
    mapIsKitOwned: true,
  },
  {
    name: "wall_back",
    geometryType: "PlaneGeometry",
    geometryParameters: {
      width: 4.2,
      height: 2.6,
      widthSegments: 1,
      heightSegments: 1,
    },
    geometryExtentM: [4.2, 2.6, 0],
    positionM: [1.8, 1.3, 0],
    rotationRad: [0, 0, 0],
    scale: [1, 1, 1],
    visible: true,
    materialName: "wall_paint",
    mapRepeat: null,
    geometryIsKitOwned: false,
    // A clone of `M.wall`, so the kit's record does not claim it and both planes share the one
    // clone. Recorded because slice 2 must not turn that into a per-room allocation nobody frees.
    materialIsKitOwned: false,
    mapIsKitOwned: false,
  },
  {
    name: "wall_left",
    geometryType: "PlaneGeometry",
    geometryParameters: {
      width: 3.4,
      height: 2.6,
      widthSegments: 1,
      heightSegments: 1,
    },
    geometryExtentM: [3.4, 2.6, 0],
    positionM: [0, 1.3, 1.4],
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
    geometryExtentM: [0.018, 0.82, 0.6],
    // ADR 0045: `syncRunEndPanel` overwrites this x from `runEndPanelSeatM(records, room)` on every
    // sync. 3.51 is where an **unsynced** shell parks it, and the seat the seeded records produce.
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
      width: 3.5,
      height: 0.59,
      depth: 0.014,
      widthSegments: 1,
      heightSegments: 1,
      depthSegments: 1,
    },
    geometryExtentM: [3.5, 0.59, 0.014],
    positionM: [1.75, 1.155, 0.037],
    rotationRad: [0, 0, 0],
    scale: [1, 1, 1],
    visible: true,
    materialName: "backsplash_tile",
    // Six tiles across 3.5 m. `M.tile` also dresses the counter `backsplash` and the open shelf's
    // `back_panel`, so this repeat cannot be corrected in place without re-tiling two customer
    // bodies — Q7H-6 rules a per-mesh clone at constant world density instead.
    mapRepeat: [6, 1],
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
  shell = buildKitchenShell(kit);
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

  it("takes a kit and no room, which is what wave 7H changes", () => {
    expect(buildKitchenShell).toHaveLength(1);
  });
});

/** The mutation controls. Each applies one of the mechanisms wave 7H's own plan forbids, and pins
 *  **which** recorded facts that mechanism disturbs. A characterisation test nobody has watched
 *  fail is not a measurement, and three of these four failures move no transform at all. */
describe("the recorded facts are falsifiable", () => {
  it("catches a floor rebuilt for a different room", () => {
    const mutated = mutatedShell((built) => {
      const floor = asMesh(childNamed(built, "floor"));
      floor.geometry = new THREE.BoxGeometry(5.2, 0.04, 3.4);
    });

    expect(differingFieldsIn(mutated, "floor")).toEqual([
      "geometryExtentM[0]",
      "geometryParameters.width",
    ]);
  });

  it("catches a mesh scaled instead of rebuilt, which fact A.1 forbids", () => {
    const mutated = mutatedShell((built) => {
      childNamed(built, "floor").scale.x = 5.2 / 4.2;
    });

    expect(differingFieldsIn(mutated, "floor")).toEqual(["scale[0]"]);
  });

  it("catches a wall plane moved off the recorded corner offset", () => {
    const mutated = mutatedShell((built) => {
      childNamed(built, "wall_back").position.x = 2.1;
    });

    expect(differingFieldsIn(mutated, "wall_back")).toEqual(["positionM[0]"]);
  });

  it("catches the shared kit texture re-tiled in place, which Q7H-6 forbids", () => {
    const mutated = mutatedShell((built) => {
      const backsplash = asMesh(childNamed(built, "backsplash_wall_a"));
      mapOf(backsplash).repeat.set(3, 1);
    });

    expect(differingFieldsIn(mutated, "backsplash_wall_a")).toEqual([
      "mapRepeat[0]",
    ]);
  });
});

/** The three camera presets, recorded at the seeded room before slice 4 replaces them with
 *  `cameraPresetsForRoom(room)`.
 *
 *  **These three triples are not a fixed point slice 4 has to reproduce.** Q7H-5 withdraws that:
 *  they were framed on the old 4200 x 3400 shell under a framing rule Q7H-3 has replaced, so a
 *  function that is correct at the seeded room will almost certainly not return them. They stay as
 *  the recorded starting point and as the witness that the framing did not regress to today's. */
describe("the camera presets at the seeded room, as HEAD declares them", () => {
  const RECORDED_PRESETS = [
    { id: "overview", position: [4.3, 3.0, 5.3], target: [1.6, 1.35, 0.85] },
    { id: "wallA", position: [1.9, 2.1, 5.6], target: [1.7, 1.35, 0.45] },
    { id: "wallB", position: [5.4, 2.2, 2.3], target: [0.5, 1.35, 1.75] },
  ] as const;

  it("declares these three, under these ids, in this order", () => {
    expect(CAMERA_PRESETS.map((preset) => preset.id)).toEqual(
      RECORDED_PRESETS.map((preset) => preset.id),
    );
  });

  it.each(RECORDED_PRESETS)("$id stands where HEAD puts it", (recorded) => {
    const preset = findCameraPreset(recorded.id);

    expect([
      ...tupleDifferences("position", recorded.position, preset.position),
      ...tupleDifferences("target", recorded.target, preset.target),
    ]).toEqual([]);
  });

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

  it("is measuring the seeded room the presets were framed on", () => {
    expect(KITCHEN_L_DESIGN.room.widthMm).toBe(3560);
    expect(KITCHEN_L_DESIGN.room.depthMm).toBe(2920);
    expect(KITCHEN_L_DESIGN.room.heightMm).toBe(2600);
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
  const built = buildKitchenShell(throwawayKit);
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
