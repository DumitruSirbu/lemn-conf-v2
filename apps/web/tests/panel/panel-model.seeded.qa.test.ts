// The panel over the **real** seeded kitchen, sweeping every placement and every derived slot.
//
// `selection-meta.ts`'s fixtures are the implementer's model of what a body looks like. This file
// asks the shipped design the same questions: a fixture that disagrees with the seeded population is
// a test that will stay green while the product is wrong.
//
// ADR 0011 Gap D: the column map is frozen at load time. Re-deriving it from mutated records shrinks
// every column to what is left, a removal then frees no space, and a sweep over "the voids" sweeps
// nothing while reporting green. Every sweep below asserts it actually swept something.
import {
  cabinetDepthMmOf,
  deriveColumns,
  derivePlacementRecords,
  describeSelection,
  isPushOpenByDefault,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  KITCHEN_L_PLACEMENTS,
  columnWidthChoices,
  offersFor,
  recomputeVoids,
  removePlacement,
  widthOptionsFor,
  type CommandTarget,
  type Design,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { offerBuildIds } from "../support/offers";

import { describePanel, type PanelSection } from "@/panel/panel-model";
import { widthStepsFor } from "@lemnaria/configurator-domain";

import { ro } from "../support/romanian-content";

import { REFUSAL } from "../support/selection-meta";

import { createFakeBodyProbe } from "../support/fake-body-probe";
import { PAL_KITCHEN } from "../support/panel-material";

/** Measures exactly what it was asked to build, so a resize the domain's guards accept is not then
 *  failed by the built-size re-check. */
const PROBE = createFakeBodyProbe();

const OCCURRED_AT = "2026-08-26T12:00:00.000Z";

/** Frozen exactly as the store freezes it — see the file header. */
const SEEDED_COLUMNS = deriveColumns(
  derivePlacementRecords(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG),

  {},
  KITCHEN_L_DESIGN.room,
);

function worldFrom(design: Design) {
  const records = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG);
  return {
    design,
    records,
    columns: SEEDED_COLUMNS,
    voids: recomputeVoids(records, SEEDED_COLUMNS),
    catalog: KITCHEN_L_BODY_CATALOG,
  };
}

type World = ReturnType<typeof worldFrom>;

function clear(placementIds: readonly string[]): World {
  const design = placementIds.reduce<Design>((current, id) => {
    const result = removePlacement({
      design: current,
      catalog: KITCHEN_L_BODY_CATALOG,
      target: { kind: "placement", id },
      occurredAt: OCCURRED_AT,
    });
    if (!result.ok)
      throw new Error(`could not remove ${id}: ${result.reason.code}`);
    return result.design;
  }, KITCHEN_L_DESIGN);
  return worldFrom(design);
}

function panelAt(
  world: World,
  target: CommandTarget,
  rejection = null as Parameters<typeof describePanel>[0]["rejection"],
) {
  const meta = describeSelection({ ...world, target });
  return describePanel({
    content: ro,
    material: PAL_KITCHEN,
    meta,
    offers: offersFor({
      ...world,
      target,
      cabinetDepthMm: cabinetDepthMmOf(world.design),
    }),
    rejection,
    // The engine's own verdicts, not a stand-in: `widthOptionsFor` runs `setWidth` once per
    // candidate width against this design and these frozen columns. A sweep over the *shipped*
    // kitchen is only worth running if the chips in it are the ones a customer would tap.
    widthOptions: widthOptionsFor({
      design: world.design,
      catalog: world.catalog,
      columns: world.columns,
      target,
      probe: PROBE,
    }),
    // **Both of ADR 0035 decision 3's inputs, from the engine.** They are threaded here rather than
    // left off because this file's subject is the SHIPPED kitchen: with `widthRanges` absent every
    // section falls back to the discrete choice, and the sweeps below would then describe a control
    // no customer ever sees while reporting green — the exact failure this milestone has shipped
    // twice in copy.
    widthRanges:
      columnWidthChoices({
        design: world.design,
        catalog: world.catalog,
        target,
      })?.widthRangesMm ?? [],
    widthSteps: widthStepsFor({
      design: world.design,
      catalog: world.catalog,
      columns: world.columns,
      target,
      probe: PROBE,
    }),
    isBodyProbeAttached: true,
    canWrite: true,
    saveStatus: "idle",
  });
}

function sectionsAt(world: World, target: CommandTarget): PanelSection[] {
  const panel = panelAt(world, target);
  return panel.kind === "open" ? [...panel.sections] : [];
}

