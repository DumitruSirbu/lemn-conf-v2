import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkPassword } from "@/lib/server/account/password-hash";
import { SESSION_COOKIE_NAME } from "@/lib/server/account/session-cookie";
import { IDLE_LIFETIME_SECONDS_BY_ROLE } from "@/lib/server/account/session-lifetimes";

import {
  drainAfterTasks,
  pendingAfterTasks,
} from "../../../support/after-queue";
import {
  DEFAULT_PASSWORD,
  DRIVER_FAILURE_MARKER,
  PASSWORD_CHECK_DAY_POLICY_NAME,
  PASSWORD_CHECK_HOUR_POLICY_NAME,
  PUBLIC_ORIGIN,
  accountRequest,
  captureConsole,
  cookieOfValue,
  freshAccountWorld,
  hashOf,
  hashingLedger,
  jsonOf,
  limiterLedger,
  seedSession,
  seedVerifiedAccount,
  setCookieLinesOf,
  sha256Hex,
  wireOf,
  type AccountWorld,
  type SeededAccount,
  type SeededSession,
  expectAWaitWithinTheWindowOf,
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
vi.mock("next/server", async (original) => {
  const queue = await import("../../../support/after-queue");
  return queue.nextServerModule(await original<typeof import("next/server")>());
});
vi.mock("@/lib/server/mail/create-customer-mail-sender", () =>
  import("../../../support/account-world").then((world) =>
    world.customerMailSenderModule(),
  ),
);
vi.mock("@/lib/server/account/breached-password", () =>
  import("../../../support/account-world").then((world) =>
    world.breachedPasswordModule(),
  ),
);
vi.mock("@/lib/server/account/password-hash", async (original) => {
  const world = await import("../../../support/account-world");
  return world.passwordHashModule(
    await original<typeof import("@/lib/server/account/password-hash")>(),
  );
});

const { POST } = await import("@/app/api/account/password/route");

/**
 * `POST /api/account/password` (M8B Lot 2, E7; criterion 8). The real argon2id runs; the breach check, the mail sender
 * and `after()` are replaced, so the notice is held until the test lets it go.
 */

const NEW_PASSWORD = "a brand new passphrase 77";

let world: AccountWorld;
let client: SeededAccount;
let session: SeededSession;

beforeEach(async () => {
  world = freshAccountWorld();
  captureConsole();
  vi.stubEnv("LEMNARIA_PUBLIC_ORIGIN", PUBLIC_ORIGIN);
  client = await seedVerifiedAccount({ email: "client@example.test" });
  session = await seedSession(client);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function change(
  json: unknown,
  init: Parameters<typeof accountRequest>[1] = {},
) {
  return POST(
    accountRequest("/api/account/password", {
      method: "POST",
      json,
      cookie: session.cookie,
      ...init,
    }),
  );
}

function aChange(overrides: Record<string, unknown> = {}) {
  return {
    currentPassword: DEFAULT_PASSWORD,
    newPassword: NEW_PASSWORD,
    ...overrides,
  };
}

async function storedHash(account: SeededAccount = client): Promise<string> {
  const found = await world.accounts.findById(account.id);
  if (found.kind !== "found") throw new Error("account lost");
  return found.account.passwordHash;
}

async function isLive(tokenHash: string): Promise<boolean> {
  const lookup = await world.sessions.findLive({
    tokenHash,
    idleLifetimeSeconds: IDLE_LIFETIME_SECONDS_BY_ROLE,
  });
  return lookup.kind === "live";
}

function sessionCookieOf(answer: Response): { line: string; value: string } {
  const lines = setCookieLinesOf(answer).filter((line) =>
    line.startsWith(`${SESSION_COOKIE_NAME}=`),
  );
  expect(lines).toHaveLength(1);
  const line = lines[0] ?? "";
  return { line, value: line.split(";")[0]?.split("=")[1] ?? "" };
}

describe("the order of the checks", () => {
  it("refuses a cross-site request, a body that is not JSON and one that is too large before the session is read", async () => {
    world.calls.length = 0;

    const crossSite = await change(aChange(), {
      secFetchSite: "cross-site",
      cookie: "",
    });
    const notJson = await change("{}", {
      contentType: "text/plain",
      cookie: "",
    });
    const tooLarge = await change(
      JSON.stringify({ filler: "x".repeat(9000) }),
      { cookie: "" },
    );

    expect([crossSite.status, notJson.status, tooLarge.status]).toEqual([
      403, 415, 413,
    ]);
    expect(world.calls).toEqual([]);
    expect(limiterLedger.counted).toEqual([]);
    expect(hashingLedger).toMatchObject({ checks: 0, hashes: 0 });
  });

  it("answers 401 with no live session, and 503 rather than 401 when the session store fails", async () => {
    const anonymous = await change(aChange(), { cookie: "" });
    world.failOn("sessions.findLive");
    const down = await change(aChange());

    expect(anonymous.status).toBe(401);
    expect(down.status).toBe(503);
    expect(limiterLedger.counted).toEqual([]);
  });

  it.each([
    ["an empty body", ""],
    ["text", "nope"],
    ["an array", "[]"],
  ])(
    "answers 400 invalid-request to %s, counting nothing and hashing nothing",
    async (_label, body) => {
      const answer = await change(body);

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({ status: "invalid-request" });
      expect(limiterLedger.counted).toEqual([]);
      expect(hashingLedger).toMatchObject({ checks: 0, hashes: 0 });
    },
  );

  it.each([
    [
      "no current password",
      { newPassword: NEW_PASSWORD },
      { field: "currentPassword", code: "PASSWORD_NOT_TEXT" },
    ],
    [
      "a current password that is not text",
      aChange({ currentPassword: 5 }),
      { field: "currentPassword", code: "PASSWORD_NOT_TEXT" },
    ],
    [
      "no new password",
      { currentPassword: DEFAULT_PASSWORD },
      { field: "newPassword", code: "PASSWORD_NOT_TEXT" },
    ],
    [
      "a new password that is not text",
      aChange({ newPassword: null }),
      { field: "newPassword", code: "PASSWORD_NOT_TEXT" },
    ],
    [
      "a new password of 11 characters",
      aChange({ newPassword: "x".repeat(11) }),
      { field: "newPassword", code: "PASSWORD_TOO_SHORT" },
    ],
    [
      "a new password of 129 characters",
      aChange({ newPassword: "x".repeat(129) }),
      { field: "newPassword", code: "PASSWORD_TOO_LONG" },
    ],
    [
      "a new password that is the account's address",
      aChange({ newPassword: "Client@Example.test" }),
      { field: "newPassword", code: "PASSWORD_IS_EMAIL" },
    ],
  ])(
    "answers 400 invalid-input, one field and one code, to %s, before anything is counted or hashed",
    async (_label, body, issue) => {
      const answer = await change(body);

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({
        status: "invalid-input",
        issues: [issue],
      });
      expect(limiterLedger.counted).toEqual([]);
      expect(hashingLedger).toMatchObject({ checks: 0, hashes: 0 });
      expect(world.calls).not.toContain("accounts.findById");
    },
  );

  it("judges the new password's shape the same whatever the current one is: a wrong current changes nothing about the 400", async () => {
    const right = await change(aChange({ newPassword: "short" }));
    const wrong = await change(
      aChange({ currentPassword: "not the password", newPassword: "short" }),
    );
    const refusedLength = await change(
      aChange({ currentPassword: "x", newPassword: "short" }),
    );

    expect(await wireOf(wrong)).toBe(await wireOf(right));
    expect(await wireOf(refusedLength)).toBe(await wireOf(right));
  });

  it("reports the current password's issue before the new one's", async () => {
    const answer = await change({});

    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "currentPassword", code: "PASSWORD_NOT_TEXT" }],
    });
  });

  it("counts the hour's and the day's password-check bucket, in that order, before any lookup or any hash", async () => {
    world.calls.length = 0;
    limiterLedger.refusing.set(PASSWORD_CHECK_DAY_POLICY_NAME, 5000);

    const answer = await change(aChange());

    expect(answer.status).toBe(429);
    expectAWaitWithinTheWindowOf(answer, PASSWORD_CHECK_DAY_POLICY_NAME);
    expect(await jsonOf(answer)).toEqual({ status: "rate-limited" });
    expect(limiterLedger.counted).toEqual([
      PASSWORD_CHECK_HOUR_POLICY_NAME,
      PASSWORD_CHECK_DAY_POLICY_NAME,
    ]);
    expect(world.calls).not.toContain("accounts.findById");
    expect(hashingLedger).toMatchObject({ checks: 0, hashes: 0 });
  });

  it("stops at the hour's bucket when it refuses, and does not count the day's", async () => {
    limiterLedger.refusing.set(PASSWORD_CHECK_HOUR_POLICY_NAME, 100);

    const answer = await change(aChange());

    expect(answer.status).toBe(429);
    expect(limiterLedger.counted).toEqual([PASSWORD_CHECK_HOUR_POLICY_NAME]);
  });

  it("fails closed, 503 and nothing hashed, when the limiter cannot judge", async () => {
    limiterLedger.unavailable.add(PASSWORD_CHECK_HOUR_POLICY_NAME);

    const answer = await change(aChange());

    expect(answer.status).toBe(503);
    expect(hashingLedger).toMatchObject({ checks: 0, hashes: 0 });
  });

  it("answers 503, not wrong-password, when the platform cannot compute the verification", async () => {
    hashingLedger.failChecks = true;

    const answer = await change(aChange());

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(await storedHash()).toBe(client.passwordHash);
  });

  it("answers 401 for a live session whose account the table has lost", async () => {
    world.intercept("accounts.findById", () =>
      Promise.resolve({ kind: "none" }),
    );

    const answer = await change(aChange());

    expect(answer.status).toBe(401);
  });

  it("answers 503 and leaks no cause when the account store fails", async () => {
    const console_ = captureConsole();
    world.failOn("accounts.findById");

    const answer = await change(aChange());

    expect(answer.status).toBe(503);
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
  });
});

