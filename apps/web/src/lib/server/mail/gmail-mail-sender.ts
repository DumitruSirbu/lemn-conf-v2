import "server-only";

import { createHash } from "node:crypto";
import { domainToASCII } from "node:url";

import { createTransport } from "nodemailer";

import {
  MAIL_REFUSED_UNSENT,
  sendableCopyOf,
  type MailMessage,
  type MailOutcome,
  type MailSender,
} from "@/lib/server/mail/mail-sender";
import {
  MAIL_TIMED_OUT,
  outcomeOfSendFailure,
  outcomeOfSendResult,
} from "@/lib/server/mail/smtp-answer";

/** One bound over the whole send: the customer waits for it. */
export const MAIL_REQUEST_TIMEOUT_MS = 10_000;

export const GMAIL_SMTP_HOST = "smtp.gmail.com";
export const GMAIL_SMTP_IMPLICIT_TLS_PORT = 465;

// Each is a positive integer strictly below the bound: the library falls back to its own minutes-long default for 0.
const DNS_TIMEOUT_MS = 2_000;
const CONNECTION_TIMEOUT_MS = 4_000;
const GREETING_TIMEOUT_MS = 3_000;
const SOCKET_TIMEOUT_MS = 6_000;

// A mailbox the library parses back to the very string it was given: dot-atom parts, one `@`.
const PLAIN_LOCAL_PART =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
// Checked before the name is converted, because the URL parser behind the conversion stops at `\`, `/`, `?` and `#`.
const DOMAIN_BEFORE_CONVERSION =
  /^[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?(?:\.[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?)*$/u;
// The last label starts with a letter: the URL parser rewrites a name ending in a number as an IPv4 address.
const PLAIN_ASCII_DOMAIN =
  /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z](?:[a-z0-9-]*[a-z0-9])?$/;

/** Three values of the new configuration shape, which the reader will produce once it moves. */
export interface GmailMailConfiguration {
  readonly senderAddress: string;
  readonly appPassword: string;
  readonly notificationAddress: string;
}

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

/** Exactly what rides on the wire: no reply-to, no copy, no markup, no header of its own. */
export interface GmailMessageOptions {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly messageId: string;
}

export interface MailTransport {
  sendMail(options: GmailMessageOptions): Promise<unknown>;
  close(): void;
}

export type MakeMailTransport = (
  options: GmailTransportOptions,
) => MailTransport;

export const DEFAULT_MAKE_TRANSPORT: MakeMailTransport = createTransport;

/** A configured address that cannot be written as one plain mailbox. Names the setting, never its value. */
export class UnusableMailAddressError extends Error {
  readonly setting: keyof GmailMailConfiguration;

  constructor(setting: keyof GmailMailConfiguration) {
    super(`The mail setting "${setting}" is not one plain mailbox address`);
    this.name = "UnusableMailAddressError";
    this.setting = setting;
  }
}

/** Pure. Implicit TLS, no pool, no logging, no file or URL reads, and every wait shorter than the bound. */
export function buildGmailTransportOptions(
  configuration: GmailMailConfiguration,
): GmailTransportOptions {
  return {
    host: GMAIL_SMTP_HOST,
    port: GMAIL_SMTP_IMPLICIT_TLS_PORT,
    secure: true,
    auth: {
      user: configuration.senderAddress,
      pass: configuration.appPassword,
    },
    pool: false,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
    dnsTimeout: DNS_TIMEOUT_MS,
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    greetingTimeout: GREETING_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
  };
}

/**
 * Pure, and built from named members, never by spreading, so nothing a message carries beyond its three fields
 * can become a recipient or a header. The one recipient is the configured inbox. The `Message-ID` is a digest of
 * the key, so the client's request id reaches no header and a retry carries the same id.
 * @throws UnusableMailAddressError when either address is not one plain mailbox.
 */
export function buildGmailMessage(
  copy: MailMessage,
  configuration: GmailMailConfiguration,
): GmailMessageOptions {
  const { senderAddress, notificationAddress } = configuration;
  const senderDomain = plainDomainOf(senderAddress, "senderAddress");
  plainDomainOf(notificationAddress, "notificationAddress");
  return {
    from: senderAddress,
    to: notificationAddress,
    subject: copy.subject,
    text: copy.text,
    messageId: `<${digestOf(copy.key)}@${senderDomain}>`,
  };
}

/**
 * One attempt, never a rejection. The transport is made inside `send` and closed whatever came of it. For a
 * non-pooled SMTP transport `close()` ends no send in flight: after the bound, the library's own timeouts end the
 * session, so a message may still be accepted after `timed-out` was answered.
 */
export function createGmailMailSender(
  configuration: GmailMailConfiguration,
  makeTransport: MakeMailTransport = DEFAULT_MAKE_TRANSPORT,
): MailSender {
  return {
    send: (message) => sendOnce(message, configuration, makeTransport),
  };
}

async function sendOnce(
  message: MailMessage,
  configuration: GmailMailConfiguration,
  makeTransport: MakeMailTransport,
): Promise<MailOutcome> {
  const options = tryBuildMessage(message, configuration);
  if (options === undefined) return MAIL_REFUSED_UNSENT;
  const transport = tryMakeTransport(configuration, makeTransport);
  if ("outcome" in transport) return transport.outcome;
  try {
    return await answerWithinBound(attemptSend(transport.made, options));
  } finally {
    closeQuietly(transport.made);
  }
}

function tryBuildMessage(
  message: MailMessage,
  configuration: GmailMailConfiguration,
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

function tryMakeTransport(
  configuration: GmailMailConfiguration,
  makeTransport: MakeMailTransport,
): { readonly made: MailTransport } | { readonly outcome: MailOutcome } {
  try {
    return { made: makeTransport(buildGmailTransportOptions(configuration)) };
  } catch (thrown) {
    return { outcome: outcomeOfSendFailure(thrown) };
  }
}

/** Settles with an outcome whether `sendMail` resolves, rejects or throws, so a late rejection is never unhandled. */
function attemptSend(
  transport: MailTransport,
  options: GmailMessageOptions,
): Promise<MailOutcome> {
  try {
    return Promise.resolve(transport.sendMail(options)).then(
      outcomeOfSendResult,
      outcomeOfSendFailure,
    );
  } catch (thrown) {
    return Promise.resolve(outcomeOfSendFailure(thrown));
  }
}

async function answerWithinBound(
  attempt: Promise<MailOutcome>,
): Promise<MailOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const bound = new Promise<MailOutcome>((resolve) => {
    timer = setTimeout(() => {
      resolve(MAIL_TIMED_OUT);
    }, MAIL_REQUEST_TIMEOUT_MS);
  });
  try {
    return await Promise.race([attempt, bound]);
  } finally {
    clearTimeout(timer);
  }
}

function closeQuietly(transport: MailTransport): void {
  try {
    transport.close();
  } catch {
    // The send's own answer stands: a failure to close changes nothing the caller can act on.
  }
}

/** The ASCII domain of one plain mailbox, lower-case, which is also what a `msg-id` may hold. */
function plainDomainOf(
  address: string,
  setting: keyof GmailMailConfiguration,
): string {
  const parts = address.split("@");
  const [localPart, domain] = parts;
  const asciiDomain = asciiDomainOf(domain);
  const isPlain =
    parts.length === 2 &&
    PLAIN_LOCAL_PART.test(localPart ?? "") &&
    PLAIN_ASCII_DOMAIN.test(asciiDomain);
  if (!isPlain) throw new UnusableMailAddressError(setting);
  return asciiDomain;
}

function asciiDomainOf(domain: string | undefined): string {
  return domain !== undefined && DOMAIN_BEFORE_CONVERSION.test(domain)
    ? domainToASCII(domain)
    : "";
}

function digestOf(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}
