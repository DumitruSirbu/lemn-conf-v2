import type { SessionStore } from "./session-store.js";
import {
  STAFF_AUDIT_PAGE_SIZE,
  StaffAuditStoreError,
  offsetOfStaffAuditPage,
  prepareStaffAuditRecord,
  readingOfStoredEvent,
  requireValidPageRequest,
} from "./staff-audit-store.js";
import type {
  StaffAuditAccountRef,
  StaffAuditDesignRef,
  StaffAuditPage,
  StaffAuditPageRequest,
  StaffAuditPageRow,
  StaffAuditRecord,
  StaffAuditStore,
} from "./staff-audit-store.js";

const STORED_ID_SHAPE = /^[A-Za-z0-9_-]{21}$/;
const STORED_ACTION_SHAPE = /^[a-z0-9-]{1,32}$/;

/** A row of `staff_audit_events` as it is held. `detail` is `null` for SQL null. */
export interface HeldStaffAuditEvent {
  readonly id: string;
  readonly occurredAt: Date;
  readonly actorAccountId: string;
  readonly action: string;
  readonly designId: string | null;
  readonly subjectAccountId: string | null;
  readonly detail: Readonly<Record<string, unknown>> | null;
}

/** A row a test plants, as a script run around the store would write it: any action of the table's shape. */
export type PlantedStaffAuditEvent = HeldStaffAuditEvent;

/** What the page reads from `accounts`; `undefined` is an account with no row. */
export interface StaffAuditDirectoryAccount {
  readonly email: string;
  readonly name: string | null;
}

/** What the page reads from `designs`; `undefined` is a design with no row. */
export interface StaffAuditDirectoryDesign {
  readonly name: string | null;
  readonly ownerAccountId: string | null;
  readonly isDeletedByClient: boolean;
}

/** The two tables the page left-joins. Without one, every account and kitchen reads as gone. */
export interface StaffAuditDirectory {
  accountOf(accountId: string): StaffAuditDirectoryAccount | undefined;
  designOf(designId: string): StaffAuditDirectoryDesign | undefined;
}

export interface FakeStaffAuditStoreOptions {
  /** The database's clock, for `occurred_at`. */
  readonly now?: () => Date;
  /** The session table the actor is taken from, by the same liveness test the real statement repeats. */
  readonly sessions: SessionStore;
  readonly directory?: StaffAuditDirectory;
}

/** A prepared row that has passed every refusal and is not yet written. `commit` writes it, once. */
export interface StagedStaffAuditEvent {
  commit(): void;
}

const NOTHING_RESOLVES: StaffAuditDirectory = {
  accountOf: () => undefined,
  designOf: () => undefined,
};

/**
 * In-memory `StaffAuditStore` with `NeonStaffAuditStore`'s contract: the actor is the account of the live session, a
 * session that is not live writes nothing and throws `not-recorded`, the same code refusals, `detail` as null for an
 * entry without one, newest first by `(occurred_at desc, id desc)`, and a page that keeps a row whose actor, subject or
 * kitchen no longer resolves and reads one the domain refuses as `unrecognised`. It cannot stand for the database's
 * microsecond clock (it holds milliseconds), for its text collation (ties on `occurred_at` break by code-unit order of
 * `id`), or for a retry after a lost acknowledgement.
 *
 * `stage` is the seam for a store whose write must commit its audit row with the change: it runs every refusal and the
 * session test first and returns the row to `commit` after the change is made, so a refusal leaves the change unmade,
 * as the Neon batch does by rolling it back.
 */
export class FakeStaffAuditStore implements StaffAuditStore {
  private readonly events: HeldStaffAuditEvent[] = [];
  private readonly now: () => Date;
  private readonly sessions: SessionStore;
  private readonly directory: StaffAuditDirectory;

  constructor({
    now = () => new Date(),
    sessions,
    directory = NOTHING_RESOLVES,
  }: FakeStaffAuditStoreOptions) {
    this.now = now;
    this.sessions = sessions;
    this.directory = directory;
  }

  async record(record: StaffAuditRecord): Promise<void> {
    const staged = await this.stage(record);
    staged.commit();
  }

