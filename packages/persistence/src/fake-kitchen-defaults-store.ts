import type { ItemRef } from "@lemnaria/configurator-domain";

import type { FakeCatalogueAvailabilityStore } from "./fake-catalogue-availability-store.js";
import {
  isCountableProbeSet,
  storableDefaultsJsonOf,
} from "./dashboard-store-shapes.js";
import {
  FakeRevisionHead,
  isRevisionShape,
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
  ItemUsageProbe,
  KitchenDefaultsStore,
  KitchenUsageReader,
  KitchenUsageResult,
  ReadKitchenDefaultsResult,
  SaveKitchenDefaultsRequest,
  SaveKitchenDefaultsResult,
} from "./m10-ports.js";

/**
 * A saved design as the usage reader sees it: the items it uses at any level, whether its client deleted it, and whether
 * the product can read it (an unreadable one uses nothing, and is counted in `unreadableDesigns` when a probe walks).
 */
export interface HeldDesignUsage {
  readonly designId: string;
  readonly uses: readonly ItemRef[];
  readonly isDeletedByClient: boolean;
  readonly isUnreadable?: boolean;
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
 * judgement under the head's compare-and-set. Usage counts the planted designs their client has not deleted, by the
 * items each was planted as using: it reads no probe's facts (a fallback, a set of build ids, a predicate), which only the
 * Neon reader's own tests can exercise.
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

  countEach(probes: readonly ItemUsageProbe[]): Promise<KitchenUsageResult> {
    return settle("count the kitchens using an item", () => {
      if (!isCountableProbeSet(probes)) {
        throw new DashboardStoreError(
          "count the kitchens using an item",
          "invalid-request",
        );
      }
      const isWalked = probes.some(({ via }) => via === "migrated-design");
      return {
        counts: probes.map(({ item }) => ({
          item,
          designCount: this.countUsing(item),
        })),
        unreadableDesigns: isWalked ? this.countUnreadable() : 0,
      };
    });
  }

  private countUnreadable(): number {
    return [...this.designs.values()].filter(
      (design) => !design.isDeletedByClient && design.isUnreadable === true,
    ).length;
  }

  private countUsing(item: ItemRef): number {
    const key = itemKeyOf(item);
    return [...this.designs.values()].filter(
      (design) =>
        !design.isDeletedByClient &&
        design.isUnreadable !== true &&
        design.uses.some((used) => itemKeyOf(used) === key),
    ).length;
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
    storableDefaultsJsonOf(defaults) !== undefined;
  if (!isWellFormed) {
    throw new DashboardStoreError(
      "save the kitchen defaults",
      "invalid-request",
    );
  }
}
