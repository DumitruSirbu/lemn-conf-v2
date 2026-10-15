// What the Gmail adapter makes of a transport's answer, through the adapter and not the table alone: every reply
// code against every error code, the quota reply at its exact text, the ten-second bound when the transport settles
// late, and everything that leaves the adapter on any branch. The transport is scripted: no test opens a socket.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createGmailMailSender,
  MAIL_REQUEST_TIMEOUT_MS,
  type MakeMailTransport,
} from "@/lib/server/mail/gmail-mail-sender";
import {
  MAIL_FAILURE_KINDS,
  type MailFailureKind,
  type MailOutcome,
} from "@/lib/server/mail/mail-sender";

import {
  forbidFetch,
  forbidNetwork,
  releaseFetch,
  releaseNetwork,
} from "./mail-test-support";
import {
  ACCEPTED_ONE_RECIPIENT,
  consoleCallsOf,
  DISCLOSURE_MARKERS,
  expectNoMarkerIn,
  FAKE_APP_PASSWORD,
  FAKE_INBOX,
  QA_CONFIGURATION,
  QA_MESSAGE,
  QUOTING_REPLY_TEXT,
  quotingLibraryError,
  rejectingWith,
  silenceEveryConsoleMethod,
  transportsAnswering,
} from "./qa-8j-support";

function sendThrough(make: MakeMailTransport): Promise<MailOutcome> {
  return createGmailMailSender(QA_CONFIGURATION, make).send(QA_MESSAGE);
}

/** One send whose transport rejects with `thrown`, and the single `sendMail` it made. */
async function outcomeOfThrowing(thrown: unknown): Promise<MailOutcome> {
  const transports = transportsAnswering(() => rejectingWith(thrown));
  const outcome = await sendThrough(transports.make);
  expect(transports.sentOptions).toHaveLength(1);
  expect(transports.closeCalls()).toBe(1);
  return outcome;
}

beforeEach(() => {
  forbidFetch();
  forbidNetwork();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  releaseFetch();
  releaseNetwork();
});

/**
 * The table of the plan's 8N.5, written again here and not read from the module. The plan has no row for a thrown
 * error that carries a 2xx or 3xx reply code, so for those the oracle follows the source: the error code decides.
 */
function expectedKind(
  replyCode: number,
  errorCode: string | undefined,
): MailFailureKind {
  if (replyCode >= 500 && replyCode <= 599) return "refused";
  if (replyCode >= 400 && replyCode <= 499) return "busy";
  if (REFUSED_CODES.includes(errorCode ?? "")) return "refused";
  if (errorCode === "ETIMEDOUT") return "timed-out";
  if (errorCode === "EPROTOCOL") return "unreadable-answer";
  return "unreachable";
}

const REFUSED_CODES = [
  "EAUTH",
  "ENOAUTH",
  "EENVELOPE",
  "ECONFIG",
  "EFILEACCESS",
  "EURLACCESS",
  "EREQUIRETLS",
];

/** Every row of the table, and a code the library does not use. */
const ERROR_CODES: readonly (string | undefined)[] = [
  undefined,
  ...REFUSED_CODES,
  "ETIMEDOUT",
  "ECONNECTION",
  "ESOCKET",
  "EDNS",
  "ETLS",
  "EPROXY",
  "EPROTOCOL",
  "NOT_A_LIBRARY_CODE",
];

describe("every reply code against every error code, through the adapter", () => {
  it("answers one kind from the table, a status exactly for a code from 200 to 599, and never the mismatch", async () => {
    const wrong: string[] = [];
    for (let replyCode = 100; replyCode <= 600; replyCode += 1) {
      for (const errorCode of ERROR_CODES) {
        const outcome = await outcomeOfThrowing(
          quotingLibraryError({ responseCode: replyCode, code: errorCode }),
        );
        const isStatusUsable = replyCode >= 200 && replyCode <= 599;
        const expected = {
          ok: false,
          kind: expectedKind(replyCode, errorCode),
          ...(isStatusUsable ? { status: replyCode } : {}),
        };
        if (JSON.stringify(outcome) !== JSON.stringify(expected))
          wrong.push(
            `${String(replyCode)}/${String(errorCode)}: ${JSON.stringify(outcome)}`,
          );
      }
    }

    expect(wrong).toEqual([]);
  });

  it("reads the reply code from a number only, whatever else it could be read from", async () => {
    const notAReplyCode = [
      "550",
      "550.0",
      550.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      -550,
      [550],
      { valueOf: () => 550 },
      true,
      null,
    ];

    for (const responseCode of notAReplyCode) {
      const outcome = await outcomeOfThrowing(
        quotingLibraryError({
          responseCode,
          response: "550 5.4.5 Daily user sending quota exceeded",
        }),
      );

      expect(outcome).toEqual({ ok: false, kind: "unreachable" });
    }
  });

  it("keeps a reply code from a getter that answers one, and survives one that throws", async () => {
    const answers = quotingLibraryError();
    Object.defineProperty(answers, "responseCode", { get: () => 451 });
    const throws = quotingLibraryError({ code: "ETIMEDOUT" });
    Object.defineProperty(throws, "responseCode", {
      get(): number {
        throw new Error(QUOTING_REPLY_TEXT);
      },
    });

    expect(await outcomeOfThrowing(answers)).toEqual({
      ok: false,
      kind: "busy",
      status: 451,
    });
    expect(await outcomeOfThrowing(throws)).toEqual({
      ok: false,
      kind: "timed-out",
    });
  });
});

