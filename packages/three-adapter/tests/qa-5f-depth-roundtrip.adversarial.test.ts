// Adversarial QA for M5 wave 5F, on ADR 0040's two conversions.
//
// `occupiedDepthM` (domain) and `rebuildDepthM` (adapter) are the same correction applied on two
// call paths, and ADR 0018 clause 4's failure mode is not a wrong number on one pass — it is a
// number that is right on the first pass and moves by one front assembly on every one after it,
// with `refuseBuiltSize` checking width and height only so no gate sees it.
//
// What the wave already covers and this file does not repeat: one rebuild cycle per entry
// (`measure-built-body.test.ts`), and ten swap cycles in the top-row slot
// (`insert-depth.qa.test.ts`). What it leaves open, and this file closes:
//
//   1. **The ten-cycle sweep runs entirely under §7's head-clearance cap.** Every pass there is
//      clamped to 330 before the probe sees it, so the cap — not the conversion — is what holds the
//      number still. A drift that the cap would mask is invisible. `p23` sits over a full-height
//      column where backlog entry 5 lifts the cap, and is where an uncapped depth actually round
//      trips.
//   2. **`wall-cabinet` itself never round trips.** The existing sweep alternates `wall-lift` and
//      `open-shelf`; the entry ADR 0036 was written about is not in it.
//   3. **The front face.** Every existing assertion is about the recorded seat. What ADR 0036
//      decision 1 actually promises a customer is that a cabinet declared 330 *finishes* at 330,
//      which is a statement about the front of the built body and is asserted nowhere.
import {
  canonicalSerializeDesign,
  deriveColumns,
  derivePlacementRecords,
  DesignSchema,
  insertBody,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  occupiedDepthM,
  recomputeVoids,
  toMillimetres,
  withCurrentFullHeightMembers,
  type Column,
  type Design,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { buildCatalogBody } from "../src/catalog-bodies.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { createBodyProbe } from "../src/measure-built-body.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

const OCCURRED_AT = "2026-08-30T12:00:00.000Z";

/** Enough passes that one epsilon per cycle is a millimetre by the end — the drift ADR 0018 clause
 *  4 predicted is linear, so the only way to see it is to run it. */
const CYCLES = 40;

/** `p23`, the deep top cabinet over the tall pantry. Backlog entry 5 lifts §7's head-clearance cap
 *  over a full-height column, so the depth that round trips here is the real 600 and not the 330 the
 *  cap would otherwise hold it at. */
const UNCAPPED_SLOT = "p23";

/** The top-row slot the existing sweep uses, where the cap applies. Kept so both regimes are
 *  covered by the same loop rather than one being assumed to behave like the other. */
const CAPPED_SLOT = "p19";

let kit: Kit;
let room: THREE.Object3D;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
  room = kit.builders["kitchen-l"]();
});

interface World {
  readonly design: Design;
  readonly columns: ReadonlyMap<string, Column>;
}

/** ADR 0011 Gap D: extents freeze at load, `hasFullHeightUnder` is re-answered per derivation. */
function loadWorld(design: Design): World {
  const records = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG);
  const columns = deriveColumns(records);
  // Derived and discarded: `recomputeVoids` is what a load does, and a load that threw would make
  // every assertion below vacuous.
  recomputeVoids(records, columns);
  return { design, columns };
}

function advance(world: World, design: Design): World {
  const records = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG);
  return {
    design,
    columns: withCurrentFullHeightMembers(world.columns, records),
  };
}

/** A save and a reload exactly as the repository does it — canonical JSON out, `DesignSchema` back
 *  in — so nothing about depth survives only in memory. */
function saveAndReload(design: Design): Design {
  return DesignSchema.parse(JSON.parse(canonicalSerializeDesign(design)));
}

function swap(world: World, placementId: string, buildId: string) {
  const result = insertBody({
    design: world.design,
    catalog: KITCHEN_L_BODY_CATALOG,
    columns: world.columns,
    target: { kind: "placement", id: placementId },
    buildId,
    probe: createBodyProbe(kit, room),
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) {
    throw new Error(`Swap to ${buildId} refused: ${result.reason.code}`);
  }
  return result;
}

interface Reading {
  readonly seatMm: number;
  readonly occupiedMm: number;
}

function read(design: Design, placementId: string): Reading {
  const record = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG).find(
    (candidate) => candidate.id === placementId,
  );
  if (!record) throw new Error(`No record ${placementId}`);
  return {
    seatMm: toMillimetres(record.frame.d),
    occupiedMm: toMillimetres(occupiedDepthM(record)),
  };
}

/** One save/reload/rebuild cycle repeated, holding one body in one slot. The body never changes, so
 *  every reading after the first must be the first — anything else is drift. */
