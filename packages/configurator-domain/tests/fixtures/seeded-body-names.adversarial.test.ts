// Adversarial QA for M6 wave 6A2 / ADR 0064. The wave's own suite proves the invariant on the
// pantry's column; this one attacks the parts a single column cannot reach: every seeded row that a
// resize can migrate, every width it can be migrated to, and the rows that must acquire nothing.
import { describe, expect, it, vi } from "vitest";

import {
  describeBodyLabelAt,
  deriveDoorCount,
  entryLabel,
  kindLabel,
  labelWithDoors,
  INSERTABLE_BODY_DEFINITIONS,
  resolveBuildableSizes,
  TWO_DOOR_MIN_WIDTH_MM,
  type BodyLabel,
  type LabelledBody,
} from "../../src/catalog.js";
import {
  buildSeededBodyDefinitions,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { describeSelection } from "../../src/queries/describe-selection.js";
import type { BodyDefinition } from "../../src/void-engine.js";
import { WORKTOP_DEPTH_MM } from "../../src/worktop-depth.js";
import { resizeTo } from "../support/commands.js";
import {
  advanceWithColumns,
  createWorld,
  type KitchenWorld,
} from "../support/kitchen-world.js";

const WALL_CABINET_EQUIVALENT_ID = "wall-cabinet";

function definitionOf(buildId: string): BodyDefinition {
  const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
  if (!definition) throw new Error(`fixture has no entry "${buildId}"`);
  return definition;
}

function bodyOf(buildId: string): LabelledBody {
  return { buildId, definition: definitionOf(buildId) };
}

function labelOf(
  world: KitchenWorld,
  placementId: string,
): BodyLabel | undefined {
  return describeSelection({
    records: world.records,
    voids: world.voids,
    catalog: world.catalog,
    target: { kind: "placement", id: placementId },
  })?.label;
}

function labelsOf(world: KitchenWorld): ReadonlyMap<string, string> {
  return new Map(
    world.design.placements.map((placement) => [
      placement.id,
      // Serialised so a map comparison fails on a readable diff rather than on object identity.
      JSON.stringify(labelOf(world, placement.id) ?? "<no selection>"),
    ]),
  );
}

function buildIdsOf(world: KitchenWorld): ReadonlyMap<string, string> {
  return new Map(
    world.design.placements.map((placement) => [
      placement.id,
      placement.body.buildId,
    ]),
  );
}

const seededKitchen = (): KitchenWorld =>
  createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);

/** One `setWidth`, applied the way the store applies it. `undefined` for a refusal, which several
 *  placements legitimately return: a column with no room to grow is a product rule, not a defect. */
function resized(
  world: KitchenWorld,
  placementId: string,
  widthMm: number,
): KitchenWorld | undefined {
  const result = resizeTo(world, placementId, widthMm);
  if (!result.ok) return undefined;
  return advanceWithColumns(world, result.design, result.effect.columns);
}

/** A width round trip that actually migrated something, or `undefined` if no buildable width was
 *  accepted for this placement. */
function roundTripped(
  world: KitchenWorld,
  placementId: string,
): { readonly after: KitchenWorld; readonly viaWidthMm: number } | undefined {
  const placement = world.design.placements.find(
    (candidate) => candidate.id === placementId,
  );
  if (!placement) throw new Error(`no placement "${placementId}"`);
  const startWidthMm = placement.body.widthMm;

  for (const widthMm of resolveBuildableSizes(
    KITCHEN_L_BODY_CATALOG,
    placement.body.buildId,
  )) {
    if (widthMm === startWidthMm) continue;
    const away = resized(world, placementId, widthMm);
    if (!away) continue;
    const back = resized(away, placementId, startWidthMm);
    if (!back) continue;
    return { after: back, viaWidthMm: widthMm };
  }
  return undefined;
}

const seededPlacementsWithEquivalent = KITCHEN_L_DESIGN.placements.filter(
  (placement) =>
    definitionOf(placement.body.buildId).catalogEquivalentId !== undefined,
);

/** Every seeded row a placement stands on, with the kind and band it had before it was named after a §7 entry.
 *  Written out and not read off the catalogue: a row re-banded by the spread must fail, not follow. */
