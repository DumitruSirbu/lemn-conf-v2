// **Adversarial QA of the scene-colour wave — the §5.3 swap, the one `carriedAppearance` caller
// nothing measured.**
//
// ADR 0099 Amendment A section 3 names `carriedAppearance` (`commands/built-body.ts`) as the seam
// the forbidden fix would land on: it copies `PlacementRecord.finishKey` onto the body a rebuild
// produces, so a version reading `drawnFinish` instead would stamp the *resolved* kitchen colour
// into `body.finish` and silently convert **follows the kitchen** into **chose this colour** — after
// which the next global change leaves that cabinet behind.
//
// Two call sites reach it. `rebuild-resized-bodies.ts` — the resize, the depth change and wave 6Z's
// re-plan — is covered by the shuffled property in `qa-0099-global-colour.adversarial.test.ts`.
// **`insert-body.ts`'s §5.3 swap is not**, and that is measured rather than assumed: narrowing the
// forbidden read to that one call site left all 3653 domain, 2970 adapter and 1998 web tests green.
//
// The reason the existing coverage misses it is worth keeping, because it is the kind of hole that
// grows back. `qa-0099b`'s delete → insert → resize → swap sequence *does* swap under a kitchen
// colour — into `open-shelf`, whose `canFinish: false` short-circuits `carriedAppearance`'s finish
// branch before it ever reads the record. `swap-in-place.test.ts` swaps a body that **chose** a
// colour, where `finishKey` and `drawnFinish` hold the same value and the two reads are
// indistinguishable. The discriminating case is the one neither has: a **finishable** body that
// **chose nothing**, swapped for another **finishable** body, on a kitchen that **has** a colour.
//
// Every claim is asserted on **key presence** (`"finish" in body`), never on a resolved value: a
// body following the kitchen and a body that chose the identical colour render alike and are
// different documents, and only the second stops tracking the next global change.
import { describe, expect, it } from "vitest";

import { setFinish } from "../src/commands/set-appearance.js";
import { setCabinetDepth } from "../src/commands/set-cabinet-depth.js";
import { setGlobalFinish } from "../src/commands/set-whole-kitchen-settings.js";
import type { Design, DesignPlacement } from "../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import {
  materialById,
  paletteFinish,
  sameFinish,
  type Finish,
} from "../src/materials.js";
import { offersFor } from "../src/queries/offers.js";
import { resolvedFinishOf } from "../src/resolved-finish.js";
import { insertInto, OCCURRED_AT } from "./support/commands.js";
import { createFakeProbeFactory } from "./support/fake-probe.js";
import {
  advance,
  createWorld,
  type KitchenWorld,
} from "./support/kitchen-world.js";

const PAL_ID = "material.melamine";
const VENEER_ID = "material.veneer";

const PAL_ANTRACIT = paletteFinish("pal.antracit");
const PAL_GRI = paletteFinish("pal.gri-havanna");
const VENEER_NUC = paletteFinish("veneer.nuc");

/** `p8` is the seeded kitchen's swappable finishable body — the target `swap-in-place.test.ts`
 *  already drives, chosen there because its 600 mm opening admits more than one ladder entry. */
const SWAP_TARGET_ID = "p8";

/** The seeded kitchen with every `body.finish` key deleted, on the material named. Absence, not
 *  `undefined`: the two round-trip differently through a save, and only absence follows. */
function everyCabinetFollowing(materialTierId: string): Design {
  return {
    ...KITCHEN_L_DESIGN,
    settings: { ...KITCHEN_L_DESIGN.settings, materialTierId },
    placements: KITCHEN_L_DESIGN.placements.map((placement) => {
      const body = { ...placement.body };
      delete body.finish;
      return { ...placement, body };
    }),
  };
}

/** The kitchen's colour set through the command, so the fixture cannot hold a colour the design's
 *  own material would have refused. */
function withKitchenColour(design: Design, finish: Finish): Design {
  const result = setGlobalFinish({ design, finish, occurredAt: OCCURRED_AT });
  if (!result.ok) {
    throw new Error(`setGlobalFinish refused: ${result.reason.code}`);
  }
  return result.design;
}

