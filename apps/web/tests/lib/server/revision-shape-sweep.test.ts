import { fc, test as propertyTest } from "@fast-check/vitest";
import { isRevisionShape } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { isRevisionShape as isDashboardRevisionShape } from "@/lib/server/price-dashboard/revision-shape";
import { judgeDisplayedRevision } from "@/lib/server/staff/displayed-revision";

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

function isAcceptedAsADisplayedRevision(text: string): boolean {
  return judgeDisplayedRevision(text).ok;
}

const nearTheWidest = fc
  .bigInt({ min: -NEAR_THE_WIDEST, max: NEAR_THE_WIDEST })
  .map((offset) => (WIDEST + offset).toString());

const anyRevisionLikeText = fc.oneof(
  nearTheWidest,
  fc.stringMatching(/^[0-9]{0,22}$/),
  fc.stringMatching(/^[0-9 +\-.e\n\r\t]{0,22}$/),
);

describe("the web revision checks agree with the domain's one shape", () => {
  it.each(BOUNDARIES)(
    "%s: the dashboard's revision is the domain's shape",
    (_name, text) => {
      expect(isDashboardRevisionShape(text)).toBe(isRevisionShape(text));
    },
  );

  it.each(BOUNDARIES)(
    "%s: a displayed revision is the domain's shape except 0",
    (_name, text) => {
      expect(isAcceptedAsADisplayedRevision(text)).toBe(
        text !== "0" && isRevisionShape(text),
      );
    },
  );

  propertyTest.prop([anyRevisionLikeText], { numRuns: 2_000 })(
    "each follows a bigint's range on any text, read as a number only by this oracle",
    (text) => {
      expect(isDashboardRevisionShape(text)).toBe(isWithinRule(text));
      expect(isAcceptedAsADisplayedRevision(text)).toBe(
        text !== "0" && isWithinRule(text),
      );
    },
  );
});
