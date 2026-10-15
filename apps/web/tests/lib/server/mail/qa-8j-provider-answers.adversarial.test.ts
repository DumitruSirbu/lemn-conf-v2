// What the adapter makes of a provider's answer: bodies generated rather than chosen, the body bound at
// its exact byte, bodies that break, stall or lie about their name, and the ten-second bound when the
// request has already been answered.
import { fc } from "@fast-check/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MailOutcome } from "@/lib/server/mail/mail-sender";
import {
  createResendMailSender,
  MAIL_REQUEST_TIMEOUT_MS,
  RESEND_SEND_URL,
} from "@/lib/server/mail/resend-mail-sender";

import { forbidFetch, releaseFetch } from "./mail-test-support";
import {
  answerOf,
  bytesOf,
  consoleCallsOf,
  DISCLOSURE_MARKERS,
  expectNoMarkerIn,
  QA_CONFIGURATION,
  QA_MESSAGE,
  QUOTING_ERROR_BODY,
  silenceEveryConsoleMethod,
  streamOf,
  stubFetch,
  stubFetchAnswering,
  textAnswer,
} from "./qa-8j-support";

const ANSWER_BOUND_BYTES = 16 * 1024;
const MISMATCH_NAME = "invalid_idempotent_request";
const RATE_NAME = "rate_limit_exceeded";

function send(): Promise<MailOutcome> {
  return createResendMailSender(QA_CONFIGURATION).send(QA_MESSAGE);
}

function failed(kind: string, status: number) {
  return { ok: false, kind, status };
}

/** One send against one answer; the single request it made is part of what is asserted. */
async function outcomeFor(makeAnswer: () => Response): Promise<MailOutcome> {
  const fetchSpy = stubFetchAnswering(makeAnswer);
  const outcome = await send();
  expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([RESEND_SEND_URL]);
  return outcome;
}

beforeEach(forbidFetch);
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  releaseFetch();
});

const otherMembers = fc.dictionary(
  fc.string({ maxLength: 8 }).filter((key) => key !== "id" && key !== "name"),
  fc.jsonValue({ maxDepth: 2 }),
  { maxKeys: 4 },
);

const successStatus = fc.integer({ min: 200, max: 299 });

const notAnAcceptedId = fc.oneof(
  fc.constant(null),
  fc.constant(""),
  fc.boolean(),
  fc.integer(),
  fc.array(fc.string({ minLength: 1, maxLength: 4 }), { maxLength: 2 }),
  fc.record({ id: fc.string({ minLength: 1, maxLength: 4 }) }),
);

const jsonThatIsNoObject = fc
  .oneof(
    fc.constant(null),
    fc.boolean(),
    fc.integer(),
    fc.string({ maxLength: 12 }),
    fc.array(fc.record({ id: fc.constant("msg_listed") }), { maxLength: 2 }),
  )
  .map((value) => JSON.stringify(value));

const bytesThatAreNoJson = fc
  .uint8Array({ maxLength: 64 })
  .map((bytes) => Uint8Array.from([0xff, 0xfe, ...bytes]));

