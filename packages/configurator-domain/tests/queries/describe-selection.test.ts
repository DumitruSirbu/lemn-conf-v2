import { describe, expect, it } from "vitest";

import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { setFinish, setHandle } from "../../src/commands/set-appearance.js";
import { describeSelection } from "../../src/queries/describe-selection.js";
import { clearBodies, OCCURRED_AT } from "../support/commands.js";
import {
  CABINETRY_CHIPS_MM,
  HINGED_CHIPS_MM,
  HOOD_CHIPS_MM,
  PANTRY_CHIPS_MM,
  SINK_CHIPS_MM,
} from "../support/width-model.js";
import { advance, createWorld, voidAt } from "../support/kitchen-world.js";
import type { BodyCatalog, BodyDefinition } from "../../src/void-engine.js";
import { OFFERED_ON_PAL_FINISH } from "../support/material-finish-pairs.js";

const seeded = () => createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);

function metaFor(world: ReturnType<typeof seeded>, id: string) {
  return describeSelection({ ...world, target: { kind: "placement", id } });
}

/** The seeded catalogue with one **insertable** entry rewritten. Rewriting the §7 row rather than
 *  the seeded one is the point: a seeded entry declares no widths of its own and resolves its set
 *  through the `catalogEquivalentId` it declares (ADR 0022), so an override on the seeded row would
 *  be read by nothing and the test would pass while asserting the opposite of what it says. */
function withCatalogEntry(
  buildId: string,
  overrides: Partial<BodyDefinition>,
): BodyCatalog {
  const entry = KITCHEN_L_BODY_CATALOG.get(buildId);
  if (!entry) throw new Error(`no catalogue entry ${buildId}`);
  return new Map(KITCHEN_L_BODY_CATALOG).set(buildId, {
    ...entry,
    ...overrides,
  });
}

describe("describeSelection — an occupied body", () => {
  it("reports the numbers §9 disables its sections from", () => {
    const world = seeded();
    const meta = describeSelection({
      ...world,
      target: { kind: "placement", id: "p0" },
    });
    expect(meta).toMatchObject({
      id: "p0",
      empty: false,
      kind: "base_cabinet",
      band: "base",
      wall: "A",
      widthMm: 800,
      heightMm: 820,
      openWmm: 800,
      openHmm: 820,
      canFinish: true,
      canDelete: true,
    });
  });

  // §13.1 / §11 row 16: a corner is not a body the customer chooses, so §9 must publish it as one
  // that can be selected and neither swapped nor deleted. ADR 0027 folded the hob into its cabinet,
  // which leaves the four corner bodies — `p25`, `p26`, `p9` and `p21` in that position — two base corner
  // pieces and two wall corner returns, all four sharing this outcome.
  it("reports the corner leg as a body that cannot be replaced or deleted", () => {
    const world = seeded();
    const meta = describeSelection({
      ...world,
      target: { kind: "placement", id: "p25" },
    });
    expect(meta).toMatchObject({
      canReplace: false,
      canDelete: false,
    });
  });

  // ADR 0011 Gap C: `top` stays a row in the header even though the gate normalises it to `wall`.
  it("keeps the top row's own label", () => {
    const world = seeded();
    const meta = describeSelection({
      ...world,
      target: { kind: "placement", id: "p15" },
    });
    expect(meta?.band).toBe("top");
  });

  it("returns nothing for an id that no longer resolves", () => {
    const world = seeded();
    expect(
      describeSelection({
        ...world,
        target: { kind: "placement", id: "p999" },
      }),
    ).toBeUndefined();
  });
});

describe("describeSelection — a void", () => {
  it("reports the level opening, its span, and the sections a void has nothing to fill", () => {
    const world = clearBodies(seeded(), ["p7", "p24"]);
    const slot = voidAt(world, "B|2.45", 0);
    const meta = describeSelection({
      ...world,
      target: { kind: "void", id: slot.id },
    });
    expect(meta).toMatchObject({
      empty: true,
      kind: "void",
      band: "base",
      wall: "B",
      openWmm: 700,
      openHmm: 860,
      spanHmm: 2600,
      canFinish: false,
      canHandle: false,
      canReplace: true,
      canDelete: false,
      sizesMm: [],
    });
  });

  it("returns nothing for a stale void id", () => {
    const world = seeded();
    expect(
      describeSelection({
        ...world,
        target: { kind: "void", id: "A|9.99:v0:0.00" },
      }),
    ).toBeUndefined();
  });
});

