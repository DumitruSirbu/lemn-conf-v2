// M5B wave 5B4b — ADR 0046 part 2: adjacent empty columns merge, capped at 800 mm.
//
// Every fixture here goes in through the **load seam** (`deriveColumns` over a parsed document),
// because that is where ADR 0044 lets a merge input be built at all: no sequence of commands on the
// shipped kitchen produces two adjacent empty columns totalling 800 mm or less. The store's half —
// the merge running after a command, and the headline four-tap route — is
// `apps/web/tests/store/empty-columns-merge.test.ts`; the two seeded scenarios at the bottom of this
// file are the domain's own view of the same route.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { insertBody } from "../src/commands/insert-body.js";
import { removePlacement } from "../src/commands/remove-placement.js";
import { DesignSchema, type Design, type EmptyColumn } from "../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import { MAX_EMPTY_COLUMN_WIDTH_MM } from "../src/module-grid.js";
import { toExactMillimetres } from "../src/millimetres.js";
import { validateDesignForCatalog } from "../src/validate-design.js";
import {
  deriveColumns,
  derivePlacementRecords,
  mergeAdjacentEmptyColumns,
  splitOversizedEmptyColumns,
  projectEmptyColumns,
  recomputeVoids,
  withCurrentFullHeightMembers,
  type Column,
  type PlacementRecord,
  type VoidRecord,
} from "../src/void-engine.js";
import { createFakeProbe } from "./support/fake-probe.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const NOW = "2026-08-25T00:00:00.000Z";

/** The frozen facts a full-height empty column carries, so a fixture that varies one of them says
 *  which one it is varying. */
const FULL_HEIGHT_SPACE = { y0Mm: 0, topMm: 2600, depthMm: 580 } as const;

function emptySpace(
  alongMm: number,
  widthMm: number,
  overrides: Partial<EmptyColumn> = {},
): EmptyColumn {
  return {
    wall: "A",
    alongMm,
    widthMm,
    ...FULL_HEIGHT_SPACE,
    ...overrides,
  };
}

/** A parsed document carrying the given spaces and placements. Through `DesignSchema` on purpose:
 *  ADR 0044's schema is what makes a merge input constructible, and a fixture built as a raw object
 *  would not prove the document can hold it. */
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
  readonly design: Design;
  readonly columns: ReadonlyMap<string, Column>;
  readonly records: readonly PlacementRecord[];
  readonly voids: readonly VoidRecord[];
}

function load(design: Design): Loaded {
  const records = derivePlacementRecords(design, CATALOG);
  const columns = deriveColumns(records, { emptyColumns: design.emptyColumns });
  return { design, columns, records, voids: recomputeVoids(records, columns) };
}

interface ExtentMm {
  readonly centreMm: number;
  readonly widthMm: number;
}

/** A column's along-wall extent in the whole millimetres the document holds, so every assertion here
 *  is exact integer equality and 1e-16 m of drift is red rather than tolerated. */
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

function columnAt(loaded: Loaded, key: string): Column {
  const column = loaded.columns.get(key);
  if (!column) {
    throw new Error(
      `No column ${key}; have ${[...loaded.columns.keys()].join(", ")}`,
    );
  }
  return column;
}

/** The empty columns of the map, keyed and measured — one value that says both *which* columns
 *  survived and *where* they stand, because a widths-only assertion is green under a scan that runs
 *  the other way (criterion 3) and a keys-only one is green under a merge that forgets to vacate. */
function emptyExtentsOf(loaded: Loaded): Record<string, ExtentMm> {
  const occupied = new Set(loaded.records.map((record) => record.col));
  const extents: Record<string, ExtentMm> = {};
  for (const [key, column] of loaded.columns) {
    if (occupied.has(key)) continue;
    extents[key] = extentMmOf(column);
  }
  return extents;
}

