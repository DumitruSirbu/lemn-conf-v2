// ADR 0070's first two implementation gaps, from the domain side: door leaves and drawers are two
// declared counts, door band heights are declared per entry, every shipped entry carries all three,
// and an entry that carries none refuses rather than guesses.
//
// **The wave's own regression is here** — the table of `cabinetHandleCount` recorded before the
// split, and the identity that reproduces it after. Nothing about the split may move a handle count,
// and the strongest check available to it is ADR 0070's independently derived figure for the seeded
// kitchen: 36 door leaves and 5 drawers, from which its 74 hinges follow.
//
// What this file cannot check is whether a declaration is *true of the meshes* — the domain has no
// meshes. That is `front-population.parity.test.ts` in `@lemnaria/three-adapter`, and the two halves
// are the whole gate.
import { describe, expect, it } from "vitest";

import {
  cabinetHandleCount,
  carriesDrawers,
  carriesFronts,
  ContradictoryFrontDeclarationError,
  doorBandHeightsMm,
  doorBandsMm,
  doorLeafCount,
  doorLeafHeightsMm,
  doorLeavesFollowWidth,
  drawerCount,
  frontPopulationQueryFor,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_PLACEMENTS,
  NO_DOOR_BANDS,
  NO_DRAWERS,
  NO_OPENING_FRONTS,
  oneBandInsetFromFrameMm,
  PANTRY_DOOR_BAND_HEIGHTS_MM,
  refuseContradictoryFrontDeclarations,
  TWO_DOOR_MIN_WIDTH_MM,
  UnbuildableDoorBandError,
  UndeclaredFrontPopulationError,
  wallDoorBandHeightMm,
  WALL_DOOR_BAND_INSET_MM,
  type BodyDefinition,
  type DeclaresFronts,
  type FrontPopulationRule,
  type FrontPopulationQuery,
} from "../src/index.js";
import { KITCHEN_L_DESIGN } from "../src/fixtures/kitchen-l-design.js";
import { priceDesign } from "../src/pricing/price-design.js";
import {
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
} from "../src/pricing/sample-price-book.js";

/** A width and a frame height a `declared-leaves` row ignores by construction — the argument every
 *  seeded row is asked about, and deliberately not a real one, for the reason
 *  `cabinet-handle-count.parity.test.ts` uses an unusable width: a row that silently took a
 *  width-following rule would otherwise resolve against a plausible cabinet here. */
const UNUSED_MM = 0;

/** A query at the size a `declared-leaves` rule ignores, for asserting a constructor's own meaning
 *  rather than a catalogue row's. */
function atUnusedSize(
  rule: FrontPopulationQuery["rule"],
): FrontPopulationQuery {
  return {
    buildId: "under-test",
    rule,
    widthMm: UNUSED_MM,
    frameHeightMm: UNUSED_MM,
  };
}

/** A rule shape TypeScript would refuse, as the `BodyCatalog` port can supply one. Cast through
 *  `unknown` because that is exactly the point: these are the values the type system already
 *  believes are impossible. */
function asRule(declared: unknown): FrontPopulationRule {
  return declared as FrontPopulationRule;
}

/** One band and no leaf to stand in it — the contradiction, as a row assembled outside TypeScript. */
const CONTRADICTORY_RULE = {
  countedFrom: "declared-leaves",
  doorBands: doorBandsMm([710]),
  leavesPerBand: 0,
  drawers: 0,
};

function definitionOf(buildId: string): BodyDefinition {
  const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
  if (!definition) throw new Error(`No catalogue entry for "${buildId}"`);
  return definition;
}

/** Every entry in the one map, at every size the entry can be asked about: an insertable row at each
 *  width it declares and its nominal height, a seeded row at the one already-built body it is
 *  (ADR 0011 Gap A). The same sweep `cabinet-handle-count.parity.test.ts` runs, because the identity
 *  below has to hold over exactly the rows that gate declares. */
const GATED_BODIES: readonly FrontPopulationQuery[] = [
  ...KITCHEN_L_BODY_CATALOG,
].flatMap(([buildId, definition]) => {
  const query = { buildId, rule: definition.fronts };
  if (definition.insertable !== true) {
    return [{ ...query, widthMm: UNUSED_MM, frameHeightMm: UNUSED_MM }];
  }
  return (definition.sizesMm ?? []).map((widthMm) => ({
    ...query,
    widthMm,
    frameHeightMm: definition.nominalHeightMm ?? UNUSED_MM,
  }));
});

