// ADR 0031's resize, measured through the **real** builders and the **real** `BodyProbe`.
//
// It has to be here rather than in the domain. Backlog entry 9 records that a fake probe reports
// back the depth it was handed, so a wrong depth reads correct throughout — a domain test can prove
// which number the engine *asked* for and nothing about what a customer's resized cabinet is
// actually built to. That second number is the one M5's acceptance criterion is about: "a resize
// does not change either body's recorded depth", now read for **every member of the column**.
//
// Wave 5A moved the shipped wall depth from 400 to 330, so every assertion here is against 330.
//
// **Every case needs a delete in front of it** (ADR 0031): the shipped kitchen derives no voids at
// load, and a resize is funded by an adjacent empty column or refused.
import {
  canonicalSerializeDesign,
  deriveColumns,
  derivePlacementRecords,
  DesignSchema,
  removePlacement,
  setWidth,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  toMillimetres,
  type Design,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { createBodyProbe } from "../src/measure-built-body.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

/** §7's head-clearance cap on a wall carcass over a worktop, restated as the *expectation* rather
 *  than imported from the code under test. Wave 5A's map row for the shipped 600 mm worktop. */
const WALL_DEPTH_OVER_WORKTOP_MM = 330;

/** Where the cap is lifted, because a full-height member stands under the opening (backlog 5). */
const DEEP_OVER_COLUMN_MM = 600;

const BASE_DEPTH_MM = 580;

const OCCURRED_AT = "2026-08-27T12:00:00.000Z";

let kit: Kit;
let room: THREE.Object3D;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
  room = kit.builders["kitchen-l"]();
});

function recordsOf(design: Design): PlacementRecord[] {
  return derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG);
}

/** The store's contract in one line: the columns stay frozen across a delete (ADR 0011 Gap D), so
 *  they are derived once from the *whole* design and carried forward. Deriving them again from what
 *  is left would shrink the cleared run and there would be no empty column to resize into at all. */
interface World {
  readonly design: Design;
  readonly columns: ReturnType<typeof deriveColumns>;
}

function load(design: Design): World {
  return { design, columns: deriveColumns(recordsOf(design)) };
}

function clear(world: World, placementIds: readonly string[]): World {
  return placementIds.reduce((current, id) => {
    const result = removePlacement({
      design: current.design,
      catalog: KITCHEN_L_BODY_CATALOG,
      target: { kind: "placement", id },
      occurredAt: OCCURRED_AT,
    });
    if (!result.ok) {
      throw new Error(`Fixture could not remove ${id}: ${result.reason.code}`);
    }
    return { ...current, design: result.design };
  }, world);
}

function resize(world: World, placementId: string, widthMm: number) {
  return setWidth({
    design: world.design,
    catalog: KITCHEN_L_BODY_CATALOG,
    columns: world.columns,
    target: { kind: "placement", id: placementId },
    widthMm,
    probe: createBodyProbe(kit, room),
    occurredAt: OCCURRED_AT,
  });
}

function recordFor(design: Design, placementId: string): PlacementRecord {
  const record = recordsOf(design).find(
    (candidate) => candidate.id === placementId,
  );
  if (!record) throw new Error(`No record for ${placementId}`);
  return record;
}

function depthMm(design: Design, placementId: string): number {
  return toMillimetres(recordFor(design, placementId).frame.d);
}

/** The shipped kitchen with `A|2.00` emptied — `p1`, `p12`, `p18` — which is what lets the column
 *  at `A|1.30` shrink 800 → 600. It is the one shape in the seeded design that exercises all three
 *  depths at once: a base cabinet at 580 with a wall and a top cabinet at 330 above it. */
function kitchenWithEmptyColumn(): World {
  return clear(load(KITCHEN_L_DESIGN), ["p1", "p12", "p18"]);
}

/** A full-height unit spanning two top-row columns, so the head-clearance cap is lifted over both
 *  by **overlap** rather than by membership — which is what `isFullHeightUnder` actually asks. The
 *  shipped kitchen's own deep pair cannot be used: ADR 0031 moves a whole column, and both of those
 *  columns hold a `fixedWidth` full-height unit that can never move. */