function everySelectableTarget(world: World): CommandTarget[] {
  return [
    ...world.records.map((record) => ({
      kind: "placement" as const,
      id: record.id,
    })),
    ...world.voids.map((record) => ({ kind: "void" as const, id: record.id })),
  ];
}

/** A world with three columns opened up, so the sweeps below see slots as well as bodies. */
function openedKitchen(): World {
  const world = clear(["p7", "p24", "p1", "p12"]);
  expect(world.voids.length).toBeGreaterThan(0);
  return world;
}

describe("§6.5's default handle, against every seeded placement's own y0", () => {
  it("agrees with the module line each body actually stands on", () => {
    const world = worldFrom(KITCHEN_L_DESIGN);
    let swept = 0;
    for (const placement of KITCHEN_L_PLACEMENTS) {
      const meta = describeSelection({
        ...world,
        target: { kind: "placement", id: placement.id },
      });
      // Derived from the design's own millimetres, not from the record the query read.
      const expected = placement.y0Mm >= 2200 ? "push" : "steel";
      expect([placement.id, meta?.defaultHandle]).toEqual([
        placement.id,
        expected,
      ]);
      swept += 1;
    }
    // ADR 0025 added the two base corner legs; ADR 0027 merged the hob into its host and took one
    // placement back out again.
    expect(swept).toBe(26);
    // The sweep must contain both answers, or it proves nothing about the boundary.
    expect(
      KITCHEN_L_PLACEMENTS.filter((placement) => placement.y0Mm >= 2200).length,
    ).toBeGreaterThan(0);
    expect(
      KITCHEN_L_PLACEMENTS.filter((placement) => placement.y0Mm < 2200).length,
    ).toBeGreaterThan(0);
  });

  // The scene hides handles by `isPushOpenByDefault(record.frame.y0)`; the panel marks the chip by
  // `meta.defaultHandle`. If those two ever disagree the customer sees a chip that is not what is
  // rendered — the exact failure `defaultHandle` was added to prevent.
  it("marks the chip the scene is actually rendering, for every body with handles", () => {
    const world = worldFrom(KITCHEN_L_DESIGN);
    let swept = 0;
    for (const record of world.records) {
      if (!record.canHandle) continue;
      const section = sectionsAt(world, {
        kind: "placement",
        id: record.id,
      }).find((candidate) => candidate.kind === "handle");
      if (section?.kind !== "handle") throw new Error("no handle section");
      const active = section.chips
        .filter((chip) => chip.isActive)
        .map((chip) => chip.value);
      const rendered = isPushOpenByDefault(record.frame.y0) ? "push" : "steel";
      expect([record.id, active]).toEqual([record.id, [rendered]]);
      swept += 1;
    }
    expect(swept).toBeGreaterThan(0);
  });

  // §11 row 13: a chosen handle survives, and beats the default.
  it("lets a chosen handle beat the default on a top-row body", () => {
    const chosen: Design = {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.map((placement) =>
        placement.id === "p15"
          ? { ...placement, body: { ...placement.body, handle: "steel" } }
          : placement,
      ),
    };
    const section = sectionsAt(worldFrom(chosen), {
      kind: "placement",
      id: "p15",
    }).find((candidate) => candidate.kind === "handle");
    if (section?.kind !== "handle") throw new Error("no handle section");
    expect(
      section.chips.filter((chip) => chip.isActive).map((chip) => chip.value),
    ).toEqual(["steel"]);
    expect(section.note).toBeUndefined();
  });
});

/** M5 wave 5B, **widened by ADR 0049**. The seeded bodies that render a width section: one that
 *  resolves a non-empty width set through its declared `catalogEquivalentId`, whether or not it may
 *  be resized. Written out rather than computed, so the list is a statement of the acceptance
 *  criteria and not a second copy of the implementation, and in `derivePlacementRecords` order so a
 *  sweep can compare against it directly.
 *
 *  **The five `fixedWidth` bodies joined this list on 2026-09-01** — `p2` the hob base, `p5` and
 *  `p6` the two columns, `p7` the freestanding fridge, `p13` the hood. Each renders one `active`
 *  chip at the width it is made at, carrying the engine's `NOT_RESIZABLE` sentence, because a
 *  section that vanishes tells the customer nothing.
 *
 *  The four that remain absent are the corners (`p9`, `p21`, `p25`, `p26`): they declare no
 *  catalogue equivalent, resolve no set at all, and that is missing-data-shaped rather than a fact
 *  about a cabinet, so it keeps failing loudly as no section. */
