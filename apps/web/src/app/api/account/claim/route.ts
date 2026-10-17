import { type NextRequest, type NextResponse } from "next/server";

import { reportAccountEvent } from "@/lib/server/account/account-log";
import { answerUnavailableOnFailure } from "@/lib/server/account/account-request";
import {
  answerOfJudgement,
  claimableResponse,
  claimedResponse,
  crossSiteResponse,
  forbiddenResponse,
  unauthenticatedResponse,
} from "@/lib/server/account/account-responses";
import {
  claimableVisitorHashOf,
  countClaimableDesigns,
} from "@/lib/server/account/claimable-designs";
import {
  readCurrentSession,
  type SignedInSession,
} from "@/lib/server/account/current-session";
import { getDesignClaimRepository } from "@/lib/server/account/design-claim-instance";
import {
  isClientHolding,
  requireCapability,
  type CapabilityRefusal,
} from "@/lib/server/account/require-capability";
import { isCrossSiteRequest } from "@/lib/server/cross-site-request";
import { judgeAccountSubject } from "@/lib/server/rate-limit/judge-account-request";

// Pinned, not defaulted: the Postgres driver cannot run on Edge. Dynamic, since the answer is the cookies'.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_DESIGNS = 0;

/** The session that may claim, or the answer for a request that may not. */
type ClaimingSession =
  | { readonly kind: "may-claim"; readonly session: SignedInSession }
  | { readonly kind: "refused"; readonly response: NextResponse };

/**
 * How many designs the signed-in account could claim from this browser (M8B plan, flow 8). It changes nothing, so the
 * client can ask before it asks the person. The account is the server's own session; the designs are the visitor
 * cookie's. Without a well-formed visitor cookie the answer is none.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const claiming = await sessionThatMayClaim(request);
  if (claiming.kind === "refused") return claiming.response;
  return answerUnavailableOnFailure("claim", async () =>
    claimableResponse(
      await countClaimableDesigns({
        holder: claiming.session,
        cookies: request.cookies,
      }),
    ),
  );
}

/**
 * The claim itself, made only on this `POST`: it is the client's confirmation, and nothing else claims. It has no body to
 * read, so the cross-site check stands in for the body checks. The account is the session's and no request member can
 * name another; the update gives the browser's unclaimed designs to it and leaves the browser's own access as it was.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const claiming = await sessionThatMayClaim(request);
  if (claiming.kind === "refused") return claiming.response;
  return answerUnavailableOnFailure("claim", () =>
    claimForSession(claiming.session, request),
  );
}

/** Steps 1 and 3 of the common order: the cross-site check first, so nothing is read for a request from another site,
 *  then the session, its capability and its role: only a client account claims, a staff account is answered `403`. A session that cannot be read is anonymous, which is the less-access reading. */
async function sessionThatMayClaim(
  request: NextRequest,
): Promise<ClaimingSession> {
  if (isCrossSiteRequest(request)) return refused(crossSiteResponse());
  const session = await readCurrentSession(request.cookies);
  const check = requireCapability(session, "design.edit.own");
  if (check.kind === "refused") return refusedForCapability(check.refusal);
  if (session.kind !== "signed-in")
    return refusedForCapability("unauthenticated");
  // Staff accounts hold `design.edit.own` too, but claiming is the client's alone (ADR 0169 D8, L11 review F1).
  return isClientHolding(session, "design.edit.own")
    ? { kind: "may-claim", session }
    : refusedForCapability("forbidden");
}

async function claimForSession(
  session: SignedInSession,
  request: NextRequest,
): Promise<NextResponse> {
  const visitorHash = claimableVisitorHashOf({
    holder: session,
    cookies: request.cookies,
  });
  if (visitorHash === undefined) return claimedResponse(NO_DESIGNS);
  const limited = answerOfJudgement(
    await judgeAccountSubject({
      purpose: "claim",
      headers: request.headers,
      accountId: session.accountId,
    }),
  );
  if (limited !== undefined) return limited;
  const claimed = await getDesignClaimRepository().claimVisitorDesigns({
    visitorHash,
    accountId: session.accountId,
  });
  reportAccountEvent({ event: "claim", outcome: "succeeded" });
  return claimedResponse(claimed.length);
}

function refusedForCapability(refusal: CapabilityRefusal): ClaimingSession {
  reportAccountEvent({ event: "claim", outcome: "refused" });
  return refused(
    refusal === "forbidden" ? forbiddenResponse() : unauthenticatedResponse(),
  );
}

function refused(response: NextResponse): ClaimingSession {
  return { kind: "refused", response };
}
