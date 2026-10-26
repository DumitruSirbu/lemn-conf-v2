// M3 work item 8: the scene follows store state, and the *difference* is the whole point.
//
// Two acceptance criteria are asserted here that nothing in M1 or M2 could have exercised, because
// M2's scene was built once and never torn down: an unchanged body keeps its identical instance
// (rebuilding it would discard applied finish and handle state and re-run its wall seating), and
// everything removed is disposed (§4's pseudocode opens with "dispose all void meshes"; a leak is
// invisible until a phone runs out of memory mid-session).
import {
  derivePlacementRecords,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  NO_FRONT_ASSEMBLY_MM,
  shellPlusFrontMm,
  type Frame,
  type PlacementRecord,
  type VoidRecord,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { isLine, isMesh } from "../src/three-guards.js";
import { syncSolidBodies, syncVoidMeshes } from "../src/scene-sync.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

/** The room the void sets stand in: the seeded L, which is never cut. */
const L_ROOM = KITCHEN_L_DESIGN.room;

const TOP_ROW_Y0_M = 2.2;
const WALL_ROW_Y0_M = 1.5;
const REPEATED_CYCLES = 10;

let kit: Kit;
let solidsRoot: THREE.Group;
let voidsRoot: THREE.Group;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
});

beforeEach(() => {
  solidsRoot = new THREE.Group();
  voidsRoot = new THREE.Group();
});

afterEach(() => {
  vi.restoreAllMocks();
});

type RecordOverrides = Partial<Omit<PlacementRecord, "frame">> & {
  readonly id: string;
  readonly frame?: Partial<Frame>;
};

function makeRecord(overrides: RecordOverrides): PlacementRecord {
  return {
    buildId: "wall-cabinet",
    kind: "wall_cabinet",
    col: "A|2.00",
    wall: "A",
    rotated: false,
    band: "wall",
    widthMm: 600,
    heightMm: 700,
    canFinish: true,
    canHandle: true,
    canReplace: true,
    canDelete: true,
    fixedWidth: false,
    kitchenSettings: {},
    // `buildBody` rebuilds from `frame.d` through `rebuildDepthM`; nothing in a scene-sync fixture
    // reads an occupied depth, so the record declares the frame it states.
    occupiedDepth: shellPlusFrontMm(NO_FRONT_ASSEMBLY_MM),
    ...overrides,
    frame: {
      x: 2,
      y0: WALL_ROW_Y0_M,
      z: 0.2,
      ry: 0,
      w: 0.6,
      h: 0.7,
      d: 0.4,
      ...overrides.frame,
    },
  };
}

function makeVoidRecord(id: string, y0: number): VoidRecord {
  return {
    id,
    col: "A|2.00",
    wall: "A",
    x: 2,
    z: 0.2,
    ry: 0,
    w: 0.6,
    d: 0.4,
    y0,
    h: 0.4,
    spanY0: y0,
    spanH: 0.4,
  };
}

function sync(records: readonly PlacementRecord[]): void {
  syncSolidBodies({ kit, solidsRoot, records, room: KITCHEN_L_DESIGN.room });
}

function mounted(placementId: string): THREE.Object3D | undefined {
  return solidsRoot.children.find(
    (child) => child.userData["placementId"] === placementId,
  );
}

/** There is no renderer here to grow `renderer.info.memory.geometries`, so disposal is counted on
 *  the prototypes instead — which is the same number that counter tracks. */
function countDisposals() {
  return {
    geometries: vi.spyOn(THREE.BufferGeometry.prototype, "dispose"),
    materials: vi.spyOn(THREE.Material.prototype, "dispose"),
  };
}

function countRenderables(root: THREE.Object3D): number {
  let renderables = 0;
  root.traverse((node) => {
    if (node instanceof THREE.Mesh || node instanceof THREE.Line) {
      renderables += 1;
    }
  });
  return renderables;
}

/** What a body may actually dispose: the meshes whose geometry the kit's shared `chamferBox` cache
 *  does **not** own. The cached ones belong to every other body of the same size, so a body that
 *  disposed them would delete its neighbours' buffers. */
function countDisposableGeometries(root: THREE.Object3D): number {
  let disposable = 0;
  root.traverse((node) => {
    if (isMesh(node) && !kit.ownsGeometry(node.geometry)) disposable += 1;
  });
  return disposable;
}

/** Meshes only: `hidePushOpenHandles` hides the bar and stem meshes, and the group they hang in
 *  keeps its own `visible` — nothing renders either way, and the meshes are what a renderer reads. */
