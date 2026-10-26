import type { ItemRef } from "@lemnaria/configurator-domain";

import { itemIdOf, itemKeyOf } from "./fake-catalogue-availability-store.js";
import type { FakeCatalogueAvailabilityStore } from "./fake-catalogue-availability-store.js";
import { FakeRevisionHead, isRevisionShape } from "./fake-dashboard-support.js";
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
 * In-memory `KitchenDefaultsStore` and `KitchenUsageReader` with the contract the Neon stores must honour.
 *
 * Defaults: a row never saved reads as `NONE_SAVED`, and a row saved with `{}` does not, because it holds a revision
 * the next save needs. A save judges the defaults revision (`changed-meanwhile`) and then the availability head
 * (`availability-changed-meanwhile`), and those are the only refusals the store has: it cannot read `defaults`, so an
 * item that is switched off or not in the book is the caller's judgement under the head's compare-and-set. A refusal
 * writes nothing and no audit row; a save advances the defaults revision and the availability head together, with no
 * row in the availability log.
 *
 * Usage: counts the planted designs, not deleted by their client, that use the item. What "uses" means in a design's
 * document is the Neon reader's to get right (a parity test against the domain); here a design states its items.
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
    if (this.savedAt === undefined) return Promise.resolve(NONE_SAVED);
    return Promise.resolve({
      kind: "saved",
      saved: {
        revision: this.revision.current(),
        defaults: structuredClone(this.defaults),
        savedAt: new Date(this.savedAt),
      },
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
    if (itemIdOf(item) === "") {
      return Promise.reject(
        new DashboardStoreError(
          "count the kitchens using an item",
          "invalid-request",
        ),
      );
    }
    const key = itemKeyOf(item);
    const using = [...this.designs.values()].filter(
      (design) =>
        !design.isDeletedByClient &&
        design.uses.some((used) => itemKeyOf(used) === key),
    );
    return Promise.resolve(using.length);
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
    typeof defaults === "object" &&
    defaults !== null &&
    !Array.isArray(defaults);
  if (!isWellFormed) {
    throw new DashboardStoreError(
      "save the kitchen defaults",
      "invalid-request",
    );
  }
}
