// §4's four rules reached the way a customer reaches them: by deleting and inserting.
//
// M2 proved these rules on hand-built fixtures, where the record set was written down rather than
// arrived at. M3 is the first phase that can reach them by mutating, and a rule that holds for a
// fixture but not for the state a command produces is a rule that does not hold.
import { describe, expect, it } from "vitest";

import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import type { VoidRecord } from "../../src/void-engine.js";
import { clearBodies, insertInto } from "../support/commands.js";
import {
  advance,
  createWorld,
  voidAt,
  type KitchenWorld,
} from "../support/kitchen-world.js";
import {
  BACKSPLASH_ZONE,
  intersectsNoModuleLine,
} from "../support/invariants.js";

const FRIDGE_COLUMN = "B|2.45";
const HOB_COLUMN = "A|2.60";
const WALL_ONLY_COLUMN = "A|0.30";

const seeded = () => createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);

function slotsOf(world: KitchenWorld, col: string) {
  return world.voids
    .filter((record) => record.col === col)
    .map((record) => ({
      y0: Number(record.y0.toFixed(3)),
      h: Number(record.h.toFixed(3)),
      spanH: Number(record.spanH.toFixed(3)),
      w: Number(record.w.toFixed(3)),
    }));
}

/** Row 17's actual forbidden shape: an opening that lands inside the backsplash gap and touches no
 *  module line, so nothing in the catalogue can be built in it. An opening that merely *crosses*
 *  the gap on its way between two real levels is rule 4's collapse, not row 17's defect. */
function isGapOnlySlot(record: VoidRecord): boolean {
  const [start, end] = BACKSPLASH_ZONE;
  return (
    intersectsNoModuleLine(record) ||
    (record.y0 >= start && record.y0 + record.h <= end)
  );
}

describe("row 17 — reached by deleting the hood, not by writing a fixture", () => {
  // The hob column's base cabinet stops at 0.82 and the hood starts at 1.50, so removing the hood
  // creates a free span of 0.82 → 2.20 that straddles the backsplash gap.
  const world = clearBodies(seeded(), ["p13"]);

  it("emits exactly one opening for the span, at the wall level", () => {
    expect(slotsOf(world, HOB_COLUMN)).toEqual([
      { y0: 1.5, h: 0.7, spanH: 1.38, w: 0.6 },
    ]);
  });

  it("emits no opening anywhere in the design that sits in the backsplash gap alone", () => {
    expect(world.voids.filter(isGapOnlySlot)).toEqual([]);
  });
});

describe("row 18 — reached by clearing a wall-only column", () => {
  const world = clearBodies(seeded(), ["p8", "p15"]);

  it("starts the derivation at the column's own lowest module, not at the floor", () => {
    expect(slotsOf(world, WALL_ONLY_COLUMN)).toEqual([
      { y0: 1.5, h: 0.7, spanH: 1.1, w: 0.6 },
      { y0: 2.2, h: 0.4, spanH: 1.1, w: 0.6 },
    ]);
  });
});

describe("the merge case — delete the fridge, then the unit above it (§10)", () => {
  const oneGone = clearBodies(seeded(), ["p7"]);
  const merged = clearBodies(oneGone, ["p24"]);

  it("reports two level slots inside a 1850 mm span before the merge", () => {
    expect(slotsOf(oneGone, FRIDGE_COLUMN)).toEqual([
      { y0: 0, h: 0.86, spanH: 1.85, w: 0.7 },
      { y0: 1.5, h: 0.35, spanH: 1.85, w: 0.7 },
    ]);
  });

  it("becomes one 700 x 2600 opening subdivided into three level slots", () => {
    expect(slotsOf(merged, FRIDGE_COLUMN)).toEqual([
      { y0: 0, h: 0.86, spanH: 2.6, w: 0.7 },
      { y0: 1.5, h: 0.7, spanH: 2.6, w: 0.7 },
      { y0: 2.2, h: 0.4, spanH: 2.6, w: 0.7 },
    ]);
  });

  it("reaches the same opening set whichever body is deleted first", () => {
    const otherOrder = clearBodies(clearBodies(seeded(), ["p24"]), ["p7"]);
    expect(slotsOf(otherOrder, FRIDGE_COLUMN)).toEqual(
      slotsOf(merged, FRIDGE_COLUMN),
    );
  });
});

describe("row 1 — clear the fridge column, re-insert the fridge", () => {
  const merged = clearBodies(seeded(), ["p7", "p24"]);
  const result = insertInto(
    merged,
    { kind: "void", id: voidAt(merged, FRIDGE_COLUMN, 0).id },
    "fridge-free",
  );

  it("places the fridge on the floor at its own 1850 mm height", () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const placed = result.design.placements.find(
      (placement) => placement.id === result.effect.placementId,
    );
    expect(placed?.y0Mm).toBe(0);
    expect(placed?.body.heightMm).toBe(1850);
    expect(placed?.body.widthMm).toBe(700);
  });

  it("leaves exactly ONE 750 mm slot above it, never two stubs", () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = advance(merged, result.design);
    expect(slotsOf(after, FRIDGE_COLUMN)).toEqual([
      { y0: 1.85, h: 0.75, spanH: 0.75, w: 0.7 },
    ]);
  });
});
