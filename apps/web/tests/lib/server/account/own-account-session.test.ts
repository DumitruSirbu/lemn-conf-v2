import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentSession } from "@/lib/server/account/current-session";

/**
 * The 403 of "may manage the account's own sign-in details" cannot be reached through the stores: every role in the
 * domain holds `account.manage.own`, and a session of a role the table does not know is never live. The session read
 * is therefore replaced here, so the branch that answers a live session without the capability is exercised.
 */
const reading = vi.hoisted(() => ({
  session: { kind: "anonymous" } as CurrentSession,
  failure: undefined as Error | undefined,
}));

vi.mock("@/lib/server/account/current-session", () => ({
  readCurrentSessionOrThrow: () =>
    reading.failure === undefined
      ? Promise.resolve(reading.session)
      : Promise.reject(reading.failure),
}));

const { sessionThatMayManageOwnAccount } = await import(
  "@/lib/server/account/own-account-session"
);
const { sessionThatMayEditOwnKitchens } = await import(
  "@/lib/server/account/own-kitchen-session"
);

const NO_COOKIES = { get: () => undefined };
const ACCOUNT_ID = "a".repeat(21);

function signedIn(role: string, isEmailVerified = true): CurrentSession {
  return {
    kind: "signed-in",
    accountId: ACCOUNT_ID,
    role: role as never,
    capabilities: [],
    isEmailVerified,
    email: "someone@example.test",
  };
}

beforeEach(() => {
  reading.session = { kind: "anonymous" };
  reading.failure = undefined;
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("sessionThatMayManageOwnAccount", () => {
  it.each(["client", "operator", "administrator"])(
    "lets a live %s session manage its own account",
    async (role) => {
      reading.session = signedIn(role);

      const own = await sessionThatMayManageOwnAccount({
        cookies: NO_COOKIES,
        event: "profile",
      });

      expect(own.kind).toBe("may-manage");
    },
  );

  it("lets a live session of an unconfirmed address manage its own account: the capability is not a design one", async () => {
    reading.session = signedIn("client", false);

    const own = await sessionThatMayManageOwnAccount({
      cookies: NO_COOKIES,
      event: "profile",
    });

    expect(own.kind).toBe("may-manage");
  });

  it("answers 403 to a live session whose role holds no such capability", async () => {
    reading.session = signedIn("ghost");

    const own = await sessionThatMayManageOwnAccount({
      cookies: NO_COOKIES,
      event: "profile",
    });

    expect(own.kind).toBe("refused");
    if (own.kind === "refused") {
      expect(own.response.status).toBe(403);
      expect(await own.response.json()).toEqual({ status: "forbidden" });
    }
  });

  it("answers 401 to no session", async () => {
    const own = await sessionThatMayManageOwnAccount({
      cookies: NO_COOKIES,
      event: "profile",
    });

    expect(own.kind).toBe("refused");
    if (own.kind === "refused") {
      expect(own.response.status).toBe(401);
      expect(await own.response.json()).toEqual({ status: "unauthenticated" });
    }
  });

  it("throws, for the route's 503, when the session cannot be read", async () => {
    reading.failure = new Error("store down");

    await expect(
      sessionThatMayManageOwnAccount({ cookies: NO_COOKIES, event: "profile" }),
    ).rejects.toThrow("store down");
  });
});

describe("sessionThatMayEditOwnKitchens", () => {
  it("lets a client edit its own kitchens", async () => {
    reading.session = signedIn("client");

    const own = await sessionThatMayEditOwnKitchens({
      cookies: NO_COOKIES,
      event: "kitchen-rename",
    });

    expect(own.kind).toBe("may-edit");
  });

  it.each(["operator", "administrator", "ghost"])(
    "answers 403 to a live %s session, which holds no design.edit.own",
    async (role) => {
      reading.session = signedIn(role);

      const own = await sessionThatMayEditOwnKitchens({
        cookies: NO_COOKIES,
        event: "kitchen-rename",
      });

      expect(own.kind).toBe("refused");
      if (own.kind === "refused") expect(own.response.status).toBe(403);
    },
  );

  it("answers 403 to a client whose address is not confirmed: a design capability needs it", async () => {
    reading.session = signedIn("client", false);

    const own = await sessionThatMayEditOwnKitchens({
      cookies: NO_COOKIES,
      event: "kitchen-rename",
    });

    expect(own.kind).toBe("refused");
    if (own.kind === "refused") expect(own.response.status).toBe(403);
  });
});
