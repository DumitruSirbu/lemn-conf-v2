// M7B U3a adversarial QA — the U plan's rules, re-derived from ADR 0110 *N3 revised* and N10.3 rather
// than read back from `u-composition.ts`. Each check returns the names of the rules a plan breaks, so a
// failing property says which rule and a passing one returns `[]`. Nothing here imports the planner's
// own helpers: the run order, the drawer target, the tower's existence and the far wall's pantry
// count are all computed again from the room, the runs and the plan's bodies.
import type {
  DesignRoom,
  DesignWall,
  UKitchenCompositionPlan,
  UPlannedGenerationBase,
} from "../../src/index.js";

type Plan = UKitchenCompositionPlan;
type Base = UPlannedGenerationBase;
export type URuns = Readonly<
  Record<
    DesignWall,
    {
      readonly wall: DesignWall;
      readonly startMm: number;
      readonly endMm: number;
    }
  >
>;

const MODULE_MM = 600;
const MAX_BARE_END_MM = 599;
const T_MIN_MM = 4700;
const LARGE_U_TOTAL_MM = 10_000;
const COLUMN_HEIGHT_MM = 2200;
const SHORT_WALL_MAX_MM = 3000;
const MAX_DRAWER_UNITS = 5;
const PANTRY_MIN_MM = 400;
const PANTRY_MAX_MM = 800;
const BOTTLE_WIDTH_MM = 300;

const DRAWER_BUILD_IDS = new Set(["base-3drawer", "base-panbank"]);
const PAN_DRAWER = "base-panbank";
const THREE_DRAWER = "base-3drawer";
const DOOR = "base-cabinet";
const BOTTLE = "base-bottle-cargo";
const TOWER = "tall-oven-tower";
const PANTRY = "tall-pantry";
const DISHWASHER = "base-dishwasher";
const CORE_ORDER = ["sink", "dishwasher", "preparation", "hob"] as const;

export interface UPlanContext {
  readonly room: DesignRoom;
  readonly runs: URuns;
  readonly plan: Plan;
}

/** *N3 revised* 6: `N(T) = min(5, 3 + ⌊max(0, T − 4700) / 2000⌋)` over the entered lengths. */
export function drawerTargetOf(room: DesignRoom): number {
  const surplusMm = Math.max(0, totalMm(room) - T_MIN_MM);
  return Math.min(MAX_DRAWER_UNITS, 3 + Math.floor(surplusMm / 2000));
}

export function isLargeURoom(room: DesignRoom): boolean {
  return totalMm(room) >= LARGE_U_TOTAL_MM;
}

function totalMm(room: DesignRoom): number {
  return room.widthMm + room.depthMm + (room.wallCMm ?? 0);
}

function enteredMm(room: DesignRoom, wall: DesignWall): number {
  if (wall === "A") return room.widthMm;
  return wall === "B" ? room.depthMm : (room.wallCMm ?? 0);
}

/** *N3 revised* 2: the wider side wall, B on a tie. The RQ9 fallback has no population on shell
 *  runs, so a fridge standing elsewhere is itself a finding. */
export function fridgeWallOf(room: DesignRoom): DesignWall {
  return room.depthMm >= (room.wallCMm ?? 0) ? "B" : "C";
}

export function farWallOf(room: DesignRoom): DesignWall {
  return fridgeWallOf(room) === "B" ? "C" : "B";
}

function basesOn(plan: Plan, wall: DesignWall): readonly Base[] {
  return plan.bases
    .filter((base) => base.wall === wall)
    .sort((left, right) => left.startMm - right.startMm);
}

/** *N3 revised* 6's run order: wall A read from the fridge corner, then the far wall from its own
 *  corner. The fridge wall is not part of it. */
export function runOrderOf({ room, plan }: UPlanContext): readonly Base[] {
  const onA = basesOn(plan, "A");
  const wallAInRunOrder = fridgeWallOf(room) === "B" ? onA : [...onA].reverse();
  return [...wallAInRunOrder, ...basesOn(plan, farWallOf(room))];
}