function hasVisibleHandle(body: THREE.Object3D): boolean {
  let visible = false;
  body.traverse((node) => {
    if (isHandleMesh(node) && node.visible) visible = true;
  });
  return visible;
}

function isHandleMesh(node: THREE.Object3D): boolean {
  return node instanceof THREE.Mesh && node.name.includes("handle");
}

describe("syncSolidBodies", () => {
  it("mounts a body per record, keyed the way picking climbs", () => {
    sync([makeRecord({ id: "p1" }), makeRecord({ id: "p2", frame: { x: 3 } })]);

    expect(solidsRoot.children).toHaveLength(2);
    expect(mounted("p1")).toBeDefined();
    expect(mounted("p2")?.position.x).toBeCloseTo(3, 6);
  });

  it("seats a mounted body at its record's frame", () => {
    sync([makeRecord({ id: "p1", frame: { ry: Math.PI / 2, x: 0.29 } })]);

    const body = mounted("p1");
    expect(body?.position.y).toBeCloseTo(WALL_ROW_Y0_M, 6);
    expect(body?.rotation.y).toBeCloseTo(Math.PI / 2, 6);
  });

  it("leaves an unchanged body as the identical instance", () => {
    const records = [makeRecord({ id: "p1" }), makeRecord({ id: "p2" })];
    sync(records);
    const before = mounted("p1");

    sync(records);

    expect(mounted("p1")).toBe(before);
  });

  it("keeps the untouched bodies untouched when one is added and one removed", () => {
    sync([makeRecord({ id: "p1" }), makeRecord({ id: "p2" })]);
    const kept = mounted("p1");

    sync([makeRecord({ id: "p1" }), makeRecord({ id: "p3" })]);

    expect(mounted("p1")).toBe(kept);
    expect(mounted("p2")).toBeUndefined();
    expect(mounted("p3")).toBeDefined();
  });

  it("removes a vanished body and disposes its geometries, never its materials", () => {
    sync([makeRecord({ id: "p1" })]);
    const own = countDisposableGeometries(required(mounted("p1")));
    const disposed = countDisposals();
    expect(own).toBeGreaterThan(0);

    sync([]);

    expect(solidsRoot.children).toHaveLength(0);
    expect(disposed.geometries).toHaveBeenCalledTimes(own);
    // Every material here comes from `kit.M` and is shared with the live scene.
    expect(disposed.materials).not.toHaveBeenCalled();
  });

  it("rebuilds a body whose record changed, and disposes the old one", () => {
    sync([makeRecord({ id: "p1" })]);
    const before = required(mounted("p1"));
    const own = countDisposableGeometries(before);
    const disposed = countDisposals();

    sync([makeRecord({ id: "p1", widthMm: 800, frame: { w: 0.8 } })]);

    expect(mounted("p1")).not.toBe(before);
    expect(disposed.geometries).toHaveBeenCalledTimes(own);
  });

  it("never touches scene children that carry no placement id", () => {
    const shell = new THREE.Group();
    shell.name = "reference_room";
    solidsRoot.add(shell);

    sync([makeRecord({ id: "p1" })]);
    sync([]);

    expect(solidsRoot.children).toEqual([shell]);
  });

  it("builds a seeded id through the decomposition path, unchanged", () => {
    const seeded = derivePlacementRecords(
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    );

    sync(seeded);

    expect(solidsRoot.children).toHaveLength(seeded.length);
    for (const record of seeded) expect(mounted(record.id)).toBeDefined();
  });

  // "Counts return to baseline" with the nuance the shared cache forces: what returns to baseline
  // is the geometry each body *owns*. The kit's cached `ExtrudeGeometry` instances are retained on
  // purpose — they are shared with every other body of the same size — and the cache is bounded by
  // the number of distinct box sizes, so retaining them is a fixed cost, not a growing one.
  it("returns to its baseline geometry count over ten add/remove cycles", () => {
    const records = [
      makeRecord({ id: "p1" }),
      makeRecord({ id: "p2", buildId: "base-cabinet", frame: { x: 3, y0: 0 } }),
    ];
    sync(records);
    const perCycle = countDisposableGeometries(solidsRoot);
    sync([]);
    const disposed = countDisposals();

    for (let cycle = 0; cycle < REPEATED_CYCLES; cycle += 1) {
      sync(records);
      sync([]);
    }

    expect(perCycle).toBeGreaterThan(0);
    expect(disposed.geometries).toHaveBeenCalledTimes(
      REPEATED_CYCLES * perCycle,
    );
    expect(solidsRoot.children).toHaveLength(0);
  });
});

