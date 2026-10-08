import type { NeonQueryFunction } from "@neondatabase/serverless";

type Sql = NeonQueryFunction<false, false>;

/** What the server says about the connection and the `designs` table, read from the catalog with `select` alone. */
export interface ConnectionFacts {
  readonly databaseName: string;
  readonly roleName: string;
  readonly isSuperuser: boolean;
  readonly memberOf: readonly string[];
  readonly designsExists: boolean;
  readonly isDesignsOwnerOrMemberOfIt: boolean;
  readonly isSchemaOwnerOrMemberOfIt: boolean;
  readonly canCreateInSchema: boolean;
}

interface ConnectionFactsRow {
  database_name: string;
  role_name: string;
  is_superuser: boolean;
  member_of: string[];
  designs_exists: boolean;
  is_designs_owner_or_member: boolean;
  is_schema_owner_or_member: boolean;
  can_create_in_schema: boolean;
}

/** `MEMBER` in `pg_has_role` is membership without regard to inheritance, and a role is a member of itself, so it
 *  covers both the owner and everyone who could act as the owner. */
export async function readConnectionFacts(sql: Sql): Promise<ConnectionFacts> {
  const [row] = (await sql`
    select
      current_database() as database_name,
      current_user::text as role_name,
      me.rolsuper as is_superuser,
      array(
        select granted.rolname
        from pg_auth_members membership
        join pg_roles granted on granted.oid = membership.roleid
        where membership.member = me.oid
        order by granted.rolname
      )::text[] as member_of,
      designs.oid is not null as designs_exists,
      coalesce(pg_has_role(current_user, designs.relowner, 'MEMBER'), false) as is_designs_owner_or_member,
      coalesce(pg_has_role(current_user, public_schema.nspowner, 'MEMBER'), false) as is_schema_owner_or_member,
      has_schema_privilege(current_user, 'public', 'CREATE') as can_create_in_schema
    from pg_roles me
    left join pg_class designs on designs.oid = to_regclass('public.designs')
    left join pg_namespace public_schema on public_schema.nspname = 'public'
    where me.rolname = current_user
  `) as ConnectionFactsRow[];
  if (row === undefined) {
    throw new Error(
      "The server did not describe the role this connection runs as.",
    );
  }
  return {
    databaseName: row.database_name,
    roleName: row.role_name,
    isSuperuser: row.is_superuser,
    memberOf: row.member_of,
    designsExists: row.designs_exists,
    isDesignsOwnerOrMemberOfIt: row.is_designs_owner_or_member,
    isSchemaOwnerOrMemberOfIt: row.is_schema_owner_or_member,
    canCreateInSchema: row.can_create_in_schema,
  };
}

/**
 * Why this connection may not be trusted with the privilege tests, one sentence each; empty when it may. A connection
 * that is a superuser, inherits a role or owns `designs` could do what the tests expect to be refused, and a test that
 * cannot show otherwise must fail, never skip.
 */
export function reasonsTheConnectionIsNotTheApplicationRole(
  facts: ConnectionFacts,
): string[] {
  return [
    facts.isSuperuser ? "it is a superuser" : undefined,
    facts.memberOf.length > 0
      ? `it is a member of ${facts.memberOf.join(", ")}`
      : undefined,
    facts.designsExists
      ? undefined
      : "public.designs was not found, so it cannot be shown that the role does not own it",
    facts.isDesignsOwnerOrMemberOfIt
      ? "it owns public.designs or is a member of the role that does"
      : undefined,
  ].filter((reason): reason is string => reason !== undefined);
}

/** The one line the run says about where it is: the names the server gives, nothing from the connection string. */
export function describeWhereTheRunIs(facts: ConnectionFacts): string {
  return `reached database "${facts.databaseName}" as role "${facts.roleName}"`;
}