describe("an error code that is not a string", () => {
  it.each([
    ["a number", 550],
    ["a list holding a refusing code", ["EAUTH"]],
    [
      "an object that prints as a refusing code",
      { toString: (): string => "EAUTH" },
    ],
    ["a string object", new String("EAUTH")],
    ["a symbol", Symbol("EAUTH")],
    ["null", null],
    ["a function", () => "EAUTH"],
  ])(
    "is read as no code at all, so %s is unreachable",
    async (_label, code) => {
      const outcome = await outcomeOfThrowing(quotingLibraryError({ code }));

      expect(outcome).toEqual({ ok: false, kind: "unreachable" });
    },
  );

  it("is outweighed by a reply code that is an integer from 400 to 599", async () => {
    const outcome = await outcomeOfThrowing(
      quotingLibraryError({ code: 550, responseCode: 452 }),
    );

    expect(outcome).toEqual({ ok: false, kind: "busy", status: 452 });
  });
});

describe("the quota reply, at its exact text", () => {
  const QUOTA_REPLY = "5.4.5 Daily user sending quota exceeded";

  it.each([
    ["a space after the code", 550, `550 ${QUOTA_REPLY}`, "quota-spent"],
    [
      "a hyphen of a multi-line reply",
      550,
      `550-${QUOTA_REPLY}`,
      "quota-spent",
    ],
    ["the enhanced code alone", 550, "550 5.4.5", "quota-spent"],
    ["a longer enhanced code", 550, "550 5.4.50 other", "refused"],
    ["a leading space", 550, ` 550 ${QUOTA_REPLY}`, "refused"],
    ["a lower code", 549, `549 ${QUOTA_REPLY}`, "refused"],
    ["a higher code", 551, `551 ${QUOTA_REPLY}`, "refused"],
    ["another enhanced code", 550, "550 5.7.1 denied", "refused"],
    ["the quota text in the middle", 550, `x 550 ${QUOTA_REPLY}`, "refused"],
    ["a reply code that is a text", 550, 550 as never, "refused"],
    [
      "a reply that is no text",
      550,
      { toString: (): string => `550 ${QUOTA_REPLY}` },
      "refused",
    ],
    ["an absent reply", 550, undefined, "refused"],
    ["a 4xx with the quota text", 450, `450 ${QUOTA_REPLY}`, "busy"],
  ])(
    "answers %s as %s",
    async (_label, responseCode, response, expectedKind) => {
      const outcome = await outcomeOfThrowing(
        quotingLibraryError({ responseCode, response }),
      );

      expect(outcome).toEqual({
        ok: false,
        kind: expectedKind,
        status: responseCode,
      });
    },
  );

  it("does not take the quota from `message` or `command`, which only `response` may say", async () => {
    const outcome = await outcomeOfThrowing(
      quotingLibraryError({
        responseCode: 550,
        response: "550 5.7.1 denied",
        message: `550 ${QUOTA_REPLY}`,
        command: `550 ${QUOTA_REPLY}`,
      }),
    );

    expect(outcome).toEqual({ ok: false, kind: "refused", status: 550 });
  });

  it("keeps nothing a server said in the status or the kind", async () => {
    const outcome = await outcomeOfThrowing(
      quotingLibraryError({
        responseCode: 550,
        response: `550 ${QUOTA_REPLY} ${FAKE_APP_PASSWORD}`,
      }),
    );

    expect(outcome).toEqual({ ok: false, kind: "quota-spent", status: 550 });
  });
});

