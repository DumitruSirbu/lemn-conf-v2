import { NeonDbError } from "@neondatabase/serverless";

/**
 * Neon suspends a compute that has been idle, and a query arriving while it is coming back is
 * answered by the proxy rather than by Postgres — `Couldn't connect to compute node`, with
 * `"neon:retryable": true` in the payload.
 *
 * **This is not a test concern.** `apps/web/src/app/d/[id]/page.tsx` loads a shared design on the
 * server; it maps `DesignNotFoundError` and `InvalidDesignError` to `design-load-error.tsx` and
 * rethrows everything else, and the app declares no `error.tsx` boundary — so a cold start there is
 * a customer opening a shared link and getting Next's default server-error page. The browser's
 * `save-coalescer.ts` already re-sends a failed *write* with backoff; nothing re-sends that read.
 */

/**
 * The proxy's own verdict that it could not reach a compute.
 *
 * **It has to be read out of the message, and that is the driver's doing, not a shortcut.**
 * `@neondatabase/serverless@1.1.0` decodes the server's structured fields onto `NeonDbError` for
 * HTTP 400 alone; every other status takes the `res.text()` branch, which stringifies the whole
 * payload into the message and leaves `code`, `detail` and the rest `undefined`. A cold start is an
 * HTTP 500, so it always takes that branch — matching on `code` would match nothing. The last
 * `describe` block of `retry-on-compute-restart.test.ts` pins that shape against the real driver, so
 * an upgrade that moves the payload out of the message fails there rather than silently here.
 */
const RETRYABLE_PAYLOAD_MARKER = /"neon:retryable"\s*:\s*true/;

/**
 * The waits before the second and third attempts.
 *
 * **Sized to outlast a restart, not a warm start.** ADR 0002 records twice that a cold start on this
 * tier "costs about a second", so a schedule that gave up inside that second would reliably return
 * the customer the same error, just later. The last attempt therefore lands about 2 s in. The budget
 * this spends against is generous: no route or `vercel.json` sets `maxDuration`, leaving the
 * platform default, and the client's own read timeout is 10 s — so the worst case is a fifth of the
 * smallest of those, and only on requests that were failing anyway.
 *
 * No jitter: at this traffic level nothing is gained by desynchronising two concurrent retries.
 */
const BACKOFF_MS = [500, 1_500] as const;

/** A query the proxy refused because it could not reach the compute, as opposed to one Postgres
 *  answered. Deliberately narrow — see `retryOnComputeRestart`. */
function isComputeRestartFailure(error: unknown): boolean {
  return (
    error instanceof NeonDbError && RETRYABLE_PAYLOAD_MARKER.test(error.message)
  );
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resume) => setTimeout(resume, milliseconds));
}

/**
 * Runs a query, repeating it only while Neon says it could not reach the compute.
 *
 * **What makes this safe is that every retried statement is idempotent under identical arguments —
 * not the marker.** The marker is the proxy's judgement about its own error, and the vendor does not
 * promise it means the statement never ran; a commit whose acknowledgement is then lost is exactly
 * the case this module cannot distinguish. So each call site has to stand on its own:
 *
 * - `mint` generates the id *outside* the retried callback, so every attempt inserts the same
 *   primary key and a lost acknowledgement takes a duplicate-key rejection rather than minting
 *   twice. That placement is load-bearing — see the warning at the call site.
 * - `updateIfCurrent` is guarded by `revision::text = ${expectedRevision}`, so a re-applied update
 *   matches nothing. The cost of that guard is a **false conflict**: if a commit's acknowledgement is
 *   lost, the repeat finds a revision that has moved and the customer is told their design changed
 *   elsewhere when in fact their own save landed. Nothing is lost either way — reloading shows their
 *   save and overwriting rewrites the same document — but the message is wrong in a single tab. It
 *   needs a post-commit acknowledgement loss stamped retryable, and is accepted at that likelihood.
 * - `load`, `fetchDesignPage` and `delete … where id =` are reads and an idempotent delete.
 *
 * **Every other failure propagates on the first attempt**, which is the point of keeping the
 * predicate narrow: a constraint violation, a stale revision or a malformed document are answers,
 * and repeating them turns a fast, correct error into a slow one. Two shapes it therefore declines
 * to retry are worth knowing about — a fetch-level failure, which the driver wraps with no payload
 * in the message, and a non-JSON gateway body such as a 502 from between the app and Neon.
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
  // The final attempt is deliberately outside the loop and unguarded: whatever it throws is what the
  // caller sees, so a compute that never came back reports Neon's own error rather than one this
  // module invented to describe it.
  return runQuery();
}