describe("describeSelection — width chips", () => {
  it("carries the catalogue's own size set for an insertable body", () => {
    const world = clearBodies(seeded(), ["p1"]);
    // One row of each shape ADR 0035 recognises: a discrete appliance niche, and a cabinetry row
    // stepped between its own bounds.
    expect(world.catalog.get("base-dishwasher")?.sizesMm).toEqual([450, 600]);
    expect(world.catalog.get("hood")?.sizesMm).toEqual(HOOD_CHIPS_MM);
  });
});

/** M5 wave 5B, work item 1. Every seeded placement's expected set, written out per placement rather
 *  than computed, so the table is a statement of the acceptance criteria and not a second copy of
 *  the implementation. An empty set is the expected answer for the five bodies §7 does not build.
 *
 *  ADR 0035 decision 2 turned the per-entry lists this table pinned into bounds, and the chips into
 *  a 50 mm step across them. What shapes each row now is a floor and a ceiling and nothing in
 *  between: ADR 0026's declared 200 is why the hinged rows start below §2's default, ADR 0017's
 *  aperture is why the sink base starts at 600, and ADR 0035 decision 5 is why the hood does. The
 *  named sets are `support/width-model.ts`. */
const EXPECTED_SEEDED_SIZES_MM: Readonly<Record<string, readonly number[]>> = {
  p0: [...SINK_CHIPS_MM], // base-sink-800 → base-sink (ADR 0017's aperture, stepped up)
  p1: [450, 600], // base-dishwasher-600 → base-dishwasher
  p2: [600], // base-hob-2drawer-600 → base-hob-2drawer (ADR 0027)
  p4: [...CABINETRY_CHIPS_MM], // base-drawer3-600 → base-3drawer
  p25: [], // base-corner-x-900 — structural, no equivalent (§13.1)
  p26: [], // base-corner-return-320 — structural, no equivalent
  p5: [600], // tall-oven-tower-600 → tall-oven-tower
  // ADR 0048: the one full-height row with a bound rather than a single width. The seeded
  // instance still declares `fixedWidth: true`, so it publishes this set and refuses every member
  // of it — the set a body resolves and the widths it may be moved to are two questions.
  p6: [...PANTRY_CHIPS_MM], // tall-pantry-600 → tall-pantry
  p7: [700], // fridge-free-700 → fridge-free
  // ADR 0033: every seeded wall and top body resolves to the **one** merged `wall-cabinet` entry, so
  // they all carry the same set — and after the owner's 2026-08-28 ruling that set has no gap in it
  // at all. ADR 0029's two-door floor went with the ladder (ADR 0035 rejects "forbid 500 and 550" by
  // name) and ADR 0030's 400 mm one-door cap went with the ruling that put 450 back.
  //
  // The eleven identical rows are the point rather than a repetition to collapse: which door count a
  // seeded body happens to have stopped deciding what it may be resized to, which is the whole of
  // this decision read through §9's chips.
  p8: [...HINGED_CHIPS_MM], // wall-2door-600 → wall-cabinet
  p9: [], // wall-corner-return-570 — structural, no equivalent
  p10: [...HINGED_CHIPS_MM], // wall-1door-300 → wall-cabinet
  p11: [...HINGED_CHIPS_MM],
  p12: [...CABINETRY_CHIPS_MM], // open-shelf-600 → open-shelf: a shelf has no door to count
  p13: [...HOOD_CHIPS_MM], // hood-600 → hood (ADR 0035 decision 5)
  p14: [...HINGED_CHIPS_MM],
  p15: [...HINGED_CHIPS_MM],
  p16: [...HINGED_CHIPS_MM], // wall-1door-300-top → wall-cabinet
  p17: [...HINGED_CHIPS_MM],
  p18: [...HINGED_CHIPS_MM],
  p19: [...HINGED_CHIPS_MM],
  p20: [...HINGED_CHIPS_MM],
  p21: [], // wall-corner-return-570-top — structural, no equivalent
  p22: [...HINGED_CHIPS_MM],
  p23: [...HINGED_CHIPS_MM],
  // 700 is this body's width, and since ADR 0035 stepped the chips it is one of them as well. It was
  // the row where "a chip and a buildable width are different facts" showed; the difference is now
  // one step over, at 570 and 620, which no chip reaches and `acceptsWidthMm` accepts.
  // `swap-depth.test.ts` asserts the rebuild on real geometry.
  p24: [...HINGED_CHIPS_MM],
};

