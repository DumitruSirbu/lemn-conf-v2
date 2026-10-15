import { inspect } from "node:util";

import { expect, vi } from "vitest";

import type {
  GmailMessageOptions,
  GmailTransportOptions,
  MailTransport,
  MakeMailTransport,
} from "@/lib/server/mail/gmail-mail-sender";
import type { MailConfiguration } from "@/lib/server/mail/mail-configuration";
import type { MailMessage } from "@/lib/server/mail/mail-sender";

// Every value here is invented and recognisable, so a test can look for it in what must not hold it. The password
// is visible ASCII with no space, as the reader requires, so the "usable" arm of every matrix is not empty.
export const FAKE_APP_PASSWORD = "QAFAKEpassword5d81c0";
export const FAKE_SENDER = "qa-sender-5d81c0@mail.example.com";
export const FAKE_INBOX = "qa-inbox-5d81c0@example.com";

export const QA_CONFIGURATION: MailConfiguration = {
  senderAddress: FAKE_SENDER,
  appPassword: FAKE_APP_PASSWORD,
  notificationAddress: FAKE_INBOX,
};

export const QA_MESSAGE: MailMessage = {
  key: "lead-notification/qa_request_0000000001",
  subject: "Subject under test LM-QAQA2345",
  text: "Line one\nLine two",
};

/** What a library error could quote back: the recipient, and the customer the notice is about. */
export const QUOTED_ADDRESS = "qa-quoted-5d81c0@example.com";
export const QUOTED_NAME = "Nume Citat Fictiv 5d81c0";
export const QUOTED_PHONE = "+37360058100";

export const DISCLOSURE_MARKERS = [
  FAKE_APP_PASSWORD,
  FAKE_SENDER,
  FAKE_INBOX,
  QUOTED_ADDRESS,
  QUOTED_NAME,
  QUOTED_PHONE,
];

/** A server's reply text, as a library would copy it into `message`, `response` and `command`. */
export const QUOTING_REPLY_TEXT = [
  `Could not deliver to ${FAKE_INBOX} from ${FAKE_SENDER}`,
  `for ${QUOTED_NAME} <${QUOTED_ADDRESS}> ${QUOTED_PHONE} using ${FAKE_APP_PASSWORD}`,
].join(" ");

/** An error shaped as the mail library's are, every free-text member quoting every marker. */
export function quotingLibraryError(
  members: Record<string, unknown> = {},
): Error {
  return Object.assign(new Error(QUOTING_REPLY_TEXT), {
    response: QUOTING_REPLY_TEXT,
    command: QUOTING_REPLY_TEXT,
    ...members,
  });
}

/** A rejection with a value that is no Error: the mail library's own throws are not always errors. */
export function rejectingWith(reason: unknown): Promise<never> {
  // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the case under test
  return Promise.reject(reason);
}

export interface ScriptedTransports {
  readonly make: MakeMailTransport;
  readonly transportOptions: GmailTransportOptions[];
  readonly sentOptions: GmailMessageOptions[];
  readonly made: () => number;
  readonly closeCalls: () => number;
}

/** A transport maker whose `sendMail` does what the test says. Nothing here opens a socket. */
export function transportsAnswering(
  answer: (options: GmailMessageOptions) => unknown,
): ScriptedTransports {
  const transportOptions: GmailTransportOptions[] = [];
  const sentOptions: GmailMessageOptions[] = [];
  let closes = 0;
  const make: MakeMailTransport = (options) => {
    transportOptions.push(options);
    const transport: MailTransport = {
      sendMail(messageOptions) {
        sentOptions.push(messageOptions);
        return Promise.resolve(answer(messageOptions));
      },
      close() {
        closes += 1;
      },
    };
    return transport;
  };
  return {
    make,
    transportOptions,
    sentOptions,
    made: () => transportOptions.length,
    closeCalls: () => closes,
  };
}

/** What the library resolves with for one delivered message. */
export const ACCEPTED_ONE_RECIPIENT = Object.freeze({
  accepted: Object.freeze([FAKE_INBOX]),
  rejected: Object.freeze([]),
});

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
