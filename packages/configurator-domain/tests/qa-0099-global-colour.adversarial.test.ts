// **Adversarial QA of wave W3 — ADR 0099's two-level colour.**
//
// The wave shipped with its author's own tests. This file attacks the claims those tests make,
// from the outside, on the acceptance criteria ADR 0099 decision 11 states rather than on the
// implementation's shape.
//
// **What it goes after, and why each is here rather than assumed covered:**
//
// - **Precedence at its boundaries** — never chose, chose then cleared, chose *the same value the
//   kitchen holds*, a kitchen colour set before any cabinet exists. The author's file asserts the
//   three levels on one material with one pair of colours; a sweep over all three declared
//   materials and every finish each of them offers is what a `??` chain written the wrong way round
//   for one material would still pass.
// - **Override preservation across interleavings** (acceptance 1). The author's property runs
//   `setGlobalFinish` on a static document. The claim ADR 0099 decision 2 actually makes is about
//   the *document over time*, so this file interleaves the global change with insert, delete,
//   resize and depth change — the three commands that rebuild bodies through `carriedAppearance`,
//   which is the one place a resolved colour could be stamped into `body.finish`.
// - **Both arms of the amended confirmation** (acceptance 6), asserted separately, so an
//   implementation that got the base right and dropped the arm fails on the arm alone.
// - **The write seam.** `validate-design.ts` states ADR 0057's invariant as *"no stored design holds
//   a finish its material does not offer"* and ADR 0099 decision 6 extends that invariant to
//   `settings.finish`. Whether the extension reached the validator is asserted here rather than
//   read off a comment.
// - **Round trip and the no-rollback window** (acceptance 10 and decision 10), characterised rather
//   than fixed.
//
// Assertions are on the **document**, never on a view: a surface rendering the right colour out of a
// document that grew a `finish` key has already converted a following cabinet into an overriding
// one, and the *second* global change would move nothing.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  countCabinetsWearingAChosenFinish,
  wouldDiscardTheGlobalFinish,
} from "../src/chosen-finishes.js";
import { bodyFinishRuleOf, IS_NEVER_PAINTED } from "../src/body-finish-rule.js";
import { insertBody } from "../src/commands/insert-body.js";
import { removePlacement } from "../src/commands/remove-placement.js";
import { clearFinish, setFinish } from "../src/commands/set-appearance.js";
import { setCabinetDepth } from "../src/commands/set-cabinet-depth.js";
import { setWidth } from "../src/commands/set-width.js";
import {
  setGlobalFinish,
  setMaterialTier,
} from "../src/commands/set-whole-kitchen-settings.js";
import type { Design, DesignPlacement, DesignSettings } from "../src/design.js";
import { DesignSettingsSchema } from "../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import {
  freeColourFinish,
  materialById,
  materialOffersFinish,
  MATERIALS,
  paletteEntriesOf,
  paletteFinish,
  sameFinish,
  type Finish,
  type Material,
} from "../src/materials.js";
import {
  CURRENT_SCHEMA_VERSION,
  migrateDesign,
} from "../src/migrate-design.js";
import { priceDesign } from "../src/pricing/price-design.js";
import { SAMPLE_PRICE_BOOK } from "../src/pricing/sample-price-book.js";
import {
  resolvedDefaultFinishOf,
  resolvedFinishOf,
} from "../src/resolved-finish.js";
import { canonicalSerializeDesign } from "../src/serialize-design.js";
import { validateDesignForCatalog } from "../src/validate-design.js";
import { offersFor } from "../src/queries/offers.js";
import {
  derivePlacementRecords,
  type PlacementRecord,
} from "../src/void-engine.js";
import { clearBodies } from "./support/commands.js";
import {
  createFakeProbe,
  createFakeProbeFactory,
} from "./support/fake-probe.js";
import { advance, createWorld } from "./support/kitchen-world.js";
import { offered } from "./support/offers.js";

const OCCURRED_AT = "2026-09-08T09:00:00.000Z";
const CATALOG = KITCHEN_L_BODY_CATALOG;

const PAL_ID = "material.melamine";
const MDF_ID = "material.painted-mdf";
const VENEER_ID = "material.veneer";
const UNDECLARED_ID = "material.laminate";
const OFFERED_TIER_IDS: readonly string[] = [
  PAL_ID,
  MDF_ID,
  VENEER_ID,
  UNDECLARED_ID,
];

const PAL_ALB = paletteFinish("pal.alb");
const PAL_ANTRACIT = paletteFinish("pal.antracit");
const PAL_GRI = paletteFinish("pal.gri-havanna");
const VENEER_NUC = paletteFinish("veneer.nuc");
const MDF_RED = freeColourFinish("#ff0000");

/** Every finish a declared material offers, as concrete values a sweep can draw from. A RAL picker
 *  offers no palette entry, so MDF contributes free colours rather than an empty list — otherwise a
 *  sweep "over all three materials" would silently skip the one whose control differs most. */
function offeredFinishesOf(material: Material): readonly Finish[] {
  if (material.colourControl.shape === "ral-picker") {
    return [freeColourFinish("#123456"), freeColourFinish("#abcdef")];
  }
  return paletteEntriesOf(material).map((entry) =>
    paletteFinish(entry.entryId),
  );
}

function designOn(
  materialTierId: string,
  placements: readonly DesignPlacement[],
): Design {
  return {
    ...KITCHEN_L_DESIGN,
    placements: [...placements],
    settings: { ...KITCHEN_L_DESIGN.settings, materialTierId },
  };
}

/** One placement of the seeded kitchen, with the finish stated or with none at all. */
function placementWearing(
  index: number,
  finish: Finish | undefined,
): DesignPlacement {
  const placement = KITCHEN_L_DESIGN.placements[index];
  if (placement === undefined) throw new Error("seeded fixture is too short");
  const body = { ...placement.body };
  delete body.finish;
  return {
    ...placement,
    body: finish === undefined ? body : { ...body, finish },
  };
}

function withGlobalFinish(design: Design, finish: Finish): Design {
  return { ...design, settings: { ...design.settings, finish } };
}