describe("the width set a seeded body resolves through its declared equivalent", () => {
  it("gives every seeded placement the set its catalogue equivalent declares", () => {
    const world = seeded();
    expect(world.records.length).toBe(
      Object.keys(EXPECTED_SEEDED_SIZES_MM).length,
    );
    for (const record of world.records) {
      const expected = EXPECTED_SEEDED_SIZES_MM[record.id];
      if (!expected) throw new Error(`no expectation for ${record.id}`);
      expect([record.id, metaFor(world, record.id)?.sizesMm]).toEqual([
        record.id,
        expected,
      ]);
    }
    // The table has to keep every answer present or it stops testing the distinctions. ADR 0033
    // merged the door-count pairs, so "a one-door entry offers 400 and a two-door entry does not" is
    // no longer a distinction that exists — one entry offers both, and which doors you get follows
    // the width. What still differs is entry against entry: the hinged cabinet reaches 200 and skips
    // 450, a plain cabinetry row starts at 300 and offers it, the hood starts at 600. Asserted over
    // the table itself, because a sweep that quietly loses one side stops guarding.
    const sets = Object.values(EXPECTED_SEEDED_SIZES_MM);
    const withMember = (widthMm: number) =>
      sets.filter((set) => set.includes(widthMm)).length;
    const withoutMember = (widthMm: number) =>
      sets.filter((set) => set.length > 0 && !set.includes(widthMm)).length;
    expect(withMember(200)).toBeGreaterThan(0);
    expect(withoutMember(200)).toBeGreaterThan(0);
    expect(withMember(450)).toBeGreaterThan(0);
    expect(withoutMember(450)).toBeGreaterThan(0);
    expect(withMember(800)).toBeGreaterThan(0);
    expect(withoutMember(800)).toBeGreaterThan(0);
  });

  // §7 dropped 1000 when two doors were capped at 800, and the milestone repeats it as an
  // acceptance criterion. Asserted as an anti-invariant over the whole population, because a chip
  // nobody can build is exactly the "offered then refused" failure §9 forbids.
  it("never offers 1000 mm anywhere in the kitchen", () => {
    const world = seeded();
    const offered = new Set(
      world.records.flatMap((record) => [
        ...(metaFor(world, record.id)?.sizesMm ?? []),
      ]),
    );
    expect(offered.size).toBeGreaterThan(0);
    expect(offered.has(1000)).toBe(false);
  });

  // ADR 0022, and ADR 0011 Gap A: the set follows the **declared** pointer. Repointing one row
  // moves its set while the body's kind, band and width are untouched — which is what a match
  // inferred from those three would have keyed on. The assertion is that the inference is NOT what
  // is happening.
  it("follows the declared pointer rather than the body's kind, band and width", () => {
    const seededEntry = KITCHEN_L_BODY_CATALOG.get("base-drawer3-600");
    if (!seededEntry) throw new Error("no seeded entry base-drawer3-600");
    const repointed: BodyCatalog = new Map(KITCHEN_L_BODY_CATALOG).set(
      "base-drawer3-600",
      { ...seededEntry, catalogEquivalentId: "base-dishwasher" },
    );
    const world = createWorld(KITCHEN_L_DESIGN, repointed);
    expect(metaFor(world, "p4")?.sizesMm).toEqual([450, 600]);
    expect(metaFor(world, "p4")?.kind).toBe("base_cabinet");
    expect(metaFor(world, "p4")?.widthMm).toBe(600);
  });

  // A pointer that resolves to nothing is an empty set, not a throw and not a fallback set: §9's
  // width section then declines, which is the loud-at-the-section failure R2.7 preserved. The
  // pointer guard in `tests/fixtures/kitchen-l-design.test.ts` is what makes a broken pointer fail
  // on its own (FINDING R2.1: this cited `catalog.qa.test.ts`, which only covers `isKnownKind` and
  // the kind descriptor).
  it("gives an empty set when the declared equivalent is not in the catalogue", () => {
    const seededEntry = KITCHEN_L_BODY_CATALOG.get("wall-2door-600");
    if (!seededEntry) throw new Error("no seeded entry wall-2door-600");
    const dangling: BodyCatalog = new Map(KITCHEN_L_BODY_CATALOG).set(
      "wall-2door-600",
      { ...seededEntry, catalogEquivalentId: "no-such-entry" },
    );
    const world = createWorld(KITCHEN_L_DESIGN, dangling);
    expect(metaFor(world, "p8")?.sizesMm).toEqual([]);
    expect(metaFor(world, "p8")?.canWidth).toBe(true);
  });

  // FINDING R1.1. The resolved entry must be `insertable`, not merely present. A pointer at another
  // seeded row resolves nothing, so the set is empty and §9's width section declines — rather than
  // handing back a body `insertBody` cannot rebuild, which §5.4's `canGive` ("resolves to an
  // insertable catalogue entry") reads through this same resolution in wave 5C. No shipped pointer
  // is shaped like this; the fixture guard forbids it in the shipped map and this pins the rule for
  // every other catalogue.
  it("resolves nothing through a pointer at another non-insertable row", () => {
    const seededEntry = KITCHEN_L_BODY_CATALOG.get("wall-2door-600");
    if (!seededEntry) throw new Error("no seeded entry wall-2door-600");
    const target = KITCHEN_L_BODY_CATALOG.get("wall-2door-800");
    expect(target?.insertable).not.toBe(true);
    const catalog: BodyCatalog = new Map(KITCHEN_L_BODY_CATALOG).set(
      "wall-2door-600",
      { ...seededEntry, catalogEquivalentId: "wall-2door-800" },
    );
    const world = createWorld(KITCHEN_L_DESIGN, catalog);
    expect(metaFor(world, "p8")?.sizesMm).toEqual([]);
  });

  // The floor governing the set is the one on the entry the set came from, not the seeded row's.
  // Reading the two off different rows would let a body offer a chip its own builder refuses.
  it("applies the equivalent's own width floor to the equivalent's own set", () => {
    const catalog = withCatalogEntry("wall-cabinet", { minWidthMm: 700 });
    const world = createWorld(KITCHEN_L_DESIGN, catalog);
    // The floor is raised above every chip in the entry's lower range and above the first four of
    // its upper one, and the chips that survive are the equivalent's own — never the seeded row's.
    expect(metaFor(world, "p8")?.sizesMm).toEqual([700, 750, 800]);
  });
});

