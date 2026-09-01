// ADR 0035 decision 7 — **shrinking a column creates the adjacent empty space it needs.**
//
// ADR 0031 funded a resize from an empty column that was already there, in both directions, and
// recorded the consequence: the shipped kitchen loads with no empty column, so **nothing was
// resizable until the customer deleted something first**. Width editing was a second step of
// deleting. ADR 0031's own correction had already conceded the ground — it called creating a column
// "not representable", then noted in the next paragraph that `moveFrozenColumns` synthesises one at
// a derived key on every legal resize. Decision 7 spends exactly that machinery.
//
// The tests below are about the **column that appears**, which nothing else in the suite looks at
// directly: where it sits, how wide it is, what key it takes, what it inherits, and the two cases
// where it must not be created at all.
import { describe, expect, it } from "vitest";

import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { clearBodies, resizeTo } from "../support/commands.js";
import { createWorld, type KitchenWorld } from "../support/kitchen-world.js";
import { pairWithEmptyColumnRight } from "../support/empty-column-pair.js";

function kitchen(): KitchenWorld {
  return createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);
}

/** A column's extent in millimetres, read off the frozen map the resize returns. */
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

describe("a shrink with no empty column anywhere", () => {
  // `A|3.20` is `p4`, `p14` and `p20`, all 600 mm and all cabinetry, at the far end of wall A. The
  // shipped kitchen abuts it with `A|2.60` on one side and the wall on the other, and derives no
  // void at all — so before decision 7 every chip on all three bodies was `NO_EMPTY_SPACE`.
  it("is accepted on a kitchen nobody has edited", () => {
    const result = resizeTo(kitchen(), "p4", 500);

    expect(result.ok).toBe(true);
  });

  it("holds the run's far edge and takes the space off the near one", () => {
    // `A|3.20` spans 2900–3500. Narrowing to 500 holds the left edge at 2900 — the boundary with
    // `A|2.60`, which nobody asked to move — and the run finishes at 3400. The 100 mm between 3400
    // and 3500 is the new empty column, and the two extents still meet exactly where the run's did.
    const result = resizeTo(kitchen(), "p4", 500);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const id of ["p4", "p14", "p20"]) {
      const placement = result.design.placements.find(
        (entry) => entry.id === id,
      );
      expect([id, placement?.body.widthMm, placement?.alongMm]).toEqual([
        id,
        500,
        3150,
      ]);
    }
    expect(extentMm(result.effect.columns, "A|3.15")).toEqual([2900, 3400]);
    expect(extentMm(result.effect.columns, "A|3.45")).toEqual([3400, 3500]);
  });

  it("reports the new column in the effect, at the key it was entered under", () => {
    // The effect's `emptyColumn*` fields were written for ADR 0031's *existing* column and carry a
    // created one unchanged: the key it "had before the move" is the resized column's own, because
    // that is the column the strip came out of.
    const result = resizeTo(kitchen(), "p4", 500);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effect.emptyColumnKey).toBe("A|3.20");
    expect(result.effect.emptyColumnNewKey).toBe("A|3.45");
    expect(result.effect.emptyColumnWidthMm).toBe(100);
  });

  it("inherits the frozen facts of the column it came out of", () => {
    // ADR 0011 Gap D: a column carries `regions`, `top`, `d` and `ry` from load time, and a strip
    // entered into the map without them would be a column §4 could derive nothing sensible over.
    // The strip was this column's, so it takes this column's.
    const result = resizeTo(kitchen(), "p4", 500);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const before = kitchen().columns.get("A|3.20");
    const created = result.effect.columns.get("A|3.45");
    expect(created?.regions).toEqual(before?.regions);
    expect(created?.top).toBe(before?.top);
    expect(created?.d).toBe(before?.d);
    expect(created?.ry).toBe(before?.ry);
  });

  it("conserves the run total, so the created space is the space that was vacated", () => {
    const before = kitchen();
    const result = resizeTo(before, "p4", 500);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const totalOf = (
      columns: ReadonlyMap<
        string,
        { readonly wall: string; readonly w: number }
      >,
    ): number =>
      [...columns.values()]
        .filter((column) => column.wall === "A")
        .reduce((sum, column) => sum + Math.round(column.w * 1000), 0);
    expect(totalOf(result.effect.columns)).toBe(totalOf(before.columns));
  });

  it("creates a sliver no floor refuses any more (ADR 0043)", () => {
    // A 50 mm step creates a 50 mm opening. ADR 0031's "a remainder below `MIN_W` refuses" was about
    // a **growth** consuming space that already exists and never bound this path; ADR 0043 has since
    // removed it there too, so no floor stands between a step and the strip it leaves. The owner:
    // "Empty space can be even 100 mm or 50 mm, if somebody want to keep it."
    const result = resizeTo(kitchen(), "p4", 550);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effect.emptyColumnWidthMm).toBe(50);
  });
});

