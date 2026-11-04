import { readDashboardAuditEntry } from "@lemnaria/configurator-domain";
import type {
  DashboardAuditAction,
  ItemRef,
} from "@lemnaria/configurator-domain";
import { nanoid } from "nanoid";

import { itemIdOf } from "./dashboard-store-shapes.js";
import { DashboardStoreError } from "./m10-ports.js";
import type {
  ActivationAuditRecord,
  DashboardAuditRecord,
  DashboardStoreOperation,
  PublishAuditRecord,
} from "./m10-ports.js";
import { SessionStoreError } from "./session-store.js";
import type { SessionStore } from "./session-store.js";
import { STORED_ACTION_SHAPE } from "./staff-audit-store.js";

/** The audit records a write hands over: whole entries, or entries missing what only the store knows. */
type StagedAuditRecord =
  | DashboardAuditRecord
  | ActivationAuditRecord
  | PublishAuditRecord;

// The shapes the fakes and the Neon stores share live in `dashboard-store-shapes.ts`; these are re-exported so the
// fakes' tests keep importing them from here.
export {
  isJsonObject,
  isNamedItem,
  isRevisionShape,
  itemIdOf,
} from "./dashboard-store-shapes.js";

// What the M10 fakes share: the audit log a staff write commits to, the stand-ins for what SQL does to a revision, and
// the small judgements every fake repeats.

/**
 * Runs a fake's judgement as a driver's answer: a refusal is a rejection, never a throw out of a method that returns a
 * promise. Anything but a `DashboardStoreError` is the database failing.
 */
