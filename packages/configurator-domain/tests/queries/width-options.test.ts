// §9's width chips, and the one property M4 deliberately refused to promise: **a chip is free if
// and only if `setWidth` at that width would succeed.**
//
// The panel's own tests prove that it relabels a verdict correctly. What has to be proved here is
// that the verdict is the command's — that this query is not a second opinion. So every assertion
// below runs `setWidth` itself, independently, and compares. A query that modelled the answer
// instead of asking for it would drift from the command exactly the way ADRs 0016, 0017, 0029 and
// 0032 each record.
import { describe, expect, it } from "vitest";

import { columnWidthChoices, setWidth } from "../../src/commands/set-width.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import {
  widthOptionsFor,
  type WidthOption,
} from "../../src/queries/width-options.js";
import { widthStepsFor } from "../../src/queries/width-steps.js";
import { resolveBuildableSizes } from "../../src/catalog.js";
import type { BodyCatalog } from "../../src/void-engine.js";
import { clearBodies, OCCURRED_AT } from "../support/commands.js";
import { createFakeProbe } from "../support/fake-probe.js";
import { createWorld, type KitchenWorld } from "../support/kitchen-world.js";
import { columnWorld } from "../support/synthetic-world.js";
import { CABINETRY_CHIPS_MM } from "../support/width-model.js";

function kitchen(): KitchenWorld {
  return createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);
}

/** The shipped kitchen with `A|2.00` emptied through the real delete. ADR 0031 funds a resize from
 *  an adjacent column that is empty at **every** level, and the shipped kitchen has none at load, so
 *  this is the only fixture in which any chip can be free at all. */
function kitchenWithEmptyColumn(): KitchenWorld {
  return clearBodies(kitchen(), ["p1", "p12", "p18"]);
}

/** The placement id the disjoint-column fixture gives its bottle cargo. */
const DISJOINT_CARGO_ID = "cargo-under-hood";

/** A `base-bottle-cargo` (200/300, ADR 0026's declared floor) under a wall body bounded 500–800.
 *
 *  **The hood used to be the other half of this pair, and it cannot be any more.** ADR 0035 decision
 *  6 as amended took the hood out of a column's width membership, so a hood constrains nothing and a
 *  cargo-under-hood column agrees about everything. The domain's adversarial pass sweeps every base
 *  row under every wall row and finds **no disjoint pair left in the shipped catalogue at all**
 *  (`qa-w5c.adversarial.test.ts`).
 *
 *  ADR 0032's branch is still real code and still has to be exercised, so the second member is a
 *  **synthetic** catalogue entry rather than a shipped one: a wall cabinet whose bound opens at 500,
 *  which shares nothing with the cargo's {200, 300}. Synthetic on purpose — pinning this branch to
 *  a shipped row is what let it quietly stop being tested when the hood changed. It failed loudly
 *  here instead, which is the arrangement working.
 *
 *  Both stand at 300 on purpose: at their natural widths the column would also be mixed-width, and
 *  the square-up would be doing the work instead of the resolution. Built by hand rather than
 *  through inserts, because what is under test is the resolution and not the insert path. */
const DISJOINT_WALL_BUILD_ID = "test-wall-500-800";

function disjointCatalog(): BodyCatalog {
  const wall = KITCHEN_L_BODY_CATALOG.get("wall-cabinet");
  if (!wall) throw new Error("no wall-cabinet entry");
  return new Map(KITCHEN_L_BODY_CATALOG).set(DISJOINT_WALL_BUILD_ID, {
    ...wall,
    widthRangesMm: [{ minMm: 500, maxMm: 800 }],
    sizesMm: [500, 550, 600, 650, 700, 750, 800],
  });
}

function disjointColumnWorld(): KitchenWorld {
  const design = {
    ...KITCHEN_L_DESIGN,
    placements: [
      {
        id: DISJOINT_CARGO_ID,
        wall: "A" as const,
        alongMm: 5000,
        y0Mm: 0,
        body: { buildId: "base-bottle-cargo", widthMm: 300, heightMm: 850 },
      },
      {
        id: "wall-over-cargo",
        wall: "A" as const,
        alongMm: 5000,
        y0Mm: 1500,
        body: { buildId: DISJOINT_WALL_BUILD_ID, widthMm: 300, heightMm: 700 },
      },
    ],
  };
  return createWorld(design, disjointCatalog());
}

