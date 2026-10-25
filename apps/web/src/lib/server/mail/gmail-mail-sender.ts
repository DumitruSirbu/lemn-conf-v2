import "server-only";

import { createTransport } from "nodemailer";

import {
  asciiMailboxOf,
  CUSTOMER_AUDIENCE,
  sendableCustomerCopyOf,
  type CustomerMailMessage,
  type CustomerMailSender,
} from "@/lib/server/mail/customer-mail";
import type { MailConfiguration } from "@/lib/server/mail/mail-configuration";
import {
  sendableCopyOf,
  type MailMessage,
  type MailSender,
} from "@/lib/server/mail/mail-sender";
import { asciiDomainOfPlainMailbox } from "@/lib/server/mail/plain-mailbox";
import {
  HARDENED_TRANSPORT_OPTIONS,
  messageOptionsOf,
  sendOnce,
  UnusableRecipientError,
  type MailTransport,
  type SmtpMessageOptions,
} from "@/lib/server/mail/smtp-transport";

export { MAIL_REQUEST_TIMEOUT_MS } from "@/lib/server/mail/smtp-transport";
export { UnusableRecipientError };
export type { MailTransport };

export const GMAIL_SMTP_HOST = "smtp.gmail.com";
export const GMAIL_SMTP_IMPLICIT_TLS_PORT = 465;

export interface GmailTransportOptions {
  readonly host: string;
  readonly port: number;
  readonly secure: true;
  readonly auth: { readonly user: string; readonly pass: string };
  readonly pool: false;
  readonly logger: false;
  readonly debug: false;
  readonly disableFileAccess: true;
  readonly disableUrlAccess: true;
  readonly dnsTimeout: number;
  readonly connectionTimeout: number;
  readonly greetingTimeout: number;
  readonly socketTimeout: number;
}

export type GmailMessageOptions = SmtpMessageOptions;

export type MakeMailTransport = (
  options: GmailTransportOptions,
) => MailTransport;

export const DEFAULT_MAKE_TRANSPORT: MakeMailTransport = createTransport;

/** A configured address that cannot be written as one plain mailbox. Names the setting, never its value. */
export class UnusableMailAddressError extends Error {
  readonly setting: keyof MailConfiguration;

  constructor(setting: keyof MailConfiguration) {
    super(`The mail setting "${setting}" is not one plain mailbox address`);
    this.name = "UnusableMailAddressError";
    this.setting = setting;
  }
}

/** Pure. Implicit TLS, no pool, no logging, no file or URL reads, and every wait shorter than the bound. */
export function buildGmailTransportOptions(
  configuration: MailConfiguration,
): GmailTransportOptions {
  return {
    host: GMAIL_SMTP_HOST,
    port: GMAIL_SMTP_IMPLICIT_TLS_PORT,
    secure: true,
    auth: {
      user: configuration.senderAddress,
      pass: configuration.appPassword,
    },
    ...HARDENED_TRANSPORT_OPTIONS,
  };
}

/**
 * Pure, and built from named members, never by spreading the message, so nothing it carries beyond its four fields
 * can become a recipient or a header; `html` is added only when the copy has one. The one recipient is the configured
 * inbox. The `Message-ID` is a digest of the key, so the client's request id reaches no header and a retry carries
 * the same id.
 * @throws UnusableMailAddressError when either address is not one plain mailbox.
 */
export function buildGmailMessage(
  copy: MailMessage,
  configuration: MailConfiguration,
): GmailMessageOptions {
  const { senderAddress, notificationAddress } = configuration;
  const senderDomain = plainDomainOf(senderAddress, "senderAddress");
  requirePlainMailbox(notificationAddress, "notificationAddress");
  return messageOptionsOf({
    copy,
    from: senderAddress,
    senderDomain,
    to: notificationAddress,
  });
}

/**
 * As `buildGmailMessage`, except that the one recipient is the message's own, written as the transport takes it. The
 * configured inbox is not consulted, so a customer's mail can never be addressed to the shop by this path.
 * @throws UnusableMailAddressError when the sender address is not one plain mailbox;
 *   UnusableRecipientError when the recipient is not.
 */
export function buildGmailCustomerMessage(
  copy: CustomerMailMessage,
  configuration: MailConfiguration,
): GmailMessageOptions {
  const { senderAddress } = configuration;
  const senderDomain = plainDomainOf(senderAddress, "senderAddress");
  const to = asciiMailboxOf(copy.recipient);
  if (to === undefined) throw new UnusableRecipientError();
  return messageOptionsOf({ copy, from: senderAddress, senderDomain, to });
}

/**
 * One attempt, never a rejection. The transport is made inside `send` and closed whatever came of it. For a
 * non-pooled SMTP transport `close()` ends no send in flight: after the bound, the library's own timeouts end the
 * session, so a message may still be accepted after `timed-out` was answered.
 */
export function createGmailMailSender(
  configuration: MailConfiguration,
  makeTransport: MakeMailTransport = DEFAULT_MAKE_TRANSPORT,
): MailSender {
  return {
    send: (message) =>
      sendOnce(tryBuildMessage(message, configuration), () =>
        makeTransport(buildGmailTransportOptions(configuration)),
      ),
  };
}

/**
 * The shop's transport rules for a message addressed to a customer: one attempt, the seven kinds, no reply-to, copy,
 * blind copy, header of its own or attachment. The recipient is the message's own and nothing else.
 */
export function createGmailCustomerMailSender(
  configuration: MailConfiguration,
  makeTransport: MakeMailTransport = DEFAULT_MAKE_TRANSPORT,
): CustomerMailSender {
  return {
    audience: CUSTOMER_AUDIENCE,
    send: (message) =>
      sendOnce(tryBuildCustomerMessage(message, configuration), () =>
        makeTransport(buildGmailTransportOptions(configuration)),
      ),
  };
}

function tryBuildMessage(
  message: MailMessage,
  configuration: MailConfiguration,
): GmailMessageOptions | undefined {
  try {
    const copy = sendableCopyOf(message);
    return copy === undefined
      ? undefined
      : buildGmailMessage(copy, configuration);
  } catch {
    return undefined;
  }
}

function tryBuildCustomerMessage(
  message: CustomerMailMessage,
  configuration: MailConfiguration,
): GmailMessageOptions | undefined {
  try {
    const copy = sendableCustomerCopyOf(message);
    return copy === undefined
      ? undefined
      : buildGmailCustomerMessage(copy, configuration);
  } catch {
    return undefined;
  }
}

function requirePlainMailbox(
  address: string,
  setting: keyof MailConfiguration,
): void {
  if (asciiDomainOfPlainMailbox(address) === undefined) {
    throw new UnusableMailAddressError(setting);
  }
}

/** The ASCII domain of one plain mailbox, lower-case, which is also what a `msg-id` may hold. */
function plainDomainOf(
  address: string,
  setting: keyof MailConfiguration,
): string {
  const domain = asciiDomainOfPlainMailbox(address);
  if (domain === undefined) throw new UnusableMailAddressError(setting);
  return domain;
}
