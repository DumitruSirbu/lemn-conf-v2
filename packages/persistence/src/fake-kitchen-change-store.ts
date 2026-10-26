import {
  DIGEST_STOPPING_STATUSES,
  DIGEST_WINDOW_MS,
} from "@lemnaria/configurator-domain";

import { isDesignRevision } from "./design-revision.js";
import type { DesignRevision } from "./design-revision.js";
import {
  isRevisionAhead,
  isRevisionShape,
  settle,
} from "./fake-dashboard-support.js";
import type { FakeDashboardAuditLedger } from "./fake-dashboard-support.js";
import {
  ALREADY_CLAIMED,
  DISPLAYED_REVISION_AHEAD,
  DashboardStoreError,
} from "./m10-ports.js";
import type {
  ClaimDigestDayResult,
  DigestDayKey,
  DigestEligibleKitchen,
  DigestedKitchen,
  KitchenChangeStore,
  MarkKitchenSeenRequest,
  MarkKitchenSeenResult,
} from "./m10-ports.js";
import { isActionableDesignId } from "./staff-kitchen-actions-store.js";

const DAY_KEY_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/** A kitchen as the seen mark and the digest read it: the columns of `designs` and what joins to them. */
export interface HeldChangeKitchen {
  readonly designId: string;
  readonly accountId?: string;
  /** The first send's instant; absent for a draft that was never sent. */
  readonly sentAt?: Date;
  readonly updatedAt: Date;
  readonly revision: DesignRevision;
  readonly isDeletedByClient: boolean;
  readonly kitchenName?: string;
  /** `accounts.name`, when the kitchen has an account that has one. */
  readonly customerName?: string;
  /** The request reference, printed when there is no account name. */
  readonly reference: string;
  /** The stored request status; absent when none was saved. */
  readonly status?: string;
  /** The design revision on the kitchen's latest submission, which stands for the seen mark before there is one. */
  readonly latestSubmissionRevision?: DesignRevision;
}

/** A claimed day. Its day key is its identity: it is the round id the claim answers. */
export interface HeldDigestRound {
  readonly dayKey: DigestDayKey;
  readonly claimedAt: Date;
}

export interface FakeKitchenChangeStoreOptions {
  /** The database's clock, for `seen_at` and `ran_at`. */
  readonly now?: () => Date;
  readonly ledger: FakeDashboardAuditLedger;
}

/** A row of the seen table: the revision, and who set it and when. */
export interface HeldSeenMark {
  readonly seenRevision: DesignRevision;
  readonly seenByAccountId: string;
  readonly seenAt: Date;
}

interface HeldDigestEntry {
  readonly dayKey: DigestDayKey;
  readonly designId: string;
  readonly revision: DesignRevision;
}

/**
 * In-memory `KitchenChangeStore` (ADR 0178 A-12, A-13). Judged on revisions, never instants: a seen mark records the
 * revision the page displayed and only ever rises, and a kitchen is held by a digest entry (not merely a claimed day)
 * above the effective seen revision, so a stale mark does not send a digested revision again. The customer is named by
 * `btrim`, which strips spaces only. Every call judges and writes in one turn of the event loop, so the fake cannot
 * stand for two claims racing at a unique index.
 */
export class FakeKitchenChangeStore implements KitchenChangeStore {
  private readonly kitchens = new Map<string, HeldChangeKitchen>();
  private readonly marks = new Map<string, HeldSeenMark>();
  private readonly rounds: HeldDigestRound[] = [];
  private readonly entries: HeldDigestEntry[] = [];
  private readonly now: () => Date;
  private readonly ledger: FakeDashboardAuditLedger;

  constructor({
    now = () => new Date(),
    ledger,
  }: FakeKitchenChangeStoreOptions) {
    this.now = now;
    this.ledger = ledger;
  }

  /** Writes the kitchen's row, replacing the one held: how a test saves a kitchen, or has its client delete it. */
  plantKitchen(kitchen: HeldChangeKitchen): void {
    this.kitchens.set(kitchen.designId, structuredClone(kitchen));
  }

  heldSeenRevision(designId: string): DesignRevision | undefined {
    return this.marks.get(designId)?.seenRevision;
  }

  heldSeenMark(designId: string): HeldSeenMark | undefined {
    const mark = this.marks.get(designId);
    return mark === undefined ? undefined : { ...mark };
  }

  heldRounds(): readonly HeldDigestRound[] {
    return this.rounds.map((round) => ({ ...round }));
  }

  heldDigestEntries(): readonly DigestedKitchen[] {
    return this.entries.map(({ designId, revision }) => ({
      designId,
      revision,
    }));
  }

  async markSeen(
    request: MarkKitchenSeenRequest,
  ): Promise<MarkKitchenSeenResult> {
    const { designId, displayedRevision } = request;
    if (
      !isDesignRevision(displayedRevision) ||
      !isRevisionShape(displayedRevision)
    ) {
      throw new DashboardStoreError(
        "mark a kitchen as seen",
        "invalid-request",
      );
    }
    if (!isActionableDesignId(designId)) return { kind: "not-found" };
    const staged = await this.ledger.stage({
      operation: "mark a kitchen as seen",
      record: request.audit,
      accepts: ["kitchen-seen"],
      designId,
    });
    const kitchen = this.visibleKitchen(designId);
    if (kitchen === undefined) return { kind: "not-found" };
    if (isRevisionAhead(displayedRevision, kitchen.revision)) {
      return DISPLAYED_REVISION_AHEAD;
    }
    const held = this.marks.get(designId)?.seenRevision;
    const isGreater =
      held === undefined || isRevisionAhead(displayedRevision, held);
    if (isGreater) {
      this.marks.set(designId, {
        seenRevision: displayedRevision,
        seenByAccountId: staged.actorAccountId,
        seenAt: this.now(),
      });
    }
    staged.commit();
    return { kind: "ok" };
  }

