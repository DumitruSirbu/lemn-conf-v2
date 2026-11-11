/**
 * What the scheduled backup reads out of the price dashboard's tables, as the text that leaves for the database, with no
 * database. A restore can only bring back what was exported, so each column list is the contract: the `*_by_account_id`
 * columns are `not null` with no default, and the timestamps are history. The live test beside this one compares the same
 * lists with the deployed columns, so a column added by a later migration cannot stay out of an export unnoticed.
 */
export const VERSION_COLUMNS = [
  "id",
  "sequence_number",
  "label",
  "note",
  "book",
  "change_summary",
  "change_count",
  "published_at",
  "published_by_account_id",
];
export const CHANGE_COLUMNS = [
  "revision",
  "item_kind",
  "item_id",
  "active",
  "changed_at",
  "changed_by_account_id",
];
export const HEAD_COLUMNS = ["revision"];
export const DEFAULTS_COLUMNS = [
  "revision",
  "defaults",
  "saved_at",
  "saved_by_account_id",
];
