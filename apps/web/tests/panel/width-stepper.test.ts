// M5 wave 5D2c's §9 width control, swept over the shipped kitchen.
//
// **This file replaces `width-chips.adversarial.test.ts`, and its pinned chip counts retire with the
// chips** (ADR 0035's consequences list). 5D's 158 rendered chips and 51 free ones were measurements
// of a control that no longer exists: a cabinetry column now shows two buttons, not thirteen.
// What survives unchanged is the *mechanism* those numbers were measuring — `widthOptionsFor` and
// `widthStepsFor` both judge a candidate by running `setWidth` and discarding the design — so the
// property below is the same property in a stronger form.
//
// The two controls are ADR 0035 decision 3, and which one a selection gets is asserted here against
// the **catalogue's own declared ranges** rather than against the panel's derivation of them. That
// is the point of this file: `isSteppedColumn` reads the shape off the width *set* the column
// published, because `intersectColumnRanges` is module-private to `set-width.ts`, and a derivation
// nobody checks against the fact it derives is exactly how ADR 0035 decision 3 came to name
// `fixedWidth` as the discriminator for a day.
import {
  columnWidthChoices,
  deriveColumns,
  derivePlacementRecords,
  describeSelection,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  offersFor,
  recomputeVoids,
  renderRejection,
  resolveCatalogEquivalent,
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

import { ro } from "@/content/ro";
import { describePanel, type WidthSection } from "@/panel/panel-model";
import { widthStepsFor, WIDTH_STEP_MM } from "@lemnaria/configurator-domain";

import { createFakeBodyProbe } from "../support/fake-body-probe";

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
    meta: describeSelection({ ...world, target }),
    offers: offersFor({ ...world, target }),
    rejection: null,
    widthOptions: widthOptionsFor(engineInput),
    widthSteps: widthStepsFor(engineInput),
    widthRanges:
      columnWidthChoices({
        design: world.design,
        catalog: world.catalog,
        target,
      })?.widthRangesMm ?? [],
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

// -------------------------------------------------------------------------------------------
// ADR 0035 decision 3: which control, and why that one.
// -------------------------------------------------------------------------------------------

/** ADR 0035 decision 6: a hood is not a member for width purposes, so it neither narrows the column
 *  nor decides the control shape. Read off the resolved entry's `kind` rather than off an id list,
 *  the way the command reads it. */
const HOOD_KIND = "extractor_hood";

/** **The catalogue's own answer to "is this column's width free or a set?"**, computed here from the
 *  declared ranges the panel cannot reach, so the panel's derivation has something independent to be
 *  wrong against.
 *
 *  A column is free exactly when every member the width governs can be built across a *range* —
 *  ADR 0035 decision 3's "any range where `minMm < maxMm`". One discrete member fixes the whole
 *  column, which is decision 6's stated consequence: `p1`'s dishwasher takes `A|2.00` down to 450
 *  and 600, and the wall cabinet standing above it follows.
 *
 *  **Two memberships, and the hood is in neither the way the others are.** ADR 0035 decision 6 takes
 *  it out of the width membership entirely, so it neither narrows the column nor decides the control.
 *
 *  **The unresizable-member fallback is the column's, and it is stated here rather than assumed.**
 *  `columnWidthChoices` cannot intersect a column one of whose members has no §7 equivalent or is
 *  `fixedWidth` — the hob base under the hood, the fridge beside `p24` — so it falls back to the
 *  selected body's own declared widths and the panel shapes the control from those. Every button is
 *  then disabled naming the member in the way, which is ADR 0032 rather than a defect: a thirteen-chip
 *  row all dashed would say the same thing thirteen times. */
function columnHasFreeWidth(world: World, record: PlacementRecord): boolean {
  // **ADR 0049 first**, because it decides before the shape is read: a body that may not be resized
  // publishes the single width it is standing at, so its control is a set of one whatever ranges
  // its own row declares. `hood-600` is why this is stated rather than folded into the sweep below
  // — it is `fixedWidth` while its catalogue equivalent is bounded 600–800, so reading the ranges
  // alone would predict a stepper with two buttons that can never move.
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
  // **The correction that makes this test the point of the wave.** ADR 0035 decision 3 first named
  // `fixedWidth` as the discriminator and was corrected on 2026-08-28: the flag is `false` on both
  // discrete rows, `base-dishwasher` included, and cannot be set true there without making `p1`
  // unresizable and undoing §11 row 14. So the control is chosen by the *shape* of the width bound,
  // and this asserts the panel's choice against the catalogue's declared ranges rather than against
  // a second copy of the rule.
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
    // The guard, itemised rather than counted so a different split fails. Fifteen steppers, the
    // three members of `A|2.00` — the dishwasher niche, whose 450/600 is §11 row 14 and the only
    // discrete column the shipped kitchen holds — and ADR 0049's four `fixedWidth` bodies, which
    // land on the discrete control with no new branch: their ranges are degenerate, which is what
    // decision 3's discriminator already reads.
    //
    // **`p6` is the fifteenth stepper, and it is wave 5B8 criterion 3 seen from the panel.** It was
    // a `choice` at its single 600 until ADR 0048 gave the pantry a 400–800 bound; nothing in this
    // file changed to move it, which is decision 3's discriminator doing the work.
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

  // **The optional-field fallback, pinned as a decision rather than left as an accident.**
  // `DescribePanelInput.widthRanges` is optional and absent means the discrete choice — a caller that
  // has not resolved the column's shape has not earned a stepper, and a chip row with the right
  // widths is never wrong, only more clicks. That is defensible, and it is also the one way this
  // panel can now render a control the product does not want: `p0` is a stepper on the shipped
  // kitchen, and dropping the field turns it into thirteen chips with nothing failing.
  //
  // So the fallback is asserted here, on a body whose real control is the other one. What this test
  // buys is that a future change making it render *nothing*, or a stepper on faith, has to come back
  // and say so — and `asWidthChoice` in `tests/support/width-options.ts` throws for the same reason,
  // so a fixture that drifts into this state fails its chip assertions instead of skipping them.
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
      meta: describeSelection({ ...world, target }),
      offers: offersFor({ ...world, target }),
      rejection: null,
      widthOptions: widthOptionsFor(engineInput),
      widthSteps: widthStepsFor(engineInput),
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
    // And the real control on this body is the other one, which is what makes the fallback
    // observable here rather than vacuous.
    expect(widthSectionAt(world, "p0")?.control).toBe("stepper");
  });

  // ADR 0035 decision 3's own headline example, and the one a `fixedWidth` discriminator would have
  // got backwards in both directions: the dishwasher's flag is `false`, so a flag-based rule would
  // have put a stepper here — two dead buttons at 400 and 500, with the niche's own 600 unreachable
  // between them.
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

