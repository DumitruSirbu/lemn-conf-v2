import type { ItemRef } from "@lemnaria/configurator-domain";
import { nanoid } from "nanoid";

import { itemIdOf } from "./fake-catalogue-availability-store.js";
import type { FakeCatalogueAvailabilityStore } from "./fake-catalogue-availability-store.js";
import { FakeRevisionHead, isRevisionShape } from "./fake-dashboard-support.js";
import type { FakeDashboardAuditLedger } from "./fake-dashboard-support.js";
import {
  AVAILABILITY_CHANGED_MEANWHILE,
  CHANGED_MEANWHILE,
  DashboardStoreError,
  NO_ACTIVE_VERSION,
  VERSION_NOT_FOUND,
} from "./m10-ports.js";
import type {
  PriceBookStore,
  PriceDraft,
  PriceVersionPage,
  PriceVersionPageRequest,
  PublishPriceBookRequest,
  PublishPriceBookResult,
  ReadActiveVersionResult,
  ReadVersionResult,
  StoredPriceVersion,
  WriteDraftRequest,
  WriteDraftResult,
} from "./m10-ports.js";

/** How many versions the history page lists. */
export const PRICE_VERSION_PAGE_SIZE = 20;

const DRAFT_WRITE_ACTIONS = Object.freeze([
  "price-draft-changed",
  "price-draft-reverted",
  "price-bulk-changed",
  "price-restored-to-draft",
] as const);

interface HeldVersion {
  readonly versionId: string;
  readonly sequenceNumber: number;
  readonly label: string;
  readonly note: string;
  readonly publishedAt: Date;
  readonly book: unknown;
  readonly changeSummary: readonly unknown[];
}

export interface FakePriceBookStoreOptions {
  /** The database's clock, for `published_at`. */
  readonly now?: () => Date;
  /** The audit log each write commits its row to, as the Neon transaction commits the audit insert. */
  readonly ledger: FakeDashboardAuditLedger;
  /** The availability log and head a publish takes its compare-and-set on and writes its created items to. */
  readonly availability: FakeCatalogueAvailabilityStore;
}

/**
 * In-memory `PriceBookStore` with the contract the Neon store must honour: the newest version is the active one and
 * versions are only ever appended; a draft write and a publish are made against the draft revision the caller read and
 * a stale one writes nothing and no audit row; a publish also names the sequence it saw as active and is refused unless
 * that is the newest (a number ahead of it too, so the sequence has no gap); a publish resets the draft to no changes at
 * a revision that has never been the draft's before, so no earlier reader's revision fits it again. What a store is
 * given and what it returns are copies. A publish also takes the availability head's compare-and-set: a stale
 * `expectedAvailabilityRevision` refuses the whole publish as `availability-changed-meanwhile`; otherwise it moves the
 * head once for each created item, each logged switched off, or once with no row when it creates none, and answers the
 * head it left. It cannot stand for two racing transactions meeting a unique index (every write
 * judges and writes in one turn of the event loop), or for the database's clock.
 *
 * A stored `changeSummary` is a JSON array of the changes the version carried, and its length is the `changeCount`
 * the history lists. A `book` must be a JSON object. A write given anything else is refused as `invalid-request`.
 */
export class FakePriceBookStore implements PriceBookStore {
  private readonly versions: HeldVersion[] = [];
  private readonly draftRevision = new FakeRevisionHead();
  private draftChanges: readonly unknown[] = [];
  private readonly now: () => Date;
  private readonly ledger: FakeDashboardAuditLedger;
  private readonly availability: FakeCatalogueAvailabilityStore;

  constructor({
    now = () => new Date(),
    ledger,
    availability,
  }: FakePriceBookStoreOptions) {
    this.now = now;
    this.ledger = ledger;
    this.availability = availability;
  }

  /** Whether the version exists, for the fakes that judge against the versions in the same turn. */
  hasHeldVersion(versionId: string): boolean {
    return this.versions.some((version) => version.versionId === versionId);
  }

  readActive(): Promise<ReadActiveVersionResult> {
    const newest = this.versions.at(-1);
    if (newest === undefined) return Promise.resolve(NO_ACTIVE_VERSION);
    return Promise.resolve({
      kind: "found",
      version: {
        versionId: newest.versionId,
        sequenceNumber: newest.sequenceNumber,
        label: newest.label,
        publishedAt: new Date(newest.publishedAt),
        book: copyOf(newest.book),
      },
    });
  }

  readVersion(versionId: string): Promise<ReadVersionResult> {
    const held = this.versions.find(
      (version) => version.versionId === versionId,
    );
    if (held === undefined) return Promise.resolve(VERSION_NOT_FOUND);
    return Promise.resolve({
      kind: "found",
      version: this.storedVersionOf(held),
    });
  }

