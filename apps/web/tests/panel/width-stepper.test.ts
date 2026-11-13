// Which control a selection gets (ADR 0035 decision 3) is asserted against the catalogue's declared ranges, not the
// panel's derivation of them: `isSteppedColumn` reads the shape off the width set the column published.
import {
  cabinetDepthMmOf,
  columnWidthChoices,
  deriveColumns,
  derivePlacementRecords,
  describeSelection,
  entryLabel,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  offersFor,
  recomputeVoids,
  resolveCatalogEquivalent,
  type BodyLabel,
  resolveWidthRangesMm,
  setWidth,
  toInsertableBody,
  widthOptionsFor,
  type BodyCatalog,
  type CommandTarget,
  type Design,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { ro } from "../support/romanian-content";
import { describePanel, type WidthSection } from "@/panel/panel-model";
import { widthStepsFor, WIDTH_STEP_MM } from "@lemnaria/configurator-domain";

import { createFakeBodyProbe } from "../support/fake-body-probe";
import { PAL_KITCHEN } from "../support/panel-material";

/** ADR 0011 Gap D: columns are load-time state, frozen from the whole design. */
const SEEDED_COLUMNS = deriveColumns(
  derivePlacementRecords(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG),

  {},
  KITCHEN_L_DESIGN.room,
);

/** The store's own fake: it measures exactly what it was asked to build, so a resize the domain's
 *  guards accept is not then failed by the built-size re-check. */
const PROBE = createFakeBodyProbe();

/** The timestamp the sweeps hand `setWidth` when they ask it directly. Never stored — every design
 *  these tests build is discarded, exactly as the two queries discard theirs. */
const OCCURRED_AT = "2026-08-30T12:00:00.000Z";

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

/** The whole path, not a stand-in: both width queries run `setWidth` against this design, these
 *  frozen columns and a probe, and the panel renders what they answered. */
function panelAt(world: World, target: CommandTarget, canWrite = true) {
  const engineInput = {
    design: world.design,
    catalog: world.catalog,
    columns: world.columns,
    target,
    probe: PROBE,
  };
  return describePanel({
    content: ro,
    material: PAL_KITCHEN,
    meta: describeSelection({ kitchenSettings: {}, ...world, target }),
    offers: offersFor({
      ...world,
      target,
      cabinetDepthMm: cabinetDepthMmOf(world.design),
    }),
    rejection: null,
    widthOptions: widthOptionsFor(engineInput),
    widthSteps: widthStepsFor(engineInput),
    widthRanges:
      columnWidthChoices({
        design: world.design,
        catalog: world.catalog,
        target,
      })?.widthRangesMm ?? [],
    buildableWidthSpanMm: undefined,
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

/** ADR 0035 decision 6: a hood is not a member for width purposes. Read off the resolved entry's `kind`, as the
 *  command reads it, not off an id list. */
const HOOD_KIND = "extractor_hood";

/** The catalogue's own answer to "is this column's width free or a set?", computed from declared ranges the panel
 *  cannot reach so its derivation has something independent to be wrong against.
 *  A column is free when every member the width governs is built across a range (ADR 0035 decision 3); one discrete
 *  member fixes the whole column (decision 6): `p1`'s dishwasher takes `A|2.00` down to 450 and 600, and the wall
 *  cabinet above follows. The hood is outside the width membership.
 *  `columnWidthChoices` cannot intersect a column holding a member with no §7 equivalent or `fixedWidth` (the hob base
 *  under the hood, the fridge beside `p24`), so it falls back to the selected body's own widths and every button is
 *  disabled naming the member in the way. */
function columnHasFreeWidth(world: World, record: PlacementRecord): boolean {
  // ADR 0049 decides first: a body that may not be resized publishes the single width it stands at. `hood-600` is
  // `fixedWidth` while its catalogue equivalent is bounded 600–800, so reading the ranges alone would predict a stepper
  // whose buttons can never move.
  if (record.fixedWidth) return false;
  const members = world.records.filter(
    (candidate) =>
      candidate.col === record.col &&
      world.catalog.get(candidate.buildId)?.kind !== HOOD_KIND,
  );
  const isColumnResizable = members.every(
    (member) =>
      !member.fixedWidth &&
      resolveCatalogEquivalent(world.catalog, member.buildId) !== undefined,
  );
  const governing = isColumnResizable ? members : [record];
  expect([record.id, governing.length > 0]).toEqual([record.id, true]);
  return governing.every((member) => hasFreeWidthRange(world, member));
}

/** ADR 0022: a seeded row is built through the entry its `catalogEquivalentId` declares, so the
 *  ranges that govern it are that entry's and never the seeded row's own. */
function hasFreeWidthRange(world: World, record: PlacementRecord): boolean {
  const equivalent = resolveCatalogEquivalent(world.catalog, record.buildId);
  if (!equivalent) return false;
  const body = toInsertableBody(equivalent.buildId, equivalent.definition);
  if (!body) return false;
  return resolveWidthRangesMm(body).some((range) => range.minMm < range.maxMm);
}

describe("ADR 0035 decision 3's two controls, chosen by the shape of the bound", () => {
  // `fixedWidth` is false on both discrete rows, `base-dishwasher` included, and cannot be true there without making
  // `p1` unresizable (§11 row 14); so the control is chosen by the shape of the width bound (ADR 0035 decision 3).
  it("gives a stepper exactly to the columns whose every member is built across a range", () => {
    const world = seededWorld();
    const controls: string[] = [];
    for (const record of world.records) {
      const section = widthSectionAt(world, record.id);
      if (!section) continue;
      controls.push(`${record.id}:${section.control}`);
      expect([record.id, section.control === "stepper"]).toEqual([
        record.id,
        columnHasFreeWidth(world, record),
      ]);
    }
    // Itemised rather than counted so a different split fails: the three members of `A|2.00` (the dishwasher niche,
    // §11 row 14) and ADR 0049's four `fixedWidth` bodies, whose degenerate ranges land on the discrete control with no
    // new branch. `p6` is a stepper since ADR 0048 gave the pantry a 400–800 bound.
    expect(controls).toEqual([
      "p0:stepper",
      "p1:choice",
      "p2:choice",
      "p4:stepper",
      "p5:choice",
      "p6:stepper",
      "p7:choice",
      "p8:stepper",
      "p10:stepper",
      "p11:stepper",
      "p12:choice",
      "p13:choice",
      "p14:stepper",
      "p15:stepper",
      "p16:stepper",
      "p17:stepper",
      "p18:choice",
      "p19:stepper",
      "p20:stepper",
      "p22:stepper",
      "p23:stepper",
      "p24:stepper",
    ]);
  });

  // `DescribePanelInput.widthRanges` absent means the discrete choice: a caller that has not resolved the column's
  // shape
  // has not earned a stepper. Asserted on a body whose real control is the stepper, so dropping the field cannot
  // silently turn `p0` into chips; `asWidthChoice` in `tests/support/width-options.ts` throws for the same reason.
  it("falls back to the discrete choice when the column's shape was not supplied", () => {
    const world = seededWorld();
    const target: CommandTarget = { kind: "placement", id: "p0" };
    const engineInput = {
      design: world.design,
      catalog: world.catalog,
      columns: world.columns,
      target,
      probe: PROBE,
    };
    const panel = describePanel({
      content: ro,
      material: PAL_KITCHEN,
      meta: describeSelection({ kitchenSettings: {}, ...world, target }),
      offers: offersFor({
        ...world,
        target,
        cabinetDepthMm: cabinetDepthMmOf(world.design),
      }),
      rejection: null,
      widthOptions: widthOptionsFor(engineInput),
      widthSteps: widthStepsFor(engineInput),
      buildableWidthSpanMm: undefined,
      isBodyProbeAttached: true,
      canWrite: true,
      saveStatus: "idle",
    });
    if (panel.kind !== "open") throw new Error("expected an open panel");
    const section = panel.sections.find(
      (candidate) => candidate.kind === "width",
    );
    if (section?.kind !== "width") throw new Error("no width section");
    // Steps present and ranges absent still yields the choice: the two inputs are independent, and
    // the safe one wins.
    expect(section.control).toBe("choice");
    // The real control on this body is the stepper, which makes the fallback observable.
    expect(widthSectionAt(world, "p0")?.control).toBe("stepper");
  });

  // The headline example of decision 3: the dishwasher's `fixedWidth` is false, so a flag-based rule would have put a
  // stepper on a column that is built at exactly two widths.
  it.each(["p1", "p12", "p18"])(
    "keeps %s on the niche's two widths rather than stepping between them",
    (id) => {
      const section = widthSectionAt(seededWorld(), id);
      if (section?.control !== "choice")
        throw new Error(`expected a discrete choice on ${id}`);
      expect(section.chips.map((chip) => [chip.widthMm, chip.state])).toEqual([
        [450, "free"],
        [600, "active"],
      ]);
    },
  );
});

describe("every stepper the shipped kitchen renders", () => {
  it("offers exactly two buttons, one step either side of the body's own width", () => {
    const world = seededWorld();
    let stepped = 0;
    for (const record of world.records) {
      const section = widthSectionAt(world, record.id);
      if (section?.control !== "stepper") continue;
      stepped += 1;
      expect([
        record.id,
        section.steps.map((step) => [step.direction, step.widthMm]),
      ]).toEqual([
        record.id,
        [
          ["narrower", record.widthMm - WIDTH_STEP_MM],
          ["wider", record.widthMm + WIDTH_STEP_MM],
        ],
      ]);
      // The value label is the width the pair operates on, not the column's extent (ADR 0035 decision 6 lets those
      // differ
      // on a mixed column).
      expect([record.id, section.valueLabel]).toEqual([
        record.id,
        `${String(record.widthMm)} mm`,
      ]);
    }
    expect(stepped).toBe(15);
  });

  // Each button is enabled iff the step it offers succeeds, asked of the command directly rather than of the query the
  // panel used (ADR 0035 consequences).
  it("enables a button exactly when running the command at its width would succeed", () => {
    const world = seededWorld();
    let buttons = 0;
    let enabled = 0;
    for (const record of world.records) {
      const section = widthSectionAt(world, record.id);
      if (section?.control !== "stepper") continue;
      for (const step of section.steps) {
        const result = setWidth({
          design: world.design,
          catalog: world.catalog,
          columns: world.columns,
          target: { kind: "placement", id: record.id },
          widthMm: step.widthMm,
          probe: PROBE,
          occurredAt: OCCURRED_AT,
        });
        expect([record.id, step.direction, step.isDisabled]).toEqual([
          record.id,
          step.direction,
          !result.ok,
        ]);
        // §13.1: greyed and unclickable with the reason, which is the engine's own sentence through the localized
        // content
        // boundary; a working button carries none.
        expect([record.id, step.direction, step.reason]).toEqual([
          record.id,
          step.direction,
          // `widthSectionAt` defaults to left; the wall is `record`'s own, not the oracle's default.
          result.ok
            ? undefined
            : ro.rejection(result.reason, "left", record.wall),
        ]);
        buttons += 1;
        if (!step.isDisabled) enabled += 1;
      }
    }
    expect(buttons).toBe(30);
    // Twelve of the fifteen steppers can shrink on an unedited kitchen (a shrink funds itself, ADR 0035 decision 7) and
    // none can grow, since the shipped kitchen has no empty column at load. The three that can do neither (`p19`,
    // `p22`,
    // `p24`) share a column with a `fixedWidth` body and are disabled naming it.
    expect(enabled).toBe(12);
  });

  // Read-only replaces the reason on both buttons, including one that works: a browser that cannot write is told it
  // cannot edit, not where the bounds are. The enabled buttons above make this non-vacuous.
  it("disables both buttons in a browser that cannot write, in the panel's own words", () => {
    const world = seededWorld();
    let buttons = 0;
    for (const record of world.records) {
      const section = widthSectionAt(world, record.id, false);
      if (section?.control !== "stepper") continue;
      for (const step of section.steps) {
        expect([record.id, step.direction, step.isDisabled]).toEqual([
          record.id,
          step.direction,
          true,
        ]);
        expect([record.id, step.direction, step.reason]).toEqual([
          record.id,
          step.direction,
          "Doar vizualizare",
        ]);
        buttons += 1;
      }
    }
    expect(buttons).toBe(30);
  });
});

describe("a willing body with no widths gets no section, not an empty one", () => {
  // `canWidth` stays §9's literal rule and emptiness is answered in `describeWidthSection`, so missing catalogue data
  // fails loudly at the section. Reached by breaking data: a seeded row whose pointer resolves to nothing.
  it("drops the section when a seeded row's pointer resolves to nothing", () => {
    const world = worldFrom(
      KITCHEN_L_DESIGN,
      catalogWith("wall-2door-600", { catalogEquivalentId: "no-such-entry" }),
    );
    const meta = describeSelection({
      kitchenSettings: {},
      ...world,
      target: { kind: "placement", id: "p8" },
    });
    expect(meta?.canWidth).toBe(true);
    expect(meta?.sizesMm).toEqual([]);
    expect(widthSectionAt(world, "p8")).toBeUndefined();
    // And the rest of the panel survives: the failure is confined to the one section.
    expect(panelAt(world, { kind: "placement", id: "p8" }).kind).toBe("open");
  });

  // The floor emptying the set is the third route to the same state (ADR 0017): a resolved entry whose declared floor
  // excludes every member.
  it("drops the section when the resolved entry's floor empties its set", () => {
    const world = worldFrom(
      KITCHEN_L_DESIGN,
      catalogWith("wall-cabinet", { minWidthMm: 900 }),
    );
    expect(widthSectionAt(world, "p8")).toBeUndefined();
    expect(widthSectionAt(world, "p14")).toBeUndefined();
  });
});

/** ADR 0049: a `fixedWidth` body with a non-empty width set renders one disabled `active` chip carrying the engine's
 *  reason, not a vanished section (§13.1: disable, don't warn). `p2`, `p5`, `p7` and `p13` are `fixedWidth`; `canWidth`
 *  is false on all of them and the section renders anyway, from the widths the domain published. */
describe("a fixed-width body shows the one width it is made at", () => {
  it.each(["p2", "p5", "p7", "p13"])(
    "renders one disabled active chip with the engine's reason for %s",
    (id) => {
      const world = seededWorld();
      const record = world.records.find((candidate) => candidate.id === id);
      if (!record) throw new Error(`no record ${id}`);
      const meta = describeSelection({
        kitchenSettings: {},
        ...world,
        target: { kind: "placement", id },
      });
      expect(meta?.canWidth).toBe(false);

      const section = widthSectionAt(world, id);
      if (section?.control !== "choice")
        throw new Error("expected the discrete control");
      expect(section.title).toBe(ro.panel.widthTitle);
      expect(section.valueLabel).toBe(`${String(record.widthMm)} mm`);
      expect(
        section.chips.map((chip) => [
          chip.widthMm,
          chip.state,
          chip.isDisabled,
        ]),
      ).toEqual([[record.widthMm, "active", true]]);
      // The descriptor is the engine's own, rendered through the same content resolver a blocked chip's reason goes
      // through.
      expect(section.chips[0]?.reason).toBe(
        ro.rejection({
          code: "NOT_RESIZABLE",
          params: { label: describeWidthLabelOf(world, id), cause: "fixed" },
        }),
      );
    },
  );

  // *Corp plită și 2 sertare* is 600 mm because the hob it carries is a 590 × 520 appliance, and the section says so.
  it("names the cabinet and the width in the sentence the customer reads", () => {
    const section = widthSectionAt(seededWorld(), "p2");
    if (section?.control !== "choice") throw new Error("expected chips");
    expect([section.chips[0]?.widthMm, section.chips[0]?.reason]).toEqual([
      600,
      ro.rejection({
        code: "NOT_RESIZABLE",
        params: { label: entryLabel("base-hob-2drawer"), cause: "fixed" },
      }),
    ]);
  });

  // A disabled chip reaches neither `setWidth` nor the rejection banner (`WidthChoiceView` calls the store from
  // `onClick` alone); the command's own refusal is asserted beside it as the state the panel keeps the customer out of.
  it("keeps the command's refusal behind a chip that cannot be clicked", () => {
    const world = seededWorld();
    const section = widthSectionAt(world, "p2");
    if (section?.control !== "choice") throw new Error("expected chips");
    expect(section.chips.every((chip) => chip.isDisabled)).toBe(true);

    const refused = setWidth({
      design: world.design,
      catalog: world.catalog,
      columns: world.columns,
      target: { kind: "placement", id: "p2" },
      widthMm: 600,
      probe: PROBE,
      occurredAt: OCCURRED_AT,
    });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.reason.code).toBe("NOT_RESIZABLE");
  });

  /** The anti-invariant: `fixedWidth` and no set at all are different answers. A floor that excludes the only listed
   *  width is missing catalogue data, which a chipless section would make look like a constrained product; both
   *  conditions are asked at once. */
  it("still renders no section for a fixedWidth body whose floor empties its set", () => {
    const world = worldFrom(
      KITCHEN_L_DESIGN,
      catalogWith("base-hob-2drawer", { minWidthMm: 900 }),
    );
    expect(widthSectionAt(world, "p2")).toBeUndefined();
    // Non-vacuity: the same body in the same design does render once the floor is left alone.
    expect(widthSectionAt(seededWorld(), "p2")).toBeDefined();
  });
});

/** The label the engine's refusal names, read from the catalogue the same way `resolveResizableBody`
 *  reads it — the entry the row declares it is an instance of, never the seeded row's own id. */
function describeWidthLabelOf(world: World, id: string): BodyLabel {
  const record = world.records.find((candidate) => candidate.id === id);
  if (!record) throw new Error(`no record ${id}`);
  const equivalent = resolveCatalogEquivalent(world.catalog, record.buildId);
  const label = equivalent
    ? toInsertableBody(equivalent.buildId, equivalent.definition)?.label
    : undefined;
  if (label === undefined) throw new Error(`no label for ${id}`);
  return label;
}
