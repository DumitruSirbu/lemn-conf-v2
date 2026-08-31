/**
 * SEC-002: the size gate, and the reason it reads the stream rather than a header.
 *
 * `Content-Length` is a claim the caller makes, and a `Transfer-Encoding: chunked` request need not
 * make it at all — so a limit enforced on the header is a limit an attacker opts out of. This
 * counts the bytes it has actually received and stops reading the moment they exceed the budget,
 * which is also what keeps the cost of a refusal bounded: an oversized body is never buffered
 * whole, only up to the first chunk that crosses the line.
 *
 * It runs **before** any parsing or semantic validation, so nothing downstream ever holds a
 * document larger than the limit.
 */

/** Why a body was not read. Tagged rather than a bare `false` because the two refusals are
 *  different answers to the caller: an oversized body is the caller's payload (413), a broken
 *  stream is a transport failure that produced no payload at all (400). */
export type BoundedBodyFailure = "too-large" | "stream-failed";

/** Tagged rather than a nullable string: an empty body, an oversized one and a broken one are three
 *  different answers and a caller must not be able to confuse them. */
export type BoundedBodyOutcome =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly failure: BoundedBodyFailure };

/**
 * **This function does not reject** (review finding F1). `reader.read()` rejects when the request
 * stream errors — a client that sends `Transfer-Encoding: chunked`, writes half a document and then
 * resets the connection — and that rejection used to escape the route handler, so Next answered
 * with a framework 500 carrying a stack trace into the log. That is the exact failure mode the
 * route's own parse handling exists to remove, arriving one step earlier. The reader owns its own
 * failure and returns it, so the route keeps one shape for every outcome.
 */
export async function readUtf8BodyWithLimit(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<BoundedBodyOutcome> {
  if (body === null) return { ok: true, value: "" };
  // `getReader()` is inside the try, not above it: it throws `TypeError` on an already-locked
  // stream, and a lock taken by a middleware or an instrumentation hook must reach the caller as
  // a refusal like any other transport failure, not as a throw out of this function.
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    reader = body.getReader();
    return await decodeWithinLimit(reader, maxBytes);
  } catch {
    // The reason is deliberately dropped: it is produced by the transport under a caller's control,
    // and a broken stream tells the caller nothing it does not already know.
    return { ok: false, failure: "stream-failed" };
  } finally {
    reader?.releaseLock();
  }
}

async function decodeWithinLimit(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  maxBytes: number,
): Promise<BoundedBodyOutcome> {
  // Streaming decode: a multi-byte character split across two chunks must not become two
  // replacement characters, which is what a per-chunk `decode` would make of it.
  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return { ok: true, value: text + decoder.decode() };
    receivedBytes += value.byteLength;
    if (receivedBytes > maxBytes) return await refuseOversized(reader);
    text += decoder.decode(value, { stream: true });
  }
}

/**
 * The refusal is **decided before the stream is cancelled**, and nothing cancelling does can change
 * it.
 *
 * `cancel()` on a stream that has already errored returns a promise rejected with the stored error.
 * Letting that reach `readUtf8BodyWithLimit`'s catch retags an oversized body as `stream-failed`,
 * which the route answers with a **logged 400** instead of a silent 413 — one attacker-chosen log
 * write per oversized request, which is precisely the amplification the byte limit exists to
 * remove. A client only has to send one chunk past the limit and then reset the connection.
 *
 * The body being over the limit is already established at this point; a cancel that rejects adds no
 * fact, so its rejection is discarded rather than answered.
 */
async function refuseOversized(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<BoundedBodyOutcome> {
  const refusal: BoundedBodyOutcome = { ok: false, failure: "too-large" };
  await reader.cancel().catch(() => undefined);
  return refusal;
}
