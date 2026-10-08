import { describe, expect, it } from "vitest";

import {
  acceptsWidthMm,
  baseFinishedDepthMm,
  buildableSizes,
  describeBodyLabelAt,
  INSERTABLE_BODY_DEFINITIONS,
  isKnownKind,
  listInsertableBodies,
  resolveCatalogEquivalent,
  toInsertableBody,
} from "../src/catalog.js";
import { WORKTOP_DEPTH_MM } from "../src/worktop-depth.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_PLACEMENTS,
} from "../src/fixtures/kitchen-l-design.js";
import { finishesAtMm } from "../src/occupied-depth.js";
import { MIN_WIDTH_M, type BodyDefinition } from "../src/void-engine.js";

/** §2's default floor in millimetres, for the range guard below. */
const MIN_WIDTH_MM = 1000 * MIN_WIDTH_M;

const SEEDED_BUILD_IDS = [
  ...new Set(KITCHEN_L_PLACEMENTS.map((placement) => placement.body.buildId)),
];

describe("the one catalogue, two populations (ADR 0011 Gap A)", () => {
  it("carries every §7 entry as insertable", () => {
    expect(listInsertableBodies(KITCHEN_L_BODY_CATALOG)).toHaveLength(
      INSERTABLE_BODY_DEFINITIONS.length,
    );
  });

  it("marks every seeded entry not insertable, without losing it from the lookup", () => {
    for (const buildId of SEEDED_BUILD_IDS) {
      const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
      expect(definition, buildId).toBeDefined();
      expect(definition?.insertable, buildId).toBe(false);
    }
  });

  it("adds no id that collides with a seeded one", () => {
    for (const [buildId] of INSERTABLE_BODY_DEFINITIONS) {
      expect(SEEDED_BUILD_IDS, buildId).not.toContain(buildId);
    }
  });

  it("gives every insertable entry the fields §5.2 reads", () => {
    for (const [buildId, definition] of INSERTABLE_BODY_DEFINITIONS) {
      const body = toInsertableBody(buildId, definition);
      expect(body, buildId).toBeDefined();
      expect(body?.label, buildId).toEqual({ kind: "entry", buildId });
      expect(body?.sizesMm.length, buildId).toBeGreaterThan(0);
      expect(body?.nominalHeightMm, buildId).toBeGreaterThan(0);
    }
  });
});

describe("every declared catalogue equivalent resolves to an insertable row", () => {
  // ADR 0022: a seeded body is priced, sized and named through the §7 row it points at. A dangling or non-insertable
  // pointer is a catalogue defect; asserting it here covers every `resolveCatalogEquivalent` caller at once, where a
  // guard in one reader would cover only that reader.

  it("resolves every pointer the catalogue declares, in both populations", () => {
    const declared = [...KITCHEN_L_BODY_CATALOG].flatMap(
      ([buildId, definition]) =>
        definition.catalogEquivalentId === undefined
          ? []
          : [[buildId, definition.catalogEquivalentId] as const],
    );

    expect(declared.length).toBeGreaterThan(17);
    for (const [buildId, equivalentId] of declared) {
      const equivalent = KITCHEN_L_BODY_CATALOG.get(equivalentId);
      expect(equivalent, `${buildId} → ${equivalentId}`).toBeDefined();
      expect(equivalent?.insertable, `${buildId} → ${equivalentId}`).toBe(true);
      expect(
        resolveCatalogEquivalent(KITCHEN_L_BODY_CATALOG, buildId)?.buildId,
        buildId,
      ).toBe(equivalentId);
    }
  });

  it("leaves the structural corners pointing at nothing, and that is the right answer", () => {
    // A sweep over declared pointers alone would pass on a catalogue that declared none. These six are structural
    // (ADR 0021), so having no equivalent is correct for them.
    const withoutPointer = [...KITCHEN_L_BODY_CATALOG]
      .filter(
        ([, definition]) =>
          definition.insertable !== true &&
          definition.catalogEquivalentId === undefined,
      )
      .map(([buildId]) => buildId);

    expect(withoutPointer.sort()).toEqual([
      "base-corner-return-320",
      "base-corner-x-900",
      "wall-corner-return-570",
      "wall-corner-return-570-top",
      "wall-corner-x-900",
      "wall-corner-x-900-top",
    ]);
  });
});

