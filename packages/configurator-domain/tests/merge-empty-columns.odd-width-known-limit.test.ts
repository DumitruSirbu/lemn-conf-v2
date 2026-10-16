// 8U §6.2 / R13: an odd-width space reaches the editor only from a stored document (a whole-mm centre with half-mm
// edges). The merge never makes one out of even spaces and never rounds; the insert refuses a half-mm seat. The offer
// list still lists the rows it refuses there, a known limit pinned below as an `it.fails` that clears with the fix.
//
// R6, each through a mocked copy of src: dropping the merge's half-millimetre guard turns the pair and the four red;
// a block that is not retried one column shorter turns the four red; the editor capped at 800 turns the three red;
// rounding the seat in `insertBody` and allowing fractional parts in `splitColumn` turns the refusal pin red (either
// alone is caught by the other); moving the seat's guard into `evaluateInsertFit` (the recorded remedy) turns every
// `it.fails` red and leaves the refusal pin green. No merge mutant reaches the lone 401: a block needs two members.
import { describe, expect, it } from "vitest";

import { listInsertableBodies } from "../src/catalog.js";
import { insertBody } from "../src/commands/insert-body.js";
import {
  cabinetDepthMmOf,
  DesignSchema,
  type Design,
  type EmptyColumn,
} from "../src/design.js";
import { KITCHEN_L_BODY_CATALOG } from "../src/fixtures/kitchen-l-design.js";
import { toMillimetres } from "../src/millimetres.js";
import { offersFor } from "../src/queries/offers.js";
import {
  deriveColumns,
  derivePlacementRecords,
  projectEmptyColumns,
  recomputeVoids,
  type Column,
  type PlacementRecord,
  type VoidRecord,
} from "../src/void-engine.js";
import { createFakeProbe } from "./support/fake-probe.js";
import {
  memberlessSpaces,
  type MeasuredSpace,
} from "./support/merge-oracle.js";
import { offeredIds } from "./support/offers.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const NOW = "2026-10-16T12:00:00.000Z";
const ODD_WIDTH_MM = 401;
const FIRST_CENTRE_MM = 2000;
const OPENING_CENTRE_MM = 3000;
const KNOWN_LIMIT = "8U §6.2 / R13 known limit";
const FULL_HEIGHT = { y0Mm: 0, topMm: 2600, depthMm: 580 } as const;

/** §6.2's fixtures: 'fit' rows over their 800 mm maximum, and fixed-set rows under it. */
const ODD_OPENINGS_MM = [701, 799, 801, 1201, 2001] as const;

interface Loaded {
  readonly design: Design;
  readonly records: readonly PlacementRecord[];
  readonly columns: ReadonlyMap<string, Column>;
  readonly voids: readonly VoidRecord[];
}

describe("8U §6.2: stored odd-width spaces at the load seam, declined and never rounded", () => {
  it("leaves a single stored 401 mm space as it was, on its half-millimetre edges", () => {
    const loaded = loadedWithOddRun(1);

    expect(memberlessSpaces(loaded.columns, loaded.records)).toEqual([
      oddSpan("A|2.00", 1799.5, 2200.5),
    ]);
  });

  it("keeps two abutting 401s apart, because one 802 would centre on a half millimetre", () => {
    const loaded = loadedWithOddRun(2);

    expect(memberlessSpaces(loaded.columns, loaded.records)).toEqual([
      oddSpan("A|2.00", 1799.5, 2200.5),
      oddSpan("A|2.40", 2200.5, 2601.5),
    ]);
  });

  it("merges three abutting 401s into one 1203 at the whole-millimetre centre 2401", () => {
    const loaded = loadedWithOddRun(3);

    expect(memberlessSpaces(loaded.columns, loaded.records)).toEqual([
      oddSpan("A|2.40", 1799.5, 3002.5),
    ]);
  });

  it("merges the first three of four 401s into one 1203 and leaves the fourth beside it, retrying a declined block one column shorter", () => {
    const loaded = loadedWithOddRun(4);

    expect(memberlessSpaces(loaded.columns, loaded.records)).toEqual([
      oddSpan("A|2.40", 1799.5, 3002.5),
      oddSpan("A|3.20", 3002.5, 3403.5),
    ]);
  });

  it.each([1, 2, 3, 4])(
    "projects the map of %i stored 401s back to a document without throwing",
    (count) => {
      const loaded = loadedWithOddRun(count);

      const projected = projectEmptyColumns(loaded.columns, loaded.records);

      expect(projected.map((column) => column.alongMm)).toEqual(
        projected.map((column) => Math.round(column.alongMm)),
      );
      expect(projected.reduce((sum, column) => sum + column.widthMm, 0)).toBe(
        count * ODD_WIDTH_MM,
      );
    },
  );
});

