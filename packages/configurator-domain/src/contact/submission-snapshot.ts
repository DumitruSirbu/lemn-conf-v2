import { DesignSchema, type Design } from "../design.js";
import {
  describeSchemaIssues,
  type SchemaIssueShape,
} from "../failure-text.js";
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

// What a submission stores of the kitchen: the canonical document and the design priced under the book of
// the version asked for. No contact field and no rounded figure is part of it; rounding is a screen's.

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

/** What was handed in is not a design. The caller's defect, so it is thrown and is not a fourth refusal;
 *  it names the shape of what failed (paths and codes), never a value. */
export class SubmissionDesignInvalidError extends Error {
  constructor(issues: readonly SchemaIssueShape[]) {
    super(
      `The submission's design is not a design: ${describeSchemaIssues(issues)}`,
    );
    this.name = "SubmissionDesignInvalidError";
  }
}

/**
 * The snapshot is kept for good and nothing re-prices it, so it rests on no caller's validation: the design
 * is parsed, and it is the PARSED design that is priced and serialised, so the stored document always parses
 * again. A value that is not a design throws `SubmissionDesignInvalidError`.
 */
export function snapshotSubmission(
  request: SubmissionSnapshotRequest,
): SubmissionSnapshotResult {
  const design = parseDesign(request.design);
  const eligibility = judgeSubmissionEligibility({
    design,
    overflowingPlacementIds: findOverflowingPlacementIds(design),
    pricing: priceDesign({ ...request, design, selections: design.settings }),
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

/** The wire schema only, `DesignSchema`, which every stored document passes. The catalogue's rules are not
 *  applied: the review does not hold a design to them either, so a snapshot that did would refuse a kitchen
 *  the screen offers. */
function parseDesign(candidate: unknown): Design {
  const parsed = DesignSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new SubmissionDesignInvalidError(parsed.error.issues);
  }
  return parsed.data;
}
