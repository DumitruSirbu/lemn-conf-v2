import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as catchAllPost } from "@/app/api/[...unmatched]/route";
import { buildAccountMail } from "@/lib/server/mail/account-mail-messages";
import { IDLE_LIFETIME_SECONDS_BY_ROLE } from "@/lib/server/account/session-lifetimes";

import {
  drainAfterTasks,
  pendingAfterTasks,
} from "../../../support/after-queue";
import {
  DEFAULT_PASSWORD,
  DRIVER_FAILURE_MARKER,
  EMAIL_CHANGE_BY_ACCOUNT_POLICY_NAME,
  EMAIL_CHANGE_MAIL_POLICY_NAME,
  PASSWORD_CHECK_DAY_POLICY_NAME,
  PASSWORD_CHECK_HOUR_POLICY_NAME,
  PUBLIC_ORIGIN,
  TOKEN_COMPLETE_POLICY_NAME,
  accountRequest,
  captureConsole,
  freshAccountWorld,
  hashOf,
  hashingLedger,
  jsonOf,
  limiterLedger,
  seedSession,
  seedUnverifiedAccount,
  seedVerifiedAccount,
  setCookieLinesOf,
  sha256Hex,
  wireOf,
  type AccountWorld,
  type SeededAccount,
  type SeededSession,
  expectAWaitWithinTheWindowOf,
} from "../../../support/account-world";

const flag = vi.hoisted(() => ({ on: false }));

vi.mock("@/account/profile/email-change-enabled", () => ({
  get EMAIL_CHANGE_ENABLED() {
    return flag.on;
  },
}));
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
vi.mock("@/lib/server/account/password-hash", async (original) => {
  const world = await import("../../../support/account-world");
  return world.passwordHashModule(
    await original<typeof import("@/lib/server/account/password-hash")>(),
  );
});

const { POST: requestChange } = await import(
  "@/app/api/account/email-change/route"
);
const { POST: confirmChange } = await import(
  "@/app/api/account/email-change/confirm/route"
);

/**
 * E8 and E9 (M8B Lot 2; criteria 9 and 10; ADR 0172 Amendment G and the S9 security fixes). While `EMAIL_CHANGE_ENABLED`
 * is off both answer the empty 404 of an address that does not exist and run nothing; with it mocked on, E8 answers
 * the same 202 for every address and E9 the same 400 for every link that does not work.
 */

const NEW_ADDRESS = "New.Address@Example.test";
const TOKEN_LINK = /\/account\/confirm-email#t=([A-Za-z0-9_-]{43})/;

let world: AccountWorld;
let client: SeededAccount;
let session: SeededSession;

beforeEach(async () => {
  flag.on = true;
  world = freshAccountWorld();
  captureConsole();
  vi.stubEnv("LEMNARIA_PUBLIC_ORIGIN", PUBLIC_ORIGIN);
  client = await seedVerifiedAccount({
    email: "client@example.test",
    locale: "ru",
  });
  session = await seedSession(client);
});

