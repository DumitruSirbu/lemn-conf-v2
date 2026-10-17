// ADR 0052's version 1 split of an empty column over 800 mm. Attacks what `empty-column-ceiling.test.ts` and
// `qa-5b2a.adversarial.test.ts` leave: the boundary, the split at every width, the entry bound, the restamp's fixed
// point, the entries the migration refuses, and the premise that an odd-width entry is unreachable (measured over
// generated command sequences).
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { MAX_EMPTY_COLUMNS } from "../src/design-bounds.js";
import { removePlacement } from "../src/commands/remove-placement.js";
import { setWidth } from "../src/commands/set-width.js";
import type { Design, EmptyColumn } from "../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import { migrateDesign } from "../src/migrate-design.js";
import {
  deriveColumnKeyAt,
  MAX_EMPTY_COLUMN_WIDTH_MM,
} from "../src/module-grid.js";
import { InvalidDesignError } from "../src/repository.js";
import { splitEmptySpanAtCap } from "../src/split-empty-span.js";
import { validateDesignForCatalog } from "../src/validate-design.js";
import {
  deriveColumns,
  derivePlacementRecords,
  mergeAdjacentEmptyColumns,
  projectEmptyColumns,
  splitOversizedEmptyColumns,
  withCurrentFullHeightMembers,
  type Column,
  type PlacementRecord,
} from "../src/void-engine.js";
import { createFakeProbe } from "./support/fake-probe.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const NOW = "2026-08-25T00:00:00.000Z";
const PROBE = createFakeProbe({ catalog: CATALOG });

/** A document with no placements, so nothing the migration produces can be refused for a reason other than the
 *  one under test. */
/** The room is deliberately not `3600 × 2400`, the room correction's trigger (`migrate-design.ts`): this file is
 *  about the `emptyColumns` ceiling. */
const EMPTY_ROOM: Design = {
  room: { shape: "L", widthMm: 3560, depthMm: 2830, heightMm: 2600 },
  presetId: null,
  placements: [],
  createdAt: NOW,
  updatedAt: NOW,
};

function emptyColumnAt(alongMm: number, widthMm: number): EmptyColumn {
  return { wall: "A", alongMm, widthMm, y0Mm: 0, topMm: 2600, depthMm: 580 };
}

function withEntries(
  design: Design,
  emptyColumns: readonly EmptyColumn[],
): Design {
  return { ...design, emptyColumns: [...emptyColumns] };
}

/** Through `JSON` first, because that is what a stored row is: a `Design` handed straight to
 *  `migrateDesign` would let a test pass that a real document could not. */
function load(schemaVersion: number, design: Design): Design {
  return migrateDesign(
    schemaVersion,
    JSON.parse(JSON.stringify(design)) as unknown,
    CATALOG,
  );
}

function spanOf(entries: readonly EmptyColumn[]) {
  const edges = entries.flatMap((entry) => [
    entry.alongMm - entry.widthMm / 2,
    entry.alongMm + entry.widthMm / 2,
  ]);
  return {
    leftMm: Math.min(...edges),
    rightMm: Math.max(...edges),
    totalMm: entries.reduce((sum, entry) => sum + entry.widthMm, 0),
  };
}

