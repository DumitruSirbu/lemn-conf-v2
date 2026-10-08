import {
  priceDesign,
  type PriceDesignRequest,
} from "../pricing/price-design.js";
import type { PricedDesign } from "../pricing/price-lines.js";
import { findOverflowingPlacementIds } from "../queries/overflowing-placements.js";
import { canonicalSerializeDesign } from "../serialize-design.js";

import {
  judgeSubmissionEligibility,
  type SubmissionRefusal,
} from "./submission-eligibility.js";

// What a submission stores of the kitchen (D7): the canonical document and the design priced under the book
// of the version asked for. No contact field and no rounded figure is part of it; rounding is a screen's.

/** `selections` are the design's own settings, as every price surface passes them. */
export type SubmissionSnapshotRequest = Omit<PriceDesignRequest, "selections">;

export interface SubmissionSnapshot {
  /** `canonicalSerializeDesign` of the design: the same bytes however its keys were ordered. */
  readonly document: string;
  /** Exactly as `priceDesign` returned it: every line, the exact total, the currency, the book's version,
   *  status and provisional flag, and the bodies past their wall. Nothing re-derived or rounded. */
  readonly priced: PricedDesign;
}

export type SubmissionSnapshotResult =
  | { readonly ok: true; readonly snapshot: SubmissionSnapshot }
  | { readonly ok: false; readonly refusal: SubmissionRefusal };

export function snapshotSubmission(
  request: SubmissionSnapshotRequest,
): SubmissionSnapshotResult {
  const { design } = request;
  const eligibility = judgeSubmissionEligibility({
    design,
    overflowingPlacementIds: findOverflowingPlacementIds(design),
    pricing: priceDesign({ ...request, selections: design.settings }),
  });
  if (eligibility.kind === "refused") {
    return { ok: false, refusal: eligibility.refusal };
  }
  return {
    ok: true,
    snapshot: {
      document: canonicalSerializeDesign(design),
      priced: eligibility.priced,
    },
  };
}
