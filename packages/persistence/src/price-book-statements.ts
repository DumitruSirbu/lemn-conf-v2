import type { StatementTag } from "./preset-statements.js";
import type { PreparedStaffAuditRecord } from "./staff-audit-store.js";

/**
 * `NeonPriceBookStore`'s statements (ADR 0178). Every write is one `with` statement, which Postgres runs as one
 * transaction, because a Neon HTTP batch cannot read an earlier statement's result: the audit insert reads the change it
 * records, so a refused write leaves no audit row. A tagged template cannot be interpolated into another, so the actor test
 * (`NeonSessionStore.findLive`'s, administrators only) is repeated in each write; a statements test compares the copies.
 */

/**
 * Raised by the publish statement alone when the head moved but another branch wrote nothing: the statement rolls back and
 * the store answers `changed-meanwhile`. 2201F is "zero raised to a negative power".
 */
export const PUBLISH_RACED = "2201F";

/** The unique constraint of `0023` that two publishes at one sequence number meet. */
export const SEQUENCE_NUMBER_IS_UNIQUE =
  "price_book_versions_sequence_number_is_unique";

/**
 * The newest version. **Every `order by` here names its column through a table alias**: a bare name in `order by` binds to
 * an output column of that name first, and `sequence_number::text as sequence_number` is one, so a bare
 * `order by sequence_number` sorts the text and puts version 9 after version 10.
 */
export function readActiveVersionStatement<Statement>(
  sql: StatementTag<Statement>,
): Statement {
  return sql`
    select v.id, v.sequence_number::text as sequence_number, v.label,
      floor(extract(epoch from v.published_at) * 1000)::bigint::text as published_ms, v.book
    from price_book_versions v
    order by v.sequence_number desc
    limit 1
  `;
}

/** The version with its note and change summary, and whether it is the newest (the active one), in one snapshot. */
export function readVersionStatement<Statement>(
  sql: StatementTag<Statement>,
  versionId: string,
): Statement {
  return sql`
    select v.id, v.sequence_number::text as sequence_number, v.label, v.note,
      floor(extract(epoch from v.published_at) * 1000)::bigint::text as published_ms, v.book, v.change_summary,
      v.sequence_number = (select max(sequence_number) from price_book_versions) as is_active
    from price_book_versions v
    where v.id = ${versionId}::text
  `;
}

/**
 * One statement carries the page and the count, so `total` and the rows come from one snapshot, and an empty page still
 * reports the total (one row with no `id`). Newest first. `change_count` is the stored summary's length and nothing else
 * stores it.
 */
export function listVersionsStatement<Statement>(
  sql: StatementTag<Statement>,
  page: { readonly offset: number; readonly limit: number },
): Statement {
  return sql`
    select t.total, p.id, p.sequence_number::text as sequence_number, p.label, p.published_ms, p.change_count,
      p.is_active
    from (select count(*)::int as total from price_book_versions) t
    left join lateral (
      select v.id, v.sequence_number, v.label,
        floor(extract(epoch from v.published_at) * 1000)::bigint::text as published_ms,
        jsonb_array_length(v.change_summary) as change_count,
        v.sequence_number = (select max(sequence_number) from price_book_versions) as is_active
      from price_book_versions v
      order by v.sequence_number desc
      limit ${page.limit}::int offset ${page.offset}::int
    ) p on true
    order by p.sequence_number desc nulls last
  `;
}

export function readDraftStatement<Statement>(
  sql: StatementTag<Statement>,
): Statement {
  return sql`
    select revision::text as revision, changes from price_book_draft
  `;
}

export interface WriteDraftStatementInput {
  readonly expectedRevision: string;
  readonly changesJson: string;
  readonly detailJson: string;
  readonly audit: PreparedStaffAuditRecord;
}

/**
 * The draft write: the compare-and-set and the audit row of the live session's account, as branches of one statement. A
 * stale writer changes nothing and finds `revision` null; a call with no live session finds `is_session_live` false.
 */