const SEEDED_KIND_AND_BAND: Readonly<
  Record<string, readonly [kind: string, band: string]>
> = {
  "base-sink-800": ["base_cabinet", "base"],
  "base-dishwasher-600": ["dishwasher_housing", "base"],
  "base-hob-2drawer-600": ["base_cabinet", "base"],
  "base-drawer3-600": ["base_cabinet", "base"],
  "tall-oven-tower-600": ["tall_unit", "column"],
  "tall-pantry-600": ["tall_unit", "column"],
  "fridge-free-700": ["fridge_freestanding", "column"],
  "wall-2door-600": ["wall_cabinet", "wall"],
  "wall-1door-300": ["wall_cabinet", "wall"],
  "wall-2door-800": ["wall_cabinet", "wall"],
  "open-shelf-600": ["open_shelf_unit", "wall"],
  "hood-600": ["extractor_hood", "wall"],
  "wall-2door-600-top": ["wall_cabinet", "top"],
  "wall-1door-300-top": ["wall_cabinet", "top"],
  "wall-2door-800-top": ["wall_cabinet", "top"],
  "wall-2door-600-deep-top": ["wall_cabinet", "top"],
  "wall-2door-700-over-fridge": ["wall_cabinet", "top"],
};

const wallCabinetPlacements = KITCHEN_L_DESIGN.placements.filter(
  (placement) =>
    definitionOf(placement.body.buildId).catalogEquivalentId ===
    WALL_CABINET_EQUIVALENT_ID,
);

describe("6A2 adversarial: the rename is closed for every seeded row, not only the pantry's column", () => {
  it("survives a width round trip driven at each resizable placement in turn", () => {
    // The wave's suite drives `p6` only, which migrates that one column. A seeded row in any other
    // column is reached by no assertion there.
    const before = seededKitchen();
    const labelsBefore = labelsOf(before);
    const migratedSomewhere: string[] = [];

    for (const placement of seededPlacementsWithEquivalent) {
      const trip = roundTripped(before, placement.id);
      if (!trip) continue;

      const buildIdsAfter = buildIdsOf(trip.after);
      const migrated = [...buildIdsOf(before)]
        .filter(([id, buildId]) => buildIdsAfter.get(id) !== buildId)
        .map(([id]) => id);
      migratedSomewhere.push(...migrated);

      expect([placement.id, migrated.length > 0]).toEqual([placement.id, true]);
      expect([placement.id, [...labelsOf(trip.after)]]).toEqual([
        placement.id,
        [...labelsBefore],
      ]);
    }

    // Every one of the eight `wall-cabinet` **rows** is actually migrated by one of those trips, so
    // the parity above is not vacuous for the family the ADR calls out as the half-fix. Asserted per
    // buildId rather than per placement: `p19`, `p22` and `p24` stand in columns a fixed-width
    // neighbour makes unresizable (`COLUMN_MEMBER_NOT_RESIZABLE`), and the first two share their row
    // with a placement that does resize.
    const migratedRows = new Set(
      migratedSomewhere.map(
        (id) =>
          KITCHEN_L_DESIGN.placements.find((placement) => placement.id === id)
            ?.body.buildId ?? id,
      ),
    );
    const wallRows = new Set(
      wallCabinetPlacements.map((placement) => placement.body.buildId),
    );
    const neverMigratedByAResize = [...wallRows].filter(
      (row) => !migratedRows.has(row),
    );

    // The one wall row no **resize** can ever reach: `p24` is its only placement and it sits over
    // the fixed-width fridge, so `COLUMN_MEMBER_NOT_RESIZABLE` refuses every width trip. Its name is
    // therefore correct-by-construction rather than by round trip, and it is listed here so a row
    // *joining* this list is a visible change.
    //
    // **Named for the resize path alone, and that qualification is the point** (ADR 0101 decision
    // 2). Since that wave this row follows the cabinet-depth setting like every other wall row —
    // measured 2026-09-08, its entry goes `frameDepthMm` 561 -> 661 between the two catalogues and
    // declares `follows: "cabinet-depth"` — so **a depth change does reach it**, and `setCabinetDepth`
    // rebuilds it. What a depth change does *not* do is move it to a different catalogue row: the
    // `buildId` is `wall-2door-700-over-fridge` at both settings, which is the only sense of
    // "migrated" this test measures.
    //
    // So an unqualified `neverMigrated` would read as "the product cannot migrate this" when only
    // one command cannot, and it would keep passing while saying so — the assertion's value is
    // unchanged by that wave, its meaning is not. That is ADR 0093's failure mode running backwards.
    //
    // It is an incidental fact of the seeded fixture rather than a promise the product makes, and
    // nothing may be built on it.
    expect(neverMigratedByAResize).toEqual(["wall-2door-700-over-fridge"]);
  });

  it("names a wall row the same thing before and after its own buildId migrates", () => {
    // Per row, not per design: the identity is asserted on the migrated placement itself.
    const before = seededKitchen();

    let migratedPlacements = 0;

    for (const placement of wallCabinetPlacements) {
      const trip = roundTripped(before, placement.id);
      if (!trip) continue;
      migratedPlacements += 1;

      const buildIdBefore = placement.body.buildId;
      const buildIdAfter = buildIdsOf(trip.after).get(placement.id);
      expect([placement.id, buildIdAfter]).toEqual([
        placement.id,
        WALL_CABINET_EQUIVALENT_ID,
      ]);
      expect([placement.id, buildIdAfter === buildIdBefore]).toEqual([
        placement.id,
        false,
      ]);
      expect([placement.id, labelOf(trip.after, placement.id)]).toEqual([
        placement.id,
        labelOf(before, placement.id),
      ]);
    }

    // Ten of the thirteen wall placements resize; the loop above is not silently skipping all of
    // them.
    expect(migratedPlacements).toBe(10);
  });
});

