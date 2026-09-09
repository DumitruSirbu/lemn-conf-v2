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
//
// **Wave 6Q-b gave `setMaterialTier` one more job**, and it is the only place a whole-kitchen
// setting reaches a per-cabinet one: ADR 0057's reset, composed out of `withPlacements(withSettings(
// …))` so `command-result.ts` stays the one place a command writes a new `Design`.
import { materialOfDesign } from "../design-material.js";
import {
  DesignSettingsSchema,
  type Design,
  type DesignPlacement,
  type DesignSettings,
} from "../design.js";
import {
  lookUpMaterial,
  materialOffersFinish,
  type Finish,
  type Material,
} from "../materials.js";
import {
  isValidOccurredAt,
  refuse,
  succeedWith,
  withPlacements,
  withSettings,
  type CommandResult,
  type GlobalFinishSetEffect,
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

/**
 * **The whole-kitchen colour, and the input is the whole of ADR 0099 decision 2's guarantee.**
 *
 * It names a design and a finish. It does **not** take the placements, a placement id, or anything
 * that could be turned into one — so no implementation of `setGlobalFinish`, and no later edit to
 * it, can reach `placement.body.finish`. A command that *could* stamp every cabinet and merely
 * chose not to is a defect waiting for a refactor; this one is structurally incapable of it, which
 * is the owner's *"do not overwrite a cabinet's own colour"* expressed as a shape rather than as
 * care.
 */
export interface GlobalFinishInput {
  readonly design: Design;
  readonly finish: Finish;
  readonly occurredAt: string;
}

/**
 * **A global colour change writes exactly one field and touches no cabinet, ever** (ADR 0099
 * decisions 2 and 5).
 *
 * Cabinets carrying no `finish` follow it because they were following all along — `resolvedFinishOf`
 * reads `settings.finish` for them — so the document does not grow a single `finish` key, the
 * *second* global change moves them too, and a cabinet whose override is later cleared falls back
 * here rather than to the book's default.
 *
 * **It refuses a colour the design's material does not offer**, with `setFinish`'s own code and for
 * `setFinish`'s own reason (ADR 0078 decision 6): the offer has one author, the guard is asked one
 * scope up, and an undeclared `materialTierId` offers nothing and refuses nothing so wave 6G's
 * recovery path keeps working.
 *
 * **Setting the colour that is already set is not a refusal**, matching both tier commands: a
 * customer re-tapping the swatch they are on gets the state they asked for.
 */
export function setGlobalFinish(
  input: GlobalFinishInput,
): CommandResult<GlobalFinishSetEffect> {
  if (!isValidOccurredAt(input.occurredAt)) {
    return refuse(input.design, { code: "INVALID_OCCURRED_AT", params: {} });
  }
  if (!designOffersFinish(input.design, input.finish)) {
    return refuse(input.design, { code: "FINISH_NOT_OFFERED", params: {} });
  }
  const settings: DesignSettings = {
    ...input.design.settings,
    finish: input.finish,
  };
  return succeedWith(withSettings(input.design, settings, input.occurredAt), {
    type: "global_finish_set",
    finish: input.finish,
  });
}

/** ADR 0078 decision 6's question, read off the design being rewritten so a caller cannot hand this
 *  command a material the document is not on. An undeclared tier has no palette to judge a colour
 *  against, so it lets the colour through rather than making a stale tier uncolourable — the same
 *  answer `setFinish` gives one scope down. */
function designOffersFinish(design: Design, finish: Finish): boolean {
  const lookup = materialOfDesign(design);
  return (
    lookup.kind === "undeclared" ||
    materialOffersFinish(lookup.material, finish)
  );
}

export function setMaterialTier(
  input: WholeKitchenTierInput,
): CommandResult<MaterialTierSetEffect> {
  const settings = withOneSetting(input, { materialTierId: input.tierId });
  const detail = findRefusal(input, settings, "UNKNOWN_MATERIAL_TIER");
  if (detail) return refuse(input.design, detail);

  const applied = withSettings(input.design, settings, input.occurredAt);
  const resolution = resolveFinishesTheTierDoesNotOffer(applied, input);
  return succeedWith(resolution.design, {
    type: "material_tier_set",
    materialTierId: input.tierId,
    resolvedFinishCount: resolution.resolvedFinishCount,
  });
}

/** The document the reset produced, and how many cabinets it moved. */
interface FinishResolution {
  readonly design: Design;
  readonly resolvedFinishCount: number;
}

/**
 * **ADR 0057's reset, in one document and on success only.**
 *
 * Every placement wearing a finish the material **being applied** does not offer is rewritten to
 * that material's declared `defaultFinish` — read off `materialById`'s declaration through
 * `lookUpMaterial`, with no branch per material and no table here. ADR 0078 decision 4 forbids the
 * one alternative that looks helpful: constructing a free colour from a palette entry's swatch hex
 * is ADR 0057's rejected nearest-finish mapping, and a swatch that stays the same colour while the
 * priced material changes underneath it is the most invisible substitution there is.
 *
 * **Against the tier being applied, and not skipped when it equals the stored one.** Setting the
 * tier that is already set is not a refusal (`findRefusal` above), so it must not become a silent
 * skip either: a document that was already carrying an unoffered finish is resolved by the tap that
 * re-applies its own material, exactly as it would be by a tap that changes it.
 *
 * **An undeclared tier resolves nothing** (ADR 0078 decision 3). The caller's book offered the id,
 * but the domain declares no material for every id a book may hold, and a document is not corrected
 * against a material nobody can look up.
 *
 * **Absence stays absence** (ADR 0078 decision 5). A placement with no `finish` key never reaches
 * `materialOffersFinish` and never gains one: the reset corrects a choice, it does not invent one.
 *
 * Returns the design it was given when nothing is owed — including its `placements` array by
 * identity — so a material change that resolves nothing moves nothing a save is diffed against
 * beyond `settings` and `updatedAt`.
 */
function resolveFinishesTheTierDoesNotOffer(
  applied: Design,
  input: WholeKitchenTierInput,
): FinishResolution {
  const lookup = lookUpMaterial(input.tierId);
  if (lookup.kind === "undeclared") {
    return { design: applied, resolvedFinishCount: 0 };
  }
  const material = lookup.material;
  const withGlobal = resolveGlobalFinishTheTierDoesNotOffer(
    applied,
    material,
    input.occurredAt,
  );
  const unoffered = new Set(
    withGlobal.placements.filter((placement) =>
      wearsAFinishTheMaterialDoesNotOffer(placement, material),
    ),
  );
  if (unoffered.size === 0) {
    return { design: withGlobal, resolvedFinishCount: 0 };
  }
  const placements = withGlobal.placements.map((placement) =>
    unoffered.has(placement)
      ? wearing(placement, material.defaultFinish)
      : placement,
  );
  return {
    design: withPlacements(withGlobal, placements, input.occurredAt),
    resolvedFinishCount: unoffered.size,
  };
}

/**
 * **ADR 0099 decision 6: the global level is not exempt from ADR 0057's invariant.**
 *
 * *No stored design may hold a finish its material does not offer* now has to cover
 * `settings.finish` as well as every `body.finish`, so a global colour the incoming material does
 * not make is reset to that material's `defaultFinish` — **once, for the whole document**, never per
 * cabinet.
 *
 * **Under a change between two different declared materials this is not an edge case, it is the
 * only case.** ADR 0078 decision 1 makes the three materials' offers disjoint, so no finish survives
 * such a change and the reset is a certainty rather than a risk. A change resolving to the *same*
 * declared material resets nothing here, which is ADR 0086 decision 3's rule applied unchanged.
 *
 * Returns the design it was given by identity when nothing is owed, so a material change that
 * discards no global colour moves nothing a save is diffed against beyond `settings.materialTierId`.
 */
function resolveGlobalFinishTheTierDoesNotOffer(
  applied: Design,
  material: Material,
  occurredAt: string,
): Design {
  const finish = applied.settings?.finish;
  if (finish === undefined || materialOffersFinish(material, finish)) {
    return applied;
  }
  return withSettings(
    applied,
    { ...applied.settings, finish: material.defaultFinish },
    occurredAt,
  );
}

function wearsAFinishTheMaterialDoesNotOffer(
  placement: DesignPlacement,
  material: Material,
): boolean {
  const finish = placement.body.finish;
  return finish !== undefined && !materialOffersFinish(material, finish);
}

function wearing(placement: DesignPlacement, finish: Finish): DesignPlacement {
  return { ...placement, body: { ...placement.body, finish } };
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
 *  descriptors already say exactly that; a third code would duplicate a product fact with developer
 *  detail about a malformed book. **The cost is real and is accepted here**: a broken book and a
 *  withdrawn tier now produce the same customer-facing message, so nothing at this seam tells them apart.
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
