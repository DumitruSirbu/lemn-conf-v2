import { type NextRequest, type NextResponse } from "next/server";

import {
  answerUnavailableOnFailure,
  readGuardedBody,
} from "@/lib/server/account/account-request";
import { requestEmailChange } from "@/lib/server/account/change-email";
import { sessionThatMayManageOwnAccount } from "@/lib/server/account/own-account-session";

// Pinned, not defaulted: the Postgres driver and `node:crypto` cannot run on Edge.
export const runtime = "nodejs";

/**
 * A signed-in account asks to change its address (M8B Lot 2, E8). Steps 1 to 4 of the common order are the route's:
 * origin, media type, bounded body, then the session and `account.manage.own`. There is no challenge (a live session
 * and the current password are the proof) and no network bucket: the account's own buckets are counted by
 * `requestEmailChange` before any hash is computed. The answer is `202` for every address that can be asked for.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await readGuardedBody(request);
  if (body.kind === "refused") return body.response;
  return answerUnavailableOnFailure("email-change", async () => {
    const own = await sessionThatMayManageOwnAccount({
      cookies: request.cookies,
      event: "email-change",
    });
    if (own.kind === "refused") return own.response;
    return requestEmailChange({
      session: own.session,
      bodyText: body.text,
      headers: request.headers,
    });
  });
}
