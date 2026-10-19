import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  encodeKitchenCursor,
  readCursorParameter,
} from "@/lib/server/account/kitchen-cursor";

/**
 * The kitchens cursor's codec (M8B Lot 2, E1). Node's own base64url decoder is lenient: it skips padding, dots,
 * spaces and line breaks and reads a trailing partial group, so a value that is not what the route issued still
 * decodes to the cursor it was made from. Every refusal below starts from a value that WOULD decode to a valid cursor
 * if the route's own length and alphabet checks were absent, so each case can fail for the reason its title names.
 */

const UPDATED_AT = "2026-10-19T10:20:30.123456Z";
const ID = "abcdefghijklmnopqrstu";
const LONGEST_CURSOR_TEXT = 256;

function textOfJson(json: string): string {
  return Buffer.from(json, "utf8").toString("base64url");
}

function textOfCursor(cursor: object): string {
  return textOfJson(JSON.stringify(cursor));
}

function readOne(value: string) {
  return readCursorParameter(new URLSearchParams({ cursor: value }));
}

/** A valid cursor with an extra member, padded so its base64url text has exactly `length` characters (`length` must be
 *  one a whole number of bytes encodes to: 256 and 258 are, 257 is not). */
function validCursorTextOfLength(length: number): string {
  for (let padding = 0; padding < 400; padding += 1) {
    const text = textOfCursor({
      updatedAt: UPDATED_AT,
      id: ID,
      pad: "x".repeat(padding),
    });
    if (text.length === length) return text;
  }
  throw new Error(`no padding makes a cursor of ${String(length)} characters`);
}

describe("the cursor the route issues", () => {
  it("is base64url of the JSON of the last row's instant and id, and nothing else", () => {
    const text = encodeKitchenCursor({
      updatedAt: UPDATED_AT,
      id: ID,
      // a member the store never issues must not be copied into a cursor
      ...({ accountId: "A".repeat(21) } as object),
    });

    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(JSON.parse(Buffer.from(text, "base64url").toString("utf8"))).toEqual(
      { updatedAt: UPDATED_AT, id: ID },
    );
  });

  it("reads back as the cursor it was made from, for any instant and id the store issues", () => {
    const microsecondInstant = fc
      .date({
        min: new Date("2000-01-01T00:00:00.000Z"),
        max: new Date("2099-12-31T23:59:59.999Z"),
        noInvalidDate: true,
      })
      .chain((instant) =>
        fc
          .integer({ min: 0, max: 999 })
          .map(
            (extra) =>
              instant.toISOString().replace(/Z$/, "") +
              String(extra).padStart(3, "0") +
              "Z",
          ),
      );
    const designId = fc.stringMatching(/^[A-Za-z0-9_-]{21}$/);

    fc.assert(
      fc.property(microsecondInstant, designId, (updatedAt, id) => {
        const read = readOne(encodeKitchenCursor({ updatedAt, id }));

        expect(read).toEqual({ kind: "after", cursor: { updatedAt, id } });
      }),
      { numRuns: 300 },
    );
  });
});

describe("a request without a cursor, and one with a refused cursor", () => {
  it("reads as the first page when the member is absent", () => {
    expect(readCursorParameter(new URLSearchParams())).toEqual({
      kind: "first-page",
    });
    expect(
      readCursorParameter(new URLSearchParams({ other: "x", limit: "50" })),
    ).toEqual({ kind: "first-page" });
  });

  it("refuses an empty member, which is not the first page", () => {
    expect(readOne("")).toEqual({ kind: "invalid" });
  });

  it.each([
    [
      "repeated, both valid",
      new URLSearchParams([
        ["cursor", textOfCursor({ updatedAt: UPDATED_AT, id: ID })],
        ["cursor", textOfCursor({ updatedAt: UPDATED_AT, id: ID })],
      ]),
    ],
    [
      "repeated, the first valid",
      new URLSearchParams([
        ["cursor", textOfCursor({ updatedAt: UPDATED_AT, id: ID })],
        ["cursor", "junk"],
      ]),
    ],
    [
      "repeated, the second valid",
      new URLSearchParams([
        ["cursor", "junk"],
        ["cursor", textOfCursor({ updatedAt: UPDATED_AT, id: ID })],
      ]),
    ],
    [
      "repeated, the first one empty",
      new URLSearchParams([
        ["cursor", ""],
        ["cursor", textOfCursor({ updatedAt: UPDATED_AT, id: ID })],
      ]),
    ],
  ])("refuses a member that is %s", (_label, query) => {
    expect(readCursorParameter(query)).toEqual({ kind: "invalid" });
  });
});

