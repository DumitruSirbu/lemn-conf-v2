// M7C wave C5 slice S1 — what a test needs to read the owner's Q6 (2026-10-01) off a plan, stated here as
// the owner's words and never imported from the rule it checks (ADR 0121 decision 3(b)): a test that read
// the production constants would agree with a changed constant by construction.
//
// *"Absorb gaps under 300 mm"*: where the fridge ends a run and a door cabinet stands directly inboard of
// it, the cabinet grows in 50 mm steps up to 800 mm and the fridge moves out by the same amount.
import type { DesignWall, UPlannedGenerationBase } from "../../src/index.js";

/** What the owner's rule reads and rewrites: an L's, a straight kitchen's or a U's plan, whose walls and
 *  bases are a superset of the L's. */
export interface PlanOfWalls {
  readonly bases: readonly UPlannedGenerationBase[];
  readonly floorWidthsMm: Readonly<
    Partial<Record<DesignWall, readonly number[]>>
  >;
  readonly remainderMm: Readonly<Partial<Record<DesignWall, number>>>;
}
type KitchenCompositionPlan = Pick<PlanOfWalls, "bases">;
type PlannedGenerationBase = UPlannedGenerationBase;
type Wall = DesignWall;

export const OWNERS_ABSORB_BELOW_MM = 300;
export const OWNERS_ABSORB_STEP_MM = 50;
export const OWNERS_CABINET_CEILING_MM = 800;
export const ONE_STORAGE_MODULE_MM = 600;
export const DOOR_CABINET = "base-cabinet";

/** The owner's rule as arithmetic: *"grows in 50 mm steps up to 800 mm"*, so the cabinet takes whole steps
 *  of the leftover and whole steps of the room left under 800, and never a negative amount. */
export function absorbedByTheOwnersRuleMm(args: {
  readonly leftoverMm: number;
  readonly cabinetWidthMm: number;
}): number {
  const { leftoverMm, cabinetWidthMm } = args;
  if (leftoverMm >= OWNERS_ABSORB_BELOW_MM) return 0;
  const steps = (mm: number) =>
    Math.floor(mm / OWNERS_ABSORB_STEP_MM) * OWNERS_ABSORB_STEP_MM;
  return Math.max(
    0,
    Math.min(
      steps(leftoverMm),
      steps(OWNERS_CABINET_CEILING_MM - cabinetWidthMm),
    ),
  );
}

/** The base standing directly inboard of `wall`'s outermost body, where that body is the fridge. */
export function bodyInboardOfTheEndFridge(
  plan: KitchenCompositionPlan,
  wall: Wall,
): PlannedGenerationBase | undefined {
  const alongTheWall = plan.bases
    .filter((base) => base.wall === wall)
    .sort((left, right) => left.startMm - right.startMm);
  const fridge = alongTheWall.at(-1);
  if (fridge?.role !== "fridge") return undefined;
  return alongTheWall.at(-2);
}

/** The door cabinet the owner's rule may widen on `wall`: the door cabinet inboard of its end fridge. */
export function fridgeEndCabinetOf(
  plan: KitchenCompositionPlan,
  wall: Wall,
): PlannedGenerationBase | undefined {
  const inboard = bodyInboardOfTheEndFridge(plan, wall);
  return inboard?.buildId === DOOR_CABINET ? inboard : undefined;
}

/** How far `wall`'s end-fridge cabinet stands past one storage module; 0 where there is none. */
export function widenedBesideTheEndFridgeMm(
  plan: KitchenCompositionPlan,
  wall: Wall,
): number {
  const cabinet = fridgeEndCabinetOf(plan, wall);
  return cabinet === undefined ? 0 : cabinet.widthMm - ONE_STORAGE_MODULE_MM;
}

/**
 * What the owner's rule gives `wall`'s end-fridge cabinet, worked out from the free run's end and the
 * fridge's own span, never from the plan's remainder: the leftover before the move is the run's end less
 * where the fridge stood before it moved out, which is its end now less what the cabinet took.
 */
export function ruledWidenBesideTheEndFridgeMm(
  plan: KitchenCompositionPlan,
  wall: Wall,
  runEndMm: number,
): number {
  const fridge = plan.bases.find(
    (base) => base.wall === wall && base.role === "fridge",
  );
  if (fridge === undefined || fridgeEndCabinetOf(plan, wall) === undefined) {
    return 0;
  }
  const leftoverMm =
    runEndMm - fridge.endMm + widenedBesideTheEndFridgeMm(plan, wall);
  return absorbedByTheOwnersRuleMm({
    leftoverMm,
    cabinetWidthMm: ONE_STORAGE_MODULE_MM,
  });
}

/**
 * The width a composed storage slot stands at: one module, plus what the owner's rule gives it where it is
 * the door cabinet beside an end fridge. `runEndMm` is the free run's end on the slot's wall.
 */
export function ruledSlotWidthMm(
  plan: KitchenCompositionPlan,
  slot: PlannedGenerationBase,
  runEndMm: number,
): number {
  const isTheFridgeEndCabinet = slot === fridgeEndCabinetOf(plan, slot.wall);
  return (
    ONE_STORAGE_MODULE_MM +
    (isTheFridgeEndCabinet
      ? ruledWidenBesideTheEndFridgeMm(plan, slot.wall, runEndMm)
      : 0)
  );
}

/** The plan the owner's Q6 makes of a plan the planner made without it: the cabinet inboard of an end
 *  fridge takes the owner's share of the leftover and the fridge moves out by the same amount. Written from
 *  the owner's words and the run's own end, and never from the leaf under test. */
export function planAfterTheOwnersRule<Plan extends PlanOfWalls>(
  before: Plan,
  runs: Readonly<Partial<Record<DesignWall, { readonly endMm: number }>>>,
): Plan {
  const fridge = before.bases.find((base) => base.role === "fridge");
  const runEndMm = fridge === undefined ? undefined : runs[fridge.wall]?.endMm;
  const cabinet =
    fridge === undefined
      ? undefined
      : bodyInboardOfTheEndFridge(before, fridge.wall);
  if (
    fridge === undefined ||
    runEndMm === undefined ||
    cabinet?.buildId !== DOOR_CABINET
  ) {
    return before;
  }
  const takenMm = absorbedByTheOwnersRuleMm({
    leftoverMm: runEndMm - fridge.endMm,
    cabinetWidthMm: cabinet.widthMm,
  });
  if (takenMm === 0) return before;
  const bases = before.bases.map((base) => {
    if (base === cabinet) {
      return {
        ...base,
        widthMm: base.widthMm + takenMm,
        endMm: base.endMm + takenMm,
      };
    }
    return base === fridge
      ? {
          ...base,
          startMm: base.startMm + takenMm,
          endMm: base.endMm + takenMm,
        }
      : base;
  });
  const { wall } = fridge;
  return {
    ...before,
    bases,
    floorWidthsMm: {
      ...before.floorWidthsMm,
      [wall]: bases
        .filter((base) => base.wall === wall)
        .sort((left, right) => left.startMm - right.startMm)
        .map((base) => base.widthMm),
    },
    remainderMm: {
      ...before.remainderMm,
      [wall]: (before.remainderMm[wall] ?? 0) - takenMm,
    },
  };
}
