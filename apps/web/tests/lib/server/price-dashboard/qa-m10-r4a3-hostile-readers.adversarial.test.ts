import { describe, expect, it } from "vitest";

import {
  BOOK_FIELD_ADDRESS_KINDS,
  MAX_IDENTIFIER_LENGTH,
  SAMPLE_PRICE_BOOK,
  applyChanges,
} from "@lemnaria/configurator-domain";

import { readDraftAddress } from "@/lib/server/price-dashboard/draft-address";
import {
  readDraftChangeRequest,
  readRevertRequest,
} from "@/lib/server/price-dashboard/draft-requests";
import { readStoredDraft } from "@/lib/server/price-dashboard/stored-draft";

const TIER = { kind: "hardware", tierId: "hardware.economic" };
const PLINTH = { kind: "accessory", accessoryId: "plinth-light" };
const REVISION = "1";

const TIER_CREATION = {
  address: { kind: "hardware-tier-created", tierId: "hardware.economic" },
  value: { name: "GTV Economic", description: "" },
};
const ACCESSORY_CREATION = {
  address: { kind: "accessory-created", accessoryId: "plinth-light" },
  value: { linkedBuildId: "base-3drawer", perUnitMinor: 1_000, name: "Soclu" },
};
const RENAME = {
  address: { kind: "created-row-text", item: TIER, field: "name" },
  value: "GTV Max",
};
const DELETION = {
  address: { kind: "item-deleted", item: TIER },
  value: true,
};

/** Text parsed as JSON, so `__proto__` is an own member as a database row or a request body would hold it. */
function parsed(text: string): unknown {
  return JSON.parse(text) as unknown;
}

function isUnreadable(stored: unknown): boolean {
  return !readStoredDraft(stored).ok;
}

describe("a stored draft with a structural kind and a value of another kind", () => {
  it.each([
    ["a creation address with a flag", { ...TIER_CREATION, value: true }],
    ["a creation address with text", { ...TIER_CREATION, value: "GTV" }],
    ["a creation address with a number", { ...TIER_CREATION, value: 5 }],
    ["a creation address with a null", { ...TIER_CREATION, value: null }],
    ["a creation address with a list", { ...TIER_CREATION, value: [] }],
    ["a creation address with no value", { address: TIER_CREATION.address }],
    [
      "an accessory creation with a flag",
      { ...ACCESSORY_CREATION, value: true },
    ],
    [
      "a rename with a creation's object",
      { ...RENAME, value: TIER_CREATION.value },
    ],
    ["a rename with a number", { ...RENAME, value: 5 }],
    ["a rename with a flag", { ...RENAME, value: true }],
    ["a rename with a null", { ...RENAME, value: null }],
    ["a rename with a list of text", { ...RENAME, value: ["GTV"] }],
    ["a deletion with false", { ...DELETION, value: false }],
    ["a deletion with the text true", { ...DELETION, value: "true" }],
    ["a deletion with 1", { ...DELETION, value: 1 }],
    ["a deletion with a null", { ...DELETION, value: null }],
    ["a deletion with an object", { ...DELETION, value: { name: "x" } }],
    [
      "a price with a creation's object",
      {
        address: { kind: "depth-rule" },
        value: TIER_CREATION.value,
      },
    ],
    ["a price with text", { address: { kind: "depth-rule" }, value: "5" }],
    [
      "a provisional switch with a null",
      {
        address: { kind: "provisional" },
        value: null,
      },
    ],
  ])("is unreadable whole: %s", (_name, change) => {
    expect(isUnreadable([change])).toBe(true);
    expect(isUnreadable([TIER_CREATION, change])).toBe(true);
  });

  it("is unreadable whole when one hostile change follows readable ones, whichever the kind", () => {
    const readable = [TIER_CREATION, ACCESSORY_CREATION, RENAME, DELETION];
    for (const hostile of [
      { ...TIER_CREATION, value: 1 },
      { ...RENAME, value: 1 },
      { ...DELETION, value: false },
    ]) {
      expect(isUnreadable([...readable, hostile])).toBe(true);
    }
  });
});