describe("a wrong current password, and a text no password can be", () => {
  const WRONG_TEXTS = [
    ["a wrong password of a valid length", "this is not the password"],
    ["a text one short of the minimum", "x".repeat(11)],
    ["an empty text", ""],
    ["a text over the maximum", "y".repeat(129)],
    ["a text so long it is refused before it is normalised", "z".repeat(2000)],
  ] as const;

  async function wrongAttempt(currentPassword: string) {
    world = freshAccountWorld();
    captureConsole();
    client = await seedVerifiedAccount({ email: "client@example.test" });
    session = await seedSession(client);
    const answer = await change(aChange({ currentPassword }));
    return {
      answer,
      counted: [...limiterLedger.counted],
      checks: hashingLedger.checks,
      hashes: hashingLedger.hashes,
    };
  }

  it("answers every one the same 400 wrong-password, to the byte", async () => {
    const reference = await wrongAttempt(WRONG_TEXTS[0][1]);
    expect(reference.answer.status).toBe(400);
    expect(await jsonOf(reference.answer)).toEqual({
      status: "wrong-password",
    });

    for (const [label, text] of WRONG_TEXTS) {
      const attempt = await wrongAttempt(text);

      expect(await wireOf(attempt.answer), label).toBe(
        await wireOf(reference.answer),
      );
    }
  });

  it("does the same work for each: the same two buckets, exactly one verification and no hash of a new password", async () => {
    const reference = await wrongAttempt(WRONG_TEXTS[0][1]);

    for (const [label, text] of WRONG_TEXTS) {
      const attempt = await wrongAttempt(text);

      expect(attempt.counted, label).toEqual([
        PASSWORD_CHECK_HOUR_POLICY_NAME,
        PASSWORD_CHECK_DAY_POLICY_NAME,
      ]);
      expect(attempt.counted, label).toEqual(reference.counted);
      expect(attempt.checks, label).toBe(1);
      expect(attempt.hashes, label).toBe(0);
    }
  });

  it("changes nothing: the hash, every session and every token stay, and no cookie is set or notice queued", async () => {
    const other = await seedSession(client);

    const answer = await change(
      aChange({ currentPassword: "this is not the password" }),
    );

    expect(answer.status).toBe(400);
    expect(await storedHash()).toBe(client.passwordHash);
    expect(await isLive(session.tokenHash)).toBe(true);
    expect(await isLive(other.tokenHash)).toBe(true);
    expect(setCookieLinesOf(answer)).toEqual([]);
    expect(pendingAfterTasks()).toBe(0);
  });

  it("does not breach-check the new password for a request whose current password is wrong", async () => {
    world.breach = "breached";

    const answer = await change(
      aChange({ currentPassword: "this is not the password" }),
    );

    expect(await jsonOf(answer)).toEqual({ status: "wrong-password" });
  });
});

