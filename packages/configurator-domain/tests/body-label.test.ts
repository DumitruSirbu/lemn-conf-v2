// M6B wave 6B-f: **the domain publishes which message names a body, never the words.**
//
// The union is closed and four-cased on purpose — a generic `{ key, params }` would let a refusal
// carry any leaf in the catalogue, which is the one thing this seam exists to make impossible. What
// is asserted here is the shape and its boundaries; which words each case resolves to is the app's,
// in `apps/web/tests/i18n/body-label.test.ts`.
import { describe, expect, it } from "vitest";

import {
  describeBodyLabelAt,
  describeBodyName,
  deriveDoorCount,
  EMPTY_SLOT_LABEL,
  entryLabel,
  INSERTABLE_BODY_DEFINITIONS,
  kindLabel,
  labelWithDoors,
  TWO_DOOR_MIN_WIDTH_MM,
  type BodyLabel,
  type LabelledBody,
} from "../src/catalog.js";
import { KITCHEN_L_BODY_CATALOG } from "../src/fixtures/kitchen-l-design.js";
import { offersFor } from "../src/queries/offers.js";
import { clearBodies } from "./support/commands.js";
import { voidAt } from "./support/kitchen-world.js";
import { narrowColumnWorld } from "./support/narrow-column.js";

const INSERTABLE_BY_ID = new Map(INSERTABLE_BODY_DEFINITIONS);

function bodyOf(buildId: string): LabelledBody {
  const definition = INSERTABLE_BY_ID.get(buildId);
  if (!definition) throw new Error(`no catalogue entry ${buildId}`);
  return { buildId, definition };
}

/** Every width the panel can put in front of a customer for this row, both the chips and the two
 *  sides of ADR 0033's threshold — the boundary a door count is decided at. */
function offeredWidthsMm(body: LabelledBody): readonly number[] {
  return [
    ...(body.definition.sizesMm ?? []),
    TWO_DOOR_MIN_WIDTH_MM - 1,
    TWO_DOOR_MIN_WIDTH_MM,
  ];
}

describe("the descriptor is one wrap deep, never two", () => {
  it("refuses to count the doors of a name that already counts them", () => {
    const counted = labelWithDoors(entryLabel("wall-cabinet"), 2);

    expect(() => labelWithDoors(counted, 2)).toThrow(/already counting doors/u);
  });

  it("wraps only the rows declaring doorCountFollowsWidth, at every offered width", () => {
    // The criterion, swept rather than sampled: sixteen entries against their own width sets plus
    // the threshold either side of it. A row that started wrapping — or stopped — fails here before
    // it reaches a priced line.
    let swept = 0;

    for (const [buildId, definition] of INSERTABLE_BODY_DEFINITIONS) {
      const body = { buildId, definition };
      const followsWidth = definition.doorCountFollowsWidth === true;

      for (const widthMm of offeredWidthsMm(body)) {
        const label = describeBodyLabelAt(body, widthMm);
        expect([buildId, widthMm, label]).toEqual([
          buildId,
          widthMm,
          followsWidth
            ? labelWithDoors(entryLabel(buildId), deriveDoorCount(widthMm))
            : entryLabel(buildId),
        ]);
        // Whatever the case, the wrapped name is never itself a wrap.
        if (label.kind === "withDoors")
          expect([buildId, label.name.kind]).not.toEqual([
            buildId,
            "withDoors",
          ]);
        swept += 1;
      }
    }

    expect(swept).toBeGreaterThan(100);
  });
});

