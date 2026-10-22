import { type NextRequest, type NextResponse } from "next/server";

import { answerUnavailableOnFailure } from "@/lib/server/account/account-request";
import { crossSiteResponse } from "@/lib/server/account/account-responses";
import { isCrossSiteRequest } from "@/lib/server/cross-site-request";
import { readAuditLogForStaff } from "@/lib/server/staff/staff-audit-log";
import { staffHeadRefusedResponse } from "@/lib/server/staff/staff-responses";

// Pinned, not defaulted: the Postgres driver cannot run on Edge. Dynamic, since the answer is the cookie's.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One page of the staff audit log, for an administrator (ADR 0173). It changes no client data, but every page it serves
 * commits an `audit-viewed` row of its own. The account's page bucket fails closed. A store that cannot be read is
 * `503`, never `401`.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (isCrossSiteRequest(request)) return crossSiteResponse();
  return answerUnavailableOnFailure("staff-audit", () =>
    readAuditLogForStaff({
      cookies: request.cookies,
      headers: request.headers,
      searchParams: request.nextUrl.searchParams,
    }),
  );
}

/** Declared so the framework does not run `GET` for it: that would spend a bucket and read the log for a request that
 *  wants no body. */
export function HEAD(): NextResponse {
  return staffHeadRefusedResponse();
}
