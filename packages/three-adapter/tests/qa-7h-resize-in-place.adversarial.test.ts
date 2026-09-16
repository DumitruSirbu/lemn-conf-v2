// Wave 7H adversarial QA: `resizeShellToRoom` attacked at the boundaries the wave did not sweep.
//
// `kitchen-shell.room-shaped.test.ts` proves the shell is a correct function of the room and that
// **one** resize frees what it replaces. This file attacks the other axis: a shell that is resized
// again, and again, and again — which is what a customer correcting a wall length in the room
// screen actually produces. A resource leaked per correction is invisible to every assertion in
// this wave until a handset runs out of memory, and a resource freed while still attached is a
// black or invisible room.
//
// **Three claims the wave states but never sweeps**, and one it does not state at all:
//   1. repeated resizes free exactly what they replace and nothing that is still attached;
//   2. the drawn room is a function of the room alone — the *path* to it cannot matter;
//   3. the tile density survives compounding, at the policy corners and either side of them;
//   4. the geometries the **first** resize disposes were never the kit's to begin with.
import {
  APPROVED_ROOM_POLICY,
  derivePlacementRecords,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  type DesignRoom,
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
import { kitMaterialList, makeKit, type Kit } from "../src/kitchen-parts.js";
import { isMesh, isTexture, toMaterials } from "../src/three-guards.js";
import { createHeadlessCanvas } from "./support/headless-canvas.js";
import { required } from "./support/required.js";

/** The four children the wave redraws, and the fifth it must never touch. */
const RESIZED_CHILD_NAMES = [
  "floor",
  "wall_back",
  "wall_left",
  "backsplash_wall_a",
] as const;
const RUN_END_PANEL_NAME = "end_panel_right";

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

/** How many corrections a customer is allowed to make before the room is permitted to leak. The
 *  answer is none, so this is only as large as the suite can afford: each pass allocates four
 *  geometries, two materials and two maps and frees the previous eight. */
const MANY_CORRECTIONS = 100;

function roomOf(
  widthMm: number,
  depthMm: number,
  heightMm: number,
): DesignRoom {
  return { shape: "L", widthMm, depthMm, heightMm };
}

/** The eight corners of the owner-approved box, a millimetre inside each of them, and the seeded
 *  triple. A sweep over a 5400 x 4100 x 1700 mm box essentially never generates a corner, and the
 *  corner is where a repeat arithmetic goes degenerate if it is going to. */
const CORNER_ROOMS: readonly DesignRoom[] = [
  WALL_A.minMm,
  WALL_A.minMm + 1,
  WALL_A.maxMm - 1,
  WALL_A.maxMm,
].flatMap((widthMm) =>
  [WALL_B.minMm, WALL_B.minMm + 1, WALL_B.maxMm - 1, WALL_B.maxMm].flatMap(
    (depthMm) =>
      [HEIGHT.minMm, HEIGHT.maxMm].map((heightMm) =>
        roomOf(widthMm, depthMm, heightMm),
      ),
  ),
);

const roomArbitrary = fc.record({
  shape: fc.constant("L" as const),
  widthMm: fc.integer({ min: WALL_A.minMm, max: WALL_A.maxMm }),
  depthMm: fc.integer({ min: WALL_B.minMm, max: WALL_B.maxMm }),
  heightMm: fc.integer({ min: HEIGHT.minMm, max: HEIGHT.maxMm }),
});

/** A kit and a whole room's worth of baked canvas textures per run, so the run count is what the
 *  suite can pay for rather than what a pure function would deserve. */
const PROPERTY_RUNS = { numRuns: 12 };

describe("a room corrected over and over frees exactly what it replaced", () => {
  it(`leaves nothing attached disposed and nothing replaced alive, over ${String(MANY_CORRECTIONS)} corrections`, () => {
    const { kit, shell } = shellFor(SEEDED_ROOM);
    const ledger = new ResourceLedger(kit);
    ledger.observe(shell);

    for (let correction = 0; correction < MANY_CORRECTIONS; correction++) {
      resizeShellToRoom({ kit, shell, room: correctionNumber(correction) });
      ledger.observe(shell);
    }

    expect(ledger.stillAttachedButDisposed()).toEqual([]);
    expect(ledger.replacedButNotFreed()).toEqual([]);
  });

  /** The ledger's own non-vacuity: it must be able to *see* a replaced resource go unfreed, or
   *  "nothing leaked" is a claim about the ledger rather than about the shell. */
  it("reports a replaced geometry that nobody freed", () => {
    const { kit, shell } = shellFor(SEEDED_ROOM);
    const ledger = new ResourceLedger(kit);
    ledger.observe(shell);

    const floor = meshNamed(shell, "floor");
    floor.geometry = new THREE.BoxGeometry(1, 1, 1);
    ledger.observe(shell);

    expect(ledger.replacedButNotFreed()).toEqual(["floor geometry"]);
  });

  it("does not grow the kit's owned sets, whatever sequence of rooms it is given", () => {
    const { kit, shell } = shellFor(SEEDED_ROOM);
    const owned = kitOwnedResources(kit.M);
    const afterFirstDraw = {
      materials: owned.materials.size,
      textures: owned.textures.size,
    };

    for (let correction = 0; correction < MANY_CORRECTIONS; correction++) {
      resizeShellToRoom({ kit, shell, room: correctionNumber(correction) });
    }

    expect(owned.materials.size).toBe(afterFirstDraw.materials);
    expect(owned.textures.size).toBe(afterFirstDraw.textures);
  });

  /** A correction that is not a correction — the room screen writes the room it already holds, or
   *  the stage's mount-time redraw runs over a shell the memo has just drawn at that same room. It
   *  must be a fixed point, not a slow drift in the repeat. */
  it("is a fixed point when the room has not changed", () => {
    const { kit, shell } = shellFor(SEEDED_ROOM);
    const afterOne = drawingOf(shell);

    for (let repeat = 0; repeat < MANY_CORRECTIONS; repeat++) {
      resizeShellToRoom({ kit, shell, room: SEEDED_ROOM });
    }

    expect(drawingOf(shell)).toEqual(afterOne);
  });

  propertyTest.prop(
    [fc.array(roomArbitrary, { minLength: 2, maxLength: 10 }), roomArbitrary],
    PROPERTY_RUNS,
  )(
    "draws the room it was last given, whatever it was given before it",
    (visited, destination) => {
      const { kit, shell } = shellFor(SEEDED_ROOM);
      for (const room of visited) resizeShellToRoom({ kit, shell, room });
      resizeShellToRoom({ kit, shell, room: destination });

      expectSameDrawing(
        drawingOf(shell),
        drawingOf(shellFor(destination).shell),
      );
    },
  );

  /** The path-independence claim at its sharpest: leave a room and come back to it. Compounding a
   *  repeat by one ratio and then by its reciprocal is where a drift would show. */
  it.each(CORNER_ROOMS.slice(0, 8))(
    "returns to the same drawing after a round trip through $widthMm x $depthMm x $heightMm",
    (excursion) => {
      const { kit, shell } = shellFor(SEEDED_ROOM);
      const before = drawingOf(shell);

      resizeShellToRoom({ kit, shell, room: excursion });
      resizeShellToRoom({ kit, shell, room: SEEDED_ROOM });

      expectSameDrawing(drawingOf(shell), before);
    },
  );
});

/** Criterion 17 under compounding. The existing sweep measures density on a shell drawn **once**;
 *  the repeat is multiplied by a ratio on every redraw, so the question this asks is whether it
 *  survives being multiplied a hundred times. */
describe("a plank and a tile keep their world size under repeated corrections", () => {
  it(`holds the density after ${String(MANY_CORRECTIONS)} corrections across the whole policy`, () => {
    const { kit, shell } = shellFor(SEEDED_ROOM);

    for (let correction = 0; correction < MANY_CORRECTIONS; correction++) {
      resizeShellToRoom({ kit, shell, room: correctionNumber(correction) });
      expectConstantWorldDensity(shell);
    }
  });

  it.each(CORNER_ROOMS)(
    "draws a finite, positive repeat at $widthMm x $depthMm x $heightMm",
    (room) => {
      const { shell } = shellFor(room);

      for (const name of RESIZED_CHILD_NAMES) {
        const mesh = meshNamed(shell, name);
        expectDrawableExtent(mesh);
        expectDrawableTiling(mesh);
      }
    },
  );

  propertyTest.prop(
    [fc.array(roomArbitrary, { minLength: 3, maxLength: 12 })],
    {
      numRuns: 10,
    },
  )("holds the density over any sequence of corrections", (sequence) => {
    const { kit, shell } = shellFor(SEEDED_ROOM);

    for (const room of sequence) {
      resizeShellToRoom({ kit, shell, room });
      expectConstantWorldDensity(shell);
    }
  });
});

/** The one kit-owned shell geometry. Its buffer is shared with every other body of that size, so
 *  freeing it is not a leak but the opposite — a live body rendering from a released buffer. */
describe("the run-end panel's shared geometry survives every correction", () => {
  it(`is the same kit-owned buffer, undisposed, after ${String(MANY_CORRECTIONS)} corrections`, () => {
    const { kit, shell } = shellFor(SEEDED_ROOM);
    const panel = meshNamed(shell, RUN_END_PANEL_NAME);
    const geometry = panel.geometry;
    const dispose = vi.spyOn(geometry, "dispose");

    for (let correction = 0; correction < MANY_CORRECTIONS; correction++) {
      resizeShellToRoom({ kit, shell, room: correctionNumber(correction) });
    }

    expect(panel.geometry).toBe(geometry);
    expect(kit.ownsGeometry(geometry)).toBe(true);
    expect(dispose).not.toHaveBeenCalled();
  });

  /** ADR 0045 Amendment A's wall-end veto: the panel's outer face stands at 3519 mm, so a wall A
   *  shorter than that hides it. The veto flipping must change `visible` and nothing else — a
   *  hidden panel that had its buffer freed is a body that cannot come back. */
  it.each([3518, 3519, 3520])(
    "keeps the panel's buffer across the wall-end veto at %i mm",
    (widthMm) => {
      const room = { ...SEEDED_ROOM, widthMm };
      const { kit, shell } = shellFor(room);
      const panel = meshNamed(shell, RUN_END_PANEL_NAME);
      const dispose = vi.spyOn(panel.geometry, "dispose");
      const solidsRoot = new THREE.Group();
      solidsRoot.add(shell);

      syncRunEndPanel({ solidsRoot, records: SEEDED_RECORDS, room });
      resizeShellToRoom({ kit, shell, room });
      syncRunEndPanel({ solidsRoot, records: SEEDED_RECORDS, room });

      expect(kit.ownsGeometry(panel.geometry)).toBe(true);
      expect(dispose).not.toHaveBeenCalled();
    },
  );

  /** Non-vacuity for the three cases above: the veto really does fire between 3518 and 3519, so
   *  "the buffer survived" is a claim about a boundary rather than about three equal rooms. */
  it("hides the panel a millimetre below the wall's end and draws it at it", () => {
    expect(panelVisibilityAt(3518)).toBe(false);
    expect(panelVisibilityAt(3519)).toBe(true);
  });
});

/** Fact A's other half, which the wave asserts for the geometries it **creates** and never for the
 *  ones it **destroys**. `replaceGeometry` disposes whatever the builder left on the mesh, and if
 *  the builder had handed it a buffer out of the kit's cache the very first redraw — the one every
 *  mount runs — would free a geometry other bodies still render from. */
describe("the builder's own shell geometries are private before the first redraw", () => {
  it.each(RESIZED_CHILD_NAMES)(
    "hands %s a geometry the kit does not own",
    (name) => {
      const kit = makeKit({ createCanvas: createHeadlessCanvas });
      const reference = kit.builders["kitchen-l"]();

      expect(kit.ownsGeometry(meshNamed(reference, name).geometry)).toBe(false);
    },
  );
});

/** A ledger of every geometry, material and map that has ever been attached to a shell child, and
 *  of whether it was freed after it stopped being attached.
 *
 *  A dispose spy is installed the first time a resource is seen, which is why `observe` is called
 *  after every redraw rather than only at the end: a resource that appears and is replaced between
 *  two observations would otherwise be freed before anything was watching.
 *
 *  **The kit's own resources are exempt from the freeing claim and held to the opposite one.** The
 *  builder dresses the floor and the backsplash in shared materials that also dress two customer
 *  bodies; the resize replaces them with private clones and must leave the originals alive. */
class ResourceLedger {
  private readonly disposals = new Map<Disposable, () => number>();
  private readonly labels = new Map<Disposable, string>();
  private attached = new Set<Disposable>();

  constructor(private readonly kit: Kit) {}

  observe(shell: THREE.Object3D): void {
    const attached = new Set<Disposable>();
    for (const { label, resource } of shellResourcesOf(shell)) {
      attached.add(resource);
      if (this.disposals.has(resource)) continue;
      this.labels.set(resource, label);
      this.disposals.set(resource, watchDisposal(resource));
    }
    this.attached = attached;
  }

  /** Resources the shell is rendering from right now that something has already freed. */
  stillAttachedButDisposed(): string[] {
    return this.labelsOf(
      [...this.attached].filter((resource) => this.disposalsOf(resource) > 0),
    );
  }

  /** Resources nothing renders from any more that nothing freed — excluding the kit's own, which
   *  are shared with the customer's bodies and must outlive the shell. */
  replacedButNotFreed(): string[] {
    return this.labelsOf(
      [...this.disposals.keys()].filter(
        (resource) =>
          !this.attached.has(resource) &&
          !this.isTheKits(resource) &&
          this.disposalsOf(resource) === 0,
      ),
    );
  }

  private isTheKits(resource: Disposable): boolean {
    if (resource instanceof THREE.BufferGeometry)
      return this.kit.ownsGeometry(resource);
    if (resource instanceof THREE.Material)
      return kitMaterialList(this.kit.M).includes(resource);
    return kitMaterialList(this.kit.M).some(
      (material) => mapSlotOf(material) === resource,
    );
  }

  private disposalsOf(resource: Disposable): number {
    return required(this.disposals.get(resource), "a watched resource")();
  }

  private labelsOf(resources: readonly Disposable[]): string[] {
    return resources
      .map((resource) => required(this.labels.get(resource), "a label"))
      .sort();
  }
}

type Disposable = THREE.BufferGeometry | THREE.Material | THREE.Texture;

interface LabelledResource {
  readonly label: string;
  readonly resource: Disposable;
}

/** Every resource the five shell children render from, the run-end panel's included: the panel is
 *  in this walk precisely so that freeing it would be reported. */
function shellResourcesOf(shell: THREE.Object3D): LabelledResource[] {
  const found: LabelledResource[] = [];
  for (const child of shell.children) {
    if (!isMesh(child)) continue;
    const material = soleMaterialOf(child);
    found.push({ label: `${child.name} geometry`, resource: child.geometry });
    found.push({ label: `${child.name} material`, resource: material });
    const map = mapSlotOf(material);
    if (map) found.push({ label: `${child.name} map`, resource: map });
  }
  return found;
}

/** Counts `dispose` calls on one resource without changing what `dispose` does. */
function watchDisposal(resource: Disposable): () => number {
  const spy = vi.spyOn(resource, "dispose");
  return () => spy.mock.calls.length;
}

interface BuiltShell {
  readonly kit: Kit;
  readonly shell: THREE.Group;
}

function shellFor(room: DesignRoom): BuiltShell {
  const kit = makeKit({ createCanvas: createHeadlessCanvas });
  return { kit, shell: buildKitchenShell(kit, room) };
}

/** A room that differs from its neighbours on all three axes, so a hundred corrections walk the
 *  whole policy rather than one line through it. The primes keep the three cycles from resonating. */
function correctionNumber(index: number): DesignRoom {
  return roomOf(
    WALL_A.minMm + ((index * 617) % (WALL_A.maxMm - WALL_A.minMm)),
    WALL_B.minMm + ((index * 421) % (WALL_B.maxMm - WALL_B.minMm)),
    HEIGHT.minMm + ((index * 173) % (HEIGHT.maxMm - HEIGHT.minMm)),
  );
}

interface ChildDrawing {
  readonly name: string;
  readonly extent: readonly [number, number, number];
  readonly position: readonly [number, number, number];
  readonly repeat: readonly [number, number] | null;
}

/** Everything about the drawn room a customer can see: how big each child is, where it stands, and
 *  how its map is tiled. Read as plain numbers so two shells from two kits can be compared. */
function drawingOf(shell: THREE.Object3D): ChildDrawing[] {
  return RESIZED_CHILD_NAMES.map((name) => {
    const mesh = meshNamed(shell, name);
    const map = mapOf(mesh);
    return {
      name,
      extent: extentOf(mesh),
      position: mesh.position.toArray(),
      repeat: map ? ([map.repeat.x, map.repeat.y] as const) : null,
    };
  });
}

function expectSameDrawing(
  actual: readonly ChildDrawing[],
  expected: readonly ChildDrawing[],
): void {
  expect(actual.map((child) => child.name)).toEqual(
    expected.map((child) => child.name),
  );
  for (const [index, child] of actual.entries()) {
    const reference = required(expected[index], `${child.name} reference`);
    for (const axis of [0, 1, 2] as const) {
      expect(child.extent[axis], `${child.name} extent`).toBeCloseTo(
        reference.extent[axis],
        6,
      );
      expect(child.position[axis], `${child.name} position`).toBeCloseTo(
        reference.position[axis],
        6,
      );
    }
    expectSameTiling(child, reference);
  }
}

function expectSameTiling(child: ChildDrawing, reference: ChildDrawing): void {
  if (!child.repeat || !reference.repeat) {
    expect(child.repeat, `${child.name} repeat`).toEqual(reference.repeat);
    return;
  }
  for (const axis of [0, 1] as const) {
    expect(child.repeat[axis], `${child.name} repeat`).toBeCloseTo(
      reference.repeat[axis],
      6,
    );
  }
}

/** One plank and one tile, in metres, as the **reference builder** draws them — measured off a
 *  fresh reference room rather than written down, so this cannot drift into agreeing with a
 *  literal that moved. */
const REFERENCE_DENSITY = measureReferenceDensity();

function measureReferenceDensity() {
  const kit = makeKit({ createCanvas: createHeadlessCanvas });
  const reference = kit.builders["kitchen-l"]();
  const floor = meshNamed(reference, "floor");
  const backsplash = meshNamed(reference, "backsplash_wall_a");
  const floorRepeat = required(mapOf(floor), "reference floor map").repeat;
  return {
    plankAlongWallA: extentOf(floor)[0] / floorRepeat.x,
    plankAlongWallB: extentOf(floor)[2] / floorRepeat.y,
    tileWidth:
      extentOf(backsplash)[0] /
      required(mapOf(backsplash), "reference tile map").repeat.x,
  };
}

/** A child that can be seen. The two wall planes are legitimately zero along their normal — they
 *  are `PlaneGeometry` and always have been — so the claim is that every axis is a real number, no
 *  axis has gone negative, and the child still covers an area rather than a line or a point. */
function expectDrawableExtent(mesh: THREE.Mesh): void {
  const extent = extentOf(mesh);
  for (const axis of extent) {
    expect(Number.isFinite(axis), `${mesh.name} extent is finite`).toBe(true);
    expect(axis, `${mesh.name} extent`).toBeGreaterThanOrEqual(0);
  }
  const spanned = extent.filter((axis) => axis > 0);
  expect(spanned.length, `${mesh.name} spanned axes`).toBeGreaterThanOrEqual(2);
}

/** A repeat of zero paints one stretched texel over the whole floor and a negative one mirrors it;
 *  a `NaN` drops the map entirely. All three are rooms a customer could be shown. */
function expectDrawableTiling(mesh: THREE.Mesh): void {
  const map = mapOf(mesh);
  if (!map) return;
  for (const [axis, value] of [
    ["u", map.repeat.x],
    ["v", map.repeat.y],
  ] as const) {
    expect(Number.isFinite(value), `${mesh.name} repeat.${axis}`).toBe(true);
    expect(value, `${mesh.name} repeat.${axis}`).toBeGreaterThan(0);
  }
}

function expectConstantWorldDensity(shell: THREE.Object3D): void {
  const floor = meshNamed(shell, "floor");
  const backsplash = meshNamed(shell, "backsplash_wall_a");
  const floorRepeat = required(mapOf(floor), "floor map").repeat;
  const tileRepeat = required(mapOf(backsplash), "tile map").repeat;

  expect(extentOf(floor)[0] / floorRepeat.x).toBeCloseTo(
    REFERENCE_DENSITY.plankAlongWallA,
    6,
  );
  expect(extentOf(floor)[2] / floorRepeat.y).toBeCloseTo(
    REFERENCE_DENSITY.plankAlongWallB,
    6,
  );
  expect(extentOf(backsplash)[0] / tileRepeat.x).toBeCloseTo(
    REFERENCE_DENSITY.tileWidth,
    6,
  );
}

function panelVisibilityAt(widthMm: number): boolean {
  const room = { ...SEEDED_ROOM, widthMm };
  const { shell } = shellFor(room);
  const solidsRoot = new THREE.Group();
  solidsRoot.add(shell);
  syncRunEndPanel({ solidsRoot, records: SEEDED_RECORDS, room });
  return meshNamed(shell, RUN_END_PANEL_NAME).visible;
}

function meshNamed(shell: THREE.Object3D, name: string): THREE.Mesh {
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
  return mapSlotOf(soleMaterialOf(mesh));
}

function mapSlotOf(material: THREE.Material): THREE.Texture | undefined {
  const map: unknown = (material as { map?: unknown }).map;
  return isTexture(map) ? map : undefined;
}