function coreRoleOf(base: Base): string {
  return base.buildId === DISHWASHER ? "dishwasher" : base.role;
}

function isCoreBody(base: Base): boolean {
  return (CORE_ORDER as readonly string[]).includes(coreRoleOf(base));
}

function isDrawerUnit(base: Base): boolean {
  return DRAWER_BUILD_IDS.has(base.buildId);
}

function isDrawerExtra(base: Base): boolean {
  return isDrawerUnit(base) && base.role !== "preparation";
}

/** Every rule the plan breaks; `[]` for a refused room or a plan that keeps them all. */
export function uPlanFindings(context: UPlanContext): readonly string[] {
  if (!context.plan.minimumMet) return [];
  return [
    ...geometryFindings(context),
    ...ovenFindings(context),
    ...fridgeWallFindings(context),
    ...coreRunFindings(context),
    ...drawerFindings(context),
    ...bottleFindings(context),
    ...drawersBeatTheBottleFindings(context),
    ...towerFindings(context),
    ...sinkOnWallAFindings(context),
    ...wallABottleFindings(context),
    ...bottleDroppedWhileTheFarWallCanTakeTheDrawerFindings(context),
  ];
}

/** ADR 0108 H3, re-derived from the free runs alone: a U holds its minimum kitchen when wall A's free
 *  run takes the sink and the hob, or takes the sink while the far side wall takes the hob. The plan's
 *  `minimumMet` must agree in both directions (ADR 0110 N11.3). */
export function holdsTheMinimumKitchen({ room, runs }: UPlanContext): boolean {
  const freeAMm = runs.A.endMm - runs.A.startMm;
  const far = runs[farWallOf(room)];
  const freeFarMm = far.endMm - far.startMm;
  return (
    freeAMm >= 2 * MODULE_MM || (freeAMm >= MODULE_MM && freeFarMm >= MODULE_MM)
  );
}

/** N11.3, N3 item 4: the sink stands on wall A. */
function sinkOnWallAFindings({ plan }: UPlanContext): readonly string[] {
  const sink = plan.bases.find((base) => base.role === "sink");
  return sink?.wall === "A" ? [] : ["the sink is not on wall A"];
}

/** Wall A's run left after a wall-A hob, read in run direction (away from the fridge corner). */
export function freeAfterAWallAHobMm(
  context: UPlanContext,
): number | undefined {
  const hob = context.plan.bases.find((base) => base.role === "hob");
  if (hob?.wall !== "A") return undefined;
  const runA = context.runs.A;
  return fridgeWallOf(context.room) === "B"
    ? runA.endMm - hob.endMm
    : hob.startMm - runA.startMm;
}

/** N11.2 with RQ23, on a wall-A hob. With `free` mm after the hob and the 300 mm bottle:
 *  - under 300 the bottle cannot stand;
 *  - 600-899: a drawer fits without the bottle and none with it, so the drawer takes the place;
 *  - where the bottle costs wall A no door slot (`free mod 600 >= 300`, from 300 up), it cannot cost
 *    the room a drawer either (RQ21), so it stands.
 *  Where it costs wall A one slot but leaves it one or more (1200-1499 and so on), RQ21 decides by the
 *  room's count; `drawersBeatTheBottleFindings` holds that half. */
function wallABottleFindings(context: UPlanContext): readonly string[] {
  const freeMm = freeAfterAWallAHobMm(context);
  if (freeMm === undefined) return [];
  const order = runOrderOf(context);
  const afterTheHob = order[order.findIndex((base) => base.role === "hob") + 1];
  const hasBottle = afterTheHob?.buildId === BOTTLE;
  if (freeMm < BOTTLE_WIDTH_MM)
    return hasBottle ? ["a bottle in under 300 mm"] : [];
  if (freeMm >= MODULE_MM && freeMm < MODULE_MM + BOTTLE_WIDTH_MM) {
    return afterTheHob !== undefined && isDrawerExtra(afterTheHob)
      ? []
      : [
          `${String(freeMm)} mm after a wall-A hob is not a drawer unit (N11.2)`,
        ];
  }
  if (freeMm % MODULE_MM >= BOTTLE_WIDTH_MM && !hasBottle) {
    return [
      `no bottle with ${String(freeMm)} mm after a wall-A hob, though it costs wall A no slot`,
    ];
  }
  return [];
}