afterEach(() => {
  flag.on = false;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function ask(json: unknown, init: Parameters<typeof accountRequest>[1] = {}) {
  return requestChange(
    accountRequest("/api/account/email-change", {
      method: "POST",
      json,
      cookie: session.cookie,
      ...init,
    }),
  );
}

function anAsk(overrides: Record<string, unknown> = {}) {
  return {
    newEmail: NEW_ADDRESS,
    currentPassword: DEFAULT_PASSWORD,
    ...overrides,
  };
}

function confirm(
  json: unknown,
  init: Parameters<typeof accountRequest>[1] = {},
) {
  return confirmChange(
    accountRequest("/api/account/email-change/confirm", {
      method: "POST",
      json,
      ...init,
    }),
  );
}

function aTokenValue(): string {
  return randomBytes(32).toString("base64url");
}

async function issueLink({
  account = client,
  newEmail = NEW_ADDRESS,
  lifetimeMs = 86_400_000,
}: {
  account?: SeededAccount;
  newEmail?: string;
  lifetimeMs?: number;
} = {}): Promise<string> {
  const value = aTokenValue();
  const issued = await world.accounts.issueEmailChangeToken({
    accountId: account.id,
    verifiedPasswordHash: account.passwordHash,
    newEmail,
    newEmailNormalForm: newEmail.toLowerCase(),
    tokenHash: sha256Hex(value),
    expiresAt: new Date(world.now().getTime() + lifetimeMs),
  });
  expect(issued.kind).toBe("issued");
  return value;
}

async function isLive(tokenHash: string): Promise<boolean> {
  const lookup = await world.sessions.findLive({
    tokenHash,
    idleLifetimeSeconds: IDLE_LIFETIME_SECONDS_BY_ROLE,
  });
  return lookup.kind === "live";
}

function changeTokens() {
  return world.accounts
    .heldTokens()
    .filter(({ purpose }) => purpose === "email-change");
}

function revertTokens() {
  return world.accounts
    .heldTokens()
    .filter(({ purpose }) => purpose === "email-change-revert");
}

describe("while EMAIL_CHANGE_ENABLED is off", () => {
  beforeEach(() => {
    flag.on = false;
  });

  async function expectEmptyNotFound(answer: Response) {
    expect(answer.status).toBe(404);
    expect(await answer.clone().text()).toBe("");
    expect(answer.headers.get("cache-control")).toBe("no-store");
    expect(setCookieLinesOf(answer)).toEqual([]);
  }

  it("answers E8 the empty 404 an unknown /api address gets, byte for byte", async () => {
    const answer = await ask(anAsk());

    await expectEmptyNotFound(answer);
    const unknown = catchAllPost();
    expect(await wireOf(answer)).toBe(await wireOf(unknown));
  });

  it("answers E9 the empty 404 an unknown /api address gets, byte for byte", async () => {
    const answer = await confirm({ token: aTokenValue() });

    await expectEmptyNotFound(answer);
    expect(await wireOf(answer)).toBe(await wireOf(catchAllPost()));
  });

  it.each([
    ["a valid request of a signed-in client", {}],
    ["a cross-site request", { secFetchSite: "cross-site" }],
    ["a body that is not JSON", { contentType: "text/plain" }],
    ["a request with no session", { cookie: "" }],
    ["a body past the bound", { json: "x".repeat(20_000) }],
  ])(
    "answers both the same for %s: the guard comes before the cross-site, media-type and body checks",
    async (_label, init) => {
      const first = await ask(anAsk(), init);
      const second = await confirm({ token: aTokenValue() }, init);

      expect(await wireOf(first)).toBe(await wireOf(catchAllPost()));
      expect(await wireOf(second)).toBe(await wireOf(catchAllPost()));
    },
  );

  it("reads, counts, logs and queues nothing, and never touches the body", async () => {
    const console_ = captureConsole();
    const request = accountRequest("/api/account/email-change", {
      method: "POST",
      json: anAsk(),
      cookie: session.cookie,
    });
    world.calls.length = 0;

    await requestChange(request);
    const confirmRequest = accountRequest("/api/account/email-change/confirm", {
      method: "POST",
      json: { token: aTokenValue() },
    });
    await confirmChange(confirmRequest);

    expect(request.bodyUsed).toBe(false);
    expect(confirmRequest.bodyUsed).toBe(false);
    expect(world.calls).toEqual([]);
    expect(limiterLedger.counted).toEqual([]);
    expect(hashingLedger).toMatchObject({ checks: 0, hashes: 0 });
    expect(pendingAfterTasks()).toBe(0);
    expect(console_.everything()).toBe("[]");
    expect(world.mail.sent).toEqual([]);
  });

  it("changes nothing even for a valid token: the address stays and the sessions live", async () => {
    const token = await issueLink();

    await confirm({ token });

    expect(await world.accounts.findById(client.id)).toMatchObject({
      account: { email: client.email },
    });
    expect(await isLive(session.tokenHash)).toBe(true);
  });
});

describe("E8 with the flag on: the order of the checks", () => {
  it("refuses a cross-site request, a body that is not JSON and one that is too large before the session is read", async () => {
    world.calls.length = 0;

    const crossSite = await ask(anAsk(), { secFetchSite: "cross-site" });
    const notJson = await ask("{}", { contentType: "text/plain" });
    const tooLarge = await ask(JSON.stringify({ filler: "x".repeat(9000) }));

    expect([crossSite.status, notJson.status, tooLarge.status]).toEqual([
      403, 415, 413,
    ]);
    expect(world.calls).toEqual([]);
    expect(limiterLedger.counted).toEqual([]);
  });

  it("answers 401 with no live session and 503 when the session store fails", async () => {
    const anonymous = await ask(anAsk(), { cookie: "" });
    world.failOn("sessions.findLive");
    const down = await ask(anAsk());

    expect(anonymous.status).toBe(401);
    expect(down.status).toBe(503);
  });

  it.each([
    ["a body that is not an object", "[]", { status: "invalid-request" }],
    ["text", "nope", { status: "invalid-request" }],
  ])("answers 400 to %s", async (_label, body, expected) => {
    const answer = await ask(body);

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual(expected);
  });

  it.each([
    [
      "no current password",
      { newEmail: NEW_ADDRESS },
      { field: "currentPassword", code: "PASSWORD_NOT_TEXT" },
    ],
    [
      "a current password that is not text",
      anAsk({ currentPassword: 5 }),
      { field: "currentPassword", code: "PASSWORD_NOT_TEXT" },
    ],
    [
      "no new address",
      { currentPassword: DEFAULT_PASSWORD },
      { field: "newEmail", code: "REQUIRED" },
    ],
    [
      "a new address that is not text (read as none given)",
      anAsk({ newEmail: 5 }),
      { field: "newEmail", code: "REQUIRED" },
    ],
    [
      "a new address that is not an address",
      anAsk({ newEmail: "nope" }),
      { field: "newEmail", code: "MALFORMED" },
    ],
    [
      "a new address with a control character",
      anAsk({ newEmail: "a\u0007@example.test" }),
      { field: "newEmail", code: "FORBIDDEN_CHARACTER" },
    ],
    [
      "a new address past the bound",
      anAsk({ newEmail: `${"a".repeat(250)}@example.test` }),
      { field: "newEmail", code: "TOO_LONG" },
    ],
  ])(
    "answers 400 invalid-input, one field and one code, to %s, before anything is counted, hashed or sent",
    async (_label, body, issue) => {
      const answer = await ask(body);

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({
        status: "invalid-input",
        issues: [issue],
      });
      expect(limiterLedger.counted).toEqual([]);
      expect(hashingLedger.checks).toBe(0);
      expect(pendingAfterTasks()).toBe(0);
    },
  );

  it("reports the current password's issue before the new address's", async () => {
    const answer = await ask({ newEmail: "nope" });

    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "currentPassword", code: "PASSWORD_NOT_TEXT" }],
    });
  });

  it("answers 503 before the limiter and before any lookup when no mail can be written, the same for every address", async () => {
    vi.stubEnv("LEMNARIA_PUBLIC_ORIGIN", "");
    world.calls.length = 0;

    const own = await ask(anAsk({ newEmail: client.email }));
    const free = await ask(anAsk());

    expect(own.status).toBe(503);
    expect(await wireOf(own)).toBe(await wireOf(free));
    expect(limiterLedger.counted).toEqual([]);
    expect(hashingLedger.checks).toBe(0);
    expect(world.calls).not.toContain("accounts.findById");
  });

  it("counts the password-check buckets, hour then day, before any lookup or verification", async () => {
    limiterLedger.refusing.set(PASSWORD_CHECK_DAY_POLICY_NAME, 700);
    world.calls.length = 0;

    const answer = await ask(anAsk());

    expect(answer.status).toBe(429);
    expectAWaitWithinTheWindowOf(answer, PASSWORD_CHECK_DAY_POLICY_NAME);
    expect(limiterLedger.counted).toEqual([
      PASSWORD_CHECK_HOUR_POLICY_NAME,
      PASSWORD_CHECK_DAY_POLICY_NAME,
    ]);
    expect(world.calls).not.toContain("accounts.findById");
    expect(hashingLedger.checks).toBe(0);
  });

  it("answers the same 400 wrong-password to a wrong password and to a text no password can be, verifying once, counting no mail bucket and queueing nothing", async () => {
    const wrong = await ask(
      anAsk({ currentPassword: "this is not the password" }),
    );
    const countedForWrong = [...limiterLedger.counted];
    const checksForWrong = hashingLedger.checks;
    const refused = await ask(anAsk({ currentPassword: "short" }));

    expect(wrong.status).toBe(400);
    expect(await jsonOf(wrong)).toEqual({ status: "wrong-password" });
    expect(await wireOf(refused)).toBe(await wireOf(wrong));
    expect(countedForWrong).toEqual([
      PASSWORD_CHECK_HOUR_POLICY_NAME,
      PASSWORD_CHECK_DAY_POLICY_NAME,
    ]);
    expect(checksForWrong).toBe(1);
    expect(hashingLedger.checks).toBe(2);
    expect(pendingAfterTasks()).toBe(0);
  });

  it("answers 503, not wrong-password, when the platform cannot compute the verification", async () => {
    hashingLedger.failChecks = true;

    const answer = await ask(anAsk());

    expect(answer.status).toBe(503);
    expect(pendingAfterTasks()).toBe(0);
  });

  it("counts the account's own cap, then the address asked for, only after the password verified", async () => {
    const answer = await ask(anAsk());

    expect(answer.status).toBe(202);
    expect(limiterLedger.counted).toEqual([
      PASSWORD_CHECK_HOUR_POLICY_NAME,
      PASSWORD_CHECK_DAY_POLICY_NAME,
      EMAIL_CHANGE_BY_ACCOUNT_POLICY_NAME,
      EMAIL_CHANGE_MAIL_POLICY_NAME,
    ]);
    expect(hashingLedger.checks).toBe(1);
  });

  it("stops at the account's cap when it refuses: the address's bucket is not counted and nothing is queued", async () => {
    limiterLedger.refusing.set(EMAIL_CHANGE_BY_ACCOUNT_POLICY_NAME, 800);

    const answer = await ask(anAsk());

    expect(answer.status).toBe(429);
    expectAWaitWithinTheWindowOf(answer, EMAIL_CHANGE_BY_ACCOUNT_POLICY_NAME);
    expect(limiterLedger.counted.at(-1)).toBe(
      EMAIL_CHANGE_BY_ACCOUNT_POLICY_NAME,
    );
    expect(limiterLedger.counted).not.toContain(EMAIL_CHANGE_MAIL_POLICY_NAME);
    expect(pendingAfterTasks()).toBe(0);
  });

  it("answers 429 when the address's bucket refuses, queueing nothing", async () => {
    limiterLedger.refusing.set(EMAIL_CHANGE_MAIL_POLICY_NAME, 900);

    const answer = await ask(anAsk());

    expect(answer.status).toBe(429);
    expect(limiterLedger.counted.at(-1)).toBe(EMAIL_CHANGE_MAIL_POLICY_NAME);
    expect(pendingAfterTasks()).toBe(0);
  });

  it("fails closed when a mail bucket cannot be judged", async () => {
    limiterLedger.unavailable.add(EMAIL_CHANGE_MAIL_POLICY_NAME);

    const answer = await ask(anAsk());

    expect(answer.status).toBe(503);
    expect(pendingAfterTasks()).toBe(0);
  });

  it("answers 401 for a live session whose account the table has lost", async () => {
    world.intercept("accounts.findById", () =>
      Promise.resolve({ kind: "none" }),
    );

    expect((await ask(anAsk())).status).toBe(401);
  });

  it("leaks no cause when the account store fails", async () => {
    const console_ = captureConsole();
    world.failOn("accounts.findById");

    const answer = await ask(anAsk());

    expect(answer.status).toBe(503);
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
  });
});

