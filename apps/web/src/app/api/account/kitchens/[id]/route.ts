import { type NextRequest, type NextResponse } from "next/server";

import {
  answerUnavailableOnFailure,
  readGuardedBody,
} from "@/lib/server/account/account-request";
import { crossSiteResponse } from "@/lib/server/account/account-responses";
import {
  deleteOwnKitchen,
  renameOwnKitchen,
} from "@/lib/server/account/kitchen-mutations";
import { sessionThatMayEditOwnKitchens } from "@/lib/server/account/own-kitchen-session";
import { isCrossSiteRequest } from "@/lib/server/cross-site-request";

// Pinned, not defaulted: the Postgres driver cannot run on Edge. Dynamic, since the answer is the cookie's.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Renames one of the signed-in client's kitchens (M8B Lot 2, E2). Steps 1 to 4 of the common order are the route's:
 * origin, media type, bounded body, then the session and `design.edit.own`. `renameOwnKitchen` owns the rest. The name
 * is the only member read; the account is the session's.
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const body = await readGuardedBody(request);
  if (body.kind === "refused") return body.response;
  const { id } = await params;
  return answerUnavailableOnFailure("kitchen-rename", async () => {
    const own = await sessionThatMayEditOwnKitchens({
      cookies: request.cookies,
      event: "kitchen-rename",
    });
    if (own.kind === "refused") return own.response;
    return renameOwnKitchen({
      session: own.session,
      designId: id,
      bodyText: body.text,
      headers: request.headers,
    });
  });
}

/**
 * Deletes one of the signed-in client's unsent kitchens from their list (M8B Lot 2, E4): a mark, never a physical
 * delete, and the share link stops with it. It takes no body, so the cross-site check stands in for the body checks,
 * as it does on the claim; the request is never read.
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  if (isCrossSiteRequest(request)) return crossSiteResponse();
  const { id } = await params;
  return answerUnavailableOnFailure("kitchen-delete", async () => {
    const own = await sessionThatMayEditOwnKitchens({
      cookies: request.cookies,
      event: "kitchen-delete",
    });
    if (own.kind === "refused") return own.response;
    return deleteOwnKitchen({
      session: own.session,
      designId: id,
      headers: request.headers,
    });
  });
}
