import {
  applyChanges,
  planBulkChange,
  type BulkTarget,
  type DraftChange,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { defaultSizePriceMinor } from "./cabinet-list-facts";
import type { CabinetRuleFacts } from "./cabinet-list-model";
import { priceDashboardCatalogue } from "./price-dashboard-catalogue";

// What the bulk dialog tells before anything is sent: the counts the action touches, one cabinet's price before and after,
// and why an action that would be refused would be. All of it is `planBulkChange` run on the candidate book (the
// active one with the draft applied), so the preview and the server's plan read the same prices. The server
// answers one code, `PERCENT_OUT_OF_RANGE`, for three different things: a percentage past the action's bounds, a scaled price
// past what a cabinet may cost, and an action whose every price rounds back to what it is. This is where they are told apart.

export interface BulkExample {
  readonly name: string;
  readonly widthMm: number;
  readonly beforeMinor: number;
  readonly afterMinor: number;
}

export type BulkPreview =
  | {
      readonly kind: "ready";
      readonly cabinetCount: number;
      readonly priceCount: number;
      readonly example: BulkExample;
    }
  /** Every scaled price rounds back to the one it is: the server would refuse the action as `PERCENT_OUT_OF_RANGE`. */
  | { readonly kind: "nothing-changes" }
  | { readonly kind: "no-cabinets" }
  /** A cabinet's price would be zero or less; the cabinet is named when it can be found. */
  | {
      readonly kind: "price-not-positive";
      readonly cabinetName: string | undefined;
    }
  | { readonly kind: "price-too-large" }
  | { readonly kind: "cannot-apply" };

export interface BulkPreviewRequest {
  readonly candidate: PriceBook;
  readonly rows: readonly CabinetRuleFacts[];
  readonly target: BulkTarget;
  readonly percent: number;
}

export function previewBulk(request: BulkPreviewRequest): BulkPreview {
  const plan = planOf(request.candidate, request.target, request.percent);
  if (plan.kind === "planned") return previewOfPlan(request, plan);
  switch (plan.code) {
    case "NO_CABINETS_SELECTED":
      return { kind: "no-cabinets" };
    case "PRICE_WOULD_BE_NEGATIVE":
      return {
        kind: "price-not-positive",
        cabinetName: cabinetRefusedForPrice(request)?.name,
      };
    case "PERCENT_OUT_OF_RANGE":
      return { kind: "price-too-large" };
    default:
      return { kind: "cannot-apply" };
  }
}

function planOf(book: PriceBook, target: BulkTarget, percent: number) {
  return planBulkChange({
    book,
    catalog: priceDashboardCatalogue(),
    target,
    percent,
  });
}

type PlannedBulk = Extract<ReturnType<typeof planOf>, { kind: "planned" }>;

function previewOfPlan(
  request: BulkPreviewRequest,
  plan: PlannedBulk,
): BulkPreview {
  if (plan.changed.amountCount === 0) return { kind: "nothing-changes" };
  const example = exampleOf(request, plan);
  if (example === undefined) return { kind: "cannot-apply" };
  return {
    kind: "ready",
    cabinetCount: plan.scope.ruleCount,
    priceCount: plan.scope.amountCount,
    example,
  };
}

/** The plan's prices as the draft would hold them: a cabinet address and a value are a change, as the route stores them. */
function changesOf(plan: PlannedBulk): readonly DraftChange[] {
  return plan.changes.map(
    ({ address, value }) => ({ address, value }) as DraftChange,
  );
}

/** One cabinet of the action, with its price before and after: the first whose price moves, else the first. */
function exampleOf(
  { candidate, rows }: BulkPreviewRequest,
  plan: PlannedBulk,
): BulkExample | undefined {
  const scaled = applyChanges(candidate, changesOf(plan));
  if (!scaled.ok) return undefined;
  const examples = rows.flatMap((row): BulkExample[] => {
    const isInPlan = plan.changes.some(
      ({ address }) => address.ruleId === row.ruleId,
    );
    const afterMinor = defaultSizePriceMinor(scaled.book, row.ruleId);
    const beforeMinor = defaultSizePriceMinor(candidate, row.ruleId);
    if (!isInPlan || afterMinor === undefined || beforeMinor === undefined) {
      return [];
    }
    return [
      {
        name: row.name,
        widthMm: row.widths.defaultMm,
        beforeMinor,
        afterMinor,
      },
    ];
  });
  return (
    examples.find(
      ({ beforeMinor, afterMinor }) => beforeMinor !== afterMinor,
    ) ?? examples[0]
  );
}

/** The cabinet a refusal for a non-positive price is about: the first of the action's whose own plan is refused for it. */
function cabinetRefusedForPrice({
  candidate,
  rows,
  target,
  percent,
}: BulkPreviewRequest): CabinetRuleFacts | undefined {
  return rows.find((row) => {
    if (row.isCustomerSupplied || !isInTarget(row, target)) return false;
    const alone = planOf(
      candidate,
      { scope: "selection", ruleIds: [row.ruleId] },
      percent,
    );
    return alone.kind === "refused" && alone.code === "PRICE_WOULD_BE_NEGATIVE";
  });
}

function isInTarget(row: CabinetRuleFacts, target: BulkTarget): boolean {
  switch (target.scope) {
    case "all":
      return true;
    case "group":
      return row.group === target.groupCode;
    case "selection":
      return target.ruleIds.includes(row.ruleId);
  }
}
