// The production defect, on real geometry: replacing a wall cabinet with another catalogue wall
// cabinet changed its depth, and the replacement stopped lining up with its neighbours.
//
// The domain half is `insert-depth.test.ts` in `@lemnaria/configurator-domain`, where a fake probe
// reports back exactly the depth it was handed. That is the rule; this is the outcome. Only the
// real builders apply §7's `min(d, 0.4)` clamp, so only a run against real meshes can say what a
// customer's replacement is actually built to — which is the number the owner photographed.
import {
  deriveColumns,
  derivePlacementRecords,
  insertBody,
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

/** §7's wall-carcass clamp, restated here as the *expectation* rather than imported from the
 *  builder — a test that reads the number it is checking out of the code under test proves
 *  nothing. */
const WALL_CARCASS_MAX_DEPTH_MM = 400;

const OCCURRED_AT = "2026-08-26T12:00:00.000Z";
const SWAP_BUILD_ID = "wall-2door";

let kit: Kit;
let room: THREE.Object3D;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
  room = kit.builders["kitchen-l"]();
});

function seededRecords(): PlacementRecord[] {
  return derivePlacementRecords(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);
}

function swapDepthMm(placementId: string): number {
  const records = seededRecords();
  const result = insertBody({
    design: KITCHEN_L_DESIGN,
    catalog: KITCHEN_L_BODY_CATALOG,
    columns: deriveColumns(records),
    target: { kind: "placement", id: placementId },
    buildId: SWAP_BUILD_ID,
    probe: createBodyProbe(kit, room),
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) {
    throw new Error(`Swap of ${placementId} refused: ${result.reason.code}`);
  }
  return depthOfMm(result.design, result.effect.placementId);
}

function depthOfMm(design: Design, placementId: string): number {
  const record = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG).find(
    (candidate) => candidate.id === placementId,
  );
  if (!record) throw new Error(`No record ${placementId}`);
  return toMillimetres(record.frame.d);
}

describe("replacing a seeded wall body builds it to the opening's own depth", () => {
  it.each(
    seededRecords()
      .filter(
        (record) =>
          (record.band === "wall" || record.band === "top") &&
          record.canReplace,
      )
      .map((record) => ({
        id: record.id,
        buildId: record.buildId,
        outgoingMm: toMillimetres(record.frame.d),
      })),
  )(
    "$id ($buildId, $outgoingMm mm) is replaced at its own depth, clamped by §7",
    ({ id, outgoingMm }) => {
      // Before the fix the depth came from `Column.d` — the MAX over the whole vertical run — so
      // every one of these built to 400 mm whatever the body it replaced measured.
      expect(swapDepthMm(id)).toBe(
        Math.min(outgoingMm, WALL_CARCASS_MAX_DEPTH_MM),
      );
    },
  );

  // The residual, stated rather than left to be rediscovered: §7 fixes every catalogue wall entry
  // at `min(d, 0.4)`, so the four seeded bodies deeper than that cannot be replaced at their own
  // depth by anything the catalogue offers. Three are the 600 mm-deep top-row cabinets wall B
  // carries over its tall columns; the fourth is the hood, whose 500 mm is a seat rather than a
  // physical depth (see `KITCHEN_L_BODY_CATALOG`'s note). Closing it needs a catalogue entry that
  // declares a deeper wall carcass, which is a product decision, not a fix.
  it.each(["p13", "p22", "p23", "p24"])(
    "%s is deeper than any catalogue wall entry can be built, and clamps to 400 mm",
    (id) => {
      expect(swapDepthMm(id)).toBe(WALL_CARCASS_MAX_DEPTH_MM);
    },
  );
});
