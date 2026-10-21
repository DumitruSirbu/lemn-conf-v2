import {
  MAX_EXPORTED_NOTE_BYTES,
  MAX_EXPORTED_NOTES_IN_TOTAL,
  MAX_EXPORTED_NOTES_PER_KITCHEN,
} from "./account-kitchen-store.js";
import type { StatementTag } from "./preset-statements.js";

/** What the export's notes statement asks for: the account, and the kitchens (already judged) to read the notes of. */
export interface ExportedKitchenNotesRequest {
  readonly accountId: string;
  readonly kitchenIds: readonly string[];
}

/** The most rows the statement can yield, and so the most a reply may hold: the per-kitchen cap of each kitchen. */
export function exportedKitchenNotesRowBound(
  kitchenIds: readonly string[],
): number {
  return kitchenIds.length * MAX_EXPORTED_NOTES_PER_KITCHEN;
}

/**
 * The client's data export reads the staff notes on its own kitchens in this one statement, written once: the Neon
 * store sends it and the privilege test hands it to the server's `explain` as the application role, so the statement
 * the store sends is the one the role is shown able to plan.
 *
 * `asked` joins `designs` for ownership alone: the account's own predicate and `deleted_by_client_at is null` (a
 * hidden kitchen's notes are held, so they are read). `accounts` is not joined and the author column is not selected,
 * so no staff identity can reach the reply; only the design, the text and the instant are.
 *
 * Three steps. (1) `windowed`: for each owned kitchen a lateral subselect reads at most `MAX_EXPORTED_NOTES_PER_KITCHEN
 * + 1` of its newest notes through `design_notes_by_design_newest_idx`, so a kitchen's history is never scanned past
 * that window; the extra row only tells that the kitchen holds more (`has_more`) and takes no further part. (2) `kept`:
 * the per-kitchen rows are ranked newest first over all kitchens, with a running sum of their bytes. (3) A row past
 * `MAX_EXPORTED_NOTES_IN_TOTAL` notes, or past `MAX_EXPORTED_NOTE_BYTES` of text, keeps its place but has its text and
 * instant selected as null, so a kitchen whose every note was withheld is still marked. The instant is read as epoch
 * milliseconds clamped to what a `Date` holds, as the staff reader reads it.
 *
 * This and `exportAll` are two reads, not one snapshot: a kitchen the client deletes between them is exported with
 * no notes, which is acceptable (the export is a copy of what the client held a moment ago).
 */
export function exportedKitchenNotesStatement<Statement>(
  sql: StatementTag<Statement>,
  { accountId, kitchenIds }: ExportedKitchenNotesRequest,
): Statement {
  return sql`
    with asked as (
      select d.id
      from unnest(${kitchenIds}::text[]) as wanted(id)
      join designs d on d.id = wanted.id
      where d.account_id = ${accountId} and d.deleted_by_client_at is null
    ), windowed as (
      select a.id as design_id, w.note_id, w.body, w.created_at,
        row_number() over (partition by a.id order by w.created_at desc, w.note_id desc) as in_kitchen,
        count(*) over (partition by a.id) as in_window
      from asked a
      cross join lateral (
        select n.id as note_id, n.body, n.created_at
        from design_notes n
        where n.design_id = a.id
        order by n.created_at desc, n.id desc
        limit ${MAX_EXPORTED_NOTES_PER_KITCHEN + 1}::int
      ) w
    ), kept as (
      select x.design_id, x.note_id, x.body, x.created_at, (x.in_window > ${MAX_EXPORTED_NOTES_PER_KITCHEN}::int) as has_more,
        row_number() over (order by x.created_at desc, x.note_id desc) as overall,
        sum(octet_length(x.body)) over (
          order by x.created_at desc, x.note_id desc rows between unbounded preceding and current row
        ) as running_bytes
      from windowed x
      where x.in_kitchen <= ${MAX_EXPORTED_NOTES_PER_KITCHEN}::int
    )
    select r.design_id, r.has_more,
      case when r.overall <= ${MAX_EXPORTED_NOTES_IN_TOTAL}::int and r.running_bytes <= ${MAX_EXPORTED_NOTE_BYTES}::bigint
        then r.body end as body,
      case when r.overall <= ${MAX_EXPORTED_NOTES_IN_TOTAL}::int and r.running_bytes <= ${MAX_EXPORTED_NOTE_BYTES}::bigint
        then floor(least(
          greatest(extract(epoch from r.created_at) * 1000, -8640000000000000),
          8640000000000000
        ))::bigint::text end as created_ms
    from kept r
    order by r.created_at desc, r.note_id desc
    limit ${exportedKitchenNotesRowBound(kitchenIds)}::int
  `;
}
