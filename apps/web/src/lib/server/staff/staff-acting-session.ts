import "server-only";

import type { StaffActingSession } from "@lemnaria/persistence";

import {
  readSessionCookie,
  type SessionCookieReader,
} from "@/lib/server/account/session-cookie";
import { IDLE_LIFETIME_SECONDS_BY_ROLE } from "@/lib/server/account/session-lifetimes";
import { sha256Hex } from "@/lib/server/sha256-hex";

/** The store takes the actor from the live session the cookie names, so no caller can name another account. */
export function actingSessionOf(
  cookies: SessionCookieReader,
): StaffActingSession {
  const sessionValue = readSessionCookie(cookies);
  if (sessionValue === undefined) {
    throw new Error("A staff write has no session cookie to name its actor.");
  }
  return {
    sessionTokenHash: sha256Hex(sessionValue),
    idleLifetimeSeconds: IDLE_LIFETIME_SECONDS_BY_ROLE,
  };
}
