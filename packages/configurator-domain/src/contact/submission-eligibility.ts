import type { Design } from "../design.js";
import type { PricedDesign, PricingResult } from "../pricing/price-lines.js";

// The one place the rule for "may this kitchen be submitted" is written (ADR 0148 decisions 1 and 2): the
// review's call to action and the server's snapshot both ask it, so a screen cannot offer what the endpoint
// refuses. Fit is passed in as the fit query's answer, never measured here.

export type SubmissionRefusal =
  | {
      readonly code: "BODIES_PAST_WALL";
      /** Exactly the fit query's answer, in its order. */
      readonly placementIds: readonly string[];
    }
  | { readonly code: "NO_CABINET" }
  | { readonly code: "PRICING_FAILED" };

/** An allowed kitchen was priced, so it carries the price it was judged on. */
export type SubmissionEligibility =
  | { readonly kind: "allowed"; readonly priced: PricedDesign }
  | { readonly kind: "refused"; readonly refusal: SubmissionRefusal };

export interface SubmissionFacts {
  readonly design: Design;
  /** `findOverflowingPlacementIds(design)`, asked by the caller. */
  readonly overflowingPlacementIds: readonly string[];
  readonly pricing: PricingResult;
}

/**
 * One refusal at a time, the first the customer can act on: a body past its wall, then nothing Lemnaria
 * supplies, then a price that cannot be computed. Fit is judged whatever pricing answered, and a design with
 * no body is `NO_CABINET` even when pricing failed: that is known from the design alone.
 */
export function judgeSubmissionEligibility(
  facts: SubmissionFacts,
): SubmissionEligibility {
  if (facts.overflowingPlacementIds.length > 0) {
    return refused({
      code: "BODIES_PAST_WALL",
      placementIds: facts.overflowingPlacementIds,
    });
  }
  if (holdsNothingToSupply(facts)) return refused({ code: "NO_CABINET" });
  if (!facts.pricing.ok) return refused({ code: "PRICING_FAILED" });
  return { kind: "allowed", priced: facts.pricing.priced };
}

/**
 * Whether every body in this priced design is one the customer supplies (ADR 0107 decision 2), which
 * includes holding none. Read off each line's published supplier, never its amount: a manufacturer body
 * can price to zero and is still something Lemnaria supplies.
 */
export function holdsNothingLemnariaSupplies(priced: PricedDesign): boolean {
  return priced.lines.every(
    (line) => line.kind !== "cabinet" || line.suppliedBy === "customer",
  );
}

/** Without a price there is no supplier to read, so the design's own bodies decide. */
function holdsNothingToSupply(facts: SubmissionFacts): boolean {
  return facts.pricing.ok
    ? holdsNothingLemnariaSupplies(facts.pricing.priced)
    : facts.design.placements.length === 0;
}

function refused(refusal: SubmissionRefusal): SubmissionEligibility {
  return { kind: "refused", refusal };
}
