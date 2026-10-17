import "server-only";

import { reportAccountEvent } from "@/lib/server/account/account-log";
import { getDesignClaimRepository } from "@/lib/server/account/design-claim-instance";
import {
  isClientHolding,
  type CapabilityHolder,
} from "@/lib/server/account/require-capability";
import {
  readVisitorHash,
  type VisitorCookieReader,
} from "@/lib/server/visitor";

// The designs a signed-in account may take from the browser it is using (ADR 0169 D8). Which designs those are is the
// visitor cookie's alone, and whether the account may take them is its role (the client's alone, L11 review F1) and verification, read by the server. A
// request never says either.

const NO_CLAIMABLE_DESIGNS = 0;

/** What counting is asked with: the account as the server knows it, and the cookies of the request. */
export interface ClaimableDesignsAsk {
  readonly holder: CapabilityHolder;
  readonly cookies: VisitorCookieReader;
}

/**
 * The visitor hash the account may claim under, or `undefined` when there is nothing to ask: the account does not hold
 * `design.edit.own` (an address not yet confirmed holds none) or is not a client account (staff never claim), or the browser has no well-formed visitor cookie.
 */
export function claimableVisitorHashOf({
  holder,
  cookies,
}: ClaimableDesignsAsk): string | undefined {
  return isClientHolding(holder, "design.edit.own")
    ? readVisitorHash(cookies)
    : undefined;
}

/** How many designs this browser holds that the account may claim. A failed count is thrown for the caller to answer. */
export async function countClaimableDesigns(
  ask: ClaimableDesignsAsk,
): Promise<number> {
  const visitorHash = claimableVisitorHashOf(ask);
  if (visitorHash === undefined) return NO_CLAIMABLE_DESIGNS;
  return getDesignClaimRepository().countClaimable(visitorHash);
}

/**
 * The count a sign-in tells the client. The client is already signed in, and a count that could not be made must not
 * undo that, so a failure is written down and reads as none; the claim route answers the same question later.
 */
export async function countClaimableDesignsAtSignIn(
  ask: ClaimableDesignsAsk,
): Promise<number> {
  try {
    return await countClaimableDesigns(ask);
  } catch {
    reportAccountEvent({ event: "claim", outcome: "unavailable" });
    return NO_CLAIMABLE_DESIGNS;
  }
}
