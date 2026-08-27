// Adversarial pass over M5 wave 5B's width resolution: `resolveCatalogEquivalent` and
// `resolveBuildableSizes` (`src/catalog.ts`), and the set they publish through `describeSelection`.
//
// Review round 1 changed the shape underneath this file and it was rewritten to the new contract
// rather than around it. FINDING R1.5/R2.2 made the resolution ONE function shared with §9's ACTUAL
// badge, so it is keyed by `buildId` — a `BodyDefinition` does not carry its own id and the badge
// needs one. FINDING R1.1 made it verify the resolved entry is `insertable`, which this file had
// already identified as "the one that could bite"; the two assertions that pinned the old, looser
// behaviour are inverted below and say so at the line.
//
// The wave's own suite proves the happy path against a written-out table. This file attacks the
// three things a table cannot reach: the **semantics** of the pointer (one hop? insertable target?
// cycles?), the **independence** of §9's `canWidth` from the set beside it, and the claim that the
// resolution is *declared* rather than inferred — which is only provable by making a declaration and
// every possible inference disagree and showing the declaration wins.
//
// Every sweep asserts it swept something. A resolution that quietly returns `[]` everywhere would
// otherwise satisfy most of the assertions below.
import { describe, expect, it } from "vitest";

import {
  buildableSizes,
  INSERTABLE_BODY_DEFINITIONS,
  resolveBuildableSizes,
  resolveCatalogEquivalent,
} from "../../src/catalog.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { describeSelection } from "../../src/queries/describe-selection.js";
import { clearBodies, insertInto } from "../support/commands.js";
import { advance, createWorld, voidAt } from "../support/kitchen-world.js";
import { preMigrationHobDesign } from "../support/pre-migration-hob.js";
import type { BodyCatalog, BodyDefinition } from "../../src/void-engine.js";

const seeded = () => createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);

function metaFor(world: ReturnType<typeof seeded>, id: string) {
  const meta = describeSelection({
    ...world,
    target: { kind: "placement", id },
  });
  if (!meta) throw new Error(`no selection meta for ${id}`);
  return meta;
}

function entry(buildId: string): BodyDefinition {
  const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
  if (!definition) throw new Error(`no catalogue entry ${buildId}`);
  return definition;
}

/** A catalogue with one or more rows rewritten, seeded or insertable. */
function catalogWith(
  rows: Readonly<Record<string, Partial<BodyDefinition>>>,
): Map<string, BodyDefinition> {
  const catalog = new Map(KITCHEN_L_BODY_CATALOG);
  for (const [buildId, overrides] of Object.entries(rows)) {
    catalog.set(buildId, { ...entry(buildId), ...overrides });
  }
  return catalog;
}

/** A brand-new row, so a probe never has to borrow a shipped id and can declare anything. */
function catalogPlus(
  rows: Readonly<Record<string, BodyDefinition>>,
): Map<string, BodyDefinition> {
  const catalog = new Map(KITCHEN_L_BODY_CATALOG);
  for (const [buildId, definition] of Object.entries(rows)) {
    catalog.set(buildId, definition);
  }
  return catalog;
}

const SEEDED_TEMPLATE = entry("wall-2door-600");

/** `exactOptionalPropertyTypes` forbids spreading an explicit `undefined` over an optional field,
 *  so an absent declaration is produced by dropping the key rather than by overwriting it. */
type LooseDefinition = {
  -readonly [K in keyof BodyDefinition]?: BodyDefinition[K];
};

function withoutSizes(definition: BodyDefinition): BodyDefinition {
  const copy: LooseDefinition = { ...definition };
  delete copy.sizesMm;
  return copy as BodyDefinition;
}

function withoutFloor(definition: BodyDefinition): BodyDefinition {
  const copy: LooseDefinition = { ...definition };
  delete copy.minWidthMm;
  return copy as BodyDefinition;
}

// -------------------------------------------------------------------------------------------
// The two new functions, at their boundaries.
// -------------------------------------------------------------------------------------------

