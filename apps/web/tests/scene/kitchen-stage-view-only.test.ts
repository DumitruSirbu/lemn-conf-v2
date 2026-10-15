// The review's scene is the editor's stage with nothing wired to edit through. This drives the stage against the
// **real** configurator store (only the React binding is replaced, so `useConfiguratorStore(selector)` reads and
// the stage's commands write the real state), and checks the property at the store: after a tap on a body the
// store's selection, probe and design are what they were.
//
// What this cannot see: a real browser's pointer events, the canvas's touch handling and the WebGL frame. The
// listeners are the stage's own `addEventListener` registrations, replayed by hand.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Listener = (event: { clientX: number; clientY: number }) => void;

const harness = vi.hoisted(() => ({
  listeners: new Map<string, Listener[]>(),
  threeState: {} as Record<string, unknown>,
  picked: null as { kind: "placement" | "void"; id: string } | null,
  cutWalls: [] as string[],
  buildSelectionOutline: vi.fn(),
  pick: vi.fn(),
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

vi.mock("../../src/scene/use-overflowing-placements", () => ({
  useOverflowingPlacementIds: () => [],
}));

vi.mock("../../src/store/configurator-store", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/store/configurator-store")>();
  const store = actual.useConfiguratorStore;
  return {
    ...actual,
    useConfiguratorStore: Object.assign(
      <T>(selector: (state: ReturnType<typeof store.getState>) => T): T =>
        selector(store.getState()),
      store,
    ),
  };
});

vi.mock("@lemnaria/three-adapter", async () => {
  const THREE = await import("three");
  return {
    applyCornerDirection: vi.fn(),
    applyCornerDirectionToLightRig: vi.fn(),
    applyCutaway: vi.fn(),
    applyFinish: vi.fn(),
    buildKitchenShell: vi.fn(() => new THREE.Group()),
    buildOverflowMark: vi.fn(() => ({ group: new THREE.Group() })),
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
    cutawayWallsFor: vi.fn(() => harness.cutWalls),
    disposeOverflowMark: vi.fn(),
    disposeSelectionOutline: vi.fn(),
    isDragGesture: vi.fn(() => false),
    makeKit: vi.fn(() => ({ builders: {} })),
    pick: harness.pick,
    resizeShellToRoom: vi.fn(),
    seatObjectOnStage: vi.fn(),
    syncSolidBodies: vi.fn(
      ({
        solidsRoot,
        records,
      }: {
        solidsRoot: THREE.Object3D;
        records: readonly { id: string }[];
      }) => {
        for (const record of records) {
          const body = new THREE.Group();
          body.userData.placementId = record.id;
          solidsRoot.add(body);
        }
      },
    ),
    syncVoidMeshes: vi.fn(),
  };
});

import { KitchenStage, useNoEditing } from "../../src/scene/kitchen-stage";
import { useConfiguratorStore } from "../../src/store/configurator-store";

const VIEW = {
  kind: "fixed",
  position: [4.3, 3, 5.3],
  target: [1.6, 1.35, 0.85],
} as const;

const TAPPED_BODY = { kind: "placement", id: "tapped-body" } as const;

function tapTheCanvas(): void {
  for (const type of ["pointerdown", "pointerup"])
    for (const listener of harness.listeners.get(type) ?? [])
      listener({ clientX: 5, clientY: 5 });
}

function registeredListenerCount(): number {
  return [...harness.listeners.values()].reduce(
    (total, listeners) => total + listeners.length,
    0,
  );
}

function standingSelection() {
  const [first] = useConfiguratorStore.getState().records;
  if (first === undefined) throw new Error("the seeded design holds no body");
  return {
    record: first,
    selection: { kind: "placement", id: first.id },
  } as const;
}

beforeEach(() => {
  vi.clearAllMocks();
  harness.listeners.clear();
  harness.picked = TAPPED_BODY;
  harness.cutWalls = [];
  harness.pick.mockImplementation(() => harness.picked);
  harness.buildSelectionOutline.mockImplementation(() => ({
    group: new THREE.Group(),
  }));
  useConfiguratorStore.setState({
    design: KITCHEN_L_DESIGN,
    selection: null,
    isBodyProbeAttached: false,
  });
  harness.threeState = {
    camera: new THREE.PerspectiveCamera(),
    controls: null,
    gl: {
      domElement: {
        addEventListener: (type: string, listener: Listener) => {
          harness.listeners.set(type, [
            ...(harness.listeners.get(type) ?? []),
            listener,
          ]);
        },
        removeEventListener: vi.fn(),
        getBoundingClientRect: () => ({
          left: 0,
          top: 0,
          width: 1,
          height: 1,
        }),
      },
    },
    invalidate: vi.fn(),
    scene: new THREE.Scene(),
  };
});

describe("the editor's stage, as the control", () => {
  it("selects the body a tap lands on and offers the store its probe", () => {
    KitchenStage({ view: VIEW });

    tapTheCanvas();

    expect(useConfiguratorStore.getState().selection).toEqual(TAPPED_BODY);
    expect(useConfiguratorStore.getState().isBodyProbeAttached).toBe(true);
  });

  it("draws an outline for the selection it holds", () => {
    useConfiguratorStore.setState({ selection: standingSelection().selection });

    KitchenStage({ view: VIEW });

    expect(harness.buildSelectionOutline).toHaveBeenCalledOnce();
  });

  it("clears a selection that stands on a wall the camera has just cut", () => {
    const { record, selection } = standingSelection();
    useConfiguratorStore.setState({ selection });
    harness.cutWalls = [record.wall];

    KitchenStage({ view: VIEW });

    expect(useConfiguratorStore.getState().selection).toBeNull();
  });
});

describe("the review's stage: a tap selects nothing", () => {
  it("registers no pointer listener at all, so there is nothing for a tap to call", () => {
    KitchenStage({ view: VIEW, useEditing: useNoEditing });

    expect(registeredListenerCount()).toBe(0);
  });

  it("leaves the store's selection as it was after a tap on a body", () => {
    const { selection } = standingSelection();
    useConfiguratorStore.setState({ selection });

    KitchenStage({ view: VIEW, useEditing: useNoEditing });
    tapTheCanvas();

    expect(useConfiguratorStore.getState().selection).toEqual(selection);
    expect(harness.pick).not.toHaveBeenCalled();
  });

  it("does not clear the store's selection when the camera cuts its wall", () => {
    const { record, selection } = standingSelection();
    useConfiguratorStore.setState({ selection });
    harness.cutWalls = [record.wall];

    KitchenStage({ view: VIEW, useEditing: useNoEditing });

    expect(useConfiguratorStore.getState().selection).toEqual(selection);
  });

  it("draws no outline for a selection the editor left behind", () => {
    useConfiguratorStore.setState({ selection: standingSelection().selection });

    KitchenStage({ view: VIEW, useEditing: useNoEditing });

    expect(harness.buildSelectionOutline).not.toHaveBeenCalled();
  });

  it("offers the store no probe, so it cannot detach the editor's", () => {
    KitchenStage({ view: VIEW, useEditing: useNoEditing });

    expect(useConfiguratorStore.getState().isBodyProbeAttached).toBe(false);
  });
});
