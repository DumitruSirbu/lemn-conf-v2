// Adversarial pass over the width chips M5 wave 5B made reachable for the first time, and wave 5D
// wired to the engine.
//
// The wave's own suite names five placements and their expected chip rows. This file sweeps **every**
// width section the shipped kitchen renders and asserts the properties a per-placement table cannot:
// the row is strictly ascending with no duplicate, exactly one chip is `active` and it is the body's
// own width, and each chip's state is the verdict `setWidth` actually gave for that width.
//
// The chips are the real ones: `widthOptionsFor` runs the command once per candidate against this
// design and these frozen columns. Before 5D this file swept a projection over `meta.sizesMm`; it
// now sweeps what a customer would tap, which is why three of its pinned numbers moved.
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
  widthOptionsFor,
  type BodyCatalog,
  type CommandTarget,
  type Design,
  type WidthOption,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { describePanel, type WidthSection } from "@/panel/panel-model";

import { createFakeBodyProbe } from "../support/fake-body-probe";
import { HINGED_CHIPS_MM, SINK_CHIPS_MM } from "../support/width-options";

/** ADR 0011 Gap D: columns are load-time state, frozen from the whole design. */
const SEEDED_COLUMNS = deriveColumns(
  derivePlacementRecords(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG),
);

/** The store's own fake: it measures exactly what it was asked to build, so a resize the domain's
 *  guards accept is not then failed by the built-size re-check. Backlog 9's warning applies and does
 *  not bite here — a fake probe cannot see a *depth* defect, and nothing in this file is about
 *  depth. */
const PROBE = createFakeBodyProbe();

function worldFrom(
  design: Design,
  catalog: BodyCatalog = KITCHEN_L_BODY_CATALOG,
) {
  const records = derivePlacementRecords(design, catalog);
  return {
    design,
    records,
    columns: SEEDED_COLUMNS,
    voids: recomputeVoids(records, SEEDED_COLUMNS),
    catalog,
  };
}

type World = ReturnType<typeof worldFrom>;

/** The whole path, not a stand-in: `widthOptionsFor` runs `setWidth` once per candidate width
 *  against this design, these frozen columns and a probe, and the panel renders what it answered.
 *  That is what makes this file a sweep over the *engine's* chips rather than over a projection's. */
