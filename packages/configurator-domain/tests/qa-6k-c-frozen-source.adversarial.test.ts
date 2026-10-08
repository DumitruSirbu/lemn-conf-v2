// Adversarial QA on wave 6K-c (ADR 0073), domain half: the record itself.
//
// The store half — what a depth change does with the record — is in
// `apps/web/tests/store/qa-6k-c-frozen-source.adversarial.test.ts`. This file is about the fact a
// document carries: how it is minted, whether the two converters really are inverses, whether the
// per-entry byte allowance holds against an entry built by construction rather than by hand, and
// what happens to the record when a tie decides §3.2's MAX.
//
// Every expected depth is asked of the catalogue. A hand-written 620 would still pass if wave 6H's
// parameterisation moved underneath it, which is the failure this wave exists to prevent.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  MAX_COLUMN_EXTENTS,
  MAX_DESIGN_BYTES,
  MAX_DESIGN_DIMENSION_MM,
  MAX_EMPTY_COLUMNS,
  MAX_IDENTIFIER_LENGTH,
  MAX_PLACEMENTS,
} from "../src/design-bounds.js";
import {
  DesignSchema,
  EmptyColumnSchema,
  type Design,
  type DesignPlacement,
  type EmptyColumn,
} from "../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import { mergeAdjacentEmptyColumns } from "../src/merge-empty-columns.js";
import { occupiedDepthOfEntryM } from "../src/occupied-depth.js";
import { splitOversizedEmptyColumns } from "../src/split-oversized-empty-columns.js";
import { clipEmptyColumnsAtWallEnd } from "../src/clip-empty-columns-at-wall-end.js";
import { validateDesignForCatalog } from "../src/validate-design.js";
import {
  DEFAULT_CABINET_DEPTH_MM,
  declaredCabinetDepthsMm,
} from "../src/worktop-depth.js";
import {
  deriveColumnKeyAt,
  deriveColumns,
  derivePlacementRecords,
  projectFrozenMap,
  type Column,
  type ColumnExtent,
} from "../src/void-engine.js";

const DEEPER_MM = 700;
const CATALOG_AT_DEFAULT = buildKitchenLBodyCatalog(DEFAULT_CABINET_DEPTH_MM);

/** What one catalogue row declares it fills, at one setting. */
function declaredDepthM(buildId: string, cabinetDepthMm: number): number {
  const definition = buildKitchenLBodyCatalog(cabinetDepthMm).get(buildId);
  if (!definition) throw new Error(`${buildId} is not in the catalogue`);
  return occupiedDepthOfEntryM({ buildId, definition });
}

/** The ids the setting does not move, read off the declaration rather than named. If a later wave
 *  pins or unpins a row, this list follows it and the tests below follow with it. */
const PINNED_BUILD_IDS: readonly string[] = [
  ...CATALOG_AT_DEFAULT.keys(),
].filter(
  (buildId) =>
    declaredDepthM(buildId, DEFAULT_CABINET_DEPTH_MM) ===
    declaredDepthM(buildId, DEEPER_MM),
);

/** …and the ids it does move. */
const FOLLOWING_BUILD_IDS: readonly string[] = [
  ...CATALOG_AT_DEFAULT.keys(),
].filter((buildId) => !PINNED_BUILD_IDS.includes(buildId));

describe("the exceptions are readable off the declaration, never off an id", () => {
  // The wave's own criterion is asserted "through the declaration, never by naming the ids". That
  // is only meaningful if the declaration actually partitions the catalogue into two non-empty
  // halves — otherwise every test built on it is vacuous and green.
  it("partitions the catalogue into a pinned half and a following half", () => {
    expect(PINNED_BUILD_IDS.length).toBeGreaterThan(0);
    expect(FOLLOWING_BUILD_IDS.length).toBeGreaterThan(0);
  });

  // ADR 0073 decision 2 in its falsifiable form, swept over every row rather than over the two the
  // record names: the re-answer is `occupiedDepth` over the map built at the setting, so a pinned
  // row comes back unmoved and a following row does not.
  it("moves every following row and no pinned one, at both declared settings", () => {
    for (const buildId of FOLLOWING_BUILD_IDS) {
      expect(
        declaredDepthM(buildId, DEEPER_MM),
        `${buildId} should follow the setting`,
      ).toBeGreaterThan(declaredDepthM(buildId, DEFAULT_CABINET_DEPTH_MM));
    }
    for (const buildId of PINNED_BUILD_IDS) {
      expect(
        declaredDepthM(buildId, DEEPER_MM),
        `${buildId} should be pinned`,
      ).toBeCloseTo(declaredDepthM(buildId, DEFAULT_CABINET_DEPTH_MM), 9);
    }
  });
});