const SEEDED_IDS_WITH_A_WIDTH_SECTION: readonly string[] = [
  "p0",
  "p1",
  "p2",
  "p4",
  "p5",
  "p6",
  "p7",
  "p8",
  "p10",
  "p11",
  "p12",
  "p13",
  "p14",
  "p15",
  "p16",
  "p17",
  "p18",
  "p19",
  "p20",
  "p22",
  "p23",
  "p24",
];

describe("the width section over the real kitchen", () => {
  // §9's section 6 is "a control with something in it": a rendered width section that offers nothing
  // to choose is worse than no section. **Wave 5D2c makes that two questions rather than one**
  // (ADR 0035 decision 3) — a stepper is complete when it has both its buttons, a discrete choice
  // when it has at least one chip — so it is asked of whichever control the selection got.
  //
  // This runs over the SHIPPED design rather than a fixture, because the fixtures give a body its
  // widths by hand and whether the real kitchen's rows resolve any is the whole question.
  it("gives every rendered width section a control with something in it", () => {
    const world = worldFrom(KITCHEN_L_DESIGN);
    const rendered: string[] = [];
    const empty: string[] = [];
    for (const record of world.records) {
      const section = sectionsAt(world, {
        kind: "placement",
        id: record.id,
      }).find((candidate) => candidate.kind === "width");
      if (section?.kind !== "width") continue;
      rendered.push(record.id);
      const controlSize =
        section.control === "stepper"
          ? section.steps.length
          : section.chips.length;
      if (controlSize === 0) empty.push(record.id);
    }
    expect(empty).toEqual([]);
    // The tripwire, turned over by M5 wave 5B rather than removed. It asserted `[]` — the sweep was
    // empty because no seeded entry had `sizesMm`, so nothing reached the check above and a
    // zero-iteration sweep would have reported green forever. The widths have arrived, so the same
    // line now names exactly which bodies render the section: a row that silently stops resolving a
    // set is a failure here rather than a section that quietly disappears from the panel.
    expect(rendered).toEqual(SEEDED_IDS_WITH_A_WIDTH_SECTION);
  });

  // **Turned over three times, and each turn is a decision arriving.** M4 pinned "never free"
  // because no resize command existed. Wave 5D gave the control `setWidth`'s real verdicts and the
  // number held, because ADR 0031 funded a resize from an adjacent column empty at **every** level
  // and clearing p1, p7, p12 and p24 empties none. **ADR 0035 decision 7** then made a shrink fund
  // itself out of the space it vacates, so narrowing became reachable with no empty column anywhere.
  //
  // What survives all three: **growth is reachable exactly where a clear left an empty column
  // beside the body**, because growth still has to consume space that already exists. Wave 5D2c
  // makes that one sentence about both controls — the `+50` is disabled, and no chip above the
  // active one is free.
  //
  // **Turned over a fourth time by ADR 0048, and the exception is the decision.** Clearing p7 and
  // p24 empties the fridge column `B|2.45`, which stands next to the pantry column `B|1.80`. Every
  // member of that column was frozen by the seeded pantry's own `fixedWidth` flag until the owner
  // flipped it on 2026-09-01, so the empty space next door funded nothing and "no widening
  // anywhere" held. It funds the pantry column now — which is report item 8 working — so the two
  // members of that column are named here rather than the claim being weakened for everyone.
  const PANTRY_COLUMN_IDS = ["p23", "p6"];

  it("offers widening only where a clear left space, which is the pantry column", () => {
    const world = openedKitchen();
    const rendered: string[] = [];
    const widenings: string[] = [];
    let narrowings = 0;
    for (const target of everySelectableTarget(world)) {
      for (const section of sectionsAt(world, target)) {
        if (section.kind !== "width") continue;
        rendered.push(target.id);
        if (section.control === "stepper") {
          if (!section.steps[1].isDisabled) widenings.push(target.id);
          if (!section.steps[0].isDisabled) narrowings += 1;
          continue;
        }
        const active = section.chips.find((chip) => chip.state === "active");
        for (const chip of section.chips) {
          if (chip.state !== "free") continue;
          if (chip.widthMm > (active?.widthMm ?? 0)) {
            widenings.push(target.id);
            continue;
          }
          narrowings += 1;
        }
      }
    }
    expect([...new Set(widenings)].sort()).toEqual(PANTRY_COLUMN_IDS);
    // And the sweep is not vacuous the other way either: shrinking is reachable from a standing
    // start, which is the whole of what decision 7 buys.
    expect(narrowings).toBeGreaterThan(0);
    // The second tripwire, turned over the same way. `openedKitchen` clears p1, p7, p12 and p24, so
    // the four of them are gone from the sweep and the derived voids that replaced them render no
    // width section at all — §9 hides Lățime on an empty slot, and that is asserted here by their
    // absence rather than assumed.
    expect(rendered).toEqual(
      SEEDED_IDS_WITH_A_WIDTH_SECTION.filter(
        (id) => !["p1", "p7", "p12", "p24"].includes(id),
      ),
    );
  });
});

