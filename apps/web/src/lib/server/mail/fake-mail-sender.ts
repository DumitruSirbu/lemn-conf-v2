import "server-only";

import {
  MAIL_ACCEPTED,
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
 * acceptance. It reaches no network.
 */
export function createFakeMailSender(
  scriptedOutcomes: readonly MailOutcome[] = [],
): FakeMailSender {
  const sent: MailMessage[] = [];
  return {
    sent,
    send(message) {
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
