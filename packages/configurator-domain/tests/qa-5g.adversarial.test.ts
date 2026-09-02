// Adversarial QA for M5 wave 5G — ADR 0052: 800 mm is the ceiling on any empty column.
//
// The wave covers the span arithmetic and the map-level normaliser in `empty-column-ceiling.test.ts`
// and criterion 5G-4's two headline cases in `qa-5b2a.adversarial.test.ts` (a 900 mm version 1 entry
// loads as 800 + 100; the same entry in a version 2 document is refused). What is attacked here is
// everything **around** those two: the boundary the cap turns on, what the split produces at every
// width rather than at one, the entry bound the security review asked to be asserted, the fixed
// point the schema restamp rests on, and the entries the migration refuses rather than carries.
//
// It also attacks the premise the whole normalisation rests on — *an entry whose pieces would land
// between millimetres is unreachable*. That is asserted rather than accepted, by measuring the free
// spans generated command sequences actually produce, because a span of odd width is exactly the
// stored document `migrateFromV1` refuses instead of carrying.
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

/** A document with no placements, so nothing the migration produces can be refused for a reason
 *  other than the one under test: an entry that overlaps a body, or shares a key with one, would
 *  make every assertion below pass for the wrong reason. The seeded kitchen was used for exactly
 *  such a fixture in the wave's own write-seam test — see `refuses a hand-built version 2 document`
 *  below, which pins the codes rather than trusting the status. */
const EMPTY_ROOM: Design = {
  room: { shape: "L", widthMm: 3600, depthMm: 2400, heightMm: 2600 },
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
  /** The share link the wave exists to protect. A 900 mm entry is what a pre-5G shrink wrote — the
   *  plan measures it at nine taps, two since wave 5B8 — and it must come back as the columns the
   *  new rule allows rather than as an `InvalidDesignError` the reader cannot act on. */
  it("splits a 900 mm version 1 entry into 800 + 100 over the same span", () => {
    const stored = withEntries(EMPTY_ROOM, [emptyColumnAt(1000, 900)]);

    const loaded = load(1, stored);

    const entries = loaded.emptyColumns ?? [];
    expect(entries.map((entry) => entry.widthMm)).toStrictEqual([800, 100]);
    // Every millimetre kept, and the outer edges unmoved: clamping would silently delete wall,
    // which ADR 0052 rejected by name.
    expect(spanOf(entries)).toStrictEqual(spanOf(stored.emptyColumns ?? []));
    // Two entries, two keys. A normalisation whose pieces collided would write a document its own
    // validator refuses — the failure ADR 0052 names as this wave's specific risk.
    expect(
      new Set(
        entries.map((entry) =>
          deriveColumnKeyAt(entry.wall, entry.alongMm / 1000),
        ),
      ).size,
    ).toBe(entries.length);
    // Every other frozen fact is the same space's.
    for (const entry of entries) {
      expect({
        y0Mm: entry.y0Mm,
        topMm: entry.topMm,
        depthMm: entry.depthMm,
      }).toStrictEqual({ y0Mm: 0, topMm: 2600, depthMm: 580 });
    }
  });

  /** The other seam of criterion 5G-4. `migrateFromV2` validates without normalising, so the same
   *  bytes under a version 2 stamp are refused — and refused with the code ADR 0052 added, not with
   *  whatever else the fixture happened to trip. */
  it("refuses the same document declared version 2, naming the cap", () => {
    const stored = withEntries(EMPTY_ROOM, [emptyColumnAt(1000, 900)]);

    expect(() => load(2, stored)).toThrow(InvalidDesignError);
    expect(() => load(2, stored)).toThrow(/EMPTY_COLUMN_WIDER_THAN_CAP/);
  });

  /** The boundary, from both sides and at both seams. 800 is not oversized and must not be touched;
   *  801 is. A cap written `>=` instead of `>` would split the 800 and this is what would say so. */
  it("leaves exactly 800 alone and refuses exactly 801, at both versions", () => {
    const atCap = withEntries(EMPTY_ROOM, [emptyColumnAt(1000, 800)]);

    expect(load(1, atCap).emptyColumns).toStrictEqual(atCap.emptyColumns);
    expect(load(2, atCap).emptyColumns).toStrictEqual(atCap.emptyColumns);
    expect(
      validateDesignForCatalog(atCap, CATALOG).map((issue) => issue.code),
    ).not.toContain("EMPTY_COLUMN_WIDER_THAN_CAP");

    const overCap = withEntries(EMPTY_ROOM, [emptyColumnAt(1000, 802)]);
    expect(
      load(1, overCap).emptyColumns?.map((entry) => entry.widthMm),
    ).toStrictEqual([800, 2]);
    expect(
      validateDesignForCatalog(overCap, CATALOG).map((issue) => issue.code),
    ).toContain("EMPTY_COLUMN_WIDER_THAN_CAP");
  });

  /** What the split produces further out, swept rather than sampled: a whole number of ceilings
   *  leaves no remainder, and anything between leaves exactly one. The plan asks for 1600 and 2400
   *  by name; the sweep is what stops the arithmetic being right at those two and wrong between. */
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
        validateDesignForCatalog(withEntries(EMPTY_ROOM, entries), CATALOG).map(
          (issue) => issue.code,
        ),
      ).not.toContain("EMPTY_COLUMN_WIDER_THAN_CAP");
    },
  );

  /** The restamp in `neon-configuration-repository.ts` writes `schema_version = 2` over a row that
   *  arrived as version 1, and its comment rests on this: *a normalised document is a fixed point of
   *  `migrateFromV1`*. If it were not, a row half-way through the change would load differently
   *  depending on which stamp it carried. */
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

    expect(load(1, stored)).toStrictEqual(stored);
  });

  /** The security review's own assertion, made executable: an oversized entry that splits into many
   *  must not be able to push the array past `MAX_EMPTY_COLUMNS`. The schema bounds what *arrives*
   *  and nothing else bounds what the migration produces, so this is the one place it can be said.
   *
   *  **Not reachable from an honest document** — the shipped kitchen derives thirteen columns in
   *  total against a bound of 1262 — so this is a hostile-input refusal, not a share link at risk. */
  it("refuses a version 1 document whose normalisation would exceed the entry bound", () => {
    const wideRoom: Design = {
      ...EMPTY_ROOM,
      room: { shape: "L", widthMm: 6300, depthMm: 5100, heightMm: 2600 },
    };
    const stored = withEntries(
      wideRoom,
      Array.from({ length: 98 }, (_unused, index) =>
        emptyColumnAt(1000 + index * 20, 10_000),
      ),
    );

    expect(() => load(1, stored)).toThrow(InvalidDesignError);
    expect(() => load(1, stored)).toThrow(
      new RegExp(`${String(MAX_EMPTY_COLUMNS)}-entry bound`),
    );
  });

  /** **A version 1 entry of odd width is refused rather than split, and that is pinned here because
   *  the plan calls it unreachable rather than handled.**
   *
   *  It is forced by the wire, not by an oversight: `alongMm` is a whole millimetre, so a piece
   *  1 mm wide sits at a half-millimetre centre no document can carry, and rounding it would key the
   *  piece as its neighbour. The entry therefore goes forward as it was and
   *  `assertDesignValidForCatalog` refuses it.
   *
   *  What makes that acceptable is reachability, and reachability is asserted below rather than
   *  argued: `no pre-5G empty column the product can write has an odd width`. */
  it("refuses an odd-width version 1 entry instead of rounding a piece onto a millimetre", () => {
    const stored = withEntries(EMPTY_ROOM, [emptyColumnAt(1000, 901)]);

    expect(() => load(1, stored)).toThrow(/EMPTY_COLUMN_WIDER_THAN_CAP/);
    // And the pieces really are unrepresentable, which is the reason: not a rounding decision the
    // migration could have made differently.
    expect(
      splitEmptySpanAtCap(549.5, 1450.5).map((piece) => piece.centreMm),
    ).toStrictEqual([949.5, 1400]);
  });
});

