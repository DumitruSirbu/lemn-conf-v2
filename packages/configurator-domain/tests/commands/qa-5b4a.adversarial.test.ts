// Adversarial QA for M5B wave 5B4a — ADR 0046 part 1, an insert splits the column it does not fill.
//
// Three things this file exists to pin, none of which the wave's own suite reaches:
//
// 1. **The narrowing.** `dividesWholeColumn` makes a full-height opening a precondition of the
//    split. The failure it dodges is real and reproduced here; what it silently refuses is
//    enumerated here too, including ADR 0046's own named scenario on the shipped kitchen.
// 2. **The guards.** `refuseFractionalHalves` is not reachable through the product and its removal
//    kills nothing in the wave's suite, so it is pinned directly and its unreachability is asserted
//    rather than assumed — the shape 5B2's criterion 7 used for its cap.
// 3. **The crash path.** The guarded expression is millimetres under `Number.isInteger`; the
//    projected one is metres under `toExactMillimetres`' 1e-3 tolerance. They are not the same
//    expression, and this file proves the guard is the *stricter* of the two rather than an
//    accidental agreement — which is the coincidence the 5B2b blocker turned on.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { insertBody } from "../../src/commands/insert-body.js";
import { splitColumn } from "../../src/commands/split-column.js";
import { removePlacement } from "../../src/commands/remove-placement.js";
import {
  DesignSchema,
  type Design,
  type EmptyColumn,
} from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { toExactMillimetres, toMetres } from "../../src/millimetres.js";
import { offersFor } from "../../src/queries/offers.js";
import { validateDesignForCatalog } from "../../src/validate-design.js";
import {
  deriveColumnKeyAt,
  deriveColumns,
  derivePlacementRecords,
  projectEmptyColumns,
  recomputeVoids,
  type Column,
  type PlacementRecord,
  type VoidRecord,
} from "../../src/void-engine.js";
import { createFakeProbe } from "../support/fake-probe.js";
import { refused, verdictOf } from "../support/offers.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const NOW = "2026-08-25T00:00:00.000Z";
const PROBE = createFakeProbe({ catalog: CATALOG });

/** The seeded hob column: 600 mm at 2.60 m, three members stacked to a `top` of 2.6 m. */
const HOB_COLUMN_KEY = "A|2.60";
const HOB_BASE_MEMBER = "p2";
const HOB_COLUMN_MEMBERS = ["p2", "p13", "p19"];

/** The seeded kitchen's only 700 mm column: the fridge below and the over-fridge cupboard above.
 *  It is the column ADR 0046 describes by name when it says `base-dishwasher` has always put a
 *  600 in a 700. */
const FRIDGE_COLUMN_KEY = "B|2.45";
const FRIDGE_MEMBER = "p7";

interface Span {
  readonly design: Design;
  readonly columns: ReadonlyMap<string, Column>;
  readonly records: readonly PlacementRecord[];
  readonly voids: readonly VoidRecord[];
}

function spanOf(design: Design, columns: ReadonlyMap<string, Column>): Span {
  const records = derivePlacementRecords(design, CATALOG);
  return { design, columns, records, voids: recomputeVoids(records, columns) };
}

/** A design carrying one empty column, parsed through `DesignSchema` — 5B2a's load path, which is
 *  what makes an arbitrary-width empty column constructible at all. */