describe("the new password", () => {
  it("is refused as breached after the current password verified, with nothing changed and nothing hashed", async () => {
    world.breach = "breached";

    const answer = await change(aChange());

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "newPassword", code: "PASSWORD_BREACHED" }],
    });
    expect(hashingLedger).toMatchObject({ checks: 1, hashes: 0 });
    expect(await storedHash()).toBe(client.passwordHash);
  });

  it("is accepted when the breach service cannot say", async () => {
    world.breach = "unknown";

    const answer = await change(aChange());

    expect(answer.status).toBe(200);
  });

  it("is stored in its NFKC form, so the form that was typed and the form that was stored open the account alike", async () => {
    const typed = "ｆｕｌｌｗｉｄｔｈ passphrase 1";

    const answer = await change(aChange({ newPassword: typed }));

    expect(answer.status).toBe(200);
    const stored = await storedHash();
    expect(
      await checkPassword({ password: typed.normalize("NFKC"), phc: stored }),
    ).toBe("match");
    expect(await checkPassword({ password: typed, phc: stored })).toBe(
      "mismatch",
    );
  });

  it("may equal the old one: nothing forbids a change to the same text, and a new hash is made", async () => {
    const answer = await change(aChange({ newPassword: DEFAULT_PASSWORD }));

    expect(answer.status).toBe(200);
    expect(await storedHash()).not.toBe(client.passwordHash);
  });
});

