import {
  FakeDashboardAuditLedger,
  FakeKitchenChangeStore,
  type HeldChangeKitchen,
  type KitchenChangeStore,
  type SessionStore,
} from "@lemnaria/persistence";

import {
  DRIVER_FAILURE_MARKER,
  aDesignId,
  currentAccountWorld,
  accountRequest,
  type AccountRequestInit,
} from "./account-world";

// The seen mark's world for a test: the persistence package's kitchen change fake, behind the audit ledger that joins
// to the account world's sessions the way the database joins them (the actor is the account of the live session the
// cookie names, and the `kitchen-seen` row commits with the mark or not at all). A test mocks the instance module with
// `kitchenChangeStoreModule()` and calls `freshSeenWorld()` after `freshAccountWorld()`. Every store method the route
// calls is recorded.

export const SENT_AT = new Date("2026-10-18T09:00:00.000Z");
const UPDATED_AT = new Date("2026-10-19T12:00:00.000Z");

export interface SeenWorld {
  readonly store: FakeKitchenChangeStore;
  readonly ledger: FakeDashboardAuditLedger;
  readonly port: KitchenChangeStore;
  /** Every store method the route called, in order, as `changes.markSeen`. */
  readonly calls: string[];
  /** Makes the store reject with `DRIVER_FAILURE_MARKER`. */
  failStore: boolean;
  /** Makes the audit row's session lookup fail, so the row cannot be staged while the store itself is healthy. */
  failAudit: boolean;
}

let current: SeenWorld | undefined;

export function currentSeenWorld(): SeenWorld {
  if (current === undefined) {
    throw new Error("No seen world: call freshSeenWorld() in beforeEach");
  }
  return current;
}

export function freshSeenWorld(): SeenWorld {
  const { sessions, now } = currentAccountWorld();
  const calls: string[] = [];
  const world: SeenWorld = {
    calls,
    failStore: false,
    failAudit: false,
    ledger: new FakeDashboardAuditLedger({
      now,
      sessions: sessionsFailingWhen(sessions, () => world.failAudit),
    }),
    store: undefined as never,
    port: undefined as never,
  };
  const store = new FakeKitchenChangeStore({ now, ledger: world.ledger });
  const port: KitchenChangeStore = {
    markSeen: (request) => {
      calls.push("changes.markSeen");
      if (world.failStore) return Promise.reject(driverFailure());
      return store.markSeen(request);
    },
    claimDigestDay: (dayKey) => store.claimDigestDay(dayKey),
    listDigestEligible: (now_) => store.listDigestEligible(now_),
    recordDigested: (roundId, entries) =>
      store.recordDigested(roundId, entries),
  };
  Object.assign(world, { store, port });
  current = world;
  return world;
}

export function kitchenChangeStoreModule() {
  return { getKitchenChangeStore: () => currentSeenWorld().port };
}

function sessionsFailingWhen(
  sessions: SessionStore,
  isFailing: () => boolean,
): SessionStore {
  return Object.assign(Object.create(sessions) as SessionStore, {
    findLive: (request: Parameters<SessionStore["findLive"]>[0]) =>
      isFailing()
        ? Promise.reject(driverFailure())
        : sessions.findLive(request),
  });
}

function driverFailure(): Error {
  return new Error(DRIVER_FAILURE_MARKER);
}

export interface SeenKitchenFixture extends Partial<HeldChangeKitchen> {
  /** The sent mark set, unless the caller says otherwise. */
  readonly isSent?: boolean;
  /** Owned by an account, unless the caller says it is a visitor's. */
  readonly hasAccount?: boolean;
}

/** A kitchen the seen mark can name: sent, owned by an account and at revision 5 unless the caller says otherwise. */
export function plantSeenKitchen(
  fixture: SeenKitchenFixture = {},
): HeldChangeKitchen {
  const { isSent = true, hasAccount = true, ...fields } = fixture;
  const designId = fields.designId ?? aDesignId();
  const kitchen: HeldChangeKitchen = {
    designId,
    ...(hasAccount ? { accountId: aDesignId() } : {}),
    ...(isSent ? { sentAt: SENT_AT } : {}),
    updatedAt: UPDATED_AT,
    revision: "5",
    isDeletedByClient: false,
    reference: `REF-${designId.slice(0, 6)}`,
    latestSubmissionRevision: "5",
    ...fields,
  };
  currentSeenWorld().store.plantKitchen(kitchen);
  return kitchen;
}

export function seenRequest(
  id: string,
  init: Omit<AccountRequestInit, "method"> = {},
) {
  return accountRequest(`/api/staff/kitchens/${id}/seen`, {
    ...init,
    method: "POST",
    headers: { "x-forwarded-for": "192.0.2.10", ...init.headers },
  });
}