function optionsFor(world: KitchenWorld, placementId: string): WidthOption[] {
  return widthOptionsFor({
    design: world.design,
    catalog: world.catalog,
    columns: world.columns,
    target: { kind: "placement", id: placementId },
    probe: createFakeProbe(),
  });
}

/** The command's own answer for one width, asked independently of the query. */
function commandAccepts(
  world: KitchenWorld,
  placementId: string,
  widthMm: number,
): boolean {
  return setWidth({
    design: world.design,
    catalog: world.catalog,
    columns: world.columns,
    target: { kind: "placement", id: placementId },
    widthMm,
    probe: createFakeProbe(),
    occurredAt: OCCURRED_AT,
  }).ok;
}

function widthsOf(options: readonly WidthOption[]): number[] {
  return options.map((option) => option.widthMm);
}

describe("a chip is free if and only if the command would succeed", () => {
  // The property, over a fixture where both answers occur. Asserted against `setWidth` run again
  // rather than against a written-down list, so the day a guard changes the two move together or
  // this fails — which is the whole reason the query runs the command instead of modelling it.
  it("agrees with setWidth on every candidate, in a kitchen with somewhere to grow", () => {
    const world = kitchenWithEmptyColumn();
    let compared = 0;
    for (const record of world.records) {
      for (const option of optionsFor(world, record.id)) {
        if (option.verdict.status === "current") continue;
        expect([record.id, option.widthMm, option.verdict.status]).toEqual([
          record.id,
          option.widthMm,
          commandAccepts(world, record.id, option.widthMm)
            ? "available"
            : "refused",
        ]);
        compared += 1;
      }
    }
    // The guard against a sweep that quietly stops iterating: a zero-comparison run would report
    // green on a query that returned nothing at all.
    expect(compared).toBeGreaterThan(20);
  });

  // The direction that matters most, stated on its own: something must actually be reachable, or
  // the property above holds vacuously and §9's `free` state is unreachable in production.
  it("finds at least one reachable width beside the emptied column", () => {
    const world = kitchenWithEmptyColumn();
    const reachable = world.records.flatMap((record) =>
      optionsFor(world, record.id)
        .filter((option) => option.verdict.status === "available")
        .map((option) => `${record.id}@${String(option.widthMm)}`),
    );
    expect(reachable.length).toBeGreaterThan(0);
  });

  // The mirror image, and the measurement wave 5E depends on. It used to read *nothing* is reachable
  // in the shipped kitchen, because ADR 0031 funded every resize from an existing empty column and
  // the kitchen loads without one. **ADR 0035 decision 7 halved that**: a shrink funds itself, so
  // what is unreachable at load is exactly the growths.
  //
  // Asserted as the sign rather than as a list, because the sign is the rule — a growth has space to
  // consume or it does not, and at load it does not.
  it("offers no width above a body's own in the shipped kitchen, which has no empty column", () => {
    const world = kitchen();
    let available = 0;
    for (const record of world.records) {
      for (const option of optionsFor(world, record.id)) {
        if (option.verdict.status !== "available") continue;
        available += 1;
        expect([record.id, option.widthMm < record.widthMm]).toEqual([
          record.id,
          true,
        ]);
      }
    }
    // And the sweep is not vacuous: shrinking really is reachable from a standing start now.
    expect(available).toBeGreaterThan(0);
  });
});

describe("the current width is a fact about the body, not a refusal code", () => {
  // §9 assumes exactly one `active` chip and puts the same number in the section's value label. If
  // `current` were read out of `WIDTH_UNCHANGED`, a column that refuses before it looks at the
  // requested width would have no active chip at all — `p19` and every body in a column holding an
  // immovable member reach exactly that path.
  it("marks exactly one option current, on every body that renders any", () => {
    const world = kitchen();
    let bodies = 0;
    for (const record of world.records) {
      const options = optionsFor(world, record.id);
      if (options.length === 0) continue;
      const current = options.filter(
        (option) => option.verdict.status === "current",
      );
      expect([record.id, current.map((option) => option.widthMm)]).toEqual([
        record.id,
        [record.widthMm],
      ]);
      bodies += 1;
    }
    // The seventeen bodies §9 renders a width section for. A `fixedWidth` body resolves a perfectly
    // good set and is still excluded here rather than at the panel, so the flag is not the only
    // thing standing between the customer and a section of dead controls.
    expect(bodies).toBe(17);
  });

  // The same claim where it is load-bearing, **corrected after QA measured it**: the first version
  // of this comment said `A|2.60` holds `p19` alone and refuses for want of empty space. Both halves
  // were wrong. The column also holds `p2` (the hob base) and `p13` (the hood), both `fixedWidth`,
  // so every width is refused `COLUMN_MEMBER_NOT_RESIZABLE` naming *Corp plită și 2 sertare* —
  // decided before the requested width is read and long before any side is scanned for space.
  //
  // That makes the case stronger than claimed, not weaker: this is exactly the path where reading
  // `active` out of `WIDTH_UNCHANGED` would leave §9's section with no active chip, because the
  // command never reaches the width check at all.
  it("keeps the active chip on a column that refuses every width", () => {
    const options = optionsFor(kitchen(), "p19");
    expect(commandAccepts(kitchen(), "p19", 600)).toBe(false);
    expect(
      options.find((option) => option.verdict.status === "current")?.widthMm,
    ).toBe(600);
  });
});