describe("adjacent empty columns merge into one", () => {
  // Criterion 1. Both original keys **absent** is half the assertion: a merge that wrote the merged
  // extent and left the old keys behind passes every widths-only check and leaves a map whose
  // columns overlap, which `validateDesignForCatalog` refuses at the write seam.
  it("derives two abutting 300 mm spaces as one 600 mm column", () => {
    const loaded = load(
      designWith([emptySpace(2000, 300), emptySpace(2300, 300)]),
    );

    expect(emptyExtentsOf(loaded)).toEqual({
      "A|2.15": { centreMm: 2150, widthMm: 600 },
    });
  });

  // Criterion 2, the owner's own example: *"a 600 and a 400 stay separate and each takes its own
  // cabinet"*. Criterion 1 passes with the cap comparison deleted; this is the one that does not.
  it("leaves a 600 and a 400 as two columns, because 1000 exceeds the cap", () => {
    const loaded = load(
      designWith([emptySpace(2000, 600), emptySpace(2500, 400)]),
    );

    expect(emptyExtentsOf(loaded)).toEqual({
      "A|2.00": { centreMm: 2000, widthMm: 600 },
      "A|2.50": { centreMm: 2500, widthMm: 400 },
    });
  });

  // Criterion 3. Positions, not a width multiset: scanning right to left gives a 300 and a 600 with
  // the same two widths and the merged column on the wrong side of the run.
  it("merges the left pair of three 300s, leaving the right one where it stood", () => {
    const loaded = load(
      designWith([
        emptySpace(2000, 300),
        emptySpace(2300, 300),
        emptySpace(2600, 300),
      ]),
    );

    expect(emptyExtentsOf(loaded)).toEqual({
      "A|2.15": { centreMm: 2150, widthMm: 600 },
      "A|2.60": { centreMm: 2600, widthMm: 300 },
    });
  });

  // Criterion 4. ADR 0046 rule 1: the capped merge is order-dependent by construction, `columns` is
  // a `Map` iterating in insertion order, and a resize and a split both delete and re-add the keys
  // they move. So the answer must be the *same* answer for every order the customer's commands could
  // have produced — asserted over a shuffle, because one fixed order is green under a scan that
  // iterates the map directly.
  propertyTest.prop([
    fc.shuffledSubarray(
      [emptySpace(2000, 300), emptySpace(2400, 500), emptySpace(2800, 300)],
      { minLength: 3, maxLength: 3 },
    ),
  ])(
    "gives 300 + 500 + 300 one answer whatever order the map holds",
    (spaces) => {
      const loaded = load(designWith(spaces));

      expect(emptyExtentsOf(loaded)).toEqual({
        "A|2.25": { centreMm: 2250, widthMm: 800 },
        "A|2.80": { centreMm: 2800, widthMm: 300 },
      });
    },
  );
});

describe("only columns of the same row and the same depth merge", () => {
  // Criterion 5, asserted on the published voids rather than on a column count: §4 rule 1 is about
  // an opening appearing over ground that never had one, and the full-height column's own base
  // opening is what disappears the moment the two extents are folded together.
  it("keeps a wall-band column out of a full-height one, and both openings as they were", () => {
    const loaded = load(
      designWith([
        emptySpace(2000, 300, { y0Mm: 1500, topMm: 2200 }),
        emptySpace(2300, 300),
      ]),
    );

    expect(Object.keys(emptyExtentsOf(loaded)).sort()).toEqual([
      "A|2.00",
      "A|2.30",
    ]);
    expect(
      loaded.voids.some(
        (record) => record.col === "A|2.30" && record.y0 < 0.01,
      ),
    ).toBe(true);
    expect(
      loaded.voids.some((record) => record.col === "A|2.00" && record.y0 < 1.4),
    ).toBe(false);
  });

  // Criterion 6, the condition ADR 0046 rule 2 does not name and this wave adds. Under `max` the
  // merged column publishes an opening 580 mm deep where 330 mm of wall depth ever was; under `min`
  // the base half silently loses 250 mm. The published `d` is what a body is offered, so that is
  // what the assertion reads.
  it("keeps a wall-depth column out of a base-depth one, and both depths as they were", () => {
    const loaded = load(
      designWith([
        emptySpace(2000, 300, { depthMm: 330 }),
        emptySpace(2300, 300),
      ]),
    );

    expect(Object.keys(emptyExtentsOf(loaded)).sort()).toEqual([
      "A|2.00",
      "A|2.30",
    ]);
    expect(depthMmOfOpeningIn(loaded, "A|2.00")).toBe(330);
    expect(depthMmOfOpeningIn(loaded, "A|2.30")).toBe(580);
  });
});

