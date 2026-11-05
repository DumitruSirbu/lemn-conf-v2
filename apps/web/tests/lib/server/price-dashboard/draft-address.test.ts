import { describe, expect, it } from "vitest";

import {
  BOOK_FIELD_ADDRESS_KINDS,
  type BookFieldAddressKind,
} from "@lemnaria/configurator-domain";

import { readDraftAddress } from "@/lib/server/price-dashboard/draft-address";

const TIER = { kind: "hardware", tierId: "hardware.economic" } as const;
const PLINTH = { kind: "accessory", accessoryId: "plinth-light" } as const;
const VENEER = { kind: "material", tierId: "material.veneer" } as const;

function readAny(declared: unknown) {
  return readDraftAddress(declared, BOOK_FIELD_ADDRESS_KINDS);
}

describe("the four structural kinds, rebuilt member by member", () => {
  it.each([
    [{ kind: "hardware-tier-created", tierId: "hardware.economic" }],
    [{ kind: "accessory-created", accessoryId: "plinth-light" }],
    [{ kind: "created-row-text", item: TIER, field: "name" }],
    [{ kind: "created-row-text", item: PLINTH, field: "description" }],
    [{ kind: "item-deleted", item: TIER }],
    [{ kind: "item-deleted", item: VENEER }],
    [{ kind: "item-deleted", item: PLINTH }],
  ])("reads %j as the address it states", (declared) => {
    expect(readAny(declared)).toEqual({ kind: "address", address: declared });
  });

  it("returns a copy, so a member the caller changes later does not move the address", () => {
    const item: { kind: string; tierId: string } = { ...TIER };
    const declared = { kind: "item-deleted", item };

    const reading = readAny(declared);
    item.tierId = "hardware.other";

    expect(reading).toEqual({
      kind: "address",
      address: { kind: "item-deleted", item: TIER },
    });
  });

  it.each([
    [{ kind: "hardware-tier-created", tierId: "t", extra: 1 }],
    [{ kind: "accessory-created", accessoryId: "a", name: "x" }],
    [{ kind: "created-row-text", item: TIER, field: "name", value: "x" }],
    [{ kind: "item-deleted", item: TIER, field: "name" }],
  ])("refuses %j for a member the kind does not name", (declared) => {
    expect(readAny(declared)).toEqual({ kind: "extra-member" });
  });

  it.each([
    [
      {
        kind: "created-row-text",
        item: { ...TIER, field: "name" },
        field: "name",
      },
    ],
    [{ kind: "item-deleted", item: { ...PLINTH, tierId: "t" } }],
    [{ kind: "item-deleted", item: { kind: "accessory", tierId: "t" } }],
    [{ kind: "item-deleted", item: { kind: "hardware", accessoryId: "a" } }],
  ])("refuses %j for a member the item does not name", (declared) => {
    expect(readAny(declared)).toEqual({ kind: "extra-member" });
  });

  it.each([
    [{ kind: "hardware-tier-created" }],
    [{ kind: "hardware-tier-created", tierId: 7 }],
    [{ kind: "hardware-tier-created", tierId: "" }],
    [{ kind: "accessory-created", accessoryId: null }],
    [{ kind: "created-row-text", item: TIER }],
    [{ kind: "created-row-text", field: "name" }],
    [{ kind: "created-row-text", item: TIER, field: 3 }],
    [{ kind: "created-row-text", item: "hardware.economic", field: "name" }],
    [{ kind: "created-row-text", item: [TIER], field: "name" }],
    [{ kind: "item-deleted" }],
    [{ kind: "item-deleted", item: null }],
    [{ kind: "item-deleted", item: { kind: "hardware" } }],
    [{ kind: "item-deleted", item: { kind: "hardware", tierId: 4 } }],
    [{ kind: "item-deleted", item: { kind: "unknown", tierId: "t" } }],
  ])("reads %j as an address of no kind", (declared) => {
    expect(readAny(declared)).toEqual({ kind: "unknown" });
  });

  it("takes a hardware class or an accessory as the owner of words, and no other item", () => {
    const words = (item: unknown) =>
      readAny({ kind: "created-row-text", item, field: "name" });

    expect(words(TIER).kind).toBe("address");
    expect(words(PLINTH).kind).toBe("address");
    expect(words(VENEER)).toEqual({ kind: "unknown" });
    expect(words({ kind: "finish", finishId: "oak" })).toEqual({
      kind: "unknown",
    });
  });

  it("takes a finish or a handle as nothing to delete", () => {
    const deletion = (item: unknown) => readAny({ kind: "item-deleted", item });

    expect(deletion({ kind: "finish", finishId: "oak" })).toEqual({
      kind: "unknown",
    });
    expect(deletion({ kind: "handle", handle: "bar" })).toEqual({
      kind: "unknown",
    });
  });
});

