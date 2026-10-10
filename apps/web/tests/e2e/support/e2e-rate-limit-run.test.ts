import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readDigester } from "@/lib/server/digest/digest-secret";
import {
  E2E_MINT_POLICY_NAME,
  E2E_SHARE_WRITE_POLICY,
  MINT_POLICY_NAME,
  SAVE_BY_CREDENTIAL_POLICY,
} from "@/lib/server/rate-limit/limit-policy";

import { readTestSource } from "../../lib/server/server-source-support";

interface RemovedCounters {
  rowsRemoved: number;
  counts: number[];
}

const deletion = vi.hoisted(() => ({
  handed: [] as (readonly string[])[],
  answer: { rowsRemoved: 1, counts: [3] } as RemovedCounters,
  /** When set, what a call is answered from its keys, so a test can give each policy's rows a count of their own. */
  answerFor: undefined as
    | ((keys: readonly string[]) => RemovedCounters)
    | undefined,
}));

vi.mock("@lemnaria/persistence", () => ({
  deleteRateLimitCountersForTests: (keys: readonly string[]) => {
    deletion.handed.push(keys);
    return Promise.resolve(deletion.answerFor?.(keys) ?? deletion.answer);
  },
}));

const {
  bucketKeyOfCredential,
  CONTACT_EVERY_REQUEST_TWIN,
  CONTACT_NEW_REQUEST_DAY_TWIN,
  CONTACT_NEW_REQUEST_HOUR_TWIN,
  bucketKeyOfTheRun,
  E2eFigureOutgrownError,
  makeRunSecret,
  MINT_TWIN,
  NoCountersOfTheRunError,
  removeCountersOf,
  removeCountersOfTheRun,
  removeCredentialCountersOf,
  requireRoomUnderHalfTheFigure,
  RUN_SECRET_VARIABLE,
  SAVE_TWIN,
  SHARE_WRITE_TWIN,
  secretOfThisRun,
} = await import("./e2e-rate-limit-run");

const FAKE_SECRET =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const MADE_IN_THIS_PROCESS = Symbol.for("lemnaria.e2e.run-secret");

beforeEach(() => {
  deletion.handed.length = 0;
  deletion.answer = { rowsRemoved: 1, counts: [3] };
  deletion.answerFor = undefined;
  Reflect.deleteProperty(globalThis, MADE_IN_THIS_PROCESS);
});

afterEach(() => {
  vi.unstubAllEnvs();
  Reflect.deleteProperty(globalThis, MADE_IN_THIS_PROCESS);
});

describe("the run's secret", () => {
  it("is thirty-two random bytes as sixty-four lowercase hexadecimal characters, and another each time", () => {
    const first = makeRunSecret();
    const second = makeRunSecret();

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toMatch(/^[0-9a-f]{64}$/);
    expect(second).not.toBe(first);
  });

  it("is made once in the main process, handed down in its environment, and the same on a second reading", () => {
    vi.stubEnv("TEST_WORKER_INDEX", undefined);

    const first = secretOfThisRun();
    const second = secretOfThisRun();

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toBe(first);
    expect(process.env[RUN_SECRET_VARIABLE]).toBe(first);
  });

  it("is never made again by a worker, which inherits what the main process made", () => {
    vi.stubEnv("TEST_WORKER_INDEX", "3");
    vi.stubEnv(RUN_SECRET_VARIABLE, FAKE_SECRET);

    expect(secretOfThisRun()).toBe(FAKE_SECRET);
  });

  it("is refused by a worker that inherited nothing", () => {
    vi.stubEnv("TEST_WORKER_INDEX", "3");
    vi.stubEnv(RUN_SECRET_VARIABLE, undefined);

    expect(() => secretOfThisRun()).toThrow(/found no LEMNARIA_E2E_RUN_SECRET/);
  });

  it("is refused by a worker that inherited an empty value", () => {
    vi.stubEnv("TEST_WORKER_INDEX", "3");
    vi.stubEnv(RUN_SECRET_VARIABLE, "");

    expect(() => secretOfThisRun()).toThrow(/found no LEMNARIA_E2E_RUN_SECRET/);
  });
});

