import type {
  NeonQueryFunction,
  NeonQueryPromise,
} from "@neondatabase/serverless";

import { reducedCauseOf } from "./migration-errors.js";
import type { ReducedCause } from "./migration-errors.js";
import { openApplicationDatabase } from "./open-application-database.js";
import { retryOnTransientFailure } from "./retry-on-transient-failure.js";
import {
  STAFF_AUDIT_PAGE_SIZE,
  StaffAuditStoreError,
  detailTextOf,
  offsetOfStaffAuditPage,
  prepareStaffAuditRecord,
  readingOfStoredEvent,
  requireValidPageRequest,
} from "./staff-audit-store.js";
import type {
  PreparedStaffAuditRecord,
  StaffAuditAccountRef,
  StaffAuditDesignRef,
  StaffAuditPage,
  StaffAuditPageRequest,
  StaffAuditPageRow,
  StaffAuditRecord,
  StaffAuditStore,
  StaffAuditStoreFailure,
  StaffAuditStoreOperation,
} from "./staff-audit-store.js";

type ApplicationSql = NeonQueryFunction<false, false>;
type Row = Record<string, unknown>;

const MISSING_GRANT = "42501";
const MISSING_TABLE = "42P01";
/** Raised by `staffAuditInsertStatement` itself, and by nothing else in it, when it inserted no row. */
const DIVISION_BY_ZERO = "22012";

const RECORD_OPERATION = "record a staff audit event";
const READ_OPERATION = "read the staff audit log";

/** A constraint's name is a schema identifier, not data; anything of another shape is left off the cause. */
const CONSTRAINT_NAME_SHAPE = /^[a-z][a-z0-9_]{0,62}$/;

/**
 * `StaffAuditStore` on Neon Postgres, over `staff_audit_events` (migration `0020`) joined, on read only, to `accounts`
 * and `designs`. Every query is a tagged-template `sql`, which parameterises values.
 *
 * The statements write only the six columns the application role is granted. None names `occurred_at`, updates, or
 * deletes. The insert has no `on conflict`: a row that cannot be written is a failure to answer, never a skipped row.
 */
export class NeonStaffAuditStore implements StaffAuditStore {
  private readonly sql: ApplicationSql;

  /** `connectionUrl` defaults to `DATABASE_URL`; only the live tests pass it, to target their own database. */
  constructor(connectionUrl?: string) {
    this.sql = openApplicationDatabase(connectionUrl);
  }

  /**
   * Not retried. A repeat after a lost acknowledgement would either insert a second row for one action (a fresh id) or
   * hit the primary key (the same id, and no `on conflict`); the first over-states what was done and the second fails
   * an answer the log already holds, so the call fails closed once and the caller decides.
   */
  async record(record: StaffAuditRecord): Promise<void> {
    const prepared = prepareStaffAuditRecord(record);
    const rows = await guarded(RECORD_OPERATION, () =>
      staffAuditInsertStatement(this.sql, prepared),
    );
    requireOneAuditRowInserted(rows);
  }

  /**
   * One statement carries the page and the count, so `total` and the rows come from one snapshot, and an empty page
   * still reports the total. The accounts and the kitchen are **left** joins: a row whose actor, subject or kitchen no
   * longer resolves stays, with nulls. A kitchen its client deleted is not resolved (plan P-L3-4). The walk is
   * `staff_audit_events_newest_first_idx` (`0020`).
   */
  async page(request: StaffAuditPageRequest): Promise<StaffAuditPage> {
    requireValidPageRequest(request);
    const rows = await guarded(READ_OPERATION, () =>
      retryOnTransientFailure(() => this.pageRows(request)),
    );
    return pageFrom(plainRowsOf(rows), request.page);
  }

