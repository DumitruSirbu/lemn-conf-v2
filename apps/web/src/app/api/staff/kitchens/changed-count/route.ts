import { type NextRequest, type NextResponse } from "next/server";

import { answerUnavailableOnFailure } from "@/lib/server/account/account-request";
import { crossSiteResponse } from "@/lib/server/account/account-responses";
import { isCrossSiteRequest } from "@/lib/server/cross-site-request";
import {
  STAFF_CHANGED_COUNT_EVENT,
  readChangedCountForStaff,
} from "@/lib/server/staff/staff-changed-count";
import { staffHeadRefusedResponse } from "@/lib/server/staff/staff-responses";

// Pinned, not defaulted: the Postgres driver cannot run on Edge. Dynamic, since the answer is the cookie's.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * How many sent kitchens changed after staff last saw them, for the menu's badge (ADR 0178 A-12). It changes nothing and
 * writes no audit row, the one staff read that does not: it answers a count alone. A store that cannot be read is
 * `503`, never `401`.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (isCrossSiteRequest(request)) return crossSiteResponse();
  return answerUnavailableOnFailure(STAFF_CHANGED_COUNT_EVENT, () =>
    readChangedCountForStaff({
      cookies: request.cookies,
      headers: request.headers,
    }),
  );
}

/** Declared so the framework does not run `GET` for it, which would read the count for a request that wants no body. */
export function HEAD(): NextResponse {
  return staffHeadRefusedResponse();
}
