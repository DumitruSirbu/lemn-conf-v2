// Adversarial QA over ADR 0027 — the hob became part of the cabinet body.
//
// The wave's own tests prove the two entries exist and that one goes back into the opening a delete
// left. This file attacks what changes *around* that: the width set's boundary, the composite's own
// extent as the void engine reads it, and whether the two entries are told apart only where the
// customer makes the choice.
//
// `hob-base.test.ts` in `@lemnaria/three-adapter` owns everything that needs the real builders.
import {
  evaluateInsertFit,
  resolveInsertOpening,
} from "../../src/commands/insert-fit.js";
import { removePlacement } from "../../src/commands/remove-placement.js";
import {
  baseFinishedDepthMm,
  HOB_OVEN_BASE_FINISHED_DEPTH_MM,
  listInsertableBodies,
} from "../../src/catalog.js";
import { WORKTOP_DEPTH_MM } from "../../src/worktop-depth.js";
import { finishesAtMm } from "../../src/occupied-depth.js";
import {
  carriesHandles,
  NO_CABINET_HANDLES,
} from "../../src/cabinet-handles.js";
import {
  carriesDrawers,
  NO_OPENING_FRONTS,
} from "../../src/front-population.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { describeSelection } from "../../src/queries/describe-selection.js";
import { offersFor } from "../../src/queries/offers.js";
import type { BodyDefinition } from "../../src/void-engine.js";
import { describe, expect, it } from "vitest";

import { insertInto } from "../support/commands.js";
import {
  advance,
  createWorld,
  voidAt,
  type KitchenWorld,
} from "../support/kitchen-world.js";
import { narrowColumnWorld } from "../support/narrow-column.js";

const HOB_BUILD_IDS = ["base-hob-2drawer", "base-hob-oven"] as const;

/** The seeded hob cabinet and the column it stands in. */
const HOB_PLACEMENT_ID = "p2";
const HOB_COLUMN = "A|2.60";

/** The 800 mm sink base — the widest base opening the shipped kitchen has. */
const WIDE_BASE_PLACEMENT_ID = "p0";

const HOB_BASE_WIDTH_MM = 600;
const OCCURRED_AT = "2026-08-27T12:00:00.000Z";

/** §2's `TOL`, written out rather than imported: a boundary test that reads its own boundary out of
 *  the code under test proves only that the code equals itself. */
const FIT_TOLERANCE_MM = 12;

/** The seeded kitchen, with columns frozen at load exactly as the store freezes them. */
const seeded = () => createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);

/** A column of the given width whose only base member has been taken out — a bare `widthMm` × 860
 *  base opening, which is the one dimension the hob's fixed set is measured against. */
function baseOpeningOf(widthMm: number) {
  const world = narrowColumnWorld(widthMm);
  const cleared = advance(world, {
    ...world.design,
    placements: world.design.placements.filter(
      (placement) => placement.id !== "s0",
    ),
  });
  return {
    world: cleared,
    opening: voidAt(cleared, `A|${(widthMm / 1000).toFixed(2)}`, 0),
  };
}

function hobOffersAt(widthMm: number) {
  const { world, opening } = baseOpeningOf(widthMm);
  // ADR 0032 keeps a refused entry in the list with its reason, so "offered" has to be said. The
  // 587 mm case below is the whole point of this helper: the row is present and refused, not absent.
  return offersFor({
    ...world,
    target: { kind: "void", id: opening.id },
  }).filter((offer) => HOB_BUILD_IDS.some((id) => id === offer.buildId));
}

