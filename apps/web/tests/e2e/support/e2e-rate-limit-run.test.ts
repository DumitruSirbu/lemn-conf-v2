import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readDigester } from "@/lib/server/digest/digest-secret";
import {
  E2E_MINT_POLICY_NAME,
  MINT_POLICY_NAME,
} from "@/lib/server/rate-limit/limit-policy";

import { readSource } from "../../lib/server/server-source-support";

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
    delete process.env.TEST_WORKER_INDEX;

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

  it.each([undefined, ""])(
    "is refused by a worker that inherited %j",
    (value) => {
      vi.stubEnv("TEST_WORKER_INDEX", "3");
      vi.stubEnv(RUN_SECRET_VARIABLE, value ?? "set, then removed");
      if (value === undefined) {
        Reflect.deleteProperty(process.env, RUN_SECRET_VARIABLE);
      }

      expect(() => secretOfThisRun()).toThrow(
        /found no LEMNARIA_E2E_RUN_SECRET/,
      );
    },
  );
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

describe("the harness", () => {
  it("reads source: prints nothing but the two counts", () => {
    const harness = readSource("../tests/e2e/support/e2e-rate-limit-run.ts");
    const teardown = readSource("../tests/e2e/global-teardown.ts");

    expect(harness).not.toMatch(/console\./);
    expect(teardown.match(/console\./g)).toHaveLength(1);
    expect(
      [...teardown.matchAll(/\$\{String\(counted\.(\w+)\)\}/g)].map(
        (m) => m[1],
      ),
    ).toEqual(["mintsCounted", "rowsRemoved"]);
  });
});