describe("a 2xx answer, over generated bodies", () => {
  it("is an acceptance for any JSON object whose id is non-empty text, whatever else it holds", async () => {
    await fc.assert(
      fc.asyncProperty(
        successStatus,
        otherMembers,
        fc.string({ minLength: 1, maxLength: 24 }),
        async (status, members, id) => {
          const body = JSON.stringify({ ...members, id });

          const outcome = await outcomeFor(() => textAnswer(status, body));

          expect(outcome).toEqual({ ok: true });
          expect(Object.keys(outcome)).toEqual(["ok"]);
        },
      ),
    );
  });

  it("is an unreadable answer for an object whose id is anything but non-empty text", async () => {
    await fc.assert(
      fc.asyncProperty(
        successStatus,
        otherMembers,
        notAnAcceptedId,
        async (status, members, id) => {
          const body = JSON.stringify({ ...members, id });

          const outcome = await outcomeFor(() => textAnswer(status, body));

          expect(outcome).toEqual(failed("unreadable-answer", status));
        },
      ),
    );
  });

  it("is an unreadable answer for an object with no id at all", async () => {
    await fc.assert(
      fc.asyncProperty(successStatus, otherMembers, async (status, members) => {
        const outcome = await outcomeFor(() =>
          textAnswer(status, JSON.stringify(members)),
        );

        expect(outcome).toEqual(failed("unreadable-answer", status));
      }),
    );
  });

  it("is an unreadable answer for JSON that is not an object, even one that lists an accepted object", async () => {
    await fc.assert(
      fc.asyncProperty(
        successStatus,
        jsonThatIsNoObject,
        async (status, body) => {
          const outcome = await outcomeFor(() => textAnswer(status, body));

          expect(outcome).toEqual(failed("unreadable-answer", status));
        },
      ),
    );
  });

  it("is an unreadable answer for bytes that are not text at all", async () => {
    await fc.assert(
      fc.asyncProperty(
        successStatus,
        bytesThatAreNoJson,
        async (status, bytes) => {
          const outcome = await outcomeFor(() =>
            answerOf(status, streamOf(bytes)),
          );

          expect(outcome).toEqual(failed("unreadable-answer", status));
        },
      ),
    );
  });

  it("is an unreadable answer for an accepted body cut one character short", async () => {
    const whole = JSON.stringify({ id: "msg_whole" });

    const outcome = await outcomeFor(() => textAnswer(200, whole.slice(0, -1)));

    expect(outcome).toEqual(failed("unreadable-answer", 200));
  });
});

const nameThatIsNot = (reserved: string) =>
  fc.oneof(
    fc.string({ maxLength: 40 }).filter((name) => name !== reserved),
    fc.constantFrom(
      `${reserved} `,
      ` ${reserved}`,
      reserved.toUpperCase(),
      `${reserved}\n`,
      `${reserved}s`,
    ),
    fc.constant(null),
    fc.integer(),
    fc.constant([reserved]),
    fc.constant({ name: reserved }),
    fc.constant({ toString: reserved }),
  );

function bodyNaming(members: Record<string, unknown>, name: unknown): string {
  return JSON.stringify({ ...members, name });
}

describe("the two conflicts, over generated bodies", () => {
  it("is a payload mismatch exactly when the top-level name is the documented one", async () => {
    await fc.assert(
      fc.asyncProperty(otherMembers, async (members) => {
        const outcome = await outcomeFor(() =>
          textAnswer(409, bodyNaming(members, MISMATCH_NAME)),
        );

        expect(outcome).toEqual(failed("payload-mismatch", 409));
      }),
    );
  });

  it("is busy for every other name, near miss, nesting or type", async () => {
    await fc.assert(
      fc.asyncProperty(
        otherMembers,
        nameThatIsNot(MISMATCH_NAME),
        async (members, name) => {
          const outcome = await outcomeFor(() =>
            textAnswer(409, bodyNaming(members, name)),
          );

          expect(outcome).toEqual(failed("busy", 409));
        },
      ),
    );
  });

  it("is busy when the mismatch's name is somewhere other than the top-level name", async () => {
    const elsewhere = [
      JSON.stringify({ error: { name: MISMATCH_NAME } }),
      JSON.stringify({ message: MISMATCH_NAME }),
      JSON.stringify({ type: MISMATCH_NAME }),
      JSON.stringify([{ name: MISMATCH_NAME }]),
      JSON.stringify(MISMATCH_NAME),
      MISMATCH_NAME,
    ];

    for (const body of elsewhere) {
      expect(await outcomeFor(() => textAnswer(409, body))).toEqual(
        failed("busy", 409),
      );
    }
  });
});

