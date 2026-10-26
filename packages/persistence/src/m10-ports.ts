import { DASHBOARD_AUDIT_ACTIONS } from "@lemnaria/configurator-domain";
import type {
  CatalogueActivationAuditInput,
  CatalogueAvailability,
  DashboardAuditEntry,
  DraftChange,
  ItemRef,
  PricePublishedDetail,
} from "@lemnaria/configurator-domain";

import type { DesignRevision } from "./design-revision.js";
import type { StaffActingSession } from "./staff-kitchen-actions-store.js";

// The persistence ports of M10, the manufacturer price dashboard (plan §8.4 c; ADR 0178). Interfaces and answers only:
// lane S implements them, and the domain and the routes are written against them, with fakes, before any table exists.
//
// Three rules hold for every port here.
// - **No absent value as `null`.** An answer that can be "there is none" is a named special-case object
//   (`NO_ACTIVE_VERSION`), and a refusal the caller acts on is a `kind` of the result. A failure to answer is a thrown
//   `DashboardStoreError`.
// - **The book is `unknown`.** It, a draft's stored changes and the defaults are jsonb: the store never imports a book
//   type, and the domain parses what it reads. What a store is given to write is typed, so a caller cannot hand it
//   anything the domain did not build.
// - **Every staff write takes an audit entry and commits it in the same transaction** as the change, taking the actor
//   from the live session in the same statement (`StaffActingSession`), as `StaffKitchenActionsStore` does. A write
//   refused as `changed-meanwhile` wrote nothing, and no audit row either. Only three writes have no staff actor and
//   so no audit entry, and they are named (A-22, F3): the customer's price-notice marker (`PriceNoticeStore`), the
//   digest's rounds and entries (`KitchenChangeStore.recordDigested`), and the owner-run seed, which is no port.
//
// A revision is an opaque string, compared only for equality. A row that does not exist yet reads as
// `INITIAL_REVISION`, and the first write expects it.

/** What a revision reads as before any row exists: the draft, the defaults and the availability log all start here. */
export const INITIAL_REVISION = "0";

/** The staff member who acts and what they did. The store reads `entry` again with the domain before it writes. */
export interface DashboardAuditRecord {
  readonly session: StaffActingSession;
  readonly entry: DashboardAuditEntry;
}

export type DashboardStoreOperation =
  | "read the active price version"
  | "read a price version"
  | "list the price versions"
  | "read the price draft"
  | "write the price draft"
  | "publish the price book"
  | "read the kitchen defaults"
  | "save the kitchen defaults"
  | "count the kitchens using an item"
  | "mark a kitchen as seen"
  | "claim a digest day"
  | "list the kitchens a digest holds"
  | "record a digest"
  | "read the catalogue availability"
  | "set an item's availability"
  | "read a design's acknowledged prices"
  | "record a design's first-open prices"
  | "record a design's acknowledged prices";

/**
 * Why a call failed, in the few kinds a route acts on. As for the other staff stores:
 * - `unavailable`: a table is missing or the application role lacks a grant. The route answers 503.
 * - `not-recorded`: no live session stood behind a write, so nothing was written.
 * - `invalid-request`: code refused the request before any statement.
 * - `unexpected-answer`: the database answered with something this port does not read.
 * - `database`: any other refusal or failure.
 *
 * A route that must not answer without a committed audit row treats every kind as a failure to answer.
 */
export type DashboardStoreFailure =
  | "unavailable"
  | "not-recorded"
  | "invalid-request"
  | "unexpected-answer"
  | "database";

/** Its message is fixed text and holds no value: no id, label, note or driver text. */
export class DashboardStoreError extends Error {
  readonly operation: DashboardStoreOperation;
  readonly failure: DashboardStoreFailure;

