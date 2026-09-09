// Adversarial QA for M5B wave 5B8 / ADR 0048: `tall-pantry` is the one resizable column.
//
// The wave's own suite (`tests/queries/pantry-resizable.test.ts`) asserts the predicates —
// `acceptsWidthMm`, `describeBodyLabelAt`, `resolveWidthRangesMm`. This file attacks the two things
// a predicate cannot answer:
//
//  * **what the insert path actually builds.** ADR 0048's `widthFlex: "fit"` line is the one that
//    stops a 700 mm opening getting a 600 mm pantry (the hood's R1.2 defect), and a predicate that
//    reads `widthRangesMm` is true either way — `resolveFixedSetWidth` never consults the ranges.
//    So every width here is read off the **placement the command wrote**.
//  * **the seeded pantry**, which is the only pantry the shipped kitchen contains.
import { describe, expect, it } from "vitest";

import {
  describeBodyLabelAt,
  deriveDoorCount,
  INSERTABLE_BODY_DEFINITIONS,
} from "../../src/catalog.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { offersFor } from "../../src/queries/offers.js";
import { clearBodies, insertInto, resizeTo } from "../support/commands.js";
import { createWorld, voidAt } from "../support/kitchen-world.js";
import { narrowColumnWorld } from "../support/narrow-column.js";
import type { BodyDefinition } from "../../src/void-engine.js";

const PANTRY_ID = "tall-pantry";
const APPLIANCE_COLUMN_IDS = [
  "tall-oven-tower",
  "tall-fridge-housing",
] as const;

const seeded = () => createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);

function definitionOf(buildId: string): BodyDefinition {
  const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
  if (!definition) throw new Error(`no catalogue entry ${buildId}`);
  return definition;
}

/** One column of the given width with its base level cleared, so an insert of a full-height body
 *  has an opening exactly that wide and 2200 mm tall (§11 row 4 accepts a `column` body into a base
 *  slot — the seeded `fridge-free` case). */
function openingOf(widthMm: number) {
  const world = clearBodies(narrowColumnWorld(widthMm), ["s0"]);
  const opening = voidAt(world, `A|${(widthMm / 1000).toFixed(2)}`, 0);
  return { world, target: { kind: "void", id: opening.id } as const };
}

function insertPantryInto(widthMm: number) {
  const { world, target } = openingOf(widthMm);
  return insertInto(world, target, PANTRY_ID);
}

describe("QA 5B8 — the pantry is built to the opening, not narrowed into it", () => {
  // **The `widthFlex: "fit"` line, verified from the outside.** With the inherited `[600]` fixed set
  // the row would resolve on `resolveFixedSetWidth`, which takes the widest listed size that fits —
  // 600 into every opening from 600 up, silently. Every assertion below reads the width off the
  // placement, so it fails for that build and no predicate test would.
  it.each([400, 450, 499, 500, 550, 600, 650, 700, 750, 800])(
    "builds a %s mm pantry into a %s mm opening",
    (widthMm) => {
      const result = insertPantryInto(widthMm);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.design.placements.at(-1)?.body.widthMm).toBe(widthMm);
    },
  );

  // The sharpest single case: 700 is a width the inherited set would have answered 600 for, and
  // 600 is a width at which both answers agree — so the pair distinguishes them.
  it("does not fall back to 600 in a 700 mm opening", () => {
    const result = insertPantryInto(700);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.placements.at(-1)?.body.widthMm).not.toBe(600);
  });

  it("refuses an opening above the bound, publishing both millimetre figures", () => {
    const { world, target } = openingOf(850);
    const result = insertInto(world, target, PANTRY_ID);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatchObject({
      code: "WIDTH_NOT_SUPPORTED",
      params: {
        widthRangesMm: [{ minMm: 400, maxMm: 800 }],
        availableMm: 850,
      },
    });
  });

  // §11 row 5 for the resizable row, at the floor's own edge rather than at the 300 the wave's
  // criterion names: 399 is the first width below the bound and is the one an off-by-one reaches.
  it("refuses a 399 mm opening and accepts the 400 beside it", () => {
    const refused = insertPantryInto(399);
    const accepted = insertPantryInto(400);

    expect(refused.ok).toBe(false);
    if (!refused.ok)
      expect(refused.reason).toMatchObject({
        code: "WIDTH_NOT_SUPPORTED",
        params: {
          widthRangesMm: [{ minMm: 400, maxMm: 800 }],
          availableMm: 399,
        },
      });
    expect(accepted.ok).toBe(true);
  });
});

