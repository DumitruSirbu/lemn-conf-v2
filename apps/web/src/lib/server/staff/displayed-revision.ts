import { isDesignRevision, type DesignRevision } from "@lemnaria/persistence";

import type { StaffSeenRefusalCode } from "@/staff/staff-kitchens-wire-contract";

export type DisplayedRevisionJudgement =
  | { readonly ok: true; readonly revision: DesignRevision }
  | { readonly ok: false; readonly code: StaffSeenRefusalCode };

/**
 * Judges the revision a page says it displayed by its shape alone: 1 to 19 digits, no leading zero (so not `0`), and,
 * at 19 digits, no wider than a `bigint`, compared as text. The revision stays opaque: it is never parsed to a number,
 * and whether it is ahead of the kitchen's is the store's SQL to say (ADR 0178 A-12, F9).
 */
export function judgeDisplayedRevision(
  value: unknown,
): DisplayedRevisionJudgement {
  if (typeof value !== "string") return { ok: false, code: "MISSING_VALUE" };
  if (!isDesignRevision(value)) {
    return { ok: false, code: "NOT_A_REVISION" };
  }
  return { ok: true, revision: value };
}
