// **Adversarial QA of the scene-colour wave — `setMaterialTier`'s post-condition, over every
// ordered pair of materials, on a document that carries colours at both levels.**
//
// ADR 0057's invariant is *no stored design holds a finish its material does not offer*, and
// ADR 0099 decision 6 extends it to `settings.finish`. `validate-design.ts` states it at the write
// seam and `qa-0099-global-colour.adversarial.test.ts` proves the seam refuses each half. **What
// nothing asserts is the composition**: that the one command able to break the invariant always
// leaves a document the seam would accept — at *both* levels, for *every* pair.
//
// The gap is in the fixtures rather than in the claims. The existing pair sweep
// (*"resets the global colour for every ordered pair of different declared materials"*) runs on
// `designOn(from.materialId, [])` — **a document with no placements at all** — so the per-cabinet
// half of a material change is never swept over materials; it is asserted on two hand-built
// documents on one pair. And `resolvedFinishCount` is only ever checked against a literal.
//
// Three things are asserted here that a rewrite of the reset could break without turning anything
// else red:
//
// - **The key set is invariant.** ADR 0057 decision 2 rewrites a value; it must never *add* a key to
//   a cabinet that was following (which would pin it out of the kitchen's colour for ever — ADR 0099
//   decision 5 row 3's failure mode arriving through the material control) and never *delete* one
//   from a cabinet that chose (which would silently hand that cabinet to the kitchen).
// - **The count is derived, not stated.** `resolvedFinishCount` is compared against the ids the
//   *incoming* material refuses, computed from the document going in, so the sweep says what the
//   number means rather than what it happened to be.
// - **The document that comes out passes its own write seam**, which is the invariant itself.
import { describe, expect, it } from "vitest";

import { setMaterialTier } from "../src/commands/set-whole-kitchen-settings.js";
import type { Design, DesignPlacement } from "../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import {
  materialOffersFinish,
  MATERIALS,
  paletteEntriesOf,
  freeColourFinish,
  type Finish,
  type Material,
} from "../src/materials.js";
import { resolvedFinishOf } from "../src/resolved-finish.js";
import { validateDesignForCatalog } from "../src/validate-design.js";
import { derivePlacementRecords } from "../src/void-engine.js";

const OCCURRED_AT = "2026-09-09T09:00:00.000Z";
const CATALOG = KITCHEN_L_BODY_CATALOG;
const UNDECLARED_ID = "material.laminate";
const OFFERED_TIER_IDS: readonly string[] = [
  ...MATERIALS.map((material) => material.materialId),
  UNDECLARED_ID,
];

/** Every colour a material offers, as values a sweep can hold. A RAL picker offers no palette entry,
 *  so MDF contributes free colours rather than an empty list — otherwise "every material" would
 *  silently skip the one whose control differs most (ADR 0071 decision 3). */
function offeredFinishesOf(material: Material): readonly Finish[] {
  if (material.colourControl.shape === "ral-picker") {
    return [freeColourFinish("#123456"), freeColourFinish("#abcdef")];
  }
  return paletteEntriesOf(material).map((entry) => ({
    kind: "palette-entry" as const,
    entryId: entry.entryId,
  }));
}

/** The seeded kitchen's ids, split by what the **catalogue** says each body can wear — never by a
 *  hand-written list, so an entry gaining or losing its doors moves the fixture with it. */
function finishableIds(): readonly string[] {
  return derivePlacementRecords(KITCHEN_L_DESIGN, CATALOG)
    .filter((record) => record.canFinish)
    .map((record) => record.id);
}

function unfinishableIds(): readonly string[] {
  return derivePlacementRecords(KITCHEN_L_DESIGN, CATALOG)
    .filter((record) => !record.canFinish)
    .map((record) => record.id);
}

/**
 * A document on `material` holding all three states at once: cabinets that **chose** (every other
 * finishable body, so the two halves of the key-set claim are both non-empty), cabinets that
 * **follow** (no key), bodies that **cannot wear one**, and a **kitchen colour** of its own.
 *
 * The chosen colour and the kitchen colour are deliberately different values, so *"kept its own"*
 * and *"adopted the kitchen's"* are distinguishable outcomes rather than one assertion.
 */
function documentOn(
  material: Material,
  chosen: Finish,
  kitchen: Finish,
): Design {
  const overriding = new Set(
    finishableIds().filter((_, index) => index % 2 === 0),
  );
  return {
    ...KITCHEN_L_DESIGN,
    settings: {
      ...KITCHEN_L_DESIGN.settings,
      materialTierId: material.materialId,
      finish: kitchen,
    },
    placements: KITCHEN_L_DESIGN.placements.map((placement) => {
      const body = { ...placement.body };
      delete body.finish;
      return overriding.has(placement.id)
        ? { ...placement, body: { ...body, finish: chosen } }
        : { ...placement, body };
    }),
  };
}

