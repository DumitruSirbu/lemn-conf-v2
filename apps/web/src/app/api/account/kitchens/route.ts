import { type NextRequest, type NextResponse } from "next/server";

import { answerUnavailableOnFailure } from "@/lib/server/account/account-request";
import {
  answerOfReadJudgement,
  crossSiteResponse,
  forbiddenResponse,
  invalidRequestResponse,
  kitchenListResponse,
  unauthenticatedResponse,
} from "@/lib/server/account/account-responses";
import { listKitchensOf } from "@/lib/server/account/account-kitchens";
import { readCurrentSessionOrThrow } from "@/lib/server/account/current-session";
import { readCursorParameter } from "@/lib/server/account/kitchen-cursor";
import { requireCapability } from "@/lib/server/account/require-capability";
import { isCrossSiteRequest } from "@/lib/server/cross-site-request";
import { judgeReadRequest } from "@/lib/server/rate-limit/judge-read-request";

// Pinned, not defaulted: the Postgres driver cannot run on Edge. Dynamic, since the answer is the cookie's.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One page of the signed-in client's kitchens, newest first (M8B Lot 2 plan, E1). It changes nothing. The order is the
 * plan's common one: the cross-site check, the read limit (counted before any session is read, so a refusal is the same
 * for every caller), the session, the capability, then the cursor. The account is the session's and no request member
 * names one or sets a page size. A store that cannot be read is `503`, never `401`: the editor reads an anonymous
 * answer as an expired session.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (isCrossSiteRequest(request)) return crossSiteResponse();
  const limited = answerOfReadJudgement(
    await judgeReadRequest(request.headers),
  );
  if (limited !== undefined) return limited;
  return answerUnavailableOnFailure("kitchens", () => listForSession(request));
}

async function listForSession(request: NextRequest): Promise<NextResponse> {
  const session = await readCurrentSessionOrThrow(request.cookies);
  const check = requireCapability(session, "design.read.own");
  if (check.kind === "refused") {
    return check.refusal === "forbidden"
      ? forbiddenResponse()
      : unauthenticatedResponse();
  }
  if (session.kind !== "signed-in") return unauthenticatedResponse();
  const cursor = readCursorParameter(request.nextUrl.searchParams);
  if (cursor.kind === "invalid") return invalidRequestResponse();
  return kitchenListResponse(
    await listKitchensOf({
      accountId: session.accountId,
      after: cursor.kind === "after" ? cursor.cursor : undefined,
    }),
  );
}