describe("the member that wins §3.2's MAX, and what decides a tie", () => {
  // A column with one member: the recorded source can only be that member, and the recorded depth
  // can only be its own. The degenerate case, asserted because `deepestMember`'s `reduce` has no
  // seed and a one-element list is the arm that would throw if it did.
  it("records the only member of a single-member column", () => {
    const design = designWith([
      placement("s0", "A", 1000, 0, "base-cabinet", 600, 820),
    ]);
    const columns = columnsOf(design, CATALOG_AT_DEFAULT);
    const column = columns.get(deriveColumnKeyAt("A", 1.0));

    expect(column?.depthFromBuildId).toBe("base-cabinet");
    expect(column?.d).toBeCloseTo(
      declaredDepthM("base-cabinet", DEFAULT_CABINET_DEPTH_MM),
      9,
    );
  });

  // Members that differ by less than `AGREEMENT_TOLERANCE_MM` still have a strict winner, and it is
  // the deeper one — the tolerance belongs to the merge and has no business in the MAX.
  it("records the deeper member when two are within the merge's agreement tolerance", () => {
    // 638 and 620: an oven tower over a base carcass, 18 mm apart.
    const design = designWith([
      placement("s0", "B", 1000, 0, "base-cabinet", 600, 820),
      placement("s1", "B", 1000, 900, "tall-oven-tower", 600, 1000),
    ]);
    const columns = columnsOf(design, CATALOG_AT_DEFAULT);

    expect(columns.get(deriveColumnKeyAt("B", 1.0))?.depthFromBuildId).toBe(
      "tall-oven-tower",
    );
  });

  /** Every pair of catalogue rows that occupies **exactly** the same depth at one declared setting.
   *  An exact equality is what `deepestMember`'s `>` calls a tie, so this is the set in which the
   *  recorded id is decided by something other than the depth. */
  const EXACT_TIES = catalogPairs().filter(
    ([left, right]) =>
      declaredDepthM(left, DEFAULT_CABINET_DEPTH_MM) ===
      declaredDepthM(right, DEFAULT_CABINET_DEPTH_MM),
  );

  /** …and the subset whose two rows part at the **other** setting, which is the only shape in which
   *  a tie can change a depth rather than only an id. */
  const TIES_THAT_PART = EXACT_TIES.filter(
    ([left, right]) =>
      declaredDepthM(left, DEEPER_MM) !== declaredDepthM(right, DEEPER_MM),
  );

  it("has exact ties to break at all", () => {
    expect(EXACT_TIES.length).toBeGreaterThan(0);
  });

  // **The recorded id is decided by the document's order, and two orders are one design.** Both
  // documents below hold the same two bodies in one column and both are accepted by
  // `validateDesignForCatalog`; they save as different documents. ADR 0011's 2026-08-26 correction
  // is the record: one design must not answer two ways depending on the route taken to it.
  it("records the same source whichever order the document lists two tied members in", () => {
    const [tie] = EXACT_TIES;
    if (!tie) throw new Error("no exact tie in the catalogue");
    const [left, right] = tie;
    const lower = placement("s0", "B", 1000, 0, left, 320, 820);
    const upper = placement("s1", "B", 1000, 1500, right, 600, 600);
    const key = deriveColumnKeyAt("B", 1.0);

    const forwards = designWith([lower, upper]);
    const backwards = designWith([upper, lower]);

    // Both orders are documents the product must load: neither is refused.
    expect(
      validateDesignForCatalog(forwards, CATALOG_AT_DEFAULT),
    ).toStrictEqual([]);
    expect(
      validateDesignForCatalog(backwards, CATALOG_AT_DEFAULT),
    ).toStrictEqual([]);

    const one = columnsOf(forwards, CATALOG_AT_DEFAULT).get(key);
    const other = columnsOf(backwards, CATALOG_AT_DEFAULT).get(key);

    // The depth agrees — that was never in doubt.
    expect(one?.d).toBeCloseTo(other?.d ?? -1, 12);
    // The recorded source is what a depth change re-asks, and it is what the document stores.
    expect(one?.depthFromBuildId).toBe(other?.depthFromBuildId);
  });

  // **The bound on what that order-dependence currently costs**, measured rather than assumed: no
  // exact tie in today's catalogue parts at the other setting, so an order-dependent id is not yet
  // an order-dependent depth. This is the assertion that would go red first if a catalogue wave gave
  // the tie a consequence, and it is deliberately narrow — the two rows that come closest are one
  // ULP apart, not one millimetre.
  it("has no exact tie whose two rows answer differently at the other setting", () => {
    expect(TIES_THAT_PART).toStrictEqual([]);
  });

  it("is one ULP away from having one", () => {
    const nearMisses = catalogPairs().filter(([left, right]) => {
      const gap = Math.abs(
        declaredDepthM(left, DEFAULT_CABINET_DEPTH_MM) -
          declaredDepthM(right, DEFAULT_CABINET_DEPTH_MM),
      );
      return (
        gap > 0 &&
        gap < 1e-9 &&
        declaredDepthM(left, DEEPER_MM) !== declaredDepthM(right, DEEPER_MM)
      );
    });

    expect(nearMisses.length).toBeGreaterThan(0);
  });
});

