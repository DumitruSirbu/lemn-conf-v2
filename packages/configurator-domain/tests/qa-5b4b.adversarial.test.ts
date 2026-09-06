// Adversarial QA for M5B wave 5B4b — ADR 0046 part 2, the capped merge.
//
// Three things the wave's own criteria leave open, each found by applying a named mutant and seeing
// green:
//
// 1. **No fixture merges more than two columns into one block.** Criteria 1, 3, 4 and 9 all run on
//    runs of two or three columns whose greedy answer is a *pair* plus a leftover, so a scan that
//    stopped every block at two members is indistinguishable from the shipped one. Maximality — "the
//    **widest** contiguous sub-run" — is the whole of ADR 0046 rule 1 and nothing asserted it.
// 2. **Criterion 9's own named mutant survives its fixture.** Carrying the previous block's total
//    into the next block leaves three 300s and 300 + 500 + 300 unchanged; it takes six columns
//    before the two answers part company, and it does not break the fixpoint, so only a positional
//    assertion on a longer chain catches it.
// 3. **The odd-total decline is asserted through `projectEmptyColumns` but never through a command.**
//    Criterion 8 says `applyCommandResult` never throws; the store half of that is
//    `apps/web/tests/store/qa-5b4b.adversarial.test.ts`, and what is asked here is the domain half on
//    all five projected fields rather than on two of them.
//
// It also carries the adjudication of `qa-5b2b`'s restated round-trip property: the merge makes the
// literal key-set equality false, and this asserts what stays true underneath it, so that a merge
// which genuinely *broke* the round trip could not hide behind the restatement.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import type { VacatedOpening } from "../src/commands/command-result.js";
import {
  DesignSchema,
  type Design,
  type DesignRoom,
  type EmptyColumn,
} from "../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import { MAX_EMPTY_COLUMN_WIDTH_MM } from "../src/module-grid.js";
import { toExactMillimetres } from "../src/millimetres.js";
import { alongWallCoordinate, deriveColumnKeyAt } from "../src/module-grid.js";
import { validateDesignForCatalog } from "../src/validate-design.js";
import { findVacatedVoid } from "../src/queries/vacated-void.js";
import { removePlacement } from "../src/commands/remove-placement.js";
import {
  deriveColumns,
  derivePlacementRecords,
  mergeAdjacentEmptyColumns,
  projectEmptyColumns,
  recomputeVoids,
  withCurrentFullHeightMembers,
  type Column,
  type PlacementRecord,
  type VoidRecord,
} from "../src/void-engine.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const NOW = "2026-08-25T00:00:00.000Z";

/** A full-height cleared space, so a fixture that varies one frozen fact says which one. */
const FULL_HEIGHT_SPACE = { y0Mm: 0, topMm: 2600, depthMm: 580 } as const;

function emptySpace(
  alongMm: number,
  widthMm: number,
  overrides: Partial<EmptyColumn> = {},
): EmptyColumn {
  return { wall: "A", alongMm, widthMm, ...FULL_HEIGHT_SPACE, ...overrides };
}