describe("the candidate widths are the column's, not the selected body's", () => {
  // ADR 0031 resizes a column, so the row is the intersection of its members' sets. `A|2.00` holds
  // the 450/600 dishwasher under an open shelf and a wall cabinet, both cabinetry: the dishwasher's
  // discrete bound is what narrows eleven and thirteen chips down to two.
  //
  // **§11 row 14 restored, and the row that used to read `[600]`.** "Dishwasher niche: only 450 /
  // 600" was true of the entry and false of the column, because ADR 0030's 400 mm one-door cap put
  // 450 in a hole the `wall-cabinet` above could not be built in. The owner retired that cap on
  // 2026-08-28 — "let's add this 450 for one door" — and the intersection now carries both of the
  // niche's widths, which is the case ADR 0034 was written around.
  it("narrows to what every member of the column accepts", () => {
    const world = kitchen();
    expect(resolveBuildableSizes(world.catalog, "base-dishwasher-600")).toEqual(
      [450, 600],
    );
    expect(widthsOf(optionsFor(world, "p1"))).toEqual([450, 600]);
    // 800 is the anti-invariant: the shelf and the cabinet above reach it and the niche does not,
    // so the intersection is doing work rather than passing everything through.
    expect(commandAccepts(world, "p1", 800)).toBe(false);
  });

  // ADR 0031 rule 5's second sentence — a `'fit'` member "does not narrow the intersection" — was
  // the ladder's, and ADR 0035 decision 2 retired it with the ladder. **Every member bounds now**,
  // and `A|3.20` is where that is visible: the three-drawer base's own 300 mm floor keeps 200 and
  // 250 off a row whose hinged wall members reach down to 200 on their own.
  //
  // Nothing in the middle is missing any more. This row read `[…400, 500…]` while ADR 0030's cap
  // stood; closing that hole is what puts 450 back, here and in the dishwasher column above.
  it("narrows the row by every member's bound, not only the declared sets", () => {
    const world = kitchen();
    expect(resolveBuildableSizes(world.catalog, "base-drawer3-600")).toEqual(
      CABINETRY_CHIPS_MM,
    );
    expect(widthsOf(optionsFor(world, "p4"))).toEqual(CABINETRY_CHIPS_MM);
    // The bound that is doing the narrowing, named: the wall members offer 200 and 250 and the base
    // does not, so the row starts at §2's default rather than at the hinged rows' declared 200.
    expect(resolveBuildableSizes(world.catalog, "wall-2door-600")).toContain(
      200,
    );
  });

  // A `widthFlex: 'fit'` body built to its opening can sit at a width no set contains. §9 gives a
  // chip three states and assumes the current width is one of them, so its own width joins the row —
  // sorted into it, not appended.
  //
  // **Off the shipped fixture on purpose, and that is ADR 0035's doing.** `p24` demonstrated this
  // at 700 while the chips were `[200, 300, 400, 600, 800]`; the 50 mm step makes 700 a chip, and
  // every non-structural body the fixture ships now stands on the grid. 570 is the width ADR 0035
  // decision 1 names as the reason stepping is **relative** rather than snapped — the corner return
  // — so it is the width this case is built at.
  it("folds a fit body's own width into the row, in order", () => {
    const world = columnWorld(1000, [
      {
        id: "off-grid",
        y0Mm: 1500,
        heightMm: 700,
        buildId: "wall-2door-600",
        widthMm: 570,
      },
    ]);
    const widths = widthsOf(optionsFor(world, "off-grid"));
    expect(widths).toContain(570);
    expect(widths).toEqual([...widths].sort((left, right) => left - right));
    expect(
      optionsFor(world, "off-grid").find(
        (option) => option.verdict.status === "current",
      )?.widthMm,
    ).toBe(570);
  });

  it("is ascending and duplicate-free everywhere in the kitchen", () => {
    const world = kitchen();
    for (const record of world.records) {
      const widths = widthsOf(optionsFor(world, record.id));
      expect([record.id, widths]).toEqual([
        record.id,
        [...widths].sort((left, right) => left - right),
      ]);
      expect([record.id, new Set(widths).size]).toEqual([
        record.id,
        widths.length,
      ]);
    }
  });
});

