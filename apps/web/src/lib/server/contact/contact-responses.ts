import "server-only";

import type { SubmissionIssue } from "@lemnaria/configurator-domain";
import { isSubmissionReference } from "@lemnaria/persistence";
import { NextResponse } from "next/server";

import { limitedAnswerHeaders } from "@/lib/server/rate-limit/page-limit-page";

// Every answer of the contact route that is not a limit's (those are `rate-limited-response.ts`'s, as every write's
// are), made by one function. Each is JSON with a sentence and a code, never stored, and sets, clears or refreshes no
// cookie. None holds a submitted value: the sentences are fixed, and what an answer adds is a list of fields and codes,
// a list of the owner's own body ids, or a reference.

interface RefusalSpec {
  readonly status: number;
  readonly sentence: string;
}

/**
 * The refusals a caller can tell apart from one another and from the rest, each written once for a process and a code.
 * The honeypot's and the time's refusal is not among them: it writes no line.
 */
const LOGGED_REFUSALS = {
  CONTACT_CROSS_SITE: { status: 403, sentence: "This request is not allowed." },
  CONTACT_NOT_JSON: { status: 415, sentence: "The request must be JSON." },
  CONTACT_BODY_TOO_LARGE: {
    status: 413,
    sentence: "The request is too large.",
  },
  CONTACT_INVALID: { status: 400, sentence: "The request is not valid." },
  CONTACT_REQUEST_CONFLICT: {
    status: 409,
    sentence: "This request was already sent with other contents.",
  },
  CONTACT_DESIGN_NOT_CURRENT: {
    status: 409,
    sentence: "This design cannot be sent as it is.",
  },
  CONTACT_DESIGN_DOES_NOT_FIT: {
    status: 422,
    sentence: "This design does not fit its room.",
  },
} as const satisfies Readonly<Record<string, RefusalSpec>>;

export type ContactRefusalCode = keyof typeof LOGGED_REFUSALS;

export const CONTACT_REFUSAL_CODES = Object.freeze(
  Object.keys(LOGGED_REFUSALS) as readonly ContactRefusalCode[],
);

const REJECTED = {
  code: "CONTACT_REJECTED",
  status: 400,
  sentence: "The request could not be accepted.",
} as const;

export const CONTACT_NOTICE_NOT_SENT_STATUS = 502;
export const CONTACT_NOTICE_NOT_SENT_RETRY_CODE =
  "CONTACT_NOTICE_NOT_SENT_RETRY";
export const CONTACT_NOTICE_NOT_SENT_CODE = "CONTACT_NOTICE_NOT_SENT";
export type ContactNoticeNotSentCode =
  | typeof CONTACT_NOTICE_NOT_SENT_RETRY_CODE
  | typeof CONTACT_NOTICE_NOT_SENT_CODE;

const NOTICE_NOT_SENT_SENTENCE =
  "The request was saved but could not be passed on.";
const SENT_STATUS = 200;
const SENT_WORD = "sent";

/** The status a logged refusal is answered with, from the one table that answers it. */
export function statusOfContactRefusal(code: ContactRefusalCode): number {
  return LOGGED_REFUSALS[code].status;
}

/** `403`: the request came from another site. Nothing is counted. */
export function crossSiteAnswer(): NextResponse {
  return refusalAnswer("CONTACT_CROSS_SITE");
}

/** `415`: the body is not JSON by its content type. Nothing is counted. */
export function notJsonAnswer(): NextResponse {
  return refusalAnswer("CONTACT_NOT_JSON");
}

/** `413`: the body is past its bound. Nothing is counted. */
export function bodyTooLargeAnswer(): NextResponse {
  return refusalAnswer("CONTACT_BODY_TOO_LARGE");
}

/**
 * `400`: the body did not parse, which is no issues, or the schema refused it, which is each issue's field and code.
 * Every issue is rebuilt from those two, so nothing else it carried, a value included, can reach the body.
 */
export function invalidAnswer(
  issues: readonly SubmissionIssue[],
): NextResponse {
  return refusalAnswer("CONTACT_INVALID", {
    issues: issues.map(({ field, code }) => ({ field, code })),
  });
}

/** `409`: a request's id was stored with another payload. It holds no reference and nothing of whether a notice went. */
export function requestConflictAnswer(): NextResponse {
  return refusalAnswer("CONTACT_REQUEST_CONFLICT");
}

/** `409`: every way the owned load fails, an id of the wrong shape included, which is one answer. */
export function designNotCurrentAnswer(): NextResponse {
  return refusalAnswer("CONTACT_DESIGN_NOT_CURRENT");
}

/** `422`: a kitchen past its wall, with its own bodies' ids, which only the design's owner reaches. */
export function designDoesNotFitAnswer(
  placementIds: readonly string[],
): NextResponse {
  return refusalAnswer("CONTACT_DESIGN_DOES_NOT_FIT", {
    placementIds: [...placementIds],
  });
}

/** `400`: the honeypot was filled or the form was sent too fast, and nothing says which. It writes no line. */
export function rejectedAnswer(): NextResponse {
  return answerOf(REJECTED.status, {
    error: REJECTED.sentence,
    code: REJECTED.code,
  });
}

/** `502`: the request is stored and its notice was not accepted, and a retry may follow. It holds no reference. */
export function noticeNotSentRetryAnswer(): NextResponse {
  return noticeNotSent(CONTACT_NOTICE_NOT_SENT_RETRY_CODE);
}

/** `502`: the request is stored and its notice was not accepted, and a retry would not help. It holds no reference. */
export function noticeNotSentAnswer(): NextResponse {
  return noticeNotSent(CONTACT_NOTICE_NOT_SENT_CODE);
}

/** `200`: stored and its notice accepted, now or before. The reference is the label the customer is shown. */
export function sentAnswer(reference: string): NextResponse {
  if (!isSubmissionReference(reference)) {
    throw new RangeError("The reference is not the shape of a reference");
  }
  return answerOf(SENT_STATUS, { status: SENT_WORD, reference });
}

function noticeNotSent(code: ContactNoticeNotSentCode): NextResponse {
  return answerOf(CONTACT_NOTICE_NOT_SENT_STATUS, {
    error: NOTICE_NOT_SENT_SENTENCE,
    code,
  });
}

function refusalAnswer(
  code: ContactRefusalCode,
  extra: Readonly<Record<string, unknown>> = {},
): NextResponse {
  const { status, sentence } = LOGGED_REFUSALS[code];
  return answerOf(status, { error: sentence, code, ...extra });
}

/** The one maker: JSON, never stored, and no header that sets a cookie. */
function answerOf(
  status: number,
  body: Readonly<Record<string, unknown>>,
): NextResponse {
  return NextResponse.json(body, { status, headers: limitedAnswerHeaders() });
}