// ---------------------------------------------------------------------------------------------
// The fixed 600 mm set, at its own boundary.
//
// ADR 0027 decision 2: both entries are `widthFlex: [600]` because the appliance is a 600 mm one.
// That makes the *only* thing standing between the customer and a hob adrift on a worktop the
// millimetre-set branch of §5.2's width resolution, and its boundary is `FIT_TOLERANCE_M`.
// ---------------------------------------------------------------------------------------------
describe("ADR 0027's hob bases against a base opening's width", () => {
  it.each([
    ["exactly 600", 600],
    ["599 — a millimetre under, inside the tolerance", 599],
    ["601 — a millimetre over", 601],
    [
      "588 — the narrowest opening `FIT_TOLERANCE_M` still admits",
      600 - FIT_TOLERANCE_MM,
    ],
  ])(
    "is offered into a %s mm opening and still builds 600",
    (_case, widthMm) => {
      const offered = hobOffersAt(widthMm);

      expect(offered.map((offer) => offer.buildId)).toEqual([...HOB_BUILD_IDS]);
      expect(offered.map((offer) => offer.buildsToWidthMm)).toEqual(
        HOB_BUILD_IDS.map(() => HOB_BASE_WIDTH_MM),
      );
    },
  );

  // One millimetre below the tolerance, and the row disappears rather than being offered and then
  // refused — §9's "never offer what cannot be satisfied", which is the same rule read from the
  // offer end.
  it("is not offered into a 587 mm opening, one millimetre past the tolerance", () => {
    expect(hobOffersAt(600 - FIT_TOLERANCE_MM - 1)).toEqual([]);
  });

  it("refuses a 587 mm opening by name, with the millimetres it needs", () => {
    const { world, opening } = baseOpeningOf(600 - FIT_TOLERANCE_MM - 1);
    const resolved = resolveInsertOpening({
      ...world,
      target: { kind: "void", id: opening.id },
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    for (const buildId of HOB_BUILD_IDS) {
      const body = listInsertableBodies(KITCHEN_L_BODY_CATALOG).find(
        (candidate) => candidate.buildId === buildId,
      );
      expect(body, buildId).toBeDefined();
      if (!body) return;
      const fit = evaluateInsertFit({
        body,
        opening: resolved.value.opening,
        column: resolved.value.column,
        cabinetDepthMm: world.cabinetDepthMm,
      });
      expect([buildId, fit.ok]).toEqual([buildId, false]);
      if (fit.ok) return;
      expect([buildId, fit.detail.code]).toEqual([buildId, "WIDTH_TOO_LARGE"]);
      if (fit.detail.code !== "WIDTH_TOO_LARGE") return;
      expect([buildId, fit.detail.params.requiredMm]).toEqual([
        buildId,
        HOB_BASE_WIDTH_MM,
      ]);
    }
  });

  // ADR 0027's own consequence, pinned rather than endorsed: a millimetre-set body takes the widest
  // size in its set that fits, so a wider opening gets a 600 mm cabinet and the rest of the opening
  // stays empty. That is backlog entry 8, and if it is ever decided this is the case that changes.
  it.each([700, 800, 900])(
    "never widens to a %s mm opening — the whole reason it is a fixed set",
    (widthMm) => {
      const offered = hobOffersAt(widthMm);

      expect(offered).toHaveLength(HOB_BUILD_IDS.length);
      for (const offer of offered) {
        expect([offer.buildId, offer.buildsToWidthMm]).toEqual([
          offer.buildId,
          HOB_BASE_WIDTH_MM,
        ]);
        expect([offer.buildId, offer.sizesMm]).toEqual([
          offer.buildId,
          [HOB_BASE_WIDTH_MM],
        ]);
      }
    },
  );

  // The same, through a real command on the shipped kitchen rather than through the offer list:
  // swapping the 800 mm sink base writes a 600 mm placement, and the design records 600.
  it.each(HOB_BUILD_IDS)(
    "%s swapped into the 800 mm sink base writes 600 mm into the document",
    (buildId) => {
      const world = seeded();
      const result = insertHob(world, WIDE_BASE_PLACEMENT_ID, buildId);

      expect(result.widthMm).toBe(HOB_BASE_WIDTH_MM);
    },
  );
});

function insertHob(world: KitchenWorld, placementId: string, buildId: string) {
  const result = insertInto(
    world,
    { kind: "placement", id: placementId },
    buildId,
  );
  if (!result.ok) throw new Error(`insert refused: ${result.reason.code}`);
  const placed = result.design.placements.find(
    (placement) => placement.id === result.effect.placementId,
  );
  if (!placed) throw new Error("the insert reported an id it did not write");
  return { design: result.design, id: placed.id, ...placed.body };
}

// ---------------------------------------------------------------------------------------------
// The hob body's own extent, judged by the void engine rather than by the diff.
// ---------------------------------------------------------------------------------------------
describe("the hob rides above the column and contributes nothing to it", () => {
  const after = seeded();

  // 820 mm of body, and the 40 mm hob above the worktop line contributes none of it. This is the
  // assertion that fails if the hob is ever given a `frameHeightMm` of its own (ADR 0027's third
  // rejected alternative).
  it("keeps the hob column's extent at the worktop line, hob included", () => {
    const column = after.columns.get(HOB_COLUMN);

    expect(column?.regions).toEqual([
      [0, 0.82],
      [1.5, 2.2],
      [2.2, 2.6],
    ]);
    expect(column?.top).toBe(2.6);
    expect(column?.hasFullHeightUnder).toBe(false);
  });

  it("leaves the shipped kitchen with no opening at all", () => {
    expect(after.voids).toEqual([]);
  });

  // The hob body's band is `base`, so §7's head-clearance cap stays on over it. Pinned because a
  // body that carries an appliance is the obvious candidate for being mistaken for a full-height
  // one.
  it("does not let the hob body lift §7's head-clearance cap", () => {
    expect(after.columns.get(HOB_COLUMN)?.hasFullHeightUnder).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// Losing the hob cabinet, and getting it back.
// ---------------------------------------------------------------------------------------------
//
// The defect ADR 0027 was written for: a delete took the hob away permanently, because no catalogue
// entry carried one. ADR 0038 retired the pre-migration document this section used to also cover —
// nothing was ever stored, so there is no design that carries the hob as a placement of its own.
describe("the opening a deleted hob cabinet leaves", () => {
  const removeHobCabinet = (world: KitchenWorld) => {
    const result = removePlacement({
      design: world.design,
      catalog: world.catalog,
      target: { kind: "placement", id: HOB_PLACEMENT_ID },
      occurredAt: OCCURRED_AT,
    });
    if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
    return advance(world, result.design);
  };

  it("takes the hob with it, because they are one body", () => {
    const after = removeHobCabinet(seeded());
    expect(after.records.map((record) => record.id)).not.toContain(
      HOB_PLACEMENT_ID,
    );
  });

  it("offers both hob bases back into the opening the delete leaves", () => {
    const after = removeHobCabinet(seeded());
    const opening = voidAt(after, HOB_COLUMN, 0);
    const offered = offersFor({
      ...after,
      target: { kind: "void", id: opening.id },
    });

    for (const buildId of HOB_BUILD_IDS) {
      expect(
        offered.map((offer) => offer.buildId),
        buildId,
      ).toContain(buildId);
    }
  });

  it("accepts the hob base back into it, restoring the fixture the delete removed", () => {
    const after = removeHobCabinet(seeded());
    const opening = voidAt(after, HOB_COLUMN, 0);
    const result = insertInto(
      after,
      { kind: "void", id: opening.id },
      "base-hob-2drawer",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effect.buildId).toBe("base-hob-2drawer");
  });
});

// ---------------------------------------------------------------------------------------------
// Two entries the domain cannot tell apart.
// ---------------------------------------------------------------------------------------------
describe("the two hob bases are distinguished only where the choice is made", () => {
  it("carries identical catalogue geometry, so nothing may pick between them by measurement", () => {
    const [drawers, oven] = HOB_BUILD_IDS.map((buildId) =>
      KITCHEN_L_BODY_CATALOG.get(buildId),
    );
    expect(drawers).toBeDefined();
    expect(oven).toBeDefined();
    if (!drawers || !oven) return;

    // Everything §5.2 measures a fit with, and everything §9 offers on, is identical. The fields
    // that are not are the two the *customer* is choosing between — the Romanian label and
    // `canHandle`, which the oven variant declares `false` because its only bar belongs to the oven
    // and the one front it owns is a fixed facade that does not open — plus, since wave S9, the
    // depth the built body occupies, which is asserted on its own below.
    //
    // `canFinish` is deliberately **not** masked. Since Q6 (owner, 2026-09-01, ADR 0050) the hob
    // band's filler panel is a finishable front, so both variants declare `true` and the equality
    // below carries that agreement. Masking it here would hide a future divergence.
    const withoutTheChoice = (definition: BodyDefinition) => ({
      ...definition,
      canHandle: true,
      occupiedDepth: finishesAtMm(0),
      cabinetHandles: carriesHandles(0),
      fronts: NO_OPENING_FRONTS,
    });

    expect(withoutTheChoice(drawers)).toEqual(withoutTheChoice(oven));
    expect([drawers.canFinish, drawers.canHandle]).toEqual([true, true]);
    expect([oven.canFinish, oven.canHandle]).toEqual([true, false]);

    // **Masked above and asserted here, since M6 wave 6L** (ADR 0061). The handle *count* is the
    // same fact `canHandle` states, said to the price instead of to the panel: the drawer variant
    // carries two of its own, and the oven variant's single bar is the oven's, so it carries none.
    // Left inside the equality it would have read as "these two bodies differ by a number", which is
    // exactly the reading this test exists to refuse.
    expect([drawers.cabinetHandles, oven.cabinetHandles]).toEqual([
      carriesHandles(2),
      NO_CABINET_HANDLES,
    ]);

    // **Masked above and asserted here for `cabinetHandles`' reason, since wave 6S** (ADR 0070).
    // The same fact a third time, and the first time it is said precisely: the drawer variant's two
    // fronts are **drawers** and run on runners, while the oven variant's single front is a fixed
    // facade over the oven cavity that opens on nothing at all. Left inside the equality this would
    // read as two bodies differing by a measurement, which is what this test refuses.
    expect([drawers.fronts, oven.fronts]).toEqual([
      carriesDrawers(2),
      NO_OPENING_FRONTS,
    ]);

    // **The one measurement that does differ, and it is not one anything picks by** (DOM-002).
    // Nominal width, height and depth are identical — those are what §5.2 fits and §9 offers on.
    // What the built bodies occupy is not: the drawer variant finishes at its worktop, and the oven
    // variant's fascia and bar reach 28 mm past it. It is measured on the geometry, so declaring
    // them equal would be declaring a body 28 mm shallower than the one that gets built.
    expect([drawers.occupiedDepth, oven.occupiedDepth]).toEqual([
      finishesAtMm(baseFinishedDepthMm(WORKTOP_DEPTH_MM)),
      finishesAtMm(HOB_OVEN_BASE_FINISHED_DEPTH_MM),
    ]);
    expect([drawers.nominalDepthMm, oven.nominalDepthMm]).toEqual([580, 580]);
  });

  // Which of the two the shipped cabinet *is* comes from `catalogEquivalentId`, declared on the
  // seeded entry — §6.3's rule that identity is never inferred. If it were inferred from kind, band
  // and width the two rows would be indistinguishable and the badge could land on either.
  it("badges exactly one row ACTUAL on the shipped hob cabinet, and it is the drawer one", () => {
    const world = seeded();
    const offers = offersFor({
      ...world,
      target: { kind: "placement", id: HOB_PLACEMENT_ID },
    });

    expect(
      offers.filter((offer) => offer.isCurrent).map((o) => o.buildId),
    ).toEqual(["base-hob-2drawer"]);
  });

  // §5.3 writes a new placement id over the old one, so the badge is asked of the body that is
  // standing there now — which is the insertable entry itself, not a seeded pointer.
  it("moves the badge when the customer swaps to the oven variant", () => {
    const world = seeded();
    const swapped = insertHob(world, HOB_PLACEMENT_ID, "base-hob-oven");
    const after = advance(world, swapped.design);
    const offers = offersFor({
      ...after,
      target: { kind: "placement", id: swapped.id },
    });

    expect(
      offers.filter((offer) => offer.isCurrent).map((o) => o.buildId),
    ).toEqual(["base-hob-oven"]);
  });
});

// ---------------------------------------------------------------------------------------------
// The shipped hob cabinet, described to §9.
// ---------------------------------------------------------------------------------------------
describe("§9's description of the shipped hob cabinet", () => {
  // A regression guard over a gap this wave closed, kept because the gap was invisible from the
  // outside and would come back the same silent way.
  //
  // ADR 0027 decision 2 fixes a hob-bearing base at 600 mm in both directions — `widthFlex: [600]`,
  // `sizesMm: [600]`, `fixedWidth: true` — because the appliance is a 600 mm one and "a `'fit'` body
  // would build an 800 mm cabinet with a 600 mm hob adrift on it". The *insertable* entry always
  // said so. The **seeded** entry the shipped kitchen stands on, `base-hob-2drawer-600`, inherited
  // `baseCarcass`'s `fixedWidth: false`, so §8's `meta` described the one cabinet in the kitchen
  // carrying a hob as a resizable body while its catalogue row called it fixed.
  //
  // The gap had no visible symptom: a seeded entry has no `sizesMm`, so `describe-selection`
  // publishes an empty chip set and §9's width section does not render (`panel-model.ts` says so in
  // as many words). It becomes reachable the moment M5 wires §5.4, whose `canGive` is "exists ·
  // **not `fixedWidth`** · not a corner · has a resolvable catalogue id" — the hob
  // cabinet would then both accept a resize and donate width to a neighbour, and there is no 400 mm
  // hob.
  //
  // `hood-600`, `fridge-free-700` and the four corners already declared `fixedWidth: true` on their
  // seeded rows, so the convention existed and only these had been missed. This wave set it on all
  // three affected seeded entries — `base-hob-2drawer-600`, and `tall-oven-tower-600` and
  // `tall-pantry-600`, which carried the same gap for unrelated reasons (ADR 0027 Consequences
  // records that pair). The assertion below exists to catch a reintroduction, not to expose a
  // defect.
  it("reports the hob cabinet as fixed-width, which is what its catalogue entry is", () => {
    const meta = describeSelection({
      ...seeded(),
      target: { kind: "placement", id: HOB_PLACEMENT_ID },
    });

    expect(meta?.fixedWidth).toBe(true);
    expect(meta?.canWidth).toBe(false);
  });
});
