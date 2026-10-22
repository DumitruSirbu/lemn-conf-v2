import { type NextRequest, type NextResponse } from "next/server";

import {
  answerUnavailableOnFailure,
  readGuardedBody,
} from "@/lib/server/account/account-request";
import { hideOwnKitchen } from "@/lib/server/account/kitchen-mutations";
import { sessionThatMayEditOwnKitchens } from "@/lib/server/account/own-kitchen-session";

// Pinned, not defaulted: the Postgres driver cannot run on Edge. Dynamic, since the answer is the cookie's.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Hides one of the signed-in client's sent kitchens from their list (M8B Lot 2, E5): a mark, and the share link stops
 * with it (O7). It takes no body, but it asks for the same guards as the other account writes: the origin, a JSON media
 * type (an empty body is fine) and a bounded body, which is read and not looked at.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const body = await readGuardedBody(request);
  if (body.kind === "refused") return body.response;
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
