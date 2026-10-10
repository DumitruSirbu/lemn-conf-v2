import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readDigester } from "@/lib/server/digest/digest-secret";
import {
  E2E_MINT_POLICY_NAME,
  E2E_SHARE_WRITE_POLICY,
  MINT_POLICY_NAME,
} from "@/lib/server/rate-limit/limit-policy";

import { readTestSource } from "../../lib/server/server-source-support";

const deletion = vi.hoisted(() => ({
  handed: [] as (readonly string[])[],
  answer: { rowsRemoved: 1, counts: [3] } as {
    rowsRemoved: number;
    counts: number[];
  },
}));

vi.mock("@lemnaria/persistence", () => ({
  deleteRateLimitCountersForTests: (keys: readonly string[]) => {
    deletion.handed.push(keys);
    return Promise.resolve(deletion.answer);
  },
}));

const {
  bucketKeyOfTheRun,
  E2eFigureOutgrownError,
  makeRunSecret,
  MINT_TWIN,
  NoCountersOfTheRunError,
  removeCountersOf,
  removeCountersOfTheRun,
  requireRoomUnderHalfTheFigure,
  RUN_SECRET_VARIABLE,
  SHARE_WRITE_TWIN,
  secretOfThisRun,
} = await import("./e2e-rate-limit-run");

const FAKE_SECRET =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const MADE_IN_THIS_PROCESS = Symbol.for("lemnaria.e2e.run-secret");

beforeEach(() => {
  deletion.handed.length = 0;
  deletion.answer = { rowsRemoved: 1, counts: [3] };
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

describe("the harness", () => {
  it("reads source: prints nothing but the four counts, in one line", () => {
    const harness = readTestSource("e2e/support/e2e-rate-limit-run.ts");
    const teardown = readTestSource("e2e/global-teardown.ts");

    expect(harness).not.toMatch(/console\./);
    expect(teardown.match(/console\./g)).toHaveLength(1);
    expect(
      [...teardown.matchAll(/\$\{String\((counted|shared)\.(\w+)\)\}/g)].map(
        (m) => `${m[1] ?? ""}.${m[2] ?? ""}`,
      ),
    ).toEqual([
      "counted.mintsCounted",
      "counted.rowsRemoved",
      "shared.hitsCounted",
      "shared.rowsRemoved",
    ]);
  });
});
