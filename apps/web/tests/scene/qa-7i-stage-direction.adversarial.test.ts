// M7 wave 7I adversarial QA, criterion A13 with A18's "the contact blob under the kitchen": a
// direction change on a **standing** stage, with the real mirror, the real light rig and the real
// `seatObjectOnStage` — the harness in `kitchen-stage-room-change.test.ts` mocks all three, so it
// can say the mirror was *called* but not where the kitchen, its blob and its key light end up.
//
// Dependency-aware hook emulation copied from that file (see its header for what it does and does
// not emulate).
import {
  derivePlacementRecords,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  type Design,
  type DesignRoom,
} from "@lemnaria/configurator-domain";
import * as React from "react";
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface HookCell {
  deps: readonly unknown[] | undefined;
  value?: unknown;
  cleanup?: () => void;
}

const harness = vi.hoisted(() => ({
  cells: [] as {
    deps: readonly unknown[] | undefined;
    value?: unknown;
    cleanup?: () => void;
  }[],
  cursor: 0,
  applyCornerDirection: vi.fn(),
  applyCornerDirectionToLightRig: vi.fn(),
  buildKitchenShell: vi.fn(),
  invalidate: vi.fn(),
  kit: {} as Record<string, unknown>,
  makeKit: vi.fn(),
  referenceBuilder: vi.fn(),
  resizeShellToRoom: vi.fn(),
  seatObjectOnStage: vi.fn(),
  storeState: {} as Record<string, unknown>,
  syncSolidBodies: vi.fn(),
  threeState: {} as Record<string, unknown>,
}));

function sameDependencies(
  previous: readonly unknown[] | undefined,
  next: readonly unknown[] | undefined,
): boolean {
  if (!previous || !next) return false;
  return (
    previous.length === next.length &&
    previous.every((value, index) => Object.is(value, next[index]))
  );
}

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect(effect: () => unknown, deps?: readonly unknown[]) {
      const cell: HookCell | undefined = harness.cells[harness.cursor];
      const index = harness.cursor++;
      if (cell && sameDependencies(cell.deps, deps)) return;
      cell?.cleanup?.();
      const cleanup = effect();
      harness.cells[index] =
        typeof cleanup === "function"
          ? { deps, cleanup: cleanup as () => void }
          : { deps };
    },
    useMemo<T>(factory: () => T, deps?: readonly unknown[]): T {
      const cell: HookCell | undefined = harness.cells[harness.cursor];
      const index = harness.cursor++;
      if (cell && sameDependencies(cell.deps, deps)) return cell.value as T;
      const value = factory();
      harness.cells[index] = { deps, value };
      return value;
    },
    useRef<T>(initial: T): { current: T } {
      const cell: HookCell | undefined = harness.cells[harness.cursor];
      const index = harness.cursor++;
      if (cell) return cell.value as { current: T };
      const ref = { current: initial };
      harness.cells[index] = { deps: [], value: ref };
      return ref;
    },
  };
});

vi.mock("@react-three/fiber", () => ({
  useFrame: vi.fn(),
  useThree<T>(selector: (state: Record<string, unknown>) => T): T {
    return selector(harness.threeState);
  },
}));

vi.mock("../../src/store/configurator-store", () => ({
  useConfiguratorStore<T>(selector: (state: Record<string, unknown>) => T): T {
    return selector(harness.storeState);
  },
}));

vi.mock("@lemnaria/three-adapter", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@lemnaria/three-adapter")>();
  const THREE = await import("three");
  // **Real**: the mirror primitive, the light rig and its reflection, and `seatObjectOnStage` (which
  // positions the contact blob and the shadow ground). **Faked**: everything that needs a canvas or
  // a GPU, and the shell/bodies, which are stood in for by one box spanning wall A's run.
  return {
    ...actual,
    applyFinish: vi.fn(),
    buildKitchenShell: harness.buildKitchenShell,
    buildOverflowMark: vi.fn(() => ({ group: new THREE.Group() })),
    buildSelectionOutline: vi.fn(() => ({ group: new THREE.Group() })),
    collectFronts: vi.fn(() => []),
    configureRenderer: vi.fn(),
    createBodyProbe: vi.fn(() => ({ measure: vi.fn() })),
    createContactBlob: vi.fn(() => new THREE.Mesh()),
    createStudioEnvironment: vi.fn(() => new THREE.Texture()),
    disposeKit: vi.fn(),
    disposeKitAndStage: vi.fn(),
    disposeOverflowMark: vi.fn(),
    disposeSelectionOutline: vi.fn(),
    makeKit: harness.makeKit,
    resizeShellToRoom: harness.resizeShellToRoom,
    syncSolidBodies: harness.syncSolidBodies,
    syncVoidMeshes: vi.fn(),
    applyCutaway: vi.fn(),
    cutawayWallsFor: vi.fn(() => []),
  };
});

import { KitchenStage } from "../../src/scene/kitchen-stage";

const SEEDED_ROOM = KITCHEN_L_DESIGN.room;
const RIGHT_ROOM: DesignRoom = { ...SEEDED_ROOM, cornerDirection: "right" };
const SEEDED_RECORDS = derivePlacementRecords(
  KITCHEN_L_DESIGN,
  KITCHEN_L_BODY_CATALOG,
);

