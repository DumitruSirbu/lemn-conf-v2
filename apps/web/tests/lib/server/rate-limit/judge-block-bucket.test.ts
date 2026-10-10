import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readDigester } from "@/lib/server/digest/digest-secret";
import {
  blockBucketRequestFor,
  judgeBlockBucket,
} from "@/lib/server/rate-limit/judge-block-bucket";
import {
  E2E_RATE_LIMIT_POLICY_FLAG,
  MINT_POLICY,
  policyNameOf,
  READ_POLICY,
  SHARE_WRITE_POLICY,
  type PolicyPurpose,
} from "@/lib/server/rate-limit/limit-policy";
import { getRateLimitStore } from "@/lib/server/rate-limit/rate-limit-store-instance";

const FAKE_SECRET =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const NOON = new Date("2026-07-15T12:20:00Z");
const FROM_192_0_2 = new Headers({ "x-forwarded-for": "192.0.2.77" });
const DEADLINE_MS = 1234;

function askFor(
  purpose: PolicyPurpose,
  environment: Record<string, string | undefined>,
) {
  return blockBucketRequestFor({
    environment,
    headers: FROM_192_0_2,
    purpose,
    deadlineMs: DEADLINE_MS,
    instant: NOON,
  });
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("blockBucketRequestFor: the one maker of a block judge's request", () => {
  const NAMED = { CLIENT_NETWORK_SOURCE: "vercel", DIGEST_SECRET: FAKE_SECRET };

  it.each([
    ["mint", MINT_POLICY],
    ["share-write", SHARE_WRITE_POLICY],
    ["read", READ_POLICY],
  ] as const)("chooses the policy of the purpose %s", (purpose, policy) => {
    expect(askFor(purpose, NAMED).policy).toEqual({ status: "chosen", policy });
  });

  it("takes the network from the header the named source names, and the deadline and the instant it is handed", () => {
    const request = askFor("mint", NAMED);

    expect(request.network).toEqual({
      status: "known",
      block: { kind: "ipv4-block", subject: "192.0.2" },
    });
    expect(request.deadlineMs).toBe(DEADLINE_MS);
    expect(request.instant).toBe(NOON);
  });

  it("puts every request in the shared block when no source is named, whatever header it carries", () => {
    const request = askFor("mint", { DIGEST_SECRET: FAKE_SECRET });

    expect(request.network).toEqual({
      status: "known",
      block: { kind: "shared", subject: "" },
    });
  });

  it("reads the secret from the environment it is handed and from no other", () => {
    expect(askFor("mint", NAMED).digester.status).toBe("usable");
    expect(
      askFor("mint", { CLIENT_NETWORK_SOURCE: "vercel" }).digester,
    ).toEqual(readDigester({}));
  });

  it("makes the store when the first hit is counted and not before", async () => {
    const recorded = vi.spyOn(getRateLimitStore(), "recordHits");
    const request = askFor("mint", NAMED);

    expect(recorded).not.toHaveBeenCalled();
    await request.store.recordHits([]).catch(() => undefined);
    expect(recorded).toHaveBeenCalledTimes(1);
  });
});

describe("judgeBlockBucket: what is answered before the store is asked, the source first", () => {
  it.each([
    [
      "a misconfigured source",
      { CLIENT_NETWORK_SOURCE: "other", DIGEST_SECRET: FAKE_SECRET },
      "source-misconfigured",
    ],
    [
      "a flag beside the source",
      {
        CLIENT_NETWORK_SOURCE: "vercel",
        [E2E_RATE_LIMIT_POLICY_FLAG]: "1",
        DIGEST_SECRET: FAKE_SECRET,
      },
      "policy-misconfigured",
    ],
    [
      "an unusable secret",
      { CLIENT_NETWORK_SOURCE: "vercel", DIGEST_SECRET: "short" },
      "digester-unusable",
    ],
    [
      "a source and a flag both unusable: the source first",
      {
        CLIENT_NETWORK_SOURCE: "other",
        [E2E_RATE_LIMIT_POLICY_FLAG]: "1",
        DIGEST_SECRET: "short",
      },
      "source-misconfigured",
    ],
  ])(
    "answers %s as unavailable without a call to the store",
    async (_label, environment, cause) => {
      const recorded = vi.spyOn(getRateLimitStore(), "recordHits");

      const decision = await judgeBlockBucket(askFor("mint", environment));

      expect(decision).toEqual({ kind: "unavailable", cause });
      expect(recorded).not.toHaveBeenCalled();
    },
  );
});

describe("policyNameOf: the name a line gives a policy", () => {
  it("is the chosen policy's own name, and none when none was chosen", () => {
    expect(policyNameOf({ status: "chosen", policy: MINT_POLICY })).toBe(
      MINT_POLICY.name,
    );
    expect(policyNameOf({ status: "unavailable", variable: undefined })).toBe(
      "none",
    );
    expect(
      policyNameOf({
        status: "unavailable",
        variable: E2E_RATE_LIMIT_POLICY_FLAG,
      }),
    ).toBe("none");
  });
});
