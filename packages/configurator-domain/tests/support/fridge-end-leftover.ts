// M7C wave C5 slice S1 — what a test needs to read the owner's Q6 (2026-10-01) off a plan, stated here as
// the owner's words and never imported from the rule it checks (ADR 0121 decision 3(b)): a test that read
// the production constants would agree with a changed constant by construction.
//
// *"Absorb gaps under 300 mm"*: where the fridge ends a run and a door cabinet stands directly inboard of
// it, the cabinet grows in 50 mm steps up to 800 mm and the fridge moves out by the same amount.
import type {
  KitchenCompositionPlan,
  PlannedGenerationBase,
} from "../../src/index.js";

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
  wall: "A" | "B",
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
  wall: "A" | "B",
): PlannedGenerationBase | undefined {
  const inboard = bodyInboardOfTheEndFridge(plan, wall);
  return inboard?.buildId === DOOR_CABINET ? inboard : undefined;
}

/** How far `wall`'s end-fridge cabinet stands past one storage module; 0 where there is none. */
export function widenedBesideTheEndFridgeMm(
  plan: KitchenCompositionPlan,
  wall: "A" | "B",
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
  wall: "A" | "B",
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
