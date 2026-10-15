// Case 8 of the plan's QA section, end to end: the contact route with its real orchestration, the real mail factory
// and the real Gmail adapter, and only what reaches outside the process scripted: the store, the owned load and the
// mail library's transport. SMTP has no idempotency key, so the stored mark is the only guard against a second notice:
// what a retry does after a timeout, after an accepted send whose mark failed, after a complete send and after a spent
// quota is asserted as it is, so a later change to it is visible.
import { KITCHEN_L_DESIGN, type Design } from "@lemnaria/configurator-domain";
import {
  FakeContactSubmissionStore,
  type ContactSubmissionStore,
} from "@lemnaria/persistence";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CONTACT_NOTICE_NOT_SENT_CODE,
  CONTACT_NOTICE_NOT_SENT_RETRY_CODE,
} from "@/lib/server/contact/contact-responses";
import { MAIL_REQUEST_TIMEOUT_MS } from "@/lib/server/mail/gmail-mail-sender";
import { isRetryableMailFailure } from "@/lib/server/mail/mail-sender";

import {
  bodyOf,
  callbackBodyOf,
  EMAIL_MARKER,
  NAME_MARKER,
} from "../contact/submit-contact-harness";
import {
  forbidFetch,
  forbidNetwork,
  releaseFetch,
  releaseNetwork,
} from "./mail-test-support";
import {
  consoleCallsOf,
  expectNoMarkerIn,
  FAKE_APP_PASSWORD,
  FAKE_INBOX,
  FAKE_SENDER,
  quotingLibraryError,
  rejectingWith,
  silenceEveryConsoleMethod,
} from "./qa-8j-support";

const fakes = vi.hoisted(() => ({
  store: undefined as unknown,
  createTransport: vi.fn(),
}));

vi.mock("nodemailer", () => ({
  createTransport: (...parameters: unknown[]) =>
    (fakes.createTransport as (...all: unknown[]) => unknown)(...parameters),
}));
vi.mock("@/lib/server/contact/contact-submission-store-instance", () => ({
  getContactSubmissionStore: () => fakes.store,
}));
vi.mock("@/lib/server/load-owned-design", () => ({
  loadOwnedDesign: (): Promise<unknown> =>
    Promise.resolve({
      kind: "found",
      design: KITCHEN_L_DESIGN satisfies Design,
      revision: "1",
    }),
}));

const { POST } = await import(
  "../../../../src/app/api/contact-submissions/route"
);

const ACCEPTED = { accepted: [FAKE_INBOX], rejected: [] };
const CUSTOMER_MARKERS = [NAME_MARKER, EMAIL_MARKER, "069 000 111"];
const SECRET_MARKERS = [FAKE_APP_PASSWORD, FAKE_SENDER, FAKE_INBOX];

interface ScriptedMail {
  readonly sendMail: ReturnType<typeof vi.fn>;
  readonly close: ReturnType<typeof vi.fn>;
}

let store: FakeContactSubmissionStore;
let markAttempts: number;
let failMarks: number;

beforeEach(() => {
  store = new FakeContactSubmissionStore();
  markAttempts = 0;
  failMarks = 0;
  fakes.store = storeThatMayFailItsMark(store);
  fakes.createTransport.mockReset();
  vi.stubEnv("GOOGLE_EMAIL", FAKE_SENDER);
  vi.stubEnv("GOOGLE_APP_PASSWORD", FAKE_APP_PASSWORD);
  vi.stubEnv("LEAD_NOTIFICATION_ADDRESS", FAKE_INBOX);
  forbidFetch();
  forbidNetwork();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  releaseFetch();
  releaseNetwork();
});

/** Delegates to the fake store, except that its next `failMarks` marks reject, as a database that went away does. */
function storeThatMayFailItsMark(
  inner: FakeContactSubmissionStore,
): ContactSubmissionStore {
  return {
    lookUp: (request) => inner.lookUp(request),
    record: (submission) => inner.record(submission),
    markNotified: async (id) => {
      markAttempts += 1;
      if (failMarks > 0) {
        failMarks -= 1;
        throw new Error(`the database refused ${FAKE_APP_PASSWORD}`);
      }
      await inner.markNotified(id);
    },
  } as ContactSubmissionStore;
}