describe("criterion 5G-4, load half: a stored version 1 document survives the ceiling", () => {
  /** The share link the wave exists to protect: a 900 mm entry written before the ceiling must come back as the
   *  columns the rule allows, not as an `InvalidDesignError` the reader cannot act on. */
  it("splits a 900 mm version 1 entry into 800 + 100 over the same span", () => {
    const stored = withEntries(EMPTY_ROOM, [emptyColumnAt(1000, 900)]);

    const loaded = load(1, stored);

    const entries = loaded.emptyColumns ?? [];
    expect(entries.map((entry) => entry.widthMm)).toStrictEqual([800, 100]);
    // Every millimetre kept and the outer edges unmoved: clamping would silently delete wall (rejected by ADR 0052).
    expect(spanOf(entries)).toStrictEqual(spanOf(stored.emptyColumns ?? []));
    // Two entries, two keys: a normalisation whose pieces collided would write a document its own validator refuses.
    expect(
      new Set(
        entries.map((entry) =>
          deriveColumnKeyAt(entry.wall, entry.alongMm / 1000),
        ),
      ).size,
    ).toBe(entries.length);
    for (const entry of entries) {
      expect({
        y0Mm: entry.y0Mm,
        topMm: entry.topMm,
        depthMm: entry.depthMm,
      }).toStrictEqual({ y0Mm: 0, topMm: 2600, depthMm: 580 });
    }
  });

  /** Only version 1 owes the split: the same bytes under a version 2 stamp are carried whole, since an empty column
   *  of any width is valid. */
  it("carries the same document declared version 2 whole", () => {
    const stored = withEntries(EMPTY_ROOM, [emptyColumnAt(1000, 900)]);

    expect(load(2, stored).emptyColumns).toStrictEqual(stored.emptyColumns);
  });

  /** The version 1 arm's boundary from both sides: 800 is not oversized, 802 is. A cap written `>=` instead of `>`
   *  would split the 800. The validator refuses neither, and version 2 carries both whole. */
  it("splits 802 but not 800 at version 1, and carries both whole at version 2", () => {
    const atCap = withEntries(EMPTY_ROOM, [emptyColumnAt(1000, 800)]);

    expect(load(1, atCap).emptyColumns).toStrictEqual(atCap.emptyColumns);
    expect(load(2, atCap).emptyColumns).toStrictEqual(atCap.emptyColumns);
    expect(validateDesignForCatalog(atCap, CATALOG)).toStrictEqual([]);

    const overCap = withEntries(EMPTY_ROOM, [emptyColumnAt(1000, 802)]);
    expect(
      load(1, overCap).emptyColumns?.map((entry) => entry.widthMm),
    ).toStrictEqual([800, 2]);
    expect(load(2, overCap).emptyColumns).toStrictEqual(overCap.emptyColumns);
    expect(validateDesignForCatalog(overCap, CATALOG)).toStrictEqual([]);
  });

  /** Swept rather than sampled: a whole number of ceilings leaves no remainder and anything between leaves exactly
   *  one. The plan names 1600 and 2400; the sweep covers the widths between. */
  propertyTest.prop([fc.integer({ min: 401, max: 1700 }).map((mm) => mm * 2)])(
    "cuts any even version 1 entry into ceiling-sized pieces and one remainder",
    (widthMm) => {
      const stored = withEntries(EMPTY_ROOM, [emptyColumnAt(1800, widthMm)]);

      const entries = load(1, stored).emptyColumns ?? [];

      expect(entries.length).toBe(
        Math.ceil(widthMm / MAX_EMPTY_COLUMN_WIDTH_MM),
      );
      for (const entry of entries.slice(0, -1)) {
        expect(entry.widthMm).toBe(MAX_EMPTY_COLUMN_WIDTH_MM);
      }
      expect(spanOf(entries)).toStrictEqual(spanOf(stored.emptyColumns ?? []));
      expect(
        validateDesignForCatalog(withEntries(EMPTY_ROOM, entries), CATALOG),
      ).toStrictEqual([]);
    },
  );

  /** The restamp in `neon-configuration-repository.ts` writes `schema_version = 2` over a row that arrived as
   *  version 1 and rests on this: a normalised document is a fixed point of `migrateFromV1`. */
  it("is a fixed point, so the version 2 restamp is safe in both directions", () => {
    const normalised = load(
      1,
      withEntries(EMPTY_ROOM, [emptyColumnAt(1800, 2400)]),
    );

    expect(load(1, normalised).emptyColumns).toStrictEqual(
      normalised.emptyColumns,
    );
    expect(load(2, normalised).emptyColumns).toStrictEqual(
      normalised.emptyColumns,
    );
  });

  /** A load that changes nothing must not rewrite the object a later save is diffed against, which
   *  is the stated reason `splitOversizedEmptyColumns` returns by identity. */
  it("returns a version 1 document with nothing oversized unchanged", () => {
    const stored = withEntries(EMPTY_ROOM, [
      emptyColumnAt(500, 300),
      emptyColumnAt(1500, 800),
    ]);

    expect(load(1, stored)).toStrictEqual({
      ...stored,
      settings: { cabinetDepthMm: 600 },
    });
  });

  /** The security review's assertion: an oversized entry that splits into many must not push the array past
   *  `MAX_EMPTY_COLUMNS`, which nothing else bounds on the migration's output. Not reachable from an honest document,
   *  so this is a hostile-input refusal. 146 entries of 10 000 mm each split into 13 pieces at the 800 mm ceiling
   *  (12 full plus a 400 mm remainder), and 146 × 13 = 1898 exceeds the bound. */
  it("refuses a version 1 document whose normalisation would exceed the entry bound", () => {
    // A storable room, not a policy one: the migration is judged here, not Step 1.
    const wideRoom: Design = {
      ...EMPTY_ROOM,
      room: { shape: "L", widthMm: 6300, depthMm: 5100, heightMm: 2600 },
    };
    const stored = withEntries(
      wideRoom,
      Array.from({ length: 146 }, (_unused, index) =>
        emptyColumnAt(1000 + index * 20, 10_000),
      ),
    );

    expect(() => load(1, stored)).toThrow(InvalidDesignError);
    expect(() => load(1, stored)).toThrow(
      new RegExp(`${String(MAX_EMPTY_COLUMNS)}-entry bound`),
    );
  });

  /** A version 1 entry of odd width is not split: `alongMm` is a whole millimetre, so a 1 mm piece would sit at a
   *  half-millimetre centre no document can carry, and rounding would key it as its neighbour. The entry goes forward
   *  whole, and a whole entry of any width is valid; that no pre-5G empty column the product can write has an odd
   *  width is asserted below. */
  it("carries an odd-width version 1 entry whole instead of rounding a piece onto a millimetre", () => {
    const stored = withEntries(EMPTY_ROOM, [emptyColumnAt(1000, 901)]);

    expect(load(1, stored).emptyColumns).toStrictEqual(stored.emptyColumns);
    // And the pieces really are unrepresentable, which is the reason: not a rounding decision the
    // migration could have made differently.
    expect(
      splitEmptySpanAtCap(549.5, 1450.5).map((piece) => piece.centreMm),
    ).toStrictEqual([949.5, 1400]);
  });
});

