import { type NextRequest, type NextResponse } from "next/server";

import { answerUnavailableOnFailure } from "@/lib/server/account/account-request";
import { crossSiteResponse } from "@/lib/server/account/account-responses";
import { isCrossSiteRequest } from "@/lib/server/cross-site-request";
import { openKitchenForStaff } from "@/lib/server/staff/staff-kitchens";

// Pinned, not defaulted: the Postgres driver cannot run on Edge. Dynamic, since the answer is the cookie's.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * One client's kitchen, read-only, for staff (M8B Lot 3 plan, E-L3-2; ADR 0173). A kitchen its client hid is read; an
 * unknown, malformed or client-deleted id gets the one refusal. The kitchen is sent only after its audit row has
 * committed, and a failure to record is `503` with no kitchen data.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  if (isCrossSiteRequest(request)) return crossSiteResponse();
  const { id } = await params;
  return answerUnavailableOnFailure("staff-kitchen", () =>
    openKitchenForStaff({
      cookies: request.cookies,
      headers: request.headers,
      designId: id,
    }),
  );
}