/** The arm where RQ23 and RQ21 together say the bottle must not have been dropped: the hob is on wall
 *  A with 1200 mm or more free after it, the bottle would cost wall A one slot without emptying it
 *  (`free mod 600 < 300`), no bottle stands, and the room is already at `N(T)`. */
export function isTheBottleNotOwedToADrawerArm(context: UPlanContext): boolean {
  const freeMm = freeAfterAWallAHobMm(context);
  if (freeMm === undefined) return false;
  const hasBottle = context.plan.bases.some((base) => base.buildId === BOTTLE);
  const drawerCount = context.plan.bases.filter(isDrawerUnit).length;
  return (
    freeMm >= 2 * MODULE_MM &&
    freeMm % MODULE_MM < BOTTLE_WIDTH_MM &&
    !hasBottle &&
    drawerCount >= drawerTargetOf(context.room)
  );
}

/** N11.2 with RQ23 and RQ21, in the arm above: a plain door base on the far wall shows the far wall
 *  could have taken the displaced drawer, so the bottle was dropped for nothing. */
function bottleDroppedWhileTheFarWallCanTakeTheDrawerFindings(
  context: UPlanContext,
): readonly string[] {
  if (!isTheBottleNotOwedToADrawerArm(context)) return [];
  const plainDoorsOnTheFarWall = basesOn(
    context.plan,
    farWallOf(context.room),
  ).filter((base) => base.buildId === DOOR);
  return plainDoorsOnTheFarWall.length === 0
    ? []
    : [
        "the bottle was dropped although the far wall could have taken the displaced drawer",
      ];
}

/** Every body inside its wall's run, no two overlapping, no gap between two bodies, and every bare
 *  run end under 600 mm on all three walls (A4, N8, N9.2). */
function geometryFindings({ runs, plan }: UPlanContext): readonly string[] {
  const findings: string[] = [];
  for (const wall of ["A", "B", "C"] as const) {
    const onWall = basesOn(plan, wall);
    onWall.forEach((base, index) => {
      if (base.startMm < runs[wall].startMm || base.endMm > runs[wall].endMm) {
        findings.push(`${base.id} outside wall ${wall}'s run`);
      }
      if (base.endMm - base.startMm !== base.widthMm) {
        findings.push(`${base.id}'s extent is not its width`);
      }
      const previous = onWall[index - 1];
      if (previous && base.startMm < previous.endMm) {
        findings.push(`${base.id} overlaps ${previous.id}`);
      }
      if (previous && base.startMm > previous.endMm) {
        findings.push(`bare gap between ${previous.id} and ${base.id}`);
      }
    });
    const first = onWall[0];
    if (wall !== "A" && first && first.startMm !== runs[wall].startMm) {
      findings.push(
        `bare gap between wall ${wall}'s corner-side run start and ${first.id}`,
      );
    }
    const bareMm = plan.remainderMm[wall];
    if (bareMm < 0 || bareMm > MAX_BARE_END_MM) {
      findings.push(`wall ${wall} bare end ${String(bareMm)} mm`);
    }
  }
  const ids = plan.bases.map((base) => base.id);
  if (new Set(ids).size !== ids.length) findings.push("duplicate body ids");
  return findings;
}

/** *N3 revised* 9, E4: exactly one oven — the tower with `base-hob-2drawer`, or `base-hob-oven`. */
function ovenFindings({ plan }: UPlanContext): readonly string[] {
  const findings: string[] = [];
  const towers = plan.bases.filter((base) => base.buildId === TOWER);
  const hobOvens = plan.bases.filter(
    (base) => base.buildId === "base-hob-oven",
  );
  if (towers.length + hobOvens.length !== 1) {
    findings.push(
      `${String(towers.length)} towers and ${String(hobOvens.length)} hob ovens`,
    );
  }
  const hob = plan.bases.find((base) => base.role === "hob");
  if (towers.length === 1 && hob?.buildId !== "base-hob-2drawer") {
    findings.push("a tower stands but the hob is not base-hob-2drawer");
  }
  if (towers.length > 0 !== (plan.towerPosition !== undefined)) {
    findings.push("towerPosition disagrees with the bodies");
  }
  return findings;
}

