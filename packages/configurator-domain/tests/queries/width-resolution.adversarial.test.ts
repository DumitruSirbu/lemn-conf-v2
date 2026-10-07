// Attacks the pointer's semantics (one hop, insertable target, cycles), the independence of §9's `canWidth` from
// the set beside it, and that the resolution is declared rather than inferred. Every sweep asserts it swept something:
// a resolution quietly returning [] would otherwise satisfy most assertions.
import { describe, expect, it } from "vitest";

import { entryLabel } from "../../src/catalog.js";

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
import {
  CABINETRY_CHIPS_MM,
  HINGED_CHIPS_MM,
  HOOD_CHIPS_MM,
  PANTRY_CHIPS_MM,
  SINK_CHIPS_MM,
} from "../support/width-model.js";
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

describe("resolveCatalogEquivalent — what a pointer means", () => {
  it("answers undefined for a buildId the catalogue does not hold, rather than throwing", () => {
    expect(
      resolveCatalogEquivalent(KITCHEN_L_BODY_CATALOG, "no-such-body"),
    ).toBeUndefined();
    expect(
      resolveBuildableSizes(KITCHEN_L_BODY_CATALOG, "no-such-body"),
    ).toEqual([]);
  });

  // The insertable check is on the source and short-circuits: an insertable row is its own §7 entry, so a stray
  // pointer on it must never redirect its chips.
  it("ignores a stray pointer on an insertable row and keeps its own set", () => {
    const catalog = catalogWith({
      "base-cabinet": { catalogEquivalentId: "base-dishwasher" },
    });
    expect(resolveCatalogEquivalent(catalog, "base-cabinet")?.buildId).toBe(
      "base-cabinet",
    );
    expect(resolveBuildableSizes(catalog, "base-cabinet")).toEqual([
      ...HINGED_CHIPS_MM,
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

  // A dangling pointer is data corruption; the answer must be no widths rather than a throw that takes the panel down.
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

  // The empty string is not `undefined`, so it takes the `catalog.get` branch and must still land on no widths.
  it("treats an empty-string pointer as a pointer that resolves to nothing", () => {
    const catalog = catalogWith({
      "wall-2door-600": { catalogEquivalentId: "" },
    });
    expect(resolveBuildableSizes(catalog, "wall-2door-600")).toEqual([]);
  });

  // A self-pointing row is the shortest cycle: one hop and no recursion terminates, where recursion would hang.
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

  // One hop, and the target is not re-resolved: A → B → C yields nothing rather than C's set, the safe direction
  // (no set beats a guessed set). "One hop" is a semantic choice, not an implementation detail.
  it("does not follow a second hop through another non-insertable row", () => {
    const catalog = catalogWith({
      "wall-2door-600": { catalogEquivalentId: "wall-2door-800" },
    });
    expect(catalog.get("wall-2door-800")?.insertable).not.toBe(true);
    expect(resolveCatalogEquivalent(catalog, "wall-2door-600")).toBeUndefined();
    expect(resolveBuildableSizes(catalog, "wall-2door-600")).toEqual([]);
  });

  // A set is only taken from a row `insertBody` could rebuild through, because §5.4's `canGive` reads the same
  // resolution and would otherwise answer true for a body the engine refuses. The fixture guard forbids this shape
  // in the shipped map; this covers every other catalogue.
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

  // The resolved entry is insertable but declares no `sizesMm`: a §7 row missing its data, so the resolution
  // succeeds and the set is empty.
  it("answers an empty set when the resolved entry declares no sizes", () => {
    const catalog = catalogPlus({
      "qa-setless": withoutSizes(entry("wall-cabinet")),
    });
    catalog.set("wall-2door-600", {
      ...entry("wall-2door-600"),
      catalogEquivalentId: "qa-setless",
    });
    expect(resolveCatalogEquivalent(catalog, "wall-2door-600")).toBeDefined();
    expect(resolveBuildableSizes(catalog, "wall-2door-600")).toEqual([]);
  });

  it("answers an empty set when the resolved entry's floor excludes every member", () => {
    const catalog = catalogWith({ "wall-cabinet": { minWidthMm: 900 } });
    expect(
      resolveCatalogEquivalent(catalog, "wall-2door-600")?.definition.sizesMm,
    ).toEqual(HINGED_CHIPS_MM);
    expect(resolveBuildableSizes(catalog, "wall-2door-600")).toEqual([]);
  });

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
    expect(first).toEqual(SINK_CHIPS_MM);
    expect(entry("base-sink-800").sizesMm).toBeUndefined();
    expect(JSON.stringify([...KITCHEN_L_BODY_CATALOG])).toBe(before);
  });
});

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

  it("publishes the entry's own set, resolved through no pointer at all", () => {
    const { world, placementId } = insertedDishwasherWorld(
      KITCHEN_L_BODY_CATALOG,
    );
    expect(metaFor(world, placementId).sizesMm).toEqual([450, 600]);
    expect(entry("base-dishwasher").catalogEquivalentId).toBeUndefined();
  });

  // A stray pointer on an insertable entry must not redirect its chips: the pointer is a seeded-row affordance only
  // (ADR 0011 Gap A).
  it("ignores a stray pointer declared on the §7 entry itself", () => {
    const { world, placementId } = insertedDishwasherWorld(
      catalogWith({ "base-dishwasher": { catalogEquivalentId: "base-sink" } }),
    );
    expect(metaFor(world, placementId).sizesMm).toEqual([450, 600]);
  });
});

