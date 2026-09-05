// **The (material, finish) pair space, generated from the declaration and never enumerated beside
// it** — ADR 0057 decision 4 asks the invariant to be asserted over every pair, and ADR 0078
// decision 1 is what makes that expressible now that a finish has two kinds.
//
// It lives here, once, because wave 6Q asserts the same invariant three times: against the offer
// query (6Q-a), against `migrateDesign`'s output and against `setMaterialTier`'s (6Q-b). Three
// sweeps reading one pair space cannot be narrowed one at a time.
//
// **Nothing here is a second declaration.** The materials come from `MATERIALS`, the palette from
// `PALETTE_ENTRIES` — itself a `MATERIALS.flatMap`, so it is incapable of missing a material's
// palette — and a free colour is drawn against `FREE_COLOUR_PATTERN` itself. A fourth material or a
// seventh decor enters every sweep by existing.
import fc from "fast-check";

import {
  FREE_COLOUR_PATTERN,
  freeColourFinish,
  MATERIALS,
  PALETTE_ENTRIES,
  paletteFinish,
  type Finish,
  type Material,
} from "../../src/materials.js";

/** **A finish the seeded kitchen's material actually offers** — *Antracit*, a PAL decor.
 *
 *  Every fixture built on `KITCHEN_L_DESIGN` carries no settings, so it is a PAL kitchen, and since
 *  wave 6Q-a `setFinish` refuses a finish PAL does not offer (ADR 0078 decision 1). *Salvie* stood
 *  in these tests until then and is a free colour, which a decor list offers none of.
 *
 *  It is a named fixture rather than a literal per file because two tests that only need *some*
 *  applied finish were carrying the identical three-sentence justification for the swap. Where a
 *  test's subject **is** the material's offer, it names its own finish inline — this is for the
 *  tests whose subject is something else entirely and which merely need an edit that lands. */
export const OFFERED_ON_PAL_FINISH: Finish = paletteFinish("pal.antracit");

/** One cell of the space: a material, and a finish it may or may not offer. */
export interface MaterialFinishPair {
  readonly material: Material;
  readonly finish: Finish;
}

/** **Every material against every declared palette entry** — three by eight, twenty-four pairs,
 *  including the twenty-two a material does not own. Those are the point: the invariant is about
 *  what a material refuses as much as what it offers. */
export const PALETTE_PAIRS: readonly MaterialFinishPair[] = MATERIALS.flatMap(
  (material) =>
    PALETTE_ENTRIES.map((entry) => ({
      material,
      finish: paletteFinish(entry.entryId),
    })),
);

/** A free colour, drawn against the **declared** pattern rather than a hand-rolled hex generator, so
 *  a sweep is exercising exactly what `FinishSchema` admits. `freeColourFinish` throws on anything
 *  else, so a generator that drifted off the pattern fails at construction rather than passing
 *  quietly. */
export function freeColourArbitrary(): fc.Arbitrary<Finish> {
  return fc.stringMatching(FREE_COLOUR_PATTERN).map(freeColourFinish);
}

export function materialArbitrary(): fc.Arbitrary<Material> {
  return fc.constantFrom(...MATERIALS);
}

/** The generated half of the space: every material against a colour no palette declares. */
export function freeColourPairArbitrary(): fc.Arbitrary<MaterialFinishPair> {
  return fc.record({
    material: materialArbitrary(),
    finish: freeColourArbitrary(),
  });
}
