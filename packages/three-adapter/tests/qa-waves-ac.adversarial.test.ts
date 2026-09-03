// Adversarial QA for the two batched waves, on real geometry:
//
//   Wave A — §7's `min(d, 0.4)` became a head-clearance rule that follows what stands under the
//            opening, so a wall carcass over a tall column now builds to 600 mm.
//   Wave C — §2's `MIN_W` became the *default* width floor, and `base-bottle-cargo` declares 200 mm
//            under it with a builder of its own.
//
// The domain half of both waves is tested against a fake probe, which can only report back what it
// was handed. Everything below needs the real builders and the real probe: whether a 600 mm carcass
// measures back to 600 on the tenth swap, whether §11 row 19 still lands the back face on the wall
// plane now that the depth is not clamped, and whether a 200 mm carcass is a cabinet or an
// inside-out one.
import {
  deriveCabinetWorldTransform,
  deriveColumns,
  derivePlacementRecords,
  occupiedDepthM,
  insertBody,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  toMillimetres,
  type Design,
  type DesignWall,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { buildCatalogBody } from "../src/catalog-bodies.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import {
  measureBuiltBody,
  readWallPlaneM,
  WALL_A_MESH_NAME,
  WALL_B_MESH_NAME,
} from "../src/measure-built-body.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

/** §11 row 19's own epsilon ("0.000", asserted at 1e-6 m). */
const FLOAT_EPSILON_METRES = 1e-6;

const OCCURRED_AT = "2026-08-26T12:00:00.000Z";

let kit: Kit;
let room: THREE.Object3D;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
  room = kit.builders["kitchen-l"]();
});

function probe() {
  return {
    measure: (request: {
      readonly buildId: string;
      readonly widthM: number;
      readonly heightM: number;
      readonly depthM: number;
    }) => measureBuiltBody({ kit, room, request }),
  };
}

/** **The depth of the space the body fills, not its recorded seat.** The round trip below asks
 *  whether a body's depth survives ten swaps, and since wave 5F `frame.d` is no longer that number:
 *  a fronted wall carcass records 39 mm less than it occupies (ADR 0036 decision 1) while an open
 *  shelf, having no door and no handle, still records exactly what it occupies. Reading the seat
 *  raw would make the rotation below alternate between two correct numbers and read as drift.
 *  `occupiedDepthM` is the production conversion, read here rather than restated. */
function depthOfMm(design: Design, placementId: string): number {
  const record = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG).find(
    (candidate) => candidate.id === placementId,
  );
  if (!record) throw new Error(`No record ${placementId}`);
  return toMillimetres(occupiedDepthM(record));
}

/** One swap against a **fresh load-time column map**, re-derived from the seeded design on every
 *  call rather than carried forward from the design the previous swap produced.
 *
 *  Not what the store does — since wave A it runs `withCurrentFullHeightMembers` over the columns
 *  after every command, so its `hasFullHeightUnder` tracks the mutated design. Fixing the map here
 *  is deliberate: these tests repeat a swap to check the geometry round-trips, and swapping a wall
 *  body never changes what stands under it, so a constant map keeps the depth input constant and
 *  any drift in the measured result attributable to the builders.
 *
 *  ADR 0032: a wall entry whose `sizesMm` is a bound of its own (`wall-2door`, `wall-1door`) is
 *  refused at an opening whose width its set does not list, so a rotation across the four
 *  depth-consuming wall builders cannot assume every one of them fits every placement. `undefined`
 *  means "not a width this entry has, try the next builder"; **every other refusal still throws**,
 *  so a rotation cannot go quietly vacuous. */
function swapIfWidthAllows(
  design: Design,
  placementId: string,
  buildId: string,
): { readonly design: Design; readonly placementId: string } | undefined {
  const result = insertBody({
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    columns: deriveColumns(
      derivePlacementRecords(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG),
      {},
      KITCHEN_L_DESIGN.room,
    ),
    target: { kind: "placement", id: placementId },
    buildId,
    probe: probe(),
    occurredAt: OCCURRED_AT,
  });
  if (result.ok) {
    return { design: result.design, placementId: result.effect.placementId };
  }
  if (result.reason.code === "WIDTH_NOT_SUPPORTED") return undefined;
  throw new Error(`Swap of ${placementId} → ${buildId}: ${result.reason.code}`);
}

// ---------------------------------------------------------------------------------------------
// Wave A, R-1: a deep carcass has to survive more than the one repeat the implementer tested.
// ---------------------------------------------------------------------------------------------

/** The four wall entries that actually consume the depth they are handed, cycled so the round trip
 *  is exercised across builders rather than through one of them ten times. `wall-lift` and
 *  `open-shelf` are in here precisely because the shipped repeat test used only the two door
 *  cabinets. */
const DEPTH_CONSUMING_WALL_IDS = [
  "wall-cabinet",
  "open-shelf",
  "wall-cabinet",
  "wall-lift",
] as const;

