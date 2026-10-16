// 8U's oracle for the uncapped merge, written from the columns' own extents in plain interval arithmetic. It never
// calls the merge: criterion 1 asks which adjacent agreeing pairs survive and why, and an answer read off the merge
// would agree with the merge by construction.
//
// Each guard is re-stated from 8U plan §2.3 B4 and §4.2, not imported, so a guard the merge loses or widens shows here
// as a pair with no name or a name it should not have.
import type { DesignWall } from "../../src/design.js";
import { MILLIMETRES_PER_METRE } from "../../src/millimetres.js";
import {
  alongWallCoordinate,
  COLUMN_KEY_RESOLUTION_MM,
  deriveColumnKeyAt,
  LEVEL_SNAP_M,
} from "../../src/module-grid.js";
import type { ColumnExtent, PlacementRecord } from "../../src/void-engine.js";

/** Float noise only: the coordinates are whole or half millimetres converted to metres and back. */
export const EDGE_NOISE_MM = 1e-6;

/** §4's "same row" in millimetres: floor, top and depth must each agree within it (ADR 0046 rule 2). */
export const AGREEMENT_TOLERANCE_MM = LEVEL_SNAP_M * MILLIMETRES_PER_METRE;

/** One key bucket, inclusive: §4.2's "same stretch of wall". */
const SAME_EDGE_OF_WALL_MM = COLUMN_KEY_RESOLUTION_MM + EDGE_NOISE_MM;

/** The B4 guards a surviving adjacent agreeing pair may be excused by, each named as the plan names it. */
export type MergeGuard =
  | "half-millimetre centre"
  | "inverted envelope"
  | "stands in a placement"
  | "key taken"
  | "same stretch of wall";

/** A column as the oracle reads it, in millimetres along its wall. */
export interface MeasuredSpace {
  readonly key: string;
  readonly wall: DesignWall;
  readonly leftMm: number;
  readonly rightMm: number;
  readonly floorMm: number;
  readonly topMm: number;
  readonly depthMm: number;
}

/** Two member-less neighbours that abut and agree, with every guard that would decline them as one. */
export interface AdjacentAgreeingPair {
  readonly left: MeasuredSpace;
  readonly right: MeasuredSpace;
  readonly guards: readonly MergeGuard[];
}

export function measureSpace(column: ColumnExtent): MeasuredSpace {
  const centreMm =
    alongWallCoordinate(column.wall, column) * MILLIMETRES_PER_METRE;
  const widthMm = column.w * MILLIMETRES_PER_METRE;
  return {
    key: column.key,
    wall: column.wall,
    leftMm: centreMm - widthMm / 2,
    rightMm: centreMm + widthMm / 2,
    floorMm:
      Math.min(...column.regions.map(([startM]) => startM)) *
      MILLIMETRES_PER_METRE,
    topMm: column.top * MILLIMETRES_PER_METRE,
    depthMm: column.d * MILLIMETRES_PER_METRE,
  };
}

/** The map's columns no record is filed under, in along-wall order. */
export function memberlessSpaces(
  columns: ReadonlyMap<string, ColumnExtent>,
  records: readonly PlacementRecord[],
): MeasuredSpace[] {
  const occupied = new Set(records.map((record) => record.col));
  return [...columns.values()]
    .filter((column) => !occupied.has(column.key))
    .map(measureSpace)
    .sort((a, b) => a.leftMm - b.leftMm);
}

/** Every pair of member-less columns on one wall that abut and agree, each with the guards that excuse it. A
 *  maximal merge leaves only pairs whose `guards` is non-empty (8U criterion 1). */
export function adjacentAgreeingPairs(
  columns: ReadonlyMap<string, ColumnExtent>,
  records: readonly PlacementRecord[],
): AdjacentAgreeingPair[] {
  const spaces = memberlessSpaces(columns, records);
  const pairs: AdjacentAgreeingPair[] = [];
  for (const left of spaces) {
    for (const right of spaces) {
      if (!abutsOnTheRight(left, right) || !agrees(left, right)) continue;
      pairs.push({
        left,
        right,
        guards: guardsDeclining({ left, right }, columns, records),
      });
    }
  }
  return pairs;
}

function abutsOnTheRight(left: MeasuredSpace, right: MeasuredSpace): boolean {
  return (
    left.wall === right.wall &&
    Math.abs(right.leftMm - left.rightMm) <= EDGE_NOISE_MM
  );
}

export function agrees(left: MeasuredSpace, right: MeasuredSpace): boolean {
  return (
    Math.abs(left.floorMm - right.floorMm) <= AGREEMENT_TOLERANCE_MM &&
    Math.abs(left.topMm - right.topMm) <= AGREEMENT_TOLERANCE_MM &&
    Math.abs(left.depthMm - right.depthMm) <= AGREEMENT_TOLERANCE_MM
  );
}

interface PairSpan {
  readonly left: MeasuredSpace;
  readonly right: MeasuredSpace;
}