  claimDigestDay(dayKey: DigestDayKey): Promise<ClaimDigestDayResult> {
    return settle("claim a digest day", () => {
      if (!isCalendarDay(dayKey)) {
        throw new DashboardStoreError("claim a digest day", "invalid-request");
      }
      if (this.rounds.some((round) => round.dayKey === dayKey)) {
        return ALREADY_CLAIMED;
      }
      this.rounds.push({ dayKey, claimedAt: this.now() });
      return { kind: "claimed", roundId: dayKey };
    });
  }

  listDigestEligible(now: Date): Promise<readonly DigestEligibleKitchen[]> {
    return settle("list the kitchens a digest holds", () =>
      [...this.kitchens.values()]
        .filter((kitchen) => this.isDigestEligible(kitchen, now))
        .sort(bySentThenId)
        .flatMap((kitchen) =>
          kitchen.sentAt === undefined
            ? []
            : [digestRowOf(kitchen, kitchen.sentAt)],
        ),
    );
  }

  recordDigested(
    roundId: string,
    entries: readonly DigestedKitchen[],
  ): Promise<void> {
    return settle("record a digest", () => {
      const isWellFormed =
        this.rounds.some((round) => round.dayKey === roundId) &&
        entries.every((entry) => isDesignRevision(entry.revision));
      if (!isWellFormed) {
        throw new DashboardStoreError("record a digest", "invalid-request");
      }
      for (const { designId, revision } of entries) {
        const isRecorded = this.entries.some(
          (held) => held.dayKey === roundId && held.designId === designId,
        );
        if (!isRecorded)
          this.entries.push({ dayKey: roundId, designId, revision });
      }
    });
  }

  /** The staff kitchens' visibility: not deleted by its client, and sent or held by an account (ADR 0173 P-L3-4). */
  private visibleKitchen(designId: string): HeldChangeKitchen | undefined {
    const kitchen = this.kitchens.get(designId);
    const isVisible =
      kitchen !== undefined &&
      !kitchen.isDeletedByClient &&
      (kitchen.sentAt !== undefined || kitchen.accountId !== undefined);
    return isVisible ? kitchen : undefined;
  }

  private isDigestEligible(kitchen: HeldChangeKitchen, now: Date): boolean {
    const { sentAt } = kitchen;
    if (kitchen.isDeletedByClient || sentAt === undefined) return false;
    return (
      now.getTime() - sentAt.getTime() < DIGEST_WINDOW_MS &&
      !DIGEST_STOPPING_STATUSES.some(
        (stopping) => stopping === kitchen.status,
      ) &&
      this.isChangedSinceSeen(kitchen) &&
      !this.isDigestedSinceSeen(kitchen)
    );
  }

  /** The revision the kitchen's changes are measured from: the seen mark's, else its latest submission's. */
  private effectiveSeenRevision(
    kitchen: HeldChangeKitchen,
  ): DesignRevision | undefined {
    return (
      this.marks.get(kitchen.designId)?.seenRevision ??
      kitchen.latestSubmissionRevision
    );
  }

  private isChangedSinceSeen(kitchen: HeldChangeKitchen): boolean {
    const effectiveSeen = this.effectiveSeenRevision(kitchen);
    return effectiveSeen !== undefined && kitchen.revision !== effectiveSeen;
  }

  /** A digest entry, not merely a claimed day, whose revision is above the effective seen one. */
  private isDigestedSinceSeen(kitchen: HeldChangeKitchen): boolean {
    const effectiveSeen = this.effectiveSeenRevision(kitchen);
    return (
      effectiveSeen !== undefined &&
      this.entries.some(
        (entry) =>
          entry.designId === kitchen.designId &&
          isRevisionAhead(entry.revision, effectiveSeen),
      )
    );
  }
}

function digestRowOf(
  kitchen: HeldChangeKitchen,
  sentAt: Date,
): DigestEligibleKitchen {
  const customerName = nullIfBlank(kitchen.customerName);
  const customer =
    customerName === undefined
      ? { reference: kitchen.reference }
      : { customerName };
  return {
    designId: kitchen.designId,
    ...(kitchen.kitchenName === undefined
      ? {}
      : { kitchenName: kitchen.kitchenName }),
    ...customer,
    sentAt: new Date(sentAt),
    updatedAt: new Date(kitchen.updatedAt),
    revision: kitchen.revision,
  };
}

/** `nullif(btrim(name), '')`: SQL's `btrim` strips spaces only, so that is what is stripped here. */
function nullIfBlank(name: string | undefined): string | undefined {
  const trimmed = name?.replace(/^ +| +$/g, "");
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}

function bySentThenId(
  left: HeldChangeKitchen,
  right: HeldChangeKitchen,
): number {
  const bySent = (left.sentAt?.getTime() ?? 0) - (right.sentAt?.getTime() ?? 0);
  if (bySent !== 0) return bySent;
  return left.designId < right.designId ? -1 : 1;
}

function isCalendarDay(value: unknown): boolean {
  if (typeof value !== "string" || !DAY_KEY_SHAPE.test(value)) return false;
  const [year = 0, month = 0, day = 0] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