function depthMmOfOpeningIn(loaded: Loaded, key: string): number {
  const opening = loaded.voids.find((record) => record.col === key);
  if (!opening) throw new Error(`No opening published in ${key}`);
  return Math.round(opening.d * 1000);
}

describe("a run may not merge across ground a body stands on", () => {
  /** An 800 mm base body seated across 1900–2700, the synthetic stand-in for the corner geometry:
   *  `A|0.45`'s 900 mm base spans 0–900 under both `A|0.30` and `A|0.75`, and on wall B `p9` spans
   *  330–900 under `p26`'s 580–900. */
  const SINK_ACROSS_THE_RUN = [
    {
      id: "p0",
      wall: "A",
      alongMm: 2300,
      y0Mm: 0,
      body: { buildId: "base-sink-800", widthMm: 800, heightMm: 820 },
    },
  ];

  // Criterion 7. Edges that touch are not enough, and the check is geometric rather than by column
  // membership — the same correction ADR 0011 applied to `hasFullHeightUnder` on 2026-08-26.
  it("declines a merge whose span encloses a placement", () => {
    const loaded = load(
      designWith(
        [emptySpace(1700, 300), emptySpace(2000, 300)],
        SINK_ACROSS_THE_RUN,
      ),
    );

    expect(Object.keys(emptyExtentsOf(loaded)).sort()).toEqual([
      "A|1.70",
      "A|2.00",
    ]);
  });

  // The other side of the same predicate, so the criterion above cannot pass by refusing everything:
  // the identical run, lifted into the wall band, clears the body's 820 mm top and merges.
  it("merges the identical run when the body stands below it", () => {
    const loaded = load(
      designWith(
        [
          emptySpace(1700, 300, { y0Mm: 1500 }),
          emptySpace(2000, 300, { y0Mm: 1500 }),
        ],
        SINK_ACROSS_THE_RUN,
      ),
    );

    expect(emptyExtentsOf(loaded)).toEqual({
      "A|1.85": { centreMm: 1850, widthMm: 600 },
    });
  });

  // The shipped kitchen's own corner, and the reason it is safe today is the **cap**, not the
  // geometry: `A|0.30` (600) and `A|0.75` (300) abut at 600 mm, agree on floor, `top` and `d`, and
  // sit over `p25`'s 900 mm corner base — but 900 exceeds the cap, so no scan reaches them. Written
  // down because a later change to the cap makes this the first case to re-measure.
  it("leaves the seeded corner's two wall columns separate when both are cleared", () => {
    const cleared = removeAll(KITCHEN_L_DESIGN, ["p8", "p15", "p10", "p16"]);
    const frozen = deriveColumns(
      derivePlacementRecords(KITCHEN_L_DESIGN, CATALOG),
    );
    const records = derivePlacementRecords(cleared, CATALOG);

    const merged = mergeAdjacentEmptyColumns(frozen, records);

    expect(merged.has("A|0.30")).toBe(true);
    expect(merged.has("A|0.75")).toBe(true);
  });
});