describe("a column that cannot agree on a width still explains itself", () => {
  // **Logic review L2.** Two ways a column fails to agree, and they used to answer differently.
  // `p19`'s column holds an immovable hob base, and it renders five chips each carrying
  // `COLUMN_MEMBER_NOT_RESIZABLE`. A column whose members are all perfectly resizable but whose sets
  // are **disjoint** returned nothing at all: no section, no sentence, and a `WIDTH_NOT_SUPPORTED`
  // the engine had already computed thrown away — ADR 0032's defect ("removed rather than
  // disabled-with-reason") reappearing in the one section that wave was meant to fix.
  it("renders chips with reasons when the members' sets do not intersect", () => {
    const world = disjointColumnWorld();
    const options = optionsFor(world, DISJOINT_CARGO_ID);

    expect(options.length).toBeGreaterThan(0);
    // The selected body's own widths, since the column agrees on none of them.
    expect(widthsOf(options)).toEqual(
      resolveBuildableSizes(world.catalog, "base-bottle-cargo"),
    );
    // The reason the old branch threw away, now on the chip.
    expect(
      options
        .filter((option) => option.verdict.status === "refused")
        .map((option) =>
          option.verdict.status === "refused" ? option.verdict.reason.code : "",
        ),
    ).toEqual(["WIDTH_NOT_SUPPORTED"]);
    for (const option of options) {
      if (option.verdict.status === "current") continue;
      expect([option.widthMm, option.verdict.status]).toEqual([
        option.widthMm,
        "refused",
      ]);
    }
  });

  // The reason is the engine's, not a sentence this query invented for the occasion.
  it("carries the command's own refusal on the disjoint column's chips", () => {
    const world = disjointColumnWorld();
    for (const option of optionsFor(world, DISJOINT_CARGO_ID)) {
      if (option.verdict.status !== "refused") continue;
      const command = setWidth({
        design: world.design,
        catalog: world.catalog,
        columns: world.columns,
        target: { kind: "placement", id: DISJOINT_CARGO_ID },
        widthMm: option.widthMm,
        probe: createFakeProbe(),
        occurredAt: OCCURRED_AT,
      });
      if (command.ok) throw new Error("expected the command to refuse too");
      expect([option.widthMm, option.verdict.reason.code]).toEqual([
        option.widthMm,
        command.reason.code,
      ]);
    }
  });

  // The two ways now answer the same way, which is the point — one rule, not two.
  it("answers an unresizable member and a disjoint set alike", () => {
    const unresizable = optionsFor(kitchen(), "p19");
    const disjoint = optionsFor(disjointColumnWorld(), DISJOINT_CARGO_ID);

    for (const options of [unresizable, disjoint]) {
      expect(options.length).toBeGreaterThan(0);
      expect(
        options.filter((option) => option.verdict.status === "current"),
      ).toHaveLength(1);
      expect(
        options.every(
          (option) =>
            option.verdict.status === "current" ||
            option.verdict.status === "refused",
        ),
      ).toBe(true);
    }
  });
});

describe("no options at all is a real answer, and it has to stay one", () => {
  // FINDING R2.7: a body that resolves no set gets no width section rather than a chipless one, so
  // missing catalogue data fails loudly. The current width is folded into a set that exists; it
  // never conjures one, which is what would have turned this into a one-chip section nobody can use.
  it("returns nothing for a corner leg, which declares no equivalent", () => {
    expect(optionsFor(kitchen(), "p25")).toEqual([]);
  });

  it("returns nothing for a void, which owns no width", () => {
    const world = kitchenWithEmptyColumn();
    const opening = world.voids[0];
    expect(opening).toBeDefined();
    expect(
      widthOptionsFor({
        design: world.design,
        catalog: world.catalog,
        columns: world.columns,
        target: { kind: "void", id: opening?.id ?? "" },
        probe: createFakeProbe(),
      }),
    ).toEqual([]);
  });

  it("returns nothing for a target that no longer resolves", () => {
    expect(optionsFor(kitchen(), "no-such-placement")).toEqual([]);
  });
});

