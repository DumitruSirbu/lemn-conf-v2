// A mount with no orbit controls still takes the camera to a chip's view. `OrbitControls.update()` is what turns
// the editor's camera towards its target, so without it the stage has to; this drives the stage's frame loop once
// with the real `OrbitControls` (the editor) and once with none (the review) and compares where the camera ends.
//
// What this cannot see: a rendered frame. The adapter's seating and the scene's content are mocked; what is
// compared is the camera's position and orientation, which is all a view is.
import {
  KITCHEN_L_DESIGN,
  type DesignRoom,
} from "@lemnaria/configurator-domain";
import {
  cameraPresetsForRoom,
  type CameraPresetId,
} from "@lemnaria/three-adapter";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  threeState: {} as Record<string, unknown>,
  storeState: {} as Record<string, unknown>,
  frame: undefined as ((state: unknown, delta: number) => void) | undefined,
  onSettled: vi.fn(),
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
  useFrame(callback: (state: unknown, delta: number) => void) {
    harness.frame = callback;
  },
  useThree<T>(selector: (state: Record<string, unknown>) => T): T {
    return selector(harness.threeState);
  },
}));

vi.mock("../../src/scene/use-overflowing-placements", () => ({
  useOverflowingPlacementIds: () => [],
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
    applyCornerDirection: vi.fn(),
    applyCornerDirectionToLightRig: vi.fn(),
    applyCutaway: vi.fn(),
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
    cutawayWallsFor: vi.fn(() => []),
    disposeOverflowMark: vi.fn(),
    disposeSelectionOutline: vi.fn(),
    makeKit: vi.fn(() => ({ builders: {} })),
    resizeShellToRoom: vi.fn(),
    seatObjectOnStage: vi.fn(),
    syncSolidBodies: vi.fn(),
    syncVoidMeshes: vi.fn(),
  };
});

import { KitchenStage, useNoEditing } from "../../src/scene/kitchen-stage";

const SETTLES_IN_ONE_FRAME_SECONDS = 1_000;
const POSITION_TOLERANCE = 1e-6;
const ROOMS: Record<string, DesignRoom> = {
  straight: {
    shape: "linear",
    widthMm: 3600,
    depthMm: 600,
    heightMm: 2500,
  },
  L: KITCHEN_L_DESIGN.room,
  U: {
    shape: "U",
    widthMm: 3600,
    depthMm: 2400,
    heightMm: 2500,
    wallCMm: 2400,
  },
};

function stubCanvasElement(): HTMLElement {
  return {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    style: {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1, height: 1 }),
    getRootNode: () => ({
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
    ownerDocument: {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
  } as unknown as HTMLElement;
}

interface Ended {
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
}

/** Mounts the stage on a fresh camera, stands it at `presetId`, runs the frame loop until it settles. */
function endOfTheView(
  room: DesignRoom,
  presetId: CameraPresetId,
  hasControls: boolean,
): Ended {
  const camera = new THREE.PerspectiveCamera();
  const element = stubCanvasElement();
  const controls = hasControls ? new OrbitControls(camera, element) : null;
  if (controls) {
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
  }
  harness.storeState = {
    design: { ...KITCHEN_L_DESIGN, room },
    records: [],
    voids: [],
    selection: null,
    select: vi.fn(),
    deselect: vi.fn(),
    attachBodyProbe: vi.fn(),
    detachBodyProbe: vi.fn(),
  };
  harness.threeState = {
    camera,
    controls,
    gl: { domElement: element },
    invalidate: vi.fn(),
    scene: new THREE.Scene(),
  };
  const view = { kind: "preset", id: presetId } as const;

  KitchenStage(
    hasControls
      ? { view, onSettled: harness.onSettled }
      : { view, onSettled: harness.onSettled, useEditing: useNoEditing },
  );
  harness.frame?.({}, SETTLES_IN_ONE_FRAME_SECONDS);

  return {
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
  };
}

function expectedForward(
  room: DesignRoom,
  presetId: CameraPresetId,
): THREE.Vector3 {
  const preset = cameraPresetsForRoom(room).find((p) => p.id === presetId);
  if (preset === undefined) throw new Error(`no ${presetId} preset`);
  return new THREE.Vector3(...preset.target)
    .sub(new THREE.Vector3(...preset.position))
    .normalize();
}

beforeEach(() => {
  harness.onSettled.mockClear();
  harness.frame = undefined;
});

describe.each(Object.entries(ROOMS))("a %s room", (_name, room) => {
  const presetIds = cameraPresetsForRoom(room).map((preset) => preset.id);

  it.each(presetIds)(
    "ends the %s view where the editor's does, with no orbit controls",
    (presetId) => {
      const editor = endOfTheView(room, presetId, true);
      const review = endOfTheView(room, presetId, false);

      expect(review.position.distanceTo(editor.position)).toBeLessThan(
        POSITION_TOLERANCE,
      );
      expect(review.quaternion.angleTo(editor.quaternion)).toBeLessThan(
        POSITION_TOLERANCE,
      );
    },
  );

  it.each(presetIds)(
    "looks along the %s preset's own line of sight, with no orbit controls",
    (presetId) => {
      const review = endOfTheView(room, presetId, false);

      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
        review.quaternion,
      );
      expect(forward.distanceTo(expectedForward(room, presetId))).toBeLessThan(
        POSITION_TOLERANCE,
      );
      expect(harness.onSettled).toHaveBeenCalledOnce();
    },
  );
});
