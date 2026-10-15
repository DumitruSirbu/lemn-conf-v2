// SCENE-002: what happens when this component goes away.
//
// R3F's reconciler never disposes a `<primitive>` — it skips disposal when
// `instance.type === 'primitive'` — and every object the stage mounts is one, so the component's
// own effect cleanups are the entire teardown. This suite runs the effects the way React does:
// their cleanups are collected in declaration order and replayed in that order, which is exactly
// what React's unmount does, and it is what keeps the selection outline leaving `stage.room` before
// the stage teardown walks it.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import * as React from "react";
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  cleanups: [] as (() => void)[],
  /** The placement the mocked shell answers to, so the outline effect finds a target. */
  selectedPlacementId: "p1",
  disposeKitAndStage: vi.fn(),
  disposeOverflowMark: vi.fn(),
  disposeSelectionOutline: vi.fn(),
  outline: null as THREE.Group | null,
  overflowMarks: [] as THREE.Group[],
  roomAtDisposal: null as readonly THREE.Object3D[] | null,
  storeState: {} as Record<string, unknown>,
  threeState: {} as Record<string, unknown>,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect(effect: () => unknown) {
      const cleanup = effect();
      if (typeof cleanup === "function") {
        harness.cleanups.push(cleanup as () => void);
      }
    },
    useMemo<T>(factory: () => T): T {
      return factory();
    },
    useRef<T>(initial: T): { current: T } {
      return { current: initial };
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
  const named = (name: string) => {
    const group = new THREE.Group();
    group.name = name;
    return group;
  };
  return {
    applyCornerDirection: vi.fn(),
    applyCornerDirectionToLightRig: vi.fn(),
    applyFinish: vi.fn(),
    buildKitchenShell: vi.fn(() => {
      const shell = new THREE.Group();
      shell.name = "kitchen_l_shape";
      shell.userData.placementId = harness.selectedPlacementId;
      return shell;
    }),
    buildOverflowMark: vi.fn(() => {
      const group = new THREE.Group();
      group.name = "overflow_mark";
      harness.overflowMarks.push(group);
      return { group };
    }),
    buildSelectionOutline: vi.fn(() => {
      harness.outline = new THREE.Group();
      harness.outline.name = "selection_outline";
      return { group: harness.outline };
    }),
    collectFronts: vi.fn(() => []),
    configureRenderer: vi.fn(),
    createBodyProbe: vi.fn(() => ({ measure: vi.fn() })),
    // Each part is named for the factory that made it, so the teardown's fields can be told apart: handed two
    // anonymous groups, a stage that had its ground and its blob the wrong way round looked the same.
    createContactBlob: vi.fn(() => named("contact_blob")),
    createLightRig: vi.fn(() => ({
      fill: named("fill_light"),
      hemisphere: named("hemisphere_light"),
      key: named("key_light"),
    })),
    createPickingRaycaster: vi.fn(() => new THREE.Raycaster()),
    createShadowGround: vi.fn(() => named("shadow_ground")),
    createStudioEnvironment: vi.fn(() => new THREE.Texture()),
    disposeKitAndStage: harness.disposeKitAndStage,
    disposeOverflowMark: harness.disposeOverflowMark,
    disposeSelectionOutline: harness.disposeSelectionOutline,
    findCameraPreset: vi.fn(() => ({
      id: "overview",
      position: [4.3, 3, 5.3],
      target: [1.6, 1.35, 0.85],
    })),
    isDragGesture: vi.fn(() => false),
    makeKit: vi.fn(() => ({ M: {} })),
    pick: vi.fn(() => null),
    resizeShellToRoom: vi.fn(),
    seatObjectOnStage: vi.fn(),
    syncSolidBodies: vi.fn(),
    syncVoidMeshes: vi.fn(),
    applyCutaway: vi.fn(),
    cutawayWallsFor: vi.fn(() => []),
  };
});

import { KitchenStage } from "../../src/scene/kitchen-stage";

const OVERVIEW_VIEW = {
  kind: "fixed",
  position: [4.3, 3, 5.3],
  target: [1.6, 1.35, 0.85],
} as const;

