// M7C wave C5 slice S1, criteria 1 and 2 at the leaf: the plan `withTheLeftoverBesideTheFridgeAbsorbed` is
// given and the plan it gives back, on hand-built plans where every figure is chosen rather than found.
//
// The owner's Q6 (2026-10-01): where the fridge ends a run and a door cabinet stands directly inboard of it,
// the 50-299 mm beyond the fridge goes to that cabinet in 50 mm steps up to 800, and the fridge moves out by
// the same amount. The expected figures come from `support/fridge-end-leftover.ts`, which restates the owner's
// words rather than reading the rule's constants (ADR 0121 decision 3(b)).
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import type {
  KitchenCompositionPlan,
  PlannedGenerationBase,
} from "../../src/index.js";
import { withTheLeftoverBesideTheFridgeAbsorbed } from "../../src/generation/fridge-end-leftover.js";
import {
  absorbedByTheOwnersRuleMm,
  DOOR_CABINET,
  ONE_STORAGE_MODULE_MM,
} from "../support/fridge-end-leftover.js";

type Wall = "A" | "B";

const FRIDGE_WIDTH_MM = 700;
const CORNER_END_MM = 900;
const BASE_SINK = "base-sink";
const NEXT_TO_THE_CORNER = "next-to-the-corner";
const INBOARD_OF_THE_FRIDGE = "inboard-of-the-fridge";
const PAST_THE_FRIDGE = "past-the-fridge";

function base(
  spec: Pick<PlannedGenerationBase, "id" | "role" | "buildId" | "wall"> & {
    readonly startMm: number;
    readonly widthMm: number;
  },
): PlannedGenerationBase {
  return { ...spec, endMm: spec.startMm + spec.widthMm };
}

interface Layout {
  /** What stands directly inboard of the fridge. */
  readonly inboard: { readonly buildId: string; readonly widthMm: number };
  readonly leftoverMm: number;
  readonly fridgeWall?: Wall;
  /** Bodies standing past the fridge, which make it not the outermost one. */
  readonly pastTheFridge?: boolean;
  readonly hasNoFridge?: boolean;
}

/** One wall carries a door cabinet, the cabinet under test and the fridge, with `leftoverMm` bare beyond; the
 *  other carries a sink, so a change to the wrong wall shows. */
function planOf(layout: Layout): KitchenCompositionPlan {
  const wall = layout.fridgeWall ?? "A";
  const otherWall: Wall = wall === "A" ? "B" : "A";
  const slot = base({
    id: NEXT_TO_THE_CORNER,
    role: "storage",
    buildId: DOOR_CABINET,
    wall,
    startMm: CORNER_END_MM,
    widthMm: ONE_STORAGE_MODULE_MM,
  });
  const inboard = base({
    id: INBOARD_OF_THE_FRIDGE,
    role: "storage",
    buildId: layout.inboard.buildId,
    wall,
    startMm: slot.endMm,
    widthMm: layout.inboard.widthMm,
  });
  const fridge = base({
    id: "fridge",
    role: "fridge",
    buildId: "fridge-free",
    wall,
    startMm: inboard.endMm,
    widthMm: FRIDGE_WIDTH_MM,
  });
  const pastTheFridge = base({
    id: PAST_THE_FRIDGE,
    role: "storage",
    buildId: DOOR_CABINET,
    wall,
    startMm: fridge.endMm,
    widthMm: ONE_STORAGE_MODULE_MM,
  });
  const sink = base({
    id: "sink",
    role: "sink",
    buildId: BASE_SINK,
    wall: otherWall,
    startMm: CORNER_END_MM,
    widthMm: ONE_STORAGE_MODULE_MM,
  });
  const onTheWall = [
    slot,
    inboard,
    ...(layout.hasNoFridge ? [] : [fridge]),
    ...(layout.pastTheFridge ? [pastTheFridge] : []),
  ];
  return planFrom(wall, onTheWall, [sink], layout.leftoverMm);
}

