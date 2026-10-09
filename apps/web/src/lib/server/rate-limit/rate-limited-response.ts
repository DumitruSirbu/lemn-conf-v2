import "server-only";

import { NextResponse } from "next/server";

import { LONGEST_DAY_SECONDS } from "@/lib/server/rate-limit/chisinau-day";
import {
  longestWaitSecondsOf,
  READ_POLICY,
  SHARE_WRITE_POLICY,
} from "@/lib/server/rate-limit/limit-policy";
import {
  MINT_LIMIT_REACHED_CODE,
  MINT_LIMIT_REACHED_STATUS,
} from "@/persistence/design-request-errors";

export { MINT_LIMIT_REACHED_CODE };
export const MINT_UNAVAILABLE_CODE = "MINT_UNAVAILABLE";
export const MINT_UNAVAILABLE_STATUS = 503;

const LIMIT_REACHED_SENTENCE = "The limit on new designs is reached for today.";
const UNAVAILABLE_SENTENCE = "A new design cannot be made right now.";

const LONGEST_WAIT_SECONDS = LONGEST_DAY_SECONDS;
const SHORTEST_WAIT_SECONDS = 1;

/** Neither answer may be kept: each says something true of one moment. */
const NOT_STORED = { "Cache-Control": "no-store" } as const;

/**
 * `429`: the limit is reached. `Retry-After` is the whole seconds to the end of the day and is the only number in it:
 * no count, no block and nothing of what remains, in a header or the body. A wait outside the day's own range is a
 * defect and throws, which the caller turns into the other answer.
 */
export function mintLimitReachedResponse(
  retryAfterSeconds: number,
): NextResponse {
  const isWholeWaitWithinADay =
    Number.isInteger(retryAfterSeconds) &&
    retryAfterSeconds >= SHORTEST_WAIT_SECONDS &&
    retryAfterSeconds <= LONGEST_WAIT_SECONDS;
  if (!isWholeWaitWithinADay) {
    throw new RangeError("The wait is not a whole number of seconds in a day");
  }
  return NextResponse.json(
    { error: LIMIT_REACHED_SENTENCE, code: MINT_LIMIT_REACHED_CODE },
    {
      status: MINT_LIMIT_REACHED_STATUS,
      headers: { ...NOT_STORED, "Retry-After": String(retryAfterSeconds) },
    },
  );
}

/** `503`: the limit could not be judged, so nothing was made. The same shape, with no `Retry-After`, and nothing that
 *  says which cause it was: the log's code says. */
export function mintUnavailableResponse(): NextResponse {
  return NextResponse.json(
    { error: UNAVAILABLE_SENTENCE, code: MINT_UNAVAILABLE_CODE },
    { status: MINT_UNAVAILABLE_STATUS, headers: NOT_STORED },
  );
}

export const SHARE_LIMIT_REACHED_CODE = "SHARE_LIMIT_REACHED";
export const SHARE_UNAVAILABLE_CODE = "SHARE_UNAVAILABLE";
export const READ_LIMIT_REACHED_CODE = "READ_LIMIT_REACHED";
export const LIMIT_REACHED_STATUS = 429;
export const SHARE_UNAVAILABLE_STATUS = 503;

const SHARE_LIMIT_SENTENCE = "The limit on share links is reached for now.";
const SHARE_UNAVAILABLE_SENTENCE = "A share link cannot be changed right now.";
const READ_LIMIT_SENTENCE = "Too many requests for now.";

interface Refusal {
  readonly code: string;
  readonly sentence: string;
  readonly retryAfterSeconds: number;
  readonly longestWaitSeconds: number;
}

/**
 * `429` for a share write: the wait is whole seconds to the end of the policy's own window, the only number in the
 * answer, and the code says nothing of a design, a link or a network.
 */
export function shareLimitReachedResponse(
  retryAfterSeconds: number,
): NextResponse {
  return refusalResponse({
    code: SHARE_LIMIT_REACHED_CODE,
    sentence: SHARE_LIMIT_SENTENCE,
    retryAfterSeconds,
    longestWaitSeconds: longestWaitSecondsOf(SHARE_WRITE_POLICY.window),
  });
}

/** `429` for a read, as bare as the share's, and the same for an owner and a stranger. */
export function readLimitReachedResponse(
  retryAfterSeconds: number,
): NextResponse {
  return refusalResponse({
    code: READ_LIMIT_REACHED_CODE,
    sentence: READ_LIMIT_SENTENCE,
    retryAfterSeconds,
    longestWaitSeconds: longestWaitSecondsOf(READ_POLICY.window),
  });
}

/** `503` for a share write that could not be judged, so nothing was changed. No `Retry-After`, and no cause. */
export function shareUnavailableResponse(): NextResponse {
  return NextResponse.json(
    { error: SHARE_UNAVAILABLE_SENTENCE, code: SHARE_UNAVAILABLE_CODE },
    { status: SHARE_UNAVAILABLE_STATUS, headers: NOT_STORED },
  );
}

function refusalResponse({
  code,
  sentence,
  retryAfterSeconds,
  longestWaitSeconds,
}: Refusal): NextResponse {
  const isWholeWaitWithinTheWindow =
    Number.isInteger(retryAfterSeconds) &&
    retryAfterSeconds >= SHORTEST_WAIT_SECONDS &&
    retryAfterSeconds <= longestWaitSeconds;
  if (!isWholeWaitWithinTheWindow) {
    throw new RangeError(
      "The wait is not a whole number of seconds in the window",
    );
  }
  return NextResponse.json(
    { error: sentence, code },
    {
      status: LIMIT_REACHED_STATUS,
      headers: { ...NOT_STORED, "Retry-After": String(retryAfterSeconds) },
    },
  );
}
