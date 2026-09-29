// M7 wave 7I review round 1, L1.3: an in-place direction flip re-seats the stage (real
// `seatObjectOnStage`, same as `qa-7i-stage-direction.adversarial.test.ts`), but the camera and its
// orbit target must not move with it — the flip is a mirror of the *scene*, not a reframe of the
// *view*. Harness copied from that file (see its header for what it does and does not emulate);
// the one difference that matters here is a **non-null** `controls` object with a real `target` and
// a spyable `update`, and a **fixed** (non-preset) `view`, so a deleted restore has somewhere to go
// wrong.
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
  buildKitchenShell: vi.fn(),
  invalidate: vi.fn(),
  kit: {} as Record<string, unknown>,
  makeKit: vi.fn(),
  referenceBuilder: vi.fn(),
  resizeShellToRoom: vi.fn(),
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

function designWith(room: DesignRoom): Design {
  return { ...KITCHEN_L_DESIGN, room };
}

const FIXED_VIEW = {
  kind: "fixed" as const,
  position: [4.3, 3, 5.3] as [number, number, number],
  target: [1.6, 1.35, 0.85] as [number, number, number],
};

function render(): void {
  harness.cursor = 0;
  KitchenStage({ view: FIXED_VIEW });
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
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(...FIXED_VIEW.position);
  harness.threeState = {
    camera,
    controls: {
      target: new THREE.Vector3(9.9, -1.1, 2.2),
      update: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
    gl: { domElement: fakeCanvas() },
    invalidate: harness.invalidate,
    scene: new THREE.Scene(),
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("7I review L1.3 — a direction flip holds a fixed, orbited camera in place", () => {
  it("does not move the camera or the orbit target across the flip", () => {
    render();
    const controls = harness.threeState.controls as {
      target: THREE.Vector3;
      update: () => void;
    };
    const camera = harness.threeState.camera as THREE.PerspectiveCamera;

    const heldCameraPosition = camera.position.clone();
    const heldOrbitTarget = controls.target.clone();

    harness.storeState.design = designWith(RIGHT_ROOM);
    render();

    expect(camera.position.equals(heldCameraPosition)).toBe(true);
    expect(controls.target.equals(heldOrbitTarget)).toBe(true);
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
