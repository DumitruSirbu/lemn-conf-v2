/** A database row as the driver hands it back, before anything has been read from it. */
export type Row = Record<string, unknown>;

const MISSING_GRANT = "42501";
const MISSING_TABLE = "42P01";

export function isRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A count as a statement reports it: a whole, non-negative number. */
export function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** SQLSTATE 42501 (no grant) and 42P01 (no table): the two ways a store is not in place, which a route answers 503. */
export function isMissingGrantOrTable(sqlState: string | undefined): boolean {
  return sqlState === MISSING_GRANT || sqlState === MISSING_TABLE;
}

/**
 * The rows of a statement that returns the total in every row and one row per item of the page: the page's rows,
 * which are the rows that name an item (`id` not null), and the total. An empty page is one row with no `id`. A reply
 * that is none of these, or holds more items than a page, is `undefined`.
 */
export function pagedRowsFrom(
  rows: readonly Row[],
  pageSize: number,
): { readonly total: number; readonly found: readonly Row[] } | undefined {
  const total = rows[0]?.["total"];
  if (rows.length === 0 || !isCount(total)) return undefined;
  const found = rows.filter((row) => row["id"] !== null);
  const isEmptyPage = found.length === 0 && rows.length === 1;
  const isFullReply = found.length === rows.length;
  if (!isEmptyPage && !isFullReply) return undefined;
  if (found.length > pageSize) return undefined;
  return { total, found };
}
