/**
 * SEC-002: the size gate, reading the stream rather than a header. `Content-Length` is a claim the caller makes and a
 * chunked request need not make it, so a header limit is one an attacker opts out of. This counts received bytes and
 * stops at the first chunk past the budget, so an oversized body is never buffered whole. It runs before any parsing,
 * so nothing downstream holds a document larger than the limit.
 */

/** Why a body was not read: an oversized body is the caller's payload (413), a broken stream a transport failure
 *  with no payload (400). */
export type BoundedBodyFailure = "too-large" | "stream-failed";

/** Tagged rather than a nullable string: an empty body, an oversized one and a broken one are three
 *  different answers and a caller must not be able to confuse them. */
export type BoundedBodyOutcome =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly failure: BoundedBodyFailure };

/**
 * This function does not reject: `reader.read()` rejects when the request stream errors (a chunked client that writes
 * half a document and resets), and letting that escape the route handler would answer a framework 500 with a stack
 * trace in the log. The reader owns its failure and returns it, so the route keeps one shape for every outcome.
 */
export async function readUtf8BodyWithLimit(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<BoundedBodyOutcome> {
  if (body === null) return { ok: true, value: "" };
  // `getReader()` is inside the try: it throws `TypeError` on an already-locked stream (a lock taken by middleware or
  // an instrumentation hook), which must reach the caller as a refusal.
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
 * The refusal is decided before the stream is cancelled, and nothing cancelling does can change it. `cancel()` on an
 * already-errored stream rejects with the stored error; letting that reach `readUtf8BodyWithLimit`'s catch would
 * retag an oversized body as `stream-failed`, answered with a logged 400 instead of a silent 413: one attacker-chosen
 * log write per request, the amplification the byte limit exists to remove. The rejection adds no fact, so it is
 * discarded.
 */
async function refuseOversized(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<BoundedBodyOutcome> {
  const refusal: BoundedBodyOutcome = { ok: false, failure: "too-large" };
  await reader.cancel().catch(() => undefined);
  return refusal;
}