describe("a deep wall carcass survives repeated swaps (ADR 0018 round trip)", () => {
  it.each([
    { id: "p22", underneath: "a tall oven tower", depthMm: 600 },
    { id: "p23", underneath: "a tall pantry", depthMm: 600 },
    { id: "p24", underneath: "the fridge", depthMm: 600 },
    // M5 wave 5A: the cap over a worktop is the worktop → wall depth map's row, 330 at the shipped
    // 600 mm worktop, where it was an independent 400.
    { id: "p13", underneath: "the hob's worktop", depthMm: 330 },
    { id: "p11", underneath: "a sink base", depthMm: 330 },
  ])(
    "$id over $underneath stays at $depthMm mm through ten swaps",
    ({ id, depthMm }) => {
      let design: Design = KITCHEN_L_DESIGN;
      let target = id;
      const observed: number[] = [];

      // The rotation skips a builder whose own set has no width for this opening — `p24` is 700 mm
      // and the two door cabinets are bounded — and keeps turning until ten swaps have actually
      // happened. It is the rounds that matter, not the attempts.
      for (
        let attempt = 0;
        attempt < 4 * 10 && observed.length < 10;
        attempt += 1
      ) {
        const buildId =
          DEPTH_CONSUMING_WALL_IDS[attempt % DEPTH_CONSUMING_WALL_IDS.length];
        if (buildId === undefined) throw new Error("empty rotation");
        const next = swapIfWidthAllows(design, target, buildId);
        if (!next) continue;
        design = next.design;
        target = next.placementId;
        observed.push(depthOfMm(design, target));
      }

      // The sweep is worthless if it swept nothing.
      expect(observed).toHaveLength(10);
      expect(observed).toEqual(Array.from({ length: 10 }, () => depthMm));
    },
  );
});

// ---------------------------------------------------------------------------------------------
// Wave A, R-2: §11 row 19 across the whole depth range a wall carcass can now be built at.
// The shipped row-19 test seats three bodies at three fixed depths. A 600 mm wall carcass is a
// depth no assertion in this repository had ever seated.
// ---------------------------------------------------------------------------------------------

/** The persisted seat, rounded exactly the way `insertBody` rounds it — `toMillimetres(2 × seat)`
 *  is an integer in the document, and rebuilding reads that integer back. Seating from the raw
 *  float (which the shipped row-19 helper does) hides any millimetre rounding error. */
function seatedBackFace(
  buildId: string,
  widthM: number,
  heightM: number,
  depthM: number,
  wall: DesignWall,
): { readonly backM: number; readonly planeM: number } {
  const request = { buildId, widthM, heightM, depthM };
  const measurement = measureBuiltBody({ kit, room, request });
  const persistedMm = toMillimetres(2 * measurement.seatOffsetM);
  const transform = deriveCabinetWorldTransform({
    wall,
    alongM: 1.2,
    y0M: 1.5,
    depthM: persistedMm / 1000,
  });

  const body = buildCatalogBody(kit, buildId, request);
  body.position.set(
    transform.position.x,
    transform.position.y,
    transform.position.z,
  );
  body.rotation.y = transform.yawRadians;
  room.add(body);
  try {
    body.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(body);
    return {
      backM: wall === "A" ? box.min.z : box.min.x,
      planeM: readWallPlaneM(
        room,
        wall === "A" ? WALL_A_MESH_NAME : WALL_B_MESH_NAME,
      ),
    };
  } finally {
    room.remove(body);
  }
}

describe("§11 row 19 across the depths a wall carcass can now be built at", () => {
  it.each(DEPTH_CONSUMING_WALL_IDS)(
    "%s lands its back face on the wall plane at every depth from 200 to 700 mm",
    (buildId) => {
      const checked: number[] = [];
      for (let depthMm = 200; depthMm <= 700; depthMm += 10) {
        for (const wall of ["A", "B"] as const) {
          const { backM, planeM } = seatedBackFace(
            buildId,
            0.6,
            0.7,
            depthMm / 1000,
            wall,
          );
          expect(
            Math.abs(backM - planeM),
            `${buildId} @ ${String(depthMm)} mm on wall ${wall}`,
          ).toBeLessThanOrEqual(FLOAT_EPSILON_METRES);
        }
        checked.push(depthMm);
      }
      // Guards the sweep against going vacuous, and against the loop bounds being edited to
      // straddle nothing: 600 mm — the depth this wave unlocked — must be one of them.
      expect(checked.length).toBe(51);
      expect(checked).toContain(600);
    },
  );
});

/** What each builder stands in front of the shell it is handed (ADR 0036 decision 1): an 18 mm door
 *  slab plus the 21 mm its bar handle reaches past that. An open shelf has neither. */
const FRONT_ASSEMBLY_MM: Readonly<Record<string, number>> = {
  "wall-cabinet": 39,
  "wall-lift": 39,
  "open-shelf": 0,
};