describe("what a seeded width control actually offers", () => {
  // **5D's `EXPECTED_CHIPS_MM` table is retired here, with the chips it described** (ADR 0035's
  // consequences: "the pinned chip counts and the three pinned rows in 5D's tests go with the
  // chips"). It named the whole intersection per body — `p0`'s 600–800, `p4`'s 300–800, `p10`'s
  // 200–800 — which a two-button control no longer renders and therefore no longer proves. Those
  // intersections are still pinned where they are computed, in the domain's own
  // `set-width.columns.test.ts`; which *control* each column gets, and against the catalogue's own
  // declared ranges, is pinned in `width-stepper.test.ts`.
  //
  // What is left for this file is the half neither of those covers: on the shipped design, the value
  // the customer reads is the body's own width, and it is the width the buttons step from.
  it("shows each body its own width, and steps from it", () => {
    const world = worldFrom(KITCHEN_L_DESIGN);
    let checked = 0;
    for (const record of world.records) {
      const section = sectionsAt(world, {
        kind: "placement",
        id: record.id,
      }).find((candidate) => candidate.kind === "width");
      if (section?.kind !== "width") continue;
      checked += 1;
      expect([record.id, section.valueLabel]).toEqual([
        record.id,
        `${String(record.widthMm)} mm`,
      ]);
      if (section.control === "stepper") {
        expect([record.id, section.steps.map((step) => step.widthMm)]).toEqual([
          record.id,
          [record.widthMm - 50, record.widthMm + 50],
        ]);
        continue;
      }
      // A discrete column marks the width the body stands at, and marks exactly one.
      expect([
        record.id,
        section.chips
          .filter((chip) => chip.state === "active")
          .map((chip) => chip.widthMm),
      ]).toEqual([record.id, [record.widthMm]]);
    }
    expect(checked).toBe(SEEDED_IDS_WITH_A_WIDTH_SECTION.length);
  });

  // §13.1, and the five entries that deliberately declare no `catalogEquivalentId`: a body with no
  // catalogue equivalent resolves no set, and `describeWidthSection` declines rather than rendering
  // an empty row. Asserted over the shipped design, because that is the population that has them.
  it("renders no width section for a body with no catalogue equivalent", () => {
    const world = worldFrom(KITCHEN_L_DESIGN);
    const withoutEquivalent = world.records.filter(
      (record) =>
        KITCHEN_L_BODY_CATALOG.get(record.buildId)?.catalogEquivalentId ===
        undefined,
    );
    expect(withoutEquivalent.length).toBeGreaterThan(0);
    for (const record of withoutEquivalent) {
      const section = sectionsAt(world, {
        kind: "placement",
        id: record.id,
      }).find((candidate) => candidate.kind === "width");
      expect([record.id, section]).toEqual([record.id, undefined]);
    }
  });
});

/** Every seeded body §13.1 calls a corner: the two wall returns and, since ADR 0025, the two base
 *  legs of the L. Read off the `buildId` rather than a hardcoded id list so a corner added to the
 *  fixture is swept by these tests instead of quietly escaping them. */
const isCorner = (record: { readonly buildId: string }) =>
  record.buildId.includes("corner");

