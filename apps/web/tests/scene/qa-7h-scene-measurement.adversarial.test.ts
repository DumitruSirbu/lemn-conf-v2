// Wave 7H adversarial QA: the readout the ceiling-row e2e spec believes.
//
// `scene-measurement-store.ts` arrived in this wave with one reader — a Playwright spec — and no
// unit test at all. That is the wrong way round for a measurement oracle: if it publishes a stale
// camera, the spec measures a frame the renderer never drew and reports green for a scene nobody
// would accept. The store's own docstring makes two load-bearing claims, and neither is asserted
// anywhere:
//
//   1. the matrices are the camera's **as the renderer holds them after the ease has landed**;
//   2. `settleCount` is a **counter and not a flag**, so a spec that recorded it before a tap and
//      waited for a larger one cannot be satisfied by the settle that was already there.
//
// Both are attacked here, along with the one thing a readout must never do — decide what is being
// measured. The bodies it publishes are every tagged body and nothing else.
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SELECTION_DEBUG_FLAG } from "../../src/app/configurator/configure/selection-debug-availability";

type MeasurementStore =
  typeof import("../../src/scene/scene-measurement-store");

/** The gate is a module-level constant read from the environment at import, so the flag has to be
 *  in place **before** the module is evaluated. Imported one at a time: two `import()` calls in one
 *  tick share a module registry that `resetModules` has already handed out. */
async function loadStoreWithFlag(flagValue: string): Promise<MeasurementStore> {
  vi.resetModules();
  vi.stubEnv(SELECTION_DEBUG_FLAG, flagValue);
  return import("../../src/scene/scene-measurement-store");
}

let store: MeasurementStore;

beforeEach(async () => {
  store = await loadStoreWithFlag("1");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function cameraLookingAt(
  position: readonly [number, number, number],
  target: readonly [number, number, number],
): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(45, 390 / 789, 0.1, 500);
  camera.position.set(...position);
  camera.lookAt(new THREE.Vector3(...target));
  camera.updateMatrixWorld();
  return camera;
}

function solidsWith(...bodies: readonly THREE.Object3D[]): THREE.Group {
  const solidsRoot = new THREE.Group();
  solidsRoot.name = "solids";
  for (const body of bodies) solidsRoot.add(body);
  return solidsRoot;
}

function taggedBox(placementId: string, x: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.72, 0.6));
  mesh.userData.placementId = placementId;
  mesh.position.set(x, 0.36, 0.3);
  return mesh;
}

/** A shell child: no `placementId`, exactly as `buildKitchenShell` leaves it. */
function untaggedShell(): THREE.Mesh {
  const shell = new THREE.Mesh(new THREE.BoxGeometry(4, 0.04, 3));
  shell.name = "floor";
  return shell;
}

function publishedBy(store: MeasurementStore) {
  const measurement = store.useSceneMeasurement.getState().measurement;
  if (!measurement) throw new Error("nothing was published");
  return measurement;
}

describe("the settle count is a counter and not a flag", () => {
  it("starts at one, so a spec that recorded zero before the tap sees a larger number", () => {
    const camera = cameraLookingAt([4, 2, 5], [1.6, 1.3, 0.8]);

    store.publishSceneMeasurement({ camera, solidsRoot: solidsWith() });

    expect(publishedBy(store).settleCount).toBe(1);
  });

  /** The failure the counter exists to prevent, stated as the behaviour rather than as the reason:
   *  the scene is already settled when a preset button is tapped, so a *second* settle at the same
   *  camera must still be distinguishable from the first. */
  it("increments even when the camera has not moved between two settles", () => {
    const camera = cameraLookingAt([4, 2, 5], [1.6, 1.3, 0.8]);
    const solidsRoot = solidsWith(taggedBox("p1", 0.3));

    store.publishSceneMeasurement({ camera, solidsRoot });
    const afterFirst = publishedBy(store).settleCount;
    store.publishSceneMeasurement({ camera, solidsRoot });

    expect(publishedBy(store).settleCount).toBe(afterFirst + 1);
  });

  it("never goes backwards over a long run of settles", () => {
    const camera = cameraLookingAt([4, 2, 5], [1.6, 1.3, 0.8]);
    const counts: number[] = [];

    for (let settle = 0; settle < 25; settle++) {
      camera.position.x += 0.1;
      store.publishSceneMeasurement({ camera, solidsRoot: solidsWith() });
      counts.push(publishedBy(store).settleCount);
    }

    expect(counts).toEqual(Array.from({ length: 25 }, (_, index) => index + 1));
  });
});

