// M6 wave 6K-c, the domain half of ADR 0073: a frozen extent records the `buildId` whose clearance
// supplied its depth, so a depth change can re-ask that body instead of carrying the old setting's
// number forward.
//
// Everything here is about the **record**, never about the re-answer — the re-answer lives at the
// store seam (`apps/web/tests/store/cabinet-depth-frozen-source.test.ts`), because that is where a
// depth change publishes a map. What this file has to establish is that the fact survives every
// journey the extent takes: the derivation that mints it, the save and the load that carry it, the
// merge and the split that move it, and the two seams that must not refuse a document for it.
//
// No number below is written out where the catalogue can be asked. §3.2's MAX is a function of the
// entries, so a test that hard-coded 620 would still pass if the parameterisation moved underneath
// it — which is the failure this wave exists to prevent, one layer up.
import { describe, expect, it } from "vitest";

import { DesignSchema, type Design, type EmptyColumn } from "../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import {
  CURRENT_SCHEMA_VERSION,
  migrateDesign,
} from "../src/migrate-design.js";
import { occupiedDepthM } from "../src/occupied-depth.js";
import { mergeAdjacentEmptyColumns } from "../src/merge-empty-columns.js";
import { splitOversizedEmptyColumns } from "../src/split-oversized-empty-columns.js";
import { validateDesignForCatalog } from "../src/validate-design.js";
import { occupiedDepthOfEntryM } from "../src/occupied-depth.js";
import {
  declaredCabinetDepthsMm,
  DEFAULT_CABINET_DEPTH_MM,
} from "../src/worktop-depth.js";
import {
  deriveColumnKeyAt,
  deriveColumns,
  derivePlacementRecords,
  projectFrozenMap,
  type BodyDefinition,
  type Column,
  type ColumnExtent,
} from "../src/void-engine.js";

const CATALOG = buildKitchenLBodyCatalog(DEFAULT_CABINET_DEPTH_MM);

function columnsOf(design: Design): ReadonlyMap<string, Column> {
  const records = derivePlacementRecords(design, CATALOG);
  return deriveColumns(
    records,
    { emptyColumns: design.emptyColumns, columnExtents: design.columnExtents },
    design.room,
  );
}

/** The document as a save and a reload deliver it: through the wire schema, so anything this helper
 *  accepts is something the API would have stored and returned. */
function throughTheWire(design: Design): Design {
  return DesignSchema.parse(JSON.parse(JSON.stringify(design)));
}

/** The whole frozen map, written onto the design the way `applyCommandResult` writes it. */
function saved(design: Design): Design {
  const records = derivePlacementRecords(design, CATALOG);
  const frozen = projectFrozenMap(columnsOf(design), records);
  return {
    ...design,
    emptyColumns: [...(frozen.emptyColumns ?? [])],
    columnExtents: [...(frozen.columnExtents ?? [])],
  };
}

describe("the member that won §3.2's MAX", () => {
  // The whole of decision 1's first half, swept over the shipped kitchen rather than asserted on one
  // column: the recorded id is the id of a member that actually measures the recorded depth. A
  // derivation that named the first member, or the widest, or the last, fails here on eleven of the
  // twelve columns.
  it("is the member the recorded depth belongs to, in every derived column", () => {
    const records = derivePlacementRecords(KITCHEN_L_DESIGN, CATALOG);
    const columns = deriveColumns(records, {}, KITCHEN_L_DESIGN.room);

    expect(columns.size).toBeGreaterThan(0);
    for (const [key, column] of columns) {
      const winner = records.find(
        (record) =>
          record.col === key && record.buildId === column.depthFromBuildId,
      );
      expect(
        winner,
        `no member of ${key} carries the recorded id`,
      ).toBeDefined();
      expect(winner ? occupiedDepthM(winner) : -1).toBeCloseTo(column.d, 9);
    }
  });

  // The catalogue holds bodies whose depths differ by 38 mm inside one column, which is what makes
  // "record the winner" different from "record any member". `B|1.20` is ADR 0073's own example: an
  // oven tower at 638 under a deep top at 600.
  it("is the deepest member and not merely a member", () => {
    const records = derivePlacementRecords(KITCHEN_L_DESIGN, CATALOG);
    const columns = deriveColumns(records, {}, KITCHEN_L_DESIGN.room);
    const members = records.filter((record) => record.col === "B|1.20");

    expect(members.length).toBeGreaterThan(1);
    expect(columns.get("B|1.20")?.depthFromBuildId).toBe("tall-oven-tower-600");
  });
});

