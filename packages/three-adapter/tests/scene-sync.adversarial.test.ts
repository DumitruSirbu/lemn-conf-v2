// Adversarial QA for M3 Wave 3B, work item 8. The implementer's suite counts `dispose()` calls;
// this one asks what those calls *hit*. `kitchen-parts.ts`'s `chamferBox` memoises geometry per
// kit, so "how many disposals happened" and "was anything the scene still needs disposed" are two
// different questions, and only the second one is the acceptance criterion.
//
// It also attacks the void change detector — `matchesMountedVoidIds` compares ids by index, and a
// void's id (`void-engine.ts`, `subdivideFreeSpan`) is built from its column, its index in the span
// and its `y0` rounded to two decimals. Its **height** is not in it.
import {
  derivePlacementRecords,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  TOP_ROW_Y0_M,
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
import { syncSolidBodies, syncVoidMeshes } from "../src/scene-sync.js";
import { isMesh } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

const WALL_ROW_Y0_M = 1.5;
const SIGNATURE_FLOW_CYCLES = 10;

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

function makeVoidRecord(id: string, y0: number, h: number): VoidRecord {
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
    h,
    spanY0: y0,
    spanH: h,
  };
}

function sync(records: readonly PlacementRecord[]): void {
  syncSolidBodies({ kit, solidsRoot, records });
}

function mounted(placementId: string): THREE.Object3D {
  const body = solidsRoot.children.find(
    (child) => child.userData["placementId"] === placementId,
  );
  if (!body) throw new Error(`no body mounted for ${placementId}`);
  return body;
}

/** Same reason as `three-guards.ts`: three.js declares `Line` with `any`-parameterised geometry
 *  and material, so a bare `instanceof` narrows to nothing useful. */
function isLine(object: THREE.Object3D): object is THREE.Line {
  return object instanceof THREE.Line;
}

function geometriesOf(root: THREE.Object3D): THREE.BufferGeometry[] {
  const geometries: THREE.BufferGeometry[] = [];
  root.traverse((node) => {
    if (isMesh(node) || isLine(node)) geometries.push(node.geometry);
  });
  return geometries;
}

function materialsOf(root: THREE.Object3D): THREE.Material[] {
  const materials: THREE.Material[] = [];
  root.traverse((node) => {
    if (!isMesh(node) && !isLine(node)) return;
    const material: THREE.Material | THREE.Material[] = node.material;
    materials.push(...(Array.isArray(material) ? material : [material]));
  });
  return materials;
}

/** Records what was disposed, by identity, without actually disposing it — the question is which
 *  objects were hit, not how many calls happened. */
function recordDisposals(): {
  readonly geometries: Set<THREE.BufferGeometry>;
  readonly materials: Set<THREE.Material>;
} {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  vi.spyOn(THREE.BufferGeometry.prototype, "dispose").mockImplementation(
    function (this: THREE.BufferGeometry) {
      geometries.add(this);
    },
  );
  vi.spyOn(THREE.Material.prototype, "dispose").mockImplementation(function (
    this: THREE.Material,
  ) {
    materials.add(this);
  });
  return { geometries, materials };
}

