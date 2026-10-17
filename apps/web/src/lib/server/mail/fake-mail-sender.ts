import "server-only";

import {
  sendableCustomerCopyOf,
  type CustomerMailMessage,
  type CustomerMailSender,
} from "@/lib/server/mail/customer-mail";
import {
  MAIL_ACCEPTED,
  MAIL_REFUSED_UNSENT,
  sendableCopyOf,
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
 * acceptance. A message that may not be sent is refused as the adapter would: it is not recorded and
 * spends no scripted outcome. It reaches no network.
 */
export function createFakeMailSender(
  scriptedOutcomes: readonly MailOutcome[] = [],
): FakeMailSender {
  const sent: MailMessage[] = [];
  return {
    sent,
    send(message) {
      const copy = sendableCopyOf(message);
      if (copy === undefined) return Promise.resolve(MAIL_REFUSED_UNSENT);
      const outcome = scriptedOutcomes[sent.length] ?? MAIL_ACCEPTED;
      sent.push(copy);
      return Promise.resolve(outcome);
    },
  };
}

export interface FakeCustomerMailSender extends CustomerMailSender {
  /** Every message handed to `send` that may be sent, in order, including those whose scripted outcome was a failure. */
  readonly sent: readonly CustomerMailMessage[];
}

/** As `createFakeMailSender`, for a message addressed to a customer: a message that may not be sent is refused
 *  unrecorded, and nothing reaches a network. */
export function createFakeCustomerMailSender(
  scriptedOutcomes: readonly MailOutcome[] = [],
): FakeCustomerMailSender {
  const sent: CustomerMailMessage[] = [];
  return {
    sent,
    send(message) {
      const copy = sendableCustomerCopyOf(message);
      if (copy === undefined) return Promise.resolve(MAIL_REFUSED_UNSENT);
      const outcome = scriptedOutcomes[sent.length] ?? MAIL_ACCEPTED;
      sent.push(copy);
      return Promise.resolve(outcome);
    },
  };
}