describe("push-to-open by slot", () => {
  it("hides the handles of a top-row body and builds them all the same", () => {
    sync([makeRecord({ id: "p1", frame: { y0: TOP_ROW_Y0_M, h: 0.4 } })]);

    const body = mounted("p1");
    if (!body) throw new Error("body was not mounted");
    expect(hasVisibleHandle(body)).toBe(false);
    expect(countHandles(body)).toBeGreaterThan(0);
  });

  it("honours a recorded handle mode over the slot default, both ways", () => {
    sync([
      makeRecord({ id: "push", handleMode: "push" }),
      makeRecord({
        id: "steel",
        handleMode: "steel",
        frame: { y0: TOP_ROW_Y0_M, h: 0.4 },
      }),
    ]);

    expect(hasVisibleHandle(required(mounted("push")))).toBe(false);
    expect(hasVisibleHandle(required(mounted("steel")))).toBe(true);
  });
});

describe("syncVoidMeshes", () => {
  it("mounts one mesh per void, keyed by void id", () => {
    syncVoidMeshes({
      voidsRoot,
      voids: [makeVoidRecord("v0", 1.5)],
      room: L_ROOM,
    });

    expect(voidsRoot.children).toHaveLength(1);
    expect(voidsRoot.children[0]?.userData["voidId"]).toBe("v0");
  });

  // Confirmed, not assumed: a void builds its own `BoxGeometry` and `EdgesGeometry` in
  // `void-mesh.ts` and never goes through the kit's shared `chamferBox` cache, which is why
  // `disposeVoidMesh` may dispose everything it finds while `disposeSolidBody` may not.
  it("owns every geometry it renders, unlike a body", () => {
    syncVoidMeshes({
      voidsRoot,
      voids: [makeVoidRecord("v0", 1.5)],
      room: L_ROOM,
    });

    let checked = 0;
    voidsRoot.traverse((node) => {
      if (!isMesh(node) && !isLine(node)) return;
      expect(kit.ownsGeometry(node.geometry)).toBe(false);
      checked += 1;
    });
    expect(checked).toBeGreaterThan(0);
  });

  it("does not churn when the void set is unchanged", () => {
    const voids = [makeVoidRecord("v0", 1.5)];
    syncVoidMeshes({ voidsRoot, voids, room: L_ROOM });
    const before = voidsRoot.children[0];

    syncVoidMeshes({ voidsRoot, voids, room: L_ROOM });

    expect(voidsRoot.children[0]).toBe(before);
  });

  it("replaces the whole set on any change, disposing geometries and its own materials", () => {
    syncVoidMeshes({
      voidsRoot,
      voids: [makeVoidRecord("v0", 1.5)],
      room: L_ROOM,
    });
    const renderables = countRenderables(voidsRoot);
    const disposed = countDisposals();

    syncVoidMeshes({
      voidsRoot,
      voids: [makeVoidRecord("v1", 2.2)],
      room: L_ROOM,
    });

    expect(voidsRoot.children).toHaveLength(1);
    expect(voidsRoot.children[0]?.userData["voidId"]).toBe("v1");
    // A void owns its own fill and outline materials, so both go with it.
    expect(disposed.geometries).toHaveBeenCalledTimes(renderables);
    expect(disposed.materials).toHaveBeenCalledTimes(renderables);
  });

  it("returns to its baseline over ten recompute cycles", () => {
    syncVoidMeshes({
      voidsRoot,
      voids: [makeVoidRecord("v0", 1.5)],
      room: L_ROOM,
    });
    const perCycle = countRenderables(voidsRoot);
    syncVoidMeshes({ voidsRoot, voids: [], room: L_ROOM });
    const disposed = countDisposals();

    for (let cycle = 0; cycle < REPEATED_CYCLES; cycle += 1) {
      syncVoidMeshes({
        voidsRoot,
        voids: [makeVoidRecord(`v${String(cycle)}`, 1.5)],
        room: L_ROOM,
      });
      syncVoidMeshes({ voidsRoot, voids: [], room: L_ROOM });
    }

    expect(perCycle).toBeGreaterThan(0);
    expect(disposed.geometries).toHaveBeenCalledTimes(
      REPEATED_CYCLES * perCycle,
    );
    expect(voidsRoot.children).toHaveLength(0);
  });
});

function countHandles(body: THREE.Object3D): number {
  let handles = 0;
  body.traverse((node) => {
    if (isHandleMesh(node)) handles += 1;
  });
  return handles;
}

function required(body: THREE.Object3D | undefined): THREE.Object3D {
  if (!body) throw new Error("body was not mounted");
  return body;
}
