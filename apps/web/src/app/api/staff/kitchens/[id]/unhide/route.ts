import { type NextRequest, type NextResponse } from "next/server";

import { answerUnavailableOnFailure } from "@/lib/server/account/account-request";
import { crossSiteResponse } from "@/lib/server/account/account-responses";
import { isCrossSiteRequest } from "@/lib/server/cross-site-request";
import {
  STAFF_WRITE_EVENTS,
  unhideKitchenAsStaff,
} from "@/lib/server/staff/staff-kitchen-actions";

// Pinned, not defaulted: the Postgres driver cannot run on Edge. Dynamic, since the answer is the cookie's.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Makes a kitchen its client hid visible to its client again, for staff (ADR 0173). It clears
 * the hide mark and nothing else, and commits with its audit row or not at all. It takes no body, so the cross-site
 * check stands in for the body checks, as it does on the client's hide; the request is never read.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  if (isCrossSiteRequest(request)) return crossSiteResponse();
  const { id } = await params;
  return answerUnavailableOnFailure(STAFF_WRITE_EVENTS.unhide, () =>
    unhideKitchenAsStaff({
      cookies: request.cookies,
      headers: request.headers,
      designId: id,
    }),
  );
}
