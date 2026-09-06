// **The web half of wave 6Q-b's destructive-path fixture**: an MDF kitchen whose cabinets wear
// colours a customer chose, so switching it to veneer resolves more than one of them.
//
// **It is a deliberate duplicate of `packages/configurator-domain/tests/support/
// mdf-kitchen-wearing-chosen-colours.ts`**, not an import of it, and that copy names this one back.
// Every package owns its tests completely and stays liftable: no test may reach across a package
// boundary except through the target package's public entry point, a domain package's `tests/`
// directory is not one, and publishing a test-only fixture from `src/` to avoid the duplication
// would put test infrastructure in what ships — which the same convention forbids
// (`engineering-conventions.md`). Do not "fix" this by sharing.
//
// **What keeps the two literal counts from parting is not the pointer, it is a check inside each
// copy** (ADR 0084 decision 6): each package's own suite asserts that exactly
// `FINISHES_RESOLVED_BY_VENEER` of its own placements wear a finish `materialOffersFinish(veneer, ·)`
// refuses. That is not circular with `setMaterialTier` — the offer query is 6Q-a's and is pinned
// separately — so a finish table that drifts in either copy fails in that copy's package.
//
// Wave 6Q-c reuses this one for its confirmation step rather than writing a third.
import {
  freeColourFinish,
  KITCHEN_L_DESIGN,
  paletteFinish,
  type Design,
  type DesignPlacement,
  type Finish,
} from "@lemnaria/configurator-domain";

export const MDF_TIER_ID = "material.painted-mdf";
export const VENEER_TIER_ID = "material.veneer";

/** The two free colours, different from each other — so a resolution collapsing everything onto one
 *  value is visible — and both offered by MDF's RAL picker and by nothing else. */
export const CHOSEN_CLAY: Finish = freeColourFinish("#cbc3b8");
export const CHOSEN_SAGE: Finish = freeColourFinish("#8d9a84");

/** What each placement wears. The seeded hood `p13` and the finishable `p6` wear **nothing**, which
 *  is the absence of an entry here rather than a second list.
 *
 *  **The hood wears nothing deliberately** (ADR 0084 decisions 1 and 2b): `canFinish` is not in
 *  `setMaterialTier`'s contract — the command takes no `BodyCatalog` — and no route into it can
 *  deliver a frontless body wearing a finish, because the load seam strips one at every version
 *  before the resolution runs. The hood-carrying-a-stored-finish case is the load seam's, and the
 *  domain package asserts it there. */
export const CHOSEN_FINISH_BY_PLACEMENT_ID: Readonly<Record<string, Finish>> = {
  p0: CHOSEN_CLAY,
  p1: CHOSEN_SAGE,
  p4: paletteFinish("veneer.stejar"),
  p5: paletteFinish("veneer.nuc"),
};

/** **Exactly two cabinets move when this kitchen switches to veneer.** A literal, because a count
 *  derived from the fixture agrees with whatever the implementation did. Four would be "reset
 *  everything wearing a finish"; the count alone does not separate the two directions, and what does
 *  is which placements moved — see the domain copy's note and ADR 0084 decision 3. */
export const FINISHES_RESOLVED_BY_VENEER = 2;

/** The `canFinish: false` body, wearing nothing — the state every loaded design presents it in. */
export const HOOD_PLACEMENT_ID = "p13";

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

/** How many placements wear a different finish in `after` than they did in `before`. The store
 *  publishes no effect, so this is how a test on the store side counts the reset. */
export function countMovedFinishes(before: Design, after: Design): number {
  return after.placements.filter((placement, index) => {
    const was = before.placements[index]?.body.finish;
    return JSON.stringify(was) !== JSON.stringify(placement.body.finish);
  }).length;
}
