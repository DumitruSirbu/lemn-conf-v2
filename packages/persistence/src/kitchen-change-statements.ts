import type { StatementTag } from "./preset-statements.js";
import type { PreparedStaffAuditRecord } from "./staff-audit-store.js";

/**
 * `NeonKitchenChangeStore`'s statements (ADR 0178 A-12 and A-13; migrations `0026` and `0027`). A revision is an opaque
 * digit string that is only ever compared here, in SQL: no statement hands one to code that orders it. The visibility
 * test of a kitchen is `STAFF_VISIBLE_PREDICATE` (`staff-kitchen-statements.ts`), repeated as text because a tagged
 * template cannot interpolate SQL; a statements test compares the copy word for word.
 */

export interface MarkSeenStatementInput {
  readonly designId: string;
  /** A revision's digit shape that fits a `bigint`, judged by the store before the statement. */
  readonly displayedRevision: string;
  /** The `kitchen-seen` entry, which names the design and holds no detail. */
  readonly audit: PreparedStaffAuditRecord;
}

/**
 * One mark, in one statement: the actor of the live session, the kitchen if staff can see it, the upsert of the seen
 * revision, and the audit row, the last two both conditional on the same admission (a live session, a visible kitchen,
 * a displayed revision not ahead of the kitchen's). Nothing is written otherwise, and the reply says which of the three
 * refused. The audit insert is part of the statement, so a mark whose audit row cannot be written is not made.
 *
 * The upsert never lowers the stored revision: `greatest(held, displayed)`. The account and the instant change only
 * when the displayed revision is strictly greater than the one held, evaluated on the locked row, so of two marks
 * racing at different revisions the greater is the one kept, in either order. `changed_after_seen` is judged against
 * the revision the upsert **returned**, so it describes the row as it stands after this mark; and only for a kitchen
 * that was sent, because an account-held draft never shows the badge (A-12).
 */
