// M7B U5 S2 (ADR 0132 A2, A8.2, A8.3): the cutaway in the scene — what the stage does about the cut set
// when the camera moves, when the room or the depth changes, when an overlay is mounted, and when the
// selection stands on a wall that has just been cut.
//
// The adapter's suites prove the cut set and its application (`cutaway.test.ts`,
// `picking.cutaway.test.ts`). This proves the wiring: that the web recomputes the set from the camera's
// position **alone** and applies it at every moment something could have put a cut wall on screen.
// The adapter is mocked with a `cutawayWallsFor` that answers from the eye's x, so a wrong argument or a
// missed re-application is a failing assertion rather than a coincidence; the hook mock is
// `kitchen-stage-room-change.test.ts`'s own dependency-aware one, for the same reason (it can tell a
// re-render from a rebuild, and cleanups replay before a re-run).
import {
  derivePlacementRecords,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  type Design,
  type DesignRoom,
  type DesignWall,
  type PlacementRecord,
  type VoidRecord,
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
  applyCutaway: vi.fn(),
  buildOverflowMark: vi.fn(),
  buildSelectionOutline: vi.fn(),
  cutawayWallsFor: vi.fn(),
  invalidate: vi.fn(),
  makeKit: vi.fn(),
  overflowingIds: [] as readonly string[],
  pick: vi.fn(),
  syncSolidBodies: vi.fn(),
  storeState: {} as Record<string, unknown>,
  threeState: {} as Record<string, unknown>,
  frameCallback: undefined as
    | ((state: unknown, delta: number) => void)
    | undefined,
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
  useFrame(callback: (state: unknown, delta: number) => void) {
    harness.frameCallback = callback;
  },
  useThree<T>(selector: (state: Record<string, unknown>) => T): T {
    return selector(harness.threeState);
  },
}));

vi.mock("../../src/scene/use-overflowing-placements", () => ({
  useOverflowingPlacementIds: () => harness.overflowingIds,
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
    applyCutaway: harness.applyCutaway,
    applyFinish: vi.fn(),
    buildKitchenShell: vi.fn(() => new THREE.Group()),
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
    cutawayWallsFor: harness.cutawayWallsFor,
    disposeKit: vi.fn(),
    disposeKitAndStage: vi.fn(),
    disposeOverflowMark: vi.fn(),
    disposeSelectionOutline: vi.fn(),
    isDragGesture: vi.fn(() => false),
    makeKit: harness.makeKit,
    pick: harness.pick,
    resizeShellToRoom: vi.fn(),
    seatObjectOnStage: vi.fn(),
    syncSolidBodies: harness.syncSolidBodies,
    syncVoidMeshes: vi.fn(),
  };
});

import { KitchenStage } from "../../src/scene/kitchen-stage";

const U_ROOM: DesignRoom = {
  shape: "U",
  widthMm: 3000,
  depthMm: 3000,
  wallCMm: 3000,
  heightMm: 2600,
};
const OTHER_U_ROOM: DesignRoom = { ...U_ROOM, widthMm: 3400 };

const SEEDED_RECORDS = derivePlacementRecords(
  KITCHEN_L_DESIGN,
  KITCHEN_L_BODY_CATALOG,
);

/** Where the fake eye is: at or below this x it is in wall B's zone. */
const INSIDE_B_ZONE_X = 0.4;
const OUTSIDE_ANY_ZONE_X = 1.5;

function recordOn(wall: DesignWall, id: string): PlacementRecord {
  const seeded = SEEDED_RECORDS[0];
  if (seeded === undefined) throw new Error("the seeded kitchen has no record");
  return { ...seeded, id, wall };
}

function voidOn(wall: DesignWall, id: string): VoidRecord {
  return {
    id,
    col: `${wall}|col`,
    wall,
    x: 0,
    z: 0,
    ry: 0,
    w: 0.6,
    d: 0.5,
    y0: 0,
    h: 0.8,
    spanY0: 0,
    spanH: 0.8,
  };
}

function designIn(room: DesignRoom, cabinetDepthMm?: number): Design {
  return {
    ...KITCHEN_L_DESIGN,
    room,
    ...(cabinetDepthMm === undefined ? {} : { settings: { cabinetDepthMm } }),
  };
}

interface FakeControls {
  target: THREE.Vector3;
  update: ReturnType<typeof vi.fn>;
  listeners: (() => void)[];
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
  fireChange: () => void;
}

function fakeControls(): FakeControls {
  const listeners: (() => void)[] = [];
  return {
    target: new THREE.Vector3(),
    update: vi.fn(),
    listeners,
    addEventListener: (_type, listener) => {
      listeners.push(listener);
    },
    removeEventListener: (_type, listener) => {
      listeners.splice(listeners.indexOf(listener), 1);
    },
    fireChange: () => {
      for (const listener of [...listeners]) listener();
    },
  };
}

interface FakeCanvas {
  readonly element: HTMLCanvasElement;
  readonly handlers: Map<string, (event: PointerEvent) => void>;
}

