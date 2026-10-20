import "server-only";

import { NextResponse } from "next/server";

import type {
  AccountField,
  Capability,
  AccountFieldCode,
  EmailChangeIssue,
  KitchenNameRefusalCode,
  PasswordChangeIssue,
  PasswordRefusalCode,
  ProfileTextIssue,
} from "@lemnaria/configurator-domain";

import type { KitchenListWire } from "@/account/kitchens/kitchens-wire-contract";
import { LONGEST_DAY_SECONDS } from "@/lib/server/rate-limit/chisinau-day";
import type { WriteJudgement } from "@/lib/server/rate-limit/enforce-rate-limit";
import type { ReadJudgement } from "@/lib/server/rate-limit/judge-read-request";

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

/** One field and one code, never the value that was refused. A field is named as the request member that carried it. */
export interface AccountInputIssue {
  readonly field:
    | AccountField
    | "password"
    | PasswordChangeIssue["field"]
    | EmailChangeIssue["field"]
    | ProfileTextIssue["field"];
  readonly code:
    | AccountFieldCode
    | PasswordIssueCode
    | PasswordChangeIssue["code"]
    | EmailChangeIssue["code"]
    | ProfileTextIssue["code"]
    | KitchenNameRefusalCode;
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

/** `400`: the one answer to a reset that did not succeed because of its link: unknown, used, expired, superseded, or
 *  the token of an account never confirmed. */
export function linkInvalidResponse(): NextResponse {
  return statusResponse(400, "link-invalid");
}

/** `200`: the password was replaced and every session of the account ended. No session is started and no cookie set:
 *  the client signs in with the new password. */
export function passwordChangedResponse(): NextResponse {
  return statusResponse(200, "password-changed");
}

/** `200`: a signed-in account replaced its password and every session ended; the route sets the replacing session's
 *  cookie on this very response, so this device stays signed in. Never given without that cookie. */
export function passwordChangedKeepingSessionResponse(): NextResponse {
  return statusResponse(200, "password-changed");
}

/** `401`: the password was changed and every session ended, but this device's replacing session could not be started.
 *  The route clears the session cookie on this very response; the person signs in with the new password. */
export function passwordChangedSignInResponse(): NextResponse {
  return statusResponse(401, "password-changed-sign-in");
}

/** `400`: the current password did not verify, because it was wrong or because it is a text no password can be. The
 *  person's own password is the one thing the answer may speak of. */
export function wrongPasswordResponse(): NextResponse {
  return statusResponse(400, "wrong-password");
}

/** `200`: the address of the account was replaced by the one the link carried and every session ended; no session is
 *  started, so the person signs in with the new address. */
export function emailChangedResponse(): NextResponse {
  return statusResponse(200, "email-changed");
}

/** `200`: the address of the account was put back to the one the undo link carried, the password was replaced by the one
 *  the request chose, and every session ended; no session is started, so the person signs in with the restored address
 *  and the new password. */
export function emailRevertedResponse(): NextResponse {
  return statusResponse(200, "email-reverted");
}

/** `200`: the profile fields the request named were saved. */
export function profileSavedResponse(): NextResponse {
  return statusResponse(200, "saved");
}

/** `200`: the signed-in account's own optional details, `null` for one never given. No address, hash or id. */
export function profileResponse(profile: {
  name: string | null;
  address: string | null;
  phone: string | null;
}): NextResponse {
  return NextResponse.json(
    {
      name: profile.name,
      address: profile.address,
      phone: profile.phone,
    },
    { status: 200, headers: ACCOUNT_RESPONSE_HEADERS },
  );
}

/** `409`: the account holds more kitchens than one export carries. Repeating the request cannot change that, so a
 *  client must not offer a retry. */
export function exportTooLargeResponse(): NextResponse {
  return statusResponse(409, "export-too-large");
}

/** The file name the download carries: ASCII, since it travels in a header. */
const ACCOUNT_EXPORT_FILE_NAME = "lemnaria-account-data.json";

/** `200`: the signed-in account's own data as a JSON download. `body` is the finished text; nothing is added to it. */
export function accountExportResponse(body: string): NextResponse {
  return new NextResponse(body, {
    status: 200,
    headers: {
      ...ACCOUNT_RESPONSE_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ACCOUNT_EXPORT_FILE_NAME}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** `200`: the client is signed in. The route sets the session cookie on this very response. */
export function signedInResponse(claimable: number): NextResponse {
  return NextResponse.json(
    { status: "signed-in", claimable },
    { status: 200, headers: ACCOUNT_RESPONSE_HEADERS },
  );
}

/** `401`: the one answer to a sign-in that did not succeed: an unknown address, a wrong password and a correct password
 *  on an unconfirmed account read alike (ADR 0172 Amendment A). */
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

/** `200`: how many designs the signed-in account could claim from this browser. Changes nothing. */
export function claimableResponse(claimable: number): NextResponse {
  return NextResponse.json(
    { claimable },
    { status: 200, headers: ACCOUNT_RESPONSE_HEADERS },
  );
}

/** `200`: how many designs the claim gave to the signed-in account. */
export function claimedResponse(claimed: number): NextResponse {
  return NextResponse.json(
    { claimed },
    { status: 200, headers: ACCOUNT_RESPONSE_HEADERS },
  );
}

/** `200`: a page of the signed-in account's listed kitchens. Changes nothing. */
export function kitchenListResponse(list: KitchenListWire): NextResponse {
  return NextResponse.json(list, {
    status: 200,
    headers: ACCOUNT_RESPONSE_HEADERS,
  });
}

/** `200`: the kitchen has the name shown here, which is the judged form that was stored, not the text as typed. */
export function kitchenRenamedResponse(name: string): NextResponse {
  return NextResponse.json(
    { name },
    { status: 200, headers: ACCOUNT_RESPONSE_HEADERS },
  );
}

/** `201`: the copy of a kitchen exists under this new id. */
export function kitchenDuplicatedResponse(id: string): NextResponse {
  return NextResponse.json(
    { id },
    { status: 201, headers: ACCOUNT_RESPONSE_HEADERS },
  );
}

/** `204`: a kitchen was hidden or deleted from its owner's list. */
export function kitchenMarkedResponse(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: ACCOUNT_RESPONSE_HEADERS,
  });
}

/** `409`: the kitchen belongs to the caller and was sent to the shop, so it cannot be deleted. */
export function kitchenSentResponse(): NextResponse {
  return statusResponse(409, "sent");
}

/** `409`: the kitchen belongs to the caller and was never sent to the shop, so it cannot be hidden. */
export function kitchenNotSentResponse(): NextResponse {
  return statusResponse(409, "not-sent");
}

/** `401`: the route needs a signed-in account and the request has none (or its session could not be read). */
export function unauthenticatedResponse(): NextResponse {
  return statusResponse(401, "unauthenticated");
}

/** `403`: the session is live but its account may not do this: a role without the capability, or an unconfirmed
 *  address. */
export function forbiddenResponse(): NextResponse {
  return statusResponse(403, "forbidden");
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

/**
 * The `429` that stops a read, or nothing when it is served. A read fails open, so a wait that cannot be told is
 * served too, as `refusalOfReadLimit` does for the design reads.
 */
export function answerOfReadJudgement(
  judgement: ReadJudgement,
): NextResponse | undefined {
  if (judgement.kind === "serve") return undefined;
  return isTellableWait(judgement.retryAfterSeconds)
    ? rateLimitedResponse(judgement.retryAfterSeconds)
    : undefined;
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