describe("a body's fronts are declared, per entry", () => {
  it("every entry in both populations declares them", () => {
    const undeclared = [...KITCHEN_L_BODY_CATALOG]
      .filter(([, definition]) => definition.fronts === undefined)
      .map(([buildId]) => buildId);

    expect(undeclared).toEqual([]);
    // Not a vacuous sweep over an empty map.
    expect(KITCHEN_L_BODY_CATALOG.size).toBe(40); // 38 → 40 (M7C wave C2)
  });

  it("sweeps every width an insertable row declares, not one row per entry", () => {
    const sweptIds = new Set(GATED_BODIES.map(({ buildId }) => buildId));

    expect(sweptIds.size).toBe(KITCHEN_L_BODY_CATALOG.size);
    expect(GATED_BODIES.length).toBeGreaterThan(sweptIds.size);
  });
});

// **The before/after table.** `cabinetHandleCount` is untouched by this wave and stays the honest
// declared side of the handle meshes (ADR 0061); what is new is that the same number is now also
// the sum of two others. The identity is *asserted*, never enforced by construction: it holds today
// only because every shipped row declares `handlesPerLeaf: 1`, and a future row with two bars on a
// leaf, or a `handle: "push"` row with mechanisms and no handle at all, would break it truthfully.
describe("the split preserves every entry's handle count", () => {
  it.each(
    GATED_BODIES.map(
      (body) => [`${body.buildId}@${String(body.widthMm)}`, body] as const,
    ),
  )(
    "%s: declared leaves plus drawers reproduce the declared handles",
    (label, body) => {
      const handles = cabinetHandleCount({
        buildId: body.buildId,
        rule: definitionOf(body.buildId).cabinetHandles,
        widthMm: body.widthMm,
      });

      expect([label, doorLeafCount(body) + drawerCount(body)]).toEqual([
        label,
        handles,
      ]);
    },
  );

  // The identity above would pass vacuously on a catalogue of hoods. These are the rows it is
  // actually about: the same declared `2` meaning two leaves on one and two drawers on the other,
  // which is ADR 0070's own statement of why one number could not serve both.
  it("separates the two rows ADR 0070 names, which declare the same handle count", () => {
    const sink = {
      buildId: "base-sink",
      rule: definitionOf("base-sink").fronts,
      widthMm: 600,
      frameHeightMm: 860,
    };
    const panbank = {
      buildId: "base-panbank",
      rule: definitionOf("base-panbank").fronts,
      widthMm: 600,
      frameHeightMm: 860,
    };

    expect([doorLeafCount(sink), drawerCount(sink)]).toEqual([2, 0]);
    expect([doorLeafCount(panbank), drawerCount(panbank)]).toEqual([0, 2]);
    expect(
      cabinetHandleCount({
        ...sink,
        rule: definitionOf("base-sink").cabinetHandles,
      }),
    ).toBe(2);
    expect(
      cabinetHandleCount({
        ...panbank,
        rule: definitionOf("base-panbank").cabinetHandles,
      }),
    ).toBe(2);
  });
});

// **ADR 0070's cross-check, and the strongest one this wave has.** The owner derived 74 hinges and
// 5 drawers for the seeded kitchen from the real catalogue and the builders' own door-band heights,
// before any of this was declared — an independent derivation, which is the only reason the numbers
// mean anything. 74 hinges is 2 per leaf with a third on each leaf over 900 mm: 34 × 2 + 2 × 3, so
// 36 leaves. **This wave does not count hinges** (that is ADR 0070's rule and wave 6T's work); it
// asserts the two populations the rule is counted over.
describe("the seeded kitchen's declared fronts", () => {
  // Through `frontPopulationQueryFor`, which is the seam wave 6T reads: a test that assembled the
  // query by hand would be checking a call site nothing ships.
  const seeded = KITCHEN_L_PLACEMENTS.map((placement) =>
    frontPopulationQueryFor({
      body: placement.body,
      definition: definitionOf(placement.body.buildId),
    }),
  );

  const totalOf = (count: (query: FrontPopulationQuery) => number): number =>
    seeded.reduce((sum, query) => sum + count(query), 0);

  it("are 36 door leaves and 5 drawers, ADR 0070's own figures", () => {
    expect(seeded.length).toBe(26);
    expect(totalOf(doorLeafCount)).toBe(36);
    expect(totalOf(drawerCount)).toBe(5);
  });

  // Where the 5 drawers are, so a body that stopped being a drawer stack cannot be absorbed by a
  // body that started being one.
  it("puts every one of those drawers in the two drawer bases", () => {
    const drawersByBuildId = seeded
      .filter((query) => drawerCount(query) > 0)
      .map((query) => [query.buildId, drawerCount(query)]);

    expect(drawersByBuildId).toEqual([
      ["base-hob-2drawer-600", 2],
      ["base-drawer3-600", 3],
    ]);
  });

  // The band heights the hinge rule will read, and the reason they are declared: two of the seeded
  // kitchen's 36 leaves are over ADR 0070's 900 mm threshold, and both are the pantry's lower band
  // — inside a body whose declared frame height is 2200.
  it("has exactly two leaves taller than the 900 mm ADR 0070 counts a third hinge at", () => {
    // `doorLeafHeightsMm`, not a reconstruction from a count and a band list. This file and the
    // three-adapter parity gate had each written that reconstruction independently, which is what
    // moved it into the module: a caller doing it by hand applies the threshold to the *bands*
    // sooner or later, and that counts 45 hinges here against the correct 74.
    const leafHeights = seeded.flatMap((query) => doorLeafHeightsMm(query));

    expect(leafHeights.length).toBe(36);
    expect(leafHeights.filter((heightMm) => heightMm > 900)).toEqual([
      1290, 1290,
    ]);
  });
});

