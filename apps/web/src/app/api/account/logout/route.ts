import { type NextRequest, type NextResponse } from "next/server";

import {
  answerUnavailableOnFailure,
  parseJsonObject,
  readGuardedBody,
  textMemberOf,
} from "@/lib/server/account/account-request";
import {
  invalidRequestResponse,
  loggedOutResponse,
} from "@/lib/server/account/account-responses";
import { readCurrentSession } from "@/lib/server/account/current-session";
import {
  endAllSessions,
  endSession,
} from "@/lib/server/account/session-lifecycle";

// Pinned, not defaulted: the Postgres driver cannot run on Edge.
export const runtime = "nodejs";

const LOGOUT_SCOPES = ["this-device", "everywhere"] as const;
type LogoutScope = (typeof LOGOUT_SCOPES)[number];

/**
 * Signing out (M8B plan, flow 4). The cross-site check, the media type and the bounded body come first, and nothing is
 * changed for a request that fails them; there is no `GET`, so the framework answers one with `405`. No challenge and
 * no limit: it asks for nothing costly and a session is the only thing it can end. `204` is the one success, the
 * cookie cleared on the same response, and with no session there is nothing to end.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await readGuardedBody(request);
  if (body.kind === "refused") return body.response;
  const scope = scopeOf(body.text);
  if (scope === undefined) return invalidRequestResponse();
  return answerUnavailableOnFailure("logout", () => logOut(scope, request));
}

function scopeOf(bodyText: string): LogoutScope | undefined {
  const body = parseJsonObject(bodyText);
  const scope = body === undefined ? undefined : textMemberOf(body, "scope");
  return LOGOUT_SCOPES.find((known) => known === scope);
}

async function logOut(
  scope: LogoutScope,
  request: NextRequest,
): Promise<NextResponse> {
  const response = loggedOutResponse();
  const session =
    scope === "everywhere"
      ? await readCurrentSession(request.cookies)
      : undefined;
  if (session?.kind === "signed-in") {
    // The account is the session's own, as the server read it: no id the request carried is ever an input.
    await endAllSessions({ response, accountId: session.accountId });
  } else {
    // Also the way "everywhere" ends when the session read as anonymous. `readCurrentSession` fails open, so a store
    // that is down reads as anonymous; revoking the presented session then throws, and that is answered `503`
    // instead of a `204` that would claim every session was ended.
    await endSession({ response, presentedCookies: request.cookies });
  }
  return response;
}