describe("the length bound of 256 characters", () => {
  it("accepts a cursor of exactly 256 characters", () => {
    const text = validCursorTextOfLength(LONGEST_CURSOR_TEXT);

    const read = readOne(text);

    expect(text).toHaveLength(LONGEST_CURSOR_TEXT);
    expect(read.kind).toBe("after");
    if (read.kind === "after") {
      expect(read.cursor).toMatchObject({ updatedAt: UPDATED_AT, id: ID });
    }
  });

  it("refuses 257 characters, though they decode to exactly the cursor that 256 do", () => {
    const text = `${validCursorTextOfLength(LONGEST_CURSOR_TEXT)}A`;

    expect(text).toHaveLength(LONGEST_CURSOR_TEXT + 1);
    // the control: only the length bound stands between this value and acceptance
    expect(
      Buffer.from(text, "base64url").equals(
        Buffer.from(text.slice(0, LONGEST_CURSOR_TEXT), "base64url"),
      ),
    ).toBe(true);
    expect(readOne(text)).toEqual({ kind: "invalid" });
  });

  it("refuses 258 characters of an otherwise valid cursor", () => {
    const text = validCursorTextOfLength(LONGEST_CURSOR_TEXT + 2);

    expect(text).toHaveLength(LONGEST_CURSOR_TEXT + 2);
    expect(readOne(text)).toEqual({ kind: "invalid" });
  });

  it("refuses a body-sized value before decoding it", () => {
    expect(readOne("A".repeat(100_000))).toEqual({ kind: "invalid" });
  });
});

describe("the alphabet: base64url characters only", () => {
  const valid = textOfCursor({ updatedAt: UPDATED_AT, id: ID });

  it.each([
    ["padding", `${valid}=`],
    ["a dot inside", `${valid.slice(0, 10)}.${valid.slice(10)}`],
    ["a space inside", `${valid.slice(0, 10)} ${valid.slice(10)}`],
    ["a trailing line break", `${valid}\n`],
    ["a plus", `${valid.slice(0, 10)}+${valid.slice(10)}`],
    ["a slash", `${valid.slice(0, 10)}/${valid.slice(10)}`],
    ["a non-ASCII letter", `${valid}é`],
    ["a percent sign", `${valid}%41`],
  ])(
    "refuses a value with %s, that Node would still decode",
    (_label, text) => {
      expect(readOne(text)).toEqual({ kind: "invalid" });
    },
  );

  it("controls: the same value without the extra character is accepted", () => {
    expect(readOne(valid).kind).toBe("after");
  });
});

describe("the decoded value must be a cursor the store issues", () => {
  it.each([
    ["not JSON", textOfJson("not json at all")],
    ["JSON that stops short", textOfJson('{"updatedAt":"2026')],
    ["an array", textOfJson("[]")],
    ["null", textOfJson("null")],
    ["a string", textOfJson(JSON.stringify(ID))],
    ["a number", textOfJson("42")],
    ["an empty object", textOfCursor({})],
    ["no id", textOfCursor({ updatedAt: UPDATED_AT })],
    ["no instant", textOfCursor({ id: ID })],
    ["an instant that is not text", textOfCursor({ updatedAt: 1, id: ID })],
    ["an id that is not text", textOfCursor({ updatedAt: UPDATED_AT, id: 7 })],
    [
      "an id with a forbidden character",
      textOfCursor({ updatedAt: UPDATED_AT, id: "ab cd" }),
    ],
    ["an empty id", textOfCursor({ updatedAt: UPDATED_AT, id: "" })],
    [
      "an id of 65 characters",
      textOfCursor({ updatedAt: UPDATED_AT, id: "a".repeat(65) }),
    ],
    [
      "an instant with five fraction digits",
      textOfCursor({ updatedAt: "2026-10-19T10:20:30.12345Z", id: ID }),
    ],
    [
      "an instant with three fraction digits",
      textOfCursor({ updatedAt: "2026-10-19T10:20:30.123Z", id: ID }),
    ],
    [
      "an instant without the Z",
      textOfCursor({ updatedAt: "2026-10-19T10:20:30.123456", id: ID }),
    ],
    [
      "an instant with an offset",
      textOfCursor({ updatedAt: "2026-10-19T10:20:30.123456+02:00", id: ID }),
    ],
    [
      "an instant of month 13",
      textOfCursor({ updatedAt: "2026-13-19T10:20:30.123456Z", id: ID }),
    ],
    [
      "an instant of 30 February",
      textOfCursor({ updatedAt: "2026-02-30T10:20:30.123456Z", id: ID }),
    ],
    [
      "an instant of hour 24",
      textOfCursor({ updatedAt: "2026-10-19T24:00:00.123456Z", id: ID }),
    ],
    [
      "an instant of year 0000",
      textOfCursor({ updatedAt: "0000-10-19T10:20:30.123456Z", id: ID }),
    ],
    [
      "an SQL fragment as the id",
      textOfCursor({ updatedAt: UPDATED_AT, id: "x';drop table designs;--" }),
    ],
  ])("refuses %s", (_label, text) => {
    expect(readOne(text)).toEqual({ kind: "invalid" });
  });
});
