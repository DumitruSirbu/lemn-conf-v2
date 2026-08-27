// M3 work item 7: the `BodyProbe` implementation, and `DEVELOPMENT-SPEC.md` §11 row 19 for the
// bodies a customer inserts.
//
// Row 19 is the hard case, not the easy one: the opening's previous occupant is right there to be
// wrongly measured against, and §6.2 records two attempts that did exactly that — one left a
// 330 mm wall unit floating 135 mm off the wall, the next buried inserts 10–31 mm *inside* it.
// Every assertion here therefore reads the wall plane out of the room's own meshes and measures
// the body after it is mounted, never from a constant and never from a neighbour.
import {
  deriveCabinetWorldTransform,
  type BodyProbeRequest,
  type DesignWall,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { buildCatalogBody } from "../src/catalog-bodies.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import {
  createBodyProbe,
  measureBuiltBody,
  readWallPlaneM,
  WALL_A_MESH_NAME,
  WALL_B_MESH_NAME,
} from "../src/measure-built-body.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

/** M1's parity epsilon — the same one §11 row 19 names ("0.000", asserted at 1e-6 m). */
const FLOAT_EPSILON_METRES = 1e-6;

const WORKTOP_HEIGHT_M = 0.86;
/** The full extent of a sink base: 860 mm of carcass plus the faucet. It measured exactly this
 *  and was refused from an opening it fits perfectly — §11 row 7. */
const SINK_FULL_HEIGHT_M = 1.224;

let kit: Kit;
let room: THREE.Object3D;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
  room = kit.builders["kitchen-l"]();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function request(
  buildId: string,
  widthM: number,
  heightM: number,
  depthM: number,
): BodyProbeRequest {
  return { buildId, widthM, heightM, depthM };
}

const SINK_REQUEST = request("base-sink", 0.8, WORKTOP_HEIGHT_M, 0.58);
const WALL_REQUEST = request("wall-cabinet", 0.6, 0.7, 0.33);
const COLUMN_REQUEST = request("tall-pantry", 0.6, 2.2, 0.56);

