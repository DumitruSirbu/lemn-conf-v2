import type {
  ApplyChangesResult,
  BookRefusal,
} from "@lemnaria/configurator-domain";

import type { CandidateRefusalWire } from "@/price-dashboard/price-dashboard-wire-contract";

// A refused candidate as the wire states it. Every member is copied one by one from a closed code, an id the book
// holds, a width or a field. A `PricingFailure`'s `detail` is English developer text and is never sent, and a refusal
// is never spread, so a member the domain adds later reaches no body until it is named here.

type RefusedApplication = Exclude<ApplyChangesResult, { readonly ok: true }>;

export function refusalsOfApplication(
  refused: RefusedApplication,
): readonly CandidateRefusalWire[] {
  if (refused.reason === "candidate-refused") {
    return [{ source: "pricing", code: refused.failure.code }];
  }
  return refused.refusals.map(({ index, code }) => ({
    source: "changes",
    index,
    code,
  }));
}

export function refusalOfBook(refusal: BookRefusal): CandidateRefusalWire {
  switch (refusal.code) {
    case "NO_RULE_FOR_BODY":
    case "DUPLICATE_RULE_FOR_BODY":
      return {
        source: "catalogue",
        code: refusal.code,
        buildId: refusal.buildId,
      };
    case "UNKNOWN_FORMULA_SHAPE":
    case "PRICE_NOT_EXACT":
    case "STRUCTURAL_ROW_NOT_PER_SIZE":
    case "NO_BUILT_WIDTH":
    case "CUSTOMER_ROW_PRICED":
      return {
        source: "catalogue",
        code: refusal.code,
        ruleId: refusal.ruleId,
        buildId: refusal.buildId,
      };
    case "ANCHOR_WIDTH_MISMATCH":
      return {
        source: "catalogue",
        code: refusal.code,
        ruleId: refusal.ruleId,
        buildId: refusal.buildId,
        anchorWidthMm: refusal.anchorWidthMm,
        ...(refusal.expectedWidthMm === undefined
          ? {}
          : { expectedWidthMm: refusal.expectedWidthMm }),
      };
    case "SIZE_LIST_MISMATCH":
      return {
        source: "catalogue",
        code: refusal.code,
        ruleId: refusal.ruleId,
        buildId: refusal.buildId,
        listedWidthsMm: [...refusal.listedWidthsMm],
        expectedWidthsMm: [...refusal.expectedWidthsMm],
      };
    case "PRICE_NOT_POSITIVE":
    case "PRICE_TOO_LARGE":
      return {
        source: "catalogue",
        code: refusal.code,
        ruleId: refusal.ruleId,
        buildId: refusal.buildId,
        widthMm: refusal.widthMm,
        heightMm: refusal.heightMm,
        field: refusal.field,
      };
    case "PERCENT_OUT_OF_RANGE":
      return { source: "catalogue", code: refusal.code, item: refusal.item };
  }
}
