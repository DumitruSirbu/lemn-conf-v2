// M10 M4 fix wave: what a draft says about the rows it creates and removes is read in order. A deletion undoes only the
// creation before it; reverting a row takes the changes that cannot stand without it.
import { describe, expect, it } from "vitest";

import { applyChanges } from "../../src/price-dashboard/apply-changes.js";
import {
  createdItemsOf,
  incompleteCreationIndexes,
  withoutRow,
} from "../../src/price-dashboard/draft-structure.js";

import {
  allRates,
  BASE,
  createAccessory,
  createTier,
  deleteItem,
  hardwareItem,
  accessoryItem,
  refusalCodes,
  rewordRow,
  setAccessoryPrice,
  setRate,
  tierDraft,
} from "./qa-m4-support.js";

const X = hardwareItem("hw.x");

describe("a deletion undoes only the creation before it", () => {
  it("lists a class created, deleted and created again, once", () => {
    const changes = [createTier("hw.x"), deleteItem(X), createTier("hw.x")];

    expect(createdItemsOf(changes)).toEqual([X]);
  });

  it("lists a class whose deletion comes before its creation", () => {
    expect(createdItemsOf([deleteItem(X), createTier("hw.x")])).toEqual([X]);
  });

  it("lists no class created and then deleted", () => {
    expect(createdItemsOf([createTier("hw.x"), deleteItem(X)])).toEqual([]);
  });

  it("owes the rates of the creation that follows a deletion, though the first creation owed none", () => {
    const changes = [...tierDraft("hw.x"), deleteItem(X), createTier("hw.x")];
    const everyIndex = new Set(changes.keys());

    expect(incompleteCreationIndexes(changes, everyIndex, BASE)).toEqual([5]);
  });

  it("owes nothing for a class deleted after its creation", () => {
    const changes = [createTier("hw.x"), deleteItem(X)];

    expect(incompleteCreationIndexes(changes, new Set([0, 1]), BASE)).toEqual(
      [],
    );
  });
});

describe("an id that was a row is never given to a row again", () => {
  it("refuses a class created again after its deletion in one draft, whatever rates follow", () => {
    const changes = [
      ...tierDraft("hw.x"),
      deleteItem(X),
      createTier("hw.x"),
      ...allRates("hw.x"),
    ];

    expect(refusalCodes(applyChanges(BASE, changes))).toContain(
      "5:NOT_EDITABLE",
    );
  });

  it("refuses an accessory created again after its deletion in one draft", () => {
    const changes = [
      createAccessory("acc.x"),
      deleteItem(accessoryItem("acc.x")),
      createAccessory("acc.x"),
    ];

    expect(refusalCodes(applyChanges(BASE, changes))).toBe("2:NOT_EDITABLE");
  });

  it("refuses a shipped class created again after its deletion", () => {
    const changes = [
      deleteItem(hardwareItem("hardware.premium")),
      ...tierDraft("hardware.premium"),
    ];

    expect(refusalCodes(applyChanges(BASE, changes))).toContain(
      "1:NOT_EDITABLE",
    );
  });
});

describe("reverting a row takes the changes that cannot stand without it", () => {
  const created = [
    ...tierDraft("hw.x"),
    rewordRow(X, "name", "Alta"),
    createAccessory("acc.x"),
    setAccessoryPrice("acc.x", 9),
    setRate("hardware.soft-close", "perHingeMinor", 5),
  ];

  it("takes a created class with its rates and words, and leaves every other change", () => {
    const rest = withoutRow(created, {
      kind: "hardware-tier-created",
      tierId: "hw.x",
    });

    expect(rest).toEqual(created.slice(5));
  });

  it("takes a created class's deletion with it", () => {
    const rest = withoutRow([...created, deleteItem(X)], {
      kind: "hardware-tier-created",
      tierId: "hw.x",
    });

    expect(rest).toEqual(created.slice(5));
  });

  it("takes a created accessory with its price, and leaves the class", () => {
    const rest = withoutRow(created, {
      kind: "accessory-created",
      accessoryId: "acc.x",
    });

    expect(rest).toEqual([...created.slice(0, 5), created[7]]);
  });

  it("takes one rate of a created class alone when the rate is what is reverted", () => {
    const rest = withoutRow(created, {
      kind: "hardware",
      tierId: "hw.x",
      field: "perHingeMinor",
    });

    expect(rest).toHaveLength(created.length - 1);
  });

  it("takes the deletion of a class when a rate row of the class is reverted", () => {
    const deletion = deleteItem(hardwareItem("hardware.premium"));
    const other = setRate("hardware.soft-close", "perHingeMinor", 5);

    const rest = withoutRow([deletion, other], {
      kind: "hardware",
      tierId: "hardware.premium",
      field: "perDrawerMinor",
    });

    expect(rest).toEqual([other]);
  });
});