describe("the persisted seat is the depth the builder was handed, less its own front", () => {
  // The shipped assertion pins this at 0.33 m only. If a carcass were ever off-centre in z the
  // error would be proportional to the depth, so 0.33 is the one depth least likely to show it.
  //
  // **The relation the sweep checks changed in wave 5F, and the sweep is what proves it is a
  // constant offset rather than a proportion.** ADR 0036 decision 1 makes the depth handed in the
  // *finished* cabinet, so the seat is that less the front assembly — 39 mm at 200 and 39 mm at 700,
  // never 39 mm at one depth and 60 at another. A proportional error is exactly what an off-centre
  // carcass would produce, which is why the offset is subtracted per depth rather than the sweep
  // being pinned at one.
  it.each(DEPTH_CONSUMING_WALL_IDS)("%s, 200–700 mm", (buildId) => {
    const frontMm = FRONT_ASSEMBLY_MM[buildId] ?? -1;
    expect(frontMm).toBeGreaterThanOrEqual(0);

    const drifted: string[] = [];
    let checked = 0;
    for (let depthMm = 200; depthMm <= 700; depthMm += 5) {
      const measured = measureBuiltBody({
        kit,
        room,
        request: { buildId, widthM: 0.6, heightM: 0.7, depthM: depthMm / 1000 },
      });
      if (toMillimetres(2 * measured.seatOffsetM) !== depthMm - frontMm) {
        drifted.push(
          `${String(depthMm)} → ${String(toMillimetres(2 * measured.seatOffsetM))}`,
        );
      }
      checked += 1;
    }
    expect(checked).toBe(101);
    expect(drifted).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Wave C: the new builder, swept across its declared range the way ADR 0017 records `base-sink`
// inverting below 560 mm.
// ---------------------------------------------------------------------------------------------

const CARGO_BUILD_ID = "base-bottle-cargo";

interface PartExtent {
  readonly name: string;
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
}

function partExtents(group: THREE.Object3D): PartExtent[] {
  const parts: PartExtent[] = [];
  group.updateWorldMatrix(true, true);
  group.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const box = new THREE.Box3().setFromObject(node);
    parts.push({
      name: node.name,
      sizeX: box.max.x - box.min.x,
      sizeY: box.max.y - box.min.y,
      sizeZ: box.max.z - box.min.z,
    });
  });
  return parts;
}

describe("the bottle cargo builder over its declared width range", () => {
  it("produces a non-degenerate carcass at every width from 200 to 300 mm", () => {
    const failures: string[] = [];
    let checked = 0;

    for (let widthMm = 200; widthMm <= 300; widthMm += 1) {
      const widthM = widthMm / 1000;
      const group = buildCatalogBody(kit, CARGO_BUILD_ID, {
        widthM,
        heightM: 0.86,
        depthM: 0.58,
      });
      try {
        for (const part of partExtents(group)) {
          if (
            !Number.isFinite(part.sizeX) ||
            !Number.isFinite(part.sizeY) ||
            !Number.isFinite(part.sizeZ) ||
            part.sizeX <= 0 ||
            part.sizeY <= 0 ||
            part.sizeZ <= 0
          ) {
            failures.push(
              `${String(widthMm)} mm: ${part.name} = ${part.sizeX.toFixed(4)} × ${part.sizeY.toFixed(4)} × ${part.sizeZ.toFixed(4)}`,
            );
          }
        }
        const measured = measureBuiltBody({
          kit,
          room,
          request: {
            buildId: CARGO_BUILD_ID,
            widthM,
            heightM: 0.86,
            depthM: 0.58,
          },
        });
        if (toMillimetres(measured.carcassWidthM) !== widthMm) {
          failures.push(
            `${String(widthMm)} mm: carcass measured ${String(toMillimetres(measured.carcassWidthM))}`,
          );
        }
        if (toMillimetres(measured.carcassHeightM) !== 860) {
          failures.push(
            `${String(widthMm)} mm: carcass height ${String(toMillimetres(measured.carcassHeightM))}`,
          );
        }
      } finally {
        checked += 1;
      }
    }

    expect(checked).toBe(101);
    expect(failures).toEqual([]);
  });

  // ADR 0018: a base builder must ignore the depth it is handed, or a swap into a 580 mm opening
  // and a swap into a 600 mm one would seat the same cabinet at two different distances from the
  // wall. Every other base entry is pinned this way; the new one was not.
  it("ignores the depth it is handed, like every other base body", () => {
    const seats = [0.4, 0.5, 0.58, 0.6, 0.7].map((depthM) =>
      toMillimetres(
        2 *
          measureBuiltBody({
            kit,
            room,
            request: {
              buildId: CARGO_BUILD_ID,
              widthM: 0.2,
              heightM: 0.86,
              depthM,
            },
          }).seatOffsetM,
      ),
    );

    expect(seats).toHaveLength(5);
    expect(new Set(seats).size).toBe(1);
  });

  it("seats its back face on the wall plane on both walls (§11 row 19)", () => {
    for (const wall of ["A", "B"] as const) {
      for (const widthMm of [200, 250, 300]) {
        const { backM, planeM } = seatedBackFace(
          CARGO_BUILD_ID,
          widthMm / 1000,
          0.86,
          0.58,
          wall,
        );
        expect(
          Math.abs(backM - planeM),
          `${String(widthMm)} mm on wall ${wall}`,
        ).toBeLessThanOrEqual(FLOAT_EPSILON_METRES);
      }
    }
  });
});
