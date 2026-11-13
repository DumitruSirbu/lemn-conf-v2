import { type NextRequest, type NextResponse } from "next/server";

import { answerUnavailableOnFailure } from "@/lib/server/account/account-request";
import { crossSiteResponse } from "@/lib/server/account/account-responses";
import { isCrossSiteRequest } from "@/lib/server/cross-site-request";
import {
  PRICE_READ_EVENT,
  readDashboardForStaff,
} from "@/lib/server/price-dashboard/price-dashboard-service";
import { staffHeadRefusedResponse } from "@/lib/server/staff/staff-responses";

// Pinned, not defaulted: the Postgres driver cannot run on Edge. Dynamic, since the answer is the cookie's.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The price dashboard's state for an administrator: the active version with its book and availability, and the draft
 * beside it (ADR 0173, ADR 0178). It holds no customer data and no usage counts. Every read commits a
 * `price-catalogue-viewed` row first, the account's bucket fails closed, and a store that cannot be read is `503`.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (isCrossSiteRequest(request)) return crossSiteResponse();
  return answerUnavailableOnFailure(PRICE_READ_EVENT, () =>
    readDashboardForStaff({
      cookies: request.cookies,
      headers: request.headers,
    }),
  );
}

/** Declared so the framework does not run `GET` for it: that would spend a bucket and write a row for a request that
 *  wants no body. */
export function HEAD(): NextResponse {
  return staffHeadRefusedResponse();
}
