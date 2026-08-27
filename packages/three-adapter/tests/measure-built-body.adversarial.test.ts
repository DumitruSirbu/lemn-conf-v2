// Adversarial QA for M3 Wave 3B, work item 7. The implementer's suite proves the probe returns
// plausible numbers; this one runs those numbers through the arithmetic the *domain* applies to
// them and asserts what the scene must look like afterwards.
//
// Two things it deliberately does that `measure-built-body.test.ts` does not:
//   1. §11 row 19 is asserted through `toMillimetres(2 × seatOffsetM)` — the integer-millimetre
//      round trip `insertBody` persists — rather than through the raw float. The rounding happens
//      between the measurement and the placement, so a row-19 assertion that skips it is asserting
//      a number no document ever holds.
//   2. The probe shares a live room with mounted bodies, so what it disposes has to be checked
//      against what the *rest of the scene* still references.
import {
  deriveCabinetWorldTransform,
  toMetres,
  toMillimetres,
  type BodyProbeRequest,
  type DesignWall,
} from "@lemnaria/configurator-domain";
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

import { buildCatalogBody } from "../src/catalog-bodies.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import {
  measureBuiltBody,
  readWallPlaneM,
  WALL_A_MESH_NAME,
  WALL_B_MESH_NAME,
} from "../src/measure-built-body.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import { isMesh } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

/** M1's parity epsilon — the one §11 row 19 names ("0.000"). */
const FLOAT_EPSILON_METRES = 1e-6;

let kit: Kit;
let room: THREE.Object3D;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
});

