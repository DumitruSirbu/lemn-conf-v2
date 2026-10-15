import { describe, expect, it } from "vitest";

import {
  isSubmissionReference,
  requireValidReference,
} from "../src/contact-submission-store.js";

const THIRTY_TWO = `LM-${"A".repeat(29)}`;

describe("isSubmissionReference: the table's own shape, six to thirty-two of 0-9, A-Z and a hyphen", () => {
  it.each([
    ["a reference as the generator makes one", "LM-0123ABCD"],
    ["six characters, the shortest", "ABC-12"],
    ["thirty-two characters, the longest", THIRTY_TWO],
    ["a look the generator may take later", "LM-I0O1LU99"],
    ["hyphens and digits alone", "12-34-56"],
  ])("accepts %s", (_label, text) => {
    expect(isSubmissionReference(text)).toBe(true);
  });

  it.each([
    ["five characters", "ABC-1"],
    ["thirty-three characters", `${THIRTY_TWO}A`],
    ["nothing", ""],
    ["lower case", "lm-0123abcd"],
    ["a space inside", "LM-0123 ABCD"],
    ["a trailing line feed", "LM-0123ABCD\n"],
    ["an underscore", "LM_0123ABCD"],
    ["an address", "ana@example.com"],
  ])("refuses %s", (_label, text) => {
    expect(isSubmissionReference(text)).toBe(false);
  });

  it.each([
    undefined,
    null,
    42,
    ["LM-0123ABCD"],
    { toString: () => "LM-0123ABCD" },
  ])("refuses a value that is not text: %j", (value) => {
    expect(isSubmissionReference(value)).toBe(false);
  });

  it("agrees with the store's own refusal of a reference, over every length from nought to forty", () => {
    for (let length = 0; length <= 40; length += 1) {
      const text = "A".repeat(length);
      const isRefusedByTheStore = (() => {
        try {
          requireValidReference(text);
          return false;
        } catch {
          return true;
        }
      })();

      expect(isSubmissionReference(text), String(length)).toBe(
        !isRefusedByTheStore,
      );
    }
  });
});