  private pageRows(request: StaffAuditPageRequest) {
    const { actorAccountId, action } = request;
    const from = request.occurredFrom?.toISOString() ?? null;
    const before = request.occurredBefore?.toISOString() ?? null;
    return this.sql`
      with filtered as (
        select e.id, e.occurred_at, e.actor_account_id, e.action, e.design_id, e.subject_account_id, e.detail
        from staff_audit_events e
        where (${actorAccountId}::text is null or e.actor_account_id = ${actorAccountId}::text)
          and (${action}::text is null or e.action = ${action}::text)
          and (${from}::timestamptz is null or e.occurred_at >= ${from}::timestamptz)
          and (${before}::timestamptz is null or e.occurred_at < ${before}::timestamptz)
      )
      select t.total, p.id, p.occurred_ms, p.action, p.detail,
        p.actor_account_id, p.actor_email, p.actor_name,
        p.subject_account_id, p.subject_email, p.subject_name,
        p.design_id, p.design_name,
        p.client_account_id, p.client_email, p.client_name
      from (select count(*)::int as total from filtered) t
      left join lateral (
        select f.id, f.occurred_at,
          floor(extract(epoch from f.occurred_at) * 1000)::bigint::text as occurred_ms,
          f.action, f.detail,
          f.actor_account_id, actor_account.email as actor_email, actor_account.name as actor_name,
          f.subject_account_id, subject_account.email as subject_email, subject_account.name as subject_name,
          f.design_id, kitchen.name as design_name,
          kitchen.account_id as client_account_id, client_account.email as client_email,
          client_account.name as client_name
        from filtered f
        left join accounts actor_account on actor_account.id = f.actor_account_id
        left join accounts subject_account on subject_account.id = f.subject_account_id
        left join designs kitchen on kitchen.id = f.design_id and kitchen.deleted_by_client_at is null
        left join accounts client_account on client_account.id = kitchen.account_id
        order by f.occurred_at desc, f.id desc
        limit ${STAFF_AUDIT_PAGE_SIZE}::int offset ${offsetOfStaffAuditPage(request.page)}::int
      ) p on true
      order by p.occurred_at desc nulls last, p.id desc
    `;
  }
}

/**
 * The audit insert as one statement, for a caller's own `sql.transaction([...])` batch (a staff write commits its row
 * with the change) and for `NeonStaffAuditStore.record`.
 *
 * The actor is not an argument: the row is inserted **from a select of the live session** the hash names, so the
 * session's account is the actor, and a session that is not live inserts nothing. The liveness test is the one
 * `NeonSessionStore.findLive` applies, written out here because a tagged template cannot be interpolated into another;
 * the two must change together (a statements test compares them).
 *
 * A batch cannot branch on a row count between its statements, so the statement raises when it inserted anything but
 * one row: the final select divides by zero exactly then (SQLSTATE 22012), and that aborts the whole batch, the
 * caller's write included. The divisor reads the insert's own result, so the failure cannot be decided before the
 * statement runs. `staffAuditStoreErrorFrom` reads that SQLSTATE as `not-recorded`; `requireOneAuditRowInserted` checks
 * the reply of the batch that survived.
 */
export function staffAuditInsertStatement(
  sql: ApplicationSql,
  prepared: PreparedStaffAuditRecord,
): NeonQueryPromise<false, false> {
  const { id, sessionTokenHash, entry, designId, subjectAccountId } = prepared;
  const lifetimes = JSON.stringify(prepared.idleLifetimeSeconds);
  return sql`
    with inserted as (
      insert into staff_audit_events (id, actor_account_id, action, design_id, subject_account_id, detail)
      select ${id}::text, s.account_id, ${entry.action}::text, ${designId}::text, ${subjectAccountId}::text,
        ${detailTextOf(entry)}::jsonb
      from account_sessions s
      join accounts a on a.id = s.account_id
      where s.token_hash = ${sessionTokenHash}
        and s.revoked_at is null
        and s.absolute_expires_at > now()
        and s.created_at >= a.password_changed_at
        and s.last_seen_at
          + ((${lifetimes}::jsonb ->> a.role)::double precision * interval '1 second') > now()
      returning id
    )
    select 1 / (select case when count(*) = 1 then 1 else 0 end from inserted) as recorded
  `;
}

/** The reply of a batch whose audit statement ran: exactly the one row the statement answers. */
export function requireOneAuditRowInserted(reply: unknown): void {
  const isTheOneRow =
    Array.isArray(reply) &&
    reply.length === 1 &&
    isRecord(reply[0]) &&
    reply[0]["recorded"] === 1;
  if (!isTheOneRow) {
    throw new StaffAuditStoreError(RECORD_OPERATION, "unexpected-answer");
  }
}

/**
 * A failure of the audit statement, or of a batch that held it, as the store error a route acts on. The driver's error
 * is read for its SQLSTATE and constraint name only and is thrown by nothing here.
 */
export function staffAuditStoreErrorFrom(
  operation: StaffAuditStoreOperation,
  failure: unknown,
): StaffAuditStoreError {
  const cause = causeOf(failure);
  return new StaffAuditStoreError(operation, failureKindOf(cause.code), {
    cause,
  });
}