describe("the two answers of too many requests, over generated bodies", () => {
  it("is busy exactly when the top-level name is the rate limit's", async () => {
    await fc.assert(
      fc.asyncProperty(otherMembers, async (members) => {
        const outcome = await outcomeFor(() =>
          textAnswer(429, bodyNaming(members, RATE_NAME)),
        );

        expect(outcome).toEqual(failed("busy", 429));
      }),
    );
  });

  it("is a spent quota for every other name, near miss, nesting or type", async () => {
    await fc.assert(
      fc.asyncProperty(
        otherMembers,
        nameThatIsNot(RATE_NAME),
        async (members, name) => {
          const outcome = await outcomeFor(() =>
            textAnswer(429, bodyNaming(members, name)),
          );

          expect(outcome).toEqual(failed("quota-spent", 429));
        },
      ),
    );
  });

  it("is a spent quota for bytes that are not text at all", async () => {
    await fc.assert(
      fc.asyncProperty(bytesThatAreNoJson, async (bytes) => {
        const outcome = await outcomeFor(() => answerOf(429, streamOf(bytes)));

        expect(outcome).toEqual(failed("quota-spent", 429));
      }),
    );
  });
});

describe("a name or an id the body's own JSON could smuggle in", () => {
  it.each([
    [
      "a prototype member holding an id",
      200,
      '{"__proto__":{"id":"msg_inherited"}}',
      "unreadable-answer",
    ],
    [
      "a prototype member holding the mismatch's name",
      409,
      `{"__proto__":{"name":"${MISMATCH_NAME}"}}`,
      "busy",
    ],
    [
      "a prototype member holding the rate limit's name",
      429,
      `{"__proto__":{"name":"${RATE_NAME}"}}`,
      "quota-spent",
    ],
    [
      "an id written twice, the last one empty",
      200,
      '{"id":"msg_first","id":""}',
      "unreadable-answer",
    ],
    [
      "the mismatch's name written twice, the last one another",
      409,
      `{"name":"${MISMATCH_NAME}","name":"resource_locked"}`,
      "busy",
    ],
    [
      "the rate limit's name written twice, the last one a quota's",
      429,
      `{"name":"${RATE_NAME}","name":"daily_quota_exceeded"}`,
      "quota-spent",
    ],
  ])(
    "answers %s as its row's otherwise",
    async (_label, status, body, kind) => {
      const outcome = await outcomeFor(() => textAnswer(status, body));

      expect(outcome).toEqual(failed(kind, status));
      expect(({} as Record<string, unknown>).id).toBeUndefined();
      expect(({} as Record<string, unknown>).name).toBeUndefined();
    },
  );

  it("reads an accepted body behind a byte order mark", async () => {
    const withMark = Uint8Array.from([
      0xef,
      0xbb,
      0xbf,
      ...bytesOf('{"id":"msg_marked"}'),
    ]);

    const outcome = await outcomeFor(() => answerOf(200, streamOf(withMark)));

    expect(outcome).toEqual({ ok: true });
  });

  it("does not read an accepted body sent in a two-byte encoding", async () => {
    const text = '{"id":"msg_wide"}';
    const wide = new Uint8Array(text.length * 2);
    for (let index = 0; index < text.length; index += 1) {
      wide[index * 2] = text.charCodeAt(index);
    }

    const outcome = await outcomeFor(() => answerOf(200, streamOf(wide)));

    expect(outcome).toEqual(failed("unreadable-answer", 200));
  });
});

