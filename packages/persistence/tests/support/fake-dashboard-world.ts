import { randomBytes } from "node:crypto";

import { nanoid } from "nanoid";

import { FakeCatalogueAvailabilityStore } from "../../src/fake-catalogue-availability-store.js";
import {
  FakeDashboardAuditLedger,
  FakeRevisionHead,
} from "../../src/fake-dashboard-support.js";
import { FakeKitchenChangeStore } from "../../src/fake-kitchen-change-store.js";
import { FakeKitchenDefaultsStore } from "../../src/fake-kitchen-defaults-store.js";
import { FakePriceBookStore } from "../../src/fake-price-book-store.js";
import { FakePriceNoticeStore } from "../../src/fake-price-notice-store.js";
import { FakeSessionStore } from "../../src/fake-session-store.js";
import type {
  DashboardStaffMember,
  DashboardStaffWorld,
} from "./dashboard-contract-support.js";

const PASSWORD_HASH = `$argon2id$v=19$m=19456,t=2,p=1$${"A".repeat(22)}$${"B".repeat(43)}`;
const IDLE_LIFETIMES = {
  client: 2_592_000,
  operator: 43_200,
  administrator: 43_200,
};
const SESSIONS_NOW_MS = Date.parse("2026-10-21T09:00:00.000Z");
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const STORE_CLOCK_START_MS = Date.parse("2026-10-21T10:00:00.000Z");
const STORE_CLOCK_STEP_MS = 1000;

/**
 * Every M10 fake, built as the tables they stand for are shared: one audit log, one availability head, one price book.
 * Each fake's test hands the contract its own port from here, and what the contract reads around the store, from the
 * fakes' own held rows. The stores' clock moves one second each time it is read, so the order of two writes is visible.
 */
export interface FakeDashboardWorld extends DashboardStaffWorld {
  readonly ledger: FakeDashboardAuditLedger;
  readonly priceBook: FakePriceBookStore;
  readonly availability: FakeCatalogueAvailabilityStore;
  readonly defaults: FakeKitchenDefaultsStore;
  readonly changes: FakeKitchenChangeStore;
  readonly notice: FakePriceNoticeStore;
}

export function newFakeDashboardWorld(): FakeDashboardWorld {
  let tick = 0;
  const now = () =>
    new Date(STORE_CLOCK_START_MS + STORE_CLOCK_STEP_MS * tick++);
  const accountIds = new Set<string>();
  const sessions = new FakeSessionStore({
    now: () => new Date(SESSIONS_NOW_MS),
    accountOf: (accountId) =>
      accountIds.has(accountId)
        ? {
            id: accountId,
            email: `staff-${accountId}@example.invalid`,
            role: "administrator",
            isEmailVerified: true,
          }
        : undefined,
    passwordHashOf: (accountId) =>
      accountIds.has(accountId) ? PASSWORD_HASH : undefined,
    passwordChangedAtOf: (accountId) =>
      accountIds.has(accountId)
        ? new Date("2026-01-01T00:00:00.000Z")
        : undefined,
  });
  const ledger = new FakeDashboardAuditLedger({ now, sessions });
  const availability = new FakeCatalogueAvailabilityStore({
    head: new FakeRevisionHead(),
    ledger,
  });
  const priceBook = new FakePriceBookStore({ now, ledger, availability });
  const defaults = new FakeKitchenDefaultsStore({ now, ledger, availability });
  const changes = new FakeKitchenChangeStore({ now, ledger });
  const notice = new FakePriceNoticeStore({ priceBook, availability });

  async function signedIn(): Promise<DashboardStaffMember> {
    const accountId = nanoid();
    accountIds.add(accountId);
    const sessionTokenHash = randomBytes(32).toString("hex");
    await sessions.create({
      tokenHash: sessionTokenHash,
      accountId,
      expectedPasswordHash: PASSWORD_HASH,
      absoluteExpiresAt: new Date(SESSIONS_NOW_MS + SESSION_LIFETIME_MS),
    });
    return {
      accountId,
      session: { sessionTokenHash, idleLifetimeSeconds: IDLE_LIFETIMES },
    };
  }

  return {
    ledger,
    priceBook,
    availability,
    defaults,
    changes,
    notice,
    aStaffMember: signedIn,
    async aStaffMemberWhoseSessionIsRevoked() {
      const member = await signedIn();
      await sessions.revoke(member.session.sessionTokenHash);
      return member;
    },
    // The stand-in for `revision::bigint + n` in the live world's SQL; a contract never does this itself.
    aRevisionAfter: (revision, steps) =>
      Promise.resolve(String(BigInt(revision) + BigInt(steps))),
    auditEventsOf: (accountId) =>
      Promise.resolve(
        ledger
          .heldEvents()
          .filter((event) => event.actorAccountId === accountId)
          .map(({ action, designId, detail }) => ({
            action,
            designId,
            detail,
          })),
      ),
  };
}
