// The failures a design request can produce, in one place: the `fetch` repository throws them and
// the save coalescer branches on them, and neither should have to import the other to do so.

/** A design request did not come back with what it was asked for. Carries the HTTP status and the
 *  operation, never the response body: the body is server-authored text that has no business in a
 *  client log, and a failure only ever needs to drive the coalescer's retry. */
export class DesignRequestFailedError extends Error {
  constructor(operation: string, detail: string) {
    super(`${operation} failed: ${detail}`);
    this.name = "DesignRequestFailedError";
  }
}

/**
 * A request that failed in a way retrying cannot change.
 *
 * A **subtype** of the failure above rather than a sibling: it is still a failed request and every
 * caller that only cares about that keeps working, while a caller that must not retry can say so.
 * The distinction cannot live in the message — a status code inside a string is not something code
 * can branch on without parsing prose.
 *
 * The principle is the classification, so the classification is drawn by class of status and not by
 * a list of the ones noticed so far (`isRetryableStatus`). A `400` from `PUT` is the case that
 * makes this matter beyond the credential: `DesignSchema` is a `strictObject`, so a tab still
 * running the bundle from before a deploy that adds a field 400s on **every** save, permanently, at
 * roughly 450 requests an hour — the same cost that made a 403 terminal. 413 has the same shape.
 */
export class WriteNotRetryableError extends DesignRequestFailedError {
  constructor(operation: string, status: number) {
    super(operation, `HTTP status ${String(status)}`);
    this.name = "WriteNotRetryableError";
  }
}

/**
 * The credential case: this browser does not hold the design's write token.
 *
 * Its own type under `WriteNotRetryableError` because it is the one terminal failure a surface can
 * say something useful about — the design is read-only here, not failing to save.
 *
 * Why retrying cannot change it: the credential is an `HttpOnly` cookie (ADR 0019 decision 1), so
 * the client cannot inspect it, refresh it, or ask for a new one, and every subsequent write is
 * known in advance to be refused.
 *
 * Reachable in normal operation: the cookie's 30-day expiry, a cleared cookie jar, or a shared link
 * opened by someone who never held one. A design deleted by retention lands here too rather than on
 * a 404 — the conditional update matches no row, which is the same 403 (ADR 0019 decision 1 makes
 * "unauthorised" and "unknown" deliberately indistinguishable).
 */
export class WriteNotAuthorizedError extends WriteNotRetryableError {
  constructor(operation: string, status: number) {
    super(operation, status);
    this.name = "WriteNotAuthorizedError";
  }
}

/**
 * The design moved on between the load and the save (WEB-003): this browser holds the write
 * credential, and the revision it was editing is no longer the one stored.
 *
 * A subtype of `WriteNotRetryableError` because the one thing that must not happen is a retry: the
 * same document against the same expected revision will be refused for ever, at the coalescer's
 * backoff rate, while the customer watches a spinner. Sitting under that type also means a caller
 * that has not learned about conflicts yet treats one as terminal, which is the safe way to be
 * wrong — no write is repeated and nothing is silently overwritten.
 *
 * It is nonetheless its own type, because it is the one terminal failure with a **choice** behind
 * it: the stored design can be reloaded, or this browser's version can be written over it
 * deliberately. `unauthorized` offers nothing; this offers two things, and only a distinct type
 * lets a surface tell them apart without parsing a status out of a message.
 */
export class WriteConflictError extends WriteNotRetryableError {
  constructor(operation: string, status: number) {
    super(operation, status);
    this.name = "WriteConflictError";
  }
}

/** The status a conditional write is refused with when the caller is authorised and stale — see
 *  `writeConflictResponse` for why it is not the `412` a precondition header would earn. */
export const REVISION_CONFLICT_STATUS = 409;

/** Whether a failed request is worth repeating: a timeout, a throttle, or a server-side fault is
 *  transient by definition; any other 4xx is the client asking for something this server will keep
 *  refusing. A `fetch` that rejects outright never reaches here — it carries no status, and a
 *  connection that failed is exactly what a retry is for. */
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
