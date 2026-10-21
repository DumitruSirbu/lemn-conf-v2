import { isRequestStatus } from "@lemnaria/configurator-domain";
import type {
  RequestStatus,
  StaffAuditEntry,
} from "@lemnaria/configurator-domain";
import type {
  NeonQueryFunction,
  NeonQueryPromise,
} from "@neondatabase/serverless";
import { nanoid } from "nanoid";

import { reducedCauseOf } from "./migration-errors.js";
import type { ReducedCause } from "./migration-errors.js";
import { isRecord } from "./neon-row-guards.js";
import type { Row } from "./neon-row-guards.js";
import {
  requireOneAuditRowInserted,
  staffAuditInsertStatement,
  staffAuditStoreErrorFrom,
} from "./neon-staff-audit-store.js";
import { openApplicationDatabase } from "./open-application-database.js";
import { retryOnTransientFailure } from "./retry-on-transient-failure.js";
import {
  StaffAuditStoreError,
  prepareStaffAuditRecord,
} from "./staff-audit-store.js";
import type {
  PreparedStaffAuditRecord,
  StaffAuditAccountRef,
} from "./staff-audit-store.js";
import {
  StaffKitchenActionError,
  actionErrorFromAudit,
  decideStatusSave,
  isActionableDesignId,
  requireJudgedNoteText,
  requireListedRequestStatus,
} from "./staff-kitchen-actions-store.js";
import type {
  AddStaffNoteRequest,
  AddStaffNoteResult,
  SavedRequestStatus,
  SetRequestStatusRequest,
  SetRequestStatusResult,
  StaffActingSession,
  StaffKitchenActionOperation,
  StaffKitchenActionsStore,
  UnhideKitchenRequest,
  UnhideKitchenResult,
} from "./staff-kitchen-actions-store.js";
import type { StaffKitchenNote } from "./staff-kitchen-reader.js";

type ApplicationSql = NeonQueryFunction<false, false>;

const ADD_NOTE = "add a staff note";
const SET_STATUS = "set a request status";
const UNHIDE = "unhide a kitchen";

/**
 * What a write raises, on purpose, when it changes nothing. A batch cannot branch on a row count, and the audit insert
 * is unconditional on the caller's write, so each write divides, overflows or takes a logarithm of a count it reads
 * from its own result: the batch aborts and the audit row goes with it. The SQLSTATEs are chosen so that no other
 * statement of the batch can raise them (the audit statement raises 22012 alone, and its text casts nothing that fails
 * to 22P02): a raise is read here before `staffAuditStoreErrorFrom` reads 22012 as `not-recorded`.
 * - 22003 (integer out of range): the kitchen is not one staff can see.
 * - 2201E (logarithm of zero): the kitchen is visible but not in the state the action needs (not sent, not hidden).
 * - 2201F (zero to a negative power): the stored status is no longer the one the save was decided against.
 * - 22012 (division by zero): no live session stands behind the call, as the audit statement reads it.
 */
const KITCHEN_NOT_VISIBLE = "22003";
const KITCHEN_NOT_IN_STATE = "2201E";
const STATUS_MOVED = "2201F";

type WriteRefusal = "kitchen-not-found" | "wrong-state" | "changed-meanwhile";

const WRITE_REFUSAL_BY_SQLSTATE: Readonly<Record<string, WriteRefusal>> = {
  [KITCHEN_NOT_VISIBLE]: "kitchen-not-found",
  [KITCHEN_NOT_IN_STATE]: "wrong-state",
  [STATUS_MOVED]: "changed-meanwhile",
};

/** The refusals each write can raise; a SQLSTATE of another write's is not read as a refusal here, only as a failure. */
const REFUSALS_OF: Readonly<
  Record<StaffKitchenActionOperation, readonly WriteRefusal[]>
> = {
  [ADD_NOTE]: ["kitchen-not-found"],
  [SET_STATUS]: ["kitchen-not-found", "wrong-state", "changed-meanwhile"],
  [UNHIDE]: ["kitchen-not-found", "wrong-state"],
};

const BATCH_OPTIONS = { isolationLevel: "ReadCommitted" } as const;
const BATCH_SIZE = 2;
const AUDIT_STATEMENT_INDEX = 0;
const WRITE_STATEMENT_INDEX = 1;

type BatchOutcome =
  | { readonly kind: "committed"; readonly writeRows: readonly Row[] }
  | { readonly kind: "refused"; readonly refusal: WriteRefusal };

