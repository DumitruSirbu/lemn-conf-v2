import { describe, expect, it } from "vitest";

import {
  readDraftChangeRequest,
  readRevertRequest,
} from "@/lib/server/price-dashboard/draft-requests";

const TIER = { kind: "hardware", tierId: "hardware.economic" } as const;
const REVISION = "3";

const CREATION = { kind: "hardware-tier-created", tierId: "hardware.economic" };
const ACCESSORY_CREATION = { kind: "accessory-created", accessoryId: "a-1" };
const RENAME = { kind: "created-row-text", item: TIER, field: "name" };
const DELETION = { kind: "item-deleted", item: TIER };

const NOT_EDITABLE = {
  ok: false,
  refusal: {
    kind: "issues",
    issues: [{ field: "address", code: "NOT_EDITABLE" }],
  },
};
const MALFORMED = { ok: false, refusal: { kind: "malformed" } };

function change(address: unknown, value: unknown = "GTV Premium"): string {
  return JSON.stringify({
    expectedDraftRevision: REVISION,
    change: { address, value },
  });
}

function revert(address: unknown): string {
  return JSON.stringify({
    expectedDraftRevision: REVISION,
    target: { kind: "change", address },
  });
}

describe("the change route and the words of a created row", () => {
  it("takes a rename and carries its value as sent, for applyChanges to judge", () => {
    expect(readDraftChangeRequest(change(RENAME, "GTV Premium"))).toEqual({
      ok: true,
      value: {
        expectedDraftRevision: REVISION,
        address: RENAME,
        value: "GTV Premium",
      },
    });
  });

  it("takes a rename whose value is not text, since the domain is the judge of it", () => {
    const reading = readDraftChangeRequest(change(RENAME, 12));

    expect(reading).toMatchObject({ ok: true, value: { value: 12 } });
  });

  it("refuses a rename that names a member the address does not", () => {
    const reading = readDraftChangeRequest(change({ ...RENAME, extra: 1 }));

    expect(reading).toEqual(MALFORMED);
  });

  it("refuses a rename of an item that cannot have words as an unknown address", () => {
    const address = { ...RENAME, item: { kind: "material", tierId: "m" } };

    expect(readDraftChangeRequest(change(address))).toEqual({
      ok: false,
      refusal: {
        kind: "issues",
        issues: [{ field: "address", code: "UNKNOWN_ADDRESS" }],
      },
    });
  });
});

describe("the change route's named refusals", () => {
  it.each([
    ["a hardware class creation", CREATION],
    ["an accessory creation", ACCESSORY_CREATION],
    ["a deletion", DELETION],
  ])("refuses %s as NOT_EDITABLE", (_name, address) => {
    expect(readDraftChangeRequest(change(address, true))).toEqual(NOT_EDITABLE);
  });

  it("refuses a kind it does not take before reading any member of it", () => {
    const garbled = { kind: "item-deleted", item: 7, extra: [] };

    expect(readDraftChangeRequest(change(garbled, true))).toEqual(NOT_EDITABLE);
  });
});

describe("the revert route and the structural kinds", () => {
  it.each([
    ["a hardware class creation", CREATION],
    ["an accessory creation", ACCESSORY_CREATION],
    ["the words of a created row", RENAME],
  ])("takes %s as a target", (_name, address) => {
    expect(readRevertRequest(revert(address))).toEqual({
      ok: true,
      value: {
        expectedDraftRevision: REVISION,
        target: { kind: "change", address },
      },
    });
  });

  it("refuses a deletion as NOT_EDITABLE, even when its members are wrong", () => {
    expect(readRevertRequest(revert(DELETION))).toEqual(NOT_EDITABLE);
    expect(
      readRevertRequest(revert({ kind: "item-deleted", item: null })),
    ).toEqual(NOT_EDITABLE);
  });

  it("refuses a creation that names a member the address does not", () => {
    const reading = readRevertRequest(revert({ ...CREATION, name: "x" }));

    expect(reading).toEqual(MALFORMED);
  });

  it("refuses a creation with no id as an unknown address", () => {
    expect(
      readRevertRequest(revert({ kind: "hardware-tier-created" })),
    ).toEqual({
      ok: false,
      refusal: {
        kind: "issues",
        issues: [{ field: "address", code: "UNKNOWN_ADDRESS" }],
      },
    });
  });

  it("still takes a price as a target", () => {
    const price = { kind: "depth-rule" };

    expect(readRevertRequest(revert(price))).toMatchObject({ ok: true });
  });
});