describe("the map-level normaliser's decline paths", () => {
  /** `splitOversizedEmptyColumns` declines whole when a piece would land on a key the map already holds, which
   *  leaves the oversized column standing for `projectEmptyColumns` to write into a document
   *  `validateDesignForCatalog` refuses. Constructed, not reached: it needs two member-less columns under 20 mm
   *  apart, which `deriveColumnKeyAt`'s 10 mm bucket makes a hand-built map only. */
  it("leaves an oversized column standing when a piece would collide, rather than half-splitting", () => {
    const wide = frozenColumn("A|0.90", 900, 1400);
    const blocker = frozenColumn("A|1.30", 1300, 4);
    const columns = new Map<string, Column>([
      [wide.key, wide],
      [blocker.key, blocker],
    ]);

    const split = splitOversizedEmptyColumns(columns, []);

    // Whole or not at all: half a split is a map whose columns no longer tile the space.
    expect([...split.keys()].sort()).toStrictEqual(["A|0.90", "A|1.30"]);
    expect(split.get("A|0.90")?.w).toBeCloseTo(1.4, 9);
  });

  /** The consequence of that decline: the map it returns projects to a document the write seam refuses, which is why
   *  `apps/web/tests/store/qa-5g.adversarial.test.ts` asserts validity rather than width. */
  it("projects a declined column into a document the validator refuses", () => {
    const wide = frozenColumn("A|0.90", 900, 1400);
    const blocker = frozenColumn("A|1.30", 1300, 4);
    const columns = new Map<string, Column>([
      [wide.key, wide],
      [blocker.key, blocker],
    ]);

    // Through `withCurrentFullHeightMembers`, exactly as `resolveColumns` does — that is the funnel
    // that turns the normaliser's extents back into the columns the projection reads.
    const projected = projectEmptyColumns(
      withCurrentFullHeightMembers(splitOversizedEmptyColumns(columns, []), []),
      [],
    );

    expect(
      validateDesignForCatalog(withEntries(EMPTY_ROOM, projected), CATALOG).map(
        (issue) => issue.code,
      ),
    ).toStrictEqual([
      "EMPTY_COLUMN_OVERLAPS_EMPTY_COLUMN",
      "EMPTY_COLUMN_OVERLAPS_EMPTY_COLUMN",
    ]);
  });
});

/** A frozen member-less column, as the map holds one: a single region from the floor to the top,
 *  on wall A at whole millimetres. */
function frozenColumn(key: string, centreMm: number, widthMm: number): Column {
  return {
    key,
    wall: "A",
    x: centreMm / 1000,
    z: 0.29,
    w: widthMm / 1000,
    d: 0.58,
    top: 2.6,
    ry: 0,
    regions: [[0, 2.6]],
    hasFullHeightUnder: false,
  } as Column;
}

