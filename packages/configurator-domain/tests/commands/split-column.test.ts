// M5B wave 5B4a — ADR 0046 part 1: an insert splits the column it does not fill.
//
// The gate is ADR 0037's own withdrawal scenario and the four-tap bottle-cargo case that predates
// every merge, and both live here rather than at the store: the mechanism is `insertBody` plus
// `recomputeVoids` over a column map, and neither needs zustand. What *is* at the store is the
// effect's map being used at all, which is `apps/web/tests/store/insert-splits-column.test.ts`.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { insertBody } from "../../src/commands/insert-body.js";
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
import { toExactMillimetres } from "../../src/millimetres.js";
import { offersFor } from "../../src/queries/offers.js";
import { validateDesignForCatalog } from "../../src/validate-design.js";
import {
  deriveColumnKeyAt,
  deriveColumns,
  derivePlacementRecords,
  projectEmptyColumns,
  splitOversizedEmptyColumns,
  withCurrentFullHeightMembers,
  recomputeVoids,
  type Column,
  type PlacementRecord,
  type VoidRecord,
} from "../../src/void-engine.js";
import { createFakeProbe } from "../support/fake-probe.js";
import { refused, verdictOf } from "../support/offers.js";
import { cabinetDepthMmOf } from "../../src/design.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const NOW = "2026-08-25T00:00:00.000Z";

/** The base level's floor, which is where every span under test is entered. */
const BASE_LEVEL_Y0_M = 0;

/** The seeded hob column and its three members — the four-tap case's own fixture. */
const HOB_COLUMN_KEY = "A|2.60";
const HOB_COLUMN_MEMBERS = ["p2", "p13", "p19"];

/** A design carrying one empty column of the width the test is about, plus one body far enough
 *  along the wall to play no part in it. Parsed through `DesignSchema` on purpose: 5B2a's schema is
 *  what makes an oversized empty column constructible from a document at all, and criterion 4 (a) is
 *  ADR 0037's withdrawal scenario read through that load path. */
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

interface Span {
  readonly design: Design;
  readonly columns: ReadonlyMap<string, Column>;
  readonly records: readonly PlacementRecord[];
  readonly voids: readonly VoidRecord[];
}

function loadSpan(design: Design): Span {
  const records = derivePlacementRecords(design, CATALOG);
  const columns = deriveColumns(
    records,
    { emptyColumns: design.emptyColumns },
    design.room,
  );
  return { design, columns, records, voids: recomputeVoids(records, columns) };
}

/** The store's contract in one function: the design **and** the map the command published, because
 *  under ADR 0046 an insert is a column-map-writing command. */
function advanceWith(
  design: Design,
  columns: ReadonlyMap<string, Column>,
): Span {
  const records = derivePlacementRecords(design, CATALOG);
  return { design, columns, records, voids: recomputeVoids(records, columns) };
}