describe("the tie-break's undeclared arm, and why it cannot be reached", () => {
  // ADR 0079 amendment D. Key 2 reads `CabinetDepthRule` through `cabinetDepthRuleOf`, which throws
  // for an entry declaring nothing — the same stance `occupiedDepthM` takes three lines away in the
  // same function, and `cabinet-depth-rule.ts`'s own *"there is deliberately no arm meaning 'unknown'
  // and no default"*. Abstaining would make which body gets recorded depend on **which catalogue
  // assembled the map** rather than on the design.
  //
  // **The dependency that makes it unreachable, named here so deleting it turns something red here.**
  // `buildKitchenLBodyCatalog` runs `refuseUndeclaredDepthRules` over both populations as it
  // assembles the map (`catalogue-assembly-refusals.test.ts` pins that the call is written); this is
  // the consequence that matters at this seam — no placement the product can build reaches the
  // comparator undeclared, at any offered setting.
  it("leaves no catalogue row that could reach the comparator undeclared", () => {
    const undeclared = declaredCabinetDepthsMm().flatMap((cabinetDepthMm) =>
      [...buildKitchenLBodyCatalog(cabinetDepthMm)]
        .filter(([, definition]) => definition.depthRule === undefined)
        .map(([buildId]) => `${buildId} at ${String(cabinetDepthMm)}`),
    );

    expect(undeclared).toStrictEqual([]);
    // Non-vacuous: there are rows, and they were actually inspected.
    expect(CATALOG.size).toBeGreaterThan(1);
    expect(declaredCabinetDepthsMm().length).toBeGreaterThan(1);
  });

  // And the fail-closed half, so the throw is a behaviour rather than a claim about one. Two members
  // that tie at the millimetre, one of them declaring nothing: the comparator refuses rather than
  // falling through to the byte order.
  it("refuses a tie whose member declares no depth rule", () => {
    const definition = CATALOG.get(TIED_APPLIANCE);
    if (!definition)
      throw new Error(`${TIED_APPLIANCE} is not in the catalogue`);
    const stripped = { ...definition };
    delete stripped.depthRule;
    const undeclared = new Map(CATALOG).set(TIED_APPLIANCE, stripped);
    // `hood-600` against `base-corner-return-320`: both declare 600 exactly, so key 1 cannot decide
    // and key 2 is reached. Asserted below rather than trusted.
    const design = tiedColumn();

    expect(() => columnsWith(design, undeclared)).toThrow(
      /No cabinet-depth rule declared/,
    );
    // Non-vacuous twice over: the same two members decide fine while the declaration is present, and
    // they really do tie, so the throw came from key 2 rather than from key 1 or the derivation.
    expect(() => columnsWith(design, CATALOG)).not.toThrow();
    expect(declaredDepthOf(TIED_APPLIANCE)).toBe(declaredDepthOf(TIED_RETURN));
  });
});

