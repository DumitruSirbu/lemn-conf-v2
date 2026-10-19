import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SESSION_COOKIE_NAME } from "@/lib/server/account/session-cookie";
import { IDLE_LIFETIME_SECONDS_BY_ROLE } from "@/lib/server/account/session-lifetimes";

import {
  captureConsole,
  freshAccountWorld,
  hashingLedger,
  jsonOf,
  limiterLedger,
  accountRequest,
  seedVerifiedAccount,
  setCookieLinesOf,
  sha256Hex,
  wireOf,
  type AccountWorld,
} from "../../../support/account-world";

vi.mock("@/lib/server/account/account-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.accountStoreModule(),
  ),
);
vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/account/turnstile-verification", () =>
  import("../../../support/account-world").then((world) =>
    world.turnstileModule(),
  ),
);
vi.mock("@/lib/server/account/password-hash", async (original) => {
  const world = await import("../../../support/account-world");
  return world.passwordHashModule(
    await original<typeof import("@/lib/server/account/password-hash")>(),
  );
});

const { POST } = await import("@/app/api/account/login/route");

/**
 * `POST /api/account/login` and the existing-password reading (M8B Lot 2, S2). The rule that a password may not be the
 * address it protects is for choosing a password. Sign-in reads the stored one by its length bounds alone, so a person
 * whose password equals the address they have since changed to can still sign in, and one whose typed text no password
 * can be is told what a wrong password is told.
 */

const ADDRESS = "same.as.password@example.test";

let world: AccountWorld;

beforeEach(() => {
  world = freshAccountWorld();
  captureConsole();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function signIn(json: unknown) {
  return POST(
    accountRequest("/api/account/login", {
      method: "POST",
      json,
      headers: { "x-forwarded-for": "192.0.2.10" },
    }),
  );
}

async function isLive(value: string): Promise<boolean> {
  const lookup = await world.sessions.findLive({
    tokenHash: sha256Hex(value),
    idleLifetimeSeconds: IDLE_LIFETIME_SECONDS_BY_ROLE,
  });
  return lookup.kind === "live";
}

function cookieValueOf(answer: Response): string {
  const line = setCookieLinesOf(answer).find((candidate) =>
    candidate.startsWith(`${SESSION_COOKIE_NAME}=`),
  );
  return line?.split(";")[0]?.split("=")[1] ?? "";
}

describe("a password that equals the address", () => {
  it("opens the account: the is-the-address rule is not applied to a password that exists", async () => {
    await seedVerifiedAccount({ email: ADDRESS, password: ADDRESS });

    const answer = await signIn({ email: ADDRESS, password: ADDRESS });

    expect(answer.status).toBe(200);
    expect(await jsonOf(answer)).toEqual({ status: "signed-in", claimable: 0 });
    const value = cookieValueOf(answer);
    expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await isLive(value)).toBe(true);
  });

  it("opens the account whatever the case of the address typed, the password being its own text", async () => {
    await seedVerifiedAccount({ email: ADDRESS, password: ADDRESS });

    const answer = await signIn({
      email: ADDRESS.toUpperCase(),
      password: ADDRESS,
    });

    expect(answer.status).toBe(200);
  });

  it("is a wrong password, not a field error, for an account whose password is something else", async () => {
    await seedVerifiedAccount({
      email: ADDRESS,
      password: "something else entirely 1",
    });

    const answer = await signIn({ email: ADDRESS, password: ADDRESS });

    expect(answer.status).toBe(401);
    expect(await jsonOf(answer)).toEqual({ status: "invalid-credentials" });
  });
});

describe("the length bounds of an existing password", () => {
  const AT_LEAST = "m".repeat(12);
  const AT_MOST = "x".repeat(128);

  it.each([
    ["twelve characters", AT_LEAST],
    ["128 characters", AT_MOST],
  ])("opens an account whose password is %s", async (_label, password) => {
    await seedVerifiedAccount({ email: ADDRESS, password });

    const answer = await signIn({ email: ADDRESS, password });

    expect(answer.status).toBe(200);
  });

  it.each([
    ["eleven characters", "m".repeat(11)],
    ["129 characters", "x".repeat(129)],
    ["a text far past the maximum", "y".repeat(5000)],
    ["empty", ""],
  ])(
    "answers a password of %s the one 401 a wrong password gets, with no field error",
    async (_label, typed) => {
      await seedVerifiedAccount({ email: ADDRESS, password: AT_LEAST });

      const answer = await signIn({ email: ADDRESS, password: typed });

      expect(answer.status).toBe(401);
      expect(await jsonOf(answer)).toEqual({ status: "invalid-credentials" });
    },
  );

  it("answers an unknown address, a wrong password, a refused text and an unconfirmed account in the same bytes, after one verification each", async () => {
    await seedVerifiedAccount({ email: ADDRESS, password: AT_LEAST });
    const cases = [
      ["a wrong password", { email: ADDRESS, password: "n".repeat(12) }],
      ["a refused text", { email: ADDRESS, password: "short" }],
      [
        "an unknown address",
        { email: "nobody@example.test", password: AT_LEAST },
      ],
    ] as const;
    const wires: string[] = [];

    for (const [label, body] of cases) {
      hashingLedger.reset();
      limiterLedger.counted.length = 0;

      const answer = await signIn(body);

      expect(answer.status, label).toBe(401);
      expect(hashingLedger.checks, label).toBe(1);
      expect(setCookieLinesOf(answer), label).toEqual([]);
      wires.push(await wireOf(answer));
    }
    expect(new Set(wires).size).toBe(1);
  });

  it("counts the network's bucket, then the address's two, for every attempt alike", async () => {
    await seedVerifiedAccount({ email: ADDRESS, password: AT_LEAST });

    await signIn({ email: ADDRESS, password: "short" });

    expect(limiterLedger.counted).toEqual([
      "account-login-by-block-per-60-utc-minutes",
      "account-login-by-address-per-15-utc-minutes",
      "account-login-by-address-per-1440-utc-minutes",
    ]);
  });
});

describe("what is still a field error", () => {
  it("names a password that is not text, and an address that is not one, before any account is looked up", async () => {
    world.calls.length = 0;

    const answer = await signIn({ email: "nope", password: 5 });

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [
        { field: "email", code: "MALFORMED" },
        { field: "password", code: "PASSWORD_NOT_TEXT" },
      ],
    });
    expect(world.calls).not.toContain("accounts.findByNormalForm");
  });
});