describe("`toEmptyColumn` and `toColumnExtent` as inverses", () => {
  /** Wide enough that `clipEmptyColumnsAtWallEnd` never fires, so this measures the two converters
   *  and not the clip — which has its own file. */
  const ROOM = {
    shape: "L",
    widthMm: 7000,
    depthMm: 7000,
    heightMm: 2600,
  } as const;

  /** Any entry the schema accepts, including the absent case — the round trip has to be exact on
   *  both, and the absent case is the one every stored document written before this wave is in. */
  const anEntry = fc
    .record({
      wall: fc.constantFrom<"A" | "B">("A", "B"),
      alongMm: fc.integer({ min: 500, max: 5000 }),
      widthMm: fc.integer({ min: 1, max: 800 }),
      y0Mm: fc.integer({ min: 0, max: 2000 }),
      heightMm: fc.integer({ min: 1, max: 600 }),
      depthFromBuildId: fc.option(
        fc.constantFrom(...CATALOG_AT_DEFAULT.keys()),
        { nil: undefined },
      ),
      depthMm: fc.integer({ min: 1, max: 900 }),
    })
    .map(({ heightMm, y0Mm, depthFromBuildId, ...rest }): EmptyColumn => {
      const geometry = { ...rest, y0Mm, topMm: y0Mm + heightMm };
      return depthFromBuildId === undefined
        ? geometry
        : { ...geometry, depthFromBuildId };
    });

  propertyTest.prop([anEntry])(
    "restores and re-projects any stored entry to itself",
    (entry) => {
      const restored = deriveColumns([], { emptyColumns: [entry] }, ROOM);

      const projected = projectFrozenMap(restored, []).emptyColumns ?? [];

      expect(projected).toStrictEqual([entry]);
    },
  );

  // The half `toStrictEqual` above cannot see: an explicit `depthFromBuildId: undefined` compares
  // equal to an omission but is **not** equal on the wire — `JSON.stringify` drops it, so a document
  // round-tripped through the API would differ from the one held in memory. The criterion is that
  // the omission is a real omission.
  propertyTest.prop([anEntry])(
    "omits the key rather than writing an explicit undefined",
    (entry) => {
      const restored = deriveColumns([], { emptyColumns: [entry] }, ROOM);
      const projected = (projectFrozenMap(restored, []).emptyColumns ?? [])[0];
      if (!projected) throw new Error("nothing projected");

      const carriesSource = entry.depthFromBuildId !== undefined;
      expect("depthFromBuildId" in projected).toBe(carriesSource);
      // And the same statement about the in-memory column the load produces.
      const column = [...restored.values()][0];
      expect(column !== undefined && "depthFromBuildId" in column).toBe(
        carriesSource,
      );
    },
  );

  // The other direction: a column derived from placements, saved and reloaded, is the same column.
  propertyTest.prop([fc.constantFrom(...CATALOG_AT_DEFAULT.keys())])(
    "carries a derived column's source through a save and a reload",
    (buildId) => {
      const design = designWith([
        placement("s0", "A", 1000, 0, buildId, 600, 820),
      ]);
      const derived = columnsOf(design, CATALOG_AT_DEFAULT);

      const reloaded = columnsOf(
        throughTheWire(withFrozenMap(design, derived)),
        CATALOG_AT_DEFAULT,
      );

      expect(sourcesOf(reloaded)).toStrictEqual(sourcesOf(derived));
      expect([...sourcesOf(derived).values()]).toStrictEqual([buildId]);
    },
  );
});