describe("statuses whose body decides nothing", () => {
  const BODIES_THAT_WOULD_DECIDE = [
    JSON.stringify({ id: "msg_1" }),
    JSON.stringify({ name: MISMATCH_NAME }),
    JSON.stringify({ name: RATE_NAME }),
    QUOTING_ERROR_BODY,
  ];

  it.each([
    [100, 199, "unreadable-answer"],
    [300, 399, "unreadable-answer"],
    [400, 408, "refused"],
    [410, 428, "refused"],
    [430, 499, "refused"],
    [500, 599, "unreachable"],
  ])(
    "answers every status from %i to %i as %s and never asks for the body",
    async (first, last, kind) => {
      let bodyReads = 0;
      const wrong: number[] = [];
      for (let status = first; status <= last; status += 1) {
        for (const text of BODIES_THAT_WOULD_DECIDE) {
          stubFetchAnswering(
            () =>
              ({
                status,
                get body() {
                  bodyReads += 1;
                  return streamOf(bytesOf(text));
                },
              }) as unknown as Response,
          );
          const outcome = await send();
          if (JSON.stringify(outcome) !== JSON.stringify(failed(kind, status)))
            wrong.push(status);
        }
      }

      expect(wrong).toEqual([]);
      expect(bodyReads).toBe(0);
    },
  );
});

const PRODUCED_CHUNK_BYTES = 1024;
const CHUNKS_THAT_PASS_THE_BOUND =
  ANSWER_BOUND_BYTES / PRODUCED_CHUNK_BYTES + 1;
const CHUNKS_A_STREAM_READS_AHEAD = 1;
/** Finite, so a reader with no bound drains it and the test fails on what it counted, not by never returning. */
const CHUNKS_THE_PRODUCER_HOLDS = 4 * CHUNKS_THAT_PASS_THE_BOUND;

/** One real turn of the event loop: every read already owed has run, and no faked timer has moved. */
function untilEveryPendingReadHasRun(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

/** The three statuses whose body decides: the member that decides, what it decides, and the row's otherwise. */
const BODY_DECIDED_ROWS = [
  [200, '"id":"msg_1"', { ok: true }, failed("unreadable-answer", 200)],
  [
    409,
    `"name":"${MISMATCH_NAME}"`,
    failed("payload-mismatch", 409),
    failed("busy", 409),
  ],
  [
    429,
    `"name":"${RATE_NAME}"`,
    failed("busy", 429),
    failed("quota-spent", 429),
  ],
] as const;

/** The same statuses with a whole deciding body, and the answer owed when that body cannot be read. */
const OTHERWISE_ROWS = BODY_DECIDED_ROWS.map(
  ([status, member, , otherwise]) =>
    [status, `{${member}}`, otherwise] as const,
);

/** A JSON object of exactly `totalBytes` bytes: `head`, then a pad member that fills the rest. */
function objectOfExactly(totalBytes: number, head: string): Uint8Array {
  const open = `{${head},"pad":"`;
  const close = '"}';
  const padLength = totalBytes - bytesOf(open).length - close.length;
  const bytes = bytesOf(`${open}${"x".repeat(padLength)}${close}`);
  if (bytes.length !== totalBytes)
    throw new Error("the fixture missed its size");
  return bytes;
}

describe("the bound on the answer's body, at its exact byte", () => {
  it.each(BODY_DECIDED_ROWS)(
    "reads a %i body of sixteen kibibytes and not one byte more",
    async (status, head, atTheBound, pastTheBound) => {
      const atBound = await outcomeFor(() =>
        answerOf(status, streamOf(objectOfExactly(ANSWER_BOUND_BYTES, head))),
      );
      const pastBound = await outcomeFor(() =>
        answerOf(
          status,
          streamOf(objectOfExactly(ANSWER_BOUND_BYTES + 1, head)),
        ),
      );

      expect(atBound).toEqual(atTheBound);
      expect(pastBound).toEqual(pastTheBound);
    },
  );

  it("counts bytes and not characters", async () => {
    const twoByteLetters = "é".repeat(ANSWER_BOUND_BYTES / 2 + 8);
    const body = bytesOf(JSON.stringify({ id: "msg_1", pad: twoByteLetters }));

    const outcome = await outcomeFor(() => answerOf(200, streamOf(body)));

    expect(twoByteLetters.length).toBeLessThan(ANSWER_BOUND_BYTES);
    expect(body.length).toBeGreaterThan(ANSWER_BOUND_BYTES);
    expect(outcome).toEqual(failed("unreadable-answer", 200));
  });

  it("counts the bytes of every chunk together", async () => {
    const whole = objectOfExactly(ANSWER_BOUND_BYTES + 1, '"id":"msg_1"');
    const chunks = [
      whole.subarray(0, 5),
      whole.subarray(5, 9000),
      whole.subarray(9000),
    ];

    const outcome = await outcomeFor(() => answerOf(200, streamOf(...chunks)));

    expect(outcome).toEqual(failed("unreadable-answer", 200));
  });

  it("reads an id split across chunks in the middle of a character", async () => {
    const whole = bytesOf('{"id":"msg_ж"}');
    const middleOfTheLetter = whole.length - 3;

    const outcome = await outcomeFor(() =>
      answerOf(
        200,
        streamOf(
          whole.subarray(0, middleOfTheLetter),
          whole.subarray(middleOfTheLetter),
        ),
      ),
    );

    expect(outcome).toEqual({ ok: true });
  });

  it("stops reading a body that produces far past the bound, lets go of it, and answers at once", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let chunksProduced = 0;
    let wasCancelled = false;
    const producingFarPastTheBound = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (chunksProduced === CHUNKS_THE_PRODUCER_HOLDS) {
          controller.close();
          return;
        }
        chunksProduced += 1;
        controller.enqueue(new Uint8Array(PRODUCED_CHUNK_BYTES).fill(0x20));
      },
      cancel() {
        wasCancelled = true;
      },
    });
    stubFetchAnswering(() => answerOf(200, producingFarPastTheBound));
    let outcome: MailOutcome | undefined;

    void send().then((answer) => {
      outcome = answer;
    });
    await untilEveryPendingReadHasRun();

    expect(outcome).toEqual(failed("unreadable-answer", 200));
    expect(wasCancelled).toBe(true);
    expect(chunksProduced).toBeLessThanOrEqual(
      CHUNKS_THAT_PASS_THE_BOUND + CHUNKS_A_STREAM_READS_AHEAD,
    );
    expect(vi.getTimerCount()).toBe(0);
  });
});

