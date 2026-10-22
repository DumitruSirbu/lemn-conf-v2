import "server-only";

import type { NextResponse } from "next/server";

import { reportAccountEvent } from "@/lib/server/account/account-log";
import { ABSOLUTE_LIFETIME_SECONDS_BY_ROLE } from "@/lib/server/account/session-lifetimes";
import {
  clearSessionCookie,
  mintSessionValue,
  readSessionCookie,
  setSessionCookie,
  type SessionCookieReader,
} from "@/lib/server/account/session-cookie";
import { getSessionStore } from "@/lib/server/account/session-store-instance";
import { sha256Hex } from "@/lib/server/sha256-hex";
import type { Role } from "@lemnaria/configurator-domain";

// Starting and ending sessions (ADR 0172 decision 3). Each takes the response it will set a cookie on, so the route
// owns the answer and this module owns the cookie. A store failure is thrown for the route to answer as unavailable:
// nothing here pretends a session started or ended.

const MILLISECONDS_PER_SECOND = 1_000;

export interface SessionStart {
  readonly response: NextResponse;
  readonly accountId: string;
  /** The account's role as the caller just read it; it picks the session's absolute lifetime. */
  readonly role: Role;
  /** The hash the account holds now, **after** any rehash, and the one the caller verified the password against. */
  readonly expectedPasswordHash: string;
  /** The request's cookies: a live session it carries is revoked once the new one is stored, so a planted value grants
   *  nothing after a sign-in (no fixation). */
  readonly presentedCookies: SessionCookieReader;
}

/** `stale`: a reset or a rehash replaced the hash the caller verified, so no session was made and no cookie set; the
 *  caller answers a failed sign-in. `refused`: the account is gone. */
export type SessionStartOutcome = "started" | "stale" | "refused";

/**
 * Mints a fresh value, stores its hash bound to `expectedPasswordHash`, sets the cookie with the role's absolute
 * lifetime as `Max-Age`, and only then revokes the presented session. The new session comes first so a refused
 * sign-in (`stale`, `refused`) or a store failure leaves the client's existing session untouched, and the cookie is
 * set only when the session was stored. The revoke is best effort: a failure is written down by event and outcome
 * and never fails the sign-in, at the price that a presented session may stay live until it expires.
 */
export async function startSession({
  response,
  accountId,
  role,
  expectedPasswordHash,
  presentedCookies,
}: SessionStart): Promise<SessionStartOutcome> {
  const store = getSessionStore();
  const value = mintSessionValue();
  const maxAgeSeconds = ABSOLUTE_LIFETIME_SECONDS_BY_ROLE[role];
  const creation = await store.create({
    tokenHash: sha256Hex(value),
    accountId,
    expectedPasswordHash,
    absoluteExpiresAt: new Date(
      Date.now() + maxAgeSeconds * MILLISECONDS_PER_SECOND,
    ),
  });
  if (creation.kind !== "created") return creation.kind;
  setSessionCookie({ response, value, maxAgeSeconds });
  await revokePresentedSessionBestEffort(presentedCookies);
  return "started";
}

/** Ends the session the request carries, if any, and clears the cookie. With no session it only clears the cookie. */
export async function endSession({
  response,
  presentedCookies,
}: {
  response: NextResponse;
  presentedCookies: SessionCookieReader;
}): Promise<void> {
  await revokePresentedSession(presentedCookies);
  clearSessionCookie(response);
}

/**
 * Ends every session of the account, the caller's own included, and clears the cookie. `accountId` must come from the
 * session the server read (`readCurrentSession`), never from the request.
 */
export async function endAllSessions({
  response,
  accountId,
}: {
  response: NextResponse;
  accountId: string;
}): Promise<void> {
  await getSessionStore().revokeAllForAccount(accountId);
  clearSessionCookie(response);
}

async function revokePresentedSession(
  presentedCookies: SessionCookieReader,
): Promise<void> {
  const presentedValue = readSessionCookie(presentedCookies);
  if (presentedValue === undefined) return;
  await getSessionStore().revoke(sha256Hex(presentedValue));
}

async function revokePresentedSessionBestEffort(
  presentedCookies: SessionCookieReader,
): Promise<void> {
  try {
    await revokePresentedSession(presentedCookies);
  } catch {
    reportAccountEvent({ event: "logout", outcome: "unavailable" });
  }
}