/** A design carrying no `settings.finish` key at all — absence, not `undefined`, because the two
 *  round-trip differently through a save. */
function withoutGlobalFinish(design: Design): Design {
  const settings: DesignSettings = { ...design.settings };
  delete settings.finish;
  return { ...design, settings };
}

/** The seeded kitchen with every cabinet following: no `body.finish` key anywhere. */
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

function applyGlobalFinish(design: Design, finish: Finish): Design {
  const result = setGlobalFinish({ design, finish, occurredAt: OCCURRED_AT });
  if (!result.ok) {
    throw new Error(`setGlobalFinish refused: ${result.reason.code}`);
  }
  return result.design;
}

/** Which placement ids carry a `finish` key, and what each one is — the document-level fact every
 *  preservation claim in this file is measured on. */
function carriedFinishes(design: Design): Record<string, string> {
  const carried: Record<string, string> = {};
  for (const placement of design.placements) {
    if (placement.body.finish !== undefined) {
      carried[placement.id] = JSON.stringify(placement.body.finish);
    }
  }
  return carried;
}

describe("ADR 0099 decision 1 — precedence, swept over every declared material", () => {
  // The author's file asserts the order on PAL with two colours. A `??` chain written
  // `settings.finish ?? placement.body.finish` passes that for a design where the two happen to
  // agree; this cannot, because it demands the cabinet's value back while the kitchen holds a
  // different one, for every material and every colour each of them offers.
  it("returns the cabinet's own colour over the kitchen's, for every material and every pair", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...MATERIALS),
        fc.nat({ max: 8 }),
        fc.nat({ max: 8 }),
        (material, ownAt, kitchenAt) => {
          const offered = offeredFinishesOf(material);
          const own = offered[ownAt % offered.length];
          const kitchen = offered[kitchenAt % offered.length];
          if (own === undefined || kitchen === undefined) return;

          const design = withGlobalFinish(
            designOn(material.materialId, [placementWearing(0, own)]),
            kitchen,
          );
          const placement = design.placements[0];
          if (placement === undefined) return;

          expect(resolvedFinishOf(placement, design)).toEqual(own);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("returns the kitchen's colour for a cabinet that never chose, for every material", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...MATERIALS),
        fc.nat({ max: 8 }),
        (material, kitchenAt) => {
          const offered = offeredFinishesOf(material);
          const kitchen = offered[kitchenAt % offered.length];
          if (kitchen === undefined) return;

          const design = withGlobalFinish(
            designOn(material.materialId, [placementWearing(0, undefined)]),
            kitchen,
          );
          const placement = design.placements[0];
          if (placement === undefined) return;

          expect(resolvedFinishOf(placement, design)).toEqual(kitchen);
          expect(placement.body).not.toHaveProperty("finish");
        },
      ),
      { numRuns: 200 },
    );
  });

  it("returns the material's declared default where neither level chose, for every material", () => {
    for (const material of MATERIALS) {
      const design = withoutGlobalFinish(
        designOn(material.materialId, [placementWearing(0, undefined)]),
      );
      const placement = design.placements[0];
      expect(placement).toBeDefined();
      if (placement === undefined) continue;

      expect(resolvedFinishOf(placement, design)).toEqual(
        material.defaultFinish,
      );
    }
  });
});

describe("ADR 0099 decision 5 — chose-the-same-value is not the same state as following", () => {
  /**
   * **The distinction the whole record stands on.** A cabinet that explicitly chose the colour the
   * kitchen happens to hold resolves identically to one that is merely following it — so the only
   * way to tell them apart is what the *next* global change does. If `setGlobalFinish` ever stamped
   * a resolved colour in, or if a clear ever wrote the current global value into the key, these two
   * would converge and the customer's choice would be gone.
   */
  it("diverges on the next global change, though the two resolve alike today", () => {
    const following = withGlobalFinish(
      designOn(PAL_ID, [placementWearing(0, undefined)]),
      PAL_GRI,
    );
    const choosing = withGlobalFinish(
      designOn(PAL_ID, [placementWearing(0, PAL_GRI)]),
      PAL_GRI,
    );

    const firstFollowing = following.placements[0];
    const firstChoosing = choosing.placements[0];
    expect(firstFollowing).toBeDefined();
    expect(firstChoosing).toBeDefined();
    if (firstFollowing === undefined || firstChoosing === undefined) return;

    // Today they wear the same colour.
    expect(resolvedFinishOf(firstFollowing, following)).toEqual(
      resolvedFinishOf(firstChoosing, choosing),
    );
    // And the document already tells them apart.
    expect(firstFollowing.body).not.toHaveProperty("finish");
    expect(firstChoosing.body.finish).toEqual(PAL_GRI);

    const movedFollowing = applyGlobalFinish(following, PAL_ANTRACIT);
    const movedChoosing = applyGlobalFinish(choosing, PAL_ANTRACIT);

    const afterFollowing = movedFollowing.placements[0];
    const afterChoosing = movedChoosing.placements[0];
    expect(afterFollowing).toBeDefined();
    expect(afterChoosing).toBeDefined();
    if (afterFollowing === undefined || afterChoosing === undefined) return;

    expect(resolvedFinishOf(afterFollowing, movedFollowing)).toEqual(
      PAL_ANTRACIT,
    );
    expect(resolvedFinishOf(afterChoosing, movedChoosing)).toEqual(PAL_GRI);
  });

  // ADR 0099 decision 7's amended base makes the *count* deliberately blind to this distinction.
  // Asserted rather than left implicit, because it is a real consequence: the confirmation cannot
  // see an override that agrees with the kitchen, and the second arm is what covers the loss.
  it("is a distinction countCabinetsWearingAChosenFinish deliberately cannot see", () => {
    const choosing = withGlobalFinish(
      designOn(PAL_ID, [placementWearing(0, PAL_GRI)]),
      PAL_GRI,
    );
    const following = withGlobalFinish(
      designOn(PAL_ID, [placementWearing(0, undefined)]),
      PAL_GRI,
    );

    expect(countCabinetsWearingAChosenFinish(choosing)).toBe(0);
    expect(countCabinetsWearingAChosenFinish(following)).toBe(0);
    // ...and the second arm is what makes the press still owe a confirmation.
    expect(wouldDiscardTheGlobalFinish(choosing, VENEER_ID)).toBe(true);
  });
});

