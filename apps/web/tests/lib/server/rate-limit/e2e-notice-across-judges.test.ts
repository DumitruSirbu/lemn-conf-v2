import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { E2E_MINT_POLICY_NOTICE } from "@/lib/server/design-failure-log";
import {
  E2E_RATE_LIMIT_POLICY_FLAG,
  type PolicyPurpose,
} from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

const FAKE_SECRET =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

/** The judges, from a module graph of their own: the notice is written once for a process, so a test that reads it
 *  must start with a process that wrote none. Reads have no twin, and are asked under a named source, as they are. */
async function freshJudges() {
  vi.resetModules();
  const { judgeMintRequest } = await import(
    "@/lib/server/rate-limit/judge-mint-request"
  );
  const { judgeShareWrite } = await import(
    "@/lib/server/rate-limit/judge-share-write"
  );
  const { judgeReadRequest } = await import(
    "@/lib/server/rate-limit/judge-read-request"
  );
  const headers = new Headers({ "x-forwarded-for": "192.0.2.77" });
  const askers: Record<PolicyPurpose, () => Promise<unknown>> = {
    mint: () => judgeMintRequest(headers),
    "share-write": () => judgeShareWrite(headers),
    read: () => judgeReadRequest(headers),
    "save-by-block": () => Promise.resolve(undefined),
    "save-by-credential": () => Promise.resolve(undefined),
    "contact-every-by-block": () => Promise.resolve(undefined),
    "contact-new-by-block-hour": () => Promise.resolve(undefined),
    "contact-new-by-block-day": () => Promise.resolve(undefined),
    "contact-new-by-visitor": () => Promise.resolve(undefined),
    "contact-new-by-address": () => Promise.resolve(undefined),
    "contact-tries-by-request": () => Promise.resolve(undefined),
  };
  return askers;
}

function noticesWritten(warn: ReturnType<typeof vi.spyOn>): number {
  return warn.mock.calls.filter(
    ([, line]) =>
      (line as { message?: string }).message === E2E_MINT_POLICY_NOTICE,
  ).length;
}

beforeEach(() => {
  vi.stubEnv("DIGEST_SECRET", FAKE_SECRET);
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, undefined);
  vi.stubEnv(E2E_RATE_LIMIT_POLICY_FLAG, "1");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("the e2e notice: written when any twin first decides, once for a process", () => {
  it.each(["mint", "share-write"] as const)(
    "is written when the %s's twin first decides, and not again",
    async (purpose) => {
      const warn = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      const askers = await freshJudges();

      await askers[purpose]();
      await askers[purpose]();
      await askers[purpose]();

      expect(noticesWritten(warn)).toBe(1);
    },
  );

  it("is written once when the mint's twin and the share's twin both decide in one process", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const askers = await freshJudges();

    await askers.mint();
    await askers["share-write"]();

    expect(noticesWritten(warn)).toBe(1);
  });

  it("is not written for a read, which has no twin, even with the flag set", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, undefined);
    const askers = await freshJudges();

    await askers.read();

    expect(noticesWritten(warn)).toBe(0);
  });

  it.each(["mint", "share-write"] as const)(
    "is not written for the production policy of %s: the flag absent",
    async (purpose) => {
      const warn = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      vi.stubEnv(E2E_RATE_LIMIT_POLICY_FLAG, undefined);
      const askers = await freshJudges();

      await askers[purpose]();

      expect(noticesWritten(warn)).toBe(0);
    },
  );

  it("is not written when the flag beside a source makes the policy unavailable, since no twin decided", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
    const askers = await freshJudges();

    await askers.mint();

    expect(noticesWritten(warn)).toBe(0);
  });

  it("says nothing a twin could make false: no figure and no name of a twin", () => {
    expect(E2E_MINT_POLICY_NOTICE.replace(/e2e/gi, "")).not.toMatch(
      /[0-9]|mint|share|save|day|hour/i,
    );
  });
});
