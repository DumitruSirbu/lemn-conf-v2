import { type NextRequest, type NextResponse } from "next/server";

import { answerUnavailableOnFailure } from "@/lib/server/account/account-request";
import { crossSiteResponse } from "@/lib/server/account/account-responses";
import { hideOwnKitchen } from "@/lib/server/account/kitchen-mutations";
import { sessionThatMayEditOwnKitchens } from "@/lib/server/account/own-kitchen-session";
import { isCrossSiteRequest } from "@/lib/server/cross-site-request";

// Pinned, not defaulted: the Postgres driver cannot run on Edge. Dynamic, since the answer is the cookie's.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Hides one of the signed-in client's sent kitchens from their list (M8B Lot 2, E5): a mark, and the share link stops
 * with it (O7). It takes no body, so the cross-site check stands in for the body checks, as it does on the claim; the
 * request is never read.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  if (isCrossSiteRequest(request)) return crossSiteResponse();
  const { id } = await params;
  return answerUnavailableOnFailure("kitchen-hide", async () => {
    const own = await sessionThatMayEditOwnKitchens({
      cookies: request.cookies,
      event: "kitchen-hide",
    });
    if (own.kind === "refused") return own.response;
    return hideOwnKitchen({
      session: own.session,
      designId: id,
      headers: request.headers,
    });
  });
}
