import "server-only";

import {
  isSendableMailMessage,
  sendableBodyCopyOf,
  type MailOutcome,
} from "@/lib/server/mail/mail-sender";
import { asciiDomainOfPlainMailbox } from "@/lib/server/mail/plain-mailbox";

/** The longest address SMTP carries (RFC 5321 section 4.5.3.1.3, with the angle brackets left out). */
const MAX_MAILBOX_LENGTH = 254;

/**
 * One fixed message addressed to one customer. It is a type of its own, beside the shop's `MailMessage`, which has no
 * recipient: nothing that is built as a shop message can reach a customer, and nothing built here can reach the shop's
 * sender. `recipient` is exactly one plain mailbox; the rest is the shop message's: `key` is the idempotency key, and
 * `html`, when present, is the same message as markup beside `text`.
 */
export interface CustomerMailMessage {
  readonly key: string;
  readonly recipient: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
}

export const CUSTOMER_AUDIENCE = "customer";

/**
 * As the shop's `MailSender`: a send answers with a value and never rejects. `audience` is a brand, so a shop sender
 * cannot be assigned here; `send` is a property in both interfaces, so this sender, whose `send` does not accept a shop
 * message, cannot be assigned to a `MailSender` either.
 */
export interface CustomerMailSender {
  readonly audience: typeof CUSTOMER_AUDIENCE;
  readonly send: (message: CustomerMailMessage) => Promise<MailOutcome>;
}

/**
 * The recipient as the transport writes it (local part as given, ASCII domain), or `undefined` when it is not exactly
 * one plain mailbox: none, several, a display name, or any comma, semicolon, angle bracket, quote or control character.
 */
export function asciiMailboxOf(recipient: unknown): string | undefined {
  if (typeof recipient !== "string") return undefined;
  const asciiDomain = asciiDomainOfPlainMailbox(recipient);
  if (asciiDomain === undefined) return undefined;
  const localPart = recipient.slice(0, recipient.indexOf("@"));
  const mailbox = `${localPart}@${asciiDomain}`;
  return mailbox.length <= MAX_MAILBOX_LENGTH ? mailbox : undefined;
}

/** One plain mailbox as recipient, and otherwise the shop message's rules for key, subject, text and html. */
export function isSendableCustomerMail(message: CustomerMailMessage): boolean {
  return (
    asciiMailboxOf(message.recipient) !== undefined &&
    isSendableMailMessage(message)
  );
}

/**
 * The only way a customer sender reads a message: its five members once, into a copy that cannot change, which the
 * predicate then judges, so what was judged is what is sent. A message that cannot be read, or may not be sent,
 * answers nothing.
 */
export function sendableCustomerCopyOf(
  message: CustomerMailMessage,
): CustomerMailMessage | undefined {
  const recipient = readRecipient(message);
  const shared = sendableBodyCopyOf(message);
  if (recipient === undefined || shared === undefined) return undefined;
  const copy: CustomerMailMessage = Object.freeze({ recipient, ...shared });
  return isSendableCustomerMail(copy) ? copy : undefined;
}

function readRecipient(message: CustomerMailMessage): string | undefined {
  try {
    const { recipient } = message;
    return typeof recipient === "string" ? recipient : undefined;
  } catch {
    return undefined;
  }
}