describe("a stored creation's object", () => {
  const withValue = (value: unknown) => [{ ...TIER_CREATION, value }];
  const accessoryWith = (value: unknown) => [{ ...ACCESSORY_CREATION, value }];

  it.each([
    ["no name", { description: "" }],
    ["no description", { name: "GTV" }],
    ["a numeric name", { name: 5, description: "" }],
    ["a null description", { name: "GTV", description: null }],
    ["a member it does not name", { name: "GTV", description: "", extra: 1 }],
    [
      "a nameKey, which a created row never carries",
      {
        name: "GTV",
        description: "",
        nameKey: "catalogue.x",
      },
    ],
    ["a ruleId", { name: "GTV", description: "", ruleId: "r" }],
    ["a tierId", { name: "GTV", description: "", tierId: "other" }],
    [
      "an own __proto__ member",
      parsed('{"name":"GTV","description":"","__proto__":{"x":1}}'),
    ],
  ])("refuses a class with %s", (_name, value) => {
    expect(isUnreadable(withValue(value))).toBe(true);
  });

  it.each([
    ["no link", { perUnitMinor: 1, name: "S" }],
    ["no price", { linkedBuildId: "b", name: "S" }],
    ["a text price", { linkedBuildId: "b", perUnitMinor: "1", name: "S" }],
    ["a null link", { linkedBuildId: null, perUnitMinor: 1, name: "S" }],
    [
      "a null description",
      {
        linkedBuildId: "b",
        perUnitMinor: 1,
        name: "S",
        description: null,
      },
    ],
    [
      "a numeric description",
      {
        linkedBuildId: "b",
        perUnitMinor: 1,
        name: "S",
        description: 4,
      },
    ],
    [
      "an extra member",
      {
        linkedBuildId: "b",
        perUnitMinor: 1,
        name: "S",
        accessoryId: "other",
      },
    ],
    [
      "an own __proto__ member",
      parsed(
        '{"linkedBuildId":"b","perUnitMinor":1,"name":"S","__proto__":{"x":1}}',
      ),
    ],
  ])("refuses an accessory with %s", (_name, value) => {
    expect(isUnreadable(accessoryWith(value))).toBe(true);
  });

  it("drops an extra top-level member of the change, so it never reaches what is served", () => {
    const reading = readStoredDraft([
      { ...TIER_CREATION, injected: { evil: true }, nameKey: "x" },
    ]);

    expect(reading).toEqual({ ok: true, changes: [TIER_CREATION] });
  });

  it("drops an own __proto__ member of the change, and the draft's prototype stays untouched", () => {
    const hostile = parsed(
      `{"address":${JSON.stringify(TIER_CREATION.address)},"value":${JSON.stringify(TIER_CREATION.value)},"__proto__":{"polluted":true}}`,
    );

    const reading = readStoredDraft([hostile]);

    expect(reading).toEqual({ ok: true, changes: [TIER_CREATION] });
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
    if (reading.ok) {
      expect(Object.keys(reading.changes[0] ?? {})).toEqual([
        "address",
        "value",
      ]);
    }
  });

  it("never lets a creation that carries a group and a bulk stand: it is unreadable, or the candidate refuses it", () => {
    const grouped = {
      ...TIER_CREATION,
      groupId: "g1",
      bulk: { percent: 5, scope: "all" },
    };

    const reading = readStoredDraft([grouped]);

    const isRefused =
      !reading.ok || !applyChanges(SAMPLE_PRICE_BOOK, reading.changes).ok;
    expect(isRefused).toBe(true);
  });
});

describe("a stored address of the structural kinds", () => {
  const withAddress = (address: unknown, value: unknown = "x") => [
    { address, value },
  ];

  it.each([
    [
      "an item of a kind that has no words",
      {
        kind: "created-row-text",
        item: { kind: "material", tierId: "m" },
        field: "name",
      },
    ],
    [
      "a finish as the owner of words",
      {
        kind: "created-row-text",
        item: { kind: "finish", id: "f" },
        field: "name",
      },
    ],
    [
      "an item with the other kind's id member",
      {
        kind: "created-row-text",
        item: { kind: "hardware", accessoryId: "a" },
        field: "name",
      },
    ],
    [
      "an item with both id members",
      {
        kind: "created-row-text",
        item: { kind: "hardware", tierId: "t", accessoryId: "a" },
        field: "name",
      },
    ],
    [
      "an item that is a string",
      { kind: "created-row-text", item: "hardware.economic", field: "name" },
    ],
    [
      "an item that is a list",
      { kind: "created-row-text", item: [TIER], field: "name" },
    ],
    [
      "an item whose kind is __proto__",
      {
        kind: "created-row-text",
        item: { kind: "__proto__", tierId: "t" },
        field: "name",
      },
    ],
    [
      "an item whose kind is constructor",
      {
        kind: "created-row-text",
        item: { kind: "constructor", tierId: "t" },
        field: "name",
      },
    ],
    [
      "a text field that is a number",
      { kind: "created-row-text", item: TIER, field: 1 },
    ],
    ["no field", { kind: "created-row-text", item: TIER }],
    [
      "an extra member",
      { kind: "created-row-text", item: TIER, field: "name", extra: 1 },
    ],
    [
      "an empty id",
      {
        kind: "created-row-text",
        item: { kind: "hardware", tierId: "" },
        field: "name",
      },
    ],
    [
      "an id past the bound",
      {
        kind: "created-row-text",
        item: {
          kind: "hardware",
          tierId: "t".repeat(MAX_IDENTIFIER_LENGTH + 1),
        },
        field: "name",
      },
    ],
    [
      "a creation with an empty id",
      { kind: "hardware-tier-created", tierId: "" },
    ],
    [
      "a creation with a numeric id",
      { kind: "hardware-tier-created", tierId: 4 },
    ],
    [
      "a creation with the other kind's member",
      { kind: "hardware-tier-created", accessoryId: "a" },
    ],
    [
      "a creation with both members",
      { kind: "accessory-created", accessoryId: "a", tierId: "t" },
    ],
    ["a deletion with no item", { kind: "item-deleted" }],
    [
      "a deletion of a nested deletion",
      { kind: "item-deleted", item: { kind: "item-deleted", item: TIER } },
    ],
    [
      "a deletion whose item has an extra member",
      { kind: "item-deleted", item: { ...TIER, extra: 1 } },
    ],
    [
      "a deletion with an own __proto__ member",
      parsed(
        '{"kind":"item-deleted","item":{"kind":"hardware","tierId":"t"},"__proto__":{}}',
      ),
    ],
  ])("is unreadable whole: %s", (_name, address) => {
    expect(isUnreadable(withAddress(address, "x"))).toBe(true);
    expect(isUnreadable(withAddress(address, true))).toBe(true);
    expect(isUnreadable(withAddress(address, TIER_CREATION.value))).toBe(true);
  });

  it("reads an id of exactly the bound and not one unit more, for every structural kind", () => {
    const edge = "t".repeat(MAX_IDENTIFIER_LENGTH);
    const over = `${edge}t`;
    const addressesWith = (id: string) => [
      { kind: "hardware-tier-created", tierId: id },
      { kind: "accessory-created", accessoryId: id },
      {
        kind: "created-row-text",
        item: { kind: "hardware", tierId: id },
        field: "name",
      },
      {
        kind: "created-row-text",
        item: { kind: "accessory", accessoryId: id },
        field: "name",
      },
      { kind: "item-deleted", item: { kind: "material", tierId: id } },
    ];
    for (const address of addressesWith(edge)) {
      const reading = readDraftAddress(address, BOOK_FIELD_ADDRESS_KINDS);
      expect(reading.kind, JSON.stringify(address)).toBe("address");
    }
    for (const address of addressesWith(over)) {
      const reading = readDraftAddress(address, BOOK_FIELD_ADDRESS_KINDS);
      expect(reading.kind, JSON.stringify(address)).toBe("unknown");
    }
  });
});

