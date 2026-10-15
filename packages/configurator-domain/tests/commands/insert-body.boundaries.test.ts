// §5.2's fit guards at `FIT_TOLERANCE_M` and `MIN_WIDTH_M`, one millimetre either side.
//
// `insert-body.test.ts` proves each guard on an example that is comfortably inside or outside it.
// A guard is only worth what it does at its edge, and every one of these guards is written as a
// comparison against a tolerance — so the edge is where the rule and the tolerance disagree.
import { describe, expect, it } from "vitest";

import { HEIGHT_FLEX_MIN_OPENING_MM } from "../../src/commands/insert-fit.js";
import { MIN_WIDTH_M } from "../../src/void-engine.js";
import { clearBodies, insertInto } from "../support/commands.js";
import { voidAt, type KitchenWorld } from "../support/kitchen-world.js";
import { columnWorld } from "../support/synthetic-world.js";

const COLUMN_KEY = "A|1.00";
const ALONG_MM = 1000;

/** A column of the given width whose base level is empty and whose top row is occupied. */
function clearedBaseColumn(widthMm: number): KitchenWorld {
  return clearBodies(
    columnWorld(ALONG_MM, [
      { id: "s0", y0Mm: 0, heightMm: 820, widthMm },
      {
        id: "s1",
        y0Mm: 2200,
        heightMm: 400,
        widthMm,
        buildId: "wall-2door-600-top",
      },
    ]),
    ["s0"],
  );
}

function insertIntoBaseSlot(world: KitchenWorld, buildId: string) {
  return insertInto(
    world,
    { kind: "void", id: voidAt(world, COLUMN_KEY, 0).id },
    buildId,
  );
}

describe("FIT_TOLERANCE_M as a width gate (§2, §5.2)", () => {
  it("accepts a fixed-width body exactly FIT_TOLERANCE_M wider than the opening", () => {
    // The freestanding fridge is offered in 700 only. 688 + 12 = 700.
    const result = insertIntoBaseSlot(clearedBaseColumn(688), "fridge-free");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const placed = result.design.placements.find(
      (placement) => placement.id === result.effect.placementId,
    );
    expect(placed?.body.widthMm).toBe(700);
  });

  it("refuses a fixed-width body one millimetre past FIT_TOLERANCE_M, with both numbers", () => {
    const result = insertIntoBaseSlot(clearedBaseColumn(687), "fridge-free");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("WIDTH_TOO_LARGE");
    expect(result.reason.params).toMatchObject({
      requiredMm: 700,
      availableMm: 687,
    });
  });

  it("refuses a fixed-width body one tenth of a millimetre past FIT_TOLERANCE_M", () => {
    const result = insertIntoBaseSlot(clearedBaseColumn(687.9), "fridge-free");
    expect(result.ok).toBe(false);
  });

  it("takes the widest size of a set that still fits within the tolerance", () => {
    const wide = insertIntoBaseSlot(clearedBaseColumn(588), "base-dishwasher");
    expect(wide.ok).toBe(true);
    if (!wide.ok) return;
    expect(
      wide.design.placements.find(
        (placement) => placement.id === wide.effect.placementId,
      )?.body.widthMm,
    ).toBe(600);

    const narrow = insertIntoBaseSlot(
      clearedBaseColumn(587),
      "base-dishwasher",
    );
    expect(narrow.ok).toBe(true);
    if (!narrow.ok) return;
    expect(
      narrow.design.placements.find(
        (placement) => placement.id === narrow.effect.placementId,
      )?.body.widthMm,
    ).toBe(450);
  });
});

/** A column whose top row has been cleared, leaving the 400 mm top slot exactly. */
function clearedTopColumn(): KitchenWorld {
  return clearBodies(standardColumn(700), ["s2"]);
}

/** A column whose wall body is `wallHeightMm` tall, leaving `2200 - 1500 - wallHeightMm` free
 *  below the top row. */
