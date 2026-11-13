import { fc, test as propertyTest } from "@fast-check/vitest";
import { isRevisionShape } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { requireValidSubmission } from "../src/contact-submission-store.js";
import type { ContactSubmissionToRecord } from "../src/contact-submission-store.js";
import { isDesignRevision } from "../src/design-revision.js";
import {
  isRevisionShape as isStoredRevisionShape,
  isStorableDesignRevision,
} from "../src/dashboard-store-shapes.js";
import {
  FAKE_DESIGN_ID,
  aDesignSubmission,
} from "./support/contact-submission-fixtures.js";

const WIDEST = 2n ** 63n - 1n;
const NEAR_THE_WIDEST = 1_000n;

const BOUNDARIES: readonly (readonly [string, string])[] = [
  ["zero", "0"],
  ["one", "1"],
  ["nineteen nines", "9".repeat(19)],
  ["the widest bigint", "9223372036854775807"],
  ["one past the widest bigint", "9223372036854775808"],
  ["twenty digits", "1".repeat(20)],
  ["a leading zero", "01"],
  ["a minus sign", "-1"],
  ["a plus sign", "+1"],
  ["a space", " 1"],
  ["a trailing line feed", "1\n"],
  ["the empty text", ""],
];

/** The one place a test reads a revision as a number. */
function isWithinRule(text: string): boolean {
  return /^(0|[1-9][0-9]*)$/.test(text) && BigInt(text) <= WIDEST;
}

function isAPositiveRevisionWithinRule(text: string): boolean {
  return text !== "0" && isWithinRule(text);
}

function isAcceptedInAContactReference(revision: string): boolean {
  const submission: ContactSubmissionToRecord = {
    ...aDesignSubmission("sweep-client-request-id"),
    target: { kind: "design", design: { id: FAKE_DESIGN_ID, revision } },
  };
  try {
    requireValidSubmission(submission);
    return true;
  } catch {
    return false;
  }
}

const nearTheWidest = fc
  .bigInt({ min: -NEAR_THE_WIDEST, max: NEAR_THE_WIDEST })
  .map((offset) => (WIDEST + offset).toString());

const anyRevisionLikeText = fc.oneof(
  nearTheWidest,
  fc.stringMatching(/^[0-9]{0,22}$/),
  fc.stringMatching(/^[0-9 +\-.e\n\r\t]{0,22}$/),
);

describe("the persistence revision checks agree with the domain's one shape", () => {
  it.each(BOUNDARIES)(
    "%s: the head and row shape is the domain's",
    (_name, text) => {
      expect(isStoredRevisionShape(text)).toBe(isRevisionShape(text));
    },
  );

  it.each(BOUNDARIES)(
    "%s: a design revision is the domain's shape except 0",
    (_name, text) => {
      expect(isDesignRevision(text)).toBe(
        text !== "0" && isRevisionShape(text),
      );
      expect(isStorableDesignRevision(text)).toBe(isDesignRevision(text));
    },
  );

  it.each(BOUNDARIES)(
    "%s: a contact submission's design revision is a design revision",
    (_name, text) => {
      expect(isAcceptedInAContactReference(text)).toBe(isDesignRevision(text));
    },
  );

  propertyTest.prop([anyRevisionLikeText], { numRuns: 2_000 })(
    "each follows a bigint's range on any text, read as a number only by this oracle",
    (text) => {
      expect(isStoredRevisionShape(text)).toBe(isWithinRule(text));
      expect(isDesignRevision(text)).toBe(isAPositiveRevisionWithinRule(text));
      expect(isStorableDesignRevision(text)).toBe(
        isAPositiveRevisionWithinRule(text),
      );
      expect(isAcceptedInAContactReference(text)).toBe(
        isAPositiveRevisionWithinRule(text),
      );
    },
  );
});