interface SessionStatementInput {
  readonly sessionTokenHash: string;
  readonly lifetimes: string;
}

/**
 * `StaffKitchenActionsStore` on Neon Postgres, over `design_notes`, `design_request_states` and `designs`, with the audit
 * row of `staff_audit_events` (migrations `0020`-`0022`). Every statement is a tagged-template `sql`, which parameterises
 * values.
 *
 * Each write is **one `sql.transaction` of two statements**: the audit insert (`staffAuditInsertStatement`, which takes
 * the actor from the live session and raises 22012 when there is none) and the staff write. The batch is never retried:
 * the event id is minted once and the repeat of a batch whose acknowledgement was lost would insert a second row or hit
 * the primary key. A plain read before a write (the status read) may be retried, because it writes nothing.
 *
 * The write takes the author or the changing account from the same live session in its own statement, inserts nothing
 * unless that session, a kitchen staff can see and (for a status) a sent kitchen are all found, and raises a SQLSTATE of
 * its own when one is missing, so the audit row never commits for a change that was not made. It writes the columns the
 * application role is granted, none other (no `created_at` of a note; `changed_at` is the literal `now()`, never a
 * bound value). The visibility test is the reader's, written out again: a kitchen its client did not delete that is
 * sent or owned by an account.
 */
export class NeonStaffKitchenActionsStore implements StaffKitchenActionsStore {
  private readonly sql: ApplicationSql;

  /** `connectionUrl` defaults to `DATABASE_URL`; only the live tests pass it, to target their own database. */
  constructor(connectionUrl?: string) {
    this.sql = openApplicationDatabase(connectionUrl);
  }

  async addNote(request: AddStaffNoteRequest): Promise<AddStaffNoteResult> {
    const { session, designId, text } = request;
    requireJudgedNoteText(text);
    if (!isActionableDesignId(designId)) return { kind: "kitchen-not-found" };
    const audit = prepareAudit(ADD_NOTE, session, designId, {
      action: "note-added",
      detail: null,
    });
    const noteId = nanoid();
    const outcome = await this.commit(ADD_NOTE, audit, (sql) =>
      addNoteStatement(sql, { noteId, designId, text, session: audit }),
    );
    if (outcome.kind === "refused") return { kind: "kitchen-not-found" };
    return { kind: "added", note: noteFrom(outcome.writeRows, noteId, text) };
  }

  /**
   * Reads the kitchen's status first (a plain read, retried like any other), decides on it, and then writes with the
   * status it read as a condition of the write, so the audit row's `from` is the status the write replaced and not one
   * a concurrent save changed in between: a save that finds the status moved writes nothing and answers
   * `changed-meanwhile`. A save of the status the kitchen already shows writes nothing and no audit row.
   */
  async setStatus(
    request: SetRequestStatusRequest,
  ): Promise<SetRequestStatusResult> {
    const { session, designId, status } = request;
    requireListedRequestStatus(status);
    if (!isActionableDesignId(designId)) return { kind: "kitchen-not-found" };
    const checked = prepareAudit(SET_STATUS, session, designId, {
      action: "status-changed",
      detail: { from: "new", to: status },
    });
    const found = await this.readStatusFacts(designId, checked);
    const decision = decideStatusSave({
      kitchen: found.kitchen,
      requested: status,
    });
    if (decision.kind === "unchanged") {
      return { kind: "unchanged", current: found.current };
    }
    if (decision.kind !== "write") return { kind: decision.kind };
    const audit = prepareAudit(SET_STATUS, checked, designId, {
      action: "status-changed",
      detail: { from: decision.from, to: status },
    });
    const outcome = await this.commit(SET_STATUS, audit, (sql) =>
      saveStatusStatement(sql, {
        designId,
        status,
        expectedStored: decision.expectedStored,
        session: audit,
      }),
    );
    return savedOrRefused(outcome, status);
  }

  async unhide(request: UnhideKitchenRequest): Promise<UnhideKitchenResult> {
    const { session, designId } = request;
    if (!isActionableDesignId(designId)) return { kind: "kitchen-not-found" };
    const audit = prepareAudit(UNHIDE, session, designId, {
      action: "kitchen-unhidden",
      detail: null,
    });
    const outcome = await this.commit(UNHIDE, audit, (sql) =>
      unhideStatement(sql, designId),
    );
    if (outcome.kind === "committed") {
      requireUnhiddenRow(outcome.writeRows, designId);
      return { kind: "unhidden" };
    }
    return outcome.refusal === "wrong-state"
      ? { kind: "not-hidden" }
      : { kind: "kitchen-not-found" };
  }