describe("door band heights are declared, not read off the frame", () => {
  // The defect the declaration exists to prevent, stated as an inequality rather than implied.
  it("declares a pantry's bands that do not sum to its frame height", () => {
    const pantry = definitionOf("tall-pantry-600");
    const bands = doorBandHeightsMm({
      buildId: "tall-pantry-600",
      rule: pantry.fronts,
      widthMm: UNUSED_MM,
      frameHeightMm: UNUSED_MM,
    });

    expect(bands).toEqual([...PANTRY_DOOR_BAND_HEIGHTS_MM]);
    expect(pantry.frameHeightMm).toBe(2200);
    expect(bands.reduce((sum, band) => sum + band, 0)).toBe(2080);
    // Read off the frame instead, the short band would be 2200 and take a third hinge.
    expect(bands).not.toContain(pantry.frameHeightMm);
  });

  it("gives a heightFlex row the band its own frame leaves it", () => {
    const query = {
      buildId: "wall-cabinet",
      rule: definitionOf("wall-cabinet").fronts,
      widthMm: 600,
      frameHeightMm: 700,
    };

    expect(doorBandHeightsMm(query)).toEqual([694]);
    expect(doorBandHeightsMm({ ...query, frameHeightMm: 400 })).toEqual([394]);
    expect(wallDoorBandHeightMm(750)).toBe(744);
    expect(WALL_DOOR_BAND_INSET_MM).toBe(6);
  });

  it("answers a body that opens nothing with no band at all, rather than refusing", () => {
    const hood = {
      buildId: "hood",
      rule: definitionOf("hood").fronts,
      widthMm: 600,
      frameHeightMm: 700,
    };

    expect(doorBandHeightsMm(hood)).toEqual([]);
    expect(doorLeafCount(hood)).toBe(0);
    expect(drawerCount(hood)).toBe(0);
  });

  // `base-hob-oven` builds one front — `oven_filler_door_front` — and it is a facade over the oven
  // cavity. Nothing behind it opens, so it is neither a leaf nor a drawer and carries no band.
  it("gives the hob-and-oven base no band, although it builds a front", () => {
    const hobOven = {
      buildId: "base-hob-oven",
      rule: definitionOf("base-hob-oven").fronts,
      widthMm: 600,
      frameHeightMm: 860,
    };

    expect(hobOven.rule).toEqual(NO_OPENING_FRONTS);
    expect(doorBandHeightsMm(hobOven)).toEqual([]);
    expect(doorLeafCount(hobOven)).toBe(0);
    expect(definitionOf("base-hob-oven").canFinish).toBe(true);
  });
});

