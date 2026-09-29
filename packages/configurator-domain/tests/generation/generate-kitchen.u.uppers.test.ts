// M7B U3b S2 — the U's uppers and its hood (ADR 0110 *N3 revised* 9-11, N11.9; Amendments C and E7; RQ7,
// RQ14; 7D2 criterion 14). The property over the engine range is in `generate-kitchen.u.property.test.ts`
// through `upperFindings`; this file names the rooms, and holds criterion 6's voids.
import { describe, expect, it } from "vitest";

import { fc } from "@fast-check/vitest";

import { composeU, uPlanOf } from "../support/generated-u.js";
import {
  cornerZonesOf,
  generatedUppersOf,
  upperFindings,
  wallCabinetVerdictsOnWallA,
} from "../support/generated-u-uppers.js";
import { engineUWallBounds } from "../support/room-input.js";
import { SHELL_CATALOG } from "../support/shell-design.js";
import { uRoom } from "../support/u-plan-fixtures.js";

const WALL_ROW_FLOOR_MM = 1500;
const TOP_ROW_FLOOR_MM = 2200;

function upperOver(
  result: ReturnType<typeof composeU>,
  baseId: string,
):
  | {
      readonly buildId: string;
      readonly startMm: number;
      readonly endMm: number;
    }
  | undefined {
  const step = result.log.steps.find((candidate) => candidate.id === baseId);
  const base = result.design.placements.find(
    (placement) =>
      step?.status === "placed" && placement.id === step.placementId,
  );
  if (base === undefined) return undefined;
  const over = generatedUppersOf(result).find(
    (upper) =>
      upper.wall === base.wall &&
      Math.abs(upper.alongMm - base.alongMm) < base.body.widthMm / 2,
  );
  return over === undefined
    ? undefined
    : {
        buildId: over.body.buildId,
        startMm: over.alongMm - over.body.widthMm / 2,
        endMm: over.alongMm + over.body.widthMm / 2,
      };
}

describe("the hood is mandatory over the hob in every U (U3b S2 item 1, RQ7)", () => {
  it.each([
    uRoom(2700, 1600, 1700),
    uRoom(3000, 1000, 1000),
    uRoom(3600, 3500, 4000),
    uRoom(6000, 6000, 6000),
    uRoom(2400, 3000, 3000),
  ])("%j: one hood over the hob, and no finding against the uppers", (room) => {
    const result = composeU(room);

    expect(upperFindings(room, result)).toStrictEqual([]);
    expect(
      generatedUppersOf(result).filter(
        (upper) => upper.body.buildId === "hood",
      ),
    ).toHaveLength(1);
  });
});

describe("a large U's back wall is base-only, the hood aside (U3b S2 item 2, N3r 11)", () => {
  it("6000 / 6000 / 6000: the only generated body on wall A at the wall row or above is the hood", () => {
    const result = composeU(uRoom(6000, 6000, 6000));

    const aboveTheBases = result.design.placements.filter(
      (placement) =>
        placement.wall === "A" &&
        placement.y0Mm >= WALL_ROW_FLOOR_MM &&
        generatedUppersOf(result).includes(placement),
    );

    expect(
      aboveTheBases.map((placement) => placement.body.buildId),
    ).toStrictEqual(["hood"]);
  });

  it("3600 / 3500 / 4000: with the hob round the corner, wall A carries no generated body above its bases and the hood is on the far wall", () => {
    const result = composeU(uRoom(3600, 3500, 4000));

    const hood = generatedUppersOf(result).find(
      (upper) => upper.body.buildId === "hood",
    );

    expect(
      generatedUppersOf(result).filter((upper) => upper.wall === "A"),
    ).toStrictEqual([]);
    expect(hood?.wall).not.toBe("A");
  });

  it("9 900 mm is not large: wall A takes its uppers (3900 / 3000 / 3000)", () => {
    const result = composeU(uRoom(3900, 3000, 3000));

    expect(
      generatedUppersOf(result).filter((upper) => upper.wall === "A").length,
    ).toBeGreaterThan(1);
  });
});

describe("uppers below 10 m stand over the back wall, its fill and the far wall's door bases (U3b S2 item 3, RQ14, N11.9)", () => {
  it("2700 / 1600 / 1700: the 300 mm fill at A 1500-1800 has a 300 mm wall cabinet over it", () => {
    const result = composeU(uRoom(2700, 1600, 1700));

    expect(upperOver(result, "wall-a-remainder:A")).toStrictEqual({
      buildId: "wall-cabinet",
      startMm: 1500,
      endMm: 1800,
    });
  });

  it("3900 / 3000 / 3000: every door base on the far wall has an upper of its own width", () => {
    const room = uRoom(3900, 3000, 3000);
    const result = composeU(room);
    const plan = uPlanOf(result);
    const farDoors = plan.bases.filter(
      (base) => base.wall === "B" && base.buildId === "base-cabinet",
    );

    expect(farDoors.length).toBeGreaterThan(0);
    expect(upperFindings(room, result)).toStrictEqual([]);
    for (const door of farDoors) {
      expect(upperOver(result, door.id)).toStrictEqual({
        buildId: "wall-cabinet",
        startMm: door.startMm,
        endMm: door.endMm,
      });
    }
  });
});

