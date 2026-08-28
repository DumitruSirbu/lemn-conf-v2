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
  deriveColumns,
  derivePlacementRecords,
  describeSelection,
  isPushOpenByDefault,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  KITCHEN_L_PLACEMENTS,
  offersFor,
  recomputeVoids,
  removePlacement,
  widthOptionsFor,
  type CommandTarget,
  type Design,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { offeredBuildIds } from "../support/offers";

import { describePanel, type PanelSection } from "@/panel/panel-model";

import { ro } from "@/content/ro";

import { REFUSAL } from "../support/selection-meta";

import { preMigrationHobDesign } from "../support/pre-migration-hob";

import { createFakeBodyProbe } from "../support/fake-body-probe";

/** Measures exactly what it was asked to build, so a resize the domain's guards accept is not then
 *  failed by the built-size re-check. */
const PROBE = createFakeBodyProbe();

const OCCURRED_AT = "2026-08-26T12:00:00.000Z";

/** Frozen exactly as the store freezes it — see the file header. */
const SEEDED_COLUMNS = deriveColumns(
  derivePlacementRecords(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG),
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
    meta,
    offers: offersFor({ ...world, target }),
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

/** M5 wave 5B. The seeded bodies that render a width section: §9's `canWidth` (not empty, not
 *  `fixedWidth`) narrowed by "resolves a non-empty width set through its declared
 *  `catalogEquivalentId`". Written out rather than computed, so the list is a statement of the
 *  acceptance criteria and not a second copy of the implementation.
 *
 *  The eight that are absent are absent for a stated reason: the four corners and the hob-bearing
 *  base are `fixedWidth`, and so are the two columns and the freestanding fridge. */
const SEEDED_IDS_WITH_A_WIDTH_SECTION: readonly string[] = [
  "p0",
  "p1",
  "p4",
  "p8",
  "p10",
  "p11",
  "p12",
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
  // §9's section 6 is "chips from `sizes`": a rendered width section with no chips offers nothing
  // to choose. This runs over the SHIPPED design rather than a fixture, because the fixtures give a
  // body [400, 600, 800] by hand, and whether the real kitchen's rows resolve one is the whole
  // question.
  it("gives every rendered width section at least one chip", () => {
    const world = worldFrom(KITCHEN_L_DESIGN);
    const rendered: string[] = [];
    const chipless: string[] = [];
    for (const record of world.records) {
      const section = sectionsAt(world, {
        kind: "placement",
        id: record.id,
      }).find((candidate) => candidate.kind === "width");
      if (!section) continue;
      rendered.push(record.id);
      if (section.chips.length === 0) chipless.push(record.id);
    }
    expect(chipless).toEqual([]);
    // The tripwire, turned over by M5 wave 5B rather than removed. It asserted `[]` — the sweep was
    // empty because no seeded entry had `sizesMm`, so nothing reached the chipless check above and
    // a zero-iteration sweep would have reported green forever. The widths have arrived, so the
    // same line now names exactly which bodies render the section: the check does real work, and a
    // row that silently stops resolving a set is a failure here rather than a section that quietly
    // disappears from the panel.
    expect(rendered).toEqual(SEEDED_IDS_WITH_A_WIDTH_SECTION);
  });

  // **Turned over in wave 5D, and the reason it turned over changed rather than the number.** M4
  // pinned "never free" because no resize command existed. `setWidth` exists now and these chips
  // carry its real verdicts — yet still none is free, because ADR 0031 funds a resize from an
  // adjacent column that is empty **at every level**, and clearing p1, p7, p12 and p24 empties no
  // column: p12 and p18 still stand in `A|2.00`, p23 in `B|1.80`, and so on.
  //
  // That is worth pinning rather than deleting. It is the measurement behind wave 5E's note that a
  // browser gate needs a delete in front of it, and the day a fixture ships with a genuinely empty
  // column this line fails and says so.
  it("marks no width chip free while no column is empty at every level", () => {
    const world = openedKitchen();
    const rendered: string[] = [];
    for (const target of everySelectableTarget(world)) {
      for (const section of sectionsAt(world, target)) {
        if (section.kind !== "width") continue;
        rendered.push(target.id);
        expect(section.chips.length).toBeGreaterThan(0);
        expect(section.chips.some((chip) => chip.state === "free")).toBe(false);
      }
    }
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

describe("the chips a seeded width section actually renders", () => {
  /** The rendered chip row per body, as the acceptance criteria state it. `p10` and `p24` are the
   *  `widthFlex: 'fit'` case §9 has to survive: both were built to their opening rather than to a
   *  member of their set, so their own width joins the row, sorted. */
  const EXPECTED_CHIPS_MM: Readonly<Record<string, readonly number[]>> = {
    p0: [600, 800], // base-sink-800 → base-sink (ADR 0017: no 400)
    // **p1 lost its 450 in wave 5D, and the loss is correct.** The dishwasher is made in 450 and
    // 600, but ADR 0031 resizes the whole of `A|2.00`, and `p18` — a `wall-cabinet`, ranges 200–400
    // and 600–800 — does not accept 450: it falls in ADR 0033's deliberate gap between a one-door
    // and a two-door. (The open shelf between them is a standard ladder and accepts 450 quite
    // happily; an earlier version of this comment blamed it, wrongly.) Offering 450 was the per-body
    // row over-offering; the intersection is what the command actually narrows against.
    p1: [600],
    // p4 gained a 300 for the mirror-image reason: `base-panbank` declares a standard ladder
    // (ADR 0031 rule 5), so it constrains the column by its floor alone, and the wall members above
    // it carry 300 in their own set. A per-body row could express neither half.
    p4: [300, 400, 600, 800],
    // `wall-1door` KEEPS its 400 — ADR 0029 is about two-door entries, and
    // a one-door cabinet at 400 mm is honest. Kept beside `p24` below, which lost its 400, so this
    // table tests the distinction rather than one side of it. ADR 0030's amendment then extended
    // the set *downward*, so `p10`'s own 300 is a member of it and nothing is folded in here any
    // more — `p24` is the last fold in the shipped kitchen.
    // ADR 0033: both resolve to the one merged `wall-cabinet` entry now. `p24` keeps its fold —
    // 700 is a width no wall entry declares, before the merge or after it.
    p10: [200, 300, 400, 600, 800],
    p24: [200, 300, 400, 600, 700, 800],
  };

  it("renders the column's widths, with a fit body's own width folded in", () => {
    const world = worldFrom(KITCHEN_L_DESIGN);
    for (const [id, expected] of Object.entries(EXPECTED_CHIPS_MM)) {
      const section = sectionsAt(world, { kind: "placement", id }).find(
        (candidate) => candidate.kind === "width",
      );
      if (section?.kind !== "width")
        throw new Error(`no width section on ${id}`);
      expect([id, section.chips.map((chip) => chip.widthMm)]).toEqual([
        id,
        expected,
      ]);
      // Exactly one chip is the body's current width, and it is the `active` one.
      expect(
        section.chips.filter((chip) => chip.state === "active").length,
      ).toBe(1);
    }
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
  it("offers neither a swap list, nor delete, nor width on any corner", () => {
    const world = worldFrom(KITCHEN_L_DESIGN);
    const corners = world.records.filter(isCorner);
    expect(corners.length).toBeGreaterThan(0);
    for (const corner of corners) {
      const panel = panelAt(world, { kind: "placement", id: corner.id });
      if (panel.kind !== "open") throw new Error("expected an open panel");
      // §13.1 and M4's acceptance criterion ("A corner return, which has no finish, handle or
      // width, shows none of those sections") leave a corner with none of §9's offer sections. The
      // one section that must remain is the structural explanation: §11 row 16 requires the refusal
      // to explain why, and a panel with nothing left to refuse would satisfy that by deleting the
      // question.
      expect([
        corner.id,
        panel.sections.map((section) => section.kind),
        panel.footer.canDelete,
      ]).toEqual([corner.id, ["structural"], false]);
    }
  });

  // §11 row 16's "refusal explains why", on a body that produces no refusal to carry it: with every
  // capability flag false there is nothing to tap and therefore nothing to refuse, so the
  // explanation has to be a section of its own. The reason is declared on the catalogue entry, which
  // is what makes it survive to the panel.
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

  // The explanation is an answer of last resort: nothing else in the kitchen may carry it, or it
  // becomes a second voice contradicting the sections beside it.
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
        offeredBuildIds(offersFor({ ...world, target })),
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

  // §11 row 24 against the body the fallback set was written for. The hob also refuses one guard
  // earlier (`canReplace: false`), so this asserts the outcome, not the mechanism.
  // ADR 0027: the shipped design's hob is a mesh inside `p2`'s body, so the accessory this rule is
  // about now only reaches the panel from a document saved before that migration.
  it("renders no replace section for the hob", () => {
    const world = worldFrom(preMigrationHobDesign());
    const hob = world.records.find(
      (record) => record.kind === "induction_cooktop",
    );
    expect(hob).toBeDefined();
    expect(
      sectionsAt(world, { kind: "placement", id: hob?.id ?? "" }).map(
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