describe("6A2 adversarial: the name is a function of width, swept rather than sampled", () => {
  it("agrees with its equivalent at every integer width from 100 to 1200 mm", () => {
    // A row that copied the label but not `doorCountFollowsWidth` agrees at no width; a row that
    // copied the flag but not the label agrees at none either. Swept because the criterion is that
    // the two definitions are indistinguishable to `describeBodyLabelAt`, not that they match at the
    // one width the fixture happens to seat the body at.
    for (const placement of seededPlacementsWithEquivalent) {
      const seeded = bodyOf(placement.body.buildId);
      const equivalent = bodyOf(seeded.definition.catalogEquivalentId ?? "");

      const disagreements = [];
      for (let widthMm = 100; widthMm <= 1200; widthMm += 1) {
        const seededLabel = describeBodyLabelAt(seeded, widthMm);
        const equivalentLabel = describeBodyLabelAt(equivalent, widthMm);
        if (JSON.stringify(seededLabel) !== JSON.stringify(equivalentLabel)) {
          disagreements.push([widthMm, seededLabel, equivalentLabel]);
        }
      }
      expect([placement.body.buildId, disagreements]).toEqual([
        placement.body.buildId,
        [],
      ]);
    }
  });

  it("flips a wall row's door suffix at the 500 mm boundary and nowhere else", () => {
    // ADR 0033: the suffix tracks width. A seeded row that carries a *frozen* suffix — a hand-copied
    // "2 uși" in the label — would pass a same-width round trip and fail here.
    const seeded = bodyOf(wallCabinetPlacements[0]?.body.buildId ?? "");

    for (const widthMm of [
      TWO_DOOR_MIN_WIDTH_MM - 1,
      TWO_DOOR_MIN_WIDTH_MM,
      300,
      400,
      600,
      800,
    ]) {
      expect([widthMm, describeBodyLabelAt(seeded, widthMm)]).toEqual([
        widthMm,
        labelWithDoors(
          entryLabel(WALL_CABINET_EQUIVALENT_ID),
          deriveDoorCount(widthMm),
        ),
      ]);
    }
  });

  it("renders the width the placement is actually seated at, so a 300 mm wall row reads one door", () => {
    // `p10` and `p16` are 300 mm. Under the old kind-label path both read the bare generic name; a
    // label-only fix would have made them read *two* doors' worth of nothing. They must read one.
    const world = seededKitchen();
    const narrow = KITCHEN_L_DESIGN.placements.filter(
      (placement) =>
        placement.body.widthMm < TWO_DOOR_MIN_WIDTH_MM &&
        definitionOf(placement.body.buildId).catalogEquivalentId ===
          WALL_CABINET_EQUIVALENT_ID,
    );

    expect(narrow.length).toBeGreaterThan(0);
    for (const placement of narrow) {
      expect([placement.id, labelOf(world, placement.id)]).toEqual([
        placement.id,
        describeBodyLabelAt(
          bodyOf(placement.body.buildId),
          placement.body.widthMm,
        ),
      ]);
      expect([placement.id, labelOf(world, placement.id)]).toEqual([
        placement.id,
        labelWithDoors(entryLabel(WALL_CABINET_EQUIVALENT_ID), 1),
      ]);
    }
  });
});

