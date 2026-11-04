import {
  KITCHEN_L_BODY_CATALOG,
  SAMPLE_PRICE_BOOK,
  buildIdsPricedAs,
  buildKitchenLBodyCatalog,
  isBuiltInAccessoryId,
  isSameItem,
  pricedAsBuildId,
} from "@lemnaria/configurator-domain";
import type { ItemRef, PriceBook } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { usageProbesFor } from "../src/item-usage-probes.js";
import type { ItemUsageProbe } from "../src/m10-ports.js";
import {
  LINKED_THROUGH_EQUIVALENT,
  LINKED_TO_A_ROW_PLACED_MANY_TIMES,
  NOT_IN_THE_BOOK,
  USAGE_BASIS,
  USAGE_ITEMS,
} from "./support/usage-fixture-designs.js";

/**
 * Which way each item is counted, and the facts each probe carries. A count that reads a deletable item by the walk
 * would leave out the designs the product cannot read, which a deletion must not be judged by: so the routing is pinned
 * here, kind by kind, and not left to the count tests that happen to use one route.
 */
function probesFor(items: readonly ItemRef[]): readonly ItemUsageProbe[] {
  return usageProbesFor(items, USAGE_BASIS);
}

function probeFor(item: ItemRef): ItemUsageProbe {
  const [probe] = probesFor([item]);
  if (probe === undefined) throw new Error("no probe");
  return probe;
}

const DELETABLE_ITEMS = USAGE_ITEMS.filter(
  (item) =>
    item.kind === "material" ||
    item.kind === "hardware" ||
    (item.kind === "accessory" && !isBuiltInAccessoryId(item.accessoryId)),
);

describe("the way each kind of item is counted", () => {
  it.each(DELETABLE_ITEMS.map((item) => [JSON.stringify(item), item] as const))(
    "reads the deletable item %s from the stored document in SQL, never by the walk that leaves unreadable designs out",
    (_name, item) => {
      expect(probeFor(item).via).not.toBe("migrated-design");
    },
  );

  it("counts a material and a hardware class by the settings, and a linked or unstated accessory by the bodies placed", () => {
    expect(
      DELETABLE_ITEMS.map((item) => [item.kind, probeFor(item).via]),
    ).toEqual(
      DELETABLE_ITEMS.map((item) => [
        item.kind,
        item.kind === "accessory" ? "placed-bodies" : "settings-tier",
      ]),
    );
  });

  it("counts a colour, a handle and each built-in accessory by the walk, which asks the domain's own predicate", () => {
    const walked: ItemRef[] = [
      { kind: "finish", finishId: "veneer.nuc" },
      { kind: "handle", handle: "push" },
      { kind: "accessory", accessoryId: "sinkProtectiveCover" },
      { kind: "accessory", accessoryId: "dishDryingRack" },
    ];

    expect(probesFor(walked).map(({ via }) => via)).toEqual([
      "migrated-design",
      "migrated-design",
      "migrated-design",
      "migrated-design",
    ]);
  });
});

describe("the fallback a tier probe carries", () => {
  const book: PriceBook = {
    ...SAMPLE_PRICE_BOOK,
    material: { ...SAMPLE_PRICE_BOOK.material, defaultTierId: "shared-id" },
    hardware: { ...SAMPLE_PRICE_BOOK.hardware, defaultTierId: "other-id" },
  };

  function fallbackFlagOf(item: ItemRef): unknown {
    const [probe] = usageProbesFor([item], {
      catalog: KITCHEN_L_BODY_CATALOG,
      book,
    });
    return probe?.via === "settings-tier" ? probe.isFallback : "not a tier";
  }

  it("is set for the book's own default of the item's kind, and for no other tier", () => {
    expect([
      fallbackFlagOf({ kind: "material", tierId: "shared-id" }),
      fallbackFlagOf({ kind: "hardware", tierId: "other-id" }),
      fallbackFlagOf({ kind: "material", tierId: "other-id" }),
      fallbackFlagOf({ kind: "hardware", tierId: "shared-id" }),
      fallbackFlagOf({ kind: "material", tierId: "not-a-default" }),
    ]).toEqual([true, true, false, false, false]);
  });

  it("sets it for exactly one tier of each kind in the sample book", () => {
    const tiers = USAGE_ITEMS.filter(
      (item) => item.kind === "material" || item.kind === "hardware",
    );

    for (const kind of ["material", "hardware"] as const) {
      const flagged = tiers
        .filter((item) => item.kind === kind)
        .filter((item) => {
          const probe = probeFor(item);
          return probe.via === "settings-tier" && probe.isFallback;
        });
      expect(flagged, kind).toHaveLength(1);
    }
  });
});

