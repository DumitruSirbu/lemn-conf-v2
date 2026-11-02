// The cabinet list's facts are worked out from the dashboard's state: a row's default-size price is the domain's preview of the book,
// the pending one is the preview of the book with the draft applied, and a price that moved with no change naming its cabinet
// is a defect that keeps the list from being drawn.
import { describe, expect, it } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  type CabinetPriceRule,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import {
  defaultSizePriceMinor,
  deriveCabinetList,
} from "@/price-dashboard/cabinet-list-facts";
import type { CabinetRuleFacts } from "@/price-dashboard/cabinet-list-model";

import {
  BASE_CABINET_RULE,
  cabinetNamesOf,
  pageOf,
  stateOf,
} from "./dashboard-state-fixture";

const ANCHOR_RAISED_MINOR = 60_000;

function anchorChange(ruleId: string, value: number): DraftChange {
  return { address: { kind: "cabinet", ruleId, field: "anchorMinor" }, value };
}

function readyRows(changes: readonly DraftChange[]): CabinetRuleFacts[] {
  const reading = deriveCabinetList(pageOf(changes));
  if (reading.kind !== "ready")
    throw new Error("the sample list is unreadable");
  return [...reading.input.rules];
}

function ruleOf(rows: readonly CabinetRuleFacts[], ruleId: string) {
  const found = rows.find((row) => row.ruleId === ruleId);
  if (found === undefined) throw new Error(`no row for ${ruleId}`);
  return found;
}

describe("the rows of the sample book", () => {
  it("has one row per cabinet rule of the book, in the book's order", () => {
    const rows = readyRows([]);

    expect(rows.map((row) => row.ruleId)).toEqual(
      SAMPLE_PRICE_BOOK.cabinetRules.map((rule) => rule.ruleId),
    );
  });

  it("prices every supplied row, and a customer-supplied row not at all", () => {
    for (const row of readyRows([])) {
      expect(row.price === undefined, row.ruleId).toBe(row.isCustomerSupplied);
      expect(row.anchorField === undefined, row.ruleId).toBe(
        row.isCustomerSupplied,
      );
    }
  });

  it("leaves every pending price equal to its active one while the draft is empty", () => {
    for (const row of readyRows([])) {
      expect(row.price?.pendingMinor, row.ruleId).toBe(row.price?.activeMinor);
    }
  });

  it("quotes each row at its catalogue default width", () => {
    const rows = readyRows([]);

    expect(ruleOf(rows, BASE_CABINET_RULE).price?.widthMm).toBe(
      ruleOf(rows, BASE_CABINET_RULE).widths.defaultMm,
    );
  });

  it("marks a default the owner has yet to confirm as proposed, from the catalogue's own field", () => {
    const rows = readyRows([]);

    expect(ruleOf(rows, "cabinet.hood").widths.isDefaultProposed).toBe(true);
    expect(ruleOf(rows, BASE_CABINET_RULE).widths.isDefaultProposed).toBe(
      false,
    );
  });

  it("names a row from the names it is given, and by its build id when it is given none", () => {
    const named = deriveCabinetList(pageOf([]));
    const nameless = deriveCabinetList({ ...pageOf([]), cabinetNames: {} });

    expect(named.kind === "ready" && named.input.rules[0]?.name).toBe(
      cabinetNamesOf(SAMPLE_PRICE_BOOK)["base-cabinet"],
    );
    expect(nameless.kind === "ready" && nameless.input.rules[0]?.name).toBe(
      "base-cabinet",
    );
  });
});

describe("a draft that moves one anchor", () => {
  it("shows the new price on that row and no other, with the active one beside it", () => {
    const before = readyRows([]);
    const after = readyRows([
      anchorChange(BASE_CABINET_RULE, ANCHOR_RAISED_MINOR),
    ]);

    for (const row of after) {
      const unchanged = ruleOf(before, row.ruleId).price;
      if (row.ruleId === BASE_CABINET_RULE) {
        expect(row.price?.activeMinor).toBe(unchanged?.activeMinor);
        expect(row.price?.pendingMinor).not.toBe(unchanged?.activeMinor);
      } else {
        expect(row.price?.pendingMinor, row.ruleId).toBe(
          unchanged?.activeMinor,
        );
      }
    }
  });

  it("starts the edit field from the book's anchor with the draft applied, and remembers the active one", () => {
    const row = ruleOf(
      readyRows([anchorChange(BASE_CABINET_RULE, ANCHOR_RAISED_MINOR)]),
      BASE_CABINET_RULE,
    );

    expect(row.anchorField).toEqual({
      address: {
        kind: "cabinet",
        ruleId: BASE_CABINET_RULE,
        field: "anchorMinor",
      },
      pendingMinor: ANCHOR_RAISED_MINOR,
      activeMinor: expect.any(Number) as number,
    });
    expect(row.anchorField?.activeMinor).not.toBe(ANCHOR_RAISED_MINOR);
  });

  it("prices a row through the same preview a bulk example uses", () => {
    const raised = deriveCabinetList(
      pageOf([anchorChange(BASE_CABINET_RULE, ANCHOR_RAISED_MINOR)]),
    );
    if (raised.kind !== "ready") throw new Error("unreadable");

    expect(defaultSizePriceMinor(raised.candidate, BASE_CABINET_RULE)).toBe(
      ruleOf([...raised.input.rules], BASE_CABINET_RULE).price?.pendingMinor,
    );
  });
});

describe("a draft that names no cabinet", () => {
  it("leaves every cabinet's pending price equal to its active one when it holds only the depth rule", () => {
    const rows = readyRows([{ address: { kind: "depth-rule" }, value: 18 }]);

    for (const row of rows) {
      expect(row.price?.pendingMinor, row.ruleId).toBe(row.price?.activeMinor);
    }
  });
});

describe("a state the list cannot be drawn from", () => {
  it("is unreadable when the draft does not apply to the book", () => {
    const reading = deriveCabinetList({
      ...pageOf([]),
      state: stateOf([anchorChange("cabinet.no-such-rule", 1_000)]),
    });

    expect(reading.kind).toBe("unreadable");
  });

  it("is unreadable when the book prices a cabinet the catalogue does not hold", () => {
    const [first] = SAMPLE_PRICE_BOOK.cabinetRules;
    if (first === undefined) throw new Error("the sample book has no rule");
    const stranger: CabinetPriceRule = {
      ...first,
      ruleId: "cabinet.stranger",
      buildId: "stranger",
    };
    const state = stateOf();
    const reading = deriveCabinetList({
      cabinetNames: {},
      state: {
        ...state,
        active: {
          ...state.active,
          book: {
            ...SAMPLE_PRICE_BOOK,
            cabinetRules: [...SAMPLE_PRICE_BOOK.cabinetRules, stranger],
          },
        },
      },
    });

    expect(reading.kind).toBe("unreadable");
  });
});
