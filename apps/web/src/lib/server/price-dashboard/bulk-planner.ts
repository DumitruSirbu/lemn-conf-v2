import "server-only";

import type { AddressOfKind, PriceBook } from "@lemnaria/configurator-domain";

import type { BulkTarget } from "@/lib/server/price-dashboard/draft-requests";
import type { BulkRefusalCode } from "@/price-dashboard/price-dashboard-wire-contract";

// What scales a book's cabinet prices by a percentage is lane M's `bulk-change.ts` (M2: A-14's `r10(amount × (100 + p) / 100)`
// over a scope, and the four price groups derived from the catalogue band). That wave is not merged, and this application
// does not carry domain arithmetic in the meantime. The route is written against this seam: it hands a planner the candidate
// book (the active book with the draft applied, so the prices a person sees are the ones scaled) and takes back the cabinet
// price changes, or the code the action was refused for. Until M2 supplies one, the planner is the unavailable one and the
// route answers `503`, after its guards, its capability, its bucket and its body have all been judged.

/** A cabinet price set to a value; the route gives it its group and its `bulk`. */
export interface PlannedCabinetPrice {
  readonly address: AddressOfKind<"cabinet" | "cabinet-size">;
  readonly value: number;
}

export type BulkPlan =
  | {
      readonly kind: "planned";
      readonly changes: readonly PlannedCabinetPrice[];
    }
  | { readonly kind: "refused"; readonly code: BulkRefusalCode };

export interface BulkPlanner {
  plan(request: {
    readonly book: PriceBook;
    readonly target: BulkTarget;
    readonly percent: number;
  }): BulkPlan;
}

class BulkPlannerUnavailableError extends Error {
  constructor() {
    super("No bulk planner is installed: the bulk action waits for M2.");
    this.name = "BulkPlannerUnavailableError";
  }
}

const UNAVAILABLE_BULK_PLANNER: BulkPlanner = Object.freeze({
  plan: () => {
    throw new BulkPlannerUnavailableError();
  },
});

/** The planner of this process. M2's replaces the unavailable one here and nowhere else. */
export function getBulkPlanner(): BulkPlanner {
  return UNAVAILABLE_BULK_PLANNER;
}
