import { type NextRequest, type NextResponse } from "next/server";

import { answerUnavailableOnFailure } from "@/lib/server/account/account-request";
import { crossSiteResponse } from "@/lib/server/account/account-responses";
import { isCrossSiteRequest } from "@/lib/server/cross-site-request";
import {
  PRICE_READ_EVENT,
  readVersionForStaff,
} from "@/lib/server/price-dashboard/price-dashboard-service";
import { staffHeadRefusedResponse } from "@/lib/server/staff/staff-responses";

// Pinned, not defaulted: the Postgres driver cannot run on Edge. Dynamic, since the answer is the cookie's.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * One published version with its book and the changes it carried, read-only, for an administrator (ADR 0178). An id no
 * store could hold and an unknown id get one answer, `404`, and write no row; a version is served only after its
 * `price-catalogue-viewed` row has committed.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  if (isCrossSiteRequest(request)) return crossSiteResponse();
  const { id } = await params;
  return answerUnavailableOnFailure(PRICE_READ_EVENT, () =>
    readVersionForStaff({
      cookies: request.cookies,
      headers: request.headers,
      versionId: id,
    }),
  );
}

/** Declared so the framework does not run `GET` for it: that would write an audit row and spend a bucket for a request
 *  that wants no body. */
export function HEAD(): NextResponse {
  return staffHeadRefusedResponse();
}
