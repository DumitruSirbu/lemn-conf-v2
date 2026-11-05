import { describe, expect, it } from "vitest";

import { readStoredDraft } from "@/lib/server/price-dashboard/stored-draft";

const TIER = { kind: "hardware", tierId: "hardware.economic" } as const;
const PLINTH = { kind: "accessory", accessoryId: "plinth-light" } as const;

const TIER_CREATION = {
  address: { kind: "hardware-tier-created", tierId: "hardware.economic" },
  value: { name: "GTV Economic", description: "Mecanisme simple" },
};
const ACCESSORY_CREATION = {
  address: { kind: "accessory-created", accessoryId: "plinth-light" },
  value: {
    linkedBuildId: "base-3drawer",
    perUnitMinor: 1_000,
    name: "Soclu luminos",
    description: "Cu LED",
  },
};
const RENAME = {
  address: { kind: "created-row-text", item: TIER, field: "name" },
  value: "GTV Premium",
};
const DELETION = {
  address: { kind: "item-deleted", item: { kind: "material", tierId: "m" } },
  value: true,
};

function changesOf(stored: unknown) {
  const reading = readStoredDraft(stored);
  if (!reading.ok) throw new Error("the draft was unreadable");
  return reading.changes;
}

describe("the values of the structural kinds", () => {
  it("reads a creation's object, a rename's string and a deletion's flag", () => {
    const stored = [TIER_CREATION, ACCESSORY_CREATION, RENAME, DELETION];

    expect(changesOf(stored)).toEqual(stored);
  });

  it("reads a created accessory with no description", () => {
    const { linkedBuildId, perUnitMinor, name } = ACCESSORY_CREATION.value;
    const value = { linkedBuildId, perUnitMinor, name };
    const stored = [{ ...ACCESSORY_CREATION, value }];

    expect(changesOf(stored)).toEqual(stored);
  });

  it("reads a draft that holds a deletion, which a route does not yet take, rather than calling it unreadable", () => {
    expect(readStoredDraft([DELETION])).toEqual({
      ok: true,
      changes: [DELETION],
    });
  });

  it("rebuilds a creation's object, so it shares nothing with the stored one", () => {
    const [read] = changesOf([TIER_CREATION]);

    expect(read?.value).toEqual(TIER_CREATION.value);
    expect(read?.value).not.toBe(TIER_CREATION.value);
  });

  it.each([
    ["a tier creation that is a string", "hardware-tier-created", "GTV"],
    ["a tier creation that is a list", "hardware-tier-created", ["GTV", ""]],
    ["a tier creation that is null", "hardware-tier-created", null],
    [
      "a tier creation without a description",
      "hardware-tier-created",
      { name: "GTV" },
    ],
    [
      "a tier creation with a numeric name",
      "hardware-tier-created",
      { name: 4, description: "" },
    ],
    [
      "a tier creation with a member it does not name",
      "hardware-tier-created",
      { name: "GTV", description: "", rates: 1 },
    ],
    [
      "an accessory creation with a text price",
      "accessory-created",
      { ...ACCESSORY_CREATION.value, perUnitMinor: "1000" },
    ],
    [
      "an accessory creation without a link",
      "accessory-created",
      { perUnitMinor: 1, name: "n" },
    ],
    [
      "an accessory creation with a numeric description",
      "accessory-created",
      { ...ACCESSORY_CREATION.value, description: 3 },
    ],
    [
      "an accessory creation with a member it does not name",
      "accessory-created",
      { ...ACCESSORY_CREATION.value, id: "x" },
    ],
  ])("makes the draft unreadable for %s", (_name, kind, value) => {
    const address =
      kind === "accessory-created"
        ? ACCESSORY_CREATION.address
        : TIER_CREATION.address;

    expect(readStoredDraft([{ address, value }])).toEqual({ ok: false });
  });

  it.each([
    ["a rename that is a number", RENAME.address, 7],
    ["a rename that is null", RENAME.address, null],
    ["a rename that is an object", RENAME.address, { text: "x" }],
    ["a deletion that is false", DELETION.address, false],
    ["a deletion that is the text true", DELETION.address, "true"],
    ["a deletion without a value", DELETION.address, undefined],
    ["a price that is text", { kind: "depth-rule" }, "600"],
    ["a price that is an object", { kind: "depth-rule" }, { name: "n" }],
  ])("makes the draft unreadable for %s", (_name, address, value) => {
    expect(readStoredDraft([{ address, value }])).toEqual({ ok: false });
  });

  it("makes the draft unreadable when one change of several is wrong, never serving a part of it", () => {
    const stored = [TIER_CREATION, { ...RENAME, value: 7 }];

    expect(readStoredDraft(stored)).toEqual({ ok: false });
  });

  it("makes the draft unreadable for a creation whose address has a member missing or extra", () => {
    const value = TIER_CREATION.value;

    expect(
      readStoredDraft([{ address: { kind: "hardware-tier-created" }, value }]),
    ).toEqual({ ok: false });
    expect(
      readStoredDraft([
        {
          address: { ...TIER_CREATION.address, extra: 1 },
          value,
        },
      ]),
    ).toEqual({ ok: false });
  });
});

describe("what a stored draft read before still is", () => {
  it("reads a price and a flag", () => {
    const stored = [
      { address: { kind: "depth-rule" }, value: 5 },
      { address: { kind: "provisional" }, value: true },
    ];

    expect(changesOf(stored)).toEqual(stored);
  });

  it("keeps a group and its bulk together, and refuses one without the other", () => {
    const grouped = {
      address: { kind: "cabinet", ruleId: "r", field: "anchorMinor" },
      value: 100,
      groupId: "g",
      bulk: { percent: 10, scope: "all" },
    };

    expect(changesOf([grouped])).toEqual([grouped]);
    expect(readStoredDraft([{ ...grouped, bulk: undefined }])).toEqual({
      ok: false,
    });
  });

  it("refuses a draft that is not a list", () => {
    expect(readStoredDraft({})).toEqual({ ok: false });
    expect(readStoredDraft(null)).toEqual({ ok: false });
  });

  it("reads a rename of an accessory", () => {
    const stored = [
      {
        address: {
          kind: "created-row-text",
          item: PLINTH,
          field: "description",
        },
        value: "",
      },
    ];

    expect(changesOf(stored)).toEqual(stored);
  });
});
