import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sha256Hex } from "@/lib/server/sha256-hex";

import {
  drainAfterTasks,
  pendingAfterTasks,
} from "../../../support/after-queue";
import {
  DEFAULT_PASSWORD,
  EMAIL_CHANGE_BY_ACCOUNT_POLICY_NAME,
  PUBLIC_ORIGIN,
  accountRequest,
  captureConsole,
  freshAccountWorld,
  limiterLedger,
  seedSession,
  seedUnverifiedAccount,
  seedVerifiedAccount,
  wireOf,
  type AccountWorld,
  type SeededAccount,
  type SeededSession,
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
 * The mail of an address change (M8B Lot 2 S13c; ADR 0172 Amendment H, criteria R-1, R-2 and R-4, and D1, D6):
 * the request notice E8 sends the requester, and the undo link E9 sends the address the account has left. The
 * flows' other claims are in `email-change-routes.test.ts`.
 */

const TYPED_ADDRESS = "New.Address@Example.test";
const REQUEST_NOTICE_KEY = /^account-mail\/email-change-requested\//;
const UNDO_NOTICE_KEY = /^account-mail\/email-changed\//;
const UNDO_LINK = /\/ru\/account\/revert-email#t=([A-Za-z0-9_-]{43})/;
const FORGOT_PASSWORD_PAGE = `${PUBLIC_ORIGIN}/ru/account/forgot-password`;

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

function ask(json: unknown) {
  return requestChange(
    accountRequest("/api/account/email-change", {
      method: "POST",
      json,
      cookie: session.cookie,
    }),
  );
}

function anAsk(overrides: Record<string, unknown> = {}) {
  return {
    newEmail: TYPED_ADDRESS,
    currentPassword: DEFAULT_PASSWORD,
    ...overrides,
  };
}

function confirm(token: string) {
  return confirmChange(
    accountRequest("/api/account/email-change/confirm", {
      method: "POST",
      json: { token },
    }),
  );
}

async function issueLink(
  account: SeededAccount,
  newEmail: string,
): Promise<string> {
  const value = randomBytes(32).toString("base64url");
  const issued = await world.accounts.issueEmailChangeToken({
    accountId: account.id,
    verifiedPasswordHash: account.passwordHash,
    newEmail,
    newEmailNormalForm: newEmail.toLowerCase(),
    tokenHash: sha256Hex(value),
    expiresAt: new Date(world.now().getTime() + 86_400_000),
  });
  expect(issued.kind).toBe("issued");
  return value;
}

/** A stranger moves off `leftAddress`, so a live undo link of theirs reserves it. */
async function reserveAddress(leftAddress: string): Promise<void> {
  const stranger = await seedVerifiedAccount({ email: leftAddress });
  const token = await issueLink(stranger, "moved-away@example.test");
  expect((await confirm(token)).status).toBe(200);
  await drainAfterTasks();
  world.calls.length = 0;
}

function mailsOfKey(key: RegExp) {
  return world.mail.sent.filter((mail) => key.test(mail.key));
}

function revertTokens() {
  return world.accounts
    .heldTokens()
    .filter(({ purpose }) => purpose === "email-change-revert");
}

function changeTokensOfClient() {
  return world.accounts
    .heldTokens()
    .filter(
      ({ purpose, accountId }) =>
        purpose === "email-change" && accountId === client.id,
    );
}

interface TargetCase {
  readonly label: string;
  readonly typed: string;
  readonly prepare: () => Promise<void>;
}

const FREE_ADDRESS_TARGET: TargetCase = {
  label: "a free address",
  typed: "free@example.test",
  prepare: noSetup,
};

const NOTICE_TARGETS: readonly TargetCase[] = [
  FREE_ADDRESS_TARGET,
  {
    label: "an address a confirmed account holds",
    typed: "holder@example.test",
    prepare: async () => {
      await seedVerifiedAccount({ email: "holder@example.test" });
    },
  },
  {
    label: "an address an unconfirmed account holds",
    typed: "pending@example.test",
    prepare: async () => {
      await seedUnverifiedAccount("pending@example.test");
    },
  },
  {
    label: "an address a live undo link of another account reserves",
    typed: "left-behind@example.test",
    prepare: () => reserveAddress("left-behind@example.test"),
  },
];

function noSetup(): Promise<void> {
  return Promise.resolve();
}

async function askForTarget(target: TargetCase) {
  world = freshAccountWorld();
  captureConsole();
  client = await seedVerifiedAccount({
    email: "client@example.test",
    locale: "ru",
  });
  session = await seedSession(client);
  await target.prepare();
  world.calls.length = 0;
  limiterLedger.counted.length = 0;
  const sentBefore = world.mail.sent.length;
  const answer = await ask(anAsk({ newEmail: target.typed }));
  const beforeDrain = {
    calls: [...world.calls],
    queued: pendingAfterTasks(),
    mails: world.mail.sent.length - sentBefore,
    counted: [...limiterLedger.counted],
  };
  await drainAfterTasks();
  return {
    answer,
    beforeDrain,
    notices: mailsOfKey(REQUEST_NOTICE_KEY),
    newMail: world.mail.sent.slice(sentBefore),
  };
}

describe("E8: the request notice to the requester's current address", () => {
  it.each(NOTICE_TARGETS)(
    "queues exactly one notice to the current address in its language for $label, naming the address as typed",
    async (target) => {
      const run = await askForTarget(target);

      expect(run.answer.status).toBe(202);
      const [notice, ...others] = run.notices;
      expect(others).toEqual([]);
      expect(notice?.recipient).toBe("client@example.test");
      expect(notice?.text).toContain(target.typed);
      expect(notice?.html).toContain(target.typed);
      expect(notice?.text).toContain(FORGOT_PASSWORD_PAGE);
      expect(notice?.subject).not.toContain(target.typed);
    },
  );

  it("is the same text and html for every kind of target, apart from the address typed", async () => {
    const bodies = [];
    for (const target of NOTICE_TARGETS) {
      const run = await askForTarget(target);
      const [notice] = run.notices;
      bodies.push({
        subject: notice?.subject,
        text: notice?.text.replaceAll(target.typed, "ADDRESS"),
        html: notice?.html?.replaceAll(target.typed, "ADDRESS"),
      });
    }

    expect(bodies).toHaveLength(NOTICE_TARGETS.length);
    for (const body of bodies) expect(body).toEqual(bodies[0]);
    expect(bodies[0]?.text).toContain("ADDRESS");
  });

  it("answers the same bytes, after the same buckets and reads, with one queued job and no mail yet, for every kind of target", async () => {
    const reference = await askForTarget(FREE_ADDRESS_TARGET);

    for (const target of NOTICE_TARGETS) {
      const run = await askForTarget(target);

      expect(await wireOf(run.answer), target.label).toBe(
        await wireOf(reference.answer),
      );
      expect(run.beforeDrain, target.label).toEqual(reference.beforeDrain);
      expect(run.beforeDrain.calls, target.label).toEqual([
        "sessions.findLive",
        "accounts.findById",
      ]);
      expect(run.beforeDrain.queued, target.label).toBe(1);
      expect(run.beforeDrain.mails, target.label).toBe(0);
    }
  });

  it("mails the change link to a free address only: a held or reserved address gets none, and the notice is the same", async () => {
    const linkRecipients: string[][] = [];
    for (const target of NOTICE_TARGETS) {
      const run = await askForTarget(target);
      linkRecipients.push(
        run.newMail
          .filter((mail) => mail.key.startsWith("account-mail/email-change/"))
          .map((mail) => mail.recipient),
      );
    }

    expect(linkRecipients).toEqual([["free@example.test"], [], [], []]);
  });

  it.each(["client@example.test", "CLIENT@Example.TEST"])(
    "queues no notice for the account's own address (%s)",
    async (own) => {
      expect((await ask(anAsk({ newEmail: own }))).status).toBe(202);
      await drainAfterTasks();

      expect(world.mail.sent).toEqual([]);
    },
  );

  it("queues the notice before the address is looked up: it is already queued when the lookup runs", async () => {
    let queuedAtLookup = -1;
    world.intercept("accounts.findByNormalForm", (real) => {
      queuedAtLookup = pendingAfterTasks();
      return real();
    });

    await ask(anAsk());
    await drainAfterTasks();

    expect(queuedAtLookup).toBeGreaterThanOrEqual(1);
  });

  it.each([
    ["the lookup of the address fails", "accounts.findByNormalForm"],
    ["the reservation read fails", "accounts.isAddressReserved"],
    ["the link cannot be issued", "accounts.issueEmailChangeToken"],
  ])("still sends the notice when %s", async (_label, method) => {
    world.failOn(method);

    await ask(anAsk());
    await drainAfterTasks();

    expect(mailsOfKey(REQUEST_NOTICE_KEY)).toHaveLength(1);
    expect(mailsOfKey(/^account-mail\/email-change\//)).toEqual([]);
  });

  it("sends neither the notice nor the link when the account's earlier links cannot be retired: that comes first", async () => {
    world.failOn("accounts.retireEmailChangeTokens");

    await ask(anAsk());
    await drainAfterTasks();

    expect(world.mail.sent).toEqual([]);
  });

  it("sends a reserved address no change link, issues no token for it, and asks the reservation of the requester's own exception", async () => {
    await reserveAddress("left-behind@example.test");
    let asked: unknown;
    world.intercept("accounts.isAddressReserved", (real, [question]) => {
      asked = question;
      return real();
    });

    await ask(anAsk({ newEmail: "Left-Behind@Example.test" }));
    await drainAfterTasks();

    expect(asked).toEqual({
      emailNormalForm: "left-behind@example.test",
      exceptAccountId: client.id,
    });
    expect(changeTokensOfClient()).toEqual([]);
    expect(mailsOfKey(/^account-mail\/email-change\//)).toEqual([]);
    expect(mailsOfKey(REQUEST_NOTICE_KEY)).toHaveLength(1);
  });

  it("does not let the requester's own undo link block the requester's own request: the link is sent", async () => {
    const originalAddress = client.email;
    expect(
      (await confirm(await issueLink(client, "moved@example.test"))).status,
    ).toBe(200);
    await drainAfterTasks();
    session = await seedSession(client);

    await ask(anAsk({ newEmail: originalAddress }));
    await drainAfterTasks();

    expect(mailsOfKey(/^account-mail\/email-change\//)).toHaveLength(1);
    expect(
      changeTokensOfClient().filter(({ usedAt }) => usedAt === undefined),
    ).toHaveLength(1);
  });

  it.each([
    [
      "a wrong password",
      anAsk({ currentPassword: "this is not the password" }),
    ],
    ["a malformed address", anAsk({ newEmail: "nope" })],
    ["a missing address", { currentPassword: DEFAULT_PASSWORD }],
  ])("queues nothing for a refused request: %s", async (_label, body) => {
    expect((await ask(body)).status).toBe(400);
    await drainAfterTasks();

    expect(pendingAfterTasks()).toBe(0);
    expect(world.mail.sent).toEqual([]);
  });

  it("queues neither the notice nor the link once the account's daily cap is spent", async () => {
    limiterLedger.refusing.set(EMAIL_CHANGE_BY_ACCOUNT_POLICY_NAME, 800);

    expect((await ask(anAsk())).status).toBe(429);
    await drainAfterTasks();

    expect(world.mail.sent).toEqual([]);
  });

  it("writes the typed address, the link and the revert value into no log line", async () => {
    const console_ = captureConsole();
    await reserveAddress("left-behind@example.test");

    await ask(anAsk());
    await ask(anAsk({ newEmail: "left-behind@example.test" }));
    await drainAfterTasks();

    const everything = console_.everything().toLowerCase();
    expect(everything).not.toContain(TYPED_ADDRESS.toLowerCase());
    expect(everything).not.toContain("left-behind");
    expect(everything).not.toContain("#t=");
    expect(everything).not.toContain("forgot-password");
  });
});

describe("E9: the undo link in the notice to the address the account has left", () => {
  async function confirmAndDrain(): Promise<void> {
    const token = await issueLink(client, TYPED_ADDRESS);
    expect((await confirm(token)).status).toBe(200);
    await drainAfterTasks();
  }

  it("mails the old address the link of the stored undo row, in the account's language, on the revert page, with the token after the hash", async () => {
    await confirmAndDrain();

    const [notice, ...others] = mailsOfKey(UNDO_NOTICE_KEY);
    expect(others).toEqual([]);
    expect(notice?.recipient).toBe("client@example.test");
    const value = UNDO_LINK.exec(notice?.text ?? "")?.[1];
    expect(value).toBeDefined();
    const [row, ...rows] = revertTokens();
    expect(rows).toEqual([]);
    expect(sha256Hex(value ?? "")).toBe(row?.tokenHash);
    expect(notice?.html).toContain(
      `${PUBLIC_ORIGIN}/ru/account/revert-email#t=${value ?? ""}`,
    );
    expect(notice?.text).not.toContain(TYPED_ADDRESS);
  });

  it("keys the notice by the undo row's hash, so a repeated send is one mail", async () => {
    await confirmAndDrain();

    const [row] = revertTokens();
    expect(mailsOfKey(UNDO_NOTICE_KEY)[0]?.key).toBe(
      `account-mail/email-changed/${row?.tokenHash.slice(0, 16) ?? ""}`,
    );
  });

  it("sends the notice and the link when a retry after a lost acknowledgement reads the old address back from the row", async () => {
    const token = await issueLink(client, TYPED_ADDRESS);
    world.intercept(
      "accounts.confirmEmailChange",
      async (real, [confirmation]) => {
        await real();
        const { revertTokenHash } = confirmation as { revertTokenHash: string };
        const row = revertTokens().find(
          ({ tokenHash }) => tokenHash === revertTokenHash,
        );
        return {
          kind: "changed",
          accountId: client.id,
          previous: { email: row?.newEmail, locale: "ru" },
        };
      },
    );

    expect((await confirm(token)).status).toBe(200);
    await drainAfterTasks();

    const [notice] = mailsOfKey(UNDO_NOTICE_KEY);
    expect(notice?.recipient).toBe("client@example.test");
    const value = UNDO_LINK.exec(notice?.text ?? "")?.[1];
    expect(revertTokens()).toHaveLength(1);
    expect(sha256Hex(value ?? "")).toBe(revertTokens()[0]?.tokenHash);
  });

  it("mails no link when the store knows no undo row of this call", async () => {
    const token = await issueLink(client, TYPED_ADDRESS);
    world.intercept("accounts.confirmEmailChange", () =>
      Promise.resolve({
        kind: "changed",
        accountId: client.id,
        previous: undefined,
      }),
    );

    expect((await confirm(token)).status).toBe(200);
    await drainAfterTasks();

    expect(world.mail.sent).toEqual([]);
  });

  it("writes the link, its value and either address into no log line", async () => {
    const console_ = captureConsole();

    await confirmAndDrain();

    const everything = console_.everything().toLowerCase();
    const value = UNDO_LINK.exec(
      mailsOfKey(UNDO_NOTICE_KEY)[0]?.text ?? "",
    )?.[1];
    expect(value).toBeDefined();
    expect(everything).not.toContain((value ?? "").toLowerCase());
    expect(everything).not.toContain("#t=");
    expect(everything).not.toContain("revert-email");
    expect(everything).not.toContain("client@example.test");
    expect(everything).not.toContain(TYPED_ADDRESS.toLowerCase());
  });

  it("answers 503 before anything changes when no mail can be written: the token stays unconsumed, no undo row, no new address", async () => {
    const token = await issueLink(client, TYPED_ADDRESS);
    vi.stubEnv("LEMNARIA_PUBLIC_ORIGIN", "");
    world.calls.length = 0;

    const unavailable = await confirm(token);

    expect(unavailable.status).toBe(503);
    expect(world.calls).toEqual([]);
    expect(revertTokens()).toEqual([]);
    expect(await world.accounts.findById(client.id)).toMatchObject({
      account: { email: client.email },
    });
    vi.stubEnv("LEMNARIA_PUBLIC_ORIGIN", PUBLIC_ORIGIN);
    expect((await confirm(token)).status).toBe(200);
    await drainAfterTasks();
    expect(mailsOfKey(UNDO_NOTICE_KEY)).toHaveLength(1);
  });

  it("mails no undo link for a link that does not work", async () => {
    const token = await issueLink(client, TYPED_ADDRESS);
    await confirm(token);
    await drainAfterTasks();
    const mailed = world.mail.sent.length;

    expect((await confirm(token)).status).toBe(400);
    await drainAfterTasks();

    expect(world.mail.sent).toHaveLength(mailed);
  });
});