describe("ADR 0099 acceptance 3 — a cleared override never re-acquires the key", () => {
  /** The author's file asserts two global changes after a clear on a design that *already* had a
   *  global colour. The sharper case is a clear on a design with **no** global colour at all: a
   *  clear that wrote the resolved default in would put the *material's* default into the key, and
   *  the first global change afterwards would then move nothing. */
  it("survives a clear made before any global colour exists, then follows the first change", () => {
    const overriding = designOn(PAL_ID, [placementWearing(0, PAL_ANTRACIT)]);
    const cleared = clearFinish({
      design: withoutGlobalFinish(overriding),
      catalog: CATALOG,
      target: { kind: "placement", id: overriding.placements[0]?.id ?? "" },
      occurredAt: OCCURRED_AT,
    });
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) return;
    expect(cleared.design.placements[0]?.body).not.toHaveProperty("finish");

    const first = applyGlobalFinish(cleared.design, PAL_GRI);
    const second = applyGlobalFinish(first, PAL_ANTRACIT);

    for (const [design, expected] of [
      [first, PAL_GRI],
      [second, PAL_ANTRACIT],
    ] as const) {
      const placement = design.placements[0];
      expect(placement).toBeDefined();
      if (placement === undefined) continue;
      expect(placement.body).not.toHaveProperty("finish");
      expect(resolvedFinishOf(placement, design)).toEqual(expected);
    }
  });

  /** Set → clear → set → clear, four presses, and the key must be gone at the end. A clear
   *  implemented as `finish: undefined` passes a `toBeUndefined` check and fails this one, because
   *  `JSON.stringify` is what a save actually writes. */
  it("leaves a body that serialises without the key after a set/clear cycle", () => {
    const design = withoutGlobalFinish(
      designOn(PAL_ID, [placementWearing(0, undefined)]),
    );
    const id = design.placements[0]?.id ?? "";

    let current = design;
    for (const finish of [PAL_ANTRACIT, PAL_GRI]) {
      const set = setFinish({
        design: current,
        catalog: CATALOG,
        target: { kind: "placement", id },
        finish,
        occurredAt: OCCURRED_AT,
      });
      expect(set.ok).toBe(true);
      if (!set.ok) return;
      const cleared = clearFinish({
        design: set.design,
        catalog: CATALOG,
        target: { kind: "placement", id },
        occurredAt: OCCURRED_AT,
      });
      expect(cleared.ok).toBe(true);
      if (!cleared.ok) return;
      current = cleared.design;
    }

    expect(JSON.stringify(current.placements[0]?.body)).not.toContain("finish");
  });
});

describe("ADR 0099 acceptance 4 — a kitchen colour set before the cabinet exists", () => {
  /** **The kitchen with nothing in it**, which is the boundary the sheet reaches on a design a
   *  customer has only just started: a colour chosen before any cabinet exists must be storable, and
   *  it must be stored at the whole-kitchen level rather than nowhere. */
  it("is settable on a design holding no placements at all", () => {
    const empty = withoutGlobalFinish({
      ...KITCHEN_L_DESIGN,
      placements: [],
      settings: { ...KITCHEN_L_DESIGN.settings, materialTierId: PAL_ID },
    });

    const painted = applyGlobalFinish(empty, PAL_ANTRACIT);

    expect(painted.placements).toHaveLength(0);
    expect(painted.settings?.finish).toEqual(PAL_ANTRACIT);
    expect(resolvedDefaultFinishOf(painted)).toEqual(PAL_ANTRACIT);
  });

  /** `insertBody` after a global change: the new body carries no `finish` and therefore renders the
   *  global colour. The opening is made by removing a seeded body, because a void is derived from a
   *  frozen column and a design holding no placements has none — the empty kitchen above is the same
   *  criterion at the only level a document can actually reach it. */
  it("is followed by a cabinet inserted afterwards, which grows no finish key", () => {
    const opened = clearBodies(
      createWorld(everyCabinetFollowing(PAL_ID), CATALOG),
      ["p1"],
    );
    const painted = applyGlobalFinish(
      withoutGlobalFinish(opened.design),
      PAL_ANTRACIT,
    );
    const world = advance(opened, painted);
    const chosen = firstOfferedInsert(world);
    expect(chosen).toBeDefined();
    if (chosen === undefined) return;

    const inserted = insertBody({
      design: world.design,
      catalog: CATALOG,
      columns: world.columns,
      voids: world.voids,
      target: { kind: "void", id: chosen.voidId },
      buildId: chosen.buildId,
      probe: createFakeProbe({ catalog: CATALOG }),
      occurredAt: OCCURRED_AT,
    });
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;

    const placement = inserted.design.placements.at(-1);
    expect(placement).toBeDefined();
    if (placement === undefined) return;
    expect(placement.body).not.toHaveProperty("finish");
    expect(resolvedFinishOf(placement, inserted.design)).toEqual(PAL_ANTRACIT);
  });
});

/** The first opening in this world that has something insertable in it, and what to insert — asked
 *  through `offersFor` so a fixture picks a body the command will actually accept rather than one
 *  the band gate refuses. */
function firstOfferedInsert(
  world: ReturnType<typeof createWorld>,
): { readonly voidId: string; readonly buildId: string } | undefined {
  for (const opening of world.voids) {
    const rows = offered(
      offersFor({
        records: world.records,
        voids: world.voids,
        columns: world.columns,
        catalog: world.catalog,
        target: { kind: "void", id: opening.id },
        cabinetDepthMm: world.cabinetDepthMm,
      }),
    );
    const first = rows[0];
    if (first !== undefined) {
      return { voidId: opening.id, buildId: first.buildId };
    }
  }
  return undefined;
}

