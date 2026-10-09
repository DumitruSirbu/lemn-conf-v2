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
  E2eShareFigureOutgrownError,
  removeShareCountersOfTheRun,
  requireRoomUnderHalfTheFigure,
  requireShareRoomUnderHalfTheFigure,
  makeRunSecret,
  NoCountersOfTheRunError,
  removeCountersOfTheRun,
  RUN_SECRET_VARIABLE,
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

describe("removeShareCountersOfTheRun", () => {
  it("hands the helper exactly the share twin's shared-block key, and sums the writes over the hours", async () => {
    deletion.answer = { rowsRemoved: 2, counts: [30, 12] };

    const counted = await removeShareCountersOfTheRun(FAKE_SECRET);

    expect(deletion.handed).toEqual([
      [bucketKeyOfTheRun(FAKE_SECRET, E2E_SHARE_WRITE_POLICY.name)],
    ]);
    expect(counted).toEqual({ rowsRemoved: 2, writesCounted: 42 });
  });

  it("is the key the mint's rows are not under, so each is removed by its own", () => {
    expect(
      bucketKeyOfTheRun(FAKE_SECRET, E2E_SHARE_WRITE_POLICY.name),
    ).not.toBe(bucketKeyOfTheRun(FAKE_SECRET, E2E_MINT_POLICY_NAME));
  });

  it("answers none for a run that shared nothing, and does not fail it", async () => {
    deletion.answer = { rowsRemoved: 0, counts: [] };

    expect(await removeShareCountersOfTheRun(FAKE_SECRET)).toEqual({
      rowsRemoved: 0,
      writesCounted: 0,
    });
  });
});

describe("requireShareRoomUnderHalfTheFigure", () => {
  const HALF_THE_FIGURE = 150;

  it.each([0, 1, 146, HALF_THE_FIGURE])(
    "accepts a run that made %i share writes",
    (writesCounted) => {
      expect(() => {
        requireShareRoomUnderHalfTheFigure({ rowsRemoved: 1, writesCounted });
      }).not.toThrow();
    },
  );

  it.each([HALF_THE_FIGURE + 1, 300, 5000])(
    "fails a run that made %i share writes, more than half of the twin's hour",
    (writesCounted) => {
      expect(() => {
        requireShareRoomUnderHalfTheFigure({ rowsRemoved: 1, writesCounted });
      }).toThrow(E2eShareFigureOutgrownError);
    },
  );

  it("says the two counts and the rule, and holds no secret", () => {
    const thrown = (() => {
      try {
        requireShareRoomUnderHalfTheFigure({
          rowsRemoved: 1,
          writesCounted: 200,
        });
      } catch (error) {
        return error as Error;
      }
      throw new Error("expected a failure");
    })();

    expect(thrown.message).toContain("200");
    expect(thrown.message).toContain("150");
    expect(thrown.message).toContain("E2E_SHARE_WRITES_PER_BLOCK_FIGURE");
  });
});

describe("requireRoomUnderHalfTheFigure", () => {
  const HALF_THE_FIGURE = 550;

  it.each([0, 1, 507, HALF_THE_FIGURE])(
    "accepts a run that minted %i designs",
    (mintsCounted) => {
      expect(() => {
        requireRoomUnderHalfTheFigure({ rowsRemoved: 1, mintsCounted });
      }).not.toThrow();
    },
  );

  it.each([HALF_THE_FIGURE + 1, 1100, 5000])(
    "fails a run that minted %i designs, more than half of the e2e policy's day",
    (mintsCounted) => {
      expect(() => {
        requireRoomUnderHalfTheFigure({ rowsRemoved: 1, mintsCounted });
      }).toThrow(E2eFigureOutgrownError);
    },
  );

  it("says the two counts and the rule, and holds no secret", () => {
    const thrown = (() => {
      try {
        requireRoomUnderHalfTheFigure({ rowsRemoved: 1, mintsCounted: 600 });
      } catch (error) {
        return error as Error;
      }
      throw new Error("expected a failure");
    })();

    expect(thrown.message).toContain("600");
    expect(thrown.message).toContain("550");
    expect(thrown.message).toContain("E2E_MINT_DAILY_FIGURE");
  });
});

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
      "shared.writesCounted",
      "shared.rowsRemoved",
    ]);
  });
});
