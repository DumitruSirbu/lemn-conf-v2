import {
  INITIAL_REQUEST_STATUS,
  STAFF_KITCHEN_PAGE_SIZE,
  staffKitchenOffsetOf,
} from "@lemnaria/configurator-domain";
import type { StaffKitchenQuery } from "@lemnaria/configurator-domain";

import type { StatementTag } from "./preset-statements.js";
import {
  NOTES_READ_LIMIT,
  ROMANIAN_CEDILLA_LETTERS,
  ROMANIAN_COMMA_BELOW_LETTERS,
  foldRomanianSearchText,
  likePatternContaining,
} from "./staff-kitchen-reader.js";

/**
 * The staff kitchen reader's three statements, written once: the Neon reader sends them and the privilege test hands
 * them to the server's `explain` as the application role, so the statement the reader sends is the one the role is
 * shown able to plan. Every one is a read. Every instant is read as epoch milliseconds clamped to what a `Date` holds
 * (`infinity` and years past 275760 read as the nearest one). `least` and `greatest` skip a null, so `sent_at`, which
 * is null on a draft, is tested for null first; `changed_ms` is read only where a status row exists.
 */

/**
 * Which kitchens staff can see, over `designs d`: the client has not deleted it, and it is sent or owned by an account
 * (a visitor's unsent draft is neither). A tagged template cannot interpolate SQL, so this is the one reference the
 * statements repeat as text: the reader's `readOne` ends its `where` with it, the list's `all` segment is its other
 * form, and the four write statements of `staff-kitchen-actions-statements.ts` contain it (aliased `d`, or bare in the
 * unhide update). Tests assert every copy against this constant, both ways, so a one-sided change fails.
 */
export const STAFF_VISIBLE_PREDICATE =
  "d.deleted_by_client_at is null and (d.sent_at is not null or d.account_id is not null)";

/**
 * The page and the count in one statement, so `total` and the kitchens come from one snapshot. The accounts, the status
 * row and the document are left joins; the document is joined back for the page's kitchens only, so the count's rows
 * carry none. The lateral join promises no order, so the outer query repeats it.
 */
export function staffKitchenListStatement<Statement>(
  sql: StatementTag<Statement>,
  { segment, status, search, page }: StaffKitchenQuery,
): Statement {
  const pattern = search === null ? null : likePatternContaining(search);
  const foldedPattern =
    search === null
      ? null
      : likePatternContaining(foldRomanianSearchText(search));
  return sql`
    with matching as (
      select d.id, d.name, d.sent_at, d.updated_at, d.hidden_by_client_at,
        case when ${segment}::text = 'sent' then d.sent_at else d.updated_at end as sorted_at,
        a.id as client_id, a.email as client_email, a.name as client_name, a.phone as client_phone,
        s.status as stored_status
      from designs d
      left join accounts a on a.id = d.account_id
      left join design_request_states s on s.design_id = d.id
      where d.deleted_by_client_at is null
        and (case ${segment}::text
          when 'sent' then d.sent_at is not null
          when 'drafts' then d.sent_at is null and d.account_id is not null
          when 'all' then d.sent_at is not null or d.account_id is not null
        end)
        and (${status}::text is null or coalesce(s.status, ${INITIAL_REQUEST_STATUS}::text) = ${status}::text)
        and (${pattern}::text is null
          or a.email_normal_form ilike ${pattern}::text escape '\\'
          or translate(a.name, ${ROMANIAN_CEDILLA_LETTERS}::text, ${ROMANIAN_COMMA_BELOW_LETTERS}::text)
            ilike ${foldedPattern}::text escape '\\')
    )
    select t.total, p.id, p.name, p.is_sent, p.is_hidden, p.sent_ms, p.updated_ms, p.sorted_at,
      p.client_id, p.client_email, p.client_name, p.client_phone, p.stored_status,
      p.schema_version, p.document
    from (select count(*)::int as total from matching) t
    left join lateral (
      select m.id, m.name, (m.sent_at is not null) as is_sent, (m.hidden_by_client_at is not null) as is_hidden,
        case when m.sent_at is null then null
          else floor(least(
            greatest(extract(epoch from m.sent_at) * 1000, -8640000000000000),
            8640000000000000
          ))::bigint::text end as sent_ms,
        floor(least(
          greatest(extract(epoch from m.updated_at) * 1000, -8640000000000000),
          8640000000000000
        ))::bigint::text as updated_ms,
        m.sorted_at, m.client_id, m.client_email, m.client_name, m.client_phone, m.stored_status,
        kitchen.schema_version, kitchen.document
      from matching m
      left join designs kitchen on kitchen.id = m.id
      order by m.sorted_at desc, m.id desc
      limit ${STAFF_KITCHEN_PAGE_SIZE}::int offset ${staffKitchenOffsetOf(page)}::bigint
    ) p on true
    order by p.sorted_at desc nulls last, p.id desc
  `;
}