describe("the per-entry byte allowance, against an entry built by construction", () => {
  /** The longest entry `EmptyColumnSchema` can express, assembled from the schema's own bounds
   *  rather than from a number typed here: every integer field is `min(0).max(MAX_DESIGN_DIMENSION_MM)`,
   *  so that value carries the most digits any of them can, and `depthFromBuildId` is at
   *  `MAX_IDENTIFIER_LENGTH`.
   *
   *  It is **parsed before it is measured**, so a "worst case" the schema would have refused cannot
   *  stand in for one. */
  const LONGEST_LEGAL_ENTRY: EmptyColumn = EmptyColumnSchema.parse({
    wall: "A",
    alongMm: MAX_DESIGN_DIMENSION_MM,
    widthMm: MAX_DESIGN_DIMENSION_MM,
    y0Mm: MAX_DESIGN_DIMENSION_MM,
    topMm: MAX_DESIGN_DIMENSION_MM,
    depthMm: MAX_DESIGN_DIMENSION_MM,
    depthFromBuildId: "x".repeat(MAX_IDENTIFIER_LENGTH),
  });

  /** The bytes one entry costs inside an array: its own JSON plus the comma that separates it from
   *  the entry before it, which the derivation says the round-up absorbs. */
  function entryBytes(entry: EmptyColumn): number {
    return Buffer.byteLength(JSON.stringify(entry), "utf8") + 1;
  }

  /** The allowance in force, read back out of `MAX_DESIGN_BYTES` rather than restated — the two
   *  operands that are not exported are the same ones `qa-5h.adversarial.test.ts` names, so a wave
   *  that moves either moves both files. */
  const PER_ENTRY_BYTES =
    (MAX_DESIGN_BYTES - MAX_PLACEMENTS * 512 - 1024) /
    (MAX_EMPTY_COLUMNS + MAX_COLUMN_EXTENTS);

  // **How a reader can tell this is not vacuous.** The constructed entry is asserted to be *past*
  // ADR 0053's 128-byte allowance: if the construction were producing something trivial, this is the
  // line that would fail. It is the same claim ADR 0073's consequence makes, measured.
  it("is larger than the entry that broke ADR 0053's 128-byte allowance", () => {
    const bytes = entryBytes(LONGEST_LEGAL_ENTRY);

    expect(bytes).toBeGreaterThan(128);
    expect(bytes).toBeLessThanOrEqual(PER_ENTRY_BYTES);
  });

  // The catalogue's own longest key, which is what the derivation actually budgeted for. Measured
  // rather than asserted at 26, so a catalogue that grows a longer row moves this with it.
  it("holds the longest entry the product itself can write", () => {
    const longestCatalogueId = [...CATALOG_AT_DEFAULT.keys()].reduce(
      (longest, buildId) =>
        buildId.length > longest.length ? buildId : longest,
    );
    const entry = EmptyColumnSchema.parse({
      ...LONGEST_LEGAL_ENTRY,
      depthFromBuildId: longestCatalogueId,
    });

    expect(entryBytes(entry)).toBeLessThanOrEqual(PER_ENTRY_BYTES);
    expect(entryBytes(entry)).toBeGreaterThan(128);
  });

  // And the document-level claim the per-entry allowance exists for: a document at every cap, with
  // every entry the longest the schema can express, still fits the byte cap the API enforces.
  it("holds a document at every cap whose every entry is the longest the schema allows", () => {
    const entry = (index: number): EmptyColumn => ({
      ...LONGEST_LEGAL_ENTRY,
      alongMm: index * 10,
    });
    const document = JSON.stringify({
      ...KITCHEN_L_DESIGN,
      emptyColumns: Array.from({ length: MAX_EMPTY_COLUMNS }, (_, i) =>
        entry(i),
      ),
      columnExtents: Array.from({ length: MAX_COLUMN_EXTENTS }, (_, i) =>
        entry(i),
      ),
    });

    expect(Buffer.byteLength(document, "utf8")).toBeLessThanOrEqual(
      MAX_DESIGN_BYTES,
    );
  });
});