// **The input the 74-hinge cross-check cannot see.** Every seeded row declares its band heights, so
// no seeded placement's rule reads `frameHeightMm` — pass 12345 for every one of them and the design
// still answers 36 leaves and 74 hinges. That blindness is a property of the fixture, not a defect,
// but it means the cross-check is no guard at all on the height source, and wave 6T's first mistake
// would be silent. These are the tests that do guard it.
describe("the frame height is an input, and something must depend on it", () => {
  const wallCabinetAt = (frameHeightMm: number): FrontPopulationQuery =>
    frontPopulationQueryFor({
      body: { buildId: "wall-cabinet", widthMm: 600, heightMm: frameHeightMm },
      definition: definitionOf("wall-cabinet"),
    });

  it("changes a heightFlex row's answer when the frame height changes", () => {
    // From the failing side: if this passed with the same list at both heights, the input would be
    // decorative and a wrong source would be undetectable.
    expect(doorLeafHeightsMm(wallCabinetAt(700))).toEqual([694, 694]);
    expect(doorLeafHeightsMm(wallCabinetAt(400))).toEqual([394, 394]);
    expect(doorLeafHeightsMm(wallCabinetAt(12345))).toEqual([12339, 12339]);
  });

  // The wrong source, named. One entry, one `nominalHeightMm`, three built heights: reading the
  // nominal pins every leaf at 694 and reads exactly as plausible as reading the placement.
  it("takes the height from the placement and not from the entry's nominal", () => {
    const definition = definitionOf("wall-cabinet");
    expect(definition.nominalHeightMm).toBe(700);

    for (const heightMm of [400, 700, 750]) {
      const query = frontPopulationQueryFor({
        body: { buildId: "wall-cabinet", widthMm: 600, heightMm },
        definition,
      });

      expect([heightMm, query.frameHeightMm]).toEqual([heightMm, heightMm]);
      expect([heightMm, doorLeafHeightsMm(query)]).toEqual([
        heightMm,
        [heightMm - 6, heightMm - 6],
      ]);
    }
  });

  // And the blindness itself, stated rather than left implicit — so nobody reads the 36/5 assertions
  // above as evidence that the height source is right.
  it("leaves the seeded design's answer unchanged at any frame height, which is why it is no guard", () => {
    const atAnyHeight = (frameHeightMm: number): number =>
      KITCHEN_L_PLACEMENTS.reduce(
        (sum, placement) =>
          sum +
          doorLeafCount({
            ...frontPopulationQueryFor({
              body: placement.body,
              definition: definitionOf(placement.body.buildId),
            }),
            frameHeightMm,
          }),
        0,
      );

    expect(atAnyHeight(0)).toBe(36);
    expect(atAnyHeight(12345)).toBe(36);
  });
});

// A caller's `.sort()` must not reorder a module constant for the rest of the process. `readonly` is
// a compile-time promise and `BodyCatalog` is reachable from plain JavaScript.
describe("a declared band list is the catalogue's to keep", () => {
  it("hands out neither the module constant nor a mutable array", () => {
    const query = {
      buildId: "tall-pantry-600",
      rule: definitionOf("tall-pantry-600").fronts,
      widthMm: UNUSED_MM,
      frameHeightMm: UNUSED_MM,
    };
    const bands = doorBandHeightsMm(query);

    expect(bands).not.toBe(PANTRY_DOOR_BAND_HEIGHTS_MM);
    expect(Object.isFrozen(bands)).toBe(true);
    // From the failing side: the mutation a caller would make, and the constant surviving it.
    expect(() => (bands as number[]).sort((a, b) => a - b)).toThrow(TypeError);
    expect(doorBandHeightsMm(query)).toEqual([1290, 790]);
    expect([...PANTRY_DOOR_BAND_HEIGHTS_MM]).toEqual([1290, 790]);
  });
});