describe("resolveCatalogEquivalent — what a pointer means", () => {
  it("answers undefined for a buildId the catalogue does not hold, rather than throwing", () => {
    expect(
      resolveCatalogEquivalent(KITCHEN_L_BODY_CATALOG, "no-such-body"),
    ).toBeUndefined();
    expect(
      resolveBuildableSizes(KITCHEN_L_BODY_CATALOG, "no-such-body"),
    ).toEqual([]);
  });

  // The insertable check is on the **source**, and it short-circuits: an insertable row is already
  // its own §7 entry, so a stray pointer on it must never redirect its chips. `offers.test.ts`
  // pins the same rule for the ACTUAL badge; this is the width half of it.
  it("ignores a stray pointer on an insertable row and keeps its own set", () => {
    const catalog = catalogWith({
      "base-2door": { catalogEquivalentId: "base-dishwasher" },
    });
    expect(resolveCatalogEquivalent(catalog, "base-2door")?.buildId).toBe(
      "base-2door",
    );
    expect(resolveBuildableSizes(catalog, "base-2door")).toEqual([
      400, 600, 800,
    ]);
  });

  it("answers an empty set for a seeded row that declares no equivalent", () => {
    expect(entry("wall-corner-return-570").catalogEquivalentId).toBeUndefined();
    expect(
      resolveCatalogEquivalent(
        KITCHEN_L_BODY_CATALOG,
        "wall-corner-return-570",
      ),
    ).toBeUndefined();
    expect(
      resolveBuildableSizes(KITCHEN_L_BODY_CATALOG, "wall-corner-return-570"),
    ).toEqual([]);
  });

  // A dangling pointer is data corruption, and the answer must be "no widths" rather than a throw
  // that takes the whole panel down. `kitchen-l-design.test.ts`'s guard is what makes it loud in
  // the fixture; this pins the runtime behaviour for a document the guard never sees.
  it("answers an empty set for a pointer that resolves to nothing, without throwing", () => {
    const catalog = catalogWith({
      "wall-2door-600": { catalogEquivalentId: "no-such-entry" },
    });
    expect(() =>
      resolveBuildableSizes(catalog, "wall-2door-600"),
    ).not.toThrow();
    expect(resolveCatalogEquivalent(catalog, "wall-2door-600")).toBeUndefined();
    expect(resolveBuildableSizes(catalog, "wall-2door-600")).toEqual([]);
  });

  // The empty string is not `undefined`, so it takes the `catalog.get` branch. It must still land
  // on "no widths" rather than on whatever a map lookup of "" happens to return.
  it("treats an empty-string pointer as a pointer that resolves to nothing", () => {
    const catalog = catalogWith({
      "wall-2door-600": { catalogEquivalentId: "" },
    });
    expect(resolveBuildableSizes(catalog, "wall-2door-600")).toEqual([]);
  });

  // A row pointing at itself is the shortest possible cycle. One hop and no recursion means it
  // terminates; this is the assertion that says so, because the alternative is a hung render.
  it("terminates on a self-referential pointer", () => {
    const catalog = catalogWith({
      "wall-2door-600": { catalogEquivalentId: "wall-2door-600" },
    });
    expect(resolveBuildableSizes(catalog, "wall-2door-600")).toEqual([]);
  });

  it("terminates on a two-row cycle", () => {
    const catalog = catalogWith({
      "wall-2door-600": { catalogEquivalentId: "wall-2door-800" },
      "wall-2door-800": { catalogEquivalentId: "wall-2door-600" },
    });
    expect(resolveBuildableSizes(catalog, "wall-2door-600")).toEqual([]);
  });

  // **One hop, and the target is not re-resolved.** A pointer at another seeded row returns that
  // row and reads *its* `sizesMm` — which a seeded row never has — so the chain A → B → C yields
  // nothing rather than C's set. That is the safe direction (no set beats a guessed set) and it is
  // what `kitchen-l-design.test.ts`'s "points at a real **insertable** entry" guard exists to keep
  // out of the fixture. Pinned because "one hop" is a semantic choice, not an implementation
  // detail: the day someone declares an intermediate row, this line is where the decision is made
  // again rather than discovered.
  it("does not follow a second hop through another non-insertable row", () => {
    const catalog = catalogWith({
      "wall-2door-600": { catalogEquivalentId: "wall-2door-800" },
    });
    // Rewritten for FINDING R1.1, and the semantic it pins is the same one, reached earlier: the
    // pointer is one hop and the hop is not re-resolved, so A → B → C never yields C's set. It used
    // to prove that by handing back the non-insertable B and reading B's absent `sizesMm`; the
    // resolution now refuses B outright, which is the stronger form of the same answer. The
    // decision point survives — the day someone wants an intermediate row, this line is where it is
    // decided again rather than discovered.
    expect(catalog.get("wall-2door-800")?.insertable).not.toBe(true);
    expect(resolveCatalogEquivalent(catalog, "wall-2door-600")).toBeUndefined();
    expect(resolveBuildableSizes(catalog, "wall-2door-600")).toEqual([]);
  });

  // FINDING R1.1, and this test is the one that named it. It asserted the corollary of the looser
  // rule — the target was *not* checked for `insertable`, so a non-insertable row carrying a set
  // handed that set over — and flagged it as "the one that could bite". Review agreed and inverted
  // the rule rather than the test's judgement: a set is only ever taken from a row `insertBody`
  // could actually rebuild through, because §5.4's `canGive` reads the same resolution and would
  // otherwise answer true for a body the engine refuses. The fixture guard forbids this shape in
  // the shipped map; this pins it for every other catalogue.
  it("refuses a non-insertable target, even one carrying a set of its own", () => {
    const catalog = catalogPlus({
      "qa-intermediate": {
        ...SEEDED_TEMPLATE,
        insertable: false,
        sizesMm: [500, 900],
      },
    });
    catalog.set("wall-2door-600", {
      ...entry("wall-2door-600"),
      catalogEquivalentId: "qa-intermediate",
    });
    expect(catalog.get("qa-intermediate")?.sizesMm).toEqual([500, 900]);
    expect(resolveCatalogEquivalent(catalog, "wall-2door-600")).toBeUndefined();
    expect(resolveBuildableSizes(catalog, "wall-2door-600")).toEqual([]);
  });

  // The resolved entry is insertable and still declares no `sizesMm` — a §7 row missing its data
  // rather than a pointer at the wrong population, so the resolution succeeds and the set is empty.
  it("answers an empty set when the resolved entry declares no sizes", () => {
    const catalog = catalogPlus({
      "qa-setless": withoutSizes(entry("wall-2door")),
    });
    catalog.set("wall-2door-600", {
      ...entry("wall-2door-600"),
      catalogEquivalentId: "qa-setless",
    });
    expect(resolveCatalogEquivalent(catalog, "wall-2door-600")).toBeDefined();
    expect(resolveBuildableSizes(catalog, "wall-2door-600")).toEqual([]);
  });

  it("answers an empty set when the resolved entry's floor excludes every member", () => {
    const catalog = catalogWith({ "wall-2door": { minWidthMm: 900 } });
    expect(
      resolveCatalogEquivalent(catalog, "wall-2door-600")?.definition.sizesMm,
    ).toEqual([600, 800]);
    expect(resolveBuildableSizes(catalog, "wall-2door-600")).toEqual([]);
  });

  // A query, not a command: two calls agree and neither writes anything back.
  it("is a pure query over the catalogue", () => {
    const before = JSON.stringify([...KITCHEN_L_BODY_CATALOG]);
    const first = resolveBuildableSizes(
      KITCHEN_L_BODY_CATALOG,
      "base-sink-800",
    );
    const second = resolveBuildableSizes(
      KITCHEN_L_BODY_CATALOG,
      "base-sink-800",
    );
    expect(first).toEqual(second);
    expect(first).toEqual([600, 800]);
    expect(entry("base-sink-800").sizesMm).toBeUndefined();
    expect(JSON.stringify([...KITCHEN_L_BODY_CATALOG])).toBe(before);
  });
});

