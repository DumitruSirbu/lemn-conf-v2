import "server-only";

import { NextResponse } from "next/server";

import { LONGEST_DAY_SECONDS } from "@/lib/server/rate-limit/chisinau-day";
import {
  longestWaitSecondsOf,
  READ_POLICY,
  SAVE_BY_BLOCK_POLICY,
  SHARE_WRITE_POLICY,
} from "@/lib/server/rate-limit/limit-policy";
import {
  limitedAnswerHeaders,
  refusedPageHeaders,
} from "@/lib/server/rate-limit/page-limit-page";
import {
  MINT_LIMIT_REACHED_CODE,
  MINT_LIMIT_REACHED_STATUS,
  SAVE_LIMIT_REACHED_CODE,
} from "@/persistence/design-request-errors";

export { MINT_LIMIT_REACHED_CODE, SAVE_LIMIT_REACHED_CODE };
export const MINT_UNAVAILABLE_CODE = "MINT_UNAVAILABLE";
/** The one status of every answer that says a limit could not be judged. */
const UNAVAILABLE_STATUS = 503;
export const MINT_UNAVAILABLE_STATUS = UNAVAILABLE_STATUS;
export const SHARE_LIMIT_REACHED_CODE = "SHARE_LIMIT_REACHED";
export const SHARE_UNAVAILABLE_CODE = "SHARE_UNAVAILABLE";
export const READ_LIMIT_REACHED_CODE = "READ_LIMIT_REACHED";
export const SAVE_UNAVAILABLE_CODE = "SAVE_UNAVAILABLE";
/** The one status of every answer that says a limit is reached. */
export const LIMIT_REACHED_STATUS = MINT_LIMIT_REACHED_STATUS;
export const SHARE_UNAVAILABLE_STATUS = UNAVAILABLE_STATUS;
export const SAVE_UNAVAILABLE_STATUS = UNAVAILABLE_STATUS;

const LIMIT_REACHED_SENTENCE = "The limit on new designs is reached for today.";
const UNAVAILABLE_SENTENCE = "A new design cannot be made right now.";
const SHARE_LIMIT_SENTENCE = "The limit on share links is reached for now.";
const SHARE_UNAVAILABLE_SENTENCE = "A share link cannot be changed right now.";
const READ_LIMIT_SENTENCE = "Too many requests for now.";
const SAVE_LIMIT_SENTENCE = "The limit on saving is reached for now.";
const SAVE_UNAVAILABLE_SENTENCE = "A save cannot be made right now.";

const SHORTEST_WAIT_SECONDS = 1;

/**
 * `429`: the limit is reached. `Retry-After` is the whole seconds to the end of the day and is the only number in it:
 * no count, no block and nothing of what remains, in a header or the body. A wait outside the day's own range is a
 * defect and throws, which the caller turns into the other answer.
 */
export function mintLimitReachedResponse(
  retryAfterSeconds: number,
): NextResponse {
  return refusalResponse({
    code: MINT_LIMIT_REACHED_CODE,
    sentence: LIMIT_REACHED_SENTENCE,
    retryAfterSeconds,
    longestWaitSeconds: LONGEST_DAY_SECONDS,
  });
}

/** `503`: the limit could not be judged, so nothing was made. The same shape, with no `Retry-After`, and nothing that
 *  says which cause it was: the log's code says. */
export function mintUnavailableResponse(): NextResponse {
  return unavailableResponse(MINT_UNAVAILABLE_CODE, UNAVAILABLE_SENTENCE);
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

/**
 * `429` for a save: the wait is whole seconds to the end of the saves' own window, which a save's two policies share,
 * and the only number in the answer. The code says nothing of a design, a credential or a network.
 */
export function saveLimitReachedResponse(
  retryAfterSeconds: number,
): NextResponse {
  return refusalResponse({
    code: SAVE_LIMIT_REACHED_CODE,
    sentence: SAVE_LIMIT_SENTENCE,
    retryAfterSeconds,
    longestWaitSeconds: longestWaitSecondsOf(SAVE_BY_BLOCK_POLICY.window),
  });
}

/** `503` for a save that could not be judged, so nothing was stored. No `Retry-After`, and no cause. */
export function saveUnavailableResponse(): NextResponse {
  return unavailableResponse(SAVE_UNAVAILABLE_CODE, SAVE_UNAVAILABLE_SENTENCE);
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
  return unavailableResponse(
    SHARE_UNAVAILABLE_CODE,
    SHARE_UNAVAILABLE_SENTENCE,
  );
}

/**
 * `429` for a page read, whose body is a page and not a code: the caller makes it, in the path's language, and this
 * gives it the status and the wait, which may be no more than the read policy's own window.
 */
export function readLimitReachedPageResponse(
  retryAfterSeconds: number,
  html: string,
): NextResponse {
  requireWholeWait(retryAfterSeconds, longestWaitSecondsOf(READ_POLICY.window));
  return new NextResponse(html, {
    status: LIMIT_REACHED_STATUS,
    headers: refusedPageHeaders(retryAfterSeconds),
  });
}

interface Refusal {
  readonly code: string;
  readonly sentence: string;
  readonly retryAfterSeconds: number;
  readonly longestWaitSeconds: number;
}

function refusalResponse({
  code,
  sentence,
  retryAfterSeconds,
  longestWaitSeconds,
}: Refusal): NextResponse {
  requireWholeWait(retryAfterSeconds, longestWaitSeconds);
  return NextResponse.json(
    { error: sentence, code },
    {
      status: LIMIT_REACHED_STATUS,
      headers: limitedAnswerHeaders({ retryAfterSeconds }),
    },
  );
}

function unavailableResponse(code: string, sentence: string): NextResponse {
  return NextResponse.json(
    { error: sentence, code },
    { status: UNAVAILABLE_STATUS, headers: limitedAnswerHeaders() },
  );
}

/** The one check of a wait every answer tells: whole seconds, at least one, and no more than the window's own. */
function requireWholeWait(
  retryAfterSeconds: number,
  longestWaitSeconds: number,
): void {
  const isWholeWaitWithinTheWindow =
    Number.isInteger(retryAfterSeconds) &&
    retryAfterSeconds >= SHORTEST_WAIT_SECONDS &&
    retryAfterSeconds <= longestWaitSeconds;
  if (!isWholeWaitWithinTheWindow) {
    throw new RangeError(
      "The wait is not a whole number of seconds in the window",
    );
  }
}
