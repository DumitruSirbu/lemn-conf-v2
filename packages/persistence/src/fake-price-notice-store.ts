import type { FakeCatalogueAvailabilityStore } from "./fake-catalogue-availability-store.js";
import { isRevisionAhead, isRevisionShape } from "./fake-dashboard-support.js";
import type { FakePriceBookStore } from "./fake-price-book-store.js";
import {
  DashboardStoreError,
  NEVER_RECORDED,
  REVISION_AHEAD,
  UNKNOWN_VERSION,
} from "./m10-ports.js";
import type {
  AcknowledgedPrices,
  PriceNoticeStore,
  ReadAcknowledgedPricesResult,
  RecordAcknowledgedPricesResult,
} from "./m10-ports.js";
import type { DashboardStoreOperation } from "./m10-ports.js";
import { isActionableDesignId } from "./staff-kitchen-actions-store.js";

export interface FakePriceNoticeStoreOptions {
  /** Where the versions an acknowledgement may name are read from. */
  readonly priceBook: FakePriceBookStore;
  /** Where the availability head an acknowledgement may not be ahead of is read from. */
  readonly availability: FakeCatalogueAvailabilityStore;
}

/**
 * In-memory `PriceNoticeStore` with the contract the Neon store must honour: one marker per design; a first open
 * records its pair only when the design has none and never overwrites; an acknowledgement is judged against the
 * versions and the availability head in the same turn it writes (an unknown version is `unknown-version`, a revision
 * greater than the head's is `revision-ahead`, the version judged first) and replaces any marker the design holds; a
 * refusal writes nothing. There is no audit row: the marker is a customer's write. Whether the caller may edit the
 * design is the route's. A first open's pair is not judged: it is the server's own current one.
 */
export class FakePriceNoticeStore implements PriceNoticeStore {
  private readonly markers = new Map<string, AcknowledgedPrices>();
  private readonly priceBook: FakePriceBookStore;
  private readonly availability: FakeCatalogueAvailabilityStore;

  constructor({ priceBook, availability }: FakePriceNoticeStoreOptions) {
    this.priceBook = priceBook;
    this.availability = availability;
  }

  readAcknowledged(designId: string): Promise<ReadAcknowledgedPricesResult> {
    return this.settle("read a design's acknowledged prices", () => {
      requireDesignId(designId, "read a design's acknowledged prices");
      const held = this.markers.get(designId);
      return held === undefined
        ? NEVER_RECORDED
        : { kind: "recorded", acknowledged: { ...held } };
    });
  }

  recordIfAbsent(designId: string, pair: AcknowledgedPrices): Promise<void> {
    const operation = "record a design's first-open prices";
    return this.settle(operation, () => {
      requireWritable(designId, pair, operation);
      if (!this.markers.has(designId)) this.markers.set(designId, { ...pair });
    });
  }

  recordAcknowledged(
    designId: string,
    pair: AcknowledgedPrices,
  ): Promise<RecordAcknowledgedPricesResult> {
    const operation = "record a design's acknowledged prices";
    return this.settle(operation, () => {
      requireWritable(designId, pair, operation);
      if (!this.priceBook.hasHeldVersion(pair.versionId))
        return UNKNOWN_VERSION;
      if (
        isRevisionAhead(
          pair.availabilityRevision,
          this.availability.head.current(),
        )
      ) {
        return REVISION_AHEAD;
      }
      this.markers.set(designId, { ...pair });
      return { kind: "ok" };
    });
  }

  /** Every refusal is a rejection, as a driver's is, never a throw out of a method that returns a promise. */
  private settle<Answer>(
    operation: DashboardStoreOperation,
    judge: () => Answer,
  ): Promise<Answer> {
    try {
      return Promise.resolve(judge());
    } catch (failure) {
      return Promise.reject(
        failure instanceof DashboardStoreError
          ? failure
          : new DashboardStoreError(operation, "database", { cause: failure }),
      );
    }
  }
}

function requireDesignId(
  designId: string,
  operation: DashboardStoreOperation,
): void {
  if (!isActionableDesignId(designId)) {
    throw new DashboardStoreError(operation, "invalid-request");
  }
}

function requireWritable(
  designId: string,
  pair: AcknowledgedPrices,
  operation: DashboardStoreOperation,
): void {
  requireDesignId(designId, operation);
  const isWellFormed =
    typeof pair.versionId === "string" &&
    pair.versionId !== "" &&
    isRevisionShape(pair.availabilityRevision);
  if (!isWellFormed)
    throw new DashboardStoreError(operation, "invalid-request");
}
