// Adversarial QA for waves 6K-d and 6K-e against the **real** probe, on the two things the shipped
// round-trip file leaves out.
//
// `qa-6k-d-real-probe-round-trip.test.ts` runs one 600 → 700 → 600 trip over a design with the four
// structural bodies **filtered out**, and says why: `createBodyProbe` threw for them. Wave 6K-d's
// own `build-any-body.ts` is what fixed that, so the filter is now the thing hiding the fix. Two
// consequences, and both are here:
//
//  - **The whole seeded kitchen goes through**, corner legs and corner returns included — the four
//    ids `reseat` exists for and the exact family the probe used to throw on.
//  - **The trip is run repeatedly and in both directions.** `reseat` compounded a front assembly per
//    change before this milestone — `set-cabinet-depth.ts` records the walk as
//    `291 → 322 → 283 → 244 → 174`, *"in either direction, with no floor and nothing on the way
//    refusing it, because each individual document is valid"*. One trip cannot see a walk; six can.
//
// Nothing here is compared against a written-down millimetre. The oracle is the design's own state
// at the start, and the deeper leg is compared against a design that was **only ever** deep — an
// independent path to the same kitchen.
import {
  buildKitchenLBodyCatalog,
  declaredCabinetDepthsMm,
  deriveColumns,
  derivePlacementRecords,
  KITCHEN_L_DESIGN,
  setCabinetDepth,
  toMetres,
  wallCarcassDepthMm,
  type Column,
  type Design,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { CATALOG_BUILD_IDS } from "../src/catalog-bodies.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { createBodyProbe } from "../src/measure-built-body.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

const OCCURRED_AT = "2026-09-05T10:00:00.000Z";
const DEFAULT_MM = 600;
const DEEPER_MM = 700;

beforeAll(() => {
  installHeadlessDocument();
});

const kits = new Map<number, { kit: Kit; room: THREE.Object3D }>();

function kitAt(cabinetDepthMm: number): { kit: Kit; room: THREE.Object3D } {
  const held = kits.get(cabinetDepthMm);
  if (held) return held;
  const kit = makeKit({
    createCanvas: createHeadlessCanvas,
    cabinetDepthMm,
    wallDepthMm: wallCarcassDepthMm(cabinetDepthMm),
  });
  const built = { kit, room: kit.builders["kitchen-l"]() };
  kits.set(cabinetDepthMm, built);
  return built;
}

/** The real factory's shape: a probe over a kit built at the depth being moved to. `release` frees
 *  nothing here because the kits are shared across this file's many changes — the kit lifetime is
 *  `disposeKit`'s subject and `kit-disposal` owns its own tests. */
function changeTo(design: Design, cabinetDepthMm: number): Design {
  const result = setCabinetDepth({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    cabinetDepthMm,
    probeAt: (askedForMm: number) => {
      // The factory must be asked for the depth the command is moving to, and this is where a
      // regression to the standing kit would show as a build at the wrong depth rather than as a
      // silently equal number.
      expect(askedForMm).toBe(cabinetDepthMm);
      const { kit, room } = kitAt(askedForMm);
      return { probe: createBodyProbe(kit, room), release: () => undefined };
    },
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
  return result.design;
}

function columnsAt(
  design: Design,
  cabinetDepthMm: number,
): ReadonlyMap<string, Column> {
  return deriveColumns(
    derivePlacementRecords(design, buildKitchenLBodyCatalog(cabinetDepthMm)),
    {},
    design.room,
  );
}

function columnDepthsMm(
  design: Design,
  cabinetDepthMm: number,
): ReadonlyMap<string, number> {
  return new Map(
    [...columnsAt(design, cabinetDepthMm)].map(([key, column]) => [
      key,
      Math.round(column.d * 1000),
    ]),
  );
}

function seatsByPlacementId(design: Design): ReadonlyMap<string, number> {
  return new Map(
    design.placements.flatMap((placement) =>
      placement.body.seatDepthMm === undefined
        ? []
        : [[placement.id, placement.body.seatDepthMm] as const],
    ),
  );
}

describe("the whole seeded kitchen, structural bodies included", () => {
  // The premise the shipped round-trip file has to exclude: the four ids `reseat` passes straight
  // through really are in the design, and the probe really does build them now.
  it("carries bodies the probe could not build before this wave", () => {
    const catalog = buildKitchenLBodyCatalog(DEFAULT_MM);
    const structural = [
      ...new Set(KITCHEN_L_DESIGN.placements.map((p) => p.body.buildId)),
    ].filter((buildId) => !CATALOG_BUILD_IDS.includes(buildId));

    expect(structural.length).toBeGreaterThan(0);
    const { kit, room } = kitAt(DEFAULT_MM);
    const probe = createBodyProbe(kit, room);
    for (const buildId of structural) {
      const definition = catalog.get(buildId);
      if (!definition) throw new Error(`no entry for ${buildId}`);
      expect(() =>
        probe.measure({
          buildId,
          widthM: 0.6,
          heightM: 0.72,
          depthM: toMetres(definition.frameDepthMm),
        }),
      ).not.toThrow();
    }
  });

  it("changes depth without throwing on the unfiltered design", () => {
    expect(() => changeTo(KITCHEN_L_DESIGN, DEEPER_MM)).not.toThrow();
  });

  it("returns every column to where it started after one trip", () => {
    const started = columnDepthsMm(KITCHEN_L_DESIGN, DEFAULT_MM);

    const back = changeTo(changeTo(KITCHEN_L_DESIGN, DEEPER_MM), DEFAULT_MM);

    expect(columnDepthsMm(back, DEFAULT_MM)).toEqual(started);
  });

  // **The anti-invariant, stated as the thing that must not happen.** Six changes, alternating, is
  // three full trips — enough that a one-front-assembly walk would be 117 mm off and enough that a
  // half-assembly one would still be visible.
  it("does not drift over three round trips in both directions", () => {
    // The baseline is the design **settled at 600**, not the fixture: `KITCHEN_L_DESIGN` carries no
    // `seatDepthMm` at all, so comparing seats against it would compare a full map with an empty one
    // and say nothing about drift.
    const settled = changeTo(KITCHEN_L_DESIGN, DEFAULT_MM);
    const startedColumns = columnDepthsMm(settled, DEFAULT_MM);
    const startedSeats = seatsByPlacementId(settled);

    let design = settled;
    for (const depthMm of [
      DEEPER_MM,
      DEFAULT_MM,
      DEEPER_MM,
      DEFAULT_MM,
      DEEPER_MM,
      DEFAULT_MM,
    ]) {
      design = changeTo(design, depthMm);
    }

    expect(columnDepthsMm(design, DEFAULT_MM)).toEqual(startedColumns);
    // The seats are the document's own record and the field `rebuild` and `reseat` write, so they
    // are asserted beside the columns: a column is a MAX and could hide a member that moved.
    expect(seatsByPlacementId(design)).toEqual(startedSeats);
  });

  // **The finding, at the real probe.** The deeper leg has its own oracle: a design that reached 700
  // by the shortest path. A trip that arrived there via 600 must be indistinguishable from it, or
  // the intermediate change left a trace.
  //
  // It does. Measured 2026-09-05 with the real adapter probe: `p8`, `p10`, `p15` and `p16` — the
  // four `wall-cabinet` bodies in columns `A|0.30` and `A|0.75` — come back carrying
  // `seatDepthMm: 291`, the **600 mm** shell, in a 700 mm kitchen, where the straight path writes
  // 361. Those two columns then publish 330 against the straight design's 400. `B|0.61` and every
  // base column are unaffected, which is why nothing else sees it.
  //
  // **Not this commit's regression, and its mechanism is nowhere in this diff.** `deriveFrame`'s
  // `seatDepthMm ?? frameDepthMm` and `rebuild`'s build-to-the-opening are untouched by
  // `e664e33..d4e58a4`. What the commit changed is that the fakes stopped hiding it — which is the
  // point of making a fake honest.
  it("reaches the same deep kitchen however many times it has been there", () => {
    const straightThere = changeTo(KITCHEN_L_DESIGN, DEEPER_MM);

    let design = KITCHEN_L_DESIGN;
    for (const depthMm of [
      DEEPER_MM,
      DEFAULT_MM,
      DEEPER_MM,
      DEFAULT_MM,
      DEEPER_MM,
    ]) {
      design = changeTo(design, depthMm);
    }

    expect(design.placements).toEqual(straightThere.placements);
  });

  // **A change to the depth already held writes nothing new.** The idempotence the sheet reaches
  // whenever a customer applies an unchanged setting, and a place a per-change walk would show up
  // without any depth ever differing.
  it.each(declaredCabinetDepthsMm())(
    "is idempotent at %i mm, repeated four times",
    (cabinetDepthMm) => {
      const settled = changeTo(KITCHEN_L_DESIGN, cabinetDepthMm);

      let design = settled;
      for (let again = 0; again < 4; again += 1) {
        design = changeTo(design, cabinetDepthMm);
      }

      expect(design.placements).toEqual(settled.placements);
    },
  );
});
