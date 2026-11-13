import "server-only";

import {
  profileFillOf,
  type ContactSubmissionRequest,
} from "@lemnaria/configurator-domain";
import { AccountStoreError, type AccountStore } from "@lemnaria/persistence";

import type { CurrentSession } from "@/lib/server/account/current-session";
import { isCapabilityHeld } from "@/lib/server/account/require-capability";
import {
  reportContactProfileFillFailed,
  type ProfileFillFailureCause,
} from "@/lib/server/contact/contact-log";
import {
  beforeDeadline,
  isDeadlineExceeded,
} from "@/lib/server/contact/sent-kitchen-link";

/** How long the answer waits for the session read and the fill together, in milliseconds: a session lookup and one
 *  keyed update, so a fill past this is hung and the customer's answer is not held for it. */
export const PROFILE_FILL_DEADLINE_MS = 1000;

export type ProfileFillStore = Pick<AccountStore, "fillProfileBlanks">;

/** The session of the request being answered, read when asked and never before a request is stored. */
export type SessionReader = () => Promise<CurrentSession>;

export interface ProfileFillPorts {
  readonly readSession: SessionReader;
  readonly profiles: ProfileFillStore;
}

/**
 * A stored request fills the blanks of the profile of the session that sent it, and only a session holding
 * `design.edit.own` (a confirmed client's): a visitor, a staff member, an administrator and an unconfirmed account
 * write nothing. The account is the session's, never the request's or the design's. A failure or a wait past
 * `PROFILE_FILL_DEADLINE_MS` is one line with a cause from a closed list and never an answer: the row exists, and the
 * fill is idempotent, so a retry may repair it.
 */
export async function fillSubmittersProfileBlanks(
  ports: ProfileFillPorts,
  request: ContactSubmissionRequest,
  reference: string,
): Promise<void> {
  try {
    await beforeDeadline(
      fillWhenAConfirmedClient(ports, request),
      PROFILE_FILL_DEADLINE_MS,
    );
  } catch (thrown) {
    reportContactProfileFillFailed(reference, causeOfFillFailure(thrown));
  }
}

async function fillWhenAConfirmedClient(
  { readSession, profiles }: ProfileFillPorts,
  { contact }: ContactSubmissionRequest,
): Promise<void> {
  const session = await readSession();
  if (session.kind !== "signed-in") return;
  if (!isCapabilityHeld(session, "design.edit.own")) return;
  await profiles.fillProfileBlanks({
    accountId: session.accountId,
    fill: profileFillOf(contact),
  });
}

/** Which cause on the closed list a thrown value became; its message, name and cause are never read. */
function causeOfFillFailure(thrown: unknown): ProfileFillFailureCause {
  try {
    return classifiedCauseOf(thrown);
  } catch {
    // An exotic value (a revoked Proxy) throws when `instanceof` touches it: it is the cause that says so.
    return "unexpected";
  }
}

function classifiedCauseOf(thrown: unknown): ProfileFillFailureCause {
  if (isDeadlineExceeded(thrown)) return "timeout";
  if (thrown instanceof AccountStoreError) return "store-failed";
  return "unexpected";
}
