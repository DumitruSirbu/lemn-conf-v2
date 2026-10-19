import { type NextRequest, type NextResponse } from "next/server";

import {
  answerUnavailableOnFailure,
  readGuardedBody,
} from "@/lib/server/account/account-request";
import {
  answerOfReadJudgement,
  crossSiteResponse,
} from "@/lib/server/account/account-responses";
import { sessionThatMayManageOwnAccount } from "@/lib/server/account/own-account-session";
import {
  readOwnProfile,
  saveOwnProfile,
} from "@/lib/server/account/update-profile";
import { isCrossSiteRequest } from "@/lib/server/cross-site-request";
import { judgeReadRequest } from "@/lib/server/rate-limit/judge-read-request";

// Pinned, not defaulted: the Postgres driver cannot run on Edge. Dynamic, since the answer is the cookies'.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The signed-in account's own optional details (M8B Lot 2, E6). It changes nothing. The cross-site check comes first,
 * then the read limit (a refusal is the same for everyone), then the session and `account.manage.own`. Only the
 * person's own name, address and phone leave, `no-store`.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (isCrossSiteRequest(request)) return crossSiteResponse();
  const limited = answerOfReadJudgement(
    await judgeReadRequest(request.headers),
  );
  if (limited !== undefined) return limited;
  return answerUnavailableOnFailure("profile", async () => {
    const own = await sessionThatMayManageOwnAccount({
      cookies: request.cookies,
      event: "profile",
    });
    return own.kind === "refused" ? own.response : readOwnProfile(own.session);
  });
}

/**
 * Saving the optional details (M8B Lot 2, E6). Steps 1 to 4 of the common order are the route's: origin, media type,
 * bounded body, then the session and its capability. No challenge: a live session is the proof. `saveOwnProfile`
 * owns the rest.
 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const body = await readGuardedBody(request);
  if (body.kind === "refused") return body.response;
  return answerUnavailableOnFailure("profile", async () => {
    const own = await sessionThatMayManageOwnAccount({
      cookies: request.cookies,
      event: "profile",
    });
    if (own.kind === "refused") return own.response;
    return saveOwnProfile({
      session: own.session,
      bodyText: body.text,
      headers: request.headers,
    });
  });
}