  /** The kitchen's side of a status save, with the session test the write repeats: a call with no live session is
   *  refused here before it learns anything of the kitchen. */
  private async readStatusFacts(
    designId: string,
    session: StaffActingSession,
  ): Promise<StatusFacts> {
    const input = sessionStatementInputOf(session);
    const rows = await this.queryRows(SET_STATUS, () =>
      retryOnTransientFailure(() =>
        statusFactsStatement(this.sql, designId, input),
      ),
    );
    return statusFactsFrom(rows);
  }

  /**
   * The audit insert first, then the write, in one transaction, never retried. The audit statement reads the session, so
   * a call with no live session raises 22012 before the write is looked at. A SQLSTATE the write raised on purpose is a
   * refusal; anything else is a failure with a built cause.
   */
  private async commit(
    operation: StaffKitchenActionOperation,
    audit: PreparedStaffAuditRecord,
    writeStatement: (sql: ApplicationSql) => NeonQueryPromise<false, false>,
  ): Promise<BatchOutcome> {
    let replies: unknown;
    try {
      replies = await this.sql.transaction(
        [staffAuditInsertStatement(this.sql, audit), writeStatement(this.sql)],
        BATCH_OPTIONS,
      );
    } catch (failure) {
      return refusalOrFailure(operation, failure);
    }
    return committedFrom(operation, replies);
  }

  private async queryRows(
    operation: StaffKitchenActionOperation,
    runQuery: () => PromiseLike<unknown>,
  ): Promise<readonly Row[]> {
    let reply: unknown;
    try {
      reply = await runQuery();
    } catch (failure) {
      throw failureFrom(operation, failure);
    }
    return plainRowsOf(reply, operation);
  }
}

/**
 * The actor test, `NeonSessionStore.findLive`'s, written out in each statement that needs it because a tagged template
 * cannot be interpolated into another; the copies must change together (a statements test compares them word for word).
 * A statement that found no live session writes nothing and raises 22012 in `session_live`.
 */
export function addNoteStatement(
  sql: ApplicationSql,
  input: {
    readonly noteId: string;
    readonly designId: string;
    readonly text: string;
    readonly session: PreparedStaffAuditRecord;
  },
): NeonQueryPromise<false, false> {
  const { noteId, designId, text } = input;
  const { sessionTokenHash, lifetimes } = sessionStatementInputOf(
    input.session,
  );
  return sql`
    with actor as (
      select s.account_id
      from account_sessions s
      join accounts a on a.id = s.account_id
      where s.token_hash = ${sessionTokenHash}
        and s.revoked_at is null
        and s.absolute_expires_at > now()
        and s.created_at >= a.password_changed_at
        and s.last_seen_at
          + ((${lifetimes}::jsonb ->> a.role)::double precision * interval '1 second') > now()
    ),
    kitchen as (
      select d.id
      from designs d
      where d.id = ${designId}
        and d.deleted_by_client_at is null
        and (d.sent_at is not null or d.account_id is not null)
    ),
    inserted as (
      insert into design_notes (id, design_id, author_account_id, body)
      select ${noteId}::text, k.id, a.account_id, ${text}::text
      from kitchen k
      cross join actor a
      returning id, body, author_account_id, created_at
    ),
    refusal as (
      select case
        when not exists (select 1 from actor) then 'session'
        when not exists (select 1 from kitchen) then 'kitchen'
      end as reason
    )
    select n.id, n.body, n.author_account_id,
      floor(extract(epoch from n.created_at) * 1000)::bigint::text as created_ms,
      author.email as author_email, author.name as author_name,
      1 / (case when (select reason from refusal) = 'session' then 0 else 1 end) as session_live,
      2147483647 + (case when (select reason from refusal) = 'kitchen' then 1 else 0 end) as kitchen_visible
    from (select 1) one
    left join inserted n on true
    left join accounts author on author.id = n.author_account_id
  `;
}

/**
 * The upsert. `changed_at` is the literal `now()`, never a bound value, and `changed_by_account_id` the session's
 * account. The `on conflict` branch updates only a row still holding the status the caller read (`expectedStored`;
 * `null` matches no row, so a row that appeared meanwhile is not overwritten), and a save that updates nothing raises
 * 2201F in `status_unmoved`.
 */
