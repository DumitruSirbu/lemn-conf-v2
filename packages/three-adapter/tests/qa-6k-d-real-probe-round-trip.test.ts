// **Wave 6K-d, step 0: the premise, measured before anything is edited** (ADR 0075 decision 3).
//
// Adversarial QA on 6K-a found that a 600 -> 700 -> 600 round trip returns two wall columns 39 mm
// deeper than they started, and held it with an `it.fails` in
// `apps/web/tests/store/qa-6k-a-cabinet-depth.adversarial.test.ts`. That suite runs against
// `createFakeBodyProbe`, whose `seatOffsetM: request.depthM / 2` **answers the depth it was asked
// for** — where the real `wallCabinet` builds `D - 39` centred on z = 0 and measures 39 mm less.
//
// ADR 0075 decision 2 says the 39 mm is therefore the fake's, not the declaration's. This file is
// what makes that a measurement rather than a reading of the code, and it is deliberately the
// wave's **first** act: a declaration edited to satisfy a test-double assertion would move
// production geometry to match the double.
//
// **Structural bodies are excluded because `createBodyProbe` has no builder for them** — it throws
// `No catalog builder registered` — and a test that passes because the body threw measures nothing.
// They travel `reseat` rather than `rebuild` and are not what the round trip is about.
import { createBodyProbeLease } from "@lemnaria/configurator-domain";
import {
  buildKitchenLBodyCatalog,
  deriveColumns,
  derivePlacementRecords,
  KITCHEN_L_DESIGN,
  setCabinetDepth,
  wallCarcassDepthMm,
  type Column,
  type Design,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { makeKit } from "../src/kitchen-parts.js";
import { createBodyProbe } from "../src/measure-built-body.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

const OCCURRED_AT = "2026-09-04T10:00:00.000Z";
const DEFAULT_MM = 600;
const DEEPER_MM = 700;

/** The bodies `reseat` handles rather than `rebuild`, and the ones the real probe cannot build. */
const STRUCTURAL_BUILD_IDS = new Set([
  "base-corner-x-900",
  "base-corner-return-320",
  "wall-corner-return-570",
  "wall-corner-return-570-top",
]);

const START: Design = {
  ...KITCHEN_L_DESIGN,
  placements: KITCHEN_L_DESIGN.placements.filter(
    (placement) => !STRUCTURAL_BUILD_IDS.has(placement.body.buildId),
  ),
};

beforeAll(() => {
  installHeadlessDocument();
});

/** A real probe over a real kit and a real room, at one depth. **The kit is built at the depth the
 *  command is moving to**, which is what wave 6K-e makes the application do; here it is what
 *  isolates this wave's question from that one. */
function realProbeAt(cabinetDepthMm: number) {
  const kit = makeKit({
    createCanvas: createHeadlessCanvas,
    cabinetDepthMm,
    wallDepthMm: wallCarcassDepthMm(cabinetDepthMm),
  });
  const room: THREE.Object3D = kit.builders["kitchen-l"]();
  return createBodyProbe(kit, room);
}

function changeTo(design: Design, cabinetDepthMm: number): Design {
  const result = setCabinetDepth({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    cabinetDepthMm,
    probeAt: () =>
      createBodyProbeLease(realProbeAt(cabinetDepthMm), () => undefined),
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
  return result.design;
}

function columnsAt(
  design: Design,
  cabinetDepthMm: number,
): ReadonlyMap<string, Column> {
  const records = derivePlacementRecords(
    design,
    buildKitchenLBodyCatalog(cabinetDepthMm),
  );
  return deriveColumns(records, {}, design.room);
}

function depthOf(columns: ReadonlyMap<string, Column>, key: string): number {
  const column = columns.get(key);
  if (!column) throw new Error(`no column ${key}`);
  return column.d;
}

/** The two wall columns the `it.fails` is about. */
const WALL_KEYS = ["A|0.30", "A|0.75"] as const;

describe("the round trip the store suite measures, run against the real probe", () => {
  // **Not a value compared with itself**: the middle leg really does move, and it moves to the map
  // row rather than to the 369 the fake produces or the 439 that fixing only ADR 0073's constant
  // would produce. ADR 0075 decision 4 requires a wave measuring this number to say which of the
  // three mechanisms it has closed — this is the one that says 400.
  it("reaches the declared map row at the deeper setting, not 369 and not 439", () => {
    const deep = columnsAt(changeTo(START, DEEPER_MM), DEEPER_MM);

    for (const key of WALL_KEYS) {
      expect(Math.round(depthOf(deep, key) * 1000), key).toBe(
        wallCarcassDepthMm(DEEPER_MM),
      );
    }
  });

  // The seat the real probe writes on the way back is the shell, which is what the **seeded** row
  // declares as its `frameDepthMm` and what ADR 0075 decision 1 says the parameterised row should.
  // Corroborating evidence for the declaration fix, gathered before that fix is made.
  it("writes the shell as the seat, which is the seeded row's own declared frame depth", () => {
    const back = changeTo(changeTo(START, DEEPER_MM), DEFAULT_MM);
    const wallSeatMm = back.placements.find(
      (placement) => placement.body.buildId === "wall-cabinet",
    )?.body.seatDepthMm;

    const seededFrameDepthMm =
      buildKitchenLBodyCatalog(DEFAULT_MM).get("wall-2door-600")?.frameDepthMm;
    expect(wallSeatMm).toBe(seededFrameDepthMm);
  });
});