function idsCarryingAFinish(design: Design): string[] {
  return design.placements
    .filter((placement) => "finish" in placement.body)
    .map((placement) => placement.id)
    .sort();
}

function followingPlacements(design: Design): readonly DesignPlacement[] {
  return design.placements.filter((placement) => !("finish" in placement.body));
}

/** The write seam's own verdict on the two finish codes, and only those: a fixture that trips some
 *  unrelated validation rule must not read as this invariant failing. */
function finishIssueCodesOf(design: Design): string[] {
  return validateDesignForCatalog(design, CATALOG)
    .map((issue) => issue.code)
    .filter(
      (code) =>
        code === "PLACEMENT_WEARS_UNOFFERED_FINISH" ||
        code === "SETTINGS_WEAR_UNOFFERED_FINISH",
    );
}

function changeMaterial(design: Design, tierId: string) {
  return setMaterialTier({
    design,
    tierId,
    availableTierIds: OFFERED_TIER_IDS,
    occurredAt: OCCURRED_AT,
  });
}

describe("ADR 0057 decision 2 and ADR 0099 decision 6 — the fixture the sweep needs", () => {
  it("holds a cabinet that chose, a cabinet that follows, and a body that cannot wear a colour", () => {
    const material = MATERIALS[0];
    expect(material).toBeDefined();
    if (material === undefined) return;
    const colours = offeredFinishesOf(material);
    const chosen = colours[0];
    const kitchen = colours[1];
    expect(chosen).toBeDefined();
    expect(kitchen).toBeDefined();
    if (chosen === undefined || kitchen === undefined) return;

    const design = documentOn(material, chosen, kitchen);

    expect(idsCarryingAFinish(design).length).toBeGreaterThan(0);
    expect(followingPlacements(design).length).toBeGreaterThan(0);
    expect(unfinishableIds().length).toBeGreaterThan(0);
    // Nothing was written onto a body that cannot wear a colour, so the claim below about them is
    // about a state the fixture really holds rather than one it invented.
    for (const id of unfinishableIds()) {
      const placement = design.placements.find(
        (candidate) => candidate.id === id,
      );
      expect(placement?.body).not.toHaveProperty("finish");
    }
    expect(design.settings?.finish).toEqual(kitchen);
  });
});