describe("asking is not editing", () => {
  // The query runs the command once per candidate and throws every design away. If one of them
  // escaped, a customer would have their kitchen resized by opening the panel.
  it("leaves the design it was asked about untouched", () => {
    const world = kitchenWithEmptyColumn();
    const before = JSON.stringify(world.design);
    for (const record of world.records) optionsFor(world, record.id);
    expect(JSON.stringify(world.design)).toBe(before);
  });

  // A refused option carries the engine's own `RejectionDetail`, whole — the same contract
  // `CatalogOffer.verdict` publishes, so one renderer serves both and no surface writes a second
  // sentence for a refusal the engine already named (ADR 0032 rule 2).
  it("carries the command's own refusal, code and parameters alike", () => {
    const world = kitchen();
    const refused = optionsFor(world, "p8").find(
      (option) => option.verdict.status === "refused",
    );
    if (refused?.verdict.status !== "refused") {
      throw new Error("expected a refused width on p8");
    }
    const command = setWidth({
      design: world.design,
      catalog: world.catalog,
      columns: world.columns,
      target: { kind: "placement", id: "p8" },
      widthMm: refused.widthMm,
      probe: createFakeProbe(),
      occurredAt: OCCURRED_AT,
    });
    if (command.ok) throw new Error("expected the command to refuse too");
    expect(refused.verdict.reason.code).toBe(command.reason.code);
    expect(refused.verdict.reason.params).toEqual(command.reason.params);
  });
});