function withCabinetColour(
  world: KitchenWorld,
  placementId: string,
  finish: Finish,
): Design {
  const result = setFinish({
    design: world.design,
    catalog: world.catalog,
    target: { kind: "placement", id: placementId },
    finish,
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) throw new Error(`setFinish refused: ${result.reason.code}`);
  return result.design;
}

function placementOf(design: Design, placementId: string): DesignPlacement {
  const found = design.placements.find(
    (placement) => placement.id === placementId,
  );
  if (!found) throw new Error(`no placement ${placementId}`);
  return found;
}

/** Every id that carries a `finish` key, so a claim about the whole document is measured on the
 *  document rather than on the one body a step happened to touch. */
function idsCarryingAFinish(design: Design): string[] {
  return design.placements
    .filter((placement) => "finish" in placement.body)
    .map((placement) => placement.id)
    .sort();
}

/** The rows `p8`'s own offer list holds that can wear a colour — **read off the catalogue the swap
 *  will build through**, never a hand-written list of build ids, so a ladder entry gaining or losing
 *  its doors changes what this sweeps rather than leaving it asserting about a body that no longer
 *  exists (ADR 0058 decision 2). */
function finishableOffersFor(
  world: KitchenWorld,
  placementId: string,
): readonly string[] {
  return offersFor({ ...world, target: { kind: "placement", id: placementId } })
    .map((offer) => offer.buildId)
    .filter((buildId) => world.catalog.get(buildId)?.canFinish === true);
}

describe("ADR 0099 decision 2 — the §5.3 swap carries the choice and never the colour", () => {
  /**
   * **The discriminating case, over every finishable body the swap is actually offered.**
   *
   * A cabinet that chose nothing, on a kitchen that has a colour, swapped for a body that *can*
   * wear one. `carriedAppearance` reaching for `drawnFinish` here writes the kitchen's colour into
   * the new `body.finish`; reaching for `finishKey` writes nothing, which is the rule.
   *
   * The sweep is the offer list rather than one row, because the branch under test is the
   * catalogue's `canFinish` — a single row proves the seam only for that row's declaration.
   */
  it("grows no finish key on any finishable body it is offered, under a kitchen colour", () => {
    const world = createWorld(
      withKitchenColour(everyCabinetFollowing(PAL_ID), PAL_ANTRACIT),
      KITCHEN_L_BODY_CATALOG,
    );
    expect(idsCarryingAFinish(world.design)).toEqual([]);

    const buildIds = finishableOffersFor(world, SWAP_TARGET_ID);
    // **Non-vacuity, guarded from the rows actually swept.** With no finishable row the loop below
    // asserts nothing and `carriedAppearance`'s finish branch is never entered at all — which is
    // exactly how the existing `open-shelf` swap passes while measuring nothing.
    expect(buildIds.length).toBeGreaterThan(0);

    for (const buildId of buildIds) {
      const result = insertInto(
        world,
        { kind: "placement", id: SWAP_TARGET_ID },
        buildId,
      );
      expect(result.ok, `swap to ${buildId}`).toBe(true);
      if (!result.ok) continue;

      const swapped = placementOf(result.design, result.effect.placementId);
      expect("finish" in swapped.body, `${buildId} grew a finish key`).toBe(
        false,
      );
      // The other half: it must still *draw* the kitchen's colour, so a swap that dropped the
      // resolution rather than stamping it cannot pass on key-absence alone.
      expect(resolvedFinishOf(swapped, result.design)).toEqual(PAL_ANTRACIT);
      // And no other cabinet gained one either.
      expect(idsCarryingAFinish(result.design)).toEqual([]);
    }
  });

  /** The claim key-absence exists to make: the swapped-in body follows the **next** change too. One
   *  subsequent change is satisfiable by a stamped value that happens to match. */
  it("leaves the swapped-in body following a second kitchen colour, and a third", () => {
    const world = createWorld(
      withKitchenColour(everyCabinetFollowing(PAL_ID), PAL_ANTRACIT),
      KITCHEN_L_BODY_CATALOG,
    );
    const buildId = finishableOffersFor(world, SWAP_TARGET_ID)[0];
    expect(buildId).toBeDefined();
    if (buildId === undefined) return;

    const swap = insertInto(
      world,
      { kind: "placement", id: SWAP_TARGET_ID },
      buildId,
    );
    expect(swap.ok).toBe(true);
    if (!swap.ok) return;
    const swappedId = swap.effect.placementId;

    const second = withKitchenColour(swap.design, PAL_GRI);
    expect(resolvedFinishOf(placementOf(second, swappedId), second)).toEqual(
      PAL_GRI,
    );
    const third = withKitchenColour(second, paletteFinish("pal.nuc-warmia"));
    expect(resolvedFinishOf(placementOf(third, swappedId), third)).toEqual(
      paletteFinish("pal.nuc-warmia"),
    );
    expect("finish" in placementOf(third, swappedId).body).toBe(false);
  });

  /** The mirror claim, and the one a swap that wrote *nothing* would fail: a cabinet that **chose**
   *  keeps its own colour across the swap, byte-identical, and does not adopt the kitchen's. */
  it("carries a chosen colour across every finishable swap, and never the kitchen's", () => {
    const following = createWorld(
      withKitchenColour(everyCabinetFollowing(PAL_ID), PAL_ANTRACIT),
      KITCHEN_L_BODY_CATALOG,
    );
    const world = advance(
      following,
      withCabinetColour(following, SWAP_TARGET_ID, PAL_GRI),
    );
    expect(idsCarryingAFinish(world.design)).toEqual([SWAP_TARGET_ID]);
    // The two levels must actually differ, or "kept its own" and "adopted the kitchen's" are the
    // same assertion.
    expect(sameFinish(PAL_GRI, PAL_ANTRACIT)).toBe(false);

    const buildIds = finishableOffersFor(world, SWAP_TARGET_ID);
    expect(buildIds.length).toBeGreaterThan(0);

    for (const buildId of buildIds) {
      const result = insertInto(
        world,
        { kind: "placement", id: SWAP_TARGET_ID },
        buildId,
      );
      expect(result.ok, `swap to ${buildId}`).toBe(true);
      if (!result.ok) continue;

      const swapped = placementOf(result.design, result.effect.placementId);
      expect(swapped.body.finish, `${buildId} lost the chosen colour`).toEqual(
        PAL_GRI,
      );
      expect(resolvedFinishOf(swapped, result.design)).toEqual(PAL_GRI);
    }
  });

  /** ADR 0099 decision 8 at the swap seam: a body that cannot wear a colour is given none, at
   *  either level — and swapping *back out of* one does not resurrect a key from the kitchen. */
  it("writes no key when the body swapped in cannot wear a colour, nor when one is swapped back", () => {
    const world = createWorld(
      withKitchenColour(everyCabinetFollowing(PAL_ID), PAL_ANTRACIT),
      KITCHEN_L_BODY_CATALOG,
    );
    const unfinishable = offersFor({
      ...world,
      target: { kind: "placement", id: SWAP_TARGET_ID },
    })
      .map((offer) => offer.buildId)
      .filter((buildId) => world.catalog.get(buildId)?.canFinish === false);
    expect(unfinishable.length).toBeGreaterThan(0);

    const buildId = unfinishable[0];
    if (buildId === undefined) return;
    const out = insertInto(
      world,
      { kind: "placement", id: SWAP_TARGET_ID },
      buildId,
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(
      "finish" in placementOf(out.design, out.effect.placementId).body,
    ).toBe(false);

    // Back to something finishable: the record it replaces carries no `finishKey` and — the point —
    // must not hand over a `drawnFinish` the kitchen supplied.
    const back = advance(world, out.design);
    const finishable = finishableOffersFor(back, out.effect.placementId);
    expect(finishable.length).toBeGreaterThan(0);
    const returned = finishable[0];
    if (returned === undefined) return;
    const again = insertInto(
      back,
      { kind: "placement", id: out.effect.placementId },
      returned,
    );
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(
      "finish" in placementOf(again.design, again.effect.placementId).body,
    ).toBe(false);
    expect(idsCarryingAFinish(again.design)).toEqual([]);
  });

  /** Repeated swaps, because a single one is satisfiable by a seam that stamps on the *second*
   *  pass — and a depth change afterwards, so the two `carriedAppearance` callers compose rather
   *  than being measured one at a time. */
  it("keeps the document keyless through swap → swap → depth change", () => {
    let world = createWorld(
      withKitchenColour(everyCabinetFollowing(VENEER_ID), VENEER_NUC),
      KITCHEN_L_BODY_CATALOG,
    );
    // Veneer, and a colour that is not veneer's declared default: a stamped value that happened to
    // equal the material's own fallback would be invisible on melamine's *Alb*.
    expect(sameFinish(VENEER_NUC, materialById(VENEER_ID).defaultFinish)).toBe(
      false,
    );

    let targetId = SWAP_TARGET_ID;
    for (let pass = 0; pass < 2; pass += 1) {
      const buildIds = finishableOffersFor(world, targetId);
      expect(buildIds.length, `pass ${String(pass)}`).toBeGreaterThan(0);
      const buildId = buildIds[pass % buildIds.length];
      if (buildId === undefined) return;
      const result = insertInto(
        world,
        { kind: "placement", id: targetId },
        buildId,
      );
      expect(result.ok, `pass ${String(pass)} -> ${buildId}`).toBe(true);
      if (!result.ok) return;
      targetId = result.effect.placementId;
      world = advance(world, result.design);
      expect(idsCarryingAFinish(world.design)).toEqual([]);
    }

    const deepened = setCabinetDepth({
      design: world.design,
      catalogAt: buildKitchenLBodyCatalog,
      cabinetDepthMm: 700,
      probeAt: createFakeProbeFactory(),
      occurredAt: OCCURRED_AT,
    });
    expect(deepened.ok).toBe(true);
    if (!deepened.ok) return;
    expect(idsCarryingAFinish(deepened.design)).toEqual([]);
    // Non-vacuity for the depth half: the rebuild really did run over the body the swaps produced.
    expect(placementOf(deepened.design, targetId).body.seatDepthMm).not.toBe(
      placementOf(world.design, targetId).body.seatDepthMm,
    );
    expect(
      resolvedFinishOf(placementOf(deepened.design, targetId), deepened.design),
    ).toEqual(VENEER_NUC);
  });
});