describe("no upper over a full-height body, nor over either corner zone (U3b S2 item 4, E7, 7D2 c. 14)", () => {
  it("6000 / 6000 / 6000 at 3900: nothing over the fridge, the pantries or the tower", () => {
    const room = uRoom(3900, 6000, 6000, 3900);
    const result = composeU(room);
    const fullHeight = result.design.placements.filter(
      (placement) =>
        placement.y0Mm === 0 && placement.body.heightMm > WALL_ROW_FLOOR_MM,
    );

    expect(fullHeight.length).toBeGreaterThan(2);
    expect(
      upperFindings(room, result).filter((finding) =>
        finding.includes("full-height"),
      ),
    ).toStrictEqual([]);
  });

  it.each([
    uRoom(2700, 1600, 1700),
    uRoom(3600, 2400, 2000),
    uRoom(5400, 3400, 3400),
  ])(
    "%j: the shell's wall-only strips over both corners stay empty of generated uppers",
    (room) => {
      const result = composeU(room);
      const zones = cornerZonesOf(room);

      expect(
        zones.filter((zone) => zone.wall === "A").length,
      ).toBeGreaterThanOrEqual(2);
      expect(
        upperFindings(room, result).filter((finding) =>
          finding.includes("corner zone"),
        ),
      ).toStrictEqual([]);
    },
  );
});

describe("a large U's back-wall voids stay open and take a wall cabinet (U3b AC6)", () => {
  const wallCabinetMinMm =
    SHELL_CATALOG.get("wall-cabinet")?.widthRangesMm?.[0]?.minMm ?? Infinity;

  it("6000 / 6000 / 6000: wall A holds voids at the wall row and the top row, and every one wide enough accepts a wall-cabinet", () => {
    const verdicts = wallCabinetVerdictsOnWallA(
      composeU(uRoom(6000, 6000, 6000)),
    );

    expect(
      new Set(verdicts.map((verdict) => verdict.rowFloorMm)),
    ).toStrictEqual(new Set([WALL_ROW_FLOOR_MM, TOP_ROW_FLOOR_MM]));
    for (const verdict of verdicts.filter(
      (entry) => entry.widthMm >= wallCabinetMinMm,
    )) {
      expect(verdict.verdict, JSON.stringify(verdict)).toBe("accepted");
    }
  });

  it("6000 / 6000 / 6000: every void narrower than the cabinet's own minimum is the 100 mm sliver the shell's 800 mm cap leaves at a corner strip, and answers WIDTH_TOO_SMALL", () => {
    const verdicts = wallCabinetVerdictsOnWallA(
      composeU(uRoom(6000, 6000, 6000)),
    );
    const slivers = verdicts.filter(
      (entry) => entry.widthMm < wallCabinetMinMm,
    );

    expect(slivers.length).toBeGreaterThan(0);
    expect(new Set(slivers.map((entry) => entry.verdict))).toStrictEqual(
      new Set(["WIDTH_TOO_SMALL"]),
    );
  });

  it("holds over 100 large U rooms across the engine range and the approved heights", () => {
    const walls = engineUWallBounds();
    let checked = 0;
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 3000, max: walls.wallA.maxMm }),
          fc.integer({ min: 3000, max: walls.wallB.maxMm }),
          fc.integer({ min: 3000, max: walls.wallC.maxMm }),
          fc.constantFrom(2200, 2600, 3900),
        ),
        ([widthMm, depthMm, wallCMm, heightMm]) => {
          fc.pre(widthMm + depthMm + wallCMm >= 10_000);
          const room = uRoom(widthMm, depthMm, wallCMm, heightMm);
          const result = composeU(room);
          const verdicts = wallCabinetVerdictsOnWallA(result);
          checked += 1;

          expect(
            upperFindings(room, result),
            JSON.stringify(room),
          ).toStrictEqual([]);
          expect(verdicts.length, JSON.stringify(room)).toBeGreaterThan(0);
          for (const verdict of verdicts.filter(
            (entry) => entry.widthMm >= wallCabinetMinMm,
          )) {
            expect(verdict.verdict, JSON.stringify([room, verdict])).toBe(
              "accepted",
            );
          }
        },
      ),
      { numRuns: 100 },
    );

    expect(checked).toBeGreaterThanOrEqual(100);
  });
});
