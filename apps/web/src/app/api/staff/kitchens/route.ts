import { type NextRequest, type NextResponse } from "next/server";

import { answerUnavailableOnFailure } from "@/lib/server/account/account-request";
import { crossSiteResponse } from "@/lib/server/account/account-responses";
import { isCrossSiteRequest } from "@/lib/server/cross-site-request";
import { listKitchensForStaff } from "@/lib/server/staff/staff-kitchens";

// Pinned, not defaulted: the Postgres driver cannot run on Edge. Dynamic, since the answer is the cookie's.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One page of every client's kitchens, for staff (M8B Lot 3 plan, E-L3-1; ADR 0173). It changes no kitchen. The common
 * order after the cross-site check, the read limit, the session, `design.read.any` and the query, then the account's page
 * bucket, which fails closed, is `listKitchensForStaff`'s; the page is sent only after its audit row has committed. A
 * store that cannot be read is `503`, never `401`.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (isCrossSiteRequest(request)) return crossSiteResponse();
  return answerUnavailableOnFailure("staff-kitchens", () =>
    listKitchensForStaff({
      cookies: request.cookies,
      headers: request.headers,
      searchParams: request.nextUrl.searchParams,
    }),
  );
}