function panelAt(world: World, target: CommandTarget, canWrite = true) {
  return describePanel({
    meta: describeSelection({ ...world, target }),
    offers: offersFor({ ...world, target }),
    rejection: null,
    widthOptions: widthOptionsFor({
      design: world.design,
      catalog: world.catalog,
      columns: world.columns,
      target,
      probe: PROBE,
    }),
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
/** ADR 0033: 39 until the merge, 76 after it. **62 since wave 5D**, and the drop is the point of the
 *  wave rather than a regression.
 *
 *  Until 5D the row came from `meta.sizesMm` — the selected **body's** entry. ADR 0031 resizes a
 *  **column**, so the row now comes from the intersection of its members' sets
 *  (`columnWidthChoices`), and fourteen chips across three columns were advertising widths
 *  `setWidth` refuses:
 *
 *  - `A|1.30` (p0 sink · p11 · p17) → 600/800. The sink's fixed 560 mm aperture bounds the whole
 *    column (ADR 0017), taking three chips off each of the two wall bodies.
 *  - `A|2.00` (p1 dishwasher · p12 shelf · p18) → 450 and 600, the dishwasher's own two widths. It
 *    was 600 alone until the owner retired ADR 0030's one-door cap and the `wall-cabinet` at `p18`
 *    could be built at 450 (§11 row 14).
 *  - `A|3.20` (p4 pan bank · p14 · p20) → 200 and 250 fall to the base body's own 300 mm floor,
 *    which under ADR 0035 it no longer declines to apply — every member bounds the column now.
 *
 *  The seventeen sections themselves are unchanged, and so is every column with one binding member.
 *
 *  **62 → 144 at ADR 0035 decision 2, then → 158 when the owner retired ADR 0030's one-door cap.**
 *  The first step turned each entry's hand-maintained width list into a bound stepped at 50 mm; the
 *  second closed the (400, 500) hole that bound still carried, adding a 450 chip to every hinged row
 *  and putting 450 back into `A|2.00`'s intersection (§11 row 14). The seventeen sections are the
 *  same seventeen throughout — what changed is how many widths each of them can offer.
 *  See `qa-w5c.enumeration.test.ts`, which measures the same columns from the command's end. */
const SEEDED_WIDTH_CHIP_COUNT = 158;

/** §9's vocabulary against the engine's, written down once here so the sweep below compares two
 *  independent things rather than restating the panel's own mapping. */
const WIDTH_STATE_BY_STATUS: Readonly<
  Record<
    WidthOption["verdict"]["status"],
    WidthSection["chips"][number]["state"]
  >
> = {
  current: "active",
  available: "free",
  refused: "blocked",
};

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
    // ADR 0033 widened the set to the merged cabinet's five, and ADR 0035 replaced that list with a
    // bound stepped at 50 mm. The claim here is unchanged through both — 300 is a member, not a
    // fold — which is exactly why it survives them: it is a fact about §2's floor, not about how
    // many widths sit around it.
    const world = seededWorld();
    const meta = describeSelection({
      ...world,
      target: { kind: "placement", id: "p10" },
    });
    expect(meta?.widthMm).toBe(toMillimetres(MIN_WIDTH_M));
    expect(meta?.sizesMm).toEqual(HINGED_CHIPS_MM);
    expect(widthsAt(world, "p10")).toEqual(HINGED_CHIPS_MM);
  });

  // **The shipped kitchen has no fold left, and that is ADR 0035 decision 1.** `p24` was the last
  // one: 700 was a width no wall entry declared, so the body's own width was added to the row it
  // renders. The 50 mm step makes 700 a chip like any other, and every non-structural body the
  // fixture ships now stands on the grid.
  //
  // The fold mechanism has not gone anywhere and must not — decision 1 keeps stepping **relative**
  // to the current width rather than snapping to the grid, precisely so a 570 mm corner return or a
  // 750 mm fridge column is not rewritten. Its own case lives where a body can be put off-grid:
  // `packages/configurator-domain/tests/queries/width-options.test.ts`.
  it("renders p24's own 700 as one chip in the middle of the row, not as a fold", () => {
    const widths = widthsAt(seededWorld(), "p24");
    expect(widths).toEqual(HINGED_CHIPS_MM);
    expect(widths.filter((width) => width === 700)).toHaveLength(1);
  });

  // The duplicate case, which the `Set` in `columnWidthChoices` is there to prevent: a body already
  // standing at a member of its set gets one chip for that width, not two.
  //
  // **p11's row narrowed in wave 5D, and it is the change that wave was for.** It used to render its
  // own entry's widths; it renders the sink's, because ADR 0031 resizes a **column** and p11 shares
  // `A|1.30` with the 800 mm sink, whose 560 mm aperture bounds the column (ADR 0017). The widths
  // that disappeared were never reachable — `setWidth` refuses every one of them — so the panel was
  // advertising moves the engine would not make. p8 stands alone in its column at every level that
  // binds, so its row is the full hinged set: the narrowing is the intersection doing its job, not a
  // blanket shrink.
  it("gives a body already at a set width exactly one chip for it", () => {
    const world = seededWorld();
    expect(widthsAt(world, "p11")).toEqual(SINK_CHIPS_MM);
    expect(widthsAt(world, "p8")).toEqual(HINGED_CHIPS_MM);
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

  // **The turned-over assertion.** M4 pinned "no chip is ever free" because no resize command
  // existed, and the milestone said M5 must replace it with the property rather than delete it. The
  // property is: a chip is `free` **iff** `setWidth` at that width would succeed, and only a `free`
  // chip is clickable.
  //
  // Over the shipped kitchen *as loaded* this yielded zero free chips through wave 5D, because ADR
  // 0031 funded a resize from an adjacent **empty** column and the shipped kitchen has none. **ADR
  // 0035 decision 7 ends that**: a shrink funds itself out of the space it vacates, so 51 chips are
  // free on a kitchen nobody has edited yet, and wave 5E's browser gate no longer needs a delete in
  // front of it to show anything.
  //
  // The `iff` this row exists for is unchanged and is what actually carries the weight — the count
  // beside it is the guard against the sweep going quiet.
  it("marks a chip free exactly where the engine would accept the resize", () => {
    const world = seededWorld();
    let chips = 0;
    let free = 0;
    for (const record of world.records) {
      const section = widthSectionAt(world, record.id);
      if (!section) continue;
      const options = new Map(
        widthOptionsFor({
          design: world.design,
          catalog: world.catalog,
          columns: world.columns,
          target: { kind: "placement", id: record.id },
          probe: PROBE,
        }).map((option) => [option.widthMm, option.verdict.status]),
      );
      for (const chip of section.chips) {
        const status = options.get(chip.widthMm);
        // **No `?? "refused"` default here** (QA finding, wave 5D). It read as harmless and was not:
        // a chip whose width is absent from the options map — the panel inventing one — would have
        // been compared against "refused" and passed silently, which is the one thing this sweep
        // exists to catch. A missing status is a failure, stated as one.
        expect(
          status,
          `no option published for ${record.id}@${String(chip.widthMm)}`,
        ).toBeDefined();
        if (status === undefined) continue;
        expect([record.id, chip.widthMm, chip.state]).toEqual([
          record.id,
          chip.widthMm,
          WIDTH_STATE_BY_STATUS[status],
        ]);
        expect([record.id, chip.widthMm, chip.isDisabled]).toEqual([
          record.id,
          chip.widthMm,
          chip.state !== "free",
        ]);
        if (chip.state === "free") free += 1;
        chips += 1;
      }
    }
    expect(chips).toBe(SEEDED_WIDTH_CHIP_COUNT);
    // The measurement, recorded rather than assumed: 0 → 51 at ADR 0035 decision 7. It is the same
    // 51 the domain's own load census names one tap at a time
    // (`qa-w5c.enumeration.test.ts`), reached here through the panel instead of through the command.
    expect(free).toBe(51);
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
  // `canWidth` stays §9's literal rule and the emptiness is answered in `describeWidthSection` —
  // which is what makes missing catalogue data fail loudly at the section rather than silently at
  // the flag. Reached by breaking data: a seeded row whose pointer resolves to nothing. The panel
  // must lose the section, not render a chipless one and not throw.
  //
  // ADR 0038 retired the other route in, a document saved before ADR 0027 carrying a `cooktop-600`
  // placement. No such document was ever stored, and the row is gone with the machinery.
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