describe("ADR 0099 decision 2 — no command path stamps a resolved colour into a body", () => {
  /**
   * **The claim the author proves on a static document, attacked over time.**
   *
   * `insertBody` and the resize rebuild both go through `carriedAppearance`, which copies
   * `PlacementRecord.finishKey` onto the new body — and that record is derived from
   * `body.finish`. If any of those seams ever read the *resolved* finish instead, a following
   * cabinet would silently become an overriding one and the next global change would move nothing.
   *
   * The sequence is shuffled rather than fixed, so an ordering that only fails when the global
   * change lands *between* two structural commands cannot hide.
   */
  it("keeps every following cabinet following across a shuffled command sequence", () => {
    const steps = ["colour", "remove", "insert", "resize", "depth"] as const;

    fc.assert(
      fc.property(
        fc.shuffledSubarray([...steps], { minLength: steps.length }),
        fc.constantFrom(PAL_ALB, PAL_ANTRACIT, PAL_GRI),
        (order, globalFinish) => {
          let world = createWorld(everyCabinetFollowing(PAL_ID), CATALOG);
          expect(carriedFinishes(world.design)).toEqual({});

          for (const step of order) {
            world = runStep(world, step, globalFinish);
          }

          // The document must not have grown a single `finish` key, whatever the order was.
          expect(carriedFinishes(world.design)).toEqual({});
          for (const placement of world.design.placements) {
            expect(placement.body).not.toHaveProperty("finish");
          }
        },
      ),
      { numRuns: 60 },
    );
  });

  /** The same sequence over a kitchen where every cabinet *did* choose: nothing may be rewritten,
   *  and the values must come back byte-identical. */
  it("keeps every chosen colour byte-identical across the same shuffled sequence", () => {
    const steps = ["colour", "remove", "insert", "resize", "depth"] as const;

    fc.assert(
      fc.property(
        fc.shuffledSubarray([...steps], { minLength: steps.length }),
        fc.constantFrom(PAL_ALB, PAL_ANTRACIT, PAL_GRI),
        (order, globalFinish) => {
          const painted = paintEveryFinishableBody(
            everyCabinetFollowing(PAL_ID),
            PAL_ANTRACIT,
          );
          let world = createWorld(painted, CATALOG);
          const before = carriedFinishes(world.design);
          expect(Object.keys(before).length).toBeGreaterThan(0);

          for (const step of order) {
            world = runStep(world, step, globalFinish);
          }

          // Every id that survived the sequence still wears exactly what it wore.
          const after = carriedFinishes(world.design);
          for (const [id, finish] of Object.entries(after)) {
            if (before[id] !== undefined) expect(finish).toBe(before[id]);
          }
        },
      ),
      { numRuns: 60 },
    );
  });
});

type Step = "colour" | "remove" | "insert" | "resize" | "depth";

/** One step of the interleaving. A refusal is not a failure — the sequence is deliberately allowed
 *  to reach states where a resize or an insert is illegal — but a step that *succeeds* must leave
 *  the colour rules intact, which is what the callers assert. */
function runStep(
  world: ReturnType<typeof createWorld>,
  step: Step,
  globalFinish: Finish,
): ReturnType<typeof createWorld> {
  if (step === "colour") {
    const result = setGlobalFinish({
      design: world.design,
      finish: globalFinish,
      occurredAt: OCCURRED_AT,
    });
    return result.ok ? advance(world, result.design) : world;
  }
  if (step === "remove") {
    const removable = world.records.find((record) => record.canDelete);
    if (!removable) return world;
    const result = removePlacement({
      design: world.design,
      catalog: world.catalog,
      target: { kind: "placement", id: removable.id },
      occurredAt: OCCURRED_AT,
    });
    return result.ok ? advance(world, result.design) : world;
  }
  if (step === "insert") {
    const chosen = firstOfferedInsert(world);
    if (chosen === undefined) return world;
    const result = insertBody({
      design: world.design,
      catalog: world.catalog,
      columns: world.columns,
      voids: world.voids,
      target: { kind: "void", id: chosen.voidId },
      buildId: chosen.buildId,
      probe: createFakeProbe({ catalog: world.catalog }),
      occurredAt: OCCURRED_AT,
    });
    return result.ok ? advance(world, result.design) : world;
  }
  if (step === "resize") {
    const resizable = world.records.find((record) => !record.fixedWidth);
    if (!resizable) return world;
    const result = setWidth({
      design: world.design,
      catalog: world.catalog,
      columns: world.columns,
      target: { kind: "placement", id: resizable.id },
      widthMm: Math.round(resizable.frame.w * 1000) - 100,
      probe: createFakeProbe({ catalog: world.catalog }),
      occurredAt: OCCURRED_AT,
    });
    return result.ok ? advance(world, result.design) : world;
  }
  const result = setCabinetDepth({
    design: world.design,
    catalogAt: buildKitchenLBodyCatalog,
    cabinetDepthMm: 700,
    probeAt: createFakeProbeFactory(),
    occurredAt: OCCURRED_AT,
  });
  return result.ok ? advance(world, result.design) : world;
}

/** Every body the catalogue says can wear a colour, wearing one. Bodies that cannot are left alone,
 *  because `carriedAppearance` refuses to carry one onto them and a fixture that wrote one would be
 *  measuring a state no seam produces. */
function paintEveryFinishableBody(design: Design, finish: Finish): Design {
  const records = derivePlacementRecords(design, CATALOG);
  const finishable = new Set(
    records.filter((record) => record.canFinish).map((record) => record.id),
  );
  return {
    ...design,
    placements: design.placements.map((placement) =>
      finishable.has(placement.id)
        ? { ...placement, body: { ...placement.body, finish } }
        : placement,
    ),
  };
}

