import "server-only";

import type { DesignAccessor } from "@lemnaria/persistence";

import { readCurrentSession } from "@/lib/server/account/current-session";
import { isClientHolding } from "@/lib/server/account/require-capability";
import type { SessionCookieReader } from "@/lib/server/account/session-cookie";
import {
  readVisitorHash,
  type VisitorCookieReader,
} from "@/lib/server/visitor";

// Who is asking to read a design (ADR 0169 D9). Both credentials come from the request's cookies and are judged by the
// server: the visitor cookie is hashed, the session is looked up. A request never names an account, a role or a
// capability.

/** The signed-in account whose designs this request may read, and whether it may also write them. */
export interface ReadingAccount {
  readonly accountId: string;
  readonly mayEdit: boolean;
}

/** Who is asking, and whether the account arm of that (if any) may write what it reads. */
export interface RequestDesignAccess {
  /** `undefined` when the request carries neither a well-formed visitor cookie nor a client session: nothing to ask. */
  readonly accessor: DesignAccessor | undefined;
  /** Advisory, never an authorisation decision: only a design the account owns may use it (`isOwnedByAccount`). */
  readonly accountMayEdit: boolean;
}

/**
 * The account a session reads designs as: a verified **client** holding `design.read.own` and nobody else (ADR 0169
 * Amendment B). Staff reading any design is a later wave, so a staff session reads as a visitor does: by its cookie
 * alone. A session that cannot be read is anonymous, so the failure gives less access.
 */
export async function readingAccountOf(
  cookies: SessionCookieReader,
): Promise<ReadingAccount | undefined> {
  const session = await readCurrentSession(cookies);
  if (session.kind !== "signed-in") return undefined;
  if (!isClientHolding(session, "design.read.own")) return undefined;
  return {
    accountId: session.accountId,
    mayEdit: isClientHolding(session, "design.edit.own"),
  };
}

/** The accessor for a visitor hash and an account, either or both, or `undefined` when there is neither. */
export function designAccessorOf(
  visitorHash: string | undefined,
  account: ReadingAccount | undefined,
): DesignAccessor | undefined {
  if (visitorHash !== undefined) {
    return account === undefined
      ? { visitorHash }
      : { visitorHash, accountId: account.accountId };
  }
  return account === undefined ? undefined : { accountId: account.accountId };
}

/** The accessor of a request, from its visitor cookie and its session cookie. Reads, writes nothing. */
export async function readRequestDesignAccess(
  cookies: VisitorCookieReader & SessionCookieReader,
): Promise<RequestDesignAccess> {
  const account = await readingAccountOf(cookies);
  return {
    accessor: designAccessorOf(readVisitorHash(cookies), account),
    accountMayEdit: account?.mayEdit ?? false,
  };
}