describe("the premise the version 1 normalisation rests on", () => {
  /** What a pre-5G build could have stored, catalogued: it wrote a freed span as one column, which now survives as
   *  the contiguous run of member-less columns the split leaves behind, so it is measured here. Asserted over every
   *  such run: its width is even (so `migrateFromV1`'s split lands on whole millimetres and the odd-width refusal
   *  above is unreachable from the product) and an entry of that width is carried, not refused. A generator that
   *  never freed a span over the ceiling would prove nothing, so those states are counted. */
  it("frees no odd-width span, and every oversized one is carried by migrateFromV1", () => {
    let oversizedSpans = 0;
    let spansSeen = 0;
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom<Step>(
            "clear-fridge",
            "clear-fridge",
            "narrow-pantry",
            "narrow-pantry",
            "narrow-pantry",
            "widen-pantry",
            "remove-any",
          ),
          { minLength: 8, maxLength: 16 },
        ),
        (steps) => {
          let world = load5G(KITCHEN_L_DESIGN);
          for (const step of steps) {
            world = apply5G(world, step);
            for (const span of memberLessSpans(world)) {
              spansSeen += 1;
              expect(span.widthMm % 2).toBe(0);
              if (span.widthMm <= MAX_EMPTY_COLUMN_WIDTH_MM) continue;
              oversizedSpans += 1;
              const asStoredPre5G = emptyColumnAt(
                span.leftMm + span.widthMm / 2,
                span.widthMm,
              );
              const carried = load(1, withEntries(EMPTY_ROOM, [asStoredPre5G]));
              expect(
                (carried.emptyColumns ?? []).reduce(
                  (sum, entry) => sum + entry.widthMm,
                  0,
                ),
              ).toBe(span.widthMm);
            }
          }
        },
      ),
      { numRuns: 60 },
    );

    expect(spansSeen).toBeGreaterThan(0);
    expect(oversizedSpans).toBeGreaterThan(0);
  });
});

type Step = "clear-fridge" | "narrow-pantry" | "widen-pantry" | "remove-any";

interface World {
  readonly design: Design;
  readonly columns: ReadonlyMap<string, Column>;
  readonly records: readonly PlacementRecord[];
}

/** The store's `resolveColumns`: cut what exceeds the ceiling, join what fits under it, then
 *  re-answer `hasFullHeightUnder` over the extents the pair wrote. */
function advance5G(
  design: Design,
  published: ReadonlyMap<string, Column>,
): World {
  const records = derivePlacementRecords(design, CATALOG);
  const columns = withCurrentFullHeightMembers(
    mergeAdjacentEmptyColumns(
      splitOversizedEmptyColumns(published, records),
      records,
    ),
    records,
  );
  return { design, columns, records };
}

function load5G(design: Design): World {
  const records = derivePlacementRecords(design, CATALOG);
  return advance5G(
    design,
    deriveColumns(records, { emptyColumns: design.emptyColumns }, design.room),
  );
}

function apply5G(world: World, step: Step): World {
  switch (step) {
    case "clear-fridge":
      return removeFirst(world, ["p24", "p7"]);
    case "remove-any":
      return removeFirst(
        world,
        world.records.map((record) => record.id),
      );
    case "narrow-pantry":
      return resizePantry(world, -50);
    case "widen-pantry":
      return resizePantry(world, 50);
  }
}

function removeFirst(world: World, ids: readonly string[]): World {
  for (const id of ids) {
    const result = removePlacement({
      design: world.design,
      catalog: CATALOG,
      target: { kind: "placement", id },
      occurredAt: NOW,
    });
    if (result.ok) return advance5G(result.design, world.columns);
  }
  return world;
}

/** The pantry, resized by one step. A refusal is a legal step: a pantry at its floor refuses from ordinary input,
 *  and a generator that threw on one would explore only its first few states. */
function resizePantry(world: World, deltaMm: number): World {
  const pantry = world.records.find((record) => record.id === "p6");
  if (!pantry) return world;
  const result = setWidth({
    design: world.design,
    catalog: CATALOG,
    columns: world.columns,
    target: { kind: "placement", id: "p6" },
    widthMm: Math.round(pantry.frame.w * 1000) + deltaMm,
    probe: PROBE,
    occurredAt: NOW,
  });
  return result.ok ? advance5G(result.design, result.effect.columns) : world;
}

/** The contiguous runs of member-less columns on one wall, which is the *space* ADR 0037 governs —
 *  as against the columns ADR 0052 bounds. A pre-5G build stored one of these as a single entry. */
function memberLessSpans(world: World) {
  const occupied = new Set(world.records.map((record) => record.col));
  const spans: { leftMm: number; widthMm: number }[] = [];
  for (const wall of ["A", "B"] as const) {
    // Restarted per wall: two walls' along-wall coordinates share an axis of numbers and nothing
    // else, so a run must never be continued across the boundary between them.
    const wallSpans: { leftMm: number; widthMm: number }[] = [];
    const sorted = [...world.columns.values()]
      .filter((column) => column.wall === wall && !occupied.has(column.key))
      .map((column) => ({
        leftMm: Math.round(
          ((wall === "A" ? column.x : column.z) - column.w / 2) * 1000,
        ),
        widthMm: Math.round(column.w * 1000),
      }))
      .sort((left, right) => left.leftMm - right.leftMm);
    for (const piece of sorted) {
      const open = wallSpans[wallSpans.length - 1];
      if (open && open.leftMm + open.widthMm === piece.leftMm) {
        open.widthMm += piece.widthMm;
        continue;
      }
      wallSpans.push({ ...piece });
    }
    spans.push(...wallSpans);
  }
  return spans;
}