function failureKindOf(sqlState: string | undefined): StaffAuditStoreFailure {
  if (sqlState === MISSING_GRANT || sqlState === MISSING_TABLE) {
    return "unavailable";
  }
  return sqlState === DIVISION_BY_ZERO ? "not-recorded" : "database";
}

function causeOf(failure: unknown): ReducedCause & { constraint?: string } {
  const reduced = reducedCauseOf(failure).cause as ReducedCause;
  const constraint = constraintNameOf(failure);
  return constraint === undefined ? reduced : { ...reduced, constraint };
}

function constraintNameOf(failure: unknown): string | undefined {
  try {
    const name = (failure as { constraint?: unknown }).constraint;
    return typeof name === "string" && CONSTRAINT_NAME_SHAPE.test(name)
      ? name
      : undefined;
  } catch {
    return undefined;
  }
}

async function guarded(
  operation: StaffAuditStoreOperation,
  runQuery: () => PromiseLike<unknown>,
): Promise<unknown> {
  try {
    return await runQuery();
  } catch (failure) {
    throw staffAuditStoreErrorFrom(operation, failure);
  }
}

/** Each row is copied in one guarded step, so a row that throws when read is the store error with no cause. */
function plainRowsOf(reply: unknown): readonly Row[] {
  try {
    if (!Array.isArray(reply) || !reply.every(isRecord)) {
      throw new StaffAuditStoreError(READ_OPERATION, "unexpected-answer");
    }
    return Array.from(reply, (row) => ({ ...row }));
  } catch {
    throw new StaffAuditStoreError(READ_OPERATION, "unexpected-answer");
  }
}

function isRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The statement's rows: the filtered total, then one row per event, or one row with no event when the page is empty. A
 * row count above a page, or an empty reply, is a statement that did not answer as it was written.
 */
function pageFrom(rows: readonly Row[], page: number): StaffAuditPage {
  const total = rows[0]?.["total"];
  if (rows.length === 0 || !isCount(total)) throw unexpectedAnswer();
  const found = rows.filter((row) => row["id"] !== null);
  const isEmptyPage = found.length === 0 && rows.length === 1;
  const isFullReply = found.length === rows.length;
  if (!isEmptyPage && !isFullReply) throw unexpectedAnswer();
  if (found.length > STAFF_AUDIT_PAGE_SIZE) throw unexpectedAnswer();
  return {
    total,
    page,
    pageSize: STAFF_AUDIT_PAGE_SIZE,
    events: found.map(eventFrom),
  };
}

function eventFrom(row: Row): StaffAuditPageRow {
  const id = textOf(row["id"]);
  const actorId = textOf(row["actor_account_id"]);
  if (id === null || actorId === null) throw unexpectedAnswer();
  return {
    id,
    occurredAt: instantOf(row["occurred_ms"]),
    actor: accountRefFrom(actorId, row["actor_email"], row["actor_name"]),
    subject: optionalAccountRefFrom(
      row["subject_account_id"],
      row["subject_email"],
      row["subject_name"],
    ),
    design: designRefFrom(row),
    reading: readingOfStoredEvent(row["action"], row["detail"]),
  };
}

function designRefFrom(row: Row): StaffAuditDesignRef | null {
  const id = textOf(row["design_id"]);
  if (id === null) return null;
  return {
    id,
    name: textOf(row["design_name"]),
    client: optionalAccountRefFrom(
      row["client_account_id"],
      row["client_email"],
      row["client_name"],
    ),
  };
}

function optionalAccountRefFrom(
  id: unknown,
  email: unknown,
  name: unknown,
): StaffAuditAccountRef | null {
  const accountId = textOf(id);
  return accountId === null ? null : accountRefFrom(accountId, email, name);
}

function accountRefFrom(
  id: string,
  email: unknown,
  name: unknown,
): StaffAuditAccountRef {
  return { id, email: textOf(email), name: textOf(name) };
}

/** A text column, or `null`. Any other type is not this statement's reply. */
function textOf(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw unexpectedAnswer();
  return value;
}

function instantOf(epochMilliseconds: unknown): Date {
  const milliseconds =
    typeof epochMilliseconds === "string" &&
    /^[0-9]{1,16}$/.test(epochMilliseconds)
      ? Number(epochMilliseconds)
      : Number.NaN;
  if (!Number.isSafeInteger(milliseconds)) throw unexpectedAnswer();
  return new Date(milliseconds);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function unexpectedAnswer(): StaffAuditStoreError {
  return new StaffAuditStoreError(READ_OPERATION, "unexpected-answer");
}
