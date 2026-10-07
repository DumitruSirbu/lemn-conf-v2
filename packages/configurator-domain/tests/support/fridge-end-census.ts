// M7C wave C5 slices S1 and S2 — the census the L's and the U's rooms tests both keep over a swept grid of
// rooms: for each planned room, the live plan held to the plan the planner made before C5 with the owner's rule
// applied by an oracle, the must-nots read off the live plan, and the rooms the rule changed counted and kept for
// the built-design checks. Generic over the wall: the L's walls are A and B, the U's fridge wall is B or C. What
// stays in each test is the shape's own planning and its own iteration over the grid.
import type { DesignRoom, DesignWall } from "../../src/index.js";
import { labelOf } from "./fridge-end-built-kitchen.js";
import {
  bodyInboardOfTheEndFridge,
  DOOR_CABINET,
  OWNERS_CABINET_CEILING_MM,
  planAfterTheOwnersRule,
  type PlanOfWalls,
} from "./fridge-end-leftover.js";

/** A sweep that loops over rooms awaits the event loop between rows; the census as a whole is allowed this long. */
export const SWEEP_TIMEOUT_MS = 300_000;

/** The built-design checks take this many changed rooms per (wall, leftover), and a stride through the rest. */
const ROOMS_KEPT_PER_LEFTOVER = 2;

/** The window the owner's rule reads: 50 mm is the first step, 300 mm the line from which the leftover stays bare. */
const WINDOW_FROM_MM = 50;
const WINDOW_BELOW_MM = 300;

export interface ChangedRoom {
  readonly room: DesignRoom;
  readonly wall: DesignWall;
  readonly leftoverMm: number;
}

export interface Census {
  swept: number;
  planned: number;
  /** Rooms the rule changed, by the wall the fridge ends. */
  changed: Record<string, number>;
  /** Rooms the rule changed, by the leftover the fridge had beyond it. */
  changedByLeftoverMm: Record<number, number>;
  /** Rooms the rule changed, by `wall:leftover`. */
  changedByWallAndLeftoverMm: Record<string, number>;
  /** Rooms with 50-299 mm beyond an end fridge whose inboard body is not a door cabinet, by that body. */
  leftBareByInboardBody: Record<string, number>;
  /** Rooms with 50-299 mm beyond an end fridge with no body inboard of it at all. */
  leftBareWithNoBodyInboard: number;
  mismatches: string[];
  rulesBroken: string[];
  /** Two rooms per (wall, leftover) the rule changed, and a stride through the rest, for the built design. */
  changedRooms: ChangedRoom[];
  readonly keptPerLeftover: Map<string, number>;
  readonly strideThroughChangedRooms: number;
}

export function emptyCensus(strideThroughChangedRooms: number): Census {
  return {
    swept: 0,
    planned: 0,
    changed: {},
    changedByLeftoverMm: {},
    changedByWallAndLeftoverMm: {},
    leftBareByInboardBody: {},
    leftBareWithNoBodyInboard: 0,
    mismatches: [],
    rulesBroken: [],
    changedRooms: [],
    keptPerLeftover: new Map(),
    strideThroughChangedRooms,
  };
}

export interface RoomPlans<Plan extends PlanOfWalls> {
  readonly room: DesignRoom;
  readonly runs: Readonly<
    Partial<Record<DesignWall, { readonly endMm: number }>>
  >;
  readonly live: Plan;
  /** The plan the planner made before C5, which the owner's rule is applied to for the oracle. */
  readonly before: Plan;
}

/** Counts one planned room: the differential, the must-nots, and what happened beside its end fridge. */
export function countTheRoom<Plan extends PlanOfWalls>(
  census: Census,
  plans: RoomPlans<Plan>,
): void {
  census.planned += 1;
  const where = labelOf(plans.room);
  const expected = planAfterTheOwnersRule(plans.before, plans.runs);
  if (JSON.stringify(plans.live) !== JSON.stringify(expected)) {
    census.mismatches.push(where);
  }
  checkTheMustNots(census, where, plans);
  countTheEndFridge(census, where, plans);
}

