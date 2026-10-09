import "server-only";

/**
 * One fixed message. It names no recipient, no sender and no markup: the configured shop inbox is the
 * only recipient there is, and the adapter fills it, so a customer's address cannot become one by type.
 * `key` is the idempotency key; `text` is plain text. What may be sent is `isSendableMailMessage`:
 * a key of 1 to 256 visible ASCII characters, a non-empty subject on one line, and a non-empty text.
 */
export interface MailMessage {
  readonly key: string;
  readonly subject: string;
  readonly text: string;
}

/** A closed list. Nothing a provider said is kept beyond which of these it was and, when there was one,
 *  its HTTP status. */
export const MAIL_FAILURE_KINDS = [
  "unreadable-answer",
  "payload-mismatch",
  "busy",
  "quota-spent",
  "refused",
  "unreachable",
  "timed-out",
] as const;

export type MailFailureKind = (typeof MAIL_FAILURE_KINDS)[number];

export type MailOutcome =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly kind: MailFailureKind;
      readonly status?: number;
    };

/** A send answers with a value and never rejects: a caller reads the kind, not an exception. */
export interface MailSender {
  send(message: MailMessage): Promise<MailOutcome>;
}

export const MAIL_ACCEPTED: MailOutcome = Object.freeze({ ok: true });

/** The answer for a message that may not be sent: ours, given before any request, so it has no status. */
export const MAIL_REFUSED_UNSENT: MailOutcome = Object.freeze({
  ok: false,
  kind: "refused",
});

const KEY_MAX_LENGTH = 256;

/** A value that can ride in a header: visible ASCII only, no space and no control character. */
export const VISIBLE_ASCII_KEY = /^[\x21-\x7e]+$/;

/** A character that ends or breaks a line, as the domain names the categories. The notice asks this same class of
 *  every line it writes, so what it writes passes the predicate. */
export const LINE_BREAKING_CHARACTER = /[\p{Cc}\p{Zl}\p{Zp}]/u;

/**
 * Asked by every sender before it builds anything from the message: a key that cannot be a header
 * value, or a subject that could break one, must never reach a request, and the fake agrees with the
 * adapter because both ask this.
 */
export function isSendableMailMessage(message: MailMessage): boolean {
  const { key, subject, text } = message;
  return (
    typeof key === "string" &&
    key.length <= KEY_MAX_LENGTH &&
    VISIBLE_ASCII_KEY.test(key) &&
    typeof subject === "string" &&
    subject.length > 0 &&
    !LINE_BREAKING_CHARACTER.test(subject) &&
    typeof text === "string" &&
    text.length > 0
  );
}

/**
 * The only way a sender reads a message: its three members once, into a copy that cannot change, which the
 * predicate then judges. A sender builds only from the copy, so what was judged is what is sent. A message
 * that cannot be read, or may not be sent, answers nothing.
 */
export function sendableCopyOf(message: MailMessage): MailMessage | undefined {
  const copy = readCopy(message);
  return copy !== undefined && isSendableMailMessage(copy) ? copy : undefined;
}

function readCopy(message: MailMessage): MailMessage | undefined {
  try {
    const { key, subject, text } = message;
    return Object.freeze({ key, subject, text });
  } catch {
    return undefined;
  }
}

// `quota-spent` is not retried automatically: a caller stops on it and says so, rather than looping.
const IS_RETRYABLE: Readonly<Record<MailFailureKind, boolean>> = {
  "unreadable-answer": true,
  "payload-mismatch": false,
  busy: true,
  "quota-spent": false,
  refused: false,
  unreachable: true,
  "timed-out": true,
};

/** The one place that says which failures a retry may follow. */
export function isRetryableMailFailure(kind: MailFailureKind): boolean {
  return IS_RETRYABLE[kind];
}
