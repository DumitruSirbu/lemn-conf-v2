import {
  MAX_EXPORTED_NOTES_IN_TOTAL,
  MAX_EXPORTED_NOTES_PER_KITCHEN,
} from "./account-kitchen-store.js";
import type { StatementTag } from "./preset-statements.js";

/** What the export's notes statement asks for: the account, and the kitchens (already judged) to read the notes of. */
export interface ExportedKitchenNotesRequest {
  readonly accountId: string;
  readonly kitchenIds: readonly string[];
}

/** The most rows the statement can yield, and so the most a reply may hold: the per-kitchen window of each kitchen. */
export function exportedKitchenNotesRowBound(
  kitchenIds: readonly string[],
): number {
  return kitchenIds.length * (MAX_EXPORTED_NOTES_PER_KITCHEN + 1);
}

/**
 * The client's data export reads the staff notes on its own kitchens in this one statement, written once: the Neon
 * store sends it and the privilege test hands it to the server's `explain` as the application role, so the statement
 * the store sends is the one the role is shown able to plan.
 *
 * `design_notes` is joined to `designs` for ownership alone: the account's own predicate and `deleted_by_client_at is
 * null` (a hidden kitchen's notes are held, so they are read). `accounts` is not joined and the author column is not
 * selected, so no staff identity can reach the reply; only the design, the text and the instant are.
 *
 * Two windows: the newest `MAX_EXPORTED_NOTES_PER_KITCHEN + 1` of each kitchen (the extra row only tells that the
 * kitchen holds more), then a global newest-first rank. A row past `MAX_EXPORTED_NOTES_IN_TOTAL` keeps its place but
 * has its text and instant selected as null, so a kitchen whose every note fell past the ceiling still reports that it
 * was cut. The `limit` is the most rows those windows can yield. The instant is read as epoch milliseconds clamped to
 * what a `Date` holds, as the staff reader reads it.
 */
export function exportedKitchenNotesStatement<Statement>(
  sql: StatementTag<Statement>,
  { accountId, kitchenIds }: ExportedKitchenNotesRequest,
): Statement {
  return sql`
    select r.design_id,
      case when r.overall <= ${MAX_EXPORTED_NOTES_IN_TOTAL}::int then r.body end as body,
      case when r.overall <= ${MAX_EXPORTED_NOTES_IN_TOTAL}::int then floor(least(
        greatest(extract(epoch from r.created_at) * 1000, -8640000000000000),
        8640000000000000
      ))::bigint::text end as created_ms
    from (
      select k.design_id, k.body, k.created_at, k.id,
        row_number() over (order by k.created_at desc, k.id desc) as overall
      from (
        select n.design_id, n.body, n.created_at, n.id,
          row_number() over (partition by n.design_id order by n.created_at desc, n.id desc) as in_kitchen
        from design_notes n
        join designs d on d.id = n.design_id
        where d.account_id = ${accountId} and d.deleted_by_client_at is null
          and n.design_id = any(${kitchenIds}::text[])
      ) k
      where k.in_kitchen <= ${MAX_EXPORTED_NOTES_PER_KITCHEN + 1}::int
    ) r
    order by r.created_at desc, r.id desc
    limit ${exportedKitchenNotesRowBound(kitchenIds)}::int
  `;
}
