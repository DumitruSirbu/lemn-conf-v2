import { type NextRequest, type NextResponse } from "next/server";

import { answerUnavailableOnFailure } from "@/lib/server/account/account-request";
import { crossSiteResponse } from "@/lib/server/account/account-responses";
import { isCrossSiteRequest } from "@/lib/server/cross-site-request";
import {
  PRICE_READ_EVENT,
  listVersionsForStaff,
} from "@/lib/server/price-dashboard/price-dashboard-service";
import { staffHeadRefusedResponse } from "@/lib/server/staff/staff-responses";

// Pinned, not defaulted: the Postgres driver cannot run on Edge. Dynamic, since the answer is the cookie's.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One page of the published versions, newest first, for an administrator (ADR 0178). Each page is served only after its
 * `price-catalogue-viewed` row has committed, and the account's bucket fails closed. No other route serves a version.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (isCrossSiteRequest(request)) return crossSiteResponse();
  return answerUnavailableOnFailure(PRICE_READ_EVENT, () =>
    listVersionsForStaff({
      cookies: request.cookies,
      headers: request.headers,
      searchParams: request.nextUrl.searchParams,
    }),
  );
}

/** Declared so the framework does not run `GET` for it: that would write an audit row and spend a bucket for a request
 *  that wants no body. */
export function HEAD(): NextResponse {
  return staffHeadRefusedResponse();
}