describe("measureBuiltBody", () => {
  // §11 row 7: fit is judged on the carcass, so what rises into free air is reported and never a
  // gate.
  it("excludes the sink's faucet from the carcass and reports it in the full extent", () => {
    const measurement = measureBuiltBody({ kit, room, request: SINK_REQUEST });

    expect(measurement.carcassHeightM).toBeCloseTo(WORKTOP_HEIGHT_M, 6);
    expect(measurement.fullHeightM).toBeGreaterThan(measurement.carcassHeightM);
    expect(measurement.fullHeightM).toBeCloseTo(SINK_FULL_HEIGHT_M, 3);
  });

  it("reads the wall plane from the room rather than assuming z = 0", () => {
    const movedRoom = kit.builders["kitchen-l"]();
    movedRoom.position.z = 0.25;
    movedRoom.updateWorldMatrix(true, true);

    // A hardcoded z = 0 would report 0 − 0.05 = −0.05 here, so this number is the whole test.
    const plane = readWallPlaneM(movedRoom, WALL_A_MESH_NAME);
    const inMovedRoom = measureBuiltBody({
      kit,
      room: movedRoom,
      request: WALL_REQUEST,
    });

    expect(plane).toBeCloseTo(0.25, 6);
    expect(inMovedRoom.seatOffsetM).toBeCloseTo(
      measureBuiltBody({ kit, room, request: WALL_REQUEST }).seatOffsetM,
      6,
    );
    expect(inMovedRoom.seatOffsetM).toBeGreaterThan(0);
  });

  it("throws when the room has no such wall mesh", () => {
    expect(() => readWallPlaneM(new THREE.Group(), WALL_A_MESH_NAME)).toThrow(
      /wall_back/,
    );
  });

  it("leaves the room with the same children in the same order", () => {
    const before = [...room.children];

    measureBuiltBody({ kit, room, request: SINK_REQUEST });
    measureBuiltBody({ kit, room, request: COLUMN_REQUEST });

    expect(room.children).toEqual(before);
  });

  // The probe may dispose only what it alone owns. `kit.M`'s materials are shared, and so are the
  // `ExtrudeGeometry` instances `chamferBox` memoises by size — measuring a body hands back the
  // very buffers every mounted body of that size is rendering from.
  it("disposes only geometry the kit does not own, and no material", () => {
    const disposed = new Set<THREE.BufferGeometry>();
    vi.spyOn(THREE.BufferGeometry.prototype, "dispose").mockImplementation(
      function (this: THREE.BufferGeometry) {
        disposed.add(this);
      },
    );
    const disposeMaterial = vi.spyOn(THREE.Material.prototype, "dispose");

    measureBuiltBody({ kit, room, request: SINK_REQUEST });

    expect(disposed.size).toBeGreaterThan(0);
    for (const geometry of disposed) {
      expect(kit.ownsGeometry(geometry)).toBe(false);
    }
    expect(disposeMaterial).not.toHaveBeenCalled();
  });

  it("is deterministic across repeats and across unrelated measurements", () => {
    const first = measureBuiltBody({ kit, room, request: WALL_REQUEST });
    const repeated = measureBuiltBody({ kit, room, request: WALL_REQUEST });

    measureBuiltBody({ kit, room, request: SINK_REQUEST });
    measureBuiltBody({ kit, room, request: COLUMN_REQUEST });
    const afterOthers = measureBuiltBody({ kit, room, request: WALL_REQUEST });

    expect(repeated).toEqual(first);
    expect(afterOthers).toEqual(first);
  });

  it("measures a body the same way through the BodyProbe port", () => {
    const probe = createBodyProbe(kit, room);

    expect(probe.measure(WALL_REQUEST)).toEqual(
      measureBuiltBody({ kit, room, request: WALL_REQUEST }),
    );
  });
});

// §11 row 19, for inserted bodies: seat the group exactly as the domain will — persist
// `2 × seatOffsetM` as `seatDepthMm`, let `deriveCabinetWorldTransform` place it at half of that
// off the plane — and measure the back face against the plane read from the room.
describe("row 19 — an inserted body's back face lies on the wall plane", () => {
  const SEATED_CASES: readonly {
    readonly name: string;
    readonly request: BodyProbeRequest;
    readonly alongM: number;
    readonly y0M: number;
  }[] = [
    { name: "a base cabinet", request: SINK_REQUEST, alongM: 1.3, y0M: 0 },
    { name: "a wall cabinet", request: WALL_REQUEST, alongM: 2.0, y0M: 1.5 },
    { name: "a column", request: COLUMN_REQUEST, alongM: 1.8, y0M: 0 },
  ];

  it.each(SEATED_CASES)("seats $name on wall A", (testCase) => {
    const seated = seat(testCase.request, "A", testCase.alongM, testCase.y0M);

    expect(
      Math.abs(seated.min.z - readWallPlaneM(room, WALL_A_MESH_NAME)),
    ).toBeLessThanOrEqual(FLOAT_EPSILON_METRES);
  });

  it.each(SEATED_CASES)("seats $name on wall B", (testCase) => {
    const seated = seat(testCase.request, "B", testCase.alongM, testCase.y0M);

    expect(
      Math.abs(seated.min.x - readWallPlaneM(room, WALL_B_MESH_NAME)),
    ).toBeLessThanOrEqual(FLOAT_EPSILON_METRES);
  });
});