describe("an existing password is not judged as a chosen one", () => {
  it("lets an account whose password equals its address change it: that rule is for choosing a password", async () => {
    world = freshAccountWorld();
    captureConsole();
    client = await seedVerifiedAccount({
      email: "same.as.password@example.test",
      password: "same.as.password@example.test",
    });
    session = await seedSession(client);

    const answer = await change(
      aChange({ currentPassword: "same.as.password@example.test" }),
    );

    expect(answer.status).toBe(200);
    expect(
      await checkPassword({ password: NEW_PASSWORD, phc: await storedHash() }),
    ).toBe("match");
  });
});

describe("a change that takes effect", () => {
  it("answers 200 password-changed, private and no-store, and holds no password, hash or address", async () => {
    const answer = await change(aChange());

    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
    expect(await jsonOf(answer)).toEqual({ status: "password-changed" });
    const text = await answer.clone().text();
    expect(text).not.toContain(NEW_PASSWORD);
    expect(text).not.toContain(DEFAULT_PASSWORD);
  });

  it("verifies the new password against the stored hash, and the old one no longer", async () => {
    await change(aChange());

    const stored = await storedHash();
    expect(stored).not.toBe(client.passwordHash);
    expect(await checkPassword({ password: NEW_PASSWORD, phc: stored })).toBe(
      "match",
    );
    expect(
      await checkPassword({ password: DEFAULT_PASSWORD, phc: stored }),
    ).toBe("mismatch");
  });

  it("verifies once and hashes once, after the same two buckets", async () => {
    await change(aChange());

    expect(limiterLedger.counted).toEqual([
      PASSWORD_CHECK_HOUR_POLICY_NAME,
      PASSWORD_CHECK_DAY_POLICY_NAME,
    ]);
    expect(hashingLedger).toMatchObject({ checks: 1, hashes: 1 });
  });

  it("ends every session the account had, this device's old cookie included", async () => {
    const otherDevice = await seedSession(client);
    const stranger = await seedVerifiedAccount({
      email: "stranger@example.test",
    });
    const strangerSession = await seedSession(stranger);

    await change(aChange());

    expect(await isLive(session.tokenHash)).toBe(false);
    expect(await isLive(otherDevice.tokenHash)).toBe(false);
    expect(await isLive(strangerSession.tokenHash)).toBe(true);
  });

  it("sets exactly one new session cookie on the response, live and bound to the new hash, with the client's lifetime", async () => {
    const answer = await change(aChange());

    const { line, value } = sessionCookieOf(answer);
    expect(setCookieLinesOf(answer)).toHaveLength(1);
    expect(line).toMatch(/Max-Age=7776000/);
    expect(line).toMatch(/HttpOnly/);
    expect(line).toMatch(/Secure/);
    expect(line).toMatch(/SameSite=lax/i);
    expect(line).toMatch(/Path=\//);
    expect(line).not.toMatch(/Domain=/i);
    expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(value).not.toBe(session.value);
    expect(await isLive(sha256Hex(value))).toBe(true);
    expect(cookieOfValue(value)).toContain(SESSION_COOKIE_NAME);
  });

  it("moves password_changed_at forward", async () => {
    const before =
      world.accounts.passwordChangedAtOf(client.id)?.getTime() ?? 0;
    world.advance(5000);

    await change(aChange());

    expect(
      world.accounts.passwordChangedAtOf(client.id)?.getTime() ?? 0,
    ).toBeGreaterThan(before);
  });

  it("retires every unused e-mail token of the account, of every purpose, and no other account's", async () => {
    const stranger = await seedVerifiedAccount({
      email: "stranger@example.test",
    });
    const expiresAt = new Date(world.now().getTime() + 86_400_000);
    await world.accounts.issueToken({
      accountId: client.id,
      purpose: "reset-password",
      tokenHash: sha256Hex("reset"),
      expiresAt,
    });
    await world.accounts.issueToken({
      accountId: client.id,
      purpose: "verify-email",
      tokenHash: sha256Hex("verify"),
      expiresAt,
    });
    await world.accounts.issueEmailChangeToken({
      accountId: client.id,
      verifiedPasswordHash: client.passwordHash,
      newEmail: "new@example.test",
      newEmailNormalForm: "new@example.test",
      tokenHash: sha256Hex("change"),
      expiresAt,
    });
    await world.accounts.issueToken({
      accountId: stranger.id,
      purpose: "reset-password",
      tokenHash: sha256Hex("theirs"),
      expiresAt,
    });

    await change(aChange());

    const held = world.accounts.heldTokens();
    const mine = held.filter(({ accountId }) => accountId === client.id);
    const theirs = held.filter(
      ({ accountId, purpose }) =>
        accountId === stranger.id && purpose === "reset-password",
    );
    expect(mine.length).toBeGreaterThanOrEqual(3);
    expect(mine.every(({ usedAt }) => usedAt !== undefined)).toBe(true);
    expect(theirs).toHaveLength(1);
    expect(theirs.every(({ usedAt }) => usedAt === undefined)).toBe(true);
  });

  it("queues the notice after the response and sends it to the account's address only when the queue runs", async () => {
    const answer = await change(aChange());

    expect(answer.status).toBe(200);
    expect(pendingAfterTasks()).toBeGreaterThan(0);
    expect(world.mail.sent).toEqual([]);

    await drainAfterTasks();

    expect(world.mail.sent).toHaveLength(1);
    expect(world.mail.sent[0]?.recipient).toBe(client.email);
    expect(world.mail.sent[0]?.key).toMatch(
      /^account-mail\/password-changed\//,
    );
    expect(world.mail.sent[0]?.text).not.toContain(NEW_PASSWORD);
  });

  it("changes the password of the session's account alone", async () => {
    const stranger = await seedVerifiedAccount({
      email: "stranger@example.test",
    });

    await change(aChange({ accountId: stranger.id, email: stranger.email }));

    expect(await storedHash(stranger)).toBe(stranger.passwordHash);
    expect(await storedHash()).not.toBe(client.passwordHash);
  });

  it("lets staff change their own password", async () => {
    const staff = await seedVerifiedAccount({
      email: "staff@example.test",
      role: "operator",
    });
    const staffSession = await seedSession(staff);

    const answer = await change(aChange(), { cookie: staffSession.cookie });

    expect(answer.status).toBe(200);
    expect(sessionCookieOf(answer).line).toMatch(/Max-Age=604800/);
  });
});

describe("a change whose replacing session cannot be started", () => {
  async function expectChangedButSignedOut(answer: Response) {
    expect(answer.status).toBe(401);
    expect(await jsonOf(answer)).toEqual({
      status: "password-changed-sign-in",
    });
    const { line, value } = sessionCookieOf(answer);
    expect(value).toBe("");
    expect(line).toMatch(/Max-Age=0/);
    expect(line).toMatch(/HttpOnly/);
    expect(line).toMatch(/Secure/);
    expect(
      await checkPassword({ password: NEW_PASSWORD, phc: await storedHash() }),
    ).toBe("match");
    expect(await isLive(session.tokenHash)).toBe(false);
  }

  it.each([
    ["stale: a racing change replaced the hash", { kind: "stale" }],
    ["refused: the account vanished", { kind: "refused" }],
  ])(
    "answers 401 password-changed-sign-in, clearing the cookie, when the session store says %s",
    async (_label, outcome) => {
      world.intercept("sessions.create", () => Promise.resolve(outcome));

      await expectChangedButSignedOut(await change(aChange()));
    },
  );

  it("answers 401 password-changed-sign-in, never 200, when the session store fails", async () => {
    const console_ = captureConsole();
    world.failOn("sessions.create");

    await expectChangedButSignedOut(await change(aChange()));
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
    expect(console_.accountLines()).toContainEqual({
      event: "password-change",
      outcome: "unavailable",
    });
  });

  it("still queues the notice: the password did change", async () => {
    world.failOn("sessions.create");

    await change(aChange());

    expect(pendingAfterTasks()).toBeGreaterThan(0);
  });
});

describe("a change that races another", () => {
  it("answers wrong-password and starts no session when the compare-and-set finds the hash already replaced", async () => {
    const racing = await hashOf("somebody else got there first 1");
    world.intercept("accounts.changePassword", async (real) => {
      await world.accounts.replacePasswordHash({
        accountId: client.id,
        expectedPasswordHash: client.passwordHash,
        passwordHash: racing,
      });
      return real();
    });

    const answer = await change(aChange());

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({ status: "wrong-password" });
    expect(setCookieLinesOf(answer)).toEqual([]);
    expect(await storedHash()).toBe(racing);
    expect(pendingAfterTasks()).toBe(0);
    expect(await isLive(session.tokenHash)).toBe(true);
  });

  it("answers the success it is when the change committed and its acknowledgement was lost", async () => {
    world.intercept("accounts.changePassword", async (real) => {
      await real();
      throw new Error(DRIVER_FAILURE_MARKER);
    });

    const answer = await change(aChange());

    expect(answer.status).toBe(200);
    expect(
      await checkPassword({ password: NEW_PASSWORD, phc: await storedHash() }),
    ).toBe("match");
    expect(sessionCookieOf(answer).value).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("answers 503 and changes nothing when the change did not commit", async () => {
    world.failOn("accounts.changePassword");

    const answer = await change(aChange());

    expect(answer.status).toBe(503);
    expect(await storedHash()).toBe(client.passwordHash);
    expect(await isLive(session.tokenHash)).toBe(true);
    expect(setCookieLinesOf(answer)).toEqual([]);
  });

  it("answers 503, not success, when the lost acknowledgement cannot be checked either", async () => {
    let reads = 0;
    world.intercept("accounts.findById", (real) =>
      reads++ === 0 ? real() : Promise.reject(new Error(DRIVER_FAILURE_MARKER)),
    );
    world.failOn("accounts.changePassword");

    const answer = await change(aChange());

    expect(answer.status).toBe(503);
  });
});
