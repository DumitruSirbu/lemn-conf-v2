// What the staff kitchen page reads of the stored sent lines and of the client's postal address (ADR 0185 decision 4,
// decision 7; W6d-1b, W6d-4): the lines are checked entry by entry and an unreadable entry is left out, never read as a
// zero; the address is the detail's alone, and a list row never carries one.
import {
  MAX_IDENTIFIER_LENGTH,
  MAX_PLACEMENTS,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  sentCabinetLinesOfAnswer,
  staffKitchenListFrom,
} from "@/staff/staff-kitchens-wire-reading";
import { staffKitchenFrom } from "@/staff/use-staff-kitchen";

import { wireKitchen } from "../support/staff-kitchen-wire";
import { wireList, wireRow } from "../support/staff-kitchens-wire";

function linesOf(body: unknown): unknown {
  return staffKitchenFrom(wireKitchen({ sentCabinetLines: body }))
    ?.sentCabinetLines;
}

describe("the stored cabinet lines of a kitchen's answer", () => {
  it("are read pair by pair, in the order they came", () => {
    expect(
      linesOf([
        { placementId: "base-1", amountMinor: 150_000 },
        { placementId: "wall-1", amountMinor: 0 },
      ]),
    ).toEqual([
      { placementId: "base-1", amountMinor: 150_000 },
      { placementId: "wall-1", amountMinor: 0 },
    ]);
  });

  it.each([
    [
      "an id longer than the identifier bound",
      { placementId: "x".repeat(MAX_IDENTIFIER_LENGTH + 1), amountMinor: 1 },
    ],
    ["a numeric id", { placementId: 7, amountMinor: 1 }],
    ["a null id", { placementId: null, amountMinor: 1 }],
    ["a string amount", { placementId: "a", amountMinor: "500" }],
    ["a fractional amount", { placementId: "a", amountMinor: 1.5 }],
    [
      "an amount past the safe integers",
      { placementId: "a", amountMinor: 2 ** 53 },
    ],
    ["a negative amount", { placementId: "a", amountMinor: -1 }],
    ["a null amount", { placementId: "a", amountMinor: null }],
    ["a pair with no amount", { placementId: "a" }],
    ["a scalar", "a"],
    ["a null", null],
    ["a nested array", [{ placementId: "a", amountMinor: 1 }]],
  ])("leave out %s and keep the pair beside it", (_label, unreadable) => {
    expect(
      linesOf([unreadable, { placementId: "kept", amountMinor: 3 }]),
    ).toEqual([{ placementId: "kept", amountMinor: 3 }]);
  });

  it("keep an id of exactly the identifier bound", () => {
    const id = "x".repeat(MAX_IDENTIFIER_LENGTH);

    expect(linesOf([{ placementId: id, amountMinor: 1 }])).toEqual([
      { placementId: id, amountMinor: 1 },
    ]);
  });

  it("read at most MAX_PLACEMENTS entries, the first ones", () => {
    const entries = Array.from({ length: MAX_PLACEMENTS + 3 }, (_, index) => ({
      placementId: `p${String(index)}`,
      amountMinor: index,
    }));

    const lines = sentCabinetLinesOfAnswer(entries);

    expect(lines).toHaveLength(MAX_PLACEMENTS);
    expect(lines?.at(-1)).toEqual({
      placementId: `p${String(MAX_PLACEMENTS - 1)}`,
      amountMinor: MAX_PLACEMENTS - 1,
    });
  });

  it("read only an entry's own members, so an inherited one is not an id", () => {
    const inherited = Object.create({
      placementId: "inherited",
      amountMinor: 1,
    }) as object;

    expect(sentCabinetLinesOfAnswer([inherited])).toEqual([]);
  });

  it("carry an id such as __proto__ as a plain string, changing no other line and no prototype", () => {
    const body = JSON.parse(
      '[{"placementId":"__proto__","amountMinor":1},{"placementId":"constructor","amountMinor":2},{"placementId":"base-1","amountMinor":3}]',
    ) as unknown;

    expect(sentCabinetLinesOfAnswer(body)).toEqual([
      { placementId: "__proto__", amountMinor: 1 },
      { placementId: "constructor", amountMinor: 2 },
      { placementId: "base-1", amountMinor: 3 },
    ]);
    expect(Object.prototype).not.toHaveProperty("placementId");
  });

  it("copy the two members of a pair and no other the server sent", () => {
    const lines = sentCabinetLinesOfAnswer([
      { placementId: "a", amountMinor: 1, label: "extra", suppliedBy: "x" },
    ]);

    expect(lines?.map((line) => Object.keys(line))).toEqual([
      ["placementId", "amountMinor"],
    ]);
  });

  it.each([
    ["a missing member", undefined],
    ["a string", "[]"],
    ["an object", { placementId: "a", amountMinor: 1 }],
    ["a null", null],
  ])(
    "make the whole answer unreadable when the member is %s",
    (_label, body) => {
      expect(
        staffKitchenFrom(wireKitchen({ sentCabinetLines: body })),
      ).toBeUndefined();
    },
  );
});

describe("the client's postal address in a kitchen's answer", () => {
  function clientOf(address: unknown): unknown {
    return staffKitchenFrom(
      wireKitchen({
        client: { email: "ana@mail.md", name: "Ana", phone: null, address },
      }),
    )?.client;
  }

  it("is read exactly as sent, text or null", () => {
    expect(clientOf("Strada Florilor 4, ap. 2")).toEqual({
      email: "ana@mail.md",
      name: "Ana",
      phone: null,
      address: "Strada Florilor 4, ap. 2",
    });
    expect(clientOf(null)).toMatchObject({ address: null });
  });

  it.each([
    ["a number", 4],
    ["an object", { street: "x" }],
    ["a missing member", undefined],
  ])("makes the whole answer unreadable when it is %s", (_label, address) => {
    expect(clientOf(address)).toBeUndefined();
  });

  it("is not read from a list row, whatever the row carries", () => {
    const list = staffKitchenListFrom(
      wireList([
        wireRow(1, {
          client: {
            email: "ana@mail.md",
            name: "Ana",
            phone: null,
            address: "Strada Secreta 1",
          },
        }),
      ]),
    );

    expect(list?.kitchens[0]?.client).toEqual({
      email: "ana@mail.md",
      name: "Ana",
      phone: null,
    });
    expect(JSON.stringify(list)).not.toContain("Strada Secreta 1");
  });
});
