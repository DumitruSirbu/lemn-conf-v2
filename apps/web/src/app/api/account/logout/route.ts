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
  unauthenticatedResponse,
} from "@/lib/server/account/account-responses";
import { readCurrentSessionOrThrow } from "@/lib/server/account/current-session";
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
 * no limit: it asks for nothing costly and a session is the only thing it can end. `204` is the success, the cookie
 * cleared on the same response. "This device" with no session has nothing to end and answers `204` too; "everywhere"
 * with no live session answers `401` (cookie cleared all the same), because `204` there would say that every session of
 * an account has ended when no account was identified.
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
  if (scope === "everywhere") return endEverySessionOfPresentedAccount(request);
  const response = loggedOutResponse();
  await endSession({ response, presentedCookies: request.cookies });
  return response;
}

/**
 * "Everywhere" fails closed: the session is read by the variant that throws, so a store that is down is answered `503`
 * (by the caller's `answerUnavailableOnFailure`) and never read as anonymous, which would end only the presented
 * session and still answer `204` as if every session of the account were gone (ADR 0172 Amendment A, item 3). For the
 * same reason a session that reads as anonymous because the store says it is not live is answered `401`: the presented
 * session, if it was one, is ended and the cookie cleared, but no account was identified, so no account's sessions
 * are claimed gone.
 */
async function endEverySessionOfPresentedAccount(
  request: NextRequest,
): Promise<NextResponse> {
  const session = await readCurrentSessionOrThrow(request.cookies);
  if (session.kind === "signed-in") {
    const response = loggedOutResponse();
    // The account is the session's own, as the server read it: no id the request carried is ever an input.
    await endAllSessions({ response, accountId: session.accountId });
    return response;
  }
  const response = unauthenticatedResponse();
  await endSession({ response, presentedCookies: request.cookies });
  return response;
}