describe("the key the run's rows are removed by", () => {
  it("is the key the server counts under: the same digest, from the bytes, for the e2e policy's shared bucket", () => {
    const digester = readDigester({ DIGEST_SECRET: FAKE_SECRET });
    if (digester.status !== "usable") throw new Error("expected a digester");
    const serverKey = digester.digest({
      purpose: "rate-limit-bucket",
      fields: {
        policyName: E2E_MINT_POLICY_NAME,
        subjectKind: "shared",
        subject: "",
      },
    });

    expect(bucketKeyOfTheRun(FAKE_SECRET, E2E_MINT_POLICY_NAME)).toBe(
      serverKey,
    );
  });

  it("differs by policy and by secret, so the suite's rows and the second server's never share a key", () => {
    const other = "ff".repeat(32);

    expect(bucketKeyOfTheRun(FAKE_SECRET, MINT_POLICY_NAME)).not.toBe(
      bucketKeyOfTheRun(FAKE_SECRET, E2E_MINT_POLICY_NAME),
    );
    expect(bucketKeyOfTheRun(other, E2E_MINT_POLICY_NAME)).not.toBe(
      bucketKeyOfTheRun(FAKE_SECRET, E2E_MINT_POLICY_NAME),
    );
  });
});

describe("the key a save's write credential is counted under", () => {
  const HASH = "ab".repeat(32);

  it("is the key the server counts under: the same digest, for the credential's policy and the hash", () => {
    const digester = readDigester({ DIGEST_SECRET: FAKE_SECRET });
    if (digester.status !== "usable") throw new Error("expected a digester");
    const serverKey = digester.digest({
      purpose: "rate-limit-bucket",
      fields: {
        policyName: SAVE_BY_CREDENTIAL_POLICY.name,
        subjectKind: "write-credential",
        subject: HASH,
      },
    });

    expect(bucketKeyOfCredential(FAKE_SECRET, HASH)).toBe(serverKey);
  });

  it("differs by hash, by secret and from the block's key for the same text", () => {
    expect(bucketKeyOfCredential(FAKE_SECRET, "cd".repeat(32))).not.toBe(
      bucketKeyOfCredential(FAKE_SECRET, HASH),
    );
    expect(bucketKeyOfCredential("ff".repeat(32), HASH)).not.toBe(
      bucketKeyOfCredential(FAKE_SECRET, HASH),
    );
    expect(bucketKeyOfCredential(FAKE_SECRET, HASH)).not.toBe(
      bucketKeyOfTheRun(FAKE_SECRET, SAVE_TWIN.policy.name),
    );
  });

  it("is handed to the helper once for each hash, and nothing else, and its rows are summed", async () => {
    deletion.answer = { rowsRemoved: 2, counts: [5, 7] };

    const removed = await removeCredentialCountersOf(FAKE_SECRET, [
      HASH,
      "cd".repeat(32),
    ]);

    expect(deletion.handed).toEqual([
      [
        bucketKeyOfCredential(FAKE_SECRET, HASH),
        bucketKeyOfCredential(FAKE_SECRET, "cd".repeat(32)),
      ],
    ]);
    expect(removed).toEqual({ rowsRemoved: 2, hitsCounted: 12 });
  });

  it("asks nothing of a design nobody saved, and does not fail for it", async () => {
    deletion.answer = { rowsRemoved: 0, counts: [] };

    expect(await removeCredentialCountersOf(FAKE_SECRET, [HASH])).toEqual({
      rowsRemoved: 0,
      hitsCounted: 0,
    });
  });
});