describe("toInsertableBody", () => {
  it("refuses a seeded entry rather than throwing", () => {
    const seeded = KITCHEN_L_BODY_CATALOG.get("base-sink-800");
    expect(seeded).toBeDefined();
    expect(seeded && toInsertableBody("base-sink-800", seeded)).toBeUndefined();
  });

  it("refuses an entry that claims insertable but carries no catalogue fields", () => {
    const half: BodyDefinition = {
      kind: "base_cabinet",
      band: "base",
      frameDepthMm: 580,
      occupiedDepth: finishesAtMm(baseFinishedDepthMm(WORKTOP_DEPTH_MM)),
      canFinish: true,
      canHandle: true,
      canReplace: true,
      canDelete: true,
      fixedWidth: false,
      insertable: true,
    };
    expect(toInsertableBody("half-declared", half)).toBeUndefined();
  });
});

describe("kind labels", () => {
  it("names every kind the seeded and insertable populations use", () => {
    for (const [, definition] of KITCHEN_L_BODY_CATALOG) {
      expect(isKnownKind(definition.kind), definition.kind).toBe(true);
    }
  });

  it("reports an unknown kind as unknown", () => {
    expect(isKnownKind("teleporter")).toBe(false);
  });
});

// Backlog entry 1's rule half: §7 must hold a hob-bearing entry so a deleted hob can be offered back. The outcome
// half is `hob-base.test.ts` in `@lemnaria/three-adapter`.
describe("ADR 0027's hob-bearing bases", () => {
  const HOB_ENTRIES = ["base-hob-2drawer", "base-hob-oven"] as const;

  it.each(HOB_ENTRIES)(
    "%s is an insertable 600 mm base named by its own catalogue row",
    (buildId) => {
      const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
      expect(definition, buildId).toBeDefined();
      if (!definition) return;
      const body = toInsertableBody(buildId, definition);
      expect(body, buildId).toBeDefined();
      expect(body?.label).toEqual({ kind: "entry", buildId });
      expect(body?.band).toBe("base");
      expect(body?.kind).toBe("base_cabinet");
      expect(body?.nominalHeightMm).toBe(860);
      // Fixed at 600 in both directions: the chips §9 offers and the widths §5.2 will build.
      expect(body?.sizesMm).toEqual([600]);
      expect(body?.widthFlex).toEqual([600]);
      expect(definition.fixedWidth).toBe(true);
    },
  );

  // Two rows, so two `catalog.entries.*` leaves and two names in the picker; the words are checked in
  // `apps/web/tests/i18n/body-label.test.ts`.
  it("offers the two entries as two rows under different names, so the picker can tell them apart", () => {
    const offered = listInsertableBodies(KITCHEN_L_BODY_CATALOG).filter(
      (body) => HOB_ENTRIES.some((buildId) => buildId === body.buildId),
    );

    expect(offered.map((body) => body.label)).toEqual([
      { kind: "entry", buildId: "base-hob-2drawer" },
      { kind: "entry", buildId: "base-hob-oven" },
    ]);
  });
});

describe("every insertable entry's two depth fields agree", () => {
  // `insertableBody` stamps `frameDepthMm` from the shape's `nominalDepthMm`, so an entry built by spreading a helper
  // and overriding only the nominal keeps the helper's frame depth. `void-engine.ts` falls back to `frameDepthMm` for a
  // placement with no `seatDepthMm`, and a frame depth that is not the body's own seats its back face off the wall
  // plane (§11 row 19). Swept over the whole catalogue so a new instance of that shape cannot arrive.
  // The hood is a named exception rather than a filtered one, so the sweep still covers it and a second entry cannot
  // acquire the disagreement by accident: ADR 0039 decision 2 hangs it at the front, and `frameDepthMm` is twice the
  // rear overhang (ADR 0018), so it seats on `2 × cabinetDepth − 500`.
  const FRONT_HUNG_SEAT_MM: Readonly<Record<string, number>> = {
    hood: 2 * 600 - 500,
  };

  /** Equality holds for a row whose builder seats the whole declared depth; for a `recorded-shell` row the frame depth
   *  is the nominal less `occupiedDepth.frontAssemblyMm`, what the builder puts in front of it (ADR 0075 decision 1).
   *  `hood` is the named exception above. */
  it.each(INSERTABLE_BODY_DEFINITIONS)(
    "%s seats on the depth its builder actually leaves behind it",
    (buildId, definition) => {
      // Required of every insertable row, so its absence is a defect rather than a case to handle.
      const nominalMm = definition.nominalDepthMm;
      expect(nominalMm, buildId).toBeDefined();
      if (nominalMm === undefined) return;

      const declared =
        definition.occupiedDepth.measuredFrom === "recorded-shell"
          ? nominalMm - definition.occupiedDepth.frontAssemblyMm
          : nominalMm;

      expect(definition.frameDepthMm).toBe(
        FRONT_HUNG_SEAT_MM[buildId] ?? declared,
      );
    },
  );

  // The sweep above would be vacuous if every row were `wall-plane`: both arms must be reached, and the
  // `recorded-shell` arm must contain rows on both sides of a zero front assembly.
  it("reaches both arms, and a fronted row and an unfronted one", () => {
    const shells = INSERTABLE_BODY_DEFINITIONS.filter(
      ([, definition]) =>
        definition.occupiedDepth.measuredFrom === "recorded-shell",
    );
    const fronted = shells.filter(
      ([, definition]) =>
        definition.occupiedDepth.measuredFrom === "recorded-shell" &&
        definition.occupiedDepth.frontAssemblyMm > 0,
    );

    expect(shells.length).toBeGreaterThan(fronted.length);
    expect(fronted.length).toBeGreaterThan(0);
    expect(INSERTABLE_BODY_DEFINITIONS.length).toBeGreaterThan(shells.length);
  });

  it("keeps the hood's exception real, and its nominal out of it", () => {
    const hood = INSERTABLE_BODY_DEFINITIONS.find(([id]) => id === "hood")?.[1];

    expect(hood?.nominalDepthMm).toBe(500);
    expect(hood?.frameDepthMm).toBe(FRONT_HUNG_SEAT_MM["hood"]);
  });

  it("sweeps the whole catalogue, so the gate cannot go vacuous", () => {
    expect(INSERTABLE_BODY_DEFINITIONS.length).toBeGreaterThanOrEqual(15);
  });
});

