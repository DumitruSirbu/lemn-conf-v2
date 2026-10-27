import { randomBytes } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { nanoid } from "nanoid";

import type {
  DashboardStaffMember,
  DashboardStaffWorld,
  StoredDashboardAuditEvent,
} from "./dashboard-contract-support.js";

const PASSWORD_HASH = `$argon2id$v=19$m=19456,t=2,p=1$${"A".repeat(22)}$${"B".repeat(43)}`;
const IDLE_LIFETIMES = {
  client: 2_592_000,
  operator: 43_200,
  administrator: 43_200,
};

/**
 * What the dashboard contracts need around a store on the live test database: staff the world has signed in, the audit
 * rows their actions left, and a revision `steps` after another, asked of the database so no test does arithmetic on a
 * revision.
 *
 * It runs over the test database's **owner** credential, which holds every privilege; what the contracts prove is what the
 * statements do with rows, and not what the application role is granted (the privilege test reads that from the
 * catalog). Every account and session names an id this world minted at random, and `removeTheRowsItMinted` deletes by those
 * ids alone (ADR 0151). The versions, the log and the draft it cannot remove: they are append-only by design, and the
 * plan records that the contracts leave them (plan S2, recorded choice b).
 *
 * No connection is opened until a method is called, because a skipped suite's `describe` body still runs.
 */
export interface NeonDashboardStaffWorld {
  readonly world: DashboardStaffWorld;
  /** The test database's owner connection, for the assertions that read a table around the store. */
  readonly sql: () => NeonQueryFunction<false, false>;
  removeTheRowsItMinted(): Promise<void>;
}

export function createNeonDashboardStaffWorld(
  connectionUrl: string,
): NeonDashboardStaffWorld {
  const accountIds: string[] = [];
  const sql = () => neon(connectionUrl);

  async function signedIn(
    role: "administrator" | "operator" | "client" = "administrator",
  ): Promise<DashboardStaffMember> {
    const accountId = nanoid();
    accountIds.push(accountId);
    const email = `dashboard-live-${accountId.toLowerCase()}@example.invalid`;
    await sql()`
      insert into accounts (id, email, email_normal_form, password_hash, role, locale, privacy_notice_version)
      values (${accountId}, ${email}, ${email}, ${PASSWORD_HASH}, ${role}, 'ro', '1')
    `;
    const sessionTokenHash = randomBytes(32).toString("hex");
    await sql()`
      insert into account_sessions (token_hash, account_id, absolute_expires_at)
      values (${sessionTokenHash}, ${accountId}, now() + interval '30 days')
    `;
    return {
      accountId,
      session: { sessionTokenHash, idleLifetimeSeconds: IDLE_LIFETIMES },
    };
  }

  const world: DashboardStaffWorld = {
    aStaffMember: () => signedIn(),
    aStaffMemberWhoIsNotAnAdministrator: () => signedIn("operator"),
    aClientWithALiveSession: () => signedIn("client"),
    async aStaffMemberWhoseSessionIsRevoked() {
      const member = await signedIn();
      await sql()`update account_sessions set revoked_at = now() where token_hash = ${member.session.sessionTokenHash}`;
      return member;
    },
    async auditEventsOf(
      accountId,
    ): Promise<readonly StoredDashboardAuditEvent[]> {
      const rows = await sql()`
        select action, design_id, detail from staff_audit_events
        where actor_account_id = ${accountId} order by occurred_at, id
      `;
      return rows.map((row) => ({
        action: row["action"] as string,
        designId: (row["design_id"] as string | null) ?? undefined,
        detail: row["detail"] as unknown,
      }));
    },
    async aRevisionAfter(revision, steps) {
      const rows = await sql()`
        select (${revision}::bigint + ${steps}::int)::text as revision
      `;
      return rows[0]?.["revision"] as string;
    },
  };

  return {
    world,
    sql,
    async removeTheRowsItMinted() {
      if (accountIds.length === 0) return;
      await sql()`delete from staff_audit_events where actor_account_id = any(${accountIds})`;
      await sql()`delete from account_sessions where account_id = any(${accountIds})`;
      await sql()`delete from accounts where id = any(${accountIds})`;
    },
  };
}
