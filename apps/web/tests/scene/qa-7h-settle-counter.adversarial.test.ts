// Wave 7H adversarial QA: the settle counter, driven through the frame loop that writes it.
//
// `qa-7h-scene-measurement.adversarial.test.ts` beside this one attacks the store in isolation. It
// cannot answer the question the counter was chosen **for**, because that question is about the
// loop: *is there a sequence where the count moves without the camera having moved, or where the
// camera moves without the count?* The e2e spec's whole wait is built on the answer, so a wrong one
// is a spec that measures a frame mid-ease and reports a tappable row that is not there.
//
// **The hook mock is `kitchen-stage-room-change.test.ts`'s, with `useFrame` captured rather than
// stubbed.** Duplicated rather than shared: that file is this wave's own and freezing it under a
// shared harness is a larger change than a second copy, and the two ask different questions of it.
// What is emulated: hook cells in call order, `Object.is` on dependencies, cleanups before re-runs.
// What is not: StrictMode, batching, and effects running after paint. None bears on the counter.
import {
  derivePlacementRecords,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  type Design,
  type DesignRoom,
} from "@lemnaria/configurator-domain";
import * as React from "react";
import * as THREE from "three";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { SELECTION_DEBUG_FLAG } from "../../src/app/configurator/configure/selection-debug-availability";
import type { SceneView } from "../../src/scene/scene-view";

interface HookCell {
  deps: readonly unknown[] | undefined;
  value?: unknown;
  cleanup?: () => void;
}

type FrameCallback = (state: unknown, delta: number) => void;

const harness = vi.hoisted(() => ({
  cells: [] as {
    deps: readonly unknown[] | undefined;
    value?: unknown;
    cleanup?: () => void;
  }[],
  cursor: 0,
  frame: null as FrameCallback | null,
  invalidate: vi.fn(),
  kit: {} as Record<string, unknown>,
  storeState: {} as Record<string, unknown>,
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
  useFrame(callback: FrameCallback) {
    harness.frame = callback;
  },
  useThree<T>(selector: (state: Record<string, unknown>) => T): T {
    return selector(harness.threeState);
  },
}));

vi.mock("../../src/store/configurator-store", () => ({
  useConfiguratorStore<T>(selector: (state: Record<string, unknown>) => T): T {
    return selector(harness.storeState);
  },
}));

/** The real adapter, with only the parts that allocate a GPU resource or need a 2D canvas replaced.
 *  `findCameraPresetForRoom` is deliberately the real one: the numbers the camera eases **to** are
 *  what this file is measuring, and a stubbed preset would make every landing assertion a claim
 *  about the stub. */
vi.mock("@lemnaria/three-adapter", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@lemnaria/three-adapter")>();
  const THREE = await import("three");
  return {
    ...actual,
    applyFinish: vi.fn(),
    buildKitchenShell: vi.fn(() => new THREE.Group()),
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
    makeKit: vi.fn(() => harness.kit),
    pick: vi.fn(() => null),
    resizeShellToRoom: vi.fn(),
    seatObjectOnStage: vi.fn(),
    syncSolidBodies: vi.fn(),
    syncVoidMeshes: vi.fn(),
    applyCutaway: vi.fn(),
    cutawayWallsFor: vi.fn(() => []),
  };
});

const SEEDED_ROOM = KITCHEN_L_DESIGN.room;
/** A wall A the customer corrected by 400 mm, inside the approved bounds. */
const CORRECTED_ROOM: DesignRoom = { ...SEEDED_ROOM, widthMm: 3960 };

const SEEDED_RECORDS = derivePlacementRecords(
  KITCHEN_L_DESIGN,
  KITCHEN_L_BODY_CATALOG,
);

/** Small enough that a preset needs a dozen of them to land, which is what makes *"it did not
 *  publish yet"* a real claim rather than an artefact of one giant step. */
const FRAME_SECONDS = 0.1;
const FRAMES_TO_LAND = 40;

type StageModule = typeof import("../../src/scene/kitchen-stage");
type MeasurementStore =
  typeof import("../../src/scene/scene-measurement-store");
type Adapter = typeof import("@lemnaria/three-adapter");

let KitchenStage: StageModule["KitchenStage"];
let measurement: MeasurementStore;
let adapter: Adapter;

