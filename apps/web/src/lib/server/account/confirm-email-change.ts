import "server-only";

import type { NextResponse } from "next/server";

import { judgeAccountEmail } from "@lemnaria/configurator-domain";
import type { PreviousAddress } from "@lemnaria/persistence";

import { reportAccountEvent } from "@/lib/server/account/account-log";
import {
  parseJsonObject,
  textMemberOf,
} from "@/lib/server/account/account-request";
import {
  emailChangedResponse,
  invalidRequestResponse,
  linkInvalidResponse,
  unavailableResponse,
} from "@/lib/server/account/account-responses";
import { getAccountStore } from "@/lib/server/account/account-store-instance";
import {
  emailChangeRevertTokenExpiry,
  isWellFormedEmailToken,
  mintEmailToken,
} from "@/lib/server/account/email-token";
import {
  prepareAccountMail,
  queueAccountMail,
  type AccountMailReadiness,
} from "@/lib/server/account/queue-account-mail";
import { getSessionStore } from "@/lib/server/account/session-store-instance";
import { sha256Hex } from "@/lib/server/sha256-hex";

// E9 of the Lot 2 plan: using an e-mail-change link. Step 1 to 4 of the common order are the route's (the cross-site
// check, media type, bounded body, and the network's limit). There is no session and no challenge: the token is the
// subject, and the address it changes to is read from its row, never from the request.
//
// One `link-invalid` answers an unknown, used, expired or superseded token, a token issued before the account's last
// password change, and an address another account now holds: the store folds the unique violation into the same
// outcome. A success ends every session, this browser's included, so no session is started and no cookie is touched:
// the one this browser holds now reads as anonymous, and the person signs in with the new address.

const TOKEN_MEMBER = "token";

export async function completeEmailChange({
  bodyText,
}: {
  bodyText: string;
}): Promise<NextResponse> {
  const body = parseJsonObject(bodyText);
  if (body === undefined) return invalidRequestResponse();
  const token = textMemberOf(body, TOKEN_MEMBER);
  if (!isWellFormedEmailToken(token)) return linkInvalidResponse();
  // Before any row changes, as E8 does: once the address has moved, an undo link that cannot be written is lost for good,
  // and a reset at the old address reaches no account. The token is still unconsumed, so the person can click again.
  const mail = prepareAccountMail();
  if (mail.kind === "unavailable") return unavailableResponse();
  // Minted once, here, so every attempt inside the store's retry names the same row. The store writes the row only if
  // it consumes `token`. The value goes to the old address, in the undo link, and nowhere else.
  const revertToken = mintEmailToken();
  const outcome = await getAccountStore().confirmEmailChange({
    tokenHash: sha256Hex(token),
    revertTokenHash: revertToken.hash,
    revertExpiresAt: emailChangeRevertTokenExpiry(),
  });
  if (outcome.kind === "invalid") return linkInvalidResponse();
  await endEverySessionBestEffort(outcome.accountId);
  // `previous` is undefined only when no undo row of this call exists (another call made the change), and then there
  // is no link of ours to mail. A retry after a lost acknowledgement reads it back from the row, so it mails too.
  if (outcome.previous !== undefined) {
    scheduleOldAddressNotice({
      readiness: mail.readiness,
      previous: outcome.previous,
      revertToken: revertToken.value,
    });
  }
  reportAccountEvent({ event: "email-change-confirm", outcome: "succeeded" });
  return emailChangedResponse();
}

/**
 * `confirmEmailChange` already revoked the account's sessions in its third statement; this pass catches a session that
 * committed after it. The address is changed either way, so a failure here is written down and does not change the
 * answer: telling the client "unavailable" for a change that took effect would send it to a link that no longer works.
 */
async function endEverySessionBestEffort(accountId: string): Promise<void> {
  try {
    await getSessionStore().revokeAllForAccount(accountId);
  } catch {
    reportAccountEvent({ event: "session-revoke", outcome: "unavailable" });
  }
}

interface OldAddressNotice {
  readonly readiness: AccountMailReadiness;
  readonly previous: PreviousAddress;
  /** The value of the undo link whose hash the store holds. It is never logged. */
  readonly revertToken: string;
}

/**
 * The notice to the address the account has just left, in the account's language, with the link that undoes the change
 * (ADR 0172 Amendment H). It is earned, not asked for (a live link, bounded by the request's own buckets), so it counts
 * no bucket. A stored address that the policy no longer accepts, an unavailable mailer or a failed send drops the
 * notice and changes no answer; each is written down, without the address or the link.
 */
function scheduleOldAddressNotice({
  readiness,
  previous,
  revertToken,
}: OldAddressNotice): void {
  try {
    if (!judgeAccountEmail(previous.email).ok) {
      reportAccountEvent({ event: "mail", outcome: "refused" });
      return;
    }
    queueAccountMail(readiness, {
      kind: "email-changed",
      recipient: previous.email,
      locale: previous.locale,
      token: revertToken,
    });
  } catch {
    reportAccountEvent({ event: "mail", outcome: "unavailable" });
  }
}
