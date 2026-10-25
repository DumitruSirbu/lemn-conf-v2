import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { drainAfterTasks } from "../../../support/after-queue";
import {
  PUBLIC_ORIGIN,
  accountRequest,
  captureConsole,
  freshAccountWorld,
  jsonOf,
  seedVerifiedAccount,
  sha256Hex,
  type AccountWorld,
  type SeededAccount,
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

const { POST: completeReset } = await import(
  "@/app/api/account/password-reset/complete/route"
);

/**
 * Using a reset link (flow 7). The password judgement it shares with the undo link's route lives in
 * `judge-new-password.ts`; this pins that the reset still refuses what it refused, spends nothing on a refusal, and
 * still completes. The field name a refusal carries is not pinned here: it is `password` today and the plan's P13 names
 * that as a known mismatch with the request member.
 */

const ACCOUNT_ADDRESS = "ana.reset@example.test";
const NEW_PASSWORD = "a reset passphrase 123";

let world: AccountWorld;
let owner: SeededAccount;

beforeEach(async () => {
  world = freshAccountWorld();
  captureConsole();
  vi.stubEnv("LEMNARIA_PUBLIC_ORIGIN", PUBLIC_ORIGIN);
  owner = await seedVerifiedAccount({ email: ACCOUNT_ADDRESS });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function complete(token: string, newPassword: unknown) {
  return completeReset(
    accountRequest("/api/account/password-reset/complete", {
      method: "POST",
      json: { token, newPassword },
    }),
  );
}

async function issueResetLink(): Promise<string> {
  const value = randomBytes(32).toString("base64url");
  const issued = await world.accounts.issueToken({
    accountId: owner.id,
    purpose: "reset-password",
    tokenHash: sha256Hex(value),
    expiresAt: new Date(world.now().getTime() + 1_800_000),
  });
  expect(issued).toEqual({ kind: "issued" });
  world.advance(1_000);
  return value;
}

async function codeOf(answer: Response): Promise<unknown> {
  const body = (await jsonOf(answer)) as {
    status: string;
    issues?: { code: string }[];
  };
  return [body.status, body.issues?.map(({ code }) => code)];
}

describe("the reset completion's password judgement", () => {
  it.each([
    ["too short", "short", "PASSWORD_TOO_SHORT"],
    ["not text", 123456789012, "PASSWORD_NOT_TEXT"],
    ["the account's own address", ACCOUNT_ADDRESS, "PASSWORD_IS_EMAIL"],
  ])(
    "refuses a password that is %s and leaves the link usable",
    async (_label, password, code) => {
      const link = await issueResetLink();

      const refused = await complete(link, password);

      expect(refused.status).toBe(400);
      expect(await codeOf(refused)).toEqual(["invalid-input", [code]]);
      expect(world.accounts.passwordHashOf(owner.id)).toBe(owner.passwordHash);
      expect((await complete(link, NEW_PASSWORD)).status).toBe(200);
    },
  );

  it("refuses a breached password and leaves the link usable", async () => {
    const link = await issueResetLink();
    world.breach = "breached";

    const refused = await complete(link, NEW_PASSWORD);

    expect(await codeOf(refused)).toEqual([
      "invalid-input",
      ["PASSWORD_BREACHED"],
    ]);
    world.breach = "not-breached";
    expect((await complete(link, NEW_PASSWORD)).status).toBe(200);
  });

  it("completes with an acceptable password: the hash is replaced and a notice is queued to the account's address", async () => {
    const link = await issueResetLink();

    const answer = await complete(link, NEW_PASSWORD);
    await drainAfterTasks();

    expect(answer.status).toBe(200);
    expect(await jsonOf(answer)).toEqual({ status: "password-changed" });
    expect(world.accounts.passwordHashOf(owner.id)).not.toBe(
      owner.passwordHash,
    );
    expect(world.mail.sent.map(({ recipient }) => recipient)).toEqual([
      ACCOUNT_ADDRESS,
    ]);
  });

  it("answers an unknown link before the password is looked at", async () => {
    const answer = await complete(randomBytes(32).toString("base64url"), "x");

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({ status: "link-invalid" });
  });
});