// -------------------------------------------------------------------------------------------
// An insertable placement — the case `describe-selection.test.ts`'s "width chips" block names but
// never actually exercises (it asserts two catalogue literals and never calls the query).
// -------------------------------------------------------------------------------------------

describe("a placement created by insertBody, whose buildId IS a §7 entry", () => {
  function insertedDishwasherWorld(catalog: BodyCatalog) {
    const world = clearBodies(createWorld(KITCHEN_L_DESIGN, catalog), ["p1"]);
    const slot = voidAt(world, "A|2.00", 0);
    const result = insertInto(
      world,
      { kind: "void", id: slot.id },
      "base-dishwasher",
    );
    if (!result.ok) throw new Error(`insert refused: ${result.reason.code}`);
    return {
      world: advance(world, result.design),
      placementId: result.effect.placementId,
    };
  }

  // The insertable short-circuit, end to end rather than on a definition handed in by hand: the
  // body is its own §7 entry and publishes that entry's set.
  it("publishes the entry's own set, resolved through no pointer at all", () => {
    const { world, placementId } = insertedDishwasherWorld(
      KITCHEN_L_BODY_CATALOG,
    );
    expect(metaFor(world, placementId).sizesMm).toEqual([450, 600]);
    expect(entry("base-dishwasher").catalogEquivalentId).toBeUndefined();
  });

  // And a stray pointer on that entry must not redirect the chips — ADR 0011 Gap A makes the
  // pointer a seeded-row affordance only, and `offers.test.ts` pins the same rule for the badge.
  it("ignores a stray pointer declared on the §7 entry itself", () => {
    const { world, placementId } = insertedDishwasherWorld(
      catalogWith({ "base-dishwasher": { catalogEquivalentId: "base-sink" } }),
    );
    expect(metaFor(world, placementId).sizesMm).toEqual([450, 600]);
  });
});

