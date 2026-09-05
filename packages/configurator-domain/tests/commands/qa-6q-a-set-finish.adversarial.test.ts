// **Adversarial QA for `setFinish`'s second refusal** — the guard order, the default when a design
// says nothing about its material, and the claim that the refusal writes nothing.
//
// The order ADR 0078 decision 6 and `set-appearance.ts`'s head comment both state is: **capability
// first, offer second**. A body with no doors has nothing to say about a colour, so naming the
// kitchen's material at a hood would send the customer to the wrong control. That ordering is only
// a decision if it is asserted for a `canFinish: false` body against a finish the material *does*
// offer as well as one it does not — a single unoffered case passes under either order.
import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { setFinish, setHandle } from "../../src/commands/set-appearance.js";
import type { CommandTarget } from "../../src/commands/command-result.js";
import type { Design } from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import {
  freeColourFinish,
  FREE_COLOUR_PATTERN,
  LEGACY_ENUM_FINISHES,
  MATERIAL_IDS,
  materialOffersFinish,
  materialById,
  PALETTE_ENTRY_IDS,
  paletteFinish,
  type Finish,
  type MaterialId,
} from "../../src/materials.js";
import { clearBodies, insertInto, OCCURRED_AT } from "../support/commands.js";
import { createWorld } from "../support/kitchen-world.js";

/** A seeded body the catalogue declares `canFinish: true` on. */
const FINISHABLE_ID = "p0";

/** The three the catalogue declares `canFinish: false` on — a hood and two the load seam strips a
 *  finish from. All three must refuse for what they are, never for what they were asked to wear. */
const UNFINISHABLE_IDS = ["p7", "p12", "p13"] as const;

const UNDECLARED_TIER_ID = "material.laminate";

/** Every finish this product can express, palette half exhaustive and free half at both hex cases.
 *  Eleven values, and each material offers a different subset. */
function everyFinish(): readonly Finish[] {
  return [
    ...PALETTE_ENTRY_IDS.map((entryId) => paletteFinish(entryId)),
    freeColourFinish("#8d9a84"),
    freeColourFinish("#ECEEEB"),
    freeColourFinish("#000000"),
  ];
}

function withSettings(settings: Design["settings"]): Design {
  return { ...KITCHEN_L_DESIGN, settings };
}

function withMaterial(materialTierId: string): Design {
  return withSettings({ ...KITCHEN_L_DESIGN.settings, materialTierId });
}

function apply(design: Design, target: CommandTarget, finish: Finish) {
  return setFinish({
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    target,
    finish,
    occurredAt: OCCURRED_AT,
  });
}

function outcomeOf(design: Design, finish: Finish): string {
  const result = apply(
    design,
    { kind: "placement", id: FINISHABLE_ID },
    finish,
  );
  return result.ok ? "ok" : result.reason.code;
}

