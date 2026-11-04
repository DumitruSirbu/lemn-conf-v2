// Adversarial QA of the lines a refused publish is told by, below the screen: the model that turns the wire's reasons
// into lines must survive a reason it was not written for and an index that names no change, since no parser stands between
// the client and it.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { CandidateRefusalWire } from "@/price-dashboard/price-dashboard-wire-contract";
import {
  MAX_REFUSAL_LINES,
  refusalLinesOf,
  type RefusalLine,
  type RefusalContext,
} from "@/price-dashboard/publish-refusals";
import { SAMPLE_PUBLISH_PAGE } from "../support/publish-sample";

const BOOK = SAMPLE_PUBLISH_PAGE.state.active.book;
const CONTEXT: RefusalContext = {
  books: { before: BOOK, after: BOOK },
  changes: SAMPLE_PUBLISH_PAGE.state.draft.changes,
  cabinetNames: SAMPLE_PUBLISH_PAGE.cabinetNames,
};

describe("a reason from a source the model was not written for", () => {
  it("leaves no hole among the lines, and does not stop the reasons after it", () => {
    const unknown = {
      source: "a-source-nobody-wrote",
      code: "SOMETHING",
    } as unknown as CandidateRefusalWire;
    const known: CandidateRefusalWire = {
      source: "pricing",
      code: "INVALID_PRICE_BOOK",
    };

    const lines: readonly (RefusalLine | undefined)[] = refusalLinesOf(
      [unknown, known],
      CONTEXT,
    ).lines;

    expect(
      lines.every((line) => typeof line?.kind === "string"),
      "a reason came out as no line at all",
    ).toBe(true);
    expect(lines.at(-1)).toEqual({ kind: "unnamed" });
  });
});

describe("a change reason's index", () => {
  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 31, 1e308])(
    "%s names no change and is told as a reason that names no row",
    (index) => {
      const { lines } = refusalLinesOf(
        [{ source: "changes", index, code: "TOO_LARGE" }],
        CONTEXT,
      );

      expect(lines).toEqual([{ kind: "unnamed" }]);
    },
  );
});

describe("how many reasons are told, over any number of them", () => {
  it("is the cap or fewer, and every reason is either told or counted", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 60 }), (count) => {
        const refusals: CandidateRefusalWire[] = Array.from(
          { length: count },
          () => ({ source: "pricing", code: "INVALID_PRICE_BOOK" }),
        );

        const { lines, hiddenCount } = refusalLinesOf(refusals, CONTEXT);

        expect(lines.length).toBeLessThanOrEqual(MAX_REFUSAL_LINES);
        expect(lines.length + hiddenCount).toBe(count);
      }),
    );
  });
});