// -------------------------------------------------------------------------------------------
// The floor comes off the resolved row, in both directions.
// -------------------------------------------------------------------------------------------

describe("the floor that narrows the set is the resolved entry's own", () => {
  // A resize rebuilds through the §7 entry, and `insertBody` reads *that* entry's `minWidthMm`.
  // Reading the seeded row's instead would offer a chip the rebuild refuses.
  it("narrows by the equivalent's floor, not the seeded row's", () => {
    const catalog = catalogWith({ "wall-2door": { minWidthMm: 700 } });
    expect(
      metaFor(createWorld(KITCHEN_L_DESIGN, catalog), "p8").sizesMm,
    ).toEqual([800]);
  });

  it("ignores a floor declared on the seeded row, in either direction", () => {
    const raised = catalogWith({ "base-sink-800": { minWidthMm: 900 } });
    expect(
      metaFor(createWorld(KITCHEN_L_DESIGN, raised), "p0").sizesMm,
    ).toEqual([600, 800]);

    // And downward: a seeded row cannot lower the floor its builder actually applies either.
    const lowered = catalogWith({
      "base-sink-800": { minWidthMm: 100 },
      "base-sink": { sizesMm: [400, 600, 800] },
    });
    expect(
      metaFor(createWorld(KITCHEN_L_DESIGN, lowered), "p0").sizesMm,
    ).toEqual([600, 800]);
  });

  // The point of reading both halves off one row: every chip a body offers is a width the entry a
  // resize would rebuild it through will actually accept. Swept over the shipped population rather
  // than argued.
  it("offers no chip its own resolved builder would refuse, anywhere in the kitchen", () => {
    const world = seeded();
    let swept = 0;
    for (const record of world.records) {
      const source = resolveCatalogEquivalent(
        KITCHEN_L_BODY_CATALOG,
        record.buildId,
      )?.definition;
      for (const widthMm of metaFor(world, record.id).sizesMm) {
        if (!source)
          throw new Error(`${record.id} offers a chip with no source`);
        expect([record.id, widthMm, source.sizesMm?.includes(widthMm)]).toEqual(
          [record.id, widthMm, true],
        );
        expect([record.id, widthMm]).toEqual([
          record.id,
          buildableSizes(source.minWidthMm, [widthMm])[0],
        ]);
        swept += 1;
      }
    }
    expect(swept).toBeGreaterThan(40);
  });
});

// -------------------------------------------------------------------------------------------
// Declared, never inferred (ADR 0011 Gap A, ADR 0022).
// -------------------------------------------------------------------------------------------

