import { type NextRequest, type NextResponse } from "next/server";

import {
  answerUnavailableOnFailure,
  readGuardedBody,
} from "@/lib/server/account/account-request";
import { duplicateOwnKitchen } from "@/lib/server/account/kitchen-mutations";
import { sessionThatMayEditOwnKitchens } from "@/lib/server/account/own-kitchen-session";

// Pinned, not defaulted: the Postgres driver cannot run on Edge. Dynamic, since the answer is the cookie's.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Copies one of the signed-in client's kitchens (M8B Lot 2, E3). Steps 1 to 4 of the common order are the route's:
 * origin, media type, bounded body, then the session and `design.edit.own`. The copy counts the mint's per-network
 * bucket (ADR 0147) and the account's own copy bucket, in `duplicateOwnKitchen`.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const body = await readGuardedBody(request);
  if (body.kind === "refused") return body.response;
  const { id } = await params;
  return answerUnavailableOnFailure("kitchen-duplicate", async () => {
    const own = await sessionThatMayEditOwnKitchens({
      cookies: request.cookies,
      event: "kitchen-duplicate",
    });
    if (own.kind === "refused") return own.response;
    return duplicateOwnKitchen({
      session: own.session,
      designId: id,
      bodyText: body.text,
      headers: request.headers,
    });
  });
}
