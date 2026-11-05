import type { ItemRef } from "@lemnaria/configurator-domain";
import { nanoid } from "nanoid";

import {
  isJsonObject,
  isListablePage,
  stampedWithVersion,
  storableJsonTextOf,
  storablePublishOf,
} from "./dashboard-store-shapes.js";
import type { StorablePublish } from "./dashboard-store-shapes.js";

import type { FakeCatalogueAvailabilityStore } from "./fake-catalogue-availability-store.js";
import {
  FakeRevisionHead,
  isRevisionShape,
  settle,
} from "./fake-dashboard-support.js";
import type { FakeDashboardAuditLedger } from "./fake-dashboard-support.js";
import type { FakeHeldDesigns } from "./fake-held-designs.js";
import {
  AVAILABILITY_CHANGED_MEANWHILE,
  buildIdsOf,
  CHANGED_MEANWHILE,
  DashboardStoreError,
  NO_ACTIVE_VERSION,
  PRICE_VERSION_PAGE_SIZE,
  VERSION_NOT_FOUND,
} from "./m10-ports.js";
import type {
  DeletedItem,
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
  /** Counted once, when the version is published, and never derived again. */
  readonly changeCount: number;
}

export interface FakePriceBookStoreOptions {
  /** The database's clock, for `published_at`. */
  readonly now?: () => Date;
  /** The audit log each write commits its row to, as the Neon transaction commits the audit insert. */
  readonly ledger: FakeDashboardAuditLedger;
  /** The availability log and head a publish takes its compare-and-set on and writes its created items to. */
  readonly availability: FakeCatalogueAvailabilityStore;
  /**
   * The saved designs a publish's deleted items are checked against. The fake reads this table alone and never a
   * `KitchenUsageReader` a route holds, so a test that stubs the route's reader leaves the guard intact.
   */
  readonly designs: FakeHeldDesigns;
}

/**
 * In-memory `PriceBookStore` (ADR 0178). The invariants a reader would not guess: a publish resets the draft to a
 * revision it has never held, so no earlier reader's revision fits it again; an expected active sequence ahead of the
 * newest is refused like one behind it, so the sequence has no gap; a publish also takes the availability head's
 * compare-and-set. Every write judges and writes in one turn of the event loop, so the fake cannot stand for two
 * transactions racing at a unique index.
 */
export class FakePriceBookStore implements PriceBookStore {
  private readonly versions: HeldVersion[] = [];
  private readonly draftRevision = new FakeRevisionHead();
  private draftChanges: readonly unknown[] = [];
  private readonly now: () => Date;
  private readonly ledger: FakeDashboardAuditLedger;
  private readonly availability: FakeCatalogueAvailabilityStore;
  private readonly designs: FakeHeldDesigns;

  constructor({
    now = () => new Date(),
    ledger,
    availability,
    designs,
  }: FakePriceBookStoreOptions) {
    this.now = now;
    this.ledger = ledger;
    this.availability = availability;
    this.designs = designs;
  }

  /** Whether the version exists, for the fakes that judge against the versions in the same turn. */
  hasHeldVersion(versionId: string): boolean {
    return this.versions.some((version) => version.versionId === versionId);
  }

  readActive(): Promise<ReadActiveVersionResult> {
    return settle("read the active price version", () => {
      const newest = this.versions.at(-1);
      if (newest === undefined) return NO_ACTIVE_VERSION;
      return {
        kind: "found",
        version: {
          versionId: newest.versionId,
          sequenceNumber: newest.sequenceNumber,
          label: newest.label,
          publishedAt: new Date(newest.publishedAt),
          book: structuredClone(newest.book),
        },
      };
    });
  }

  readVersion(versionId: string): Promise<ReadVersionResult> {
    return settle("read a price version", () => {
      const held = this.versions.find(
        (version) => version.versionId === versionId,
      );
      if (held === undefined) return VERSION_NOT_FOUND;
      return { kind: "found", version: this.storedVersionOf(held) };
    });
  }

  listVersions({ page }: PriceVersionPageRequest): Promise<PriceVersionPage> {
    return settle("list the price versions", () => {
      if (!isListablePage(page)) {
        throw new DashboardStoreError(
          "list the price versions",
          "invalid-request",
        );
      }
      const newestFirst = [...this.versions].reverse();
      const first = (page - 1) * PRICE_VERSION_PAGE_SIZE;
      const listed = newestFirst.slice(first, first + PRICE_VERSION_PAGE_SIZE);
      return {
        total: this.versions.length,
        page,
        pageSize: PRICE_VERSION_PAGE_SIZE,
        versions: listed.map((held) => ({
          versionId: held.versionId,
          sequenceNumber: held.sequenceNumber,
          label: held.label,
          state: this.stateOf(held),
          publishedAt: new Date(held.publishedAt),
          changeCount: held.changeCount,
        })),
      };
    });
  }

  readDraft(): Promise<PriceDraft> {
    return settle("read the price draft", () => ({
      draftRevision: this.draftRevision.current(),
      changes: structuredClone(this.draftChanges),
    }));
  }