// A declaration whose two halves disagree describes a body that cannot exist, and it used to answer
// zero leaves — which ADR 0070 would price as zero hinges on a cabinet with a visible door.
describe("a contradictory declaration is refused where it is written", () => {
  it("refuses bands with no leaves to stand in them", () => {
    expect(() =>
      carriesFronts({
        doorBands: doorBandsMm([710]),
        leavesPerBand: 0,
        drawers: NO_DRAWERS,
      }),
    ).toThrow(ContradictoryFrontDeclarationError);
    // The refusal names the band rule, which is what locates the row without a buildId.
    expect(() =>
      carriesFronts({
        doorBands: doorBandsMm([1290, 790]),
        leavesPerBand: 0,
        drawers: NO_DRAWERS,
      }),
    ).toThrow(/1290/);
  });

  it("refuses leaves with no band to stand in", () => {
    expect(() =>
      carriesFronts({
        doorBands: NO_DOOR_BANDS,
        leavesPerBand: 2,
        drawers: NO_DRAWERS,
      }),
    ).toThrow(ContradictoryFrontDeclarationError);
    // The same contradiction on the width-following arm, where `deriveDoorCount` never answers zero.
    expect(() => doorLeavesFollowWidth(NO_DOOR_BANDS)).toThrow(
      ContradictoryFrontDeclarationError,
    );
  });

  it("keeps letting a body that opens nothing declare nothing", () => {
    // `(no bands, no leaves)` is consistent and every hood, hood-like and drawer-only row is it.
    expect(() =>
      carriesFronts({
        doorBands: NO_DOOR_BANDS,
        leavesPerBand: 0,
        drawers: 3,
      }),
    ).not.toThrow();
    expect(doorLeafCount(atUnusedSize(NO_OPENING_FRONTS))).toBe(0);
    expect(drawerCount(atUnusedSize(carriesDrawers(3)))).toBe(3);
  });

  // **The port half, which is the one that can name the row.** A definition assembled outside
  // TypeScript passes no constructor at all, so `carriesFronts` never sees it; the sweep
  // `buildKitchenLBodyCatalog` runs beside `refuseUndeclaredDepthRules` does, and it has the id.
  it("names the row when the contradiction arrives through the port", () => {
    const throughThePort: readonly (readonly [string, DeclaresFronts])[] = [
      ["base-sink", definitionOf("base-sink")],
      ["wall-cabinet-from-outside", { fronts: asRule(CONTRADICTORY_RULE) }],
    ];
    const sweep = (): void => {
      refuseContradictoryFrontDeclarations(throughThePort);
    };

    expect(sweep).toThrow(ContradictoryFrontDeclarationError);
    // The relevant datum is *which row*, and a band list alone does not identify one in a log.
    expect(sweep).toThrow(/wall-cabinet-from-outside/);
  });

  // A rule that is missing or wears a tag this module does not know is **not** this sweep's to
  // refuse — that is the query-time refusal's, and failing catalogue load over a row nothing has
  // asked about yet would be the wrong failure at the wrong moment.
  it("lets an undeclared or unrecognised row through to the query-time refusal", () => {
    const unreadable: readonly (readonly [string, DeclaresFronts])[] = [
      ["nothing-declared", {}],
      ["unknown-tag", { fronts: asRule({ countedFrom: "mesh-count" }) }],
    ];

    expect(() => {
      refuseContradictoryFrontDeclarations(unreadable);
    }).not.toThrow();
  });

  it("passes the shipped catalogue, which every constructor has already refused", () => {
    expect(() => {
      refuseContradictoryFrontDeclarations([...KITCHEN_L_BODY_CATALOG]);
    }).not.toThrow();
  });

  // All 40 shipped rows are constructed as the catalogue is assembled, which is module load — so
  // this sweep is a statement that the refusal above has already run over every one of them.
  it("has already run over both populations by the time this file loads", () => {
    expect(KITCHEN_L_BODY_CATALOG.size).toBe(40); // 38 → 40 (M7C wave C2)
    for (const [buildId, definition] of KITCHEN_L_BODY_CATALOG) {
      const bands = doorBandHeightsMm({
        buildId,
        rule: definition.fronts,
        widthMm: 600,
        frameHeightMm: 700,
      });
      const leaves = doorLeafCount({
        buildId,
        rule: definition.fronts,
        widthMm: 600,
        frameHeightMm: 700,
      });

      expect([buildId, bands.length === 0]).toEqual([buildId, leaves === 0]);
    }
  });
});

describe("leaves that follow a width", () => {
  const pantryAt = (widthMm: number): FrontPopulationQuery => ({
    buildId: "tall-pantry",
    rule: definitionOf("tall-pantry").fronts,
    widthMm,
    frameHeightMm: 2200,
  });

  // ADR 0035 decision 4's half-open bound, read through the leaf count: two bands of one leaf below
  // the threshold and two of two at and above it.
  it("steps at the two-door threshold and multiplies by the bands", () => {
    expect(doorLeafCount(pantryAt(TWO_DOOR_MIN_WIDTH_MM - 1))).toBe(2);
    expect(doorLeafCount(pantryAt(TWO_DOOR_MIN_WIDTH_MM))).toBe(4);
    expect(doorBandHeightsMm(pantryAt(TWO_DOOR_MIN_WIDTH_MM - 1)).length).toBe(
      2,
    );
  });

  it("keeps the band heights fixed as the width moves", () => {
    expect(doorBandHeightsMm(pantryAt(400))).toEqual(
      doorBandHeightsMm(pantryAt(800)),
    );
  });
});