describe("what the parse seam refuses and what it must not", () => {
  // ADR 0052, swept over every catalogue id plus ids the catalogue has never held: a stored source
  // is never a reason to refuse a document.
  it("accepts every buildId-shaped source, known to the catalogue or not", () => {
    const sources = [
      ...CATALOG_AT_DEFAULT.keys(),
      "retired-cabinet-600",
      "x",
      "x".repeat(MAX_IDENTIFIER_LENGTH),
    ];

    for (const source of sources) {
      const document = designWithEmptyColumn({
        ...anEmptyColumn(),
        depthFromBuildId: source,
      });
      expect(() => throughTheWire(document), source).not.toThrow();
      expect(
        validateDesignForCatalog(document, CATALOG_AT_DEFAULT),
        source,
      ).toStrictEqual([]);
    }
  });

  // Fail-closed, and at **both** arrays: `StoredColumnExtentSchema` *is* `EmptyColumnSchema`, so a
  // refusal that reached only one of the two would mean the shared shape had quietly diverged.
  it.each([
    ["not a string", 620],
    ["empty", ""],
    [
      "one character past the identifier bound",
      "x".repeat(MAX_IDENTIFIER_LENGTH + 1),
    ],
    ["null", null],
    ["an object", { buildId: "base-cabinet" }],
    ["an array", ["base-cabinet"]],
    ["a boolean", true],
  ])(
    "refuses a source that is %s, in emptyColumns and in columnExtents",
    (_name, source) => {
      const entry = { ...anEmptyColumn(), depthFromBuildId: source };

      expect(() =>
        DesignSchema.parse({ ...KITCHEN_L_DESIGN, emptyColumns: [entry] }),
      ).toThrow();
      expect(() =>
        DesignSchema.parse({
          ...KITCHEN_L_DESIGN,
          columnExtents: [{ ...entry, alongMm: 1300 }],
        }),
      ).toThrow();
    },
  );
});