describe("what it publishes is the camera the renderer holds now", () => {
  /** The staleness attack. A caller that moved the camera and left the matrix cache alone — which
   *  is what `camera.position.copy(...)` on its own does — must not be published as the frame
   *  before the move. */
  it("republishes a camera that was moved without its world matrix being refreshed", () => {
    const camera = cameraLookingAt([4, 2, 5], [1.6, 1.3, 0.8]);
    const solidsRoot = solidsWith();
    store.publishSceneMeasurement({ camera, solidsRoot });
    const beforeTheMove = publishedBy(store).view;

    camera.position.set(1.9, 2.1, 5.6);
    store.publishSceneMeasurement({ camera, solidsRoot });

    const afterTheMove = publishedBy(store).view;
    expect(afterTheMove).not.toEqual(beforeTheMove);
    expect(afterTheMove).toEqual([...camera.matrixWorldInverse.elements]);
  });

  it("publishes the projection the camera is currently configured with", () => {
    const camera = cameraLookingAt([4, 2, 5], [1.6, 1.3, 0.8]);
    const solidsRoot = solidsWith();
    store.publishSceneMeasurement({ camera, solidsRoot });
    const atFortyFive = publishedBy(store).projection;

    camera.fov = 70;
    camera.updateProjectionMatrix();
    store.publishSceneMeasurement({ camera, solidsRoot });

    expect(publishedBy(store).projection).not.toEqual(atFortyFive);
    expect(publishedBy(store).projection).toEqual([
      ...camera.projectionMatrix.elements,
    ]);
  });

  /** A published measurement is a snapshot of one frame. Holding the camera's own live arrays would
   *  make every reading in the spec the reading of whatever frame it happened to run in. */
  it("keeps a moved camera out of a measurement already published", () => {
    const camera = cameraLookingAt([4, 2, 5], [1.6, 1.3, 0.8]);
    store.publishSceneMeasurement({ camera, solidsRoot: solidsWith() });
    const published = publishedBy(store);
    const view = [...published.view];

    camera.position.set(0.5, 0.5, 0.5);
    camera.updateMatrixWorld();

    expect(published.view).toEqual(view);
  });
});

describe("the bodies it publishes decide nothing", () => {
  it("publishes every tagged body and leaves the untagged shell out", () => {
    const camera = cameraLookingAt([4, 2, 5], [1.6, 1.3, 0.8]);
    const solidsRoot = solidsWith(
      untaggedShell(),
      taggedBox("p1", 0.3),
      taggedBox("p2", 1.2),
    );

    store.publishSceneMeasurement({ camera, solidsRoot });

    expect(publishedBy(store).bodies.map((body) => body.placementId)).toEqual([
      "p1",
      "p2",
    ]);
  });

  /** World-space, not local: a body's bounds are read through every transform above it, so a
   *  spec projecting them lands where the customer's tap lands. */
  it("reads a body's bounds through the transform of the group it hangs from", () => {
    const camera = cameraLookingAt([4, 2, 5], [1.6, 1.3, 0.8]);
    const solidsRoot = solidsWith(taggedBox("p1", 0.3));
    store.publishSceneMeasurement({ camera, solidsRoot });
    const atTheOrigin = publishedBy(store).bodies[0];

    solidsRoot.position.set(10, 0, 0);
    store.publishSceneMeasurement({ camera, solidsRoot });

    expect(publishedBy(store).bodies[0]?.min[0]).toBeCloseTo(
      (atTheOrigin?.min[0] ?? 0) + 10,
      6,
    );
  });

  it("publishes an empty list rather than nothing when no body is mounted", () => {
    const camera = cameraLookingAt([4, 2, 5], [1.6, 1.3, 0.8]);

    store.publishSceneMeasurement({
      camera,
      solidsRoot: solidsWith(untaggedShell()),
    });

    expect(publishedBy(store).bodies).toEqual([]);
  });
});

/** WEB-004: the readout is opted **in**. A build that did not set the flag must publish nothing at
 *  all, not an empty measurement a spec could mistake for a settled scene. */
describe("a build that did not opt in publishes nothing", () => {
  it.each(["", "0", "false", "true", "yes"])(
    "stays silent when the flag reads %o",
    async (flagValue) => {
      const disabled = await loadStoreWithFlag(flagValue);

      disabled.publishSceneMeasurement({
        camera: cameraLookingAt([4, 2, 5], [1.6, 1.3, 0.8]),
        solidsRoot: solidsWith(taggedBox("p1", 0.3)),
      });

      expect(disabled.useSceneMeasurement.getState().measurement).toBeNull();
    },
  );
});
