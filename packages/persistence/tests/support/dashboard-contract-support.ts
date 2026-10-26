import type {
  CatalogueActivationAuditInput,
  DashboardAuditEntry,
  ItemRef,
} from "@lemnaria/configurator-domain";
import { expect } from "vitest";

import { DashboardStoreError } from "../../src/m10-ports.js";
import type {
  PricePublishedAuditInput,
  CatalogueAvailabilityStore,
  DashboardStoreFailure,
  PriceBookStore,
} from "../../src/m10-ports.js";
import type { StaffActingSession } from "../../src/staff-kitchen-actions-store.js";
import { rejectionOf } from "./rejection-of.js";

/** A staff member the world has signed in: the account, and the session a call acts for. */
export interface DashboardStaffMember {
  readonly accountId: string;
  readonly session: StaffActingSession;
}

/** A row of the staff audit log as the contract reads it. */
export interface StoredDashboardAuditEvent {
  readonly action: string;
  readonly designId: string | undefined;
  readonly detail: unknown;
}

/**
 * What every dashboard contract needs of its surroundings, which the fake and the live test database each provide so
 * that the same assertions run against both.
 */
export interface DashboardStaffWorld {
  aStaffMember(): Promise<DashboardStaffMember>;
  aStaffMemberWhoseSessionIsRevoked(): Promise<DashboardStaffMember>;
  /** Every audit row whose actor is the account, oldest first. */
  auditEventsOf(
    accountId: string,
  ): Promise<readonly StoredDashboardAuditEvent[]>;
}

export function auditRecordOf<Entry>(
  staff: DashboardStaffMember,
  entry: Entry,
): { readonly session: StaffActingSession; readonly entry: Entry } {
  return { session: staff.session, entry };
}

export const DRAFT_CHANGED = {
  action: "price-draft-changed",
  detail: { changeKind: "depth-rule" },
} as const satisfies DashboardAuditEntry;

export const KITCHEN_SEEN = {
  action: "kitchen-seen",
  detail: {},
} as const satisfies DashboardAuditEntry;

/** The publish entry as a caller builds it: without the sequence and change count, which the store fills. */
export function publishedEntry(): PricePublishedAuditInput {
  return { action: "price-published", detail: { provisional: true } };
}

/** The audit entry of an availability write: without the revision, which only the store knows (X0 review M4). */
export function activationEntryFor(
  item: ItemRef,
  active: boolean,
): CatalogueActivationAuditInput {
  return {
    action: "catalogue-item-activation-changed",
    detail: { itemKind: item.kind, itemId: itemIdOf(item), active },
  };
}

function itemIdOf(item: ItemRef): string {
  switch (item.kind) {
    case "material":
    case "hardware":
      return item.tierId;
    case "finish":
      return item.finishId;
    case "handle":
      return item.handle;
    case "accessory":
      return item.accessoryId;
  }
}

/** A book as the fakes and the Neon stores read one: tiers by `tierId`, the two built-in accessories as named fields. */
export const A_BOOK = Object.freeze({
  version: "2026-10",
  material: {
    defaultTierId: "pal",
    tiers: [{ tierId: "pal" }, { tierId: "mdf" }, { tierId: "fenix" }],
  },
  hardware: {
    defaultTierId: "standard",
    tiers: [{ tierId: "standard" }, { tierId: "premium" }],
  },
  accessories: { sinkProtectiveCover: {}, dishDryingRack: {} },
  linkedAccessories: [{ accessoryId: "plinth-light" }],
});

/**
 * Publishes the next version from the draft as it stands, taking every revision from the stores themselves, creating
 * no items, and answers the version. A seed for the contracts that need an active book, not a thing under test.
 */
export async function publishNextVersion(
  store: PriceBookStore,
  availability: CatalogueAvailabilityStore,
  staff: DashboardStaffMember,
  book: unknown = A_BOOK,
): Promise<{
  readonly versionId: string;
  readonly sequenceNumber: number;
  readonly availabilityRevision: string;
}> {
  const draft = await store.readDraft();
  const active = await store.readActive();
  const expectedActiveSequence =
    active.kind === "found" ? active.version.sequenceNumber : 0;
  const result = await store.publish({
    expectedDraftRevision: draft.draftRevision,
    expectedActiveSequence,
    expectedAvailabilityRevision: (await availability.readCurrent()).revision,
    createdItems: [],
    label: "Test version",
    note: "A version a contract seeded.",
    book,
    changeSummary: [],
    audit: auditRecordOf(staff, publishedEntry()),
  });
  if (result.kind !== "ok") {
    throw new Error(`the seed publish was refused: ${result.kind}`);
  }
  return result;
}

export async function dashboardFailureOf(
  pending: PromiseLike<unknown>,
  failure: DashboardStoreFailure,
): Promise<DashboardStoreError> {
  const rejection = await rejectionOf(pending);
  expect(rejection).toBeInstanceOf(DashboardStoreError);
  expect((rejection as DashboardStoreError).failure).toBe(failure);
  return rejection as DashboardStoreError;
}

/** Items in one order, so two lists compare as the sets they are. */
export function sortedItems(items: readonly ItemRef[]): ItemRef[] {
  return [...items].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
}
