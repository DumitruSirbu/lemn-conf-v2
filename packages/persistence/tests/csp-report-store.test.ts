import { describe, expect, it } from "vitest";

import {
  CSP_REPORT_CAPACITY,
  requireValidCspReportPlacement,
  requireValidCspReportRow,
  slotOf,
} from "../src/csp-report-store.js";
import {
  CSP_REPORT_CASES,
  columnsOf,
  rowAndPlacementOf,
} from "./support/csp-report-case-table.js";
import type { CspReportColumns } from "./support/csp-report-case-table.js";
import { aBareRow, aFullRow, markOf } from "./support/csp-report-fixtures.js";

function codeAccepts(columns: CspReportColumns): boolean {
  const { row, placement } = rowAndPlacementOf(columns);
  try {
    requireValidCspReportRow(row);
    requireValidCspReportPlacement(placement);
    return true;
  } catch {
    return false;
  }
}

function refusalOf(action: () => void): string {
  try {
    action();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("expected a refusal");
}

describe("the code's checks, against the table of cases the live suite sends the database", () => {
  it.each(CSP_REPORT_CASES)(
    "gives the verdict the table gives for $label",
    ({ overrides, isAccepted }) => {
      expect(codeAccepts(columnsOf(overrides))).toBe(isAccepted);
    },
  );

  it("holds both verdicts, so a table of only one kind would not be a test", () => {
    const verdicts = new Set(
      CSP_REPORT_CASES.map(({ isAccepted }) => isAccepted),
    );

    expect(verdicts).toEqual(new Set([true, false]));
  });
});

describe("what the table's regular expressions say and a copied JavaScript pattern would not", () => {
  it("refuses a host with a space, a tab, a control character and a backslash", () => {
    const hosts = ["a b", "a\tb", "a\u0001b", "a\\b"];

    expect(
      hosts.map((host) =>
        codeAccepts(columnsOf({ blocked: `https://${host}.example` })),
      ),
    ).toEqual([false, false, false, false]);
  });

  it("refuses non-ASCII white space and a C1 control, which a database may or may not count as space", () => {
    const hosts = ["a b", "a b", "a\u0085b"];

    expect(
      hosts.map((host) =>
        codeAccepts(columnsOf({ blocked: `https://${host}.example` })),
      ),
    ).toEqual([false, false, false]);
  });

  it("admits a literal bracket in a page, as the table's bracket expression does", () => {
    expect(codeAccepts(columnsOf({ page: "/[locale]/d/[id]" }))).toBe(true);
    expect(codeAccepts(columnsOf({ page: "/[locale]/d/x]y[z-" }))).toBe(true);
  });

  it("counts characters as the table does, not UTF-16 units", () => {
    const astral = "\u{1F600}";

    expect(
      codeAccepts(columnsOf({ blocked: `https://${astral.repeat(247)}` })),
    ).toBe(true);
    expect(
      codeAccepts(columnsOf({ blocked: `https://${astral.repeat(248)}` })),
    ).toBe(false);
  });
});

describe("a value that is not the type the row says", () => {
  it.each([
    ["a null source", { ...aFullRow(markOf("a")), source: null }],
    ["a numeric directive", { ...aFullRow(markOf("a")), directive: 7 }],
    ["a fractional line", { ...aFullRow(markOf("a")), line: 1.5 }],
    ["a text status", { ...aFullRow(markOf("a")), status: "200" }],
    [
      "a list for a mark",
      { ...aFullRow(markOf("a")), writerMark: [markOf("a")] },
    ],
  ])("is refused: %s", (_label, row) => {
    expect(() => {
      requireValidCspReportRow(row as never);
    }).toThrow(/^Refusing to record a CSP report/);
  });
});

describe("a refusal", () => {
  it("names the field and carries no value of the report", () => {
    const planted = "https://secret-token-abc123.example/path";

    const message = refusalOf(() => {
      requireValidCspReportRow({ ...aBareRow(markOf("a")), blocked: planted });
    });

    expect(message).toContain("blocked");
    expect(message).not.toContain("secret-token");
  });
});

describe("the ring's placement", () => {
  it("maps a number to its slot", () => {
    expect(
      [1, 9_999, 10_000, 10_001].map((number) =>
        slotOf(number, CSP_REPORT_CAPACITY),
      ),
    ).toEqual([1, 9_999, 0, 1]);
  });

  it("holds a placement to the capacity it is given", () => {
    expect(() => {
      requireValidCspReportPlacement({ slot: 3, reportNumber: 3 }, 3);
    }).toThrow(/slot/);
    expect(() => {
      requireValidCspReportPlacement({ slot: 0, reportNumber: 3 }, 3);
    }).not.toThrow();
  });
});