// FINDING QA-2 — found in R1, fixed in R1.1 (`kit.ownsGeometry`, `kitchen-parts.ts`). These tests
// are now the regression guard: they fail again the moment a caller disposes a buffer the rest of
// the scene renders from, and — with the converse pair below — the moment the guard is widened
// until nothing is disposed at all.
//
// The defect, kept because it is the reason the guard exists and the reason a green suite missed
// it. `disposeSolidBody` disposed every geometry in the body it removed. Geometry is **shared**: `chamferBox` caches each `ExtrudeGeometry` per kit by its
// dimensions, so two 600 mm wall cabinets built from the same kit render from the same buffers.
// Removing one therefore deletes the GPU buffers the other is still drawing with. Three.js keeps
// the CPU-side attributes, so the survivors silently re-upload on the next frame rather than
// vanishing — the cost lands as buffer churn on every mutation and as a `renderer.info.memory
// .geometries` count that dips below the number of live geometries. It is the failure the module's
// own comment describes for materials ("disposing one would blank all of them"), one level down,
// and no count-based test can see it: the call count is right, the targets are not.
describe("removing a body never disposes what another mounted body renders", () => {
  it("keeps a twin body's geometries alive when its twin is removed", () => {
    sync([makeRecord({ id: "p1" }), makeRecord({ id: "p2", frame: { x: 3 } })]);
    const survivor = mounted("p2");
    const survivorGeometries = geometriesOf(survivor);
    const disposed = recordDisposals();

    sync([makeRecord({ id: "p2", frame: { x: 3 } })]);

    const stolen = survivorGeometries.filter((geometry) =>
      disposed.geometries.has(geometry),
    );
    expect(disposed.geometries.size).toBeGreaterThan(0);
    expect(stolen.length).toBe(0);
  });

  it("keeps a twin body's geometries alive when its twin is rebuilt", () => {
    sync([makeRecord({ id: "p1" }), makeRecord({ id: "p2", frame: { x: 3 } })]);
    const survivorGeometries = geometriesOf(mounted("p2"));
    const disposed = recordDisposals();

    sync([
      makeRecord({ id: "p1", widthMm: 800, frame: { w: 0.8 } }),
      makeRecord({ id: "p2", frame: { x: 3 } }),
    ]);

    expect(
      survivorGeometries.filter((geometry) => disposed.geometries.has(geometry))
        .length,
    ).toBe(0);
  });

  // R2. The converse of the fix, and the failure a passing "twin survives" test cannot see: if
  // `ownsGeometry` were made to answer `true` for everything — or if the guard were widened by a
  // stray `||` — disposal would be off wholesale and the leak §4 warns about would be back with a
  // green suite. A body's own geometry is everything `chamferBox` did **not** memoise: the
  // cylinders behind every handle bar and stem, the fridge's feet, the sink's faucet.
  it("still disposes the geometry the removed body owns outright", () => {
    sync([makeRecord({ id: "p1" })]);
    const body = mounted("p1");
    const owned = geometriesOf(body).filter(
      (geometry) => !kit.ownsGeometry(geometry),
    );
    const disposed = recordDisposals();

    sync([]);

    expect(owned.length).toBeGreaterThan(0);
    expect(
      owned.filter((geometry) => !disposed.geometries.has(geometry)),
    ).toEqual([]);
  });

  it("disposes what a rebuilt body owned and keeps what the kit owns", () => {
    sync([makeRecord({ id: "p1" })]);
    const before = mounted("p1");
    const owned = geometriesOf(before).filter(
      (geometry) => !kit.ownsGeometry(geometry),
    );
    const shared = geometriesOf(before).filter((geometry) =>
      kit.ownsGeometry(geometry),
    );
    const disposed = recordDisposals();

    sync([makeRecord({ id: "p1", widthMm: 800, frame: { w: 0.8 } })]);

    expect(owned.length).toBeGreaterThan(0);
    expect(shared.length).toBeGreaterThan(0);
    for (const geometry of owned)
      expect(disposed.geometries.has(geometry)).toBe(true);
    for (const geometry of shared)
      expect(disposed.geometries.has(geometry)).toBe(false);
  });

  it("never disposes a shared kit.M material", () => {
    sync([makeRecord({ id: "p1" }), makeRecord({ id: "p2", frame: { x: 3 } })]);
    const survivorMaterials = materialsOf(mounted("p2"));
    const disposed = recordDisposals();

    sync([makeRecord({ id: "p2", frame: { x: 3 } })]);

    expect(
      survivorMaterials.filter((material) => disposed.materials.has(material))
        .length,
    ).toBe(0);
    expect(disposed.materials.size).toBe(0);
  });
});

describe("syncSolidBodies is stable under repetition and reordering", () => {
  it("keeps the child list and its order identical when nothing changed", () => {
    const records = [
      makeRecord({ id: "p1" }),
      makeRecord({ id: "p2", frame: { x: 3 } }),
      makeRecord({ id: "p3", buildId: "base-cabinet", frame: { x: 1, y0: 0 } }),
    ];
    sync(records);
    const before = [...solidsRoot.children];

    sync(records);
    sync(records);

    expect(solidsRoot.children).toHaveLength(before.length);
    for (const [index, child] of before.entries()) {
      expect(solidsRoot.children[index]).toBe(child);
    }
  });

  it("keeps every instance when the record array is reordered", () => {
    const first = makeRecord({ id: "p1" });
    const second = makeRecord({ id: "p2", frame: { x: 3 } });
    sync([first, second]);
    const kept = [mounted("p1"), mounted("p2")];

    sync([second, first]);

    expect(mounted("p1")).toBe(kept[0]);
    expect(mounted("p2")).toBe(kept[1]);
  });

  it("rebuilds when only the seat depth changed", () => {
    sync([makeRecord({ id: "p1" })]);
    const before = mounted("p1");

    sync([makeRecord({ id: "p1", frame: { d: 0.33 } })]);

    expect(mounted("p1")).not.toBe(before);
  });

  it("returns to its exact baseline over ten signature-flow cycles", () => {
    const records = [
      makeRecord({ id: "p1" }),
      makeRecord({ id: "p2", buildId: "base-cabinet", frame: { x: 3, y0: 0 } }),
    ];
    sync(records);
    const baseline = solidsRoot.children.length;

    for (let cycle = 0; cycle < SIGNATURE_FLOW_CYCLES; cycle += 1) {
      sync([]);
      sync(records);
      sync(records);
    }

    expect(baseline).toBe(2);
    expect(solidsRoot.children).toHaveLength(baseline);
  });
});

