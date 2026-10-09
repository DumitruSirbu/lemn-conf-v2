import "server-only";

/**
 * One fixed message. It names no recipient, no sender and no markup: the configured shop inbox is the
 * only recipient there is, and the adapter fills it, so a customer's address cannot become one by type.
 * `key` is the idempotency key; `text` is plain text.
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
