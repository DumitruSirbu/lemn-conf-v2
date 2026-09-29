// SCENE-002. React Three Fiber never disposes a `<primitive>`, so the stage's own teardown is the
// only thing standing between a client-side remount and a stranded room's worth of GPU buffers.
//
// The assertions below are all about *ownership*, because that is where a wrong fix does the
// damage: a kit's `chamferBox` geometries and `kit.M` materials are shared by the shell, every
// mounted body and the reference room, and disposing one a live object still renders from produces
// a black or invisible object rather than an error. So a whole-stage teardown must free the shared
// resources exactly once, and the shell's partial teardown must free none of them at all.
import {
  derivePlacementRecords,
  freeColourFinish,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  type VoidRecord,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { applyBlackHandleMaterial } from "../src/decomposed-bodies.js";
import { applyFinish, collectFronts } from "../src/finishes.js";

/** The finish this file dresses a front in. Any one would do — it is the derived material's
 *  lifetime under test, not its colour — and *Salvie* is the one it has used since M4, reached by
 *  the free colour wave 6P mapped it to. */
const SAGE = freeColourFinish("#8d9a84");
import {
  disposeKit,
  disposeKitAndStage,
  type KitStage,
} from "../src/kit-disposal.js";
import { kitOwnedResources } from "../src/kit-ownership.js";
import { buildKitchenShell } from "../src/kitchen-shell.js";
import { kitMaterialList, makeKit, type Kit } from "../src/kitchen-parts.js";
import { syncSolidBodies, syncVoidMeshes } from "../src/scene-sync.js";
import {
  createContactBlob,
  createLightRig,
  createShadowGround,
} from "../src/stage.js";
import { isLine, isMesh, isTexture } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { required } from "./support/required.js";

const SEEDED_RECORDS = derivePlacementRecords(
  KITCHEN_L_DESIGN,
  KITCHEN_L_BODY_CATALOG,
);

const SHELL_CHILD_NAMES = new Set([
  "floor",
  "wall_back",
  "wall_left",
  "end_panel_right",
  "backsplash_wall_a",
]);

const MOUNTED_VOID: VoidRecord = {
  id: "A|1.30:v0:0.00",
  col: "A|1.30",
  wall: "A",
  x: 1.3,
  z: 0.3,
  ry: 0,
  w: 0.6,
  d: 0.56,
  y0: 0,
  h: 0.86,
  spanY0: 0,
  spanH: 0.86,
};

beforeAll(() => {
  installHeadlessDocument();
});

/** A disposable three.js resource, as far as this suite is concerned. */
interface Disposable {
  dispose: () => void;
}

type DisposeSpy = ReturnType<typeof vi.spyOn>;

/** Gathered independently of `gpu-resources.ts` on purpose: a suite that collected the resources
 *  with the same code under test would agree with any mistake that code makes. */
function reachableResources(...roots: readonly THREE.Object3D[]): Disposable[] {
  const found = new Set<Disposable>();
  for (const root of roots) {
    root.traverse((node) => {
      if (!isMesh(node) && !isLine(node)) return;
      found.add(node.geometry);
      for (const material of materialsOf(node)) {
        found.add(material);
        for (const texture of texturesOf(material)) found.add(texture);
      }
    });
  }
  return [...found];
}

function materialsOf(node: THREE.Mesh | THREE.Line): readonly THREE.Material[] {
  return Array.isArray(node.material) ? node.material : [node.material];
}

function spyOnDisposals(
  resources: readonly Disposable[],
): Map<Disposable, DisposeSpy> {
  const spies = new Map<Disposable, DisposeSpy>();
  for (const resource of resources) {
    spies.set(resource, vi.spyOn(resource, "dispose"));
  }
  return spies;
}

function expectDisposedOnce(spies: Map<Disposable, DisposeSpy>): void {
  for (const [resource, spy] of spies) {
    expect(spy, describeResource(resource)).toHaveBeenCalledTimes(1);
  }
}

function describeResource(resource: Disposable): string {
  const named = resource as { type?: string; name?: string };
  return `${named.type ?? "resource"} "${named.name ?? ""}"`;
}

interface MountedStage extends KitStage {
  readonly room: THREE.Group;
  readonly solidsRoot: THREE.Group;
}

/** The same graph `kitchen-stage.tsx` builds in its mount-lifetime `useMemo`. */
function mountStage(kit: Kit): MountedStage {
  const solidsRoot = new THREE.Group();
  solidsRoot.name = "solids";
  solidsRoot.add(buildKitchenShell(kit, KITCHEN_L_DESIGN.room));

  const voidsRoot = new THREE.Group();
  voidsRoot.name = "voids";

  const room = new THREE.Group();
  room.name = "kitchen_l_shape";
  room.add(solidsRoot, voidsRoot);

  syncSolidBodies({
    kit,
    solidsRoot,
    records: SEEDED_RECORDS,
    room: KITCHEN_L_DESIGN.room,
  });
  syncVoidMeshes({
    voidsRoot,
    voids: [MOUNTED_VOID],
    room: KITCHEN_L_DESIGN.room,
  });

  return {
    kit,
    room,
    solidsRoot,
    lights: createLightRig(),
    ground: createShadowGround(),
    blob: createContactBlob(createHeadlessCanvas),
  };
}

function newKit(): Kit {
  return makeKit({ createCanvas: createHeadlessCanvas });
}

function isKitOwned(resource: Disposable, kit: Kit): boolean {
  if (isGeometry(resource)) return kit.ownsGeometry(resource);
  if (isMaterial(resource)) return kitMaterialList(kit.M).includes(resource);
  return true;
}

/** Narrowed here rather than inline for the reason `three-guards.ts` gives: three.js declares these
 *  classes with `any`-parameterised generics, so a bare `instanceof` narrows to nothing useful. */
function isGeometry(resource: Disposable): resource is THREE.BufferGeometry {
  return resource instanceof THREE.BufferGeometry;
}

function isMaterial(resource: Disposable): resource is THREE.Material {
  return resource instanceof THREE.Material;
}

function texturesOf(material: THREE.Material): THREE.Texture[] {
  const textures: THREE.Texture[] = [];
  for (const slot of Object.values(
    material as unknown as Record<string, unknown>,
  )) {
    if (isTexture(slot)) textures.push(slot);
  }
  return textures;
}

describe("disposeKitAndStage", () => {
  it("disposes every resource the mounted stage reaches exactly once", () => {
    const stage = mountStage(newKit());
    const resources = reachableResources(stage.room, stage.ground, stage.blob);
    const spies = spyOnDisposals(resources);

    disposeKitAndStage(stage);

    expect(resources.length).toBeGreaterThan(50);
    expectDisposedOnce(spies);
  });

  it("disposes a geometry many meshes share once, not once per mesh", () => {
    const stage = mountStage(newKit());
    const meshesPerGeometry = new Map<THREE.BufferGeometry, number>();
    stage.room.traverse((node) => {
      if (!isMesh(node)) return;
      const seen = meshesPerGeometry.get(node.geometry) ?? 0;
      meshesPerGeometry.set(node.geometry, seen + 1);
    });
    const shared = [...meshesPerGeometry]
      .filter(([, meshes]) => meshes > 1)
      .map(([geometry]) => geometry);
    const spies = spyOnDisposals(shared);

    disposeKitAndStage(stage);

    expect(shared.length).toBeGreaterThan(0);
    expectDisposedOnce(spies);
  });

  it("disposes the kit's own materials and the canvas textures they sample", () => {
    const kit = newKit();
    const stage = mountStage(kit);
    const materials = kitMaterialList(kit.M);
    const textures = materials.flatMap(texturesOf);
    const spies = spyOnDisposals([...materials, ...textures]);

    disposeKitAndStage(stage);

    expect(textures.length).toBeGreaterThan(0);
    expectDisposedOnce(spies);
  });

  it("disposes the materials derived from the kit — a finish and the black handle", () => {
    const kit = newKit();
    const stage = mountStage(kit);
    applyFinish(collectFronts(stage.room), kit.M, SAGE);
    applyBlackHandleMaterial(stage.room, kit.M);
    const derived = [
      soleMaterialOf(required(collectFronts(stage.room)[0], "a front mesh")),
      soleMaterialOf(firstMeshNamed(stage.room, "handle")),
    ];
    const spies = spyOnDisposals(derived);

    disposeKitAndStage(stage);

    expect(new Set(derived).size).toBe(2);
    expect(kitMaterialList(kit.M)).not.toContain(derived[0]);
    expect(kitMaterialList(kit.M)).not.toContain(derived[1]);
    expectDisposedOnce(spies);
  });

  it("disposes the light rig, whose shadow map nothing else frees", () => {
    const stage = mountStage(newKit());
    const spies = spyOnDisposals([
      stage.lights.hemisphere,
      stage.lights.key,
      stage.lights.fill,
    ]);

    disposeKitAndStage(stage);

    expectDisposedOnce(spies);
  });

  it("touches nothing belonging to another kit's live scene", () => {
    const survivingKit = newKit();
    const surviving = mountStage(survivingKit);
    const spies = spyOnDisposals([
      ...reachableResources(surviving.room, surviving.ground, surviving.blob),
      ...kitMaterialList(survivingKit.M),
    ]);

    disposeKitAndStage(mountStage(newKit()));

    expect(spies.size).toBeGreaterThan(50);
    for (const [resource, spy] of spies) {
      expect(spy, describeResource(resource)).not.toHaveBeenCalled();
    }
  });

  it("hands out a fresh finish material after a teardown, never the disposed one", () => {
    const kit = newKit();
    const stage = mountStage(kit);
    const front = required(collectFronts(stage.room)[0], "a front mesh");
    applyFinish([front], kit.M, SAGE);
    const disposedFinish = front.material;

    disposeKitAndStage(stage);
    applyFinish([front], kit.M, SAGE);

    expect(front.material).not.toBe(disposedFinish);
  });
});

function soleMaterialOf(mesh: THREE.Mesh): THREE.Material {
  const materials = materialsOf(mesh);
  expect(materials, `${mesh.name} carries a material array`).toHaveLength(1);
  return required(materials[0], `${mesh.name}'s material`);
}

function firstMeshNamed(root: THREE.Object3D, fragment: string): THREE.Mesh {
  const found: THREE.Mesh[] = [];
  root.traverse((node) => {
    if (isMesh(node) && node.name.includes(fragment)) found.push(node);
  });
  return required(found[0], `a mesh named "${fragment}"`);
}

describe("a kit released by its stage's teardown", () => {
  it("answers ownership from one record, so cache and registry cannot disagree", () => {
    const kit = newKit();
    const stage = mountStage(kit);
    const cached = [...kitOwnedResources(kit.M).geometries];

    disposeKitAndStage(stage);

    // Pre-fix the release deleted the registry entry while `makeKit`'s closure kept the filled one:
    // the registry said "owns nothing" and the kit said "mine" about the same buffer.
    expect(cached.length).toBeGreaterThan(50);
    expect(kitOwnedResources(kit.M).geometries.size).toBe(0);
    for (const geometry of cached) {
      expect(kit.ownsGeometry(geometry)).toBe(
        kitOwnedResources(kit.M).geometries.has(geometry),
      );
    }
  });

  it("refuses to strip another reference room instead of freeing its shared buffers", () => {
    const kit = newKit();
    const stage = mountStage(kit);
    const cached = [...kitOwnedResources(kit.M).geometries];
    disposeKitAndStage(stage);
    const spies = spyOnDisposals(cached);

    expect(() => buildKitchenShell(kit, KITCHEN_L_DESIGN.room)).toThrow(
      /released/,
    );

    for (const [resource, spy] of spies) {
      expect(spy, describeResource(resource)).not.toHaveBeenCalled();
    }
  });

  it("treats a replayed teardown as a no-op, the way StrictMode replays one", () => {
    const stage = mountStage(newKit());
    const resources = reachableResources(stage.room, stage.ground, stage.blob);
    const spies = spyOnDisposals(resources);

    disposeKitAndStage(stage);
    disposeKitAndStage(stage);

    expectDisposedOnce(spies);
  });
});

describe("disposeKit, handed a kit whose room was never built", () => {
  it("frees everything makeKit allocated and marks the kit released", () => {
    const kit = newKit();
    // The geometry cache of a kit that has built nothing is empty, so what a roomless kit is holding
    // is its materials and the canvas textures they baked — which is the memory the defect this
    // covers stranded on a low-end phone.
    const materials = kitMaterialList(kit.M);
    const textures = materials.flatMap((material) => texturesOf(material));
    const spies = spyOnDisposals([...materials, ...textures]);

    // A `BodyProbeFactory` allocates the kit first and builds its room second (M7 wave 7F4a), so a
    // builder that throws leaves this exact state: a fully baked kit and no room at all. Without
    // this arm there was no call that could free it.
    disposeKit(kit);

    expect(materials.length).toBeGreaterThan(5);
    expect(textures.length).toBeGreaterThan(0);
    expectDisposedOnce(spies);
    expect(kitOwnedResources(kit.M).isReleased).toBe(true);
  });

  it("still frees the room's own resources when it is given one", () => {
    const kit = newKit();
    const room = kit.builders["kitchen-l"]();
    const spies = spyOnDisposals(reachableResources(room));

    disposeKit(kit, room);

    expectDisposedOnce(spies);
  });
});

interface StrippedShell {
  readonly shell: THREE.Group;
  readonly discarded: readonly THREE.Object3D[];
  readonly spies: Map<Disposable, DisposeSpy>;
}

/**
 * Runs `buildKitchenShell` with every resource of the reference room it builds already spied on,
 * and reports which children it dropped.
 *
 * The builder is wrapped rather than called separately: the room the shell strips is built inside
 * `buildKitchenShell` and never returned, so this is the only point at which the 27 discarded
 * bodies can be seen at all.
 */
function buildShellOverSpiedRoom(kit: Kit): StrippedShell {
  const buildReferenceRoom = kit.builders["kitchen-l"];
  let discarded: readonly THREE.Object3D[] = [];
  let spies = new Map<Disposable, DisposeSpy>();

  kit.builders["kitchen-l"] = () => {
    const room = buildReferenceRoom();
    discarded = room.children.filter(
      (child) => !SHELL_CHILD_NAMES.has(child.name),
    );
    spies = spyOnDisposals(reachableResources(room));
    return room;
  };
  const shell = buildKitchenShell(kit, KITCHEN_L_DESIGN.room);
  kit.builders["kitchen-l"] = buildReferenceRoom;

  expect(discarded.length).toBeGreaterThan(20);
  return { shell, discarded, spies };
}

describe("buildKitchenShell's discarded reference bodies", () => {
  it("releases the geometry only a discarded body used", () => {
    const kit = newKit();

    const stripped = buildShellOverSpiedRoom(kit);

    const survivors = new Set(reachableResources(stripped.shell));
    const droppedOnly = reachableResources(...stripped.discarded).filter(
      (resource) => !survivors.has(resource) && !isKitOwned(resource, kit),
    );
    expect(droppedOnly.length).toBeGreaterThan(0);
    for (const resource of droppedOnly) {
      const spy = required(stripped.spies.get(resource), "a dispose spy");
      expect(spy, describeResource(resource)).toHaveBeenCalledTimes(1);
    }
  });

  it("disposes nothing a retained shell child or the kit still renders from", () => {
    const kit = newKit();

    const stripped = buildShellOverSpiedRoom(kit);

    const survivors = new Set(reachableResources(stripped.shell));
    expect(survivors.size).toBeGreaterThan(0);
    for (const [resource, spy] of stripped.spies) {
      if (!survivors.has(resource) && !isKitOwned(resource, kit)) continue;
      expect(spy, describeResource(resource)).not.toHaveBeenCalled();
    }
  });
});
