// **Adversarial QA of the scene-colour wave — the offer seam, attacked for asymmetry between the
// two levels.**
//
// ADR 0099 decision 4 makes the offered colours a function of the material, and commit `4a3c5b9`'s
// subject states the rule this file exists to break: *the whole-kitchen colour is judged by the same
// offer as the cabinet's*. Amendment A section 1 records what an asymmetry looks like when it ships —
// the write seam **refused a colour on a cabinet and accepted the identical colour on the kitchen**,
// undetected until an adversarial pass went looking.
//
// The seams that must agree are four, and the existing suites assert each of them separately on
// hand-picked colours:
//
// - `setFinish` — the cabinet's command;
// - `setGlobalFinish` — the kitchen's;
// - `PLACEMENT_WEARS_UNOFFERED_FINISH` — the write seam's per-cabinet refusal;
// - `SETTINGS_WEAR_UNOFFERED_FINISH` — its whole-kitchen sibling.
//
// **Here they are asserted against each other**, so a future narrowing of one is a failure rather
// than a new asymmetry, and over the whole space rather than over examples: every palette entry any
// material declares, and free colours swept over the 24-bit range `FREE_COLOUR_PATTERN` admits —
// which is where MDF's RAL picker differs from the other two controls and where a hand-picked pair
// of hexes proves the least.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { setFinish } from "../src/commands/set-appearance.js";
import { setGlobalFinish } from "../src/commands/set-whole-kitchen-settings.js";
import type { Design } from "../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import {
  freeColourFinish,
  materialOffersFinish,
  MATERIALS,
  PALETTE_ENTRIES,
  paletteFinish,
  type Finish,
} from "../src/materials.js";
import {
  CURRENT_SCHEMA_VERSION,
  migrateDesign,
} from "../src/migrate-design.js";
import { validateDesignForCatalog } from "../src/validate-design.js";
import { derivePlacementRecords } from "../src/void-engine.js";

const OCCURRED_AT = "2026-09-09T09:00:00.000Z";
const CATALOG = KITCHEN_L_BODY_CATALOG;

/** A finishable body of the seeded kitchen, read off the catalogue rather than named: the cabinet
 *  half of every comparison below has to be a body `setFinish` will not refuse for a reason that has
 *  nothing to do with the colour. */
const FINISHABLE_ID: string = (() => {
  const record = derivePlacementRecords(KITCHEN_L_DESIGN, CATALOG).find(
    (candidate) => candidate.canFinish,
  );
  if (!record) throw new Error("the seeded kitchen has no finishable body");
  return record.id;
})();

/** The seeded kitchen on one material, with every colour stripped from every level — so each case
 *  below starts from *nothing chosen* and the only difference between two runs is the colour. */
