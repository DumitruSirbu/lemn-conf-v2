// The failures a design request can produce, in one place: the `fetch` repository throws them and
// the save coalescer branches on them, and neither should have to import the other to do so.

/** A design request did not come back with what it was asked for. Carries the status and operation,
 *  never the response body, which is server-authored text with no business in a client log. */
export class DesignRequestFailedError extends Error {
  constructor(operation: string, detail: string) {
    super(`${operation} failed: ${detail}`);
    this.name = "DesignRequestFailedError";
  }
}

/**
 * A request that failed in a way retrying cannot change. A subtype of the failure above, so callers
 * that only care that a request failed keep working; a status in a message is not something code can
 * branch on.
 *
 * Classified by class of status, not by a list of the ones noticed so far (`isRetryableStatus`):
 * `DesignSchema` is a `strictObject`, so a tab running a bundle from before a deploy that adds a
 * field gets a `400` on every save, permanently, at roughly 450 requests an hour. 413 has the same shape.
 */
export class WriteNotRetryableError extends DesignRequestFailedError {
  constructor(operation: string, status: number) {
    super(operation, `HTTP status ${String(status)}`);
    this.name = "WriteNotRetryableError";
  }
}

/**
 * The credential case: this browser does not hold the design's write token. Its own type because a
 * surface can say something useful about it: the design is read-only here, not failing to save.
 *
 * Retrying cannot change it: the credential is an `HttpOnly` cookie (ADR 0019 decision 1), so the
 * client cannot inspect, refresh or request one. Reachable in normal operation: an expired or cleared
 * cookie, or a shared link opened by someone who never held one. A design that does not exist lands
 * here too, not on a 404: the conditional update matches no row, the same 403 (ADR 0019 decision 1
 * makes "unauthorised" and "unknown" indistinguishable).
 */
export class WriteNotAuthorizedError extends WriteNotRetryableError {
  constructor(operation: string, status: number) {
    super(operation, status);
    this.name = "WriteNotAuthorizedError";
  }
}

/**
 * The design moved on between the load and the save: this browser holds the write credential, but
 * the revision it was editing is no longer the one stored.
 *
 * A subtype of `WriteNotRetryableError` because a retry would be refused for ever at the coalescer's
 * backoff rate, and a caller that has not learned about conflicts then treats one as terminal, so
 * nothing is repeated or silently overwritten. Its own type because the customer has a choice (reload
 * the stored design, or deliberately overwrite it) that a surface must tell apart from `unauthorized`.
 */
export class WriteConflictError extends WriteNotRetryableError {
  constructor(operation: string, status: number) {
    super(operation, status);
    this.name = "WriteConflictError";
  }
}

/** The status and the code the mint answers with when the day's limit on new designs is reached. Both are read: a
 *  `429` from anything else, a firewall's, is not this limit. */
export const MINT_LIMIT_REACHED_STATUS = 429;
export const MINT_LIMIT_REACHED_CODE = "MINT_LIMIT_REACHED";

/**
 * The mint was refused because the limit on new designs is reached for today. Its own type, and a subtype of the
 * terminal failure above, so nothing repeats it: a retry would be refused until tomorrow, and the answer is the one
 * `429` that no other request in this file can mean. The `isRetryableStatus` rule is left as it is: a throttle on
 * any other request is still worth repeating.
 */
export class MintLimitReachedError extends WriteNotRetryableError {
  constructor(operation: string) {
    super(operation, MINT_LIMIT_REACHED_STATUS);
    this.name = "MintLimitReachedError";
  }
}

/** The status and code a save answers with when the limit on saves is reached. Both are read, as the mint's are. */
export const SAVE_LIMIT_REACHED_STATUS = 429;
export const SAVE_LIMIT_REACHED_CODE = "SAVE_LIMIT_REACHED";

/** The longest a save's wait can honestly be: the server's window, one clock hour. Duplicated from the policy module,
 *  which the client bundle must not import; a `Retry-After` beyond it is not one this limit sent. */
const SAVE_WINDOW_SECONDS = 3600;
const SHORTEST_SAVE_WAIT_SECONDS = 1;
/** The wait when the answer states none that can be believed. Never zero: a save sent at once is refused again. */
export const UNREADABLE_SAVE_WAIT_SECONDS = 60;

const WHOLE_NUMBER_OF_SECONDS = /^\d+$/;

/**
 * The seconds a refused save waits, read from `Retry-After`: a whole number from one second to the window's length.
 * Nought is a second, since a wait of nothing is the repeat this failure exists to prevent. Absent, not a whole
 * number, negative or beyond the window is the fixed minute, since nothing in it can be believed.
 */
export function saveWaitSecondsFrom(retryAfter: string | null): number {
  if (retryAfter === null || !WHOLE_NUMBER_OF_SECONDS.test(retryAfter)) {
    return UNREADABLE_SAVE_WAIT_SECONDS;
  }
  const seconds = Number(retryAfter);
  if (seconds > SAVE_WINDOW_SECONDS) return UNREADABLE_SAVE_WAIT_SECONDS;
  return Math.max(SHORTEST_SAVE_WAIT_SECONDS, seconds);
}

/**
 * A save was refused because the limit on saves is reached, and the answer states when to come back. Its own type, and
 * deliberately not a `WriteNotRetryableError`: the write is kept and sent once when the wait ends, not stopped. Nor is
 * it repeated on the general backoff, which would send a request, and so spend a hit, every half second. It holds the
 * wait and nothing of the answer's body.
 */
export class SaveLimitReachedError extends DesignRequestFailedError {
  readonly waitMs: number;

  constructor(operation: string, waitSeconds: number) {
    super(
      operation,
      `HTTP status ${String(SAVE_LIMIT_REACHED_STATUS)}, wait ${String(waitSeconds)} s`,
    );
    this.name = "SaveLimitReachedError";
    this.waitMs = waitSeconds * MILLISECONDS_PER_SECOND;
  }
}

const MILLISECONDS_PER_SECOND = 1000;

/** The status for an authorised but stale conditional write; `writeConflictResponse` says why it is
 *  not `412`. */
export const REVISION_CONFLICT_STATUS = 409;

/** Whether a failed request is worth repeating: a timeout, a throttle or a server fault is transient;
 *  any other 4xx will keep being refused. A `fetch` that rejects outright carries no status and never
 *  reaches here; a failed connection is what a retry is for. */
export function isRetryableStatus(status: number): boolean {
  return (
    status === REQUEST_TIMEOUT ||
    status === TOO_MANY_REQUESTS ||
    status >= SERVER_ERROR_FLOOR
  );
}

const REQUEST_TIMEOUT = 408;
const TOO_MANY_REQUESTS = 429;
const SERVER_ERROR_FLOOR = 500;