describe("describeSelection — §9's canWidth flag", () => {
  it("is true for a body whose width the catalogue lets move", () => {
    const world = seeded();
    const meta = describeSelection({
      ...world,
      target: { kind: "placement", id: "p0" },
    });
    expect(meta).toMatchObject({ fixedWidth: false, canWidth: true });
  });

  // FINDING R2.7, and M5 wave 5B turned it over rather than deleting it. It asserted `canWidth:
  // false` for a movable-width body with no widths — the R1.3 rule, which folded "has widths to
  // offer" into the flag and made `canWidth: true, sizesMm: []` a representable contradiction. §9
  // states the rule as "selected · not empty · not `fixedWidth`" and nothing more, so the flag is
  // that again and the panel's width *section* declines when there are no chips.
  //
  // It used to make its point on `p0`, which now resolves [600, 800] through `base-sink`. The
  // invariant is unchanged and reached here by breaking one row's `catalogEquivalentId`: the set
  // empties and `fixedWidth` does not move, so `canWidth` stays true beside it. That is the
  // contradiction being kept representable on purpose — missing catalogue data must fail loudly at
  // the section, not silently at the flag.
  it("is true for a movable-width body even when the catalogue gives it no widths", () => {
    const world = createWorld(
      KITCHEN_L_DESIGN,
      withCatalogEntry("wall-2door-600", {
        catalogEquivalentId: "no-such-entry",
      }),
    );
    const meta = describeSelection({
      ...world,
      target: { kind: "placement", id: "p8" },
    });
    expect(meta).toMatchObject({
      fixedWidth: false,
      sizesMm: [],
      canWidth: true,
    });
  });

  // FINDING R2.9. `meta.sizesMm` published the catalogue row RAW while `offersFor` published it
  // through `buildableSizes`. They agreed only because `base-sink`'s row was pre-filtered to
  // [600, 800] by hand; the next entry to declare a `minWidthMm` without pre-filtering would break
  // the width chips and not the offer rows. One function now decides both.
  it("drops a width below the entry's own builder floor from the chips", () => {
    // Deliberately NOT pre-filtered: 400 and 500 are under the floor and still in the row. The
    // override lands on `base-sink`, the §7 entry `base-sink-800` declares itself an instance of —
    // overriding the seeded row instead would be read by nobody (see `withCatalogEntry`).
    const catalog = withCatalogEntry("base-sink", {
      sizesMm: [400, 500, 600, 800],
      minWidthMm: 560,
    });
    const world = createWorld(KITCHEN_L_DESIGN, catalog);
    const meta = describeSelection({
      ...world,
      target: { kind: "placement", id: "p0" },
    });
    expect(meta?.sizesMm).toEqual([600, 800]);
  });

  // §11 rows 14 and 16: a fixed-width body has no width section to render.
  it("is false for every fixed-width body", () => {
    const world = seeded();
    const fixed = world.records.filter((record) => record.fixedWidth);
    expect(fixed.length).toBeGreaterThan(0);
    for (const record of fixed) {
      const meta = describeSelection({
        ...world,
        target: { kind: "placement", id: record.id },
      });
      expect(meta?.canWidth).toBe(false);
    }
  });

  it("is false for a void, which has nothing to resize", () => {
    const world = clearBodies(seeded(), ["p1"]);
    const opening = voidAt(world, "A|2.00", 0);
    const meta = describeSelection({
      ...world,
      target: { kind: "void", id: opening.id },
    });
    expect(meta).toMatchObject({ empty: true, canWidth: false });
  });
});