describe("the set follows the declaration, not any inference from the body", () => {
  // The strongest form available on the shipped data, and it needs no doctoring at all: two seeded
  // bodies with the **same** kind, the **same** band and the **same** width resolve different
  // sets. Any match keyed on kind + band + width would have to give them the same answer.
  it("gives two identical-looking base cabinets different sets", () => {
    const world = seeded();
    const drawer = metaFor(world, "p4");
    const hob = metaFor(world, "p2");
    expect([drawer.kind, drawer.band, drawer.widthMm]).toEqual([
      hob.kind,
      hob.band,
      hob.widthMm,
    ]);
    expect(drawer.sizesMm).toEqual([400, 600, 800]);
    expect(hob.sizesMm).toEqual([600]);
  });

  // Now make the declaration and every inference disagree on purpose. A wall cabinet at 800 mm is
  // repointed at the bottle cargo: kind, band, label and width all still say "wall cabinet, 800",
  // and the set that comes back is the cargo's 200/300. The assertion is that the inference is NOT
  // what is happening — and it is deliberately the pointer nobody would ever declare, because a
  // resolution that "sanity-checked" the answer against the body would fail here.
  it("hands a wall cabinet the base cargo's set when the row declares it", () => {
    const catalog = catalogWith({
      "wall-2door-800": { catalogEquivalentId: "base-bottle-cargo" },
    });
    const meta = metaFor(createWorld(KITCHEN_L_DESIGN, catalog), "p11");
    expect(meta.sizesMm).toEqual([200, 300]);
    expect(meta.kind).toBe("wall_cabinet");
    expect(meta.band).toBe("wall");
    expect(meta.widthMm).toBe(800);
  });

  // The mirror: an added catalogue row that is a perfect kind + band + width match for the body,
  // while the row keeps its declared pointer elsewhere. An inference would prefer the twin; the
  // declaration must win.
  it("prefers the declared entry over a perfect look-alike in the catalogue", () => {
    const catalog = catalogPlus({
      "qa-wall-twin": {
        ...entry("wall-2door"),
        label: "Geamăn",
        sizesMm: [550, 650],
      },
    });
    const world = createWorld(KITCHEN_L_DESIGN, catalog);
    expect(metaFor(world, "p8").sizesMm).toEqual([600, 800]);

    const repointed = new Map(catalog).set("wall-2door-600", {
      ...entry("wall-2door-600"),
      catalogEquivalentId: "qa-wall-twin",
    });
    expect(
      metaFor(createWorld(KITCHEN_L_DESIGN, repointed), "p8").sizesMm,
    ).toEqual([550, 650]);
  });

  // The label the panel renders comes from the seeded row, so a repointing changes the set and
  // nothing else the customer reads. Pinned so a later "resolve the whole definition" shortcut
  // cannot start renaming bodies — §6.3's fridge-housing-labelled-as-a-pantry defect.
  it("moves the set without moving the label the header renders", () => {
    const catalog = catalogWith({
      "base-drawer3-600": { catalogEquivalentId: "base-dishwasher" },
    });
    const world = createWorld(KITCHEN_L_DESIGN, catalog);
    expect(metaFor(world, "p4").sizesMm).toEqual([450, 600]);
    expect(metaFor(world, "p4").label).toBe(metaFor(seeded(), "p4").label);
    expect(metaFor(world, "p4").kind).toBe("base_cabinet");
  });
});

// -------------------------------------------------------------------------------------------
// The population, swept rather than sampled.
// -------------------------------------------------------------------------------------------

/** The milestone's own words for the sets, keyed by the label of the §7 entry each body resolves —
 *  "450/600 for the dishwasher, 600/900 for the hood, 600/800 for the sink (ADR 0017), 400/600/800
 *  for everything else", plus the single-width rows the catalogue adds. Keyed on the *resolved*
 *  entry rather than on placement ids, so it states the criterion instead of copying the wave's
 *  per-placement table. */
const SET_BY_RESOLVED_ENTRY: Readonly<Record<string, readonly number[]>> = {
  "base-sink": [600, 800],
  "base-dishwasher": [450, 600],
  hood: [600, 900],
  "base-hob-2drawer": [600],
  "tall-oven-tower": [600],
  "tall-pantry": [600],
  "fridge-free": [700],
  // ADR 0029 (owner, 2026-08-27): §7's wall builder is `w > 0.45 ? 2 : 1`, so a two-door entry has
  // no 400 mm width — a 400 mm `wall-2door` built one door under a two-door label and price. It
  // moved out of "everything else" rather than the standard set changing: `wall-1door`,
  // `wall-lift` and `open-shelf` still resolve 400/600/800, which is what keeps the fallback below
  // exercised and the distinction under test.
  "wall-2door": [600, 800],
};
const EVERYTHING_ELSE_MM: readonly number[] = [400, 600, 800];