beforeEach(() => {
  room = kit.builders["kitchen-l"]();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function request(
  buildId: string,
  widthMm: number,
  heightMm: number,
  depthM: number,
): BodyProbeRequest {
  return {
    buildId,
    widthM: toMetres(widthMm),
    heightM: toMetres(heightMm),
    depthM,
  };
}

/** Every band the catalogue can put on a wall, including the two §11 singles out: the hood
 *  (row 6, carcass = canopy + chimney, ADR 0016) and the sink base (row 7, faucet excluded). */
const SEATED_CASES: readonly {
  readonly name: string;
  readonly request: BodyProbeRequest;
  readonly y0M: number;
}[] = [
  {
    name: "a base cabinet",
    request: request("base-cabinet", 600, 860, 0.58),
    y0M: 0,
  },
  {
    name: "the sink base",
    request: request("base-sink", 800, 860, 0.58),
    y0M: 0,
  },
  {
    name: "a wall cabinet",
    request: request("wall-cabinet", 600, 700, 0.56),
    y0M: 1.5,
  },
  {
    name: "an open shelf",
    request: request("open-shelf", 600, 700, 0.56),
    y0M: 1.5,
  },
  { name: "the hood", request: request("hood", 600, 710, 0.5), y0M: 1.5 },
  {
    name: "a column",
    request: request("tall-pantry", 600, 2200, 0.56),
    y0M: 0,
  },
  {
    name: "a freestanding fridge",
    request: request("fridge-free", 700, 1850, 0.68),
    y0M: 0,
  },
];

function seatedCase(index: number): BodyProbeRequest {
  const testCase = SEATED_CASES[index];
  if (!testCase) throw new Error(`no seated case at index ${String(index)}`);
  return testCase.request;
}

/** Mounts a body exactly as `insertBody` + `deriveFrame` will: the measured seat is persisted as
 *  **integer millimetres** and read back out again before it ever reaches the transform. */
function seatThroughTheDocument(
  probeRequest: BodyProbeRequest,
  wall: DesignWall,
  y0M: number,
): THREE.Box3 {
  const measurement = measureBuiltBody({ kit, room, request: probeRequest });
  const seatDepthMm = toMillimetres(2 * measurement.seatOffsetM);
  const transform = deriveCabinetWorldTransform({
    wall,
    alongM: 1.2,
    y0M,
    depthM: toMetres(seatDepthMm),
  });

  const body = buildCatalogBody(kit, probeRequest.buildId, probeRequest);
  body.position.set(
    transform.position.x,
    transform.position.y,
    transform.position.z,
  );
  body.rotation.y = transform.yawRadians;
  room.add(body);
  try {
    body.updateWorldMatrix(true, true);
    return new THREE.Box3().setFromObject(body);
  } finally {
    room.remove(body);
  }
}

describe("row 19 survives the integer-millimetre round trip", () => {
  it.each(SEATED_CASES)("seats $name on wall A", (testCase) => {
    const seated = seatThroughTheDocument(testCase.request, "A", testCase.y0M);

    expect(
      Math.abs(seated.min.z - readWallPlaneM(room, WALL_A_MESH_NAME)),
    ).toBeLessThanOrEqual(FLOAT_EPSILON_METRES);
  });

  it.each(SEATED_CASES)("seats $name on wall B", (testCase) => {
    const seated = seatThroughTheDocument(testCase.request, "B", testCase.y0M);

    expect(
      Math.abs(seated.min.x - readWallPlaneM(room, WALL_B_MESH_NAME)),
    ).toBeLessThanOrEqual(FLOAT_EPSILON_METRES);
  });

  it.each(SEATED_CASES)(
    "persists $name's seat as a whole millimetre",
    (testCase) => {
      const measurement = measureBuiltBody({
        kit,
        room,
        request: testCase.request,
      });
      const seatMm = 2000 * measurement.seatOffsetM;

      // Not a stylistic preference: the whole of row 19 rests on this. A body whose doubled seat
      // landed mid-millimetre would move by up to 250 µm when the document rounded it.
      expect(Math.abs(seatMm - Math.round(seatMm))).toBeLessThan(0.001);
    },
  );
});

// The probe's own comment: "a body on wall B is the same body yawed by π/2, so its local +Z back
// face becomes its world +X back face". True — but the *plane* it is seated against is read from
// `wall_back` for both walls, and `WALL_B_MESH_NAME` is exported and never read by the measuring
// path. That is only sound while the two planes coincide, so the coincidence is asserted here
// rather than left implicit: if wall B ever moves, this test fails before row 19 does.
describe("one seat offset serves both walls only because the planes coincide", () => {
  it("reads the same plane coordinate from wall A and wall B", () => {
    expect(readWallPlaneM(room, WALL_A_MESH_NAME)).toBeCloseTo(
      readWallPlaneM(room, WALL_B_MESH_NAME),
      12,
    );
  });

  it("returns a wall-A seat for a body destined for wall B when wall B is moved", () => {
    const wallB = room.getObjectByName(WALL_B_MESH_NAME);
    if (!wallB) throw new Error("room has no wall_left");
    wallB.position.x = 0.5;
    room.updateWorldMatrix(true, true);

    const measured = measureBuiltBody({
      kit,
      room,
      request: request("wall-cabinet", 600, 700, 0.4),
    });
    const seated = seatThroughTheDocument(
      request("wall-cabinet", 600, 700, 0.4),
      "B",
      1.5,
    );

    // The measurement did not change, so the body seats against wall A's plane (x = 0) and is
    // left 500 mm clear of the wall it is actually hung on. Documented, not endorsed.
    expect(2000 * measured.seatOffsetM).toBeCloseTo(400, 3);
    expect(seated.min.x).toBeCloseTo(0, 6);
    expect(readWallPlaneM(room, WALL_B_MESH_NAME)).toBeCloseTo(0.5, 6);
  });
});

describe("the probe leaves the room exactly as it found it", () => {
  it("restores the children, in order, across repeats and unrelated measurements", () => {
    const before = [...room.children];

    measureBuiltBody({ kit, room, request: seatedCase(0) });
    measureBuiltBody({ kit, room, request: seatedCase(4) });
    measureBuiltBody({ kit, room, request: seatedCase(0) });

    expect(room.children).toHaveLength(before.length);
    for (const [index, child] of before.entries()) {
      expect(room.children[index]).toBe(child);
    }
  });

  it("restores the children when the builder throws", () => {
    const before = [...room.children];

    expect(() =>
      measureBuiltBody({
        kit,
        room,
        request: request("base-sink-800", 800, 860, 0.58),
      }),
    ).toThrow(/No catalog builder registered/);

    expect(room.children).toEqual(before);
  });

  it("is deterministic while bodies are being synced into the same room", () => {
    const solids = new THREE.Group();
    room.add(solids);
    const first = measureBuiltBody({ kit, room, request: seatedCase(2) });

    syncSolidBodies({ kit, solidsRoot: solids, records: [] });
    const measured = measureBuiltBody({ kit, room, request: seatedCase(2) });

    expect(measured).toEqual(first);
  });

  it("measures the same body the same way after a different-sized one of the same buildId", () => {
    const narrow = request("wall-cabinet", 400, 700, 0.4);
    const wide = request("wall-cabinet", 800, 700, 0.4);
    const first = measureBuiltBody({ kit, room, request: narrow });

    measureBuiltBody({ kit, room, request: wide });

    expect(measureBuiltBody({ kit, room, request: narrow })).toEqual(first);
  });
});

// R1 finding QA-2, re-verified against `kit.ownsGeometry`. `chamferBox` memoises every
// `ExtrudeGeometry` by size, so a probe call builds a group whose boxes are the very buffers every
// mounted body of that size renders from; `disposeMeasuredGeometries` now skips them. Both halves
// are asserted: the shared buffers survive, **and** the geometry the measurement alone created is
// still freed — a guard that answered "shared" for everything would pass the first half and turn
// the probe into a leak on every insert.
describe("the probe disposes nothing the live scene is still using", () => {
  it("leaves a mounted body's geometries undisposed after measuring its twin", () => {
    const solids = new THREE.Group();
    room.add(solids);
    const mounted = buildCatalogBody(kit, "base-cabinet", {
      widthM: 0.6,
      heightM: 0.86,
      depthM: 0.58,
    });
    solids.add(mounted);

    const disposed = new Set<THREE.BufferGeometry>();
    vi.spyOn(THREE.BufferGeometry.prototype, "dispose").mockImplementation(
      function (this: THREE.BufferGeometry) {
        disposed.add(this);
      },
    );

    measureBuiltBody({
      kit,
      room,
      request: request("base-cabinet", 600, 860, 0.58),
    });

    const stolen = stillMountedGeometries(mounted).filter((geometry) =>
      disposed.has(geometry),
    );

    expect(disposed.size).toBeGreaterThan(0);
    // Reported as a count: the geometries themselves serialise to thousands of lines, and the
    // number is the finding — every one of these is a mesh the live scene still renders.
    expect(stolen.length).toBe(0);
  });

  it("still frees the geometry the measurement alone created", () => {
    const measured = buildCatalogBody(kit, "base-sink", {
      widthM: 0.8,
      heightM: 0.86,
      depthM: 0.58,
    });
    const ownGeometries = stillMountedGeometries(measured).filter(
      (geometry) => !kit.ownsGeometry(geometry),
    );
    const disposed = new Set<THREE.BufferGeometry>();
    vi.spyOn(THREE.BufferGeometry.prototype, "dispose").mockImplementation(
      function (this: THREE.BufferGeometry) {
        disposed.add(this);
      },
    );

    measureBuiltBody({
      kit,
      room,
      request: request("base-sink", 800, 860, 0.58),
    });

    // The faucet's cylinders and torus are built fresh for every group and memoised by nothing.
    expect(ownGeometries.length).toBeGreaterThan(0);
    // Exactly its own, not merely "at least": the two groups are built identically, so any other
    // number means the probe either skipped one of its own buffers or reached past them.
    expect(disposed.size).toBe(ownGeometries.length);
    expect(
      [...disposed].filter((geometry) => kit.ownsGeometry(geometry)),
    ).toEqual([]);
  });
});

function stillMountedGeometries(root: THREE.Object3D): THREE.BufferGeometry[] {
  const geometries: THREE.BufferGeometry[] = [];
  root.traverse((node) => {
    if (isMesh(node)) geometries.push(node.geometry);
  });
  return geometries;
}
