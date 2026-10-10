import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CONTACT_EVERY_BY_BLOCK_POLICY,
  CONTACT_EVERY_PER_BLOCK_HOUR_FIGURE,
  CONTACT_NEW_BY_ADDRESS_POLICY,
  CONTACT_NEW_BY_BLOCK_DAY_POLICY,
  CONTACT_NEW_BY_BLOCK_HOUR_POLICY,
  CONTACT_NEW_BY_VISITOR_POLICY,
  CONTACT_NEW_PER_ADDRESS_DAY_FIGURE,
  CONTACT_NEW_PER_BLOCK_DAY_FIGURE,
  CONTACT_NEW_PER_BLOCK_HOUR_FIGURE,
  CONTACT_NEW_PER_VISITOR_HOUR_FIGURE,
  CONTACT_TRIES_BY_REQUEST_POLICY,
  CONTACT_TRIES_PER_REQUEST_HOUR_FIGURE,
  E2E_RATE_LIMIT_POLICY_FLAG,
  type LimitPolicy,
} from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { utcWindowOf } from "@/lib/server/rate-limit/utc-window";

import { readSource } from "../server-source-support";

const FAKE_SECRET =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const VISITOR_HASH = "ab".repeat(32);
const ADDRESS = "ana@example.com";
const REQUEST_ID = "0123456789abcdef";
const OVER_EVERY_FIGURE = 1_000_000;

const NOON = new Date("2026-07-15T12:20:00Z");
const SECONDS_TO_THE_HOURS_END = 40 * 60;
const SECONDS_TO_THE_DAYS_END = (11 * 60 + 40) * 60;
const FROM_192_0_2 = new Headers({ "x-forwarded-for": "192.0.2.77" });
const HOUR_MS = 3_600_000;

const USUAL_ENVIRONMENT = {
  DIGEST_SECRET: FAKE_SECRET,
  [CLIENT_NETWORK_SOURCE_VARIABLE]: "vercel",
};

/** The judge's module and the store it counts in, from a graph of their own: a refusal is written once for a process,
 *  so a test that reads what was written must start with a process that wrote none. */
async function freshJudge() {
  vi.resetModules();
  const { makeContactJudge } = await import(
    "@/lib/server/contact/judge-contact-request"
  );
  const { getRateLimitStore } = await import(
    "@/lib/server/rate-limit/rate-limit-store-instance"
  );
  const store = getRateLimitStore();
  return {
    makeContactJudge,
    recorded: vi.spyOn(store, "recordHits"),
    warn: vi.spyOn(console, "warn").mockImplementation(() => undefined),
    error: vi.spyOn(console, "error").mockImplementation(() => undefined),
  };
}

type Judge = Awaited<ReturnType<typeof freshJudge>>;

function judgeOf(
  { makeContactJudge }: Judge,
  {
    environment = USUAL_ENVIRONMENT,
    headers = FROM_192_0_2,
    instant = NOON,
  }: {
    environment?: Record<string, string | undefined>;
    headers?: Headers;
    instant?: Date;
  } = {},
) {
  return makeContactJudge({ environment, headers, instant });
}

function headersOfBlock(blockNumber: number): Headers {
  return new Headers({
    "x-forwarded-for": [1 + (blockNumber >> 8), blockNumber & 255, 1, 9].join(
      ".",
    ),
  });
}

/** The keys of the buckets counted, in order. */
function keysCounted(judge: Judge): (string | undefined)[] {
  return judge.recorded.mock.calls.map(([buckets]) => buckets[0]?.key);
}