// -------------------------------------------------------------------------------------------
// The stepper's own shape, and the property that replaces 5D's chip counts.
// -------------------------------------------------------------------------------------------

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
      // The value label is the width the pair operates on, so the customer reads what the buttons
      // are moving rather than what the column's extent happens to be (ADR 0035 decision 6 lets
      // those differ on a mixed column).
      expect([record.id, section.valueLabel]).toEqual([
        record.id,
        `${String(record.widthMm)} mm`,
      ]);
    }
    expect(stepped).toBe(15);
  });

  // **The turned-over property, in the stronger form ADR 0035's consequences name.** 5D's version
  // was "every chip the panel marks `free` is a width `setWidth` accepts"; this one is "each button
  // is enabled if and only if the step it offers succeeds", asked of the command directly rather
  // than of the query the panel used — so a panel that stopped consulting the engine, or a query
  // that answered about a different width than the button carries, fails here.
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
        // §13.1: greyed and unclickable **with the reason**, and the sentence is the engine's own
        // through `renderRejection` — never copy authored in the panel (ADR 0032 rule 2). A button
        // that works carries none, because a reason beside a control that works is noise.
        expect([record.id, step.direction, step.reason]).toEqual([
          record.id,
          step.direction,
          result.ok ? undefined : renderRejection(result.reason),
        ]);
        buttons += 1;
        if (!step.isDisabled) enabled += 1;
      }
    }
    expect(buttons).toBe(30);
    // **The measurement that replaces 5D's "51 free chips".** Twelve of the fifteen steppers can
    // shrink on a kitchen nobody has edited — ADR 0035 decision 7's shrink funds itself out of the
    // space it vacates — and none can grow, because growth still has to consume space that already
    // exists and the shipped kitchen has no empty column at load. **Ten until ADR 0048**: the two
    // new ones are `p6` and `p23`, the pantry column, which was frozen by the seeded pantry's own
    // `fixedWidth` flag until the owner flipped it. The three that can do neither are `p19`, `p22`
    // and `p24`, each sharing a column with a `fixedWidth` body; their buttons are disabled naming
    // that body, which is the ADR 0032 arrangement doing its job.
    expect(enabled).toBe(12);
  });

  // Read-only takes the click and replaces the reason, on both buttons and on a button that works —
  // a browser that cannot write is not being told where its cabinet's bounds are, it is being told
  // it cannot edit. Asserted over the real kitchen because the enabled buttons above are what make
  // this test non-vacuous.
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