function designWithEmptySpan(widthMm: number, alongMm = 2600): Design {
  const emptyColumn: EmptyColumn = {
    wall: "A",
    alongMm,
    widthMm,
    y0Mm: 0,
    topMm: 2600,
    depthMm: 580,
  };
  return DesignSchema.parse({
    room: { shape: "L", widthMm: 4200, depthMm: 2400, heightMm: 2600 },
    presetId: null,
    placements: [
      {
        id: "p0",
        wall: "A",
        alongMm: 400,
        y0Mm: 0,
        body: { buildId: "base-sink-800", widthMm: 800, heightMm: 820 },
      },
    ],
    emptyColumns: [emptyColumn],
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function loadSpan(design: Design): Span {
  const records = derivePlacementRecords(design, CATALOG);
  return spanOf(design, deriveColumns(records, design.emptyColumns));
}

/** The seeded kitchen with named placements removed, and the frozen extents the deletes left
 *  behind — ADR 0011 Gap D: a delete changes the design and never the extents. */
function seededKitchenWithout(ids: readonly string[]): Span {
  const design = ids.reduce((carried: Design, id) => {
    const result = removePlacement({
      design: carried,
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
  );
  return spanOf(design, frozen);
}

function openingIn(span: Span, col: string, y0M = 0): VoidRecord {
  const found = span.voids.find(
    (record) => record.col === col && Math.abs(record.y0 - y0M) < 0.01,
  );
  if (!found) {
    throw new Error(
      `No opening in ${col} at y0=${String(y0M)}; have ${span.voids
        .map((record) => `${record.col}@${record.y0.toFixed(2)}`)
        .join(", ")}`,
    );
  }
  return found;
}

function insertInto(
  span: Span,
  target: { kind: "void"; id: string } | { kind: "placement"; id: string },
  buildId: string,
) {
  return insertBody({
    design: span.design,
    catalog: CATALOG,
    columns: span.columns,
    target,
    buildId,
    probe: PROBE,
    occurredAt: NOW,
  });
}

function columnAt(span: Span, key: string): Column {
  const column = span.columns.get(key);
  if (!column) {
    throw new Error(
      `No column ${key}; have ${[...span.columns.keys()].join(", ")}`,
    );
  }
  return column;
}

function centreMmOf(column: Column): number {
  const centre = toExactMillimetres(column.wall === "A" ? column.x : column.z);
  if (centre === undefined)
    throw new Error(`${column.key} is not on a whole millimetre`);
  return centre;
}

function widthMmOf(column: Column): number {
  const width = toExactMillimetres(column.w);
  if (width === undefined)
    throw new Error(`${column.key} has no whole-millimetre width`);
  return width;
}

// ---------------------------------------------------------------------------------------------
// 1. The narrowing: what `dividesWholeColumn` buys, and what it costs.
// ---------------------------------------------------------------------------------------------

describe("the failure the whole-height precondition avoids is real", () => {
  // The developer's stated reason, reproduced rather than accepted. Split a column that still holds
  // members at other levels and those members go on deriving the key the split just deleted: a
  // phantom column (ADR 0011 Gap D), and two `EMPTY_COLUMN_OVERLAPS_PLACEMENT` findings that make
  // the document unsaveable at the write seam.
  it("splitting a column that still holds a member makes the document unsaveable", () => {
    const span = seededKitchenWithout([HOB_BASE_MEMBER]);
    const inserted = insertInto(
      span,
      { kind: "void", id: openingIn(span, HOB_COLUMN_KEY).id },
      "base-bottle-cargo",
    );
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;

    const records = derivePlacementRecords(inserted.design, CATALOG);
    // The split ADR 0046's unconditional wording implies, applied by hand: 300 flush left at 2450,
    // 300 left over at 2750.
    const forced = splitColumn({
      columns: span.columns,
      column: columnAt(span, HOB_COLUMN_KEY),
      records,
      centreMm: 2450,
      widthMm: 300,
      remainderMm: 300,
    });
    expect(forced.ok).toBe(true);
    if (!forced.ok) return;

    // The hood and the top box still derive `A|2.60`, a key the map no longer holds.
    const stranded = records.filter((record) =>
      ["p13", "p19"].includes(record.id),
    );
    expect(stranded.map((record) => record.col)).toEqual([
      HOB_COLUMN_KEY,
      HOB_COLUMN_KEY,
    ]);
    expect(forced.value.columns.has(HOB_COLUMN_KEY)).toBe(false);

    const saved: Design = {
      ...inserted.design,
      emptyColumns: [...projectEmptyColumns(forced.value.columns, records)],
    };
    expect(
      validateDesignForCatalog(saved, CATALOG).map((issue) => issue.code),
    ).toEqual([
      "EMPTY_COLUMN_OVERLAPS_PLACEMENT",
      "EMPTY_COLUMN_OVERLAPS_PLACEMENT",
    ]);
  });

  // And the precondition is not merely sufficient but exactly equivalent to "the column is empty":
  // §4 subtracts height for every member, so a column holding one publishes no opening that reaches
  // both its floor and its `top`. There is no case the geometry admits and the record set refuses.
  it("admits the split for exactly the columns that hold no member", () => {
    const span = seededKitchenWithout(HOB_COLUMN_MEMBERS);
    const opening = openingIn(span, HOB_COLUMN_KEY);
    const column = columnAt(span, HOB_COLUMN_KEY);

    expect(opening.spanY0).toBeCloseTo(
      Math.min(...column.regions.map(([start]) => start)),
      6,
    );
    expect(opening.spanY0 + opening.spanH).toBeCloseTo(column.top, 6);
    expect(
      span.records.filter((record) => record.col === HOB_COLUMN_KEY),
    ).toEqual([]);
  });
});

describe("what the whole-height precondition silently refuses", () => {
  // **Refused-but-legal, case 1 — two taps, not four.** Delete the hob and put a 300 mm bottle
  // cargo in its place. ADR 0046 says the column becomes two; it does not. The body is centred at
  // the column's own 2600, the map is untouched, and 300 mm of wall is gone with no refusal, no
  // rejection code and nothing on screen to say so. This is the very defect the four-tap case
  // exists to cure, reached in *fewer* taps and left uncured.
  it("centres a 300 mm body in a 600 mm column that still holds a hood, and strands 300 mm", () => {
    const span = seededKitchenWithout([HOB_BASE_MEMBER]);

    const result = insertInto(
      span,
      { kind: "void", id: openingIn(span, HOB_COLUMN_KEY).id },
      "base-bottle-cargo",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const placed = result.design.placements.find(
      (entry) => entry.id === result.effect.placementId,
    );
    expect(placed?.alongMm).toBe(2600);
    expect(result.effect.columns.has(HOB_COLUMN_KEY)).toBe(true);
    expect(
      widthMmOf(
        columnAt(spanOf(result.design, result.effect.columns), HOB_COLUMN_KEY),
      ),
    ).toBe(600);

    // Silent, not clean: an accepted command with no rejection anywhere on it.
    const after = spanOf(result.design, result.effect.columns);
    expect(
      after.voids.filter(
        (record) => record.col.startsWith("A|2.") && record.y0 < 0.01,
      ),
    ).toEqual([]);
  });

  // **Refused-but-legal, case 2 — ADR 0046's own named cost, on the shipped kitchen.** The record
  // says *"after this record `base-dishwasher` no longer centres in a 700 mm opening"*, and
  // criterion 12 asserts it. The seeded kitchen's only 700 mm column is the fridge column, which
  // carries the over-fridge cupboard above — so it fails the whole-height precondition and the
  // dishwasher still centres, by both routes a customer has. Criterion 12's own test asserts the
  // new rule on a synthetic empty column, where the precondition happens to hold.
  it("still centres base-dishwasher in the seeded kitchen's 700 mm fridge column", () => {
    const swapped = insertInto(
      spanOf(
        KITCHEN_L_DESIGN,
        deriveColumns(derivePlacementRecords(KITCHEN_L_DESIGN, CATALOG)),
      ),
      { kind: "placement", id: FRIDGE_MEMBER },
      "base-dishwasher",
    );
    expect(swapped.ok).toBe(true);
    if (!swapped.ok) return;
    expect(
      swapped.design.placements.find(
        (entry) => entry.id === swapped.effect.placementId,
      )?.alongMm,
    ).toBe(2450);
    expect(swapped.effect.columns.has(FRIDGE_COLUMN_KEY)).toBe(true);

    const emptied = seededKitchenWithout([FRIDGE_MEMBER]);
    const refilled = insertInto(
      emptied,
      { kind: "void", id: openingIn(emptied, FRIDGE_COLUMN_KEY).id },
      "base-dishwasher",
    );
    expect(refilled.ok).toBe(true);
    if (!refilled.ok) return;
    expect(
      refilled.design.placements.find(
        (entry) => entry.id === refilled.effect.placementId,
      )?.alongMm,
    ).toBe(2450);
    expect(refilled.effect.columns.has(FRIDGE_COLUMN_KEY)).toBe(true);
  });

  // **Refused-but-legal, case 3 — the whole seeded base row.** Every base cabinet on wall A stands
  // in a column with wall units above it, so clearing one and refilling it narrower never splits.
  // The split is reachable on the shipped kitchen only by emptying a column at every level.
  it("leaves no column on the seeded kitchen's base row splittable by one delete", () => {
    // `p25`, the corner base, is `NOT_DELETABLE` (ADR 0025) and so cannot reach this path at all.
    const baseMembers = ["p0", "p1", "p2", "p4"];
    const splittable = baseMembers.filter((id) => {
      const span = seededKitchenWithout([id]);
      const record = derivePlacementRecords(KITCHEN_L_DESIGN, CATALOG).find(
        (entry) => entry.id === id,
      );
      if (!record) return false;
      const opening = span.voids.find(
        (candidate) => candidate.col === record.col && candidate.y0 < 0.01,
      );
      if (!opening) return false;
      const result = insertInto(
        span,
        { kind: "void", id: opening.id },
        "base-bottle-cargo",
      );
      return result.ok && !result.effect.columns.has(record.col);
    });

    expect(splittable).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// 2. The crash path: are the guarded and the projected expression the same expression?
// ---------------------------------------------------------------------------------------------

describe("the whole-millimetre guard against the projection it protects", () => {
  // The 5B2b blocker was two expressions that agreed by coincidence. These two do not agree by
  // coincidence: the guard tests `Number.isInteger` on the millimetre value, the projection tests
  // `toExactMillimetres` on `value / 1000`, and the second accepts a 1e-3 mm band the first
  // refuses. The guard is therefore *strictly stronger*, which is the safe direction — anything it
  // admits, the projection admits.
  propertyTest.prop([fc.integer({ min: 1, max: 8000 })])(
    "round-trips every whole millimetre a split can write, so the guard implies the projection",
    (valueMm) => {
      expect(toExactMillimetres(toMetres(valueMm))).toBe(valueMm);
    },
  );

  // The other direction, stated so a later widening of the guard to `toExactMillimetres` is a
  // deliberate change rather than a silent one: the projection admits values the guard refuses.
  it("admits a value the guard refuses, so the two are not interchangeable", () => {
    expect(Number.isInteger(2450.0005)).toBe(false);
    expect(toExactMillimetres(toMetres(2450.0005))).toBe(2450);
  });
});

describe("the split's own fractional guard", () => {
  // **`refuseFractionalHalves` kills no test in the wave's suite** — deleting it outright leaves
  // 13/13 domain and 3/3 store green — because the only fractional centre the product can reach is
  // the occupied half's, and `resolvePlacementMillimetres` refuses that one first. This pins the
  // guard directly so its removal is red, and the next two tests assert the unreachability that
  // makes the wave's suite blind to it.
  it("refuses a fractional remainder centre by name, on the field it lands in", () => {
    const span = loadSpan(designWithEmptySpan(700));
    const column = columnAt(span, HOB_COLUMN_KEY);

    // A column centred on a half millimetre: the shape `refuseFractionalCentres` carries the
    // measurement for on the resize path, handed to the split path where that guard does not run.
    const result = splitColumn({
      columns: span.columns,
      column,
      records: span.records,
      centreMm: 2525,
      widthMm: 600,
      remainderMm: 149,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.detail).toEqual({
      code: "NON_INTEGER_MILLIMETRES",
      params: { field: "centreMm", valueMm: 2899.5 },
    });
  });

  it("refuses a fractional occupied centre too, so the split is safe for its own callers", () => {
    const span = loadSpan(designWithEmptySpan(700));
    const result = splitColumn({
      columns: span.columns,
      column: columnAt(span, HOB_COLUMN_KEY),
      records: span.records,
      centreMm: 2525.5,
      widthMm: 600,
      remainderMm: 100,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.detail).toMatchObject({
      code: "NON_INTEGER_MILLIMETRES",
      params: { field: "centreMm", valueMm: 2525.5 },
    });
  });

  // The unreachability, asserted rather than assumed — 5B2's criterion 7 shape. Over every column
  // width a document can carry in this span, an insert is accepted exactly when the column's width
  // leaves an even remainder, every refusal is `resolvePlacementMillimetres`' `alongMm` one, and
  // the split's own guard never fires. A false refusal at an even width — float noise in
  // `seatableMillimetres`' raw-product fallback — would be red here and is invisible to the wave's
  // own sweep, which returns early on any refusal.
  propertyTest.prop([fc.integer({ min: 600, max: 900 })], { numRuns: 301 })(
    "refuses exactly the odd-width columns, always at alongMm and never inside the split",
    (columnWidthMm) => {
      const span = loadSpan(designWithEmptySpan(columnWidthMm));
      const result = insertInto(
        span,
        { kind: "void", id: openingIn(span, HOB_COLUMN_KEY).id },
        "base-dishwasher",
      );

      if (columnWidthMm % 2 === 0) {
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const after = spanOf(result.design, result.effect.columns);
        expect(() =>
          projectEmptyColumns(after.columns, after.records),
        ).not.toThrow();
        return;
      }
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.code).toBe("NON_INTEGER_MILLIMETRES");
      expect(result.reason.params).toMatchObject({ field: "alongMm" });
    },
  );
});

describe("what a split carries across untouched", () => {
  // 5B2b proved `top`, `d`, `ry` and the region floor safe on the resize path for a structural
  // reason — `moveFrozenColumns` passes them through. The split has to earn the same conclusion on
  // its own, because it writes two columns from one and could take either half's from the body.
  it("moves only the width and the along-wall centre, on both halves", () => {
    const before = loadSpan(designWithEmptySpan(1400));
    const original = columnAt(before, HOB_COLUMN_KEY);

    const after = (() => {
      const result = insertInto(
        before,
        { kind: "void", id: openingIn(before, HOB_COLUMN_KEY).id },
        "base-dishwasher",
      );
      if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
      return spanOf(result.design, result.effect.columns);
    })();

    for (const key of ["A|2.20", "A|2.90"]) {
      const half = columnAt(after, key);
      expect(half.d).toBe(original.d);
      expect(half.ry).toBe(original.ry);
      expect(half.top).toBe(original.top);
      expect(half.regions).toEqual(original.regions);
      expect(half.wall).toBe(original.wall);
      // Wall A's along-wall coordinate is `x`, so `z` — the column's own half depth, measured from
      // the wall — is the one that must not move.
      expect(half.z).toBe(original.z);
      expect(half.key).toBe(
        deriveColumnKeyAt(half.wall, toMetres(centreMmOf(half))),
      );
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 3. The ADR 0037 gate, pushed past the wave's own assertions.
// ---------------------------------------------------------------------------------------------

describe("the ADR 0037 gate, asserted as commands succeeding rather than voids existing", () => {
  // Criterion 4 (a) asserts one further insert. A void that no command can address is the state the
  // withdrawal was about, so this drives the 1400 mm span to exhaustion: 600 in, 600 in, and the
  // 200 mm that is left is a column that publishes an opening and offers the catalogue with
  // reasons — never a strip that has quietly stopped existing.
  it("spends a 1400 mm span down to a 200 mm remainder, one addressable column at every step", () => {
    let span = loadSpan(designWithEmptySpan(1400));
    const widths: number[] = [];

    for (const step of [0, 1]) {
      const key = step === 0 ? "A|2.60" : "A|2.90";
      const result = insertInto(
        span,
        { kind: "void", id: openingIn(span, key).id },
        "base-dishwasher",
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      span = spanOf(result.design, result.effect.columns);
      const saved: Design = {
        ...span.design,
        emptyColumns: [...projectEmptyColumns(span.columns, span.records)],
      };
      expect(validateDesignForCatalog(saved, CATALOG)).toEqual([]);
      widths.push(
        ...(saved.emptyColumns ?? [])
          .filter((entry) => entry.alongMm > 1000)
          .map((entry) => entry.widthMm),
      );
    }

    expect(widths).toEqual([800, 200]);
    const strip = openingIn(span, "A|3.20");
    const offers = offersFor({
      catalog: CATALOG,
      records: span.records,
      voids: span.voids,
      columns: span.columns,
      target: { kind: "void", id: strip.id },
    });
    expect(offers.length).toBeGreaterThan(0);
    // ADR 0032: the rows too wide for 200 mm are shown with their reason rather than removed.
    expect(refused(offers).length).toBeGreaterThan(0);
    expect(verdictOf(offers, "base-dishwasher")).toMatchObject({
      status: "refused",
    });
  });

  // The four-tap case, driven the same way: after the bottle cargo and its 300 mm neighbour, the
  // cleared hob column holds two bodies and no wall is unaccounted for.
  it("fills the cleared hob column twice over, with the span conserved", () => {
    let span = seededKitchenWithout(HOB_COLUMN_MEMBERS);
    const original = { centreMm: 2600, widthMm: 600 };

    for (const key of [HOB_COLUMN_KEY, "A|2.75"]) {
      const result = insertInto(
        span,
        { kind: "void", id: openingIn(span, key).id },
        "base-bottle-cargo",
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      span = spanOf(result.design, result.effect.columns);
    }

    const across = [...span.columns.values()].filter((column) => {
      const centre = centreMmOf(column);
      return (
        column.wall === "A" &&
        centre > original.centreMm - original.widthMm / 2 &&
        centre < original.centreMm + original.widthMm / 2
      );
    });
    expect(across.map((column) => column.key).sort()).toEqual([
      "A|2.45",
      "A|2.75",
    ]);
    expect(across.reduce((sum, column) => sum + widthMmOf(column), 0)).toBe(
      600,
    );
    expect(
      span.records.filter((record) =>
        ["A|2.45", "A|2.75"].includes(record.col),
      ),
    ).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------------------------
// 4. Q5's fourth widening — legal under ADR 0037's surviving "ok to have empty space left".
// ---------------------------------------------------------------------------------------------

describe("a remainder wider than 800 mm is a legal outcome, not a regression", () => {
  // In QA's brief so it is not filed: insert a 300 into the 1400 mm fixture and 1100 mm remains,
  // where every `widthFlex: 'fit'` body is refused against §7's 800 mm ceiling. ADR 0046's own
  // residual, arriving by a new route.
  it("leaves an 1100 mm column that refuses every fit body and still addresses one", () => {
    const start = loadSpan(designWithEmptySpan(1400));
    const result = insertInto(
      start,
      { kind: "void", id: openingIn(start, HOB_COLUMN_KEY).id },
      "base-bottle-cargo",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const span = spanOf(result.design, result.effect.columns);
    expect(widthMmOf(columnAt(span, "A|2.75"))).toBe(1100);

    const opening = openingIn(span, "A|2.75");
    const offers = offersFor({
      catalog: CATALOG,
      records: span.records,
      voids: span.voids,
      columns: span.columns,
      target: { kind: "void", id: opening.id },
    });
    // Nothing in the catalogue builds to 1100 — §7's ceiling is 800 — so every row that *would*
    // have filled the span is refused, and no accepted offer claims more than 800 mm.
    expect(refused(offers).length).toBeGreaterThan(0);
    const built = offers
      .map((offer) => offer.verdict)
      .filter((verdict) => verdict.status === "offered")
      .map((verdict) => verdict.widthMm);
    expect(built.every((widthMm) => widthMm <= 800)).toBe(true);
    // Still addressable: a discrete body goes in and splits it again.
    const second = insertInto(
      span,
      { kind: "void", id: opening.id },
      "base-dishwasher",
    );
    expect(second.ok).toBe(true);
  });
});
