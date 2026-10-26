import type {
  CatalogueActivationAuditInput,
  DashboardAuditEntry,
  ItemRef,
} from "@lemnaria/configurator-domain";
import { CATALOGUE_ACTIVATION_AUDIT_ACTION } from "@lemnaria/configurator-domain";
import { nanoid } from "nanoid";
import { expect } from "vitest";

import { itemIdOf } from "../../src/fake-dashboard-support.js";
import { DashboardStoreError } from "../../src/m10-ports.js";
import type {
  CatalogueAvailabilityStore,
  DashboardStoreFailure,
  PriceBookStore,
  PricePublishedAuditInput,
  PublishPriceBookRequest,
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
  /**
   * The revision `steps` writes after `revision`. Contracts never do arithmetic on a revision (A-12): the fake counts
   * and the live world asks the database, so "ahead of the head" and "moved by exactly n" read the same in both. The
   * Neon world implements it as `($1::bigint + $2)::text`; past the widest `bigint` both reject, as SQL raises
   * "bigint out of range".
   */
  aRevisionAfter(revision: string, steps: number): Promise<string>;
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

/** The audit entry of an availability write: without the revision, which only the store knows. */
export function activationEntryFor(
  item: ItemRef,
  active: boolean,
): CatalogueActivationAuditInput {
  return {
    action: CATALOGUE_ACTIVATION_AUDIT_ACTION,
    detail: { itemKind: item.kind, itemId: itemIdOf(item), active },
  };
}

/** Every kind but the handle, whose values are a closed list of the book's own: a contract cannot mint one. */
export type MintableItemKind = Exclude<ItemRef["kind"], "handle">;

/**
 * An item no earlier test or run has switched, so that what a contract reads of it is its own doing. The catalogue log
 * is append-only and a shared test database keeps every row, so a contract switches only items it minted: a real item
 * switched there would stay switched for every later reader of that database.
 */
export function aNewItem(kind: MintableItemKind): ItemRef {
  const id = `item-${nanoid(10)}`;
  switch (kind) {
    case "material":
    case "hardware":
      return { kind, tierId: id };
    case "finish":
      return { kind, finishId: id };
    case "accessory":
      return { kind, accessoryId: id };
  }
}

/** What a publish creates: a hardware class and a linked accessory, both new. */
export function aNewItemPair(): readonly [ItemRef, ItemRef] {
  return [aNewItem("hardware"), aNewItem("accessory")];
}

/** The items switched off in `after` and not in `before`, in one order: what a write added to the switched-off set. */
export function itemsSwitchedOffBetween(
  before: readonly ItemRef[],
  after: readonly ItemRef[],
): ItemRef[] {
  const wasOff = new Set(before.map((item) => JSON.stringify(item)));
  return sortedItems(after.filter((item) => !wasOff.has(JSON.stringify(item))));
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

/** The sequence number of the active version, or 0 when none is published. */
export async function newestSequenceOf(store: PriceBookStore): Promise<number> {
  const active = await store.readActive();
  return active.kind === "found" ? active.version.sequenceNumber : 0;
}

/**
 * A publish that is right in every respect: each expected revision and sequence is read from the stores, no item is
 * created and the draft is taken as it stands. A caller names what it means to get wrong in `overrides`.
 */
export async function publishRequestFor(
  store: PriceBookStore,
  availability: CatalogueAvailabilityStore,
  staff: DashboardStaffMember,
  overrides: Partial<PublishPriceBookRequest> = {},
): Promise<PublishPriceBookRequest> {
  return {
    expectedDraftRevision: (await store.readDraft()).draftRevision,
    expectedActiveSequence: await newestSequenceOf(store),
    expectedAvailabilityRevision: (await availability.readCurrent()).revision,
    createdItems: [],
    label: "Test version",
    note: "A version a contract seeded.",
    book: A_BOOK,
    changeSummary: [],
    audit: auditRecordOf(staff, publishedEntry()),
    ...overrides,
  };
}

/** Publishes the next version as the stores stand. A seed for the contracts that need an active book, not a test. */
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
  const result = await store.publish(
    await publishRequestFor(store, availability, staff, { book }),
  );
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