describe("the guard order: capability first, offer second", () => {
  it.each(UNFINISHABLE_IDS)(
    "refuses %s for having no doors, for an offered finish and an unoffered one alike",
    (placementId) => {
      const offered = paletteFinish("pal.alb");
      const unoffered = LEGACY_ENUM_FINISHES.sage;
      expect(
        materialOffersFinish(materialById("material.melamine"), offered),
      ).toBe(true);
      expect(
        materialOffersFinish(materialById("material.melamine"), unoffered),
      ).toBe(false);

      for (const finish of [offered, unoffered]) {
        const result = apply(
          KITCHEN_L_DESIGN,
          { kind: "placement", id: placementId },
          finish,
        );
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason.code).toBe("FINISH_NOT_SUPPORTED");
      }
    },
  );

  it("refuses an inserted open shelf for its kind over the whole finish space", () => {
    // Built rather than taken from the fixture: the seeded `canFinish: false` bodies are all hoods
    // and full-height boxes, and an open shelf is the case §5.5's copy actually names.
    const world = createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);
    const cleared = clearBodies(world, ["p8"]);
    const slot = cleared.voids.find((record) => record.col === "A|0.30");
    expect(slot).toBeDefined();
    const shelf = insertInto(
      cleared,
      { kind: "void", id: slot?.id ?? "" },
      "open-shelf",
    );
    expect(shelf.ok).toBe(true);
    if (!shelf.ok) return;

    for (const materialId of MATERIAL_IDS) {
      const design = {
        ...shelf.design,
        settings: { ...shelf.design.settings, materialTierId: materialId },
      };
      for (const finish of everyFinish()) {
        const result = setFinish({
          design,
          catalog: KITCHEN_L_BODY_CATALOG,
          target: { kind: "placement", id: shelf.effect.placementId },
          finish,
          occurredAt: OCCURRED_AT,
        });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason.code).toBe("FINISH_NOT_SUPPORTED");
      }
    }
  });

  it("keeps the three selection refusals ahead of the offer question", () => {
    // A void, a stale id and a bad clock all carry an unoffered finish here. If any of them
    // answered FINISH_NOT_OFFERED, the panel would name a colour problem for a target that is not
    // a cabinet.
    const unoffered = LEGACY_ENUM_FINISHES.sage;

    expect(
      outcomeOfWith(
        KITCHEN_L_DESIGN,
        { kind: "void", id: "anything" },
        unoffered,
      ),
    ).toBe("VOID_SELECTED");
    expect(
      outcomeOfWith(
        KITCHEN_L_DESIGN,
        { kind: "placement", id: "no-such-placement" },
        unoffered,
      ),
    ).toBe("TARGET_NOT_FOUND");

    const badClock = setFinish({
      design: KITCHEN_L_DESIGN,
      catalog: KITCHEN_L_BODY_CATALOG,
      target: { kind: "placement", id: FINISHABLE_ID },
      finish: unoffered,
      occurredAt: "not a timestamp",
    });
    expect(badClock.ok).toBe(false);
    if (badClock.ok) return;
    expect(badClock.reason.code).toBe("INVALID_OCCURRED_AT");
  });

  function outcomeOfWith(
    design: Design,
    target: CommandTarget,
    finish: Finish,
  ): string {
    const result = apply(design, target, finish);
    return result.ok ? "ok" : result.reason.code;
  }
});

describe("the default material, three ways of saying nothing", () => {
  // `design.settings?.materialTierId ?? DEFAULT_MATERIAL_ID`. A design with no settings container at
  // all and one with a container that omits the key are the same kitchen and must answer alike —
  // and the seeded fixture is only the second of the two, so the first is untested without this.
  const SILENT_DESIGNS = [
    ["no settings container", withSettings(undefined)],
    ["a container with no material key", KITCHEN_L_DESIGN],
    ["PAL named explicitly", withMaterial("material.melamine")],
  ] as const;

  it("answers identically for all three over the whole finish space", () => {
    for (const finish of everyFinish()) {
      const answers = SILENT_DESIGNS.map(([, design]) =>
        outcomeOf(design, finish),
      );
      expect(new Set(answers).size).toBe(1);
    }
  });

  it("meets both outcomes across that space, so the agreement is not agreement on 'refused'", () => {
    const answers = everyFinish().map((finish) =>
      outcomeOf(withSettings(undefined), finish),
    );

    expect(answers.filter((one) => one === "ok")).toHaveLength(6);
    expect(answers.filter((one) => one === "FINISH_NOT_OFFERED")).toHaveLength(
      5,
    );
  });

  it.each(SILENT_DESIGNS)(
    "writes PAL's own decor through %s",
    (_label, design) => {
      const result = apply(
        design,
        { kind: "placement", id: FINISHABLE_ID },
        paletteFinish("pal.antracit"),
      );
      expect(result.ok).toBe(true);
    },
  );
});