describe("what names a body, and in what order", () => {
  it("names a §7 entry by the row the customer picked", () => {
    expect(describeBodyName(bodyOf("tall-pantry"))).toEqual(
      entryLabel("tall-pantry"),
    );
  });

  it("names a seeded row by the entry a resize would rebuild it through", () => {
    // ADR 0064: the same name before and after the migration, because the pointer *is* the name.
    const seeded = KITCHEN_L_BODY_CATALOG.get("tall-pantry-600");
    if (!seeded) throw new Error("no seeded pantry");

    expect(seeded.insertable).not.toBe(true);
    expect(
      describeBodyName({ buildId: "tall-pantry-600", definition: seeded }),
    ).toEqual(entryLabel(seeded.catalogEquivalentId ?? ""));
  });

  it("names a row with no equivalent by its kind", () => {
    // ADR 0022 / §13.1: the four corner bodies, which are not bodies a customer chooses.
    const corner = KITCHEN_L_BODY_CATALOG.get("wall-corner-return-570");
    if (!corner) throw new Error("no wall corner return");

    expect(corner.catalogEquivalentId).toBeUndefined();
    expect(
      describeBodyName({
        buildId: "wall-corner-return-570",
        definition: corner,
      }),
    ).toEqual(kindLabel(corner.kind));
  });

  it("keeps the empty slot its own case rather than a body with no name", () => {
    expect(EMPTY_SLOT_LABEL).toEqual({ kind: "emptySlot" });
  });
});

describe("ADR 0033 on the offer list: a refused row states no door count", () => {
  // The one behaviour the retyping could silently lose. A refused row has no width — the evaluation
  // stopped before it chose one — and stating a count for a cabinet that cannot be built here is the
  // naming defect ADR 0033 exists to remove, one row down.
  function baseCabinetOfferInto(openingWidthMm: number): BodyLabel | undefined {
    const world = clearBodies(narrowColumnWorld(openingWidthMm), ["s0"]);
    const opening = voidAt(world, `A|${(openingWidthMm / 1000).toFixed(2)}`, 0);
    return offersFor({
      records: world.records,
      voids: world.voids,
      columns: world.columns,
      catalog: world.catalog,
      cabinetDepthMm: world.cabinetDepthMm,
      target: { kind: "void", id: opening.id },
    }).find((offer) => offer.buildId === "base-cabinet")?.label;
  }

  it("counts the doors on every row, from the width that row would build to", () => {
    // A 400 mm base opening: narrow enough that some §7 rows refuse it — `base-sink`'s 560 mm floor
    // (ADR 0017) among them — so the list is a **filtered** one and not the whole catalogue.
    //
    // **The refused arm this test used to carry is gone with the rows it described** (owner,
    // 2026-09-10). It asserted that a row with no width shows its generic name; there is no such
    // row now, so what is left to prove is the positive half — every row names the doors its own
    // planned width earns — plus the fact that the refusals really did happen, which is the
    // `base-sink` absence below rather than a count of rows nobody can see.
    const world = clearBodies(narrowColumnWorld(400), ["s0"]);
    const opening = voidAt(world, "A|0.40", 0);

    const rows = offersFor({
      records: world.records,
      voids: world.voids,
      columns: world.columns,
      catalog: world.catalog,
      cabinetDepthMm: world.cabinetDepthMm,
      target: { kind: "void", id: opening.id },
    });

    expect(rows.length).toBeGreaterThan(0);
    // Not vacuous: the 400 mm opening genuinely refuses rows, so the sweep is over a filtered list.
    expect(rows.map((row) => row.buildId)).not.toContain("base-sink");

    for (const row of rows) {
      const followsWidth =
        INSERTABLE_BY_ID.get(row.buildId)?.doorCountFollowsWidth === true;
      expect([row.buildId, row.label]).toEqual([
        row.buildId,
        followsWidth
          ? labelWithDoors(
              entryLabel(row.buildId),
              deriveDoorCount(row.buildsToWidthMm),
            )
          : entryLabel(row.buildId),
      ]);
    }
  });

  it.each([
    [TWO_DOOR_MIN_WIDTH_MM - 1, 1],
    [TWO_DOOR_MIN_WIDTH_MM, 2],
  ])(
    "counts a %i mm opening's offered cabinet as %i doors",
    (openingWidthMm, doors) => {
      expect([openingWidthMm, baseCabinetOfferInto(openingWidthMm)]).toEqual([
        openingWidthMm,
        labelWithDoors(entryLabel("base-cabinet"), doors),
      ]);
    },
  );
});