function designWith(room: DesignRoom, cabinetDepthMm?: number): Design {
  return {
    ...KITCHEN_L_DESIGN,
    room,
    ...(cabinetDepthMm === undefined ? {} : { settings: { cabinetDepthMm } }),
  };
}

function render(): void {
  harness.cursor = 0;
  KitchenStage({
    view: { kind: "fixed", position: [4.3, 3, 5.3], target: [1.6, 1.35, 0.85] },
  });
}

/** A stand-in shell: one box spanning wall A's run from the corner (x = 0) to x = width, which is
 *  where the real shell's floor and wall A stand in the canonical (left) frame. */
function boxShell(room: DesignRoom): THREE.Group {
  const shell = new THREE.Group();
  const widthM = room.widthMm / 1000;
  const box = new THREE.Mesh(new THREE.BoxGeometry(widthM, 0.9, 0.6));
  box.position.set(widthM / 2, 0.45, 0.3);
  shell.add(box);
  return shell;
}

function primitives(): {
  room: THREE.Group;
  blob: THREE.Object3D;
  key: THREE.Object3D;
} {
  const cell = harness.cells.find(
    (candidate) =>
      candidate.value !== undefined &&
      typeof candidate.value === "object" &&
      candidate.value !== null &&
      "blob" in candidate.value,
  );
  const stage = cell?.value as {
    room: THREE.Group;
    blob: THREE.Object3D;
    lights: { key: THREE.Object3D };
  };
  return { room: stage.room, blob: stage.blob, key: stage.lights.key };
}

function kitchenCentreX(room: THREE.Group): number {
  room.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(room).getCenter(new THREE.Vector3()).x;
}

beforeEach(() => {
  vi.clearAllMocks();
  harness.cells = [];
  harness.cursor = 0;
  vi.stubGlobal("React", React);
  harness.kit = { builders: { "kitchen-l": harness.referenceBuilder } };
  harness.makeKit.mockImplementation(() => harness.kit);
  harness.buildKitchenShell.mockImplementation(
    (_kit: unknown, room: DesignRoom) => boxShell(room),
  );
  harness.storeState = {
    attachBodyProbe: vi.fn(),
    deselect: vi.fn(),
    design: designWith(SEEDED_ROOM),
    detachBodyProbe: vi.fn(),
    records: SEEDED_RECORDS,
    select: vi.fn(),
    selection: null,
    voids: [],
  };
  harness.threeState = {
    camera: new THREE.PerspectiveCamera(),
    controls: null,
    gl: { domElement: fakeCanvas() },
    invalidate: harness.invalidate,
    scene: new THREE.Scene(),
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("7I — a right-hand design mounted fresh", () => {
  it("seats the contact blob under the mirrored kitchen", () => {
    harness.storeState.design = designWith(RIGHT_ROOM);
    render();
    const { room, blob } = primitives();

    expect(kitchenCentreX(room)).toBeLessThan(0);
    expect(blob.position.x).toBeCloseTo(kitchenCentreX(room), 9);
  });

  it("puts the key light on the mirrored side", () => {
    harness.storeState.design = designWith(RIGHT_ROOM);
    render();

    expect(primitives().key.position.x).toBeLessThan(0);
  });
});

describe("7I-A13 — a direction change on a standing stage", () => {
  it("mirrors the kitchen in place (non-vacuous: the root really flips)", () => {
    render();
    const leftCentre = kitchenCentreX(primitives().room);

    harness.storeState.design = designWith(RIGHT_ROOM);
    render();

    expect(kitchenCentreX(primitives().room)).toBeCloseTo(-leftCentre, 9);
  });

  it("keeps the contact blob under the kitchen after the flip", () => {
    render();

    harness.storeState.design = designWith(RIGHT_ROOM);
    render();
    const { room, blob } = primitives();

    expect(blob.position.x).toBeCloseTo(kitchenCentreX(room), 9);
  });

  it("keeps the blob under the kitchen after flipping back to left", () => {
    harness.storeState.design = designWith(RIGHT_ROOM);
    render();

    harness.storeState.design = designWith(SEEDED_ROOM);
    render();
    const { room, blob } = primitives();

    expect(blob.position.x).toBeCloseTo(kitchenCentreX(room), 9);
  });

  it("keeps the mirror, the blob and the key on the right side across a 600 → 700 rebuild", () => {
    harness.storeState.design = designWith(RIGHT_ROOM);
    render();

    harness.storeState.design = designWith(RIGHT_ROOM, 700);
    render();
    const { room, blob, key } = primitives();

    expect(room.scale.x).toBe(-1);
    expect(blob.position.x).toBeCloseTo(kitchenCentreX(room), 9);
    expect(key.position.x).toBeLessThan(0);
  });
});

function fakeCanvas() {
  return {
    addEventListener: vi.fn(),
    getBoundingClientRect: vi.fn(() => ({
      bottom: 1,
      height: 1,
      left: 0,
      right: 1,
      top: 0,
      width: 1,
    })),
    removeEventListener: vi.fn(),
  };
}
