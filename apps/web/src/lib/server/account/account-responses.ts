import "server-only";

import { NextResponse } from "next/server";

import type {
  AccountField,
  Capability,
  AccountFieldCode,
  PasswordRefusalCode,
} from "@lemnaria/configurator-domain";

import { LONGEST_DAY_SECONDS } from "@/lib/server/rate-limit/chisinau-day";
import type { WriteJudgement } from "@/lib/server/rate-limit/enforce-rate-limit";

// The closed set of answers the account routes give (M8B plan section 5). Every answer is `private, no-store`, a body
// of a `status` word and nothing else but what that status needs, and none holds a password, a token, an address or
// a number that tells a count. A route builds no `NextResponse` of its own, so this file is the whole list.

const ACCOUNT_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

const SHORTEST_WAIT_SECONDS = 1;

/** The password's own refusals: the domain's three, the breach check's, and a password that was not text. */
export type PasswordIssueCode =
  | PasswordRefusalCode
  | "PASSWORD_BREACHED"
  | "PASSWORD_NOT_TEXT";

/** One field and one code, never the value that was refused. */
export interface AccountInputIssue {
  readonly field: AccountField | "password";
  readonly code: AccountFieldCode | PasswordIssueCode;
}

/** `403`: the request came from another site; nothing was read. */
export function crossSiteResponse(): NextResponse {
  return statusResponse(403, "cross-site");
}

/** `415`: the body is not JSON. */
export function notJsonResponse(): NextResponse {
  return statusResponse(415, "unsupported-media-type");
}

/** `413`: the body is past its bound. */
export function bodyTooLargeResponse(): NextResponse {
  return statusResponse(413, "body-too-large");
}

/** `400`: the body could not be read as the object the route takes, or its stream broke. */
export function invalidRequestResponse(): NextResponse {
  return statusResponse(400, "invalid-request");
}

/** `403`: the challenge was not passed. */
export function challengeFailedResponse(): NextResponse {
  return statusResponse(403, "challenge-failed");
}

/** `400`: fields the person can correct. The issues are independent of whether the address has an account. */
export function invalidInputResponse(
  issues: readonly AccountInputIssue[],
): NextResponse {
  return NextResponse.json(
    { status: "invalid-input", issues },
    { status: 400, headers: ACCOUNT_RESPONSE_HEADERS },
  );
}

/** `202`: the answer to a registration, whether the address was new, pending or already confirmed. */
export function checkInboxResponse(): NextResponse {
  return statusResponse(202, "check-inbox");
}

/** `400`: the one answer to a confirmation that did not succeed, whatever the reason. */
export function linkOrPasswordInvalidResponse(): NextResponse {
  return statusResponse(400, "link-or-password-invalid");
}

/** `400`: the one answer to a reset that did not succeed because of its link: unknown, used, expired, superseded, or the
 *  token of an account never confirmed. */
export function linkInvalidResponse(): NextResponse {
  return statusResponse(400, "link-invalid");
}

/** `200`: the password was replaced and every session of the account ended. No session is started and no cookie set:
 *  the client signs in with the new password. */
export function passwordChangedResponse(): NextResponse {
  return statusResponse(200, "password-changed");
}

/** `200`: the client is signed in. The route sets the session cookie on this very response. */
export function signedInResponse(claimable: number): NextResponse {
  return NextResponse.json(
    { status: "signed-in", claimable },
    { status: 200, headers: ACCOUNT_RESPONSE_HEADERS },
  );
}

/** `401`: the one answer to a sign-in that did not succeed: an unknown address, a wrong password and a correct password
 *  on an unconfirmed account read alike (ADR 0169 Amendment A). */
export function invalidCredentialsResponse(): NextResponse {
  return statusResponse(401, "invalid-credentials");
}

/** `204`: a logout was done, or there was nothing to do. The route clears the session cookie on this very response. */
export function loggedOutResponse(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: ACCOUNT_RESPONSE_HEADERS,
  });
}

/** `200`: nobody is signed in. */
export function anonymousSessionResponse(): NextResponse {
  return NextResponse.json(
    { state: "anonymous" },
    { status: 200, headers: ACCOUNT_RESPONSE_HEADERS },
  );
}

/** `200`: who is signed in, by address and capabilities alone. No id, role or verification flag leaves the server. */
export function signedInSessionResponse({
  email,
  capabilities,
}: {
  email: string;
  capabilities: readonly Capability[];
}): NextResponse {
  return NextResponse.json(
    { state: "signed-in", email, capabilities },
    { status: 200, headers: ACCOUNT_RESPONSE_HEADERS },
  );
}

/** `429`: a limit is reached. `Retry-After` is the whole seconds to wait and the only number in the answer. */
export function rateLimitedResponse(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { status: "rate-limited" },
    {
      status: 429,
      headers: {
        ...ACCOUNT_RESPONSE_HEADERS,
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}

/** `503`: something of ours could not be reached or judged, so nothing was changed. No cause, no `Retry-After`. */
export function unavailableResponse(): NextResponse {
  return statusResponse(503, "unavailable");
}

/**
 * The answer that stops a request, or nothing when its limit allows it. The judgement has already been written down by
 * `judge-account-request.ts`, so this logs nothing. A wait that is not whole seconds inside one day is a defect, and
 * answers as unavailable: a refusal is never given with a wait it cannot tell.
 */
export function answerOfJudgement({
  decision,
}: WriteJudgement): NextResponse | undefined {
  if (decision.kind === "allow") return undefined;
  if (decision.kind === "unavailable") return unavailableResponse();
  return isTellableWait(decision.retryAfterSeconds)
    ? rateLimitedResponse(decision.retryAfterSeconds)
    : unavailableResponse();
}

function isTellableWait(seconds: number): boolean {
  return (
    Number.isInteger(seconds) &&
    seconds >= SHORTEST_WAIT_SECONDS &&
    seconds <= LONGEST_DAY_SECONDS
  );
}

function statusResponse(status: number, word: string): NextResponse {
  return NextResponse.json(
    { status: word },
    { status, headers: ACCOUNT_RESPONSE_HEADERS },
  );
}
