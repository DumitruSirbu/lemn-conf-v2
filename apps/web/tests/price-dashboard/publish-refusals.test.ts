// What a refused publish names: the lines a screen words, one for each of the first few reasons, the row each is about, and a
// count of the rest. The reasons are the wire's closed list; none carries a value, so no line can.
import { describe, expect, it } from "vitest";

import type { DraftChange } from "@lemnaria/configurator-domain";

import type { CandidateRefusalWire } from "@/price-dashboard/price-dashboard-wire-contract";
import {
  MAX_REFUSAL_LINES,
  refusalLinesOf,
  type RefusalContext,
  type RefusalLine,
} from "@/price-dashboard/publish-refusals";
import { SAMPLE_PUBLISH_PAGE } from "@/price-dashboard/publish-sample";

const BOOK = SAMPLE_PUBLISH_PAGE.state.active.book;
const NAMES = SAMPLE_PUBLISH_PAGE.cabinetNames;
const RULE = BOOK.cabinetRules[0];
const MATERIAL = BOOK.material.tiers[1];
const WIDTH_MM = 600;
const HEIGHT_MM = 720;

if (RULE === undefined || MATERIAL === undefined) {
  throw new Error("the sample book has no rule or no second material");
}

const CHANGE: DraftChange = {
  address: { kind: "cabinet", ruleId: RULE.ruleId, field: "anchorMinor" },
  value: 1,
} as DraftChange;

const CONTEXT: RefusalContext = {
  book: BOOK,
  changes: [CHANGE],
  cabinetNames: NAMES,
};

const CABINET_NAME = {
  kind: "name",
  name: NAMES[RULE.buildId] ?? RULE.buildId,
};

function linesOf(...refusals: CandidateRefusalWire[]): readonly RefusalLine[] {
  return refusalLinesOf(refusals, CONTEXT).lines;
}

describe("the reasons a catalogue gives", () => {
  it.each([
    ["PRICE_NOT_POSITIVE", "price-not-positive"],
    ["PRICE_TOO_LARGE", "price-too-large"],
  ] as const)(
    "tells %s as the cabinet and the size it is about, never an amount",
    (code, kind) => {
      expect(
        linesOf({
          source: "catalogue",
          code,
          ruleId: RULE.ruleId,
          buildId: RULE.buildId,
          widthMm: WIDTH_MM,
          heightMm: HEIGHT_MM,
          field: "anchorMinor",
        }),
      ).toEqual([
        { kind, subject: CABINET_NAME, widthMm: WIDTH_MM, heightMm: HEIGHT_MM },
      ]);
    },
  );

  it("names the depth rule, or the material tier, a percentage out of range is about", () => {
    expect(
      linesOf(
        { source: "catalogue", code: "PERCENT_OUT_OF_RANGE", item: "depth" },
        {
          source: "catalogue",
          code: "PERCENT_OUT_OF_RANGE",
          item: MATERIAL.tierId,
        },
      ),
    ).toEqual([
      { kind: "percent-out-of-range", subject: { kind: "depth-rule" } },
      {
        kind: "percent-out-of-range",
        subject: {
          kind: "book-text",
          authored: MATERIAL.name,
          key: MATERIAL.nameKey,
        },
      },
    ]);
  });

  it.each(["LINK_TARGET_UNKNOWN", "LINK_TARGET_CUSTOMER_SUPPLIED"] as const)(
    "tells %s as the accessory whose cabinet cannot be priced",
    (code) => {
      const [line] = linesOf({
        source: "catalogue",
        code,
        accessoryId: "plinth-light",
        linkedBuildId: RULE.buildId,
      });

      expect(line).toEqual({
        kind: "link",
        subject: {
          kind: "book-text",
          authored: "plinth-light",
          key: undefined,
        },
      });
    },
  );

  it("tells every other reason as the cabinet it is about", () => {
    expect(
      linesOf({
        source: "catalogue",
        code: "NO_RULE_FOR_BODY",
        buildId: RULE.buildId,
      }),
    ).toEqual([{ kind: "cabinet", subject: CABINET_NAME }]);
  });

  it("falls back to the catalogue's own id for a cabinet the page has no name for", () => {
    expect(
      refusalLinesOf(
        [{ source: "catalogue", code: "NO_RULE_FOR_BODY", buildId: "unnamed" }],
        { ...CONTEXT, cabinetNames: {} },
      ).lines,
    ).toEqual([
      { kind: "cabinet", subject: { kind: "name", name: "unnamed" } },
    ]);
  });
});

describe("the reasons a change or a pricing gives", () => {
  it("names the row of the change a refusal is indexed at, by its address", () => {
    expect(linesOf({ source: "changes", index: 0, code: "TOO_LARGE" })).toEqual(
      [{ kind: "change", subject: CABINET_NAME }],
    );
  });

  it("names no row for an index the draft does not have", () => {
    expect(linesOf({ source: "changes", index: 9, code: "TOO_LARGE" })).toEqual(
      [{ kind: "unnamed" }],
    );
  });

  it("tells a pricing failure in one sentence, since it is about no row", () => {
    expect(linesOf({ source: "pricing", code: "INVALID_PRICE_BOOK" })).toEqual([
      { kind: "unnamed" },
    ]);
  });
});

describe("how many reasons are told", () => {
  const unnamed = (count: number): CandidateRefusalWire[] =>
    Array.from({ length: count }, () => ({
      source: "pricing",
      code: "INVALID_PRICE_BOOK",
    }));

  it.each([0, 1, MAX_REFUSAL_LINES, MAX_REFUSAL_LINES + 1, 40])(
    "tells at most the cap by line and counts the rest, for %s reasons",
    (count) => {
      const { lines, hiddenCount } = refusalLinesOf(unnamed(count), CONTEXT);

      expect(lines).toHaveLength(Math.min(count, MAX_REFUSAL_LINES));
      expect(hiddenCount).toBe(Math.max(0, count - MAX_REFUSAL_LINES));
    },
  );

  it("keeps the order the server gave, so the first reasons are the ones told", () => {
    const refusals: CandidateRefusalWire[] = [
      ...unnamed(MAX_REFUSAL_LINES),
      { source: "catalogue", code: "NO_RULE_FOR_BODY", buildId: RULE.buildId },
    ];

    const { lines, hiddenCount } = refusalLinesOf(refusals, CONTEXT);

    expect(lines.every((line) => line.kind === "unnamed")).toBe(true);
    expect(hiddenCount).toBe(1);
  });
});
