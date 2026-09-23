// Adversarial QA on wave 7D1b — `KitchenStage` hands the run-end panel's wall-end veto the live room
// (ADR 0045 Amendment A). The stage's own test runs every effect on every render, so it cannot see a
// dependency list. This harness honours `useEffect` and `useMemo` dependencies the way React does —
// an effect re-runs only when one of its dependencies changed identity — so it can tell whether a
// room change and a design swap (the store's `hydrate`) actually re-sync the solids, panel included.
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

const harness = vi.hoisted(() => ({
  buildKitchenShell: vi.fn(),
  kit: {} as Record<string, unknown>,
  referenceBuilder: vi.fn(),
  storeState: {} as Record<string, unknown>,
  syncSolidBodies: vi.fn(),
  threeState: {} as Record<string, unknown>,
  /** One slot per hook call, in call order, as React keys hooks. Reset before every render. */
  hookIndex: 0,
  hookDeps: [] as (readonly unknown[] | undefined)[],
  memoValues: [] as unknown[],
}));

function depsChanged(
  index: number,
  deps: readonly unknown[] | undefined,
): boolean {
  const previous = harness.hookDeps[index];
  if (deps === undefined || previous === undefined) return true;
  return (
    deps.length !== previous.length ||
    deps.some(
      (dependency, position) => !Object.is(dependency, previous[position]),
    )
  );
}

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect(effect: () => unknown, deps?: readonly unknown[]) {
      const index = harness.hookIndex++;
      if (!depsChanged(index, deps)) return;
      harness.hookDeps[index] = deps;
      effect();
    },
    useMemo<T>(factory: () => T, deps?: readonly unknown[]): T {
      const index = harness.hookIndex++;
      if (depsChanged(index, deps)) {
        harness.hookDeps[index] = deps;
        harness.memoValues[index] = factory();
      }
      return harness.memoValues[index] as T;
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
  return {
    applyCornerDirection: vi.fn(),
    applyCornerDirectionToLightRig: vi.fn(),
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
    disposeOverflowMark: vi.fn(),
    disposeSelectionOutline: vi.fn(),
    findCameraPreset: vi.fn(() => ({
      id: "overview",
      label: "Overview",
      position: [4.3, 3, 5.3],
      target: [1.6, 1.35, 0.85],
    })),
    isDragGesture: vi.fn(() => false),
    makeKit: vi.fn(() => harness.kit),
    pick: vi.fn(() => null),
    resizeShellToRoom: vi.fn(),
    seatObjectOnStage: vi.fn(),
    syncSolidBodies: harness.syncSolidBodies,
    syncVoidMeshes: vi.fn(),
  };
});

import { KitchenStage } from "../../src/scene/kitchen-stage";

const SEEDED_RECORDS = derivePlacementRecords(
  KITCHEN_L_DESIGN,
  KITCHEN_L_BODY_CATALOG,
);

beforeEach(() => {
  vi.clearAllMocks();
  harness.hookIndex = 0;
  harness.hookDeps = [];
  harness.memoValues = [];
  vi.stubGlobal("React", React);

  const shell = new THREE.Group();
  shell.name = "kitchen_l_shape";
  harness.buildKitchenShell.mockReturnValue(shell);
  harness.referenceBuilder.mockReturnValue(new THREE.Group());
  harness.kit = {
    builders: { "kitchen-l": harness.referenceBuilder },
  };

  harness.storeState = {
    attachBodyProbe: vi.fn(),
    deselect: vi.fn(),
    design: KITCHEN_L_DESIGN,
    detachBodyProbe: vi.fn(),
    records: SEEDED_RECORDS,
    select: vi.fn(),
    selection: null,
    voids: [],
  };

  const canvas = {
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
  harness.threeState = {
    camera: new THREE.PerspectiveCamera(),
    controls: null,
    gl: { domElement: canvas },
    invalidate: vi.fn(),
    scene: new THREE.Scene(),
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** One render, hooks keyed from the top as React keys them. */
function render(): void {
  harness.hookIndex = 0;
  KitchenStage({
    view: { kind: "fixed", position: [4.3, 3, 5.3], target: [1.6, 1.35, 0.85] },
  });
}

function roomsSynced(): DesignRoom[] {
  return harness.syncSolidBodies.mock.calls.map(
    (call) => (call[0] as { readonly room: DesignRoom }).room,
  );
}

function holdDesign(
  design: Design,
  records = harness.storeState.records,
): void {
  harness.storeState = { ...harness.storeState, design, records };
}

describe("KitchenStage re-syncs the solids when the room the veto reads changes", () => {
  it("syncs once with the design's own room, and not again for an unchanged store (premise)", () => {
    render();
    render();

    expect(roomsSynced()).toStrictEqual([KITCHEN_L_DESIGN.room]);
    expect(roomsSynced()[0]).toBe(KITCHEN_L_DESIGN.room);
  });

  it("re-syncs with the new room when only the room changes, the records untouched", () => {
    render();
    const narrower: DesignRoom = { ...KITCHEN_L_DESIGN.room, widthMm: 3510 };

    holdDesign({ ...KITCHEN_L_DESIGN, room: narrower });
    render();

    expect(roomsSynced()).toStrictEqual([KITCHEN_L_DESIGN.room, narrower]);
  });

  it("re-syncs with the loaded design's room and records when a design is swapped in", () => {
    render();
    const loaded: Design = {
      ...KITCHEN_L_DESIGN,
      room: { ...KITCHEN_L_DESIGN.room, widthMm: 3505 },
    };
    const loadedRecords = derivePlacementRecords(
      loaded,
      KITCHEN_L_BODY_CATALOG,
    );

    holdDesign(loaded, loadedRecords);
    render();

    const last = harness.syncSolidBodies.mock.calls.at(-1)?.[0] as
      | { readonly room: DesignRoom; readonly records: unknown }
      | undefined;
    expect(harness.syncSolidBodies).toHaveBeenCalledTimes(2);
    expect(last?.room).toBe(loaded.room);
    expect(last?.records).toBe(loadedRecords);
  });
});
