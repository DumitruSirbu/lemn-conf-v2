import type { ItemRef } from "@lemnaria/configurator-domain";

import type { FakeCatalogueAvailabilityStore } from "./fake-catalogue-availability-store.js";
import {
  FakeRevisionHead,
  isJsonObject,
  isRevisionShape,
  itemIdOf,
  itemKeyOf,
  settle,
} from "./fake-dashboard-support.js";
import type { FakeDashboardAuditLedger } from "./fake-dashboard-support.js";
import {
  AVAILABILITY_CHANGED_MEANWHILE,
  CHANGED_MEANWHILE,
  DashboardStoreError,
  NONE_SAVED,
} from "./m10-ports.js";
import type {
  KitchenDefaultsStore,
  KitchenUsageReader,
  ReadKitchenDefaultsResult,
  SaveKitchenDefaultsRequest,
  SaveKitchenDefaultsResult,
} from "./m10-ports.js";

/** A saved design as the usage reader sees it: the items it uses at any level, and whether its client deleted it. */
export interface HeldDesignUsage {
  readonly designId: string;
  readonly uses: readonly ItemRef[];
  readonly isDeletedByClient: boolean;
}

export interface FakeKitchenDefaultsStoreOptions {
  readonly now?: () => Date;
  readonly ledger: FakeDashboardAuditLedger;
  /** The head the defaults save advances with the availability write; the same table the availability fake holds. */
  readonly availability: FakeCatalogueAvailabilityStore;
}

/**
 * In-memory `KitchenDefaultsStore` and `KitchenUsageReader` (ADR 0178). A row saved with `{}` is saved, not `NONE_SAVED`:
 * it holds the revision the next save needs. A save advances the defaults revision and the availability head together,
 * with no row in the availability log; it cannot read the book, so whether an item may be the default is the caller's
 * judgement under the head's compare-and-set. Usage counts the planted designs their client has not deleted.
 */
export class FakeKitchenDefaultsStore
  implements KitchenDefaultsStore, KitchenUsageReader
{
  private readonly revision = new FakeRevisionHead();
  private defaults: unknown = {};
  private savedAt: Date | undefined;
  private readonly designs = new Map<string, HeldDesignUsage>();
  private readonly now: () => Date;
  private readonly ledger: FakeDashboardAuditLedger;
  private readonly availability: FakeCatalogueAvailabilityStore;

  constructor({
    now = () => new Date(),
    ledger,
    availability,
  }: FakeKitchenDefaultsStoreOptions) {
    this.now = now;
    this.ledger = ledger;
    this.availability = availability;
  }

  plantDesign(design: HeldDesignUsage): void {
    this.designs.set(design.designId, structuredClone(design));
  }

  read(): Promise<ReadKitchenDefaultsResult> {
    return settle("read the kitchen defaults", () => {
      if (this.savedAt === undefined) return NONE_SAVED;
      return {
        kind: "saved",
        saved: {
          revision: this.revision.current(),
          defaults: structuredClone(this.defaults),
          savedAt: new Date(this.savedAt),
        },
      };
    });
  }

  async save(
    request: SaveKitchenDefaultsRequest,
  ): Promise<SaveKitchenDefaultsResult> {
    requireSavable(request);
    const staged = await this.ledger.stage({
      operation: "save the kitchen defaults",
      record: request.audit,
      accepts: ["kitchen-defaults-saved"],
    });
    if (request.expectedRevision !== this.revision.current()) {
      return CHANGED_MEANWHILE;
    }
    if (
      request.expectedAvailabilityRevision !== this.availability.head.current()
    ) {
      return AVAILABILITY_CHANGED_MEANWHILE;
    }
    this.defaults = structuredClone(request.defaults);
    this.savedAt = this.now();
    const revision = this.revision.advance();
    const availabilityRevision = this.availability.head.advance();
    staged.commit();
    return { kind: "ok", revision, availabilityRevision };
  }

  count(item: ItemRef): Promise<number> {
    return settle("count the kitchens using an item", () => {
      if (itemIdOf(item) === "") {
        throw new DashboardStoreError(
          "count the kitchens using an item",
          "invalid-request",
        );
      }
      const key = itemKeyOf(item);
      return [...this.designs.values()].filter(
        (design) =>
          !design.isDeletedByClient &&
          design.uses.some((used) => itemKeyOf(used) === key),
      ).length;
    });
  }
}

function requireSavable({
  defaults,
  expectedRevision,
  expectedAvailabilityRevision,
}: SaveKitchenDefaultsRequest): void {
  const isWellFormed =
    isRevisionShape(expectedRevision) &&
    isRevisionShape(expectedAvailabilityRevision) &&
    isJsonObject(defaults);
  if (!isWellFormed) {
    throw new DashboardStoreError(
      "save the kitchen defaults",
      "invalid-request",
    );
  }
}