/** *N3 revised* 2-4, N9.2 and ADR 0110 N11.1: the fridge on the wider wall at its count from the
 *  corner, nothing on that wall ever a drawer unit, the bottle or a core body, and past the fridge only
 *  what the rule allows — pantries after a counted fridge, nothing after a free-end one. A dropped
 *  fridge's wall is door bases from its corner. */
export function fridgeWallFindings({
  room,
  runs,
  plan,
}: UPlanContext): readonly string[] {
  const findings: string[] = [];
  const wall = fridgeWallOf(room);
  const onWall = basesOn(plan, wall);
  for (const base of onWall) {
    if (isDrawerUnit(base))
      findings.push(`drawer unit ${base.id} on the fridge wall`);
    if (base.buildId === BOTTLE) findings.push("the bottle on the fridge wall");
    if (isCoreBody(base) || base.buildId === TOWER)
      findings.push(`${base.id} on the fridge wall`);
  }
  const fridge = plan.bases.find((base) => base.role === "fridge");
  if (fridge === undefined) {
    if (!plan.dropped.includes("fridge"))
      findings.push("no fridge and none dropped");
    onWall.forEach((base, index) => {
      if (
        base.buildId !== DOOR ||
        base.startMm !== runs[wall].startMm + index * MODULE_MM
      ) {
        findings.push(
          "a dropped fridge's wall is not door bases from its corner",
        );
      }
    });
    return findings;
  }
  if (fridge.wall !== wall)
    findings.push(`fridge on ${fridge.wall}, not ${wall}`);
  const placement = { room, runs, fridge, wall, onWall };
  const count = basesBeforeTheFridgeFor(placement);
  findings.push(
    ...(count === 0
      ? fridgeAtTheFreeEndFindings(placement)
      : countedFridgeFindings({ ...placement, count })),
  );
  return findings;
}

interface FridgePlacement {
  readonly room: DesignRoom;
  readonly runs: URuns;
  readonly fridge: Base;
  readonly wall: DesignWall;
  readonly onWall: readonly Base[];
}

/** *N3 revised* 3: 0 (at the free end) for a wall of 3000 mm or less, 2 for 3001-4000, 3 above, and
 *  it falls one at a time where the bases and the fridge do not fit the wall's free run. */
function basesBeforeTheFridgeFor({
  room,
  runs,
  fridge,
  wall,
}: FridgePlacement): number {
  const run = runs[wall];
  const lengthMm = enteredMm(room, wall);
  let count = lengthMm <= SHORT_WALL_MAX_MM ? 0 : lengthMm <= 4000 ? 2 : 3;
  while (
    count > 0 &&
    count * MODULE_MM + fridge.widthMm > run.endMm - run.startMm
  )
    count -= 1;
  return count;
}

/** N11.1, *N3 revised* 3 ("door storage between it and the corner and any bare remainder beyond it"):
 *  door bases contiguous from the run's start, the fridge last, and under one module bare beyond it
 *  with nothing standing there — no pantry and no door, whatever the remainder's width. */
function fridgeAtTheFreeEndFindings({
  runs,
  fridge,
  wall,
  onWall,
}: FridgePlacement): readonly string[] {
  const findings: string[] = [];
  const run = runs[wall];
  const beforeTheFridge = onWall.filter(
    (base) => base.startMm < fridge.startMm,
  );
  const isDoorStorageFromTheCorner =
    beforeTheFridge.every(
      (base, index) =>
        base.buildId === DOOR &&
        base.startMm === run.startMm + index * MODULE_MM,
    ) && fridge.startMm === run.startMm + beforeTheFridge.length * MODULE_MM;
  if (!isDoorStorageFromTheCorner) {
    findings.push(
      "a free-end fridge is not door storage from the corner and then the fridge",
    );
  }
  if (onWall[onWall.length - 1] !== fridge) {
    findings.push("something stands beyond a free-end fridge");
  }
  if (run.endMm - fridge.endMm >= MODULE_MM) {
    findings.push("a free-end fridge leaves a whole module or more bare");
  }
  return findings;
}