describe("§13.1's structural corners, as the seeded design ships them", () => {
  // §13.1: "Corners are structural. No replace, no delete, never a width donor", and §11 row 16
  // repeats it. Asserted over the SHIPPED design, because `cornerReturnMeta()` in
  // `tests/support/selection-meta.ts` hand-builds a corner that already obeys the rule: only the
  // seeded entries can show whether the real catalogue data earns the corner its structural
  // treatment.
  it("offers a corner its colour, the structural explanation, and nothing else", () => {
    const world = worldFrom(KITCHEN_L_DESIGN);
    const corners = world.records.filter(isCorner);
    expect(corners.length).toBeGreaterThan(0);
    for (const corner of corners) {
      const panel = panelAt(world, { kind: "placement", id: corner.id });
      if (panel.kind !== "open") throw new Error("expected an open panel");
      // §13.1's three refusals — replace, delete, width donor — still hold, and are what this
      // asserts: no `replace`, no `width`, and `canDelete` false in the footer.
      //
      // **`finish` is the exception the owner made on 2026-09-09**, and it is the only one. M4's
      // acceptance criterion said "a corner return, which has no finish, handle or width, shows none
      // of those sections"; the owner's picture is why that changed — a corner left on the
      // material's white inside a coloured kitchen, with no control anywhere to fix it.
      //
      // The structural explanation stays beside it. §11 row 16 requires the refusal to explain why,
      // and a corner that offers *one* of §9's four sections still owes the customer the sentence
      // about the other three.
      expect([
        corner.id,
        panel.sections.map((section) => section.kind),
        panel.footer.canDelete,
      ]).toEqual([corner.id, ["structural", "finish"], false]);
    }
  });

  // §11 row 16's "refusal explains why", on a body that produces no refusal to carry it: replace,
  // delete and width offer nothing to tap and therefore nothing to refuse, so the explanation has to
  // be a section of its own. The reason is declared on the catalogue entry, which is what makes it
  // survive to the panel — and, since the corner started offering *Finisaj*, what keeps it there
  // rather than letting one live section stand in for an answer to the other three.
  it("explains why, on all four seeded corners", () => {
    const world = worldFrom(KITCHEN_L_DESIGN);
    const corners = world.records.filter(isCorner);
    // ADR 0025: two wall returns and, since the base legs became placements, the two base legs.
    // §11 row 16 names the *base* corner specifically, so this count dropping back to 2 means the
    // reported defect — tapping the base corner does nothing — has returned.
    expect(corners.length).toBe(4);
    for (const corner of corners) {
      const section = sectionsAt(world, {
        kind: "placement",
        id: corner.id,
      }).find((candidate) => candidate.kind === "structural");
      if (section?.kind !== "structural")
        throw new Error(`no structural section on ${corner.id}`);
      expect([corner.id, section.message]).toEqual([
        corner.id,
        ro.panel.structuralReasons.corner,
      ]);
    }
  });

  // Nothing else in the kitchen may carry it: the sentence names a refusal only the corner makes, so
  // a second body showing it would be explaining a rule it does not obey.
  it("shows the explanation nowhere else in the kitchen", () => {
    const world = openedKitchen();
    const explained: string[] = [];
    for (const target of everySelectableTarget(world)) {
      const hasStructural = sectionsAt(world, target).some(
        (section) => section.kind === "structural",
      );
      if (hasStructural) explained.push(target.id);
    }
    const corners = world.records.filter(isCorner).map((record) => record.id);
    expect(explained.sort()).toEqual([...corners].sort());
  });
});

describe("§9's ACTUAL badge over the real kitchen", () => {
  // §9 badges the current row ACTUAL rather than hiding it. ADR 0011 Gap A gives every seeded
  // placement a NON-insertable `buildId`, so identity against the offer's id badges nothing on a
  // freshly loaded design — the badge would appear only after a body had been swapped once. The
  // equivalence is declared on the seeded entry instead, and this counts badges over the shipped
  // design because a fixture cannot reproduce that mismatch.
  it("badges exactly one row on every seeded body that has a catalogue equivalent", () => {
    const world = worldFrom(KITCHEN_L_DESIGN);
    let badged = 0;
    let unbadged = 0;
    for (const record of world.records) {
      const offers = offersFor({
        ...world,
        target: { kind: "placement", id: record.id },
        cabinetDepthMm: cabinetDepthMmOf(world.design),
      });
      if (offers.length === 0) continue;
      const current = offers.filter((candidate) => candidate.isCurrent);
      const equivalent = KITCHEN_L_BODY_CATALOG.get(
        record.buildId,
      )?.catalogEquivalentId;
      if (equivalent === undefined) {
        expect([record.id, current.length]).toEqual([record.id, 0]);
        unbadged += 1;
        continue;
      }
      expect([
        record.id,
        current.map((candidate) => candidate.buildId),
      ]).toEqual([record.id, [equivalent]]);
      badged += 1;
    }
    // The count that was zero before the fix. Both arms must be exercised or the sweep proves
    // nothing about either.
    expect(badged).toBeGreaterThan(0);
    expect(badged + unbadged).toBeGreaterThan(0);
  });

  // A void has no occupant, so nothing may be badged ACTUAL in a "Pune un corp aici" list.
  it("badges no row in any derived slot", () => {
    const world = openedKitchen();
    let swept = 0;
    for (const record of world.voids) {
      const offers = offersFor({
        ...world,
        target: { kind: "void", id: record.id },
        cabinetDepthMm: cabinetDepthMmOf(world.design),
      });
      expect([
        record.id,
        offers.filter((offer) => offer.isCurrent).length,
      ]).toEqual([record.id, 0]);
      swept += 1;
    }
    expect(swept).toBeGreaterThan(0);
  });

  // The badge reaches the panel row, not only the offer value.
  it("carries the badge through to the rendered swap row", () => {
    const world = worldFrom(KITCHEN_L_DESIGN);
    const section = sectionsAt(world, { kind: "placement", id: "p11" }).find(
      (candidate) => candidate.kind === "replace",
    );
    if (section?.kind !== "replace") throw new Error("no replace section");
    expect(
      section.rows.filter((row) => row.isCurrent).map((row) => row.buildId),
    ).toEqual(["wall-cabinet"]);
  });
});

