import { NeonDbError } from "@neondatabase/serverless";

/**
 * Neon suspends an idle compute, and a query arriving while it restarts is answered by the proxy, not Postgres:
 * `Couldn't connect to compute node` with `"neon:retryable": true` in the payload. Not a test concern: the `/d/{id}`
 * and `/s/{token}` pages rethrow every error but their mapped ones and the app declares no `error.tsx`, so a cold
 * start there shows a customer opening a link Next's default error page.
 */

/**
 * The proxy's own verdict that it could not reach a compute. It must be read out of the message: the driver
 * (`@neondatabase/serverless@1.1.0`) decodes structured fields onto `NeonDbError` for HTTP 400 only, and a cold start
 * is an HTTP 500, whose whole payload is stringified into the message with `code` and `detail` undefined.
 */
const RETRYABLE_PAYLOAD_MARKER = /"neon:retryable"\s*:\s*true/;

/**
 * The waits before the second and third attempts, sized to outlast a cold start (ADR 0002: about a second), so the last
 * attempt lands about 2 s in, a fifth of the client's 10 s read timeout. No jitter: nothing is gained at this traffic.
 */
const BACKOFF_MS = [500, 1_500] as const;

/** A query the proxy refused because it could not reach the compute, not one Postgres answered. Deliberately narrow
 *  (see `retryOnComputeRestart`). */
function isComputeRestartFailure(error: unknown): boolean {
  return (
    error instanceof NeonDbError && RETRYABLE_PAYLOAD_MARKER.test(error.message)
  );
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resume) => setTimeout(resume, milliseconds));
}

/**
 * Runs a query, repeating it only while Neon says it could not reach the compute. What makes this safe is that every
 * retried statement is idempotent under identical arguments, not the marker: the vendor does not promise the statement
 * never ran, and a commit whose acknowledgement is lost cannot be told apart. So each call site must stand on its own:
 *
 * - `mint` generates the id outside the retried callback, so every attempt inserts the same primary key and a lost
 *   acknowledgement takes a duplicate-key rejection rather than minting twice.
 * - `updateIfCurrent` is guarded by `revision::text = ${expectedRevision}`, so a re-applied update matches nothing. The
 *   cost is a false conflict: if a commit's acknowledgement is lost, the repeat finds a moved revision and tells the
 *   customer their design changed elsewhere though their own save landed. Nothing is lost either way.
 * - `load`, `fetchDesignPage` and `delete … where id =` are reads and an idempotent delete.
 *
 * Every other failure propagates on the first attempt: a constraint violation, a stale revision or a malformed document
 * is an answer, and repeating it only makes a fast error slow. Not retried: a fetch-level failure (the driver wraps it
 * with no payload) and a non-JSON gateway body such as a 502.
 */
export async function retryOnComputeRestart<T>(
  runQuery: () => Promise<T>,
): Promise<T> {
  for (const backoff of BACKOFF_MS) {
    try {
      return await runQuery();
    } catch (error) {
      if (!isComputeRestartFailure(error)) throw error;
      await sleep(backoff);
    }
  }
  // The final attempt is outside the loop and unguarded: whatever it throws is what the caller sees, so a compute that
  // never came back reports Neon's own error.
  return runQuery();
}
