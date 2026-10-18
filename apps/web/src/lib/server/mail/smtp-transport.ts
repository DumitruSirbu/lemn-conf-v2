import "server-only";

import { createHash } from "node:crypto";

import {
  MAIL_REFUSED_UNSENT,
  type MailMessage,
  type MailOutcome,
} from "@/lib/server/mail/mail-sender";
import {
  MAIL_TIMED_OUT,
  outcomeOfSendFailure,
  outcomeOfSendResult,
} from "@/lib/server/mail/smtp-answer";

/** One bound over the whole send: the customer waits for it. */
export const MAIL_REQUEST_TIMEOUT_MS = 10_000;

// Each is a positive integer strictly below the bound: the library falls back to its own minutes-long default for 0.
const DNS_TIMEOUT_MS = 2_000;
const CONNECTION_TIMEOUT_MS = 4_000;
const GREETING_TIMEOUT_MS = 3_000;
const SOCKET_TIMEOUT_MS = 6_000;

/** What every SMTP transport shares: no pool, no logging, no file or URL reads, and every wait shorter than the bound. */
export const HARDENED_TRANSPORT_OPTIONS = {
  pool: false,
  logger: false,
  debug: false,
  disableFileAccess: true,
  disableUrlAccess: true,
  dnsTimeout: DNS_TIMEOUT_MS,
  connectionTimeout: CONNECTION_TIMEOUT_MS,
  greetingTimeout: GREETING_TIMEOUT_MS,
  socketTimeout: SOCKET_TIMEOUT_MS,
} as const;

/** Exactly what rides on the wire: no reply-to, no copy, no attachment, no header of its own. With `html` the
 *  library writes `multipart/alternative`, the text part first. */
export interface SmtpMessageOptions {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly messageId: string;
  readonly html?: string;
}

export interface MailTransport {
  sendMail(options: SmtpMessageOptions): Promise<unknown>;
  close(): void;
}

/** A customer message whose recipient is not one plain mailbox. Holds no address. */
export class UnusableRecipientError extends Error {
  constructor() {
    super("The message's recipient is not one plain mailbox address");
    this.name = "UnusableRecipientError";
  }
}

/**
 * Pure. The `Message-ID` is a digest of the key, so the client's request id reaches no header and a retry carries the
 * same id. `html` is added only when the copy has one.
 */
export function messageOptionsOf({
  copy,
  from,
  senderDomain,
  to,
}: {
  readonly copy: MailMessage;
  readonly from: string;
  readonly senderDomain: string;
  readonly to: string;
}): SmtpMessageOptions {
  const options: SmtpMessageOptions = {
    from,
    to,
    subject: copy.subject,
    text: copy.text,
    messageId: `<${digestOf(copy.key)}@${senderDomain}>`,
  };
  const { html } = copy;
  return html === undefined ? options : { ...options, html };
}

/**
 * One attempt, never a rejection. The transport is made inside the call and closed whatever came of it; a throw while
 * making it answers by the failure table. For a non-pooled SMTP transport `close()` ends no send in flight: after the
 * bound, the library's own timeouts end the session, so a message may still be accepted after `timed-out` was answered.
 */
export async function sendOnce(
  options: SmtpMessageOptions | undefined,
  makeTransport: () => MailTransport,
): Promise<MailOutcome> {
  if (options === undefined) return MAIL_REFUSED_UNSENT;
  const transport = tryMakeTransport(makeTransport);
  if ("outcome" in transport) return transport.outcome;
  try {
    return await answerWithinBound(attemptSend(transport.made, options));
  } finally {
    closeQuietly(transport.made);
  }
}

function tryMakeTransport(
  makeTransport: () => MailTransport,
): { readonly made: MailTransport } | { readonly outcome: MailOutcome } {
  try {
    return { made: makeTransport() };
  } catch (thrown) {
    return { outcome: outcomeOfSendFailure(thrown) };
  }
}

/** Settles with an outcome whether `sendMail` resolves, rejects or throws, so a late rejection is never unhandled. */
function attemptSend(
  transport: MailTransport,
  options: SmtpMessageOptions,
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

function digestOf(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}
