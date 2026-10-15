import { fc, test as propertyTest } from "@fast-check/vitest";
import { isDesignRevisionShape } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { isDesignRevision } from "../src/design-revision.js";

/** Characters a revision is made of and the ones that make a near miss: a sign, an exponent, a
 *  decimal point, whitespace, a line feed. */
const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

const REVISION_LIKE_CHARACTERS = [...DIGITS, "-", "+", "e", ".", " ", "\n"];

const revisionLike = fc.string({
  unit: fc.constantFrom(...REVISION_LIKE_CHARACTERS),
  maxLength: 24,
});

const digitRuns = fc.string({
  unit: fc.constantFrom(...DIGITS),
  minLength: 1,
  maxLength: 24,
});

describe("the domain's statement of a revision's shape and persistence's isDesignRevision", () => {
  propertyTest.prop([fc.string({ maxLength: 30 })])(
    "agree on any string",
    (text) => {
      expect(isDesignRevisionShape(text)).toBe(isDesignRevision(text));
    },
  );

  propertyTest.prop([revisionLike])(
    "agree on strings made of revision-like characters",
    (text) => {
      expect(isDesignRevisionShape(text)).toBe(isDesignRevision(text));
    },
  );

  propertyTest.prop([digitRuns])(
    "agree on every digit run up to past the width",
    (text) => {
      expect(isDesignRevisionShape(text)).toBe(isDesignRevision(text));
    },
  );

  it.each([
    ["accepted", "9".repeat(19), true],
    ["refused for width", "9".repeat(20), false],
    ["refused for a leading zero", "01", false],
    ["refused for a trailing line feed", "1\n", false],
  ])("the sweep reaches the arm that is %s", (_name, text, isAccepted) => {
    expect(isDesignRevision(text)).toBe(isAccepted);
    expect(isDesignRevisionShape(text)).toBe(isAccepted);
  });
});
