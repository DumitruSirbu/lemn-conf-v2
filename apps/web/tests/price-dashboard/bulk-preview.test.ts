// What the bulk dialog tells before anything is sent is the domain's plan on the candidate book. The server answers one code,
// `PERCENT_OUT_OF_RANGE`, for a percentage past the bounds, a scaled price past what a cabinet may cost and an action whose
// every price rounds back to what it is; the preview is where they are told apart, and where the cabinet that makes a
// price non-positive is named.
import { describe, expect, it } from "vitest";

import {
  applyChanges,
  MAX_CABINET_AMOUNT_MINOR,
  planBulkChange,
  SAMPLE_PRICE_BOOK,
  type DraftChange,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { previewBulk } from "@/price-dashboard/bulk-preview";
import {
  defaultSizePriceMinor,
  deriveCabinetList,
} from "@/price-dashboard/cabinet-list-facts";
import type { CabinetRuleFacts } from "@/price-dashboard/cabinet-list-model";
import { priceDashboardCatalogue } from "@/price-dashboard/price-dashboard-catalogue";

import { BASE_CABINET_RULE, pageOf } from "./dashboard-state-fixture";

const SMALL_ANCHOR_MINOR = 2_000;
const RAISED_ANCHOR_MINOR = 500_000;

function field(ruleId: string, name: string, value: number): DraftChange {
  return {
    address: { kind: "cabinet", ruleId, field: name as "anchorMinor" },
    value,
  } as DraftChange;
}

/** The book and the rows of a list whose draft holds these changes. */
function listAfter(changes: readonly DraftChange[]): {
  readonly candidate: PriceBook;
  readonly rows: readonly CabinetRuleFacts[];
} {
  const derived = deriveCabinetList(pageOf(changes));
  if (derived.kind !== "ready") throw new Error("the list is unreadable");
  return { candidate: derived.candidate, rows: derived.input.rules };
}

describe("an action that changes prices", () => {
  it("counts the cabinets and prices the plan changes, not those it only scales back to what they are, over every cabinet", () => {
    const { candidate, rows } = listAfter([]);
    const plan = planBulkChange({
      book: candidate,
      catalog: priceDashboardCatalogue(),
      target: { scope: "all" },
      percent: 5,
    });

    const preview = previewBulk({
      candidate,
      rows,
      target: { scope: "all" },
      percent: 5,
    });

    expect(plan.kind).toBe("planned");
    if (plan.kind !== "planned") return;
    expect(
      plan.changed.amountCount,
      "5 % must leave some amounts rounding back, or the counts below are not told apart",
    ).toBeLessThan(plan.scope.amountCount);
    expect(preview).toMatchObject({
      kind: "ready",
      cabinetCount: plan.changed.ruleCount,
      priceCount: plan.changed.amountCount,
    });
  });

  it("counts fewer cabinets for one group than for all, and none the customer supplies", () => {
    const { candidate, rows } = listAfter([]);

    const all = previewBulk({
      candidate,
      rows,
      target: { scope: "all" },
      percent: 5,
    });
    const base = previewBulk({
      candidate,
      rows,
      target: { scope: "group", groupCode: "base" },
      percent: 5,
    });

    expect(all.kind === "ready" && base.kind === "ready").toBe(true);
    if (all.kind !== "ready" || base.kind !== "ready") return;
    expect(base.cabinetCount).toBeLessThan(all.cabinetCount);
    expect(base.cabinetCount).toBe(
      rows.filter((row) => row.group === "base" && !row.isCustomerSupplied)
        .length,
    );
  });

  it("shows one cabinet's price before and after, the after being the price of the book the plan makes", () => {
    const { candidate, rows } = listAfter([]);

    const preview = previewBulk({
      candidate,
      rows,
      target: { scope: "selection", ruleIds: [BASE_CABINET_RULE] },
      percent: 10,
    });

    expect(preview.kind).toBe("ready");
    if (preview.kind !== "ready") return;
    const plan = planBulkChange({
      book: candidate,
      catalog: priceDashboardCatalogue(),
      target: { scope: "selection", ruleIds: [BASE_CABINET_RULE] },
      percent: 10,
    });
    const scaled = applyChanges(
      candidate,
      plan.kind === "planned"
        ? plan.changes.map(
            ({ address, value }) => ({ address, value }) as DraftChange,
          )
        : [],
    );
    expect(preview.example.beforeMinor).toBe(
      defaultSizePriceMinor(candidate, BASE_CABINET_RULE),
    );
    expect(preview.example.afterMinor).toBe(
      scaled.ok ? defaultSizePriceMinor(scaled.book, BASE_CABINET_RULE) : -1,
    );
    expect(preview.example.afterMinor).toBeGreaterThan(
      preview.example.beforeMinor,
    );
  });

  it("scales the candidate, not the active book: a pending anchor is what the example starts from", () => {
    const raised = field(BASE_CABINET_RULE, "anchorMinor", RAISED_ANCHOR_MINOR);
    const { candidate, rows } = listAfter([raised]);

    const preview = previewBulk({
      candidate,
      rows,
      target: { scope: "selection", ruleIds: [BASE_CABINET_RULE] },
      percent: 10,
    });

    expect(preview.kind === "ready" && preview.example.beforeMinor).toBe(
      defaultSizePriceMinor(candidate, BASE_CABINET_RULE),
    );
    expect(defaultSizePriceMinor(candidate, BASE_CABINET_RULE)).not.toBe(
      defaultSizePriceMinor(SAMPLE_PRICE_BOOK, BASE_CABINET_RULE),
    );
  });
});

describe("an action every price of which rounds back to what it is", () => {
  /** One cabinet whose every amount is so small that 1 % of it rounds away to the ten lei. */
  function tinyCabinet() {
    return listAfter([
      field(BASE_CABINET_RULE, "anchorMinor", SMALL_ANCHOR_MINOR),
      field(BASE_CABINET_RULE, "perStepWiderMinor", 0),
      field(BASE_CABINET_RULE, "perStepNarrowerMinor", 0),
      field(BASE_CABINET_RULE, "perExtraDoorLeafMinor", 0),
    ]);
  }

  it("is nothing-changes, which the server would refuse as PERCENT_OUT_OF_RANGE and so must not be worded as one", () => {
    const { candidate, rows } = tinyCabinet();
    const target = {
      scope: "selection",
      ruleIds: [BASE_CABINET_RULE],
    } as const;
    const plan = planBulkChange({
      book: candidate,
      catalog: priceDashboardCatalogue(),
      target,
      percent: 1,
    });

    expect(previewBulk({ candidate, rows, target, percent: 1 })).toEqual({
      kind: "nothing-changes",
    });
    // The premise: the domain's plan is `planned`, not refused, so the route's own check is what turns it into the code.
    expect(plan).toMatchObject({
      kind: "planned",
      changed: { amountCount: 0 },
    });
  });

  it("becomes a change at a percentage large enough to move the ten lei", () => {
    const { candidate, rows } = tinyCabinet();

    const preview = previewBulk({
      candidate,
      rows,
      target: { scope: "selection", ruleIds: [BASE_CABINET_RULE] },
      percent: 100,
    });

    expect(preview.kind).toBe("ready");
  });
});

describe("an action that cannot be applied", () => {
  it("names the cabinet whose price the draft already holds at zero, says it was so before the percentage, and names no other", () => {
    const { candidate, rows } = listAfter([
      field(BASE_CABINET_RULE, "anchorMinor", 0),
      field(BASE_CABINET_RULE, "perStepWiderMinor", 0),
      field(BASE_CABINET_RULE, "perStepNarrowerMinor", 0),
      field(BASE_CABINET_RULE, "perExtraDoorLeafMinor", 0),
    ]);

    const preview = previewBulk({
      candidate,
      rows,
      target: { scope: "all" },
      percent: 5,
    });

    expect(preview).toEqual({
      kind: "price-not-positive",
      cabinetName: rows.find((row) => row.ruleId === BASE_CABINET_RULE)?.name,
      isHeldAlready: true,
    });
  });

  it("names the cabinet a percentage drives to zero, without saying its price was zero already", () => {
    const { candidate, rows } = listAfter([
      field(BASE_CABINET_RULE, "anchorMinor", SMALL_ANCHOR_MINOR),
      field(BASE_CABINET_RULE, "perStepWiderMinor", 0),
      field(BASE_CABINET_RULE, "perStepNarrowerMinor", 0),
      field(BASE_CABINET_RULE, "perExtraDoorLeafMinor", 0),
    ]);

    const preview = previewBulk({
      candidate,
      rows,
      target: { scope: "all" },
      percent: -90,
    });

    expect(preview).toEqual({
      kind: "price-not-positive",
      cabinetName: rows.find((row) => row.ruleId === BASE_CABINET_RULE)?.name,
    });
  });

  it("says a scaled price is too large, and not that the percentage is out of range", () => {
    const { candidate, rows } = listAfter([
      field(BASE_CABINET_RULE, "anchorMinor", MAX_CABINET_AMOUNT_MINOR - 1_000),
    ]);

    const preview = previewBulk({
      candidate,
      rows,
      target: { scope: "selection", ruleIds: [BASE_CABINET_RULE] },
      percent: 300,
    });

    expect(preview).toEqual({ kind: "price-too-large" });
  });

  it("says no cabinet is chosen for a selection of none", () => {
    const { candidate, rows } = listAfter([]);

    expect(
      previewBulk({
        candidate,
        rows,
        target: { scope: "selection", ruleIds: [] },
        percent: 5,
      }),
    ).toEqual({ kind: "no-cabinets" });
  });
});
