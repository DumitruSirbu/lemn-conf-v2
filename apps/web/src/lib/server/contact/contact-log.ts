import "server-only";

import { isSubmissionReference } from "@lemnaria/persistence";

import {
  CONTACT_NOTICE_NOT_SENT_CODE,
  CONTACT_NOTICE_NOT_SENT_RETRY_CODE,
  CONTACT_NOTICE_NOT_SENT_STATUS,
  CONTACT_REFUSAL_CODES,
  statusOfContactRefusal,
  type ContactNoticeNotSentCode,
  type ContactRefusalCode,
  type DesignRefusalCode,
} from "@/lib/server/contact/contact-responses";
import {
  MAIL_FAILURE_KINDS,
  type MailFailureKind,
} from "@/lib/server/mail/mail-sender";
import { UNAVAILABLE_CAUSES } from "@/lib/server/rate-limit/enforce-rate-limit";
import { ALL_LIMIT_POLICIES } from "@/lib/server/rate-limit/limit-policy";
import {
  CONTACT_LIMIT_REACHED_CODE,
  CONTACT_UNAVAILABLE_CODE,
  CONTACT_UNAVAILABLE_STATUS,
  LIMIT_REACHED_STATUS,
} from "@/lib/server/rate-limit/rate-limited-response";

// The contact route's lines, over closed lists and with a label of their own. This module is handed no request, no
// contact, no snapshot and no id, so it cannot write one: a line holds a code, a status, a policy's name, a cause from
// a closed list, a mail failure's kind, the provider's status, and a reference of a reference's shape. Nothing a thrown
// value said is ever a parameter, so nothing of one is written but which cause it became. The honeypot's refusal and
// the time's write no line, and there is no function that could.

/** The limiter's own causes, and the four a contact request adds. A closed list that types the line too. */
export const CONTACT_UNAVAILABLE_CAUSES = [
  ...UNAVAILABLE_CAUSES,
  "sender-unusable",
  "submission-store-failed",
  "notice-unbuildable",
  "price-book-mismatch",
  "unexpected",
] as const;

export type ContactUnavailableCause =
  (typeof CONTACT_UNAVAILABLE_CAUSES)[number];

/** What a line says for a value outside its list: the list's own word for a cause, and `other` for a kind. */
const OTHER_KIND = "other";
const UNEXPECTED_CAUSE: ContactUnavailableCause = "unexpected";
const NO_POLICY_NAME = "none";

const REFUSED_EVENT = "contact-request-refused";
const WRITTEN_LINES_LABEL = "[contact]";
const LOWEST_HTTP_STATUS = 100;
const HIGHEST_HTTP_STATUS = 599;

const POLICY_NAMES: ReadonlySet<string> = new Set(
  ALL_LIMIT_POLICIES.map(({ name }) => name),
);

/** The only state of this module: what has been written already, so a flood of one refusal writes one line. */
const refusalsWritten = new Set<string>();

type ContactLine = Readonly<Record<string, string | number>>;

/**
 * A limit refused the request: the code, the status and the policy of the step that ended it, once for a process and
 * a policy, so that a flood past a figure buys no log write a request. A name that is not one of the policies' own is
 * written as none.
 */
export function reportContactLimitRefused(policyName: string): void {
  const policy = POLICY_NAMES.has(policyName) ? policyName : NO_POLICY_NAME;
  writeOnce(`policy:${policy}`, "warn", {
    event: REFUSED_EVENT,
    refusalCode: CONTACT_LIMIT_REACHED_CODE,
    status: LIMIT_REACHED_STATUS,
    policy,
  });
}

/** Any other refusal a line is written for, once for a process and a code. */
export function reportContactRefused(code: ContactRefusalCode): void {
  if (!CONTACT_REFUSAL_CODES.includes(code)) return;
  writeOnce(`code:${code}`, "warn", {
    event: REFUSED_EVENT,
    refusalCode: code,
    status: statusOfContactRefusal(code),
  });
}

/** The request could not be judged or taken: each time, since the store failing is the signal, with the cause it
 *  became. A value that is not on the list is `unexpected`, and nothing of it is kept. */
export function reportContactUnavailable(cause: ContactUnavailableCause): void {
  write("error", {
    event: "contact-request-unavailable",
    refusalCode: CONTACT_UNAVAILABLE_CODE,
    status: CONTACT_UNAVAILABLE_STATUS,
    cause: causeOnTheList(cause),
  });
}