export function saveStatusStatement(
  sql: ApplicationSql,
  input: {
    readonly designId: string;
    readonly status: RequestStatus;
    readonly expectedStored: RequestStatus | null;
    readonly session: PreparedStaffAuditRecord;
  },
): NeonQueryPromise<false, false> {
  const { designId, status, expectedStored } = input;
  const { sessionTokenHash, lifetimes } = sessionStatementInputOf(
    input.session,
  );
  return sql`
    with actor as (
      select s.account_id
      from account_sessions s
      join accounts a on a.id = s.account_id
      where s.token_hash = ${sessionTokenHash}
        and s.revoked_at is null
        and s.absolute_expires_at > now()
        and s.created_at >= a.password_changed_at
        and s.last_seen_at
          + ((${lifetimes}::jsonb ->> a.role)::double precision * interval '1 second') > now()
    ),
    kitchen as (
      select d.id, (d.sent_at is not null) as is_sent
      from designs d
      where d.id = ${designId}
        and d.deleted_by_client_at is null
        and (d.sent_at is not null or d.account_id is not null)
    ),
    upserted as (
      insert into design_request_states (design_id, status, changed_by_account_id)
      select k.id, ${status}::text, a.account_id
      from kitchen k
      cross join actor a
      where k.is_sent
      on conflict (design_id) do update
        set status = excluded.status,
          changed_by_account_id = excluded.changed_by_account_id,
          changed_at = now()
        where design_request_states.status = ${expectedStored}::text
      returning design_id, status, changed_by_account_id, changed_at
    ),
    refusal as (
      select case
        when not exists (select 1 from actor) then 'session'
        when not exists (select 1 from kitchen) then 'kitchen'
        when not exists (select 1 from kitchen where is_sent) then 'state'
        when not exists (select 1 from upserted) then 'moved'
      end as reason
    )
    select u.status, u.changed_by_account_id,
      floor(extract(epoch from u.changed_at) * 1000)::bigint::text as changed_ms,
      changer.email as changed_by_email, changer.name as changed_by_name,
      1 / (case when (select reason from refusal) = 'session' then 0 else 1 end) as session_live,
      2147483647 + (case when (select reason from refusal) = 'kitchen' then 1 else 0 end) as kitchen_visible,
      ln(case when (select reason from refusal) = 'state' then 0 else 1 end) as kitchen_sent,
      power(case when (select reason from refusal) = 'moved' then 0 else 1 end, -1) as status_unmoved
    from (select 1) one
    left join upserted u on true
    left join accounts changer on changer.id = u.changed_by_account_id
  `;
}

/**
 * Clears `hidden_by_client_at` and nothing else (not `updated_at`, so the kitchen keeps its place in the client's and
 * the staff lists), only on a kitchen that is hidden, not client-deleted and visible to staff. A statement that cleared
 * nothing raises, so the audit row of the same batch does not commit: 22003 when no such kitchen is visible, 2201E when
 * it is visible but not hidden (a second call).
 */
export function unhideStatement(
  sql: ApplicationSql,
  designId: string,
): NeonQueryPromise<false, false> {
  return sql`
    with kitchen as (
      select d.id
      from designs d
      where d.id = ${designId}
        and d.deleted_by_client_at is null
        and (d.sent_at is not null or d.account_id is not null)
    ),
    unhidden as (
      update designs
      set hidden_by_client_at = null
      where id = ${designId}
        and hidden_by_client_at is not null
        and deleted_by_client_at is null
        and (sent_at is not null or account_id is not null)
      returning id
    ),
    refusal as (
      select case
        when not exists (select 1 from kitchen) then 'kitchen'
        when not exists (select 1 from unhidden) then 'state'
      end as reason
    )
    select u.id,
      2147483647 + (case when (select reason from refusal) = 'kitchen' then 1 else 0 end) as kitchen_visible,
      ln(case when (select reason from refusal) = 'state' then 0 else 1 end) as kitchen_hidden
    from (select 1) one
    left join unhidden u on true
  `;
}

/**
 * The status a save is decided on, with the session test of the writes: one row always, so a missing kitchen and a dead
 * session are told apart. `is_sent` is null when staff cannot see the kitchen. The stamp of a saved status is read clamped
 * to what a `Date` holds, because the grant lets a credential write `infinity` or a year before 1970 into it (ADR 0173
 * residual F1) and a save on that kitchen must still answer.
 */