describe("6A2 adversarial: what the derivation is, and what it must not have acquired", () => {
  it("names itself by an entry that exists, with its door-count flag", () => {
    // Checked against `INSERTABLE_BODY_DEFINITIONS` — the same list `describeBodyName` resolves the
    // pointer through — so a seeded row pointing at a row that is not there, or whose flag drifted
    // from the entry it was read off, fails here. Since 6B-f there is no name to copy: the pointer
    // *is* the name, which is why the pointer's target must exist.
    const insertableById = new Map(INSERTABLE_BODY_DEFINITIONS);

    for (const placement of seededPlacementsWithEquivalent) {
      const seeded = definitionOf(placement.body.buildId);
      const equivalentId = seeded.catalogEquivalentId ?? "";
      const equivalent = insertableById.get(equivalentId);

      expect([equivalentId, equivalent === undefined]).toEqual([
        equivalentId,
        false,
      ]);
      expect([
        placement.body.buildId,
        describeBodyLabelAt(bodyOf(placement.body.buildId), 600),
      ]).toEqual([
        placement.body.buildId,
        describeBodyLabelAt(bodyOf(equivalentId), 600),
      ]);
      expect([placement.body.buildId, seeded.doorCountFollowsWidth]).toEqual([
        placement.body.buildId,
        equivalent?.doorCountFollowsWidth,
      ]);
    }
  });

  it("leaves every corner body — base legs and both wall returns — with no name of its own", () => {
    // ADR 0022 / ADR 0025. Named explicitly rather than derived from "has no equivalent", so that a
    // future row silently acquiring a pointer is caught here.
    for (const buildId of [
      "base-corner-x-900",
      "base-corner-return-320",
      "wall-corner-return-570",
      "wall-corner-return-570-top",
    ]) {
      const corner = definitionOf(buildId);
      expect([
        buildId,
        corner.catalogEquivalentId,
        corner.doorCountFollowsWidth,
      ]).toEqual([buildId, undefined, undefined]);
      expect([buildId, describeBodyLabelAt(bodyOf(buildId), 570)]).toEqual([
        buildId,
        kindLabel(corner.kind),
      ]);
    }
  });

  it("refuses a resize of a corner return, so its name has no migration to survive", () => {
    const world = seededKitchen();

    for (const placementId of ["p9", "p21", "p25", "p26"]) {
      const result = resizeTo(world, placementId, 600);
      expect([placementId, result.ok]).toEqual([placementId, false]);
    }
  });

  it("changes no seeded body's kind, band or width capability", () => {
    // The wave is a name. Anything else the spread picked up off the catalogue entry — a different
    // `kind`, `insertable: true`, a `sizesMm` set, an `occupiedDepth` — would be a geometry or
    // affordance change wearing a rename's clothes.
    const placedBuildIds = [
      ...new Set(
        seededPlacementsWithEquivalent.map(
          (placement) => placement.body.buildId,
        ),
      ),
    ];

    expect(
      placedBuildIds.map((buildId) => {
        const seeded = definitionOf(buildId);
        return [
          buildId,
          seeded.kind,
          seeded.band,
          seeded.insertable,
          seeded.sizesMm,
        ];
      }),
    ).toEqual(
      Object.entries(SEEDED_KIND_AND_BAND).map(([buildId, [kind, band]]) => [
        buildId,
        kind,
        band,
        false,
        undefined,
      ]),
    );
  });
});