describe("the record's journey through a save and a load", () => {
  // Decision 1's second half, asserted rather than assumed: `toEmptyColumn` and `toColumnExtent` are
  // exact inverses, so the column a session holds and the column a reload rebuilds carry the same
  // source. Written as a comparison of two maps so a converter that dropped the field on one side
  // only cannot pass.
  it("restores the same source it recorded, for every column", () => {
    const derived = columnsOf(KITCHEN_L_DESIGN);

    const restored = columnsOf(throughTheWire(saved(KITCHEN_L_DESIGN)));

    expect(sourcesOf(restored)).toStrictEqual(sourcesOf(derived));
    expect([...sourcesOf(derived).values()].every(Boolean)).toBe(true);
  });

  // Decision 6, the anti-invariant. A document written before this wave has no `depthFromBuildId`
  // anywhere, and it must parse, load to exactly the geometry it always loaded to, and come back out
  // of a load unchanged — the field arrives on the next *save*, never on a read.
  it("loads a document written before this wave without rewriting it", () => {
    const beforeThisWave = withoutTheSource(saved(KITCHEN_L_DESIGN));

    const loaded = throughTheWire(beforeThisWave);

    // No version bump and no migration arm: the document comes back out of the loader exactly as it
    // went in, so nothing about it is rewritten by a read.
    expect(CURRENT_SCHEMA_VERSION).toBe(5);
    expect(loaded).toStrictEqual(beforeThisWave);
    expect(
      migrateDesign(CURRENT_SCHEMA_VERSION, beforeThisWave, CATALOG),
    ).toStrictEqual(beforeThisWave);
  });

  // The other half of "loads with the geometry it always had": the extents a legacy document
  // restores are field-for-field the ones it restored before this wave existed, source aside.
  it("restores a legacy document to the same extents it always did", () => {
    const withSource = throughTheWire(saved(KITCHEN_L_DESIGN));

    const legacy = throughTheWire(withoutTheSource(saved(KITCHEN_L_DESIGN)));

    expect(withoutSources(columnsOf(legacy))).toStrictEqual(
      withoutSources(columnsOf(withSource)),
    );
    expect([...sourcesOf(columnsOf(legacy)).values()]).toStrictEqual(
      new Array(columnsOf(legacy).size).fill(undefined),
    );
  });
});

describe("what the two seams do and do not refuse", () => {
  // Decision 7 and ADR 0052: a `/d/{id}` share link is the one artefact this project hands to
  // someone who cannot be asked to reload it, so a load that refuses is a dead link. Neither an
  // absent source nor one the catalogue has never heard of is a refusal — both fall to the store's
  // deeper-only rule instead.
  it.each([
    ["absent", undefined],
    ["a buildId the catalogue does not hold", "retired-cabinet-600"],
  ])("accepts a document whose source is %s", (_name, source) => {
    const document = withTheSource(saved(KITCHEN_L_DESIGN), source);

    expect(() => throughTheWire(document)).not.toThrow();
    expect(validateDesignForCatalog(document, CATALOG)).toStrictEqual([]);
  });

  // And the fail-closed half: a malformed value is a malformed document rather than an old one, and
  // it is refused at the parse seam every route into the product passes through.
  it.each([
    ["not a string", 620],
    ["empty", ""],
    ["longer than an identifier may be", "b".repeat(65)],
    ["null", null],
  ])("refuses a document whose source is %s", (_name, source) => {
    const document = {
      ...saved(KITCHEN_L_DESIGN),
      emptyColumns: [{ ...anEmptyColumn(), depthFromBuildId: source }],
    };

    expect(() => DesignSchema.parse(document)).toThrow();
  });
});

