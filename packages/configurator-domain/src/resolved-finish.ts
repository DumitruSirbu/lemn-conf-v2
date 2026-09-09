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
// Type-only, so this module gains no runtime dependency on the declaration side: it needs the arms
// to switch over and none of their behaviour.
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

/** The placement, the design it belongs to, and what its catalogue entry declares about colour.
 *
 * One named object rather than three positional arguments, because the three are read together and
 * the rule is a fact about the body rather than a switch selecting a behaviour. */
export interface DrawnFinishQuery {
  readonly rule: BodyFinishRule;
  readonly placement: DesignPlacement;
  readonly design: Design;
}

/**
 * **The colour this body is drawn in** — `PlacementRecord.drawnFinish`'s answer, and the one place
 * the owner's ruling of 2026-09-09 is applied: *"structural cabinetry follows the kitchen,
 * appliances never do"*.
 *
 * Three arms and no default, so a fourth `BodyFinishRule` is a compile error here rather than a body
 * that silently stops being painted:
 *
 * - **It chooses its own** — the full order above, `resolvedFinishOf`, unchanged.
 * - **It follows the kitchen** — the *default* only. `placement.body.finish` is deliberately not
 *   consulted: such a body has no control (ADR 0099 decision 8's half that stands), so a colour in
 *   its document is one no customer could have picked, and drawing it would make a hand-edited row
 *   visible where the product offers nothing to change it.
 * - **It is never painted** — no colour, at either level, whatever either level holds.
 *
 * **It resolves and never writes**, like everything else in this module. Nothing here returns a
 * `Design`, and a body that follows keeps its `finish` key absent however often it is drawn — which
 * is ADR 0099 decision 2, and the reason this is a second function rather than a widening of
 * `resolvedFinishOf`: the resolver above is what `chosen-finishes.ts` and the settings sheet compare
 * against, and neither of them is asking what to paint.
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