beforeAll(async () => {
  // The readout's gate is a module-level constant read at import, so the flag goes in before the
  // stage — which imports the store — is ever evaluated.
  vi.stubEnv(SELECTION_DEBUG_FLAG, "1");
  adapter = await import("@lemnaria/three-adapter");
  measurement = await import("../../src/scene/scene-measurement-store");
  KitchenStage = (await import("../../src/scene/kitchen-stage")).KitchenStage;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function designWith(room: DesignRoom): Design {
  return { ...KITCHEN_L_DESIGN, room };
}

interface FakeOrbitControls {
  target: THREE.Vector3;
  update: () => void;
  addEventListener: () => void;
  removeEventListener: () => void;
}

let controls: FakeOrbitControls;
let camera: THREE.PerspectiveCamera;

beforeEach(() => {
  vi.clearAllMocks();
  harness.cells = [];
  harness.cursor = 0;
  harness.frame = null;
  vi.stubGlobal("React", React);
  measurement.useSceneMeasurement.setState({ measurement: null });

  harness.kit = { builders: { "kitchen-l": vi.fn(() => new THREE.Group()) } };
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

  camera = new THREE.PerspectiveCamera(45, 390 / 789, 0.1, 500);
  camera.position.set(0, 0, 0);
  controls = {
    target: new THREE.Vector3(),
    update: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  harness.threeState = {
    camera,
    controls,
    gl: { domElement: fakeCanvas() },
    invalidate: harness.invalidate,
    scene: new THREE.Scene(),
  };
});

/** One render pass: the hook cursor restarts and the component runs, exactly as React re-invokes a
 *  function component. */
function render(view: SceneView): void {
  harness.cursor = 0;
  KitchenStage({ view });
}

function advanceFrames(count: number): void {
  const frame = harness.frame;
  if (!frame) throw new Error("the stage registered no frame callback");
  for (let tick = 0; tick < count; tick++) frame({}, FRAME_SECONDS);
}

function settleCount(): number {
  return (
    measurement.useSceneMeasurement.getState().measurement?.settleCount ?? 0
  );
}

const OVERVIEW: SceneView = { kind: "preset", id: "overview" };

describe("the count moves exactly once per landing, and never mid-ease", () => {
  it("publishes nothing while the camera is still travelling", () => {
    render(OVERVIEW);

    advanceFrames(2);

    expect(settleCount()).toBe(0);
  });

  /** Non-vacuity for the assertion above: the ease really is running in those two frames, so
   *  *"nothing published"* is a claim about the timing rather than about a dead frame loop. */
  it("has moved the camera in the frames it published nothing for", () => {
    render(OVERVIEW);

    advanceFrames(2);

    expect(camera.position.length()).toBeGreaterThan(0);
  });

  it("publishes once when the ease lands, and not again while it stands still", () => {
    render(OVERVIEW);

    advanceFrames(FRAMES_TO_LAND);
    const atLanding = settleCount();
    advanceFrames(FRAMES_TO_LAND);

    expect(atLanding).toBe(1);
    expect(settleCount()).toBe(1);
  });

  /** The fidelity capture's own two vectors snap rather than ease, so its landing is the first
   *  frame. A spec waiting for a *larger* count still sees one. */
  it("publishes on the first frame of a view that snaps", () => {
    render({
      kind: "fixed",
      position: [4.3, 3, 5.3],
      target: [1.6, 1.35, 0.85],
    });

    advanceFrames(1);

    expect(settleCount()).toBe(1);
  });
});

describe("what lands is where the readout says the camera is", () => {
  it("publishes the preset's own position, not the frame before it", () => {
    const preset = adapter.findCameraPresetForRoom("overview", SEEDED_ROOM);
    render(OVERVIEW);

    advanceFrames(FRAMES_TO_LAND);

    expect(camera.position.toArray()).toEqual([...preset.position]);
    expect(
      measurement.useSceneMeasurement.getState().measurement?.view,
    ).toEqual([...camera.matrixWorldInverse.elements]);
  });

  /** The customer corrects a wall length while the camera is still moving. The ease must land on
   *  the room they now have — landing on the old one would frame a room that no longer exists — and
   *  it must count as **one** settle, not as the abandoned ease plus the new one. */
  it("lands on the corrected room when the room changes mid-ease", () => {
    render(OVERVIEW);
    advanceFrames(2);
    expect(settleCount()).toBe(0);

    harness.storeState.design = designWith(CORRECTED_ROOM);
    render(OVERVIEW);
    advanceFrames(FRAMES_TO_LAND);

    const corrected = adapter.findCameraPresetForRoom(
      "overview",
      CORRECTED_ROOM,
    );
    expect(camera.position.toArray()).toEqual([...corrected.position]);
    expect(settleCount()).toBe(1);
  });

  /** Non-vacuity: the two rooms really do frame differently, so landing "on the corrected room" is
   *  a claim rather than two names for one triple. */
  it("frames the corrected room somewhere else", () => {
    expect(
      adapter.findCameraPresetForRoom("overview", CORRECTED_ROOM).position,
    ).not.toEqual(
      adapter.findCameraPresetForRoom("overview", SEEDED_ROOM).position,
    );
  });
});

/** The counter counts **settles**, not camera moves, and the difference is what a spec has to know.
 *  A customer dragging the scene round moves the camera every frame and settles nothing; a spec that
 *  waited on the count after an orbit would wait for ever, and one that read the last measurement
 *  would read the frame before the drag. Pinned as behaviour so neither reading is invented later. */
describe("an orbit is not a settle", () => {
  it("leaves the count alone when the camera is dragged after a landing", () => {
    render(OVERVIEW);
    advanceFrames(FRAMES_TO_LAND);
    const afterLanding = settleCount();

    camera.position.set(1, 1, 1);
    controls.target.set(0, 0, 0);
    advanceFrames(FRAMES_TO_LAND);

    expect(settleCount()).toBe(afterLanding);
  });

  it("keeps publishing the landed frame rather than the dragged one", () => {
    render(OVERVIEW);
    advanceFrames(FRAMES_TO_LAND);
    const atLanding =
      measurement.useSceneMeasurement.getState().measurement?.view;

    camera.position.set(1, 1, 1);
    camera.updateMatrixWorld();
    advanceFrames(FRAMES_TO_LAND);

    expect(
      measurement.useSceneMeasurement.getState().measurement?.view,
    ).toEqual(atLanding);
    expect(atLanding).not.toEqual([...camera.matrixWorldInverse.elements]);
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
