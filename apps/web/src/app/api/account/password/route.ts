import { type NextRequest, type NextResponse } from "next/server";

import {
  answerUnavailableOnFailure,
  readGuardedBody,
} from "@/lib/server/account/account-request";
import { changeOwnPassword } from "@/lib/server/account/change-password";
import { sessionThatMayManageOwnAccount } from "@/lib/server/account/own-account-session";

// Pinned, not defaulted: the Postgres driver and `node:crypto` cannot run on Edge.
export const runtime = "nodejs";

/**
 * A signed-in account changes its password (M8B Lot 2, E7). Steps 1 to 4 of the common order are the route's: origin,
 * media type, bounded body, then the session and `account.manage.own`. There is no challenge (a live session and the
 * current password are the proof) and no network bucket: the account's own password-check buckets are counted by
 * `changeOwnPassword` before any hash is computed. A success sets the replacing session's cookie on its own response.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await readGuardedBody(request);
  if (body.kind === "refused") return body.response;
  return answerUnavailableOnFailure("password-change", async () => {
    const own = await sessionThatMayManageOwnAccount({
      cookies: request.cookies,
      event: "password-change",
    });
    if (own.kind === "refused") return own.response;
    return changeOwnPassword({
      session: own.session,
      bodyText: body.text,
      headers: request.headers,
      presentedCookies: request.cookies,
    });
  });
}