describe("the map-level normaliser's decline paths", () => {
  /** `splitOversizedEmptyColumns` declines whole when a piece would land on a key the map already
   *  holds — and a decline leaves the oversized column standing, which `projectEmptyColumns` then
   *  writes into a document `validateDesignForCatalog` refuses. That is the wave's own named risk
   *  arriving from the other side, so the branch is exercised rather than assumed dead.
   *
   *  Constructed, not reached: it needs two member-less columns under 20 mm apart, which
   *  `deriveColumnKeyAt`'s 10 mm bucket makes a hand-built map only. */
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

  /** The consequence of that decline, stated so nobody reads the branch as harmless: the map it
   *  returns projects to a document the write seam refuses. It is the shape a fourth producer would
   *  take, and the reason the store-level property in
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
    ).toContain("EMPTY_COLUMN_WIDER_THAN_CAP");
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
  /** **What a pre-5G build could have stored, catalogued.**
   *
   *  Before this wave `resolveColumns` was derive, merge, re-answer — no split — so the entry the
   *  build that wrote the rows in the application database would have written for a freed span is
   *  the span itself, as one column. That span survives this wave as the *contiguous run of
   *  member-less columns* the split leaves behind, so it is measured here rather than reasoned about.
   *
   *  Two things are asserted over every such run. Its width is **even**, which is what makes
   *  `migrateFromV1`'s split land on whole millimetres and the odd-width refusal above unreachable
   *  from the product; and an entry of that width really is carried by the migration rather than
   *  refused. The run also asserts its own reach: a generator that never freed a span over the
   *  ceiling would prove nothing, so the states that did are counted. */
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
  return advance5G(design, deriveColumns(records, design.emptyColumns));
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

/** The pantry, resized by one step. **A refusal is a legal step** — a pantry already at its floor
 *  refuses from ordinary input, and a generator that threw on one would only ever explore its first
 *  few states. */
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
