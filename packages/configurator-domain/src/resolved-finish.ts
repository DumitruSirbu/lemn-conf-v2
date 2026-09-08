// **The colour a cabinet is actually wearing** — ADR 0099 decision 1, and the only authority on the
// order.
//
// ```
// placement.body.finish            the cabinet's own choice — highest priority
//   ?? design.settings.finish      the whole-kitchen default
//   ?? material.defaultFinish      the declared fallback, unchanged
// ```
//
// The owner's ruling — *"top priority is cabinet level and higher priority is general setting
// level"* — is exactly that order. No surface, no adapter and no second query re-derives it:
// `@lemnaria/three-adapter`'s `finishes.ts` takes a finish that has already been resolved and must
// not learn the precedence rule, and a second `??` chain written anywhere else is how two surfaces
// come to disagree about what one kitchen is painted.
//
// **It resolves and never writes.** Nothing here returns a `Design`. An absent `body.finish` is a
// legal state that has chosen nothing (ADR 0078 decision 5) and it stays absent however often it is
// resolved — which is what makes a cabinet carrying no override keep following the next global
// change, and the change after that.
//
// **`undefined` is an answer, not a hole.** A design whose `materialTierId` names no declared
// material declares no default to fall back to (ADR 0078 decision 3), and that state is reachable:
// wave 6G's recovery path depends on such a document continuing to load. A caller gets the absence
// rather than a colour this product never declared.
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

/**
 * **What a cabinet that has chosen nothing wears** — the lower two levels of the same order.
 *
 * Published separately because two readers need the default without holding a placement: ADR 0099
 * decision 7's amended comparison base — *"a chosen colour"* is one that differs from the **resolved**
 * default, not from the material's declared one — and the sheet's own colour group, which marks the
 * swatch the kitchen is standing on.
 */
export function resolvedDefaultFinishOf(design: Design): Finish | undefined {
  return design.settings?.finish ?? declaredDefaultOf(materialOfDesign(design));
}

function declaredDefaultOf(lookup: MaterialLookup): Finish | undefined {
  return lookup.kind === "declared" ? lookup.material.defaultFinish : undefined;
}