describe("the command agrees with the query, over every (material, finish) pair", () => {
  it("succeeds exactly when the declared material offers the finish", () => {
    let successes = 0;
    let refusals = 0;

    for (const materialId of MATERIAL_IDS) {
      const design = withMaterial(materialId);
      for (const finish of everyFinish()) {
        const offered = materialOffersFinish(materialById(materialId), finish);
        const result = apply(
          design,
          { kind: "placement", id: FINISHABLE_ID },
          finish,
        );

        expect(result.ok).toBe(offered);
        if (result.ok) {
          successes += 1;
          expect(
            result.design.placements.find((one) => one.id === FINISHABLE_ID)
              ?.body.finish,
          ).toEqual(finish);
        } else {
          refusals += 1;
          expect(result.reason.code).toBe("FINISH_NOT_OFFERED");
          // The refusal returns the **same object**, not an equal one: a store applying results
          // unconditionally would otherwise replace state with a structural copy.
          expect(result.design).toBe(design);
        }
      }
    }

    // Six PAL decors + two veneer woods + three free colours on MDF = eleven; twenty-two refused.
    expect(successes).toBe(11);
    expect(refusals).toBe(22);
  });

  it("refuses every free colour on both list materials, swept rather than sampled", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<MaterialId>("material.melamine", "material.veneer"),
        fc.stringMatching(FREE_COLOUR_PATTERN),
        (materialId, value) => {
          expect(
            outcomeOf(withMaterial(materialId), freeColourFinish(value)),
          ).toBe("FINISH_NOT_OFFERED");
        },
      ),
      { numRuns: 300 },
    );
  });

  it("accepts every free colour on the picker, swept the same way", () => {
    fc.assert(
      fc.property(fc.stringMatching(FREE_COLOUR_PATTERN), (value) => {
        expect(
          outcomeOf(
            withMaterial("material.painted-mdf"),
            freeColourFinish(value),
          ),
        ).toBe("ok");
      }),
      { numRuns: 300 },
    );
  });

  it("refuses nothing at all when the stored tier names no declared material", () => {
    const design = withMaterial(UNDECLARED_TIER_ID);

    for (const finish of everyFinish()) {
      expect(outcomeOf(design, finish)).toBe("ok");
    }
  });
});

describe("what the refusal does to the document, and to everything beside it", () => {
  it("adds a finish to no placement and moves no timestamp", () => {
    const before = JSON.stringify(KITCHEN_L_DESIGN);

    const result = apply(
      KITCHEN_L_DESIGN,
      { kind: "placement", id: FINISHABLE_ID },
      LEGACY_ENUM_FINISHES.sage,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.design).toBe(KITCHEN_L_DESIGN);
    expect(result.design.updatedAt).toBe(KITCHEN_L_DESIGN.updatedAt);
    expect(JSON.stringify(KITCHEN_L_DESIGN)).toBe(before);
  });

  it("says the same thing twice — the command is a function of its input", () => {
    for (const materialId of [...MATERIAL_IDS, UNDECLARED_TIER_ID]) {
      const design = withMaterial(materialId);
      for (const finish of everyFinish()) {
        expect(outcomeOf(design, finish)).toBe(outcomeOf(design, finish));
      }
    }
  });

  it("leaves setHandle alone — the material decides a colour and nothing else", () => {
    // The offer guard lives in `setFinish` only. A handle on a kitchen whose material offers none
    // of the panel's free colours still applies, or the guard has leaked into the wrong command.
    for (const materialId of [...MATERIAL_IDS, UNDECLARED_TIER_ID]) {
      const result = setHandle({
        design: withMaterial(materialId),
        catalog: KITCHEN_L_BODY_CATALOG,
        target: { kind: "placement", id: FINISHABLE_ID },
        handle: "black",
        occurredAt: OCCURRED_AT,
      });
      expect(result.ok).toBe(true);
    }
  });

  it("records the effect with the finish that was applied, not the one that was refused", () => {
    const applied = apply(
      withMaterial("material.veneer"),
      { kind: "placement", id: FINISHABLE_ID },
      paletteFinish("veneer.nuc"),
    );

    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.effect).toEqual({
      type: "finish_set",
      placementId: FINISHABLE_ID,
      finish: paletteFinish("veneer.nuc"),
    });
  });
});