describe("removeCountersOfTheRun", () => {
  it("hands the helper exactly the one key and answers the mints the rows counted, summed over windows", async () => {
    deletion.answer = { rowsRemoved: 2, counts: [3, 4] };

    const counted = await removeCountersOfTheRun(
      FAKE_SECRET,
      E2E_MINT_POLICY_NAME,
    );

    expect(deletion.handed).toEqual([
      [bucketKeyOfTheRun(FAKE_SECRET, E2E_MINT_POLICY_NAME)],
    ]);
    expect(counted).toEqual({ rowsRemoved: 2, mintsCounted: 7 });
  });

  it("fails when no row is found, rather than reporting nothing", async () => {
    deletion.answer = { rowsRemoved: 0, counts: [] };

    await expect(
      removeCountersOfTheRun(FAKE_SECRET, E2E_MINT_POLICY_NAME),
    ).rejects.toBeInstanceOf(NoCountersOfTheRunError);
  });
});

describe("removeCountersOf", () => {
  it("hands the helper exactly the one key of the policy and sums the hits over the windows", async () => {
    deletion.answer = { rowsRemoved: 2, counts: [30, 12] };

    const counted = await removeCountersOf(
      FAKE_SECRET,
      E2E_SHARE_WRITE_POLICY.name,
    );

    expect(deletion.handed).toEqual([
      [bucketKeyOfTheRun(FAKE_SECRET, E2E_SHARE_WRITE_POLICY.name)],
    ]);
    expect(counted).toEqual({ rowsRemoved: 2, hitsCounted: 42 });
  });

  it("is the key the mint's rows are not under, so each is removed by its own", () => {
    expect(
      bucketKeyOfTheRun(FAKE_SECRET, E2E_SHARE_WRITE_POLICY.name),
    ).not.toBe(bucketKeyOfTheRun(FAKE_SECRET, E2E_MINT_POLICY_NAME));
  });

  it("answers none for a run that made none, and does not fail it", async () => {
    deletion.answer = { rowsRemoved: 0, counts: [] };

    expect(
      await removeCountersOf(FAKE_SECRET, E2E_SHARE_WRITE_POLICY.name),
    ).toEqual({ rowsRemoved: 0, hitsCounted: 0 });
  });
});

/** Each twin, with the half of its figure, a count over it, and the sentence that count draws, word for word. */
const TWINS = [
  {
    twin: MINT_TWIN,
    half: 800,
    over: 900,
    constant: "E2E_MINT_DAILY_FIGURE",
    sentence:
      "This run minted 900 designs, more than half (800) of the e2e policy's 1600 a day: raise E2E_MINT_DAILY_FIGURE " +
      "to three times the new figure, rounded up to the next hundred",
  },
  {
    twin: SHARE_WRITE_TWIN,
    half: 250,
    over: 300,
    constant: "E2E_SHARE_WRITES_PER_BLOCK_FIGURE",
    sentence:
      "This run made 300 share writes, more than half (250) of the e2e policy's 500 an hour: raise " +
      "E2E_SHARE_WRITES_PER_BLOCK_FIGURE to three times the new figure, rounded up to the next hundred",
  },
  {
    twin: SAVE_TWIN,
    half: 600,
    over: 700,
    constant: "E2E_SAVES_PER_BLOCK_FIGURE",
    sentence:
      "This run made 700 saves, more than half (600) of the e2e policy's 1200 an hour: raise " +
      "E2E_SAVES_PER_BLOCK_FIGURE to three times the new figure, rounded up to the next hundred",
  },
  {
    twin: CONTACT_EVERY_REQUEST_TWIN,
    half: 50,
    over: 60,
    constant: "E2E_CONTACT_EVERY_PER_BLOCK_HOUR_FIGURE",
    sentence:
      "This run sent 60 contact requests of any kind, more than half (50) of the e2e policy's 100 an hour: raise " +
      "E2E_CONTACT_EVERY_PER_BLOCK_HOUR_FIGURE to three times the new figure, rounded up to the next hundred",
  },
  {
    twin: CONTACT_NEW_REQUEST_HOUR_TWIN,
    half: 50,
    over: 60,
    constant: "E2E_CONTACT_NEW_PER_BLOCK_HOUR_FIGURE",
    sentence:
      "This run sent 60 new contact requests, more than half (50) of the e2e policy's 100 an hour: raise " +
      "E2E_CONTACT_NEW_PER_BLOCK_HOUR_FIGURE to three times the new figure, rounded up to the next hundred",
  },
  {
    twin: CONTACT_NEW_REQUEST_DAY_TWIN,
    half: 50,
    over: 60,
    constant: "E2E_CONTACT_NEW_PER_BLOCK_DAY_FIGURE",
    sentence:
      "This run sent 60 new contact requests, more than half (50) of the e2e policy's 100 a UTC day: raise " +
      "E2E_CONTACT_NEW_PER_BLOCK_DAY_FIGURE to three times the new figure, rounded up to the next hundred",
  },
] as const;