// -------------------------------------------------------------------------------------------
// FINDING R2.7's arrangement, at the panel. Carried over from `width-chips.adversarial.test.ts`
// unchanged: it is about whether a section exists at all, which neither control changed.
// -------------------------------------------------------------------------------------------

describe("a willing body with no widths gets no section, not an empty one", () => {
  // `canWidth` stays §9's literal rule and the emptiness is answered in `describeWidthSection` —
  // which is what makes missing catalogue data fail loudly at the section rather than silently at
  // the flag. Reached by breaking data: a seeded row whose pointer resolves to nothing.
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

/** ADR 0049, and the expectation this describe used to hold is the one the owner overturned on
 *  2026-09-01: these rendered **no** section, and the customer looking at a hob base got a
 *  vanished `LĂȚIME` with no explanation (report item 9). §13.1's "disable, don't warn" and
 *  ADR 0032 both say an unavailable thing is shown disabled **with its reason**, and this was the
 *  one place in the product where it was not.
 *
 *  p2 (hob base), p5 (oven tower), p7 (freestanding fridge) and p13 (hood) all resolve non-empty
 *  sets and are all `fixedWidth`. `p6` was the fifth until ADR 0048 made the seeded pantry
 *  resizable — it renders the stepper asserted above instead. What is still asserted, in the
 *  opposite direction, is that `canWidth` is not what decides: the flag is false on every one of
 *  them and the section renders anyway, from the widths the domain published. */
describe("a fixed-width body shows the one width it is made at", () => {
  it.each(["p2", "p5", "p7", "p13"])(
    "renders one disabled active chip with the engine's reason for %s",
    (id) => {
      const world = seededWorld();
      const record = world.records.find((candidate) => candidate.id === id);
      if (!record) throw new Error(`no record ${id}`);
      const meta = describeSelection({
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
      // The sentence is the engine's own, rendered through the very `renderRejection` a blocked
      // chip's reason goes through — never copy authored in the panel (ADR 0032 rule 2).
      expect(section.chips[0]?.reason).toBe(
        renderRejection({
          code: "NOT_RESIZABLE",
          params: { label: describeWidthLabelOf(world, id), cause: "fixed" },
        }),
      );
    },
  );

  // Report item 9's own body, at its own width: *Corp plită și 2 sertare* is a 600 mm cabinet
  // because the hob it carries is a 590 × 520 appliance (ADR 0027), and the section now says so.
  it("names the cabinet and the width in the sentence the customer reads", () => {
    const section = widthSectionAt(seededWorld(), "p2");
    if (section?.control !== "choice") throw new Error("expected chips");
    expect([section.chips[0]?.widthMm, section.chips[0]?.reason]).toEqual([
      600,
      "„Corp plită și 2 sertare” nu își poate schimba lățimea.",
    ]);
  });

  // **The chip is unclickable, which is what makes it change nothing.** `WidthChoiceView` renders
  // `disabled={chip.isDisabled}` and calls the store from `onClick` alone, so a disabled chip
  // reaches neither `setWidth` nor the rejection banner. The command's own refusal is asserted
  // beside it: this is the state the panel is keeping the customer out of, not one it invented.
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

  /** **The anti-invariant** (FINDING R2.7): `fixedWidth` and *no set at all* are different answers,
   *  and only the first one changed. A row whose declared floor excludes the only width it lists
   *  resolves nothing to build, which is missing catalogue data — and a chipless section would make
   *  broken data look like a constrained product. Both conditions are asked at once, because that
   *  is the input that would slip through if the flag were read before the set was resolved. */
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
function describeWidthLabelOf(world: World, id: string): string {
  const record = world.records.find((candidate) => candidate.id === id);
  if (!record) throw new Error(`no record ${id}`);
  const equivalent = resolveCatalogEquivalent(world.catalog, record.buildId);
  const label = equivalent
    ? toInsertableBody(equivalent.buildId, equivalent.definition)?.label
    : undefined;
  if (label === undefined) throw new Error(`no label for ${id}`);
  return label;
}
