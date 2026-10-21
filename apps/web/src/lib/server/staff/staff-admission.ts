import "server-only";

import type { NextResponse } from "next/server";

import type { Capability } from "@lemnaria/configurator-domain";

import {
  reportAccountEvent,
  type AccountEvent,
} from "@/lib/server/account/account-log";
import {
  forbiddenResponse,
  unauthenticatedResponse,
} from "@/lib/server/account/account-responses";
import {
  readCurrentSessionOrThrow,
  touchCurrentSession,
  type SignedInSession,
} from "@/lib/server/account/current-session";
import { requireCapability } from "@/lib/server/account/require-capability";
import type { SessionCookieReader } from "@/lib/server/account/session-cookie";

export type StaffAdmission =
  | { readonly kind: "admitted"; readonly session: SignedInSession }
  | { readonly kind: "refused"; readonly response: NextResponse };

/**
 * The one admission every staff route makes: the session by the variant that throws (a store that is down is the
 * caller's `503`, never an anonymous reading), then the capability. `401` is no live session, `403` a live session
 * without the capability (a client, or a staff address not yet confirmed).
 *
 * An admitted session is marked seen before any bucket or store is asked, so staff who only read stay signed in for
 * their idle lifetime. The mark is best-effort and never changes the answer; a refused request marks nothing.
 */
export async function admitStaff({
  cookies,
  event,
  capability,
}: {
  cookies: SessionCookieReader;
  event: AccountEvent;
  capability: Capability;
}): Promise<StaffAdmission> {
  const session = await readCurrentSessionOrThrow(cookies);
  const check = requireCapability(session, capability);
  if (check.kind === "allowed" && session.kind === "signed-in") {
    await touchCurrentSession(cookies);
    return { kind: "admitted", session };
  }
  reportAccountEvent({ event, outcome: "refused" });
  const isForbidden = check.kind === "refused" && check.refusal === "forbidden";
  return {
    kind: "refused",
    response: isForbidden ? forbiddenResponse() : unauthenticatedResponse(),
  };
}
