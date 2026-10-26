import type { ItemRef } from "@lemnaria/configurator-domain";
import { nanoid } from "nanoid";

import type { FakeCatalogueAvailabilityStore } from "./fake-catalogue-availability-store.js";
import {
  FakeRevisionHead,
  isJsonObject,
  isNamedItem,
  isRevisionShape,
  settle,
} from "./fake-dashboard-support.js";
import type { FakeDashboardAuditLedger } from "./fake-dashboard-support.js";
import {
  AVAILABILITY_CHANGED_MEANWHILE,
  CHANGED_MEANWHILE,
  DashboardStoreError,
  NO_ACTIVE_VERSION,
  PRICE_VERSION_PAGE_SIZE,
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
      if (!Number.isSafeInteger(page) || page < 1) {
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
          changeCount: held.changeSummary.length,
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
    this.draftChanges = structuredClone(request.changes);
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
      book: structuredClone(request.book),
      changeSummary: structuredClone(
        request.changeSummary as readonly unknown[],
      ),
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
