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
  return offersFor({
    ...world,
    target: { kind: "void", id: opening.id },
  }).filter((offer) => HOB_BUILD_IDS.some((id) => id === offer.buildId));
}

// Both entries are `widthFlex: [600]` (ADR 0027 decision 2), so the only thing between the customer and a hob
// adrift on a worktop is the millimetre-set branch of §5.2's width resolution, bounded by `FIT_TOLERANCE_M`.
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

  // A millimetre-set body takes the widest size in its set that fits, so a wider opening gets a 600 mm cabinet
  // and the rest stays empty (ADR 0027). Pinned, not endorsed: if that is ever decided, this case changes.
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

describe("the hob rides above the column and contributes nothing to it", () => {
  const after = seeded();

  // 820 mm of body, and the 40 mm hob above the worktop line contributes none of it: this fails if the hob is
  // given a `frameHeightMm` of its own (ADR 0027's third rejected alternative).
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
});

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

describe("the two hob bases are distinguished only where the choice is made", () => {
  it("carries identical catalogue geometry, so nothing may pick between them by measurement", () => {
    const [drawers, oven] = HOB_BUILD_IDS.map((buildId) =>
      KITCHEN_L_BODY_CATALOG.get(buildId),
    );
    expect(drawers).toBeDefined();
    expect(oven).toBeDefined();
    if (!drawers || !oven) return;

    // Everything §5.2 fits on and §9 offers on is identical. The fields that differ are the two the customer
    // chooses between (the label, and `canHandle`, false for the oven variant whose only bar belongs to the oven)
    // and the depth the built body occupies, asserted below. `canFinish` is deliberately not masked: both declare
    // `true` (ADR 0050), and masking it would hide a future divergence.
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

    // Masked above, asserted here (ADR 0061): the handle count says to the price what `canHandle` says to the
    // panel, two on the drawer variant and none on the oven variant, whose single bar is the oven's. Inside the
    // equality it would read as two bodies differing by a number.
    expect([drawers.cabinetHandles, oven.cabinetHandles]).toEqual([
      carriesHandles(2),
      NO_CABINET_HANDLES,
    ]);

    // Masked above, asserted here (ADR 0070): the drawer variant's two fronts are drawers on runners, while the
    // oven variant's single front is a fixed facade over the oven cavity.
    expect([drawers.fronts, oven.fronts]).toEqual([
      carriesDrawers(2),
      NO_OPENING_FRONTS,
    ]);

    // The one measurement that differs, and nothing picks by it: nominal width, height and depth are identical
    // (what §5.2 fits and §9 offers on), but the oven variant's fascia and bar reach 28 mm past the worktop where
    // the drawer variant finishes at it. Declaring them equal would declare a body 28 mm shallower than the built one.
    expect([drawers.occupiedDepth, oven.occupiedDepth]).toEqual([
      finishesAtMm(baseFinishedDepthMm(WORKTOP_DEPTH_MM)),
      finishesAtMm(HOB_OVEN_BASE_FINISHED_DEPTH_MM),
    ]);
    expect([drawers.nominalDepthMm, oven.nominalDepthMm]).toEqual([580, 580]);
  });

  // Which of the two the shipped cabinet is comes from `catalogEquivalentId` on the seeded entry (§6.3: identity
  // is never inferred); inferred from kind, band and width, the badge could land on either row.
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

  // §5.3 writes a new placement id over the old one, so the badge is asked of the body standing there now.
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

describe("§9's description of the shipped hob cabinet", () => {
  // Seeded hob-bearing bases must declare `fixedWidth: true` like their catalogue row (ADR 0027 decision 2). A
  // seeded entry has no `sizesMm`, so a missing flag shows no symptom in §9, yet §5.4's `canGive` would let the
  // hob cabinet resize and donate width to a neighbour, and there is no 400 mm hob.
  it("reports the hob cabinet as fixed-width, which is what its catalogue entry is", () => {
    const meta = describeSelection({
      ...seeded(),
      target: { kind: "placement", id: HOB_PLACEMENT_ID },
    });

    expect(meta?.fixedWidth).toBe(true);
    expect(meta?.canWidth).toBe(false);
  });
});