describe("ADR 0099 decision 6 — a material change leaves a document its own write seam accepts", () => {
  /**
   * The whole sweep in one pass: every ordered pair of declared materials, plus each material to
   * the undeclared id and the undeclared id back, over every colour the source material offers.
   *
   * The counters below are the non-vacuity guard, and they are read off **the pairs actually
   * swept** rather than off the fixture: a sweep that refused everything, or one whose every pair
   * happened to be a no-op, would leave them at zero.
   */
  it("restores the invariant at both levels, for every ordered pair and every colour", () => {
    let resets = 0;
    let globalResets = 0;
    let noOps = 0;

    for (const from of MATERIALS) {
      for (const chosen of offeredFinishesOf(from)) {
        const kitchen = offeredFinishesOf(from).find(
          (candidate) => JSON.stringify(candidate) !== JSON.stringify(chosen),
        );
        expect(kitchen).toBeDefined();
        if (kitchen === undefined) continue;
        const before = documentOn(from, chosen, kitchen);
        expect(finishIssueCodesOf(before)).toEqual([]);

        for (const toId of OFFERED_TIER_IDS) {
          const result = changeMaterial(before, toId);
          expect(result.ok, `${from.materialId} -> ${toId}`).toBe(true);
          if (!result.ok) continue;
          const after = result.design;

          // **The key set is invariant.** No follower gained a key; no overrider lost one.
          expect(
            idsCarryingAFinish(after),
            `${from.materialId} -> ${toId} moved the key set`,
          ).toEqual(idsCarryingAFinish(before));

          const declared = MATERIALS.find(
            (material) => material.materialId === toId,
          );
          if (declared === undefined) {
            // ADR 0078 decision 3: an id this product declares no material for corrects nothing,
            // at either level, so the document comes through untouched.
            noOps += 1;
            expect(after.settings?.finish).toEqual(kitchen);
            expect(result.effect.resolvedFinishCount).toBe(0);
            continue;
          }

          // **The post-condition itself**: the document the command produced holds no finish the
          // material it now names refuses — at either level.
          expect(
            finishIssueCodesOf(after),
            `${from.materialId} -> ${toId} left an unoffered finish`,
          ).toEqual([]);

          // **The count says what it means**, derived from the document going in.
          const owed = before.placements.filter((placement) => {
            const finish = placement.body.finish;
            return (
              finish !== undefined && !materialOffersFinish(declared, finish)
            );
          }).length;
          expect(
            result.effect.resolvedFinishCount,
            `${from.materialId} -> ${toId}`,
          ).toBe(owed);
          if (owed > 0) resets += 1;
          if (!materialOffersFinish(declared, kitchen)) globalResets += 1;

          // A cabinet that was following is still following, and follows the colour the document
          // now holds — which is the new material's default wherever the old one was discarded.
          for (const placement of followingPlacements(after)) {
            expect(resolvedFinishOf(placement, after)).toEqual(
              after.settings?.finish,
            );
          }
        }
      }
    }

    // Non-vacuity, from the rows swept: cabinets really were reset, the kitchen's colour really was
    // reset, and the undeclared arm really was exercised.
    expect(resets).toBeGreaterThan(0);
    expect(globalResets).toBeGreaterThan(0);
    expect(noOps).toBeGreaterThan(0);
  });

  /** The reset writes the new material's **declared default** and never a colour derived from the
   *  old one — ADR 0078 decision 4's rejected nearest-finish mapping, which is invisible precisely
   *  because the swatch would look unchanged. Asserted at both levels, over every pair. */
  it("writes the new material's declared default at both levels, never a nearby colour", () => {
    for (const from of MATERIALS) {
      for (const to of MATERIALS) {
        if (from.materialId === to.materialId) continue;
        const colours = offeredFinishesOf(from);
        const chosen = colours[0];
        const kitchen = colours[colours.length - 1];
        if (chosen === undefined || kitchen === undefined) continue;

        const result = changeMaterial(
          documentOn(from, chosen, kitchen),
          to.materialId,
        );
        expect(result.ok).toBe(true);
        if (!result.ok) continue;

        // ADR 0078 decision 1: the offers are disjoint, so *every* carried colour moves.
        expect(materialOffersFinish(to, chosen)).toBe(false);
        expect(materialOffersFinish(to, kitchen)).toBe(false);
        expect(result.design.settings?.finish).toEqual(to.defaultFinish);
        for (const id of idsCarryingAFinish(result.design)) {
          const placement = result.design.placements.find(
            (candidate) => candidate.id === id,
          );
          expect(
            placement?.body.finish,
            `${id} after ${from.materialId} -> ${to.materialId}`,
          ).toEqual(to.defaultFinish);
        }
      }
    }
  });

  /**
   * **The consequence a reader has to be able to find**, and it is ruled rather than a defect: a
   * cabinet reset by ADR 0057 decision 2 still **carries a key**, so it goes on overriding — at the
   * new material's default, which is also what the kitchen now holds. The two are indistinguishable
   * on screen the moment the change lands and diverge on the *next* whole-kitchen colour.
   *
   * Pinned because the alternative reading — that a reset hands the cabinet back to the kitchen —
   * is the one a reader of ADR 0099 decision 2 would expect, and nothing else says which it is.
   */
  it("leaves a reset cabinet overriding, so the next kitchen colour moves the followers only", () => {
    const from = MATERIALS[0];
    const to = MATERIALS[2];
    expect(from).toBeDefined();
    expect(to).toBeDefined();
    if (from === undefined || to === undefined) return;
    const colours = offeredFinishesOf(from);
    const chosen = colours[0];
    const kitchen = colours[1];
    if (chosen === undefined || kitchen === undefined) return;

    const changed = changeMaterial(
      documentOn(from, chosen, kitchen),
      to.materialId,
    );
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    expect(changed.effect.resolvedFinishCount).toBeGreaterThan(0);

    const nextColour = offeredFinishesOf(to).find(
      (candidate) =>
        JSON.stringify(candidate) !== JSON.stringify(to.defaultFinish),
    );
    expect(nextColour).toBeDefined();
    if (nextColour === undefined) return;
    const repainted: Design = {
      ...changed.design,
      settings: { ...changed.design.settings, finish: nextColour },
    };

    const resetIds = idsCarryingAFinish(repainted);
    expect(resetIds.length).toBeGreaterThan(0);
    for (const id of resetIds) {
      const placement = repainted.placements.find(
        (candidate) => candidate.id === id,
      );
      expect(placement).toBeDefined();
      if (placement === undefined) continue;
      // It kept the key the reset wrote, so it did not move.
      expect(resolvedFinishOf(placement, repainted)).toEqual(to.defaultFinish);
    }
    const followers = followingPlacements(repainted);
    expect(followers.length).toBeGreaterThan(0);
    for (const placement of followers) {
      expect(resolvedFinishOf(placement, repainted)).toEqual(nextColour);
    }
  });
});
