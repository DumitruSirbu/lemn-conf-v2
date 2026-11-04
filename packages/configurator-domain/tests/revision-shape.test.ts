import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { isDesignRevisionShape } from "../src/repository.js";
import { isRevisionShape } from "../src/revision-shape.js";
import { readDashboardAuditEntry } from "../src/staff/dashboard-audit-action.js";

const WIDEST = 2n ** 63n - 1n;
const NEAR_THE_WIDEST = 1_000n;

const BOUNDARIES: readonly (readonly [string, string, boolean])[] = [
  ["zero", "0", true],
  ["one", "1", true],
  ["nineteen nines", "9".repeat(19), false],
  ["the widest bigint", "9223372036854775807", true],
  ["one past the widest bigint", "9223372036854775808", false],
  ["twenty digits", "1".repeat(20), false],
  ["a leading zero", "01", false],
  ["a double zero", "00", false],
  ["a minus sign", "-1", false],
  ["a plus sign", "+1", false],
  ["a leading space", " 1", false],
  ["a trailing space", "1 ", false],
  ["a trailing line feed", "1\n", false],
  ["an exponent", "1e3", false],
  ["the empty text", "", false],
];

/** The one place a test reads a revision as a number. */
function isWithinRule(text: string): boolean {
  return /^(0|[1-9][0-9]*)$/.test(text) && BigInt(text) <= WIDEST;
}

function isAcceptedAsAnAvailabilityRevision(revision: unknown): boolean {
  return readDashboardAuditEntry("catalogue-item-active-changed", {
    itemKind: "material",
    itemId: "material.painted-mdf",
    active: false,
    availabilityRevision: revision,
  }).ok;
}

const nearTheWidest = fc
  .bigInt({ min: -NEAR_THE_WIDEST, max: NEAR_THE_WIDEST })
  .map((offset) => (WIDEST + offset).toString());

const digitRuns = fc.stringMatching(/^[0-9]{0,22}$/);

const lookAlikes = fc.stringMatching(/^[0-9 +\-.e\n\r\t]{0,22}$/);

const anyRevisionLikeText = fc.oneof(nearTheWidest, digitRuns, lookAlikes);

describe("isRevisionShape", () => {
  it.each(BOUNDARIES)("%s: %j", (_name, text, isAccepted) => {
    expect(isRevisionShape(text)).toBe(isAccepted);
  });

  it.each([[1], [0], [null], [undefined], [{}], [["1"]]])(
    "refuses %j, which is not text",
    (value) => {
      expect(isRevisionShape(value)).toBe(false);
    },
  );

  propertyTest.prop([anyRevisionLikeText], { numRuns: 2_000 })(
    "agrees with a bigint's range, read as a number only by this oracle",
    (text) => {
      expect(isRevisionShape(text)).toBe(isWithinRule(text));
    },
  );
});

describe("every caller of the one shape agrees with it", () => {
  it.each(BOUNDARIES)(
    "%s: the availability revision is the shape",
    (_name, text) => {
      expect(isAcceptedAsAnAvailabilityRevision(text)).toBe(
        isRevisionShape(text),
      );
    },
  );

  it.each(BOUNDARIES)(
    "%s: a design revision is the shape, except 0",
    (_name, text) => {
      expect(isDesignRevisionShape(text)).toBe(
        text !== "0" && isRevisionShape(text),
      );
    },
  );

  propertyTest.prop([anyRevisionLikeText], { numRuns: 1_000 })(
    "the availability revision and the design revision follow the shape on any text",
    (text) => {
      expect(isAcceptedAsAnAvailabilityRevision(text)).toBe(
        isRevisionShape(text),
      );
      expect(isDesignRevisionShape(text)).toBe(
        text !== "0" && isRevisionShape(text),
      );
    },
  );
});
