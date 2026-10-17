import "server-only";

/**
 * One fixed message. It names no recipient and no sender: the configured shop inbox is the only recipient there is,
 * and the adapter fills it, so a customer's address cannot become one by type. `key` is the idempotency key; `text`
 * is plain text, and `html`, when present, is the same message as markup, sent beside `text` as its alternative.
 * What may be sent is `isSendableMailMessage`: a key of 1 to 256 visible ASCII characters, a non-empty subject on
 * one line, a non-empty text, and an `html` that is absent or a non-empty text of at most `HTML_MAX_LENGTH`.
 * A message with a `recipient` member of its own is a customer's, not the shop's, and the shop path refuses it unsent
 * (`sendableCopyOf`), so a customer message cannot reach the shop inbox through a mis-wired sender.
 */
export interface MailMessage {
  readonly key: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
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

/** A send answers with a value and never rejects: a caller reads the kind, not an exception. `send` is a property, not
 *  a method, so its parameter is checked contravariantly and a `CustomerMailSender` cannot stand in for the shop's. */
export interface MailSender {
  readonly send: (message: MailMessage) => Promise<MailOutcome>;
}

export const MAIL_ACCEPTED: MailOutcome = Object.freeze({ ok: true });

/** The answer for a message that may not be sent: ours, given before any request, so it has no status. */
export const MAIL_REFUSED_UNSENT: MailOutcome = Object.freeze({
  ok: false,
  kind: "refused",
});

const KEY_MAX_LENGTH = 256;

/** UTF-16 code units. Far above the notice's own 90 000-byte budget, so only a defect reaches it; a mail that long is
 *  clipped by the shop's client anyway. */
export const HTML_MAX_LENGTH = 262_144;

/** A value that can ride in a header: visible ASCII only, no space and no control character. */
export const VISIBLE_ASCII_KEY = /^[\x21-\x7e]+$/;

/** A character that ends or breaks a line, as the domain names the categories. The notice asks this same class of
 *  every line it writes, so what it writes passes the predicate. */
export const LINE_BREAKING_CHARACTER = /[\p{Cc}\p{Zl}\p{Zp}]/u;

/**
 * The rule for what may be sent: a key that cannot be a header value, or a subject that could break one, never
 * reaches a request. A sender asks it through `sendableCopyOf`, which judges the copy it reads, so the fake and
 * the adapter agree.
 */
export function isSendableMailMessage(message: MailMessage): boolean {
  const { key, subject, text, html } = message;
  return (
    typeof key === "string" &&
    key.length <= KEY_MAX_LENGTH &&
    VISIBLE_ASCII_KEY.test(key) &&
    typeof subject === "string" &&
    subject.length > 0 &&
    !LINE_BREAKING_CHARACTER.test(subject) &&
    typeof text === "string" &&
    text.length > 0 &&
    isAbsentOrSendableHtml(html)
  );
}

function isAbsentOrSendableHtml(html: unknown): boolean {
  return (
    html === undefined ||
    (typeof html === "string" &&
      html.length > 0 &&
      html.length <= HTML_MAX_LENGTH)
  );
}

/**
 * The only way the shop's sender reads a message: its four members once, into a copy that cannot change, which the
 * predicate then judges. The copy holds `html` only when the message had one, so a plain-text message's copy has
 * three members. A sender builds only from the copy, so what was judged is what is sent. A message that cannot be
 * read, that has a `recipient` member of its own, or that may not be sent, answers nothing.
 */
export function sendableCopyOf(message: MailMessage): MailMessage | undefined {
  return hasOwnRecipient(message) ? undefined : sendableBodyCopyOf(message);
}

/**
 * `sendableCopyOf` without the recipient refusal: for the customer path, which reads the recipient itself and has the
 * shop path's rules for everything else. A shop sender never calls it.
 */
export function sendableBodyCopyOf(
  message: MailMessage,
): MailMessage | undefined {
  const copy = readCopy(message);
  return copy !== undefined && isSendableMailMessage(copy) ? copy : undefined;
}

/** A message that cannot be inspected counts as having one: it answers nothing. */
function hasOwnRecipient(message: MailMessage): boolean {
  try {
    return Object.hasOwn(message, "recipient");
  } catch {
    return true;
  }
}

function readCopy(message: MailMessage): MailMessage | undefined {
  try {
    const { key, subject, text, html } = message;
    return Object.freeze(
      html === undefined
        ? { key, subject, text }
        : { key, subject, text, html },
    );
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