function standardColumn(wallHeightMm: number): KitchenWorld {
  return columnWorld(ALONG_MM, [
    { id: "s0", y0Mm: 0, heightMm: 860 },
    { id: "s1", y0Mm: 1500, heightMm: wallHeightMm, buildId: "wall-2door-600" },
    { id: "s2", y0Mm: 2200, heightMm: 400, buildId: "wall-2door-600-top" },
  ]);
}

function widthOf(result: ReturnType<typeof insertIntoBaseSlot>) {
  if (!result.ok) return undefined;
  return result.design.placements.find(
    (placement) => placement.id === result.effect.placementId,
  )?.body.widthMm;
}

describe("MIN_WIDTH_M is a property of the body, not a fit tolerance (§2)", () => {
  // `resolveWidth` refuses below `MIN_WIDTH_M - COORDINATE_EPSILON_M`. `FIT_TOLERANCE_M` is slack
  // on the *fit* — it lets a body slightly wider than its opening still go in — and deliberately
  // does not lower this floor, because a 288 mm carcass is narrower than any cabinet §2 permits.
  // **A ladder entry, so §2's default floor is the only thing that can refuse it.** These three cases
  // are about `MIN_WIDTH_M` and nothing else; the hinged cabinet declares its own 200 mm floor
  // (ADR 0026's mechanism) and, since ADR 0033's amendment, a 200–400 range, so it is legitimately
  // built at 288 and would make this block assert the opposite of what it is named for.
  it("builds at exactly MIN_WIDTH_M, and at exactly that width", () => {
    const result = insertIntoBaseSlot(clearedBaseColumn(300), "base-3drawer");
    expect(result.ok).toBe(true);
    expect(widthOf(result)).toBe(MIN_WIDTH_M * 1000);
  });

  it("refuses one millimetre under the floor, and adds nothing", () => {
    const world = clearedBaseColumn(299);
    const result = insertIntoBaseSlot(world, "base-3drawer");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("WIDTH_NOT_SUPPORTED");
    expect(result.design.placements).toHaveLength(
      world.design.placements.length,
    );
  });

  it("refuses a 288 mm opening — FIT_TOLERANCE_M does not buy 12 mm of floor", () => {
    const result = insertIntoBaseSlot(clearedBaseColumn(288), "base-3drawer");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("WIDTH_NOT_SUPPORTED");
  });
});

describe("§9's minimum opening for a height-flexible body", () => {
  // §9: "`hFlex` needs `openH >= 400`". `refuseShortOpening` compares against the minimum with a
  // coordinate epsilon, so 400 builds and 399 refuses — the stated number is the real one.
  function insertWallBody(world: KitchenWorld, y0: number) {
    return insertInto(
      world,
      { kind: "void", id: voidAt(world, COLUMN_KEY, y0).id },
      "wall-cabinet",
    );
  }

  it("builds at exactly HEIGHT_FLEX_MIN_OPENING_MM, filling the slot", () => {
    const world = clearedTopColumn();
    expect(Math.round(voidAt(world, COLUMN_KEY, 2.2).h * 1000)).toBe(
      HEIGHT_FLEX_MIN_OPENING_MM,
    );

    const result = insertWallBody(world, 2.2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const placed = result.design.placements.find(
      (placement) => placement.id === result.effect.placementId,
    );
    expect(placed?.body.heightMm).toBe(HEIGHT_FLEX_MIN_OPENING_MM);
    expect(placed?.y0Mm).toBe(2200);
  });

  it("refuses a 399 mm opening, one millimetre under the minimum, and adds nothing", () => {
    const world = standardColumn(301);
    expect(Math.round(voidAt(world, COLUMN_KEY, 1.801).h * 1000)).toBe(399);

    const result = insertWallBody(world, 1.801);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("OPENING_TOO_SHORT");
    expect(result.design.placements).toHaveLength(
      world.design.placements.length,
    );
  });

  it("refuses a 388 mm opening — FIT_TOLERANCE_M does not buy 12 mm of minimum", () => {
    const world = standardColumn(312);
    expect(Math.round(voidAt(world, COLUMN_KEY, 1.812).h * 1000)).toBe(388);

    const result = insertWallBody(world, 1.812);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("OPENING_TOO_SHORT");
  });
});
