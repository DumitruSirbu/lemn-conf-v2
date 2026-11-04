import type { StatementTag } from "./preset-statements.js";

/**
 * `NeonPriceNoticeStore`'s statements (ADR 0178 A-11 and F8; migration `0028`). An availability revision is an opaque
 * digit string that is only ever compared here, in SQL, as a `bigint`: no statement hands one to code that orders it.
 * None of them writes an audit row, because a customer's marker has no staff actor.
 */

export interface PriceNoticePairInput {
  readonly designId: string;
  /** The shape of a version's id, judged by the store before the statement. */
  readonly versionId: string;
  /** A revision's digit shape that fits a `bigint`, judged by the store before the statement. */
  readonly availabilityRevision: string;
}

/** The marker of one design: at most one row. The revision is read back as text, so it stays opaque. */
export function readAcknowledgedStatement<Statement>(
  sql: StatementTag<Statement>,
  designId: string,
): Statement {
  return sql`
    select acknowledged_version_id, acknowledged_availability_revision::text as availability_revision
    from design_price_notices
    where design_id = ${designId}
  `;
}

/**
 * A first open: one row inserted with `on conflict do nothing`, so a design that already holds a marker, whether from
 * an earlier open or from an acknowledgement, keeps it. The pair is the server's own current one, which this statement
 * does not judge.
 */
export function recordIfAbsentStatement<Statement>(
  sql: StatementTag<Statement>,
  input: PriceNoticePairInput,
): Statement {
  return sql`
    insert into design_price_notices (design_id, acknowledged_version_id, acknowledged_availability_revision)
    values (${input.designId}, ${input.versionId}, ${input.availabilityRevision}::bigint)
    on conflict (design_id) do nothing
  `;
}

/**
 * One acknowledgement, in one statement: the version the pair names, the availability head, and the upsert, which is
 * conditional on both (the version exists in `price_book_versions`, and the revision is not greater than the head's).
 * Nothing is written otherwise, and the reply says which of the two refused. The upsert replaces whatever pair the
 * design held, so the last acknowledgement is the one kept. The head only rises, so a revision at or below it when this
 * statement reads it stays at or below it.
 */
export function recordAcknowledgedStatement<Statement>(
  sql: StatementTag<Statement>,
  input: PriceNoticePairInput,
): Statement {
  return sql`
    with known as (
      select v.id
      from price_book_versions v
      where v.id = ${input.versionId}
    ),
    head as (
      select h.revision
      from catalogue_availability_head h
    ),
    admitted as (
      select k.id
      from known k
      cross join head h
      where ${input.availabilityRevision}::bigint <= h.revision
    ),
    written as (
      insert into design_price_notices as notice
        (design_id, acknowledged_version_id, acknowledged_availability_revision)
      select ${input.designId}::text, a.id, ${input.availabilityRevision}::bigint
      from admitted a
      on conflict (design_id) do update
      set acknowledged_version_id = excluded.acknowledged_version_id,
        acknowledged_availability_revision = excluded.acknowledged_availability_revision,
        acknowledged_at = now()
      returning notice.design_id
    )
    select exists (select 1 from known) as is_version_known,
      exists (select 1 from head h where ${input.availabilityRevision}::bigint > h.revision) as is_revision_ahead,
      (select count(*) from written)::int as written_rows
  `;
}
