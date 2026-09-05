// **The one document wave 6Q-b measures its destructive path on**, built once because a fixture
// that is *nearly* right measures nothing: every reset test on a design where a single cabinet
// carries a single colour passes for an implementation that resolves everything, an implementation
// that resolves against the wrong material, and an implementation that counts wrong.
//
// It is an **MDF kitchen** — `material.painted-mdf`, whose control is a RAL picker, so it offers
// every free colour and no palette entry at all (ADR 0078 decision 1). Switching it to **veneer**,
// whose control is two wood swatches, is therefore the sharpest material change the product has:
// every free colour a customer chose is lost, and the two woods are the only things that survive.
//
// **This is an in-memory construction, and the product holds no such document.** On an MDF kitchen
// `p4` and `p5` wearing woods is refused by `validateDesignForCatalog` at `PUT /api/designs/[id]`
// and rewritten to white by the load seam, so this design can be neither stored nor loaded intact.
// That is legitimate here and ADR 0084 decision 5 is why: `setMaterialTier` is a pure function of
// `(design, tierId)` whose contract is *"rewrite every carried finish the applied material does not
// offer"*, so *a placement carrying finish X* is squarely one of its own inputs however the
// assembled document got that way. What a fixture may **not** do is construct an input to borrow
// another module's guarantee — which is why the hood below wears nothing (next paragraph).
//
// **Six placements, each carrying a different question**, so an implementation that gets one wrong
// cannot pass by getting the others right:
//
// | Placement | Wears | Why it is here |
// | --- | --- | --- |
// | `p0` | free colour `#cbc3b8` | veneer offers no free colour — **resets** |
// | `p1` | free colour `#8d9a84` | a *different* colour, so a resolution collapsing everything to one value is visible — **resets** |
// | `p4` | `veneer.stejar` | veneer offers it — must come through **untouched**, the placement itself and not merely its finish |
// | `p5` | `veneer.nuc` | the other wood, so "untouched" is not one value the reset target happens to equal |
// | `p13` | **nothing**, on a `canFinish: false` hood | absence stays absence where it could only ever have been absence |
// | `p6` | **nothing**, on a `canFinish: true` body | absence stays absence where a choice was possible and none was made |
//
// **Why the hood wears nothing** (ADR 0084 decisions 1 and 2b). `canFinish` is not in
// `setMaterialTier`'s contract at any point — `WholeKitchenTierInput` carries no `BodyCatalog`,
// deliberately, since `setHardwareTier` takes the same shape — so a hood wearing a finish this
// command refuses would be counted, and no route into the command can deliver one: the load seam
// strips it at every version before the resolution runs, the seeded design carries none, `setFinish`
// refuses it, and `carriedAppearance` drops it on insert and rebuild. **The hood-carrying-a-stored-
// finish case belongs to `tests/finish-resolution-at-the-load-seam.test.ts`**, where the strip
// actually runs and where *"the resolution must not re-add it"* is a claim about code.
//
// **This file has a twin at `apps/web/tests/support/mdf-kitchen-wearing-chosen-colours.ts`**, and it
// is a deliberate duplicate rather than an oversight: packages must stay liftable, so no test may
// reach across a package boundary except through the target package's public entry point, and a
// domain package's `tests/support/` is not one (`engineering-conventions.md`). Do not "fix" it by
// sharing. What guards the two literal counts from parting is that **each copy checks its own
// against `materialOffersFinish` in its own package's suite** — the offer query is 6Q-a's and is
// pinned separately — so drift fails where it happens, with no cross-package coupling.
import type { Design, DesignPlacement } from "../../src/design.js";
import { KITCHEN_L_DESIGN } from "../../src/fixtures/kitchen-l-design.js";
import {
  freeColourFinish,
  paletteFinish,
  type Finish,
} from "../../src/materials.js";

/** The two free colours, different from each other and from every declared palette entry. They are
 *  the two values wave 6P's migration produces for *Lut* and *Salvie*, so they are colours this
 *  product has actually written rather than invented for a test. */
export const CHOSEN_CLAY: Finish = freeColourFinish("#cbc3b8");
export const CHOSEN_SAGE: Finish = freeColourFinish("#8d9a84");

/** What each placement wears in the fixture below. Read by the tests as well as applied here, so a
 *  test asserting "unchanged" names the same value the fixture was built from, and so "wearing
 *  nothing" is the absence of an entry rather than a second list to keep in step. */
export const CHOSEN_FINISH_BY_PLACEMENT_ID: Readonly<Record<string, Finish>> = {
  p0: CHOSEN_CLAY,
  p1: CHOSEN_SAGE,
  p4: paletteFinish("veneer.stejar"),
  p5: paletteFinish("veneer.nuc"),
};

/** A `canFinish: true` body wearing nothing at all, named so a test asserting absence is pointing
 *  at a placement that could have worn something. */
export const UNFINISHED_PLACEMENT_ID = "p6";

/** The `canFinish: false` body, wearing nothing — the state every loaded design presents it in. */
export const HOOD_PLACEMENT_ID = "p13";

/** **How many cabinets an MDF → veneer switch resolves: exactly two.** A literal rather than a
 *  count derived from the fixture, which is the whole point — a derived expectation agrees with
 *  whatever the implementation did.
 *
 *  **It no longer separates the two directions, and that is recorded rather than lost** (ADR 0084
 *  decision 3): MDF → MDF also resolves two, the woods. What separates them is which placements
 *  moved — `p0`/`p1` landing on veneer's declared default, and `p4`/`p5` coming back as the *same
 *  placement objects*. A count can be right by accident; identity on the untouched half cannot. */
export const FINISHES_RESOLVED_BY_VENEER = 2;

export const MDF_TIER_ID = "material.painted-mdf";
export const VENEER_TIER_ID = "material.veneer";

/** The two ids an in-memory `setMaterialTier` call has to be offered, since the domain imports no
 *  price book and judges availability against the list its caller hands in (ADR 0062 seam 1). */
export const OFFERED_MATERIAL_TIER_IDS: readonly string[] = [
  MDF_TIER_ID,
  VENEER_TIER_ID,
];

/** The document itself: the seeded kitchen, on MDF, with four of its bodies wearing the finishes
 *  the table above declares and everything else exactly as `KITCHEN_L_DESIGN` has it. */
export const MDF_KITCHEN_WEARING_CHOSEN_COLOURS: Design = {
  ...KITCHEN_L_DESIGN,
  settings: { ...KITCHEN_L_DESIGN.settings, materialTierId: MDF_TIER_ID },
  placements: KITCHEN_L_DESIGN.placements.map(withDeclaredFinish),
};

function withDeclaredFinish(placement: DesignPlacement): DesignPlacement {
  const finish = CHOSEN_FINISH_BY_PLACEMENT_ID[placement.id];
  if (!finish) return placement;
  return { ...placement, body: { ...placement.body, finish } };
}

/** The placement a test is asking about, by id — thrown rather than `undefined`, so a fixture that
 *  drifts fails at the lookup instead of passing an assertion about nothing. */
export function placementOf(design: Design, id: string): DesignPlacement {
  const placement = design.placements.find((candidate) => candidate.id === id);
  if (!placement) throw new Error(`no placement "${id}" in this design`);
  return placement;
}

export function finishOf(design: Design, id: string): Finish | undefined {
  return placementOf(design, id).body.finish;
}
