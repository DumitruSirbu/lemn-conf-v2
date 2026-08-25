import { describe, expect, it } from "vitest";

import { generateDesignId } from "../src/generate-design-id.js";

const NANOID_ALPHABET_PATTERN = /^[A-Za-z0-9_-]+$/;
const SAMPLE_SIZE = 10_000;
const SHARED_PREFIX_LENGTH = 6;

describe("generateDesignId", () => {
  it("generates ids of a consistent length and alphabet", () => {
    const id = generateDesignId();

    expect(id).toHaveLength(21);
    expect(id).toMatch(NANOID_ALPHABET_PATTERN);
  });

  it("never collides across 10,000 samples", () => {
    const ids = new Set<string>();
    for (let i = 0; i < SAMPLE_SIZE; i++) {
      ids.add(generateDesignId());
    }

    expect(ids.size).toBe(SAMPLE_SIZE);
  });

  it("does not produce sequential or incrementing output across repeated calls", () => {
    const ids = Array.from({ length: 100 }, () => generateDesignId());

    // A sequential/incrementing generator would produce ids that share a long, growing common
    // prefix between neighbours (e.g. base-36 counters) or sort into generation order. Random ids
    // do neither: consecutive pairs rarely share more than a couple of leading characters, and
    // generation order diverges from lexicographic order.
    const sharesLongPrefix = ids.some((id, index) => {
      const previous = ids[index - 1];
      if (previous === undefined) return false;
      return (
        id.slice(0, SHARED_PREFIX_LENGTH) ===
        previous.slice(0, SHARED_PREFIX_LENGTH)
      );
    });
    expect(sharesLongPrefix).toBe(false);

    const sortedLexicographically = [...ids].sort();
    expect(sortedLexicographically).not.toEqual(ids);
  });
});