describe("the widths and the ranges fall back together", () => {
  // **They did not, for one commit, and it reached the screen.** `sizesMm` fell back to the selected
  // body's own set when the column's intersection was empty; `widthRangesMm` fell back only when the
  // membership failed to resolve at all. A column can satisfy the second condition without the
  // first — every member resolves, and they simply agree on nothing.
  //
  // Measured then: `p19` published thirteen widths and zero ranges, so §9 read "this column is a
  // set", rendered a chip row instead of the stepper, and put **twelve identical dashed chips** on
  // screen carrying one sentence. That is the shape ADR 0032's disabled-with-a-reason arrangement
  // and ADR 0035's stepper both exist to remove, so the two fallbacks must agree.
  it("publishes a bound whenever it publishes more than one width", () => {
    const world = disjointColumnWorld();
    const choices = columnWidthChoices({
      design: world.design,
      catalog: world.catalog,
      target: { kind: "placement", id: DISJOINT_CARGO_ID },
    });
    if (!choices) throw new Error("expected the cargo to publish choices");

    // The cargo's own bound is genuinely a set, so a choice is right here — what must not happen is
    // widths without ranges, which is a bound described as a set.
    expect(choices.sizesMm.length).toBeGreaterThan(0);
    expect(choices.widthRangesMm.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// The two width controls answer with one voice.
//
// §9 renders a stepper (ADR 0035 decision 1) and, where a column publishes a set, a chip row
// (ADR 0034's seam). Both judge by running `setWidth` and discarding the design, so they cannot
// disagree unless one of them stops asking — and a customer who sees a live `+50` on a chip and a
// dead one on the stepper has no way to tell which is the product's answer.
//
// **They agree by construction today, and that is the point of pinning it.** Nothing in the query
// layer models a width; both ask. The row below is the guard against a future shortcut — a chip set
// filtered on a rule of its own, or a stepper that reads a bound instead of running the command —
// which is the defect class ADRs 0016, 0017, 0029 and 0032 each record arriving a different way.
// The second test keeps the sweep from being vacuous by pinning a width that is live on both
// controls only because ADR 0043 removed the remainder floor.
// ---------------------------------------------------------------------------
describe("the stepper and the chip row agree about the next width up", () => {
  function stepsFor(world: KitchenWorld, placementId: string) {
    return widthStepsFor({
      design: world.design,
      catalog: world.catalog,
      columns: world.columns,
      target: { kind: "placement", id: placementId },
      probe: createFakeProbe(),
    });
  }

  const SEEDED_SELECTIONS = KITCHEN_L_DESIGN.placements.map(
    (placement) => placement.id,
  );

  /** The worlds the sweep runs over. **The shipped kitchen and one cleared dishwasher column are not
   *  enough**: neither has a body that can grow, so every pair skips and the sweep checks nothing —
   *  measured at zero when this row was first written (review finding R1.3). Clearing `A|0.30` and
   *  `A|2.60` is what puts a live `+50` on the board, per the census in
   *  `qa-w5c.enumeration.test.ts`. */
  function worldsUnderTest(): KitchenWorld[] {
    return [
      kitchen(),
      kitchenWithEmptyColumn(),
      clearBodies(kitchen(), ["p8", "p15"]),
      clearBodies(kitchen(), ["p2", "p13", "p19"]),
      steppedDown("p4", 500),
    ];
  }

  /** The shipped kitchen with one column stepped down through the real command, carrying the frozen
   *  map forward the way the store does. This is the ADR 0043 shape: the gap the shrinks left is
   *  narrower than what a `+50` would consume, so the step back up leaves a remainder — which is
   *  live on both controls now and was refused on both before. */
  function steppedDown(placementId: string, targetMm: number): KitchenWorld {
    let world = kitchen();
    for (let widthMm = 550; widthMm >= targetMm; widthMm -= 50) {
      const result = setWidth({
        design: world.design,
        catalog: world.catalog,
        columns: world.columns,
        target: { kind: "placement", id: placementId },
        widthMm,
        probe: createFakeProbe(),
        occurredAt: OCCURRED_AT,
      });
      if (!result.ok) throw new Error(`step refused: ${result.reason.code}`);
      world = {
        ...createWorld(result.design, world.catalog),
        columns: result.effect.columns,
      };
    }
    return world;
  }

  /** How many `(selection, world)` pairs must actually reach the comparison. Both `continue`s below
   *  are silent skips — a selection with no width section at all, and a chip the command refuses —
   *  so without a floor this sweep passes when it checks **nothing**, which is exactly what it did
   *  before R1.3 and what a query that stopped publishing chips would look like. Pinned under the
   *  measured count, deliberately loose: it is a vacuity guard, not a census, and the census lives
   *  in `qa-w5c.enumeration.test.ts`. The idiom is `set-width.columns.test.ts`'s own.
   *
   *  **Measured at 8 across the five worlds**, and pinned at 6. The number is small because a live
   *  `+50` is rare on the shipped kitchen — most columns are at a ceiling, frozen by an appliance,
   *  or have nothing beside them — which is the finding itself: the four selections that can grow
   *  are the entire evidence this sweep has, so losing one has to fail rather than pass quietly. */
  const MINIMUM_PAIRS_CHECKED = 6;

  it("offers a live +50 step wherever it offers that chip", () => {
    const disagreements: string[] = [];
    let checked = 0;

    for (const placementId of SEEDED_SELECTIONS) {
      for (const world of worldsUnderTest()) {
        const steps = stepsFor(world, placementId);
        if (!steps) continue;
        const chip = optionsFor(world, placementId).find(
          (option) => option.widthMm === steps.wider.widthMm,
        );
        if (chip?.verdict.status !== "available") continue;
        checked += 1;
        if (steps.wider.verdict.status !== "available") {
          disagreements.push(
            `${placementId}@${String(steps.wider.widthMm)}: chip available, step ${steps.wider.verdict.status}`,
          );
        }
      }
    }

    expect(disagreements).toEqual([]);
    expect(checked).toBeGreaterThanOrEqual(MINIMUM_PAIRS_CHECKED);
  });

  it("has a live +50 to agree about, on a width ADR 0043 is what unlocks", () => {
    // The sweep above is satisfied by two controls that both refuse, so it needs one width where
    // both are known to be *available*. `p4` on the **unedited** kitchen, stepped down twice: the
    // first `−50` creates a 50 mm strip, the second widens it to 100, and stepping back up consumes
    // 50 and leaves 50. ADR 0031's remainder floor refused exactly that, on both controls at once —
    // which is why the stepper could go down and not come back, and why this row fails if the floor
    // ever returns.
    let world = kitchen();
    for (let widthMm = 550; widthMm >= 500; widthMm -= 50) {
      const result = setWidth({
        design: world.design,
        catalog: world.catalog,
        columns: world.columns,
        target: { kind: "placement", id: "p4" },
        widthMm,
        probe: createFakeProbe(),
        occurredAt: OCCURRED_AT,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      world = {
        ...createWorld(result.design, world.catalog),
        columns: result.effect.columns,
      };
    }

    const steps = stepsFor(world, "p4");
    expect(steps?.currentWidthMm).toBe(500);
    expect(steps?.wider).toEqual({
      widthMm: 550,
      verdict: { status: "available" },
    });
    const chip = optionsFor(world, "p4").find(
      (option) => option.widthMm === 550,
    );
    expect(chip?.verdict.status).toBe("available");
  });
});