export function markSeenStatement<Statement>(
  sql: StatementTag<Statement>,
  input: MarkSeenStatementInput,
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
        and a.role in ('operator', 'administrator')
    ),
    kitchen as (
      select d.id, d.revision, d.sent_at
      from designs d
      where d.id = ${input.designId}
        and d.deleted_by_client_at is null and (d.sent_at is not null or d.account_id is not null)
    ),
    latest as (
      select cs.design_revision
      from contact_submissions cs
      join kitchen k on k.id = cs.design_id
      order by cs.created_at desc, cs.client_request_id desc
      limit 1
    ),
    admitted as (
      select k.id, a.account_id
      from kitchen k
      cross join actor a
      where ${input.displayedRevision}::bigint <= k.revision
    ),
    marked as (
      insert into design_staff_seen as seen (design_id, seen_revision, seen_by_account_id)
      select m.id, ${input.displayedRevision}::bigint, m.account_id
      from admitted m
      on conflict (design_id) do update
      set seen_revision = greatest(seen.seen_revision, excluded.seen_revision),
        seen_by_account_id = case when excluded.seen_revision > seen.seen_revision
          then excluded.seen_by_account_id else seen.seen_by_account_id end,
        seen_at = case when excluded.seen_revision > seen.seen_revision
          then now() else seen.seen_at end
      returning seen.seen_revision
    ),
    audited as (
      insert into staff_audit_events (id, actor_account_id, action, design_id, subject_account_id, detail)
      select ${audit.id}::text, m.account_id, ${audit.entry.action}::text, m.id, null, '{}'::jsonb
      from admitted m
      returning id
    )
    select exists (select 1 from actor) as is_session_live,
      exists (select 1 from kitchen) as is_kitchen_visible,
      exists (select 1 from kitchen k where ${input.displayedRevision}::bigint > k.revision) as is_displayed_ahead,
      (select count(*) from marked)::int as marked_rows,
      (select count(*) from audited)::int as audited_rows,
      (select d.sent_at is not null
          and d.revision <> greatest(case when seen.seen_revision <= d.revision then seen.seen_revision end, latest.design_revision)
        from kitchen d
        cross join marked seen
        left join latest on true) as is_changed_after_seen
  `;
}

/**
 * The claim of a day: one row inserted with `on conflict do nothing`, so of two runs for one day exactly one gets the
 * row back and the other none (ADR 0178 A-13). The insert names `day_key` alone; the table stamps `claimed_at`.
 */
export function claimDigestDayStatement<Statement>(
  sql: StatementTag<Statement>,
  dayKey: string,
): Statement {
  return sql`
    insert into staff_change_digest_rounds (day_key)
    values (${dayKey})
    on conflict (day_key) do nothing
    returning day_key
  `;
}

export interface ListDigestEligibleStatementInput {
  /** The instant the digest runs at, as an ISO-8601 text. The statement never reads the database's clock. */
  readonly nowIso: string;
  /** `DIGEST_WINDOW_MS`: an exact duration in milliseconds, so a clock change inside it cannot move the edge. */
  readonly windowMilliseconds: number;
  /** `DIGEST_STOPPING_STATUSES`: the digest stops at these. */
  readonly stoppingStatuses: readonly string[];
}

/**
 * The kitchens the digest lists (ADR 0178 A-13), one row each, with nothing a person typed beyond the kitchen's name
 * and the account's name: no e-mail, no phone, no address, and no column of `contact_submissions` but the reference and
 * the design revision. The clauses:
 * - changed: the revision differs from the effective seen revision (`EFFECTIVE_SEEN_REVISION`): the greater of the seen
 *   mark, unless it is above the kitchen's own revision, and the **one** latest submission's revision (a lateral with `limit 1`,
 *   never a join over submissions), so a stale first mark below the revision a kitchen was sent at cannot make it read
 *   as changed;
 * - not held: no digest **entry** for the design above that effective seen revision and not above the kitchen's own;
 * - in the window: first sent, truncated to the milliseconds a `Date` holds, after `$now` less the window, exclusive at
 *   the edge;
 * - not stopped: the stored status (or `new` where none is stored) is not one the digest stops at;
 * - visible and sent: not deleted by the client, `sent_at` set;
 * - printable: an account name or a request reference to name the customer by, so one row without either cannot abort
 *   the day's digest.
 * The name is `nullif(btrim(accounts.name), '')`: `btrim` strips spaces only.
 */
export function listDigestEligibleStatement<Statement>(
  sql: StatementTag<Statement>,
  input: ListDigestEligibleStatementInput,
): Statement {
  return sql`
    select d.id as design_id, d.name as kitchen_name, nullif(btrim(a.name), '') as customer_name,
      latest.reference,
      floor(least(
        greatest(extract(epoch from d.sent_at) * 1000, -8640000000000000),
        8640000000000000
      ))::bigint::text as sent_ms,
      floor(least(
        greatest(extract(epoch from d.updated_at) * 1000, -8640000000000000),
        8640000000000000
      ))::bigint::text as updated_ms,
      d.revision::text as revision
    from designs d
    left join accounts a on a.id = d.account_id
    left join design_request_states s on s.design_id = d.id
    left join design_staff_seen seen on seen.design_id = d.id
    left join lateral (
      select cs.reference, cs.design_revision
      from contact_submissions cs
      where cs.design_id = d.id
      order by cs.created_at desc, cs.client_request_id desc
      limit 1
    ) latest on true
    cross join lateral (
      select greatest(case when seen.seen_revision <= d.revision then seen.seen_revision end, latest.design_revision) as effective_seen
    ) basis
    where d.deleted_by_client_at is null and d.sent_at is not null
      and date_trunc('milliseconds', d.sent_at) > ${input.nowIso}::timestamptz
        - (${input.windowMilliseconds}::double precision * interval '1 millisecond')
      and coalesce(s.status, 'new') <> all(${input.stoppingStatuses}::text[])
      and (nullif(btrim(a.name), '') is not null or latest.reference is not null)
      and d.revision <> basis.effective_seen
      and not exists (
        select 1
        from staff_change_digest_entries entry
        where entry.design_id = d.id
          and entry.revision > basis.effective_seen
          and entry.revision <= d.revision
      )
    order by d.sent_at asc, d.id asc
  `;
}

export interface RecordDigestedStatementInput {
  readonly roundId: string;
  /** Parallel arrays, one position per kitchen listed: its id and the revision it was listed at. */
  readonly designIds: readonly string[];
  readonly revisions: readonly string[];
}

/**
 * The entries of a round, inserted and never updated (`on conflict do nothing` keeps the first revision recorded for a
 * kitchen in a round), and the round's `sent_count` set to the number of entries it then holds. An empty list inserts
 * nothing and still answers whether the round was claimed, because an entry for a day nobody claimed is refused by the
 * statement (nothing is selected from a missing round) and by the table's key.
 */
export function recordDigestedStatement<Statement>(
  sql: StatementTag<Statement>,
  input: RecordDigestedStatementInput,
): Statement {
  return sql`
    with round as (
      select r.day_key
      from staff_change_digest_rounds r
      where r.day_key = ${input.roundId}
    ),
    listed as (
      insert into staff_change_digest_entries (day_key, design_id, revision)
      select r.day_key, e.design_id, e.revision::bigint
      from round r
      cross join unnest(${input.designIds}::text[], ${input.revisions}::text[]) as e(design_id, revision)
      on conflict (day_key, design_id) do nothing
      returning design_id
    ),
    counted as (
      update staff_change_digest_rounds r
      set sent_count = (select count(*) from staff_change_digest_entries held where held.day_key = r.day_key)
        + (select count(*) from listed)
      where r.day_key = ${input.roundId}
      returning r.sent_count
    )
    select exists (select 1 from round) as is_claimed,
      (select count(*) from listed)::int as listed_rows,
      (select count(*) from counted)::int as counted_rows
  `;
}