/** A body that hands over `firstChunk` whole and then breaks. */
function breakingAfter(firstChunk: string): ReadableStream<Uint8Array> {
  let pulls = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      if (pulls === 1) controller.enqueue(bytesOf(firstChunk));
      else
        controller.error(new Error(`connection reset ${QUOTING_ERROR_BODY}`));
    },
  });
}

describe("a body that breaks while it is read", () => {
  it.each(OTHERWISE_ROWS)(
    "answers a %i by its row's otherwise, even when what arrived first was a whole deciding body",
    async (status, firstChunk, expected) => {
      const outcome = await outcomeFor(() =>
        answerOf(status, breakingAfter(firstChunk)),
      );

      expect(outcome).toEqual(expected);
      expectNoMarkerIn(outcome, DISCLOSURE_MARKERS);
    },
  );

  it.each(OTHERWISE_ROWS)(
    "answers a %i whose body is already locked by its row's otherwise",
    async (status, decidingBody, expected) => {
      const locked = streamOf(bytesOf(decidingBody));
      locked.getReader();

      const outcome = await outcomeFor(() => answerOf(status, locked));

      expect(outcome).toEqual(expected);
    },
  );

  it.each(OTHERWISE_ROWS)(
    "keeps the status of a %i whose body cannot even be asked for, and answers its row's otherwise",
    async (status, _decidingBody, expected) => {
      const outcome = await outcomeFor(
        () =>
          ({
            status,
            get body(): never {
              throw new Error(`no body ${QUOTING_ERROR_BODY}`);
            },
          }) as unknown as Response,
      );

      expect(outcome).toEqual(expected);
    },
  );
});

