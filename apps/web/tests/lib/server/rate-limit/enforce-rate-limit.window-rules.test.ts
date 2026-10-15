// A policy holds its window as data, and the evaluator reads the length from it. The closed set of policies holds
// only hour and day windows, so this file widens that set by two test policies, and nothing else of the module is
// replaced: the evaluator, the windows and the store's fake are the real ones.
import { FakeRateLimitStore, type RateLimitStore } from "@lemnaria/persistence";
import { describe, expect, it, vi } from "vitest";

import { readDigester } from "@/lib/server/digest/digest-secret";
import { subjectOfNetworkBlock } from "@/lib/server/rate-limit/bucket-subject";
import {
  enforceRateLimit,
  RATE_LIMIT_DEADLINE_MS,
  type RateLimitRequest,
} from "@/lib/server/rate-limit/enforce-rate-limit";
import type { LimitPolicy } from "@/lib/server/rate-limit/limit-policy";

const FAKE_SECRET =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

const widened = vi.hoisted(() => ({ policies: [] as unknown[] }));

vi.mock("@/lib/server/rate-limit/limit-policy", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/lib/server/rate-limit/limit-policy")
    >();
  return {
    ...actual,
    isOwnPolicy: (candidate: unknown) =>
      actual.isOwnPolicy(candidate) || widened.policies.includes(candidate),
  };
});

const THREE_PER_TEN_MINUTES: LimitPolicy = {
  name: "test-three-per-ten-minutes",
  figure: 3,
  window: { kind: "utc-minutes", minutes: 10 },
};
const SEVEN_MINUTES: LimitPolicy = {
  name: "test-seven-minutes",
  figure: 3,
  window: { kind: "utc-minutes", minutes: 7 },
};
widened.policies.push(THREE_PER_TEN_MINUTES, SEVEN_MINUTES);

const BLOCK = subjectOfNetworkBlock({ kind: "ipv4-block", subject: "192.0.2" });

function requestOf(
  overrides: Partial<RateLimitRequest> & {
    store: Pick<RateLimitStore, "recordHits">;
  },
): RateLimitRequest {
  return {
    subject: BLOCK,
    digester: readDigester({ DIGEST_SECRET: FAKE_SECRET }),
    policy: THREE_PER_TEN_MINUTES,
    instant: new Date("2026-07-15T12:00:00Z"),
    deadlineMs: RATE_LIMIT_DEADLINE_MS,
    ...overrides,
  };
}

async function hitsAt(store: RateLimitStore, instant: Date, hits: number) {
  for (let hit = 0; hit < hits; hit += 1) {
    await enforceRateLimit(requestOf({ store, instant }));
  }
}

describe("enforceRateLimit: the length of a window is the policy's data", () => {
  it("counts in ten-minute windows: the fourth hit is refused and the mark's hit is fresh", async () => {
    const store = new FakeRateLimitStore();
    const lastOfTheWindow = new Date("2026-07-15T12:09:59.999Z");
    await hitsAt(store, lastOfTheWindow, 3);

    expect(
      await enforceRateLimit(requestOf({ store, instant: lastOfTheWindow })),
    ).toEqual({ kind: "refuse", retryAfterSeconds: 1 });
    expect(
      await enforceRateLimit(
        requestOf({ store, instant: new Date("2026-07-15T12:10:00.000Z") }),
      ),
    ).toEqual({ kind: "allow" });
  });

  it("tells a ten-minute refusal its whole 600 seconds at the window's first millisecond", async () => {
    const store = new FakeRateLimitStore();
    const first = new Date("2026-07-15T12:10:00.000Z");
    await hitsAt(store, first, 3);

    expect(
      await enforceRateLimit(requestOf({ store, instant: first })),
    ).toEqual({
      kind: "refuse",
      retryAfterSeconds: 600,
    });
  });

  it("answers a window that cannot be made as unavailable, without a call to the store", async () => {
    const recorded: unknown[] = [];
    const store = {
      recordHits: (buckets: unknown) => {
        recorded.push(buckets);
        return Promise.resolve([1]);
      },
    };

    expect(
      await enforceRateLimit(requestOf({ store, policy: SEVEN_MINUTES })),
    ).toEqual({ kind: "unavailable", cause: "window-unavailable" });
    expect(recorded).toHaveLength(0);
  });
});