/** Why a stored request's notice was not passed on: the mail said no, with its kind and the provider's HTTP status when
 *  there was one, or something of ours failed, with a cause from the closed list. One of the two, never both. */
export type ContactNoticeFailure =
  | {
      readonly kind: "mail";
      readonly failureKind: MailFailureKind;
      readonly providerStatus: number | undefined;
    }
  | { readonly kind: "cause"; readonly cause: ContactUnavailableCause };

/** What a notice that was not passed on is written with. */
export interface ContactNoticeNotSent {
  readonly code: ContactNoticeNotSentCode;
  readonly failure: ContactNoticeFailure;
  /** The stored request's reference: the line holds it, and the answer never does. */
  readonly reference: string;
}

/** The request is stored and its notice was not passed on: each time, with the mail failure's kind and the provider's
 *  status when there was one, or the cause, and the reference. */
export function reportContactNoticeNotSent({
  code,
  failure,
  reference,
}: ContactNoticeNotSent): void {
  write("error", {
    event: "contact-notice-not-sent",
    refusalCode: noticeCodeOnTheList(code),
    status: CONTACT_NOTICE_NOT_SENT_STATUS,
    ...failureFields(failure),
    ...referenceField(reference),
  });
}

/** A stored request whose retry was refused for its design: it is never notified unless the design returns, so the
 *  line names it each time, with the code and the reference. */
export function reportContactStoredRequestRefused(
  code: DesignRefusalCode,
  reference: string,
): void {
  write("error", {
    event: "contact-stored-request-refused",
    refusalCode: code,
    status: statusOfContactRefusal(code),
    ...referenceField(reference),
  });
}

/** The notice was accepted and the mark that says so failed: still a success, each time, with the reference. */
export function reportContactMarkFailed(reference: string): void {
  write("error", {
    event: "contact-mark-failed",
    ...referenceField(reference),
  });
}

function causeOnTheList(cause: unknown): ContactUnavailableCause {
  return (
    CONTACT_UNAVAILABLE_CAUSES.find((known) => known === cause) ??
    UNEXPECTED_CAUSE
  );
}

function kindOnTheList(kind: unknown): string {
  return MAIL_FAILURE_KINDS.find((known) => known === kind) ?? OTHER_KIND;
}

/** A code outside the two the type names, which only a cast reaches, is written as the one that says no retry. */
function noticeCodeOnTheList(code: ContactNoticeNotSentCode): string {
  return code === CONTACT_NOTICE_NOT_SENT_RETRY_CODE
    ? CONTACT_NOTICE_NOT_SENT_RETRY_CODE
    : CONTACT_NOTICE_NOT_SENT_CODE;
}

function failureFields(failure: ContactNoticeFailure): ContactLine {
  try {
    if (failure.kind === "mail") {
      return {
        mailFailureKind: kindOnTheList(failure.failureKind),
        ...providerStatusField(failure.providerStatus),
      };
    }
    return { cause: causeOnTheList(failure.cause) };
  } catch {
    // A value that cannot be read is no cause on the list: it is the cause that says so, and nothing of it is kept.
    return { cause: UNEXPECTED_CAUSE };
  }
}

function providerStatusField(status: number | undefined): ContactLine {
  const isStatus =
    typeof status === "number" &&
    Number.isInteger(status) &&
    status >= LOWEST_HTTP_STATUS &&
    status <= HIGHEST_HTTP_STATUS;
  return isStatus ? { providerStatus: status } : {};
}

function referenceField(reference: unknown): ContactLine {
  return typeof reference === "string" && isSubmissionReference(reference)
    ? { reference }
    : {};
}

function writeOnce(
  identity: string,
  severity: "warn" | "error",
  line: ContactLine,
): void {
  if (refusalsWritten.has(identity)) return;
  refusalsWritten.add(identity);
  write(severity, line);
}

/**
 * The one transport choice: `console` with a structured second argument. The write may not throw: a diagnostic that
 * can fail replaces the answer it exists to explain, and the only thing left to report a failed report with is the
 * transport that just failed.
 */
function write(severity: "warn" | "error", line: ContactLine): void {
  try {
    (severity === "error" ? console.error : console.warn)(
      WRITTEN_LINES_LABEL,
      line,
    );
  } catch {
    // Nothing to fall back to, and nothing may escape.
  }
}