interface DisposedStage {
  readonly kit: unknown;
  readonly room: THREE.Object3D;
  readonly ground: THREE.Object3D;
  readonly blob: THREE.Object3D;
  readonly lights: Record<string, THREE.Object3D>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  harness.cleanups = [];
  harness.outline = null;
  harness.overflowMarks = [];
  harness.roomAtDisposal = null;
  harness.disposeKitAndStage.mockImplementation((stage: DisposedStage) => {
    harness.roomAtDisposal = [...stage.room.children];
  });

  harness.storeState = {
    attachBodyProbe: vi.fn(),
    deselect: vi.fn(),
    design: KITCHEN_L_DESIGN,
    detachBodyProbe: vi.fn(),
    records: [],
    select: vi.fn(),
    selection: null,
    voids: [],
  };
  harness.threeState = {
    camera: new THREE.PerspectiveCamera(),
    controls: null,
    gl: {
      domElement: {
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
      },
    },
    invalidate: vi.fn(),
    scene: new THREE.Scene(),
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Mounts the component and replays its cleanups the way React's unmount does — in the order the
 * effects were declared.
 *
 * That order is the coupling this file exists to pin. `useEffect` above pushes each cleanup as the
 * effect runs, so `harness.cleanups` is in source declaration order, and running it front to back
 * reproduces React's own unmount. It is why the outline test below can assert the outline has left
 * `stage.room` before `disposeKitAndStage` is called: swap the two `useEffect` blocks in
 * `kitchen-stage.tsx` and that assertion fails here.
 */
function mountAndUnmount(): void {
  KitchenStage({ view: OVERVIEW_VIEW });
  const cleanups = [...harness.cleanups];
  harness.cleanups = [];
  for (const cleanup of cleanups) cleanup();
}

function disposedStage(call: number): DisposedStage {
  const stage = harness.disposeKitAndStage.mock.calls[call]?.[0] as
    | DisposedStage
    | undefined;
  if (!stage) {
    throw new Error(
      `the stage teardown ran fewer than ${String(call + 1)} times`,
    );
  }
  return stage;
}

describe("KitchenStage teardown", () => {
  it("disposes the kit and the whole stage exactly once on unmount", () => {
    mountAndUnmount();

    expect(harness.disposeKitAndStage).toHaveBeenCalledTimes(1);
  });

  it("hands the teardown the kit, room, ground, blob and lights it mounted", () => {
    mountAndUnmount();

    const stage = disposedStage(0);
    expect(stage.kit).toBeDefined();
    expect(stage.room.name).toBe("kitchen_l_shape");
    expect(stage.ground.name).toBe("shadow_ground");
    expect(stage.blob.name).toBe("contact_blob");
    expect(
      Object.entries(stage.lights)
        .map(([field, light]) => [field, light.name])
        .sort(),
    ).toEqual([
      ["fill", "fill_light"],
      ["hemisphere", "hemisphere_light"],
      ["key", "key_light"],
    ]);
  });

  it("disposes each mount's own stage when the component is remounted", () => {
    mountAndUnmount();
    mountAndUnmount();

    expect(harness.disposeKitAndStage).toHaveBeenCalledTimes(2);
    expect(disposedStage(0).room).not.toBe(disposedStage(1).room);
  });

  it("disposes the mounted selection outline and detaches it before the stage teardown", () => {
    harness.storeState.selection = {
      kind: "placement",
      id: harness.selectedPlacementId,
    };

    mountAndUnmount();

    const outline = harness.outline;
    expect(outline, "no selection outline was built").not.toBeNull();
    expect(harness.disposeSelectionOutline).toHaveBeenCalledTimes(1);
    expect(harness.disposeSelectionOutline).toHaveBeenCalledWith(outline);
    expect(harness.roomAtDisposal).not.toContain(outline);
  });

  it("leaves no outline to dispose when nothing was selected", () => {
    mountAndUnmount();

    expect(harness.disposeSelectionOutline).not.toHaveBeenCalled();
    expect(harness.disposeKitAndStage).toHaveBeenCalledTimes(1);
  });
});
