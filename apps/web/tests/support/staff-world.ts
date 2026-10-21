import {
  FakeStaffAuditStore,
  FakeStaffKitchenReader,
  type PlantedStaffAccount,
  type PlantedStaffKitchen,
  type StaffAuditStore,
  type StaffKitchenReader,
} from "@lemnaria/persistence";

import {
  DRIVER_FAILURE_MARKER,
  aDesign,
  aDesignId,
  currentAccountWorld,
  seedSession,
  seedUnverifiedAccount,
  seedVerifiedAccount,
  type SeededAccount,
  type SeededSession,
} from "./account-world";

// The staff read routes' world for a test: the persistence package's staff reader and audit store fakes, joined to the
// account world's sessions the way the database joins them (the audit row's actor is the account of the live session
// the cookie names). A test mocks the two instance modules with the `...Module()` factories below and calls
// `freshStaffWorld()` after `freshAccountWorld()`. Every port call is recorded, and the audit store can be told to
// fail, to commit late, or to lose its session, so the tests can tell a row that was awaited from one that was not.

export type AuditBehaviour =
  | "commit"
  /** The write fails with a driver-shaped error carrying `DRIVER_FAILURE_MARKER`. */
  | "reject"
  /** The row commits only after a macrotask, so a route that does not wait for it answers before it exists. */
  | "commit-late"
  /** The sessions of `signedOutAccountId` end after the route read them and before the row is written. */
  | "lose-session";

export interface StaffWorld {
  readonly reader: FakeStaffKitchenReader;
  readonly audit: FakeStaffAuditStore;
  readonly readerPort: StaffKitchenReader;
  readonly auditPort: StaffAuditStore;
  /** Every port method the route called, in order, as `reader.listPage`, `reader.readOne` or `audit.record`. */
  readonly calls: string[];
  auditBehaviour: AuditBehaviour;
  /** Makes the reader's two methods reject with `DRIVER_FAILURE_MARKER`. */
  failReader: boolean;
  /** The account whose sessions `lose-session` ends. */
  signedOutAccountId: string | undefined;
}

let current: StaffWorld | undefined;

export function currentStaffWorld(): StaffWorld {
  if (current === undefined) {
    throw new Error("No staff world: call freshStaffWorld() in beforeEach");
  }
  return current;
}

export function freshStaffWorld(): StaffWorld {
  const { sessions, now } = currentAccountWorld();
  const reader = new FakeStaffKitchenReader();
  const audit = new FakeStaffAuditStore({ sessions, now });
  const calls: string[] = [];
  const world: StaffWorld = {
    reader,
    audit,
    calls,
    auditBehaviour: "commit",
    failReader: false,
    signedOutAccountId: undefined,
    readerPort: {
      listPage: (query) => {
        calls.push("reader.listPage");
        return world.failReader ? failure() : reader.listPage(query);
      },
      readOne: (designId) => {
        calls.push("reader.readOne");
        return world.failReader ? failure() : reader.readOne(designId);
      },
    },
    auditPort: {
      record: (record) => {
        calls.push("audit.record");
        return recordWith(world, record);
      },
      page: (request) => audit.page(request),
    },
  };
  current = world;
  return world;
}

export function staffKitchenReaderModule() {
  return { getStaffKitchenReader: () => currentStaffWorld().readerPort };
}

export function staffAuditStoreModule() {
  return { getStaffAuditStore: () => currentStaffWorld().auditPort };
}

function failure(): Promise<never> {
  return Promise.reject(new Error(DRIVER_FAILURE_MARKER));
}

async function recordWith(
  world: StaffWorld,
  record: Parameters<StaffAuditStore["record"]>[0],
): Promise<void> {
  switch (world.auditBehaviour) {
    case "reject":
      return failure();
    case "lose-session":
      await endSessionsOf(world.signedOutAccountId);
      return world.audit.record(record);
    case "commit-late": {
      const staged = await world.audit.stage(record);
      await new Promise((resolve) => setTimeout(resolve, 5));
      staged.commit();
      return;
    }
    case "commit":
      return world.audit.record(record);
  }
}

async function endSessionsOf(accountId: string | undefined): Promise<void> {
  if (accountId === undefined) throw new Error("lose-session names no account");
  await currentAccountWorld().sessions.revokeAllForAccount(accountId);
}

// ---------------------------------------------------------------------------------------------------------------------
// Staff, clients and kitchens

export interface StaffCaller {
  readonly role: "client" | "operator" | "administrator";
  /** `false` for an account that has not confirmed its address. */
  readonly isVerified?: false;
}

export interface SignedInStaff {
  readonly account: SeededAccount;
  readonly session: SeededSession;
}

/** A signed-in account of the role, its address confirmed unless the caller says it is not. */
export async function signedInAs(
  caller: StaffCaller,
  email = `${caller.role}@example.test`,
): Promise<SignedInStaff> {
  const { accounts } = currentAccountWorld();
  const isUnverified = caller.isVerified === false;
  const account = isUnverified
    ? await seedUnverifiedAccount(email)
    : await seedVerifiedAccount({ email, role: caller.role });
  if (isUnverified) accounts.setRoleOf(account.id, caller.role);
  return { account, session: await seedSession(account) };
}

export interface PlantedClient extends PlantedStaffAccount {
  readonly postalAddress: string;
}

/** A client the reader can join. Its id has the shape of a real account id, which the audit row's subject requires. */
export function plantClient(
  fields: Partial<Omit<PlantedStaffAccount, "id">> = {},
): PlantedClient {
  const id = aDesignId();
  const client = {
    id,
    email: `client-${id.slice(0, 6).toLowerCase()}@example.test`,
    name: "Ana Client",
    phone: "+37369000000",
    ...fields,
  };
  currentStaffWorld().reader.plantAccount(client);
  return { ...client, postalAddress: "Strada Secreta 7, Chisinau" };
}

export const SENT_AT = new Date("2026-10-18T09:00:00.000Z");
export const UPDATED_AT = new Date("2026-10-19T12:00:00.000Z");

export interface KitchenFixture extends Partial<PlantedStaffKitchen> {
  /** A kitchen the sent mark was set on. */
  readonly isSent?: boolean;
}

/** A kitchen with its own id, a readable document, sent unless the caller says otherwise. */
export function plantKitchen(
  fixture: KitchenFixture = {},
): PlantedStaffKitchen {
  const { isSent = true, ...fields } = fixture;
  const id = fields.id ?? aDesignId();
  const kitchen: PlantedStaffKitchen = {
    id,
    name: null,
    design: aDesign(id.slice(0, 4)),
    accountId: null,
    sentAt: isSent ? SENT_AT : null,
    updatedAt: UPDATED_AT,
    isHidden: false,
    isDeletedByClient: false,
    ...fields,
  };
  currentStaffWorld().reader.plantKitchen(kitchen);
  return kitchen;
}
