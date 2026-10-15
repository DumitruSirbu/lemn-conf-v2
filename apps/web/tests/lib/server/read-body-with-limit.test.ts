import { describe, expect, it } from "vitest";

import { readUtf8BodyWithLimit } from "@/lib/server/read-body-with-limit";

const encoder = new TextEncoder();

/** A stream that reports what the reader actually pulled, so a test can tell "refused after
 *  reading two chunks" from "buffered the whole body and then refused". */
function countingStream(chunks: readonly string[]): {
  stream: ReadableStream<Uint8Array>;
  pulledChunks: () => number;
  wasCancelled: () => boolean;
} {
  let pulled = 0;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[pulled];
      if (chunk === undefined) {
        controller.close();
        return;
      }
      pulled += 1;
      controller.enqueue(encoder.encode(chunk));
    },
    cancel() {
      cancelled = true;
    },
  });
  return {
    stream,
    pulledChunks: () => pulled,
    wasCancelled: () => cancelled,
  };
}

describe("readUtf8BodyWithLimit", () => {
  it("returns the whole body when it fits the budget", async () => {
    const { stream } = countingStream(["abc", "def"]);

    await expect(readUtf8BodyWithLimit(stream, 100)).resolves.toEqual({
      ok: true,
      value: "abcdef",
    });
  });

  it("treats a body of exactly the limit as acceptable", async () => {
    const { stream } = countingStream(["12345"]);

    await expect(readUtf8BodyWithLimit(stream, 5)).resolves.toEqual({
      ok: true,
      value: "12345",
    });
  });

  it("refuses one byte over the limit", async () => {
    const { stream } = countingStream(["123456"]);

    await expect(readUtf8BodyWithLimit(stream, 5)).resolves.toEqual({
      ok: false,
      failure: "too-large",
    });
  });

  it("cuts a chunked body off at the limit instead of buffering it whole", async () => {
    const chunks = Array.from({ length: 100 }, () => "0123456789");
    const { stream, pulledChunks, wasCancelled } = countingStream(chunks);

    const outcome = await readUtf8BodyWithLimit(stream, 25);

    expect(outcome).toEqual({ ok: false, failure: "too-large" });
    expect(pulledChunks()).toBe(3);
    expect(wasCancelled()).toBe(true);
  });

  it("counts bytes rather than characters, so multi-byte text cannot smuggle past the limit", async () => {
    // Four characters, twelve bytes: a character count would let this through a 5-byte budget.
    const { stream } = countingStream(["日本語文"]);

    await expect(readUtf8BodyWithLimit(stream, 5)).resolves.toEqual({
      ok: false,
      failure: "too-large",
    });
  });

  it("decodes a character split across two chunks as one character", async () => {
    const bytes = encoder.encode("é");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 1));
        controller.enqueue(bytes.slice(1));
        controller.close();
      },
    });

    await expect(readUtf8BodyWithLimit(stream, 10)).resolves.toEqual({
      ok: true,
      value: "é",
    });
  });

  it("returns a stream failure instead of rejecting when the request stream errors", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"room":'));
      },
      pull(controller) {
        // A client that wrote half a document and then reset the connection.
        controller.error(new Error("aborted by peer"));
      },
    });

    await expect(readUtf8BodyWithLimit(stream, 1000)).resolves.toEqual({
      ok: false,
      failure: "stream-failed",
    });
  });

  it("still reports too-large when the stream errors after the limit is crossed", async () => {
    // The shape a client produces by sending one chunk past the limit and resetting the
    // connection. Answering `stream-failed` here would downgrade a silent 413 to a logged 400.
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("0123456789"));
      },
      pull(controller) {
        controller.error(new Error("aborted by peer"));
      },
    });

    await expect(readUtf8BodyWithLimit(stream, 5)).resolves.toEqual({
      ok: false,
      failure: "too-large",
    });
  });

  it("still reports too-large when cancelling the stream itself rejects", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("0123456789"));
      },
      cancel() {
        throw new Error("cancel refused");
      },
    });

    await expect(readUtf8BodyWithLimit(stream, 5)).resolves.toEqual({
      ok: false,
      failure: "too-large",
    });
  });

  it("reports a stream failure rather than throwing when the body is already locked", async () => {
    const { stream } = countingStream(["abc"]);
    stream.getReader();

    await expect(readUtf8BodyWithLimit(stream, 1000)).resolves.toEqual({
      ok: false,
      failure: "stream-failed",
    });
  });

  it("reads an absent body as empty rather than refusing it", async () => {
    await expect(readUtf8BodyWithLimit(null, 10)).resolves.toEqual({
      ok: true,
      value: "",
    });
  });
});
