// **Wave H2 QA (M10): a kitchen generated at 700 mm is buildable by the real probe, in every shape.**
//
// The domain's depth sweeps run on the fake probe, which succeeds by construction. The implementer's adapter file puts
// one L room through the real probe at 700 mm. This file puts the other shapes there too (the straight room, the U, an
// L whose corner turns right) and asks three things of each: the generated design is whole (zero fatal validation
// issues against the 700 mm catalogue), the log replays to the same design under a real probe, and every body the probe
// seated at 700 mm sits where `setCabinetDepth` seats the same build id when it moves the 600 mm kitchen of the same
// room there (the older rule, measured on real geometry).
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  createBodyProbeLease,
  fatalDesignValidationIssues,
  generateKitchen,
  replayGenerationLog,
  setCabinetDepth,
  validateDesignForCatalog,
  type BodyProbeFactory,
  type Design,
  type DesignRoom,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { disposeKit } from "../src/kit-disposal.js";
import { makeKit } from "../src/kitchen-parts.js";
import { createBodyProbe } from "../src/measure-built-body.js";
import { createHeadlessCanvas } from "./support/headless-canvas.js";

const OCCURRED_AT = "2026-10-27T09:30:00.000Z";
const DEEP_MM = 700;
const ROOMS: readonly DesignRoom[] = [
  { shape: "linear", widthMm: 3300, depthMm: 2400, heightMm: 2600 },
  { shape: "linear", widthMm: 1200, depthMm: 2400, heightMm: 2200 },
  { shape: "L", widthMm: 3600, depthMm: 3000, heightMm: 2600 },
  {
    shape: "L",
    widthMm: 3600,
    depthMm: 3000,
    heightMm: 2600,
    cornerDirection: "right",
  },
  { shape: "L", widthMm: 2200, depthMm: 2400, heightMm: 3900 },
  { shape: "U", widthMm: 4200, depthMm: 3600, heightMm: 2600, wallCMm: 3000 },
  { shape: "U", widthMm: 2700, depthMm: 2000, heightMm: 2600, wallCMm: 2000 },
];

function realProbeFactory(): BodyProbeFactory {
  return (cabinetDepthMm) => {
    const probeKit = makeKit({
      createCanvas: createHeadlessCanvas,
      cabinetDepthMm,
    });
    const room = probeKit.builders["kitchen-l"]();
    return createBodyProbeLease(createBodyProbe(probeKit, room), () => {
      disposeKit(probeKit, room);
    });
  };
}

function generatedAt(room: DesignRoom, cabinetDepthMm: number) {
  const result = generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: realProbeFactory(),
    newKitchenSettings: { cabinetDepthMm },
  });
  if (!result.ok) {
    throw new Error(
      `${JSON.stringify(room)} refused at ${String(cabinetDepthMm)}: ${result.reason.code}`,
    );
  }
  return result;
}

function seatsByBuildId(design: Design): Map<string, number[]> {
  const seats = new Map<string, Set<number>>();
  for (const { body } of design.placements) {
    if (body.seatDepthMm === undefined) continue;
    seats.set(
      body.buildId,
      (seats.get(body.buildId) ?? new Set<number>()).add(body.seatDepthMm),
    );
  }
  return new Map(
    [...seats].map(([buildId, depths]) => [buildId, [...depths].sort()]),
  );
}

describe("a kitchen generated at 700 mm under the real probe", () => {
  it.each(ROOMS)(
    "is whole, replays to itself, and seats its bodies where setCabinetDepth does: %o",
    (room) => {
      const deep = generatedAt(room, DEEP_MM);

      expect(cabinetDepthMmOf(deep.design)).toBe(DEEP_MM);
      expect(
        fatalDesignValidationIssues(
          validateDesignForCatalog(
            deep.design,
            buildKitchenLBodyCatalog(DEEP_MM),
          ),
        ),
      ).toEqual([]);
      expect(
        replayGenerationLog({ log: deep.log, probeAt: realProbeFactory() }),
      ).toEqual(deep.design);

      const moved = setCabinetDepth({
        design: generatedAt(room, 600).design,
        catalogAt: buildKitchenLBodyCatalog,
        cabinetDepthMm: DEEP_MM,
        probeAt: realProbeFactory(),
        occurredAt: OCCURRED_AT,
      });
      if (!moved.ok) {
        throw new Error(`setCabinetDepth refused: ${moved.reason.code}`);
      }
      const movedSeats = seatsByBuildId(moved.design);
      let compared = 0;
      for (const [buildId, seats] of seatsByBuildId(deep.design)) {
        const counterpart = movedSeats.get(buildId);
        if (counterpart === undefined) continue;
        expect(seats, buildId).toEqual(counterpart);
        compared += 1;
      }
      expect(compared).toBeGreaterThan(3);
    },
  );
});
