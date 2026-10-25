import "server-only";

import { after } from "next/server";

import { judgeAccountEmail } from "@lemnaria/configurator-domain";
import type { StoredAccount } from "@lemnaria/persistence";

import { reportAccountEvent } from "@/lib/server/account/account-log";
import {
  prepareAccountMail,
  queueAccountMail,
} from "@/lib/server/account/queue-account-mail";

// The "your password was changed" notice, sent after the response of a reset or of a signed-in change. Both are
// earned, not asked for: a reset needs a live link that the reset request's own bucket bounds, and a change needs the
// current password that the password-check bucket bounds, so the notice counts no bucket of its own (ADR 0172
// Amendment B, item 2).

/** A thrown value reaches the framework's log and a driver error can quote an address, so nothing is thrown out. */
export function schedulePasswordChangedNotice(
  account: Pick<StoredAccount, "email" | "locale">,
): void {
  try {
    after(() => {
      sendPasswordChangedNotice(account);
    });
  } catch {
    reportAccountEvent({ event: "mail", outcome: "unavailable" });
  }
}

/** A stored address that the policy no longer accepts, an unavailable mailer or a failed send drops the notice and
 *  changes no answer; each is written down, without the address. */
function sendPasswordChangedNotice(
  account: Pick<StoredAccount, "email" | "locale">,
): void {
  try {
    if (!judgeAccountEmail(account.email).ok) {
      reportAccountEvent({ event: "mail", outcome: "refused" });
      return;
    }
    const mail = prepareAccountMail();
    if (mail.kind === "unavailable") return;
    queueAccountMail(mail.readiness, {
      kind: "password-changed",
      recipient: account.email,
      locale: account.locale,
    });
  } catch {
    reportAccountEvent({ event: "mail", outcome: "unavailable" });
  }
}