describe("describeSelection — the appearance the chips must mark", () => {
  it("carries no finish or handle until one is chosen", () => {
    const world = seeded();
    const meta = describeSelection({
      ...world,
      target: { kind: "placement", id: "p0" },
    });
    expect(meta?.finish).toBeUndefined();
    expect(meta?.handle).toBeUndefined();
  });

  it("carries the finish and handle a command applied", () => {
    const world = seeded();
    const finished = setFinish({
      design: world.design,
      catalog: world.catalog,
      target: { kind: "placement", id: "p0" },
      finish: OFFERED_ON_PAL_FINISH,
      occurredAt: OCCURRED_AT,
    });
    if (!finished.ok) throw new Error(finished.reason.code);
    const handled = setHandle({
      design: finished.design,
      catalog: world.catalog,
      target: { kind: "placement", id: "p0" },
      handle: "black",
      occurredAt: OCCURRED_AT,
    });
    if (!handled.ok) throw new Error(handled.reason.code);

    const meta = describeSelection({
      ...advance(world, handled.design),
      target: { kind: "placement", id: "p0" },
    });
    expect(meta).toMatchObject({
      finish: OFFERED_ON_PAL_FINISH,
      handle: "black",
    });
  });

  // §6.5 / §11 row 13: the default follows the module line the body stands on, not its band.
  it("defaults a top-row body to push-to-open and a base body to a bar handle", () => {
    const world = seeded();
    const top = describeSelection({
      ...world,
      target: { kind: "placement", id: "p15" },
    });
    const base = describeSelection({
      ...world,
      target: { kind: "placement", id: "p0" },
    });
    expect(top?.defaultHandle).toBe("push");
    expect(base?.defaultHandle).toBe("steel");
  });
});
