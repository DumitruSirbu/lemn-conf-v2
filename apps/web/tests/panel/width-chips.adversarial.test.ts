// Adversarial pass over the width chips M5 wave 5B made reachable for the first time.
//
// The wave's own suite names five placements and their expected chip rows. This file sweeps **every**
// width section the shipped kitchen renders and asserts the properties a per-placement table cannot:
// the row is strictly ascending with no duplicate, exactly one chip is `active` and it is the body's
// own width, and no chip is `free` — there is no resize command yet.
//
// It also pins the two arrangements §9 and FINDING R2.7 depend on, at the panel rather than in the
// domain: `canWidth: true, sizesMm: []` renders **no** section (the decision lives in
// `describeWidthSection`, not in the flag), and a `fixedWidth` body's non-empty set is never read.
import {
  deriveColumns,
  derivePlacementRecords,
  describeSelection,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  MIN_WIDTH_M,
  offersFor,
  recomputeVoids,
  toMillimetres,
  type BodyCatalog,
  type CommandTarget,
  type Design,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { describePanel, type WidthSection } from "@/panel/panel-model";

import { preMigrationHobDesign } from "../support/pre-migration-hob";

/** ADR 0011 Gap D: columns are load-time state, frozen from the whole design. */
const SEEDED_COLUMNS = deriveColumns(
  derivePlacementRecords(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG),
);

function worldFrom(
  design: Design,
  catalog: BodyCatalog = KITCHEN_L_BODY_CATALOG,
) {
  const records = derivePlacementRecords(design, catalog);
  return {
    records,
    columns: SEEDED_COLUMNS,
    voids: recomputeVoids(records, SEEDED_COLUMNS),
    catalog,
  };
}

type World = ReturnType<typeof worldFrom>;

function panelAt(world: World, target: CommandTarget, canWrite = true) {
  return describePanel({
    meta: describeSelection({ ...world, target }),
    offers: offersFor({ ...world, target }),
    rejection: null,
    isBodyProbeAttached: true,
    canWrite,
    saveStatus: "idle",
  });
}

function widthSectionAt(
  world: World,
  id: string,
  canWrite = true,
): WidthSection | undefined {
  const panel = panelAt(world, { kind: "placement", id }, canWrite);
  if (panel.kind !== "open") return undefined;
  const section = panel.sections.find(
    (candidate) => candidate.kind === "width",
  );
  return section?.kind === "width" ? section : undefined;
}

function widthsAt(world: World, id: string): number[] {
  const section = widthSectionAt(world, id);
  if (!section) throw new Error(`no width section on ${id}`);
  return section.chips.map((chip) => chip.widthMm);
}

function catalogWith(
  buildId: string,
  overrides: Partial<
    NonNullable<ReturnType<typeof KITCHEN_L_BODY_CATALOG.get>>
  >,
): BodyCatalog {
  const base = KITCHEN_L_BODY_CATALOG.get(buildId);
  if (!base) throw new Error(`no catalogue entry ${buildId}`);
  return new Map(KITCHEN_L_BODY_CATALOG).set(buildId, {
    ...base,
    ...overrides,
  });
}

const seededWorld = () => worldFrom(KITCHEN_L_DESIGN);

// -------------------------------------------------------------------------------------------
// The `widthFlex: 'fit'` case §9 has to survive.
// -------------------------------------------------------------------------------------------

/** Every width chip the shipped kitchen renders, counted once. It was a `> 50` floor until the
 *  ADR 0029 took 400 off `wall-2door` and eleven placements lost a chip each,
 *  which is precisely the moment a floor stops guarding: 41 still clears any plausible floor while
 *  being the wrong number. Pinned exactly instead, so the next change to a set has to come back
 *  here and say what it did — the sweeps below are the only thing standing between a resolution
 *  that quietly returns fewer chips and a green suite.
 *
 *  It moved again on the same day: ADR 0030, as amended, made `wall-1door` `[200, 300, 400]`. The
 *  two rows that resolve it still render three chips each, but for a different reason — their own
 *  300 is now a **member** of the set rather than a width folded in beside it — so the count holds
 *  at 39 while its composition changed. That is exactly why it is pinned as a number *and*
 *  itemised below: a count alone would have read green through the change.
 *
 *  39 = seventeen rendering bodies: two chips each for the ten `wall-2door` rows and for the sink
 *  and the dishwasher; three for `base-3drawer`, `open-shelf` and `p24` (its own 700 joins); three
 *  for the two `wall-1door` rows, whose whole set is 200/300/400. */
/** ADR 0033: 39 until the merge, 76 after it. Every seeded wall and top body resolves to one
 *  `wall-cabinet` entry with five widths, where it used to resolve to a two- or three-width row. The
 *  chips a body renders are its entry's, so more entries collapsing into one wider row means more
 *  chips — see `qa-w5c.enumeration.test.ts`, which measures what the column behind them accepts. */
const SEEDED_WIDTH_CHIP_COUNT = 76;

describe("a body built to its opening rather than to a member of its set", () => {
  // `wall-1door-300` sits at exactly `MIN_W`, which is the boundary of the whole width rule: the
  // consequence line says "sub 300 mm nu se coboară", so a body standing *on* the floor must still
  // get its own chip and it must be the active one.
  it("gives wall-1door-300 its own set, which now contains its width", () => {
    // **This used to be the fold case.** ADR 0030's amendment put 200 and 300 into `wall-1door`'s
    // own set, so `p10`'s width is a member rather than an addition — the body standing *on* §2's
    // floor still gets a chip for it, and it is still the active one, but the mechanism that
    // produces it changed. `p24` below is now the only fold left in the shipped kitchen.
    //
    // ADR 0033 widened the set again, to the merged cabinet's five: this body can now be resized up
    // to a two-door without changing which entry it is, which is the decision's whole point read
    // through §9's chips. The claim here is unchanged — 300 is a member, not a fold.
    const world = seededWorld();
    const meta = describeSelection({
      ...world,
      target: { kind: "placement", id: "p10" },
    });
    expect(meta?.widthMm).toBe(toMillimetres(MIN_WIDTH_M));
    expect(meta?.sizesMm).toEqual([200, 300, 400, 600, 800]);
    expect(widthsAt(world, "p10")).toEqual([200, 300, 400, 600, 800]);
  });

  // `p24` is still the only fold in the shipped kitchen: 700 is a width no wall entry declares,
  // before ADR 0033 or after it, so the body's own width is added to the row it renders. The merged
  // set puts four chips in front of it now instead of one, and 700 still lands in the middle.
  it("folds wall-2door-700-over-fridge's own 700 into the middle of the row", () => {
    expect(widthsAt(seededWorld(), "p24")).toEqual([
      200, 300, 400, 600, 700, 800,
    ]);
  });

  // The duplicate case, which the `Set` in `describeWidthChips` is there to prevent: a body already
  // standing at a member of its set gets one chip for that width, not two.
  it("gives a body already at a set width exactly one chip for it", () => {
    const world = seededWorld();
    expect(widthsAt(world, "p11")).toEqual([200, 300, 400, 600, 800]);
    expect(widthsAt(world, "p8")).toEqual([200, 300, 400, 600, 800]);
    expect(
      widthsAt(world, "p11").filter((width) => width === 800),
    ).toHaveLength(1);
  });
});

// -------------------------------------------------------------------------------------------
// The whole population, swept.
// -------------------------------------------------------------------------------------------

describe("every width section the shipped kitchen renders", () => {
  it("is ascending, duplicate-free, and has exactly one active chip on the body's own width", () => {
    const world = seededWorld();
    const rendered: string[] = [];
    for (const record of world.records) {
      const section = widthSectionAt(world, record.id);
      if (!section) continue;
      rendered.push(record.id);
      const widths = section.chips.map((chip) => chip.widthMm);

      expect([record.id, widths]).toEqual([
        record.id,
        [...widths].sort((left, right) => left - right),
      ]);
      expect([record.id, new Set(widths).size]).toEqual([
        record.id,
        widths.length,
      ]);
      expect([record.id, widths.length > 0]).toEqual([record.id, true]);
      expect([record.id, widths.includes(record.widthMm)]).toEqual([
        record.id,
        true,
      ]);

      const active = section.chips.filter((chip) => chip.state === "active");
      expect([record.id, active.map((chip) => chip.widthMm)]).toEqual([
        record.id,
        [record.widthMm],
      ]);
    }
    // The guard. ADR 0027 and ADR 0025 put 26 placements in the kitchen; nine are `fixedWidth` or
    // resolve no set, and the remaining 17 are the section's whole population. A sweep that
    // silently shrank would otherwise pass every property above.
    expect(rendered.length).toBe(17);
  });

  // Wave 5C has not shipped `setWidth`, so no width is reachable and `blocked` is the truthful
  // state for every non-current chip. Wave 5D changes this on purpose — this line is where that
  // change has to be made deliberately rather than drifted into.
  it("marks no chip free, and blocks every chip that is not the current width", () => {
    const world = seededWorld();
    let chips = 0;
    for (const record of world.records) {
      const section = widthSectionAt(world, record.id);
      if (!section) continue;
      for (const chip of section.chips) {
        expect([record.id, chip.widthMm, chip.state]).toEqual([
          record.id,
          chip.widthMm,
          chip.widthMm === record.widthMm ? "active" : "blocked",
        ]);
        expect(chip.isDisabled).toBe(true);
        chips += 1;
      }
    }
    expect(chips).toBe(SEEDED_WIDTH_CHIP_COUNT);
  });

  // Read-only disables every chip, `free` included — asserted over the real kitchen rather than a
  // fixture, because the day `free` becomes reachable this is the sweep that has to keep holding.
  it("disables every chip in a browser that cannot write", () => {
    const world = seededWorld();
    let chips = 0;
    for (const record of world.records) {
      const section = widthSectionAt(world, record.id, false);
      if (!section) continue;
      for (const chip of section.chips) {
        expect([record.id, chip.widthMm, chip.isDisabled]).toEqual([
          record.id,
          chip.widthMm,
          true,
        ]);
        chips += 1;
      }
    }
    expect(chips).toBe(SEEDED_WIDTH_CHIP_COUNT);
  });
});

// -------------------------------------------------------------------------------------------
// FINDING R2.7's arrangement, at the panel.
// -------------------------------------------------------------------------------------------

describe("a willing body with no widths gets no section, not an empty one", () => {
  // The reachable case: a document saved before ADR 0027 carries a `cooktop-600` placement, which
  // declares no catalogue equivalent and is not `fixedWidth`. `canWidth` stays §9's literal rule
  // and the emptiness is answered in `describeWidthSection` — which is what makes missing
  // catalogue data fail loudly at the section rather than silently at the flag.
  it("keeps canWidth true on a pre-migration cooktop while rendering nothing", () => {
    const world = worldFrom(preMigrationHobDesign());
    const meta = describeSelection({
      ...world,
      target: { kind: "placement", id: "p3" },
    });
    expect(meta?.canWidth).toBe(true);
    expect(meta?.sizesMm).toEqual([]);
    expect(widthSectionAt(world, "p3")).toBeUndefined();
  });

  // The same arrangement reached by breaking data instead of by loading an old document: a seeded
  // row whose pointer resolves to nothing. The panel must lose the section, not render a chipless
  // one and not throw.
  it("drops the section when a seeded row's pointer resolves to nothing", () => {
    const world = worldFrom(
      KITCHEN_L_DESIGN,
      catalogWith("wall-2door-600", { catalogEquivalentId: "no-such-entry" }),
    );
    const meta = describeSelection({
      ...world,
      target: { kind: "placement", id: "p8" },
    });
    expect(meta?.canWidth).toBe(true);
    expect(meta?.sizesMm).toEqual([]);
    expect(widthSectionAt(world, "p8")).toBeUndefined();
    // And the rest of the panel survives: the failure is confined to the one section.
    expect(panelAt(world, { kind: "placement", id: "p8" }).kind).toBe("open");
  });

  // The floor emptying the set is the third route to the same state, and it is the one ADR 0017
  // and ADR 0026 make possible: a resolved entry whose declared floor excludes every member.
  it("drops the section when the resolved entry's floor empties its set", () => {
    const world = worldFrom(
      KITCHEN_L_DESIGN,
      catalogWith("wall-cabinet", { minWidthMm: 900 }),
    );
    expect(widthSectionAt(world, "p8")).toBeUndefined();
    expect(widthSectionAt(world, "p14")).toBeUndefined();
  });
});

describe("a fixed-width body never reads the set it publishes", () => {
  // p2 (hob base), p5/p6 (columns), p7 (freestanding fridge) and p13 (hood) all resolve non-empty
  // sets and are all `fixedWidth`. The section must be absent because of the flag — the set beside
  // it is inert, and this is the assertion that says the two are independent in the direction the
  // domain cannot show on its own.
  it.each(["p2", "p5", "p6", "p7", "p13"])(
    "renders no width section for %s",
    (id) => {
      const world = seededWorld();
      const meta = describeSelection({
        ...world,
        target: { kind: "placement", id },
      });
      expect(meta?.canWidth).toBe(false);
      expect((meta?.sizesMm ?? []).length).toBeGreaterThan(0);
      expect(widthSectionAt(world, id)).toBeUndefined();
    },
  );
});
