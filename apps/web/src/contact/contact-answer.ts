import type { ContactFieldCode } from "@lemnaria/configurator-domain";

import {
  isContactFormField,
  type ContactFormField,
} from "./contact-form-model";

// What the contact route answered, as one of the classes the screen offers something for. Nothing here keeps the
// answer's sentence, its body or its headers: a class, the fields to mark, a reference or a wait in seconds.

export interface ContactFieldIssue {
  readonly field: ContactFormField;
  readonly code: ContactFieldCode;
}

export type ContactOutcome =
  | { readonly kind: "sent"; readonly reference: string }
  | { readonly kind: "failed" }
  | { readonly kind: "refused"; readonly issues: readonly ContactFieldIssue[] }
  | { readonly kind: "conflict" }
  | { readonly kind: "design-not-current" }
  | { readonly kind: "does-not-fit" }
  | { readonly kind: "limited"; readonly waitSeconds: number };

/** What the browser has of an answer. The body is what the answer's JSON read as, or `undefined` for none. */
export interface ContactAnswer {
  readonly status: number;
  readonly retryAfter: string | null;
  readonly body: unknown;
}

/** Any answer that is not one of the others, and a request that got no answer at all. */
export const FAILED_OUTCOME: ContactOutcome = { kind: "failed" };

const SENT_STATUS = 200;
const INVALID_STATUS = 400;
const CONFLICT_STATUS = 409;
const DOES_NOT_FIT_STATUS = 422;
const LIMIT_REACHED_STATUS = 429;

const SENT_WORD = "sent";
const INVALID_CODE = "CONTACT_INVALID";
const CONFLICT_CODE = "CONTACT_REQUEST_CONFLICT";
const DESIGN_NOT_CURRENT_CODE = "CONTACT_DESIGN_NOT_CURRENT";
const DOES_NOT_FIT_CODE = "CONTACT_DESIGN_DOES_NOT_FIT";
const LIMIT_REACHED_CODE = "CONTACT_LIMIT_REACHED";

/** A field's issue names its field under this prefix; the domain builds it from the field and its field code. */
const CONTACT_FIELD_PREFIX = "contact.";

/** The longest a contact wait can honestly be: the longest window, a UTC day. A `Retry-After` beyond it is not one
 *  the limit sent. Held here because the client must not import the server's policy; a test ties the two. */
export const LONGEST_CONTACT_WAIT_SECONDS = 86_400;
const SHORTEST_CONTACT_WAIT_SECONDS = 1;
/** The wait when the answer states none that can be believed. Never zero: a send at once is refused again. */
export const UNREADABLE_CONTACT_WAIT_SECONDS = 60;

const WHOLE_NUMBER_OF_SECONDS = /^\d+$/;

export function classifyContactAnswer(answer: ContactAnswer): ContactOutcome {
  if (answer.status === SENT_STATUS) return classifySent(answer.body);
  const code = codeOf(answer.body);
  if (answer.status === INVALID_STATUS && code === INVALID_CODE) {
    return classifyRefusedByField(answer.body);
  }
  if (answer.status === CONFLICT_STATUS && code === CONFLICT_CODE) {
    return { kind: "conflict" };
  }
  if (answer.status === CONFLICT_STATUS && code === DESIGN_NOT_CURRENT_CODE) {
    return { kind: "design-not-current" };
  }
  if (answer.status === DOES_NOT_FIT_STATUS && code === DOES_NOT_FIT_CODE) {
    return { kind: "does-not-fit" };
  }
  if (answer.status === LIMIT_REACHED_STATUS && code === LIMIT_REACHED_CODE) {
    return {
      kind: "limited",
      waitSeconds: contactWaitSecondsFrom(answer.retryAfter),
    };
  }
  return FAILED_OUTCOME;
}

/**
 * The seconds a limited send waits, read from `Retry-After`: a whole number from one second to the longest window.
 * Nought is a second, since a wait of nothing is the send this class exists to prevent. Absent, not a whole number or
 * beyond the window is the fixed minute, since nothing in it can be believed.
 */
export function contactWaitSecondsFrom(retryAfter: string | null): number {
  if (retryAfter === null || !WHOLE_NUMBER_OF_SECONDS.test(retryAfter)) {
    return UNREADABLE_CONTACT_WAIT_SECONDS;
  }
  const seconds = Number(retryAfter);
  if (seconds > LONGEST_CONTACT_WAIT_SECONDS) {
    return UNREADABLE_CONTACT_WAIT_SECONDS;
  }
  return Math.max(SHORTEST_CONTACT_WAIT_SECONDS, seconds);
}

function classifySent(body: unknown): ContactOutcome {
  const reference = ownValueOf(body, "reference");
  const isSent = ownValueOf(body, "status") === SENT_WORD;
  return isSent && typeof reference === "string"
    ? { kind: "sent", reference }
    : FAILED_OUTCOME;
}

/** An answer with no issue the form can place beside a field is a failure: the customer could not act on it. */
function classifyRefusedByField(body: unknown): ContactOutcome {
  const issues = ownValueOf(body, "issues");
  const placed = Array.isArray(issues) ? issues.flatMap(placedIssueOf) : [];
  return placed.length > 0
    ? { kind: "refused", issues: placed }
    : FAILED_OUTCOME;
}

function placedIssueOf(raw: unknown): readonly ContactFieldIssue[] {
  const submissionField = ownValueOf(raw, "field");
  const code = ownValueOf(raw, "code");
  if (typeof submissionField !== "string" || typeof code !== "string") {
    return [];
  }
  if (!submissionField.startsWith(CONTACT_FIELD_PREFIX)) return [];
  const field = submissionField.slice(CONTACT_FIELD_PREFIX.length);
  return isContactFormField(field)
    ? [{ field, code: asContactFieldCode(code) }]
    : [];
}

/**
 * The domain builds an issue on `contact.<field>` only from `validateContactFields`' own issues, whose code is a
 * `ContactFieldCode`; the domain exports the type and no runtime list of its members, so a list here would be a
 * second one. The screen looks the sentence up by this code and falls back to the failed sentence for one it lacks.
 */
function asContactFieldCode(code: string): ContactFieldCode {
  return code as ContactFieldCode;
}

function codeOf(body: unknown): string | undefined {
  const code = ownValueOf(body, "code");
  return typeof code === "string" ? code : undefined;
}

/** Only what the body's own object holds; anything that is not an object holds nothing. */
function ownValueOf(value: unknown, name: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  return Object.hasOwn(value, name)
    ? (value as Readonly<Record<string, unknown>>)[name]
    : undefined;
}
