import type { StatementTag } from "./preset-statements.js";
import type { PreparedStaffAuditRecord } from "./staff-audit-store.js";

/**
 * `NeonKitchenDefaultsStore`'s statements (ADR 0178 A-9; migration `0029`). A revision is an opaque digit string that is
 * only ever compared here, in SQL, as a `bigint`. The actor test (`NeonSessionStore.findLive`'s, administrators only) is
 * repeated in the write, as in every dashboard write; a statements test compares the copies.
 */

/** The one row. Its revision is read as text, and its instant as epoch milliseconds, so neither is a driver's `Date`. */
export function readKitchenDefaultsStatement<Statement>(
  sql: StatementTag<Statement>,
): Statement {
  return sql`
    select k.revision::text as revision, k.defaults,
      floor(extract(epoch from k.saved_at) * 1000)::bigint::text as saved_ms
    from kitchen_defaults k
  `;
}

export interface SaveKitchenDefaultsStatementInput {
  readonly expectedRevision: string;
  readonly expectedAvailabilityRevision: string;
  readonly defaultsJson: string;
  readonly detailJson: string;
  readonly audit: PreparedStaffAuditRecord;
}

/**
 * One save, in one statement: the availability head's compare-and-set, the defaults row, and the audit row of the account
 * of the live session, as branches of one `with`. The head is moved only while it is at `expectedAvailabilityRevision`,
 * the session is live **and the defaults are still at `expectedRevision`**, so a save at a stale defaults revision leaves
 * the head where it was. The defaults update and the audit row are conditional on that move, so a refused save writes
 * none of the three.
 *
 * The head is the lock every writer of what is on sale shares: of two writers at one head revision the second changes no
 * row, whichever writers they are. The reply also carries what the statement saw before it wrote, so a refusal names the
 * revision that was stale: the sub-statements of a `with` cannot see each other's writes, so `is_revision_current` is the
 * defaults as they stood when the statement began. A save that read the head and the defaults current but lost the head
 * to a concurrent writer finds both true and nothing written, and the store answers it as the availability refusal.
 */
export function saveKitchenDefaultsStatement<Statement>(
  sql: StatementTag<Statement>,
  input: SaveKitchenDefaultsStatementInput,
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
        and a.role = 'administrator'
    ),
    moved_head as (
      update catalogue_availability_head
      set revision = revision + 1
      where revision = ${input.expectedAvailabilityRevision}::bigint
        and exists (select 1 from actor)
        and exists (select 1 from kitchen_defaults k where k.revision = ${input.expectedRevision}::bigint)
      returning revision
    ),
    saved as (
      update kitchen_defaults
      set revision = kitchen_defaults.revision + 1, defaults = ${input.defaultsJson}::jsonb, saved_at = now(),
        saved_by_account_id = a.account_id
      from actor a, moved_head h
      where kitchen_defaults.revision = ${input.expectedRevision}::bigint
      returning kitchen_defaults.revision
    ),
    audited as (
      insert into staff_audit_events (id, actor_account_id, action, design_id, subject_account_id, detail)
      select ${audit.id}::text, a.account_id, ${audit.entry.action}::text, null, null, ${input.detailJson}::jsonb
      from actor a
      where exists (select 1 from saved)
      returning id
    )
    select (select revision::text from saved) as revision,
      (select revision::text from moved_head) as availability_revision,
      (select count(*) from audited)::int as audited_rows,
      exists (select 1 from actor) as is_session_live,
      exists (select 1 from kitchen_defaults k where k.revision = ${input.expectedRevision}::bigint)
        as is_revision_current
  `;
}
