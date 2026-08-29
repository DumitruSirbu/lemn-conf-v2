// ADR 0037 — **adjacent empty columns merge into one space**, and 800 mm still caps every cabinet.
//
// Backlog 2 recorded the defect from a handset: clearing two neighbouring cabinets gives *two*
// openings, 800 and 600, never one 1400 — because §4 merges openings vertically within a column and
// `deriveColumns` freezes the columns horizontally at load. The number and position of the columns
// was therefore permanent, and a customer could never turn two cabinets into three.
//
// ADR 0035 decision 7 made it worse before this wave fixed it. A shrink *creates* an empty column,
// so a customer producing two neighbouring empty spaces stopped needing two deletes: six presses of
// `−50` on an ordinary 600 mm cabinet freed 300 mm of wall as **six unusable 50 mm slivers**, each
// shrink parking a new strip beside the one before it. Owner, 2026-08-29: *"merge the gaps."*
//
// **The merge is at column granularity, and the column must be empty at every level** — the same
// predicate ADR 0031 already funds a resize from, rather than a second kind of emptiness. Deleting
// one cabinet at one level merges nothing.
import { describe, expect, it } from "vitest";

import type { DesignPlacement } from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { offersFor } from "../../src/queries/offers.js";
import { clearBodies, resizeTo } from "../support/commands.js";
import {
  advanceWithColumns,
  createWorld,
  type KitchenWorld,
} from "../support/kitchen-world.js";
import { syntheticWorld } from "../support/synthetic-world.js";

function placement(
  id: string,
  alongMm: number,
  y0Mm: number,
  buildId: string,
  widthMm: number,
  heightMm: number,
): DesignPlacement {
  return { id, wall: "A", alongMm, y0Mm, body: { buildId, widthMm, heightMm } };
}

/** The empty spaces on wall A, as `[width, count]` per column — the only shape these tests care
 *  about, since ADR 0037 is a rule about how many spaces there are and how wide each one is. */
function emptySpans(world: KitchenWorld): [string, number][] {
  const occupied = new Set(world.records.map((record) => record.col));
  return [...world.columns.values()]
    .filter((column) => !occupied.has(column.key) && column.wall === "A")
    .map((column): [string, number] => [
      column.key,
      Math.round(column.w * 1000),
    ])
    .sort((left, right) => left[0].localeCompare(right[0]));
}

/** One `−50` press, applied the way the store applies it: the design **and** the map the command
 *  published (ADR 0011 Gap D — a resize is the one command that moves an empty column). */
function stepDown(world: KitchenWorld, id: string, toMm: number): KitchenWorld {
  const result = resizeTo(world, id, toMm);
  if (!result.ok) {
    throw new Error(`Step to ${String(toMm)} refused: ${result.reason.code}`);
  }
  return advanceWithColumns(world, result.design, result.effect.columns);
}

describe("six presses of −50 free one space, not six slivers", () => {
  // A 600 mm cabinet with a 300 mm floor, stepped all the way down. Before the merge each shrink
  // fell through to `vacatedEmptySpace` and created a **new** strip: the second press could not
  // widen the first 50 mm strip because `evaluateEmptySpace` refused `remainder_below_floor` at a
  // remainder of 100. That floor now guards only a growth, which is the whole of the fix here —
  // returning space to a strip cannot make a sliver, it can only unmake one.
  function oneRun(): KitchenWorld {
    return syntheticWorld([
      placement("run-base", 1000, 0, "base-panbank", 600, 860),
    ]);
  }

  it("leaves a single 300 mm space where six 50 mm strips used to stand", () => {
    let world = oneRun();

    for (const widthMm of [550, 500, 450, 400, 350, 300]) {
      world = stepDown(world, "run-base", widthMm);
    }

    // The run is 600 at 1000, so it spans 700–1300; every shrink holds the left edge, and the
    // 300 mm it ends up giving back is one strip at 1000–1300, keyed on its centre.
    expect(emptySpans(world)).toEqual([["A|1.15", 300]]);
  });

  it("widens the same space on every press rather than adding one", () => {
    let world = oneRun();
    const counts: number[] = [];

    for (const widthMm of [550, 500, 450, 400, 350, 300]) {
      world = stepDown(world, "run-base", widthMm);
      counts.push(emptySpans(world).length);
    }

    expect(counts).toEqual([1, 1, 1, 1, 1, 1]);
  });
});

describe("two adjacent columns cleared entirely become one space", () => {
  // Backlog 2's own report, on the shipped kitchen. `A|1.30` is 800 mm and `A|2.00` is 600 mm, and
  // they abut at 1.70.
  it("gives one 1400 mm opening per level instead of an 800 beside a 600", () => {
    const world = createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);

    const cleared = clearBodies(world, [
      "p0",
      "p11",
      "p17",
      "p1",
      "p12",
      "p18",
    ]);

    expect(emptySpans(cleared)).toEqual([["A|1.60", 1400]]);
    expect(
      cleared.voids
        .filter((record) => record.col === "A|1.60")
        .map((record) => Math.round(record.w * 1000)),
    ).toEqual([1400, 1400, 1400]);
  });

  it("still caps every cabinet offered into it at 800 mm", () => {
    // The point of the merge, and the thing "merge two openings" makes it easy to assume wrongly:
    // the merged span is **not** a cabinet and never becomes one. What it buys is freedom over the
    // number and position of the cabinets in the span (ADR 0037), so the offers into a 1400 mm
    // opening are the ordinary ones and none of them is 1400 wide.
    const cleared = clearBodies(
      createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG),
      ["p0", "p11", "p17", "p1", "p12", "p18"],
    );
    const opening = cleared.voids.find((record) => record.col === "A|1.60");
    if (!opening) throw new Error("Expected the merged opening");

    const offers = offersFor({
      records: cleared.records,
      catalog: cleared.catalog,
      columns: cleared.columns,
      voids: cleared.voids,
      target: { kind: "void", id: opening.id },
    });

    const offered = offers.filter(
      (offer) => offer.verdict.status === "offered",
    );
    expect(offered.length).toBeGreaterThan(0);
    expect(
      offered.flatMap((offer) =>
        offer.widthRangesMm
          .filter((range) => range.maxMm > 800)
          .map((range) => `${offer.buildId}@${String(range.maxMm)}`),
      ),
    ).toEqual([]);
    expect(
      offered.flatMap((offer) =>
        offer.sizesMm
          .filter((widthMm) => widthMm > 800)
          .map((widthMm) => `${offer.buildId}@${String(widthMm)}`),
      ),
    ).toEqual([]);
  });
});

describe("emptiness is a fact about the whole column", () => {
  it("merges nothing when one cabinet is deleted at one level", () => {
    // ADR 0037's own boundary: the levels above and below `p11` are still occupied, so its space
    // stays inside `A|1.30` however empty the column next door is.
    const world = createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);

    const cleared = clearBodies(world, ["p1", "p12", "p18", "p11"]);

    expect(emptySpans(cleared)).toEqual([["A|2.00", 600]]);
    expect(cleared.voids.some((record) => record.col === "A|1.30")).toBe(true);
  });

  it("merges nothing across two columns that are not neighbours", () => {
    // `A|0.30` and `A|1.30` are separated by `A|0.75`, which is still standing. Adjacency is the
    // facing edges meeting, not "both empty on the same wall".
    const world = createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);

    const cleared = clearBodies(world, ["p8", "p15", "p0", "p11", "p17"]);

    expect(emptySpans(cleared)).toEqual([
      ["A|0.30", 600],
      ["A|1.30", 800],
    ]);
  });
});