export function settle<Answer>(
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

export function itemKeyOf(item: ItemRef): string {
  return `${item.kind}:${itemIdOf(item)}`;
}

/**
 * Whether `candidate` is greater than `head`, as `candidate::bigint > head::bigint` is in SQL. Both are canonical digit
 * runs, so a longer one is the greater, and two of one length order as text. Nothing here parses a revision. For the
 * fakes alone: the Neon stores compare in SQL and have no ordering of revisions.
 */
export function isRevisionAhead(candidate: string, head: string): boolean {
  if (candidate.length !== head.length) return candidate.length > head.length;
  return candidate > head;
}

/** The greater of two revisions that may be absent, as SQL's `greatest` is: an absent one is skipped. */
export function greatestRevision(
  first: string | undefined,
  second: string | undefined,
): string | undefined {
  if (first === undefined) return second;
  if (second === undefined) return first;
  return isRevisionAhead(second, first) ? second : first;
}

/** The revision, or `undefined` when it is above the ceiling: a mark above the kitchen's own revision is ignored. */
export function revisionUnlessAhead(
  revision: string | undefined,
  ceiling: string,
): string | undefined {
  if (revision === undefined) return undefined;
  return isRevisionAhead(revision, ceiling) ? undefined : revision;
}

export interface ChangedAfterSeenFacts {
  readonly isSent: boolean;
  readonly revision: string;
  /** The revision staff last marked seen, when anyone has. */
  readonly seenRevision: string | undefined;
  /** The design revision on the kitchen's latest submission, below which a mark never takes the effective revision. */
  readonly latestSubmissionRevision: string | undefined;
}

/**
 * The effective seen revision as the staff statements compute it (`EFFECTIVE_SEEN_REVISION`): the greater of the seen
 * mark, unless it is above the kitchen's own revision, and the latest submission's. `undefined` when there is neither.
 */
export function effectiveSeenRevision(
  facts: Pick<
    ChangedAfterSeenFacts,
    "revision" | "seenRevision" | "latestSubmissionRevision"
  >,
): string | undefined {
  return greatestRevision(
    revisionUnlessAhead(facts.seenRevision, facts.revision),
    facts.latestSubmissionRevision,
  );
}

/**
 * The stand-in for the SQL every staff statement repeats: `sent_at is not null and revision <> <effective seen>`. A
 * kitchen with neither a mark nor a submission is **not** changed, as the null comparison in SQL is not true; one never
 * sent is never changed. The fakes order two revisions only to take the greater and to ignore a mark above the kitchen's
 * own revision, as the statements do; the Neon stores compare in SQL.
 */
export function isChangedAfterSeen(facts: ChangedAfterSeenFacts): boolean {
  const effectiveSeen = effectiveSeenRevision(facts);
  return (
    facts.isSent &&
    effectiveSeen !== undefined &&
    facts.revision !== effectiveSeen
  );
}

/**
 * A revision that only a successful write advances, as `revision = revision + 1` is in SQL. The count is private and
 * is only ever shown as text.
 */
export class FakeRevisionHead {
  private count = 0;

  current(): string {
    return String(this.count);
  }

  /** What the next successful write will produce, which nothing has yet. */
  next(): string {
    return String(this.count + 1);
  }

  advance(): string {
    this.count += 1;
    return this.current();
  }
}

/** A row of the audit log as held. `detail` is the entry as the domain read it, plus what only the store knows. */
export interface HeldDashboardAuditEvent {
  readonly id: string;
  readonly occurredAt: Date;
  readonly actorAccountId: string;
  readonly action: DashboardAuditAction;
  readonly designId: string | undefined;
  readonly detail: Readonly<Record<string, unknown>>;
}

/** A prepared row that has passed every refusal and is not yet written. `commit` writes it, once. */
export interface StagedDashboardAudit {
  readonly actorAccountId: string;
  /** `stamped` holds the detail members only the store can know, such as the revision its write produced. */
  commit(stamped?: Readonly<Record<string, unknown>>): void;
}

export interface StageDashboardAuditRequest {
  readonly operation: DashboardStoreOperation;
  readonly record: StagedAuditRecord;
  /** The actions this write may record: any other, though a valid dashboard action, is refused. */
  readonly accepts: readonly DashboardAuditAction[];
  /**
   * Detail members the store is about to make true and the caller cannot know (the revision its write will produce).
   * They are added to the caller's detail before the domain reads the entry again, so a refusal comes before any write.
   * `commit` is given the final values.
   */
  readonly provisional?: Readonly<Record<string, unknown>>;
  /** Required exactly when the action names a kitchen. */
  readonly designId?: string;
  /** A write only an administrator's live session may make, as Neon's actor test for the price book and the log. */
  readonly onlyAdministrators?: boolean;
  /** A write only an operator's or an administrator's live session may make, as Neon's actor test for the seen mark. */
  readonly onlyStaff?: boolean;
}

export interface FakeDashboardAuditLedgerOptions {
  readonly now?: () => Date;
  /** The session table the actor is taken from, by the liveness test the real statement repeats. */
  readonly sessions: SessionStore;
}

/**
 * The dashboard's audit log for the fakes, which `FakeStaffAuditStore` cannot be until the dashboard's actions are in
 * the staff list. A write stages its row (every refusal and the session test run first), makes its change, and commits
 * the row, so a refusal leaves neither. The checks run in the order the real statements do: the entry, then the session.
 */
export class FakeDashboardAuditLedger {
  private readonly events: HeldDashboardAuditEvent[] = [];
  private readonly now: () => Date;
  private readonly sessions: SessionStore;

  constructor({
    now = () => new Date(),
    sessions,
  }: FakeDashboardAuditLedgerOptions) {
    this.now = now;
    this.sessions = sessions;
  }

  async stage(
    request: StageDashboardAuditRequest,
  ): Promise<StagedDashboardAudit> {
    const { designId } = request;
    const entry = this.requireAcceptedEntry(request);
    const actorAccountId = await this.liveActorOf(request);
    let isCommitted = false;
    return {
      actorAccountId,
      commit: (stamped = {}) => {
        if (isCommitted) return;
        isCommitted = true;
        this.events.push({
          id: nanoid(),
          occurredAt: this.now(),
          actorAccountId,
          action: entry.action,
          designId,
          detail: { ...entry.detail, ...stamped },
        });
      },
    };
  }

  /** Oldest first. */
  heldEvents(): readonly HeldDashboardAuditEvent[] {
    return this.events.map((event) => ({ ...event }));
  }

  private requireAcceptedEntry({
    operation,
    record,
    accepts,
    designId,
    provisional = {},
  }: StageDashboardAuditRequest) {
    const reading = readDashboardAuditEntry(record.entry.action, {
      ...record.entry.detail,
      ...provisional,
    });
    const namesDesign = reading.ok && reading.entry.action === "kitchen-seen";
    if (
      !reading.ok ||
      !accepts.includes(reading.entry.action) ||
      !STORED_ACTION_SHAPE.test(reading.entry.action) ||
      namesDesign !== (designId !== undefined)
    ) {
      throw new DashboardStoreError(operation, "invalid-request");
    }
    return reading.entry;
  }

  private async liveActorOf({
    operation,
    record,
    onlyAdministrators = false,
    onlyStaff = false,
  }: StageDashboardAuditRequest): Promise<string> {
    const lookup = await this.findLive(operation, record);
    const isActor =
      lookup.kind !== "none" &&
      (!onlyAdministrators || lookup.account.role === "administrator") &&
      (!onlyStaff || lookup.account.role !== "client");
    if (!isActor) throw new DashboardStoreError(operation, "not-recorded");
    return lookup.account.id;
  }

  private async findLive(
    operation: DashboardStoreOperation,
    { session }: StagedAuditRecord,
  ) {
    try {
      return await this.sessions.findLive({
        tokenHash: session.sessionTokenHash,
        idleLifetimeSeconds: session.idleLifetimeSeconds,
      });
    } catch (failure) {
      const isStoreFailure = failure instanceof SessionStoreError;
      throw new DashboardStoreError(
        operation,
        isStoreFailure ? "database" : "invalid-request",
        { cause: failure },
      );
    }
  }
}