describe("6A2 adversarial: the seeded rows no placement in the fixture stands on", () => {
  // `SEEDED_BODY_DEFINITIONS` holds a row — `base-drawer2-600`, pointing at `base-panbank` — that
  // `KITCHEN_L_PLACEMENTS` never uses. Every assertion in the wave's own suite iterates
  // `KITCHEN_L_DESIGN.placements`, so that row is covered by nothing there while a design loaded
  // from storage may well contain it.
  const seededRows = [...KITCHEN_L_BODY_CATALOG].filter(
    ([, definition]) =>
      definition.insertable === false &&
      definition.catalogEquivalentId !== undefined,
  );
  const placedBuildIds = new Set(
    KITCHEN_L_DESIGN.placements.map((placement) => placement.body.buildId),
  );

  it("includes at least one row the seeded design does not place", () => {
    const unplaced = seededRows
      .map(([buildId]) => buildId)
      .filter((buildId) => !placedBuildIds.has(buildId));

    expect(unplaced).toEqual(["base-drawer2-600"]);
  });

  it("gives every seeded row its equivalent's name, placed or not, at every width", () => {
    for (const [buildId, seeded] of seededRows) {
      const equivalent = bodyOf(seeded.catalogEquivalentId ?? "");
      const disagreements = [];
      for (let widthMm = 100; widthMm <= 1200; widthMm += 1) {
        if (
          JSON.stringify(describeBodyLabelAt(bodyOf(buildId), widthMm)) !==
          JSON.stringify(describeBodyLabelAt(equivalent, widthMm))
        ) {
          disagreements.push(widthMm);
        }
      }
      expect([buildId, disagreements]).toEqual([buildId, []]);
    }
  });

  it("gives no seeded row an id an insertable entry already uses", () => {
    // `KITCHEN_L_BODY_CATALOG` spreads the seeded rows and then the insertable ones into one `Map`, so a shared id
    // silently drops the seeded row. Read off the seeded list before that spread: the map cannot show the loss.
    const insertableIds = new Set(
      INSERTABLE_BODY_DEFINITIONS.map(([buildId]) => buildId),
    );
    const seededIds = buildSeededBodyDefinitions(WORKTOP_DEPTH_MM).map(
      ([buildId]) => buildId,
    );

    expect(seededIds.length).toBeGreaterThan(placedBuildIds.size);
    expect(seededIds.filter((buildId) => insertableIds.has(buildId))).toEqual(
      [],
    );
  });
});

describe("6A2 adversarial: the derivation's failure modes", () => {
  it("resolves every seeded pointer against the catalogue the derivation read", () => {
    // The throw in `namedAfterCatalogEquivalent` is unreachable only while this holds. Asserted
    // rather than assumed, because the module would otherwise fail at import time with a stack that
    // names no row.
    const insertableIds = new Set(
      INSERTABLE_BODY_DEFINITIONS.map(([buildId]) => buildId),
    );
    const dangling = [...KITCHEN_L_BODY_CATALOG]
      .filter(
        ([, definition]) =>
          definition.catalogEquivalentId !== undefined &&
          !insertableIds.has(definition.catalogEquivalentId),
      )
      .map(([buildId, definition]) => [
        buildId,
        definition.catalogEquivalentId,
      ]);

    expect(dangling).toEqual([]);
  });

  it("loads the fixture module on its own, with no other module imported first", async () => {
    // `namedAfterCatalogEquivalent` runs at module-evaluation time against a `const` exported by
    // `catalog.ts`. A cycle between the two would leave that binding in its temporal dead zone and
    // the fixture would throw on import — from a fresh registry, with the fixture as the entry
    // point, which is the ordering no other test exercises.
    vi.resetModules();
    const fresh = await import("../../src/fixtures/kitchen-l-design.js");

    const pantry = fresh.KITCHEN_L_BODY_CATALOG.get("tall-pantry-600");
    expect(pantry?.catalogEquivalentId).toBe("tall-pantry");
  });
});