describe("the field an address names", () => {
  it.each([
    ["a cabinet", { kind: "cabinet", ruleId: "r" }],
    ["a class", { kind: "hardware", tierId: "hardware.economic" }],
    ["a material", { kind: "material", tierId: "material.veneer" }],
    ["an accessory", { kind: "accessory", accessoryId: "plinth-light" }],
  ])(
    "reads a word outside the closed list of %s as an address of no kind",
    (_name, address) => {
      for (const field of [
        "bogus",
        "\u202Ename",
        "na\u0007me",
        "f".repeat(64),
      ]) {
        expect(readAny({ ...address, field })).toEqual({ kind: "unknown" });
      }
    },
  );

  it("reads a word outside the closed list of a created row's words as an address of no kind", () => {
    for (const field of ["bogus", "\u202Ename", "na\u0007me", "f".repeat(64)]) {
      const declared = { kind: "created-row-text", item: TIER, field };

      expect(readAny(declared)).toEqual({ kind: "unknown" });
    }
  });

  it("takes each word of a created row's closed list", () => {
    for (const field of ["name", "description"]) {
      const declared = { kind: "created-row-text", item: TIER, field };
      expect(readAny(declared)).toEqual({ kind: "address", address: declared });
    }
  });
});

describe("the kinds the caller takes", () => {
  const TAKEN: readonly BookFieldAddressKind[] = [
    "hardware",
    "created-row-text",
  ];

  it("answers a kind some address has and the caller did not take before it reads a member", () => {
    const garbled = { kind: "item-deleted", item: 7, anything: [] };

    expect(readDraftAddress(garbled, TAKEN)).toEqual({ kind: "not-accepted" });
  });

  it("still reads a kind the caller took", () => {
    const declared = { kind: "created-row-text", item: TIER, field: "name" };

    expect(readDraftAddress(declared, TAKEN)).toEqual({
      kind: "address",
      address: declared,
    });
  });

  it("answers a kind no address has as unknown, not as one not taken", () => {
    expect(readDraftAddress({ kind: "nothing" }, TAKEN)).toEqual({
      kind: "unknown",
    });
    expect(readDraftAddress("hardware", TAKEN)).toEqual({ kind: "unknown" });
    expect(readDraftAddress(null, TAKEN)).toEqual({ kind: "unknown" });
  });
});

describe("the kinds that existed before", () => {
  it.each([
    [{ kind: "cabinet", ruleId: "base-3drawer", field: "anchorMinor" }],
    [{ kind: "cabinet-size", ruleId: "base-3drawer", widthMm: 600 }],
    [{ kind: "hardware", tierId: "hardware.economic", field: "perLiftMinor" }],
    [
      {
        kind: "material",
        tierId: "material.veneer",
        field: "percentOfCabinets",
      },
    ],
    [{ kind: "accessory", accessoryId: "plinth-light", field: "perUnitMinor" }],
    [{ kind: "depth-rule" }],
    [{ kind: "provisional" }],
  ])("still reads %j", (declared) => {
    expect(readAny(declared)).toEqual({ kind: "address", address: declared });
  });

  it("still refuses a width that is not a finite number", () => {
    const declared = { kind: "cabinet-size", ruleId: "r", widthMm: Infinity };

    expect(readAny(declared)).toEqual({ kind: "unknown" });
  });
});
