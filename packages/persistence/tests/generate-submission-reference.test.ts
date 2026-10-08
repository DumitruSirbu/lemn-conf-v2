import { describe, expect, it } from "vitest";

import { requireValidReference } from "../src/contact-submission-store.js";
import {
  generateSubmissionReference,
  isSubmissionReference,
} from "../src/generate-submission-reference.js";

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

  it("makes only references the predicate accepts and the table's check admits", () => {
    const refused = sample.filter((reference) => {
      try {
        requireValidReference(reference);
        return !isSubmissionReference(reference);
      } catch {
        return true;
      }
    });

    expect(refused).toEqual([]);
  });
});

describe("isSubmissionReference", () => {
  it.each([
    ["accepts a made reference", "LM-0123ABCD", true],
    ["refuses a missing prefix", "0123ABCDEF", false],
    ["refuses lowercase", "LM-0123abcd", false],
    ["refuses an I", "LM-0123ABCI", false],
    ["refuses an L", "LM-0123ABCL", false],
    ["refuses an O", "LM-0123ABCO", false],
    ["refuses a U", "LM-0123ABCU", false],
    ["refuses seven characters", "LM-0123ABC", false],
    ["refuses nine characters", "LM-0123ABCDE", false],
    ["refuses a trailing line feed", "LM-0123ABCD\n", false],
  ])("%s", (_name, text, isAccepted) => {
    expect(isSubmissionReference(text)).toBe(isAccepted);
  });
});