/**
 * A kitchen is readable unless its client deleted it, and unless it is a visitor's unsent draft, which no list shows
 * (the same two tests as the list's `all` segment). `contact_submissions` is read through `cs` for the columns the
 * application role may select, and its newest row for the design is the latest request. The as-sent copy is the newest
 * unrevoked view of that request; the view's token hash only breaks a tie and is never returned.
 */
export function staffKitchenStatement<Statement>(
  sql: StatementTag<Statement>,
  designId: string,
): Statement {
  return sql`
    select d.id, d.name, d.schema_version, d.document,
      (d.sent_at is not null) as is_sent, (d.hidden_by_client_at is not null) as is_hidden,
      case when d.sent_at is null then null
          else floor(least(
            greatest(extract(epoch from d.sent_at) * 1000, -8640000000000000),
            8640000000000000
          ))::bigint::text end as sent_ms,
      floor(least(
        greatest(extract(epoch from d.updated_at) * 1000, -8640000000000000),
        8640000000000000
      ))::bigint::text as updated_ms,
      a.id as client_id, a.email as client_email, a.name as client_name, a.phone as client_phone,
      request.reference as request_reference, request.created_ms as request_ms,
      sent_copy.schema_version as sent_schema_version, sent_copy.design_document as sent_document,
      s.status as stored_status, s.changed_by_account_id as changed_by_id,
      floor(least(
        greatest(extract(epoch from s.changed_at) * 1000, -8640000000000000),
        8640000000000000
      ))::bigint::text as changed_ms,
      changer.email as changed_by_email, changer.name as changed_by_name
    from designs d
    left join accounts a on a.id = d.account_id
    left join lateral (
      select cs.reference, cs.client_request_id,
        floor(least(
          greatest(extract(epoch from cs.created_at) * 1000, -8640000000000000),
          8640000000000000
        ))::bigint::text as created_ms
      from contact_submissions cs
      where cs.design_id = d.id
      order by cs.created_at desc, cs.client_request_id desc
      limit 1
    ) request on true
    left join lateral (
      select csv.schema_version, csv.design_document
      from contact_submission_views csv
      where csv.client_request_id = request.client_request_id and csv.revoked_at is null
      order by csv.created_at desc, csv.token_hash desc
      limit 1
    ) sent_copy on true
    left join design_request_states s on s.design_id = d.id
    left join accounts changer on changer.id = s.changed_by_account_id
    where d.id = ${designId}
      and d.deleted_by_client_at is null
      and (d.sent_at is not null or d.account_id is not null)
  `;
}

/** The newest notes of a kitchen, one more than `NOTES_READ_LIMIT` so the reader can tell that some were left out. */
export function staffKitchenNotesStatement<Statement>(
  sql: StatementTag<Statement>,
  designId: string,
): Statement {
  return sql`
    select n.id, n.body,
      floor(least(
        greatest(extract(epoch from n.created_at) * 1000, -8640000000000000),
        8640000000000000
      ))::bigint::text as created_ms,
      n.author_account_id as author_id, author.email as author_email, author.name as author_name
    from design_notes n
    left join accounts author on author.id = n.author_account_id
    where n.design_id = ${designId}
    order by n.created_at desc, n.id desc
    limit ${NOTES_READ_LIMIT + 1}::int
  `;
}