function planFrom(
  wall: Wall,
  onTheWall: readonly PlannedGenerationBase[],
  onTheOtherWall: readonly PlannedGenerationBase[],
  leftoverMm: number,
): KitchenCompositionPlan {
  const widthsOf = (bases: readonly PlannedGenerationBase[]) =>
    bases.map((member) => member.widthMm);
  return {
    room: { shape: "L", widthMm: 3600, depthMm: 3600, heightMm: 2600 },
    bases: [...onTheWall, ...onTheOtherWall],
    floorWidthsMm:
      wall === "A"
        ? { A: widthsOf(onTheWall), B: widthsOf(onTheOtherWall) }
        : { A: widthsOf(onTheOtherWall), B: widthsOf(onTheWall) },
    dropped: [],
    minimumMet: true,
    remainderMm:
      wall === "A" ? { A: leftoverMm, B: 0 } : { A: 0, B: leftoverMm },
  };
}

function withWidth(widthMm: number, leftoverMm: number): Layout {
  return { inboard: { buildId: DOOR_CABINET, widthMm }, leftoverMm };
}

function bodyNamed(
  plan: KitchenCompositionPlan,
  id: string,
): PlannedGenerationBase {
  const found = plan.bases.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`no ${id} in the plan`);
  return found;
}

describe("the leftover beside an end fridge goes to the door cabinet inboard of it", () => {
  // The boundaries the contract names: 49 stays, 50 is the first step, 199 and 249 and 299 are one
  // short of a step, 200 fills the cabinet to 800 exactly, 300 is the owner's line.
  it.each([
    // leftover, what the 600 cabinet takes, what stays bare beyond the fridge
    [0, 0, 0],
    [49, 0, 49],
    [50, 50, 0],
    [99, 50, 49],
    [100, 100, 0],
    [199, 150, 49],
    [200, 200, 0],
    [249, 200, 49],
    [250, 200, 50],
    [299, 200, 99],
    [300, 0, 300],
    [599, 0, 599],
  ])(
    "with %i mm beyond the fridge the 600 cabinet takes %i and %i stays bare",
    (leftoverMm, takenMm, bareMm) => {
      const before = planOf(withWidth(ONE_STORAGE_MODULE_MM, leftoverMm));

      const after = withTheLeftoverBesideTheFridgeAbsorbed(before);

      expect(bodyNamed(after, INBOARD_OF_THE_FRIDGE).widthMm).toBe(
        ONE_STORAGE_MODULE_MM + takenMm,
      );
      expect(after.remainderMm.A).toBe(bareMm);
      expect(bodyNamed(after, "fridge").startMm).toBe(
        bodyNamed(before, "fridge").startMm + takenMm,
      );
    },
  );

  it("changes nothing, not even the plan's identity, where there is nothing to absorb", () => {
    for (const leftoverMm of [0, 49, 300, 450]) {
      const before = planOf(withWidth(ONE_STORAGE_MODULE_MM, leftoverMm));

      expect(withTheLeftoverBesideTheFridgeAbsorbed(before)).toBe(before);
    }
  });

  it("takes nothing where the neighbour already stands at 800", () => {
    const before = planOf(withWidth(800, 150));

    expect(withTheLeftoverBesideTheFridgeAbsorbed(before)).toBe(before);
  });

  it("takes only what the ceiling leaves a neighbour that is already wide", () => {
    const after = withTheLeftoverBesideTheFridgeAbsorbed(
      planOf(withWidth(750, 250)),
    );

    expect(bodyNamed(after, INBOARD_OF_THE_FRIDGE).widthMm).toBe(800);
    expect(after.remainderMm.A).toBe(200);
  });

  it.each([
    // neighbour, leftover, what it takes: whole steps, up to 800, from the owner's words
    [601, 200, 150],
    [625, 299, 150],
    [651, 150, 100],
  ])(
    "grows a %i mm cabinet in whole steps, not by a part of one: %i mm beyond the fridge gives it %i",
    (widthMm, leftoverMm, takenMm) => {
      const after = withTheLeftoverBesideTheFridgeAbsorbed(
        planOf(withWidth(widthMm, leftoverMm)),
      );

      expect(bodyNamed(after, INBOARD_OF_THE_FRIDGE).widthMm).toBe(
        widthMm + takenMm,
      );
      expect(after.remainderMm.A).toBe(leftoverMm - takenMm);
    },
  );

  it.each([
    ["the sink", { buildId: BASE_SINK, widthMm: 600 }],
    ["the dishwasher", { buildId: "base-dishwasher", widthMm: 600 }],
    ["a three-drawer base", { buildId: "base-3drawer", widthMm: 600 }],
    ["a pan drawer", { buildId: "base-panbank", widthMm: 600 }],
    ["the bottle cargo", { buildId: "base-bottle-cargo", widthMm: 300 }],
    ["a tall column", { buildId: "tall-pantry", widthMm: 600 }],
  ])(
    "changes no width where %s stands inboard of the fridge: it is fixed or not a door cabinet",
    (_name, inboard) => {
      const before = planOf({ inboard, leftoverMm: 150 });

      expect(withTheLeftoverBesideTheFridgeAbsorbed(before)).toBe(before);
    },
  );

  it("changes nothing where the fridge stands at the corner with no body inboard of it", () => {
    const cornerFridge = base({
      id: "fridge",
      role: "fridge",
      buildId: "fridge-free",
      wall: "A",
      startMm: CORNER_END_MM,
      widthMm: FRIDGE_WIDTH_MM,
    });
    const before = planFrom("A", [cornerFridge], [], 150);

    expect(withTheLeftoverBesideTheFridgeAbsorbed(before)).toBe(before);
  });

  it("changes nothing where another body stands past the fridge", () => {
    const before = planOf({ ...withWidth(600, 150), pastTheFridge: true });

    expect(withTheLeftoverBesideTheFridgeAbsorbed(before)).toBe(before);
  });

  it("changes nothing where the kitchen has no fridge", () => {
    const before = planOf({ ...withWidth(600, 150), hasNoFridge: true });

    expect(withTheLeftoverBesideTheFridgeAbsorbed(before)).toBe(before);
  });
});