// ADR 0061 decision 4, one declaration over. `BodyCatalog` is a port, and a definition assembled
// outside TypeScript can arrive with no rule at all — or with a rule that carries the tag and not
// the number, the second shape of unusable that QA found one field later than the first on
// `cabinet-handles.ts`. Both must refuse rather than answer zero.
describe("an entry that declares nothing refuses", () => {
  /** Each case names the query that reads the field it is missing. A rule with no drawer count is
   *  perfectly usable for a leaf count, so asserting every query refuses every case would pass by
   *  accident on the wrong function. */
  const unusable: readonly [
    string,
    unknown,
    (query: FrontPopulationQuery) => unknown,
  ][] = [
    ["no rule at all, asked for leaves", undefined, doorLeafCount],
    ["no rule at all, asked for drawers", undefined, drawerCount],
    ["no rule at all, asked for bands", undefined, doorBandHeightsMm],
    [
      "a rule this module does not know",
      { countedFrom: "mesh-count" },
      doorLeafCount,
    ],
    [
      "a tagged rule with no bands at all",
      { countedFrom: "declared-leaves", leavesPerBand: 1, drawers: 0 },
      doorBandHeightsMm,
    ],
    [
      "a tagged rule with no leaf count",
      { countedFrom: "declared-leaves", doorBands: NO_DOOR_BANDS, drawers: 0 },
      doorLeafCount,
    ],
    [
      "a tagged rule with no drawer count",
      { countedFrom: "leaves-follow-width", doorBands: NO_DOOR_BANDS },
      drawerCount,
    ],
    [
      "a fractional leaf count",
      {
        countedFrom: "declared-leaves",
        doorBands: doorBandsMm([710]),
        leavesPerBand: 1.5,
        drawers: 0,
      },
      doorLeafCount,
    ],
    [
      "a negative drawer count",
      {
        countedFrom: "declared-leaves",
        doorBands: NO_DOOR_BANDS,
        leavesPerBand: 0,
        drawers: -1,
      },
      drawerCount,
    ],
    [
      "a band list that is not a list of heights",
      {
        countedFrom: "declared-leaves",
        doorBands: {
          measuredFrom: "declared-heights",
          bandHeightsMm: [710, 0],
        },
        leavesPerBand: 1,
        drawers: 0,
      },
      doorBandHeightsMm,
    ],
    [
      "a band rule tagged with a measurement this module does not know",
      {
        countedFrom: "declared-leaves",
        doorBands: { measuredFrom: "mesh-height" },
        leavesPerBand: 1,
        drawers: 0,
      },
      doorBandHeightsMm,
    ],
  ];

  it.each(unusable)("refuses %s", (_label, rule, ask) => {
    const query = {
      buildId: "base-sink",
      rule: rule as FrontPopulationQuery["rule"],
      widthMm: 600,
      frameHeightMm: 860,
    };

    expect(() => ask(query)).toThrow(UndeclaredFrontPopulationError);
    expect(() => ask(query)).toThrow(/base-sink/);
  });

  // Never a `NaN` quantity out of a function typed `: number` — the shape QA found on
  // `cabinet-handles.ts` one field later than its first refusal, and the one nothing downstream can
  // even compare.
  it("never answers a leaf count that is not a number", () => {
    const taggedWithNoNumbers = {
      buildId: "base-sink",
      rule: { countedFrom: "declared-leaves" } as FrontPopulationQuery["rule"],
      widthMm: 600,
      frameHeightMm: 860,
    };

    expect(() => doorLeafCount(taggedWithNoNumbers)).toThrow(
      UndeclaredFrontPopulationError,
    );
  });

  // The inset is declared and fine; the *frame height* is the caller's. A query that leaves no band
  // must not come back with a zero or negative height and be read as a leaf under 900 mm.
  it("refuses a frame height that leaves no band to build", () => {
    expect(() =>
      doorBandHeightsMm({
        buildId: "wall-cabinet",
        rule: definitionOf("wall-cabinet").fronts,
        widthMm: 600,
        frameHeightMm: WALL_DOOR_BAND_INSET_MM,
      }),
    ).toThrow(UnbuildableDoorBandError);
  });
});

