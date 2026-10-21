import {
  FakeStaffKitchenActionsStore,
  type ActionAccountDirectory,
  type HeldActionKitchen,
  type StaffKitchenActionsStore,
} from "@lemnaria/persistence";

import {
  DRIVER_FAILURE_MARKER,
  accountRequest,
  aDesignId,
  currentAccountWorld,
  type AccountRequestInit,
} from "./account-world";
import {
  SENT_AT,
  currentStaffWorld,
  signedInAs,
  type SignedInStaff,
  type StaffCaller,
} from "./staff-world";

// The staff write routes' world for a test: the persistence package's staff actions store fake, joined
// to the account world's sessions and to the staff world's audit store the way the database joins them (the actor is the
// account of the live session the cookie names, and the audit row commits with the change or not at all). A test mocks
// the instance module with `staffKitchenActionsStoreModule()` and calls `freshStaffActionsWorld()` after
// `freshAccountWorld()` and `freshStaffWorld()`. Every store method a route calls is recorded.

export interface StaffActionsWorld {
  readonly store: FakeStaffKitchenActionsStore;
  readonly port: StaffKitchenActionsStore;
  /** Every store method the route called, in order, as `actions.addNote`, `actions.setStatus` or `actions.unhide`. */
  readonly calls: string[];
  /** Makes the three methods reject with `DRIVER_FAILURE_MARKER`. */
  failStore: boolean;
  /** Each staff member the test signed in, by account id, as the author and changer of a row resolves. */
  readonly directory: Map<string, { email: string; name: string | null }>;
}

let current: StaffActionsWorld | undefined;

export function currentStaffActionsWorld(): StaffActionsWorld {
  if (current === undefined) {
    throw new Error(
      "No staff actions world: call freshStaffActionsWorld() in beforeEach",
    );
  }
  return current;
}

export function freshStaffActionsWorld(): StaffActionsWorld {
  const { sessions, now } = currentAccountWorld();
  const directory: StaffActionsWorld["directory"] = new Map();
  const accounts: ActionAccountDirectory = {
    accountOf: (accountId) => directory.get(accountId),
  };
  const store = new FakeStaffKitchenActionsStore({
    now,
    sessions,
    audit: currentStaffWorld().audit,
    directory: accounts,
  });
  const calls: string[] = [];
  const world: StaffActionsWorld = {
    store,
    calls,
    failStore: false,
    directory,
    port: {
      addNote: (request) => {
        calls.push("actions.addNote");
        return world.failStore ? failure() : store.addNote(request);
      },
      setStatus: (request) => {
        calls.push("actions.setStatus");
        return world.failStore ? failure() : store.setStatus(request);
      },
      unhide: (request) => {
        calls.push("actions.unhide");
        return world.failStore ? failure() : store.unhide(request);
      },
    },
  };
  current = world;
  return world;
}

export function staffKitchenActionsStoreModule() {
  return { getStaffKitchenActionsStore: () => currentStaffActionsWorld().port };
}

function failure(): Promise<never> {
  return Promise.reject(new Error(DRIVER_FAILURE_MARKER));
}

/** A signed-in account of the role whose address and name the store resolves for the rows it writes. */
export async function signedInStaffNamed(
  caller: StaffCaller,
  email: string,
  name: string | null = "Staff Name",
): Promise<SignedInStaff> {
  const staff = await signedInAs(caller, email);
  currentStaffActionsWorld().directory.set(staff.account.id, { email, name });
  return staff;
}

export interface ActionKitchenFixture extends Partial<HeldActionKitchen> {
  /** The sent mark set, unless the caller says otherwise. */
  readonly isSent?: boolean;
}

/** A kitchen the store can write on: sent, visible and owned by an account unless the caller says otherwise. */
export function plantActionKitchen(
  fixture: ActionKitchenFixture = {},
): HeldActionKitchen {
  const { isSent = true, ...fields } = fixture;
  const kitchen: HeldActionKitchen = {
    id: aDesignId(),
    accountId: aDesignId(),
    sentAt: isSent ? SENT_AT : null,
    isHidden: false,
    isDeletedByClient: false,
    ...fields,
  };
  currentStaffActionsWorld().store.plantKitchen(kitchen);
  return kitchen;
}

// ---------------------------------------------------------------------------------------------------------------------
// Requests

type WriteRequestInit = Omit<AccountRequestInit, "method">;

const SOME_NETWORK = { "x-forwarded-for": "192.0.2.10" };

function writeRequest(
  path: string,
  method: string,
  init: WriteRequestInit,
): ReturnType<typeof accountRequest> {
  return accountRequest(path, {
    ...init,
    method,
    headers: { ...SOME_NETWORK, ...init.headers },
  });
}

export function noteRequest(id: string, init: WriteRequestInit = {}) {
  return writeRequest(`/api/staff/kitchens/${id}/notes`, "POST", init);
}

export function statusRequest(id: string, init: WriteRequestInit = {}) {
  return writeRequest(`/api/staff/kitchens/${id}/status`, "PUT", init);
}

export function unhideRequest(id: string, init: WriteRequestInit = {}) {
  return writeRequest(`/api/staff/kitchens/${id}/unhide`, "POST", init);
}
