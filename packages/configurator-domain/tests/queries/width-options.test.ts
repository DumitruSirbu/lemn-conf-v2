// §9's width chips, and the one property M4 deliberately refused to promise: **a chip is free if
// and only if `setWidth` at that width would succeed.**
//
// The panel's own tests prove that it relabels a verdict correctly. What has to be proved here is
// that the verdict is the command's — that this query is not a second opinion. So every assertion
// below runs `setWidth` itself, independently, and compares. A query that modelled the answer
// instead of asking for it would drift from the command exactly the way ADRs 0016, 0017, 0029 and
// 0032 each record.
import { describe, expect, it } from "vitest";

import { setWidth } from "../../src/commands/set-width.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import {
  widthOptionsFor,
  type WidthOption,
} from "../../src/queries/width-options.js";
import { resolveBuildableSizes } from "../../src/catalog.js";
import { clearBodies, OCCURRED_AT } from "../support/commands.js";
import { createFakeProbe } from "../support/fake-probe.js";
import { createWorld, type KitchenWorld } from "../support/kitchen-world.js";

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

/** A column whose members are **all resizable**, **flush**, and whose declared sets do not
 *  intersect: a `base-bottle-cargo` (200/300, ADR 0026's declared floor) under a `hood` (600/900).
 *  Nothing is wrong with either body; the column simply agrees on no width.
 *
 *  Both stand at 300 on purpose. Left at their natural widths the column is *also* unaligned, and
 *  the refusal that comes back is `COLUMN_MEMBERS_UNALIGNED` — true, but it conflates two reasons
 *  and would let this test pass without the disjoint case working. Flush, the engine answers
 *  `WIDTH_NOT_SUPPORTED`, which is the reason this fixture exists to see rendered rather than
 *  discarded. Built by hand rather than through inserts, because what is under test is the
 *  resolution and not the insert path. */
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
        id: "hood-over-cargo",
        wall: "A" as const,
        alongMm: 5000,
        y0Mm: 1500,
        body: { buildId: "hood", widthMm: 300, heightMm: 710 },
      },
    ],
  };
  return createWorld(design, KITCHEN_L_BODY_CATALOG);
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

  // The mirror image, and the measurement wave 5E depends on: with no column empty at every level,
  // nothing is reachable. That is a fact about ADR 0031's funding rule, not about the command being
  // missing — which is what it was in M4.
  it("offers nothing free in the shipped kitchen, which has no empty column", () => {
    const world = kitchen();
    for (const record of world.records) {
      expect([
        record.id,
        optionsFor(world, record.id).map((option) => option.verdict.status),
      ]).toEqual([
        record.id,
        optionsFor(world, record.id).map((option) =>
          option.verdict.status === "current" ? "current" : "refused",
        ),
      ]);
    }
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
  // the 450/600 dishwasher under a 400/600/800 open shelf: 600 is the only width all of them can be
  // built at, and offering the dishwasher its own 450 would be advertising a move the command
  // refuses.
  it("narrows to what every member of the column accepts", () => {
    const world = kitchen();
    expect(resolveBuildableSizes(world.catalog, "base-dishwasher-600")).toEqual(
      [450, 600],
    );
    expect(widthsOf(optionsFor(world, "p1"))).toEqual([600]);
    expect(commandAccepts(world, "p1", 450)).toBe(false);
  });

  // The other half of ADR 0031 rule 5, which a per-body row could not express either: a
  // standard-ladder entry constrains the column by its **floor** alone, so `A|3.20`'s pan bank does
  // not veto the 300 its wall neighbours declare.
  it("lets a standard-ladder member widen the row rather than bound it", () => {
    const world = kitchen();
    expect(resolveBuildableSizes(world.catalog, "base-drawer3-600")).toEqual([
      400, 600, 800,
    ]);
    expect(widthsOf(optionsFor(world, "p4"))).toEqual([300, 400, 600, 800]);
  });

  // A `widthFlex: 'fit'` body built to its opening can sit at a width no set contains. §9 gives a
  // chip three states and assumes the current width is one of them, so its own width joins the row —
  // sorted into it, not appended.
  it("folds a fit body's own width into the row, in order", () => {
    expect(widthsOf(optionsFor(kitchen(), "p24"))).toEqual([
      200, 300, 400, 600, 700, 800,
    ]);
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