describe("QA 5B8 — the three appliance columns still refuse every width but their own", () => {
  // Swept over the whole cabinetry continuum at the step a customer can actually reach, through
  // the **insert path** rather than through `acceptsWidthMm` — §11 row 5 is about what the command
  // answers, and the wave's own sweep stops at the predicate.
  //
  // The claim asserted is the one that is actually true of a discrete row and is what "fixed"
  // means here: **it is never built at the opening's width.** A wider opening gets the appliance's
  // own size centred in it, exactly as `base-dishwasher` puts a 600 in a 700
  // (`resolveFixedSetWidth`); a narrower one is refused with both millimetre figures. What must not
  // happen is a 650 mm oven tower, and that is what this sweep would catch.
  it.each([
    ["tall-oven-tower", 600],
    ["tall-fridge-housing", 600],
    ["fridge-free", 700],
  ] as const)("builds %s only ever at %s mm", (buildId, ownWidthMm) => {
    for (let widthMm = 400; widthMm <= 800; widthMm += 50) {
      const { world, target } = openingOf(widthMm);
      const result = insertInto(world, target, buildId);

      if (widthMm < ownWidthMm) {
        expect([buildId, widthMm, result.ok]).toEqual([
          buildId,
          widthMm,
          false,
        ]);
        if (result.ok) continue;
        expect(result.reason.params).toMatchObject({
          requiredMm: ownWidthMm,
          availableMm: widthMm,
        });
        continue;
      }
      expect([buildId, widthMm, result.ok]).toEqual([buildId, widthMm, true]);
      if (!result.ok) continue;
      expect([
        buildId,
        widthMm,
        result.design.placements.at(-1)?.body.widthMm,
      ]).toEqual([buildId, widthMm, ownWidthMm]);
    }
  });

  // The contrast the wave is about, in one assertion: the same 650 mm opening that gets a 600 mm
  // oven tower gets a 650 mm pantry.
  it("fills a 650 mm opening with a pantry where a tower keeps its 600", () => {
    const { world, target } = openingOf(650);
    const tower = insertInto(world, target, "tall-oven-tower");
    const pantry = insertInto(world, target, PANTRY_ID);

    expect(tower.ok && tower.design.placements.at(-1)?.body.widthMm).toBe(600);
    expect(pantry.ok && pantry.design.placements.at(-1)?.body.widthMm).toBe(
      650,
    );
  });

  // The other half of "only the pantry moved": no other row silently acquired the flag, and the
  // three columns still name themselves without a door count at any width.
  it("leaves the door-count flag on exactly base-cabinet, wall-cabinet and tall-pantry", () => {
    const claiming = INSERTABLE_BODY_DEFINITIONS.filter(
      ([, definition]) => definition.doorCountFollowsWidth === true,
    ).map(([buildId]) => buildId);

    expect(claiming).toEqual(["base-cabinet", "wall-cabinet", PANTRY_ID]);
  });

  it.each([...APPLIANCE_COLUMN_IDS, "fridge-free"])(
    "never counts doors in %s's name",
    (buildId) => {
      for (let widthMm = 300; widthMm <= 900; widthMm += 1) {
        const label = describeBodyLabelAt(definitionOf(buildId), widthMm);
        expect([buildId, widthMm, label]).toEqual([
          buildId,
          widthMm,
          definitionOf(buildId).label,
        ]);
      }
    },
  );
});

describe("QA 5B8 — the label and the bound agree at every millimetre, not only at the chips", () => {
  // `pantry-resizable.test.ts` sweeps `sizesMm`, which is the nine 50 mm chips. Relative stepping
  // reaches widths between them (ADR 0035 decision 4's own 470 example), so the continuum is what
  // has to agree.
  it("names the pantry by `deriveDoorCount` at every width inside its bound", () => {
    const definition = definitionOf(PANTRY_ID);
    for (let widthMm = 400; widthMm <= 800; widthMm += 1) {
      const doors = deriveDoorCount(widthMm);
      expect([widthMm, describeBodyLabelAt(definition, widthMm)]).toEqual([
        widthMm,
        `Coloană cămară ${String(doors)} ${doors === 1 ? "ușă" : "uși"}`,
      ]);
    }
  });

  // §9's own list, not the label function in isolation: the count the customer reads before they
  // tap has to be the count of the body that tap builds.
  it.each([
    [450, "Coloană cămară 1 ușă"],
    [499, "Coloană cămară 1 ușă"],
    [500, "Coloană cămară 2 uși"],
    [600, "Coloană cămară 2 uși"],
    [800, "Coloană cămară 2 uși"],
  ])("offers a %s mm opening the row named %s", (widthMm, label) => {
    const { world, target } = openingOf(widthMm);
    const offers = offersFor({
      records: world.records,
      voids: world.voids,
      columns: world.columns,
      catalog: world.catalog,
      cabinetDepthMm: world.cabinetDepthMm,
      target,
    });

    expect(offers.find((offer) => offer.buildId === PANTRY_ID)?.label).toBe(
      label,
    );
  });
});

describe("QA 5B8 — a pantry that is in the design can be resized", () => {
  // ADR 0031 through the row's new bound: an inserted pantry is the body the owner asked to be
  // resizable, and this is the operation they asked for.
  it("resizes an inserted pantry from 600 to 500 and back", () => {
    const inserted = insertPantryInto(600);
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;

    const placed = inserted.design.placements.at(-1);
    expect(placed).toBeDefined();
    if (!placed) return;

    const world = createWorld(inserted.design, KITCHEN_L_BODY_CATALOG);
    const narrowed = resizeTo(world, placed.id, 500);

    expect(narrowed.ok).toBe(true);
    if (!narrowed.ok) return;
    expect(
      narrowed.design.placements.find((one) => one.id === placed.id)?.body
        .widthMm,
    ).toBe(500);
  });

  // **DEFECT — left failing on purpose.** ADR 0048 decides "`tall-pantry` becomes resizable between
  // 400 and 800 mm", but the seeded instance `tall-pantry-600`
  // (`packages/configurator-domain/src/fixtures/kitchen-l-design.ts:240-252`) still declares
  // `fixedWidth: true`, and `resolveResizableBody` reads that flag off the **record**. So the one
  // pantry the shipped kitchen contains — `p6` — refuses every width in its own new bound with
  // `NOT_RESIZABLE` / `fixed`, and §9 renders a nine-chip width section that is disabled at all
  // nine (`qa-w5c.enumeration.test.ts`'s census moved 9 → 17 for exactly this reason).
  //
  // The fixture's stated justification is now false: it reads "Fixed for `tall-oven-tower-600`'s
  // reason above: one buildable width, so never a §5.4 donor", and the row has nine buildable
  // widths. Whether the flag flips is the owner's call; that the record and the catalogue now
  // disagree about the same cabinet is not.
  it("resizes the seeded pantry the owner actually has", () => {
    const result = resizeTo(seeded(), "p6", 500);

    expect(result.ok).toBe(true);
  });
});
