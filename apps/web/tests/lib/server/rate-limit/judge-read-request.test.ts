import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  RATE_LIMIT_READ_DEADLINE_MS,
  type UnavailableCause,
} from "@/lib/server/rate-limit/enforce-rate-limit";
import {
  E2E_RATE_LIMIT_POLICY_FLAG,
  READS_PER_BLOCK_FIGURE,
} from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { utcWindowOf } from "@/lib/server/rate-limit/utc-window";

import { readSource } from "../server-source-support";

const FAKE_SECRET =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

/** What `openssl dgst -sha256 -mac HMAC -macopt hexkey:<the fake secret>` gave over
 *  `17:rate-limit-bucket,32:read-by-block-per-60-utc-minutes,10:ipv4-block,7:192.0.2,`. */
const PINNED_KEY_OF_A_READ_FROM_192_0_2 =
  "6cf8d1034dfdb1c1cabd3dcba28628a218f096163470839aff962bfdd4b819c7";

const NOON = new Date("2026-07-15T12:20:00Z");
const FROM_192_0_2 = new Headers({ "x-forwarded-for": "192.0.2.77" });
const SECONDS_TO_THE_HOURS_END = 40 * 60;

/** The judge and the store it counts in, from a module graph of their own: what the judge announces is kept for a
 *  process, so a test that reads what it announced must start with a process that announced nothing. */
async function freshJudge() {
  vi.resetModules();
  const judge = await import("@/lib/server/rate-limit/judge-read-request");
  const { getRateLimitStore } = await import(
    "@/lib/server/rate-limit/rate-limit-store-instance"
  );
  const store = getRateLimitStore();
  return {
    ...judge,
    store,
    recorded: vi.spyOn(store, "recordHits"),
  };
}

