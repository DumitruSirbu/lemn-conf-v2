import { fc } from "@fast-check/vitest";
import {
  KITCHEN_NAME_MAX_LENGTH,
  judgeKitchenName,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  MAX_KITCHEN_NAME_CHARACTERS,
  MAX_KITCHEN_PAGE_SIZE,
  cursorTextOf,
  instantOfCursorText,
  isKitchenCursor,
  requireValidKitchenName,
  requireValidKitchenPageRequest,
} from "../src/account-kitchen-store.js";

const ACCOUNT_ID = "A".repeat(21);
const VALID_UPDATED_AT = "2026-10-19T09:30:00.123456Z";
const VALID_ID = "design-id_01";

function cursor(updatedAt: unknown, id: unknown): unknown {
  return { updatedAt, id };
}

describe("isKitchenCursor: a cursor this store could have issued", () => {
  it("accepts an instant in the database's text form and a design-id-shaped id", () => {
    expect(isKitchenCursor(cursor(VALID_UPDATED_AT, VALID_ID))).toBe(true);
  });

  it("accepts the ids the store itself mints (nanoid, 21 characters) and the 64-character bound", () => {
    expect(
      isKitchenCursor(cursor(VALID_UPDATED_AT, "V1StGXR8_Z5jdHi6B-myT")),
    ).toBe(true);
    expect(isKitchenCursor(cursor(VALID_UPDATED_AT, "a".repeat(64)))).toBe(
      true,
    );
  });

  it("refuses an id of 0 or 65 characters", () => {
    expect(isKitchenCursor(cursor(VALID_UPDATED_AT, ""))).toBe(false);
    expect(isKitchenCursor(cursor(VALID_UPDATED_AT, "a".repeat(65)))).toBe(
      false,
    );
  });

  it.each([
    ["a space", "a b"],
    ["a slash", "a/b"],
    ["a dot", "a.b"],
    ["a quote", "a'b"],
    ["a semicolon", "a;b"],
    ["a trailing newline", "abc\n"],
    ["a leading newline", "\nabc"],
    ["a non-ASCII letter", "abç"],
    ["an astral character", "ab\u{1F373}"],
    ["a NUL", "ab\u0000"],
  ])("refuses an id with %s", (_label, id) => {
    expect(isKitchenCursor(cursor(VALID_UPDATED_AT, id))).toBe(false);
  });

  describe("the instant must be the column's text: UTC, six fractional digits, a real calendar instant", () => {
    it.each([
      ["milliseconds only", "2026-10-19T09:30:00.123Z"],
      ["nine fractional digits", "2026-10-19T09:30:00.123456789Z"],
      ["no fractional part", "2026-10-19T09:30:00Z"],
      ["an offset in place of Z", "2026-10-19T09:30:00.123456+00:00"],
      ["a lower-case z", "2026-10-19T09:30:00.123456z"],
      ["a space for the T", "2026-10-19 09:30:00.123456Z"],
      ["a date alone", "2026-10-19"],
      ["a three-digit year", "999-10-19T09:30:00.123456Z"],
      ["a year zero", "0000-10-19T09:30:00.123456Z"],
      ["a five-digit year", "12026-10-19T09:30:00.123456Z"],
      ["month 13", "2026-13-19T09:30:00.123456Z"],
      ["month 00", "2026-00-19T09:30:00.123456Z"],
      ["day 00", "2026-10-00T09:30:00.123456Z"],
      ["day 32", "2026-10-32T09:30:00.123456Z"],
      [
        "31 February, which Date rolls into March",
        "2026-02-31T09:30:00.123456Z",
      ],
      ["29 February in a common year", "2025-02-29T09:30:00.123456Z"],
      ["31 April", "2026-04-31T09:30:00.123456Z"],
      ["hour 24", "2026-10-19T24:00:00.123456Z"],
      ["minute 60", "2026-10-19T09:60:00.123456Z"],
      ["second 60", "2026-10-19T09:30:60.123456Z"],
      ["a trailing newline", "2026-10-19T09:30:00.123456Z\n"],
      ["leading padding", " 2026-10-19T09:30:00.123456Z"],
      ["the empty string", ""],
    ])("refuses %s", (_label, updatedAt) => {
      expect(isKitchenCursor(cursor(updatedAt, VALID_ID))).toBe(false);
    });

    it.each([
      ["29 February in a leap year", "2024-02-29T23:59:59.999999Z"],
      ["the first microsecond of a year", "2026-01-01T00:00:00.000000Z"],
      ["the last microsecond of a year", "2026-12-31T23:59:59.999999Z"],
      ["31 December of a leap year", "2024-12-31T00:00:00.000001Z"],
    ])("accepts %s", (_label, updatedAt) => {
      expect(isKitchenCursor(cursor(updatedAt, VALID_ID))).toBe(true);
    });
  });

  describe("a value that is not a cursor", () => {
    it.each([
      ["undefined", undefined],
      ["null", null],
      ["a string", VALID_UPDATED_AT],
      ["a number", 12],
      ["an array", [VALID_UPDATED_AT, VALID_ID]],
      ["an empty object", {}],
      ["no id", { updatedAt: VALID_UPDATED_AT }],
      ["no instant", { id: VALID_ID }],
      ["a Date for the instant", cursor(new Date(0), VALID_ID)],
      ["a number for the instant", cursor(1_760_000_000_000, VALID_ID)],
      ["a number for the id", cursor(VALID_UPDATED_AT, 7)],
      ["null for the id", cursor(VALID_UPDATED_AT, null)],
    ])("%s", (_label, value) => {
      expect(isKitchenCursor(value)).toBe(false);
    });

    it("ignores members it does not know, which it does not copy", () => {
      expect(
        isKitchenCursor({
          ...(cursor(VALID_UPDATED_AT, VALID_ID) as object),
          extra: 1,
        }),
      ).toBe(true);
    });
  });
});

