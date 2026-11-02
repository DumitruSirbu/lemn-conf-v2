import { describe, expect, it } from "vitest";

import {
  BOOK_JUDGEMENT_CODES,
  type BookRefusal,
} from "@lemnaria/configurator-domain";

import {
  refusalOfBook,
  refusalsOfApplication,
} from "@/lib/server/price-dashboard/candidate-refusals";

const NAMED = { ruleId: "cabinet.base-3drawer", buildId: "base-3drawer" };

const PRICE_AT_A_SIZE = {
  ...NAMED,
  widthMm: 300,
  heightMm: 860,
  field: "perStepNarrowerMinor",
} as const;

/** One refusal of every code the domain judges, with the members its variant states. */
const BOOK_REFUSAL_OF_EVERY_CODE: readonly BookRefusal[] = [
  { code: "NO_RULE_FOR_BODY", buildId: "base-3drawer" },
  { code: "DUPLICATE_RULE_FOR_BODY", buildId: "base-3drawer" },
  { code: "UNKNOWN_FORMULA_SHAPE", ...NAMED },
  { code: "PRICE_NOT_EXACT", ...NAMED },
  { code: "STRUCTURAL_ROW_NOT_PER_SIZE", ...NAMED },
  { code: "NO_BUILT_WIDTH", ...NAMED },
  { code: "CUSTOMER_ROW_PRICED", ...NAMED },
  {
    code: "ANCHOR_WIDTH_MISMATCH",
    ...NAMED,
    anchorWidthMm: 600,
    expectedWidthMm: 800,
  },
  {
    code: "SIZE_LIST_MISMATCH",
    ...NAMED,
    listedWidthsMm: [300, 600],
    expectedWidthsMm: [300, 450, 600],
  },
  { code: "PRICE_NOT_POSITIVE", ...PRICE_AT_A_SIZE },
  { code: "PRICE_TOO_LARGE", ...PRICE_AT_A_SIZE },
  { code: "PERCENT_OUT_OF_RANGE", item: "depth" },
];

describe("a book refusal as the wire states it", () => {
  it("is exercised for every code the domain judges, so a new code is a new case here", () => {
    expect(BOOK_REFUSAL_OF_EVERY_CODE.map(({ code }) => code).sort()).toEqual(
      [...BOOK_JUDGEMENT_CODES].sort(),
    );
  });

  it.each(BOOK_REFUSAL_OF_EVERY_CODE)(
    "carries exactly the members the $code refusal states, and the source",
    (refusal) => {
      expect(refusalOfBook(refusal)).toEqual({
        source: "catalogue",
        ...refusal,
      });
      expect(Object.keys(refusalOfBook(refusal)).sort()).toEqual(
        ["source", ...Object.keys(refusal)].sort(),
      );
    },
  );

  it("leaves out the expected width when the catalogue declares no default width", () => {
    const wire = refusalOfBook({
      code: "ANCHOR_WIDTH_MISMATCH",
      ...NAMED,
      anchorWidthMm: 600,
      expectedWidthMm: undefined,
    });

    expect(Object.keys(wire)).not.toContain("expectedWidthMm");
  });

  it("copies the width lists, so a body cannot alias the judgement's arrays", () => {
    const refusal: BookRefusal = {
      code: "SIZE_LIST_MISMATCH",
      ...NAMED,
      listedWidthsMm: [300],
      expectedWidthsMm: [300, 450],
    };

    const wire = refusalOfBook(refusal);

    expect(wire).toHaveProperty("listedWidthsMm", [300]);
    expect(
      wire.source === "catalogue" &&
        "listedWidthsMm" in wire &&
        wire.listedWidthsMm !== refusal.listedWidthsMm,
    ).toBe(true);
  });
});

describe("a refused application as the wire states it", () => {
  it("names each refused change by its index in the draft and its closed code", () => {
    expect(
      refusalsOfApplication({
        ok: false,
        reason: "changes-refused",
        refusals: [
          { index: 0, code: "UNKNOWN_RULE" },
          { index: 3, code: "UNKNOWN_ADDRESS" },
        ],
      }),
    ).toEqual([
      { source: "changes", index: 0, code: "UNKNOWN_RULE" },
      { source: "changes", index: 3, code: "UNKNOWN_ADDRESS" },
    ]);
  });

  it("sends a book that does not parse as its code alone: never the developer text, the id or the placement", () => {
    const wire = refusalsOfApplication({
      ok: false,
      reason: "candidate-refused",
      failure: {
        code: "INVALID_PRICE_BOOK",
        detail: "The book declares rule cabinet.private twice",
        id: "cabinet.private",
        placementId: "placement-7",
      },
    });

    expect(wire).toEqual([{ source: "pricing", code: "INVALID_PRICE_BOOK" }]);
  });
});
