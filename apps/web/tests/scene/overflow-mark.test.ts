// M6 wave 6M: the scene half of ADR 0065. What is asserted here is the *wiring* — which bodies get a
// mark, that the mark is mounted beside the body rather than in place of it, that it composes with
// the selection outline, and that it leaves nothing behind. What a mark looks like belongs to
// `packages/three-adapter/tests/overflow-mark.test.ts`, and whether a customer can see it belongs to
// this wave's visual verification.
//
// The effects are run the way React runs them — cleanups collected in declaration order and replayed
// in that order — for the reason `kitchen-stage-disposal.test.ts` gives: that order is the coupling
// that keeps the marks out of `stage.room` before the stage teardown walks it.
// `OVERFLOWING_KITCHEN_L_DESIGN` is the **one declared** overflow fixture (ADR 0083 decision 10):
// the seeded kitchen with one body a millimetre past the end of wall B, positioned relative to the
// room so a wall moving cannot silently stop it overflowing. It was hand-built in six test files
// and agreed everywhere only because the six were written together. Aliased to the local name the
// cases below already use.
import {
  derivePlacementRecords,
  DesignSchema,
  findOverflowingPlacementIds,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  OVERFLOWING_KITCHEN_L_DESIGN as OVERFLOWING_DESIGN,
  type Design,
} from "@lemnaria/configurator-domain";
import * as React from "react";
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  cleanups: [] as (() => void)[],
  buildOverflowMark: vi.fn(),
  buildSelectionOutline: vi.fn(),
  disposeOverflowMark: vi.fn(),
  markedTargets: [] as THREE.Object3D[],
  mountedRoom: null as THREE.Object3D | null,
  outlinedTargets: [] as THREE.Object3D[],
  syncedRecordIds: [] as string[],
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
      if (typeof cleanup === "function")
        harness.cleanups.push(cleanup as () => void);
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
    buildKitchenShell: vi.fn(() => {
      const shell = new THREE.Group();
      shell.name = "kitchen_l_shape";
      return shell;
    }),
    buildOverflowMark: harness.buildOverflowMark,
    buildSelectionOutline: harness.buildSelectionOutline,
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
    disposeKitAndStage: vi.fn((stage: { room: THREE.Object3D }) => {
      harness.roomAtDisposal = [...stage.room.children];
    }),
    disposeOverflowMark: harness.disposeOverflowMark,
    disposeSelectionOutline: vi.fn(),
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
    // Mounts one tagged group per record, which is what `userData.placementId` means to picking and
    // is the only part of the real sync this file depends on.
    syncSolidBodies: vi.fn(
      (input: {
        solidsRoot: THREE.Object3D;
        records: readonly { id: string }[];
      }) => {
        for (const record of input.records) {
          const body = new THREE.Group();
          body.name = `body_${record.id}`;
          body.userData.placementId = record.id;
          input.solidsRoot.add(body);
          harness.syncedRecordIds.push(record.id);
        }
      },
    ),
    syncVoidMeshes: vi.fn(),
  };
});

import { KitchenStage } from "../../src/scene/kitchen-stage";

const OVERVIEW_VIEW = {
  kind: "fixed",
  position: [4.3, 3, 5.3],
  target: [1.6, 1.35, 0.85],
} as const;

/** Wall A's run cut back to its first metre, so most of the wall is bare. ADR 0067: under-filling is
 *  the normal case and is never a defect. */
const LARGE_REMAINDER_DESIGN: Design = {
  ...KITCHEN_L_DESIGN,
  placements: KITCHEN_L_DESIGN.placements.filter(
    (placement) => placement.wall === "A" && placement.alongMm < 1000,
  ),
};

function mountWith(design: Design, selection: unknown = null): void {
  harness.storeState = {
    attachBodyProbe: vi.fn(),
    deselect: harness.storeState.deselect,
    design,
    detachBodyProbe: vi.fn(),
    records: derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG),
    select: harness.storeState.select,
    selection,
    voids: [],
  };
  KitchenStage({ view: OVERVIEW_VIEW });
}

function runCleanups(): void {
  const cleanups = [...harness.cleanups];
  harness.cleanups = [];
  for (const cleanup of cleanups) cleanup();
}

/** The room the mount attached its marks and outlines to, taken from the parent they were built
 *  against — which is itself part of what these tests assert: a mark is the room's child, never the
 *  body's. */
function mountedRoom(): THREE.Object3D {
  const room = harness.mountedRoom;
  if (!room) throw new Error("the stage attached nothing to its room");
  return room;
}

