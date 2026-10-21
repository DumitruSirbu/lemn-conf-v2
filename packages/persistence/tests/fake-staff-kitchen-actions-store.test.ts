import { randomBytes } from "node:crypto";

import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";

import { FakeSessionStore } from "../src/fake-session-store.js";
import { FakeStaffAuditStore } from "../src/fake-staff-audit-store.js";
import { FakeStaffKitchenActionsStore } from "../src/fake-staff-kitchen-actions-store.js";
import { StaffKitchenActionError } from "../src/staff-kitchen-actions-store.js";
import { rejectionOf } from "./support/rejection-of.js";
import { describeStaffKitchenActionsStoreContract } from "./support/staff-kitchen-actions-store-contract.js";
import type {
  ActionsWorld,
  ClientAccount,
  StaffMember,
} from "./support/staff-kitchen-actions-store-contract.js";

/**
 * The fake with the fake session store and the fake audit store behind it, as the contract's world. The same contract
 * runs against `NeonStaffKitchenActionsStore` in `neon-staff-kitchen-actions-store.live.test.ts`.
 */
const PASSWORD_HASH = `$argon2id$v=19$m=19456,t=2,p=1$${"A".repeat(22)}$${"B".repeat(43)}`;
const IDLE_LIFETIMES = {
  client: 2_592_000,
  operator: 43_200,
  administrator: 43_200,
};
const SESSIONS_NOW_MS = Date.parse("2026-10-21T09:00:00.000Z");
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const FIXED_UPDATED_AT_MS = Date.parse("2026-10-01T09:00:00.000Z");

interface HeldAccount {
  readonly email: string;
  readonly role: "client" | "operator";
}

function newFakeWorld(): ActionsWorld & {
  readonly fake: FakeStaffKitchenActionsStore;
  readonly audit: FakeStaffAuditStore;
} {
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 9, 21, 9, 0, 0) + 1000 * tick++);
  const accounts = new Map<string, HeldAccount>();
  const sessions = new FakeSessionStore({
    now: () => new Date(SESSIONS_NOW_MS),
    accountOf: (accountId) => {
      const held = accounts.get(accountId);
      return held === undefined
        ? undefined
        : {
            id: accountId,
            email: held.email,
            role: held.role,
            isEmailVerified: true,
          };
    },
    passwordHashOf: (accountId) =>
      accounts.has(accountId) ? PASSWORD_HASH : undefined,
    passwordChangedAtOf: (accountId) =>
      accounts.has(accountId)
        ? new Date("2026-01-01T00:00:00.000Z")
        : undefined,
  });
  const audit = new FakeStaffAuditStore({ now, sessions });
  const fake = new FakeStaffKitchenActionsStore({
    now,
    sessions,
    audit,
    directory: {
      accountOf: (accountId) => {
        const held = accounts.get(accountId);
        return held === undefined
          ? undefined
          : { email: held.email, name: null };
      },
    },
  });

  async function signedIn(): Promise<StaffMember> {
    const accountId = nanoid();
    const email = `staff-${accountId}@example.invalid`;
    accounts.set(accountId, { email, role: "operator" });
    const sessionTokenHash = randomBytes(32).toString("hex");
    await sessions.create({
      tokenHash: sessionTokenHash,
      accountId,
      expectedPasswordHash: PASSWORD_HASH,
      absoluteExpiresAt: new Date(SESSIONS_NOW_MS + SESSION_LIFETIME_MS),
    });
    return {
      accountId,
      email,
      session: { sessionTokenHash, idleLifetimeSeconds: IDLE_LIFETIMES },
    };
  }

  return {
    fake,
    audit,
    store: fake,
    aStaffMember: signedIn,
    async aStaffMemberWhoseSessionIsRevoked() {
      const member = await signedIn();
      await sessions.revoke(member.session.sessionTokenHash);
      return member;
    },
    aClient(): Promise<ClientAccount> {
      const accountId = nanoid();
      const email = `client-${accountId}@example.invalid`;
      accounts.set(accountId, { email, role: "client" });
      return Promise.resolve({ accountId, email });
    },
    aKitchen({
      client,
      isSent = false,
      isHidden = false,
      isDeletedByClient = false,
    }) {
      const id = nanoid();
      fake.plantKitchen({
        id,
        accountId: client?.accountId ?? null,
        sentAt: isSent ? new Date("2026-10-02T09:00:00.000Z") : null,
        isHidden,
        isDeletedByClient,
      });
      return Promise.resolve(id);
    },
    aStoredStatus({ designId, status, changedBy }) {
      fake.plantStatus({
        designId,
        status,
        changedByAccountId: changedBy.accountId,
        changedAt: new Date("2026-10-03T09:00:00.000Z"),
      });
      return Promise.resolve();
    },
    notesOf: (designId) =>
      Promise.resolve(
        fake.heldNotes(designId).map(({ id, authorAccountId, text }) => ({
          id,
          authorAccountId,
          text,
        })),
      ),
    statusRowOf(designId) {
      const held = fake.heldStatus(designId);
      return Promise.resolve(
        held === undefined
          ? null
          : {
              status: held.status,
              changedByAccountId: held.changedByAccountId,
              changedAtMs: held.changedAt.getTime(),
            },
      );
    },
    isHidden: (designId) =>
      Promise.resolve(fake.heldKitchen(designId)?.isHidden ?? false),
    updatedAtMsOf: () => Promise.resolve(FIXED_UPDATED_AT_MS),
    auditEventsOf: (actorAccountId) =>
      Promise.resolve(
        audit
          .heldEvents()
          .filter((event) => event.actorAccountId === actorAccountId)
          .map((event) => ({
            action: event.action,
            designId: event.designId,
            isDetailSqlNull: event.detail === null,
            detail: event.detail,
          })),
      ),
  };
}

describeStaffKitchenActionsStoreContract("FakeStaffKitchenActionsStore", () =>
  Promise.resolve(newFakeWorld()),
);

describe("FakeStaffKitchenActionsStore beyond the contract", () => {
  it("refuses a session that is not well formed before it looks at the kitchen", async () => {
    const world = newFakeWorld();
    const designId = await world.aKitchen({
      client: await world.aClient(),
      isSent: true,
    });

    const failure = await rejectionOf(
      world.store.unhide({
        session: {
          sessionTokenHash: "nope",
          idleLifetimeSeconds: IDLE_LIFETIMES,
        },
        designId,
      }),
    );

    expect(failure).toBeInstanceOf(StaffKitchenActionError);
    expect(failure).toMatchObject({
      failure: "invalid-request",
      refusal: "SESSION_NOT_WELL_FORMED",
    });
  });

  it("finds the status moved when another save lands between the read and the write, and writes nothing for it", async () => {
    const world = newFakeWorld();
    const staff = await world.aStaffMember();
    const designId = await world.aKitchen({
      client: await world.aClient(),
      isSent: true,
    });

    const [first, second] = await Promise.all([
      world.store.setStatus({
        session: staff.session,
        designId,
        status: "contacted",
      }),
      world.store.setStatus({
        session: staff.session,
        designId,
        status: "closed",
      }),
    ]);

    expect([first.kind, second.kind]).toEqual(["saved", "changed-meanwhile"]);
    expect(world.audit.heldEvents()).toHaveLength(1);
  });
});
