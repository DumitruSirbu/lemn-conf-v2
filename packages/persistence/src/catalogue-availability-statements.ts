import type { StatementTag } from "./preset-statements.js";
import type { PreparedStaffAuditRecord } from "./staff-audit-store.js";

/**
 * `NeonCatalogueAvailabilityStore`'s statements (ADR 0178 A-17, F1), written once, here, as `price-book-statements.ts`
 * writes the price book's. The head row (`catalogue_availability_head`, `0025`) numbers the log: a write moves it with
 * `where revision = <the one the writer read>`, and the log row it inserts carries the revision that update returned,
 * inside the same statement. There is no counter object and no hook on insert.
 */

/**
 * What is switched off at the head, in one snapshot with the head's revision: one row per switched-off item, or one row
 * with no item when nothing is. An item is switched off when its latest row, up to the head, says so. The log is read
 * only up to the head's revision, so a row written at a revision the head has not reached (the accepted residual of
 * `0025`) is not part of any state.
 */
export function readCurrentAvailabilityStatement<Statement>(
  sql: StatementTag<Statement>,
): Statement {
  return sql`
    select h.revision::text as revision, c.item_kind, c.item_id
    from catalogue_availability_head h
    left join lateral (
      select latest.item_kind, latest.item_id
      from (
        select distinct on (l.item_kind, l.item_id) l.item_kind, l.item_id, l.active
        from catalogue_availability_changes l
        where l.revision <= h.revision
        order by l.item_kind, l.item_id, l.revision desc
      ) latest
      where not latest.active
    ) c on true
    order by c.item_kind, c.item_id
  `;
}

/**
 * The same, as it was at a revision: the replay of the log up to it. No row when the revision is beyond the head's, which
 * is "the revision names no state". The revision is echoed through `bigint` so the caller reads back the canonical text.
 */
export function readAvailabilityAtStatement<Statement>(
  sql: StatementTag<Statement>,
  revision: string,
): Statement {
  return sql`
    select ${revision}::bigint::text as revision, c.item_kind, c.item_id
    from catalogue_availability_head h
    left join lateral (
      select latest.item_kind, latest.item_id
      from (
        select distinct on (l.item_kind, l.item_id) l.item_kind, l.item_id, l.active
        from catalogue_availability_changes l
        where l.revision <= ${revision}::bigint
        order by l.item_kind, l.item_id, l.revision desc
      ) latest
      where not latest.active
    ) c on true
    where ${revision}::bigint <= h.revision
    order by c.item_kind, c.item_id
  `;
}

export interface SetItemActiveStatementInput {
  readonly expectedRevision: string;
  readonly itemKind: string;
  readonly itemId: string;
  readonly active: boolean;
  /** The audit detail's members the caller supplies; `availabilityRevision` is stamped in the statement. */
  readonly detailJson: string;
  readonly audit: PreparedStaffAuditRecord;
}

/**
 * One write, in one statement: the head's compare-and-set, the log row at the revision it returned, and the audit row of
 * the account of the live session, whose `availabilityRevision` is that same returned revision, as text. A head that is
 * no longer at `expectedRevision` is not updated, and then nothing else is written: the reply has a null `revision`.
 */
export function setItemActiveStatement<Statement>(
  sql: StatementTag<Statement>,
  input: SetItemActiveStatementInput,
): Statement {
  const { audit } = input;
  const lifetimes = JSON.stringify(audit.idleLifetimeSeconds);
  return sql`
    with actor as (
      select s.account_id
      from account_sessions s
      join accounts a on a.id = s.account_id
      where s.token_hash = ${audit.sessionTokenHash}
        and s.revoked_at is null
        and s.absolute_expires_at > now()
        and s.created_at >= a.password_changed_at
        and s.last_seen_at
          + ((${lifetimes}::jsonb ->> a.role)::double precision * interval '1 second') > now()
    ),
    moved_head as (
      update catalogue_availability_head
      set revision = revision + 1
      where revision = ${input.expectedRevision}::bigint
        and exists (select 1 from actor)
      returning revision
    ),
    logged as (
      insert into catalogue_availability_changes (revision, item_kind, item_id, active, changed_by_account_id)
      select h.revision, ${input.itemKind}::text, ${input.itemId}::text, ${input.active}::boolean, a.account_id
      from moved_head h
      cross join actor a
      returning revision
    ),
    audited as (
      insert into staff_audit_events (id, actor_account_id, action, design_id, subject_account_id, detail)
      select ${audit.id}::text, a.account_id, ${audit.entry.action}::text, null, null,
        ${input.detailJson}::jsonb || jsonb_build_object('availabilityRevision', h.revision::text)
      from moved_head h
      cross join actor a
      returning id
    )
    select (select revision::text from moved_head) as revision,
      (select revision::text from logged) as logged_revision,
      (select count(*) from audited)::int as audited_rows,
      exists (select 1 from actor) as is_session_live
  `;
}
