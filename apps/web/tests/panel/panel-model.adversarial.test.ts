// The panel model driven by the **real** seeded design rather than by `meta` fixtures.
//
// `panel-model.test.ts` proves the model given a `meta`; this proves the three modules agree when
// wired the way the app wires them — `describeSelection` → `offersFor` → `describePanel`. The
// distinction earns its keep: every §9 rule the panel is accused of breaking historically was
// broken by the *list it was handed*, not by its rendering (a wall body in a base set, a fallback
// set for the hob, `base-sink` offered into an opening it cannot build).
import {
  deriveColumns,
  derivePlacementRecords,
  describeSelection,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  normaliseBand,
  offersFor,
  recomputeVoids,
  removePlacement,
  type CommandTarget,
  type Design,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { describePanel, type PanelSection } from "@/panel/panel-model";

import { preMigrationHobDesign } from "../support/pre-migration-hob";

const OCCURRED_AT = "2026-08-26T12:00:00.000Z";

/** ADR 0011 Gap D: columns are frozen at load time. Re-deriving them from the mutated records
 *  shrinks each column to what is left, so a delete frees space that produces no void at all — and
 *  the symptom is an empty offer list, not a column error. The store freezes them; so does this. */
const SEEDED_COLUMNS = deriveColumns(
  derivePlacementRecords(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG),
);

function worldFrom(design: Design) {
  const records = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG);
  return {
    records,
    columns: SEEDED_COLUMNS,
    voids: recomputeVoids(records, SEEDED_COLUMNS),
    catalog: KITCHEN_L_BODY_CATALOG,
  };
}

type World = ReturnType<typeof worldFrom>;

function panelAt(world: World, target: CommandTarget) {
  return describePanel({
    meta: describeSelection({ ...world, target }),
    offers: offersFor({ ...world, target }),
    rejection: null,
    isBodyProbeAttached: true,
    canWrite: true,
    saveStatus: "idle",
  });
}

function replaceSectionAt(world: World, target: CommandTarget) {
  const panel = panelAt(world, target);
  if (panel.kind !== "open") return undefined;
  return panel.sections.find(
    (section): section is Extract<PanelSection, { kind: "replace" }> =>
      section.kind === "replace",
  );
}

/** The seeded kitchen with a set of bodies removed, columns frozen as the store freezes them. */
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

describe("the panel over the seeded kitchen", () => {
  // §9: "a wall body must never appear in a base list". This shipped broken once as
  // *Etajeră bază deschisă* in the base set.
  it("never puts a body of another band in an occupied body's swap list", () => {
    const world = worldFrom(KITCHEN_L_DESIGN);
    let checked = 0;
    for (const record of world.records) {
      const section = replaceSectionAt(world, {
        kind: "placement",
        id: record.id,
      });
      if (!section) continue;
      checked += 1;
      for (const row of section.rows) {
        const offered = world.catalog.get(row.buildId);
        expect(offered).toBeDefined();
        expect(normaliseBand(offered?.band ?? "base")).toBe(
          normaliseBand(record.band),
        );
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  // §11 row 24 against the real hob, which is the body the fallback set was written for.
  // ADR 0027: the shipped design's hob is a mesh inside `p2`'s body, so the accessory this rule is
  // about now only reaches the panel from a document saved before that migration.
  it("renders no replace section for the hob", () => {
    const world = worldFrom(preMigrationHobDesign());
    const hob = world.records.find(
      (record) => record.kind === "induction_cooktop",
    );
    expect(hob).toBeDefined();
    expect(
      replaceSectionAt(world, { kind: "placement", id: hob?.id ?? "" }),
    ).toBeUndefined();
  });

  it("gives every seeded body a header line naming its wall, band and size", () => {
    const world = worldFrom(KITCHEN_L_DESIGN);
    for (const record of world.records) {
      const panel = panelAt(world, { kind: "placement", id: record.id });
      expect(panel.kind).toBe("open");
      if (panel.kind !== "open") continue;
      expect(panel.header.label.length).toBeGreaterThan(0);
      expect(panel.header.detail).toContain(`Perete ${record.wall}`);
      expect(panel.header.detail).toContain(`${String(record.widthMm)} ×`);
    }
  });

  // §10's signature flow, step 3: the cleared fridge column's base slot offers base bodies and
  // full-height ones, and the count line reports what the list actually holds.
  it("counts the cleared fridge column's base slot from its own rows", () => {
    const world = clear(["p7", "p24"]);
    expect(world.voids.length).toBeGreaterThan(0);
    const baseSlot = world.voids.find(
      (record) => record.col === "B|2.45" && record.y0 < 0.2,
    );
    expect(baseSlot).toBeDefined();
    const section = replaceSectionAt(world, {
      kind: "void",
      id: baseSlot?.id ?? "",
    });
    expect(section?.title).toBe("Pune un corp aici");
    expect(section?.rows.length).toBeGreaterThan(0);
    expect(section?.countLine).toBe(
      `${String(section?.rows.length ?? 0)} corpuri intră în ${String(Math.round((baseSlot?.w ?? 0) * 1000))} × ${String(Math.round((baseSlot?.h ?? 0) * 1000))} mm`,
    );
  });

  // Every row the panel offers must be a row the engine's own fit evaluation produced — the panel
  // adds no row of its own, and drops none.
  it("offers exactly what offersFor returned, for every selectable thing in the kitchen", () => {
    const world = clear(["p7", "p24"]);
    const targets: CommandTarget[] = [
      ...world.records.map((record) => ({
        kind: "placement" as const,
        id: record.id,
      })),
      ...world.voids.map((record) => ({
        kind: "void" as const,
        id: record.id,
      })),
    ];
    let swept = 0;
    for (const target of targets) {
      const section = replaceSectionAt(world, target);
      if (!section) continue;
      swept += 1;
      expect(section.rows.map((row) => row.buildId)).toEqual(
        offersFor({ ...world, target }).map((candidate) => candidate.buildId),
      );
    }
    expect(swept).toBeGreaterThan(0);
  });

  it("never renders a count line and an empty line at the same time", () => {
    const world = clear(["p7", "p24"]);
    const targets: CommandTarget[] = [
      ...world.records.map((record) => ({
        kind: "placement" as const,
        id: record.id,
      })),
      ...world.voids.map((record) => ({
        kind: "void" as const,
        id: record.id,
      })),
    ];
    let swept = 0;
    for (const target of targets) {
      const section = replaceSectionAt(world, target);
      if (!section) continue;
      swept += 1;
      expect(section.countLine === undefined).toBe(section.rows.length === 0);
      expect(section.emptyLine === undefined).toBe(section.rows.length > 0);
    }
    expect(swept).toBeGreaterThan(0);
  });
});