function designWith(
  emptyColumns: readonly EmptyColumn[],
  placements: readonly unknown[] = [],
): Design {
  return DesignSchema.parse({
    room: { shape: "L", widthMm: 4200, depthMm: 2400, heightMm: 2600 },
    presetId: null,
    placements,
    emptyColumns,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

interface Loaded {
  readonly columns: ReadonlyMap<string, Column>;
  readonly records: readonly PlacementRecord[];
  readonly voids: readonly VoidRecord[];
}

function load(design: Design): Loaded {
  const records = derivePlacementRecords(design, CATALOG);
  const columns = deriveColumns(
    records,
    { emptyColumns: design.emptyColumns },
    design.room,
  );
  return { columns, records, voids: recomputeVoids(records, columns) };
}

/** Wide enough that `loadStored`'s widest sweep (buckets up to 27, at 150 mm cells) never
 *  reaches the wall's own end — this file is about the merge's round trip, not
 *  `clipEmptyColumnsAtWallEnd`, which has its own test file. */
const ROOM: DesignRoom = {
  shape: "L",
  widthMm: 7000,
  depthMm: 7000,
  heightMm: 2600,
};

/** The stored spaces straight into `deriveColumns`, with no placements — `qa-5b2b`'s own round trip,
 *  which runs on a frozen map rather than on a document. */
function loadStored(emptyColumns: readonly EmptyColumn[]): Loaded {
  const columns = deriveColumns([], { emptyColumns: emptyColumns }, ROOM);
  return { columns, records: [], voids: recomputeVoids([], columns) };
}

interface ExtentMm {
  readonly centreMm: number;
  readonly widthMm: number;
}

function extentMmOf(column: Column): ExtentMm {
  const centreMm = toExactMillimetres(
    column.wall === "A" ? column.x : column.z,
  );
  const widthMm = toExactMillimetres(column.w);
  if (centreMm === undefined || widthMm === undefined) {
    throw new Error(`Column ${column.key} is not on whole millimetres`);
  }
  return { centreMm, widthMm };
}

/** Key and extent together, over the empty columns only — a widths-only answer is green under a
 *  scan running the other way, and a keys-only one is green under a merge that forgets to vacate. */
function emptyExtentsOf(loaded: Loaded): Record<string, ExtentMm> {
  const occupied = new Set(loaded.records.map((record) => record.col));
  const extents: Record<string, ExtentMm> = {};
  for (const [key, column] of loaded.columns) {
    if (occupied.has(key)) continue;
    extents[key] = extentMmOf(column);
  }
  return extents;
}

/** Abutting spaces laid from one edge, exactly as `layOutFromLeftEdge` in the wave's own file: each
 *  centre is the running edge plus half the width. */
function layOutFromLeftEdge(
  widths: readonly number[],
  firstEdgeMm: number,
  overrides: Partial<EmptyColumn> = {},
): EmptyColumn[] {
  const spaces: EmptyColumn[] = [];
  let edgeMm = firstEdgeMm;
  for (const widthMm of widths) {
    spaces.push(emptySpace(edgeMm + widthMm / 2, widthMm, overrides));
    edgeMm += widthMm;
  }
  return spaces;
}

describe("a block is the widest run under the cap, not the first pair under it", () => {
  // ADR 0046 rule 1 is *widest*, and every fixture in the wave's own file has a greedy answer of two
  // columns plus a leftover. Stop the scan at two members and criteria 1, 2, 3, 4, 9 and 12 are all
  // still green; four 200s is the shortest run where two-at-a-time and widest part company.
  it("merges four abutting 200s into one 800, not into two 400s", () => {
    const loaded = load(
      designWith(layOutFromLeftEdge([200, 200, 200, 200], 1000)),
    );

    expect(emptyExtentsOf(loaded)).toEqual({
      "A|1.40": { centreMm: 1400, widthMm: 800 },
    });
  });

  // Criterion 9's own named mutant — "seed each run with the previous block's accumulated total" —
  // leaves three 300s and 300 + 500 + 300 untouched *and* stays a fixpoint, so the criterion it was
  // written for cannot fail it. Six 200s is where it shows: carrying 800 forward makes the second
  // block a single 200 instead of a 400, and the answer is positional.
  it("takes a second block at its own full width after a first block hit the cap", () => {
    const loaded = load(
      designWith(layOutFromLeftEdge([200, 200, 200, 200, 200, 200], 1000)),
    );

    expect(emptyExtentsOf(loaded)).toEqual({
      "A|1.40": { centreMm: 1400, widthMm: 800 },
      "A|2.00": { centreMm: 2000, widthMm: 400 },
    });
  });

  // The fixpoint, on a chain long enough for maximality to matter: the wave's own fixpoint test runs
  // on two three-column chains, and a block capped at two members is a fixpoint on both.
  it("returns its own output unchanged on a six-column chain", () => {
    const first = load(
      designWith(layOutFromLeftEdge([200, 200, 200, 200, 200, 200], 1000)),
    );

    const again = load(designWith(projectEmptyColumns(first.columns, [])));

    expect(emptyExtentsOf(again)).toEqual(emptyExtentsOf(first));
  });
});

describe("the merge conserves the wall it merges, which is what the restated round trip rests on", () => {
  // **The adjudication of `qa-5b2b`'s restated property.** That property asserted that the key set
  // `deriveColumns(projectEmptyColumns(frozen))` restores equals `frozen`'s own, and 5B4b restated it
  // against the *merged* map. A correct merge does make the literal reading false — merging is a
  // total function on the map that combines keys — but "the merge changed it" is also what a merge
  // that lost a space would say. What survives a correct merge is conservation: the millimetres of
  // wall the frozen columns own are exactly the millimetres the restored ones own, and every frozen
  // span lies inside exactly one restored span. A dropped or moved column is red here whatever the
  // merge does, which is what makes the restatement honest rather than an assertion weakened to fit.
  propertyTest.prop([
    fc.uniqueArray(fc.integer({ min: 0, max: 27 }), {
      minLength: 1,
      maxLength: 12,
    }),
  ])("owns the same millimetres of wall after a round trip", (buckets) => {
    // 150 mm cells on a 150 mm lattice, so neighbouring buckets abut and merge while the rest do
    // not — `qa-5b2b`'s own fixture shape, which is what makes this the adjudication of its
    // restated property rather than a new one.
    const frozen = loadStored(
      buckets.map((bucket) => emptySpace(bucket * 150 + 75, 150)),
    );

    const restored = loadStored(projectEmptyColumns(frozen.columns, []));

    expect(coveredMillimetresOf(restored)).toStrictEqual(
      coveredMillimetresOf(frozen),
    );
    for (const span of spansOf(frozen)) {
      expect(
        spansOf(restored).filter(
          (candidate) =>
            candidate.leftMm <= span.leftMm &&
            candidate.rightMm >= span.rightMm,
        ),
      ).toHaveLength(1);
    }
  });
});

interface SpanMm {
  readonly leftMm: number;
  readonly rightMm: number;
}

function spansOf(loaded: Loaded): readonly SpanMm[] {
  return Object.values(emptyExtentsOf(loaded)).map((extent) => ({
    leftMm: extent.centreMm - extent.widthMm / 2,
    rightMm: extent.centreMm + extent.widthMm / 2,
  }));
}

/** Every whole millimetre of wall the empty columns cover, as a sorted list — a set rather than a
 *  sum, so a merge that both lost a column and widened another is still red. */
function coveredMillimetresOf(loaded: Loaded): readonly number[] {
  const covered = new Set<number>();
  for (const span of spansOf(loaded)) {
    for (let mm = Math.ceil(span.leftMm); mm < span.rightMm; mm += 1) {
      covered.add(mm);
    }
  }
  return [...covered].sort((left, right) => left - right);
}

describe("the depth envelope neither invents depth nor merges across a real difference", () => {
  // The team's explicit case, and the one ADR 0046 rule 2 does not name: a cleared wall-depth column
  // beside a cleared base-depth one. 270 mm apart is far past `LEVEL_SNAP_M`, so they stay two — and
  // each keeps the depth it had, which is what a body is offered.
  it("keeps a 330 mm wall column out of a 600 mm base column", () => {
    const loaded = load(
      designWith([
        emptySpace(2000, 300, { depthMm: 330 }),
        emptySpace(2300, 300, { depthMm: 600 }),
      ]),
    );

    expect(Object.keys(emptyExtentsOf(loaded)).sort()).toEqual([
      "A|2.00",
      "A|2.30",
    ]);
    expect(depthMmOfOpeningIn(loaded, "A|2.00")).toBe(330);
    expect(depthMmOfOpeningIn(loaded, "A|2.30")).toBe(600);
  });

  // The other side of the tolerance, and the reason the envelope is `min(d)` rather than `max(d)`:
  // two columns 20 mm apart in depth **do** merge, and the merged column publishes the shallower of
  // the two. The 20 mm the deeper member gives up is real depth lost; offering the extra 20 mm
  // instead would be depth invented, and ADR 0046's own note picks the safe side. Asserted so that a
  // later switch to `max` is a red test rather than a reviewer's catch.
  it("publishes the shallower depth when two columns merge inside the tolerance", () => {
    const loaded = load(
      designWith([
        emptySpace(2000, 300, { depthMm: 580 }),
        emptySpace(2300, 300, { depthMm: 600 }),
      ]),
    );

    expect(emptyExtentsOf(loaded)).toEqual({
      "A|2.15": { centreMm: 2150, widthMm: 600 },
    });
    expect(depthMmOfOpeningIn(loaded, "A|2.15")).toBe(580);
  });

  // One millimetre past the tolerance and they are two columns again, so the predicate is a
  // comparison against `LEVEL_SNAP_M` rather than a comparison that happens to be true.
  it("keeps two columns 21 mm apart in depth separate", () => {
    const loaded = load(
      designWith([
        emptySpace(2000, 300, { depthMm: 580 }),
        emptySpace(2300, 300, { depthMm: 601 }),
      ]),
    );

    expect(Object.keys(emptyExtentsOf(loaded)).sort()).toEqual([
      "A|2.00",
      "A|2.30",
    ]);
  });
});

function depthMmOfOpeningIn(loaded: Loaded, key: string): number {
  const opening = loaded.voids.find((record) => record.col === key);
  if (!opening) throw new Error(`No opening published in ${key}`);
  return Math.round(opening.d * 1000);
}

describe("geometry, and not the cap, is what stops a merge across a standing body", () => {
  /** A real 800 mm sink seated across 1900–2700, which is the shape the seeded corner has and the
   *  seeded corner cannot demonstrate: `A|0.30` + `A|0.75` total 900, so the **cap** turns them away
   *  before `standsIn` is ever asked. This run totals 600. */
  const SINK_ACROSS_THE_RUN = [
    {
      id: "p0",
      wall: "A",
      alongMm: 2300,
      y0Mm: 0,
      body: { buildId: "base-sink-800", widthMm: 800, heightMm: 820 },
    },
  ];
  const RUN_OVER_THE_SINK = [emptySpace(1700, 300), emptySpace(2000, 300)];

  it("merges the run when nothing stands in it", () => {
    const loaded = load(designWith(RUN_OVER_THE_SINK));

    expect(emptyExtentsOf(loaded)).toEqual({
      "A|1.85": { centreMm: 1850, widthMm: 600 },
    });
    expect(600).toBeLessThanOrEqual(MAX_EMPTY_COLUMN_WIDTH_MM);
  });

  // The identical run, the identical widths, the identical cap — and the only difference is a body
  // standing under it. Touching edges alone would merge here, and the space published would be space
  // the sink is occupying.
  it("declines the identical run once a body stands across it", () => {
    const loaded = load(designWith(RUN_OVER_THE_SINK, SINK_ACROSS_THE_RUN));

    expect(emptyExtentsOf(loaded)).toEqual({
      "A|1.70": { centreMm: 1700, widthMm: 300 },
      "A|2.00": { centreMm: 2000, widthMm: 300 },
    });
    expect(loaded.voids.some((record) => record.col === "A|1.85")).toBe(false);
  });
});

describe("an unmergeable run is declined, and stays projectable on every field", () => {
  // The odd-total decline, stated as a worked example rather than only as a swept property: two
  // 51 mm spaces laid from a half-millimetre edge are each on an integer centre — which is what a
  // document stores — while their merged centre is 1050.5. The merge leaves them alone.
  it("leaves an odd-total run of two unmerged rather than keying it half a millimetre out", () => {
    const loaded = load(designWith(layOutFromLeftEdge([51, 51], 999.5)));

    expect(emptyExtentsOf(loaded)).toEqual({
      "A|1.02": { centreMm: 1025, widthMm: 51 },
      "A|1.08": { centreMm: 1076, widthMm: 51 },
    });
    expect(() =>
      projectEmptyColumns(loaded.columns, loaded.records),
    ).not.toThrow();
  });

  // Criterion 8 on **all five** projected fields. `landsOnWholeMillimetres` guards the centre and
  // the width; `y0Mm`, `topMm` and `depthMm` are whole only because `measure` refused every column
  // that was not, and that is an argument rather than an assertion until it is swept. This is the
  // pair of expressions the phase has twice been caught by — the guarded one and the projected one —
  // asked as one question.
  propertyTest.prop([
    fc.boolean(),
    fc.array(fc.integer({ min: 25, max: 400 }), { minLength: 2, maxLength: 5 }),
    fc.integer({ min: 300, max: 620 }),
    fc.integer({ min: 1200, max: 2600 }),
  ])(
    "projects every field of every column it publishes, merged or not",
    (odd, halfWidths, depthMm, topMm) => {
      const widths = halfWidths.map((half) => (odd ? 2 * half + 1 : 2 * half));
      const design = designWith(
        layOutFromLeftEdge(widths, odd ? 999.5 : 1000, { depthMm, topMm }),
      );
      // Conservation, not wall-end clipping, is this property's subject — widened so the sweep's
      // widest run (five 800 mm columns from a 1000 mm left edge) never reaches wall A's own end.
      const loaded = load({
        ...design,
        room: { ...design.room, widthMm: 6000 },
      });

      const projected = projectEmptyColumns(loaded.columns, loaded.records);

      for (const entry of projected) {
        expect(Number.isInteger(entry.alongMm)).toBe(true);
        expect(Number.isInteger(entry.widthMm)).toBe(true);
        expect(Number.isInteger(entry.y0Mm)).toBe(true);
        expect(Number.isInteger(entry.topMm)).toBe(true);
        expect(Number.isInteger(entry.depthMm)).toBe(true);
        // Never invented: the merge takes the conservative envelope, so no published column is
        // deeper or taller than the members it came from.
        expect(entry.depthMm).toBe(depthMm);
        expect(entry.topMm).toBe(topMm);
      }
      expect(projected.reduce((sum, entry) => sum + entry.widthMm, 0)).toBe(
        widths.reduce((sum, width) => sum + width, 0),
      );
    },
  );
});

/** The seeded kitchen is fully occupied and publishes no openings at all, so the seeded half of the
 *  sweep below has to free one first: the hob column, whose three members are all deletable. The
 *  frozen map is the one the design loaded with, because ADR 0011 Gap D leaves a delete's extents
 *  alone — re-deriving from the remaining records is what makes the freed column vanish. */
function clearedHobColumn(): Loaded {
  const cleared = ["p2", "p13", "p19"].reduce((current: Design, id) => {
    const result = removePlacement({
      design: current,
      catalog: CATALOG,
      target: { kind: "placement", id },
      occurredAt: NOW,
    });
    if (!result.ok)
      throw new Error(`Could not remove ${id}: ${result.reason.code}`);
    return result.design;
  }, KITCHEN_L_DESIGN);
  const frozen = deriveColumns(
    derivePlacementRecords(KITCHEN_L_DESIGN, CATALOG),
    {},
    KITCHEN_L_DESIGN.room,
  );
  const records = derivePlacementRecords(cleared, CATALOG);
  // The store's `resolveColumns` in one line: merge over the published map, then re-answer
  // `hasFullHeightUnder` over the extents the merge just wrote.
  const columns = withCurrentFullHeightMembers(
    mergeAdjacentEmptyColumns(frozen, records),
    records,
  );
  return { columns, records, voids: recomputeVoids(records, columns) };
}

describe("a void's key and a void's coordinate are one fact, which is what the restatement rests on", () => {
  // **The adjudication of `vacated-void.test.ts`'s restated fixture.** "Ignores a slot in another
  // column" used to be built as a slot carrying `col: "A|2.00"` while standing at the vacated body's
  // own `x` of 1.3, and 5B4b moved it. Restating a test that a change made false is how a regression
  // hides, so the judgement it rests on is asserted here rather than argued: `recomputeVoids` derives
  // a void's `col` and its along-wall coordinate from the same column, so `deriveColumnKeyAt` over a
  // void's own coordinate is always its own `col`. The old fixture was therefore a record no
  // derivation produces, and the restated one — the slot standing where its key says it stands — is
  // the same criterion asked of a reachable state.
  it.each([
    ["a cleared column of the seeded kitchen", clearedHobColumn()],
    [
      "a merged chain",
      load(
        designWith(layOutFromLeftEdge([200, 200, 200, 200, 200, 200], 1000)),
      ),
    ],
    ["a declined run", load(designWith(layOutFromLeftEdge([51, 51], 999.5)))],
  ])(
    "keys every void it publishes at that void's own coordinate (%s)",
    (_name, loaded) => {
      expect(loaded.voids.length).toBeGreaterThan(0);
      for (const record of loaded.voids) {
        expect(
          deriveColumnKeyAt(
            record.wall,
            alongWallCoordinate(record.wall, record),
          ),
        ).toBe(record.col);
      }
    },
  );
});

describe("the §5.1 fallback, attacked", () => {
  function stoodAt(overrides: Partial<VacatedOpening> = {}): VacatedOpening {
    return { col: "A|1.30", y0: 0, wall: "A", alongM: 1.3, ...overrides };
  }

  function slot(overrides: Partial<VoidRecord>): VoidRecord {
    return {
      id: "slot",
      col: "A|1.30",
      wall: "A",
      x: 1.3,
      z: 0.29,
      ry: 0,
      w: 0.6,
      d: 0.58,
      y0: 0,
      h: 0.86,
      spanY0: 0,
      spanH: 2.6,
      ...overrides,
    };
  }

  // The key is the primary match and the geometry is the fallback, in that order — and the order is
  // load-bearing because columns overlap. `A|0.45`'s 900 mm corner base spans the ground under both
  // `A|0.30` and `A|0.75`, so a wider opening can contain the vacated centre while the vacated
  // column's own opening is sitting right there. Put the wider one first in the list: a fallback that
  // ran before the key match would take it.
  it("prefers the vacated column's own opening to a wider one that also contains it", () => {
    const wider = slot({ id: "wider", col: "A|0.45", x: 0.45, w: 0.9 });
    const own = slot({ id: "own", col: "A|0.30", x: 0.3, w: 0.6 });

    expect(
      findVacatedVoid([wider, own], stoodAt({ col: "A|0.30", alongM: 0.3 }))
        ?.id,
    ).toBe("own");
  });

  // Strict containment, at the boundary that decides it: an opening whose right edge lands exactly on
  // the vacated centre touches it and does not contain it. Relax either comparison to `<=` and the
  // opening beside the freed space claims the selection.
  it.each([
    ["its right edge on the vacated centre", { x: 1.0, w: 0.6 }],
    ["its left edge on the vacated centre", { x: 1.6, w: 0.6 }],
  ])("ignores an opening touching the vacated centre with %s", (_name, at) => {
    const touching = slot({ id: "touching", col: "A|9.99", ...at });

    expect(findVacatedVoid([touching], stoodAt())).toBeUndefined();
  });

  // The fallback is geometric, so the wall is part of the geometry: wall B's openings are measured on
  // `z` and a wall-A delete must never reach them, however the two coordinates happen to line up.
  it("ignores an opening on the other wall at the same along-wall coordinate", () => {
    const otherWall = slot({
      id: "other-wall",
      col: "B|1.30",
      wall: "B",
      x: 0.29,
      z: 1.3,
    });

    expect(findVacatedVoid([otherWall], stoodAt())).toBeUndefined();
  });

  // And the same fallback works on wall B, which is the branch `alongWallCoordinate` exists to keep
  // from being transposed: the coordinate read is `z`, and a slot whose `x` would contain the centre
  // is not a match.
  it("selects a containing opening on wall B by its own along-wall coordinate", () => {
    const onB = slot({
      id: "on-b",
      col: "B|1.60",
      wall: "B",
      x: 0.29,
      z: 1.6,
      w: 1.2,
    });

    expect(
      findVacatedVoid([onB], stoodAt({ col: "B|1.30", wall: "B", alongM: 1.3 }))
        ?.id,
    ).toBe("on-b");
  });
});

describe("the inversion guard, asserted as the document rather than as the map", () => {
  /** Two 1 mm-tall spaces whose floors are 20 mm apart: they agree on every condition within
   *  `LEVEL_SNAP_M`, and the conservative envelope — highest floor, lowest top — turns them inside
   *  out. */
  const SHORTER_THAN_THE_TOLERANCE_THEY_AGREE_WITHIN = [
    emptySpace(2000, 300, { y0Mm: 0, topMm: 1 }),
    emptySpace(2300, 300, { y0Mm: 20, topMm: 21 }),
  ];

  // The wave's own inversion test asserts the two keys first and the document second, so the second
  // half never runs once the first fails. This asserts **only** the document, because that is the
  // half that says why the guard is a security fix: an inverted interval overlaps nothing, so
  // neither `standsIn` nor the document's own overlap sweep can see it, and `EMPTY_COLUMN_INVERTED`
  // is the one refusal that can — which means a merge without the guard writes a design the customer
  // can no longer save, with nothing in session saying so.
  it("projects a document the validator accepts", () => {
    const design = designWith(SHORTER_THAN_THE_TOLERANCE_THEY_AGREE_WITHIN);
    const loaded = load(design);

    const saved = {
      ...design,
      emptyColumns: [...projectEmptyColumns(loaded.columns, loaded.records)],
    };

    expect(validateDesignForCatalog(saved, CATALOG)).toEqual([]);
  });
});

describe("wall B merges on its own axis", () => {
  // `alongWallPosition`'s other branch, which the whole shipped merge route never reaches: every
  // merge fixture in this wave is on wall A, where `x` moves and `z` is the half-depth. Transposed,
  // the merged column steps off the wall and keys at its own depth.
  it("moves z and leaves x at the column's half-depth", () => {
    const design = designWith([
      emptySpace(2000, 300, { wall: "B" }),
      emptySpace(2300, 300, { wall: "B" }),
    ]);
    // This is about the axis transpose, not about wall length — the fixture room's own wall B
    // (`depthMm: 2400`) is shorter than the merged run's 2450 mm far edge, which would otherwise
    // clip the very column the test means to read back untouched.
    const loaded = load({ ...design, room: { ...design.room, depthMm: 4200 } });

    const merged = loaded.columns.get("B|2.15");
    expect(merged).toBeDefined();
    expect(merged?.z).toBeCloseTo(2.15, 6);
    // The off-wall coordinate is the column's own half-depth, carried across untouched.
    expect(merged?.x).toBeCloseTo((merged?.d ?? 0) / 2, 6);
    expect(merged?.w).toBeCloseTo(0.6, 6);
  });
});