describe("push-to-open is decided by the slot, on both sides of the line", () => {
  it.each([
    { name: "just below the top row", y0: TOP_ROW_Y0_M - 0.001, visible: true },
    { name: "exactly on the top row", y0: TOP_ROW_Y0_M, visible: false },
    { name: "above the top row", y0: TOP_ROW_Y0_M + 0.2, visible: false },
  ])("$name", (testCase) => {
    sync([makeRecord({ id: "p1", frame: { y0: testCase.y0, h: 0.4 } })]);

    expect(hasVisibleHandle(mounted("p1"))).toBe(testCase.visible);
  });

  it("lets a recorded steel handle beat the top-row default", () => {
    sync([
      makeRecord({
        id: "p1",
        handleMode: "black",
        frame: { y0: TOP_ROW_Y0_M, h: 0.4 },
      }),
    ]);

    expect(hasVisibleHandle(mounted("p1"))).toBe(true);
  });

  it("lets a recorded push mode hide the handles of a low slot", () => {
    sync([makeRecord({ id: "p1", handleMode: "push", frame: { y0: 0.4 } })]);

    expect(hasVisibleHandle(mounted("p1"))).toBe(false);
  });
});

// R1 finding QA-4, re-verified against the fix that was chosen instead of the one I suggested:
// `buildDecomposedBody` keeps its build-time hide — the decomposition-parity gate holds those six
// ids to the reference room's own hidden handles — and `mountBody` now calls `setHandlesVisible`
// in **both** directions, so a recorded non-push mode un-hides them. The three cases below are the
// three that matter: the choice reaches the screen, the default still hides, and an inserted body
// is unaffected.
describe("a seeded top-row body honours a recorded handle mode too", () => {
  it("shows the handles of a seeded top-row cabinet set to a bar handle", () => {
    const seeded = derivePlacementRecords(
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    );
    const topRow = seeded.find(
      (record) => record.buildId === "wall-2door-600-top",
    );
    if (!topRow) throw new Error("the seeded design has no top-row cabinet");
    expect(topRow.frame.y0).toBeCloseTo(TOP_ROW_Y0_M, 6);
    expect(topRow.canHandle).toBe(true);

    sync([{ ...topRow, handleMode: "black" }]);

    expect(hasVisibleHandle(mounted(topRow.id))).toBe(true);
  });

  it("still hides them when no handle mode is recorded", () => {
    const topRow = seededTopRow();

    sync([topRow]);

    expect(hasVisibleHandle(mounted(topRow.id))).toBe(false);
  });

  it("hides them again when the recorded mode goes back to push", () => {
    const topRow = seededTopRow();
    sync([{ ...topRow, handleMode: "black" }]);
    expect(hasVisibleHandle(mounted(topRow.id))).toBe(true);

    sync([{ ...topRow, handleMode: "push" }]);

    expect(hasVisibleHandle(mounted(topRow.id))).toBe(false);
  });

  // The seeded over-fridge unit is the control: it sits below the top row, `buildDecomposedBody`
  // does not hide it, and the two-way call must not change that.
  it("leaves a seeded body below the top row with its handles visible", () => {
    const seeded = derivePlacementRecords(
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    );
    const overFridge = seeded.find(
      (record) => record.buildId === "wall-2door-700-over-fridge",
    );
    if (!overFridge)
      throw new Error("the seeded design has no over-fridge unit");
    expect(overFridge.frame.y0).toBeLessThan(TOP_ROW_Y0_M);

    sync([overFridge]);

    expect(hasVisibleHandle(mounted(overFridge.id))).toBe(true);
  });
});

