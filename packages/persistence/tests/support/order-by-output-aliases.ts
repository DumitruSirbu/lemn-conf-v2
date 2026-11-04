import type { StatementTag } from "../../src/preset-statements.js";

const OUTPUT_ALIAS = /\bas\s+([a-z_][a-z0-9_]*)\b/g;
const ORDER_BY_LIST =
  /\border\s+by\s+([^)]*?)(?=\s+limit\b|\s+offset\b|\)|;|$)/g;
const SORT_SUFFIX =
  /\s+(?:asc|desc)(?:\s+nulls\s+(?:first|last))?$|\s+nulls\s+(?:first|last)$/;
const BARE_NAME = /^[a-z_][a-z0-9_]*$/;

/** A tag that returns the statement's text with each interpolation as `?`, for a test that reads the text alone. */
export const statementText: StatementTag<string> = (strings) =>
  strings.join("?");

/**
 * The names an `order by` of the statement sorts by that are written bare and are also the name of an output column
 * (`… as name`). PostgreSQL binds a bare `order by` name to the output column first, so `sequence_number::text as
 * sequence_number … order by sequence_number` sorts the text and not the `bigint`, and "9" comes after "10". A name
 * qualified by its table or alias (`v.sequence_number`) is always the input column and is not reported.
 */
export function orderByNamesOfAnOutputColumn(statement: string): string[] {
  const text = statement.replace(/\s+/g, " ").toLowerCase();
  const outputNames = new Set(
    [...text.matchAll(OUTPUT_ALIAS)].map(([, name]) => name),
  );
  return [...text.matchAll(ORDER_BY_LIST)]
    .flatMap(([, list]) => (list ?? "").split(","))
    .map((item) => item.trim().replace(SORT_SUFFIX, ""))
    .filter((item) => BARE_NAME.test(item) && outputNames.has(item));
}