describe("what the absorb moves, and what it leaves exactly where it was", () => {
  const WIDENED = withWidth(ONE_STORAGE_MODULE_MM, 150);

  it("moves the cabinet's far edge and the fridge, and no other body's span", () => {
    const before = planOf(WIDENED);
    const after = withTheLeftoverBesideTheFridgeAbsorbed(before);

    for (const body of before.bases) {
      if (body.id === INBOARD_OF_THE_FRIDGE || body.id === "fridge") continue;
      expect(bodyNamed(after, body.id)).toBe(body);
    }
    const cabinet = bodyNamed(after, INBOARD_OF_THE_FRIDGE);
    expect(cabinet.startMm).toBe(
      bodyNamed(before, INBOARD_OF_THE_FRIDGE).startMm,
    );
    expect(cabinet.endMm).toBe(
      bodyNamed(before, INBOARD_OF_THE_FRIDGE).endMm + 150,
    );
  });

  it("keeps the fridge at its own width, flush against the cabinet", () => {
    const after = withTheLeftoverBesideTheFridgeAbsorbed(planOf(WIDENED));

    const fridge = bodyNamed(after, "fridge");
    expect(fridge.widthMm).toBe(FRIDGE_WIDTH_MM);
    expect(fridge.endMm - fridge.startMm).toBe(FRIDGE_WIDTH_MM);
    expect(fridge.startMm).toBe(bodyNamed(after, INBOARD_OF_THE_FRIDGE).endMm);
  });

  it("keeps the reading order, the ids and the bodies of every wall", () => {
    const before = planOf(WIDENED);
    const after = withTheLeftoverBesideTheFridgeAbsorbed(before);

    const identityOf = (plan: KitchenCompositionPlan) =>
      plan.bases.map((body) => [body.id, body.role, body.buildId, body.wall]);
    expect(identityOf(after)).toEqual(identityOf(before));
  });

  it("states the new floor widths, so the shell is cut where the bodies stand", () => {
    const after = withTheLeftoverBesideTheFridgeAbsorbed(planOf(WIDENED));

    expect(after.floorWidthsMm).toEqual({
      A: [600, 750, FRIDGE_WIDTH_MM],
      B: [600],
    });
  });

  it("leaves the other wall's remainder, floor widths and bodies untouched", () => {
    const before = planOf({ ...WIDENED, fridgeWall: "B" });
    const after = withTheLeftoverBesideTheFridgeAbsorbed(before);

    expect(after.remainderMm).toEqual({ A: 0, B: 0 });
    expect(after.floorWidthsMm.A).toBe(before.floorWidthsMm.A);
    expect(bodyNamed(after, "sink")).toBe(bodyNamed(before, "sink"));
    expect(bodyNamed(after, INBOARD_OF_THE_FRIDGE).widthMm).toBe(750);
  });

  it("does the same on wall B as on wall A", () => {
    const onA = withTheLeftoverBesideTheFridgeAbsorbed(planOf(WIDENED));
    const onB = withTheLeftoverBesideTheFridgeAbsorbed(
      planOf({ ...WIDENED, fridgeWall: "B" }),
    );

    expect(bodyNamed(onB, INBOARD_OF_THE_FRIDGE).widthMm).toBe(
      bodyNamed(onA, INBOARD_OF_THE_FRIDGE).widthMm,
    );
    expect(bodyNamed(onB, "fridge").startMm).toBe(
      bodyNamed(onA, "fridge").startMm,
    );
  });
});