describe("every seeded placement's set, over the whole shipped kitchen", () => {
  it("matches the milestone's criterion for the entry it resolves", () => {
    const world = seeded();
    let resolved = 0;
    let empty = 0;
    let viaNamedEntry = 0;
    let viaFallback = 0;
    for (const record of world.records) {
      const pointer = KITCHEN_L_BODY_CATALOG.get(
        record.buildId,
      )?.catalogEquivalentId;
      const named =
        pointer === undefined ? undefined : SET_BY_RESOLVED_ENTRY[pointer];
      const expected =
        pointer === undefined ? [] : (named ?? EVERYTHING_ELSE_MM);
      if (pointer !== undefined) {
        if (named) viaNamedEntry += 1;
        else viaFallback += 1;
      }
      expect([record.id, metaFor(world, record.id).sizesMm]).toEqual([
        record.id,
        expected,
      ]);
      if (expected.length === 0) empty += 1;
      else resolved += 1;
    }
    // The guard: the sweep cannot shrink to nothing, and both answers stay present. ADR 0025 and
    // ADR 0027 put the population at 26 placements. Five catalogue rows declare no equivalent, but
    // only four of them are *placed* — ADR 0027 took `cooktop-600` out of the shipped design and
    // left the row behind for pre-migration documents, so the shipped sweep sees four empties.
    expect(world.records.length).toBe(26);
    expect(empty).toBe(4);
    expect(resolved).toBe(22);
    // Both branches of the table above still fire. `viaFallback` counts the placements that took
    // `EVERYTHING_ELSE_MM` — `wall-1door` and the base cabinets — and it went from thirteen to two
    // wall rows plus the bases when `wall-2door` gained its own row, so it is asserted rather than
    // assumed: a table where every entry is named would leave the fallback untested.
    expect(viaFallback).toBeGreaterThan(0);
    expect(viaNamedEntry).toBeGreaterThan(0);
  });

  // Named individually as well, because "the five with no pointer" is the claim and a sixth
  // silently joining them would still satisfy the count above if the count moved with it.
  it("is empty for exactly the four placed rows §7 does not build", () => {
    const world = seeded();
    const chipless = world.records
      .filter((record) => metaFor(world, record.id).sizesMm.length === 0)
      .map((record) => record.buildId)
      .sort((left, right) => left.localeCompare(right));
    expect(chipless).toEqual([
      "base-corner-return-320",
      "base-corner-x-900",
      "wall-corner-return-570",
      "wall-corner-return-570-top",
    ]);
  });

  // §7 dropped 1000 when two doors were capped at 800. Asserted over the resolved sets AND the
  // catalogue itself, so neither a seeded body nor an offer row can reintroduce it.
  it("offers 1000 mm nowhere, in any set the product publishes", () => {
    const world = seeded();
    const offered = new Set<number>();
    for (const record of world.records) {
      for (const size of metaFor(world, record.id).sizesMm) offered.add(size);
    }
    for (const [, definition] of KITCHEN_L_BODY_CATALOG) {
      for (const size of definition.sizesMm ?? []) offered.add(size);
    }
    expect(offered.size).toBeGreaterThan(0);
    expect([...offered].sort((left, right) => left - right)).toEqual([
      200, 300, 400, 450, 600, 700, 800, 900,
    ]);
    expect(offered.has(1000)).toBe(false);
  });
});

// -------------------------------------------------------------------------------------------
// §9's `canWidth` is independent of the set beside it.
// -------------------------------------------------------------------------------------------

