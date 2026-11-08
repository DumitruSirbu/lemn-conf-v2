import "server-only";

import {
  InvalidDesignError,
  isBuiltInAccessoryId,
  NoReplacementOptionError,
  PriceChangeNotComparableError,
  pricesChangedBetween,
  removedAccessoriesSince,
  replacementsRequired,
  UnknownBodyError,
  type BodyCatalog,
  type CatalogueAvailability,
  type Design,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import {
  DashboardStoreError,
  type AcknowledgedPrices,
  type LoadEditableOutcome,
  type ReadAvailabilityAtResult,
  type ReadVersionResult,
  type SaveCredential,
} from "@lemnaria/persistence";

import {
  readActivePriceBook,
  readBookOf,
} from "@/lib/server/active-price-book";
import { getPriceStores, type PriceStores } from "@/lib/server/price-stores";
import { getEditableDesignRepository } from "@/lib/server/repository";
import { projectAvailability } from "@/lib/server/project-availability";
import { shippedDeepeningRows } from "@/price/deepening-rows";
import {
  buildCatalogAtDepthOf,
  priceAgainstBook,
  type ActivePriceBook,
} from "@/price/price-book-root";
import type {
  PriceNoticeRefusal,
  PriceNoticeWire,
  PriceStampWire,
  RemovedAccessoryWire,
} from "@/price-dashboard/price-dashboard-wire-contract";

// The customer's price notice, judged on the server (ADR 0178 A-11, and its price-notice Amendment of 2026-11-08, rulings 6
// and 9). Both entry points read the design under exactly a save's credential before anything else, then work serially: a
// marker is written only for a caller who was found able to edit, only after every read that could end the request has
// answered, and never by a staff path. Nothing here builds a response; a caller gets an outcome.
//
// What happens to a thrown value is decided once, in `settled`. A stored design this build cannot read is the owner's to be
// told; a defect is closed; anything else (a store that is down, a connection string the driver refuses) is `unavailable`,
// and the thrown value is dropped before it can reach a response.

/** A request that could not be authorised by the credential it carried: no such design, not that caller's, hidden or deleted. */
export interface NotEditable {
  readonly kind: "not-editable";
}
/** The stored design could not be read by this build. */
export interface Unreadable {
  readonly kind: "unreadable";
  readonly error: InvalidDesignError;
}
/** A state the domain forbids was reached: nothing was written. */
export interface Defective {
  readonly kind: "defective";
}
/** Something of ours could not be reached or judged. */
export interface Unavailable {
  readonly kind: "unavailable";
}

export type FailedOutcome = NotEditable | Unreadable | Defective | Unavailable;

export type PriceNoticeOutcome =
  | { readonly kind: "notice"; readonly notice: PriceNoticeWire }
  | FailedOutcome;

export type AcknowledgementOutcome =
  | { readonly kind: "acknowledged"; readonly pair: PriceStampWire }
  /** The store's own refusal, checked in SQL: the version does not exist, or the revision is past the head. */
  | { readonly kind: "refused"; readonly refusal: PriceNoticeRefusal }
  /** The store refused the pair's shape, which the request reader had already judged: defence in depth. */
  | { readonly kind: "invalid-pair" }
  | FailedOutcome;

const NOT_EDITABLE: NotEditable = { kind: "not-editable" };
const DEFECTIVE: Defective = { kind: "defective" };
const UNAVAILABLE: Unavailable = { kind: "unavailable" };

/** Who asks, for which design. The credential is the save's, built by the route from the request's cookies alone. */
export interface PriceNoticeRequest {
  readonly id: string;
  readonly credential: SaveCredential;
}

export interface AcknowledgementRequest extends PriceNoticeRequest {
  readonly pair: PriceStampWire;
}

// ---------------------------------------------------------------------------------------------------------------------
// The entry points

/** What the owner of a saved kitchen is told on opening it. Writes the first-open marker, and nothing else, when there is none. */
export function readPriceNotice(
  request: PriceNoticeRequest,
): Promise<PriceNoticeOutcome> {
  return settled(async () => {
    const editable = await loadEditable(request);
    if (editable.kind === "none") return NOT_EDITABLE;
    const stores = await getPriceStores();
    return noticeFor(stores, request.id, editable);
  });
}

/** Records the pair the page displayed. It reads the design under the credential first and never touches `designs`. */
export function acknowledgePrices(
  request: AcknowledgementRequest,
): Promise<AcknowledgementOutcome> {
  return settled(async () => {
    const editable = await loadEditable(request);
    if (editable.kind === "none") return NOT_EDITABLE;
    const { notices } = await getPriceStores();
    return recordedAcknowledgement(notices, request);
  });
}

type Editable = Extract<LoadEditableOutcome, { kind: "found" }>;

function loadEditable({ id, credential }: PriceNoticeRequest) {
  return getEditableDesignRepository().loadEditable({ id, credential });
}

async function settled<Outcome>(
  work: () => Promise<Outcome>,
): Promise<Outcome | FailedOutcome> {
  try {
    return await work();
  } catch (error) {
    return failedOutcomeOf(error);
  }
}

function failedOutcomeOf(error: unknown): FailedOutcome {
  if (error instanceof InvalidDesignError) {
    return { kind: "unreadable", error };
  }
  if (error instanceof NoReplacementOptionError) {
    reportPriceNotice({ event: "no-replacement-option" });
    return DEFECTIVE;
  }
  reportPriceNotice(failureLineOf(error));
  return UNAVAILABLE;
}

// ---------------------------------------------------------------------------------------------------------------------
// The acknowledgement

async function recordedAcknowledgement(
  notices: PriceStores["notices"],
  { id, pair }: AcknowledgementRequest,
): Promise<AcknowledgementOutcome> {
  const asked: AcknowledgedPrices = {
    versionId: pair.versionId,
    availabilityRevision: pair.availabilityRevision,
  };
  try {
    const result = await notices.recordAcknowledged(id, asked);
    return result.kind === "ok"
      ? { kind: "acknowledged", pair: { ...asked } }
      : { kind: "refused", refusal: result.kind };
  } catch (error) {
    if (isRefusedShape(error)) return { kind: "invalid-pair" };
    throw error;
  }
}

function isRefusedShape(error: unknown): boolean {
  return (
    error instanceof DashboardStoreError && error.failure === "invalid-request"
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// The judgement (ruling 6)

/** The kitchen, the catalogue at its own depth, and the book in force: what every step below reads. */
export interface Kitchen {
  readonly design: Design;
  readonly catalog: BodyCatalog;
  readonly active: ActivePriceBook;
}

/** The pair the customer last saw, read back: or the fact that it cannot be. */
export type SeenSide =
  | {
      readonly kind: "readable";
      readonly book: PriceBook;
      readonly availability: CatalogueAvailability;
    }
  | { readonly kind: "unreadable" };

async function noticeFor(
  stores: PriceStores,
  id: string,
  { design, isSent }: Editable,
): Promise<PriceNoticeOutcome> {
  const active = await readActivePriceBook(stores);
  if (active.kind === "none") {
    return notice({ kind: "no-active-version", isSent });
  }
  const catalog = buildCatalogAtDepthOf(design);
  if (catalog === undefined) {
    return notice(activeNotice({ isSent, active, replacements: [] }, QUIET));
  }
  const kitchen: Kitchen = { design, catalog, active };
  const replacements = replacementsRequired({
    design,
    catalog,
    book: active.book,
    availability: active.availability,
  });
  const verdict = await verdictOn(stores, id, kitchen);
  return notice(activeNotice({ isSent, active, replacements }, verdict));
}

function notice(wire: PriceNoticeWire): PriceNoticeOutcome {
  return { kind: "notice", notice: wire };
}

/** What the comparison of the pair seen with the pair in force found. */
interface Verdict {
  readonly pricesChanged: boolean;
  readonly removedAccessories: readonly RemovedAccessoryWire[];
}

const QUIET: Verdict = { pricesChanged: false, removedAccessories: [] };

/** The first open records the pair in force and says nothing; a marker that is the pair in force says nothing; any other
 *  marker is compared. */
async function verdictOn(
  stores: PriceStores,
  id: string,
  kitchen: Kitchen,
): Promise<Verdict> {
  const current = stampOf(kitchen.active);
  const marker = await stores.notices.readAcknowledged(id);
  if (marker.kind !== "recorded") {
    await stores.notices.recordIfAbsent(id, current);
    return QUIET;
  }
  if (isSameStamp(marker.acknowledged, current)) return QUIET;
  const seen = await readSeenSide(stores, marker.acknowledged);
  return {
    pricesChanged: pricesChangedFor(kitchen, seen),
    removedAccessories: removedAccessoriesFor(kitchen, seen),
  };
}

type ActiveNotice = Extract<PriceNoticeWire, { kind: "active-version" }>;

function activeNotice(
  {
    isSent,
    active,
    replacements,
  }: {
    isSent: boolean;
    active: ActivePriceBook;
    replacements: ActiveNotice["replacementsRequired"];
  },
  { pricesChanged, removedAccessories }: Verdict,
): ActiveNotice {
  return {
    kind: "active-version",
    isSent,
    current: stampOf(active),
    pricesChanged,
    replacementsRequired: replacements,
    removedAccessories,
  };
}

function stampOf(active: ActivePriceBook): PriceStampWire {
  return {
    versionId: active.versionId,
    availabilityRevision: active.availability.revision,
  };
}

function isSameStamp(marker: PriceStampWire, current: PriceStampWire): boolean {
  return (
    marker.versionId === current.versionId &&
    marker.availabilityRevision === current.availabilityRevision
  );
}

/**
 * The pair the customer saw, both reads always made, so that an outage is never taken for an unreadable pair: a store
 * failure rejects and the request is `503`. The pair is unreadable when the version is not found, does not parse or fails
 * its version check, or the availability is not found or is refused by the projection. Each writes one line, since none
 * is reachable without a forged marker. A pair never changes once recorded (versions and the availability log are
 * append-only), so an unreadable one never clears by itself.
 */
async function readSeenSide(
  stores: PriceStores,
  { versionId, availabilityRevision }: PriceStampWire,
): Promise<SeenSide> {
  const version = await stores.priceBook.readVersion(versionId);
  const availability = await stores.availability.readAt(availabilityRevision);
  const book = seenBookOf(version);
  const seenAvailability = seenAvailabilityOf(availability);
  return book === undefined || seenAvailability === undefined
    ? { kind: "unreadable" }
    : { kind: "readable", book, availability: seenAvailability };
}

function seenBookOf(read: ReadVersionResult): PriceBook | undefined {
  if (read.kind === "found") return readBookOf(read.version);
  reportPriceNotice({
    event: "seen-side-unreadable",
    cause: "version-not-found",
  });
  return undefined;
}

function seenAvailabilityOf(
  read: ReadAvailabilityAtResult,
): CatalogueAvailability | undefined {
  if (read.kind !== "found") {
    reportPriceNotice({
      event: "seen-side-unreadable",
      cause: "availability-not-found",
    });
    return undefined;
  }
  const projected = projectAvailability(read.availability);
  if (projected.ok) return projected.availability;
  reportPriceNotice({
    event: "seen-side-unreadable",
    cause: `availability-${projected.refusal}`,
  });
  return undefined;
}

/**
 * Whether the kitchen's price differs between the pair seen and the pair in force. The active side is priced first, and
 * any refusal there answers `false`: `REPLACEMENT_REQUIRED` is the sheet's, and any other code is the editor's own
 * refusal, which already shows no figure. An active side that priced beside a seen side that cannot be read is `true`: a
 * silent `false` would hide every later real change for good (OQ-40). Otherwise it is `pricesChangedBetween`'s answer, and
 * `true` on its refusal, which can then only be the seen side's. Exported for the property that holds it to that function.
 */
export function pricesChangedFor(kitchen: Kitchen, seen: SeenSide): boolean {
  const { design, catalog, active } = kitchen;
  if (!priceAgainstBook(active, design, catalog).ok) return false;
  if (seen.kind === "unreadable") return true;
  try {
    return pricesChangedBetween({
      design,
      catalog,
      deepeningRows: shippedDeepeningRows(),
      seenBook: seen.book,
      seenAvailability: seen.availability,
      activeBook: active.book,
      currentAvailability: active.availability,
    });
  } catch (error) {
    if (error instanceof PriceChangeNotComparableError) return true;
    throw error;
  }
}

/** The accessories the kitchen had when last seen that availability has since switched off, whatever the active side
 *  answered (a pending replacement shows the info row beside it). None for a seen side that cannot be read. */
function removedAccessoriesFor(
  kitchen: Kitchen,
  seen: SeenSide,
): readonly RemovedAccessoryWire[] {
  if (seen.kind === "unreadable") return [];
  const { design, catalog, active } = kitchen;
  try {
    return removedAccessoriesSince({
      design,
      catalog,
      seenBook: seen.book,
      activeBook: active.book,
      seen: seen.availability,
      current: active.availability,
    }).flatMap((item) =>
      item.kind === "accessory"
        ? [removedAccessoryWire(item.accessoryId, [active.book, seen.book])]
        : [],
    );
  } catch (error) {
    if (error instanceof UnknownBodyError) return [];
    throw error;
  }
}

/** A built-in is named by the client from its messages; a linked row by the first book that states it, the active
 *  book's before the seen one's (a deleted linked accessory is named from the seen book). */
function removedAccessoryWire(
  accessoryId: string,
  books: readonly PriceBook[],
): RemovedAccessoryWire {
  if (isBuiltInAccessoryId(accessoryId)) return { accessoryId };
  const authoredName = books
    .flatMap((book) => book.linkedAccessories)
    .find((rule) => rule.accessoryId === accessoryId)?.name;
  return authoredName === undefined
    ? { accessoryId }
    : { accessoryId, authoredName };
}

// ---------------------------------------------------------------------------------------------------------------------
// The log

/** Every line this module writes: an event and a cause of a closed list, or a failure's name and, for a store's, its
 *  operation and kind. Never a message, a value, an id or a book. */
type PriceNoticeLine =
  | { readonly event: "no-replacement-option" }
  | {
      readonly event: "seen-side-unreadable";
      readonly cause:
        | "version-not-found"
        | "availability-not-found"
        | "availability-too-large"
        | "availability-unreadable";
    }
  | {
      readonly event: "failed";
      readonly errorName: string;
      readonly operation?: string;
      readonly kind?: string;
    };

const LOG_LABEL = "[price-notice]";

function failureLineOf(error: unknown): PriceNoticeLine {
  if (error instanceof DashboardStoreError) {
    return {
      event: "failed",
      errorName: error.name,
      operation: error.operation,
      kind: error.failure,
    };
  }
  return {
    event: "failed",
    errorName: error instanceof Error ? error.name : "NotAnError",
  };
}

/** The write may not throw: a diagnostic that can fail would replace the answer it explains. */
function reportPriceNotice(line: PriceNoticeLine): void {
  try {
    console.error(LOG_LABEL, line);
  } catch {
    // Nothing to fall back to, and nothing may escape.
  }
}
