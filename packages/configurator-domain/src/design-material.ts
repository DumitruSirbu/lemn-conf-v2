// **Which material a design is built from**, resolved once for every reader that asks.
//
// Two rules travel together and neither is a caller's to restate:
//
// - a design with no `materialTierId` is **PAL** (`DEFAULT_MATERIAL_ID`, ruled 2026-09-04) — the
//   priced baseline and the material a legacy document is deemed to carry;
// - a stored id naming nothing this product declares **answers rather than throws**
//   (ADR 0078 decision 3). `DesignSettingsSchema` validates the id for shape only, since the domain
//   imports no price book (ADR 0062 seam 1), so an undeclared tier is a reachable state that wave
//   6G's recovery path depends on continuing to load.
//
// It exists because five readers were spelling the same two rules out — the load-path resolution,
// the write-seam refusal, `setFinish`'s guard, ADR 0081's chosen-colour count, and wave 6R's panel.
// A sixth would eventually spell one of them differently.
import type { Design } from "./design.js";
import {
  DEFAULT_MATERIAL_ID,
  FinishSchema,
  lookUpMaterial,
  materialOffersFinish,
  type Finish,
  type MaterialLookup,
} from "./materials.js";

export function materialOfDesign(design: Design): MaterialLookup {
  return lookUpMaterial(design.settings?.materialTierId ?? DEFAULT_MATERIAL_ID);
}

/** Whether a command may write `finish` into `design`: the value must be one `FinishSchema` admits, and the
 *  design's material must offer it or be undeclared, which makes no offer of its own (ADR 0078 decisions 3
 *  and 6). A free colour is pattern-checked here by the parse and again by `materialOffersFinish`,
 *  deliberately: that query's other callers, the tier reset in `set-whole-kitchen-settings.ts`, do not come
 *  through this function. */
export function designOffersFinish(design: Design, finish: Finish): boolean {
  if (!FinishSchema.safeParse(finish).success) return false;
  const lookup = materialOfDesign(design);
  return (
    lookup.kind === "undeclared" ||
    materialOffersFinish(lookup.material, finish)
  );
}