// **Wave 6S declares and prices nothing.** ADR 0070 replaces `HardwareTier.perCabinetHandleMinor`,
// and until the wave that does it the shipped hardware line still multiplies a rate by the cabinet
// handle count. These are the seeded design's totals recorded before the split, asserted directly
// rather than inferred from "we only touched declarations" — the whole point of a value-preserving
// wave is that the value is checked and not asserted in prose.
/**
 * **Wave 6S declared these fronts and changed no price. Wave 6T priced them, and this block records
 * what moved and what did not** (ADR 0070 decision 1, planned by ADR 0092 decision 6).
 *
 * The cabinet lines are untouched — every figure below still differs from the one beside it by a
 * *hardware* amount alone, which is what keeps this a check on the split rather than a restatement
 * of the book. What moved is the hardware basis: the seeded kitchen's 41 cabinet handles were
 * replaced as the quantity by its 74 hinges and 5 drawers, and the Standard tier stopped costing
 * nothing.
 *
 * **The three hardware amounts are ADR 0092 decision 6's table, reconciled to ADR 0070's own hinge
 * and drawer columns** — 1 300 + 3 200, 6 290 + 3 130, 5 550 + 4 185 MDL — **plus a push column
 * that record never published** (ADR 0092 Amendment C): the seeded kitchen's top row carries 16
 * latches. Hettich and Blum land on the leu; Standard lands 2.40 MDL above, which is the owner's
 * rounding of 1 302.40 down to 1 300. The hinge and drawer terms are written out because they
 * reconcile against the owner's own columns; **the push term is read from the book**, because the
 * three push rates are drafted placeholders and a literal here would make one load-bearing.
 * `hardware-tier-reconciliation.test.ts` is where that derivation is asserted; here the point is
 * only that the whole design's total is the old cabinet total plus exactly that hardware line and
 * nothing else has drifted.
 */
describe("what wave 6S declared, wave 6T prices", () => {
  const priceAt = (hardwareTierId: string | undefined) => {
    const result = priceDesign({
      design: KITCHEN_L_DESIGN,
      catalog: KITCHEN_L_BODY_CATALOG,
      book: SAMPLE_PRICE_BOOK,
      pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
      selections: { hardwareTierId },
    });
    if (!result.ok)
      throw new Error(`Seeded design refused: ${result.failure.code}`);
    return result.priced;
  };

  const totalAt = (hardwareTierId: string | undefined): number =>
    priceAt(hardwareTierId).totalMinor;

  const hardwareAmountAt = (hardwareTierId: string | undefined): number => {
    const line = priceAt(hardwareTierId).lines.find(
      (candidate) => candidate.kind === "hardware",
    );
    if (!line) throw new Error("Seeded design published no hardware line");
    return line.amountMinor;
  };

  /** What the seeded design cost with **no** hardware billed — the figure every total below is this
   *  plus one hardware line. It was the whole design's total until wave 6T, when the Standard tier
   *  stopped being zero.
   *
   *  **Down 1 490 000 from 9 427 500 on the owner's ruling of 2026-09-10**, which stopped charging
   *  for the two rows the manufacturer does not supply: the seeded kitchen's `hood-600` (290 000)
   *  and its `fridge-free-700` (1 200 000). The housings around them are joinery and are unchanged,
   *  which is why the drop is exactly those two lines and not an appliance-shaped share of the
   *  kitchen. */
  const CABINETRY_AND_MATERIAL_MINOR = 7_937_500;

  /** ADR 0070 decision 4's two sink extras, which wave 6T2 added to every one of these totals: the
   *  seeded kitchen holds one sink under one wall cabinet, so it earns one cover and one rack. Flat
   *  and identical in all three tier columns, which is what says they sit outside the tier —
   *  `sink-extras.test.ts` is where that is reconciled against ADR 0070's own column. */
  const SINK_EXTRAS_MINOR = 60_000;

  /** The seeded kitchen's 16 latches, pinned as the count they are — a product fact answerable
   *  without any amount, unlike the rate it multiplies. */
  const SEEDED_PUSH_TO_OPEN = 16;

  const latchesAt = (tierId: string): number => {
    const tier = SAMPLE_PRICE_BOOK.hardware.tiers.find(
      (candidate) => candidate.tierId === tierId,
    );
    if (!tier) throw new Error(`the book holds no "${tierId}"`);
    return SEEDED_PUSH_TO_OPEN * tier.perPushToOpenMinor;
  };

  it("prices the seeded design at its cabinetry plus one hardware line, at every tier", () => {
    expect(SAMPLE_PRICE_BOOK.hardware.tiers.map((tier) => tier.tierId)).toEqual(
      ["hardware.standard", "hardware.soft-close", "hardware.premium"],
    );

    // The default tier is Standard, and it is no longer free (ADR 0092 decision 15's interim).
    expect(totalAt(undefined)).toBe(totalAt("hardware.standard"));
    expect(totalAt("hardware.standard")).toBe(
      CABINETRY_AND_MATERIAL_MINOR +
        SINK_EXTRAS_MINOR +
        450_240 +
        latchesAt("hardware.standard"),
    );
    expect(totalAt("hardware.soft-close")).toBe(
      CABINETRY_AND_MATERIAL_MINOR +
        SINK_EXTRAS_MINOR +
        942_000 +
        latchesAt("hardware.soft-close"),
    );
    expect(totalAt("hardware.premium")).toBe(
      CABINETRY_AND_MATERIAL_MINOR +
        SINK_EXTRAS_MINOR +
        973_500 +
        latchesAt("hardware.premium"),
    );
  });

  /** **The cabinetry did not move.** The three totals above differ from each other by a hardware
   *  amount alone, so subtracting each design's own hardware line must return one number — and it
   *  must be the number this design priced at before either wave touched it. This is what makes the
   *  block above a check on the hardware basis rather than three fresh expectations. */
  it("leaves every cabinet and material line exactly where wave 6S found them", () => {
    // The sink extras come off with the hardware, because they too are a whole-figure term that does
    // not move with the tier — the point of subtracting is to recover the *cabinetry*.
    const withoutHardware = SAMPLE_PRICE_BOOK.hardware.tiers.map(
      (tier) =>
        totalAt(tier.tierId) -
        hardwareAmountAt(tier.tierId) -
        SINK_EXTRAS_MINOR,
    );

    expect(new Set(withoutHardware)).toEqual(
      new Set([CABINETRY_AND_MATERIAL_MINOR]),
    );
  });

  /** **The handle count survives the wave and stops being what hardware is billed by.** The seeded
   *  design's 41 handles are the 36 leaves plus 5 drawers above, and that identity is still what
   *  makes the split checkable. What no longer holds is that any tier spread divides by 41: ADR
   *  0070 decision 1 prices per mechanism, so the spread is a function of 74 hinges, 5 drawers and
   *  16 latches, and there is no per-handle rate left to recover from it. */
  it("keeps the 41 handles the split reproduces, and prices none of them", () => {
    const handlesInSeededDesign = KITCHEN_L_PLACEMENTS.reduce(
      (sum, placement) =>
        sum +
        cabinetHandleCount({
          buildId: placement.body.buildId,
          rule: definitionOf(placement.body.buildId).cabinetHandles,
          widthMm: placement.body.widthMm,
        }),
      0,
    );

    expect(handlesInSeededDesign).toBe(41);

    const spreadMinor =
      totalAt("hardware.soft-close") - totalAt("hardware.standard");
    expect(spreadMinor).toBe(
      942_000 -
        450_240 +
        latchesAt("hardware.soft-close") -
        latchesAt("hardware.standard"),
    );
    // Not a per-handle rate: the spread over 41 handles is not a whole number of bani, and an exact
    // per-handle basis is precisely what a wave reintroducing the old quantity would make it be.
    expect(Number.isInteger(spreadMinor / handlesInSeededDesign)).toBe(false);
  });
});