describe("the commands that move an extent without touching its depth", () => {
  /** Two cleared columns side by side whose depths came from **different** bodies and agree within
   *  `AGREEMENT_TOLERANCE_MM` — ADR 0073 decision 8's own case, and the reason the merge's choice is
   *  a real one: a base carcass at 620 beside an oven tower at 638. */
  function twoSources(): ReadonlyMap<string, ColumnExtent> {
    return new Map([
      [deriveColumnKeyAt("A", 0.4), extentAt(0.4, 0.62, "base-cabinet")],
      [
        deriveColumnKeyAt("A", 0.8),
        extentAt(0.8, 0.638, "tall-oven-tower-600"),
      ],
    ]);
  }

  it("carries the shallowest member's source through a merge", () => {
    const merged = [...mergeAdjacentEmptyColumns(twoSources(), []).values()];

    expect(merged).toHaveLength(1);
    // The template is the shallowest member, so the merged depth and the merged source name the same
    // body: no new choice is made, and the two cannot disagree.
    expect(merged[0]?.d).toBeCloseTo(0.62, 9);
    expect(merged[0]?.depthFromBuildId).toBe("base-cabinet");
  });

  it("writes the source to both halves of a split", () => {
    const oversized = new Map([
      [deriveColumnKeyAt("A", 1.0), extentAt(1.0, 0.62, "base-cabinet", 1.2)],
    ]);

    const pieces = [...splitOversizedEmptyColumns(oversized, []).values()];

    expect(pieces.length).toBeGreaterThan(1);
    for (const piece of pieces) {
      expect(piece.depthFromBuildId).toBe("base-cabinet");
      expect(piece.d).toBeCloseTo(0.62, 9);
    }
  });
});

/** Two catalogue rows that declare **exactly** the same occupied depth, so key 1 cannot separate
 *  them and the tie-break's later keys are reached. Both follow the setting, which is what makes key 3
 *  the decider in the ordinary case. */
const TIED_APPLIANCE = "hood-600";
const TIED_RETURN = "base-corner-return-320";

function declaredDepthOf(buildId: string): number {
  const definition = CATALOG.get(buildId);
  if (!definition) throw new Error(`${buildId} is not in the catalogue`);
  return occupiedDepthOfEntryM({ buildId, definition });
}

/** One column holding both tied rows, as a design. */
function tiedColumn(): Design {
  return {
    ...KITCHEN_L_DESIGN,
    placements: [
      {
        id: "s0",
        wall: "B",
        alongMm: 1000,
        y0Mm: 0,
        body: { buildId: TIED_RETURN, widthMm: 320, heightMm: 820 },
      },
      {
        id: "s1",
        wall: "B",
        alongMm: 1000,
        y0Mm: 1500,
        body: { buildId: TIED_APPLIANCE, widthMm: 600, heightMm: 600 },
      },
    ],
    emptyColumns: [],
    columnExtents: [],
  };
}

/** `columnsOf`, against a catalogue that is not the shipped one. */
function columnsWith(
  design: Design,
  catalog: ReadonlyMap<string, BodyDefinition>,
): ReadonlyMap<string, Column> {
  return deriveColumns(
    derivePlacementRecords(design, catalog),
    {},
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

/** Every column with the new field taken back off, so two maps can be compared on exactly the fields
 *  that existed before this wave. */
function withoutSources(
  columns: ReadonlyMap<string, Column>,
): ReadonlyMap<string, Omit<Column, "depthFromBuildId">> {
  return new Map(
    [...columns].map(([key, column]) => {
      const withoutSource = { ...column };
      delete withoutSource.depthFromBuildId;
      return [key, withoutSource];
    }),
  );
}

/** The document as it would have been written before ADR 0073: both arrays, no source anywhere. */
function withoutTheSource(design: Design): Design {
  return withTheSource(design, undefined);
}

function withTheSource(design: Design, source: string | undefined): Design {
  const rewrite = (entry: EmptyColumn): EmptyColumn => {
    const rewritten = { ...entry };
    delete rewritten.depthFromBuildId;
    return source === undefined
      ? rewritten
      : { ...rewritten, depthFromBuildId: source };
  };
  return {
    ...design,
    emptyColumns: (design.emptyColumns ?? []).map(rewrite),
    columnExtents: (design.columnExtents ?? []).map(rewrite),
  };
}

function anEmptyColumn(): EmptyColumn {
  return {
    wall: "A",
    alongMm: 3580,
    widthMm: 200,
    y0Mm: 0,
    topMm: 820,
    depthMm: 580,
  };
}

/** One frozen extent on wall A, in the shape `mergeAdjacentEmptyColumns` and
 *  `splitOversizedEmptyColumns` take: a member-less column at an along-wall centre, with the depth it
 *  was frozen at and the body that supplied it. */
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
