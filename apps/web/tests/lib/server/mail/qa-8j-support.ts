import { inspect } from "node:util";

import { expect, vi } from "vitest";

import type { MailConfiguration } from "@/lib/server/mail/mail-configuration";
import type { MailMessage } from "@/lib/server/mail/mail-sender";

// Every value here is invented and recognisable, so a test can look for it in what must not hold it.
export const FAKE_API_KEY = "re_QAFAKE_key_5d81c0";
export const FAKE_SENDER = "qa-sender-5d81c0@mail.example.com";
export const FAKE_INBOX = "qa-inbox-5d81c0@example.com";

export const QA_CONFIGURATION: MailConfiguration = {
  apiKey: FAKE_API_KEY,
  fromAddress: FAKE_SENDER,
  notificationAddress: FAKE_INBOX,
};

export const QA_MESSAGE: MailMessage = {
  key: "lead-notification/qa_request_0000000001",
  subject: "Subject under test LM-QAQA2345",
  text: "Line one\nLine two",
};

/** What a provider's error body could quote back: the recipient, and the customer the notice is about. */
export const QUOTED_ADDRESS = "qa-quoted-5d81c0@example.com";
export const QUOTED_NAME = "Nume Citat Fictiv 5d81c0";
export const QUOTED_PHONE = "+37360058100";

export const DISCLOSURE_MARKERS = [
  FAKE_API_KEY,
  FAKE_SENDER,
  FAKE_INBOX,
  QUOTED_ADDRESS,
  QUOTED_NAME,
  QUOTED_PHONE,
];

export const QUOTING_ERROR_BODY = JSON.stringify({
  statusCode: 422,
  name: "validation_error",
  message: `Could not deliver to ${FAKE_INBOX} from ${FAKE_SENDER} for ${QUOTED_NAME} <${QUOTED_ADDRESS}> ${QUOTED_PHONE} using ${FAKE_API_KEY}`,
});

const encoder = new TextEncoder();

export function bytesOf(text: string): Uint8Array {
  return encoder.encode(text);
}

/** A body delivered in exactly these chunks, then closed. */
export function streamOf(
  ...chunks: readonly Uint8Array[]
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

/** The two members of a response the adapter reads, and nothing a real response would add. */
export function answerOf(
  status: number,
  body: ReadableStream<Uint8Array> | null,
): Response {
  return { status, body } as unknown as Response;
}

export function textAnswer(status: number, text: string): Response {
  return answerOf(status, streamOf(bytesOf(text)));
}

type FetchImplementation = (
  url: string,
  init: RequestInit,
) => Promise<Response>;

export function stubFetch(implementation: FetchImplementation) {
  const spy = vi.fn(implementation);
  vi.stubGlobal("fetch", spy);
  return spy;
}

/** A fresh answer for every call, since a body can be read once. */
export function stubFetchAnswering(makeAnswer: () => Response) {
  return stubFetch(() => Promise.resolve(makeAnswer()));
}

/** Everything a reader, a logger or a serialiser could get out of a value, as one text. */
export function everyReadingOf(value: unknown): string {
  return [
    (JSON.stringify(value) as string | undefined) ?? "",
    inspect(value, {
      depth: null,
      showHidden: true,
      showProxy: true,
      getters: true,
      maxArrayLength: null,
      maxStringLength: null,
    }),
    String(value),
  ].join("\n");
}

export function expectNoMarkerIn(
  value: unknown,
  markers: readonly string[],
): void {
  const readings = everyReadingOf(value);
  expect(markers.filter((marker) => readings.includes(marker))).toEqual([]);
}

type ConsoleSpy = ReturnType<typeof vi.spyOn>;

/** Every function the console offers, not a chosen few: a line written through `table` or `dir` is a line. */
export function silenceEveryConsoleMethod(): readonly ConsoleSpy[] {
  const methodNames = Object.entries(console)
    .filter(([, member]) => typeof member === "function")
    .map(([name]) => name);
  return methodNames.map((name) =>
    vi.spyOn(console, name as "log").mockImplementation(() => undefined),
  );
}

export function consoleCallsOf(spies: readonly ConsoleSpy[]): unknown[][] {
  return spies.flatMap((spy) => spy.mock.calls);
}