describe("ADR 0099 acceptance 5 — a material change re-resolves both levels, once", () => {
  function changeMaterial(design: Design, tierId: string) {
    return setMaterialTier({
      design,
      tierId,
      availableTierIds: OFFERED_TIER_IDS,
      occurredAt: OCCURRED_AT,
    });
  }

  it("resets settings.finish to the new material's default, and counts only cabinets", () => {
    const design = withGlobalFinish(
      designOn(PAL_ID, [
        placementWearing(0, PAL_ANTRACIT),
        placementWearing(1, undefined),
      ]),
      PAL_GRI,
    );

    const result = changeMaterial(design, VENEER_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.settings?.finish).toEqual(
      materialById(VENEER_ID).defaultFinish,
    );
    // The global reset is *not* a cabinet: exactly one placement moved.
    expect(result.effect.resolvedFinishCount).toBe(1);
    // ...and the following cabinet did not grow a key.
    expect(result.design.placements[1]?.body).not.toHaveProperty("finish");
  });

  it("resets neither level on a change resolving to the same declared material", () => {
    const design = withGlobalFinish(
      designOn(PAL_ID, [placementWearing(0, PAL_ANTRACIT)]),
      PAL_GRI,
    );

    const result = changeMaterial(design, PAL_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.settings?.finish).toEqual(PAL_GRI);
    expect(result.design.placements[0]?.body.finish).toEqual(PAL_ANTRACIT);
    expect(result.effect.resolvedFinishCount).toBe(0);
  });

  it("resets neither level for a tier the domain declares no material for", () => {
    const design = withGlobalFinish(
      designOn(PAL_ID, [placementWearing(0, PAL_ANTRACIT)]),
      PAL_GRI,
    );

    const result = changeMaterial(design, UNDECLARED_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.settings?.finish).toEqual(PAL_GRI);
    expect(result.design.placements[0]?.body.finish).toEqual(PAL_ANTRACIT);
  });

  /** *"Once, not per cabinet"*, measured on a document with many cabinets: the global reset must be
   *  a single value, not something written per placement, and it must be the *new* material's
   *  default rather than the nearest colour to the old one. */
  it("writes one global value however many cabinets the document holds", () => {
    const design = withGlobalFinish(
      designOn(
        PAL_ID,
        KITCHEN_L_DESIGN.placements.map((_, at) =>
          placementWearing(at, undefined),
        ),
      ),
      PAL_GRI,
    );

    const result = changeMaterial(design, MDF_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.settings?.finish).toEqual(
      materialById(MDF_ID).defaultFinish,
    );
    expect(result.effect.resolvedFinishCount).toBe(0);
    expect(carriedFinishes(result.design)).toEqual({});
  });

  /** ADR 0099 decision 6's *certainty*: between any two different declared materials, the offers are
   *  disjoint, so the global colour is reset **every** time. Swept over every ordered pair and every
   *  colour the source material offers, so a pair that happened to share a value would fail here
   *  rather than in production. */
  it("resets the global colour for every ordered pair of different declared materials", () => {
    for (const from of MATERIALS) {
      for (const to of MATERIALS) {
        if (from.materialId === to.materialId) continue;
        for (const finish of offeredFinishesOf(from)) {
          const design = withGlobalFinish(
            designOn(from.materialId, []),
            finish,
          );

          const result = changeMaterial(design, to.materialId);

          expect(result.ok).toBe(true);
          if (!result.ok) continue;
          expect(materialOffersFinish(to, finish)).toBe(false);
          expect(result.design.settings?.finish).toEqual(to.defaultFinish);
        }
      }
    }
  });
});

describe("ADR 0099 acceptance 6 — both arms of the confirmation, separately", () => {
  /**
   * **ADR 0099 acceptance 6's own fixture, word for word**: *"a design where every cabinet matches
   * the global colour and none matches `material.defaultFinish`"*.
   *
   * The cabinets **carry** the colour rather than merely following it, which is what makes the first
   * half non-vacuous: on a kitchen where nobody chose anything the count is zero under the old base
   * too, and a test built that way passes for an implementation that never moved the base at all.
   */
  const followingAKitchenColour = withGlobalFinish(
    designOn(PAL_ID, [
      placementWearing(0, PAL_ANTRACIT),
      placementWearing(1, PAL_ANTRACIT),
    ]),
    PAL_ANTRACIT,
  );

  it("has a fixture whose cabinets differ from the material's own default", () => {
    // Otherwise "counts zero" would be the old base's answer as well.
    expect(sameFinish(PAL_ANTRACIT, materialById(PAL_ID).defaultFinish)).toBe(
      false,
    );
    for (const placement of followingAKitchenColour.placements) {
      expect(placement.body.finish).toEqual(PAL_ANTRACIT);
    }
  });

  it("owes nothing for the cabinets — the amended base counts zero", () => {
    expect(countCabinetsWearingAChosenFinish(followingAKitchenColour)).toBe(0);
  });

  it("owes one for the kitchen's own colour — the arm that would otherwise be silent", () => {
    expect(
      wouldDiscardTheGlobalFinish(followingAKitchenColour, VENEER_ID),
    ).toBe(true);
  });

  it("owes nothing on the second arm where the target material offers the colour anyway", () => {
    expect(wouldDiscardTheGlobalFinish(followingAKitchenColour, PAL_ID)).toBe(
      false,
    );
  });

  it("owes nothing on the second arm where no global colour is set at all", () => {
    expect(
      wouldDiscardTheGlobalFinish(
        withoutGlobalFinish(followingAKitchenColour),
        VENEER_ID,
      ),
    ).toBe(false);
  });

  it("owes nothing on the second arm for a tier the domain does not declare", () => {
    expect(
      wouldDiscardTheGlobalFinish(followingAKitchenColour, UNDECLARED_ID),
    ).toBe(false);
  });

  /** The arm must be true exactly when the material change would actually discard the colour, which
   *  is a fact about `setMaterialTier`'s own output rather than about a predicate read twice. */
  it("agrees with what setMaterialTier actually does, over every material and colour", () => {
    for (const from of MATERIALS) {
      for (const finish of offeredFinishesOf(from)) {
        for (const to of MATERIALS) {
          const design = withGlobalFinish(
            designOn(from.materialId, []),
            finish,
          );
          const result = setMaterialTier({
            design,
            tierId: to.materialId,
            availableTierIds: OFFERED_TIER_IDS,
            occurredAt: OCCURRED_AT,
          });
          expect(result.ok).toBe(true);
          if (!result.ok) continue;

          const actuallyLost = !sameFinish(
            result.design.settings?.finish ?? to.defaultFinish,
            finish,
          );
          expect(wouldDiscardTheGlobalFinish(design, to.materialId)).toBe(
            actuallyLost,
          );
        }
      }
    }
  });
});