describe("every insertable entry declares the bound its widths come from", () => {
  // A row built by spreading `baseCabinet` or `wallCabinet` and overriding only `sizesMm` keeps the cabinetry bound it
  // inherited, so a dishwasher niche would accept every width from 300 to 800. `cabinetryWidths` and `discreteWidths`
  // each write both fields; this is the second line of defence (ADR 0035 decision 2).
  it.each(INSERTABLE_BODY_DEFINITIONS)(
    "%s declares ranges its own chips sit inside",
    (buildId, definition) => {
      const ranges = definition.widthRangesMm;
      expect(ranges, `${buildId} declares no width ranges`).toBeDefined();
      for (const widthMm of definition.sizesMm ?? []) {
        expect(
          ranges?.some(
            (range) => widthMm >= range.minMm && widthMm <= range.maxMm,
          ),
          `${buildId} offers ${String(widthMm)} outside every range it declares`,
        ).toBe(true);
      }
    },
  );

  // `widthFlex` decides which resolver an insert takes: `'fit'` goes to `resolveFitWidth` and builds the opening, a
  // millimetre set goes to `resolveFixedSetWidth` and takes the widest listed size that fits. A row with a good bound
  // and good chips but a fixed `widthFlex` still builds 600 into every opening from 600 up. `tall-pantry`'s
  // `widthFlex: "fit"` sits after the `fullHeightUnit` spread that stamps `COLUMN_WIDTHS_MM`; moving it above the
  // spread would silently restore the fixed set (ADR 0048).
  it.each(INSERTABLE_BODY_DEFINITIONS)(
    "%s declares the flexibility its own ranges imply",
    (buildId, definition) => {
      const isStepped = (definition.widthRangesMm ?? []).some(
        (range) => range.minMm < range.maxMm,
      );

      if (isStepped) {
        expect(
          definition.widthFlex,
          `${buildId} declares a bound but not 'fit', so an insert would narrow into it`,
        ).toBe("fit");
        return;
      }
      // A discrete row's declared set and offered sizes are the same list, so a row that overrode one without the other
      // fails here rather than at the resolver.
      expect(
        definition.widthFlex,
        `${buildId} is discrete, so its flexibility is its own set`,
      ).toEqual(definition.sizesMm);
    },
  );

  // Both shapes ADR 0035 recognises, named rather than counted: an appliance row moving into the cabinetry list would
  // let a customer step a dishwasher niche to 550 (decision 3).
  it("has entries of both shapes, so neither is untested", () => {
    const stepped = INSERTABLE_BODY_DEFINITIONS.filter(([, definition]) =>
      (definition.widthRangesMm ?? []).some(
        (range) => range.minMm < range.maxMm,
      ),
    ).map(([buildId]) => buildId);

    expect(stepped).toEqual([
      "base-cabinet",
      "base-3drawer",
      "base-panbank",
      "base-sink",
      "wall-cabinet",
      "wall-lift",
      "open-shelf",
      "hood",
      // ADR 0048: the one full-height row with a stepper; no appliance inside it fixes its width.
      "tall-pantry",
    ]);

    const discrete = INSERTABLE_BODY_DEFINITIONS.filter(([, definition]) =>
      (definition.widthRangesMm ?? []).every(
        (range) => range.minMm === range.maxMm,
      ),
    ).map(([buildId]) => buildId);

    // ADR 0035 decision 3's exclusion: the appliance is the fixed thing. `base-bottle-cargo` is here for ADR 0026's
    // reason: its members are not established, and stepping it would invent 250 as a manufactured width.
    expect(discrete).toEqual([
      "base-hob-2drawer",
      "base-hob-oven",
      "base-bottle-cargo",
      "base-dishwasher",
      "tall-oven-tower",
      "tall-fridge-housing",
      "fridge-free",
    ]);
  });

  // ADR 0035 decision 1: 200–800 at 50 mm, unbroken, pinned on the two hinged rows; a hole between 400 and 500 fails
  // here first.
  it("steps a hinged cabinet's chips from 200 to 800 with no hole", () => {
    for (const buildId of ["base-cabinet", "wall-cabinet"]) {
      const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
      expect(definition?.sizesMm, buildId).toEqual([
        200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800,
      ]);
    }
  });
});