function deepOverColumnDesign(): Design {
  return {
    room: { shape: "L", widthMm: 3600, depthMm: 2400, heightMm: 2600 },
    presetId: null,
    placements: [
      {
        id: "tower",
        wall: "A",
        alongMm: 1200,
        y0Mm: 0,
        body: {
          buildId: "tall-oven-tower-600",
          widthMm: 1200,
          heightMm: 2200,
        },
      },
      ...[900, 1500].map((alongMm) => ({
        id: `deep${String(alongMm)}`,
        wall: "A" as const,
        alongMm,
        y0Mm: 2200,
        body: {
          buildId: "wall-2door-600-deep-top",
          widthMm: 600,
          heightMm: 400,
        },
      })),
    ],
    createdAt: "2026-08-25T00:00:00.000Z",
    updatedAt: "2026-08-25T00:00:00.000Z",
  };
}

/** A base run with a wall cabinet over each member, so the column reaches the wall line and §7's
 *  860 mm base carcass has room. */
function baseRunDesign(): Design {
  return {
    room: { shape: "L", widthMm: 3600, depthMm: 2400, heightMm: 2600 },
    presetId: null,
    placements: [1300, 1900].flatMap((alongMm) => [
      {
        id: `b${String(alongMm)}`,
        wall: "A" as const,
        alongMm,
        y0Mm: 0,
        body: {
          buildId: "base-drawer2-600",
          widthMm: 600,
          heightMm: 820,
        },
      },
      {
        id: `w${String(alongMm)}`,
        wall: "A" as const,
        alongMm,
        y0Mm: 1500,
        body: { buildId: "open-shelf-600", widthMm: 600, heightMm: 700 },
      },
    ]),
    createdAt: "2026-08-25T00:00:00.000Z",
    updatedAt: "2026-08-25T00:00:00.000Z",
  };
}

describe("a resize does not change any member's recorded depth", () => {
  it("keeps a base / wall / top column at 580, 330 and 330", () => {
    const world = kitchenWithEmptyColumn();

    const result = resize(world, "p0", 600);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const [id, expected] of [
      ["p0", BASE_DEPTH_MM],
      ["p11", WALL_DEPTH_OVER_WORKTOP_MM],
      ["p17", WALL_DEPTH_OVER_WORKTOP_MM],
    ] as const) {
      expect(depthMm(world.design, id)).toBe(expected);
      expect(depthMm(result.design, id)).toBe(expected);
    }
  });

  it("keeps a deep cabinet over a full-height unit at 600 mm", () => {
    // The head-clearance cap is lifted over a column and the resize path must not reintroduce it.
    // Until backlog entry 5 was closed these receded 200 mm on every rebuild.
    const world = clear(load(deepOverColumnDesign()), ["deep1500"]);

    const result = resize(world, "deep900", 800);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(depthMm(world.design, "deep900")).toBe(DEEP_OVER_COLUMN_MM);
    expect(depthMm(result.design, "deep900")).toBe(DEEP_OVER_COLUMN_MM);
  });

  it("keeps a base run at 580 mm", () => {
    const world = clear(load(baseRunDesign()), ["b1900", "w1900"]);

    const result = resize(world, "b1300", 800);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(depthMm(result.design, "b1300")).toBe(BASE_DEPTH_MM);
    expect(depthMm(result.design, "w1300")).toBe(WALL_DEPTH_OVER_WORKTOP_MM);
  });

  it("holds for every resize the shipped kitchen accepts after one column is cleared", () => {
    const accepted: string[] = [];
    for (const cleared of CLEARABLE_COLUMNS) {
      const world = clear(load(KITCHEN_L_DESIGN), cleared.ids);
      for (const placement of world.design.placements) {
        for (const widthMm of [200, 300, 400, 450, 600, 700, 800, 900]) {
          const result = resize(world, placement.id, widthMm);
          if (!result.ok) continue;
          accepted.push(`${cleared.key}:${placement.id}@${String(widthMm)}`);
          for (const id of result.effect.columnPlacementIds) {
            expect(depthMm(result.design, id)).toBe(depthMm(world.design, id));
          }
        }
      }
    }
    // **Counted here, and named in `qa-w5c.adversarial.test.ts`.** The list was spelled out in this
    // file so the sweep could not pass by accepting nothing: fifteen taps until ADR 0033 merged the
    // door-count entries, thirty-three after it, forty-four once ADR 0035 replaced each entry's list
    // with a bound stepped at 50 mm, fifty-nine once the owner retired ADR 0030's one-door cap.
    //
    // ADR 0035 decision 7 takes it to 230 by making every shrink fund itself out of the space it
    // vacates, so the population stops being "what a delete unlocks" and becomes "every legal move,
    // plus what a delete unlocks". 230 lines of fixture would bury the one assertion this file
    // exists for. The itemisation lives in the domain's adversarial census — 26 taps at load, 24
    // gained per clear, 2 lost to `RESIZE_OPENS_GAP` — over this exact width list.
    //
    // What this file asserts is unchanged and now holds over fifteen times the population it started
    // with: a resize never changes any member's recorded depth.
    expect(accepted).toHaveLength(230);
  });
});

