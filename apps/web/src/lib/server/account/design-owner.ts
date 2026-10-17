import "server-only";

import { readCurrentSession } from "@/lib/server/account/current-session";
import { requireCapability } from "@/lib/server/account/require-capability";
import type { SessionCookieReader } from "@/lib/server/account/session-cookie";

/**
 * The account a design minted by this request belongs to from the start (ADR 0169 D8), or `undefined` for a visitor. It is
 * the session's own account and only when that account is verified and holds `design.edit.own`; the request names no
 * account. A session that cannot be read is anonymous, so the design is minted unclaimed: less access, and the person can
 * claim it later. Nothing is written and the session is not marked seen.
 */
export async function accountIdToOwnNewDesign(
  cookies: SessionCookieReader,
): Promise<string | undefined> {
  const session = await readCurrentSession(cookies);
  const check = requireCapability(session, "design.edit.own");
  return check.kind === "allowed" && session.kind === "signed-in"
    ? session.accountId
    : undefined;
}
