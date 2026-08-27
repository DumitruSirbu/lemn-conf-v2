// Adversarial QA over ADR 0027 — the hob became part of the cabinet body.
//
// The wave's own tests prove the two entries exist and that one goes back into the opening a delete
// left. This file attacks the three things that change *around* that: the width set's boundary, the
// accessory concept now that nothing shipped carries one, and whether the migrated design is
// bit-for-bit the same shape to the void engine as the design it replaced.
//
// `hob-base.test.ts` in `@lemnaria/three-adapter` owns everything that needs the real builders.
import {
  evaluateInsertFit,
  resolveInsertOpening,
} from "../../src/commands/insert-fit.js";
import { removePlacement } from "../../src/commands/remove-placement.js";
import { listInsertableBodies } from "../../src/catalog.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { toMillimetres } from "../../src/millimetres.js";
import { describeSelection } from "../../src/queries/describe-selection.js";
import { offersFor } from "../../src/queries/offers.js";
import { offered as offeredRows } from "../support/offers.js";
import {
  ACCESSORY_MAX_HEIGHT_M,
  type BodyDefinition,
  type Column,
} from "../../src/void-engine.js";
import { describe, expect, it } from "vitest";

import { clearBodies, insertInto } from "../support/commands.js";
import {
  advance,
  createWorld,
  voidAt,
  type KitchenWorld,
} from "../support/kitchen-world.js";
import { narrowColumnWorld } from "../support/narrow-column.js";
import {
  preMigrationHobDesign,
  PRE_MIGRATION_HOB_ID,
} from "../support/pre-migration-hob.js";

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
  return offeredRows(
    offersFor({ ...world, target: { kind: "void", id: opening.id } }),
  ).filter((offer) => HOB_BUILD_IDS.some((id) => id === offer.buildId));
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
      expect(offered.map((offer) => offer.verdict.widthMm)).toEqual(
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
        expect([offer.buildId, offer.verdict.widthMm]).toEqual([
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
// The accessory concept, now that nothing shipped is one.
// ---------------------------------------------------------------------------------------------
describe("the accessory concept after ADR 0027", () => {
  it("leaves the shipped design with no accessory at all", () => {
    expect(seeded().records.filter((record) => record.accessory)).toEqual([]);
  });

  // The point of the sweep: `accessory` is derived from geometry (`frame.h < 0.3`), not stored, so
  // "no accessory in the shipped design" is not the same fact as "no accessory can be created".
  // Every insertable entry is checked against every opening the shipped kitchen can produce; none
  // of them can build a body short enough to become one. That is what makes §6.1's host rule and
  // §5.1's cascade reachable **only** from a stored document, which is ADR 0027 point 6's whole
  // premise for keeping `cooktop-600` in the catalogue.
  it("cannot be reached by inserting anything the catalogue offers, anywhere", () => {
    const worlds = [seeded(), clearedHobColumn(), clearedFridgeColumn()];
    const bodies = listInsertableBodies(KITCHEN_L_BODY_CATALOG);
    let fitsSeen = 0;
    const tooShort: string[] = [];

    for (const world of worlds) {
      for (const record of world.voids) {
        const resolved = resolveInsertOpening({
          ...world,
          target: { kind: "void", id: record.id },
        });
        if (!resolved.ok) continue;
        for (const body of bodies) {
          const fit = evaluateInsertFit({
            body,
            opening: resolved.value.opening,
            column: resolved.value.column,
          });
          if (!fit.ok) continue;
          fitsSeen += 1;
          if (fit.plan.heightM < ACCESSORY_MAX_HEIGHT_M) {
            tooShort.push(
              `${body.buildId} → ${String(toMillimetres(fit.plan.heightM))} mm at ${record.id}`,
            );
          }
        }
      }
    }

    // The sweep must have found openings, or it proves nothing.
    expect(fitsSeen).toBeGreaterThan(0);
    expect(tooShort).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// The migration, judged by the void engine rather than by the diff.
// ---------------------------------------------------------------------------------------------
describe("the migrated design is the same shape as the one it replaced", () => {
  const before = createWorld(preMigrationHobDesign(), KITCHEN_L_BODY_CATALOG);
  const after = seeded();

  it("derives an identical column map, field for field", () => {
    expect(sortedColumns(after.columns)).toEqual(sortedColumns(before.columns));
  });

  // 820 mm of body where there used to be 820 mm of body plus a 40 mm accessory above it: the
  // accessory never contributed to the column, so the run's `top` and its `regions` must not have
  // moved. This is the assertion that fails if the hob is ever given a `frameHeightMm` of its own.
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

  it("produces the same void set — which is none, in both", () => {
    expect(after.voids).toEqual(before.voids);
    expect(after.voids).toEqual([]);
  });

  // `isFullHeightUnder` excludes accessories with `!record.accessory`. Now that a hob is a body,
  // that exclusion has to be doing nothing here — the hob's band is `base`, so the band test would
  // refuse it anyway, and the exclusion cannot start counting the merged body.
  it("does not let the merged hob body lift §7's head-clearance cap", () => {
    const column = before.columns.get(HOB_COLUMN);

    expect(column?.hasFullHeightUnder).toBe(false);
    expect(after.columns.get(HOB_COLUMN)?.hasFullHeightUnder).toBe(false);
  });
});

function sortedColumns(columns: ReadonlyMap<string, Column>) {
  return [...columns.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
}

// ---------------------------------------------------------------------------------------------
// A document saved before the migration, all the way through.
// ---------------------------------------------------------------------------------------------
describe("a design saved before ADR 0027 still works, and can be upgraded", () => {
  const legacy = () =>
    createWorld(preMigrationHobDesign(), KITCHEN_L_BODY_CATALOG);

  it("loads its `cooktop-600` placement as an accessory of the cabinet below it", () => {
    const world = legacy();
    const hob = world.records.find((record) => record.id === "p3");

    expect(hob?.buildId).toBe("cooktop-600");
    expect(hob?.accessory).toBe(true);
    expect(hob?.col).toBe(HOB_COLUMN);
  });

  it("describes the hob as unreplaceable and undeletable (§11 row 15)", () => {
    const world = legacy();
    const meta = describeSelection({
      ...world,
      target: { kind: "placement", id: "p3" },
    });

    expect(meta).toMatchObject({
      accessory: true,
      canReplace: false,
      canDelete: false,
    });
  });

  it("carries the hob away when its host is deleted, and leaves nothing orphaned", () => {
    const world = legacy();
    const result = removePlacement({
      design: world.design,
      catalog: world.catalog,
      target: { kind: "placement", id: HOB_PLACEMENT_ID },
      occurredAt: OCCURRED_AT,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.effect.cascadedAccessoryIds).toEqual(["p3"]);
    const after = advance(world, result.design);
    expect(after.records.filter((record) => record.accessory)).toEqual([]);
  });

  // The upgrade path the ADR promises but nothing asserted: the customer on a legacy document is
  // one delete and one insert away from the migrated shape, without a data migration ever running.
  it("offers both hob bases into the opening that delete leaves", () => {
    const world = legacy();
    const result = removePlacement({
      design: world.design,
      catalog: world.catalog,
      target: { kind: "placement", id: HOB_PLACEMENT_ID },
      occurredAt: OCCURRED_AT,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const after = advance(world, result.design);
    const opening = voidAt(after, HOB_COLUMN, 0);
    const offered = offersFor({
      ...after,
      target: { kind: "void", id: opening.id },
    });

    for (const buildId of HOB_BUILD_IDS) {
      expect(
        offeredRows(offered).map((offer) => offer.buildId),
        buildId,
      ).toContain(buildId);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// The swap path on that same document — ADR 0027's amendment, and the defect it closes.
// ---------------------------------------------------------------------------------------------
//
// §5.3 swaps a body **in place**: it writes a new placement over the old one and, before this
// record, cascaded nothing — only §5.1's delete did. On a pre-migration document that is one tap
// away from two hobs. `p3` is a separate `cooktop-600` placement hosted on `p2` (§6.1); swap `p2`
// for a body with a hob built into it and §6.1 simply re-hosts `p3` onto the new body, which puts
// two hobs at the same worktop line. `p3` refuses deletion (`ACCESSORY_NOT_DELETABLE`), so the
// customer cannot clear the spare — the only escape is deleting the whole cabinet.
describe("swapping a pre-migration cabinet for one that carries its own hob", () => {
  const legacy = () =>
    createWorld(preMigrationHobDesign(), KITCHEN_L_BODY_CATALOG);

  it.each(HOB_BUILD_IDS)(
    "%s takes the hosted hob placement away in the same command",
    (buildId) => {
      const world = legacy();
      const result = insertInto(
        world,
        { kind: "placement", id: HOB_PLACEMENT_ID },
        buildId,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.effect.cascadedAccessoryIds).toEqual([
        PRE_MIGRATION_HOB_ID,
      ]);
      expect(
        result.design.placements.map((placement) => placement.id),
      ).not.toContain(PRE_MIGRATION_HOB_ID);
      const after = advance(world, result.design);
      expect(after.records.filter((record) => record.accessory)).toEqual([]);
    },
  );

  // The narrowness of the rule, stated as its own case. Only an accessory of the kind the incoming
  // body declares it carries is a duplicate. A plain door base carries nothing, so the hob stays
  // hosted on it — which is what this document did before ADR 0027 and is unchanged by it.
  it("leaves the hob alone when the incoming body carries no hob of its own", () => {
    const world = legacy();
    const result = insertInto(
      world,
      { kind: "placement", id: HOB_PLACEMENT_ID },
      "base-cabinet",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.effect.cascadedAccessoryIds).toEqual([]);
    const after = advance(world, result.design);
    const hob = after.records.find(
      (record) => record.id === PRE_MIGRATION_HOB_ID,
    );
    expect(hob?.accessory).toBe(true);
  });

  // Filling an empty opening replaces nothing, so there is no host whose accessories could be
  // duplicated — the field is present and empty, the way §5.1's is on a body that carried nothing.
  it("reports an empty cascade when the hob base fills a void instead", () => {
    const world = seeded();
    const cleared = clearBodies(world, [HOB_PLACEMENT_ID]);
    const opening = voidAt(cleared, HOB_COLUMN, 0);
    const result = insertInto(
      cleared,
      { kind: "void", id: opening.id },
      "base-hob-2drawer",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.effect.cascadedAccessoryIds).toEqual([]);
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

    // Everything §5.2 measures a fit with, and everything §9 offers on, is identical. The three
    // fields that are not are the three the *customer* is choosing between: the Romanian label, and
    // the two capability flags the oven variant declares `false` because it is open-front and owns
    // no cabinet door to finish or put a handle on.
    const withoutTheChoice = (definition: BodyDefinition) => ({
      ...definition,
      label: "",
      canFinish: true,
      canHandle: true,
    });

    expect(withoutTheChoice(drawers)).toEqual(withoutTheChoice(oven));
    expect(drawers.label).not.toBe(oven.label);
    expect([drawers.canFinish, drawers.canHandle]).toEqual([true, true]);
    expect([oven.canFinish, oven.canHandle]).toEqual([false, false]);
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
  // as many words). It becomes reachable the moment M5 wires §5.4, whose `canGive` is "exists · not
  // accessory · **not `fixedWidth`** · not a corner · has a resolvable catalogue id" — the hob
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

function clearedHobColumn() {
  const world = seeded();
  const result = removePlacement({
    design: world.design,
    catalog: world.catalog,
    target: { kind: "placement", id: HOB_PLACEMENT_ID },
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) throw new Error(`delete refused: ${result.reason.code}`);
  return advance(world, result.design);
}

function clearedFridgeColumn() {
  const world = seeded();
  return ["p24", "p7"].reduce((current, id) => {
    const result = removePlacement({
      design: current.design,
      catalog: current.catalog,
      target: { kind: "placement", id },
      occurredAt: OCCURRED_AT,
    });
    if (!result.ok) throw new Error(`delete refused: ${result.reason.code}`);
    return advance(current, result.design);
  }, world);
}