function theConsole() {
  return {
    warn: vi.spyOn(console, "warn").mockImplementation(() => undefined),
    error: vi.spyOn(console, "error").mockImplementation(() => undefined),
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(NOON);
  vi.stubEnv("DIGEST_SECRET", FAKE_SECRET);
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  vi.stubEnv(E2E_RATE_LIMIT_POLICY_FLAG, undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("judgeReadRequest: under no network source a read is not counted at all", () => {
  beforeEach(() => {
    vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, undefined);
  });

  it("serves the read and makes no call to the store, whatever header it carries", async () => {
    const { judgeReadRequest, store, recorded } = await freshJudge();
    const totalled = vi.spyOn(store, "totalsOfWindow");

    const judgements = await Promise.all(
      [
        FROM_192_0_2,
        new Headers(),
        new Headers({ "x-forwarded-for": "2001:db8::1" }),
      ].map((headers) => judgeReadRequest(headers)),
    );

    expect(judgements).toEqual([
      { kind: "serve" },
      { kind: "serve" },
      { kind: "serve" },
    ]);
    expect(recorded).not.toHaveBeenCalled();
    expect(totalled).not.toHaveBeenCalled();
  });

  it("leaves the store holding no row after a thousand reads", async () => {
    const { judgeReadRequest, store } = await freshJudge();
    const hour = utcWindowOf(NOON, 60);
    const before = await store.totalsOfWindow(hour, READS_PER_BLOCK_FIGURE);

    for (let read = 0; read < 1000; read += 1) {
      await judgeReadRequest(FROM_192_0_2);
    }

    expect(await store.totalsOfWindow(hour, READS_PER_BLOCK_FIGURE)).toEqual(
      before,
    );
  });

  it("serves even when the secret and the flag are unusable, since nothing is asked of either", async () => {
    vi.stubEnv("DIGEST_SECRET", "short");
    vi.stubEnv(E2E_RATE_LIMIT_POLICY_FLAG, "1");
    const warn = theConsole().warn;
    const { judgeReadRequest, recorded } = await freshJudge();

    expect(await judgeReadRequest(FROM_192_0_2)).toEqual({ kind: "serve" });
    expect(recorded).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("judgeReadRequest: where a source is named, a read is counted by its block", () => {
  it("counts a read from 192.0.2.77 under the pinned key of its block in the clock hour", async () => {
    const { judgeReadRequest, recorded } = await freshJudge();

    await judgeReadRequest(FROM_192_0_2);

    expect(recorded.mock.calls[0]?.[0]).toEqual([
      { key: PINNED_KEY_OF_A_READ_FROM_192_0_2, window: utcWindowOf(NOON, 60) },
    ]);
  });

  it("serves the first 600 reads in an hour and refuses the 601st, telling the seconds to the hour's end", async () => {
    const { judgeReadRequest } = await freshJudge();
    theConsole();
    const answers: string[] = [];
    for (let read = 1; read <= READS_PER_BLOCK_FIGURE; read += 1) {
      answers.push((await judgeReadRequest(FROM_192_0_2)).kind);
    }

    expect(answers.every((kind) => kind === "serve")).toBe(true);
    expect(await judgeReadRequest(FROM_192_0_2)).toEqual({
      kind: "refuse",
      retryAfterSeconds: SECONDS_TO_THE_HOURS_END,
    });
  });

  it("counts another block apart and serves the first read of the next hour", async () => {
    const { judgeReadRequest } = await freshJudge();
    theConsole();
    for (let read = 0; read <= READS_PER_BLOCK_FIGURE; read += 1) {
      await judgeReadRequest(FROM_192_0_2);
    }

    expect(
      (
        await judgeReadRequest(
          new Headers({ "x-forwarded-for": "198.51.100.9" }),
        )
      ).kind,
    ).toBe("serve");
    vi.setSystemTime(new Date("2026-07-15T13:00:00Z"));
    expect((await judgeReadRequest(FROM_192_0_2)).kind).toBe("serve");
  });
});

describe("judgeReadRequest: a read that cannot be judged is served, once announced for a process and a cause", () => {
  const CASES: readonly [string, () => void, UnavailableCause][] = [
    [
      "a misconfigured source",
      () => vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "other"),
      "source-misconfigured",
    ],
    [
      "a flag beside the source",
      () => vi.stubEnv(E2E_RATE_LIMIT_POLICY_FLAG, "1"),
      "policy-misconfigured",
    ],
    [
      "an unusable secret",
      () => vi.stubEnv("DIGEST_SECRET", "short"),
      "digester-unusable",
    ],
  ];

  it.each(CASES)(
    "serves a read under %s, asks no store and writes one line naming the cause",
    async (_label, arrange, cause) => {
      arrange();
      const { warn } = theConsole();
      const { judgeReadRequest, recorded } = await freshJudge();

      const judgements = [];
      for (let read = 0; read < 50; read += 1) {
        judgements.push(await judgeReadRequest(FROM_192_0_2));
      }

      expect(judgements.every((judgement) => judgement.kind === "serve")).toBe(
        true,
      );
      expect(recorded).not.toHaveBeenCalled();
      expect(warn.mock.calls).toEqual([
        ["[designs]", { event: "design-read-served-unjudged", cause }],
      ]);
    },
  );

  it("serves a read whose store fails and writes one line for a hundred such reads", async () => {
    const { warn } = theConsole();
    const { judgeReadRequest, recorded } = await freshJudge();
    recorded.mockRejectedValue(
      new Error("postgres://user:READ-MARKER-4412@host/db"),
    );

    for (let read = 0; read < 100; read += 1) {
      expect(await judgeReadRequest(FROM_192_0_2)).toEqual({ kind: "serve" });
    }

    expect(warn.mock.calls).toEqual([
      [
        "[designs]",
        { event: "design-read-served-unjudged", cause: "store-failed" },
      ],
    ]);
  });

  it("writes a line for each cause once, so two causes are two lines and a repeat of either none", async () => {
    const { warn } = theConsole();
    const { judgeReadRequest, recorded } = await freshJudge();
    recorded.mockRejectedValue(new Error("down"));
    await judgeReadRequest(FROM_192_0_2);
    vi.stubEnv("DIGEST_SECRET", "short");
    await judgeReadRequest(FROM_192_0_2);
    await judgeReadRequest(FROM_192_0_2);
    vi.stubEnv("DIGEST_SECRET", FAKE_SECRET);
    await judgeReadRequest(FROM_192_0_2);

    expect(
      warn.mock.calls.map(([, line]) => (line as { cause: string }).cause),
    ).toEqual(["store-failed", "digester-unusable"]);
  });

  it("writes one line for the first refusal of a process and none for the refusals after it", async () => {
    const { warn } = theConsole();
    const { judgeReadRequest } = await freshJudge();
    for (let read = 0; read < READS_PER_BLOCK_FIGURE + 40; read += 1) {
      await judgeReadRequest(FROM_192_0_2);
    }

    expect(warn.mock.calls).toEqual([
      [
        "[designs]",
        {
          event: "design-read-refused",
          refusalCode: "READ_LIMIT_REACHED",
          status: 429,
          policy: "read-by-block-per-60-utc-minutes",
        },
      ],
    ]);
  });

  it("holds no address, block, key, count or secret in anything it writes", async () => {
    const { warn, error } = theConsole();
    const { judgeReadRequest, recorded } = await freshJudge();
    recorded.mockRejectedValueOnce(new Error("READ-MARKER-4412"));
    await judgeReadRequest(FROM_192_0_2);
    vi.stubEnv("DIGEST_SECRET", "short");
    await judgeReadRequest(FROM_192_0_2);

    const written = JSON.stringify([warn.mock.calls, error.mock.calls]);
    expect(written).not.toMatch(/MARKER|192\.0\.2|[0-9a-f]{64}|short/);
  });
});

describe("judgeReadRequest: a read waits for the store no longer than its deadline", () => {
  it("serves a read whose store never answers at 300 milliseconds and not a millisecond before", async () => {
    theConsole();
    const { judgeReadRequest, recorded } = await freshJudge();
    recorded.mockReturnValue(new Promise<readonly number[]>(() => undefined));
    let served: string | undefined;
    const pending = judgeReadRequest(FROM_192_0_2).then((judgement) => {
      served = judgement.kind;
    });

    await vi.advanceTimersByTimeAsync(RATE_LIMIT_READ_DEADLINE_MS - 1);
    expect(served).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await pending;

    expect(served).toBe("serve");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("announces the deadline once for a process, as a read served unjudged", async () => {
    const { warn } = theConsole();
    const { judgeReadRequest, recorded } = await freshJudge();
    recorded.mockReturnValue(new Promise<readonly number[]>(() => undefined));

    for (let read = 0; read < 3; read += 1) {
      const pending = judgeReadRequest(FROM_192_0_2);
      await vi.advanceTimersByTimeAsync(RATE_LIMIT_READ_DEADLINE_MS);
      await pending;
    }

    expect(warn.mock.calls).toEqual([
      [
        "[designs]",
        { event: "design-read-served-unjudged", cause: "deadline-passed" },
      ],
    ]);
  });
});

describe("refusalOfReadLimit: the answer that stops a read", () => {
  it("is nothing for a read that is served", async () => {
    const { refusalOfReadLimit } = await freshJudge();

    expect(await refusalOfReadLimit(FROM_192_0_2)).toBeUndefined();
  });

  it("is a bare 429 with the wait, its code and no store of the answer, for a read past its figure", async () => {
    theConsole();
    const { refusalOfReadLimit } = await freshJudge();
    for (let read = 0; read < READS_PER_BLOCK_FIGURE; read += 1) {
      await refusalOfReadLimit(FROM_192_0_2);
    }

    const response = await refusalOfReadLimit(FROM_192_0_2);

    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBe(
      String(SECONDS_TO_THE_HOURS_END),
    );
    expect(response?.headers.get("Cache-Control")).toBe("no-store");
    expect(await response?.json()).toEqual({
      error: "Too many requests for now.",
      code: "READ_LIMIT_REACHED",
    });
  });

  it("tells a wait from 1 to 3,600 seconds for refusals at every minute of an hour, with a floor", async () => {
    theConsole();
    const { refusalOfReadLimit } = await freshJudge();
    const waits: number[] = [];
    for (let read = 0; read < READS_PER_BLOCK_FIGURE; read += 1) {
      await refusalOfReadLimit(FROM_192_0_2);
    }
    for (let minute = 0; minute < 60; minute += 1) {
      vi.setSystemTime(new Date(Date.UTC(2026, 6, 15, 12, minute, 30)));
      const response = await refusalOfReadLimit(FROM_192_0_2);
      if (response) waits.push(Number(response.headers.get("Retry-After")));
    }

    expect(waits.length).toBeGreaterThanOrEqual(20);
    expect(
      waits.every(
        (wait) => Number.isInteger(wait) && wait >= 1 && wait <= 3600,
      ),
    ).toBe(true);
  });
});

describe("judge-read-request.ts", () => {
  const source = readSource(
    "lib/server/rate-limit/judge-read-request.ts",
  ).replace(/\/\*[\s\S]*?\*\//g, "");

  it("reads source: asks the environment once, takes the read's deadline by name, and asks no store under none", () => {
    expect(source.match(/process\.env/g)).toHaveLength(1);
    expect(source).toMatch(/deadlineMs: RATE_LIMIT_READ_DEADLINE_MS/);
    expect(source).not.toMatch(/\b300\b|\b600\b/);
    expect(source.indexOf('source.kind === "none"')).toBeLessThan(
      source.indexOf("getRateLimitStore()"),
    );
    expect(source.indexOf('source.kind === "none"')).toBeLessThan(
      source.indexOf("readDigester("),
    );
  });
});
