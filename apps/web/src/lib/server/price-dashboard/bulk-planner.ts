import "server-only";

import {
  planBulkChange,
  type BulkCounts,
  type PlannedCabinetPrice,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import type { BulkRefusalCode } from "@/price-dashboard/price-dashboard-wire-contract";
import type { BulkTarget } from "@/lib/server/price-dashboard/draft-requests";
import { shippedCatalogue } from "@/lib/server/price-dashboard/shipped-catalogue";

// What scales a book's cabinet prices by a percentage is lane M's `planBulkChange` (M2: A-14's `r10(amount × (100 + p) /
// 100)` over a scope, the four price groups derived from the catalogue band). This module is the seam the bulk route is
// written against: it hands the domain the candidate book (the active book with the draft applied, so the prices a person
// sees are the ones scaled) and the shipped catalogue, and takes back the cabinet price changes, or the code the action
// was refused for. The plan lists every row it scaled, unchanged ones included: the route drops the rows whose scaled
// amount equals the candidate's, refuses a bulk action that leaves none (A-14, ruling R2-Q7), and refuses 0 % before the
// planner is asked.

export type { PlannedCabinetPrice };

/**
 * What a planner answers: the cabinet prices to set (the route gives each its group and its `bulk`), or the code the
 * action was refused for, always one of the wire's. The domain's plan also counts what is in scope and what changes; the
 * route counts from the changes it keeps, so those two are optional here.
 */
export type BulkPlan =
  | {
      readonly kind: "planned";
      readonly changes: readonly PlannedCabinetPrice[];
      readonly scope?: BulkCounts;
      readonly changed?: BulkCounts;
    }
  | { readonly kind: "refused"; readonly code: BulkRefusalCode };

export interface BulkPlanner {
  plan(request: {
    readonly book: PriceBook;
    readonly target: BulkTarget;
    readonly percent: number;
  }): BulkPlan;
}

const DOMAIN_BULK_PLANNER: BulkPlanner = Object.freeze({
  plan: ({
    book,
    target,
    percent,
  }: Parameters<BulkPlanner["plan"]>[0]): BulkPlan =>
    planBulkChange({ book, catalog: shippedCatalogue(), target, percent }),
});

/** The planner of this process. */
export function getBulkPlanner(): BulkPlanner {
  return DOMAIN_BULK_PLANNER;
}