describe("E8 with the flag on: one answer for every address", () => {
  const CASES = [
    {
      label: "a free address",
      newEmail: NEW_ADDRESS,
      seed: () => undefined,
    },
    {
      label: "the caller's own address",
      newEmail: "client@example.test",
      seed: () => undefined,
    },
    {
      label: "the caller's own address in other letters",
      newEmail: "CLIENT@Example.TEST",
      seed: () => undefined,
    },
    {
      label: "an address a confirmed account holds",
      newEmail: "holder@example.test",
      seed: async () => {
        await seedVerifiedAccount({
          email: "holder@example.test",
          locale: "ro",
        });
      },
    },
    {
      label: "an address an unconfirmed account holds",
      newEmail: "pending@example.test",
      seed: async () => {
        await seedUnverifiedAccount("pending@example.test");
      },
    },
  ] as const;

  async function runCase(testCase: (typeof CASES)[number]) {
    world = freshAccountWorld();
    captureConsole();
    client = await seedVerifiedAccount({
      email: "client@example.test",
      locale: "ru",
    });
    session = await seedSession(client);
    await testCase.seed();
    world.calls.length = 0;
    const answer = await ask(anAsk({ newEmail: testCase.newEmail }));
    return {
      answer,
      calls: [...world.calls],
      counted: [...limiterLedger.counted],
      checks: hashingLedger.checks,
      queued: pendingAfterTasks(),
      mailBeforeDrain: world.mail.sent.length,
      tokensBeforeDrain: changeTokens().length,
    };
  }

  it("answers 202 check-inbox, private and no-store, with a body of that word alone", async () => {
    const { answer } = await runCase(CASES[0]);

    expect(answer.status).toBe(202);
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
    expect(await jsonOf(answer)).toEqual({ status: "check-inbox" });
  });

  it("answers the same bytes for each, after the same buckets, the same reads and one queued job", async () => {
    const reference = await runCase(CASES[0]);

    for (const testCase of CASES) {
      const run = await runCase(testCase);

      expect(await wireOf(run.answer), testCase.label).toBe(
        await wireOf(reference.answer),
      );
      expect(run.calls, testCase.label).toEqual([
        "sessions.findLive",
        "accounts.findById",
      ]);
      expect(run.calls, testCase.label).toEqual(reference.calls);
      expect(run.counted, testCase.label).toEqual(reference.counted);
      expect(run.checks, testCase.label).toBe(1);
      expect(run.queued, testCase.label).toBe(1);
    }
  });

  it("sends no mail, reads no token and writes no token before the response: all of it waits in after()", async () => {
    for (const testCase of CASES) {
      const run = await runCase(testCase);

      expect(run.mailBeforeDrain, testCase.label).toBe(0);
      expect(run.tokensBeforeDrain, testCase.label).toBe(0);
      expect(world.calls, testCase.label).not.toContain(
        "accounts.findByNormalForm",
      );
      expect(world.calls, testCase.label).not.toContain(
        "accounts.issueEmailChangeToken",
      );
    }
  });
});

