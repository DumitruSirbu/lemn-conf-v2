// ADR 0011 Gap D: the column map is frozen at load; re-deriving it from mutated records would free no space and a
// sweep over "the voids" would sweep nothing while green, so every sweep asserts it actually swept something.
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

/** Frozen exactly as the store freezes it (ADR 0011 Gap D). */
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
  const meta = describeSelection({ kitchenSettings: {}, ...world, target });
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
    // The engine's own verdicts: `widthOptionsFor` runs `setWidth` per candidate width, so the chips are the ones a
    // customer would tap.
    widthOptions: widthOptionsFor({
      design: world.design,
      catalog: world.catalog,
      columns: world.columns,
      target,
      probe: PROBE,
    }),
    // Both inputs are threaded from the engine (ADR 0035 decision 3): with `widthRanges` absent every section falls
    // back
    // to the discrete choice, and the sweeps would describe a control no customer sees.
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
    buildableWidthSpanMm: undefined,
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
        kitchenSettings: {},
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
    expect(swept).toBe(26);
    // The sweep must contain both answers, or it proves nothing about the boundary.
    expect(
      KITCHEN_L_PLACEMENTS.filter((placement) => placement.y0Mm >= 2200).length,
    ).toBeGreaterThan(0);
    expect(
      KITCHEN_L_PLACEMENTS.filter((placement) => placement.y0Mm < 2200).length,
    ).toBeGreaterThan(0);
  });

  // The scene hides handles by `isPushOpenByDefault(record.frame.y0)` and the panel marks the chip by
  // `meta.defaultHandle`; the two must agree.
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

/** The seeded bodies that render a width section: those resolving a non-empty width set through their declared
 *  `catalogEquivalentId`, resizable or not (ADR 0049). Written out rather than computed, so the list states the
 *  acceptance criteria and is not a second copy of the implementation; in `derivePlacementRecords` order.
 *  A `fixedWidth` body renders one `active` chip carrying `NOT_RESIZABLE`. The four corners (`p9`, `p21`, `p25`,
 *  `p26`) declare no catalogue equivalent and render none, which keeps failing loudly as a missing section. */
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
  // §9's section 6 is "a control with something in it": a stepper needs both buttons, a discrete choice at least one
  // chip (ADR 0035 decision 3). It runs over the shipped design because fixtures give widths by hand.
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
    // Names exactly which bodies render the section, so a row that silently stops resolving a set fails here instead of
    // vanishing from the panel.
    expect(rendered).toEqual(SEEDED_IDS_WITH_A_WIDTH_SECTION);
  });

  // Growth is reachable exactly where a clear left an empty column beside the body, because growth must consume space
  // that already exists; a shrink funds itself (ADR 0035 decision 7).
  // Clearing p7 and p24 empties the fridge column `B|2.45` beside the pantry column `B|1.80`, whose members are no
  // longer `fixedWidth` (ADR 0048), so the two pantry members are named rather than the claim weakened for everyone.
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
    // Not vacuous the other way either: shrinking is reachable from a standing start.
    expect(narrowings).toBeGreaterThan(0);
    // `openedKitchen` clears p1, p7, p12 and p24; the voids that replace them render no width section (§9 hides Lățime
    // on an empty slot), asserted by their absence.
    expect(rendered).toEqual(
      SEEDED_IDS_WITH_A_WIDTH_SECTION.filter(
        (id) => !["p1", "p7", "p12", "p24"].includes(id),
      ),
    );
  });
});

describe("what a seeded width control actually offers", () => {
  // 5D's `EXPECTED_CHIPS_MM` table is retired with the chips. The intersections are pinned in the domain's
  // `set-width.columns.test.ts` and the control kind in `width-stepper.test.ts`; this pins that the value shown is the
  // body's own width and the buttons step from it.
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

  // §13.1: an entry declaring no `catalogEquivalentId` resolves no set, and `describeWidthSection` declines rather than
  // rendering an empty row.
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

/** Every seeded body §13.1 calls a corner, read off the `buildId` so a corner added to the fixture is swept. */
const isCorner = (record: { readonly buildId: string }) =>
  record.buildId.includes("corner");

describe("§13.1's structural corners, as the seeded design ships them", () => {
  // §13.1: "Corners are structural. No replace, no delete, never a width donor" (§11 row 16). Asserted over the shipped
  // design because `cornerReturnMeta()` hand-builds a corner that already obeys the rule.
  it("offers a corner its colour, the structural explanation, and nothing else", () => {
    const world = worldFrom(KITCHEN_L_DESIGN);
    const corners = world.records.filter(isCorner);
    expect(corners.length).toBeGreaterThan(0);
    for (const corner of corners) {
      const panel = panelAt(world, { kind: "placement", id: corner.id });
      if (panel.kind !== "open") throw new Error("expected an open panel");
      // §13.1's refusals still hold: no `replace`, no `width`, `canDelete` false. `finish` is the one exception (ADR
      // 0021
      // decision 2, finish half reversed; see SUPERSESSIONS.md), and the structural explanation stays beside it (§11
      // row 16).
      expect([
        corner.id,
        panel.sections.map((section) => section.kind),
        panel.footer.canDelete,
      ]).toEqual([corner.id, ["structural", "finish"], false]);
    }
  });

  // §11 row 16's "refusal explains why" on a body that produces no refusal: replace, delete and width offer nothing to
  // tap, so the explanation is a section of its own, declared on the catalogue entry.
  it("explains why, on all four seeded corners", () => {
    const world = worldFrom(KITCHEN_L_DESIGN);
    const corners = world.records.filter(isCorner);
    // §11 row 16 names the *base* corner: this count dropping back to 2 means the reported defect (tapping the base
    // corner does nothing) has returned (ADR 0025).
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
  // ADR 0011 Gap A gives every seeded placement a non-insertable `buildId`, so identity against the offer's id badges
  // nothing on a fresh load; the equivalence is declared on the entry, which a fixture cannot reproduce.
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
    // Both arms must be exercised or the sweep proves nothing about either.
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