/** Each `sendMail`, in order, does what the list says; after the list it accepts. */
function scriptMail(
  ...answers: readonly (() => Promise<unknown>)[]
): ScriptedMail {
  const remaining = [...answers];
  const mail: ScriptedMail = {
    sendMail: vi.fn(() => {
      const answer = remaining.shift();
      return answer === undefined ? Promise.resolve(ACCEPTED) : answer();
    }),
    close: vi.fn(),
  };
  fakes.createTransport.mockReturnValue(mail);
  return mail;
}

const accepts = () => Promise.resolve(ACCEPTED);
const rejects = (members: Record<string, unknown>) => () =>
  Promise.reject(quotingLibraryError(members));

function post(body: string): Promise<Response> {
  return POST(
    new NextRequest("https://lemnaria.test/api/contact-submissions", {
      method: "POST",
      body,
      headers: {
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
      },
    }),
  );
}

async function answerOf(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function notifiedAtOfTheOneRow(): Date | undefined {
  const rows = store.heldSubmissions();
  expect(rows).toHaveLength(1);
  return rows[0]?.notifiedAt;
}

const NOT_SENT_RETRY = {
  status: 502,
  code: CONTACT_NOTICE_NOT_SENT_RETRY_CODE,
};
const NOT_SENT_FINAL = { status: 502, code: CONTACT_NOTICE_NOT_SENT_CODE };

describe("the route with the real Gmail adapter behind it", () => {
  it("sends one notice from the configured account to the configured inbox, closes its transport, marks the row once, and answers sent", async () => {
    const consoleSpies = silenceEveryConsoleMethod();
    const mail = scriptMail(accepts);

    const response = await post(bodyOf());

    expect(response.status).toBe(200);
    const body = await answerOf(response);
    expect(body).toMatchObject({ status: "sent" });
    expect(fakes.createTransport).toHaveBeenCalledTimes(1);
    expect(fakes.createTransport.mock.calls[0]?.[0]).toMatchObject({
      auth: { user: FAKE_SENDER, pass: FAKE_APP_PASSWORD },
    });
    expect(mail.sendMail).toHaveBeenCalledTimes(1);
    expect(mail.sendMail.mock.calls[0]?.[0]).toMatchObject({
      from: FAKE_SENDER,
      to: FAKE_INBOX,
    });
    expect(mail.close).toHaveBeenCalledTimes(1);
    expect(markAttempts).toBe(1);
    expect(notifiedAtOfTheOneRow()).toBeInstanceOf(Date);
    expectNoMarkerIn([body, consoleCallsOf(consoleSpies)], SECRET_MARKERS);
  });

  it("holds no variable name and no secret in an answer when the three are not usable, and sends nothing", async () => {
    silenceEveryConsoleMethod();
    vi.stubEnv("GOOGLE_APP_PASSWORD", `${FAKE_APP_PASSWORD} spaced`);
    scriptMail(accepts);

    const response = await post(bodyOf());

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(fakes.createTransport).not.toHaveBeenCalled();
    expectNoMarkerIn(await answerOf(response), [
      ...SECRET_MARKERS,
      "GOOGLE_APP_PASSWORD",
    ]);
    expect(store.heldSubmissions()).toHaveLength(0);
  });
});

describe("a send that times out, then a retry of the same request", () => {
  it("answers the retryable code with the row stored un-notified, and the retry sends again: two sends, one row, one mark (the recorded duplicate)", async () => {
    silenceEveryConsoleMethod();
    const mail = scriptMail(rejects({ code: "ETIMEDOUT" }), accepts);

    const first = await post(callbackBodyOf());
    const markedAfterTheFirst = markAttempts;
    const rowAfterTheFirst = store.heldSubmissions();
    const second = await post(callbackBodyOf());

    expect(first.status).toBe(NOT_SENT_RETRY.status);
    expect(await answerOf(first)).toEqual({
      error: "The request was saved but could not be passed on.",
      code: NOT_SENT_RETRY.code,
    });
    expect(markedAfterTheFirst).toBe(0);
    expect(rowAfterTheFirst).toHaveLength(1);
    expect(rowAfterTheFirst[0]?.notifiedAt).toBeUndefined();
    expect(second.status).toBe(200);
    expect(mail.sendMail).toHaveBeenCalledTimes(2);
    expect(mail.sendMail.mock.calls[1]?.[0]).toStrictEqual(
      mail.sendMail.mock.calls[0]?.[0],
    );
    expect(markAttempts).toBe(1);
    expect(notifiedAtOfTheOneRow()).toBeInstanceOf(Date);
  });

  it("answers the same way when the transport never settles and the bound passes, and a late acceptance marks nothing", async () => {
    silenceEveryConsoleMethod();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let acceptLate: (answer: unknown) => void = () => undefined;
    const mail = scriptMail(
      () =>
        new Promise((resolve) => {
          acceptLate = resolve;
        }),
      accepts,
    );

    const pending = post(callbackBodyOf());
    await vi.advanceTimersByTimeAsync(MAIL_REQUEST_TIMEOUT_MS);
    const first = await pending;
    acceptLate(ACCEPTED);
    await vi.advanceTimersByTimeAsync(0);

    expect(first.status).toBe(NOT_SENT_RETRY.status);
    expect((await answerOf(first)).code).toBe(NOT_SENT_RETRY.code);
    expect(mail.close).toHaveBeenCalledTimes(1);
    expect(markAttempts).toBe(0);
    expect(notifiedAtOfTheOneRow()).toBeUndefined();

    const second = await post(callbackBodyOf());

    expect(second.status).toBe(200);
    expect(mail.sendMail).toHaveBeenCalledTimes(2);
    expect(notifiedAtOfTheOneRow()).toBeInstanceOf(Date);
  });
});

describe("an accepted send whose mark fails, then a retry", () => {
  it("still answers sent, writes a line that names no secret, and the retry sends a second notice and marks (the recorded duplicate)", async () => {
    const consoleSpies = silenceEveryConsoleMethod();
    const mail = scriptMail(accepts, accepts);
    failMarks = 1;

    const first = await post(callbackBodyOf());
    const rowAfterTheFirst = store.heldSubmissions();
    const linesAfterTheFirst = consoleCallsOf(consoleSpies);
    const second = await post(callbackBodyOf());

    expect(first.status).toBe(200);
    expect(await answerOf(first)).toMatchObject({ status: "sent" });
    expect(rowAfterTheFirst[0]?.notifiedAt).toBeUndefined();
    expect(linesAfterTheFirst.length).toBeGreaterThan(0);
    expectNoMarkerIn(linesAfterTheFirst, [
      ...SECRET_MARKERS,
      ...CUSTOMER_MARKERS,
    ]);
    expect(second.status).toBe(200);
    expect(mail.sendMail).toHaveBeenCalledTimes(2);
    expect(markAttempts).toBe(2);
    expect(notifiedAtOfTheOneRow()).toBeInstanceOf(Date);
  });
});

describe("an accepted and marked request, retried", () => {
  it.each([1, 2, 5])(
    "sends nothing more over %i retries and answers the same reference",
    async (retries) => {
      silenceEveryConsoleMethod();
      const mail = scriptMail(accepts);
      const first = await answerOf(await post(callbackBodyOf()));

      const answers: Record<string, unknown>[] = [];
      for (let attempt = 0; attempt < retries; attempt += 1) {
        answers.push(await answerOf(await post(callbackBodyOf())));
      }

      expect(
        answers.every((answer) => answer.reference === first.reference),
      ).toBe(true);
      expect(mail.sendMail).toHaveBeenCalledTimes(1);
      expect(fakes.createTransport).toHaveBeenCalledTimes(1);
      expect(markAttempts).toBe(1);
    },
  );
});

describe("a spent quota", () => {
  const QUOTA = {
    responseCode: 550,
    response: "550-5.4.5 Daily user sending quota exceeded",
  };

  it("answers the non-retry code, stores the request un-notified, and sends once", async () => {
    const consoleSpies = silenceEveryConsoleMethod();
    const mail = scriptMail(rejects(QUOTA));

    const response = await post(bodyOf());

    expect(response.status).toBe(NOT_SENT_FINAL.status);
    const body = await answerOf(response);
    expect(body.code).toBe(NOT_SENT_FINAL.code);
    expect(Object.keys(body).sort()).toEqual(["code", "error"]);
    expect(mail.sendMail).toHaveBeenCalledTimes(1);
    expect(markAttempts).toBe(0);
    expect(notifiedAtOfTheOneRow()).toBeUndefined();
    expectNoMarkerIn(
      [body, consoleCallsOf(consoleSpies)],
      [...SECRET_MARKERS, ...CUSTOMER_MARKERS],
    );
  });
});

describe("every way a send can fail, through the route", () => {
  const FAILURES: readonly [string, () => Promise<unknown>, string][] = [
    ["a busy reply", rejects({ responseCode: 421 }), "busy"],
    ["a transient reply", rejects({ responseCode: 451 }), "busy"],
    [
      "an authentication refusal",
      rejects({ code: "EAUTH", responseCode: 535 }),
      "refused",
    ],
    [
      "a permanent refusal",
      rejects({ responseCode: 550, response: "550 5.7.1 no" }),
      "refused",
    ],
    ["an envelope refusal", rejects({ code: "EENVELOPE" }), "refused"],
    [
      "a quota reply",
      rejects({ responseCode: 550, response: "550 5.4.5 limit" }),
      "quota-spent",
    ],
    ["a timeout", rejects({ code: "ETIMEDOUT" }), "timed-out"],
    ["a connection failure", rejects({ code: "ECONNECTION" }), "unreachable"],
    ["a socket failure", rejects({ code: "ESOCKET" }), "unreachable"],
    ["a DNS failure", rejects({ code: "EDNS" }), "unreachable"],
    ["a protocol error", rejects({ code: "EPROTOCOL" }), "unreadable-answer"],
    ["nothing readable", () => Promise.resolve(undefined), "unreadable-answer"],
    [
      "an empty acceptance",
      () => Promise.resolve({ accepted: [], rejected: [] }),
      "unreadable-answer",
    ],
    ["a thrown null", () => rejectingWith(null), "unreachable"],
  ];

  it.each(FAILURES)(
    "after %s: the row stays stored, nothing is marked, and the outward code follows the retry table for %s",
    async (_label, answer, kind) => {
      const consoleSpies = silenceEveryConsoleMethod();
      const mail = scriptMail(answer);

      const response = await post(bodyOf());

      const expected = isRetryableMailFailure(
        kind as Parameters<typeof isRetryableMailFailure>[0],
      )
        ? CONTACT_NOTICE_NOT_SENT_RETRY_CODE
        : CONTACT_NOTICE_NOT_SENT_CODE;
      expect(response.status).toBe(502);
      const body = await answerOf(response);
      expect(body.code).toBe(expected);
      expect(Object.keys(body).sort()).toEqual(["code", "error"]);
      expect(mail.sendMail).toHaveBeenCalledTimes(1);
      expect(mail.close).toHaveBeenCalledTimes(1);
      expect(markAttempts).toBe(0);
      expect(notifiedAtOfTheOneRow()).toBeUndefined();
      expectNoMarkerIn(
        [body, consoleCallsOf(consoleSpies)],
        [...SECRET_MARKERS, ...CUSTOMER_MARKERS],
      );
    },
  );

  it("is the plan's own table of which kinds a retry may follow, written again here", () => {
    const retryable = ["busy", "unreachable", "timed-out", "unreadable-answer"];
    const final = ["refused", "quota-spent", "payload-mismatch"];

    for (const kind of retryable)
      expect(isRetryableMailFailure(kind as never)).toBe(true);
    for (const kind of final)
      expect(isRetryableMailFailure(kind as never)).toBe(false);
  });
});

describe("a transport that cannot be made", () => {
  it("answers the 5B code of its kind with the row stored, and never rejects", async () => {
    silenceEveryConsoleMethod();
    fakes.createTransport.mockImplementation(() => {
      throw quotingLibraryError({ code: "ECONFIG" });
    });

    const response = await post(bodyOf());

    expect(response.status).toBe(502);
    expect((await answerOf(response)).code).toBe(CONTACT_NOTICE_NOT_SENT_CODE);
    expect(notifiedAtOfTheOneRow()).toBeUndefined();
  });
});