export function statusFactsStatement(
  sql: ApplicationSql,
  designId: string,
  { sessionTokenHash, lifetimes }: SessionStatementInput,
): NeonQueryPromise<false, false> {
  return sql`
    select exists (
      select 1
      from account_sessions s
      join accounts a on a.id = s.account_id
      where s.token_hash = ${sessionTokenHash}
        and s.revoked_at is null
        and s.absolute_expires_at > now()
        and s.created_at >= a.password_changed_at
        and s.last_seen_at
          + ((${lifetimes}::jsonb ->> a.role)::double precision * interval '1 second') > now()
    ) as is_session_live,
    k.is_sent, k.stored_status, k.changed_by_account_id, k.changed_ms, k.changed_by_email, k.changed_by_name
    from (select 1) one
    left join (
      select (d.sent_at is not null) as is_sent, s.status as stored_status, s.changed_by_account_id,
        case when s.changed_at is null then null
          else floor(least(
            greatest(extract(epoch from s.changed_at) * 1000, -8640000000000000),
            8640000000000000
          ))::bigint::text end as changed_ms,
        changer.email as changed_by_email, changer.name as changed_by_name
      from designs d
      left join design_request_states s on s.design_id = d.id
      left join accounts changer on changer.id = s.changed_by_account_id
      where d.id = ${designId}
        and d.deleted_by_client_at is null
        and (d.sent_at is not null or d.account_id is not null)
    ) k on true
  `;
}

function prepareAudit(
  operation: StaffKitchenActionOperation,
  session: StaffActingSession,
  designId: string,
  entry: StaffAuditEntry,
): PreparedStaffAuditRecord {
  try {
    return prepareStaffAuditRecord({
      sessionTokenHash: session.sessionTokenHash,
      idleLifetimeSeconds: session.idleLifetimeSeconds,
      entry,
      designId,
      subjectAccountId: null,
    });
  } catch (refusal) {
    if (refusal instanceof StaffAuditStoreError) {
      throw actionErrorFromAudit(operation, refusal);
    }
    throw refusal;
  }
}

function sessionStatementInputOf(
  session: StaffActingSession,
): SessionStatementInput {
  return {
    sessionTokenHash: session.sessionTokenHash,
    lifetimes: JSON.stringify(session.idleLifetimeSeconds),
  };
}

function refusalOrFailure(
  operation: StaffKitchenActionOperation,
  failure: unknown,
): BatchOutcome {
  const refusal = writeRefusalOf(failure);
  if (refusal !== undefined && REFUSALS_OF[operation].includes(refusal)) {
    return { kind: "refused", refusal };
  }
  throw failureFrom(operation, failure);
}

function writeRefusalOf(failure: unknown): WriteRefusal | undefined {
  const { cause } = reducedCauseOf(failure) as { cause: ReducedCause };
  return cause.code === undefined
    ? undefined
    : WRITE_REFUSAL_BY_SQLSTATE[cause.code];
}

/** The failure with a built cause (type name, SQLSTATE, constraint name): the audit store's reading of a driver error,
 *  which is also how 42501 and 42P01 become `unavailable` and 22012 `not-recorded`. */
function failureFrom(
  operation: StaffKitchenActionOperation,
  failure: unknown,
): StaffKitchenActionError {
  return actionErrorFromAudit(
    operation,
    staffAuditStoreErrorFrom("record a staff audit event", failure),
  );
}

function committedFrom(
  operation: StaffKitchenActionOperation,
  replies: unknown,
): BatchOutcome {
  if (!Array.isArray(replies) || replies.length !== BATCH_SIZE) {
    throw unexpectedAnswer(operation);
  }
  requireAuditRow(operation, replies[AUDIT_STATEMENT_INDEX]);
  return {
    kind: "committed",
    writeRows: plainRowsOf(replies[WRITE_STATEMENT_INDEX], operation),
  };
}

/** The audit statement's own element of the batch reply, as the audit store's helper reads it. */
function requireAuditRow(
  operation: StaffKitchenActionOperation,
  auditReply: unknown,
): void {
  try {
    requireOneAuditRowInserted(auditReply);
  } catch (failure) {
    if (failure instanceof StaffAuditStoreError) {
      throw actionErrorFromAudit(operation, failure);
    }
    throw failure;
  }
}

/** Each row is copied in one guarded step, so a row that throws when read is the store error with no cause. */
function plainRowsOf(
  reply: unknown,
  operation: StaffKitchenActionOperation,
): readonly Row[] {
  try {
    if (!Array.isArray(reply) || !reply.every(isRecord)) {
      throw unexpectedAnswer(operation);
    }
    return Array.from(reply, (row) => ({ ...row }));
  } catch {
    throw unexpectedAnswer(operation);
  }
}