describe("a merged extent may never invert or under-merge", () => {
  // Security review, 2026-09-02. The envelope takes the highest floor and the lowest top, so members
  // shorter than the tolerance they agree within merge to a floor above their own top: floors 0 and
  // 20 mm with 1 mm of height agree on every condition and would publish `y0Mm: 20, topMm: 1`.
  // `standsIn` cannot catch it — an inverted interval overlaps nothing, which is the bypass 5B2a
  // added `EMPTY_COLUMN_INVERTED` for — and §4 would read an opening that runs backwards. Not
  // reachable through the UI; a crafted document reaches it, and a document is what the load seam
  // is handed.
  it("declines a run whose envelope would invert", () => {
    const design = designWith([
      emptySpace(2000, 300, { y0Mm: 0, topMm: 1 }),
      emptySpace(2300, 300, { y0Mm: 20, topMm: 21 }),
    ]);

    const loaded = load(design);

    expect(Object.keys(emptyExtentsOf(loaded)).sort()).toEqual([
      "A|2.00",
      "A|2.30",
    ]);
    expect(
      validateDesignForCatalog(
        {
          ...design,
          emptyColumns: [
            ...projectEmptyColumns(loaded.columns, loaded.records),
          ],
        },
        CATALOG,
      ),
    ).toEqual([]);
  });

  // Clean-code review, 2026-09-02: ADR 0046 rule 1 asks for the widest run that fits, and a scan
  // that abandoned its start index on a decline was greedy without being maximal. Four 200s with a
  // body standing across the right-hand pair: the four, the three and the right-hand runs all
  // decline, and the leftmost pair — which is legal — merged only once the block is retried a column
  // shorter.
  it("merges the widest sub-run its guards accept, not merely the widest one", () => {
    const loaded = load(
      designWith(
        [
          emptySpace(1900, 200),
          emptySpace(2100, 200),
          emptySpace(2300, 200),
          emptySpace(2500, 200),
        ],
        [
          {
            id: "p0",
            wall: "A",
            alongMm: 2600,
            y0Mm: 0,
            body: { buildId: "base-sink-800", widthMm: 800, heightMm: 820 },
          },
        ],
      ),
    );

    expect(emptyExtentsOf(loaded)).toEqual({
      "A|2.00": { centreMm: 2000, widthMm: 400 },
      "A|2.30": { centreMm: 2300, widthMm: 200 },
      "A|2.50": { centreMm: 2500, widthMm: 200 },
    });
  });
});

describe("nothing merges across a wall or a gap", () => {
  // Criterion 10, first half: two spaces whose along-wall extents abut, on different walls. Drop
  // `wall` from the grouping and they merge into a column standing in mid-air.
  it("keeps two abutting coordinates on different walls apart", () => {
    const loaded = load(
      designWith([emptySpace(2000, 300), emptySpace(2300, 300, { wall: "B" })]),
    );

    expect(Object.keys(emptyExtentsOf(loaded)).sort()).toEqual([
      "A|2.00",
      "B|2.30",
    ]);
  });

  // Criterion 10, second half: 10 mm of wall no column owns between them. A contiguity tolerance at
  // or above the gap publishes an opening over it.
  it("keeps two spaces 10 mm apart on one wall apart", () => {
    const loaded = load(
      designWith([emptySpace(2000, 300), emptySpace(2310, 300)]),
    );

    expect(Object.keys(emptyExtentsOf(loaded)).sort()).toEqual([
      "A|2.00",
      "A|2.31",
    ]);
  });
});

