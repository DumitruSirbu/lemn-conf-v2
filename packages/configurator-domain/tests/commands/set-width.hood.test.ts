// ADR 0035 decision 6 as amended 2026-08-28 and again 2026-08-29, and ADR 0039 decision 4 — **the
// hood is exempt from *following* its column's width, and not from *constraining* it.**
//
// Two rules, and the second was missing until 2026-08-29. **A hood's centre is the centre of the run
// beneath it, and its width is its own** — and **a column holding a hood cannot be narrowed below
// that hood's width.** Wave 5D2b shipped the first without the second, and product-logic review
// measured what that costs: a 600 mm hood over a run shrunk to 550 re-centres 25 mm left and lands
// inside the cabinet beside it, 200 mm buried by the eighth step. Owner, 2026-08-29: *"if 600 is
// minimum for the hood, then is logic to set the minimum 600 mm, and grey out the −50mm button."*
//
// **Four rows below moved for that reason and are marked where they did.** Each of them shrank a run
// under a hood past the hood's own width, which is now the state the model cannot reach. It is sized to the cooktop it extracts over, not
// to the run it hangs on (owner: *"the cabinets is resizable but the hood over it should remain same
// size"*), and it re-centres rather than holding an edge (*"on resizing the cabinet is centered
// looking from front"*).
//
// **Every fixture here is synthetic, and it has to be.** The shipped kitchen's only hood is `p13` in
// `A|2.60`, and the `fixedWidth` hob base `p2` freezes that column outright — which is exactly why
// ADR 0035 decided this rather than leaving it to be discovered. The first resizable column with a
// hood in it would otherwise have stretched the hood without anyone deciding it should.
//
// The exemption is keyed off `EXTRACTOR_HOOD_KIND`, the `kind` the `hood` row and the seeded
// `hood-600` instance both declare. Deliberately **not** a new body kind and **not** a
// `PlacementRecord` flag: ADR 0038 deleted the standalone-accessory machinery and the owner asked
// for this *"without separating it again from cabinets"*. A hood is an ordinary placement in an
// ordinary column throughout every test below — `columnPlacementIds` names it, and it is rebuilt
// through the same path as its neighbours.
import { describe, expect, it } from "vitest";

import type { DesignPlacement } from "../../src/design.js";
import { columnWidthChoices } from "../../src/commands/set-width.js";
import { clearBodies, resizeTo } from "../support/commands.js";
import { syntheticWorld } from "../support/synthetic-world.js";
import type { KitchenWorld } from "../support/kitchen-world.js";

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

/** A resizable base cabinet with a hood over it, and an empty column **abutting** it on the right.
 *
 *  The base row is a pan bank rather than a hob base on purpose: the shipped hob base is
 *  `fixedWidth`, which is what makes this whole rule unreachable in the seeded kitchen. A hood over
 *  a resizable run is the case the decision is about.
 *
 *  The empty column is placed from the run's own right edge rather than at a fixed 1600, so the two
 *  abut at every run width the tests use. ADR 0031 funds a resize only from a column whose facing
 *  edge *meets* the run's; at a fixed position an 800 mm run would overlap it instead and the fixture
 *  would silently be testing a different funding path. */
function runUnderAHood(runWidthMm: number, hoodWidthMm: number): KitchenWorld {
  const emptyCentreMm = 1000 + runWidthMm / 2 + 300;
  return clearBodies(
    syntheticWorld([
      placement("run-base", 1000, 0, "base-panbank", runWidthMm, 860),
      placement("hood", 1000, 1500, "hood", hoodWidthMm, 710),
      placement("right-base", emptyCentreMm, 0, "base-panbank", 600, 860),
      placement("right-wall", emptyCentreMm, 1500, "open-shelf", 600, 700),
    ]),
    ["right-base", "right-wall"],
  );
}

function widthOf(
  design: { placements: readonly DesignPlacement[] },
  id: string,
) {
  return design.placements.find((entry) => entry.id === id)?.body.widthMm;
}

function alongOf(
  design: { placements: readonly DesignPlacement[] },
  id: string,
) {
  return design.placements.find((entry) => entry.id === id)?.alongMm;
}

