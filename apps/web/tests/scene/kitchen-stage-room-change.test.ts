// Wave 7H slice 3: what the stage does when the customer's room changes.
//
// The adapter's suite proves the shell is a correct function of the room. This proves the wiring —
// that a room change reaches the shell **and reaches nothing else**. Two of the three claims are
// about what does *not* happen, so they need a renderer that can tell a re-render from a rebuild.
//
// **The hook mock below is a dependency-aware `useMemo` / `useEffect` / `useRef`, and that is the
// only reason this file exists rather than an assertion in `kitchen-stage.test.ts`.** That file's
// `useMemo` recomputes on every call, which is right for the questions it asks and makes
// *"the memo did not rebuild"* unaskable. What is emulated: cells in call order, `Object.is` on the
// dependency array, cleanups replayed before a re-run. What is **not**: StrictMode's double
// invocation, batching, and React's running of effects after paint rather than during the render
// call. None of the three bears on the claims here.
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

vi.mock("@lemnaria/three-adapter", async () => {
  const THREE = await import("three");
  return {
    applyCornerDirection: harness.applyCornerDirection,
    applyCornerDirectionToLightRig: harness.applyCornerDirectionToLightRig,
    applyFinish: vi.fn(),
    buildKitchenShell: harness.buildKitchenShell,
    buildOverflowMark: vi.fn(() => ({ group: new THREE.Group() })),
    buildSelectionOutline: vi.fn(() => ({ group: new THREE.Group() })),
    collectFronts: vi.fn(() => []),
    configureRenderer: vi.fn(),
    createBodyProbe: vi.fn(() => ({ measure: vi.fn() })),
    createContactBlob: vi.fn(() => new THREE.Group()),
    createLightRig: vi.fn(() => ({
      fill: new THREE.Group(),
      hemisphere: new THREE.Group(),
      key: new THREE.Group(),
    })),
    createPickingRaycaster: vi.fn(() => new THREE.Raycaster()),
    createShadowGround: vi.fn(() => new THREE.Group()),
    createStudioEnvironment: vi.fn(() => new THREE.Texture()),
    disposeKit: vi.fn(),
    disposeKitAndStage: vi.fn(),
    disposeOverflowMark: vi.fn(),
    disposeSelectionOutline: vi.fn(),
    findCameraPreset: vi.fn(() => ({
      id: "overview",
      label: "Overview",
      position: [4.3, 3, 5.3],
      target: [1.6, 1.35, 0.85],
    })),
    isDragGesture: vi.fn(() => false),
    makeKit: harness.makeKit,
    pick: vi.fn(() => null),
    resizeShellToRoom: harness.resizeShellToRoom,
    seatObjectOnStage: harness.seatObjectOnStage,
    syncSolidBodies: harness.syncSolidBodies,
    syncVoidMeshes: vi.fn(),
  };
});

import { createLightRig } from "@lemnaria/three-adapter";

import { KitchenStage } from "../../src/scene/kitchen-stage";

const SEEDED_ROOM = KITCHEN_L_DESIGN.room;
/** A wall A the customer corrected by 400 mm, inside the approved bounds. */
const CORRECTED_ROOM: DesignRoom = { ...SEEDED_ROOM, widthMm: 3960 };

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

/** One render pass: the hook cursor restarts and the component runs, exactly as React re-invokes
 *  a function component. */
