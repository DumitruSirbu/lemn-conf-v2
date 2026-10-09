import "server-only";

import {
  isSendableMailMessage,
  MAIL_ACCEPTED,
  MAIL_REFUSED_UNSENT,
  type MailMessage,
  type MailOutcome,
  type MailSender,
} from "@/lib/server/mail/mail-sender";

export interface FakeMailSender extends MailSender {
  /** Every message handed to `send`, in order, including those whose scripted outcome was a failure. */
  readonly sent: readonly MailMessage[];
}

/**
 * Records what it is given and answers from `scriptedOutcomes`, one per send in order, then with an
 * acceptance. A message that may not be sent is refused, unrecorded, as the adapter would. It reaches no
 * network.
 */
export function createFakeMailSender(
  scriptedOutcomes: readonly MailOutcome[] = [],
): FakeMailSender {
  const sent: MailMessage[] = [];
  return {
    sent,
    send(message) {
      if (!isSendableMailMessage(message)) {
        return Promise.resolve(MAIL_REFUSED_UNSENT);
      }
      const outcome = scriptedOutcomes[sent.length] ?? MAIL_ACCEPTED;
      sent.push({
        key: message.key,
        subject: message.subject,
        text: message.text,
      });
      return Promise.resolve(outcome);
    },
  };
}