describe("the cursor's text and the display instant", () => {
  it("pads a Date's milliseconds to the column's microseconds", () => {
    expect(cursorTextOf(new Date("2026-10-19T09:30:00.123Z"))).toBe(
      "2026-10-19T09:30:00.123000Z",
    );
    expect(cursorTextOf(new Date("2026-10-19T09:30:00.000Z"))).toBe(
      "2026-10-19T09:30:00.000000Z",
    );
  });

  it("reads the display instant at milliseconds, truncating microseconds and never rounding up", () => {
    expect(
      instantOfCursorText("2026-10-19T09:30:00.123999Z").toISOString(),
    ).toBe("2026-10-19T09:30:00.123Z");
    expect(
      instantOfCursorText("2026-10-19T09:30:00.999999Z").toISOString(),
    ).toBe("2026-10-19T09:30:00.999Z");
  });

  it("round-trips any Date through the cursor text, and the text is always a valid cursor instant", () => {
    fc.assert(
      fc.property(
        fc.date({
          min: new Date("1000-01-01T00:00:00Z"),
          max: new Date("9999-12-31T23:59:59.999Z"),
          noInvalidDate: true,
        }),
        (instant) => {
          const text = cursorTextOf(instant);

          expect(isKitchenCursor(cursor(text, VALID_ID))).toBe(true);
          expect(instantOfCursorText(text).getTime()).toBe(instant.getTime());
        },
      ),
      { numRuns: 1000 },
    );
  });
});

describe("requireValidKitchenPageRequest", () => {
  const validRequest = { accountId: ACCOUNT_ID, limit: 12 };

  it("accepts every page size from 1 to 50", () => {
    for (let limit = 1; limit <= MAX_KITCHEN_PAGE_SIZE; limit += 1) {
      expect(() => {
        requireValidKitchenPageRequest({ ...validRequest, limit });
      }).not.toThrow();
    }
  });

  it.each([
    0,
    -1,
    51,
    1000,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])("refuses the page size %s", (limit) => {
    expect(() => {
      requireValidKitchenPageRequest({ ...validRequest, limit });
    }).toThrow(/page holds 1 to 50/);
  });

  it("refuses a page size that is text", () => {
    expect(() => {
      requireValidKitchenPageRequest({
        ...validRequest,
        limit: "5" as unknown as number,
      });
    }).toThrow();
  });

  it.each([
    "",
    "short",
    "a".repeat(20),
    "a".repeat(22),
    `${"a".repeat(20)}.`,
    `${"a".repeat(20)}\n`,
  ])("refuses the account id %j", (accountId) => {
    expect(() => {
      requireValidKitchenPageRequest({ ...validRequest, accountId });
    }).toThrow(/account id/);
  });

  it("accepts a well-formed cursor and refuses one the store could not have issued", () => {
    const after = { updatedAt: VALID_UPDATED_AT, id: VALID_ID };

    expect(() => {
      requireValidKitchenPageRequest({ ...validRequest, after });
    }).not.toThrow();
    expect(() => {
      requireValidKitchenPageRequest({
        ...validRequest,
        after: { updatedAt: "2026-02-31T00:00:00.000000Z", id: VALID_ID },
      });
    }).toThrow(/cursor/);
    expect(() => {
      requireValidKitchenPageRequest({
        ...validRequest,
        after: "oops" as unknown as typeof after,
      });
    }).toThrow(/cursor/);
  });

  it("names neither the account id nor the cursor in a refusal", () => {
    const secret = "S3CRET_ACCOUNT_ID_____";
    const message = (() => {
      try {
        requireValidKitchenPageRequest({ accountId: secret, limit: 12 });
      } catch (error) {
        return error instanceof Error ? error.message : "";
      }
      return "";
    })();

    expect(message).not.toContain(secret);
  });
});