  async writeDraft(request: WriteDraftRequest): Promise<WriteDraftResult> {
    const isStorable =
      isRevisionShape(request.expectedDraftRevision) &&
      storableJsonTextOf(request.changes, "array") !== undefined;
    if (!isStorable) {
      throw new DashboardStoreError("write the price draft", "invalid-request");
    }
    const staged = await this.ledger.stage({
      operation: "write the price draft",
      record: request.audit,
      accepts: DRAFT_WRITE_ACTIONS,
      onlyAdministrators: true,
    });
    if (request.expectedDraftRevision !== this.draftRevision.current()) {
      return CHANGED_MEANWHILE;
    }
    this.draftChanges = structuredClone(request.changes);
    const draftRevision = this.draftRevision.advance();
    staged.commit();
    return { kind: "ok", draftRevision };
  }

  async publish(
    request: PublishPriceBookRequest,
  ): Promise<PublishPriceBookResult> {
    const publishable = storablePublishOf(request);
    if (publishable === undefined) {
      throw new DashboardStoreError(
        "publish the price book",
        "invalid-request",
      );
    }
    const staged = await this.ledger.stage({
      operation: "publish the price book",
      record: request.audit,
      accepts: ["price-published"],
      provisional: {
        sequenceNumber: publishable.expectedActiveSequence + 1,
        changeCount: publishable.changeCount,
      },
      onlyAdministrators: true,
    });
    const newestSequence = this.versions.at(-1)?.sequenceNumber ?? 0;
    const planBook = this.versions.find(
      (version) => version.sequenceNumber === request.expectedActiveSequence,
    )?.book;
    if (isContradictedByTheBook(publishable, planBook)) {
      if (request.expectedActiveSequence !== newestSequence) {
        return CHANGED_MEANWHILE;
      }
      throw new DashboardStoreError(
        "publish the price book",
        "invalid-request",
      );
    }
    const itemsInUse = publishable.deletedItems
      .map(({ item }) => item)
      .filter((item) => this.designs.countUsing(item) > 0);
    if (itemsInUse.length > 0) {
      return { kind: "item-in-use", items: itemsInUse };
    }
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
    const versionId = nanoid();
    const held: HeldVersion = {
      versionId,
      sequenceNumber: newestSequence + 1,
      label: request.label,
      note: request.note,
      publishedAt: this.now(),
      book: structuredClone(
        stampedWithVersion(versionId, request.book as Record<string, unknown>),
      ),
      changeSummary: structuredClone(
        request.changeSummary as readonly unknown[],
      ),
      changeCount: publishable.changeCount,
    };
    this.versions.push(held);
    this.draftChanges = [];
    this.draftRevision.advance();
    staged.commit({
      sequenceNumber: held.sequenceNumber,
      changeCount: held.changeCount,
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
      book: structuredClone(held.book),
      state: this.stateOf(held),
      note: held.note,
      changeSummary: structuredClone(held.changeSummary),
    };
  }

  private stateOf(held: HeldVersion): "active" | "archived" {
    return held === this.versions.at(-1) ? "active" : "archived";
  }
}

/**
 * Whether the book at the sequence the plan was built from contradicts the request: a deleted linked accessory whose build
 * ids lack its rule's `linkedBuildId`, or a created row the book already states. Both are what the statement's
 * `unlinked_deletions` and `restated_creations` find.
 */
function isContradictedByTheBook(
  { deletedItems, createdItems }: StorablePublish,
  book: unknown,
): boolean {
  const states = (path: readonly string[], key: string, id: string) =>
    rowsAt(book, path).some((row) => isJsonObject(row) && row[key] === id);
  const isRestated = (created: ItemRef) =>
    (created.kind === "accessory" &&
      states(["linkedAccessories"], "accessoryId", created.accessoryId)) ||
    (created.kind === "hardware" &&
      (states(["hardware", "tiers"], "tierId", created.tierId) ||
        states(["material", "tiers"], "tierId", created.tierId)));
  return (
    deletedItems.some((deleted) => !hasItsLinkedBuildId(deleted, book)) ||
    createdItems.some(isRestated)
  );
}

/** Whether a deleted linked accessory's build ids hold the `linkedBuildId` of its rule in the book; a tier carries none. */
function hasItsLinkedBuildId(deleted: DeletedItem, book: unknown): boolean {
  const { item } = deleted;
  if (item.kind !== "accessory") return true;
  const buildIds = buildIdsOf(deleted);
  return rowsAt(book, ["linkedAccessories"]).some(
    (rule) =>
      isJsonObject(rule) &&
      rule["accessoryId"] === item.accessoryId &&
      typeof rule["linkedBuildId"] === "string" &&
      buildIds.includes(rule["linkedBuildId"]),
  );
}

/** The rows of the array the path names in the book, or none where the book has no such array. */
function rowsAt(book: unknown, path: readonly string[]): readonly unknown[] {
  let at: unknown = book;
  for (const key of path) {
    at = isJsonObject(at) ? at[key] : undefined;
  }
  return Array.isArray(at) ? at : NO_ROWS;
}

const NO_ROWS: readonly unknown[] = Object.freeze([]);