describe("a hood keeps its width when the run under it is resized", () => {
  it("grows the cabinets and leaves the hood at the size it was", () => {
    const world = runUnderAHood(600, 600);

    const result = resizeTo(world, "run-base", 800);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(widthOf(result.design, "run-base")).toBe(800);
    expect(widthOf(result.design, "hood")).toBe(600);
  });

  it("shrinks them down to the hood's own width and still leaves the hood alone", () => {
    // **Moved 2026-08-29.** This shrank a 600 mm run under a 600 mm hood to 400 and asserted the
    // hood stayed 600 — which is precisely the overhang the owner's floor makes unreachable. The
    // rule it was pinning is unchanged, so the fixture starts at 800 and the shrink stops at the
    // hood's own width: the run narrows, the hood does not follow it down.
    const world = runUnderAHood(800, 600);

    const result = resizeTo(world, "run-base", 600);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(widthOf(result.design, "run-base")).toBe(600);
    expect(widthOf(result.design, "hood")).toBe(600);
  });

  it("re-centres it over the run rather than leaving it on an edge", () => {
    // The half of the rule that is easy to lose: the hood does not stay put. `run-base` is 600 at
    // 1000, so it spans 700–1300; growing it to 800 holds the left edge at 700 and puts its centre
    // at 1100. The hood follows to 1100 and keeps its 600, so it hangs 800–1400 — centred on the run
    // and overhanging it by 100 on each side, which is what a hood over a wider cooktop run does.
    const world = runUnderAHood(600, 600);

    const result = resizeTo(world, "run-base", 800);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(alongOf(result.design, "run-base")).toBe(1100);
    expect(alongOf(result.design, "hood")).toBe(1100);
  });

  it("names the hood among the placements the resize touched", () => {
    // It moved, so the scene has to rebuild it — and the effect is the only thing that says so.
    // This is also the assertion that would fail if the hood were ever lifted out of its column
    // into a separate kind of thing (ADR 0038, and the owner's "without separating it again").
    const world = runUnderAHood(600, 600);

    const result = resizeTo(world, "run-base", 800);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([...result.effect.columnPlacementIds].sort()).toEqual([
      "hood",
      "run-base",
    ]);
  });
});