describe("requireValidKitchenName: what the table would refuse is refused before it is sent", () => {
  const throwsFor = (name: unknown) => () => {
    requireValidKitchenName(name, "rename a kitchen");
  };

  it("accepts 1 to 120 characters", () => {
    expect(throwsFor("a")).not.toThrow();
    expect(throwsFor("a".repeat(120))).not.toThrow();
  });

  it("refuses the empty name and 121 characters", () => {
    expect(throwsFor("")).toThrow(/1 to 120 characters/);
    expect(throwsFor("a".repeat(121))).toThrow(/1 to 120 characters/);
  });

  it("counts characters and not UTF-16 units: 120 astral characters fit, 121 do not", () => {
    expect(throwsFor("\u{1F373}".repeat(120))).not.toThrow();
    expect(throwsFor("\u{1F373}".repeat(121))).toThrow();
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a number", 5],
    ["an array", ["a"]],
    ["an object", { name: "a" }],
  ])("refuses %s", (_label, name) => {
    expect(throwsFor(name)).toThrow();
  });

  describe("control, format, separator and half-pair characters", () => {
    it.each([
      ["a NUL", "a\u0000b"],
      ["a line feed", "a\nb"],
      ["a carriage return", "a\rb"],
      ["a tab", "a\tb"],
      ["a C1 control", "a\u0085b"],
      ["a DEL", "a\u007Fb"],
      ["a zero-width space", "a​b"],
      ["a zero-width joiner", "a‍b"],
      ["a bidi override (RLO)", "a‮b"],
      ["a bidi isolate (RLI)", "a⁧b"],
      ["a left-to-right mark", "a‎b"],
      ["a soft hyphen", "a­b"],
      ["a byte order mark", "a﻿b"],
      ["a tag character", "a\u{E0041}b"],
      ["a line separator", "a b"],
      ["a paragraph separator", "a b"],
      ["a lone high surrogate", "a\uD800b"],
      ["a lone low surrogate", "a\uDC00b"],
    ])("refuses %s", (_label, name) => {
      expect(throwsFor(name)).toThrow(/no control or format character/);
    });

    it("accepts a well-formed surrogate pair and an ordinary no-break space", () => {
      expect(throwsFor("a\u{1F373}b")).not.toThrow();
      expect(throwsFor("a b")).not.toThrow();
    });
  });

  it("names the operation and never the name", () => {
    let message = "";
    try {
      requireValidKitchenName("SECRET\n", "duplicate a kitchen");
    } catch (error) {
      message = error instanceof Error ? error.message : "";
    }

    expect(message).toContain("duplicate a kitchen");
    expect(message).not.toContain("SECRET");
  });

  describe("agrees with the domain's judgement, so no judged name is ever refused here", () => {
    it("shares the 120-character bound with the domain and with `designs_name_length`", () => {
      expect(MAX_KITCHEN_NAME_CHARACTERS).toBe(KITCHEN_NAME_MAX_LENGTH);
    });

    it("accepts every name `judgeKitchenName` accepts", () => {
      fc.assert(
        fc.property(fc.string({ unit: "binary", maxLength: 200 }), (raw) => {
          const judgement = judgeKitchenName(raw);
          fc.pre(judgement.ok);

          expect(throwsFor(judgement.name)).not.toThrow();
        }),
        { numRuns: 3000 },
      );
    });
  });
});
