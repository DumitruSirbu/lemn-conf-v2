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
