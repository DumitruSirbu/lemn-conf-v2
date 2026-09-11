// Wave 6M's adversarial pass on the seam `use-overflowing-placements.ts` exists to be: **the one
// read of ADR 0065's overflow fact**, consumed by the scene's mark and by the sentence beside it.
//
// `overflow-mark.test.ts` and `overflow-warning.test.ts` both feed the real
// `findOverflowingPlacementIds` on one side and assert an id on the other, so **the geometry supplies
// both sides**. `docs/WORKFLOW.md`'s "both sides fed by the same source" is exactly that shape, and it
// was measured here: replacing the hook's body with a faithful local re-derivation of the same rule —
// no domain import at all — left the whole web suite green. The consequence is the one ADR 0065's
// consequences forbid, "the same design marked in one place and not another", reached by a later wave
// re-deriving the rule beside the query rather than through it.
//
// So these make the two disagree and assert which one wins: the domain query is mocked to answer
// something the geometry does not imply, and the surfaces must follow the **query**. A hook that
// re-derives the geometry answers the other way and turns these red.
// `OVERFLOWING_KITCHEN_L_DESIGN` is the **one declared** overflow fixture (ADR 0083 decision 10):
// the seeded kitchen with one body a millimetre past the end of wall B, positioned relative to the
// room so a wall moving cannot silently stop it overflowing. It was hand-built in six test files
// and agreed everywhere only because the six were written together. Aliased to the local name the
// cases below already use.
import {
  derivePlacementRecords,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  OVERFLOWING_KITCHEN_L_DESIGN as OVERFLOWING_DESIGN,
  type Design,
} from "@lemnaria/configurator-domain";
import { createElement } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/use-content", async () => {
  const { ro } = await import("../support/romanian-content");
  return { useContent: () => ro };
});

const harness = vi.hoisted(() => ({
  answer: [] as readonly string[],
  cleanups: [] as (() => void)[],
  buildOverflowMark: vi.fn(),
  buildSelectionOutline: vi.fn(),
  disposeOverflowMark: vi.fn(),
  markedTargets: [] as THREE.Object3D[],
  mountedRoom: null as THREE.Object3D | null,
  mountedSolids: null as THREE.Object3D | null,
  queriedDesigns: [] as unknown[],
  storeState: {} as Record<string, unknown>,
  threeState: {} as Record<string, unknown>,
}));

// Everything else in the domain stays real: the fixtures, the catalogue and `derivePlacementRecords`
// are what make the mount below a whole kitchen rather than a stub.
vi.mock("@lemnaria/configurator-domain", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@lemnaria/configurator-domain")>();
  return {
    ...actual,
    findOverflowingPlacementIds: (design: unknown) => {
      harness.queriedDesigns.push(design);
      return harness.answer;
    },
  };
});

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

vi.mock("@/store/configurator-store", () => ({
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
    disposeKitAndStage: vi.fn(),
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
    seatObjectOnStage: vi.fn(),
    syncSolidBodies: vi.fn(
      (input: {
        solidsRoot: THREE.Object3D;
        records: readonly { id: string }[];
      }) => {
        harness.mountedSolids = input.solidsRoot;
        for (const record of input.records) {
          const body = new THREE.Group();
          body.name = `body_${record.id}`;
          body.userData.placementId = record.id;
          input.solidsRoot.add(body);
        }
      },
    ),
    syncVoidMeshes: vi.fn(),
  };
});

const { KitchenStage } = await import("../../src/scene/kitchen-stage");
const { OverflowWarning } = await import("../../src/scene/overflow-warning");
const { ro } = await import("../support/romanian-content");

const OVERVIEW_VIEW = {
  kind: "fixed",
  position: [4.3, 3, 5.3],
  target: [1.6, 1.35, 0.85],
} as const;

/** A body of the seeded kitchen that fits with room to spare: wall A's run ends at 3500 of 3560, and
 *  this one is nowhere near the end. Nothing about its geometry says "overflowing". */
const FITTING_PLACEMENT_ID = KITCHEN_L_DESIGN.placements[0]?.id ?? "";

function mountStage(design: Design, answer: readonly string[]): void {
  harness.answer = answer;
  harness.storeState = {
    attachBodyProbe: vi.fn(),
    deselect: vi.fn(),
    design,
    detachBodyProbe: vi.fn(),
    records: derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG),
    select: vi.fn(),
    selection: null,
    voids: [],
  };
  KitchenStage({ view: OVERVIEW_VIEW });
}

function renderWarning(design: Design, answer: readonly string[]): string {
  harness.answer = answer;
  // Stage mounted: these cases test the query/geometry agreement, not the loading window that
  // `overflow-warning-loading.test.ts` owns.
  harness.storeState = { design, isBodyProbeAttached: true };
  return renderToStaticMarkup(createElement(OverflowWarning));
}

function runCleanups(): void {
  const cleanups = [...harness.cleanups];
  harness.cleanups = [];
  for (const cleanup of cleanups) cleanup();
}

/** The transform, visibility and parentage a body wears once the mount has finished — the whole of
 *  "not moved, resized, hidden or reparented", read off the mounted object. */
