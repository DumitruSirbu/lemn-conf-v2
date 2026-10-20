import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { drainAfterTasks } from "../../../support/after-queue";
import {
  PUBLIC_ORIGIN,
  accountRequest,
  captureConsole,
  freshAccountWorld,
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
vi.mock("@/lib/server/account/turnstile-verification", () =>
  import("../../../support/account-world").then((world) =>
    world.turnstileModule(),
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

const { POST: requestReset } = await import(
  "@/app/api/account/password-reset/request/route"
);

/**
 * The reset request looks the account up by address and then issues the token: two statements. An address change or a
 * revert that commits between them must not have the link mailed to the address the account has just left (ADR 0172
 * Amendment H; the S13b security review). The interleaving is made by running the change inside the lookup's own
 * answer, so the lookup has already returned the account when the account moves.
 */

const LEFT_ADDRESS = "ana.left@example.test";
const NEW_ADDRESS = "ana.new@example.test";
const REVERT_PASSWORD_HASH = `$argon2id$v=19$m=19456,t=2,p=1$${"A".repeat(22)}$${"B".repeat(43)}`;
const ONE_DAY_MS = 86_400_000;

let world: AccountWorld;
let owner: SeededAccount;

beforeEach(async () => {
  world = freshAccountWorld();
  captureConsole();
  vi.stubEnv("LEMNARIA_PUBLIC_ORIGIN", PUBLIC_ORIGIN);
  owner = await seedVerifiedAccount({ email: LEFT_ADDRESS, locale: "ro" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function askForReset(email: string) {
  return requestReset(
    accountRequest("/api/account/password-reset/request", {
      method: "POST",
      json: { email },
      headers: { "x-forwarded-for": "192.0.2.10" },
    }),
  );
}

function aTokenValue(): string {
  return randomBytes(32).toString("base64url");
}

async function issueChangeLink(): Promise<string> {
  const value = aTokenValue();
  const issued = await world.accounts.issueEmailChangeToken({
    accountId: owner.id,
    verifiedPasswordHash: world.accounts.passwordHashOf(owner.id) ?? "",
    newEmail: NEW_ADDRESS,
    newEmailNormalForm: NEW_ADDRESS,
    tokenHash: sha256Hex(value),
    expiresAt: new Date(world.now().getTime() + ONE_DAY_MS),
  });
  expect(issued.kind).toBe("issued");
  return value;
}

/** Runs `change` right after the reset request's lookup has answered, before it issues. */
function changeAfterTheLookup(change: () => Promise<unknown>): void {
  world.intercept("accounts.findByNormalForm", async (real) => {
    const answer = await real();
    await change();
    return answer;
  });
}

function resetTokens() {
  return world.accounts
    .heldTokens()
    .filter(({ purpose }) => purpose === "reset-password");
}

describe("a reset request and an address change that commits between its lookup and its insert", () => {
  it("mails the link to the address when nothing intervenes (the control)", async () => {
    const answer = await askForReset(LEFT_ADDRESS);
    await drainAfterTasks();

    expect(answer.status).toBe(202);
    expect(resetTokens()).toHaveLength(1);
    expect(world.mail.sent.map(({ recipient }) => recipient)).toEqual([
      LEFT_ADDRESS,
    ]);
  });

  it("issues no token and mails no one when a revert moves the account off the address in between", async () => {
    const changeValue = await issueChangeLink();
    const undoValue = aTokenValue();
    await world.accounts.confirmEmailChange({
      tokenHash: sha256Hex(changeValue),
      revertTokenHash: sha256Hex(undoValue),
      revertExpiresAt: new Date(world.now().getTime() + ONE_DAY_MS),
    });
    world.advance(1_000);
    changeAfterTheLookup(() =>
      world.accounts.revertEmailChange({
        tokenHash: sha256Hex(undoValue),
        passwordHash: REVERT_PASSWORD_HASH,
      }),
    );

    const answer = await askForReset(NEW_ADDRESS);
    await drainAfterTasks();

    expect(answer.status).toBe(202);
    expect(await world.accounts.findByNormalForm(LEFT_ADDRESS)).toMatchObject({
      kind: "found",
      account: { id: owner.id },
    });
    expect(resetTokens()).toEqual([]);
    expect(world.mail.sent).toEqual([]);
  });

  it("issues no token and mails no one when a confirmed change moves the account off the address in between", async () => {
    const changeValue = await issueChangeLink();
    changeAfterTheLookup(() =>
      world.accounts.confirmEmailChange({
        tokenHash: sha256Hex(changeValue),
        revertTokenHash: sha256Hex(aTokenValue()),
        revertExpiresAt: new Date(world.now().getTime() + ONE_DAY_MS),
      }),
    );

    const answer = await askForReset(LEFT_ADDRESS);
    await drainAfterTasks();

    expect(answer.status).toBe(202);
    expect(await world.accounts.findByNormalForm(NEW_ADDRESS)).toMatchObject({
      kind: "found",
      account: { id: owner.id },
    });
    expect(resetTokens()).toEqual([]);
    expect(world.mail.sent).toEqual([]);
  });

  it("names the address it looked the account up by when it issues", async () => {
    let issuedFor: unknown;
    world.intercept("accounts.issueToken", (real, args) => {
      issuedFor = (args[0] as { holdingEmailNormalForm?: string })
        .holdingEmailNormalForm;
      return real();
    });

    await askForReset("Ana.Left@Example.test");
    await drainAfterTasks();

    expect(issuedFor).toBe(LEFT_ADDRESS);
  });
});