describe("the commands that move an extent", () => {
  /** ADR 0073 decision 8's own case: a base carcass and an oven tower, 18 mm apart and therefore
   *  inside `AGREEMENT_TOLERANCE_MM`, so the merged run genuinely descends from two sources. */
  const BASE_SOURCE = "base-cabinet";
  const TOWER_SOURCE = "tall-oven-tower";

  function twoSources(): ReadonlyMap<string, ColumnExtent> {
    return new Map([
      [
        deriveColumnKeyAt("A", 0.4),
        extentAt(
          0.4,
          declaredDepthM(BASE_SOURCE, DEFAULT_CABINET_DEPTH_MM),
          BASE_SOURCE,
        ),
      ],
      [
        deriveColumnKeyAt("A", 0.8),
        extentAt(
          0.8,
          declaredDepthM(TOWER_SOURCE, DEFAULT_CABINET_DEPTH_MM),
          TOWER_SOURCE,
        ),
      ],
    ]);
  }

  it("has a genuinely two-source run to merge", () => {
    const depths = [...twoSources().values()].map((extent) => extent.d);
    const [shallow, deep] = depths as [number, number];

    expect(Math.abs(deep - shallow) * 1000).toBeGreaterThan(0);
    expect(Math.abs(deep - shallow) * 1000).toBeLessThanOrEqual(20);
  });

  it("takes the shallowest member's source, whichever order the map holds them in", () => {
    const forwards = [...mergeAdjacentEmptyColumns(twoSources(), []).values()];
    const reversed = new Map([...twoSources()].reverse());

    const backwards = [...mergeAdjacentEmptyColumns(reversed, []).values()];

    expect(forwards).toHaveLength(1);
    expect(backwards).toHaveLength(1);
    expect(forwards[0]?.depthFromBuildId).toBe(BASE_SOURCE);
    expect(backwards[0]?.depthFromBuildId).toBe(BASE_SOURCE);
  });

  // The merged entry's depth and its recorded source must name the same body, or the entry lies
  // about where its own depth came from — which is what a depth change then re-asks.
  it("leaves the merged depth and the merged source describing one body", () => {
    const merged = [...mergeAdjacentEmptyColumns(twoSources(), []).values()][0];
    if (!merged?.depthFromBuildId) throw new Error("no merged source");

    expect(merged.d).toBeCloseTo(
      declaredDepthM(merged.depthFromBuildId, DEFAULT_CABINET_DEPTH_MM),
      9,
    );
  });

  it("writes the source to every half of a split", () => {
    const oversized = new Map([
      [
        deriveColumnKeyAt("A", 1.0),
        extentAt(
          1.0,
          declaredDepthM(BASE_SOURCE, DEFAULT_CABINET_DEPTH_MM),
          BASE_SOURCE,
          1.6,
        ),
      ],
    ]);

    const pieces = [...splitOversizedEmptyColumns(oversized, []).values()];

    expect(pieces.length).toBeGreaterThan(1);
    for (const piece of pieces) {
      expect(piece.depthFromBuildId).toBe(BASE_SOURCE);
    }
  });

  it("leaves the source untouched when the wall-end clip narrows an extent", () => {
    const room = KITCHEN_L_DESIGN.room;
    const overhanging = new Map([
      [
        deriveColumnKeyAt("A", room.widthMm / 1000 - 0.1),
        extentAt(
          room.widthMm / 1000 - 0.1,
          declaredDepthM(BASE_SOURCE, DEFAULT_CABINET_DEPTH_MM),
          BASE_SOURCE,
          0.8,
        ),
      ],
    ]);

    const clipped = [
      ...clipEmptyColumnsAtWallEnd(overhanging, [], room).values(),
    ];

    expect(clipped).toHaveLength(1);
    expect(clipped[0]?.w).toBeLessThan(0.8);
    expect(clipped[0]?.depthFromBuildId).toBe(BASE_SOURCE);
    expect(clipped[0]?.d).toBeCloseTo(
      declaredDepthM(BASE_SOURCE, DEFAULT_CABINET_DEPTH_MM),
      9,
    );
  });

  // A merged entry whose shallowest member carries no source falls to decision 3's fallback, and the
  // deeper member's source must not be substituted for it — that would be a guess about which body
  // supplied a depth the template did not take.
  it("carries no source when the shallowest member has none", () => {
    const shallow = extentAt(
      0.4,
      declaredDepthM(BASE_SOURCE, DEFAULT_CABINET_DEPTH_MM),
      BASE_SOURCE,
    );
    const withoutSource: ColumnExtent = { ...shallow };
    delete (withoutSource as { depthFromBuildId?: string }).depthFromBuildId;
    const run = new Map([
      [withoutSource.key, withoutSource],
      [
        deriveColumnKeyAt("A", 0.8),
        extentAt(
          0.8,
          declaredDepthM(TOWER_SOURCE, DEFAULT_CABINET_DEPTH_MM),
          TOWER_SOURCE,
        ),
      ],
    ]);

    const merged = [...mergeAdjacentEmptyColumns(run, []).values()];

    expect(merged).toHaveLength(1);
    expect(merged[0]?.depthFromBuildId).toBeUndefined();
    expect("depthFromBuildId" in (merged[0] ?? {})).toBe(false);
  });
});

