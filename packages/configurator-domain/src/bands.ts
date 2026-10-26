// `DEVELOPMENT-SPEC.md` §5.2's band gate, and the one place `top` is reconciled with it.
//
// ADR 0011 Gap C: §5.2 derives a slot's target band as `column | base | wall` and never yields
// `top`, so the six seeded `band: "top"` entries were refused from every opening in the product —
// including their own frame on a swap in place. `top` is a *row*, not a catalogue band: it records
// which module line a seeded instance stands on. Both the gate and the offer list therefore compare
// normalised bands, and that normalisation lives here so the two cannot drift apart.
import { toMillimetres } from "./millimetres.js";
import { isTopRowFloorMm } from "./push-to-open.js";
import type { Band } from "./void-engine.js";

/** The bands §5.2 actually reasons about. `top` is absent by construction. */
export type NormalisedBand = "base" | "wall" | "column";

/** §5.2: a slot this tall or taller targets `column`. Never a test on the *body's* height — a
 *  1800 mm freestanding fridge is full-height and an `h >= 1.9` body test refuses it (§11 row 4). */
export const COLUMN_SLOT_MIN_HEIGHT_M = 1.9;

/** §5.2: a slot starting below this stands on the floor and targets `base`. */
export const FLOOR_SLOT_MAX_Y0_M = 0.2;

/** §6.5 / §11 row 13: a body placed at or above this module line ships push-to-open by default,
 *  with its handles built and hidden. Decided by the slot, not by the body's catalogue band. */
export const TOP_ROW_Y0_M = 2.2;

const NORMALISED_BANDS: Readonly<Record<Band, NormalisedBand>> = {
  base: "base",
  wall: "wall",
  top: "wall",
  column: "column",
};

export function normaliseBand(band: Band): NormalisedBand {
  return NORMALISED_BANDS[band];
}

export interface SlotExtent {
  readonly y0: number;
  readonly h: number;
}

/** §5.2: `void.h >= 1.9 ? 'column' : void.y0 < 0.2 ? 'base' : 'wall'`. */
export function deriveSlotBand(slot: SlotExtent): NormalisedBand {
  if (slot.h >= COLUMN_SLOT_MIN_HEIGHT_M) return "column";
  if (slot.y0 < FLOOR_SLOT_MAX_Y0_M) return "base";
  return "wall";
}

/** §5.2's gate, stated as its accepting half: a column body goes anywhere, a column slot takes
 *  anything, and otherwise the bands must match. A wall carcass has no plinth and no worktop, so
 *  it cannot stand on the floor; a base cabinet cannot hang (§11 rows 3, 4). */
export function isBandAccepted(
  bodyBand: NormalisedBand,
  slotBand: NormalisedBand,
): boolean {
  if (bodyBand === "column" || slotBand === "column") return true;
  return bodyBand === slotBand;
}

/** §6.5: no recorded handle mode plus a top-row slot means push-to-open. The handles are still
 *  built and hidden, so `canHandle` stays true and the customer can turn them back on. Delegates to
 *  `isTopRowFloorMm`, the one derivation of the module line, so no reader keeps a second comparison. */
export function isPushOpenByDefault(y0M: number): boolean {
  return isTopRowFloorMm(toMillimetres(y0M));
}
