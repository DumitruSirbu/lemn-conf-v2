import type { NeonQueryFunction } from "@neondatabase/serverless";

type Sql = NeonQueryFunction<false, false>;

/** The columns the catalog lists for `tableName` (schema-qualified), dropped ones excluded, sorted. */
export async function columnsOf(
  sql: Sql,
  tableName: string,
): Promise<string[]> {
  const rows = (await sql`
    select attname::text as column_name
    from pg_attribute
    where attrelid = ${tableName}::regclass and attnum > 0 and not attisdropped
    order by attname
  `) as { column_name: string }[];
  return rows.map((row) => row.column_name);
}

/**
 * The columns of `tableName` on which the current role effectively holds `privilege`: through a grant on the column,
 * on the whole table, to `PUBLIC` or to an inherited role. The server decides, so no grant is missed because of how it
 * was given. Sorted.
 */
export async function columnsHolding(
  sql: Sql,
  tableName: string,
  privilege: string,
): Promise<string[]> {
  const rows = (await sql`
    select attname::text as column_name
    from pg_attribute
    where attrelid = ${tableName}::regclass and attnum > 0 and not attisdropped
      and has_column_privilege(current_user, attrelid, attnum, ${privilege})
    order by attname
  `) as { column_name: string }[];
  return rows.map((row) => row.column_name);
}
