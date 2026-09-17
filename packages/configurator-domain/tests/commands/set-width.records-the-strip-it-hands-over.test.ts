// **A resize moves a boundary in two dimensions, and the column receiving the strip has to record
// it at the heights it was recorded at before.**
//
// ADR 0031 funds a resize from the empty column next door and asks one question of it — is it empty
// at every level (`findAdjacentEmptyColumn`). It never asked the second one: does it stand *where
// the run stands*. A column that is empty over the wall row and absent over the floor answers the
// first question and fails the second, and funding a shrink from it conserves the width while
// losing the floor. The strip leaves the run's extent and enters a column with no region over it,
// so it belongs to no placement, no recorded empty column and no derived void — §4 derives nothing
// between two frozen extents, which is the same invisibility ADR 0031 records at
// `EDGE_ABUTMENT_TOLERANCE_M`.
//
// **The route below needs no generator and no room the composer has ever seen.** The shipped
// reference kitchen already carries the shape: `A|0.75` holds `p10` and `p16` over the wall row at
// 600–900 and nothing under them, and it abuts the sink column `A|1.30` at 900. Delete the pair —
// one ordinary delete a customer makes to open a wall — and step the sink down, and the 50 mm the
// run gives back goes into the wall-row column and the floor under it is recorded nowhere. **This
// is reachable on the design the product ships**, which is why the repair is in the command rather
// than in whatever composed the kitchen.
//
// The sibling file `tests/generation/composed-floor-is-recorded-whole.adversarial.test.ts` sweeps
// the same invariant over composed kitchens.
import { describe, expect, it } from "vitest";

import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { clearBodies, resizeTo } from "../support/commands.js";
import { unrecordedFloorStripsMm } from "../support/floor-coverage.js";
import {
  advanceWithColumns,
  createWorld,
  type KitchenWorld,
} from "../support/kitchen-world.js";

/** The shipped kitchen with `A|0.75` emptied: a column standing over the wall row from 600 to 900,
 *  with no region over the floor, abutting the sink run's left edge at 900. `p10` is the 300 mm wall
 *  cabinet and `p16` its top box — both ordinary deletes. */
function kitchenWithAWallRowOnlyOpening(): KitchenWorld {
  return clearBodies(createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG), [
    "p10",
    "p16",
  ]);
}

/** A column's along-wall extent in millimetres, read off the map the command published. */
function extentMm(
  columns: ReadonlyMap<string, { readonly x: number; readonly w: number }>,
  key: string,
): [number, number] | undefined {
  const column = columns.get(key);
  if (!column) return undefined;
  const centreMm = Math.round(column.x * 1000);
  const widthMm = Math.round(column.w * 1000);
  return [centreMm - widthMm / 2, centreMm + widthMm / 2];
}

describe("a shrink beside a column that stands only over the wall row", () => {
  it("leaves no strip of floor belonging to nothing", () => {
    const world = kitchenWithAWallRowOnlyOpening();

    const result = resizeTo(world, "p0", 750);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = advanceWithColumns(
      world,
      result.design,
      result.effect.columns,
    );
    expect(unrecordedFloorStripsMm(after.columns, "A")).toEqual([]);
  });

  it("creates the strip it vacates instead of funding from the wall row", () => {
    // ADR 0035 decision 7 is what is left once the wall-row column is refused, and it is the right
    // answer rather than a consolation: the run keeps the corner edge nobody asked to move, and the
    // 50 mm it withdraws from is entered as a column of its own carrying the run's own regions.
    const world = kitchenWithAWallRowOnlyOpening();

    const result = resizeTo(world, "p0", 750);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(extentMm(result.effect.columns, "A|0.75")).toEqual([600, 900]);
    expect(extentMm(result.effect.columns, "A|1.27")).toEqual([900, 1650]);
    expect(extentMm(result.effect.columns, "A|1.68")).toEqual([1650, 1700]);
  });

  it("holds the run against the corner rather than sliding it off", () => {
    // The whole symptom in one number. Funding from `A|0.75` moved the sink's left edge from 900 to
    // 950 — a boundary the customer never touched — and that displacement *is* the unrecorded
    // strip. The run's members must stand at 900 still, 750 wide, so `alongMm` is 1275.
    const world = kitchenWithAWallRowOnlyOpening();

    const result = resizeTo(world, "p0", 750);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sink = result.design.placements.find(
      (placement) => placement.id === "p0",
    );
    expect([sink?.alongMm, sink?.body.widthMm]).toEqual([1275, 750]);
  });
});
