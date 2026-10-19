// M7B U3b S1 — `generateKitchen` composes a U (ADR 0110 decisions 1-6, N11.6, N11.8, N11.9): the same
// plan U3a made, with the free ends ADR 0167 fills (`filledPlanFor`, which this file holds to the log's plan), put into a U shell body by body through `insertBody`, with the log replayable on its
// own. The property over the engine range is `generate-kitchen.u.property.test.ts`, and the whole
// approved grid is `generate-kitchen.u.grid-*.test.ts`; this file holds the named rooms.
import { describe, expect, it } from "vitest";

import {
  replayGenerationLog,
  type DesignPlacement,
  type DesignRoom,
} from "../../src/index.js";
import { deriveDoorCount } from "../../src/door-count.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";
import {
  composeU,
  generateU,
  type ComposedKitchen,
  spanMismatchesOf,
  uPlanOf,
} from "../support/generated-u.js";
import { filledPlanFor, uRoom } from "../support/u-plan-fixtures.js";

/** Every room the U3a witness file pins a plan for: N4′'s seven, N10.6's six, and N11's rows. Its
 *  3600 / 3500 / 2200 row at 2199 mm is left out: the approved heights start at 2200 (as they do for
 *  an L, whose generation throws at 2199 the same way), so that row is a plan witness only. */
const WITNESS_ROOMS: readonly DesignRoom[] = [
  uRoom(2700, 1000, 1000),
  uRoom(3000, 1000, 1000),
  uRoom(3600, 2400, 2000),
  uRoom(3600, 3500, 2200),
  uRoom(4000, 4500, 1200),
  uRoom(5000, 4000, 3000),
  uRoom(6000, 6000, 6000),
  uRoom(3000, 4500, 4500),
  uRoom(2700, 4000, 4000),
  uRoom(2700, 3700, 3700),
  uRoom(4200, 3400, 3400),
  uRoom(4800, 1000, 1000),
  uRoom(4800, 4400, 4400),
  uRoom(3600, 2800, 2800),
  uRoom(4000, 2000, 2000),
  uRoom(4900, 4000, 4000),
  uRoom(5100, 2000, 2000),
  uRoom(5400, 3400, 3400),
  uRoom(2399, 3000, 3000),
  uRoom(2400, 3000, 3000),
  uRoom(3600, 3500, 2200, 2200),
];

function wallAOf(result: ComposedKitchen): readonly string[] {
  return uPlanOf(result)
    .bases.filter((base) => base.wall === "A")
    .sort((left, right) => left.startMm - right.startMm)
    .map(
      (base) => `${base.buildId}@${String(base.startMm)}-${String(base.endMm)}`,
    );
}

function placementOf(result: ComposedKitchen, baseId: string): DesignPlacement {
  const step = result.log.steps.find((candidate) => candidate.id === baseId);
  const placement =
    step?.status === "placed"
      ? result.design.placements.find(
          (candidate) => candidate.id === step.placementId,
        )
      : undefined;
  if (placement === undefined) throw new Error(`${baseId} was not placed`);
  return placement;
}

describe("generateKitchen composes the U3a witnesses (U3b AC3)", () => {
  it.each(WITNESS_ROOMS.map((room) => [JSON.stringify(room), room] as const))(
    "%s: the plan is U3a's with ADR 0167's fills, and every body stands where it says",
    (_label, room) => {
      const result = generateU(room);
      const plan = filledPlanFor(room);

      expect(result.ok).toBe(plan.minimumMet);
      expect(result.log.plan).toStrictEqual(plan);
      expect(spanMismatchesOf(result)).toStrictEqual([]);
    },
  );

  it("refuses a room short of the minimum kitchen with the plan's own refusal, and places nothing", () => {
    const result = generateU(uRoom(2399, 3000, 3000));

    expect(result.ok).toBe(false);
    expect(result.log.commands).toStrictEqual([]);
    expect(result.log.steps.every((step) => step.status === "not_placed")).toBe(
      true,
    );
  });
});

describe("wall A's remainder through generateKitchen (N11.8, N11.9)", () => {
  it("2700 / 1600 / 1700: the sink at A 900-1500 and a one-door 300 mm base at 1500-1800", () => {
    const result = composeU(uRoom(2700, 1600, 1700));

    expect(wallAOf(result)).toStrictEqual([
      "base-sink@900-1500",
      "base-cabinet@1500-1800",
    ]);
    const fill = placementOf(result, "wall-a-remainder:A");
    expect(fill.body.buildId).toBe("base-cabinet");
    expect(fill.body.widthMm).toBe(300);
    expect(fill.alongMm).toBe(1650);
    expect(deriveDoorCount(fill.body.widthMm)).toBe(1);
  });

  it("3100 / 1000 / 1100, where the low-end gap used to merge and throw: the 100 mm stays bare at 2100-2200", () => {
    const result = composeU(uRoom(3100, 1000, 1100));

    expect(wallAOf(result)).toStrictEqual([
      "base-hob-oven@900-1500",
      "base-sink@1500-2100",
    ]);
    expect(spanMismatchesOf(result)).toStrictEqual([]);
    expect(
      result.design.placements.some((placement) =>
        placement.id.startsWith("wall-a-remainder"),
      ),
    ).toBe(false);
  });

  it("2800 / 1600 / 1600 and 2900 / 1600 / 1600: a 400 mm base has one door and a 500 mm base has two, as the catalogue counts them (RQ26)", () => {
    const at400 = placementOf(
      composeU(uRoom(2800, 1600, 1600)),
      "wall-a-remainder:A",
    );
    const at500 = placementOf(
      composeU(uRoom(2900, 1600, 1600)),
      "wall-a-remainder:A",
    );

    expect([at400.body.widthMm, at500.body.widthMm]).toStrictEqual([400, 500]);
    expect([
      deriveDoorCount(at400.body.widthMm),
      deriveDoorCount(at500.body.widthMm),
    ]).toStrictEqual([1, 2]);
  });
});

describe("a side wall's free end (U3b S1 item 3)", () => {
  function resizedPlacementsOn(room: DesignRoom, wall: "B" | "C") {
    const result = composeU(room);
    return result.log.commands.flatMap((command) => {
      if (command.type !== "set_width") return [];
      const placement = result.design.placements.find(
        (candidate) => candidate.id === command.placementId,
      );
      return placement?.wall === wall ? [placement] : [];
    });
  }

  it("steps the fit body at wall B's free end back to its planned width after its column merged a short remainder", () => {
    const room = uRoom(3600, 5600, 5700);

    expect(resizedPlacementsOn(room, "B")).toHaveLength(1);
    expect(spanMismatchesOf(generateU(room))).toStrictEqual([]);
  });

  it("does the same at wall C's free end", () => {
    const room = uRoom(3600, 5600, 5600);

    expect(resizedPlacementsOn(room, "C")).toHaveLength(1);
    expect(spanMismatchesOf(generateU(room))).toStrictEqual([]);
  });
});

describe("replayGenerationLog replays a U (U3b S1 item 4)", () => {
  it.each([
    uRoom(2700, 1600, 1700),
    uRoom(3600, 5600, 5600),
    uRoom(6000, 6000, 6000),
    uRoom(3100, 1000, 1100),
  ])("replays %j to the design it produced, from its own log", (room) => {
    const result = composeU(room);

    const replayed = replayGenerationLog({
      log: result.log,
      probeAt: createFakeProbeFactory(),
    });

    expect(replayed).toStrictEqual(result.design);
  });
});