describe("an existing empty column is spent before a new one is made", () => {
  it("widens the neighbour rather than splitting a strip off beside it", () => {
    // ADR 0031 rule 3 is unchanged and still comes first: a shrink **returns** width to the empty
    // column beside it, and only when neither side has one does decision 7 make a new one. That
    // order is what keeps a column stepped down and back up from leaving a trail of slivers beside a
    // widened opening.
    //
    // Clearing `A|2.00` puts a real 600 mm empty column immediately right of `A|1.30`, so narrowing
    // the 800 mm sink run by 200 has somewhere to go without creating anything.
    const world = clearBodies(kitchen(), ["p1", "p12", "p18"]);

    const result = resizeTo(world, "p0", 600);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The existing empty column grew from 600 to 800, and no third column appeared: the resized
    // column and the empty one are the only two keys that moved.
    expect(result.effect.emptyColumnWidthMm).toBe(800);
    expect(result.effect.emptyColumnKey).toBe("A|2.00");
  });
});

describe("a shrink that has nowhere to put the space is refused", () => {
  it("refuses when the vacated strip's key is one the map already holds", () => {
    // Measured on the shipped kitchen, and the reason the guard exists. `A|0.30` is `p8` and `p15`,
    // 600 mm wide over 0–600. Narrowing to 300 vacates 300–600, whose centre keys as **`A|0.45`** —
    // the corner leg `p25`'s own column, 900 mm wide and spanning the whole of it. §3.2's columns may
    // overlap along the wall, so the strip is legal geometry; writing it into the map is not, because
    // it would replace the corner's frozen 900 mm extent with a 300 mm one and take ADR 0011 Gap D's
    // regions with it.
    //
    // Refused rather than merged or nudged: merging into an occupied key is M5's own *Not
    // established* question, and nudging would put the empty column somewhere the cabinets did not
    // vacate.
    expect(kitchen().columns.has("A|0.45")).toBe(true);

    const result = resizeTo(kitchen(), "p8", 300);

    expect(result.ok).toBe(false);
    // `COLUMN_KEY_COLLISION`, not `NO_EMPTY_SPACE`: the space *is* there. One guard answers this
    // now, and it answers with where the strip would land (clean-code review R3.5).
    if (!result.ok) expect(result.reason.code).toBe("COLUMN_KEY_COLLISION");
  });

  it("accepts the same shrink once a real empty column is beside it", () => {
    // The other half of the finding: nothing is wrong with the *width*, only with where the space
    // would have to go. Clear `A|0.75` and the 300 mm goes back into a column that already exists,
    // so no strip is created and no key collides.
    const world = clearBodies(kitchen(), ["p10", "p16"]);

    const result = resizeTo(world, "p8", 300);

    expect(result.ok).toBe(true);
  });
});