describe("the panel is exactly the offer list, everywhere in the kitchen", () => {
  it("adds no row and drops none, over bodies and slots alike", () => {
    const world = openedKitchen();
    let sweptBodies = 0;
    let sweptSlots = 0;
    for (const target of everySelectableTarget(world)) {
      const section = sectionsAt(world, target).find(
        (candidate) => candidate.kind === "replace",
      );
      if (section?.kind !== "replace") continue;
      if (target.kind === "void") sweptSlots += 1;
      else sweptBodies += 1;
      expect(section.rows.map((row) => row.buildId)).toEqual(
        offerBuildIds(
          offersFor({
            ...world,
            target,
            cabinetDepthMm: cabinetDepthMmOf(world.design),
          }),
        ),
      );
    }
    expect(sweptBodies).toBeGreaterThan(0);
    expect(sweptSlots).toBeGreaterThan(0);
  });

  it("keeps the count/empty line exclusive, and free of a bare 0, everywhere", () => {
    const world = openedKitchen();
    let swept = 0;
    for (const target of everySelectableTarget(world)) {
      const section = sectionsAt(world, target).find(
        (candidate) => candidate.kind === "replace",
      );
      if (section?.kind !== "replace") continue;
      swept += 1;
      expect(section.countLine === undefined).toBe(section.rows.length === 0);
      expect(section.emptyLine === undefined).toBe(section.rows.length > 0);
      const line = section.countLine ?? section.emptyLine ?? "";
      expect(line).not.toMatch(/(^|\s)0(\s|$)/);
    }
    expect(swept).toBeGreaterThan(0);
  });

  it("hides finish, handle and width on every derived slot", () => {
    const world = openedKitchen();
    let swept = 0;
    for (const record of world.voids) {
      const kinds = sectionsAt(world, { kind: "void", id: record.id }).map(
        (section) => section.kind,
      );
      expect([record.id, kinds]).toEqual([record.id, ["replace"]]);
      swept += 1;
    }
    expect(swept).toBeGreaterThan(0);
  });

  it("puts a refusal first on every selectable thing in the kitchen", () => {
    const world = openedKitchen();
    let swept = 0;
    for (const target of everySelectableTarget(world)) {
      const panel = panelAt(world, target, REFUSAL);
      if (panel.kind !== "open") throw new Error("expected an open panel");
      expect(panel.sections[0]?.kind).toBe("rejection");
      swept += 1;
    }
    expect(swept).toBeGreaterThan(0);
  });

  // §11 row 24 / §11 row 16 against the corner leg, which declares `canReplace: false`. This
  // asserts the outcome, not the mechanism. ADR 0027 folded the hob into `p2`'s body and ADR 0038
  // retired the document that carried it separately, so the bodies in this position are now exactly
  // the four corner bodies — `p25`, `p26`, `p9` and `p21`. `p25` stands for all four.
  it("renders no replace section for the corner leg", () => {
    const world = worldFrom(KITCHEN_L_DESIGN);
    expect(
      sectionsAt(world, { kind: "placement", id: "p25" }).map(
        (section) => section.kind,
      ),
    ).not.toContain("replace");
  });

  it("closes the panel for an id that no longer resolves", () => {
    const world = openedKitchen();
    for (const target of [
      { kind: "placement" as const, id: "p7" },
      { kind: "void" as const, id: "A|9.99:v0:0.00" },
    ]) {
      expect(panelAt(world, target, REFUSAL)).toEqual({ kind: "closed" });
    }
  });
});
