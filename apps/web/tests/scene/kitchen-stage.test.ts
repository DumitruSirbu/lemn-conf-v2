import {
  derivePlacementRecords,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  paletteFinish,
  resolvedDefaultFinishOf,
  type Finish,
  type PlacementRecord,
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
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect(effect: () => unknown) {
      effect();
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
  return {
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

const CURRENT_RECORDS = derivePlacementRecords(
  KITCHEN_L_DESIGN,
  KITCHEN_L_BODY_CATALOG,
).filter((record) => record.id !== "p7");

beforeEach(() => {
  vi.clearAllMocks();
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
    records: CURRENT_RECORDS,
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

describe("KitchenStage shell ownership", () => {
  it("builds the adapter shell at the held design's room before syncing the persisted placement set", () => {
    KitchenStage({
      view: {
        kind: "fixed",
        position: [4.3, 3, 5.3],
        target: [1.6, 1.35, 0.85],
      },
    });

    expect(harness.buildKitchenShell).toHaveBeenCalledOnce();
    expect(harness.buildKitchenShell).toHaveBeenCalledWith(
      harness.kit,
      KITCHEN_L_DESIGN.room,
    );
    expect(harness.referenceBuilder).not.toHaveBeenCalled();
    expect(harness.syncSolidBodies).toHaveBeenCalledOnce();

    const input = harness.syncSolidBodies.mock.calls[0]?.[0] as
      | {
          readonly kit: unknown;
          readonly records: readonly PlacementRecord[];
          readonly solidsRoot: THREE.Group;
        }
      | undefined;
    expect(input, "KitchenStage did not call syncSolidBodies").toBeDefined();
    expect(input?.kit).toBe(harness.kit);
    expect(input?.records).toBe(CURRENT_RECORDS);
    expect(input?.records.some((record) => record.id === "p7")).toBe(false);
    expect(input?.solidsRoot.name).toBe("solids");
    expect(input?.solidsRoot.children).toEqual([
      harness.buildKitchenShell.mock.results[0]?.value,
    ]);
    expect(harness.buildKitchenShell.mock.invocationCallOrder[0]).toBeLessThan(
      harness.syncSolidBodies.mock.invocationCallOrder[0] ?? 0,
    );
  });
});

/** The owner's ruling of 2026-09-17 — *"end pannel should inherit the kitchen global color"*. The
 *  panel is shell, so no `PlacementRecord` carries a colour for it and `kitchenFinish` is the only
 *  value that reaches it. What is provable here is the seam: that the stage hands the **domain's**
 *  answer over rather than deriving a second one. That the adapter then paints the right mesh with
 *  it is `the-run-end-panel-wears-the-kitchens-colour.test.ts`. */
describe("KitchenStage hands the kitchen's own colour to the scene", () => {
  const CAPTURE_VIEW = {
    kind: "fixed",
    position: [4.3, 3, 5.3],
    target: [1.6, 1.35, 0.85],
  } as const;

  function kitchenFinishPassedToSync(): Finish | undefined {
    const input = harness.syncSolidBodies.mock.calls[0]?.[0] as
      | { readonly kitchenFinish?: Finish }
      | undefined;
    expect(input, "KitchenStage did not call syncSolidBodies").toBeDefined();
    return input?.kitchenFinish;
  }

  it("passes the design's resolved default finish, never one of its own", () => {
    const expected = resolvedDefaultFinishOf(KITCHEN_L_DESIGN);
    // Non-vacuity: the seeded design really does declare a colour to follow.
    expect(expected).toBeDefined();

    KitchenStage({ view: CAPTURE_VIEW });

    expect(kitchenFinishPassedToSync()).toBe(expected);
  });

  /** The capture route repaints every front in the room through the `finish` prop, so the panel
   *  takes that same colour — a reference shot must not contain one surface matching nothing else
   *  in it. */
  it("prefers the capture route's whole-room finish when it is given one", () => {
    const captured = paletteFinish("pal.antracit");

    KitchenStage({ view: CAPTURE_VIEW, finish: captured });

    expect(kitchenFinishPassedToSync()).toBe(captured);
  });
});