function fakeCanvas(): FakeCanvas {
  const handlers = new Map<string, (event: PointerEvent) => void>();
  const element = {
    addEventListener: (type: string, handler: (event: PointerEvent) => void) =>
      handlers.set(type, handler),
    removeEventListener: (type: string) => handlers.delete(type),
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
    }),
  } as unknown as HTMLCanvasElement;
  return { element, handlers };
}

let controls: FakeControls;
let camera: THREE.PerspectiveCamera;
let canvas: FakeCanvas;

function render(position: [number, number, number] = [4.3, 3, 5.3]): void {
  harness.cursor = 0;
  KitchenStage({
    view: { kind: "fixed", position, target: [1.6, 1.35, 0.85] },
  });
}

function moveEyeTo(x: number): void {
  camera.position.set(x, 1.4, 1.5);
}

function lastApplied(): readonly DesignWall[] {
  const call = harness.applyCutaway.mock.calls.at(-1);
  if (call === undefined) throw new Error("applyCutaway was never called");
  return call[2] as readonly DesignWall[];
}

beforeEach(() => {
  vi.clearAllMocks();
  harness.cells = [];
  harness.cursor = 0;
  vi.stubGlobal("React", React);

  harness.makeKit.mockImplementation(() => ({
    builders: { "kitchen-l": vi.fn(() => new THREE.Group()) },
  }));
  harness.buildSelectionOutline.mockImplementation(() => ({
    group: new THREE.Group(),
  }));
  harness.buildOverflowMark.mockImplementation(() => ({
    group: new THREE.Group(),
  }));
  harness.pick.mockReturnValue(null);
  harness.overflowingIds = [];
  // A body per record, tagged as the adapter tags it, so an outline and a mark have something to trace.
  harness.syncSolidBodies.mockImplementation(
    (input: {
      solidsRoot: THREE.Object3D;
      records: readonly PlacementRecord[];
    }) => {
      for (const record of input.records) {
        const body = new THREE.Group();
        body.userData.placementId = record.id;
        input.solidsRoot.add(body);
      }
    },
  );
  // The cut set is a function of the eye alone, as the real one is of its three arguments.
  harness.cutawayWallsFor.mockImplementation((eye: readonly number[]) =>
    (eye[0] ?? Infinity) <= INSIDE_B_ZONE_X ? ["B"] : [],
  );

  controls = fakeControls();
  camera = new THREE.PerspectiveCamera();
  moveEyeTo(OUTSIDE_ANY_ZONE_X);
  canvas = fakeCanvas();

  harness.storeState = {
    attachBodyProbe: vi.fn(),
    deselect: vi.fn(),
    design: designIn(U_ROOM),
    detachBodyProbe: vi.fn(),
    records: [recordOn("B", "b-body"), recordOn("C", "c-body")],
    select: vi.fn(),
    selection: null,
    voids: [voidOn("B", "b-void"), voidOn("C", "c-void")],
  };
  harness.threeState = {
    camera,
    controls,
    gl: { domElement: canvas.element },
    invalidate: harness.invalidate,
    scene: new THREE.Scene(),
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the cut set is computed from the camera's position, the room and the depth", () => {
  it("asks for the eye's own position, the design's room and the design's depth on mount", () => {
    harness.storeState.design = designIn(U_ROOM, 700);
    moveEyeTo(0.3);

    render();

    expect(harness.cutawayWallsFor).toHaveBeenCalledWith(
      [0.3, 1.4, 1.5],
      U_ROOM,
      700,
    );
  });

  it("applies what it was answered to the stage's own roots", () => {
    moveEyeTo(0.3);

    render();

    const [solidsRoot, voidsRoot, walls] = harness.applyCutaway.mock.calls.at(
      -1,
    ) as [THREE.Object3D, THREE.Object3D, readonly DesignWall[]];
    expect(walls).toEqual(["B"]);
    expect(solidsRoot.name).toBe("solids");
    expect(voidsRoot.name).toBe("voids");
  });

  it("applies an empty cut on mount when the eye is in no zone, so a stale record is cleared", () => {
    render();

    expect(lastApplied()).toEqual([]);
  });
});

describe("every camera move reapplies the cut, preset ease and free orbit alike", () => {
  it("follows a `change` event from the controls when the set changes", () => {
    render();
    expect(lastApplied()).toEqual([]);

    moveEyeTo(0.3);
    controls.fireChange();

    expect(lastApplied()).toEqual(["B"]);
  });

  it("does not reapply when the camera moved and the set did not", () => {
    render();
    const callsAfterMount = harness.applyCutaway.mock.calls.length;

    moveEyeTo(OUTSIDE_ANY_ZONE_X + 0.2);
    controls.fireChange();

    expect(harness.applyCutaway).toHaveBeenCalledTimes(callsAfterMount);
  });

  it("follows the frame loop's ease with no `change` event at all", () => {
    // A view whose position stands inside wall B's zone; a long frame lands the eye on it.
    render([INSIDE_B_ZONE_X - 0.2, 1.4, 1.5]);
    expect(lastApplied()).toEqual([]);

    harness.frameCallback?.({}, 100);

    expect(camera.position.x).toBeCloseTo(INSIDE_B_ZONE_X - 0.2, 5);
    expect(lastApplied()).toEqual(["B"]);
  });

  it("stops listening to the controls when the stage goes", () => {
    render();
    expect(controls.listeners).toHaveLength(1);

    harness.storeState.design = designIn(U_ROOM, 700);
    render();

    expect(controls.listeners).toHaveLength(1);
  });

  it("brings the cut up to the camera as it is now, before a pick's ray is cast", () => {
    render();
    moveEyeTo(0.3);
    const pointerUp = canvas.handlers.get("pointerup");
    if (pointerUp === undefined) throw new Error("no pointerup listener");
    harness.applyCutaway.mockClear();

    pointerUp({ clientX: 10, clientY: 10 } as PointerEvent);

    expect(harness.applyCutaway).toHaveBeenCalledOnce();
    expect(lastApplied()).toEqual(["B"]);
    expect(harness.applyCutaway.mock.invocationCallOrder[0]).toBeLessThan(
      harness.pick.mock.invocationCallOrder[0] ?? 0,
    );
  });
});

describe("a change of room, depth or stage reapplies the cut (A8.2, widened)", () => {
  it("reapplies when the room changes in place, asking about the new room", () => {
    render();
    harness.applyCutaway.mockClear();

    harness.storeState.design = designIn(OTHER_U_ROOM);
    render();

    expect(harness.cutawayWallsFor).toHaveBeenLastCalledWith(
      expect.anything(),
      OTHER_U_ROOM,
      expect.anything(),
    );
    expect(harness.applyCutaway).toHaveBeenCalledOnce();
  });

  it("reapplies to the rebuilt stage's own roots when the depth changes", () => {
    render();
    const [firstSolids] = harness.applyCutaway.mock.calls.at(-1) as [
      THREE.Object3D,
    ];

    harness.storeState.design = designIn(U_ROOM, 700);
    render();

    const [rebuiltSolids] = harness.applyCutaway.mock.calls.at(-1) as [
      THREE.Object3D,
    ];
    expect(rebuiltSolids).not.toBe(firstSolids);
    expect(harness.cutawayWallsFor).toHaveBeenLastCalledWith(
      expect.anything(),
      U_ROOM,
      700,
    );
  });

  it("reapplies when a delete or an insert changes the records or the voids", () => {
    render();
    harness.applyCutaway.mockClear();

    harness.storeState.records = [recordOn("C", "c-body")];
    render();
    harness.storeState.voids = [voidOn("C", "c-void")];
    render();

    expect(harness.applyCutaway).toHaveBeenCalledTimes(2);
  });
});

describe("the cut is applied after the overlays are mounted (A8.2)", () => {
  it("applies after the selection outline is built in the same commit", () => {
    harness.storeState.selection = { kind: "placement", id: "c-body" };

    render();

    expect(harness.buildSelectionOutline).toHaveBeenCalledOnce();
    expect(
      harness.buildSelectionOutline.mock.invocationCallOrder[0],
    ).toBeLessThan(harness.applyCutaway.mock.invocationCallOrder[0] ?? 0);
  });

  it("applies after an overflow mark is built in the same commit", () => {
    harness.overflowingIds = ["c-body"];

    render();

    expect(harness.buildOverflowMark).toHaveBeenCalledOnce();
    expect(harness.buildOverflowMark.mock.invocationCallOrder[0]).toBeLessThan(
      harness.applyCutaway.mock.invocationCallOrder[0] ?? 0,
    );
  });
});

describe("a selection does not outlive its cut-away wall (A8.3)", () => {
  it("clears the selection of a body on a wall the cut set now includes", () => {
    harness.storeState.selection = { kind: "placement", id: "b-body" };
    moveEyeTo(0.3);

    render();

    expect(harness.storeState.deselect).toHaveBeenCalled();
  });

  it("clears the selection of a void on a wall the cut set now includes", () => {
    harness.storeState.selection = { kind: "void", id: "b-void" };
    moveEyeTo(0.3);

    render();

    expect(harness.storeState.deselect).toHaveBeenCalled();
  });

  it("keeps a selection on a wall that is not cut", () => {
    harness.storeState.selection = { kind: "placement", id: "c-body" };
    moveEyeTo(0.3);

    render();

    expect(harness.storeState.deselect).not.toHaveBeenCalled();
  });

  it("clears it when the camera moves onto the selected wall's side, not only at mount", () => {
    harness.storeState.selection = { kind: "placement", id: "b-body" };
    render();
    expect(harness.storeState.deselect).not.toHaveBeenCalled();

    moveEyeTo(0.3);
    controls.fireChange();

    expect(harness.storeState.deselect).toHaveBeenCalledOnce();
  });

  it("keeps nothing selected to clear when there is no selection", () => {
    moveEyeTo(0.3);

    render();

    expect(harness.storeState.deselect).not.toHaveBeenCalled();
  });
});
