import type { RequestStatus } from "@lemnaria/configurator-domain";

import type { StatementTag } from "./preset-statements.js";
import type { StaffActingSession } from "./staff-kitchen-actions-store.js";

/**
 * The staff kitchen actions store's four statements, written once, here, in the pattern of
 * `staff-kitchen-statements.ts`: the Neon store sends them and a test hands them to a recorder or to the server. Each
 * write statement repeats the reader's visibility test (`STAFF_VISIBLE_PREDICATE`), and the note write, the status write
 * and the status read repeat `NeonSessionStore.findLive`'s liveness test (the unhide names no account and needs none),
 * because a tagged template cannot be interpolated into another; statements tests compare each copy word for word.
 */

/**
 * What a write raises, on purpose, when it changes nothing. A batch cannot branch on a row count, and the audit insert
 * is unconditional on the caller's write, so each write divides, overflows or takes a logarithm of a count it reads
 * from its own result: the batch aborts and the audit row goes with it. The SQLSTATEs are chosen so that no other
 * statement of the batch can raise them (the audit statement raises 22012 alone, and its text casts nothing that fails
 * to 22P02): a raise is read by the store before `staffAuditStoreErrorFrom` reads 22012 as `not-recorded`.
 * - 22003 (integer out of range): the kitchen is not one staff can see. The statements add 1 to 2147483647, the
 *   largest 4-byte integer, so the sum overflows exactly when the refusal case is taken.
 * - 2201E (logarithm of zero): the kitchen is visible but not in the state the action needs (not sent, not hidden).
 * - 2201F (zero to a negative power): the stored status is no longer the one the save was decided against.
 * - 22012 (division by zero): no live session stands behind the call, as the audit statement reads it.
 */
export const KITCHEN_NOT_VISIBLE = "22003";
export const KITCHEN_NOT_IN_STATE = "2201E";
export const STATUS_MOVED = "2201F";

/** What a statement needs of the session: the hash and the idle lifetimes as the JSON text the statements bind. */
export interface SessionStatementInput {
  readonly sessionTokenHash: string;
  readonly lifetimes: string;
}

export function sessionStatementInputOf(
  session: StaffActingSession,
): SessionStatementInput {
  return {
    sessionTokenHash: session.sessionTokenHash,
    lifetimes: JSON.stringify(session.idleLifetimeSeconds),
  };
}

/**
 * The actor test, `NeonSessionStore.findLive`'s, written out in each statement that needs it because a tagged template
 * cannot be interpolated into another; the copies must change together (a statements test compares them word for word).
 * A statement that found no live session writes nothing and raises 22012 in `session_live`.
 */
export function addNoteStatement<Statement>(
  sql: StatementTag<Statement>,
  input: {
    readonly noteId: string;
    readonly designId: string;
    readonly text: string;
    readonly session: StaffActingSession;
  },
): Statement {
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
export function saveStatusStatement<Statement>(
  sql: StatementTag<Statement>,
  input: {
    readonly designId: string;
    readonly status: RequestStatus;
    readonly expectedStored: RequestStatus | null;
    readonly session: StaffActingSession;
  },
): Statement {
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
export function unhideStatement<Statement>(
  sql: StatementTag<Statement>,
  designId: string,
): Statement {
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
export function statusFactsStatement<Statement>(
  sql: StatementTag<Statement>,
  designId: string,
  { sessionTokenHash, lifetimes }: SessionStatementInput,
): Statement {
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
