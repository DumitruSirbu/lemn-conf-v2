// The anti-invariants of §3 and §4, stated once so a random mutation sequence can be checked
// against them after every step.
//
// Each check returns the violations it found as sentences rather than asserting, so a property
// failure names the state that produced it instead of reporting a bare `false`.
import { DesignSchema, type Design } from "../../src/design.js";
import {
  FIT_TOLERANCE_M,
  LEVELS,
  MIN_SPAN_M,
  type Column,
  type PlacementRecord,
  type VoidRecord,
} from "../../src/void-engine.js";
import type { KitchenWorld } from "./kitchen-world.js";

/** §2: the 0.86 → 1.50 gap between the base and wall module lines. Read off `LEVELS` rather than
 *  written down again, so a change to the module lines moves this with it. */
export const BACKSPLASH_ZONE: readonly [number, number] = [
  LEVELS[0]?.[1] ?? 0,
  LEVELS[1]?.[0] ?? 0,
];

/** Float slack for "overlaps a level at all". Not a fit tolerance — a void that touches a level
 *  boundary and no more has no room in that level. */
const TOUCHES_LEVEL_EPSILON_M = 1e-9;

/** §4 rule 3, stated as the rule states it: "an interval intersecting no level produces **no
 *  void**". The defect it records is a *standalone* slot — the 640 mm backsplash gap offered on
 *  its own, with zero valid contents and nothing to build in it.
 *
 *  It is deliberately NOT "no void may overlap the backsplash zone". Rule 4 keeps a span that
 *  starts mid-level as ONE opening, which can legitimately run from a base-level start up through
 *  a wall-level end and cross the gap on the way; and §4's own worked result for a cleared column
 *  gives three slots that "all still know `spanH = 2.6`", a span that crosses the gap. What is
 *  forbidden is an opening that lands *inside* the gap, touching no module line. */
export function intersectsNoModuleLine(record: VoidRecord): boolean {
  const top = record.y0 + record.h;
  return !LEVELS.some(
    ([levelStart, levelEnd]) =>
      Math.min(top, levelEnd) - Math.max(record.y0, levelStart) >
      TOUCHES_LEVEL_EPSILON_M,
  );
}

function describe(record: { readonly col: string; readonly y0: number }) {
  return `${record.col}@${record.y0.toFixed(3)}`;
}

function bodiesOf(records: readonly PlacementRecord[]): PlacementRecord[] {
  return records.filter((record) => !record.accessory);
}

/** §3.1: two bodies cannot occupy the same vertical run of the same column. */
function findOverlappingPlacements(
  records: readonly PlacementRecord[],
): string[] {
  const violations: string[] = [];
  const bodies = bodiesOf(records);
  for (const left of bodies) {
    for (const right of bodies) {
      if (left.id >= right.id) continue;
      if (left.col !== right.col) continue;
      const leftTop = left.frame.y0 + left.frame.h;
      const rightTop = right.frame.y0 + right.frame.h;
      const overlap =
        Math.min(leftTop, rightTop) - Math.max(left.frame.y0, right.frame.y0);
      if (overlap > FIT_TOLERANCE_M) {
        violations.push(
          `${left.id} and ${right.id} overlap by ${overlap.toFixed(4)} m in ${left.col}`,
        );
      }
    }
  }
  return violations;
}

/** §2's `MIN_SPAN`: nothing shorter ever becomes a selectable opening. */
function findUndersizedVoids(voids: readonly VoidRecord[]): string[] {
  return voids
    .filter((record) => record.h <= MIN_SPAN_M)
    .map(
      (record) =>
        `void ${describe(record)} is ${record.h.toFixed(4)} m, at or below MIN_SPAN`,
    );
}

/** §4 rule 3 and §11 row 17: an opening that touches no module line is never emitted — that is the
 *  640 mm backsplash slot with zero valid contents. See `intersectsNoModuleLine`. */
function findVoidsOnNoModuleLine(voids: readonly VoidRecord[]): string[] {
  return voids
    .filter(intersectsNoModuleLine)
    .map(
      (record) =>
        `void ${describe(record)} h=${record.h.toFixed(3)} touches no module line, ` +
        `so it is an opening with nothing that can be built in it`,
    );
}

/** §3.2: a column's `top` is load-time state; nothing may be placed above it afterwards. */
function findBodiesAboveColumnTop(
  records: readonly PlacementRecord[],
  columns: ReadonlyMap<string, Column>,
): string[] {
  return bodiesOf(records).flatMap((record) => {
    const column = columns.get(record.col);
    if (!column) return [`${record.id} sits in unknown column ${record.col}`];
    const top = record.frame.y0 + record.frame.h;
    if (top <= column.top + FIT_TOLERANCE_M) return [];
    return [
      `${record.id} reaches ${top.toFixed(3)} above ${record.col}'s top ${column.top.toFixed(3)}`,
    ];
  });
}

function findDuplicateVoidIds(voids: readonly VoidRecord[]): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const record of voids) {
    if (seen.has(record.id)) duplicates.push(`duplicate void id ${record.id}`);
    seen.add(record.id);
  }
  return duplicates;
}

function findSchemaViolations(design: Design): string[] {
  const parsed = DesignSchema.safeParse(design);
  if (parsed.success) return [];
  return parsed.error.issues.map(
    (issue) =>
      `design fails its own schema at ${issue.path.join(".")}: ${issue.message}`,
  );
}

/** Every invariant a mutated world must still satisfy, as a flat list of violations. Empty is the
 *  only passing value. */
export function findInvariantViolations(world: KitchenWorld): string[] {
  return [
    ...findSchemaViolations(world.design),
    ...findOverlappingPlacements(world.records),
    ...findUndersizedVoids(world.voids),
    ...findVoidsOnNoModuleLine(world.voids),
    ...findBodiesAboveColumnTop(world.records, world.columns),
    ...findDuplicateVoidIds(world.voids),
  ];
}

/** A deterministic PRNG, so a property failure is reproducible from the seed printed with it. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(random: () => number, items: readonly T[]): T {
  const chosen = items[Math.floor(random() * items.length)];
  if (chosen === undefined) {
    throw new Error("pick called with an empty list");
  }
  return chosen;
}