function guardsDeclining(
  pair: PairSpan,
  columns: ReadonlyMap<string, ColumnExtent>,
  records: readonly PlacementRecord[],
): MergeGuard[] {
  const verdicts: readonly (readonly [MergeGuard, boolean])[] = [
    ["half-millimetre centre", hasHalfMillimetreCentre(pair)],
    ["inverted envelope", envelopeInverts(pair)],
    ["stands in a placement", standsInAPlacement(pair, records)],
    ["key taken", mergedKeyIsTaken(pair, columns)],
    ["same stretch of wall", standsOverAnotherColumn(pair, columns)],
  ];
  return verdicts.filter(([, declines]) => declines).map(([guard]) => guard);
}

function hasHalfMillimetreCentre({ left, right }: PairSpan): boolean {
  const widthMm = right.rightMm - left.leftMm;
  const centreMm = (left.leftMm + right.rightMm) / 2;
  return !isWholeMillimetre(widthMm) || !isWholeMillimetre(centreMm);
}

function envelopeInverts({ left, right }: PairSpan): boolean {
  return (
    Math.max(left.floorMm, right.floorMm) >= Math.min(left.topMm, right.topMm)
  );
}

function standsInAPlacement(
  { left, right }: PairSpan,
  records: readonly PlacementRecord[],
): boolean {
  const floorMm = Math.max(left.floorMm, right.floorMm);
  const topMm = Math.min(left.topMm, right.topMm);
  return records.some((record) => {
    if (record.wall !== left.wall) return false;
    const centreMm =
      alongWallCoordinate(record.wall, record.frame) * MILLIMETRES_PER_METRE;
    const halfWidthMm = (record.frame.w * MILLIMETRES_PER_METRE) / 2;
    const bottomMm = record.frame.y0 * MILLIMETRES_PER_METRE;
    const heightMm = record.frame.h * MILLIMETRES_PER_METRE;
    return (
      overlapsByMoreThanNoise(
        [centreMm - halfWidthMm, centreMm + halfWidthMm],
        [left.leftMm, right.rightMm],
      ) &&
      overlapsByMoreThanNoise([bottomMm, bottomMm + heightMm], [floorMm, topMm])
    );
  });
}

function mergedKeyIsTaken(
  { left, right }: PairSpan,
  columns: ReadonlyMap<string, ColumnExtent>,
): boolean {
  const centreM = (left.leftMm + right.rightMm) / 2 / MILLIMETRES_PER_METRE;
  const key = deriveColumnKeyAt(left.wall, centreM);
  return key !== left.key && key !== right.key && columns.has(key);
}

/** The other column(s) a pair's merged span stands over, along the wall only (§4.2). */
export function columnsUnderTheSameStretch(
  { left, right }: PairSpan,
  columns: ReadonlyMap<string, ColumnExtent>,
): ColumnExtent[] {
  return [...columns.values()].filter((column) => {
    if (column.wall !== left.wall) return false;
    if (column.key === left.key || column.key === right.key) return false;
    const other = measureSpace(column);
    return (
      Math.abs(other.leftMm - left.leftMm) <= SAME_EDGE_OF_WALL_MM &&
      Math.abs(other.rightMm - right.rightMm) <= SAME_EDGE_OF_WALL_MM
    );
  });
}

function standsOverAnotherColumn(
  pair: PairSpan,
  columns: ReadonlyMap<string, ColumnExtent>,
): boolean {
  return columnsUnderTheSameStretch(pair, columns).length > 0;
}

function overlapsByMoreThanNoise(
  first: readonly [number, number],
  second: readonly [number, number],
): boolean {
  return (
    Math.min(first[1], second[1]) - Math.max(first[0], second[0]) >
    EDGE_NOISE_MM
  );
}

export function isWholeMillimetre(valueMm: number): boolean {
  return Math.abs(valueMm - Math.round(valueMm)) <= EDGE_NOISE_MM;
}

/** 8U criterion 3a's check: every placement frame and every column with an along-wall edge off whole millimetres,
 *  named, so a counterexample says what holds the half millimetre. */
export function halfMillimetreEdges(state: {
  readonly records: readonly PlacementRecord[];
  readonly maps: Readonly<Record<string, ReadonlyMap<string, ColumnExtent>>>;
}): string[] {
  const offGrid: string[] = [];
  for (const record of state.records) {
    const centreMm =
      alongWallCoordinate(record.wall, record.frame) * MILLIMETRES_PER_METRE;
    const widthMm = record.frame.w * MILLIMETRES_PER_METRE;
    if (!hasWholeMillimetreEdges(centreMm, widthMm)) {
      offGrid.push(
        `placement ${record.id} (${record.buildId}) ${String(centreMm)} ± ${String(widthMm / 2)}`,
      );
    }
  }
  for (const [mapName, columns] of Object.entries(state.maps)) {
    for (const space of [...columns.values()].map(measureSpace)) {
      if (
        !isWholeMillimetre(space.leftMm) ||
        !isWholeMillimetre(space.rightMm)
      ) {
        offGrid.push(
          `${mapName} ${space.key} ${String(space.leftMm)}-${String(space.rightMm)}`,
        );
      }
    }
  }
  return offGrid;
}

function hasWholeMillimetreEdges(centreMm: number, widthMm: number): boolean {
  return (
    isWholeMillimetre(centreMm - widthMm / 2) &&
    isWholeMillimetre(centreMm + widthMm / 2)
  );
}