describe("the request readers and the structural kinds", () => {
  function changeBody(change: unknown): string {
    return JSON.stringify({ expectedDraftRevision: REVISION, change });
  }

  function revertBody(target: unknown): string {
    return JSON.stringify({ expectedDraftRevision: REVISION, target });
  }

  const refusalOf = (
    reading: { ok: true } | { ok: false; refusal: unknown },
  ) => (reading.ok ? "accepted" : reading.refusal);

  it.each([
    ["a creation of a class", TIER_CREATION.address, TIER_CREATION.value],
    [
      "a creation of an accessory",
      ACCESSORY_CREATION.address,
      ACCESSORY_CREATION.value,
    ],
  ])(
    "keeps %s unreachable through the change reader, whatever it carries",
    (_name, address, value) => {
      for (const body of [
        changeBody({ address, value }),
        changeBody({ address, value: true }),
        changeBody({ address }),
        changeBody({ address: { ...address, extra: 1 }, value }),
      ]) {
        expect(refusalOf(readDraftChangeRequest(body))).not.toBe("accepted");
      }
    },
  );

  it("refuses a deletion on both readers, however the item is written", () => {
    const items = [
      TIER,
      PLINTH,
      { kind: "material", tierId: "m" },
      {},
      null,
      "x",
      [],
      { kind: "__proto__" },
    ];
    for (const item of items) {
      const address = { kind: "item-deleted", item };
      const viaChange = readDraftChangeRequest(
        changeBody({ address, value: true }),
      );
      const viaRevert = readRevertRequest(
        revertBody({ kind: "change", address }),
      );
      expect(refusalOf(viaChange)).toEqual(
        expect.objectContaining({ kind: "issues" }),
      );
      expect(refusalOf(viaRevert)).toEqual(
        expect.objectContaining({ kind: "issues" }),
      );
    }
  });

  it("takes a deletion for what its kind says, even when the kind is written with a prototype key beside it", () => {
    const body = `{"expectedDraftRevision":"1","change":{"address":{"kind":"item-deleted","__proto__":{"kind":"depth-rule"}},"value":true}}`;

    const reading = readDraftChangeRequest(body);

    expect(reading.ok).toBe(false);
  });

  it("reads a revert of each creation and of words, and keeps the address it read free of anything else", () => {
    const addresses = [
      TIER_CREATION.address,
      ACCESSORY_CREATION.address,
      RENAME.address,
    ];
    for (const address of addresses) {
      const reading = readRevertRequest(
        revertBody({ kind: "change", address }),
      );
      expect(reading.ok, JSON.stringify(address)).toBe(true);
      if (reading.ok && "target" in reading.value) {
        expect(reading.value.target).toEqual({ kind: "change", address });
      }
    }
  });

  it("keeps a revert's value out: a member beside the address is a request this route does not read", () => {
    const reading = readRevertRequest(
      revertBody({ kind: "change", address: TIER_CREATION.address, value: 1 }),
    );

    expect(refusalOf(reading)).toEqual({ kind: "malformed" });
  });
});
