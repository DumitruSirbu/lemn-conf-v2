import "server-only";

import { createTransport } from "nodemailer";

import {
  asciiMailboxOf,
  CUSTOMER_AUDIENCE,
  sendableCustomerCopyOf,
  type CustomerMailMessage,
  type CustomerMailSender,
} from "@/lib/server/mail/customer-mail";
import {
  MAIL_REFUSED_UNSENT,
  sendableCopyOf,
  type MailMessage,
  type MailOutcome,
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

/** Implicit TLS: the session is encrypted from the first byte. */
export const SMTP_IMPLICIT_TLS_PORT = 465;
/** STARTTLS submission: the session is upgraded before login, and a server that cannot upgrade is refused. */
export const SMTP_STARTTLS_PORT = 587;

/** The six settings of one authenticated SMTP sender, already judged usable by whoever read them. */
export interface SmtpMailSettings {
  readonly host: string;
  readonly port: typeof SMTP_IMPLICIT_TLS_PORT | typeof SMTP_STARTTLS_PORT;
  readonly user: string;
  readonly password: string;
  readonly fromAddress: string;
  readonly notificationAddress: string;
}

type SmtpConnectionOptions = {
  readonly host: string;
  readonly auth: { readonly user: string; readonly pass: string };
} & typeof HARDENED_TRANSPORT_OPTIONS;

export type SmtpTransportOptions =
  | (SmtpConnectionOptions & {
      readonly port: typeof SMTP_IMPLICIT_TLS_PORT;
      readonly secure: true;
    })
  | (SmtpConnectionOptions & {
      readonly port: typeof SMTP_STARTTLS_PORT;
      readonly secure: false;
      readonly requireTLS: true;
    });

export type MakeSmtpTransport = (
  options: SmtpTransportOptions,
) => MailTransport;

export const DEFAULT_MAKE_SMTP_TRANSPORT: MakeSmtpTransport = createTransport;

/** A setting that cannot be used as given. Names the setting, never its value. */
export class UnusableSmtpSettingError extends Error {
  readonly setting: keyof SmtpMailSettings;

  constructor(setting: keyof SmtpMailSettings) {
    super(`The SMTP mail setting "${setting}" is not usable`);
    this.name = "UnusableSmtpSettingError";
    this.setting = setting;
  }
}

/**
 * Pure, and built from named members, never by spreading the settings. Port 465 is implicit TLS. Port 587 is STARTTLS
 * that must succeed: `requireTLS` forbids a plaintext fallback. There is no `tls` override, so the platform's own
 * certificate checks and minimum protocol version stand.
 * @throws UnusableSmtpSettingError when the port is neither 465 nor 587, whatever its type.
 */
export function buildSmtpTransportOptions(
  settings: SmtpMailSettings,
): SmtpTransportOptions {
  const { host, user, password } = settings;
  // Read as `unknown`: the types allow two ports, but a value forced past them must be refused, not trusted.
  const port: unknown = settings.port;
  const connection = {
    host,
    auth: { user, pass: password },
    ...HARDENED_TRANSPORT_OPTIONS,
  };
  if (port === SMTP_IMPLICIT_TLS_PORT) {
    return { ...connection, port, secure: true };
  }
  if (port === SMTP_STARTTLS_PORT) {
    return { ...connection, port, secure: false, requireTLS: true };
  }
  throw new UnusableSmtpSettingError("port");
}

/**
 * Pure, and built from named members. The one recipient is the configured inbox; `from` is the configured address,
 * bare, which is also the envelope sender and the `Message-ID` domain.
 * @throws UnusableSmtpSettingError when either address is not one plain mailbox.
 */
export function buildSmtpMessage(
  copy: MailMessage,
  settings: SmtpMailSettings,
): SmtpMessageOptions {
  const { fromAddress, notificationAddress } = settings;
  const senderDomain = plainDomainOf(fromAddress, "fromAddress");
  plainDomainOf(notificationAddress, "notificationAddress");
  return messageOptionsOf({
    copy,
    from: fromAddress,
    senderDomain,
    to: notificationAddress,
  });
}

/**
 * As `buildSmtpMessage`, except that the one recipient is the message's own, written as the transport takes it. The
 * configured inbox is not consulted, so a customer's mail can never be addressed to the shop by this path.
 * @throws UnusableSmtpSettingError when the from address is not one plain mailbox;
 *   UnusableRecipientError when the recipient is not.
 */
export function buildSmtpCustomerMessage(
  copy: CustomerMailMessage,
  settings: SmtpMailSettings,
): SmtpMessageOptions {
  const { fromAddress } = settings;
  const senderDomain = plainDomainOf(fromAddress, "fromAddress");
  const to = asciiMailboxOf(copy.recipient);
  if (to === undefined) throw new UnusableRecipientError();
  return messageOptionsOf({ copy, from: fromAddress, senderDomain, to });
}

/** One attempt, never a rejection; the shop's notice goes to the configured inbox and to nobody else. */
export function createSmtpMailSender(
  settings: SmtpMailSettings,
  makeTransport: MakeSmtpTransport = DEFAULT_MAKE_SMTP_TRANSPORT,
): MailSender {
  return {
    send: (message) =>
      sendWhenUsable(
        tryBuildMessage(message, settings),
        settings,
        makeTransport,
      ),
  };
}

/** One attempt, never a rejection; the recipient is the message's own and nothing else. */
export function createSmtpCustomerMailSender(
  settings: SmtpMailSettings,
  makeTransport: MakeSmtpTransport = DEFAULT_MAKE_SMTP_TRANSPORT,
): CustomerMailSender {
  return {
    audience: CUSTOMER_AUDIENCE,
    send: (message) =>
      sendWhenUsable(
        tryBuildCustomerMessage(message, settings),
        settings,
        makeTransport,
      ),
  };
}

/** A message or a port that cannot be used is refused before any transport is made. */
async function sendWhenUsable(
  message: SmtpMessageOptions | undefined,
  settings: SmtpMailSettings,
  makeTransport: MakeSmtpTransport,
): Promise<MailOutcome> {
  const transportOptions = tryBuildTransportOptions(settings);
  if (message === undefined || transportOptions === undefined) {
    return MAIL_REFUSED_UNSENT;
  }
  return sendOnce(message, () => makeTransport(transportOptions));
}

function tryBuildMessage(
  message: MailMessage,
  settings: SmtpMailSettings,
): SmtpMessageOptions | undefined {
  try {
    const copy = sendableCopyOf(message);
    return copy === undefined ? undefined : buildSmtpMessage(copy, settings);
  } catch {
    return undefined;
  }
}

function tryBuildCustomerMessage(
  message: CustomerMailMessage,
  settings: SmtpMailSettings,
): SmtpMessageOptions | undefined {
  try {
    const copy = sendableCustomerCopyOf(message);
    return copy === undefined
      ? undefined
      : buildSmtpCustomerMessage(copy, settings);
  } catch {
    return undefined;
  }
}

function tryBuildTransportOptions(
  settings: SmtpMailSettings,
): SmtpTransportOptions | undefined {
  try {
    return buildSmtpTransportOptions(settings);
  } catch {
    return undefined;
  }
}

/** The ASCII domain of one plain mailbox, lower-case, which is also what a `msg-id` may hold. */
function plainDomainOf(
  address: string,
  setting: keyof SmtpMailSettings,
): string {
  const domain = asciiDomainOfPlainMailbox(address);
  if (domain === undefined) throw new UnusableSmtpSettingError(setting);
  return domain;
}