export function writeDraftStatement<Statement>(
  sql: StatementTag<Statement>,
  input: WriteDraftStatementInput,
): Statement {
  const { expectedRevision, changesJson, detailJson, audit } = input;
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
    moved as (
      update price_book_draft
      set revision = revision + 1, changes = ${changesJson}::jsonb, updated_at = now(),
        updated_by_account_id = (select account_id from actor)
      where revision = ${expectedRevision}::bigint
        and exists (select 1 from actor)
      returning revision
    ),
    audited as (
      insert into staff_audit_events (id, actor_account_id, action, design_id, subject_account_id, detail)
      select ${audit.id}::text, a.account_id, ${audit.entry.action}::text, null, null, ${detailJson}::jsonb
      from actor a
      where exists (select 1 from moved)
      returning id
    )
    select (select revision::text from moved) as revision,
      exists (select 1 from actor) as is_session_live,
      (select count(*) from audited)::int as audited_rows
  `;
}

export interface PublishStatementInput {
  readonly expectedDraftRevision: string;
  readonly expectedActiveSequence: string;
  readonly expectedAvailabilityRevision: string;
  readonly versionId: string;
  readonly label: string;
  readonly note: string;
  readonly bookJson: string;
  readonly changeSummaryJson: string;
  /** The created items, in order, as two lists of one length: the kind of each, then its id. */
  readonly createdItemKinds: readonly string[];
  readonly createdItemIds: readonly string[];
  /** The audit detail's members the caller supplies; `sequenceNumber` and `changeCount` are stamped in the statement. */
  readonly detailJson: string;
  readonly audit: PreparedStaffAuditRecord;
}

/**
 * The publish, in one statement whose branches depend on one another in this order: `draft_row` locks the draft at the
 * revision read (two publishes meet here first); `moved_head` moves the availability head by `greatest(k, 1)` only while
 * it is still at the revision read, and a head that moved changes no row and then nothing else is written; `reset_draft`,
 * `inserted_version`, `logged` and `audited` follow. The audit row's `sequenceNumber` and `changeCount` are read from the
 * inserted version row. The book is stored with its `version` set to the version's id. The last select reports each
 * branch, and raises `PUBLISH_RACED` for the one state it must not leave. A sequence number taken raises 23505.
 */
export function publishStatement<Statement>(
  sql: StatementTag<Statement>,
  input: PublishStatementInput,
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
    created_items as (
      select t.kind, t.item_id, t.position
      from unnest(${input.createdItemKinds}::text[], ${input.createdItemIds}::text[])
        with ordinality as t(kind, item_id, position)
    ),
    draft_row as materialized (
      select revision from price_book_draft
      where revision = ${input.expectedDraftRevision}::bigint
      for update
    ),
    moved_head as (
      update catalogue_availability_head
      set revision = revision + greatest((select count(*) from created_items), 1)
      where revision = ${input.expectedAvailabilityRevision}::bigint
        and exists (select 1 from actor)
        and exists (select 1 from draft_row)
        and (select coalesce(max(sequence_number), 0) from price_book_versions)
          = ${input.expectedActiveSequence}::bigint
      returning revision
    ),
    reset_draft as (
      update price_book_draft
      set revision = revision + 1, changes = '[]'::jsonb, base_version_id = ${input.versionId}::text,
        updated_at = now(), updated_by_account_id = (select account_id from actor)
      where revision = ${input.expectedDraftRevision}::bigint
        and exists (select 1 from moved_head)
      returning revision
    ),
    inserted_version as (
      insert into price_book_versions (id, sequence_number, label, note, book, change_summary, published_by_account_id)
      select ${input.versionId}::text, ${input.expectedActiveSequence}::bigint + 1, ${input.label}::text,
        ${input.note}::text,
        ${input.bookJson}::jsonb || jsonb_build_object('version', ${input.versionId}::text),
        ${input.changeSummaryJson}::jsonb, a.account_id
      from reset_draft
      cross join actor a
      returning id, sequence_number, jsonb_array_length(change_summary) as change_count
    ),
    logged as (
      insert into catalogue_availability_changes (revision, item_kind, item_id, active, changed_by_account_id)
      select h.revision - greatest((select count(*) from created_items), 1) + c.position, c.kind, c.item_id, false,
        a.account_id
      from moved_head h
      cross join actor a
      join created_items c on true
      where exists (select 1 from reset_draft)
      returning revision
    ),
    audited as (
      insert into staff_audit_events (id, actor_account_id, action, design_id, subject_account_id, detail)
      select ${audit.id}::text, a.account_id, ${audit.entry.action}::text, null, null,
        ${input.detailJson}::jsonb
          || jsonb_build_object('sequenceNumber', v.sequence_number, 'changeCount', v.change_count)
      from inserted_version v
      cross join actor a
      returning id
    )
    select (select count(*) from draft_row)::int as draft_rows,
      (select revision::text from moved_head) as availability_revision,
      (select id from inserted_version) as version_id,
      (select sequence_number::text from inserted_version) as sequence_number,
      exists (select 1 from actor) as is_session_live,
      (select coalesce(max(sequence_number), 0) from price_book_versions)
        = ${input.expectedActiveSequence}::bigint as is_sequence_current,
      power(
        case
          when (select count(*) from moved_head) = 1
            and ((select count(*) from reset_draft) <> 1
              or (select count(*) from inserted_version) <> 1
              or (select count(*) from audited) <> 1
              or (select count(*) from logged) <> (select count(*) from created_items))
          then 0
          else 1
        end, -1) as publish_complete
  `;
}

export interface SeedPriceBookStatementInput {
  readonly versionId: string;
  readonly label: string;
  readonly note: string;
  readonly bookJson: string;
  readonly ownerAccountId: string;
}

/**
 * The owner-run seed: version 1, inserted only while no version exists and only for an account that exists, and the
 * draft pointed at it (`base_version_id`). It writes no audit row. The
 * reply says what was there before the statement ran, so a refusal can be told apart: `seeded_id` is null when nothing was
 * inserted. A second seed racing this one meets the uniqueness of the sequence number and fails.
 */
export function seedPriceBookStatement<Statement>(
  sql: StatementTag<Statement>,
  input: SeedPriceBookStatementInput,
): Statement {
  const { versionId, label, note, bookJson, ownerAccountId } = input;
  return sql`
    with seeded as (
      insert into price_book_versions (id, sequence_number, label, note, book, change_summary, published_by_account_id)
      select ${versionId}::text, 1, ${label}::text, ${note}::text,
        ${bookJson}::jsonb, '[]'::jsonb, ${ownerAccountId}::text
      where not exists (select 1 from price_book_versions)
        and exists (select 1 from accounts where id = ${ownerAccountId}::text)
      returning id
    ),
    based as (
      update price_book_draft set base_version_id = ${versionId}::text
      where exists (select 1 from seeded)
      returning singleton
    )
    select (select id from seeded) as seeded_id,
      exists (select 1 from price_book_versions) as are_versions_present,
      exists (select 1 from accounts where id = ${ownerAccountId}::text) as is_owner_account
  `;
}
