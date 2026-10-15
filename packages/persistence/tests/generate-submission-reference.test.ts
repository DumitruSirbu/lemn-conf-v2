import { describe, expect, it } from "vitest";

import { isSubmissionReference } from "../src/contact-submission-store.js";
import { generateSubmissionReference } from "../src/generate-submission-reference.js";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const BODY_LENGTH = 8;
const SAMPLE_SIZE = 10_000;

const sample = Array.from({ length: SAMPLE_SIZE }, generateSubmissionReference);

describe("generateSubmissionReference", () => {
  it("makes LM- and eight characters of the alphabet, every time", () => {
    const outsideTheShape = sample.filter(
      (reference) =>
        !reference.startsWith("LM-") ||
        reference.length !== "LM-".length + BODY_LENGTH ||
        Array.from(reference.slice("LM-".length)).some(
          (character) => !ALPHABET.includes(character),
        ),
    );

    expect(outsideTheShape).toEqual([]);
  });

  it("reaches every character of the alphabet and none of I, L, O or U", () => {
    const seen = new Set(
      sample.flatMap((reference) => Array.from(reference.slice("LM-".length))),
    );

    expect([...seen].sort().join("")).toBe(ALPHABET);
  });

  it("makes only references the table's shape admits, whatever the look it is made in", () => {
    expect(
      sample.filter((reference) => !isSubmissionReference(reference)),
    ).toEqual([]);
  });
});