describe("a send that resolves, over what it resolves with", () => {
  const RESOLUTIONS: readonly [string, unknown, MailOutcome][] = [
    ["one accepted, nothing rejected", ACCEPTED_ONE_RECIPIENT, { ok: true }],
    [
      "one accepted and `rejected` absent",
      { accepted: [FAKE_INBOX] },
      { ok: true },
    ],
    [
      "two accepted",
      { accepted: [FAKE_INBOX, "second@example.com"], rejected: [] },
      { ok: false, kind: "unreadable-answer" },
    ],
    [
      "none accepted",
      { accepted: [], rejected: [] },
      { ok: false, kind: "unreadable-answer" },
    ],
    [
      "one accepted and one rejected",
      { accepted: [FAKE_INBOX], rejected: ["second@example.com"] },
      { ok: false, kind: "unreadable-answer" },
    ],
    [
      "the accepted one rejected as well",
      { accepted: [], rejected: [FAKE_INBOX] },
      { ok: false, kind: "unreadable-answer" },
    ],
    [
      "accepted that is a text",
      { accepted: FAKE_INBOX, rejected: [] },
      { ok: false, kind: "unreadable-answer" },
    ],
    [
      "rejected that is a text",
      { accepted: [FAKE_INBOX], rejected: "" },
      { ok: false, kind: "unreadable-answer" },
    ],
    ["undefined", undefined, { ok: false, kind: "unreadable-answer" }],
    ["null", null, { ok: false, kind: "unreadable-answer" }],
    ["a text", "250 OK", { ok: false, kind: "unreadable-answer" }],
    [
      "a reply code beside a failure",
      { accepted: [], rejected: [FAKE_INBOX], responseCode: 550 },
      { ok: false, kind: "unreadable-answer", status: 550 },
    ],
  ];

  it.each(RESOLUTIONS)("answers %s", async (_label, resolved, expected) => {
    const transports = transportsAnswering(() => resolved);

    const outcome = await sendThrough(transports.make);

    expect(outcome).toEqual(expected);
    expect(transports.sentOptions).toHaveLength(1);
  });

  it("answers an unreadable answer, not an acceptance, when a member's getter throws", async () => {
    const getterThrows = (member: "accepted" | "rejected") =>
      Object.defineProperty({ accepted: [FAKE_INBOX], rejected: [] }, member, {
        enumerable: true,
        get(): never {
          throw new Error(QUOTING_REPLY_TEXT);
        },
      });

    for (const member of ["accepted", "rejected"] as const) {
      const transports = transportsAnswering(() => getterThrows(member));

      const outcome = await sendThrough(transports.make);

      expect(outcome).toEqual({ ok: false, kind: "unreadable-answer" });
    }
  });

  it("answers an unreadable answer when `accepted` is an array whose length cannot be read", async () => {
    const hostile = new Proxy([FAKE_INBOX], {
      get(target, name, receiver) {
        if (name === "length") throw new Error(QUOTING_REPLY_TEXT);
        return Reflect.get(target, name, receiver) as unknown;
      },
    });
    const transports = transportsAnswering(() => ({
      accepted: hostile,
      rejected: [],
    }));

    const outcome = await sendThrough(transports.make);

    expect(outcome.ok).toBe(false);
    expectNoMarkerIn(outcome, DISCLOSURE_MARKERS);
  });
});