describe("E8 with the flag on: what the queued job does", () => {
  async function runAndDrain(newEmail: string): Promise<void> {
    const answer = await ask(anAsk({ newEmail }));
    expect(answer.status).toBe(202);
    await drainAfterTasks();
  }

  it("for a free address issues one token holding the address as typed and its counted form, and mails the link to that address in the requester's language", async () => {
    await runAndDrain(NEW_ADDRESS);

    const [row, ...rest] = changeTokens();
    expect(rest).toEqual([]);
    expect(row).toMatchObject({
      accountId: client.id,
      newEmail: NEW_ADDRESS,
      newEmailNormalForm: NEW_ADDRESS.toLowerCase(),
    });
    expect(row?.usedAt).toBeUndefined();
    expect(world.mail.sent).toHaveLength(1);
    const [mail] = world.mail.sent;
    expect(mail?.recipient).toBe(NEW_ADDRESS);
    expect(mail?.key).toMatch(/^account-mail\/email-change\//);
    const token = TOKEN_LINK.exec(mail?.text ?? "")?.[1];
    expect(token).toBeDefined();
    expect(sha256Hex(token ?? "")).toBe(row?.tokenHash);
    expect(mail?.text).toContain(PUBLIC_ORIGIN);
    expect(mail?.text).toContain("/ru/");
    expect(mail?.html ?? "").toContain(token);
  });

  it("for the caller's own address issues no token and sends nothing", async () => {
    await runAndDrain(client.email.toUpperCase());

    expect(changeTokens()).toEqual([]);
    expect(world.mail.sent).toEqual([]);
  });

  it("for an address a confirmed account holds issues no token, and tells that account, at its address and in its language", async () => {
    await seedVerifiedAccount({ email: "holder@example.test", locale: "ro" });

    await runAndDrain("Holder@Example.test");

    expect(changeTokens()).toEqual([]);
    expect(world.mail.sent).toHaveLength(1);
    expect(world.mail.sent[0]).toMatchObject({
      recipient: "holder@example.test",
    });
    expect(world.mail.sent[0]?.key).toMatch(
      /^account-mail\/email-change-address-in-use\//,
    );
    expect(world.mail.sent[0]?.text).not.toContain(client.email);
  });

  it("for an address an unconfirmed account holds issues no token and sends nothing: its holder may be nobody", async () => {
    await seedUnverifiedAccount("pending@example.test");

    await runAndDrain("pending@example.test");

    expect(changeTokens()).toEqual([]);
    expect(world.mail.sent).toEqual([]);
  });

  it.each([
    ["a free address", NEW_ADDRESS],
    ["the caller's own address", "client@example.test"],
    ["an address another account holds", "holder@example.test"],
  ])(
    "retires the account's earlier unused links first, whatever the address is: %s",
    async (_label, newEmail) => {
      await seedVerifiedAccount({ email: "holder@example.test" });
      const earlier = await issueLink({ newEmail: "earlier@example.test" });

      await runAndDrain(newEmail);

      const old = changeTokens().find(
        ({ tokenHash }) => tokenHash === sha256Hex(earlier),
      );
      expect(old?.usedAt).toBeInstanceOf(Date);
      expect((await confirm({ token: earlier })).status).toBe(400);
      expect(await world.accounts.findById(client.id)).toMatchObject({
        account: { email: client.email },
      });
    },
  );

  it("leaves another account's links alone", async () => {
    const stranger = await seedVerifiedAccount({
      email: "stranger@example.test",
    });
    const theirs = await issueLink({
      account: stranger,
      newEmail: "theirs@example.test",
    });

    await runAndDrain(NEW_ADDRESS);

    const row = changeTokens().find(
      ({ tokenHash }) => tokenHash === sha256Hex(theirs),
    );
    expect(row?.usedAt).toBeUndefined();
  });

  it("binds the token to the password verified: a change of password after the request and before the job issues nothing and sends nothing", async () => {
    const answer = await ask(anAsk());
    expect(answer.status).toBe(202);
    world.advance(1000);
    const replaced = await world.accounts.changePassword({
      accountId: client.id,
      expectedPasswordHash: client.passwordHash,
      passwordHash: await hashOf("changed meanwhile 12345"),
    });
    expect(replaced.kind).toBe("changed");

    await drainAfterTasks();

    expect(changeTokens()).toEqual([]);
    expect(world.mail.sent).toEqual([]);
  });

  it("sends nothing and throws nothing when the job's store fails", async () => {
    const console_ = captureConsole();
    const answer = await ask(anAsk());
    world.failOn("accounts.retireEmailChangeTokens");

    await expect(drainAfterTasks()).resolves.toBeUndefined();

    expect(answer.status).toBe(202);
    expect(world.mail.sent).toEqual([]);
    expect(console_.accountLines()).toContainEqual({
      event: "email-change",
      outcome: "unavailable",
    });
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
  });
});

describe("E9 with the flag on: the order of the checks", () => {
  it("refuses a cross-site request, a body that is not JSON and one that is too large before the limiter", async () => {
    const crossSite = await confirm(
      { token: aTokenValue() },
      { secFetchSite: "cross-site" },
    );
    const notJson = await confirm("{}", { contentType: "text/plain" });
    const tooLarge = await confirm(
      JSON.stringify({ filler: "x".repeat(9000) }),
    );

    expect([crossSite.status, notJson.status, tooLarge.status]).toEqual([
      403, 415, 413,
    ]);
    expect(limiterLedger.counted).toEqual([]);
    expect(world.calls).toEqual([]);
  });

  it("counts the network's token-completion bucket before it reads the token, and reads no session at all", async () => {
    limiterLedger.refusing.set(TOKEN_COMPLETE_POLICY_NAME, 400);
    const token = await issueLink();
    world.calls.length = 0;

    const answer = await confirm({ token }, { cookie: session.cookie });

    expect(answer.status).toBe(429);
    expectAWaitWithinTheWindowOf(answer, TOKEN_COMPLETE_POLICY_NAME);
    expect(await jsonOf(answer)).toEqual({ status: "rate-limited" });
    expect(limiterLedger.counted).toEqual([TOKEN_COMPLETE_POLICY_NAME]);
    expect(world.calls).toEqual([]);
  });

  it("fails closed when the bucket cannot be judged", async () => {
    limiterLedger.unavailable.add(TOKEN_COMPLETE_POLICY_NAME);

    expect((await confirm({ token: await issueLink() })).status).toBe(503);
    expect(world.calls).toEqual([]);
  });

  it("answers 400 invalid-request to a body that is not an object, having counted the hit, and links nothing", async () => {
    const answer = await confirm("[]");

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({ status: "invalid-request" });
    expect(limiterLedger.counted).toEqual([TOKEN_COMPLETE_POLICY_NAME]);
    expect(world.calls).toEqual([]);
  });

  it("answers 503 and leaks no cause when the account store fails", async () => {
    const console_ = captureConsole();
    const token = await issueLink();
    world.failOn("accounts.confirmEmailChange");

    const answer = await confirm({ token });

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
  });
});

describe("E9 with the flag on: one refusal for every link that does not work", () => {
  async function expectedRefusal() {
    return confirm({ token: aTokenValue() });
  }

  async function expectUntouched() {
    expect(await world.accounts.findById(client.id)).toMatchObject({
      account: { email: client.email },
    });
    expect(await isLive(session.tokenHash)).toBe(true);
    expect(pendingAfterTasks()).toBe(0);
  }

  it("answers 400 link-invalid for a token that was never issued, the way every refusal below is answered", async () => {
    const answer = await expectedRefusal();

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({ status: "link-invalid" });
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each([
    ["no token", {}],
    ["a token that is not text", { token: 5 }],
    ["an empty token", { token: "" }],
    ["a token one character short", { token: "a".repeat(42) }],
    ["a token one character long", { token: "a".repeat(44) }],
    ["a token with a forbidden character", { token: `${"a".repeat(42)}+` }],
    ["a token with padding", { token: `${"a".repeat(42)}=` }],
  ])(
    "answers a malformed link (%s) the same refusal, without asking the store",
    async (_label, body) => {
      const reference = await expectedRefusal();
      world.calls.length = 0;

      const answer = await confirm(body);

      expect(await wireOf(answer)).toBe(await wireOf(reference));
      expect(world.calls).toEqual([]);
    },
  );

  it("reads only the body's own token member: one an Object.prototype supplies is not the sender's", async () => {
    const reference = await expectedRefusal();
    world.calls.length = 0;
    Object.defineProperty(Object.prototype, "token", {
      value: "a".repeat(43),
      configurable: true,
      enumerable: false,
    });

    try {
      const answer = await confirm({});

      expect(await wireOf(answer)).toBe(await wireOf(reference));
      expect(world.calls).toEqual([]);
    } finally {
      Reflect.deleteProperty(Object.prototype, "token");
    }
  });

  it("answers a link that was already used the same refusal, and changes nothing the second time", async () => {
    const reference = await expectedRefusal();
    const token = await issueLink();
    expect((await confirm({ token })).status).toBe(200);
    const holder = await world.accounts.findByNormalForm(
      NEW_ADDRESS.toLowerCase(),
    );
    expect(holder.kind).toBe("found");
    world.calls.length = 0;
    await drainAfterTasks();

    const again = await confirm({ token });

    expect(await wireOf(again)).toBe(await wireOf(reference));
  });

  it("answers an expired link the same refusal, and leaves the address and the sessions", async () => {
    const reference = await expectedRefusal();
    const token = await issueLink({ lifetimeMs: 3_600_000 });
    world.advance(2 * 3_600_000);
    const live = await seedSession(client);

    const answer = await confirm({ token });

    expect(await wireOf(answer)).toBe(await wireOf(reference));
    expect(await world.accounts.findById(client.id)).toMatchObject({
      account: { email: client.email },
    });
    expect(await isLive(live.tokenHash)).toBe(true);
    expect(pendingAfterTasks()).toBe(0);
  });

  it("answers a superseded link the same refusal, and accepts the newer one", async () => {
    const reference = await expectedRefusal();
    const older = await issueLink({ newEmail: "older@example.test" });
    world.advance(1000);
    const newer = await issueLink({ newEmail: "newer@example.test" });

    const refusedOlder = await confirm({ token: older });
    const acceptedNewer = await confirm({ token: newer });

    expect(await wireOf(refusedOlder)).toBe(await wireOf(reference));
    expect(acceptedNewer.status).toBe(200);
    expect(await world.accounts.findById(client.id)).toMatchObject({
      account: { email: "newer@example.test" },
    });
  });

  it("answers a link whose address another account has since taken the same refusal, never a 500, and leaves everything", async () => {
    const reference = await expectedRefusal();
    const token = await issueLink({ newEmail: "contested@example.test" });
    await seedVerifiedAccount({ email: "Contested@Example.test" });

    const answer = await confirm({ token });

    expect(answer.status).toBe(400);
    expect(await wireOf(answer)).toBe(await wireOf(reference));
    await expectUntouched();
  });

  it("answers a link retired by a later request, or by a password change, the same refusal", async () => {
    const reference = await expectedRefusal();
    const retired = await issueLink();
    await world.accounts.retireEmailChangeTokens(client.id);
    const afterChange = await issueLink();
    world.advance(1000);
    await world.accounts.changePassword({
      accountId: client.id,
      expectedPasswordHash: client.passwordHash,
      passwordHash: await hashOf("changed meanwhile 12345"),
    });

    expect(await wireOf(await confirm({ token: retired }))).toBe(
      await wireOf(reference),
    );
    expect(await wireOf(await confirm({ token: afterChange }))).toBe(
      await wireOf(reference),
    );
  });

  it("answers the link of an account that was never confirmed the same refusal", async () => {
    const reference = await expectedRefusal();
    const pending = await seedUnverifiedAccount("pending@example.test");
    const value = aTokenValue();
    const issued = await world.accounts.issueEmailChangeToken({
      accountId: pending.id,
      verifiedPasswordHash: pending.passwordHash,
      newEmail: "elsewhere@example.test",
      newEmailNormalForm: "elsewhere@example.test",
      tokenHash: sha256Hex(value),
      expiresAt: new Date(world.now().getTime() + 3_600_000),
    });
    expect(issued.kind).toBe("refused");

    expect(await wireOf(await confirm({ token: value }))).toBe(
      await wireOf(reference),
    );
  });
});

describe("E9 with the flag on: a link that works", () => {
  it("answers 200 email-changed and replaces the address and its counted form", async () => {
    const token = await issueLink();

    const answer = await confirm({ token });

    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
    expect(await jsonOf(answer)).toEqual({ status: "email-changed" });
    expect(await world.accounts.findById(client.id)).toMatchObject({
      account: { email: NEW_ADDRESS },
    });
    expect(
      (await world.accounts.findByNormalForm(NEW_ADDRESS.toLowerCase())).kind,
    ).toBe("found");
    expect((await world.accounts.findByNormalForm(client.email)).kind).toBe(
      "none",
    );
    expect(changeTokens().every(({ usedAt }) => usedAt !== undefined)).toBe(
      true,
    );
  });

  it("writes one undo link row for the confirm, holding the address left, valid for 24 hours", async () => {
    const token = await issueLink();

    await confirm({ token });

    const [revert, ...others] = revertTokens();
    expect(others).toEqual([]);
    expect(revert).toMatchObject({
      accountId: client.id,
      newEmail: client.email,
      usedAt: undefined,
    });
    const lifetimeMs = (revert?.expiresAt.getTime() ?? 0) - Date.now();
    expect(lifetimeMs).toBeGreaterThan(24 * 3_600_000 - 60_000);
    expect(lifetimeMs).toBeLessThanOrEqual(24 * 3_600_000);
  });

  it("writes no undo link row for a link that does not work", async () => {
    const token = await issueLink();
    await confirm({ token });
    const rowsAfterFirst = revertTokens();

    const again = await confirm({ token });

    expect(again.status).toBe(400);
    expect(revertTokens()).toEqual(rowsAfterFirst);
  });

  it("ends every session of the account, the one that carried the request included, and starts none", async () => {
    const token = await issueLink();
    const otherDevice = await seedSession(client);
    const stranger = await seedVerifiedAccount({
      email: "stranger@example.test",
    });
    const strangerSession = await seedSession(stranger);

    const answer = await confirm({ token }, { cookie: session.cookie });

    expect(answer.status).toBe(200);
    expect(setCookieLinesOf(answer)).toEqual([]);
    expect(await isLive(session.tokenHash)).toBe(false);
    expect(await isLive(otherDevice.tokenHash)).toBe(false);
    expect(await isLive(strangerSession.tokenHash)).toBe(true);
  });

  it("reads no session and takes the account from the token's row, not from the request", async () => {
    const stranger = await seedVerifiedAccount({
      email: "stranger@example.test",
    });
    const token = await issueLink();

    const answer = await confirm({
      token,
      accountId: stranger.id,
      newEmail: "elsewhere@example.test",
      email: "x@example.test",
    });

    expect(answer.status).toBe(200);
    expect(world.calls).toEqual([
      "accounts.confirmEmailChange",
      "sessions.revokeAllForAccount",
    ]);
    expect(await world.accounts.findById(client.id)).toMatchObject({
      account: { email: NEW_ADDRESS },
    });
    expect(await world.accounts.findById(stranger.id)).toMatchObject({
      account: { email: stranger.email },
    });
  });

  it("counts exactly the token-completion bucket", async () => {
    await confirm({ token: await issueLink() });

    expect(limiterLedger.counted).toEqual([TOKEN_COMPLETE_POLICY_NAME]);
  });

  it("queues the notice to the old address after the response, in the account's language, and sends it only when the queue runs", async () => {
    const token = await issueLink();

    const answer = await confirm({ token });

    expect(answer.status).toBe(200);
    expect(pendingAfterTasks()).toBe(1);
    expect(world.mail.sent).toEqual([]);
    await drainAfterTasks();
    expect(world.mail.sent).toHaveLength(1);
    expect(world.mail.sent[0]).toMatchObject({ recipient: client.email });
    expect(world.mail.sent[0]?.key).toMatch(/^account-mail\/email-changed\//);
    expect(world.mail.sent[0]?.text).not.toContain(NEW_ADDRESS);
    const inTheirLanguage = buildAccountMail({
      kind: "email-changed",
      locale: "ru",
    });
    const inTheOtherOne = buildAccountMail({
      kind: "email-changed",
      locale: "ro",
    });
    expect(inTheirLanguage.subject).not.toBe(inTheOtherOne.subject);
    expect(world.mail.sent[0]?.subject).toBe(inTheirLanguage.subject);
  });

  it("writes the success down by event and outcome alone", async () => {
    const console_ = captureConsole();

    await confirm({ token: await issueLink() });

    expect(console_.accountLines()).toEqual([
      { event: "email-change-confirm", outcome: "succeeded" },
    ]);
  });

  it("answers 200 and sends no notice when the retry finds the change already made (the old address is no longer known)", async () => {
    const token = await issueLink();
    world.intercept("accounts.confirmEmailChange", () =>
      Promise.resolve({
        kind: "changed",
        accountId: client.id,
        previous: undefined,
      }),
    );

    const answer = await confirm({ token });

    expect(answer.status).toBe(200);
    expect(pendingAfterTasks()).toBe(0);
  });

  it("still answers 200 when the second pass over the sessions fails: the address has changed", async () => {
    const console_ = captureConsole();
    const token = await issueLink();
    world.failOn("sessions.revokeAllForAccount");

    const answer = await confirm({ token });

    expect(answer.status).toBe(200);
    expect(console_.accountLines()).toContainEqual({
      event: "session-revoke",
      outcome: "unavailable",
    });
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
  });

  it("holds no address, token or id in its answer or its log", async () => {
    const console_ = captureConsole();
    const token = await issueLink();

    const answer = await confirm({ token });
    await drainAfterTasks();

    const text = await answer.clone().text();
    for (const secret of [token, NEW_ADDRESS, client.email, client.id]) {
      expect(text).not.toContain(secret);
      expect(console_.everything()).not.toContain(secret);
    }
  });
});
