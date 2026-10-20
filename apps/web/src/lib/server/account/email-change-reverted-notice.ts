import "server-only";

import { after } from "next/server";

import { judgeAccountEmail } from "@lemnaria/configurator-domain";

import { reportAccountEvent } from "@/lib/server/account/account-log";
import {
  prepareAccountMail,
  queueAccountMail,
} from "@/lib/server/account/queue-account-mail";

// The notice to the address an account has just left by using an undo link (ADR 0172 Amendment H). It says the account
// went back to its previous address and offers no remedy and no link: after the revert that address is neither held
// nor reserved, so a password reset there would reach no account. It is earned, not asked for (a live undo link,
// bounded by the change that wrote it), so it counts no bucket.

export interface EmailChangeRevertedNotice {
  /** The address the account held until this revert. */
  readonly leftEmail: string;
  /** The address the revert restored. */
  readonly restoredEmail: string;
  readonly locale: string;
}

/**
 * A chain can make the revert land on the address it leaves (A to B, B to A, then the first undo link): the address
 * is then still the account's, and the restored address has its own notice, so this one is not sent. Addresses are
 * compared by the normal form the store holds, not by their spelling. A thrown value reaches the framework's log and a
 * driver error can quote an address, so nothing is thrown out.
 */
export function scheduleEmailChangeRevertedNotice(
  notice: EmailChangeRevertedNotice,
): void {
  try {
    if (isTheRestoredAddress(notice)) return;
    after(() => {
      sendEmailChangeRevertedNotice(notice);
    });
  } catch {
    reportAccountEvent({ event: "mail", outcome: "unavailable" });
  }
}

function isTheRestoredAddress({
  leftEmail,
  restoredEmail,
}: EmailChangeRevertedNotice): boolean {
  const left = judgeAccountEmail(leftEmail);
  const restored = judgeAccountEmail(restoredEmail);
  return (
    left.ok && restored.ok && left.emailNormalForm === restored.emailNormalForm
  );
}

/** A stored address that the policy no longer accepts, an unavailable mailer or a failed send drops the notice and
 *  changes no answer; each is written down, without the address. */
function sendEmailChangeRevertedNotice({
  leftEmail,
  locale,
}: EmailChangeRevertedNotice): void {
  try {
    if (!judgeAccountEmail(leftEmail).ok) {
      reportAccountEvent({ event: "mail", outcome: "refused" });
      return;
    }
    const mail = prepareAccountMail();
    if (mail.kind === "unavailable") return;
    queueAccountMail(mail.readiness, {
      kind: "email-change-reverted",
      recipient: leftEmail,
      locale,
    });
  } catch {
    reportAccountEvent({ event: "mail", outcome: "unavailable" });
  }
}
