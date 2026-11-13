import { type NextRequest, type NextResponse } from "next/server";

import { answerUnavailableOnFailure } from "@/lib/server/account/account-request";
import { crossSiteResponse } from "@/lib/server/account/account-responses";
import { isCrossSiteRequest } from "@/lib/server/cross-site-request";
import { openKitchenIn3dForStaff } from "@/lib/server/staff/staff-kitchens";
import { staffHeadRefusedResponse } from "@/lib/server/staff/staff-responses";

// Pinned, not defaulted: the Postgres driver cannot run on Edge. Dynamic, since the answer is the cookie's.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * One kitchen's design for the staff 3D view, and nothing else of the kitchen (ADR 0180). The design is sent only after
 * its `kitchen-viewed-3d` row has committed, and a failure to record is `503` with no design.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  if (isCrossSiteRequest(request)) return crossSiteResponse();
  const { id } = await params;
  return answerUnavailableOnFailure("staff-kitchen", () =>
    openKitchenIn3dForStaff({
      cookies: request.cookies,
      headers: request.headers,
      searchParams: request.nextUrl.searchParams,
      designId: id,
    }),
  );
}

/** Declared so the framework does not run `GET` for it: that would read a client's kitchen, write an audit row and
 *  spend a bucket for a request that wants no body. */
export function HEAD(): NextResponse {
  return staffHeadRefusedResponse();
}
