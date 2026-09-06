// Test-only. **Which material a panel fixture's design is on** — the input `describePanel` needs to
// choose the *shape* of §9's Finisaj control (ADR 0071 decision 3).
//
// Named constants rather than a default inside `describePanel`: a fixture that has not said which
// material it is on has not earned a colour control, and a silent PAL default would have shown six
// decors on an MDF kitchen with nothing failing. Most fixtures below are not about the finish at
// all and take `PAL_KITCHEN`, which is what an unset `materialTierId` resolves to in the product.
import {
  lookUpMaterial,
  materialById,
  type MaterialLookup,
} from "@lemnaria/configurator-domain";

/** PAL — a fixed list of six factory decors, and the material a design with no setting is on. */
export const PAL_KITCHEN: MaterialLookup = {
  kind: "declared",
  material: materialById("material.melamine"),
};

/** MDF — the RAL picker. */
export const MDF_KITCHEN: MaterialLookup = {
  kind: "declared",
  material: materialById("material.painted-mdf"),
};

/** Veneer — two wood swatches, *Stejar* and *Nuc*. */
export const VENEER_KITCHEN: MaterialLookup = {
  kind: "declared",
  material: materialById("material.veneer"),
};

/** A stored `materialTierId` naming nothing this product declares (ADR 0078 decision 3) — a
 *  reachable state, reached the way the product reaches it rather than by writing the shape out. */
export const UNDECLARED_KITCHEN: MaterialLookup = lookUpMaterial(
  "material.retired-tier",
);