describe("the merge is a fixpoint and never leaves an unprojectable column", () => {
  // Criterion 9. Run on its own output over the two chains where greedy blocks abut — three 300s and
  // 300 + 500 + 300 — because a second pass that carried the previous block's total forward would
  // merge the 600 with the 300 beside it and only a chain shows that.
  it.each([
    [
      "three 300s",
      [emptySpace(2000, 300), emptySpace(2300, 300), emptySpace(2600, 300)],
    ],
    [
      "300 + 500 + 300",
      [emptySpace(2000, 300), emptySpace(2400, 500), emptySpace(2800, 300)],
    ],
  ])("returns its own output unchanged for %s", (_name, spaces) => {
    const loaded = load(designWith(spaces));

    const again = mergeAdjacentEmptyColumns(loaded.columns, loaded.records);

    expect(again).toBe(loaded.columns);
  });

  // Criterion 8. The generator **must** admit odd widths: with even ones only, the mean-of-centres
  // mutant, the separately-rounded key and a merge that threw instead of declining are all green.
  // An odd width reaches a document through an integer *centre*, which is what
  // `positiveMillimetreSchema` bounds — so the run is laid out from a half-millimetre edge, exactly
  // as the shipped 570 mm and 320 mm bodies leave one.
  propertyTest.prop([
    fc.boolean(),
    fc.array(fc.integer({ min: 25, max: 400 }), { minLength: 2, maxLength: 4 }),
  ])(
    "never publishes a column the document cannot carry, at any run of widths",
    (odd, halfWidths) => {
      // `2h − 1` on the odd arm rather than `2h + 1`, since ADR 0052: the widest entry a document
      // may carry is the ceiling, so the even arm reaches exactly 800 and the odd arm 799. A wider
      // one would fail the final assertion on `EMPTY_COLUMN_WIDER_THAN_CAP`, which is a different
      // rule than the fractional-centre one under test.
      const widths = halfWidths.map((half) => (odd ? 2 * half - 1 : 2 * half));
      const design = designWith(layOutFromLeftEdge(widths, odd ? 999.5 : 1000));
      const loaded = load(design);

      const projected = projectEmptyColumns(loaded.columns, loaded.records);
      expect(
        projected.every(
          (entry) =>
            Number.isInteger(entry.alongMm) && Number.isInteger(entry.widthMm),
        ),
      ).toBe(true);
      // Merging combines and never splits, so the wall a run owns is conserved exactly, whether the
      // scan merged the whole run, part of it, or declined it.
      expect(projected.reduce((sum, entry) => sum + entry.widthMm, 0)).toBe(
        widths.reduce((sum, width) => sum + width, 0),
      );
      expect(validateDesignForCatalog(design, CATALOG)).toEqual([]);
    },
  );
});

/** Abutting spaces from one edge, as the document holds them: each centre is the running edge plus
 *  half the width, and the caller's edge parity is what keeps every centre a whole millimetre. */
function layOutFromLeftEdge(
  widths: readonly number[],
  firstEdgeMm: number,
): EmptyColumn[] {
  const spaces: EmptyColumn[] = [];
  let edgeMm = firstEdgeMm;
  for (const widthMm of widths) {
    spaces.push(emptySpace(edgeMm + widthMm / 2, widthMm));
    edgeMm += widthMm;
  }
  return spaces;
}

