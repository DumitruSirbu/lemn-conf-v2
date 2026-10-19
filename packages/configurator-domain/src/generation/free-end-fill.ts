// ADR 0167: every free wall-run end that the narrowest cabinet of its column fits is filled with one base
// cabinet built to exactly that width (D1, D3); a narrower end stays bare, with no filler (D2).
//
// Where the run ends with full-height bodies the fill stands between the run and them, and they move outward
// by the fill's width to end at the run's end (D5, the owner's Q-2 = "between", Q-7). That is
// `fridge-end-leftover.ts`'s move, widened from one fridge to the group. A body whose place is counted from
// the corner (ADR 0110 N3 revised 3 and 10) never moves, so on a long U side wall the group is whatever
// stands outboard of it; where nothing full-height ends the run, the fill takes the run's end.
//
// A plan in, a plan out, after every absorb (D4): E6 and O10 take what they take first, and the fill reads
// the remainder they leave. One leaf for the L, the straight kitchen and the U. The fill is a planned base of
// its own, so the shell tiles it, composition never joins its tile to a neighbour's (D6), and an upper and a
// top follow it by the ordinary rules (Amendment C / F2, O9).
//
// No catalogue and no room: the floor, the full-height test, the runs and the counted bodies are the caller's,
// read from the catalogue and the plan (ADR 0102).

import type { DesignWall } from "../design.js";
import { DOOR_BASE_BUILD_ID } from "./body-choice.js";
import type { AbsorbablePlan } from "./fridge-end-leftover.js";
import {
  basesAlongWall,
  plannedBaseAt,
  type KitchenCompositionPlan,
  type UKitchenCompositionPlan,
  type UPlannedGenerationBase,
} from "./run-layout.js";
import { OVEN_TOWER_BUILD_ID } from "./tall-end-rule.js";

const FILLABLE_WALLS: readonly DesignWall[] = ["A", "B", "C"];

/** What the fill reads and rewrites: the same bases, floor widths and remainders the fridge absorb does, and
 *  whether the plan met the minimum kitchen (a refused plan holds no bases and states its whole capacity as
 *  its remainder, which is not a bare end to fill). */
export type FillablePlan = AbsorbablePlan & { readonly minimumMet: boolean };

/** A wall's free run, corner to free end, in the plan's own along-wall millimetres. */
export interface FreeRunMm {
  readonly startMm: number;
  readonly endMm: number;
}

export interface FreeEndFillRule {
  /** The narrowest width the filled column's bodies all share (D2), from the catalogue. */
  readonly floorMm: number;
  /** Whether a body of this build rises into the wall row: ADR 0110 E7's own predicate (`risesIntoWallRow`). */
  readonly isFullHeight: (buildId: string) => boolean;
  readonly runs: Readonly<Partial<Record<DesignWall, FreeRunMm>>>;
  /** The bodies whose place is counted from the corner, which the fill never moves (D5). */
  readonly countedIds: ReadonlySet<string>;
}

/** The plan with each wall's remainder of at least `rule.floorMm` filled by one base cabinet of exactly that
 *  width, and the plan unchanged where a wall's remainder is narrower or the plan met no minimum. */
export function withTheFreeEndsFilled<Plan extends FillablePlan>(
  plan: Plan,
  rule: FreeEndFillRule,
): Plan {
  if (!plan.minimumMet) return plan;
  return FILLABLE_WALLS.reduce(
    (filled, wall) => withTheFreeEndOfFilled(filled, wall, rule),
    plan,
  );
}

/** Whether `base` is a free-end fill, which `generateKitchen` inserts in a pass of its own after the free-end
 *  resizes. The id convention is this module's alone. */
export function isAFreeEndFill(
  base: Pick<UPlannedGenerationBase, "id" | "wall">,
): boolean {
  return base.id === fillIdOn(base.wall);
}

/** The ids of the U's bodies counted from the corner: the fridge at `n` bases from it, and the far wall's oven
 *  tower likewise. The L and the straight kitchen count nothing (ADR 0110 *N3 revised* 3 and 10 are U-only). */
export function countedBodyIdsOf(
  plan: KitchenCompositionPlan | UKitchenCompositionPlan,
): ReadonlySet<string> {
  if (!("fridgePosition" in plan)) return new Set();
  const counted = plan.bases.filter(
    (base) =>
      (base.role === "fridge" && typeof plan.fridgePosition === "number") ||
      (base.buildId === OVEN_TOWER_BUILD_ID &&
        typeof plan.towerPosition === "number"),
  );
  return new Set(counted.map((base) => base.id));
}

