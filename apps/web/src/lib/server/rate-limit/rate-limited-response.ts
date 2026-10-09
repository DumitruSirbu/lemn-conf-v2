import "server-only";

import { NextResponse } from "next/server";

import { LONGEST_DAY_SECONDS } from "@/lib/server/rate-limit/chisinau-day";
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
