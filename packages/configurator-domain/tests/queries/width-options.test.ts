// §9's width chips: a chip is free if and only if `setWidth` at that width would succeed. Every assertion runs
// `setWidth` itself and compares, because a query that modelled the answer would drift from the command.
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

/** The shipped kitchen with `A|2.00` emptied through the real delete. It has no column empty at every level at
 *  load (ADR 0031), so this is the only fixture in which any chip can be free. */
function kitchenWithEmptyColumn(): KitchenWorld {
  return clearBodies(kitchen(), ["p1", "p12", "p18"]);
}

/** The placement id the disjoint-column fixture gives its bottle cargo. */
const DISJOINT_CARGO_ID = "cargo-under-hood";

/** A `base-bottle-cargo` (200/300, ADR 0026's declared floor) under a synthetic wall cabinet bounded 500-800,
 *  which shares nothing with the cargo's {200, 300}. No shipped pair is disjoint any more, and pinning this branch
 *  to a shipped row let it silently stop being tested. Both stand at 300 so the square-up does not do the work
 *  of the resolution; built by hand because the resolution, not the insert path, is under test. */
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
  // The property over a fixture where both answers occur, asserted against `setWidth` run again rather than a
  // written-down list.
  it("agrees with setWidth on every candidate, in a kitchen with somewhere to grow", () => {
    const world = kitchenWithEmptyColumn();
    let compared = 0;
    for (const record of world.records) {
      for (const option of optionsFor(world, record.id)) {
        // Neither of the two chips a body is standing on is a candidate move: `current` is the
        // width it has, and ADR 0049's `fixed` is the only width it is made at. The command refuses
        // both, which is why the property is about the chips that offer to change something.
        if (option.verdict.status === "current") continue;
        if (option.verdict.status === "fixed") continue;
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
    // Guards a sweep that quietly stops iterating: a zero-comparison run would pass.
    expect(compared).toBeGreaterThan(20);
  });

  // Something must actually be reachable, or the property above holds vacuously and §9's `free` state is
  // unreachable in production.
  it("finds at least one reachable width beside the emptied column", () => {
    const world = kitchenWithEmptyColumn();
    const reachable = world.records.flatMap((record) =>
      optionsFor(world, record.id)
        .filter((option) => option.verdict.status === "available")
        .map((option) => `${record.id}@${String(option.widthMm)}`),
    );
    expect(reachable.length).toBeGreaterThan(0);
  });

  // The mirror image: at load the kitchen has nothing to grow into, so what is unreachable is exactly the growths
  // (a shrink funds itself, ADR 0035 decision 7). Asserted as the sign, because the sign is the rule.
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
    // And the sweep is not vacuous: shrinking really is reachable from a standing start.
    expect(available).toBeGreaterThan(0);
  });
});

describe("the current width is a fact about the body, not a refusal code", () => {
  // §9 assumes exactly one `active` chip. If `current` were read out of `WIDTH_UNCHANGED`, a column that refuses
  // before looking at the requested width (`p19`, any column holding an immovable member) would have none.
  it("marks exactly one option current, on every body that renders any", () => {
    const world = kitchen();
    let bodies = 0;
    for (const record of world.records) {
      const options = optionsFor(world, record.id);
      if (options.length === 0) continue;
      // `fixed` counts (ADR 0049): a fixed-width cabinet's one chip is the width it stands at, so it is the
      // section's active chip and the number in the value label.
      const active = options.filter(
        (option) =>
          option.verdict.status === "current" ||
          option.verdict.status === "fixed",
      );
      expect([record.id, active.map((option) => option.widthMm)]).toEqual([
        record.id,
        [record.widthMm],
      ]);
      bodies += 1;
    }
    // Seventeen resizable bodies plus the five `fixedWidth` ones ADR 0049 brought into the section.
    expect(bodies).toBe(22);
  });

  // The path where reading `active` out of `WIDTH_UNCHANGED` would leave §9 with no active chip: `A|2.60` also
  // holds the `fixedWidth` hob base `p2` and hood `p13`, so every width is refused `COLUMN_MEMBER_NOT_RESIZABLE`
  // before the requested width is read.
  it("keeps the active chip on a column that refuses every width", () => {
    const options = optionsFor(kitchen(), "p19");
    expect(commandAccepts(kitchen(), "p19", 600)).toBe(false);
    expect(
      options.find((option) => option.verdict.status === "current")?.widthMm,
    ).toBe(600);
  });
});

describe("the candidate widths are the column's, not the selected body's", () => {
  // ADR 0031 resizes a column, so the row is the intersection of its members' sets: `A|2.00`'s dishwasher bound
  // narrows the members' chips down to its own two. §11 row 14: both niche widths, 450 and 600, are in the row.
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

  // Every member bounds (ADR 0035 decision 2): at `A|3.20` the three-drawer base's own 300 mm floor keeps 200 and
  // 250 off a row whose hinged wall members reach down to 200 alone.
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

  // A `widthFlex: 'fit'` body built to its opening can sit at a width no set contains. §9 assumes the current
  // width is one of the chips, so it is sorted into the row, not appended. Built at 570, the corner return's width
  // (ADR 0035 decision 1), because every non-structural fixture body stands on the 50 mm grid.
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
  // Two ways a column fails to agree must answer alike: `p19`'s immovable hob base renders chips each carrying
  // `COLUMN_MEMBER_NOT_RESIZABLE`, and a column of resizable members with disjoint sets must not return no section
  // and drop the `WIDTH_NOT_SUPPORTED` the engine already computed.
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
  // A body that resolves no set gets no width section rather than a chipless one, so missing catalogue data fails
  // loudly; the current width is folded into a set that exists and never conjures one.
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

  // A refused option carries the engine's own `RejectionDetail`, whole (the `CatalogOffer.verdict` contract), so no
  // surface writes a second sentence for a refusal the engine already named.
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
  // `sizesMm` and `widthRangesMm` must fall back alike when the column's intersection is empty: widths without
  // ranges make §9 render a chip row of identical dashed chips instead of the stepper.
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

// §9's stepper and chip row both judge by running `setWidth` and discarding the design, so they cannot disagree
// unless one stops asking. Pinned against a future shortcut: a chip set filtered on a rule of its own, or a
// stepper that reads a bound instead of running the command.
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

  /** The worlds the sweep runs over: the shipped kitchen and one cleared dishwasher column have no body that can
   *  grow, so every pair would skip. Clearing `A|0.30` and `A|2.60` puts a live `+50` on the board (census in
   *  `qa-w5c.enumeration.test.ts`). */
  function worldsUnderTest(): KitchenWorld[] {
    return [
      kitchen(),
      kitchenWithEmptyColumn(),
      clearBodies(kitchen(), ["p8", "p15"]),
      clearBodies(kitchen(), ["p2", "p13", "p19"]),
      steppedDown("p4", 500),
    ];
  }

  /** The shipped kitchen with one column stepped down through the real command, carrying the frozen map forward as
   *  the store does (ADR 0043 shape): the gap the shrinks left is narrower than a `+50` consumes, so the step back
   *  up leaves a remainder. */
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

  /** How many `(selection, world)` pairs must reach the comparison. Both `continue`s below are silent skips, so
   *  without a floor the sweep passes when it checks nothing. Deliberately loose: a vacuity guard, not a census
   *  (that is `qa-w5c.enumeration.test.ts`'s). */
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
    // The sweep above is satisfied by two controls that both refuse, so one width must be known available on both:
    // `p4` on the unedited kitchen stepped down twice leaves a 50 mm remainder on the way back up, which
    // ADR 0031's remainder floor refused and ADR 0043 allows.
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
