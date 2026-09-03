// Wave 6E: the two whole-kitchen settings, as commands.
//
// `set-appearance.ts` one scope up. `setFinish` and `setHandle` are **per placement**; these two are
// the settings that are never per cabinet — the material every carcass is made of and the hardware
// brand every door hangs on — and they land in `design.settings` rather than on a body.
//
// **Two functions, not one taking a group discriminator.** A single `setTier({ group, tierId })`
// would be the flag argument `set-appearance.ts` avoided: the two write different keys, refuse with
// different codes, and publish different effects, so the caller would be picking a behaviour rather
// than passing a value.
//
// **Each takes the ids its caller's book offers**, because the domain imports no book (ADR 0062
// seam 1) and `DesignSettingsSchema` therefore validates a tier id for shape only. A tier the book
// does not hold is a refusal with its own code rather than a silent no-op — again `set-appearance`'s
// stated reason: a no-op looks identical to a broken control.
import {
  DesignSettingsSchema,
  type Design,
  type DesignSettings,
} from "../design.js";
import {
  isValidOccurredAt,
  refuse,
  succeedWith,
  withSettings,
  type CommandResult,
  type HardwareTierSetEffect,
  type MaterialTierSetEffect,
} from "./command-result.js";
import type { RejectionDetail } from "./rejection.js";

/** Both commands' input, and deliberately the same shape: the design, the tier asked for, the ids
 *  the caller's book offers, and the caller's clock. */
export interface WholeKitchenTierInput {
  readonly design: Design;
  readonly tierId: string;
  readonly availableTierIds: readonly string[];
  readonly occurredAt: string;
}

/** The tier this code names is not one the caller's book offers. Which of the two codes it is is the
 *  only thing that differs between the commands' guards. */
type UnknownTierCode = "UNKNOWN_MATERIAL_TIER" | "UNKNOWN_HARDWARE_TIER";

export function setMaterialTier(
  input: WholeKitchenTierInput,
): CommandResult<MaterialTierSetEffect> {
  const settings = withOneSetting(input, { materialTierId: input.tierId });
  const detail = findRefusal(input, settings, "UNKNOWN_MATERIAL_TIER");
  if (detail) return refuse(input.design, detail);
  return succeedWith(withSettings(input.design, settings, input.occurredAt), {
    type: "material_tier_set",
    materialTierId: input.tierId,
  });
}

export function setHardwareTier(
  input: WholeKitchenTierInput,
): CommandResult<HardwareTierSetEffect> {
  const settings = withOneSetting(input, { hardwareTierId: input.tierId });
  const detail = findRefusal(input, settings, "UNKNOWN_HARDWARE_TIER");
  if (detail) return refuse(input.design, detail);
  return succeedWith(withSettings(input.design, settings, input.occurredAt), {
    type: "hardware_tier_set",
    hardwareTierId: input.tierId,
  });
}

/** The guard both commands share, in the order it asks: **the timestamp, then membership, then the
 *  shape the document would take**.
 *
 *  **The shape check is `DesignSettingsSchema` itself, run over the container that would be
 *  stored — never a restated length or emptiness test.** `availableTierIds` is the caller's, the
 *  caller holds a book that ADR 0062 seam 1 makes data authored outside TypeScript, and a declared
 *  `string` is a promise rather than a fact — the same reading `price-design.ts` gives a declared
 *  book amount. Without this, a book offering `""` or an over-long id produced `ok: true` and a
 *  `Design` that `DesignSchema` refuses: unsaveable at the API write seam and unloadable through
 *  `migrateDesign`, which is the exact "a seam writing a document its own validator refuses"
 *  failure `migrate-design.ts` names. Asking the schema rather than restating its bound is what
 *  keeps one authority for the document's shape the day `MAX_IDENTIFIER_LENGTH` moves.
 *
 *  **A shape failure refuses with the same per-group code**, not a third one. From the customer's
 *  side a tier the document cannot hold *is* a tier that is not available, and the two ruled
 *  sentences already say exactly that; a third code would need a Romanian sentence that is really
 *  developer text about a malformed book. **The cost is real and is accepted here**: a broken book
 *  and a withdrawn tier now produce the same sentence, so nothing at this seam tells them apart.
 *  The place to surface a malformed book loudly is where the book is read, which is wave 6G's.
 *
 *  **Setting the tier that is already set is not a refusal.** `setFinish` succeeds on a finish a
 *  body already carries, and the two must not diverge: a customer re-tapping the chip they are on
 *  gets the state they asked for, not a sentence telling them they cannot have it. */
function findRefusal(
  input: WholeKitchenTierInput,
  settings: DesignSettings,
  unknownTierCode: UnknownTierCode,
): RejectionDetail | undefined {
  if (!isValidOccurredAt(input.occurredAt)) {
    return { code: "INVALID_OCCURRED_AT", params: {} };
  }
  if (!input.availableTierIds.includes(input.tierId)) {
    return { code: unknownTierCode, params: {} };
  }
  if (!DesignSettingsSchema.safeParse(settings).success) {
    return { code: unknownTierCode, params: {} };
  }
  return undefined;
}

/** The container this command would store: one key written over whatever the design already carries
 *  — so the other setting survives a change to this one, and a design with no `settings` key gains
 *  one holding exactly the key that was set.
 *
 *  Built **before** the guard runs rather than after it, because it is the value the guard's shape
 *  check has to be asked about. Nothing is written until the guard passes. */
function withOneSetting(
  input: WholeKitchenTierInput,
  change: DesignSettings,
): DesignSettings {
  return { ...input.design.settings, ...change };
}
