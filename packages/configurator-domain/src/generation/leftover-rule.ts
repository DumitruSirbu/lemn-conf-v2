import { MAX_EMPTY_COLUMN_WIDTH_MM } from "../module-grid.js";

/** The owner's default storage module and strict maximum bare run end (ADR 0110 A4). */
export const STORAGE_BODY_WIDTH_MM = 600;
export const MAX_GENERATED_LEFTOVER_MM = STORAGE_BODY_WIDTH_MM - 1;

export interface LeftoverPlan {
  readonly storageCount: number;
  readonly remainderMm: number;
}

/** Fills a non-negative free end with whole storage modules and leaves less than one module. */
export function planLeftover(freeEndMm: number): LeftoverPlan {
  if (!Number.isInteger(freeEndMm) || freeEndMm < 0) {
    throw new Error(
      "planLeftover: freeEndMm must be a non-negative whole millimetre value",
    );
  }
  const storageCount = Math.floor(freeEndMm / STORAGE_BODY_WIDTH_MM);
  return {
    storageCount,
    remainderMm: freeEndMm - storageCount * STORAGE_BODY_WIDTH_MM,
  };
}

// The absorb arithmetic below is shared by E6's tower opening (`tall-end-rule.ts`) and M7C wave C5's fridge end
// (`fridge-end-leftover.ts`). It is internal to generation: `index.ts` names this module's public exports.

/** How far a body of `widthMm` may grow before it passes the ceiling on an empty space (ADR 0052).
 *
 *  **It is the space ceiling, and the owner's "up to 800 mm" is the cabinet ceiling** (`CABINETRY_MAX_WIDTH_MM`,
 *  `catalog.ts`; §7). Two rules that carry the same figure: a widened cabinet is also a floor tile the
 *  shell cuts for it, so both bind, and the space ceiling is the one read here because the catalogue's
 *  must never be the lower (asserted in `leftover-absorbed-beside-a-fixed-body.test.ts`, so a plan never sizes a
 *  cabinet the catalogue cannot build). E6 reads this as it stands, whole millimetres. */
export function headroomBelowTheCeilingMm(widthMm: number): number {
  return Math.max(0, MAX_EMPTY_COLUMN_WIDTH_MM - widthMm);
}

/** M7C wave C5, the owner's Q6 (2026-10-01): a leftover this wide or wider stays bare. */
export const ABSORBED_LEFTOVER_BELOW_MM = 300;

/** The owner's own step: the cabinet *"grows in 50 mm steps"* (Q6; ADR 0110 Amendment O). It is not the
 *  editor's width stepper, whose step ADR 0035 d8 keeps presentation-only, so it is not read from it. */
export const ABSORB_STEP_MM = 50;

/**
 * How much of the leftover beyond a **fixed-width end body** (the fridge) the fit-width base inboard of
 * it takes: the owner's *"grows in 50 mm steps up to 800 mm"*, so whole steps of the leftover, and whole
 * steps of the room the ceiling leaves — a base that is not a whole step wide stops short of 800 rather
 * than growing by a part of a step. Nothing from `ABSORBED_LEFTOVER_BELOW_MM` up. The end body moves
 * outward by the same amount, and what the base cannot take stays bare beyond it.
 *
 * E6's absorb reads `headroomBelowTheCeilingMm` as it stands: it takes a remainder whole, not in steps.
 */
export function leftoverAbsorbedBesideAFixedBody(input: {
  readonly neighbourWidthMm: number;
  readonly leftoverMm: number;
}): number {
  const { neighbourWidthMm, leftoverMm } = input;
  if (leftoverMm >= ABSORBED_LEFTOVER_BELOW_MM) return 0;
  const growthMm = Math.min(
    wholeStepsIn(leftoverMm),
    wholeStepsIn(headroomBelowTheCeilingMm(neighbourWidthMm)),
  );
  return Math.max(0, growthMm);
}

function wholeStepsIn(widthMm: number): number {
  return Math.floor(widthMm / ABSORB_STEP_MM) * ABSORB_STEP_MM;
}