/** *N3 revised* 3-4: `count` door bases from the corner, then the fridge, then only pantries of
 *  400-800 mm — or, in a room lower than the column, door bases (N11.4) — and a gap of 400 mm or more
 *  is never left empty. Applies to a counted position only. */
function countedFridgeFindings({
  room,
  runs,
  fridge,
  wall,
  onWall,
  count,
}: FridgePlacement & { readonly count: number }): readonly string[] {
  const findings: string[] = [];
  const run = runs[wall];
  if (fridge.startMm !== run.startMm + count * MODULE_MM) {
    findings.push(`fridge not after ${String(count)} bases from the corner`);
  }
  const beyond = onWall.filter((base) => base.startMm >= fridge.endMm);
  const gapBuildId = room.heightMm < COLUMN_HEIGHT_MM ? DOOR : PANTRY;
  if (beyond.some((base) => base.buildId !== gapBuildId)) {
    findings.push(
      `something other than ${gapBuildId} between the fridge and the free end`,
    );
  }
  if (
    beyond.some(
      (base) =>
        base.buildId === PANTRY &&
        (base.widthMm < PANTRY_MIN_MM || base.widthMm > PANTRY_MAX_MM),
    )
  ) {
    findings.push("a fridge-gap pantry outside 400-800 mm");
  }
  const smallestFillMm = gapBuildId === PANTRY ? PANTRY_MIN_MM : MODULE_MM;
  if (run.endMm - fridge.endMm >= smallestFillMm && beyond.length === 0) {
    findings.push(
      `a fridge gap of ${String(smallestFillMm)} mm or more with no ${gapBuildId}`,
    );
  }
  return findings;
}

/** *N3 revised* 5: sink first, then dishwasher, preparation, hob, contiguous in run order; the
 *  dishwasher drops before the preparation. */
function coreRunFindings(context: UPlanContext): readonly string[] {
  const findings: string[] = [];
  const order = runOrderOf(context);
  const coreRoles = order.filter(isCoreBody).map(coreRoleOf);
  const expected = CORE_ORDER.filter((role) => coreRoles.includes(role));
  if (coreRoles.join() !== expected.join())
    findings.push(`core order ${coreRoles.join()}`);
  if (order.slice(0, coreRoles.length).some((base) => !isCoreBody(base))) {
    findings.push("the core run is not contiguous from wall A's fridge corner");
  }
  if (order[0]?.role !== "sink")
    findings.push("the sink is not the first body on wall A");
  if (!coreRoles.includes("preparation") && coreRoles.includes("dishwasher")) {
    findings.push("the dishwasher kept while the preparation was dropped");
  }
  return findings;
}

/** *N3 revised* 6, RQ18, RQ19: drawer units ≤ N(T), extras between the hob and the tower only,
 *  pan drawers first and nearest the hob, and the split keyed on the cabinets the room gets. */
function drawerFindings(context: UPlanContext): readonly string[] {
  const findings: string[] = [];
  const order = runOrderOf(context);
  const hobIndex = order.findIndex((base) => base.role === "hob");
  const towerIndex = order.findIndex((base) => base.buildId === TOWER);
  const cabinetCount = context.plan.bases.filter(isDrawerUnit).length;
  if (cabinetCount > drawerTargetOf(context.room))
    findings.push("more drawer units than N(T)");

  const extras = order.filter(isDrawerExtra);
  for (const extra of extras) {
    const index = order.indexOf(extra);
    if (index < hobIndex) findings.push(`${extra.id} before the hob`);
    if (towerIndex !== -1 && index > towerIndex)
      findings.push(`${extra.id} after the tower`);
  }
  const panDrawers = extras.filter(
    (base) => base.buildId === PAN_DRAWER,
  ).length;
  const expectedPanDrawers = Math.min(extras.length, cabinetCount >= 4 ? 2 : 1);
  if (panDrawers !== expectedPanDrawers) {
    findings.push(
      `${String(panDrawers)} pan drawers among ${String(cabinetCount)} drawer cabinets`,
    );
  }
  const firstThreeDrawer = extras.findIndex(
    (base) => base.buildId === THREE_DRAWER,
  );
  const lastPanDrawer = extras
    .map((base) => base.buildId)
    .lastIndexOf(PAN_DRAWER);
  if (firstThreeDrawer !== -1 && lastPanDrawer > firstThreeDrawer) {
    findings.push("a pan drawer after a 3-drawer extra");
  }
  findings.push(...drawersFollowTheHobFindings(order.slice(hobIndex + 1)));
  return findings;
}