// The invariant that makes a rebuild possible at all: the design persists `seatDepthMm`, not the
// depth the builder was given. Rebuilding at `2 × seatOffsetM` has to reproduce the same body, or
// a reloaded design renders something the probe never measured.
describe("rebuilding at the persisted seat depth", () => {
  it.each([SINK_REQUEST, WALL_REQUEST, COLUMN_REQUEST])(
    "reproduces $buildId exactly",
    (original) => {
      const measured = measureBuiltBody({ kit, room, request: original });

      const rebuilt = measureBuiltBody({
        kit,
        room,
        request: { ...original, depthM: 2 * measured.seatOffsetM },
      });

      expect(rebuilt).toEqual(measured);
    },
  );

  // F2, pinned as two explicit halves. `seatDepthMm` is `2 ×` a rear overhang, **not** the depth
  // the builder was handed, and `buildBody` rebuilds from it — so exactly which entries make those
  // two numbers coincide is load-bearing, and it is a property of the builders, not a contract.
  // Only `wallCabinet` and `openShelf` consume a depth at all, and only they centre their carcass
  // on z = 0. If a builder is ever parameterised over depth (M5), this is the test that will say so.
  it.each([
    { buildId: "wall-cabinet", heightM: 0.7 },
    { buildId: "wall-cabinet", heightM: 0.7 },
    { buildId: "wall-lift", heightM: 0.7 },
    { buildId: "open-shelf", heightM: 0.7 },
  ])("$buildId seats at exactly half the depth it was given", (testCase) => {
    const depthM = 0.33;

    const measured = measureBuiltBody({
      kit,
      room,
      request: request(testCase.buildId, 0.6, testCase.heightM, depthM),
    });

    expect(Math.abs(2 * measured.seatOffsetM - depthM)).toBeLessThanOrEqual(
      FLOAT_EPSILON_METRES,
    );
  });

  it.each([
    {
      buildId: "base-cabinet",
      widthM: 0.6,
      heightM: WORKTOP_HEIGHT_M,
      seatDepthM: 0.58,
    },
    {
      buildId: "base-sink",
      widthM: 0.8,
      heightM: WORKTOP_HEIGHT_M,
      seatDepthM: 0.58,
    },
    {
      buildId: "base-dishwasher",
      widthM: 0.6,
      heightM: WORKTOP_HEIGHT_M,
      seatDepthM: 0.58,
    },
    { buildId: "hood", widthM: 0.6, heightM: 0.71, seatDepthM: 0.5 },
    { buildId: "tall-pantry", widthM: 0.6, heightM: 2.2, seatDepthM: 0.56 },
    { buildId: "fridge-free", widthM: 0.7, heightM: 1.85, seatDepthM: 0.68 },
  ])(
    "$buildId ignores the depth it was given and records its own $seatDepthM m",
    (testCase) => {
      const givenDepthM = 0.6;

      const measured = measureBuiltBody({
        kit,
        room,
        request: {
          buildId: testCase.buildId,
          widthM: testCase.widthM,
          heightM: testCase.heightM,
          depthM: givenDepthM,
        },
      });

      expect(2 * measured.seatOffsetM).toBeCloseTo(testCase.seatDepthM, 6);
      expect(2 * measured.seatOffsetM).not.toBeCloseTo(givenDepthM, 6);
    },
  );

  it("reproduces a wall cabinet hung in a deep column", () => {
    const deep = measureBuiltBody({
      kit,
      room,
      request: request("wall-cabinet", 0.6, 0.7, 0.6),
    });

    const rebuilt = measureBuiltBody({
      kit,
      room,
      request: request("wall-cabinet", 0.6, 0.7, 2 * deep.seatOffsetM),
    });

    expect(rebuilt).toEqual(deep);
  });
});

/** Mounts a measured body the way `insertBody` + `deriveFrame` will, and returns its world box. */
function seat(
  probeRequest: BodyProbeRequest,
  wall: DesignWall,
  alongM: number,
  y0M: number,
): THREE.Box3 {
  const measurement = measureBuiltBody({ kit, room, request: probeRequest });
  const transform = deriveCabinetWorldTransform({
    wall,
    alongM,
    y0M,
    depthM: 2 * measurement.seatOffsetM,
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
