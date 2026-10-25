import { randomBytes } from "node:crypto";

import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";

import { FakeSessionStore } from "../src/fake-session-store.js";
import { FakeStaffAuditStore } from "../src/fake-staff-audit-store.js";
import type { StaffAuditDirectory } from "../src/fake-staff-audit-store.js";
import { StaffAuditStoreError } from "../src/staff-audit-store.js";
import type { StaffAuditRecord } from "../src/staff-audit-store.js";
import { rejectionOf } from "./support/rejection-of.js";
import { describeStaffAuditStoreContract } from "./support/staff-audit-store-contract.js";
import type {
  AuditWorld,
  ClientAccount,
  Kitchen,
  StaffMember,
} from "./support/staff-audit-store-contract.js";

const PASSWORD_HASH = `$argon2id$v=19$m=19456,t=2,p=1$${"A".repeat(22)}$${"B".repeat(43)}`;
const IDLE_LIFETIMES = {
  client: 2_592_000,
  operator: 43_200,
  administrator: 43_200,
};
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

interface HeldAccount {
  readonly email: string;
  readonly name: string | null;
  readonly role: "client" | "operator";
}

interface HeldDesign {
  readonly name: string | null;
  readonly ownerAccountId: string | null;
  readonly isDeletedByClient: boolean;
}

/** The fake store with the fake session store and two small tables behind it, as the contract's world. */
function newFakeWorld(): AuditWorld & {
  readonly fake: FakeStaffAuditStore;
  readonly sessions: FakeSessionStore;
} {
  const now = () => new Date("2026-10-21T09:00:00.000Z");
  const accounts = new Map<string, HeldAccount>();
  const designs = new Map<string, HeldDesign>();
  const sessions = new FakeSessionStore({
    now,
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
  const directory: StaffAuditDirectory = {
    accountOf: (accountId) => accounts.get(accountId),
    designOf: (designId) => designs.get(designId),
  };
  const fake = new FakeStaffAuditStore({ now, sessions, directory });

  async function signedIn(): Promise<StaffMember> {
    const accountId = nanoid();
    const email = `staff-${accountId}@example.invalid`;
    accounts.set(accountId, { email, name: "Staff Name", role: "operator" });
    const sessionTokenHash = randomBytes(32).toString("hex");
    await sessions.create({
      tokenHash: sessionTokenHash,
      accountId,
      expectedPasswordHash: PASSWORD_HASH,
      absoluteExpiresAt: new Date(now().getTime() + SESSION_LIFETIME_MS),
    });
    return {
      accountId,
      email,
      name: "Staff Name",
      sessionTokenHash,
      idleLifetimeSeconds: IDLE_LIFETIMES,
    };
  }

  return {
    fake,
    sessions,
    store: fake,
    aStaffMember: signedIn,
    async aStaffMemberWhoseSessionIsRevoked() {
      const member = await signedIn();
      await sessions.revoke(member.sessionTokenHash);
      return member;
    },
    aClient(): Promise<ClientAccount> {
      const accountId = nanoid();
      const email = `client-${accountId}@example.invalid`;
      accounts.set(accountId, { email, name: null, role: "client" });
      return Promise.resolve({ accountId, email });
    },
    aKitchen({ client, name, isDeletedByClient = false }): Promise<Kitchen> {
      const designId = nanoid();
      designs.set(designId, {
        name,
        ownerAccountId: client?.accountId ?? null,
        isDeletedByClient,
      });
      return Promise.resolve({ designId, name, client });
    },
    plantEvent(event) {
      const id = event.id ?? nanoid();
      fake.plant({
        id,
        occurredAt: event.occurredAt,
        actorAccountId: event.actorAccountId,
        action: event.action,
        designId: event.designId ?? null,
        subjectAccountId: event.subjectAccountId ?? null,
        detail: event.detail ?? null,
      });
      return Promise.resolve(id);
    },
    storedEventsOf(actorAccountId) {
      return Promise.resolve(
        fake
          .heldEvents()
          .filter((event) => event.actorAccountId === actorAccountId)
          .map((event) => ({
            id: event.id,
            actorAccountId: event.actorAccountId,
            action: event.action,
            designId: event.designId,
            subjectAccountId: event.subjectAccountId,
            isDetailSqlNull: event.detail === null,
            detail: event.detail,
          })),
      );
    },
    removeAccount(accountId) {
      accounts.delete(accountId);
      return Promise.resolve();
    },
  };
}

describeStaffAuditStoreContract("FakeStaffAuditStore", () =>
  Promise.resolve(newFakeWorld()),
);

describe("FakeStaffAuditStore.stage, the seam for a store that commits its audit row with its own write", () => {
  function recordOf(member: StaffMember): StaffAuditRecord {
    return {
      sessionTokenHash: member.sessionTokenHash,
      idleLifetimeSeconds: member.idleLifetimeSeconds,
      entry: { action: "note-added", detail: null },
      designId: nanoid(),
      subjectAccountId: null,
    };
  }

  it("writes nothing until the staged row is committed", async () => {
    const world = newFakeWorld();
    const member = await world.aStaffMember();

    const staged = await world.fake.stage(recordOf(member));

    expect(world.fake.heldEvents()).toHaveLength(0);
    staged.commit();
    expect(world.fake.heldEvents()).toHaveLength(1);
  });

  it("writes a staged row once, however often it is committed", async () => {
    const world = newFakeWorld();
    const member = await world.aStaffMember();
    const staged = await world.fake.stage(recordOf(member));

    staged.commit();
    staged.commit();

    expect(world.fake.heldEvents()).toHaveLength(1);
  });

  it("refuses at staging, before the caller's own write, when the session is not live", async () => {
    const world = newFakeWorld();
    const member = await world.aStaffMemberWhoseSessionIsRevoked();

    const failure = await rejectionOf(world.fake.stage(recordOf(member)));

    expect(failure).toBeInstanceOf(StaffAuditStoreError);
    expect((failure as StaffAuditStoreError).failure).toBe("not-recorded");
  });
});

describe("FakeStaffAuditStore.plant", () => {
  it("refuses a row the table would refuse, an action outside its shape included", async () => {
    const world = newFakeWorld();
    const member = await world.aStaffMember();

    expect(() => {
      world.fake.plant({
        id: nanoid(),
        occurredAt: new Date(),
        actorAccountId: member.accountId,
        action: "Not Shaped",
        designId: null,
        subjectAccountId: null,
        detail: null,
      });
    }).toThrow("planted audit row");
  });
});