/** `wall-a-remainder:A` on wall A, keeping the id ADR 0110 N11.9's back-wall fill carried. */
function fillIdOn(wall: DesignWall): string {
  return `wall-${wall.toLowerCase()}-remainder:${wall}`;
}

function withTheFreeEndOfFilled<Plan extends FillablePlan>(
  plan: Plan,
  wall: DesignWall,
  rule: FreeEndFillRule,
): Plan {
  const run = rule.runs[wall];
  const remainderMm = plan.remainderMm[wall];
  if (run === undefined || remainderMm === undefined) return plan;
  if (remainderMm < rule.floorMm) return plan;

  const alongTheWall = basesAlongWall(plan.bases, wall);
  refuseARemainderThatIsNotTheRunsEnd(wall, run, alongTheWall, remainderMm);
  const endGroup = endGroupOf(alongTheWall, rule);
  const fill = plannedBaseAt({
    id: fillIdOn(wall),
    role: "storage",
    buildId: DOOR_BASE_BUILD_ID,
    widthMm: remainderMm,
    wall,
    startMm: endGroup[0]?.startMm ?? run.endMm - remainderMm,
  });
  const bases = withTheFillPlaced({
    bases: plan.bases,
    fill,
    alongTheWall,
    endGroup,
  });
  return {
    ...plan,
    bases,
    floorWidthsMm: {
      ...plan.floorWidthsMm,
      [wall]: basesAlongWall(bases, wall).map((base) => base.widthMm),
    },
    remainderMm: { ...plan.remainderMm, [wall]: 0 },
  };
}

/** The remainder is the plan's own statement of the bare end; the fill stands where the bases' geometry
 *  says that end is, so a plan whose two accounts differ would fill the wrong span. */
function refuseARemainderThatIsNotTheRunsEnd(
  wall: DesignWall,
  run: FreeRunMm,
  alongTheWall: readonly UPlannedGenerationBase[],
  remainderMm: number,
): void {
  const lastEndMm = alongTheWall.at(-1)?.endMm ?? run.startMm;
  if (lastEndMm + remainderMm === run.endMm) return;
  throw new Error(
    `withTheFreeEndsFilled: wall ${wall}'s bases end at ${String(lastEndMm)} mm and its remainder is ${String(remainderMm)} mm, which is not its run's end at ${String(run.endMm)} mm`,
  );
}

/** The full-height bodies standing contiguously at the run's end, innermost first, stopping at the first body
 *  that is not full-height, is counted from the corner, or does not abut the group. Empty where the run ends
 *  with a base or with a counted body. */
function endGroupOf(
  alongTheWall: readonly UPlannedGenerationBase[],
  rule: FreeEndFillRule,
): readonly UPlannedGenerationBase[] {
  const group: UPlannedGenerationBase[] = [];
  for (const base of [...alongTheWall].reverse()) {
    const abutsTheGroup =
      group.length === 0 || base.endMm === group[0]?.startMm;
    const joinsTheGroup =
      abutsTheGroup &&
      rule.isFullHeight(base.buildId) &&
      !rule.countedIds.has(base.id);
    if (!joinsTheGroup) break;
    group.unshift(base);
  }
  return group;
}

/** The plan's bases with the end group moved outward by the fill's width and the fill in the group's place, or
 *  after the wall's last base where no group stands. The array keeps its wall's bases in spatial order. */
function withTheFillPlaced(args: {
  readonly bases: readonly UPlannedGenerationBase[];
  readonly fill: UPlannedGenerationBase;
  readonly alongTheWall: readonly UPlannedGenerationBase[];
  readonly endGroup: readonly UPlannedGenerationBase[];
}): readonly UPlannedGenerationBase[] {
  const { bases, fill, alongTheWall, endGroup } = args;
  const moved = bases.map((base) =>
    endGroup.includes(base)
      ? plannedBaseAt({ ...base, startMm: base.startMm + fill.widthMm })
      : base,
  );
  const [firstOfGroup] = endGroup;
  if (firstOfGroup !== undefined) {
    const at = bases.indexOf(firstOfGroup);
    return [...moved.slice(0, at), fill, ...moved.slice(at)];
  }
  const lastOnTheWall = alongTheWall.at(-1);
  if (lastOnTheWall === undefined) return [...moved, fill];
  const after = bases.indexOf(lastOnTheWall) + 1;
  return [...moved.slice(0, after), fill, ...moved.slice(after)];
}