describe("over every neighbour width and every leftover", () => {
  const widthArb = fc.integer({ min: 200, max: 800 });
  const leftoverArb = fc.integer({ min: 0, max: 599 });
  const wallArb = fc.constantFrom<Wall>("A", "B");

  it("gives the cabinet exactly the owner's share, keeps every span contiguous and spends no millimetre", () => {
    fc.assert(
      fc.property(
        widthArb,
        leftoverArb,
        wallArb,
        (widthMm, leftoverMm, wall) => {
          const before = planOf({
            ...withWidth(widthMm, leftoverMm),
            fridgeWall: wall,
          });

          const after = withTheLeftoverBesideTheFridgeAbsorbed(before);

          const takenMm = absorbedByTheOwnersRuleMm({
            leftoverMm,
            cabinetWidthMm: widthMm,
          });
          const alongTheWall = after.bases
            .filter((body) => body.wall === wall)
            .sort((left, right) => left.startMm - right.startMm);
          expect(bodyNamed(after, INBOARD_OF_THE_FRIDGE).widthMm).toBe(
            widthMm + takenMm,
          );
          expect(
            bodyNamed(after, INBOARD_OF_THE_FRIDGE).widthMm,
          ).toBeLessThanOrEqual(800);
          expect(after.remainderMm[wall]).toBe(leftoverMm - takenMm);
          expect(after.floorWidthsMm[wall]).toEqual(
            alongTheWall.map((body) => body.widthMm),
          );
          alongTheWall.forEach((body, index) => {
            expect(body.endMm - body.startMm).toBe(body.widthMm);
            if (index > 0) {
              expect(body.startMm).toBe(alongTheWall[index - 1]?.endMm);
            }
          });
          expect(alongTheWall.at(-1)?.endMm).toBe(
            (before.bases.filter((body) => body.wall === wall).at(-1)?.endMm ??
              0) + takenMm,
          );
          // The run is spent exactly as it was: bodies plus bare end is the same before and after.
          const reachMm = (plan: KitchenCompositionPlan) =>
            plan.bases
              .filter((body) => body.wall === wall)
              .reduce((sum, body) => sum + body.widthMm, 0) +
            plan.remainderMm[wall];
          expect(reachMm(after)).toBe(reachMm(before));
        },
      ),
      { numRuns: 1500 },
    );
  });

  it("never leaves a whole step bare while the cabinet could still grow a whole step", () => {
    fc.assert(
      fc.property(widthArb, leftoverArb, (widthMm, leftoverMm) => {
        const after = withTheLeftoverBesideTheFridgeAbsorbed(
          planOf(withWidth(widthMm, leftoverMm)),
        );

        const isInTheWindow = leftoverMm >= 50 && leftoverMm < 300;
        const cabinetMm = bodyNamed(after, INBOARD_OF_THE_FRIDGE).widthMm;
        // A whole step of room is left only where the cabinet stands at least 50 mm short of 800.
        if (isInTheWindow && cabinetMm <= 800 - 50) {
          expect(after.remainderMm.A).toBeLessThan(50);
        }
        if (!isInTheWindow) expect(cabinetMm).toBe(widthMm);
      }),
    );
  });
});
