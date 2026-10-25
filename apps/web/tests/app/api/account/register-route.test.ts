import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  drainAfterTasks,
  pendingAfterTasks,
} from "../../../support/after-queue";
import {
  PUBLIC_ORIGIN,
  accountRequest,
  captureConsole,
  freshAccountWorld,
  hashOf,
  jsonOf,
  seedUnverifiedAccount,
  seedVerifiedAccount,
  wireOf,
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

const { POST } = await import("@/app/api/account/register/route");

/**
 * `POST /api/account/register` and the reservation of ADR 0172 Amendment H: an address that no account holds but a
 * live undo link of an address change names gets the same `202`, the same three store calls and one hash as a free, a
 * pending and a confirmed address, creates no account and queues no mail.
 */

const LEFT_ADDRESS = "ana.left@example.test";
const REGISTRATION_PASSWORD = "a registration passphrase 55";
const PRIVACY_NOTICE_VERSION = "2026-10-draft";
const HOUR_MS = 3_600_000;
const UNDO_LINK_LIFETIME_MS = 24 * HOUR_MS;

let world: AccountWorld;
let capture: ReturnType<typeof captureConsole>;

beforeEach(() => {
  world = freshAccountWorld();
  capture = captureConsole();
  vi.stubEnv("LEMNARIA_PUBLIC_ORIGIN", PUBLIC_ORIGIN);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function register(email: string) {
  return POST(
    accountRequest("/api/account/register", {
      method: "POST",
      json: {
        email,
        password: REGISTRATION_PASSWORD,
        locale: "ro",
        privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
      },
      headers: { "x-forwarded-for": "192.0.2.10" },
    }),
  );
}

function sha256Of(seed: string): string {
  return createHash("sha256").update(seed, "utf8").digest("hex");
}

/** Moves the account off `LEFT_ADDRESS` by a confirmed change, which writes the undo link that reserves it. */
async function leaveTheAddress(): Promise<{ readonly undoHash: string }> {
  const holder: SeededAccount = await seedVerifiedAccount({
    email: LEFT_ADDRESS,
  });
  const changeHash = sha256Of("change-link");
  const undoHash = sha256Of("undo-link");
  await world.accounts.issueEmailChangeToken({
    accountId: holder.id,
    verifiedPasswordHash: holder.passwordHash,
    newEmail: "ana.new@example.test",
    newEmailNormalForm: "ana.new@example.test",
    tokenHash: changeHash,
    expiresAt: new Date(world.now().getTime() + HOUR_MS),
  });
  const confirmed = await world.accounts.confirmEmailChange({
    tokenHash: changeHash,
    revertTokenHash: undoHash,
    revertExpiresAt: new Date(world.now().getTime() + UNDO_LINK_LIFETIME_MS),
  });
  expect(confirmed.kind).toBe("changed");
  return { undoHash };
}

/** What one registration cost: the store calls it made, its whole wire answer, and what its after() queued. */
async function registrationOf(email: string) {
  const callsBefore = world.calls.length;
  const answer = await register(email);
  const storeCalls = world.calls.slice(callsBefore);
  const wire = await wireOf(answer);
  const queuedBeforeDrain = pendingAfterTasks();
  await drainAfterTasks();
  return { answer, storeCalls, wire, queuedBeforeDrain };
}

describe("registering an address that a live undo link of an address change names", () => {
  it("answers the 202 a free address gets, byte for byte, with the same number of store calls", async () => {
    await leaveTheAddress();
    await seedVerifiedAccount({ email: "verified@example.test" });
    await seedUnverifiedAccount("pending@example.test");

    const free = await registrationOf("free@example.test");
    const pending = await registrationOf("pending@example.test");
    const verified = await registrationOf("verified@example.test");
    const reserved = await registrationOf(LEFT_ADDRESS);

    expect(reserved.answer.status).toBe(202);
    expect(await jsonOf(reserved.answer)).toEqual(await jsonOf(free.answer));
    expect(reserved.wire).toBe(free.wire);
    for (const other of [pending, verified]) {
      expect(other.wire).toBe(free.wire);
    }
    expect(
      [free, pending, verified, reserved].map(
        ({ storeCalls }) => storeCalls.length,
      ),
    ).toEqual([3, 3, 3, 3]);
  });

  it("makes the lookup, the refused write, then one more lookup", async () => {
    await leaveTheAddress();

    const { storeCalls } = await registrationOf(LEFT_ADDRESS);

    expect(storeCalls).toEqual([
      "accounts.findByNormalForm",
      "accounts.createUnverified",
      "accounts.findByNormalForm",
    ]);
  });

  it("creates no account, issues no token and queues no mail", async () => {
    await leaveTheAddress();
    const accountsBefore = world.accounts.heldAccounts().length;
    const tokensBefore = world.accounts.heldTokens().length;

    const { queuedBeforeDrain } = await registrationOf(LEFT_ADDRESS);

    expect(world.accounts.heldAccounts()).toHaveLength(accountsBefore);
    expect(world.accounts.heldTokens()).toHaveLength(tokensBefore);
    expect(queuedBeforeDrain).toBe(0);
    expect(world.mail.sent).toEqual([]);
  });

  it("is logged as a refusal, not as something of ours that could not be reached", async () => {
    await leaveTheAddress();

    await registrationOf(LEFT_ADDRESS);

    expect(capture.accountLines()).toContainEqual({
      event: "register",
      outcome: "refused",
    });
    expect(capture.accountLines()).not.toContainEqual({
      event: "register",
      outcome: "unavailable",
    });
  });

  it("is an address the account holds again once the link has been used: the lookup finds it, three times", async () => {
    const { undoHash } = await leaveTheAddress();
    const reverted = await world.accounts.revertEmailChange({
      tokenHash: undoHash,
      passwordHash: await hashOf(REGISTRATION_PASSWORD),
    });
    expect(reverted.kind).toBe("reverted");
    const accountsBefore = world.accounts.heldAccounts().length;

    const { storeCalls } = await registrationOf(LEFT_ADDRESS);

    expect(world.accounts.heldAccounts()).toHaveLength(accountsBefore);
    expect(storeCalls).toEqual([
      "accounts.findByNormalForm",
      "accounts.findByNormalForm",
      "accounts.findByNormalForm",
    ]);
  });

  it("registers as before once the link has expired", async () => {
    await leaveTheAddress();
    world.advance(UNDO_LINK_LIFETIME_MS);
    const accountsBefore = world.accounts.heldAccounts().length;

    const { storeCalls } = await registrationOf(LEFT_ADDRESS);

    expect(world.accounts.heldAccounts()).toHaveLength(accountsBefore + 1);
    expect(world.mail.sent).toHaveLength(1);
    expect(storeCalls).toEqual([
      "accounts.findByNormalForm",
      "accounts.createUnverified",
      "accounts.issueToken",
    ]);
  });
});