describe("8U §6.2: inserting into a stored odd opening", () => {
  // Every entry, not only the offered ones, so the pin holds unchanged once the offer list stops listing them.
  it.each(ODD_OPENINGS_MM)(
    "at %i mm builds a body only flush on the opening's left edge, and refuses a half-millimetre seat with NON_INTEGER_MILLIMETRES, never a throw",
    (widthMm) => {
      const loaded = loadedWithOpening(widthMm);
      let halfMillimetreRefusals = 0;

      for (const record of loaded.voids) {
        for (const { buildId } of listInsertableBodies(CATALOG)) {
          const result = insertInto(loaded, record, buildId);
          if (result.ok) {
            expect([buildId, leftEdgeOfPlaced(result.design)]).toEqual([
              buildId,
              OPENING_CENTRE_MM - widthMm / 2,
            ]);
            continue;
          }
          expect(result.design).toBe(loaded.design);
          if (result.reason.code === "NON_INTEGER_MILLIMETRES") {
            halfMillimetreRefusals += 1;
          }
        }
      }

      expect(halfMillimetreRefusals).toBeGreaterThan(0);
    },
  );
});

describe(`${KNOWN_LIMIT}: the offer list at a stored odd opening lists rows the insert refuses (criterion 10)`, () => {
  it.each(ODD_OPENINGS_MM)(
    "at %i mm the offer list is not empty and holds at least one row the insert refuses, so the it.fails below fails for the limit",
    (widthMm) => {
      const verdicts = offeredVerdictsAt(loadedWithOpening(widthMm));

      expect(verdicts.length).toBeGreaterThan(0);
      expect(verdicts.some((verdict) => !verdict.accepted)).toBe(true);
    },
  );

  // Expected to fail while the limit stands; it passes, and so turns red, once one judge decides the seat (§6.2).
  for (const widthMm of ODD_OPENINGS_MM) {
    it.fails(
      `${KNOWN_LIMIT}: at ${String(widthMm)} mm the offer list equals what the insert accepts`,
      () => {
        const verdicts = offeredVerdictsAt(loadedWithOpening(widthMm));

        expect(verdicts.filter((verdict) => !verdict.accepted)).toEqual([]);
      },
    );
  }
});

interface OfferedVerdict {
  readonly level: number;
  readonly buildId: string;
  readonly accepted: boolean;
}

function offeredVerdictsAt(loaded: Loaded): OfferedVerdict[] {
  return loaded.voids.flatMap((record) =>
    offeredIds(offersAt(loaded, record)).map((buildId) => ({
      level: toMillimetres(record.y0),
      buildId,
      accepted: insertInto(loaded, record, buildId).ok,
    })),
  );
}

function offersAt(loaded: Loaded, record: VoidRecord) {
  return offersFor({
    records: loaded.records,
    voids: loaded.voids,
    columns: loaded.columns,
    catalog: CATALOG,
    target: { kind: "void", id: record.id },
    cabinetDepthMm: cabinetDepthMmOf(loaded.design),
  });
}

function insertInto(loaded: Loaded, record: VoidRecord, buildId: string) {
  return insertBody({
    design: loaded.design,
    catalog: CATALOG,
    columns: loaded.columns,
    voids: loaded.voids,
    target: { kind: "void", id: record.id },
    buildId,
    probe: createFakeProbe({ catalog: CATALOG }),
    occurredAt: NOW,
  });
}

function leftEdgeOfPlaced(design: Design): number {
  const [placement] = design.placements;
  if (!placement) throw new Error("an accepted insert placed nothing");
  return placement.alongMm - placement.body.widthMm / 2;
}

/** `count` stored 401s abutting from 1799.5, each centred on a whole millimetre (2000, 2401, 2802, 3203). */
function loadedWithOddRun(count: number): Loaded {
  return loadedFrom(
    Array.from({ length: count }, (_, index) =>
      fullHeightSpace(FIRST_CENTRE_MM + ODD_WIDTH_MM * index, ODD_WIDTH_MM),
    ),
  );
}

function loadedWithOpening(widthMm: number): Loaded {
  return loadedFrom([fullHeightSpace(OPENING_CENTRE_MM, widthMm)]);
}

function fullHeightSpace(alongMm: number, widthMm: number): EmptyColumn {
  return { wall: "A", alongMm, widthMm, ...FULL_HEIGHT };
}

function loadedFrom(emptyColumns: readonly EmptyColumn[]): Loaded {
  const design = DesignSchema.parse({
    room: { shape: "L", widthMm: 6000, depthMm: 2400, heightMm: 2600 },
    presetId: null,
    placements: [],
    emptyColumns,
    createdAt: NOW,
    updatedAt: NOW,
  });
  const records = derivePlacementRecords(design, CATALOG);
  const columns = deriveColumns(records, design, design.room);
  return { design, records, columns, voids: recomputeVoids(records, columns) };
}

function oddSpan(key: string, leftMm: number, rightMm: number): MeasuredSpace {
  return {
    key,
    wall: "A",
    leftMm,
    rightMm,
    floorMm: FULL_HEIGHT.y0Mm,
    topMm: FULL_HEIGHT.topMm,
    depthMm: FULL_HEIGHT.depthMm,
  };
}