/** Every column of the shipped kitchen whose members are all deletable. The three that are missing
 *  hold a structural corner, which §13.1 makes non-deletable. */
const CLEARABLE_COLUMNS: readonly {
  readonly key: string;
  readonly ids: readonly string[];
}[] = [
  { key: "A|0.30", ids: ["p8", "p15"] },
  { key: "A|0.75", ids: ["p10", "p16"] },
  { key: "A|1.30", ids: ["p0", "p11", "p17"] },
  { key: "A|2.00", ids: ["p1", "p12", "p18"] },
  { key: "A|2.60", ids: ["p2", "p13", "p19"] },
  { key: "A|3.20", ids: ["p4", "p14", "p20"] },
  { key: "B|1.20", ids: ["p5", "p22"] },
  { key: "B|1.80", ids: ["p6", "p23"] },
  { key: "B|2.45", ids: ["p7", "p24"] },
];

describe("the rebuilt carcass really is the width that was asked for", () => {
  it("builds every member of the column at the new width", () => {
    const world = kitchenWithEmptyColumn();
    const result = resize(world, "p0", 600);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const probe = createBodyProbe(kit, room);
    for (const id of ["p0", "p11", "p17"]) {
      const record = recordFor(result.design, id);
      const measurement = probe.measure({
        buildId: record.buildId,
        widthM: 0.6,
        heightM: record.frame.h,
        depthM: record.frame.d,
      });
      expect(toMillimetres(measurement.carcassWidthM)).toBe(600);
      expect(toMillimetres(2 * measurement.seatOffsetM)).toBe(
        toMillimetres(record.frame.d),
      );
    }
  });
});

describe("a persisted design never holds a seeded buildId at a width that id cannot build", () => {
  it("migrates every member of the column to its declared catalogue equivalent", () => {
    const result = resize(kitchenWithEmptyColumn(), "p0", 600);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const [id, seededId, equivalentId] of [
      ["p0", "base-sink-800", "base-sink"],
      ["p11", "wall-2door-800", "wall-cabinet"],
      ["p17", "wall-2door-800-top", "wall-cabinet"],
    ] as const) {
      const placement = result.design.placements.find(
        (entry) => entry.id === id,
      );
      expect(placement?.body.buildId).toBe(equivalentId);
      expect(placement?.body.buildId).not.toBe(seededId);
    }
  });

  it("reloads without throwing and reproduces the post-resize geometry", () => {
    const world = kitchenWithEmptyColumn();
    const result = resize(world, "p0", 600);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The whole round trip a saved design takes: canonical JSON out, schema parse back in, records
    // derived from what came back. `UnknownBodyError` is what a stale seeded id would produce.
    const reloaded: Design = DesignSchema.parse(
      JSON.parse(canonicalSerializeDesign(result.design)),
    );
    expect(() => recordsOf(reloaded)).not.toThrow();

    for (const id of ["p0", "p11", "p17"]) {
      const after = recordFor(result.design, id);
      const back = recordFor(reloaded, id);
      expect(back.frame).toEqual(after.frame);
      expect(back.widthMm).toBe(after.widthMm);
      expect(back.buildId).toBe(after.buildId);
      // And it is not the pre-resize geometry.
      expect(back.frame.w).not.toBe(recordFor(world.design, id).frame.w);
    }
  });
});
