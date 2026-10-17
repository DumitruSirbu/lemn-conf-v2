import "server-only";

import type { Capability, Role } from "@lemnaria/configurator-domain";
import type { SessionAccount } from "@lemnaria/persistence";

import { reportAccountEvent } from "@/lib/server/account/account-log";
import { capabilitiesHeldBy } from "@/lib/server/account/require-capability";
import { IDLE_LIFETIME_SECONDS_BY_ROLE } from "@/lib/server/account/session-lifetimes";
import { getSessionStore } from "@/lib/server/account/session-store-instance";
import {
  readSessionCookie,
  type SessionCookieReader,
} from "@/lib/server/account/session-cookie";
import { sha256Hex } from "@/lib/server/sha256-hex";

// Who is asking (ADR 0169 decision 3). The only input is the session cookie. The role, the address and the verification
// are the account's current ones, read on every request, so a demotion takes effect on the next one.

export interface SignedInSession {
  readonly kind: "signed-in";
  readonly accountId: string;
  readonly role: Role;
  readonly capabilities: readonly Capability[];
  readonly isEmailVerified: boolean;
  readonly email: string;
}

export type CurrentSession = { readonly kind: "anonymous" } | SignedInSession;

const ANONYMOUS_SESSION: CurrentSession = { kind: "anonymous" };

/**
 * Reads the session the request's cookie names. **It never writes**: a page render may call it, and a render can neither
 * set a cookie nor be allowed to move `last_seen_at`. A cookie that is absent, malformed, unknown, revoked or expired
 * reads as anonymous, and so does a read that fails: less access is the safe way to fail.
 */
export async function readCurrentSession(
  cookies: SessionCookieReader,
): Promise<CurrentSession> {
  const sessionValue = readSessionCookie(cookies);
  if (sessionValue === undefined) return ANONYMOUS_SESSION;
  try {
    const lookup = await getSessionStore().findLive({
      tokenHash: sha256Hex(sessionValue),
      idleLifetimeSeconds: IDLE_LIFETIME_SECONDS_BY_ROLE,
    });
    return lookup.kind === "live"
      ? signedInSessionOf(lookup.account)
      : ANONYMOUS_SESSION;
  } catch {
    reportAccountEvent({ event: "session-read", outcome: "unavailable" });
    return ANONYMOUS_SESSION;
  }
}

/**
 * Marks the session seen. **Route handlers only**: a Server Component calling this would make a render write. The idle
 * test is not the store's `touch` to make, so a session is touched only after `findLive` has found it live in this call;
 * otherwise an idle-expired session would be revived by being touched. A failed touch is bookkeeping that failed, so it
 * is logged and never fails the request.
 */
export async function touchCurrentSession(
  cookies: SessionCookieReader,
): Promise<void> {
  const sessionValue = readSessionCookie(cookies);
  if (sessionValue === undefined) return;
  try {
    const store = getSessionStore();
    const tokenHash = sha256Hex(sessionValue);
    const lookup = await store.findLive({
      tokenHash,
      idleLifetimeSeconds: IDLE_LIFETIME_SECONDS_BY_ROLE,
    });
    if (lookup.kind === "live") await store.touch(tokenHash);
  } catch {
    reportAccountEvent({ event: "session-read", outcome: "unavailable" });
  }
}

function signedInSessionOf(account: SessionAccount): SignedInSession {
  return {
    kind: "signed-in",
    accountId: account.id,
    role: account.role,
    capabilities: capabilitiesHeldBy(account),
    isEmailVerified: account.isEmailVerified,
    email: account.email,
  };
}