function policyWritten(judge: Judge): unknown[] {
  return judge.warn.mock.calls.map(
    ([, line]) => (line as { policy?: string }).policy,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(NOON);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("every request: the network's bucket", () => {
  it("allows the figure and refuses the next with the one limit answer, and tells the hour's end", async () => {
    const judge = await freshJudge();
    const answers = [];
    for (
      let request = 0;
      request <= CONTACT_EVERY_PER_BLOCK_HOUR_FIGURE;
      request += 1
    ) {
      answers.push(await judgeOf(judge).everyRequest());
    }

    expect(
      answers
        .slice(0, CONTACT_EVERY_PER_BLOCK_HOUR_FIGURE)
        .every((answer) => answer === undefined),
    ).toBe(true);
    const refused = answers[CONTACT_EVERY_PER_BLOCK_HOUR_FIGURE];
    expect(refused?.status).toBe(429);
    expect(refused?.headers.get("Retry-After")).toBe(
      String(SECONDS_TO_THE_HOURS_END),
    );
    expect(await refused?.json()).toEqual({
      error: "The limit on contact requests is reached for now.",
      code: "CONTACT_LIMIT_REACHED",
    });
  });

  it("counts one bucket for the request, in the hour's window, under a key of its own", async () => {
    const judge = await freshJudge();

    await judgeOf(judge).everyRequest();

    expect(judge.recorded).toHaveBeenCalledTimes(1);
    expect(judge.recorded.mock.calls[0]?.[0][0]?.window).toEqual(
      utcWindowOf(NOON, 60),
    );
  });

  it("counts two networks apart", async () => {
    const judge = await freshJudge();

    await judgeOf(judge, { headers: headersOfBlock(1) }).everyRequest();
    await judgeOf(judge, { headers: headersOfBlock(2) }).everyRequest();

    expect(new Set(keysCounted(judge)).size).toBe(2);
  });
});

describe("a try of a stored request: its id, through its constructor", () => {
  it("allows the figure and refuses the next, the same for a request and no other", async () => {
    const judge = await freshJudge();
    const answers = [];
    for (
      let attempt = 0;
      attempt <= CONTACT_TRIES_PER_REQUEST_HOUR_FIGURE;
      attempt += 1
    ) {
      answers.push(await judgeOf(judge).triesOfStoredRequest(REQUEST_ID));
    }

    expect(
      answers
        .slice(0, CONTACT_TRIES_PER_REQUEST_HOUR_FIGURE)
        .every((answer) => answer === undefined),
    ).toBe(true);
    expect(answers[CONTACT_TRIES_PER_REQUEST_HOUR_FIGURE]?.status).toBe(429);
    expect(
      await judgeOf(judge).triesOfStoredRequest("fedcba9876543210"),
    ).toBeUndefined();
  });

  it("counts the one bucket, and is no bucket of the network's or a new request's", async () => {
    const judge = await freshJudge();

    await judgeOf(judge).triesOfStoredRequest(REQUEST_ID);
    await judgeOf(judge).everyRequest();

    expect(judge.recorded).toHaveBeenCalledTimes(2);
    expect(new Set(keysCounted(judge)).size).toBe(2);
  });

  it.each([
    "",
    "short",
    "has a space in it 0000",
    `${REQUEST_ID}%`,
    "a".repeat(65),
  ])(
    "answers unavailable for an id that is not a request id's shape, %j, and counts nothing",
    async (badId) => {
      const judge = await freshJudge();

      const answer = await judgeOf(judge).triesOfStoredRequest(badId);

      expect(answer?.status).toBe(503);
      expect(judge.recorded).not.toHaveBeenCalled();
    },
  );

  it("tells the seconds to the hour's end, within the hour's own window", async () => {
    const judge = await freshJudge();
    for (
      let attempt = 0;
      attempt < CONTACT_TRIES_PER_REQUEST_HOUR_FIGURE;
      attempt += 1
    ) {
      await judgeOf(judge).triesOfStoredRequest(REQUEST_ID);
    }

    const refused = await judgeOf(judge).triesOfStoredRequest(REQUEST_ID);

    expect(refused?.headers.get("Retry-After")).toBe(
      String(SECONDS_TO_THE_HOURS_END),
    );
  });
});

describe("a new request: the steps in their order, each asked only when the one before allowed", () => {
  const EVERY_SUBJECT = { visitorHash: VISITOR_HASH, countedAddress: ADDRESS };
  const STEPS: readonly [string, LimitPolicy][] = [
    ["the network's hour", CONTACT_NEW_BY_BLOCK_HOUR_POLICY],
    ["the network's day", CONTACT_NEW_BY_BLOCK_DAY_POLICY],
    ["the browser's hour", CONTACT_NEW_BY_VISITOR_POLICY],
    ["the address's day", CONTACT_NEW_BY_ADDRESS_POLICY],
  ];

  it.each(
    STEPS.map(([label, policy], index) => [label, policy, index] as const),
  )(
    "counts %s and those before it and none after, when it refuses, and names its policy in the one line",
    async (_label, policy, index) => {
      const judge = await freshJudge();
      for (let counted = 0; counted < index; counted += 1)
        judge.recorded.mockResolvedValueOnce([1]);
      judge.recorded.mockResolvedValueOnce([OVER_EVERY_FIGURE]);

      const answer = await judgeOf(judge).newRequest(EVERY_SUBJECT);

      expect(answer?.status).toBe(429);
      expect(judge.recorded).toHaveBeenCalledTimes(index + 1);
      expect(new Set(keysCounted(judge)).size).toBe(index + 1);
      expect(policyWritten(judge)).toEqual([policy.name]);
    },
  );

  it("counts the four in order for a request that is allowed, each in a bucket of its own", async () => {
    const judge = await freshJudge();

    const answer = await judgeOf(judge).newRequest(EVERY_SUBJECT);

    expect(answer).toBeUndefined();
    expect(judge.recorded).toHaveBeenCalledTimes(4);
    expect(new Set(keysCounted(judge)).size).toBe(4);
    const windows = judge.recorded.mock.calls.map(
      ([buckets]) => buckets[0]?.window,
    );
    expect(windows[0]).toEqual(utcWindowOf(NOON, 60));
    expect(windows[1]).toEqual(utcWindowOf(NOON, 1440));
    expect(windows[2]).toEqual(utcWindowOf(NOON, 60));
    expect(windows[3]).toEqual(utcWindowOf(NOON, 1440));
  });

  it("takes one instant for every step, so an hour's turn between two statements tells one wait", async () => {
    const judge = await freshJudge();
    judge.recorded.mockImplementationOnce(() => {
      vi.setSystemTime(new Date(NOON.getTime() + HOUR_MS));
      return Promise.resolve([1]);
    });

    await judgeOf(judge).newRequest(EVERY_SUBJECT);

    const hours = judge.recorded.mock.calls
      .map(([buckets]) => buckets[0]?.window)
      .filter(
        (window) =>
          window?.endsAt.getTime() === utcWindowOf(NOON, 60).endsAt.getTime(),
      );
    expect(hours).toHaveLength(2);
  });

  it.each([
    ["no subject", {}, 2],
    ["a visitor's hash alone", { visitorHash: VISITOR_HASH }, 3],
    ["an address alone", { countedAddress: ADDRESS }, 3],
    ["both", EVERY_SUBJECT, 4],
  ])(
    "asks the steps it has a subject for and no more, for %s, and a skipped step is not unavailable",
    async (_label, subjects, asked) => {
      const judge = await freshJudge();

      const answer = await judgeOf(judge).newRequest(subjects);

      expect(answer).toBeUndefined();
      expect(judge.recorded).toHaveBeenCalledTimes(asked);
      expect(judge.error).not.toHaveBeenCalled();
    },
  );

  it("writes no row for a skipped step: with no hash handed, no browser's bucket is counted", async () => {
    const judge = await freshJudge();
    const withVisitor = await freshJudge();

    await judgeOf(judge).newRequest({ countedAddress: ADDRESS });
    await judgeOf(withVisitor).newRequest(EVERY_SUBJECT);

    const visitorKey = keysCounted(withVisitor)[2];
    expect(keysCounted(judge)).not.toContain(visitorKey);
  });

  it("treats an undefined subject as none, as a route that read no cookie hands it", async () => {
    const judge = await freshJudge();

    const answer = await judgeOf(judge).newRequest({
      visitorHash: undefined,
      countedAddress: undefined,
    });

    expect(answer).toBeUndefined();
    expect(judge.recorded).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["a visitor's value that is no hash", { visitorHash: "a-visitor-value" }],
    ["a hash in upper case", { visitorHash: VISITOR_HASH.toUpperCase() }],
    [
      "an address with a capital, which is not the counted form",
      { countedAddress: "Ana@Example.com" },
    ],
    ["text that is no address", { countedAddress: "not an address" }],
    ["an empty hash", { visitorHash: "" }],
  ])(
    "answers unavailable for %s, after the network's two, and counts nothing for the text",
    async (_label, subjects) => {
      const judge = await freshJudge();

      const answer = await judgeOf(judge).newRequest(subjects);

      expect(answer?.status).toBe(503);
      expect(judge.recorded).toHaveBeenCalledTimes(2);
    },
  );

  it("holds no text the caller chose in any key, which is a digest", async () => {
    const judge = await freshJudge();

    await judgeOf(judge).newRequest(EVERY_SUBJECT);

    const keys = keysCounted(judge).join(" ");
    for (const text of [VISITOR_HASH, ADDRESS, "192.0.2"])
      expect(keys).not.toContain(text);
    expect(
      keysCounted(judge).every((key) => /^[0-9a-f]{64}$/.test(key ?? "")),
    ).toBe(true);
  });
});

describe("a new request at each real figure", () => {
  it("refuses the network's fourth in the hour, at the hour's step", async () => {
    const judge = await freshJudge();
    for (
      let request = 0;
      request < CONTACT_NEW_PER_BLOCK_HOUR_FIGURE;
      request += 1
    ) {
      expect(await judgeOf(judge).newRequest({})).toBeUndefined();
    }

    const refused = await judgeOf(judge).newRequest({});

    expect(refused?.status).toBe(429);
    expect(policyWritten(judge)).toEqual([
      CONTACT_NEW_BY_BLOCK_HOUR_POLICY.name,
    ]);
  });

  it("refuses the network's eleventh in the day, at the day's step, across hours", async () => {
    const judge = await freshJudge();
    const askedAt = (hour: number) =>
      judgeOf(judge, {
        instant: new Date(Date.UTC(2026, 6, 15, hour, 20)),
      }).newRequest({});
    for (
      let request = 0;
      request < CONTACT_NEW_PER_BLOCK_DAY_FIGURE;
      request += 1
    ) {
      expect(
        await askedAt(Math.floor(request / CONTACT_NEW_PER_BLOCK_HOUR_FIGURE)),
      ).toBeUndefined();
    }

    const refused = await askedAt(3);

    expect(refused?.status).toBe(429);
    expect(refused?.headers.get("Retry-After")).toBe(
      String((20 * 60 + 40) * 60),
    );
    expect(policyWritten(judge)).toEqual([
      CONTACT_NEW_BY_BLOCK_DAY_POLICY.name,
    ]);
  });

  it("refuses a browser's third in the hour from any network, at the browser's step", async () => {
    const judge = await freshJudge();
    for (
      let request = 0;
      request < CONTACT_NEW_PER_VISITOR_HOUR_FIGURE;
      request += 1
    ) {
      expect(
        await judgeOf(judge, { headers: headersOfBlock(request) }).newRequest({
          visitorHash: VISITOR_HASH,
        }),
      ).toBeUndefined();
    }

    const refused = await judgeOf(judge, {
      headers: headersOfBlock(9),
    }).newRequest({ visitorHash: VISITOR_HASH });

    expect(refused?.status).toBe(429);
    expect(policyWritten(judge)).toEqual([CONTACT_NEW_BY_VISITOR_POLICY.name]);
  });

  it("refuses an address's fourth in the day from any network and browser, at the address's step", async () => {
    const judge = await freshJudge();
    for (
      let request = 0;
      request < CONTACT_NEW_PER_ADDRESS_DAY_FIGURE;
      request += 1
    ) {
      expect(
        await judgeOf(judge, { headers: headersOfBlock(request) }).newRequest({
          visitorHash: String(request).padStart(64, "0"),
          countedAddress: ADDRESS,
        }),
      ).toBeUndefined();
    }

    const refused = await judgeOf(judge, {
      headers: headersOfBlock(9),
    }).newRequest({
      visitorHash: "9".padStart(64, "0"),
      countedAddress: ADDRESS,
    });

    expect(refused?.status).toBe(429);
    expect(policyWritten(judge)).toEqual([CONTACT_NEW_BY_ADDRESS_POLICY.name]);
  });

  it("tells a wait to the end of the longest window of the judgement: the UTC day's, from the day's step", async () => {
    const judge = await freshJudge();
    judge.recorded
      .mockResolvedValueOnce([1])
      .mockResolvedValueOnce([OVER_EVERY_FIGURE]);

    const refused = await judgeOf(judge).newRequest({});

    expect(refused?.headers.get("Retry-After")).toBe(
      String(SECONDS_TO_THE_DAYS_END),
    );
  });
});

describe("every limit refusal is one answer, whichever step ended it", () => {
  async function refusalOfEachStep() {
    const answers: Response[] = [];
    const judge = await freshJudge();
    const refuseAt = async (
      index: number,
      ask: () => Promise<Response | undefined>,
    ) => {
      judge.recorded.mockReset();
      for (let counted = 0; counted < index; counted += 1)
        judge.recorded.mockResolvedValueOnce([1]);
      judge.recorded.mockResolvedValueOnce([OVER_EVERY_FIGURE]);
      const answer = await ask();
      if (answer !== undefined) answers.push(answer);
    };
    const every = judgeOf(judge);
    await refuseAt(0, () => every.everyRequest());
    await refuseAt(0, () => every.triesOfStoredRequest(REQUEST_ID));
    for (let step = 0; step < 4; step += 1) {
      await refuseAt(step, () =>
        every.newRequest({
          visitorHash: VISITOR_HASH,
          countedAddress: ADDRESS,
        }),
      );
    }
    return answers;
  }

  it("is one status, one code and one body for each of the six steps over the three judgements", async () => {
    const answers = await refusalOfEachStep();

    expect(answers).toHaveLength(6);
    const bodies = await Promise.all(
      answers.map((answer) => answer.clone().text()),
    );
    expect(new Set(bodies).size).toBe(1);
    expect(new Set(answers.map((answer) => answer.status))).toEqual(
      new Set([429]),
    );
    expect(JSON.parse(bodies[0] ?? "{}")).toEqual({
      error: "The limit on contact requests is reached for now.",
      code: "CONTACT_LIMIT_REACHED",
    });
  });

  it("differs in no header but the wait", async () => {
    const answers = await refusalOfEachStep();

    const withoutTheWait = answers.map((answer) =>
      JSON.stringify(
        [...answer.headers].filter(([name]) => name !== "retry-after"),
      ),
    );
    expect(new Set(withoutTheWait).size).toBe(1);
  });

  it("sets no cookie", async () => {
    const answers = await refusalOfEachStep();

    expect(answers.every((answer) => !answer.headers.has("Set-Cookie"))).toBe(
      true,
    );
  });
});

describe("every unavailable is byte-equal, whichever cause", () => {
  type Cause = [
    string,
    () => Promise<{ answer: Response | undefined; judge: Judge }>,
  ];

  function newRequestAs(environment: Record<string, string | undefined>) {
    return async () => {
      const judge = await freshJudge();
      return {
        judge,
        answer: await judgeOf(judge, { environment }).newRequest({}),
      };
    };
  }

  const CAUSES: readonly Cause[] = [
    [
      "an unusable secret",
      newRequestAs({ ...USUAL_ENVIRONMENT, DIGEST_SECRET: "short" }),
    ],
    [
      "a source that is misconfigured",
      newRequestAs({
        ...USUAL_ENVIRONMENT,
        [CLIENT_NETWORK_SOURCE_VARIABLE]: "other",
      }),
    ],
    [
      "a flag beside a source",
      newRequestAs({ ...USUAL_ENVIRONMENT, [E2E_RATE_LIMIT_POLICY_FLAG]: "1" }),
    ],
    [
      "a store that fails",
      async () => {
        const judge = await freshJudge();
        judge.recorded.mockRejectedValue(new Error("down"));
        return { judge, answer: await judgeOf(judge).newRequest({}) };
      },
    ],
    [
      "a text a constructor refuses",
      async () => {
        const judge = await freshJudge();
        return {
          judge,
          answer: await judgeOf(judge).newRequest({ visitorHash: "nope" }),
        };
      },
    ],
    [
      "a store that never answers",
      async () => {
        const judge = await freshJudge();
        judge.recorded.mockReturnValue(
          new Promise<readonly number[]>(() => undefined),
        );
        const pending = judgeOf(judge).newRequest({});
        await vi.advanceTimersByTimeAsync(3000);
        return { judge, answer: await pending };
      },
    ],
  ];

  it("is the same bytes for every cause, with no Retry-After and no cookie", async () => {
    const answers: Response[] = [];
    for (const [, make] of CAUSES) {
      const { answer } = await make();
      if (answer !== undefined) answers.push(answer);
    }

    expect(answers).toHaveLength(CAUSES.length);
    const wire = await Promise.all(
      answers.map(async (answer) =>
        JSON.stringify([
          answer.status,
          [...answer.headers],
          await answer.clone().text(),
        ]),
      ),
    );
    expect(new Set(wire).size).toBe(1);
    expect(answers[0]?.status).toBe(503);
    expect(answers[0]?.headers.has("Retry-After")).toBe(false);
    expect(await answers[0]?.json()).toEqual({
      error: "A contact request cannot be taken right now.",
      code: "CONTACT_UNAVAILABLE",
    });
  });

  it("is the same bytes from each of the three judgements", async () => {
    const judge = await freshJudge();
    const bad = judgeOf(judge, {
      environment: { ...USUAL_ENVIRONMENT, DIGEST_SECRET: "short" },
    });

    const answers = [
      await bad.everyRequest(),
      await bad.triesOfStoredRequest(REQUEST_ID),
      await bad.newRequest({}),
    ];

    const bodies = await Promise.all(answers.map((answer) => answer?.text()));
    expect(new Set(bodies).size).toBe(1);
    expect(answers.every((answer) => answer?.status === 503)).toBe(true);
  });

  it("writes a line each time, with the cause it was, and nothing that tells the answer apart", async () => {
    const { judge } = await newRequestAs({
      ...USUAL_ENVIRONMENT,
      DIGEST_SECRET: "short",
    })();
    const again = judgeOf(judge, {
      environment: { ...USUAL_ENVIRONMENT, DIGEST_SECRET: "short" },
    });
    await again.newRequest({});
    await again.everyRequest();

    expect(judge.error.mock.calls.map(([, line]) => line as unknown)).toEqual(
      Array.from({ length: 3 }, () => ({
        event: "contact-request-unavailable",
        refusalCode: "CONTACT_UNAVAILABLE",
        status: 503,
        cause: "digester-unusable",
      })),
    );
  });
});

describe("a flood of one refusal writes one line", () => {
  it("writes one line for a hundred refusals of one step, and the line holds a policy's name alone", async () => {
    const judge = await freshJudge();
    judge.recorded.mockResolvedValue([OVER_EVERY_FIGURE]);

    for (let request = 0; request < 100; request += 1) {
      await judgeOf(judge).everyRequest();
    }

    expect(judge.warn.mock.calls).toEqual([
      [
        "[contact]",
        {
          event: "contact-request-refused",
          refusalCode: "CONTACT_LIMIT_REACHED",
          status: 429,
          policy: CONTACT_EVERY_BY_BLOCK_POLICY.name,
        },
      ],
    ]);
  });

  it("writes one line for each policy that refused, and none for the subjects' own text", async () => {
    const judge = await freshJudge();
    judge.recorded.mockResolvedValue([OVER_EVERY_FIGURE]);

    for (let request = 0; request < 20; request += 1) {
      await judgeOf(judge).everyRequest();
      await judgeOf(judge).triesOfStoredRequest(REQUEST_ID);
      await judgeOf(judge).newRequest({
        visitorHash: VISITOR_HASH,
        countedAddress: ADDRESS,
      });
    }

    expect(policyWritten(judge)).toEqual([
      CONTACT_EVERY_BY_BLOCK_POLICY.name,
      CONTACT_TRIES_BY_REQUEST_POLICY.name,
      CONTACT_NEW_BY_BLOCK_HOUR_POLICY.name,
    ]);
    const everything = JSON.stringify(judge.warn.mock.calls);
    for (const text of [VISITOR_HASH, ADDRESS, REQUEST_ID, "192.0.2"]) {
      expect(everything).not.toContain(text);
    }
  });
});

describe("judge-contact-request.ts", () => {
  const source = readSource("lib/server/contact/judge-contact-request.ts");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("reads source: reads nothing from the process or the clock, and holds no state", () => {
    expect(code).not.toMatch(/process\.env|new Date\(|Date\.now|setTimeout/);
    expect(code.match(/^(?:let|var)\s/gm)).toBeNull();
  });

  it("reads source: names no figure, no store, no route, no orchestration and no mail", () => {
    expect(code).not.toMatch(/\b\d+\b/);
    expect(source).not.toMatch(
      /ContactSubmissionStore|contact-submission-store-instance|app\/api|submit-contact|lib\/server\/mail/,
    );
  });

  it("reads source: makes a subject only through a constructor, and sets no cookie", () => {
    expect(code).not.toMatch(/as BucketSubject|kind:\s*"visitor"|cookies?\b/i);
    expect(code.match(/subjectOf\w+\(/g)?.sort()).toEqual([
      "subjectOfAddress(",
      "subjectOfStoredRequest(",
      "subjectOfVisitorHash(",
    ]);
  });
});
