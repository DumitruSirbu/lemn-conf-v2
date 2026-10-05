// The whole-kitchen settings as commands: the material every carcass is made of and the hardware
// brand every door hangs on, which land in `design.settings` rather than on a body. The per-placement
// counterparts are in `set-appearance.ts`.
//
// Two functions, not one taking a group discriminator: they write different keys, refuse with
// different codes and publish different effects, so a discriminator would be a flag argument.
//
// Each takes the ids its caller's book offers, because the domain imports no book (ADR 0062 seam 1)
// and `DesignSettingsSchema` validates a tier id for shape only. A tier the book does not hold is a
// refusal with its own code, because a no-op looks identical to a broken control.
//
// `setMaterialTier` is the one place a whole-kitchen setting reaches a per-cabinet one (ADR 0057's
// reset), composed from `withPlacements(withSettings(…))` so `command-result.ts` stays the one place a
// command writes a new `Design`.
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

/** Both tier commands' input, deliberately the same shape: the design, the tier asked for, the ids
 *  the caller's book offers, and the caller's clock. */
export interface WholeKitchenTierInput {
  readonly design: Design;
  readonly tierId: string;
  readonly availableTierIds: readonly string[];
  readonly occurredAt: string;
}

/** The refusal code for a tier the caller's book does not offer; the only thing that differs between
 *  the commands' guards. */
type UnknownTierCode = "UNKNOWN_MATERIAL_TIER" | "UNKNOWN_HARDWARE_TIER";

/**
 * The whole-kitchen colour. The input names a design and a finish and deliberately not the
 * placements, so no implementation of `setGlobalFinish` can reach `placement.body.finish`: the
 * owner's "do not overwrite a cabinet's own colour" as a shape (ADR 0099 decision 2).
 */
export interface GlobalFinishInput {
  readonly design: Design;
  readonly finish: Finish;
  readonly occurredAt: string;
}

/**
 * A global colour change writes exactly one field and touches no cabinet (ADR 0099 decisions 2, 5).
 * Cabinets with no `finish` follow it because `resolvedFinishOf` reads `settings.finish` for them, so
 * the document grows no `finish` key and a cleared override falls back here.
 *
 * It refuses a colour the design's material does not offer, with `setFinish`'s code and reason
 * (ADR 0078 decision 6); an undeclared `materialTierId` offers nothing and refuses nothing, so the
 * recovery path keeps working. Setting the colour already set is not a refusal, as in both tier
 * commands.
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

/** ADR 0078 decision 6's question, read off the design being rewritten. An undeclared tier has no
 *  palette to judge against, so the colour passes, as in `setFinish` one scope down. */
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
 * ADR 0057's reset, in one document and on success only: every placement wearing a finish the
 * material being applied does not offer is rewritten to that material's declared `defaultFinish`,
 * read through `lookUpMaterial` with no branch per material. Never a nearest-colour mapping from a
 * swatch (ADR 0078 decision 4).
 *
 * Runs against the tier being applied and is not skipped when it equals the stored one: a document
 * already carrying an unoffered finish is resolved by the tap that re-applies its own material.
 * An undeclared tier resolves nothing (ADR 0078 decision 3). A placement with no `finish` never
 * gains one (decision 5). Returns the given design, `placements` by identity, when nothing is owed.
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
 * ADR 0099 decision 6: the global level is not exempt from ADR 0057's invariant that no stored design
 * holds a finish its material does not offer. A global colour the incoming material does not make is
 * reset to its `defaultFinish` once for the whole document, never per cabinet. Between two different
 * declared materials this always fires, since their offers are disjoint (ADR 0078 decision 1); the
 * same declared material resets nothing (ADR 0086 decision 3). Returns the given design by identity
 * when nothing is owed.
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

/** The guard both commands share, in the order it asks: the timestamp, then membership, then the
 *  shape the document would take.
 *
 *  The shape check is `DesignSettingsSchema` run over the container that would be stored, never a
 *  restated bound. `availableTierIds` comes from a book authored outside TypeScript (ADR 0062
 *  seam 1), so an id of `""` or an over-long id would otherwise yield `ok: true` and a `Design` that
 *  `DesignSchema` refuses.
 *
 *  A shape failure refuses with the same per-group code, not a third one: to the customer a tier the
 *  document cannot hold is a tier that is not available. Accepted cost: a broken book and a withdrawn
 *  tier give the same message here; a malformed book is surfaced where the book is read.
 *
 *  Setting the tier already set is not a refusal, matching `setFinish`. */
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

/** The container this command would store: one key written over whatever the design already carries,
 *  so the other setting survives. Built before the guard because the guard's shape check asks about
 *  it; nothing is written until the guard passes. */
function withOneSetting(
  input: WholeKitchenTierInput,
  change: DesignSettings,
): DesignSettings {
  return { ...input.design.settings, ...change };
}
