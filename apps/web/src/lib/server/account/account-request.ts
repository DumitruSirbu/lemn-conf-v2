import "server-only";

import type { NextRequest, NextResponse } from "next/server";

import {
  reportAccountEvent,
  type AccountEvent,
} from "@/lib/server/account/account-log";
import {
  bodyTooLargeResponse,
  challengeFailedResponse,
  crossSiteResponse,
  invalidRequestResponse,
  notJsonResponse,
  unavailableResponse,
} from "@/lib/server/account/account-responses";
import { verifyTurnstile } from "@/lib/server/account/turnstile-verification";
import { isCrossSiteRequest } from "@/lib/server/cross-site-request";
import { readUtf8BodyWithLimit } from "@/lib/server/read-body-with-limit";

// What every account `POST` does the same way (M8B plan section 5, common order). Steps 1 to 3 are `readGuardedBody`;
// the pieces after the route's block stage are the body's parse, the challenge and the failure answer.

/** The body's bound in bytes, counted as they are read: an account form is a few hundred. */
const ACCOUNT_BODY_MAX_BYTES = 8 * 1024;

const JSON_MEDIA_TYPE = "application/json";

export type AccountRequestBody = Readonly<Record<string, unknown>>;

/** The body's text, or the answer for a request that is refused before anything is judged or read further. */
export type GuardedBody =
  | { readonly kind: "body"; readonly text: string }
  | { readonly kind: "refused"; readonly response: NextResponse };

/**
 * Steps 1 to 3: the cross-site check first, so nothing is read for a request from another site; then the media type;
 * then the body, to its bound. Nothing is counted and nothing is set.
 */
export async function readGuardedBody(
  request: NextRequest,
): Promise<GuardedBody> {
  if (isCrossSiteRequest(request)) return refused(crossSiteResponse());
  if (!isJsonRequest(request)) return refused(notJsonResponse());
  const body = await readUtf8BodyWithLimit(
    request.body,
    ACCOUNT_BODY_MAX_BYTES,
  );
  if (body.ok) return { kind: "body", text: body.value };
  return refused(
    body.failure === "too-large"
      ? bodyTooLargeResponse()
      : invalidRequestResponse(),
  );
}

/** The body as a plain object, or `undefined` for text that is not JSON or not an object. */
export function parseJsonObject(text: string): AccountRequestBody | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as AccountRequestBody)
      : undefined;
  } catch {
    return undefined;
  }
}

/** The body's own member of that name when it is text, otherwise `undefined`: an inherited name is not a member. */
export function textMemberOf(
  body: AccountRequestBody,
  name: string,
): string | undefined {
  if (!Object.hasOwn(body, name)) return undefined;
  const value = body[name];
  return typeof value === "string" ? value : undefined;
}

/**
 * Step 5: the answer that stops a request whose challenge was not passed, or nothing when it was. A token that is absent
 * or not text is a failed challenge. A check that could not be made is `503`, since a write that cannot be challenged
 * is refused.
 */
export async function refusalOfChallenge({
  body,
  expectedAction,
}: {
  body: AccountRequestBody;
  expectedAction: string;
}): Promise<NextResponse | undefined> {
  const outcome = await verifyTurnstile({
    token: textMemberOf(body, "turnstileToken") ?? "",
    expectedAction,
  });
  if (outcome === "passed") return undefined;
  return outcome === "failed"
    ? challengeFailedResponse()
    : unavailableResponse();
}

/**
 * Runs the request's work, and answers `503` if it throws. The thrown value is dropped: a driver error can quote an
 * address, and the line written down names the event and the outcome alone. Nothing is rethrown, so the framework's
 * own log never holds it either.
 */
export async function answerUnavailableOnFailure(
  event: AccountEvent,
  work: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await work();
  } catch {
    reportAccountEvent({ event, outcome: "unavailable" });
    return unavailableResponse();
  }
}

function refused(response: NextResponse): GuardedBody {
  return { kind: "refused", response };
}

/** The media type alone decides, whatever parameters follow it and in whatever case it is written. */
function isJsonRequest(request: NextRequest): boolean {
  const [mediaType = ""] = (request.headers.get("content-type") ?? "").split(
    ";",
  );
  return mediaType.trim().toLowerCase() === JSON_MEDIA_TYPE;
}
