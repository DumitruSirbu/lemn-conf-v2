import { describe, expect, it } from "vitest";

import {
  readCreateAccessoryRequest,
  readCreateHardwareClassRequest,
} from "@/lib/server/price-dashboard/draft-requests";

const REVISION = "3";
const CLASS_VALUE = { name: "GTV Economic", description: "" };
const RATES = { perHingeMinor: 100, perDrawerMinor: 200 };
const ACCESSORY_VALUE = {
  linkedBuildId: "base-3drawer",
  perUnitMinor: 1_000,
  name: "Soclu",
};

const MALFORMED = { ok: false, refusal: { kind: "malformed" } };
const MISSING_VALUE = {
  ok: false,
  refusal: {
    kind: "issues",
    issues: [{ field: "change", code: "MISSING_VALUE" }],
  },
};

function classBody(members: Record<string, unknown> = {}): string {
  return JSON.stringify({
    expectedDraftRevision: REVISION,
    value: CLASS_VALUE,
    rates: RATES,
    ...members,
  });
}

function accessoryBody(members: Record<string, unknown> = {}): string {
  return JSON.stringify({
    expectedDraftRevision: REVISION,
    value: ACCESSORY_VALUE,
    ...members,
  });
}

describe("the body of a hardware class creation", () => {
  it("is read as the revision, the value and the rates, all as sent for applyChanges to judge", () => {
    expect(readCreateHardwareClassRequest(classBody())).toEqual({
      ok: true,
      value: {
        expectedDraftRevision: REVISION,
        value: CLASS_VALUE,
        rates: RATES,
      },
    });
  });

  it.each([
    ["not JSON", "{"],
    ["a list", "[]"],
    ["a member the route does not take", classBody({ extra: 1 })],
    ["an id of the class", classBody({ tierId: "hardware.mine" })],
    ["an id named `id`", classBody({ id: "mine" })],
    ["an accessory's id", classBody({ accessoryId: "mine" })],
    ["a change in place of a value", classBody({ change: {} })],
    [
      "an id inside the value",
      classBody({ value: { ...CLASS_VALUE, tierId: "hardware.mine" } }),
    ],
    [
      "an `id` inside the value",
      classBody({ value: { ...CLASS_VALUE, id: "mine" } }),
    ],
    [
      "an accessory's id inside the value",
      classBody({ value: { ...CLASS_VALUE, accessoryId: "mine" } }),
    ],
    [
      "a rate that is no mechanism of a class",
      classBody({ rates: { perCoffeeMinor: 1 } }),
    ],
    [
      "a rate named like a prototype member",
      '{"expectedDraftRevision":"3","value":{},"rates":{"__proto__":1}}',
    ],
  ])("is not read when it holds %s", (_, text) => {
    expect(readCreateHardwareClassRequest(text)).toEqual(MALFORMED);
  });

  it.each([
    "ruleId",
    "nameKey",
    "descriptionKey",
    "address",
    "kind",
    "item",
    "finishId",
    "handle",
  ])("is not read when the value names a `%s`", (member) => {
    expect(
      readCreateHardwareClassRequest(
        classBody({ value: { ...CLASS_VALUE, [member]: "x" } }),
      ),
    ).toEqual(MALFORMED);
  });

  it.each([
    ["a value that is not an object", classBody({ value: "GTV" })],
    [
      "no value",
      JSON.stringify({ expectedDraftRevision: REVISION, rates: RATES }),
    ],
    ["rates that are not an object", classBody({ rates: [1, 2] })],
    [
      "no rates",
      JSON.stringify({ expectedDraftRevision: REVISION, value: CLASS_VALUE }),
    ],
  ])("is refused MISSING_VALUE for %s", (_, text) => {
    expect(readCreateHardwareClassRequest(text)).toEqual(MISSING_VALUE);
  });

  it.each([
    ["a revision that is a number", classBody({ expectedDraftRevision: 3 })],
    ["no revision", JSON.stringify({ value: CLASS_VALUE, rates: RATES })],
  ])("is refused for %s, naming the revision", (_, text) => {
    expect(readCreateHardwareClassRequest(text)).toMatchObject({
      ok: false,
      refusal: { kind: "issues", issues: [{ field: "expectedDraftRevision" }] },
    });
  });

  it("trims the name and the description, which the book holds trimmed, and changes nothing else of the value", () => {
    expect(
      readCreateHardwareClassRequest(
        classBody({
          value: {
            name: "  GTV Economic \n",
            description: "\tMecanisme  ",
            extra: " kept ",
          },
        }),
      ),
    ).toMatchObject({
      ok: true,
      value: {
        value: {
          name: "GTV Economic",
          description: "Mecanisme",
          extra: " kept ",
        },
      },
    });
  });

  it("leaves a name that is not text for applyChanges to refuse", () => {
    expect(
      readCreateHardwareClassRequest(
        classBody({ value: { name: 7, description: "" } }),
      ),
    ).toMatchObject({
      ok: true,
      value: { value: { name: 7, description: "" } },
    });
  });

  it("carries a rate's value as sent, a string included, and does not judge it", () => {
    expect(
      readCreateHardwareClassRequest(
        classBody({ rates: { perHingeMinor: "100" } }),
      ),
    ).toMatchObject({ ok: true, value: { rates: { perHingeMinor: "100" } } });
  });
});

describe("the body of an accessory creation", () => {
  it("is read as the revision and the value as sent", () => {
    expect(readCreateAccessoryRequest(accessoryBody())).toEqual({
      ok: true,
      value: { expectedDraftRevision: REVISION, value: ACCESSORY_VALUE },
    });
  });

  it.each([
    ["a member the route does not take", accessoryBody({ rates: RATES })],
    ["an id of the accessory", accessoryBody({ accessoryId: "mine" })],
    ["an `id`", accessoryBody({ id: "mine" })],
    [
      "an id inside the value",
      accessoryBody({ value: { ...ACCESSORY_VALUE, accessoryId: "mine" } }),
    ],
    [
      "a tier's id inside the value",
      accessoryBody({ value: { ...ACCESSORY_VALUE, tierId: "mine" } }),
    ],
  ])("is not read when it holds %s", (_, text) => {
    expect(readCreateAccessoryRequest(text)).toEqual(MALFORMED);
  });

  it("is refused MISSING_VALUE for a value that is not an object", () => {
    expect(readCreateAccessoryRequest(accessoryBody({ value: null }))).toEqual(
      MISSING_VALUE,
    );
  });

  it("trims the name and the description of an accessory too", () => {
    expect(
      readCreateAccessoryRequest(
        accessoryBody({
          value: {
            ...ACCESSORY_VALUE,
            name: " Soclu ",
            description: " Lumina ",
          },
        }),
      ),
    ).toMatchObject({
      ok: true,
      value: { value: { name: "Soclu", description: "Lumina" } },
    });
  });
});
