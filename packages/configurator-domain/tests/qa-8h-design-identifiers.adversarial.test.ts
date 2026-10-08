// Wave 8H, S2's follow-up: the two shapes the contact request leans on, at their edges. `isDesignId` is
// held to exactly the 64 characters and the one length the generator makes; `isDesignRevisionShape` to a
// digit run a `bigint` column holds.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { isDesignId, isDesignRevisionShape } from "../src/repository.js";

const DESIGN_ID_LENGTH = 21;
const LAST_BMP_CODE_UNIT = 0xffff;
const URL_SAFE_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

const A_DESIGN_ID = "V1StGXR8_Z5jdHi6B-myT";

function everyCodeUnit(): readonly string[] {
  return Array.from({ length: LAST_BMP_CODE_UNIT + 1 }, (_, unit) =>
    String.fromCharCode(unit),
  );
}

describe("isDesignId at its edges", () => {
  it("accepts one length and no other, from nothing to twice the length", () => {
    const acceptedLengths = Array.from(
      { length: 2 * DESIGN_ID_LENGTH + 1 },
      (_, length) => length,
    ).filter((length) => isDesignId("a".repeat(length)));

    expect(acceptedLengths).toEqual([DESIGN_ID_LENGTH]);
  });

  it.each([0, 10, DESIGN_ID_LENGTH - 1])(
    "accepts exactly the 64 URL-safe characters at position %i, of every UTF-16 code unit",
    (position) => {
      const accepted = everyCodeUnit().filter((unit) =>
        isDesignId(
          `${A_DESIGN_ID.slice(0, position)}${unit}${A_DESIGN_ID.slice(position + 1)}`,
        ),
      );

      expect(accepted.sort().join("")).toBe(
        Array.from(URL_SAFE_ALPHABET).sort().join(""),
      );
    },
  );

  it("refuses an id with anything before or after it", () => {
    const wrapped = everyCodeUnit()
      .flatMap((unit) => [`${unit}${A_DESIGN_ID}`, `${A_DESIGN_ID}${unit}`])
      .filter((text) => isDesignId(text));

    expect(wrapped).toEqual([]);
  });

  it("refuses twenty-one astral characters, which are forty-two code units", () => {
    expect(isDesignId(String.fromCodePoint(0x1d7d8).repeat(21))).toBe(false);
  });

  it("refuses two ids on two lines", () => {
    expect(isDesignId(`${A_DESIGN_ID}\n${A_DESIGN_ID}`)).toBe(false);
  });

  propertyTest.prop([
    fc.string({
      unit: fc.constantFrom(...Array.from(URL_SAFE_ALPHABET)),
      minLength: DESIGN_ID_LENGTH,
      maxLength: DESIGN_ID_LENGTH,
    }),
  ])("accepts every string of twenty-one such characters", (id) => {
    expect(isDesignId(id)).toBe(true);
  });
});

describe("isDesignRevisionShape at its edges", () => {
  const LARGEST_BIGINT_COLUMN_VALUE = "9223372036854775807";

  it("accepts one to nineteen digits and no more", () => {
    const acceptedLengths = Array.from(
      { length: 41 },
      (_, length) => length,
    ).filter((length) => isDesignRevisionShape("7".repeat(length)));

    expect(acceptedLengths).toEqual(
      Array.from({ length: 19 }, (_, index) => index + 1),
    );
  });

  it("accepts only the nine non-zero ASCII digits as a first character, of every UTF-16 code unit", () => {
    const accepted = everyCodeUnit().filter((unit) =>
      isDesignRevisionShape(`${unit}7`),
    );

    expect(accepted.join("")).toBe("123456789");
  });

  it("accepts only the ten ASCII digits as a later character, of every UTF-16 code unit", () => {
    const accepted = everyCodeUnit().filter((unit) =>
      isDesignRevisionShape(`7${unit}`),
    );

    expect(accepted.join("")).toBe("0123456789");
  });

  it("refuses a revision with anything before or after it", () => {
    const wrapped = everyCodeUnit()
      .filter((unit) => !/[0-9]/.test(unit))
      .flatMap((unit) => [`${unit}42`, `42${unit}`])
      .filter((text) => isDesignRevisionShape(text));

    expect(wrapped).toEqual([]);
  });

  it("accepts the largest value a bigint column holds", () => {
    expect(isDesignRevisionShape(LARGEST_BIGINT_COLUMN_VALUE)).toBe(true);
  });

  // QA finding 12, as built and the same in persistence's `isDesignRevision`: the shape is nineteen digits,
  // not a bigint's range, so it lets through values the column cannot hold.
  it("as built: accepts nineteen digits past a bigint column's largest value", () => {
    expect(isDesignRevisionShape("9223372036854775808")).toBe(true);
    expect(isDesignRevisionShape("9".repeat(19))).toBe(true);
  });
});
