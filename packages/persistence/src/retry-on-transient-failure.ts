import { isNeonDbError } from "./open-database.js";

/**
 * Neon's proxy answers a query it could not route to a suspended compute with an HTTP 500 whose payload carries this
 * marker. `@neondatabase/serverless@1.1.0` decodes fields onto `NeonDbError` for HTTP 400 only, so the marker is
 * readable from the message alone.
 */
const RETRYABLE_PAYLOAD_MARKER = /"neon:retryable"\s*:\s*true/;

/**
 * What `Response.json()` raises inside the driver when a 2xx or 400 reply has an empty body. The driver lets it escape
 * as a bare `SyntaxError`, not a `NeonDbError`. A reply cut mid-body (undici `TypeError: terminated`) is not matched.
 */
const EMPTY_REPLY_MESSAGE = "Unexpected end of JSON input";

/** Waits before the second and third attempts, sized to outlast a cold start (about 1 s). No jitter at this traffic. */
const BACKOFF_MS = [500, 1_500] as const;

/** What a retried callback is told, so a write can widen its own predicate on a repeat and never on a first attempt. */
export interface Attempt {
  readonly isRetry: boolean;
}

/**
 * True for the two failures worth repeating: the proxy's cold-start refusal and an empty reply. Both can follow a
 * statement that already ran, so a caller must be safe to repeat. Not transient: a Postgres rejection (HTTP 400,
 * decoded fields), a `"neon:retryable":false` payload, a fetch-level failure, a non-JSON gateway body.
 */
export function isTransientFailure(error: unknown): boolean {
  return isComputeRestartFailure(error) || isEmptyReply(error);
}

function isComputeRestartFailure(error: unknown): boolean {
  return isNeonDbError(error) && RETRYABLE_PAYLOAD_MARKER.test(error.message);
}

// Structural, not `instanceof`: an error built in another realm fails every `instanceof` check against this one.
function isEmptyReply(error: unknown): boolean {
  return (
    isErrorOfAnyRealm(error) &&
    error.name === "SyntaxError" &&
    error.message === EMPTY_REPLY_MESSAGE
  );
}

function isErrorOfAnyRealm(error: unknown): error is Error {
  return Object.prototype.toString.call(error) === "[object Error]";
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resume) => setTimeout(resume, milliseconds));
}

/**
 * Runs a query, repeating it while `isTransientFailure` holds. A repeat may follow a statement that already
 * committed, so every caller must end in the same rows as a first-time success: a read, an idempotent write, or a
 * write whose key was fixed before this call (see ADR 0145). Any other failure propagates at once, and the
 * final attempt is unguarded so a lasting failure reaches the caller as the driver's own error.
 */
export async function retryOnTransientFailure<T>(
  runQuery: (attempt: Attempt) => Promise<T>,
): Promise<T> {
  let isRetry = false;
  for (const backoff of BACKOFF_MS) {
    try {
      return await runQuery({ isRetry });
    } catch (error) {
      if (!isTransientFailure(error)) throw error;
      await sleep(backoff);
      isRetry = true;
    }
  }
  return runQuery({ isRetry });
}