describe("the build ids a linked accessory is counted through", () => {
  it("are the ones the domain says are priced as the linked row, whatever the order of the catalogue", () => {
    const rule = USAGE_BASIS.book.linkedAccessories.find(
      ({ accessoryId }) => accessoryId === LINKED_THROUGH_EQUIVALENT,
    );
    if (rule === undefined) throw new Error("the fixture book lacks the rule");

    const probe = probeFor({
      kind: "accessory",
      accessoryId: LINKED_THROUGH_EQUIVALENT,
    });

    expect(probe).toMatchObject({
      via: "placed-bodies",
      buildIds: buildIdsPricedAs(KITCHEN_L_BODY_CATALOG, rule.linkedBuildId),
    });
    for (const buildId of probe.via === "placed-bodies" ? probe.buildIds : []) {
      expect(pricedAsBuildId(KITCHEN_L_BODY_CATALOG, buildId)).toBe(
        rule.linkedBuildId,
      );
    }
  });

  it("include every seeded body priced as the row and the row itself, so a placement of any of them is counted", () => {
    const probe = probeFor({
      kind: "accessory",
      accessoryId: LINKED_TO_A_ROW_PLACED_MANY_TIMES,
    });
    const buildIds = probe.via === "placed-bodies" ? probe.buildIds : [];
    const everyBodyPricedAsTheRow = [...KITCHEN_L_BODY_CATALOG.keys()].filter(
      (buildId) =>
        pricedAsBuildId(KITCHEN_L_BODY_CATALOG, buildId) === "wall-cabinet",
    );

    expect([...buildIds].sort()).toEqual([...everyBodyPricedAsTheRow].sort());
    expect(buildIds).toContain("wall-cabinet");
    expect(buildIds.length).toBeGreaterThan(1);
  });

  it("are none for an accessory the book does not state, and for a rule linked to a row the catalogue lacks", () => {
    const book: PriceBook = {
      ...SAMPLE_PRICE_BOOK,
      linkedAccessories: [
        {
          accessoryId: "linked-to-nothing",
          ruleId: "accessory.linked-to-nothing",
          linkedBuildId: "a-row-the-catalogue-lacks",
          perUnitMinor: 1_000,
          name: "Nimic",
        },
      ],
    };

    const probes = usageProbesFor(
      [
        { kind: "accessory", accessoryId: "linked-to-nothing" },
        { kind: "accessory", accessoryId: NOT_IN_THE_BOOK },
      ],
      { catalog: KITCHEN_L_BODY_CATALOG, book },
    );

    expect(
      probes.map((probe) => probe.via === "placed-bodies" && probe.buildIds),
    ).toEqual([[], []]);
  });

  it("are the same at both cabinet depths, so one catalogue is enough to count a kitchen built at either", () => {
    const shallow = buildKitchenLBodyCatalog(600);
    const deep = buildKitchenLBodyCatalog(700);

    for (const row of ["wall-cabinet", "base-sink", "base-3drawer"]) {
      expect([...buildIdsPricedAs(shallow, row)].sort()).toEqual(
        [...buildIdsPricedAs(deep, row)].sort(),
      );
    }
    expect([...shallow.keys()].sort()).toEqual([...deep.keys()].sort());
  });
});

describe("one probe per distinct item", () => {
  it("collapses an item asked about twice, whatever the item's kind, to one probe", () => {
    const items: ItemRef[] = [
      { kind: "material", tierId: "material.veneer" },
      { kind: "material", tierId: "material.veneer" },
      { kind: "finish", finishId: "veneer.nuc" },
      { kind: "finish", finishId: "veneer.nuc" },
      { kind: "accessory", accessoryId: LINKED_THROUGH_EQUIVALENT },
      { kind: "accessory", accessoryId: LINKED_THROUGH_EQUIVALENT },
    ];

    const probes = probesFor(items);

    expect(probes).toHaveLength(3);
    for (const item of items) {
      expect(
        probes.filter((probe) => isSameItem(probe.item, item)),
      ).toHaveLength(1);
    }
  });

  it("answers an item of one kind and an item of another kind that share an id as two probes", () => {
    const probes = probesFor([
      { kind: "material", tierId: "material.veneer" },
      { kind: "hardware", tierId: "material.veneer" },
    ]);

    expect(probes.map(({ item }) => item.kind).sort()).toEqual([
      "hardware",
      "material",
    ]);
  });

  it("gives the same probes, in the same order, for the same items in any order", () => {
    const forward = probesFor(USAGE_ITEMS).map(({ item }) =>
      JSON.stringify(item),
    );
    const backward = probesFor([...USAGE_ITEMS].reverse()).map(({ item }) =>
      JSON.stringify(item),
    );

    expect(backward).toEqual(forward);
    expect(forward).toHaveLength(USAGE_ITEMS.length);
  });

  it("makes no probe for no items", () => {
    expect(probesFor([])).toEqual([]);
  });
});
