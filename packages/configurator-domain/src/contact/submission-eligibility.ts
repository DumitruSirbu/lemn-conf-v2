import type { Design } from "../design.js";
import { boundedFailureReason } from "../failure-text.js";
import type {
  PricedDesign,
  PricingFailure,
  PricingResult,
} from "../pricing/price-lines.js";

// The one place the rule for "may this kitchen be submitted" is written (see ADR 0148): the review's call to
// action and the server's snapshot both ask it, so a screen cannot offer what the endpoint refuses. Fit is
// passed in as the fit query's answer, never measured here.

export type SubmissionRefusal =
  | {
      readonly code: "BODIES_PAST_WALL";
      /** Exactly the fit query's answer, in its order. */
      readonly placementIds: readonly string[];
    }
  | { readonly code: "NO_CABINET" }
  | {
      readonly code: "PRICING_FAILED";
      /** As `priceDesign` returned it, for the endpoint to log. It holds design data and no contact
       *  field, and no screen prints it. */
      readonly failure: PricingFailure;
    };

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

/** The facts handed to the rule cannot all be true: a defect in the caller, never a customer's refusal. */
export class SubmissionFactsContradictionError extends Error {
  constructor(detail: string) {
    super(
      `The submission facts contradict each other: ${boundedFailureReason(detail)}`,
    );
    this.name = "SubmissionFactsContradictionError";
  }
}

/**
 * One refusal at a time, the first the customer can act on: a body past its wall, then nothing Lemnaria
 * supplies, then a price that cannot be computed. Fit is judged whatever pricing answered, and a design with
 * no body is `NO_CABINET` even when pricing failed: that is known from the design alone.
 *
 * The rule believes the fit list it is handed, so it throws where the facts contradict each other. On the
 * server only `snapshotSubmission` puts the facts together, from one design; nothing that answers a request
 * calls this with a list of its own making (see ADR 0150).
 */
export function judgeSubmissionEligibility(
  facts: SubmissionFacts,
): SubmissionEligibility {
  assertFactsAgree(facts);
  if (facts.overflowingPlacementIds.length > 0) {
    return refused({
      code: "BODIES_PAST_WALL",
      placementIds: facts.overflowingPlacementIds,
    });
  }
  if (holdsNothingToSupply(facts)) return refused({ code: "NO_CABINET" });
  if (!facts.pricing.ok) {
    return refused({ code: "PRICING_FAILED", failure: facts.pricing.failure });
  }
  return { kind: "allowed", priced: facts.pricing.priced };
}

/**
 * Whether every body in this priced design is one the customer supplies, which includes holding none
 * (see ADR 0107). Read off each line's published supplier, never its amount: a manufacturer body
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

function assertFactsAgree(facts: SubmissionFacts): void {
  assertFitNamesOnlyHeldBodies(facts);
  assertFitMatchesThePrice(facts);
}

function assertFitNamesOnlyHeldBodies(facts: SubmissionFacts): void {
  const unheld = idsOnlyIn(
    facts.overflowingPlacementIds,
    facts.design.placements.map(({ id }) => id),
  );
  if (unheld.length > 0) {
    throw new SubmissionFactsContradictionError(
      `the fit list names bodies the design does not hold: ${unheld.join(", ")}`,
    );
  }
}

/** Only a priced design has a list of its own to differ from. */
function assertFitMatchesThePrice(facts: SubmissionFacts): void {
  if (!facts.pricing.ok) return;
  const priceFlags = facts.pricing.priced.overflowingPlacementIds;
  const differing = [
    ...idsOnlyIn(facts.overflowingPlacementIds, priceFlags),
    ...idsOnlyIn(priceFlags, facts.overflowingPlacementIds),
  ];
  if (differing.length > 0) {
    throw new SubmissionFactsContradictionError(
      `the fit list and the price's own list differ over: ${differing.join(", ")}`,
    );
  }
}

/** The ids `ids` holds that `others` does not. Sets, not sequences: the query's order and the display's
 *  differ and both are right. */
function idsOnlyIn(
  ids: readonly string[],
  others: readonly string[],
): readonly string[] {
  const known = new Set(others);
  return [...new Set(ids)].filter((id) => !known.has(id));
}

function refused(refusal: SubmissionRefusal): SubmissionEligibility {
  return { kind: "refused", refusal };
}