function thrownBy(attempt: () => void): Error {
  try {
    attempt();
  } catch (error) {
    return error as Error;
  }
  throw new Error("expected a failure");
}

describe.each(TWINS)(
  "requireRoomUnderHalfTheFigure, for the twin of $twin.policy.name",
  ({ twin, half, over, constant, sentence }) => {
    it.each([0, 1, half - 1, half])("accepts a run of %i", (hits) => {
      expect(() => {
        requireRoomUnderHalfTheFigure(twin, hits);
      }).not.toThrow();
    });

    it.each([half + 1, over, half * 20])(
      "fails a run of %i, more than half of its window",
      (hits) => {
        expect(() => {
          requireRoomUnderHalfTheFigure(twin, hits);
        }).toThrow(E2eFigureOutgrownError);
      },
    );

    it("says the two counts, the figure and the rule, word for word, and holds no secret", () => {
      const thrown = thrownBy(() => {
        requireRoomUnderHalfTheFigure(twin, over);
      });

      expect(thrown.message).toBe(sentence);
      expect(thrown.message).toContain(constant);
    });

    it("names its policy on the error, and not in the sentence", () => {
      const thrown = thrownBy(() => {
        requireRoomUnderHalfTheFigure(twin, over);
      });

      expect((thrown as Error & { policyName: string }).policyName).toBe(
        twin.policy.name,
      );
      expect(thrown.message).not.toContain(twin.policy.name);
    });
  },
);

const TEARDOWN_TWINS = [
  MINT_TWIN,
  SHARE_WRITE_TWIN,
  SAVE_TWIN,
  CONTACT_EVERY_REQUEST_TWIN,
  CONTACT_NEW_REQUEST_HOUR_TWIN,
  CONTACT_NEW_REQUEST_DAY_TWIN,
] as const;

const { default: globalTeardown } = await import("../global-teardown");