  async stage(record: StaffAuditRecord): Promise<StagedStaffAuditEvent> {
    const prepared = prepareStaffAuditRecord(record);
    const lookup = await this.sessions.findLive({
      tokenHash: prepared.sessionTokenHash,
      idleLifetimeSeconds: prepared.idleLifetimeSeconds,
    });
    if (lookup.kind === "none") {
      throw new StaffAuditStoreError(
        "record a staff audit event",
        "not-recorded",
      );
    }
    let isCommitted = false;
    return {
      commit: () => {
        if (isCommitted) return;
        isCommitted = true;
        this.events.push({
          id: prepared.id,
          occurredAt: this.now(),
          actorAccountId: lookup.account.id,
          action: prepared.entry.action,
          designId: prepared.designId,
          subjectAccountId: prepared.subjectAccountId,
          detail:
            prepared.entry.detail === null
              ? null
              : { ...prepared.entry.detail },
        });
      },
    };
  }

  page(request: StaffAuditPageRequest): Promise<StaffAuditPage> {
    try {
      requireValidPageRequest(request);
      return Promise.resolve(this.pageOf(request));
    } catch (refusal) {
      return Promise.reject(refusal as Error);
    }
  }

  /** Writes a row the way a script around the store would: the table's shape checks apply, the domain's do not. */
  plant(event: PlantedStaffAuditEvent): void {
    const isShaped =
      STORED_ID_SHAPE.test(event.id) &&
      STORED_ID_SHAPE.test(event.actorAccountId) &&
      STORED_ACTION_SHAPE.test(event.action) &&
      (event.designId === null || STORED_ID_SHAPE.test(event.designId)) &&
      (event.subjectAccountId === null ||
        STORED_ID_SHAPE.test(event.subjectAccountId));
    if (!isShaped || this.events.some(({ id }) => id === event.id)) {
      throw new Error("The table would refuse this planted audit row.");
    }
    this.events.push({ ...event });
  }

  /** Every row held, in the order written. */
  heldEvents(): readonly HeldStaffAuditEvent[] {
    return this.events.map((event) => ({ ...event }));
  }

  private pageOf(request: StaffAuditPageRequest): StaffAuditPage {
    const matching = this.events
      .filter((event) => isMatching(event, request))
      .sort(newestFirst);
    const offset = offsetOfStaffAuditPage(request.page);
    return {
      total: matching.length,
      page: request.page,
      pageSize: STAFF_AUDIT_PAGE_SIZE,
      events: matching
        .slice(offset, offset + STAFF_AUDIT_PAGE_SIZE)
        .map((event) => this.rowOf(event)),
    };
  }

  private rowOf(event: HeldStaffAuditEvent): StaffAuditPageRow {
    return {
      id: event.id,
      occurredAt: event.occurredAt,
      actor: this.accountRefOf(event.actorAccountId),
      subject:
        event.subjectAccountId === null
          ? null
          : this.accountRefOf(event.subjectAccountId),
      design: event.designId === null ? null : this.designRefOf(event.designId),
      reading: readingOfStoredEvent(event.action, event.detail),
    };
  }

  private accountRefOf(accountId: string): StaffAuditAccountRef {
    const account = this.directory.accountOf(accountId);
    return {
      id: accountId,
      email: account?.email ?? null,
      name: account?.name ?? null,
    };
  }

  private designRefOf(designId: string): StaffAuditDesignRef {
    const design = this.directory.designOf(designId);
    if (design === undefined || design.isDeletedByClient) {
      return { id: designId, name: null, client: null };
    }
    return {
      id: designId,
      name: design.name,
      client:
        design.ownerAccountId === null
          ? null
          : this.accountRefOf(design.ownerAccountId),
    };
  }
}

function isMatching(
  event: HeldStaffAuditEvent,
  {
    actorAccountId,
    action,
    occurredFrom,
    occurredBefore,
  }: StaffAuditPageRequest,
): boolean {
  return (
    (actorAccountId === null || event.actorAccountId === actorAccountId) &&
    (action === null || event.action === action) &&
    (occurredFrom === null ||
      event.occurredAt.getTime() >= occurredFrom.getTime()) &&
    (occurredBefore === null ||
      event.occurredAt.getTime() < occurredBefore.getTime())
  );
}

function newestFirst(
  left: HeldStaffAuditEvent,
  right: HeldStaffAuditEvent,
): number {
  const byTime = right.occurredAt.getTime() - left.occurredAt.getTime();
  if (byTime !== 0) return byTime;
  if (left.id === right.id) return 0;
  return left.id < right.id ? 1 : -1;
}
