import type { NeonQueryFunction } from "@neondatabase/serverless";

type Sql = NeonQueryFunction<false, false>;

/** What every supported server knows; a shorter list is a broken query and must fail, not read as "nothing else". */
export const TABLE_PRIVILEGES_EVERY_SERVER_KNOWS: readonly string[] = [
  "DELETE",
  "INSERT",
  "REFERENCES",
  "SELECT",
  "TRIGGER",
  "TRUNCATE",
  "UPDATE",
];

/**
 * The table privileges this server defines, sorted: the privilege types in the default ACL of a relation
 * (`acldefault('r', …)`, exploded by `aclexplode`; both documented). A newer server adds to it (`MAINTAIN` on 17),
 * so a test that asserts "no other privilege" follows the server and not a literal. Needs no table.
 */
export async function tablePrivilegesTheServerKnows(
  sql: Sql,
): Promise<string[]> {
  const rows = (await sql`
    select distinct (aclexplode(acldefault('r', oid))).privilege_type as privilege
    from pg_roles
    where rolname = current_user
    order by privilege
  `) as { privilege: string }[];
  return rows.map((row) => row.privilege);
}

/** Which of `privileges` the current role effectively holds on `tableName` (schema-qualified), `PUBLIC` included. */
export async function privilegesHeldOn(
  sql: Sql,
  tableName: string,
  privileges: readonly string[],
): Promise<string[]> {
  const rows = (await sql`
    select privilege
    from unnest(${[...privileges]}::text[]) as asked (privilege)
    where has_table_privilege(current_user, ${tableName}, privilege)
    order by privilege
  `) as { privilege: string }[];
  return rows.map((row) => row.privilege);
}