/** A body that hands over a whole deciding answer and then fails as its reader is let go. */
function failingAtRelease(text: string): ReadableStream<Uint8Array> {
  const reader = streamOf(bytesOf(text)).getReader();
  return {
    getReader: () => ({
      read: () => reader.read(),
      cancel: () => reader.cancel(),
      releaseLock: () => {
        throw new Error(`release failed ${QUOTING_ERROR_BODY}`);
      },
    }),
  } as unknown as ReadableStream<Uint8Array>;
}

describe("a response that arrived, whose body is no body", () => {
  const NO_BODIES: readonly [string, (text: string) => unknown][] = [
    ["no body at all", () => null],
    ["text where a stream should be", (text) => text],
    ["an object that is no stream", () => ({})],
    ["a body that fails as its reader is let go", failingAtRelease],
  ];

  describe.each(NO_BODIES)("%s", (_label, bodyOf) => {
    it.each(OTHERWISE_ROWS)(
      "keeps the status of a %i and answers its row's otherwise",
      async (status, decidingText, expected) => {
        const outcome = await outcomeFor(() =>
          answerOf(status, bodyOf(decidingText) as ReadableStream<Uint8Array>),
        );

        expect(outcome).toEqual(expected);
        expectNoMarkerIn(outcome, DISCLOSURE_MARKERS);
      },
    );
  });
});