interface BodyPose {
  readonly matrix: number[];
  readonly visible: boolean;
  readonly parentName: string;
  readonly childCount: number;
}

function poseOf(body: THREE.Object3D): BodyPose {
  body.updateWorldMatrix(true, false);
  return {
    matrix: [...body.matrixWorld.elements],
    visible: body.visible,
    parentName: body.parent?.name ?? "(detached)",
    childCount: body.children.length,
  };
}

function mountedBody(placementId: string): THREE.Object3D {
  const body = harness.mountedSolids?.children.find(
    (child) => child.userData.placementId === placementId,
  );
  if (!body) throw new Error(`no body mounted for ${placementId}`);
  return body;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  harness.answer = [];
  harness.cleanups = [];
  harness.markedTargets = [];
  harness.mountedRoom = null;
  harness.mountedSolids = null;
  harness.queriedDesigns = [];
  harness.buildOverflowMark.mockImplementation(
    (input: { target: THREE.Object3D; parent: THREE.Object3D }) => {
      harness.markedTargets.push(input.target);
      harness.mountedRoom = input.parent;
      const group = new THREE.Group();
      group.name = "overflow_mark";
      return { group };
    },
  );
  harness.buildSelectionOutline.mockImplementation(() => ({
    group: new THREE.Group(),
  }));
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

describe("the scene marks what the domain query answers, not what it could work out itself", () => {
  it("marks a body whose own geometry fits, because the query named it", () => {
    // The disagreement. Nothing in this design reaches past a wall, so a hook re-deriving the rule
    // from `alongMm + widthMm / 2` marks nothing here and this fails.
    mountStage(KITCHEN_L_DESIGN, [FITTING_PLACEMENT_ID]);

    expect(FITTING_PLACEMENT_ID).not.toBe("");
    expect(harness.buildOverflowMark).toHaveBeenCalledOnce();
    expect(harness.markedTargets[0]?.userData.placementId).toBe(
      FITTING_PLACEMENT_ID,
    );
  });

  it("marks nothing on a design that does overflow, because the query named nothing", () => {
    // The other direction, so the pair cannot both be satisfied by a re-derivation.
    mountStage(OVERFLOWING_DESIGN, []);

    expect(harness.buildOverflowMark).not.toHaveBeenCalled();
  });

  it("asks the query about the design the store holds", () => {
    mountStage(OVERFLOWING_DESIGN, []);

    expect(harness.queriedDesigns).toContain(OVERFLOWING_DESIGN);
  });
});

describe("the sentence beside the scene reads the same answer", () => {
  it("appears for a design whose geometry fits, because the query named a body", () => {
    const markup = renderWarning(KITCHEN_L_DESIGN, [FITTING_PLACEMENT_ID]);

    expect(markup).toContain(ro.configure.overflowWarning);
  });

  it("stays silent on a design that overflows, because the query named nothing", () => {
    const markup = renderWarning(OVERFLOWING_DESIGN, []);

    expect(markup).not.toContain(ro.configure.overflowWarning);
  });
});

describe("marking is the whole of what happens to the body", () => {
  it("leaves its transform, visibility and parentage exactly as the unmarked mount left them", () => {
    // ADR 0065 decision 1: "not moved, resized, hidden". Measured as the difference between two
    // mounts of the *same* design, one where the query marks this body and one where it marks
    // nothing, so the mark is the only variable. Nothing else in wave 6M's suite would notice the
    // effect nudging, scaling or hiding the body it marks: the effect can add
    // `target.position.x += 1` and every one of its 69 tests still passes.
    mountStage(OVERFLOWING_DESIGN, []);
    const unmarked = poseOf(mountedBody(FITTING_PLACEMENT_ID));

    mountStage(OVERFLOWING_DESIGN, [FITTING_PLACEMENT_ID]);
    const marked = poseOf(mountedBody(FITTING_PLACEMENT_ID));

    expect(harness.buildOverflowMark).toHaveBeenCalledOnce();
    expect(marked).toStrictEqual(unmarked);
    expect(marked.visible).toBe(true);
    expect(marked.parentName).toBe("solids");
    expect(marked.childCount).toBe(0);
  });
});

describe("the marks the effect is holding", () => {
  it("are forgotten by the cleanup, so a second teardown disposes nothing twice", () => {
    // The ref is the effect's only record of what it mounted. A cleanup that detaches and disposes
    // but leaves the ref populated re-walks the previous pass's marks on the next teardown.
    mountStage(OVERFLOWING_DESIGN, ["dragged-past-wall-b"]);
    const teardowns = [...harness.cleanups];

    for (const teardown of teardowns) teardown();
    const afterFirstTeardown = harness.disposeOverflowMark.mock.calls.length;
    for (const teardown of teardowns) teardown();

    expect(afterFirstTeardown).toBe(1);
    expect(harness.disposeOverflowMark).toHaveBeenCalledTimes(1);
  });

  it("are all released when a design change replaces them", () => {
    mountStage(OVERFLOWING_DESIGN, ["dragged-past-wall-b"]);

    runCleanups();

    expect(harness.disposeOverflowMark).toHaveBeenCalledTimes(1);
  });
});