describe("the seeded kitchen: ADR 0037's withdrawal scenario, and the route that reaches a merge", () => {
  /** ADR 0037's own scenario: the 800 mm sink column and the 600 mm dishwasher column beside it. */
  const SINK_COLUMN_MEMBERS = ["p0", "p11", "p17"];
  const DISHWASHER_COLUMN_MEMBERS = ["p1", "p12", "p18"];

  function clearBothColumns(): Loaded {
    const cleared = removeAll(KITCHEN_L_DESIGN, [
      ...SINK_COLUMN_MEMBERS,
      ...DISHWASHER_COLUMN_MEMBERS,
    ]);
    // ADR 0011 Gap D: a delete leaves the frozen extents alone, so the map is the one the design
    // loaded with and the records are the ones that are left.
    const frozen = deriveColumns(
      derivePlacementRecords(KITCHEN_L_DESIGN, CATALOG),
    );
    const records = derivePlacementRecords(cleared, CATALOG);
    const columns = mergeThenAnswer(frozen, records);
    return {
      design: cleared,
      columns,
      records,
      voids: recomputeVoids(records, columns),
    };
  }

  // Criterion 13, as an anti-invariant. 800 + 600 = 1400 exceeds the cap, so this wave's code does
  // nothing here — which is the whole point: remove the cap and the merge restores exactly the state
  // ADR 0037 was withdrawn over.
  it("leaves A|1.30 and A|2.00 as two columns, because 1400 exceeds the cap", () => {
    const cleared = clearBothColumns();

    expect(extentMmOf(columnAt(cleared, "A|1.30"))).toEqual({
      centreMm: 1300,
      widthMm: 800,
    });
    expect(extentMmOf(columnAt(cleared, "A|2.00"))).toEqual({
      centreMm: 2000,
      widthMm: 600,
    });
    expect(800 + 600).toBeGreaterThan(MAX_EMPTY_COLUMN_WIDTH_MM);
  });

  // Criterion 12's route, at the domain: a 600 mm dishwasher into the cleared 800 seats flush left
  // and splits off a **200 mm** remainder at 1500–1700 (5B4a), which abuts the cleared 600 at
  // 1700–2300 — and 200 + 600 is exactly the cap, so they become one 800 mm column that takes an
  // 800 mm body. The plan named a 400 mm insert into `A|2.00`; no catalogue row builds at 400, and
  // this is the same arithmetic through a body that exists.
  it("merges a split remainder with the column beside it, and the 800 takes a body", () => {
    const cleared = clearBothColumns();

    const filled = insertInto(cleared, "A|1.30", "base-dishwasher");

    expect(extentMmOf(columnAt(filled, "A|1.90"))).toEqual({
      centreMm: 1900,
      widthMm: 800,
    });
    expect(filled.columns.has("A|2.00")).toBe(false);
    const second = insertBody({
      design: filled.design,
      catalog: CATALOG,
      columns: filled.columns,
      target: { kind: "void", id: openingIn(filled, "A|1.90").id },
      buildId: "base-cabinet",
      probe: createFakeProbe({ catalog: CATALOG }),
      occurredAt: NOW,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.design.placements.at(-1)?.body.widthMm).toBe(800);
  });
});

/** One insert into the base opening of `key`, applied the way the store applies it: the design the
 *  command returned, the map it published, and the merge that runs over that map afterwards. */
function insertInto(loaded: Loaded, key: string, buildId: string): Loaded {
  const result = insertBody({
    design: loaded.design,
    catalog: CATALOG,
    columns: loaded.columns,
    target: { kind: "void", id: openingIn(loaded, key).id },
    buildId,
    probe: createFakeProbe({ catalog: CATALOG }),
    occurredAt: NOW,
  });
  if (!result.ok) {
    throw new Error(
      `Insert of ${buildId} into ${key} was refused: ${result.reason.code}`,
    );
  }
  const records = derivePlacementRecords(result.design, CATALOG);
  const columns = mergeThenAnswer(result.effect.columns, records);
  return {
    design: result.design,
    columns,
    records,
    voids: recomputeVoids(records, columns),
  };
}

/** The store's `resolveColumns` in one line: split what exceeds ADR 0052's ceiling and merge what
 *  fits under it, over whichever map is published, then re-answer `hasFullHeightUnder` over the
 *  extents the pair just wrote. */
function mergeThenAnswer(
  columns: ReadonlyMap<string, Column>,
  records: readonly PlacementRecord[],
): ReadonlyMap<string, Column> {
  return withCurrentFullHeightMembers(
    mergeAdjacentEmptyColumns(
      splitOversizedEmptyColumns(columns, records),
      records,
    ),
    records,
  );
}

function openingIn(loaded: Loaded, key: string): VoidRecord {
  const opening = loaded.voids.find(
    (record) => record.col === key && record.y0 < 0.01,
  );
  if (!opening) {
    throw new Error(
      `No base opening in ${key}; have ${loaded.voids
        .map((record) => `${record.col}@${record.y0.toFixed(2)}`)
        .join(", ")}`,
    );
  }
  return opening;
}

function removeAll(design: Design, ids: readonly string[]): Design {
  return ids.reduce((current: Design, id) => {
    const result = removePlacement({
      design: current,
      catalog: CATALOG,
      target: { kind: "placement", id },
      occurredAt: NOW,
    });
    if (!result.ok)
      throw new Error(`Could not remove ${id}: ${result.reason.code}`);
    return result.design;
  }, design);
}