describe("the declaration constructors say what they are named", () => {
  const at = (
    rule: ReturnType<typeof carriesDrawers>,
  ): FrontPopulationQuery => ({
    buildId: "under-test",
    rule,
    widthMm: 600,
    frameHeightMm: 700,
  });

  it("carries drawers and no leaf", () => {
    expect(doorLeafCount(at(carriesDrawers(3)))).toBe(0);
    expect(drawerCount(at(carriesDrawers(3)))).toBe(3);
    expect(doorBandHeightsMm(at(carriesDrawers(3)))).toEqual([]);
  });

  it("opens nothing", () => {
    expect(doorLeafCount(at(NO_OPENING_FRONTS))).toBe(0);
    expect(drawerCount(at(NO_OPENING_FRONTS))).toBe(0);
  });

  it("multiplies declared bands by declared leaves per band", () => {
    const threeBands = carriesFronts({
      doorBands: doorBandsMm([1350, 530, 190]),
      leavesPerBand: 1,
      drawers: NO_DRAWERS,
    });

    expect(doorLeafCount(at(threeBands))).toBe(3);
    expect(doorBandHeightsMm(at(threeBands))).toEqual([1350, 530, 190]);
  });

  it("follows a width only where the row says it does", () => {
    const following = doorLeavesFollowWidth(oneBandInsetFromFrameMm(6));

    expect(doorLeafCount({ ...at(following), widthMm: 400 })).toBe(1);
    expect(doorLeafCount({ ...at(following), widthMm: 600 })).toBe(2);
    expect(drawerCount(at(following))).toBe(0);
  });
});