describe("canWidth stays §9's literal rule, whatever the set says", () => {
  it("is the negation of fixedWidth and nothing else, over the whole population", () => {
    const world = seeded();
    for (const record of world.records) {
      expect([record.id, metaFor(world, record.id).canWidth]).toEqual([
        record.id,
        !record.fixedWidth,
      ]);
    }
  });

  // Both halves of the independence, on real bodies rather than on a fixture: a willing body with
  // no set, and an unwilling body with one. Either direction collapsing would mean the flag had
  // quietly acquired a "has widths to offer" clause again (FINDING R2.7).
  it("is true beside an empty set, and false beside a full one", () => {
    const preMigration = createWorld(
      preMigrationHobDesign(),
      KITCHEN_L_BODY_CATALOG,
    );
    const cooktop = metaFor(preMigration, "p3");
    expect(cooktop.canWidth).toBe(true);
    expect(cooktop.sizesMm).toEqual([]);

    const world = seeded();
    const hood = metaFor(world, "p13");
    expect(hood.canWidth).toBe(false);
    expect(hood.sizesMm).toEqual([600, 900]);
  });

  // The flag must not consult the resolution at all: break the pointer and only the set moves.
  it("does not move when a body stops resolving a set", () => {
    const catalog = catalogWith({
      "wall-2door-600": { catalogEquivalentId: "no-such-entry" },
    });
    const meta = metaFor(createWorld(KITCHEN_L_DESIGN, catalog), "p8");
    expect(meta.canWidth).toBe(true);
    expect(meta.sizesMm).toEqual([]);
  });

  // A fixed-width body's non-empty set is inert by contract, not by luck: nothing but the panel's
  // width section reads `meta.sizesMm`, and that section is behind `canWidth`. Stated here as the
  // domain-side half — `width-chips.adversarial.test.ts` renders the panel and proves it.
  it("leaves a fixed-width body publishing a set it will never be offered", () => {
    const world = seeded();
    const fixedWithSets = world.records
      .filter((record) => record.fixedWidth)
      .filter((record) => metaFor(world, record.id).sizesMm.length > 0)
      .map((record) => record.id);
    expect(fixedWithSets).toEqual(["p2", "p5", "p6", "p7", "p13"]);
    for (const id of fixedWithSets) {
      expect([id, metaFor(world, id).canWidth]).toEqual([id, false]);
    }
  });

  // A seeded row that is flexible while the entry a resize would rebuild it through is fixed would
  // offer a width section over a body with one buildable geometry. `hood-600` is the near miss and
  // it goes the safe way round (fixed instance, flexible entry); this pins that no row goes the
  // other way.
  it("has no flexible seeded row resolving a fixed-width entry", () => {
    let checked = 0;
    const offenders: string[] = [];
    for (const [buildId, definition] of KITCHEN_L_BODY_CATALOG) {
      if (definition.insertable === true) continue;
      const source = resolveCatalogEquivalent(
        KITCHEN_L_BODY_CATALOG,
        buildId,
      )?.definition;
      if (!source) continue;
      checked += 1;
      if (!definition.fixedWidth && source.fixedWidth) offenders.push(buildId);
    }
    expect(checked).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});

// -------------------------------------------------------------------------------------------
// ADR 0026's cargo, and the floor that must not leak.
// -------------------------------------------------------------------------------------------

describe("the bottle cargo's 200 mm floor stays the cargo's alone", () => {
  it("keeps both of the cargo's own widths, with no 300 hard-coded anywhere in the path", () => {
    expect(entry("base-bottle-cargo").minWidthMm).toBe(200);
    expect(
      resolveBuildableSizes(KITCHEN_L_BODY_CATALOG, "base-bottle-cargo"),
    ).toEqual([200, 300]);
  });

  // The same set on a row that does NOT declare the floor loses its 200 to §2's default. That is
  // the pair that proves the 200 comes from the declaration rather than from the set.
  it("drops 200 from an identical set on a row that declares no floor", () => {
    const catalog = catalogPlus({
      "qa-undeclared-cargo": withoutFloor(entry("base-bottle-cargo")),
    });
    expect(resolveBuildableSizes(catalog, "qa-undeclared-cargo")).toEqual([
      300,
    ]);
  });

  it("reaches no seeded body, the shipped kitchen pointing at it nowhere", () => {
    const pointers = [...KITCHEN_L_BODY_CATALOG]
      .filter(([, definition]) => definition.insertable !== true)
      .map(([, definition]) => definition.catalogEquivalentId);
    expect(pointers.length).toBeGreaterThan(0);
    expect(pointers).not.toContain("base-bottle-cargo");

    const world = seeded();
    for (const record of world.records) {
      const sizes = metaFor(world, record.id).sizesMm;
      expect([record.id, sizes.includes(200)]).toEqual([record.id, false]);
    }
  });

  it("is the only entry in the catalogue declaring a floor under the default", () => {
    const declaringDown = INSERTABLE_BODY_DEFINITIONS.filter(
      ([, definition]) =>
        definition.minWidthMm !== undefined && definition.minWidthMm < 300,
    ).map(([buildId]) => buildId);
    expect(declaringDown).toEqual(["base-bottle-cargo"]);
  });
});
