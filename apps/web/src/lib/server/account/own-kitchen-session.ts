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

// Who may change the kitchens an account owns: any live session whose address is confirmed and that holds
// `design.edit.own`, which only a client does. The account is the session's alone; no request member can name another.

/** The session that may edit its own kitchens, or the answer for a request that may not. */
export type OwnKitchenSession =
  | { readonly kind: "may-edit"; readonly session: SignedInSession }
  | { readonly kind: "refused"; readonly response: NextResponse };

/**
 * Steps 3 and 4 of the common order. The session is read by the variant that throws: a store that is down is the
 * caller's `503` and never an anonymous reading. `401` is no live session, `403` a live session without the capability
 * (a staff account, or an address not yet confirmed).
 */
export async function sessionThatMayEditOwnKitchens({
  cookies,
  event,
}: {
  cookies: SessionCookieReader;
  event: AccountEvent;
}): Promise<OwnKitchenSession> {
  const session = await readCurrentSessionOrThrow(cookies);
  const check = requireCapability(session, "design.edit.own");
  if (check.kind === "allowed" && session.kind === "signed-in") {
    return { kind: "may-edit", session };
  }
  reportAccountEvent({ event, outcome: "refused" });
  const isForbidden = check.kind === "refused" && check.refusal === "forbidden";
  return {
    kind: "refused",
    response: isForbidden ? forbiddenResponse() : unauthenticatedResponse(),
  };
}