function render(): void {
  harness.cursor = 0;
  KitchenStage({
    view: { kind: "fixed", position: [4.3, 3, 5.3], target: [1.6, 1.35, 0.85] },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  harness.cells = [];
  harness.cursor = 0;
  vi.stubGlobal("React", React);

  harness.kit = { builders: { "kitchen-l": harness.referenceBuilder } };
  harness.makeKit.mockImplementation(() => harness.kit);
  harness.referenceBuilder.mockReturnValue(new THREE.Group());
  // A fresh group per build, so "the effect was handed the shell the memo made" is a real claim.
  harness.buildKitchenShell.mockImplementation(() => {
    const shell = new THREE.Group();
    shell.name = "kitchen_l_shape";
    return shell;
  });

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

describe("a room change redraws the shell and rebuilds nothing", () => {
  it("resizes the shell the memo built, at the new room", () => {
    render();
    const shell = harness.buildKitchenShell.mock.results[0]?.value as
      | THREE.Group
      | undefined;

    harness.storeState.design = designWith(CORRECTED_ROOM);
    render();

    expect(harness.resizeShellToRoom).toHaveBeenLastCalledWith({
      kit: harness.kit,
      shell,
      room: CORRECTED_ROOM,
    });
  });

  it("keeps the kit, the shell and every mounted body", () => {
    render();

    harness.storeState.design = designWith(CORRECTED_ROOM);
    render();

    expect(harness.makeKit).toHaveBeenCalledOnce();
    expect(harness.buildKitchenShell).toHaveBeenCalledOnce();
    expect(harness.buildKitchenShell).toHaveBeenCalledWith(
      harness.kit,
      SEEDED_ROOM,
    );
  });

  /** ADR 0074 decision 7: the customer's orbit is theirs. Someone who has turned their kitchen
   *  round and then corrects a wall length must not be thrown back to the preset. */
  it("does not re-seat the camera", () => {
    render();

    harness.storeState.design = designWith(CORRECTED_ROOM);
    render();

    expect(harness.seatObjectOnStage).toHaveBeenCalledOnce();
  });

  it("asks for a frame, since nothing else will", () => {
    render();
    harness.invalidate.mockClear();

    harness.storeState.design = designWith(CORRECTED_ROOM);
    render();

    expect(harness.invalidate).toHaveBeenCalled();
  });
});

/** Non-vacuity. *"The memo did not rebuild"* is only evidence if this harness can see a rebuild,
 *  and *"the shell was redrawn"* is only evidence if a redraw is not what happens every render. */
describe("the harness can tell a rebuild from a re-render", () => {
  it("rebuilds the whole stage when the cabinet depth changes", () => {
    render();

    harness.storeState.design = designWith(SEEDED_ROOM, 700);
    render();

    expect(harness.makeKit).toHaveBeenCalledTimes(2);
    expect(harness.buildKitchenShell).toHaveBeenCalledTimes(2);
    expect(harness.seatObjectOnStage).toHaveBeenCalledTimes(2);
  });

  it("redraws nothing when the room the design holds has not changed", () => {
    render();
    render();

    expect(harness.resizeShellToRoom).toHaveBeenCalledOnce();
    expect(harness.syncSolidBodies).toHaveBeenCalledOnce();
  });
});

// =================================================================================================
// 7I-A13 — in place: a direction change rebuilds nothing, and survives a resize and a depth rebuild.
// =================================================================================================

/** A right-hand twin of the seeded room, same dimensions — the change under test is only the
 *  direction. */
const RIGHT_ROOM: DesignRoom = { ...SEEDED_ROOM, cornerDirection: "right" };

describe("a direction change (ADR 0129 D4/D6) applies in place", () => {
  it("mirrors the stage's own root and light rig, and rebuilds nothing", () => {
    render();
    const lights = (createLightRig as ReturnType<typeof vi.fn>).mock.results[0]
      ?.value as { key: THREE.Object3D; fill: THREE.Object3D };

    harness.storeState.design = designWith(RIGHT_ROOM);
    render();

    expect(harness.applyCornerDirection).toHaveBeenCalledWith(
      expect.any(THREE.Group),
      "right",
    );
    expect(harness.applyCornerDirectionToLightRig).toHaveBeenCalledWith(
      lights,
      "right",
    );
    expect(harness.makeKit).toHaveBeenCalledOnce();
    expect(harness.buildKitchenShell).toHaveBeenCalledOnce();
    // QA 7I-Q2: the flip re-seats — the contact blob and the shadow ground were left on the old
    // side otherwise (`qa-7i-stage-direction.adversarial.test.ts` is where that is proven with the
    // real primitive). "Rebuilds nothing" is `makeKit`/`buildKitchenShell` staying at one call
    // each, not `seatObjectOnStage` staying at one — a second seat is a reposition, not a rebuild.
    expect(harness.seatObjectOnStage).toHaveBeenCalledTimes(2);
  });

  it("reads left for an absent direction, exactly as an unmirrored room does", () => {
    render();

    expect(harness.applyCornerDirection).toHaveBeenCalledWith(
      expect.any(THREE.Group),
      "left",
    );
    expect(harness.applyCornerDirectionToLightRig).toHaveBeenCalledWith(
      expect.anything(),
      "left",
    );
  });

  it("survives a subsequent resize: the mirror is reapplied and nothing is rebuilt", () => {
    render();

    harness.storeState.design = designWith(RIGHT_ROOM);
    render();
    harness.storeState.design = designWith(CORRECTED_ROOM_RIGHT);
    render();

    expect(harness.applyCornerDirection).toHaveBeenLastCalledWith(
      expect.any(THREE.Group),
      "right",
    );
    expect(harness.resizeShellToRoom).toHaveBeenLastCalledWith(
      expect.objectContaining({ room: CORRECTED_ROOM_RIGHT }),
    );
    expect(harness.makeKit).toHaveBeenCalledOnce();
    expect(harness.buildKitchenShell).toHaveBeenCalledOnce();
  });

  it("survives a depth change's rebuild: the new stage is mirrored too", () => {
    render();

    harness.storeState.design = designWith(RIGHT_ROOM, 700);
    render();

    expect(harness.makeKit).toHaveBeenCalledTimes(2);
    expect(harness.applyCornerDirection).toHaveBeenLastCalledWith(
      expect.any(THREE.Group),
      "right",
    );
  });
});

/** `CORRECTED_ROOM`'s wall-A correction, carried on a right-hand room — the resize test above needs
 *  a room that changes on **two** axes (a wall length and none, since the direction is already
 *  right) so it cannot pass by re-detecting the direction alone. */
const CORRECTED_ROOM_RIGHT: DesignRoom = {
  ...CORRECTED_ROOM,
  cornerDirection: "right",
};

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
