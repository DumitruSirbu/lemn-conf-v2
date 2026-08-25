import { neon } from "@neondatabase/serverless";
import { describe, expect, it } from "vitest";

import { readDatabaseUrl } from "./read-database-url.js";

/**
 * M2 work item 8: the application connects with a least-privilege role, not the database owner.
 *
 * These assertions run against whatever `DATABASE_URL` actually points at, so they fail if the
 * application is ever repointed at an owner-level connection, or if someone grants the application
 * role more than it needs. That is the point: the privilege separation is a security property, and
 * a property nothing checks is a property that quietly decays.
 *
 * Read-only — nothing here writes, and every statement it attempts is expected to be refused.
 */
const hasLiveDatabase = Boolean(process.env["DATABASE_URL"]);

async function expectRefused(statement: string): Promise<void> {
  const sql = neon(readDatabaseUrl());
  await expect(sql.query(statement)).rejects.toThrow(
    /permission denied|must be owner/i,
  );
}

describe.skipIf(!hasLiveDatabase)("the application's database role", () => {
  it("is not the database owner and inherits no other role", async () => {
    const sql = neon(readDatabaseUrl());

    const memberships = (await sql`
      select r.rolname
      from pg_auth_members m
      join pg_roles r on r.oid = m.roleid
      join pg_roles member on member.oid = m.member
      where member.rolname = current_user
    `) as { rolname: string }[];

    // Roles created through the Neon Console/CLI/API are auto-granted `neon_superuser`; only
    // SQL-created roles avoid it. An inherited role here means the least-privilege role is
    // least-privilege in name only.
    expect(memberships.map((row) => row.rolname)).toEqual([]);
  });

  it("holds no superuser, createdb or createrole attribute", async () => {
    const sql = neon(readDatabaseUrl());

    const [attributes] = (await sql`
      select rolsuper, rolcreatedb, rolcreaterole from pg_roles where rolname = current_user
    `) as { rolsuper: boolean; rolcreatedb: boolean; rolcreaterole: boolean }[];

    expect(attributes).toEqual({
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
    });
  });

  it("holds exactly select, insert and update on designs — no delete", async () => {
    const sql = neon(readDatabaseUrl());

    const grants = (await sql`
      select privilege_type
      from information_schema.role_table_grants
      where grantee = current_user and table_name = 'designs'
      order by privilege_type
    `) as { privilege_type: string }[];

    expect(grants.map((row) => row.privilege_type)).toEqual([
      "INSERT",
      "SELECT",
      "UPDATE",
    ]);
  });

  it("cannot delete a design", async () => {
    await expectRefused("delete from designs where id = 'no-such-design'");
  });

  it("cannot truncate the designs table", async () => {
    await expectRefused("truncate designs");
  });

  it("cannot drop the designs table", async () => {
    await expectRefused("drop table designs");
  });

  it("cannot create a table", async () => {
    await expectRefused("create table privilege_probe (id integer)");
  });

  it("can still read designs, so the restrictions have not broken the application", async () => {
    const sql = neon(readDatabaseUrl());

    const rows = (await sql`select count(*)::int as count from designs`) as {
      count: number;
    }[];

    expect(typeof rows[0]?.count).toBe("number");
  });
});