describe("the ten-second bound, once the transport has been asked", () => {
  function useFakeBoundTimers(): void {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  }

  /** A transport whose `sendMail` settles after `delayMs` with what `settle` makes. */
  function transportSettlingAfter(
    delayMs: number,
    settle: () => Promise<unknown>,
  ) {
    return transportsAnswering(
      () =>
        new Promise<unknown>((resolve, reject) => {
          setTimeout(() => {
            settle().then(resolve, reject);
          }, delayMs);
        }),
    );
  }

  async function settledFlagOf(pending: Promise<unknown>) {
    const flag = { isSettled: false };
    void pending.then(() => {
      flag.isSettled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    return flag;
  }

  it("runs from the send: an acceptance at one millisecond before the bound is an acceptance, and one after it is not", async () => {
    useFakeBoundTimers();
    const early = transportSettlingAfter(MAIL_REQUEST_TIMEOUT_MS - 1, () =>
      Promise.resolve(ACCEPTED_ONE_RECIPIENT),
    );
    const late = transportSettlingAfter(MAIL_REQUEST_TIMEOUT_MS + 1, () =>
      Promise.resolve(ACCEPTED_ONE_RECIPIENT),
    );

    const earlyPending = sendThrough(early.make);
    const latePending = sendThrough(late.make);
    const earlyFlag = await settledFlagOf(earlyPending);
    const lateFlag = await settledFlagOf(latePending);
    await vi.advanceTimersByTimeAsync(MAIL_REQUEST_TIMEOUT_MS - 2);
    const wasEarlySettledBeforeItsDelay = earlyFlag.isSettled;
    await vi.advanceTimersByTimeAsync(1);
    const wasLateSettledBeforeTheBound = lateFlag.isSettled;
    await vi.advanceTimersByTimeAsync(1);

    expect(wasEarlySettledBeforeItsDelay).toBe(false);
    expect(wasLateSettledBeforeTheBound).toBe(false);
    expect(await earlyPending).toEqual({ ok: true });
    expect(await latePending).toEqual({ ok: false, kind: "timed-out" });
  });

  it("answers timed out with no status, closes once and asks once, for a transport that never settles", async () => {
    useFakeBoundTimers();
    const transports = transportsAnswering(() => new Promise(() => undefined));

    const pending = sendThrough(transports.make);
    await vi.advanceTimersByTimeAsync(MAIL_REQUEST_TIMEOUT_MS);
    const outcome = await pending;
    await vi.advanceTimersByTimeAsync(10 * MAIL_REQUEST_TIMEOUT_MS);

    expect(outcome).toEqual({ ok: false, kind: "timed-out" });
    expect(transports.sentOptions).toHaveLength(1);
    expect(transports.made()).toBe(1);
    expect(transports.closeCalls()).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("answers timed out, and keeps no status, when the library's own timer fires first with a reply code beside it", async () => {
    useFakeBoundTimers();
    const transports = transportSettlingAfter(1_000, () =>
      Promise.reject(quotingLibraryError({ code: "ETIMEDOUT" })),
    );

    const pending = sendThrough(transports.make);
    await vi.advanceTimersByTimeAsync(1_000);
    const outcome = await pending;

    expect(outcome).toEqual({ ok: false, kind: "timed-out" });
    expectNoMarkerIn(outcome, DISCLOSURE_MARKERS);
  });

  it("keeps its answer and asks again for nothing when an acceptance arrives after the bound", async () => {
    useFakeBoundTimers();
    const transports = transportSettlingAfter(MAIL_REQUEST_TIMEOUT_MS + 1, () =>
      Promise.resolve(ACCEPTED_ONE_RECIPIENT),
    );

    const pending = sendThrough(transports.make);
    await vi.advanceTimersByTimeAsync(MAIL_REQUEST_TIMEOUT_MS);
    const outcome = await pending;
    await vi.advanceTimersByTimeAsync(60_000);

    expect(outcome).toEqual({ ok: false, kind: "timed-out" });
    expect(transports.sentOptions).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("is ignored by a rejection that comes after the transport was closed, with every marker in it, and leaves no unhandled rejection", async () => {
    useFakeBoundTimers();
    const unhandled: unknown[] = [];
    const record = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", record);
    try {
      const consoleSpies = silenceEveryConsoleMethod();
      let rejectLate: (reason: unknown) => void = () => undefined;
      const transports = transportsAnswering(
        () =>
          new Promise<unknown>((_resolve, reject) => {
            rejectLate = reject;
          }),
      );

      const pending = sendThrough(transports.make);
      await vi.advanceTimersByTimeAsync(MAIL_REQUEST_TIMEOUT_MS);
      const outcome = await pending;
      expect(transports.closeCalls()).toBe(1);
      rejectLate(quotingLibraryError({ responseCode: 550 }));
      await vi.advanceTimersByTimeAsync(0);
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(outcome).toEqual({ ok: false, kind: "timed-out" });
      expect(unhandled).toEqual([]);
      expectNoMarkerIn(outcome, DISCLOSURE_MARKERS);
      expect(consoleCallsOf(consoleSpies)).toEqual([]);
    } finally {
      process.off("unhandledRejection", record);
    }
  });

  it.each([
    [
      "a refusal",
      () => Promise.reject(quotingLibraryError({ responseCode: 535 })),
    ],
    ["a rejection", () => Promise.reject(new TypeError("connection"))],
    ["an unreadable answer", () => Promise.resolve({ accepted: [] })],
    ["an acceptance", () => Promise.resolve(ACCEPTED_ONE_RECIPIENT)],
  ])(
    "leaves no timer behind and asks nothing again after %s",
    async (_label, answer) => {
      useFakeBoundTimers();
      const transports = transportsAnswering(answer);

      await sendThrough(transports.make);
      const timersLeft = vi.getTimerCount();
      await vi.advanceTimersByTimeAsync(60_000);

      expect(timersLeft).toBe(0);
      expect(transports.sentOptions).toHaveLength(1);
    },
  );
});

describe("what leaves the adapter on any branch, and what it writes", () => {
  const THROWN_BY_SENDMAIL: readonly [string, () => Promise<unknown>][] = [
    [
      "an authentication failure",
      () =>
        Promise.reject(
          quotingLibraryError({ code: "EAUTH", responseCode: 535 }),
        ),
    ],
    [
      "a quota reply",
      () =>
        Promise.reject(
          quotingLibraryError({
            responseCode: 550,
            response: `550-5.4.5 ${QUOTING_REPLY_TEXT}`,
          }),
        ),
    ],
    [
      "a busy reply",
      () => Promise.reject(quotingLibraryError({ responseCode: 421 })),
    ],
    [
      "an error with a cause quoting them",
      () =>
        Promise.reject(
          Object.assign(new TypeError(QUOTING_REPLY_TEXT), {
            cause: quotingLibraryError(),
          }),
        ),
    ],
    ["a thrown string", () => rejectingWith(QUOTING_REPLY_TEXT)],
    ["a thrown null", () => rejectingWith(null)],
    ["a thrown undefined", () => rejectingWith(undefined)],
    ["a thrown number", () => rejectingWith(550)],
    ["a thrown symbol", () => rejectingWith(Symbol(QUOTING_REPLY_TEXT))],
    [
      "a thrown object that is no error",
      () =>
        rejectingWith({ message: QUOTING_REPLY_TEXT, key: FAKE_APP_PASSWORD }),
    ],
    [
      "a throw before a promise exists",
      () => {
        throw quotingLibraryError({ code: "ECONNECTION" });
      },
    ],
    [
      "a result that quotes them",
      () =>
        Promise.resolve({
          accepted: [],
          rejected: [FAKE_INBOX],
          response: QUOTING_REPLY_TEXT,
          message: QUOTING_REPLY_TEXT,
        }),
    ],
  ];

  it.each(THROWN_BY_SENDMAIL)(
    "returns three members at most, none holding the password, the addresses or the customer, for %s",
    async (_label, answer) => {
      const consoleSpies = silenceEveryConsoleMethod();
      const transports = transportsAnswering(answer);

      const outcome = await sendThrough(transports.make);

      expect(
        Reflect.ownKeys(outcome).filter(
          (key) => !["ok", "kind", "status"].includes(String(key)),
        ),
      ).toEqual([]);
      expect(Object.getPrototypeOf(outcome)).toBe(Object.prototype);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(MAIL_FAILURE_KINDS).toContain(outcome.kind);
        expect(outcome.kind).not.toBe("payload-mismatch");
      }
      expectNoMarkerIn(outcome, DISCLOSURE_MARKERS);
      expect(consoleCallsOf(consoleSpies)).toEqual([]);
    },
  );

  it("answers from the table, never rejects and holds no marker when the transport cannot be made, for every error code", async () => {
    const consoleSpies = silenceEveryConsoleMethod();
    const outcomes: MailOutcome[] = [];

    for (const code of ERROR_CODES) {
      outcomes.push(
        await sendThrough(() => {
          throw quotingLibraryError({ code });
        }),
      );
    }

    expect(
      outcomes.map((outcome) => (outcome.ok ? "ok" : outcome.kind)),
    ).toEqual(ERROR_CODES.map((code) => expectedKind(0, code)));
    expectNoMarkerIn(outcomes, DISCLOSURE_MARKERS);
    expect(consoleCallsOf(consoleSpies)).toEqual([]);
  });

  it("keeps the send's answer, writes nothing and rejects nothing when `close` throws with every marker in it", async () => {
    const consoleSpies = silenceEveryConsoleMethod();
    const make: MakeMailTransport = () => ({
      sendMail: () => Promise.resolve(ACCEPTED_ONE_RECIPIENT),
      close: () => {
        throw quotingLibraryError();
      },
    });

    const outcome = await sendThrough(make);

    expect(outcome).toEqual({ ok: true });
    expect(consoleCallsOf(consoleSpies)).toEqual([]);
  });
});