describe("the floor that narrows the set is the resolved entry's own", () => {
  // A resize rebuilds through the §7 entry and `insertBody` reads that entry's `minWidthMm`; reading the seeded
  // row's instead would offer a chip the rebuild refuses.
  it("narrows by the equivalent's floor, not the seeded row's", () => {
    const catalog = catalogWith({ "wall-cabinet": { minWidthMm: 700 } });
    expect(
      metaFor(createWorld(KITCHEN_L_DESIGN, catalog), "p8").sizesMm,
    ).toEqual([700, 750, 800]);
  });

  it("ignores a floor declared on the seeded row, in either direction", () => {
    const raised = catalogWith({ "base-sink-800": { minWidthMm: 900 } });
    expect(
      metaFor(createWorld(KITCHEN_L_DESIGN, raised), "p0").sizesMm,
    ).toEqual(SINK_CHIPS_MM);

    const lowered = catalogWith({
      "base-sink-800": { minWidthMm: 100 },
      "base-sink": { sizesMm: [400, 600, 800] },
    });
    // The overridden set is read literally; 400 is still filtered out by the entry's own floor, never by the 100
    // the seeded row declares.
    expect(
      metaFor(createWorld(KITCHEN_L_DESIGN, lowered), "p0").sizesMm,
    ).toEqual([600, 800]);
  });

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

describe("the set follows the declaration, not any inference from the body", () => {
  it("gives two identical-looking base cabinets different sets", () => {
    const world = seeded();
    const drawer = metaFor(world, "p4");
    const hob = metaFor(world, "p2");
    expect([drawer.kind, drawer.band, drawer.widthMm]).toEqual([
      hob.kind,
      hob.band,
      hob.widthMm,
    ]);
    expect(drawer.sizesMm).toEqual(CABINETRY_CHIPS_MM);
    expect(hob.sizesMm).toEqual([600]);
  });

  // Declaration and every inference disagree on purpose: kind, band, label and width say wall cabinet, 800 while the
  // pointer says bottle cargo. A resolution that sanity-checked the answer against the body would fail here.
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

  it("prefers the declared entry over a perfect look-alike in the catalogue", () => {
    const catalog = catalogPlus({
      "qa-wall-twin": {
        ...entry("wall-cabinet"),
        sizesMm: [550, 650],
      },
    });
    const world = createWorld(KITCHEN_L_DESIGN, catalog);
    expect(metaFor(world, "p8").sizesMm).toEqual(HINGED_CHIPS_MM);

    const repointed = new Map(catalog).set("wall-2door-600", {
      ...entry("wall-2door-600"),
      catalogEquivalentId: "qa-wall-twin",
    });
    expect(
      metaFor(createWorld(KITCHEN_L_DESIGN, repointed), "p8").sizesMm,
    ).toEqual([550, 650]);
  });

  // The label resolves through the same live pointer as the set, so a repointing moves both. The `kind` assertion
  // pins only that the name travelling through the pointer does not drag the kind along (§11 row 24); `kind` is the
  // literal row's own declaration, so it witnesses nothing about how the label resolved.
  it("moves the set and the name together, and the kind not at all", () => {
    const catalog = catalogWith({
      "base-drawer3-600": { catalogEquivalentId: "base-dishwasher" },
    });
    const world = createWorld(KITCHEN_L_DESIGN, catalog);
    expect(metaFor(world, "p4").sizesMm).toEqual([450, 600]);
    expect(metaFor(world, "p4").label).toEqual(entryLabel("base-dishwasher"));
    expect(metaFor(seeded(), "p4").label).toEqual(entryLabel("base-3drawer"));
    expect(metaFor(world, "p4").kind).toBe("base_cabinet");
  });

  // The name follows the pointer; the door count does not: `describeBodyLabelAt` reads `doorCountFollowsWidth` off the
  // literal row. The fixture's namer copies it from the pointed-at entry, so only repointing past it separates the
  // two. A resolve-the-whole-definition shortcut would answer `labelWithDoors(entryLabel("wall-cabinet"), 2)`.
  it("takes the name from the pointer and the door count from the literal row", () => {
    const widened = catalogWith({
      "base-drawer3-600": { catalogEquivalentId: "wall-cabinet" },
    });
    expect(metaFor(createWorld(KITCHEN_L_DESIGN, widened), "p4").label).toEqual(
      entryLabel("wall-cabinet"),
    );
  });
});

/** The criterion for the sets, keyed by the §7 entry each body resolves. Each entry's set is its bound stepped at
 *  50 mm (ADR 0035 decision 2), so the table names only the rows whose bound is not a plain cabinetry one. */
const SET_BY_RESOLVED_ENTRY: Readonly<Record<string, readonly number[]>> = {
  "base-sink": SINK_CHIPS_MM, // ADR 0017's 560 mm aperture, stepped up
  "base-dishwasher": [450, 600], // discrete: dishwashers come in two sizes
  hood: HOOD_CHIPS_MM, // ADR 0035 decision 5: floored at 600
  "base-hob-2drawer": [600],
  "tall-oven-tower": [600],
  // ADR 0048: the one full-height row that is a bound, since no appliance inside it fixes its size.
  "tall-pantry": PANTRY_CHIPS_MM,
  "fridge-free": [700],
  // ADR 0033: one row, and the door count a customer gets follows the chosen width. The two hinged rows declare a
  // floor of 200 where every plain cabinetry row opens at §2's default. `wall-lift` and `open-shelf` keep the
  // fallback below exercised.
  "wall-cabinet": HINGED_CHIPS_MM,
};
const EVERYTHING_ELSE_MM: readonly number[] = CABINETRY_CHIPS_MM;

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
    // The sweep cannot shrink to nothing and both answers stay present: 26 placements, of which the four corner bodies
    // (which §7 does not build) declare no equivalent.
    expect(world.records.length).toBe(26);
    expect(empty).toBe(4);
    expect(resolved).toBe(22);
    // Both table branches still fire. The fallback count is exact because a fallback down to its last members is one
    // catalogue edit from being untested while this still read green.
    expect(viaFallback).toBe(2);
    expect(viaNamedEntry).toBe(20);
  });

  // Named individually: a fifth row silently joining the four would still satisfy the count if the count moved with it.
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

  // §7 dropped 1000 when two doors were capped at 800; asserted over the resolved sets and the catalogue itself, so
  // neither a seeded body nor an offer row can reintroduce it.
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
    // Every width the product publishes: the 50 mm grid from 200 to 800, plus the 450 the dishwasher niche declares.
    expect([...offered].sort((left, right) => left - right)).toEqual([
      200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800,
    ]);
    expect(offered.has(1000)).toBe(false);
  });
});

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

  // Both halves of the independence on real bodies: a willing body with no set, an unwilling body with one. Either
  // collapsing would mean the flag acquired a "has widths to offer" clause.
  it("is true beside an empty set, and false beside a full one", () => {
    const unpointed = createWorld(
      KITCHEN_L_DESIGN,
      catalogWith({ "wall-2door-600": { catalogEquivalentId: "nowhere" } }),
    );
    const willing = metaFor(unpointed, "p8");
    expect(willing.canWidth).toBe(true);
    expect(willing.sizesMm).toEqual([]);

    const world = seeded();
    const hood = metaFor(world, "p13");
    expect(hood.canWidth).toBe(false);
    expect(hood.sizesMm).toEqual(HOOD_CHIPS_MM);
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

  // A fixed-width body's set is inert: only the panel's width section reads `meta.sizesMm`, behind `canWidth`
  // (`width-chips.adversarial.test.ts` renders the panel).
  it("leaves a fixed-width body publishing a set it will never be offered", () => {
    const world = seeded();
    const fixedWithSets = world.records
      .filter((record) => record.fixedWidth)
      .filter((record) => metaFor(world, record.id).sizesMm.length > 0)
      .map((record) => record.id);
    expect(fixedWithSets).toEqual(["p2", "p5", "p7", "p13"]);
    for (const id of fixedWithSets) {
      expect([id, metaFor(world, id).canWidth]).toEqual([id, false]);
    }
  });

  // A flexible seeded row resolving a fixed-width entry would offer a width section over one buildable geometry;
  // `hood-600` is the safe near miss (fixed instance, flexible entry).
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

describe("the bottle cargo's 200 mm floor stays the cargo's alone", () => {
  it("keeps both of the cargo's own widths, with no 300 hard-coded anywhere in the path", () => {
    expect(entry("base-bottle-cargo").minWidthMm).toBe(200);
    expect(
      resolveBuildableSizes(KITCHEN_L_BODY_CATALOG, "base-bottle-cargo"),
    ).toEqual([200, 300]);
  });

  // Without the declared floor the same set loses its 200 to §2's default: the 200 comes from the declaration.
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

    // A 200 mm chip reaches every seeded wall body through `wall-cabinet` (ADR 0033 merged the one-door entry into it),
    // not through the cargo. The claim kept: the cargo's floor reaches nothing but the cargo, so each 200 is traced to
    // the entry it arrives through.
    const world = seeded();
    const withNarrowChip = world.records
      .filter((record) => metaFor(world, record.id).sizesMm.includes(200))
      .map((record) => record.id);
    expect(withNarrowChip.length).toBeGreaterThan(0);
    for (const id of withNarrowChip) {
      const record = world.records.find((candidate) => candidate.id === id);
      expect(
        KITCHEN_L_BODY_CATALOG.get(record?.buildId ?? "")?.catalogEquivalentId,
      ).toBe("wall-cabinet");
    }
  });

  it("names every entry in the catalogue declaring a floor under the default", () => {
    // ADR 0026: any second row declaring a floor under the default needs its own record; this list makes an unrecorded
    // declaration fail loudly.
    const declaringDown = INSERTABLE_BODY_DEFINITIONS.filter(
      ([, definition]) =>
        definition.minWidthMm !== undefined && definition.minWidthMm < 300,
    ).map(([buildId]) => buildId);
    expect(declaringDown).toEqual([
      "base-cabinet",
      "base-bottle-cargo",
      "wall-cabinet",
    ]);
  });
});
