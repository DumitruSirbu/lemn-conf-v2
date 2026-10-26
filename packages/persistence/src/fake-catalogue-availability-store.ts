import { CATALOGUE_ACTIVATION_AUDIT_ACTION } from "@lemnaria/configurator-domain";
import type {
  CatalogueAvailability,
  ItemRef,
} from "@lemnaria/configurator-domain";

import {
  FakeRevisionHead,
  isNamedItem,
  isRevisionAhead,
  isRevisionShape,
  itemIdOf,
  itemKeyOf,
  settle,
} from "./fake-dashboard-support.js";
import type { FakeDashboardAuditLedger } from "./fake-dashboard-support.js";
import {
  AVAILABILITY_REVISION_NOT_FOUND,
  CHANGED_MEANWHILE,
  DashboardStoreError,
} from "./m10-ports.js";
import type {
  CatalogueAvailabilityStore,
  ReadAvailabilityAtResult,
  SetItemActiveRequest,
  SetItemActiveResult,
} from "./m10-ports.js";

/** One row of `catalogue_availability_changes`. The revision is the one the head produced for the write. */
interface HeldAvailabilityChange {
  readonly revision: string;
  readonly item: ItemRef;
  readonly active: boolean;
}

export interface FakeCatalogueAvailabilityStoreOptions {
  /**
   * `catalogue_availability_head`: the one row both this store and a defaults save advance. Hand the same head to
   * `FakeKitchenDefaultsStore`, as the two stores share one table.
   */
  readonly head?: FakeRevisionHead;
  readonly ledger: FakeDashboardAuditLedger;
}

/**
 * In-memory `CatalogueAvailabilityStore` with the contract the Neon store must honour: the log is append-only and its
 * revision is the one the head's compare-and-set produced for that write, so a write made against a stale revision
 * appends nothing, moves no head and writes no audit row; the current state is each item's latest row; and the state at
 * a revision is the replay of the log up to it, for any revision the head has reached, including one a defaults save
 * made without a row. The audit entry must describe the write (its action, item and flag) and carries no revision: the
 * store stamps the one its write made. Whether a write is allowed (the item exists in the
 * active book, is not the default, is not the group's last active option) is the caller's, as the port says.
 */
export class FakeCatalogueAvailabilityStore
  implements CatalogueAvailabilityStore
{
  readonly head: FakeRevisionHead;
  private readonly changes: HeldAvailabilityChange[] = [];
  private readonly ledger: FakeDashboardAuditLedger;

  constructor({
    head = new FakeRevisionHead(),
    ledger,
  }: FakeCatalogueAvailabilityStoreOptions) {
    this.head = head;
    this.ledger = ledger;
  }

  /** What is switched off now, in the turn that asks: for the fakes that judge against it in the same turn. */
  heldDisabled(): readonly ItemRef[] {
    return disabledAfter(this.changes);
  }

  readCurrent(): Promise<CatalogueAvailability> {
    return settle("read the catalogue availability", () => ({
      revision: this.head.current(),
      disabled: this.heldDisabled(),
    }));
  }

  readAt(revision: string): Promise<ReadAvailabilityAtResult> {
    return settle("read the catalogue availability", () => {
      if (
        !isRevisionShape(revision) ||
        isRevisionAhead(revision, this.head.current())
      ) {
        return AVAILABILITY_REVISION_NOT_FOUND;
      }
      const upToRevision = this.changes.filter(
        (change) => !isRevisionAhead(change.revision, revision),
      );
      return {
        kind: "found",
        availability: { revision, disabled: disabledAfter(upToRevision) },
      };
    });
  }

  async setActive(request: SetItemActiveRequest): Promise<SetItemActiveResult> {
    requireWritable(request);
    const staged = await this.ledger.stage({
      operation: "set an item's availability",
      record: request.audit,
      accepts: [CATALOGUE_ACTIVATION_AUDIT_ACTION],
      provisional: { availabilityRevision: this.head.next() },
    });
    if (request.expectedRevision !== this.head.current()) {
      return CHANGED_MEANWHILE;
    }
    const revision = this.append(request.item, request.active);
    staged.commit({ availabilityRevision: revision });
    return { kind: "ok", revision };
  }

  /**
   * One row of the log with the revision the head's next step produced, as a publish writes a created item: switched
   * off. For the price book fake, in the turn that has judged its own compare-and-set.
   */
  appendInactive(item: ItemRef): string {
    return this.append(item, false);
  }

  private append(item: ItemRef, active: boolean): string {
    const revision = this.head.advance();
    this.changes.push({ revision, item: structuredClone(item), active });
    return revision;
  }
}

function disabledAfter(changes: readonly HeldAvailabilityChange[]): ItemRef[] {
  const latestByItem = new Map<string, HeldAvailabilityChange>();
  for (const change of changes)
    latestByItem.set(itemKeyOf(change.item), change);
  return [...latestByItem.values()]
    .filter((latest) => !latest.active)
    .map((latest) => structuredClone(latest.item));
}

function requireWritable(request: SetItemActiveRequest): void {
  const isWellFormed =
    isRevisionShape(request.expectedRevision) &&
    typeof request.active === "boolean" &&
    isNamedItem(request.item) &&
    isDescribedBy(request);
  if (!isWellFormed) {
    throw new DashboardStoreError(
      "set an item's availability",
      "invalid-request",
    );
  }
}

function isDescribedBy({ item, active, audit }: SetItemActiveRequest): boolean {
  const { detail } = audit.entry;
  return (
    detail.itemKind === item.kind &&
    detail.itemId === itemIdOf(item) &&
    detail.active === active
  );
}