describe("growth still consumes space that is already there", () => {
  it("refuses on a kitchen at load, naming both sides absent", () => {
    // The half of ADR 0031's consequence decision 7 leaves standing, and the anti-invariant for the
    // whole feature: a shrink may make space, a growth may not. ADR 0043 removes the *remainder*
    // floor, not this — a growth with no empty column on either side is still refused.
    const result = resizeTo(kitchen(), "p10", 350);

    expect(result.ok).toBe(false);
    if (result.ok || result.reason.code !== "NO_EMPTY_SPACE") {
      expect.unreachable("expected NO_EMPTY_SPACE");
    }
    expect(result.reason.params.sides).toEqual([
      { side: "right", reason: "absent" },
      { side: "left", reason: "absent" },
    ]);
  });

  it("consumes the column a shrink just created, when the customer steps back up", () => {
    // The round trip, which is what makes the stepper usable: shrink, then grow back into exactly
    // the space that shrink left. The run returns to where it started and the created column is
    // consumed to zero and removed (ADR 0031 rule 6).
    const world = kitchen();
    const shrunk = resizeTo(world, "p4", 500);
    expect(shrunk.ok).toBe(true);
    if (!shrunk.ok) return;

    const stepped = createWorld(shrunk.design, world.catalog);
    const grown = resizeTo(
      { ...stepped, columns: shrunk.effect.columns },
      "p4",
      600,
    );

    expect(grown.ok).toBe(true);
    if (!grown.ok) return;
    for (const id of ["p4", "p14", "p20"]) {
      const placement = grown.design.placements.find(
        (entry) => entry.id === id,
      );
      expect([id, placement?.body.widthMm, placement?.alongMm]).toEqual([
        id,
        600,
        3200,
      ]);
    }
    expect(grown.effect.emptyColumnWidthMm).toBe(0);
    expect(grown.effect.columns.has("A|3.45")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ADR 0043 — an empty space of any width is a legal state, so a growth has no remainder floor.
//
// The owner, 2026-09-01: "Empty space can be even 100 mm or 50 mm, if somebody want to keep it. Such
// narrow empty space will force user to resize accordingly and not leave such spaces." That
// supersedes ADR 0031's "a remainder below `MIN_W` refuses", and what it fixes is a stepper that
// stepped down and could not step back up.
// ---------------------------------------------------------------------------

/** One `setWidth`, carrying the frozen column map forward the way the store does — which is the only
 *  way a second step sees the strip the first one made. */
function stepTo(
  world: KitchenWorld,
  id: string,
  widthMm: number,
): KitchenWorld {
  const result = resizeTo(world, id, widthMm);
  if (!result.ok) {
    throw new Error(
      `step to ${String(widthMm)} refused: ${result.reason.code}`,
    );
  }
  return {
    ...createWorld(result.design, world.catalog),
    columns: result.effect.columns,
  };
}

/** Every column extent on wall A, keyed and in millimetres — the map a leftover strip shows up in. */
function wallAExtents(
  columns: ReadonlyMap<
    string,
    { readonly wall: string; readonly x: number; readonly w: number }
  >,
): Record<string, number> {
  const extents: Record<string, number> = {};
  for (const [key, column] of columns) {
    if (column.wall === "A") extents[key] = Math.round(column.w * 1000);
  }
  return extents;
}

describe("the stepper is reversible at every rung", () => {
  // `A|3.20` is `p4`, `p14` and `p20` at 600 mm, the run decision 7's own tests step down. Before
  // ADR 0043 only the **first** rung came back: 600 → 550 leaves a 50 mm strip that `+50` consumes
  // exactly to zero, but 550 → 500 leaves 100 and `+50` from there would leave 50, which
  // `remainder_below_floor` refused. Every rung below the first was a one-way trip, and this is the
  // test that would have caught it.
  const RUNGS = [600, 550, 500, 450, 400, 350] as const;

  it.each(RUNGS)("returns to %i mm after a -50 followed by a +50", (rungMm) => {
    let world = kitchen();
    for (let widthMm = 600; widthMm > rungMm; widthMm -= 50) {
      world = stepTo(world, "p4", widthMm - 50);
    }
    const before = wallAExtents(world.columns);

    const narrower = stepTo(world, "p4", rungMm - 50);
    const restored = stepTo(narrower, "p4", rungMm);

    for (const id of ["p4", "p14", "p20"]) {
      const placement = restored.design.placements.find(
        (entry) => entry.id === id,
      );
      expect([id, placement?.body.widthMm]).toEqual([id, rungMm]);
    }
    // The whole point: no strip is left behind. The map after the round trip is the map before it,
    // key for key and millimetre for millimetre.
    expect(wallAExtents(restored.columns)).toEqual(before);
  });
});

describe("a growth may leave a remainder of any width", () => {
  // Boundary rows against the superseded floor, so the supersession reads as a decision rather than
  // as a slip: 300 is the floor itself, 298 and 50 are under it, and 2 is the narrowest gap the
  // engine can be asked to leave. The fixture is shared with the wave's QA suite — see
  // `tests/support/empty-column-pair.ts` for why it is synthetic and why its members are 860 mm.
  //
  // **2 rather than 1, and 298 rather than 299, and both are the geometry rather than a rounding
  // choice.** A placement's `alongMm` is a whole millimetre, so a body spans `centre ± width / 2`
  // and a column of odd width would have half-millimetre edges — which `evaluateEmptySpace` refuses
  // as `absent`, because an extent off the millimetre grid cannot be moved onto it either. An odd
  // remainder therefore needs an odd *target*, and `setWidth` refuses one of those
  // `WIDTH_NOT_SUPPORTED` before it ever looks at the space. 1 mm is unreachable by construction,
  // not by this decision.
  it.each([
    { emptyMm: 202, targetMm: 800, remainderMm: 2 },
    { emptyMm: 250, targetMm: 800, remainderMm: 50 },
    { emptyMm: 498, targetMm: 800, remainderMm: 298 },
    { emptyMm: 500, targetMm: 800, remainderMm: 300 },
  ])(
    "grows into a $emptyMm mm space and leaves $remainderMm mm",
    ({ emptyMm, targetMm, remainderMm }) => {
      const world = pairWithEmptyColumnRight(emptyMm);

      const result = resizeTo(world, "L-base", targetMm);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.effect.emptyColumnWidthMm).toBe(remainderMm);
    },
  );

  it("still refuses a growth larger than the space that is there", () => {
    // The one arithmetic bound ADR 0043 leaves on a growth: `remainderMm < 0`.
    const world = pairWithEmptyColumnRight(100);

    const result = resizeTo(world, "L-base", 800);

    expect(result.ok).toBe(false);
    if (result.ok || result.reason.code !== "NO_EMPTY_SPACE") {
      expect.unreachable("expected NO_EMPTY_SPACE");
    }
    expect(result.reason.params.sides[0]).toEqual({
      side: "right",
      reason: "too_narrow",
    });
  });
});
