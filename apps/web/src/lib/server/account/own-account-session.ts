import "server-only";

import type { NextResponse } from "next/server";

import { reportAccountEvent } from "@/lib/server/account/account-log";
import type { AccountEvent } from "@/lib/server/account/account-log";
import {
  forbiddenResponse,
  unauthenticatedResponse,
} from "@/lib/server/account/account-responses";
import {
  readCurrentSessionOrThrow,
  type SignedInSession,
} from "@/lib/server/account/current-session";
import { requireCapability } from "@/lib/server/account/require-capability";
import type { SessionCookieReader } from "@/lib/server/account/session-cookie";

// Who may change their own sign-in details (profile, password, e-mail): any live session that holds
// `account.manage.own`. The account is the session's alone; no request member can name another.

/** The session that may manage its own account, or the answer for a request that may not. */
export type OwnAccountSession =
  | { readonly kind: "may-manage"; readonly session: SignedInSession }
  | { readonly kind: "refused"; readonly response: NextResponse };

/**
 * Steps 3 and 4 of the common order. The session is read by the variant that throws: a store that is down is the
 * caller's `503` and never an anonymous reading, which would send a signed-in person to "your session expired".
 * `401` is no live session, `403` a live session without the capability.
 */
export async function sessionThatMayManageOwnAccount({
  cookies,
  event,
}: {
  cookies: SessionCookieReader;
  event: AccountEvent;
}): Promise<OwnAccountSession> {
  const session = await readCurrentSessionOrThrow(cookies);
  const check = requireCapability(session, "account.manage.own");
  if (check.kind === "allowed" && session.kind === "signed-in") {
    return { kind: "may-manage", session };
  }
  reportAccountEvent({ event, outcome: "refused" });
  const isForbidden = check.kind === "refused" && check.refusal === "forbidden";
  return {
    kind: "refused",
    response: isForbidden ? forbiddenResponse() : unauthenticatedResponse(),
  };
}