/** After the hob come the bottle, then the drawer extras, with nothing between them. */
function drawersFollowTheHobFindings(
  afterTheHob: readonly Base[],
): readonly string[] {
  const findings: string[] = [];
  let hasPassedTheGroup = false;
  afterTheHob.forEach((base, index) => {
    const isGroupBody =
      isDrawerExtra(base) || (base.buildId === BOTTLE && index === 0);
    if (isGroupBody && hasPassedTheGroup)
      findings.push(`${base.id} stands apart from the hob`);
    if (!isGroupBody) hasPassedTheGroup = true;
  });
  return findings;
}

/** *N3 revised* 7, RQ16, RQ20: at most one bottle, on the hob's wall, touching the hob's far edge in
 *  run direction. */
function bottleFindings(context: UPlanContext): readonly string[] {
  const bottles = context.plan.bases.filter((base) => base.buildId === BOTTLE);
  if (bottles.length > 1) return ["more than one bottle"];
  const bottle = bottles[0];
  const hob = context.plan.bases.find((base) => base.role === "hob");
  if (bottle === undefined || hob === undefined) return [];
  if (bottle.wall !== hob.wall) return ["the bottle is not on the hob's wall"];
  const order = runOrderOf(context);
  const isNext = order.indexOf(bottle) === order.indexOf(hob) + 1;
  const isTouching =
    bottle.startMm === hob.endMm || bottle.endMm === hob.startMm;
  return isNext && isTouching
    ? []
    : ["the bottle is not directly after the hob"];
}

/** RQ21 (AC1 (c)): while the room has fewer drawer cabinets than N(T), no plain door follows the hob,
 *  and the bottle's width plus its wall's bare end and widened pantries could not hold a 600 drawer. */
function drawersBeatTheBottleFindings(
  context: UPlanContext,
): readonly string[] {
  const { room, plan } = context;
  if (plan.bases.filter(isDrawerUnit).length >= drawerTargetOf(room)) return [];
  const findings: string[] = [];
  const order = runOrderOf(context);
  const hobIndex = order.findIndex((base) => base.role === "hob");
  if (order.slice(hobIndex + 1).some((base) => base.buildId === DOOR)) {
    findings.push("a plain door after the hob while drawer units are owed");
  }
  const bottle = plan.bases.find((base) => base.buildId === BOTTLE);
  if (bottle) {
    const widenedMm = basesOn(plan, bottle.wall)
      .filter((base) => base.buildId === PANTRY && base.widthMm > MODULE_MM)
      .reduce((sum, base) => sum + base.widthMm - MODULE_MM, 0);
    if (
      plan.remainderMm[bottle.wall] + bottle.widthMm + widenedMm >=
      MODULE_MM
    ) {
      findings.push(
        "the bottle stands where a drawer unit the count owes would fit",
      );
    }
  }
  return findings;
}

/** The overflowed core on the far wall, which the tower's count and width both start from. */
function overflowOf({ room, plan }: UPlanContext): readonly Base[] {
  return basesOn(plan, farWallOf(room)).filter(isCoreBody);
}

/** N10.3 step 2, re-derived: the tower stands exactly when it would stand with nothing but the
 *  overflowed core before it (the layout with nothing added). Needs the room's height, a whole core, and on
 *  a far wall ≤ 3000 one free module; above 3000, room for the tower after `max(n, overflow)`
 *  bodies. */