describe("the teardown", () => {
  function keyOf(twin: (typeof TEARDOWN_TWINS)[number]): string {
    return bucketKeyOfTheRun(secretOfThisRun(), twin.policy.name);
  }

  /** Each twin's rows answered with the hits handed in for it, and no row for a twin not named. */
  function answerEachTwin(hits: Map<string, number[]>): void {
    vi.stubEnv("TEST_WORKER_INDEX", undefined);
    deletion.answerFor = ([key]) => {
      const counts = hits.get(key ?? "") ?? [];
      return { rowsRemoved: counts.length, counts };
    };
  }

  function silenceTheLine() {
    return vi.spyOn(console, "log").mockImplementation(() => undefined);
  }

  it("removes the rows of every twin by its own key, the mints' last, and says the counts in one line", async () => {
    vi.stubEnv("TEST_WORKER_INDEX", undefined);
    answerEachTwin(
      new Map([
        [keyOf(MINT_TWIN), [3, 4]],
        [keyOf(SHARE_WRITE_TWIN), [5]],
        [keyOf(SAVE_TWIN), [6, 1]],
        [keyOf(CONTACT_EVERY_REQUEST_TWIN), [10]],
        [keyOf(CONTACT_NEW_REQUEST_HOUR_TWIN), [3]],
        [keyOf(CONTACT_NEW_REQUEST_DAY_TWIN), [2, 1]],
      ]),
    );
    const log = silenceTheLine();

    await globalTeardown();

    expect(deletion.handed.map(([key]) => key)).toEqual([
      keyOf(SHARE_WRITE_TWIN),
      keyOf(SAVE_TWIN),
      keyOf(CONTACT_EVERY_REQUEST_TWIN),
      keyOf(CONTACT_NEW_REQUEST_HOUR_TWIN),
      keyOf(CONTACT_NEW_REQUEST_DAY_TWIN),
      keyOf(MINT_TWIN),
    ]);
    expect(log.mock.calls).toEqual([
      [
        "e2e rate limit: this run minted 7 designs (2 counter row removed), made 5 share writes " +
          "(1 counter rows removed), made 7 saves (2 counter rows removed), and sent 10 contact requests of any kind " +
          "(1 counter rows removed), 3 new ones counted in the hour (1 counter rows removed) and 3 new ones counted " +
          "in the UTC day (2 counter rows removed)",
      ],
    ]);
  });

  it("does not fail a run that sent no contact request, which is every run but one spec's", async () => {
    answerEachTwin(new Map([[keyOf(MINT_TWIN), [1]]]));
    const log = silenceTheLine();

    await expect(globalTeardown()).resolves.toBeUndefined();

    expect(String(log.mock.calls[0]?.[0])).toContain(
      "sent 0 contact requests of any kind (0 counter rows removed), 0 new ones counted in the hour",
    );
  });

  it.each(TEARDOWN_TWINS)(
    "fails a run that passed half of the figure of $policy.name, after every row is removed",
    async (twin) => {
      const rows = new Map(
        TEARDOWN_TWINS.map((each) => [keyOf(each), [1]] as [string, number[]]),
      );
      rows.set(keyOf(twin), [twin.policy.figure / 2 + 1]);
      answerEachTwin(rows);
      silenceTheLine();

      await expect(globalTeardown()).rejects.toMatchObject({
        name: "E2eFigureOutgrownError",
        policyName: twin.policy.name,
      });

      expect(deletion.handed).toHaveLength(TEARDOWN_TWINS.length);
    },
  );

  it("fails a run that minted nothing, since a key computed wrongly would leave every row behind", async () => {
    answerEachTwin(new Map([[keyOf(SAVE_TWIN), [1]]]));
    silenceTheLine();

    await expect(globalTeardown()).rejects.toBeInstanceOf(
      NoCountersOfTheRunError,
    );
  });
});

describe("the harness", () => {
  it("reads source: the teardown checks each of the six twins against half its figure", () => {
    const teardown = readTestSource("e2e/global-teardown.ts");

    expect(
      [...teardown.matchAll(/requireRoomUnderHalfTheFigure\(\s*(\w+),/g)].map(
        (match) => match[1],
      ),
    ).toEqual([
      "MINT_TWIN",
      "SHARE_WRITE_TWIN",
      "SAVE_TWIN",
      "CONTACT_EVERY_REQUEST_TWIN",
      "CONTACT_NEW_REQUEST_HOUR_TWIN",
      "CONTACT_NEW_REQUEST_DAY_TWIN",
    ]);
  });

  it("reads source: writes one line, and the harness writes none", () => {
    const harness = readTestSource("e2e/support/e2e-rate-limit-run.ts");
    const teardown = readTestSource("e2e/global-teardown.ts");

    expect(harness).not.toMatch(/console\./);
    expect(teardown.match(/console\./g)).toHaveLength(1);
  });
});
