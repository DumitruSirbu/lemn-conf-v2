// ADR 0035 decision 6 as amended 2026-08-28, and ADR 0039 decision 4 — **the hood is exempt from
// its column's width.**
//
// One rule, stated once, and every case below is a reading of it: **a hood's centre is the centre of
// the run beneath it, and its width is its own.** It is sized to the cooktop it extracts over, not
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

/** A resizable base cabinet with a hood over it, and an empty column to its right.
 *
 *  The base row is a pan bank rather than a hob base on purpose: the shipped hob base is
 *  `fixedWidth`, which is what makes this whole rule unreachable in the seeded kitchen. A hood over
 *  a resizable run is the case the decision is about. */
function runUnderAHood(runWidthMm: number, hoodWidthMm: number): KitchenWorld {
  return clearBodies(
    syntheticWorld([
      placement("run-base", 1000, 0, "base-panbank", runWidthMm, 860),
      placement("hood", 1000, 1500, "hood", hoodWidthMm, 710),
      placement("right-base", 1600, 0, "base-panbank", 600, 860),
      placement("right-wall", 1600, 1500, "open-shelf", 600, 700),
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

  it("shrinks them and still leaves the hood alone", () => {
    // The direction ADR 0035 decision 7 opened. Without it the empty column on the right would be
    // the only funding, and this move takes the other path — the run vacates 200 mm of its own.
    const world = runUnderAHood(600, 600);

    const result = resizeTo(world, "run-base", 400);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(widthOf(result.design, "run-base")).toBe(400);
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

describe("a hood does not narrow the widths its column may take", () => {
  it("lets the run reach widths the hood's own 600–800 bound excludes", () => {
    // The hood is bounded 600–800 (ADR 0035 decision 5). A 300 mm pan bank under it is a width the
    // hood is not made at, and before the exemption the intersection would have refused it — the
    // column would have been 600–800 because the hood was in it.
    const world = runUnderAHood(600, 600);

    const result = resizeTo(world, "run-base", 300);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(widthOf(result.design, "run-base")).toBe(300);
    expect(widthOf(result.design, "hood")).toBe(600);
  });

  it("does not make its column 'unaligned' by standing at a different width", () => {
    // The column holds a 600 and an 800 under one key, which is precisely the shape
    // `COLUMN_MEMBERS_UNALIGNED` used to refuse — and it is not a mixed-width column at all, because
    // the hood is not a member for width purposes. Nothing needs squaring up here; the hood is
    // *supposed* to differ.
    const world = runUnderAHood(600, 800);

    const result = resizeTo(world, "run-base", 650);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(widthOf(result.design, "run-base")).toBe(650);
    expect(widthOf(result.design, "hood")).toBe(800);
  });

  it("is not squared up when the rest of the column is", () => {
    // Both rules in one move: a genuinely mixed column — a 600 base with a 400 shelf on top — and a
    // 700 hood between them. The two cabinets are brought to 500; the hood is not.
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

    const result = resizeTo(world, "run-base", 500);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(widthOf(result.design, "run-base")).toBe(500);
    expect(widthOf(result.design, "run-top")).toBe(500);
    expect(widthOf(result.design, "hood")).toBe(700);
    // And all three share the run's new centre, hood included: the exemption is from the width, not
    // from the move.
    const centre = alongOf(result.design, "run-base");
    expect(alongOf(result.design, "run-top")).toBe(centre);
    expect(alongOf(result.design, "hood")).toBe(centre);
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