describe("the entry's own consistency, as a document invariant", () => {
  // Every entry either records no source, or records one whose declared depth at **some** declared
  // setting is the depth it carries. An entry that satisfies neither is one whose recorded source
  // cannot explain its own depth — and `frozenDepthAtThisSettingM` answers from the source alone.
  it("keeps every projected entry's depth explicable by its own recorded source", () => {
    const columns = columnsOf(KITCHEN_L_DESIGN, CATALOG_AT_DEFAULT);
    const records = derivePlacementRecords(
      KITCHEN_L_DESIGN,
      CATALOG_AT_DEFAULT,
    );
    const frozen = projectFrozenMap(columns, records);
    const entries = [
      ...(frozen.emptyColumns ?? []),
      ...(frozen.columnExtents ?? []),
    ];

    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      if (entry.depthFromBuildId === undefined) continue;
      const explicable = declaredCabinetDepthsMm().some(
        (depthMm) =>
          Math.round(
            declaredDepthM(entry.depthFromBuildId ?? "", depthMm) * 1000,
          ) === entry.depthMm,
      );
      expect(
        explicable,
        `${entry.wall}|${String(entry.alongMm)} records ${entry.depthFromBuildId ?? ""} at ${String(entry.depthMm)} mm`,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------------------------

function columnsOf(
  design: Design,
  catalog: typeof CATALOG_AT_DEFAULT,
): ReadonlyMap<string, Column> {
  const records = derivePlacementRecords(design, catalog);
  return deriveColumns(
    records,
    { emptyColumns: design.emptyColumns, columnExtents: design.columnExtents },
    design.room,
  );
}

function sourcesOf(
  columns: ReadonlyMap<string, Column>,
): ReadonlyMap<string, string | undefined> {
  return new Map(
    [...columns].map(([key, column]) => [key, column.depthFromBuildId]),
  );
}

function withFrozenMap(
  design: Design,
  columns: ReadonlyMap<string, Column>,
): Design {
  const records = derivePlacementRecords(design, CATALOG_AT_DEFAULT);
  const frozen = projectFrozenMap(columns, records);
  return {
    ...design,
    emptyColumns: [...(frozen.emptyColumns ?? [])],
    columnExtents: [...(frozen.columnExtents ?? [])],
  };
}

function throughTheWire(design: Design): Design {
  return DesignSchema.parse(JSON.parse(JSON.stringify(design)));
}

function designWith(placements: readonly DesignPlacement[]): Design {
  return { ...KITCHEN_L_DESIGN, placements: [...placements] };
}

/** A document whose only content is one frozen empty space, so the parse-seam sweep below measures
 *  the source field and not an overlap with the fixture's own bodies. */
function designWithEmptyColumn(entry: EmptyColumn): Design {
  return {
    ...KITCHEN_L_DESIGN,
    placements: [],
    emptyColumns: [entry],
    columnExtents: [],
  };
}

/** Every unordered pair of catalogue rows, once each. */
function catalogPairs(): readonly (readonly [string, string])[] {
  const ids = [...CATALOG_AT_DEFAULT.keys()];
  return ids.flatMap((left, index) =>
    ids
      .slice(index + 1)
      .map((right): readonly [string, string] => [left, right]),
  );
}

function placement(
  id: string,
  wall: "A" | "B",
  alongMm: number,
  y0Mm: number,
  buildId: string,
  widthMm: number,
  heightMm: number,
): DesignPlacement {
  return { id, wall, alongMm, y0Mm, body: { buildId, widthMm, heightMm } };
}

function anEmptyColumn(): EmptyColumn {
  return {
    wall: "A",
    alongMm: 1000,
    widthMm: 200,
    y0Mm: 0,
    topMm: 820,
    depthMm: 580,
  };
}

function extentAt(
  alongM: number,
  depthM: number,
  depthFromBuildId: string,
  widthM = 0.4,
): ColumnExtent {
  return {
    key: deriveColumnKeyAt("A", alongM),
    wall: "A",
    ry: 0,
    x: alongM,
    z: depthM / 2,
    w: widthM,
    d: depthM,
    depthFromBuildId,
    top: 2.6,
    regions: [[0, 2.6]],
  };
}