/** One fridge, no door cabinet over 800, and the fridge inside its free run (which excludes a side wall's reserve). */
function checkTheMustNots<Plan extends PlanOfWalls>(
  census: Census,
  where: string,
  { runs, live }: RoomPlans<Plan>,
): void {
  const fridges = live.bases.filter((base) => base.role === "fridge");
  if (fridges.length > 1) census.rulesBroken.push(`${where}: two fridges`);
  for (const base of live.bases) {
    if (
      base.buildId === DOOR_CABINET &&
      base.widthMm > OWNERS_CABINET_CEILING_MM
    ) {
      census.rulesBroken.push(`${where}: ${base.id} over 800`);
    }
  }
  const [fridge] = fridges;
  const runEndMm = fridge === undefined ? undefined : runs[fridge.wall]?.endMm;
  if (
    fridge !== undefined &&
    runEndMm !== undefined &&
    fridge.endMm > runEndMm
  ) {
    census.rulesBroken.push(`${where}: the fridge passes the free run`);
  }
}

function countTheEndFridge<Plan extends PlanOfWalls>(
  census: Census,
  where: string,
  { room, runs, live, before }: RoomPlans<Plan>,
): void {
  const fridge = before.bases.find((base) => base.role === "fridge");
  const runEndMm = fridge === undefined ? undefined : runs[fridge.wall]?.endMm;
  if (fridge === undefined || runEndMm === undefined) return;
  const { wall } = fridge;
  const isOutermost = before.bases
    .filter((base) => base.wall === wall)
    .every((base) => base.endMm <= fridge.endMm);
  if (!isOutermost) return;

  const leftoverMm = runEndMm - fridge.endMm;
  const isInTheWindow =
    leftoverMm >= WINDOW_FROM_MM && leftoverMm < WINDOW_BELOW_MM;
  const inboard = bodyInboardOfTheEndFridge(before, wall);
  if (inboard?.buildId !== DOOR_CABINET) {
    if (isInTheWindow) countTheLeftoverLeftBare(census, inboard?.buildId);
    return;
  }
  const liveInboard = bodyInboardOfTheEndFridge(live, wall);
  if (liveInboard === undefined) {
    census.rulesBroken.push(`${where}: the end fridge or its cabinet is gone`);
    return;
  }
  if (liveInboard.widthMm === inboard.widthMm) return;
  census.changed[wall] = (census.changed[wall] ?? 0) + 1;
  census.changedByLeftoverMm[leftoverMm] =
    (census.changedByLeftoverMm[leftoverMm] ?? 0) + 1;
  const crossKey = `${wall}:${String(leftoverMm)}`;
  census.changedByWallAndLeftoverMm[crossKey] =
    (census.changedByWallAndLeftoverMm[crossKey] ?? 0) + 1;
  keepForTheBuiltDesign(census, { room, wall, leftoverMm });
}

function countTheLeftoverLeftBare(
  census: Census,
  inboardBuildId: string | undefined,
): void {
  if (inboardBuildId === undefined) {
    census.leftBareWithNoBodyInboard += 1;
    return;
  }
  census.leftBareByInboardBody[inboardBuildId] =
    (census.leftBareByInboardBody[inboardBuildId] ?? 0) + 1;
}

function keepForTheBuiltDesign(census: Census, changed: ChangedRoom): void {
  const key = `${changed.wall}:${String(changed.leftoverMm)}`;
  const heldMm = census.keptPerLeftover.get(key) ?? 0;
  const changedSoFar = Object.values(census.changed).reduce(
    (sum, count) => sum + count,
    0,
  );
  const isTheStride = changedSoFar % census.strideThroughChangedRooms === 0;
  if (heldMm >= ROOMS_KEPT_PER_LEFTOVER && !isTheStride) return;
  census.keptPerLeftover.set(key, heldMm + 1);
  census.changedRooms.push(changed);
}