// **The hood, and only bodies like it.** ADR 0099 acceptance 8 was written when `canFinish: false`
// meant one thing; since the owner's ruling of 2026-09-09 it means two, and the half this block
// asserts is the appliance half. The corner bodies and the open shelf carry the same flag and are
// now *painted* with the kitchen — see
// `structural-cabinetry-follows-the-kitchens-colour.test.ts`, which names all four.
describe("ADR 0099 acceptance 8 — an appliance is untouched at both levels", () => {
  const hoodId = "p13";

  it("is not counted, not painted, and not given a key by a global change", () => {
    const design = applyGlobalFinish(
      withoutGlobalFinish(everyCabinetFollowing(PAL_ID)),
      PAL_ANTRACIT,
    );
    const hood = design.placements.find((placement) => placement.id === hoodId);
    expect(hood).toBeDefined();
    if (hood === undefined) return;

    const record = derivePlacementRecords(design, CATALOG).find(
      (candidate) => candidate.id === hoodId,
    );
    expect(record?.canFinish).toBe(false);
    expect(hood.body).not.toHaveProperty("finish");
    expect(countCabinetsWearingAChosenFinish(design)).toBe(0);
  });

  it("survives the load seam's strip with nothing to do after a global change", () => {
    const design = applyGlobalFinish(
      withoutGlobalFinish(everyCabinetFollowing(PAL_ID)),
      PAL_ANTRACIT,
    );

    const loaded = migrateDesign(
      CURRENT_SCHEMA_VERSION,
      JSON.parse(JSON.stringify(design)) as unknown,
      CATALOG,
    );

    expect(canonicalSerializeDesign(loaded)).toBe(
      canonicalSerializeDesign(design),
    );
  });

  it("refuses a per-cabinet colour on it, so the kitchen's colour is its only one", () => {
    const design = applyGlobalFinish(
      withoutGlobalFinish(everyCabinetFollowing(PAL_ID)),
      PAL_ANTRACIT,
    );

    const result = setFinish({
      design,
      catalog: CATALOG,
      target: { kind: "placement", id: hoodId },
      finish: PAL_GRI,
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("FINISH_NOT_SUPPORTED");
  });

  it("refuses a clear on it too, rather than pretending it was ever following", () => {
    const design = applyGlobalFinish(
      withoutGlobalFinish(everyCabinetFollowing(PAL_ID)),
      PAL_ANTRACIT,
    );

    const result = clearFinish({
      design,
      catalog: CATALOG,
      target: { kind: "placement", id: hoodId },
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("FINISH_NOT_SUPPORTED");
  });
});

describe("ADR 0099 acceptance 9 — no price moves at either level", () => {
  function priceOf(design: Design) {
    return priceDesign({
      design,
      catalog: CATALOG,
      book: SAMPLE_PRICE_BOOK,
      pricingVersion: SAMPLE_PRICE_BOOK.version,
    });
  }

  it("prices a kitchen identically whatever global colour it carries", () => {
    const base = withoutGlobalFinish(everyCabinetFollowing(PAL_ID));
    const unpainted = priceOf(base);
    expect(unpainted.ok).toBe(true);

    for (const finish of offeredFinishesOf(materialById(PAL_ID))) {
      const painted = priceOf(applyGlobalFinish(base, finish));
      expect(JSON.stringify(painted)).toBe(JSON.stringify(unpainted));
    }
  });

  it("prices a kitchen identically whether a cabinet follows or overrides", () => {
    const base = applyGlobalFinish(
      withoutGlobalFinish(everyCabinetFollowing(PAL_ID)),
      PAL_ANTRACIT,
    );
    const overriding = paintEveryFinishableBody(base, PAL_GRI);

    expect(JSON.stringify(priceOf(overriding))).toBe(
      JSON.stringify(priceOf(base)),
    );
  });
});

describe("ADR 0099 acceptance 10 and decision 10 — round trip, and the rollback window", () => {
  const stored = applyGlobalFinish(
    withoutGlobalFinish(everyCabinetFollowing(PAL_ID)),
    PAL_ANTRACIT,
  );

  function reload(design: Design): Design {
    return migrateDesign(
      CURRENT_SCHEMA_VERSION,
      JSON.parse(canonicalSerializeDesign(design)) as unknown,
      CATALOG,
    );
  }

  it("loads, saves and loads a document carrying settings.finish byte-identically", () => {
    const once = reload(stored);
    const twice = reload(once);

    expect(canonicalSerializeDesign(once)).toBe(
      canonicalSerializeDesign(stored),
    );
    expect(canonicalSerializeDesign(twice)).toBe(
      canonicalSerializeDesign(once),
    );
    expect(once.settings?.finish).toEqual(PAL_ANTRACIT);
  });

  it("does not grow the key on a document that carries none", () => {
    const bare = withoutGlobalFinish(everyCabinetFollowing(PAL_ID));

    const once = reload(bare);
    const twice = reload(once);

    expect(once.settings).not.toHaveProperty("finish");
    expect(twice.settings).not.toHaveProperty("finish");
    expect(canonicalSerializeDesign(twice)).toBe(
      canonicalSerializeDesign(bare),
    );
  });

  /** **The forward direction is safe**, which is the half decision 10 asserts by measurement: a
   *  document written *without* the key parses against the schema that has it. */
  it("parses a settings container written before the key existed", () => {
    const legacy = { materialTierId: PAL_ID, cabinetDepthMm: 600 };

    expect(DesignSettingsSchema.safeParse(legacy).success).toBe(true);
  });

  /**
   * **The hazard, characterised rather than fixed** (ADR 0099 decision 10).
   *
   * `DesignSettingsSchema` is a `strictObject`, so a build that does not declare `finish` refuses
   * every document that carries it. This reconstructs that build's schema — the current one minus
   * the key — and shows the refusal, which is what the wave's close-out has to state as a
   * no-rollback window. **This test asserts the hazard is real; it does not ask for it to be
   * removed.**
   */
  it("is refused by a strict settings schema that does not declare the key", () => {
    const rolledBack = DesignSettingsSchema.omit({ finish: true });
    const carrying = {
      materialTierId: PAL_ID,
      cabinetDepthMm: 600,
      finish: PAL_ANTRACIT,
    };

    expect(DesignSettingsSchema.safeParse(carrying).success).toBe(true);
    expect(rolledBack.safeParse(carrying).success).toBe(false);
  });
});

describe("ADR 0099 decision 6 — ADR 0057's invariant at the write seam", () => {
  /**
   * **The claim under test is `validate-design.ts`'s own sentence**: *"no stored design holds a
   * finish its material does not offer"*. ADR 0099 decision 6 says that invariant *"now has to
   * cover `settings.finish` as well as every `body.finish`"*.
   *
   * The per-placement half is asserted first, so this file cannot pass by the validator being
   * broken for both.
   */
  it("refuses a placement wearing a colour the material does not offer", () => {
    const design = designOn(VENEER_ID, [placementWearing(0, MDF_RED)]);

    const issues = validateDesignForCatalog(design, CATALOG);

    expect(
      issues.some((issue) => issue.code === "PLACEMENT_WEARS_UNOFFERED_FINISH"),
    ).toBe(true);
  });

  // **DEFECT — reported, not worked around.** `findUnofferedFinishIssues` iterates
  // `design.placements` only, so a document whose *whole-kitchen* colour the material does not offer
  // is accepted at `PUT /api/designs/[id]` while the identical colour on a body is refused. The load
  // seam corrects it on the way back out, so nothing crashes — but the invariant ADR 0099 decision 6
  // extends is enforced at one of the two seams ADR 0057 built it for.
  // Production: packages/configurator-domain/src/validate-design.ts:131.
  it("refuses a whole-kitchen colour the material does not offer", () => {
    const design = withGlobalFinish(designOn(VENEER_ID, []), MDF_RED);

    const issues = validateDesignForCatalog(design, CATALOG);

    expect(materialOffersFinish(materialById(VENEER_ID), MDF_RED)).toBe(false);
    expect(issues.length).toBeGreaterThan(0);
  });

  /** **The safety net that keeps such a row loading** (`migrate-design.ts`'s
   *  `resolveGlobalFinishTheMaterialDoesNotOffer`), which is the only thing standing between the
   *  hole above and a customer's kitchen. A stored document whose whole-kitchen colour the material
   *  does not offer must load as that material's declared default rather than be refused. */
  it("corrects a stored whole-kitchen colour the material does not offer, on load", () => {
    const stored = {
      ...withGlobalFinish(everyCabinetFollowing(VENEER_ID), MDF_RED),
    };

    const loaded = migrateDesign(
      CURRENT_SCHEMA_VERSION,
      JSON.parse(JSON.stringify(stored)) as unknown,
      CATALOG,
    );

    expect(loaded.settings?.finish).toEqual(
      materialById(VENEER_ID).defaultFinish,
    );
  });

  /** ...and it leaves a colour the material *does* offer alone, so the correction is not a blanket
   *  rewrite that would discard a legitimate choice on every load. */
  it("leaves a stored whole-kitchen colour the material offers untouched, on load", () => {
    const stored = withGlobalFinish(
      everyCabinetFollowing(VENEER_ID),
      VENEER_NUC,
    );

    const loaded = migrateDesign(
      CURRENT_SCHEMA_VERSION,
      JSON.parse(JSON.stringify(stored)) as unknown,
      CATALOG,
    );

    expect(loaded.settings?.finish).toEqual(VENEER_NUC);
  });

  it("still reports nothing for an undeclared material, at either level", () => {
    const design = withGlobalFinish(
      designOn(UNDECLARED_ID, [placementWearing(0, MDF_RED)]),
      VENEER_NUC,
    );

    expect(validateDesignForCatalog(design, CATALOG)).toEqual([]);
  });
});

describe("ADR 0099 decision 2 — the command's shape, asserted structurally", () => {
  /** *"It does not take the placements, a placement id, or anything that could be turned into
   *  one"*. Asserted on the argument object the command is actually called with, so a later edit
   *  that widened the input would fail here rather than in a review. */
  it("accepts exactly a design, a finish and a clock", () => {
    const input = {
      design: withoutGlobalFinish(everyCabinetFollowing(PAL_ID)),
      finish: PAL_ANTRACIT,
      occurredAt: OCCURRED_AT,
    };

    expect(Object.keys(input).sort()).toEqual([
      "design",
      "finish",
      "occurredAt",
    ]);
    const result = setGlobalFinish(input);
    expect(result.ok).toBe(true);
  });

  /** The effect names no cabinet either — `MaterialTierSetEffect.resolvedFinishCount` exists because
   *  ADR 0057's reset moves cabinets, and this command moves none. */
  it("publishes an effect carrying no placement id and no count", () => {
    const result = setGlobalFinish({
      design: withoutGlobalFinish(everyCabinetFollowing(PAL_ID)),
      finish: PAL_ANTRACIT,
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.effect).sort()).toEqual(["finish", "type"]);
  });

  it("returns the original design by identity on a refusal, so nothing is written", () => {
    const design = withoutGlobalFinish(everyCabinetFollowing(VENEER_ID));

    const result = setGlobalFinish({
      design,
      finish: MDF_RED,
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.design).toBe(design);
    expect(result.reason.code).toBe("FINISH_NOT_OFFERED");
  });
});

describe("resolvedDefaultFinishOf — the second reader, at its boundaries", () => {
  it("prefers the global colour over the material's declared default", () => {
    const design = withGlobalFinish(designOn(PAL_ID, []), PAL_GRI);

    expect(resolvedDefaultFinishOf(design)).toEqual(PAL_GRI);
  });

  it("answers absent for an undeclared material with no global colour", () => {
    expect(
      resolvedDefaultFinishOf(withoutGlobalFinish(designOn(UNDECLARED_ID, []))),
    ).toBeUndefined();
  });

  /** A design with no `settings` container at all — the state every document written before wave 6E
   *  is in — resolves to PAL's declared default rather than throwing. */
  it("answers PAL's default for a design carrying no settings container", () => {
    const design: Design = { ...KITCHEN_L_DESIGN, placements: [] };
    const bare = { ...design };
    delete (bare as { settings?: unknown }).settings;

    expect(resolvedDefaultFinishOf(bare)).toEqual(
      materialById(PAL_ID).defaultFinish,
    );
  });

  /** An undeclared material carrying a global colour still resolves to that colour: absence of a
   *  declaration removes the *fallback*, not the middle level. */
  it("still answers the global colour when the material is undeclared", () => {
    const design = withGlobalFinish(designOn(UNDECLARED_ID, []), VENEER_NUC);

    expect(resolvedDefaultFinishOf(design)).toEqual(VENEER_NUC);
  });
});

// **ADR 0099 Amendment A section 3 — the record carries two colours and they are not one answer.**
//
// `finishKey` is the cabinet's own choice, and `carriedAppearance` (`commands/insert-body.ts`)
// copies it back into `body.finish` on an insert and on the resize rebuild. `drawnFinish` is
// `resolvedFinishOf`'s answer, and it exists so the renderer can stop skipping a cabinet that chose
// nothing. Resolving *into* `finishKey` was tried and reverted for exactly that reason, so the
// separation **is** the safety guarantee and is asserted here rather than described in a comment.
//
// The document-level half of the same guarantee — that no body grows a `finish` key across insert,
// resize, delete, depth change and a global colour change in any order — is the shuffled property
// under *"ADR 0099 decision 2"* above, which asserts **key absence** and never a value.
describe("ADR 0099 Amendment A section 3 — the draw-only colour on a placement record", () => {
  const FINISHABLE_PLACEMENT_ID = "p1";

  function recordFor(design: Design, id: string): PlacementRecord {
    const record = derivePlacementRecords(design, CATALOG).find(
      (candidate) => candidate.id === id,
    );
    if (record === undefined) throw new Error(`no record derived for "${id}"`);
    return record;
  }

  it("carries the kitchen's colour to draw while the cabinet's own choice stays absent", () => {
    const design = applyGlobalFinish(
      everyCabinetFollowing(PAL_ID),
      PAL_ANTRACIT,
    );

    const record = recordFor(design, FINISHABLE_PLACEMENT_ID);
    expect(record.drawnFinish).toEqual(PAL_ANTRACIT);
    // Key absence rather than `toBeUndefined`, for the reason ADR 0099 Amendment A section 1
    // records: a value assertion passes while the key is being stamped.
    expect(record).not.toHaveProperty("finishKey");
  });

  it("carries the cabinet's own colour in both fields when the cabinet chose one", () => {
    const design = withGlobalFinish(
      designOn(PAL_ID, [placementWearing(0, PAL_GRI)]),
      PAL_ANTRACIT,
    );
    const chosenId = design.placements[0]?.id;
    expect(chosenId).toBeDefined();

    const record = recordFor(design, chosenId ?? "");
    expect(record.finishKey).toEqual(PAL_GRI);
    expect(record.drawnFinish).toEqual(PAL_GRI);
  });

  it("carries the material's declared default where neither level chose", () => {
    const design = withoutGlobalFinish(everyCabinetFollowing(VENEER_ID));

    const record = recordFor(design, FINISHABLE_PLACEMENT_ID);
    expect(record.drawnFinish).toEqual(materialById(VENEER_ID).defaultFinish);
    expect(record).not.toHaveProperty("finishKey");
  });

  /** An undeclared material declares no default to fall back to (ADR 0078 decision 3) and that
   *  state loads rather than being refused, so the field is absent rather than holding a colour
   *  this product never declared. */
  it("carries no drawn colour at all for an undeclared material and no global colour", () => {
    const design = withoutGlobalFinish(everyCabinetFollowing(UNDECLARED_ID));

    const record = recordFor(design, FINISHABLE_PLACEMENT_ID);
    expect(record).not.toHaveProperty("drawnFinish");
    expect(record).not.toHaveProperty("finishKey");
  });

  /** **The whole point, swept over every declared material and every colour each of them offers.**
   *  A global change moves the drawn colour of every following cabinet and leaves every `finishKey`
   *  absent — acceptance criteria 1 and 6 read off the record rather than off a surface.
   *
   *  **The split is read off each entry's own `finishRule`, never off a list of ids** (owner's
   *  ruling, 2026-09-09; backlog entry 60). Cabinetry follows the kitchen whether or not it can
   *  choose for itself, and an appliance is painted at no level — so the sweep asks the declaration
   *  rather than assuming every body takes the colour, which it did until that ruling. */
  it("moves every following cabinet's drawn colour and no cabinet's own, for every material", () => {
    for (const tierId of [PAL_ID, MDF_ID, VENEER_ID]) {
      for (const finish of offeredFinishesOf(materialById(tierId))) {
        const design = applyGlobalFinish(everyCabinetFollowing(tierId), finish);

        for (const record of derivePlacementRecords(design, CATALOG)) {
          if (isNeverPainted(record.buildId)) {
            expect(record).not.toHaveProperty("drawnFinish");
          } else {
            expect(record.drawnFinish).toEqual(finish);
          }
          expect(record).not.toHaveProperty("finishKey");
        }
      }
    }
  });

  /** The catalogue's own declaration, asked of the entry rather than restated here. */
  function isNeverPainted(buildId: string): boolean {
    const definition = CATALOG.get(buildId);
    return (
      bodyFinishRuleOf({
        buildId,
        rule: definition?.finishRule,
        canFinish: definition?.canFinish ?? false,
      }) === IS_NEVER_PAINTED
    );
  }
});
