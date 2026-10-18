import "server-only";

import type { DesignAccessor } from "@lemnaria/persistence";

import { readCurrentSession } from "@/lib/server/account/current-session";
import { isCapabilityHeld } from "@/lib/server/account/require-capability";
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
 * The account a session reads designs as: a verified account holding `design.read.own`, which only a client does (ADR 0169
 * Amendment B). Staff reading any design is a later wave, so a staff session reads as a visitor does: by its cookie
 * alone. A session that cannot be read is anonymous, so the failure gives less access.
 */
export async function readingAccountOf(
  cookies: SessionCookieReader,
): Promise<ReadingAccount | undefined> {
  const session = await readCurrentSession(cookies);
  if (session.kind !== "signed-in") return undefined;
  if (!isCapabilityHeld(session, "design.read.own")) return undefined;
  return {
    accountId: session.accountId,
    mayEdit: isCapabilityHeld(session, "design.edit.own"),
  };
}

/**
 * The id of the account whose session may write the designs it owns, or `undefined`. Save and share ask this, and
 * `canWrite` is derived from the same `mayEdit` (`readRequestDesignAccess`), so the flag a page shows and the save the
 * server accepts cannot disagree about which sessions may edit. Still only half of the decision: the row must also be
 * the account's, and the repository's own predicate says so.
 */
export async function editingAccountIdOf(
  cookies: SessionCookieReader,
): Promise<string | undefined> {
  const account = await readingAccountOf(cookies);
  return account?.mayEdit === true ? account.accountId : undefined;
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
