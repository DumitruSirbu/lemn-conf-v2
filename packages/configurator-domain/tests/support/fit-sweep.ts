// Hand-built openings of any width for the insert-width sweep. A generated or seeded kitchen
// publishes no opening wider than 800 mm, so the witness is one stored member-less column (ADR 0093).
import { createHash } from "node:crypto";

import {
  listInsertableBodies,
  resolveWidthRangesMm,
  type InsertableBody,
} from "../../src/catalog.js";
import {
  evaluateInsertFit,
  openingFromVoid,
} from "../../src/commands/insert-fit.js";
import {
  cabinetDepthMmOf,
  type Design,
  type EmptyColumn,
} from "../../src/design.js";
import { KITCHEN_L_BODY_CATALOG } from "../../src/fixtures/kitchen-l-design.js";
import { toMillimetres } from "../../src/millimetres.js";
import {
  deriveColumns,
  derivePlacementRecords,
  recomputeVoids,
  type BodyCatalog,
  type Column,
  type PlacementRecord,
  type VoidRecord,
} from "../../src/void-engine.js";

const SWEEP_STEP_MM = 50;
const SWEEP_WIDEST_OPENING_MM = 3000;

/** 50 to 3000 mm in 50 mm steps: criterion 8's own range. */
export const SWEEP_OPENING_WIDTHS_MM: readonly number[] = Array.from(
  { length: SWEEP_WIDEST_OPENING_MM / SWEEP_STEP_MM },
  (_, index) => (index + 1) * SWEEP_STEP_MM,
);

/** Wall A, far enough from both ends of a 6000 mm wall that a 3000 mm opening touches neither. */
export const OPENING_LEFT_EDGE_MM = 1000;

const SWEEP_ROOM = {
  shape: "L",
  widthMm: 6000,
  depthMm: 2400,
  heightMm: 2600,
} as const;
const BASE_CLEARANCE_MM = 580;
const CREATED_AT = "2026-10-16T00:00:00.000Z";

/** The two member-less shapes an editor reaches: a column cleared floor to ceiling (base, wall and top slots, with
 *  the full height open to a column body), and a wall-row strip such as a U corner's upper row (U3b AC6). */
export const COLUMN_SHAPES = {
  "floor-to-ceiling": { y0Mm: 0, topMm: SWEEP_ROOM.heightMm },
  "wall-row": { y0Mm: 1500, topMm: 2200 },
} as const;

export type ColumnShape = keyof typeof COLUMN_SHAPES;

export interface OpeningWorld {
  readonly design: Design;
  readonly catalog: BodyCatalog;
  readonly cabinetDepthMm: number;
  readonly records: readonly PlacementRecord[];
  readonly columns: ReadonlyMap<string, Column>;
  readonly voids: readonly VoidRecord[];
}

/** One stored member-less column of `widthMm` from `OPENING_LEFT_EDGE_MM`, loaded through the editor's `deriveColumns`. */
export function openingWorld(
  shape: ColumnShape,
  widthMm: number,
  catalog: BodyCatalog = KITCHEN_L_BODY_CATALOG,
): OpeningWorld {
  const emptyColumn: EmptyColumn = {
    wall: "A",
    alongMm: OPENING_LEFT_EDGE_MM + widthMm / 2,
    widthMm,
    ...COLUMN_SHAPES[shape],
    depthMm: BASE_CLEARANCE_MM,
  };
  const design: Design = {
    room: SWEEP_ROOM,
    presetId: null,
    placements: [],
    emptyColumns: [emptyColumn],
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
  const records = derivePlacementRecords(design, catalog);
  const columns = deriveColumns(records, design, design.room);
  return {
    design,
    catalog,
    cabinetDepthMm: cabinetDepthMmOf(design),
    records,
    columns,
    voids: recomputeVoids(records, columns),
  };
}

/** The widest width an entry's resolved ranges allow, or `undefined` when no range survives its floor. */
export function entryMaximumMm(body: InsertableBody): number | undefined {
  const widths = resolveWidthRangesMm(body)
    .filter((range) => range.minMm <= range.maxMm)
    .map((range) => range.maxMm);
  return widths.length === 0 ? undefined : Math.max(...widths);
}

export function isFitEntry(body: InsertableBody): boolean {
  return body.widthFlex === "fit";
}

/** What `evaluateInsertFit` answered for one entry in one level slot, raw, so two trees can be compared byte for byte. */
export interface SweepVerdict {
  readonly buildId: string;
  readonly shape: ColumnShape;
  readonly openingWidthMm: number;
  readonly levelFloorMm: number;
  readonly answer: unknown;
}

export function sweepVerdicts(
  catalog: BodyCatalog = KITCHEN_L_BODY_CATALOG,
): readonly SweepVerdict[] {
  const verdicts: SweepVerdict[] = [];
  for (const shape of Object.keys(COLUMN_SHAPES) as ColumnShape[]) {
    for (const openingWidthMm of SWEEP_OPENING_WIDTHS_MM) {
      const world = openingWorld(shape, openingWidthMm, catalog);
      for (const record of world.voids) {
        for (const body of listInsertableBodies(catalog)) {
          verdicts.push({
            buildId: body.buildId,
            shape,
            openingWidthMm,
            levelFloorMm: toMillimetres(record.y0),
            answer: evaluateAt(world, record, body),
          });
        }
      }
    }
  }
  return verdicts;
}

function evaluateAt(
  world: OpeningWorld,
  record: VoidRecord,
  body: InsertableBody,
): unknown {
  const column = world.columns.get(record.col);
  if (!column) throw new Error(`No column ${record.col} for its own void`);
  const fit = evaluateInsertFit({
    body,
    opening: openingFromVoid(record),
    column,
    cabinetDepthMm: world.cabinetDepthMm,
  });
  return fit.ok ? fit.plan : fit.detail;
}

/** The rows criteria 8-9 hold to HEAD: every row of a millimetre-set entry, and a `'fit'` row at or under its maximum. */
export function isHeldToHead(
  verdict: SweepVerdict,
  catalog: BodyCatalog = KITCHEN_L_BODY_CATALOG,
): boolean {
  const body = listInsertableBodies(catalog).find(
    (candidate) => candidate.buildId === verdict.buildId,
  );
  if (!body) throw new Error(`No entry ${verdict.buildId}`);
  if (!isFitEntry(body)) return true;
  const maximumMm = entryMaximumMm(body);
  return maximumMm === undefined || verdict.openingWidthMm <= maximumMm;
}

/** One sha-256 per entry over its rows, in sweep order, so a pin that moves names the entry that moved. */
export function digestByEntry(
  verdicts: readonly SweepVerdict[],
): Readonly<Record<string, string>> {
  const hashes = new Map<string, ReturnType<typeof createHash>>();
  for (const verdict of verdicts) {
    const hash = hashes.get(verdict.buildId) ?? createHash("sha256");
    hash.update(JSON.stringify(verdict));
    hashes.set(verdict.buildId, hash);
  }
  return Object.fromEntries(
    [...hashes].map(([buildId, hash]) => [buildId, hash.digest("hex")]),
  );
}
