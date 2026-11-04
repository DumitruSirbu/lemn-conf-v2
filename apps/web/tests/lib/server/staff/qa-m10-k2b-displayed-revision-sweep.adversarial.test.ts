import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { judgeDisplayedRevision } from "@/lib/server/staff/displayed-revision";

/**
 * The shape check is the only judgement above the store, and the store's cast is the only limit it must not pass: a
 * revision is accepted exactly when it is a whole number from one up to the widest `bigint`, written as plain digits.
 * The oracle here is the one place a test reads a revision as a number.
 */

const WIDEST = 9_223_372_036_854_775_807n;
const SWEEP_WIDTH = 300n;

function isAcceptedByRule(value: string): boolean {
  return /^[1-9][0-9]*$/.test(value) && BigInt(value) <= WIDEST;
}

function isAccepted(value: string): boolean {
  return judgeDisplayedRevision(value).ok;
}

describe("the displayed revision's shape", () => {
  it("accepts every whole number up to the widest bigint and refuses every one past it, over the whole of the boundary", () => {
    const disagreements: string[] = [];

    for (let offset = -SWEEP_WIDTH; offset <= SWEEP_WIDTH; offset += 1n) {
      const value = (WIDEST + offset).toString();
      if (isAccepted(value) !== offset <= 0n) disagreements.push(value);
    }

    expect(disagreements).toEqual([]);
  });

  it("accepts every digit count from one to nineteen and refuses twenty and more, whatever the digits", () => {
    const disagreements: string[] = [];

    for (let length = 1; length <= 40; length += 1) {
      for (const digit of ["1", "5", "9"]) {
        const value = digit.repeat(length);
        if (isAccepted(value) !== isAcceptedByRule(value)) {
          disagreements.push(value);
        }
      }
    }

    expect(disagreements).toEqual([]);
  });

  propertyTest.prop(
    [
      fc.oneof(
        fc.stringMatching(/^[0-9]{0,22}$/),
        fc.stringMatching(/^[0-9a-zA-Z .+\-\n\r\t٠-٩０-９]{0,24}$/u),
      ),
    ],
    { numRuns: 2_000 },
  )("agrees with the rule for any text of digits and look-alikes", (value) => {
    const judgement = judgeDisplayedRevision(value);

    expect(judgement.ok).toBe(isAcceptedByRule(value));
    if (judgement.ok) expect(judgement.revision).toBe(value);
  });

  propertyTest.prop([fc.bigInt({ min: 1n, max: WIDEST })], {
    numRuns: 1_000,
  })(
    "hands back an accepted revision as the very text it was given",
    (number) => {
      const text = number.toString();

      expect(judgeDisplayedRevision(text)).toEqual({
        ok: true,
        revision: text,
      });
    },
  );

  it("refuses text that has a valid revision before a line end, which a loose end-of-text test lets through", () => {
    expect(["5\n", "5\r\n", "5 ", "\n5"].map(isAccepted)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });
});