function seededTopRow(): PlacementRecord {
  const topRow = derivePlacementRecords(
    KITCHEN_L_DESIGN,
    KITCHEN_L_BODY_CATALOG,
  ).find((record) => record.buildId === "wall-2door-600-top");
  if (!topRow) throw new Error("the seeded design has no top-row cabinet");
  return topRow;
}

// R1 finding QA-3, re-verified against `signVoid`. The id-only comparison is gone; the signature
// now covers `id, x, y0, z, ry, w, h, d`. The height case below is the original counterexample, and
// the sweep after it is the general question: is there any field `buildVoidMesh` reads that the
// signature does not cover?
describe("syncVoidMeshes detects a change the id list cannot see", () => {
  it("remounts a void whose id survived but whose height changed", () => {
    const before = makeVoidRecord("A|2.00:v0:1.70", 1.7, 0.5);
    const after = makeVoidRecord("A|2.00:v0:1.70", 1.7, 0.9);
    syncVoidMeshes({ voidsRoot, voids: [before] });

    syncVoidMeshes({ voidsRoot, voids: [after] });

    const box = new THREE.Box3().setFromObject(voidsRoot);
    expect(box.max.y - box.min.y).toBeCloseTo(after.h - 0.028, 3);
  });

  it("remounts when the ids match but the order does not", () => {
    const low = makeVoidRecord("A|2.00:v0:1.50", 1.5, 0.7);
    const high = makeVoidRecord("A|2.00:v1:2.20", 2.2, 0.4);
    syncVoidMeshes({ voidsRoot, voids: [low, high] });

    syncVoidMeshes({ voidsRoot, voids: [high, low] });

    expect(voidsRoot.children[0]?.userData["voidId"]).toBe(high.id);
  });

  // Property form: every field `buildVoidMesh` reads must move the mesh or resize it, and must
  // therefore force a remount. `spanY0`/`spanH` are deliberately absent from both — they are the
  // *opening's* span, which `buildVoidMesh` never reads and which nothing in the adapter or in
  // `apps/web` reads off a mounted mesh, so a change to them is genuinely not a geometry change.
  const GEOMETRIC_FIELDS = ["x", "y0", "z", "ry", "w", "h", "d", "id"] as const;

  it.each(GEOMETRIC_FIELDS)("remounts when %s changes", (field) => {
    const before = makeVoidRecord("A|2.00:v0:1.70", 1.7, 0.5);
    const after: VoidRecord =
      field === "id"
        ? { ...before, id: "A|2.00:v0:1.71" }
        : { ...before, [field]: before[field] + 0.05 };
    syncVoidMeshes({ voidsRoot, voids: [before] });
    const mountedMesh = voidsRoot.children[0];

    syncVoidMeshes({ voidsRoot, voids: [after] });

    expect(voidsRoot.children[0]).not.toBe(mountedMesh);
  });

  it("does not churn on a span change, which no mounted mesh reads", () => {
    const before = makeVoidRecord("A|2.00:v0:1.70", 1.7, 0.5);
    syncVoidMeshes({ voidsRoot, voids: [before] });
    const mountedMesh = voidsRoot.children[0];
    const boxBefore = new THREE.Box3().setFromObject(voidsRoot).clone();

    syncVoidMeshes({
      voidsRoot,
      voids: [{ ...before, spanY0: 0.86, spanH: 1.74 }],
    });

    expect(voidsRoot.children[0]).toBe(mountedMesh);
    expect(new THREE.Box3().setFromObject(voidsRoot)).toEqual(boxBefore);
  });

  it("disposes a replaced void's own materials and nothing shared", () => {
    syncVoidMeshes({ voidsRoot, voids: [makeVoidRecord("v0", 1.5, 0.4)] });
    const owned = materialsOf(voidsRoot);
    const disposed = recordDisposals();

    syncVoidMeshes({ voidsRoot, voids: [makeVoidRecord("v1", 2.2, 0.4)] });

    expect(owned.length).toBeGreaterThan(0);
    for (const material of owned)
      expect(disposed.materials.has(material)).toBe(true);
    // Nothing beyond the void's own two materials may be touched.
    expect(disposed.materials.size).toBe(owned.length);
  });
});

/** Meshes only: `hidePushOpenHandles` hides the bar and stem meshes, not the group. */
function hasVisibleHandle(body: THREE.Object3D): boolean {
  let visible = false;
  body.traverse((node) => {
    if (isMesh(node) && node.name.includes("handle") && node.visible) {
      visible = true;
    }
  });
  return visible;
}