function unexpectedAnswer(
  operation: StaffKitchenActionOperation,
): StaffKitchenActionError {
  return new StaffKitchenActionError(operation, "unexpected-answer");
}

function noteFrom(
  rows: readonly Row[],
  noteId: string,
  text: string,
): StaffKitchenNote {
  const row = onlyRow(rows, ADD_NOTE);
  if (row["id"] !== noteId || row["body"] !== text) {
    throw unexpectedAnswer(ADD_NOTE);
  }
  return {
    id: noteId,
    text,
    createdAt: instantOf(row["created_ms"], ADD_NOTE),
    author: accountRefFrom(
      requiredText(row["author_account_id"], ADD_NOTE),
      row["author_email"],
      row["author_name"],
      ADD_NOTE,
    ),
  };
}

function requireUnhiddenRow(rows: readonly Row[], designId: string): void {
  if (onlyRow(rows, UNHIDE)["id"] !== designId) throw unexpectedAnswer(UNHIDE);
}

function savedOrRefused(
  outcome: BatchOutcome,
  requested: RequestStatus,
): SetRequestStatusResult {
  if (outcome.kind === "refused") return resultOfRefusedSave(outcome.refusal);
  const row = onlyRow(outcome.writeRows, SET_STATUS);
  const saved = savedStatusFrom(row, row["status"]);
  if (saved?.value !== requested) throw unexpectedAnswer(SET_STATUS);
  return { kind: "saved", saved };
}

function resultOfRefusedSave(refusal: WriteRefusal): SetRequestStatusResult {
  if (refusal === "changed-meanwhile") return { kind: "changed-meanwhile" };
  return refusal === "wrong-state"
    ? { kind: "not-sent" }
    : { kind: "kitchen-not-found" };
}

interface StatusFacts {
  readonly kitchen: {
    readonly isSent: boolean;
    readonly storedStatus: string | null;
  } | null;
  readonly current: SavedRequestStatus | null;
}

function statusFactsFrom(rows: readonly Row[]): StatusFacts {
  const row = onlyRow(rows, SET_STATUS);
  if (row["is_session_live"] !== true) {
    throw new StaffKitchenActionError(SET_STATUS, "not-recorded");
  }
  const isSent = row["is_sent"];
  if (isSent === null) return { kitchen: null, current: null };
  if (typeof isSent !== "boolean") throw unexpectedAnswer(SET_STATUS);
  const storedStatus = optionalText(row["stored_status"], SET_STATUS);
  return {
    kitchen: { isSent, storedStatus },
    current: savedStatusFrom(row, storedStatus),
  };
}

/** The saved status of a row that holds one, or `null` for a row without or for a stored text outside the list (which
 *  `decideStatusSave` answers on its own, and which is not read as any status). */
function savedStatusFrom(row: Row, value: unknown): SavedRequestStatus | null {
  if (!isRequestStatus(value)) return null;
  return {
    value,
    by: accountRefFrom(
      requiredText(row["changed_by_account_id"], SET_STATUS),
      row["changed_by_email"],
      row["changed_by_name"],
      SET_STATUS,
    ),
    at: instantOf(row["changed_ms"], SET_STATUS),
  };
}

function onlyRow(
  rows: readonly Row[],
  operation: StaffKitchenActionOperation,
): Row {
  const [row, ...others] = rows;
  if (row === undefined || others.length > 0) throw unexpectedAnswer(operation);
  return row;
}

function accountRefFrom(
  id: string,
  email: unknown,
  name: unknown,
  operation: StaffKitchenActionOperation,
): StaffAuditAccountRef {
  return {
    id,
    email: optionalText(email, operation),
    name: optionalText(name, operation),
  };
}

function requiredText(
  value: unknown,
  operation: StaffKitchenActionOperation,
): string {
  if (typeof value !== "string") throw unexpectedAnswer(operation);
  return value;
}

/** A text column, or `null`. Any other type is not this statement's reply. */
function optionalText(
  value: unknown,
  operation: StaffKitchenActionOperation,
): string | null {
  return value === null ? null : requiredText(value, operation);
}

function instantOf(
  epochMilliseconds: unknown,
  operation: StaffKitchenActionOperation,
): Date {
  const milliseconds =
    typeof epochMilliseconds === "string" &&
    /^-?[0-9]{1,16}$/.test(epochMilliseconds)
      ? Number(epochMilliseconds)
      : Number.NaN;
  if (!Number.isSafeInteger(milliseconds)) throw unexpectedAnswer(operation);
  return new Date(milliseconds);
}