function bareKitchenOn(materialTierId: string): Design {
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

/** `#rrggbb` from a 24-bit integer, lower case — the form both surfaces write
 *  (`editor-panel.tsx` lower-cases the picker's value, and the settings sheet renders the same
 *  component). The upper-case half of `FREE_COLOUR_PATTERN` is a stored-document state, and it is
 *  swept separately below rather than mixed in here. */
function hexOf(value: number): string {
  return `#${value.toString(16).padStart(6, "0")}`;
}

const anyFreeColour: fc.Arbitrary<Finish> = fc
  .integer({ min: 0, max: 0xffffff })
  .map((value) => freeColourFinish(hexOf(value)));

const everyPaletteFinish: readonly Finish[] = PALETTE_ENTRIES.map((entry) =>
  paletteFinish(entry.entryId),
);

/** Whether the cabinet's command accepts this colour on this kitchen. */
function cabinetAccepts(design: Design, finish: Finish): boolean {
  return setFinish({
    design,
    catalog: CATALOG,
    target: { kind: "placement", id: FINISHABLE_ID },
    finish,
    occurredAt: OCCURRED_AT,
  }).ok;
}

/** Whether the kitchen's command accepts it. */
function kitchenAccepts(design: Design, finish: Finish): boolean {
  return setGlobalFinish({ design, finish, occurredAt: OCCURRED_AT }).ok;
}

/** Whether the write seam accepts a document that carries the colour on a **cabinet**. */
function seamAcceptsOnACabinet(design: Design, finish: Finish): boolean {
  const carried: Design = {
    ...design,
    placements: design.placements.map((placement) =>
      placement.id === FINISHABLE_ID
        ? { ...placement, body: { ...placement.body, finish } }
        : placement,
    ),
  };
  return !validateDesignForCatalog(carried, CATALOG).some(
    (issue) => issue.code === "PLACEMENT_WEARS_UNOFFERED_FINISH",
  );
}

/** ...and the same document carrying it on the **kitchen**. */
function seamAcceptsOnTheKitchen(design: Design, finish: Finish): boolean {
  const carried: Design = {
    ...design,
    settings: { ...design.settings, finish },
  };
  return !validateDesignForCatalog(carried, CATALOG).some(
    (issue) => issue.code === "SETTINGS_WEAR_UNOFFERED_FINISH",
  );
}

describe("ADR 0099 — one offer, read at both levels and by both seams", () => {
  /** Every palette entry any material declares, against every material: the exhaustive half, since
   *  the palette space is finite and a sample of it would leave a whole decor untested. */
  it("gives the same answer at both levels and at both seams, for every declared palette entry", () => {
    let accepted = 0;
    let refused = 0;

    for (const material of MATERIALS) {
      const design = bareKitchenOn(material.materialId);
      for (const finish of everyPaletteFinish) {
        const offered = materialOffersFinish(material, finish);
        if (offered) accepted += 1;
        else refused += 1;

        const where = `${material.materialId} / ${JSON.stringify(finish)}`;
        expect(cabinetAccepts(design, finish), `cabinet ${where}`).toBe(
          offered,
        );
        expect(kitchenAccepts(design, finish), `kitchen ${where}`).toBe(
          offered,
        );
        expect(
          seamAcceptsOnACabinet(design, finish),
          `seam/cabinet ${where}`,
        ).toBe(offered);
        expect(
          seamAcceptsOnTheKitchen(design, finish),
          `seam/kitchen ${where}`,
        ).toBe(offered);
      }
    }

    // Non-vacuity, counted from the pairs actually swept: both verdicts occurred, so the four
    // assertions above are not agreeing on one constant answer.
    expect(accepted).toBeGreaterThan(0);
    expect(refused).toBeGreaterThan(0);
  });

  /** The free-colour half, swept over the range rather than over two hexes — MDF's RAL picker offers
   *  *every* colour `FinishSchema` admits and no palette entry (ADR 0071 decision 3, ADR 0078
   *  decision 1), and the other two offer none of them. A narrowing of that at one level only is
   *  exactly the asymmetry Amendment A section 1 shipped once. */
  it("gives the same answer at both levels and at both seams, over the free-colour range", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...MATERIALS.map((material) => material.materialId)),
        anyFreeColour,
        (materialTierId, finish) => {
          const material = MATERIALS.find(
            (candidate) => candidate.materialId === materialTierId,
          );
          expect(material).toBeDefined();
          if (material === undefined) return;
          const design = bareKitchenOn(materialTierId);
          const offered = materialOffersFinish(material, finish);

          expect(cabinetAccepts(design, finish)).toBe(offered);
          expect(kitchenAccepts(design, finish)).toBe(offered);
          expect(seamAcceptsOnACabinet(design, finish)).toBe(offered);
          expect(seamAcceptsOnTheKitchen(design, finish)).toBe(offered);
        },
      ),
      { numRuns: 200 },
    );
  });

  /** The disjointness the whole of ADR 0099 decision 6 rests on, stated as a sweep rather than as a
   *  sentence: no free colour survives a move to a palette material, and no palette entry to MDF. */
  it("offers a free colour on the RAL picker alone, and a palette entry never on it", () => {
    const picker = MATERIALS.filter(
      (material) => material.colourControl.shape === "ral-picker",
    );
    expect(picker.length).toBe(1);

    for (const finish of everyPaletteFinish) {
      for (const material of picker) {
        expect(materialOffersFinish(material, finish)).toBe(false);
      }
    }
    fc.assert(
      fc.property(anyFreeColour, (finish) => {
        for (const material of MATERIALS) {
          expect(materialOffersFinish(material, finish)).toBe(
            material.colourControl.shape === "ral-picker",
          );
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe("ADR 0099 Amendment A section 1 — the load seam corrects both levels, over the range", () => {
  /**
   * The write seam refuses; the **load** seam corrects, so no stored row is ever lost
   * (`migrate-design.ts` runs the resolution immediately before the validation). Existing coverage
   * asserts that on one colour. Swept here over every ordered material pair and the whole free-colour
   * range, at **both** levels in one document, because the two corrections are separate code and a
   * document restored from a backup carries both at once.
   */
  it("lands both levels on the new material's declared default, whatever colour was stored", () => {
    let corrections = 0;

    fc.assert(
      fc.property(
        fc.constantFrom(...MATERIALS.map((material) => material.materialId)),
        fc.oneof(anyFreeColour, fc.constantFrom(...everyPaletteFinish)),
        fc.oneof(anyFreeColour, fc.constantFrom(...everyPaletteFinish)),
        (materialTierId, kitchenColour, cabinetColour) => {
          const material = MATERIALS.find(
            (candidate) => candidate.materialId === materialTierId,
          );
          expect(material).toBeDefined();
          if (material === undefined) return;

          const bare = bareKitchenOn(materialTierId);
          const stored: Design = {
            ...bare,
            settings: { ...bare.settings, finish: kitchenColour },
            placements: bare.placements.map((placement) =>
              placement.id === FINISHABLE_ID
                ? {
                    ...placement,
                    body: { ...placement.body, finish: cabinetColour },
                  }
                : placement,
            ),
          };

          const loaded = migrateDesign(
            CURRENT_SCHEMA_VERSION,
            JSON.parse(JSON.stringify(stored)) as unknown,
            CATALOG,
          );

          // Whatever was stored, what loads is offered — at both levels, by the same offer.
          const loadedKitchen = loaded.settings?.finish;
          expect(loadedKitchen).toBeDefined();
          if (loadedKitchen === undefined) return;
          expect(materialOffersFinish(material, loadedKitchen)).toBe(true);
          const loadedCabinet = loaded.placements.find(
            (placement) => placement.id === FINISHABLE_ID,
          )?.body.finish;
          expect(loadedCabinet).toBeDefined();
          if (loadedCabinet === undefined) return;
          expect(materialOffersFinish(material, loadedCabinet)).toBe(true);

          // ...and the document that came out passes the seam that would have refused what went in.
          expect(
            validateDesignForCatalog(loaded, CATALOG).filter(
              (issue) =>
                issue.code === "PLACEMENT_WEARS_UNOFFERED_FINISH" ||
                issue.code === "SETTINGS_WEAR_UNOFFERED_FINISH",
            ),
          ).toEqual([]);

          if (!materialOffersFinish(material, kitchenColour)) corrections += 1;
        },
      ),
      { numRuns: 150 },
    );

    // Non-vacuity from the runs actually swept: the correction really fired, so the assertions above
    // are not all describing documents that needed no correcting.
    expect(corrections).toBeGreaterThan(0);
  });
});