function marksIn(room: THREE.Object3D): THREE.Object3D[] {
  return room.children.filter((child) => child.name === "overflow_mark");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  harness.cleanups = [];
  harness.markedTargets = [];
  harness.mountedRoom = null;
  harness.outlinedTargets = [];
  harness.syncedRecordIds = [];
  harness.roomAtDisposal = null;
  harness.buildOverflowMark.mockImplementation(
    (input: { target: THREE.Object3D; parent: THREE.Object3D }) => {
      harness.markedTargets.push(input.target);
      harness.mountedRoom = input.parent;
      const group = new THREE.Group();
      group.name = "overflow_mark";
      return { group };
    },
  );
  harness.buildSelectionOutline.mockImplementation(
    (input: { target: THREE.Object3D; parent: THREE.Object3D }) => {
      harness.outlinedTargets.push(input.target);
      harness.mountedRoom = input.parent;
      const group = new THREE.Group();
      group.name = "selection_outline";
      return { group };
    },
  );

  harness.storeState = { deselect: vi.fn(), select: vi.fn() };
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

describe("which bodies the scene marks", () => {
  it("marks exactly the bodies the domain query reports", () => {
    mountWith(OVERFLOWING_DESIGN);

    expect(findOverflowingPlacementIds(OVERFLOWING_DESIGN)).toStrictEqual([
      "dragged-past-wall-b",
    ]);
    expect(harness.buildOverflowMark).toHaveBeenCalledOnce();
    expect(harness.markedTargets[0]?.userData.placementId).toBe(
      "dragged-past-wall-b",
    );
    expect(marksIn(mountedRoom())).toHaveLength(1);
  });

  it("marks nothing on the seeded design at 600", () => {
    // ADR 0065's consequences: the demo room fits the shipped kitchen at both declared depths —
    // wall B is 2920 and its run ends at 2800 here and at 2900 at the 700 mm depth (ADR 0083
    // decision 1). If this ever fails the room dimensions have regressed, and the fix is in the
    // fixture, not here.
    mountWith(KITCHEN_L_DESIGN);

    // Not vacuous: the whole kitchen was mounted and every body was a candidate.
    expect(harness.syncedRecordIds.length).toBe(
      derivePlacementRecords(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG).length,
    );
    expect(harness.buildOverflowMark).not.toHaveBeenCalled();
  });

  it("never marks bare wall left at the end of a run", () => {
    // ADR 0065 decision 4, strengthened by ADR 0067: the fit constraint is one-sided, and a large
    // remainder is the product working rather than something to report.
    mountWith(LARGE_REMAINDER_DESIGN);

    expect(harness.syncedRecordIds.length).toBeGreaterThan(0);
    expect(harness.buildOverflowMark).not.toHaveBeenCalled();
  });

  it("still marks the same body after the design has been saved and resumed", () => {
    // ADR 0065 decision 7: the mark is not a reason to refuse a write, and no work is lost. The
    // round trip here is the document going through the wire schema and coming back.
    const resumed = DesignSchema.parse(
      JSON.parse(JSON.stringify(OVERFLOWING_DESIGN)),
    );

    mountWith(resumed);

    expect(harness.buildOverflowMark).toHaveBeenCalledOnce();
    expect(harness.markedTargets[0]?.userData.placementId).toBe(
      "dragged-past-wall-b",
    );
  });
});

describe("marking changes nothing about the body it marks", () => {
  it("leaves the marked body mounted, visible and pickable where the sync put it", () => {
    // "Not moved, resized, hidden" at this seam: the mark is the room's child, so the body gains no
    // child of its own and keeps its place in the subtree §6.1 raycasts.
    mountWith(OVERFLOWING_DESIGN);

    const marked = harness.markedTargets[0];
    expect(marked).toBeDefined();
    expect(marked?.visible).toBe(true);
    expect(marked?.children).toHaveLength(0);
    expect(marked?.parent?.name).toBe("solids");
    expect(mountedRoom().name).toBe("kitchen_l_shape");
  });

  it("does not touch the selection", () => {
    mountWith(OVERFLOWING_DESIGN);

    expect(harness.storeState.deselect).not.toHaveBeenCalled();
    expect(harness.storeState.select).not.toHaveBeenCalled();
  });

  it("marks a selected body without displacing its outline", () => {
    // Both are mounted on the room, on the same target: a body that is selected *and* overflowing
    // wears both, and neither replaces the other.
    mountWith(OVERFLOWING_DESIGN, {
      kind: "placement",
      id: "dragged-past-wall-b",
    });

    expect(harness.markedTargets[0]).toBe(harness.outlinedTargets[0]);
    const room = mountedRoom();
    expect(marksIn(room)).toHaveLength(1);
    expect(
      room.children.filter((child) => child.name === "selection_outline"),
    ).toHaveLength(1);
  });
});

describe("no mark is left behind", () => {
  it("detaches and disposes every mark when the effect re-runs or unmounts", () => {
    mountWith(OVERFLOWING_DESIGN);
    const room = mountedRoom();
    const mark = marksIn(room)[0];

    runCleanups();

    expect(mark).toBeDefined();
    expect(marksIn(room)).toHaveLength(0);
    expect(harness.disposeOverflowMark).toHaveBeenCalledTimes(1);
    expect(harness.disposeOverflowMark).toHaveBeenCalledWith(mark);
  });

  it("builds no mark on the next pass once nothing overflows", () => {
    // The defect this file exists for: a body narrowed back inside its wall must lose its mark, not
    // keep a red cabinet the customer has no way to clear.
    mountWith(OVERFLOWING_DESIGN);
    runCleanups();
    harness.buildOverflowMark.mockClear();

    mountWith(KITCHEN_L_DESIGN);

    expect(harness.buildOverflowMark).not.toHaveBeenCalled();
  });

  it("has left the room before the stage teardown walks it", () => {
    mountWith(OVERFLOWING_DESIGN);
    const mark = marksIn(mountedRoom())[0];

    runCleanups();

    expect(harness.roomAtDisposal).not.toBeNull();
    expect(harness.roomAtDisposal).not.toContain(mark);
  });
});