  listVersions({ page }: PriceVersionPageRequest): Promise<PriceVersionPage> {
    if (!Number.isSafeInteger(page) || page < 1) {
      return Promise.reject(
        new DashboardStoreError("list the price versions", "invalid-request"),
      );
    }
    const newestFirst = [...this.versions].reverse();
    const first = (page - 1) * PRICE_VERSION_PAGE_SIZE;
    const listed = newestFirst.slice(first, first + PRICE_VERSION_PAGE_SIZE);
    return Promise.resolve({
      total: this.versions.length,
      page,
      pageSize: PRICE_VERSION_PAGE_SIZE,
      versions: listed.map((held) => ({
        versionId: held.versionId,
        sequenceNumber: held.sequenceNumber,
        label: held.label,
        state: this.stateOf(held),
        publishedAt: new Date(held.publishedAt),
        changeCount: held.changeSummary.length,
      })),
    });
  }

  readDraft(): Promise<PriceDraft> {
    return Promise.resolve({
      draftRevision: this.draftRevision.current(),
      changes: copyOf(this.draftChanges),
    });
  }

  async writeDraft(request: WriteDraftRequest): Promise<WriteDraftResult> {
    if (!isRevisionShape(request.expectedDraftRevision)) {
      throw new DashboardStoreError("write the price draft", "invalid-request");
    }
    const staged = await this.ledger.stage({
      operation: "write the price draft",
      record: request.audit,
      accepts: DRAFT_WRITE_ACTIONS,
    });
    if (request.expectedDraftRevision !== this.draftRevision.current()) {
      return CHANGED_MEANWHILE;
    }
    this.draftChanges = copyOf(request.changes);
    const draftRevision = this.draftRevision.advance();
    staged.commit();
    return { kind: "ok", draftRevision };
  }

  async publish(
    request: PublishPriceBookRequest,
  ): Promise<PublishPriceBookResult> {
    requirePublishable(request);
    const staged = await this.ledger.stage({
      operation: "publish the price book",
      record: request.audit,
      accepts: ["price-published"],
      provisional: {
        sequenceNumber: request.expectedActiveSequence + 1,
        changeCount: (request.changeSummary as readonly unknown[]).length,
      },
    });
    const newestSequence = this.versions.at(-1)?.sequenceNumber ?? 0;
    if (
      request.expectedDraftRevision !== this.draftRevision.current() ||
      request.expectedActiveSequence !== newestSequence
    ) {
      return CHANGED_MEANWHILE;
    }
    if (
      request.expectedAvailabilityRevision !== this.availability.head.current()
    ) {
      return AVAILABILITY_CHANGED_MEANWHILE;
    }
    const availabilityRevision = this.logCreatedItems(request.createdItems);
    const held: HeldVersion = {
      versionId: nanoid(),
      sequenceNumber: newestSequence + 1,
      label: request.label,
      note: request.note,
      publishedAt: this.now(),
      book: copyOf(request.book),
      changeSummary: copyOf(request.changeSummary as readonly unknown[]),
    };
    this.versions.push(held);
    this.draftChanges = [];
    this.draftRevision.advance();
    staged.commit({
      sequenceNumber: held.sequenceNumber,
      changeCount: held.changeSummary.length,
    });
    return {
      kind: "ok",
      versionId: held.versionId,
      sequenceNumber: held.sequenceNumber,
      availabilityRevision,
    };
  }

  /** The head after the publish's own move: once per created item, each logged off, or once when there are none. */
  private logCreatedItems(createdItems: readonly ItemRef[]): string {
    if (createdItems.length === 0) return this.availability.head.advance();
    let revision = this.availability.head.current();
    for (const item of createdItems) {
      revision = this.availability.appendInactive(item);
    }
    return revision;
  }

  private storedVersionOf(held: HeldVersion): StoredPriceVersion {
    return {
      versionId: held.versionId,
      sequenceNumber: held.sequenceNumber,
      label: held.label,
      publishedAt: new Date(held.publishedAt),
      book: copyOf(held.book),
      state: this.stateOf(held),
      note: held.note,
      changeSummary: copyOf(held.changeSummary),
    };
  }

  private stateOf(held: HeldVersion): "active" | "archived" {
    return held === this.versions.at(-1) ? "active" : "archived";
  }
}

function requirePublishable(request: PublishPriceBookRequest): void {
  const isWellFormed =
    isRevisionShape(request.expectedDraftRevision) &&
    Number.isSafeInteger(request.expectedActiveSequence) &&
    request.expectedActiveSequence >= 0 &&
    typeof request.label === "string" &&
    typeof request.note === "string" &&
    isJsonObject(request.book) &&
    Array.isArray(request.changeSummary) &&
    isRevisionShape(request.expectedAvailabilityRevision) &&
    Array.isArray(request.createdItems) &&
    request.createdItems.every(isNamedItem);
  if (!isWellFormed) {
    throw new DashboardStoreError("publish the price book", "invalid-request");
  }
}

function isNamedItem(item: ItemRef): boolean {
  const id: unknown = itemIdOf(item);
  return typeof id === "string" && id !== "";
}

function isJsonObject(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function copyOf<Value>(value: Value): Value {
  return value === undefined ? value : structuredClone(value);
}