// Label and builder read one function for the door count, so they agree by construction; the flip is the one width
// where an edit could reintroduce a disagreement, and the label was not pinned there.
describe("the name a customer reads flips with the door count", () => {
  const hingedRow = (buildId: string) => {
    const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
    if (!definition) throw new Error(`no entry ${buildId}`);
    return definition;
  };

  it.each([
    [499, 1, "the last one-door width"],
    [500, 2, "the flip (ADR 0035 decision 4)"],
  ])("counts a hinged cabinet's doors at %i as %i — %s", (widthMm, doors) => {
    for (const buildId of ["wall-cabinet", "base-cabinet"])
      expect([
        buildId,
        describeBodyLabelAt(
          { buildId, definition: hingedRow(buildId) },
          widthMm,
        ),
      ]).toEqual([
        buildId,
        { kind: "withDoors", name: { kind: "entry", buildId }, doors },
      ]);
  });
});

describe("the widths a body may actually be built to", () => {
  const bodyOf = (buildId: string) => {
    const found = listInsertableBodies(KITCHEN_L_BODY_CATALOG).find(
      (candidate) => candidate.buildId === buildId,
    );
    if (!found) throw new Error(`no insertable entry ${buildId}`);
    return found;
  };

  // Each row is a width and the rule that decides it, so a failure names the rule. There is no refused band in the
  // middle: the width decides the door count and never whether the cabinet exists (ADR 0035 decision 4).
  it.each([
    [199, false, "under ADR 0026's declared floor"],
    [200, true, "the bound opens at 200 (ADR 0026's floor)"],
    [250, true, "continuous, and a one-door"],
    [400, true, "ADR 0030's retired cap — an ordinary width now"],
    [401, true, "one millimetre past the retired cap"],
    [
      450,
      true,
      "the width the owner named: a one-door, and §11 row 14's dishwasher match",
    ],
    [470, true, "reachable by relative stepping (570 → 520 → 470), a one-door"],
    [499, true, "the last one-door width"],
    [500, true, "the flip (ADR 0035 decision 4): two doors from here up"],
    [550, true, "reached by the stepper, and no longer a curated exclusion"],
    [570, true, "the shipped corner return's width, buildable as a two-door"],
    [600, true, "ADR 0029's old floor, now an ordinary width inside the bound"],
    [700, true, "two honest 350 mm leaves"],
    [800, true, "§7's ceiling"],
    [801, false, "above the ceiling"],
    [900, false, "above the ceiling, and correctly refused"],
  ])("builds a hinged cabinet at %i: %s — %s", (widthMm, expected) => {
    expect(acceptsWidthMm(bodyOf("wall-cabinet"), widthMm)).toBe(expected);
    expect(acceptsWidthMm(bodyOf("base-cabinet"), widthMm)).toBe(expected);
  });

  // Cabinetry is continuous between its bounds; appliances are discrete (ADR 0035 decision 3): a dishwasher niche is
  // 450 or 600, and one millimetre off either is not a size it comes in.
  it("keeps every appliance row discrete", () => {
    // Neither `base-sink` (cabinetry with a fixed aperture, ADR 0033) nor `hood` (ADR 0035 decision 5) is on this list;
    // their own cases are below.
    for (const [buildId, sizesMm] of [
      ["base-dishwasher", [450, 600]],
      ["base-bottle-cargo", [200, 300]],
      ["fridge-free", [700]],
    ] as const) {
      const body = bodyOf(buildId);
      for (const widthMm of sizesMm) {
        expect(
          acceptsWidthMm(body, widthMm),
          `${buildId}@${String(widthMm)}`,
        ).toBe(true);
      }
      for (const widthMm of sizesMm) {
        expect(
          acceptsWidthMm(body, widthMm + 1),
          `${buildId}@${String(widthMm)}+1`,
        ).toBe(false);
      }
    }
  });

  // 559 is refused by ADR 0017's floor and not by this range: the two guards stay ordered rather than stacked, and
  // `minimum-width.adversarial.test.ts` asserts that by code.
  it("makes the sink base continuous from its aperture upward", () => {
    const sink = bodyOf("base-sink");
    expect(acceptsWidthMm(sink, 559)).toBe(false);
    expect(acceptsWidthMm(sink, 560)).toBe(true);
    expect(acceptsWidthMm(sink, 700)).toBe(true);
    expect(acceptsWidthMm(sink, 800)).toBe(true);
    expect(acceptsWidthMm(sink, 801)).toBe(false);
  });

  // ADR 0035 decision 5: the hood starts at 600 and stops at §7's ceiling like every other cabinetry entry; 700 is a
  // hood and 900 is not.
  it("bounds the hood at 600–800", () => {
    const hood = bodyOf("hood");
    expect(acceptsWidthMm(hood, 599)).toBe(false);
    expect(acceptsWidthMm(hood, 600)).toBe(true);
    expect(acceptsWidthMm(hood, 700)).toBe(true);
    expect(acceptsWidthMm(hood, 800)).toBe(true);
    expect(acceptsWidthMm(hood, 900)).toBe(false);
  });

  // ADR 0035 decision 2: a plain cabinetry row is one range, floor to ceiling.
  it("bounds a plain cabinetry row from §2's floor to §7's ceiling", () => {
    const panbank = bodyOf("base-panbank");
    expect(acceptsWidthMm(panbank, 299)).toBe(false);
    expect(acceptsWidthMm(panbank, 300)).toBe(true);
    expect(acceptsWidthMm(panbank, 570)).toBe(true);
    expect(acceptsWidthMm(panbank, 800)).toBe(true);
    expect(acceptsWidthMm(panbank, 801)).toBe(false);
  });

  // A declared range short-circuits the derivation, so it can express nonsense: an empty list refuses every width and
  // an inverted range refuses silently. `resolveWidthRangesMm` raises a declared minimum to the entry's floor (a rule)
  // but does not repair a malformed list.
  it("declares only ranges that are a range at all, and none under its floor", () => {
    for (const [buildId, definition] of INSERTABLE_BODY_DEFINITIONS) {
      const declared = definition.widthRangesMm;
      if (declared === undefined) continue;
      expect(
        declared.length,
        `${buildId} declares an empty range list`,
      ).toBeGreaterThan(0);
      for (const range of declared) {
        expect(
          range.minMm,
          `${buildId} range ${String(range.minMm)}–${String(range.maxMm)}`,
        ).toBeLessThanOrEqual(range.maxMm);
        // At or above the floor `buildableSizes` applies, so a range never reaches under ADR 0017's or ADR 0026's
        // floor; a row that starts relying on the clamp is visible here first.
        expect(
          range.minMm,
          `${buildId} range opens under its own floor`,
        ).toBeGreaterThanOrEqual(definition.minWidthMm ?? MIN_WIDTH_MM);
      }
    }
  });

  // The clamp itself, on a synthetic row since no shipped entry needs it: without it the resize path, whose only width
  // predicate is `acceptsWidthMm`, would accept a width the insert path refuses.
  it("raises a declared range to the floor that governs the entry", () => {
    const wall = bodyOf("wall-cabinet");
    const underfloor = {
      ...wall,
      minWidthMm: 300,
      definition: { ...wall.definition, minWidthMm: 300 },
    };

    expect(acceptsWidthMm(underfloor, 250)).toBe(false);
    expect(acceptsWidthMm(underfloor, 300)).toBe(true);
    expect(acceptsWidthMm(wall, 250)).toBe(true);
  });

  it("puts every chip inside one of its entry's own ranges", () => {
    const offenders: string[] = [];
    for (const body of listInsertableBodies(KITCHEN_L_BODY_CATALOG)) {
      for (const widthMm of buildableSizes(body.minWidthMm, body.sizesMm)) {
        if (!acceptsWidthMm(body, widthMm)) {
          offenders.push(`${body.buildId}@${String(widthMm)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
