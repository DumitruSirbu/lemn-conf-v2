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
  if (scope === "everywhere") {
    await endEverySessionOfPresentedAccount({ response, request });
  } else {
    await endSession({ response, presentedCookies: request.cookies });
  }
  return response;
}

/**
 * "Everywhere" fails closed: the session is read by the variant that throws, so a store that is down is answered `503`
 * (by the caller's `answerUnavailableOnFailure`) and never read as anonymous, which would end only the presented
 * session and still answer `204` as if every session of the account were gone. A session that reads as anonymous
 * because the store says it is not live has nothing to end beyond the presented cookie.
 */
async function endEverySessionOfPresentedAccount({
  response,
  request,
}: {
  response: NextResponse;
  request: NextRequest;
}): Promise<void> {
  const session = await readCurrentSessionOrThrow(request.cookies);
  if (session.kind === "signed-in") {
    // The account is the session's own, as the server read it: no id the request carried is ever an input.
    await endAllSessions({ response, accountId: session.accountId });
  } else {
    await endSession({ response, presentedCookies: request.cookies });
  }
}
