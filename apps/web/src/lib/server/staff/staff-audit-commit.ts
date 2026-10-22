import "server-only";

import type { StaffAuditEntry } from "@lemnaria/configurator-domain";

import {
  readSessionCookie,
  type SessionCookieReader,
} from "@/lib/server/account/session-cookie";
import { IDLE_LIFETIME_SECONDS_BY_ROLE } from "@/lib/server/account/session-lifetimes";
import { sha256Hex } from "@/lib/server/sha256-hex";
import { getStaffAuditStore } from "@/lib/server/staff/staff-audit-store-instance";

/** What a staff read records of itself: the entry, and the kitchen and client account it names, when it names any. */
export interface AuditedRead {
  readonly entry: StaffAuditEntry;
  readonly designId: string | null;
  readonly subjectAccountId: string | null;
}

/**
 * Writes the row and waits for its commit. The store takes the actor from the live session the cookie names, so no
 * caller can name another account. Any failure is thrown, and the route's wrapper answers `503` with no body: a read
 * that must be recorded is not served when its record cannot be written.
 */
export async function commitAuditRow(
  cookies: SessionCookieReader,
  { entry, designId, subjectAccountId }: AuditedRead,
): Promise<void> {
  await getStaffAuditStore().record({
    sessionTokenHash: sessionTokenHashOf(cookies),
    idleLifetimeSeconds: IDLE_LIFETIME_SECONDS_BY_ROLE,
    entry,
    designId,
    subjectAccountId,
  });
}

function sessionTokenHashOf(cookies: SessionCookieReader): string {
  const sessionValue = readSessionCookie(cookies);
  if (sessionValue === undefined) {
    throw new Error("A staff read has no session cookie to name its actor.");
  }
  return sha256Hex(sessionValue);
}