export function towerIsOwed(context: UPlanContext): boolean {
  const { room, runs, plan } = context;
  if (room.heightMm < COLUMN_HEIGHT_MM || plan.dropped.length > 0) return false;
  const farWall = farWallOf(room);
  const overflow = overflowOf(context);
  const capacityMm =
    runs[farWall].endMm - runs[farWall].startMm - overflow.length * MODULE_MM;
  const lengthMm = enteredMm(room, farWall);
  if (lengthMm <= SHORT_WALL_MAX_MM) return capacityMm >= MODULE_MM;
  const countFromTheCornerMm =
    Math.max(0, (lengthMm <= 4000 ? 2 : 3) - overflow.length) * MODULE_MM;
  return countFromTheCornerMm + MODULE_MM <= capacityMm;
}

/** N10.3 step 3, re-derived for a far wall over 3000 mm below 10 m: the pantries the far wall had
 *  with nothing but the overflow before the tower (up to two, 600 mm, outboard of it). */
export function farWallPantriesOwed(context: UPlanContext): number | undefined {
  const { room, runs } = context;
  const farWall = farWallOf(room);
  const lengthMm = enteredMm(room, farWall);
  if (
    isLargeURoom(room) ||
    lengthMm <= SHORT_WALL_MAX_MM ||
    !towerIsOwed(context)
  )
    return undefined;
  const overflowCount = overflowOf(context).length;
  const towerEndMm =
    runs[farWall].startMm +
    overflowCount * MODULE_MM +
    Math.max(0, (lengthMm <= 4000 ? 2 : 3) - overflowCount) * MODULE_MM +
    MODULE_MM;
  return Math.min(
    2,
    Math.floor((runs[farWall].endMm - towerEndMm) / MODULE_MM),
  );
}

/** AC1 (d), (e): the tower on the far wall, kept or absent exactly as owed, never before `n` bodies
 *  on a long far wall and at most `max(n, overflow + bottle + extras)`; on a short far wall nothing
 *  but pantries beyond it; no pantry on a large U's far wall, and no far-wall pantry lost. */
function towerFindings(context: UPlanContext): readonly string[] {
  const { room, plan } = context;
  const findings: string[] = [];
  const tower = plan.bases.find((base) => base.buildId === TOWER);
  if ((tower !== undefined) !== towerIsOwed(context)) {
    findings.push(tower ? "a tower gained" : "the tower lost");
  }
  const farWall = farWallOf(room);
  const onFar = basesOn(plan, farWall);
  const pantries = onFar.filter((base) => base.buildId === PANTRY).length;
  if (isLargeURoom(room) && pantries > 0)
    findings.push("a pantry on a large U's far wall");
  const pantriesOwed = farWallPantriesOwed(context);
  if (pantriesOwed !== undefined && pantries !== pantriesOwed) {
    findings.push(
      `${String(pantries)} far-wall pantries, ${String(pantriesOwed)} owed`,
    );
  }
  if (tower === undefined) return findings;
  if (tower.wall !== farWall)
    return [...findings, "the tower is not on the far wall"];
  const lengthMm = enteredMm(room, farWall);
  const before = onFar.filter((base) => base.endMm <= tower.startMm);
  const after = onFar.filter((base) => base.startMm >= tower.endMm);
  if (lengthMm <= SHORT_WALL_MAX_MM) {
    if (after.some((base) => base.buildId !== PANTRY))
      findings.push("a base beyond a free-end block");
    return findings;
  }
  const n = lengthMm <= 4000 ? 2 : 3;
  const placedBefore = before.filter(
    (base) =>
      isCoreBody(base) || base.buildId === BOTTLE || isDrawerExtra(base),
  ).length;
  if (before.length < n)
    findings.push("the tower before n bodies from the corner");
  if (before.length > Math.max(n, placedBefore))
    findings.push("the tower past its bound");
  if (plan.towerPosition !== n) findings.push("towerPosition is not n");
  return findings;
}
