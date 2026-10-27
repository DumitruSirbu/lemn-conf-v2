import type { PriceGroupCode } from "@lemnaria/configurator-domain";

import type {
  BulkPlan,
  BulkPlanner,
  PlannedCabinetPrice,
} from "@/lib/server/price-dashboard/bulk-planner";

// A stand-in for lane M's bulk planner (M2), which is not merged. It exists so the bulk route's own work (its guards, its
// body, the group it mints, the audit entry, the write) can be exercised; it is not an authority on A-14's rounding or on
// which cabinet is in which price group, and no test of the route asserts either. It scales an anchor or a listed size to
// the nearest ten lei, and calls a rule's group by the start of its build id.

export interface PlannerCall {
  readonly percent: number;
  readonly scope: string;
  readonly ruleIdCount: number;
}

export const plannerCalls: PlannerCall[] = [];

/** `true` makes the planner fail as the unavailable one does, so a test can show what the route does when none answers. */
export const plannerBehaviour = { isUnavailable: false };

export function resetTestBulkPlanner(): void {
  plannerCalls.length = 0;
  plannerBehaviour.isUnavailable = false;
}

const TEN_LEI_MINOR = 1_000;

function scaled(amountMinor: number, percent: number): number {
  return (
    Math.round((amountMinor * (100 + percent)) / 100 / TEN_LEI_MINOR) *
    TEN_LEI_MINOR
  );
}

function isInGroup(buildId: string, group: PriceGroupCode): boolean {
  return buildId.startsWith(group);
}

export const testBulkPlanner: BulkPlanner = {
  plan: ({ book, target, percent }): BulkPlan => {
    if (plannerBehaviour.isUnavailable) {
      throw new Error("The test planner is unavailable.");
    }
    plannerCalls.push({
      percent,
      scope: target.scope,
      ruleIdCount: target.scope === "selection" ? target.ruleIds.length : 0,
    });
    const changes: PlannedCabinetPrice[] = [];
    for (const rule of book.cabinetRules) {
      if (rule.suppliedBy === "customer") continue;
      if (
        target.scope === "group" &&
        !isInGroup(rule.buildId, target.groupCode)
      )
        continue;
      if (target.scope === "selection" && !target.ruleIds.includes(rule.ruleId))
        continue;
      const formula = rule.formula as {
        anchorMinor?: number;
        sizes?: readonly { widthMm: number; amountMinor: number }[];
      };
      if (formula.anchorMinor !== undefined) {
        changes.push({
          address: {
            kind: "cabinet",
            ruleId: rule.ruleId,
            field: "anchorMinor",
          },
          value: scaled(formula.anchorMinor, percent),
        });
      }
      for (const size of formula.sizes ?? []) {
        changes.push({
          address: {
            kind: "cabinet-size",
            ruleId: rule.ruleId,
            widthMm: size.widthMm,
          },
          value: scaled(size.amountMinor, percent),
        });
      }
    }
    if (changes.some(({ value }) => value < 0)) {
      return { kind: "refused", code: "PRICE_WOULD_BE_NEGATIVE" };
    }
    return { kind: "planned", changes };
  },
};

export function bulkPlannerModule() {
  return { getBulkPlanner: () => testBulkPlanner };
}