  constructor(
    operation: DashboardStoreOperation,
    failure: DashboardStoreFailure,
    options?: ErrorOptions,
  ) {
    super(
      `The price dashboard store could not ${operation}: ${failure}.`,
      options?.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "DashboardStoreError";
    this.operation = operation;
    this.failure = failure;
  }
}

/** A write made against a revision that is no longer current. Nothing was written, and no audit row either. */
export const CHANGED_MEANWHILE = Object.freeze({
  kind: "changed-meanwhile",
} as const);
export type ChangedMeanwhile = typeof CHANGED_MEANWHILE;

// ---------------------------------------------------------------------------------------------------------------------
// PriceBookStore

/**
 * The version prices are read from: the newest row (F7). `book` is the stored jsonb, parsed by nobody yet.
 * `sequenceNumber` strictly increases from 1 and is what a publish expects (`expectedActiveSequence`).
 */
export interface ActivePriceVersion {
  readonly versionId: string;
  readonly sequenceNumber: number;
  /** Authored text. Not an input to any decision. */
  readonly label: string;
  readonly publishedAt: Date;
  readonly book: unknown;
}

/** A version as history shows it, read-only. `state` is derived, not stored: the newest row is active (F7). */
export interface StoredPriceVersion extends ActivePriceVersion {
  readonly state: "active" | "archived";
  /** Authored text. */
  readonly note: string;
  /** The published `DraftChange[]` as a JSON array, with minted ids and group ids (m8). `changeCount` is its length. */
  readonly changeSummary: unknown;
}

export interface PriceVersionSummary {
  readonly versionId: string;
  readonly sequenceNumber: number;
  readonly label: string;
  readonly state: "active" | "archived";
  readonly publishedAt: Date;
  /** The length of the stored change summary's array, derived and stored nowhere else (X0-5, m8). */
  readonly changeCount: number;
}

export interface PriceVersionPageRequest {
  /** From 1. */
  readonly page: number;
}

/** How many versions the history page lists. */
export const PRICE_VERSION_PAGE_SIZE = 20;

export interface PriceVersionPage {
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  /** Newest first. */
  readonly versions: readonly PriceVersionSummary[];
}

/** No version has ever been published. Every price surface then renders no figure (A-10). */
export const NO_ACTIVE_VERSION = Object.freeze({
  kind: "no-active-version",
} as const);
export type NoActiveVersion = typeof NO_ACTIVE_VERSION;

/** The id names no version: unknown, or not a shape this store holds. */
export const VERSION_NOT_FOUND = Object.freeze({
  kind: "version-not-found",
} as const);
export type VersionNotFound = typeof VERSION_NOT_FOUND;

export type ReadActiveVersionResult =
  | { readonly kind: "found"; readonly version: ActivePriceVersion }
  | NoActiveVersion;

export type ReadVersionResult =
  | { readonly kind: "found"; readonly version: StoredPriceVersion }
  | VersionNotFound;

/** The ordered changes awaiting publication. `changes` is jsonb the domain parses back into `DraftChange`s. */
export interface PriceDraft {
  readonly draftRevision: string;
  readonly changes: readonly unknown[];
}

export interface WriteDraftRequest {
  readonly expectedDraftRevision: string;
  readonly changes: readonly DraftChange[];
  readonly audit: DashboardAuditRecord;
}

export type WriteDraftResult =
  | { readonly kind: "ok"; readonly draftRevision: string }
  | ChangedMeanwhile;

/** The `price-published` entry as a caller builds it: without the two members only the store knows. */
export interface PricePublishedAuditInput {
  readonly action: "price-published";
  readonly detail: Omit<PricePublishedDetail, "sequenceNumber" | "changeCount">;
}

/** The staff member who publishes, and the entry without the sequence and change count the publish will produce. */
export interface PublishAuditRecord {
  readonly session: StaffActingSession;
  readonly entry: PricePublishedAuditInput;
}

export interface PublishPriceBookRequest {
  readonly expectedDraftRevision: string;
  /** The sequence number of the version the publisher saw as active, or 0 while none exists. The new row takes the next. */
  readonly expectedActiveSequence: number;
  /** Authored text, bounded by the domain. */
  readonly label: string;
  readonly note: string;
  /**
   * The candidate book the server computed from the stored draft at `expectedDraftRevision` and judged (F10). It is
   * never a book a request carried. Stored whole and immutable.
   */
  readonly book: unknown;
  /** The published `DraftChange[]`, as a JSON array (m8). It is stored whole; `changeCount` is its length. */
  readonly changeSummary: unknown;
  /** The availability head the publisher read. A publish takes the same compare-and-set as an availability write (M1). */
  readonly expectedAvailabilityRevision: string;
  /** The rows this publish creates (hardware classes and linked accessories). Each is logged inactive, in order (A-17). */
  readonly createdItems: readonly ItemRef[];
  /**
   * `price-published` without `sequenceNumber` and `changeCount`. The store fills both: the sequence it inserted and the
   * length of the change summary it stored. A value forced into either through a cast is overwritten.
   */
  readonly audit: PublishAuditRecord;
}

export type PublishPriceBookResult =
  | {
      readonly kind: "ok";
      readonly versionId: string;
      readonly sequenceNumber: number;
      /** The head after the publish: it moved once per created item, or once when there were none. */
      readonly availabilityRevision: string;
    }
  | ChangedMeanwhile
  | AvailabilityChangedMeanwhile;

/**
 * Published versions are append-only (no update, no delete) and the newest is the active one (F7). `publish` is one
 * transaction: the availability head compare-and-set and the created items' inactive log rows (A-17), the insert at
 * `expectedActiveSequence + 1`, the draft reset and the audit row, or none of them. Of two racing publishes the second
 * meets the uniqueness of the sequence and is `changed-meanwhile`; a stale `expectedAvailabilityRevision` is
 * `availability-changed-meanwhile`.
 *
 * The store does not return `item-is-default` or a used deletion: the domain judges both **before** the call, against
 * defaults and usage read at `expectedAvailabilityRevision`, which the compare-and-set keeps current (M5).
 */
export interface PriceBookStore {
  readActive(): Promise<ReadActiveVersionResult>;
  readVersion(versionId: string): Promise<ReadVersionResult>;
  listVersions(request: PriceVersionPageRequest): Promise<PriceVersionPage>;
  /** A draft that was never written reads as `{draftRevision: INITIAL_REVISION, changes: []}`. */
  readDraft(): Promise<PriceDraft>;
  writeDraft(request: WriteDraftRequest): Promise<WriteDraftResult>;
  publish(request: PublishPriceBookRequest): Promise<PublishPriceBookResult>;
}

// ---------------------------------------------------------------------------------------------------------------------
// KitchenDefaultsStore

export interface SavedKitchenDefaults {
  readonly revision: string;
  /** The stored jsonb, parsed by nobody yet. Unversioned: a save applies at once (A-9). */
  readonly defaults: unknown;
  readonly savedAt: Date;
}

/** No defaults were ever saved, so a new kitchen starts from the fixed fallbacks. The seeded row, which holds `{}`, reads
 *  the same. */
export const NONE_SAVED = Object.freeze({ kind: "none-saved" } as const);
export type NoneSaved = typeof NONE_SAVED;

export type ReadKitchenDefaultsResult =
  | { readonly kind: "saved"; readonly saved: SavedKitchenDefaults }
  | NoneSaved;

export interface SaveKitchenDefaultsRequest {
  readonly expectedRevision: string;
  /** The availability head the saver read. The save increments that head in its own transaction (A-17, F1). */
  readonly expectedAvailabilityRevision: string;
  readonly defaults: unknown;
  readonly audit: DashboardAuditRecord;
}

/** The availability head moved since the saver read it: nothing was written. */
export const AVAILABILITY_CHANGED_MEANWHILE = Object.freeze({
  kind: "availability-changed-meanwhile",
} as const);
export type AvailabilityChangedMeanwhile =
  typeof AVAILABILITY_CHANGED_MEANWHILE;

export type SaveKitchenDefaultsResult =
  | {
      readonly kind: "ok";
      readonly revision: string;
      /** The availability head after the save, which moved once. */
      readonly availabilityRevision: string;
    }
  | ChangedMeanwhile
  | AvailabilityChangedMeanwhile;

/**
 * The store returns only the two compare-and-set refusals (m2). `item-unavailable` is the domain's judgement, made
 * before the call under the same compare-and-set, because the store cannot read `defaults` (it is `unknown`).
 */
export interface KitchenDefaultsStore {
  read(): Promise<ReadKitchenDefaultsResult>;
  save(request: SaveKitchenDefaultsRequest): Promise<SaveKitchenDefaultsResult>;
}

// ---------------------------------------------------------------------------------------------------------------------
// KitchenUsageReader

/** The one read the dashboard's disable and delete dialogs and the publish-time judgement make. */
export interface KitchenUsageReader {
  /** The number of saved designs, not deleted by their client, that use the item at any level. */
  count(item: ItemRef): Promise<number>;
}

// ---------------------------------------------------------------------------------------------------------------------
// KitchenChangeStore

export interface MarkKitchenSeenRequest {
  readonly designId: string;
  /** The revision the page displayed, so a save landing between load and mark keeps the badge (A-12). */
  readonly displayedRevision: DesignRevision;
  /** `kitchen-seen`, naming the design. */
  readonly audit: DashboardAuditRecord;
}

/** The displayed revision is greater than the kitchen's current one, compared in SQL (F9). Nothing was written. */
export const DISPLAYED_REVISION_AHEAD = Object.freeze({
  kind: "displayed-revision-ahead",
} as const);
export type DisplayedRevisionAhead = typeof DISPLAYED_REVISION_AHEAD;

/**
 * `not-found` is the one kitchen refusal: unknown, malformed, deleted by its client, or an unsent draft (P-L3-4).
 */
export type MarkKitchenSeenResult =
  | { readonly kind: "ok" }
  | { readonly kind: "not-found" }
  | DisplayedRevisionAhead;

/** `YYYY-MM-DD`, the calendar day in Europe/Chisinau. */
export type DigestDayKey = string;

/** The day was already claimed by an earlier round, so this one does not run (A-13). */
export const ALREADY_CLAIMED = Object.freeze({
  kind: "already-claimed",
} as const);
export type AlreadyClaimed = typeof ALREADY_CLAIMED;

export type ClaimDigestDayResult =
  | {
      readonly kind: "claimed";
      /** The day key itself: a round's identity is its day. */
      readonly roundId: DigestDayKey;
    }
  | AlreadyClaimed;

/** How the digest names the customer: by `accounts.name` only, else by the request reference (X0-5, S-21). */
export type DigestCustomer =
  | { readonly customerName: string; readonly reference?: never }
  | { readonly reference: string; readonly customerName?: never };

/**
 * What the digest prints about one kitchen, and nothing else: no e-mail and no phone (X0-5). `kitchenName` is
 * `designs.name`, which a kitchen may not have; it is escaped and never in a subject. `updatedAt` is the existing
 * `designs.updated_at`.
 */
export type DigestEligibleKitchen = DigestCustomer & {
  readonly designId: string;
  readonly kitchenName?: string;
  readonly sentAt: Date;
  readonly updatedAt: Date;
  readonly revision: DesignRevision;
};

/** A kitchen a digest held, at the revision it held. */
export interface DigestedKitchen {
  readonly designId: string;
  readonly revision: DesignRevision;
}

/**
 * Whether a kitchen changed after staff last saw it is judged in SQL, folded into the staff kitchens statements, and so
 * is not a method here. Both the staff kitchens statements and `listDigestEligible` exclude kitchens deleted by their
 * client (F6, F9).
 *
 * The digest is a system action: `claimDigestDay` and `recordDigested` carry no staff session and write no audit row
 * (A-22, F3). The day's claim is inserted before the mail is sent; a send that fails loses the day, and its kitchens
 * stay eligible because their entries are written only after a successful send.
 */
export interface KitchenChangeStore {
  markSeen(request: MarkKitchenSeenRequest): Promise<MarkKitchenSeenResult>;
  /** Insert with `on conflict do nothing`: a day already claimed answers `ALREADY_CLAIMED` (A-13, F6). */
  claimDigestDay(dayKey: DigestDayKey): Promise<ClaimDigestDayResult>;
  listDigestEligible(now: Date): Promise<readonly DigestEligibleKitchen[]>;
  recordDigested(
    roundId: string,
    entries: readonly DigestedKitchen[],
  ): Promise<void>;
}

// ---------------------------------------------------------------------------------------------------------------------
// CatalogueAvailabilityStore

/** The revision names no state: unknown, or not a shape this store holds. */
export const AVAILABILITY_REVISION_NOT_FOUND = Object.freeze({
  kind: "availability-revision-not-found",
} as const);
export type AvailabilityRevisionNotFound =
  typeof AVAILABILITY_REVISION_NOT_FOUND;

export type ReadAvailabilityAtResult =
  | { readonly kind: "found"; readonly availability: CatalogueAvailability }
  | AvailabilityRevisionNotFound;

/**
 * The audit action of an availability write, taken from the domain's list rather than restated: the stored action is
 * limited to 32 characters (migration 0020), so a rename there must reach every store and contract at once.
 */
export const CATALOGUE_ACTIVATION_ACTION = findCatalogueActivationAction();

function findCatalogueActivationAction(): CatalogueActivationAuditInput["action"] {
  const action = DASHBOARD_AUDIT_ACTIONS.find(
    (candidate): candidate is CatalogueActivationAuditInput["action"] =>
      candidate.startsWith("catalogue-item-"),
  );
  if (action === undefined) {
    throw new Error("The domain lists no catalogue-item audit action.");
  }
  return action;
}

/** The staff member who acts, and the activation **without** the revision it will create (M4). */
export interface ActivationAuditRecord {
  readonly session: StaffActingSession;
  readonly entry: CatalogueActivationAuditInput;
}

export interface SetItemActiveRequest {
  readonly item: ItemRef;
  readonly active: boolean;
  readonly expectedRevision: string;
  /**
   * `CATALOGUE_ACTIVATION_ACTION` without `availabilityRevision`. The store stamps the revision its statement
   * returned into the detail, reads the entry again with the domain, and inserts, all in the one transaction. The
   * expected revision is not recorded: two racing requests may share it, while the returned revision is the unique key
   * joining the audit row to its log row.
   */
  readonly audit: ActivationAuditRecord;
}

export type SetItemActiveResult =
  | { readonly kind: "ok"; readonly revision: string }
  | ChangedMeanwhile;

/**
 * An append-only log: one row per change, with a revision that only grows. The current state is each item's latest row.
 * Whether the write is allowed (the item exists in the active book, is not the D9 default, is not the group's last
 * active option) is judged by the domain before the call (A-17).
 */
export interface CatalogueAvailabilityStore {
  readCurrent(): Promise<CatalogueAvailability>;
  /** The state as it was at a revision, rebuilt from the log (A-11's `seenAvailability`). */
  readAt(revision: string): Promise<ReadAvailabilityAtResult>;
  setActive(request: SetItemActiveRequest): Promise<SetItemActiveResult>;
}

// ---------------------------------------------------------------------------------------------------------------------
// PriceNoticeStore

/** The pair of facts whose prices a design's owner has acknowledged (A-11). */
export interface AcknowledgedPrices {
  readonly versionId: string;
  readonly availabilityRevision: string;
}

/** The design has no marker yet: it gets one, silently, on its first open. */
export const NEVER_RECORDED = Object.freeze({
  kind: "never-recorded",
} as const);
export type NeverRecorded = typeof NEVER_RECORDED;

export type ReadAcknowledgedPricesResult =
  | { readonly kind: "recorded"; readonly acknowledged: AcknowledgedPrices }
  | NeverRecorded;

/** The version the pair names does not exist (F8). Nothing was written. */
export const UNKNOWN_VERSION = Object.freeze({
  kind: "unknown-version",
} as const);
export type UnknownVersion = typeof UNKNOWN_VERSION;

/** The availability revision the pair names is greater than the head's (F8). Nothing was written. */
export const REVISION_AHEAD = Object.freeze({
  kind: "revision-ahead",
} as const);
export type RevisionAhead = typeof REVISION_AHEAD;

export type RecordAcknowledgedPricesResult =
  | { readonly kind: "ok" }
  | UnknownVersion
  | RevisionAhead;

/**
 * One marker per design, written only for a request authorised to edit that design and never by a save, so it never
 * moves the design's revision. A customer write, not a staff write: no audit row (A-22, F3).
 */
export interface PriceNoticeStore {
  readAcknowledged(designId: string): Promise<ReadAcknowledgedPricesResult>;
  /**
   * The first open: insert-if-absent (`on conflict do nothing`), so it never overwrites an acknowledgement (F8). The
   * pair is the server's own current one, not a client's.
   */
  recordIfAbsent(designId: string, pair: AcknowledgedPrices): Promise<void>;
  /** Records the pair the page displayed, validated in SQL against the versions table and the availability head (F8). */
  recordAcknowledged(
    designId: string,
    pair: AcknowledgedPrices,
  ): Promise<RecordAcknowledgedPricesResult>;
}