function cycleInPlace(slotId: string, buildId: string): Reading[] {
  let world = loadWorld(KITCHEN_L_DESIGN);
  let placementId = slotId;
  const readings: Reading[] = [];

  for (let pass = 0; pass < CYCLES; pass += 1) {
    const result = swap(world, placementId, buildId);
    placementId = result.effect.placementId;
    const design = saveAndReload(result.design);
    readings.push(read(design, placementId));
    world = advance(loadWorld(design), design);
  }
  return readings;
}

describe("ADR 0040 converges, over more cycles than one and off the cap", () => {
  it.each([
    {
      slot: UNCAPPED_SLOT,
      buildId: "wall-cabinet",
      seatMm: 561,
      where: "uncapped",
    },
    {
      slot: UNCAPPED_SLOT,
      buildId: "wall-lift",
      seatMm: 561,
      where: "uncapped",
    },
    {
      slot: UNCAPPED_SLOT,
      buildId: "open-shelf",
      seatMm: 600,
      where: "uncapped",
    },
    {
      slot: CAPPED_SLOT,
      buildId: "wall-cabinet",
      seatMm: 291,
      where: "capped",
    },
    { slot: CAPPED_SLOT, buildId: "wall-lift", seatMm: 291, where: "capped" },
    { slot: CAPPED_SLOT, buildId: "open-shelf", seatMm: 330, where: "capped" },
  ])(
    "$buildId records $seatMm mm on every one of 40 $where cycles",
    ({ slot, buildId, seatMm }) => {
      const readings = cycleInPlace(slot, buildId);

      expect(readings.map((reading) => reading.seatMm)).toEqual(
        Array.from({ length: CYCLES }, () => seatMm),
      );
    },
  );

  // The seat is the encoding; this is the number the rest of the model reads. A fronted wall body
  // and an open shelf whose fronts land on the same line record different seats and must report the
  // same occupied depth — that is the whole of what `occupiedDepthM` is for.
  it.each([
    { slot: UNCAPPED_SLOT, occupiedMm: 600 },
    { slot: CAPPED_SLOT, occupiedMm: 330 },
  ])(
    "reports $occupiedMm mm of occupied depth for every wall entry in the same slot",
    ({ slot, occupiedMm }) => {
      const perEntry = ["wall-cabinet", "wall-lift", "open-shelf"].map(
        (buildId) => [buildId, cycleInPlace(slot, buildId).at(-1)?.occupiedMm],
      );

      expect(Object.fromEntries(perEntry)).toEqual({
        "wall-cabinet": occupiedMm,
        "wall-lift": occupiedMm,
        "open-shelf": occupiedMm,
      });
    },
  );
});

describe("ADR 0036 decision 1: a declared dimension is the finished cabinet", () => {
  /** The built body's own extent along the depth axis, in millimetres, measured off the meshes
   *  rather than off anything the domain recorded. */
  function builtSpanMm(buildId: string, depthM: number) {
    const group = buildCatalogBody(kit, buildId, {
      widthM: 0.6,
      heightM: 0.7,
      depthM,
    });
    group.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(group);
    return {
      backMm: Math.round(box.min.z * 1000),
      frontMm: Math.round(box.max.z * 1000),
      spanMm: Math.round((box.max.z - box.min.z) * 1000),
    };
  }

  // A hinged wall cabinet and a lift-up both carry a slab and a bar; an open shelf carries neither
  // and is therefore its declared depth all by itself. All three are asked for 330 and all three
  // must finish at 330 — which is the customer-visible claim, and is not the same claim as the
  // recorded seat.
  it.each(["wall-cabinet", "wall-lift", "open-shelf"])(
    "%s finishes at exactly the 330 mm it was declared at",
    (buildId) => {
      expect(builtSpanMm(buildId, 0.33).spanMm).toBe(330);
    },
  );

  // ADR 0039 decisions 1 and 2, measured on the geometry: standard 500 mm body, front face on the
  // 600 mm cabinet line, gap behind. The seat the probe records is asserted elsewhere; this is the
  // body itself, seated, and is where "hung at the front" is either true or it is not.
  it("hangs a standard 500 mm hood on the 600 mm cabinet line", () => {
    const probe = createBodyProbe(kit, room);
    const measured = probe.measure({
      buildId: "hood",
      widthM: 0.6,
      heightM: 0.7,
      depthM: 0.33,
    });
    const built = builtSpanMm("hood", 0.33);
    const seatMm = Math.round(measured.seatOffsetM * 1000);

    expect(built.spanMm).toBe(500);
    // Seated: the group origin sits `seatOffsetM` off the wall plane (§11 row 19's derivation), so
    // the body runs from 100 to 600 and the 100 mm behind it is the chimney's.
    expect(seatMm + built.backMm).toBe(100);
    expect(seatMm + built.frontMm).toBe(600);
  });
});
