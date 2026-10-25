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

/** The latest instant a `Date` holds, in epoch milliseconds; the earliest is its negative. A statement that reads an
 *  instant clamps it to this range, so `infinity` and years past 275760 read as the nearest instant a `Date` holds. */
export const MAX_DATE_EPOCH_MS = 8.64e15;

/** The digits of `MAX_DATE_EPOCH_MS`, the longest epoch-millisecond text a clamped statement can send. */
const EPOCH_MILLISECONDS_MAX_DIGITS = 16;

const EPOCH_MILLISECONDS_TEXT = new RegExp(
  `^-?[0-9]{1,${String(EPOCH_MILLISECONDS_MAX_DIGITS)}}$`,
);

/**
 * The instant of an epoch-millisecond text, with a minus sign before 1970, held inside what a `Date` holds. `undefined`
 * for any other value, which is not the reply of a statement that clamps.
 */
export function instantFromEpochMilliseconds(value: unknown): Date | undefined {
  if (typeof value !== "string" || !EPOCH_MILLISECONDS_TEXT.test(value)) {
    return undefined;
  }
  const milliseconds = Number(value);
  return new Date(
    Math.min(Math.max(milliseconds, -MAX_DATE_EPOCH_MS), MAX_DATE_EPOCH_MS),
  );
}