function openingIn(span: Span, col: string, y0M = BASE_LEVEL_Y0_M): VoidRecord {
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

function insertInto(span: Span, opening: VoidRecord, buildId: string) {
  return insertBody({
    design: span.design,
    catalog: CATALOG,
    columns: span.columns,
    voids: span.voids,
    target: { kind: "void", id: opening.id },
    buildId,
    probe: createFakeProbe({ catalog: CATALOG }),
    occurredAt: NOW,
  });
}

/** Inserts and applies in one step, failing loudly on a refusal — a fixture step that silently did
 *  nothing is how a criterion passes for the wrong reason. */
function insertAndAdvance(
  span: Span,
  col: string,
  buildId: string,
  y0M = BASE_LEVEL_Y0_M,
): Span {
  const result = insertInto(span, openingIn(span, col, y0M), buildId);
  if (!result.ok) {
    throw new Error(
      `Insert of ${buildId} into ${col} was refused: ${result.reason.code}`,
    );
  }
  return advanceWith(result.design, result.effect.columns);
}

interface ExtentMm {
  readonly centreMm: number;
  readonly widthMm: number;
}

/** A column's along-wall extent in the whole millimetres the document holds, so a conservation
 *  assertion is exact integer equality and 1e-16 of metre drift is red rather than tolerated. */
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

function leftEdgeMm(extent: ExtentMm): number {
  return extent.centreMm - extent.widthMm / 2;
}

function rightEdgeMm(extent: ExtentMm): number {
  return extent.centreMm + extent.widthMm / 2;
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

/** The keys the split touched, as the map's own view of one span: every column whose centre lies
 *  inside the original extent. */
function keysAcross(span: Span, original: ExtentMm): string[] {
  return [...span.columns.values()]
    .filter((column) => {
      const centreMm = extentMmOf(column).centreMm;
      return (
        centreMm > leftEdgeMm(original) && centreMm < rightEdgeMm(original)
      );
    })
    .map((column) => column.key)
    .sort();
}

describe("an insert splits the column it does not fill", () => {
  // Criterion 1, as millimetre numbers rather than as counts: a 600 mm dishwasher into a 700 mm
  // column yields the body flush left at C − 50 and a 100 mm remainder at C + 300. The plausible
  // wrong remainder formula — `C + (W − w) / 2` — gives C + 50 here, and a presence-only assertion
  // would survive it. 700/600 rather than 600/400 because no catalogue row is buildable at 400, and
  // a body at exactly half its column makes both formulas agree, which is vacuous.
  it("yields exactly two columns, at the millimetres the left-edge rule implies", () => {
    const start = loadSpan(designWithEmptySpan(700));
    const original = extentMmOf(columnAt(start, "A|2.60"));

    const after = insertAndAdvance(start, "A|2.60", "base-dishwasher");

    expect(keysAcross(after, original)).toEqual(["A|2.55", "A|2.90"]);
    expect(extentMmOf(columnAt(after, "A|2.55"))).toEqual({
      centreMm: 2550,
      widthMm: 600,
    });
    expect(extentMmOf(columnAt(after, "A|2.90"))).toEqual({
      centreMm: 2900,
      widthMm: 100,
    });
  });

  // Criterion 2. The three edges that must hold, in integers: the two outer ones are the original's
  // and the inner one is shared, so the run total is conserved and neither an overlap nor a gap is
  // representable.
  it("conserves the span exactly, edge by edge", () => {
    const start = loadSpan(designWithEmptySpan(1400));
    const original = extentMmOf(columnAt(start, "A|2.60"));

    const after = insertAndAdvance(start, "A|2.60", "base-dishwasher");
    const occupied = extentMmOf(columnAt(after, "A|2.20"));
    const remainder = extentMmOf(columnAt(after, "A|2.90"));

    expect(leftEdgeMm(occupied)).toBe(leftEdgeMm(original));
    expect(rightEdgeMm(remainder)).toBe(rightEdgeMm(original));
    expect(rightEdgeMm(occupied)).toBe(leftEdgeMm(remainder));
    expect(occupied.widthMm + remainder.widthMm).toBe(original.widthMm);
  });

  // Criterion 3, first half: the remainder is the original column with a narrower width, so every
  // level the original had free is still free in it. Giving the remainder the body's own `top` or
  // regions closes the 1780 mm above a cleared 2600 mm column, which "a column exists" survives.
  it("publishes the remainder's openings at every level the original had free", () => {
    const start = loadSpan(designWithEmptySpan(700));
    const before = start.voids
      .filter((record) => record.col === "A|2.60")
      .map((record) => ({
        y0: record.y0,
        h: record.h,
        spanY0: record.spanY0,
        spanH: record.spanH,
      }));

    const after = insertAndAdvance(start, "A|2.60", "base-dishwasher");
    const remainder = after.voids
      .filter((record) => record.col === "A|2.90")
      .map((record) => ({
        y0: record.y0,
        h: record.h,
        spanY0: record.spanY0,
        spanH: record.spanH,
      }));

    expect(before.length).toBeGreaterThan(1);
    expect(remainder).toEqual(before);
  });

  // Criterion 3, second half, at a 50 mm remainder — the width a 200 mm example never reaches.
  // ADR 0043 makes a gap of any width legal and ADR 0032 says a row that does not fit is shown
  // disabled with its reason, so the tidy-up that drops a remainder under the narrowest catalogue
  // width is forbidden: the strip must be a column, publish an opening, and refuse with a sentence.
  it("keeps a 50 mm remainder as a column that publishes an opening and refuses with a reason", () => {
    const start = loadSpan(designWithEmptySpan(650));

    const after = insertAndAdvance(start, "A|2.60", "base-dishwasher");
    const strip = openingIn(after, "A|2.90");
    const offers = offersFor({
      catalog: CATALOG,
      records: after.records,
      voids: after.voids,
      columns: after.columns,
      cabinetDepthMm: cabinetDepthMmOf(after.design),
      target: { kind: "void", id: strip.id },
    });

    expect(extentMmOf(columnAt(after, "A|2.90")).widthMm).toBe(50);
    expect(offers.length).toBeGreaterThan(0);
    expect(refused(offers)).toHaveLength(offers.length);
    expect(verdictOf(offers, "base-bottle-cargo")).toMatchObject({
      status: "refused",
    });
  });

  // Criterion 5, the exact-to-zero case (ADR 0031 rule 6 read for an insert): nothing is created,
  // the key the column had is the key it keeps, and the saved document's `emptyColumns` key is
  // **absent** rather than an empty array. A zero-width remainder would be refused by
  // `positiveMillimetreSchema` at the write seam; one emitted and filtered downstream is what the
  // key-absent half catches.
  it("creates nothing when the body fills the column exactly", () => {
    const start = loadSpan(designWithEmptySpan(600));
    const original = extentMmOf(columnAt(start, "A|2.60"));

    const after = insertAndAdvance(start, "A|2.60", "base-dishwasher");

    expect(keysAcross(after, original)).toEqual(["A|2.60"]);
    expect(extentMmOf(columnAt(after, "A|2.60"))).toEqual(original);
    expect(projectEmptyColumns(after.columns, after.records)).toEqual([]);
  });

  // Criterion 6. The original key must be vacated: left behind, it is a member-less full-width
  // column sitting across the new placement, and the document becomes unsaveable —
  // `EMPTY_COLUMN_OVERLAPS_PLACEMENT` at the write seam. Asserting *the document validates* is what
  // makes that red; an in-memory map assertion does not.
  it("vacates the original key and leaves a document both seams accept", () => {
    const start = loadSpan(designWithEmptySpan(1400));

    const after = insertAndAdvance(start, "A|2.60", "base-dishwasher");
    const saved: Design = {
      ...after.design,
      emptyColumns: [...projectEmptyColumns(after.columns, after.records)],
    };

    expect(after.columns.has("A|2.60")).toBe(false);
    expect(validateDesignForCatalog(saved, CATALOG)).toEqual([]);
    expect(
      validateDesignForCatalog(
        DesignSchema.parse(JSON.parse(JSON.stringify(saved))),
        CATALOG,
      ),
    ).toEqual([]);
  });

  // Criterion 7 (a). An odd-width extent is constructible — 5B2a's schema restores one from a
  // document — and it seats the occupied half at `C − (W − w) / 2`, half a millimetre off. That is
  // refused by name and never rounded: rounding collapses two `toFixed(2)` keys into one, and it
  // would land the body 0.5 mm from where the document says it stands.
  it("refuses an odd-width column rather than rounding the seated centre", () => {
    const start = loadSpan(designWithEmptySpan(449));
    const result = insertInto(
      start,
      openingIn(start, "A|2.60"),
      "base-bottle-cargo",
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("NON_INTEGER_MILLIMETRES");
    expect(result.reason.params).toMatchObject({ field: "alongMm" });
    expect(result.design).toBe(start.design);
  });

  // Criterion 7 (b). Nothing an accepted insert publishes may make `projectEmptyColumns` throw —
  // that seam is uncaught in the store, so a fractional centre there is a crash rather than a
  // refusal. Swept over every width a split can produce in this span.
  propertyTest.prop([fc.integer({ min: 200, max: 800 })])(
    "never publishes a column the document cannot carry, at any span width",
    (widthMm) => {
      const start = loadSpan(designWithEmptySpan(widthMm));
      const result = insertInto(
        start,
        openingIn(start, "A|2.60"),
        "base-bottle-cargo",
      );
      if (!result.ok) return;

      const after = advanceWith(result.design, result.effect.columns);
      expect(() =>
        projectEmptyColumns(after.columns, after.records),
      ).not.toThrow();
    },
  );

  // Criterion 8. `refuseColumnDrift` restated: the placed body's derived column is the key the split
  // planned, and both come from one millimetre value — the placement's own `alongMm`.
  it("places the body under the very key the split planned for it", () => {
    const start = loadSpan(designWithEmptySpan(700));

    const result = insertInto(
      start,
      openingIn(start, "A|2.60"),
      "base-dishwasher",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const after = advanceWith(result.design, result.effect.columns);
    const placed = after.records.find(
      (record) => record.id === result.effect.placementId,
    );
    const placement = after.design.placements.find(
      (entry) => entry.id === result.effect.placementId,
    );
    expect(placed?.col).toBe(
      deriveColumnKeyAt("A", (placement?.alongMm ?? Number.NaN) / 1000),
    );
    expect(after.columns.has(placed?.col ?? "")).toBe(true);
  });

  // Criterion 12, in the half of it that is true: **in a column this insert may divide**,
  // `base-dishwasher` is seated flush left instead of centred, and the 100 mm becomes a real
  // opening. A test that asserted centring here would be asserting the defect.
  it("seats a discrete body flush left in a 700 mm column it may divide", () => {
    const start = loadSpan(designWithEmptySpan(700));

    const result = insertInto(
      start,
      openingIn(start, "A|2.60"),
      "base-dishwasher",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const placement = result.design.placements.find(
      (entry) => entry.id === result.effect.placementId,
    );
    expect(placement?.alongMm).toBe(2550);
    expect(placement?.alongMm).not.toBe(2600);
  });

  // The other half of criterion 12, and **ADR 0046's named cost is not yet paid on the shipped
  // kitchen.** Its only 700 mm column is `B|2.45` — the fridge with a cabinet over it — and that
  // second member is still standing whichever route reaches the opening, so the column is not this
  // body's to divide and the dishwasher lands dead centre at 2450, exactly as it always has.
  //
  // That is the precondition's consequence, not a defect of the split: dividing here would leave the
  // cabinet above deriving a key the map no longer holds, and moving it is backlog 2's re-split.
  // The seeded 700 mm case is therefore unreachable by this wave, and the same is true of the whole
  // seeded base row — no base cabinet sits in a column one delete makes divisible. This test exists
  // so the wave's claim is measured against the shipped kitchen rather than only against a
  // synthetic span.
  it("still centres a discrete body in the shipped kitchen's 700 mm column", () => {
    const records = derivePlacementRecords(KITCHEN_L_DESIGN, CATALOG);
    const columns = deriveColumns(records, {}, KITCHEN_L_DESIGN.room);

    const result = insertBody({
      design: KITCHEN_L_DESIGN,
      catalog: CATALOG,
      columns,
      voids: recomputeVoids(records, columns),
      target: { kind: "placement", id: "p7" },
      buildId: "base-dishwasher",
      probe: createFakeProbe({ catalog: CATALOG }),
      occurredAt: NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const placement = result.design.placements.find(
      (entry) => entry.id === result.effect.placementId,
    );
    expect(placement?.alongMm).toBe(2450);
    expect(result.effect.columns.get("B|2.45")?.w).toBeCloseTo(0.7, 6);
  });
});

describe("the gate: ADR 0037's withdrawal scenario and the four-tap case", () => {
  // Criterion 4 (a). The scenario ADR 0037 withdrew over, executable for the first time because
  // 5B2's schema makes an oversized empty column loadable: 1400 mm, a 600 mm body in, 800 mm left —
  // and the 800 mm **accepts a second insert**, which is the assertion that matters. A void that no
  // command can address is the exact state the withdrawal was about.
  it("leaves an 800 mm column that accepts a second insert", () => {
    const start = loadSpan(designWithEmptySpan(1400));

    const after = insertAndAdvance(start, "A|2.60", "base-dishwasher");
    expect(extentMmOf(columnAt(after, "A|2.90")).widthMm).toBe(800);

    const second = insertInto(
      after,
      openingIn(after, "A|2.90"),
      "base-dishwasher",
    );
    expect(second.ok).toBe(true);
  });

  // Criterion 4 (b), the four-tap case, on the seeded kitchen and with no resize and no merge in
  // sight: clear `A|2.60`, insert a 300 mm bottle cargo into the 600 mm opening, and the other
  // 300 mm of wall is still there to be selected.
  it("keeps 300 mm of wall selectable after a bottle cargo goes into a cleared 600 mm column", () => {
    const cleared = HOB_COLUMN_MEMBERS.reduce((design: Design, id) => {
      const result = removePlacement({
        design,
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
    const start: Span = {
      design: cleared,
      columns: frozen,
      records,
      voids: recomputeVoids(records, frozen),
    };

    const after = insertAndAdvance(start, HOB_COLUMN_KEY, "base-bottle-cargo");
    const remainder = columnAt(after, "A|2.75");

    expect(extentMmOf(remainder).widthMm).toBe(300);
    // **Both** halves carry the original's frozen extent, not only the remainder. Give the occupied
    // half the body's own `top` and `regions` instead and the 1780 mm above the bottle cargo closes
    // — ADR 0011 Gap D verbatim, and the defect the four-tap case exists to catch.
    expect(columnAt(after, "A|2.45").top).toBeCloseTo(2.6, 6);
    expect(
      after.voids.filter(
        (record) => record.col === "A|2.45" && record.y0 > 0.8,
      ),
    ).not.toHaveLength(0);
    const second = insertInto(
      after,
      openingIn(after, "A|2.75"),
      "base-bottle-cargo",
    );
    expect(second.ok).toBe(true);
  });
});

describe("the span survives a sequence, not only one command", () => {
  // Criterion 11. The anti-invariant as a property: over ≥ 8 interleaved inserts and deletes in one
  // span, the columns on that wall still tile the span exactly, none has a width at or below zero,
  // none overlaps another, and every accepted command leaves a document the validator accepts. The
  // stale-key mutant of criterion 6 and a sub-50 tidy-up only show up under accumulation.
  propertyTest.prop(
    [
      fc.array(
        fc.constantFrom(
          "base-dishwasher",
          "base-bottle-cargo",
          "wall-2door",
          "delete",
        ),
        { minLength: 8, maxLength: 14 },
      ),
    ],
    { numRuns: 40 },
  )("tiles the span exactly through any interleaving", (steps) => {
    const start = loadSpan(designWithEmptySpan(1400));
    const original = extentMmOf(columnAt(start, "A|2.60"));

    let span = start;
    for (const step of steps) {
      span =
        step === "delete"
          ? deleteOneIn(span, original)
          : tryInsert(span, original, step);

      const extents = keysAcross(span, original).map((key) =>
        extentMmOf(columnAt(span, key)),
      );
      const covered = extents.reduce((sum, extent) => sum + extent.widthMm, 0);
      expect(covered).toBe(original.widthMm);
      expect(extents.every((extent) => extent.widthMm > 0)).toBe(true);
      expect(hasNoOverlap(extents)).toBe(true);
      // Validated through the map the **store** would save, not the raw published one: since ADR
      // 0052 the store cuts a member-less column at the ceiling before projecting it, and a delete
      // is the producer with no command-level split of its own (`resolveColumns`). Without that step
      // clearing the whole span records one 1400 mm entry, which the validator refuses — correctly,
      // and for a rule this property is not about.
      expect(
        validateDesignForCatalog(
          {
            ...span.design,
            emptyColumns: [
              ...projectEmptyColumns(
                withCurrentFullHeightMembers(
                  splitOversizedEmptyColumns(span.columns, span.records),
                  span.records,
                ),
                span.records,
              ),
            ],
          },
          CATALOG,
        ),
      ).toEqual([]);
    }
  });
});

/** One insert attempt into the first opening the span offers. A refusal leaves the span exactly as
 *  it was — which is the contract, and what makes a refusal a legal step of the sequence. */
function tryInsert(span: Span, original: ExtentMm, buildId: string): Span {
  const opening = span.voids.find((record) =>
    keysAcross(span, original).includes(record.col),
  );
  if (!opening) return span;
  const result = insertInto(span, opening, buildId);
  return result.ok ? advanceWith(result.design, result.effect.columns) : span;
}

/** One delete inside the span, applied as every command but a resize and an insert is: the design
 *  changes and the frozen extents do not (ADR 0011 Gap D). */
function deleteOneIn(span: Span, original: ExtentMm): Span {
  const keys = keysAcross(span, original);
  const victim = span.records.find((record) => keys.includes(record.col));
  if (!victim) return span;
  const result = removePlacement({
    design: span.design,
    catalog: CATALOG,
    target: { kind: "placement", id: victim.id },
    occurredAt: NOW,
  });
  return result.ok ? advanceWith(result.design, span.columns) : span;
}

function hasNoOverlap(extents: readonly ExtentMm[]): boolean {
  const sorted = [...extents].sort((a, b) => a.centreMm - b.centreMm);
  return sorted.every((extent, index) => {
    const previous = sorted[index - 1];
    return (
      previous === undefined || leftEdgeMm(extent) >= rightEdgeMm(previous)
    );
  });
}
