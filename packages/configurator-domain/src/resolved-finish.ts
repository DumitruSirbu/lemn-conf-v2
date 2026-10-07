// The colour a cabinet is actually wearing (ADR 0099 decision 1), the only authority on the order:
//
// ```
// placement.body.finish            the cabinet's own choice — highest priority
//   ?? design.settings.finish      the whole-kitchen default
//   ?? material.defaultFinish      the declared fallback, unchanged
// ```
//
// No surface, adapter or second query re-derives it: `@lemnaria/three-adapter`'s `finishes.ts` takes an
// already-resolved finish, and a second `??` chain elsewhere is how two surfaces disagree about what one
// kitchen is painted.
//
// It resolves and never writes. An absent `body.finish` is a legal state that has chosen nothing
// (ADR 0078 decision 5) and stays absent, so a cabinet with no override keeps following the next global
// change.
//
// `undefined` is an answer, not a hole: a design whose `materialTierId` names no declared material
// declares no default (ADR 0078 decision 3), and such a document must keep loading, so the caller gets
// the absence rather than an invented colour.

// Type-only, so this module gains no runtime dependency on the declaration side.
import type { BodyFinishRule } from "./body-finish-rule.js";
import { materialOfDesign } from "./design-material.js";
import type { Design, DesignPlacement } from "./design.js";
import type { Finish, MaterialLookup } from "./materials.js";

/**
 * The finish this placement renders in, whether it chose one or is following the kitchen.
 *
 * Takes the placement **and** the design rather than a pre-resolved default, so a caller cannot pair
 * one document's cabinet with another document's colour.
 */
export function resolvedFinishOf(
  placement: DesignPlacement,
  design: Design,
): Finish | undefined {
  return placement.body.finish ?? resolvedDefaultFinishOf(design);
}

/** The placement, the design it belongs to, and what its catalogue entry declares about colour: one
 *  object because the three are read together. */
export interface DrawnFinishQuery {
  readonly rule: BodyFinishRule;
  readonly placement: DesignPlacement;
  readonly design: Design;
}

/**
 * The colour this body is drawn in: `PlacementRecord.drawnFinish`'s answer, where "structural cabinetry
 * follows the kitchen, appliances never do" is applied.
 *
 * Three arms and no default, so a fourth `BodyFinishRule` is a compile error rather than a body that
 * silently stops being painted:
 *
 * - It chooses its own: the full order above, `resolvedFinishOf`.
 * - It follows the kitchen: the default only. `placement.body.finish` is deliberately not consulted:
 *   such a body has no control (ADR 0099 decision 8), so a colour in its document is one no customer
 *   could have picked, and drawing it would make a hand-edited row visible.
 * - It is never painted: no colour at either level.
 *
 * It resolves and never writes (ADR 0099 decision 2). It is a second function rather than a widening
 * of `resolvedFinishOf` because that resolver is what `chosen-finishes.ts` and the settings sheet
 * compare against, and neither asks what to paint.
 */
export function drawnFinishOf(query: DrawnFinishQuery): Finish | undefined {
  switch (query.rule) {
    case "chooses-its-own-colour":
      return resolvedFinishOf(query.placement, query.design);
    case "follows-the-kitchens-colour":
      return resolvedDefaultFinishOf(query.design);
    case "is-never-painted":
      return undefined;
  }
}

/**
 * What a cabinet that has chosen nothing wears: the lower two levels of the same order. Published
 * separately because two readers need the default without a placement: the comparison base for "a
 * chosen colour", which differs from the **resolved** default and not the material's declared one
 * (ADR 0099 decision 7), and the sheet's colour group marking the swatch the kitchen stands on.
 */
export function resolvedDefaultFinishOf(design: Design): Finish | undefined {
  return design.settings?.finish ?? declaredDefaultOf(materialOfDesign(design));
}

function declaredDefaultOf(lookup: MaterialLookup): Finish | undefined {
  return lookup.kind === "declared" ? lookup.material.defaultFinish : undefined;
}
