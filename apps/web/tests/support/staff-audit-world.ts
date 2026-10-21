import {
  FakeStaffAuditStore,
  type PlantedStaffAuditEvent,
  type StaffAuditDirectoryAccount,
  type StaffAuditDirectoryDesign,
  type StaffAuditPage,
  type StaffAuditPageRequest,
  type StaffAuditStore,
} from "@lemnaria/persistence";

import {
  DRIVER_FAILURE_MARKER,
  aDesignId,
  currentAccountWorld,
} from "./account-world";

// The audit page route's world for a test: the persistence package's audit store fake with a directory that resolves
// the accounts and kitchens a test names (the shared staff world builds the fake without one, so every address there
// reads as gone), joined to the account world's sessions. Unlike the shared staff world, this port records `page` calls
// and every other method the route might wrongly call, so a test can say "the store was never asked".
//
// A test mocks the instance module with `staffAuditPageStoreModule()` and calls `freshAuditPageWorld()` after
// `freshAccountWorld()`.

export interface AuditPageWorld {
  readonly store: FakeStaffAuditStore;
  /** Every port call the route made, in order, as `audit.page` or `audit.record`. */
  readonly calls: string[];
  /** The request each `audit.page` call carried, as the route built it. */
  readonly pageRequests: StaffAuditPageRequest[];
  /** Makes `page` reject with `DRIVER_FAILURE_MARKER`. */
  failPage: boolean;
  /** Makes `record` reject with `DRIVER_FAILURE_MARKER`, so the row of a served page cannot be committed. */
  failRecord: boolean;
  /** Commits nothing for a served page's own row (the call is still recorded), for a test that reads several pages of a
   *  planted log and must not see its own earlier views in it. The rule that a row is written is pinned elsewhere. */
  discardRecords: boolean;
  /** Rewrites the page the store answers, so a test can hand the route members the port does not declare. */
  decoratePage: ((page: StaffAuditPage) => StaffAuditPage) | undefined;
  readonly port: StaffAuditStore;
  nameAccount(accountId: string, account: StaffAuditDirectoryAccount): void;
  nameDesign(designId: string, design: StaffAuditDirectoryDesign): void;
}

let current: AuditPageWorld | undefined;

function currentAuditPageWorld(): AuditPageWorld {
  if (current === undefined) {
    throw new Error("No audit page world: call freshAuditPageWorld()");
  }
  return current;
}

export function freshAuditPageWorld(): AuditPageWorld {
  const { sessions, now } = currentAccountWorld();
  const accounts = new Map<string, StaffAuditDirectoryAccount>();
  const designs = new Map<string, StaffAuditDirectoryDesign>();
  const store = new FakeStaffAuditStore({
    sessions,
    now,
    directory: {
      accountOf: (accountId) => accounts.get(accountId),
      designOf: (designId) => designs.get(designId),
    },
  });
  const calls: string[] = [];
  const pageRequests: StaffAuditPageRequest[] = [];
  const world: AuditPageWorld = {
    store,
    calls,
    pageRequests,
    failPage: false,
    failRecord: false,
    discardRecords: false,
    decoratePage: undefined,
    port: {
      page: async (request) => {
        calls.push("audit.page");
        pageRequests.push(request);
        if (world.failPage) throw new Error(DRIVER_FAILURE_MARKER);
        const page = await store.page(request);
        return world.decoratePage === undefined
          ? page
          : world.decoratePage(page);
      },
      record: async (record) => {
        calls.push("audit.record");
        if (world.failRecord) throw new Error(DRIVER_FAILURE_MARKER);
        if (!world.discardRecords) await store.record(record);
      },
    },
    nameAccount: (accountId, account) => accounts.set(accountId, account),
    nameDesign: (designId, design) => designs.set(designId, design),
  };
  current = world;
  return world;
}

export function staffAuditPageStoreModule() {
  return { getStaffAuditStore: () => currentAuditPageWorld().port };
}

export interface PlantedEvent extends Partial<PlantedStaffAuditEvent> {
  readonly actorAccountId: string;
}

/** A row in the log at an exact instant, with an id of the table's shape; unrecognised actions and details allowed. */
export function plantEvent(
  world: AuditPageWorld,
  event: PlantedEvent,
): PlantedStaffAuditEvent {
  const planted: PlantedStaffAuditEvent = {
    id: aDesignId(),
    occurredAt: new Date("2026-10-19T09:00:00.000Z"),
    action: "kitchen-opened",
    designId: null,
    subjectAccountId: null,
    detail: null,
    ...event,
  };
  world.store.plant(planted);
  return planted;
}