describe("a hood floors the widths its column may take, and nothing else", () => {
  it("refuses to narrow its column below the hood's own width", () => {
    // **Moved 2026-08-29.** This asserted the opposite — a 600 mm run under a 600 mm hood accepted
    // at 300 — on the reading that a hood constrains nothing at all. The exemption is from
    // *following* the column's width; the floor is the half that was missing, and the 300 mm run
    // under a 600 mm hood is exactly the shape it exists to make unreachable.
    const world = runUnderAHood(600, 600);

    const result = resizeTo(world, "run-base", 300);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("WIDTH_NOT_SUPPORTED");
  });

  it("floors the column at the hood's standing width, not at the hood's catalogue floor", () => {
    // A hood is sized to the cooktop it extracts over, so the number that bounds the run is the one
    // the hood is standing at. A 700 mm hood floors its column at 700 even though the catalogue
    // would build a hood at 600 — and the chips say so before the tap does (ADR 0032).
    const world = runUnderAHood(750, 700);

    const choices = columnWidthChoices({
      design: world.design,
      catalog: world.catalog,
      target: { kind: "placement", id: "run-base" },
    });

    expect(choices?.sizesMm.filter((widthMm) => widthMm < 700)).toEqual([]);
    expect(choices?.sizesMm[0]).toBe(700);
  });

  it("does not make its column 'unaligned' by standing at a different width", () => {
    // **Moved 2026-08-29.** The pair was a 600 mm run under an 800 mm hood taken to 650, which the
    // floor now refuses — and rightly, since that run was already 200 mm narrower than the hood
    // hanging on it. A 700 mm hood over a run *growing* to 750 makes the same point with the floor
    // respected: the column holds a 750 and a 700 under one key, which is precisely the shape
    // `COLUMN_MEMBERS_UNALIGNED` used to refuse, and nothing needs squaring up because the hood is
    // *supposed* to differ.
    const world = runUnderAHood(600, 700);

    const result = resizeTo(world, "run-base", 750);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(widthOf(result.design, "run-base")).toBe(750);
    expect(widthOf(result.design, "hood")).toBe(700);
  });

  it("is not squared up when the rest of the column is", () => {
    // Both rules in one move: a genuinely mixed column — a 600 base with a 400 shelf on top — and a
    // 700 hood between them. The two cabinets are brought to one width; the hood is not.
    //
    // **Moved 2026-08-29.** The target was 500, below the 700 mm hood's floor. 750 is above it and
    // squares the same two members up.
    const world = clearBodies(
      syntheticWorld([
        placement("run-base", 1000, 0, "base-panbank", 600, 860),
        placement("hood", 1000, 1400, "hood", 700, 710),
        placement("run-top", 1000, 2200, "open-shelf", 400, 400),
        placement("right-base", 1600, 0, "base-panbank", 600, 860),
        placement("right-wall", 1600, 1500, "open-shelf", 600, 700),
      ]),
      ["right-base", "right-wall"],
    );

    const result = resizeTo(world, "run-base", 750);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(widthOf(result.design, "run-base")).toBe(750);
    expect(widthOf(result.design, "run-top")).toBe(750);
    expect(widthOf(result.design, "hood")).toBe(700);
    // And all three share the run's new centre, hood included: the exemption is from the width, not
    // from the move.
    const centre = alongOf(result.design, "run-base");
    expect(alongOf(result.design, "run-top")).toBe(centre);
    expect(alongOf(result.design, "hood")).toBe(centre);
  });

  it("leaves the hood inside the run it hangs on at every width the floor allows", () => {
    // The invariant the floor buys, stated as the geometry rather than as a refusal code: a run
    // never ends up narrower than its hood, so the hood never reaches past the run's own edges into
    // whatever is standing beside it. Swept over every width the column offers.
    const world = runUnderAHood(800, 600);

    const choices = columnWidthChoices({
      design: world.design,
      catalog: world.catalog,
      target: { kind: "placement", id: "run-base" },
    });

    const overhanging = (choices?.sizesMm ?? []).filter((widthMm) => {
      const result = resizeTo(world, "run-base", widthMm);
      return result.ok && widthMm < 600;
    });
    expect(overhanging).toEqual([]);
  });
});

describe("selecting the hood itself is out of the exemption, and out of this wave", () => {
  // **A gap in the record, pinned rather than filled.** ADR 0035 decision 6 and ADR 0039 decision 4
  // both describe what happens to a hood when the *cabinets* are resized. Decision 5 says the hood's
  // own width is "chosen directly, within its 600–800 bound" and says nothing about what the run
  // beneath it should do when that happens — most likely nothing, but "most likely" is not a
  // decision, and the effect shape ADR 0031 defines (an empty column that funds the move, the key it
  // held, the width it was left at) has no honest answer for a body that spends no space.
  //
  // So the selected body is a full member of its column, hood or not, and this path is exactly what
  // it was before this wave. Nothing reachable depends on it: the shipped `hood-600` is
  // `fixedWidth`, so `p13` refuses `NOT_RESIZABLE` today and after. This row exists so the choice is
  // visible and fails loudly the day it is decided the other way.
  it("resizes the whole column, as it did before the exemption", () => {
    const world = runUnderAHood(600, 600);

    const result = resizeTo(world, "hood", 800);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(widthOf(result.design, "hood")).toBe(800);
    expect(widthOf(result.design, "run-base")).toBe(800);
    expect([...result.effect.columnPlacementIds].sort()).toEqual([
      "hood",
      "run-base",
    ]);
  });

  it("is bounded by the intersection its own 600–800 bound produces", () => {
    // With the hood selected it *is* a member, so 300 is refused by the column rather than offered
    // and then rebuilt — which is the same sentence a customer would read either way.
    const world = runUnderAHood(600, 600);

    const refused = resizeTo(world, "hood", 300);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.reason.code).toBe("WIDTH_NOT_SUPPORTED");
  });
});
