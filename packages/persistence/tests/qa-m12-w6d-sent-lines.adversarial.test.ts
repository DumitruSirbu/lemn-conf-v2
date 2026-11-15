import { fc, test } from "@fast-check/vitest";
import {
  MAX_IDENTIFIER_LENGTH,
  MAX_PLACEMENTS,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { FakeStaffKitchenReader } from "../src/fake-staff-kitchen-reader.js";
import {
  sentCabinetLinesFrom,
  type StaffKitchenSentCabinetLine,
} from "../src/staff-kitchen-reader.js";

/**
 * Adversarial QA of M12 wave W6d, the reader's reading of the stored cabinet lines (ADR 0185 decision 4, Security
 * read S5; plan W6d-1b), with no database. The implementer's tests carry `__proto__` as an id; none puts an inherited
 * member where the reader looks for an own one, so a reader that indexed an entry directly (`entry.placementId`) passed
 * them all. The fake is held to the shared reading entry by entry and over a swept range, because the live contract
 * runs the same cases against the database and the two must agree.
 */

const DESIGN_ID = "QA6dDesignIdZZZZZZZZZ";
const SENT_AT = new Date("2026-11-14T10:00:00.000Z");

async function readByFake(
  pricedLines: unknown,
): Promise<readonly StaffKitchenSentCabinetLine[]> {
  const reader = new FakeStaffKitchenReader();
  reader.plantKitchen({
    id: DESIGN_ID,
    name: null,
    design: null,
    accountId: null,
    sentAt: SENT_AT,
    updatedAt: SENT_AT,
    isHidden: false,
    isDeletedByClient: false,
  });
  reader.plantRequest({
    clientRequestId: "request-1",
    designId: DESIGN_ID,
    reference: "LM-0",
    createdAt: SENT_AT,
    pricedLines,
  });
  const reading = await reader.readOne(DESIGN_ID);
  if (reading.kind !== "found") throw new Error("not found");
  return reading.kitchen.sentCabinetLines;
}

describe("the shared reading of a stored line reads an entry's own members only", () => {
  it("does not take an id or an amount an entry inherits from its prototype", () => {
    const inheritsBoth = Object.create({
      placementId: "inherited",
      amountMinor: 5,
    }) as object;
    const inheritsId = Object.assign(
      Object.create({ placementId: "inherited" }) as object,
      { amountMinor: 5 },
    );
    const inheritsAmount = Object.assign(
      Object.create({ amountMinor: 5 }) as object,
      { placementId: "own" },
    );

    expect(
      sentCabinetLinesFrom([inheritsBoth, inheritsId, inheritsAmount]),
    ).toEqual([]);
  });

  it("is not moved by a polluted Object.prototype", () => {
    Object.defineProperty(Object.prototype, "placementId", {
      value: "polluted",
      configurable: true,
    });
    Object.defineProperty(Object.prototype, "amountMinor", {
      value: 9,
      configurable: true,
    });
    try {
      expect(sentCabinetLinesFrom([{}, { placementId: "own" }])).toEqual([]);
    } finally {
      Reflect.deleteProperty(Object.prototype, "placementId");
      Reflect.deleteProperty(Object.prototype, "amountMinor");
    }
  });

  it("reads an entry's own __proto__ member as data, and takes only the two members", () => {
    const entry = JSON.parse(
      '{"placementId":"a","amountMinor":1,"__proto__":{"placementId":"b"}}',
    ) as unknown;

    expect(sentCabinetLinesFrom([entry])).toEqual([
      { placementId: "a", amountMinor: 1 },
    ]);
  });
});

describe("the fake reader's reading of the same stored lines", () => {
  it("does not take a kind, an id or an amount an entry inherits", async () => {
    const proto = { kind: "cabinet", placementId: "inherited", amountMinor: 5 };
    const inheritsKind = Object.assign(
      Object.create({ kind: "cabinet" }) as object,
      {
        placementId: "own",
        amountMinor: 5,
      },
    );

    expect(
      await readByFake([
        Object.create(proto) as object,
        inheritsKind,
        { kind: "cabinet", placementId: "kept", amountMinor: 6 },
      ]),
    ).toEqual([{ placementId: "kept", amountMinor: 6 }]);
  });

  it("counts the bound after the lines of other kinds are set aside, not before", async () => {
    const others = Array.from({ length: MAX_PLACEMENTS }, (_, index) => ({
      kind: "depth",
      placementId: `d${String(index)}`,
      amountMinor: 1,
    }));
    const cabinets = Array.from({ length: MAX_PLACEMENTS + 2 }, (_, index) => ({
      kind: "cabinet",
      placementId: `c${String(index)}`,
      amountMinor: index,
    }));

    const lines = await readByFake([...others, ...cabinets]);

    expect(lines).toHaveLength(MAX_PLACEMENTS);
    expect(lines[0]?.placementId).toBe("c0");
  });

  it("does not hold the bound against a line the reader then drops: the bound is on what the statement returns", async () => {
    const unreadable = Array.from({ length: MAX_PLACEMENTS }, () => ({
      kind: "cabinet",
      placementId: "x".repeat(MAX_IDENTIFIER_LENGTH + 1),
      amountMinor: 1,
    }));

    const lines = await readByFake([
      ...unreadable,
      { kind: "cabinet", placementId: "after-the-bound", amountMinor: 2 },
    ]);

    // The statement would return the first MAX_PLACEMENTS cabinet lines, all dropped by the reader: nothing is shown.
    expect(lines).toEqual([]);
  });
});

describe("the readings over a swept range of stored entries", () => {
  const idArb = fc.oneof(
    fc.string({ maxLength: MAX_IDENTIFIER_LENGTH + 3 }),
    fc.constantFrom("__proto__", "constructor", "toString", "", "a b", "é"),
    fc.integer(),
    fc.constant(null),
    fc.constant(undefined),
    fc.array(fc.string(), { maxLength: 2 }),
  );
  const amountArb = fc.oneof(
    fc.integer({ min: -3, max: 1_000_000 }),
    fc.double({ noNaN: false }),
    fc.constantFrom(
      Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER + 1,
      -0,
      Infinity,
      -Infinity,
      NaN,
    ),
    fc.string({ maxLength: 4 }),
    fc.constant(null),
    fc.constant(undefined),
    fc.boolean(),
  );
  const kindArb = fc.constantFrom(
    "cabinet",
    "cabinet",
    "depth",
    "hardware",
    "Cabinet",
    " cabinet",
    undefined,
    5,
  );
  const entryArb = fc.oneof(
    fc.record(
      {
        kind: kindArb,
        placementId: idArb,
        amountMinor: amountArb,
        extra: fc.string(),
      },
      { requiredKeys: [] },
    ),
    fc.constantFrom<unknown>(null, 7, "cabinet", [], [1, 2]),
  );

  function isReadable(entry: unknown): entry is {
    placementId: string;
    amountMinor: number;
  } {
    if (typeof entry !== "object" || entry === null) return false;
    const { placementId, amountMinor } = entry as Record<string, unknown>;
    return (
      typeof placementId === "string" &&
      placementId.length <= MAX_IDENTIFIER_LENGTH &&
      typeof amountMinor === "number" &&
      Number.isSafeInteger(amountMinor) &&
      amountMinor >= 0
    );
  }

  test.prop([fc.array(entryArb, { maxLength: MAX_PLACEMENTS + 20 })], {
    numRuns: 400,
  })(
    "the shared reading keeps the readable entries of the first MAX_PLACEMENTS, in order, as bare pairs",
    (entries) => {
      const expected = entries
        .slice(0, MAX_PLACEMENTS)
        .filter(isReadable)
        .map(({ placementId, amountMinor }) => ({ placementId, amountMinor }));

      expect(sentCabinetLinesFrom(entries)).toEqual(expected);
    },
  );

  test.prop([fc.array(entryArb, { maxLength: MAX_PLACEMENTS + 20 })], {
    numRuns: 200,
  })(
    "the fake keeps the readable cabinet entries of the first MAX_PLACEMENTS cabinet entries, in order",
    async (entries) => {
      const cabinets = entries
        .filter(
          (entry) =>
            typeof entry === "object" &&
            entry !== null &&
            (entry as Record<string, unknown>)["kind"] === "cabinet",
        )
        .slice(0, MAX_PLACEMENTS);
      const expected = cabinets
        .filter(isReadable)
        .map(({ placementId, amountMinor }) => ({ placementId, amountMinor }));

      expect(await readByFake(entries)).toEqual(expected);
    },
  );

  it("leaves the lines of a kitchen with no request or a request with no snapshot empty", async () => {
    expect(await readByFake(undefined)).toEqual([]);
    expect(await readByFake([])).toEqual([]);
  });
});