describe("the ten-second bound, once the request has been answered", () => {
  const stalledBody = () =>
    new ReadableStream<Uint8Array>({
      pull: () => new Promise<void>(() => undefined),
    });

  async function settledFlagOf(pending: Promise<unknown>) {
    const flag = { isSettled: false };
    void pending.then(() => {
      flag.isSettled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    return flag;
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("runs from the send and not from the answer: headers at nine seconds, a body that never ends", async () => {
    const fetchSpy = stubFetch(
      () =>
        new Promise<Response>((resolve) => {
          setTimeout(() => {
            resolve(answerOf(200, stalledBody()));
          }, 9000);
        }),
    );

    const pending = send();
    const flag = await settledFlagOf(pending);
    await vi.advanceTimersByTimeAsync(MAIL_REQUEST_TIMEOUT_MS - 1);
    const wasSettledBeforeTheBound = flag.isSettled;
    await vi.advanceTimersByTimeAsync(1);

    expect(wasSettledBeforeTheBound).toBe(false);
    expect(await pending).toEqual({ ok: false, kind: "timed-out" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("answers timed out, not unreachable, when the abort makes the request itself reject", async () => {
    stubFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException(QUOTING_ERROR_BODY, "AbortError"));
          });
        }),
    );

    const pending = send();
    await vi.advanceTimersByTimeAsync(MAIL_REQUEST_TIMEOUT_MS);
    const outcome = await pending;

    expect(outcome).toEqual({ ok: false, kind: "timed-out" });
    expectNoMarkerIn(outcome, DISCLOSURE_MARKERS);
  });

  it("answers timed out, not an unreadable answer, when the abort breaks the body being read", async () => {
    stubFetch((_url, init) =>
      Promise.resolve(
        answerOf(
          200,
          new ReadableStream<Uint8Array>({
            start(controller) {
              init.signal?.addEventListener("abort", () => {
                controller.error(new DOMException("aborted", "AbortError"));
              });
            },
          }),
        ),
      ),
    );

    const pending = send();
    await vi.advanceTimersByTimeAsync(MAIL_REQUEST_TIMEOUT_MS);

    expect(await pending).toEqual({ ok: false, kind: "timed-out" });
  });

  it("keeps its answer and makes no second request when an acceptance arrives after the bound", async () => {
    const fetchSpy = stubFetch(
      () =>
        new Promise<Response>((resolve) => {
          setTimeout(() => {
            resolve(textAnswer(200, '{"id":"msg_late"}'));
          }, MAIL_REQUEST_TIMEOUT_MS + 1);
        }),
    );

    const pending = send();
    await vi.advanceTimersByTimeAsync(MAIL_REQUEST_TIMEOUT_MS);
    const outcome = await pending;
    await vi.advanceTimersByTimeAsync(60_000);

    expect(outcome).toEqual({ ok: false, kind: "timed-out" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ["a refusal", () => Promise.resolve(textAnswer(422, QUOTING_ERROR_BODY))],
    ["a rejection", () => Promise.reject(new TypeError("fetch failed"))],
    [
      "a body that breaks",
      () => Promise.resolve(answerOf(200, breakingAfter("{"))),
    ],
  ])(
    "leaves no timer behind and makes no second request after %s",
    async (_label, implementation) => {
      const fetchSpy = stubFetch(implementation);

      await send();
      const timersLeft = vi.getTimerCount();
      await vi.advanceTimersByTimeAsync(60_000);

      expect(timersLeft).toBe(0);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    },
  );
});

describe("what leaves the adapter on any branch, and what it writes", () => {
  const quotingRejection = () =>
    Promise.reject(
      Object.assign(new TypeError(`fetch failed ${QUOTING_ERROR_BODY}`), {
        cause: new Error(QUOTING_ERROR_BODY),
      }),
    );

  const BRANCHES: readonly [string, () => Promise<Response>][] = [
    ["an acceptance", () => Promise.resolve(textAnswer(200, '{"id":"msg_1"}'))],
    [
      "a 2xx quoting them",
      () => Promise.resolve(textAnswer(200, QUOTING_ERROR_BODY)),
    ],
    [
      "a redirect quoting them",
      () => Promise.resolve(textAnswer(307, QUOTING_ERROR_BODY)),
    ],
    [
      "a conflict quoting them",
      () => Promise.resolve(textAnswer(409, QUOTING_ERROR_BODY)),
    ],
    [
      "a 429 quoting them",
      () => Promise.resolve(textAnswer(429, QUOTING_ERROR_BODY)),
    ],
    [
      "a refusal quoting them",
      () => Promise.resolve(textAnswer(422, QUOTING_ERROR_BODY)),
    ],
    [
      "a server error quoting them",
      () => Promise.resolve(textAnswer(502, QUOTING_ERROR_BODY)),
    ],
    [
      "a body past the bound quoting them",
      () =>
        Promise.resolve(
          textAnswer(409, QUOTING_ERROR_BODY.repeat(ANSWER_BOUND_BYTES / 64)),
        ),
    ],
    [
      "a body that breaks quoting them",
      () => Promise.resolve(answerOf(429, breakingAfter(QUOTING_ERROR_BODY))),
    ],
    ["a rejection whose message and cause quote them", quotingRejection],
    [
      "a thrown value that is not an error",
      () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- the case under test
        throw { message: QUOTING_ERROR_BODY, key: QA_CONFIGURATION.apiKey };
      },
    ],
  ];

  it.each(BRANCHES)(
    "returns three members at most, none holding the key, the sender, the inbox or the customer, for %s",
    async (_label, implementation) => {
      const consoleSpies = silenceEveryConsoleMethod();
      stubFetch(implementation);

      const outcome = await send();

      expect(
        Reflect.ownKeys(outcome).filter(
          (key) => !["ok", "kind", "status"].includes(String(key)),
        ),
      ).toEqual([]);
      expect(Object.getPrototypeOf(outcome)).toBe(Object.prototype);
      expectNoMarkerIn(outcome, DISCLOSURE_MARKERS);
      expect(consoleCallsOf(consoleSpies)).toEqual([]);
    },
  );

  it("writes nothing and returns no marker when the bound passes on a request that rejects with them", async () => {
    vi.useFakeTimers();
    const consoleSpies = silenceEveryConsoleMethod();
    stubFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new Error(QUOTING_ERROR_BODY));
          });
        }),
    );

    const pending = send();
    await vi.advanceTimersByTimeAsync(MAIL_REQUEST_TIMEOUT_MS);
    const outcome = await pending;

    expectNoMarkerIn(outcome, DISCLOSURE_MARKERS);
    expect(consoleCallsOf(consoleSpies)).toEqual([]);
  });
});
