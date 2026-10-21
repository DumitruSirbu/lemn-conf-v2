import { randomBytes } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import { afterAll, describe, expect, it } from "vitest";

import {
  NeonStaffAuditStore,
  requireOneAuditRowInserted,
  staffAuditInsertStatement,
  staffAuditStoreErrorFrom,
} from "../src/neon-staff-audit-store.js";
import { prepareStaffAuditRecord } from "../src/staff-audit-store.js";
import type { StaffAuditRecord } from "../src/staff-audit-store.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { rejectionOf } from "./support/rejection-of.js";
import { describeStaffAuditStoreContract } from "./support/staff-audit-store-contract.js";
import type {
  AuditWorld,
  ClientAccount,
  Kitchen,
  StaffMember,
} from "./support/staff-audit-store-contract.js";
import { holdSharedTestSchemaLock } from "./support/test-schema-lock.js";

// Shared: this file writes rows under ids only it makes and needs the schema intact while it does.
holdSharedTestSchemaLock();

const SUITE_NAME = "NeonStaffAuditStore (live test database)";

if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

/**
 * `NeonStaffAuditStore` against the test database, with the contract the fake also passes. The store runs over the test
 * database's **owner** credential, which holds every privilege; what this file proves is what the statements do with
 * rows, and not what the application role is granted (the privilege test reads that from the catalog).
 *
 * A Neon HTTP statement commits, so nothing here can be rolled back. Every row this file writes names an account, a
 * kitchen or an event id that this file minted at random, and `afterAll` deletes by those ids only, on the test
 * database alone (ADR 0151). The store's own rows are found by their actor, who is always one of those accounts.
 */
const PASSWORD_HASH = `$argon2id$v=19$m=19456,t=2,p=1$${"A".repeat(22)}$${"B".repeat(43)}`;
const IDLE_LIFETIMES = {
  client: 2_592_000,
  operator: 43_200,
  administrator: 43_200,
};
const OPERATOR_IDLE_SECONDS = 43_200;
const ADDRESS_MARKER = "Strada Secreta 17, ap. 4 (audit live marker)";
const PHONE_MARKER = "+37360999888";
const DIVISION_BY_ZERO = "22012";

describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  /** The test database's owner credential, opened per use: a skipped describe still runs this body. */
  const sql = () => neon(liveTestDatabaseUrl);
  const store = () => new NeonStaffAuditStore(liveTestDatabaseUrl);
  const accountIds: string[] = [];
  const designIds: string[] = [];
  const eventIds: string[] = [];

  afterAll(async () => {
    if (!isLiveTestDatabaseConfigured) return;
    await sql()`delete from staff_audit_events where actor_account_id = any(${accountIds}) or id = any(${eventIds})`;
    await sql()`delete from designs where id = any(${designIds})`;
    await sql()`delete from accounts where id = any(${accountIds})`;
  });

  async function insertAccount(spec: {
    readonly role: "client" | "operator";
    readonly name: string | null;
  }): Promise<{ accountId: string; email: string }> {
    const accountId = nanoid();
    const email = `audit-live-${accountId.toLowerCase()}@example.invalid`;
    accountIds.push(accountId);
    await sql()`
      insert into accounts (id, email, email_normal_form, password_hash, role, locale, privacy_notice_version,
        phone, phone_normal_form, address, name)
      values (${accountId}, ${email}, ${email}, ${PASSWORD_HASH}, ${spec.role}, 'ro', '1',
        ${PHONE_MARKER}, ${PHONE_MARKER}, ${ADDRESS_MARKER}, ${spec.name})
    `;
    return { accountId, email };
  }

  async function signIn(): Promise<StaffMember> {
    const { accountId, email } = await insertAccount({
      role: "operator",
      name: "Staff Name",
    });
    const sessionTokenHash = randomBytes(32).toString("hex");
    await sql()`
      insert into account_sessions (token_hash, account_id, absolute_expires_at)
      values (${sessionTokenHash}, ${accountId}, now() + interval '30 days')
    `;
    return {
      accountId,
      email,
      name: "Staff Name",
      sessionTokenHash,
      idleLifetimeSeconds: IDLE_LIFETIMES,
    };
  }

  function newWorld(): Promise<AuditWorld> {
    return Promise.resolve({
      store: store(),
      aStaffMember: signIn,
      async aStaffMemberWhoseSessionIsRevoked() {
        const member = await signIn();
        await sql()`update account_sessions set revoked_at = now() where token_hash = ${member.sessionTokenHash}`;
        return member;
      },
      async aClient(): Promise<ClientAccount> {
        return insertAccount({ role: "client", name: null });
      },
      async aKitchen({
        client,
        name,
        isDeletedByClient = false,
      }): Promise<Kitchen> {
        const designId = nanoid();
        designIds.push(designId);
        await sql()`
          insert into designs (id, schema_version, document, account_id, name, deleted_by_client_at)
          values (${designId}, 1, '{}'::jsonb, ${client?.accountId ?? null}, ${name},
            case when ${isDeletedByClient}::boolean then now() end)
        `;
        return { designId, name, client };
      },
      async plantEvent(event) {
        const id = event.id ?? nanoid();
        eventIds.push(id);
        await sql()`
          insert into staff_audit_events (id, occurred_at, actor_account_id, action, design_id, subject_account_id, detail)
          values (${id}, ${event.occurredAt.toISOString()}::timestamptz, ${event.actorAccountId}, ${event.action},
            ${event.designId ?? null}, ${event.subjectAccountId ?? null},
            ${event.detail === null || event.detail === undefined ? null : JSON.stringify(event.detail)}::jsonb)
        `;
        return id;
      },
      async storedEventsOf(actorAccountId) {
        const rows = await sql()`
          select id, actor_account_id, action, design_id, subject_account_id,
            (detail is null) as is_detail_sql_null, detail
          from staff_audit_events where actor_account_id = ${actorAccountId} order by id
        `;
        return rows.map((row) => ({
          id: row["id"] as string,
          actorAccountId: row["actor_account_id"] as string,
          action: row["action"] as string,
          designId: row["design_id"] as string | null,
          subjectAccountId: row["subject_account_id"] as string | null,
          isDetailSqlNull: row["is_detail_sql_null"] as boolean,
          detail: row["detail"] as unknown,
        }));
      },
      async removeAccount(accountId) {
        await sql()`delete from accounts where id = ${accountId}`;
      },
    });
  }

  describeStaffAuditStoreContract("NeonStaffAuditStore", newWorld);

  describe("what only the database can show", () => {
    function recordFor(
      member: StaffMember,
      designId = nanoid(),
    ): StaffAuditRecord {
      return {
        sessionTokenHash: member.sessionTokenHash,
        idleLifetimeSeconds: member.idleLifetimeSeconds,
        entry: { action: "kitchen-opened", detail: null },
        designId,
        subjectAccountId: null,
      };
    }

    it("stamps occurred_at with the database's clock, which the insert never names", async () => {
      const member = await signIn();
      await store().record(recordFor(member));

      const rows = await sql()`
        select (occurred_at between now() - interval '2 minutes' and now()) as is_just_now
        from staff_audit_events where actor_account_id = ${member.accountId}
      `;

      expect(rows).toEqual([{ is_just_now: true }]);
    });

    it("stores the status change's detail as a JSON object of its two codes", async () => {
      const member = await signIn();
      await store().record({
        ...recordFor(member),
        entry: {
          action: "status-changed",
          detail: { from: "new", to: "offer-sent" },
        },
      });

      const rows = await sql()`
        select jsonb_typeof(detail) as kind, detail ->> 'from' as from_code, detail ->> 'to' as to_code,
          (select array_agg(key order by key) from jsonb_object_keys(detail) as key) as keys
        from staff_audit_events where actor_account_id = ${member.accountId}
      `;

      expect(rows).toEqual([
        {
          kind: "object",
          from_code: "new",
          to_code: "offer-sent",
          keys: ["from", "to"],
        },
      ]);
    });

    describe("a session that is not live by one of the four conditions writes no row", () => {
      const NOT_LIVE: readonly (readonly [
        string,
        (tokenHash: string, accountId: string) => Promise<unknown>,
      ])[] = [
        [
          "its absolute expiry has passed",
          (tokenHash) =>
            sql()`update account_sessions set absolute_expires_at = now() - interval '1 second' where token_hash = ${tokenHash}`,
        ],
        [
          "it was last seen longer ago than the operator's idle lifetime",
          (tokenHash) =>
            sql()`update account_sessions set last_seen_at = now() - ${OPERATOR_IDLE_SECONDS + 60} * interval '1 second' where token_hash = ${tokenHash}`,
        ],
        [
          "the account changed its password after the session was created",
          (_tokenHash, accountId) =>
            sql()`update accounts set password_changed_at = now() + interval '1 minute' where id = ${accountId}`,
        ],
      ];

      it.each(NOT_LIVE)("when %s", async (_label, spoil) => {
        const member = await signIn();
        await spoil(member.sessionTokenHash, member.accountId);

        const failure = await rejectionOf(store().record(recordFor(member)));

        expect(failure).toMatchObject({ failure: "not-recorded" });
        const rows =
          await sql()`select id from staff_audit_events where actor_account_id = ${member.accountId}`;
        expect(rows).toHaveLength(0);
      });

      it("while a session just inside its idle lifetime still writes", async () => {
        const member = await signIn();
        await sql()`update account_sessions set last_seen_at = now() - ${OPERATOR_IDLE_SECONDS - 60} * interval '1 second' where token_hash = ${member.sessionTokenHash}`;

        await store().record(recordFor(member));

        const rows =
          await sql()`select id from staff_audit_events where actor_account_id = ${member.accountId}`;
        expect(rows).toHaveLength(1);
      });
    });

    describe("inside a caller's batch", () => {
      it("rolls the caller's write back when the session is not live, with the statement's own SQLSTATE", async () => {
        const member = await signIn();
        const { statements, siblingId } = batchOf(member, "0".repeat(64));

        const failure = await rejectionOf(sql().transaction(statements));

        expect((failure as { code?: string }).code).toBe(DIVISION_BY_ZERO);
        expect(
          staffAuditStoreErrorFrom("record a staff audit event", failure)
            .failure,
        ).toBe("not-recorded");
        const rows =
          await sql()`select id from staff_audit_events where id = ${siblingId}`;
        expect(rows).toHaveLength(0);
      });

      it("commits the caller's write and exactly one audit row together when the session is live", async () => {
        const member = await signIn();
        const { statements, siblingId } = batchOf(
          member,
          member.sessionTokenHash,
        );

        const results = await sql().transaction(statements);

        requireOneAuditRowInserted(results[1]);
        const rows =
          await sql()`select id from staff_audit_events where id = ${siblingId}`;
        expect(rows).toHaveLength(1);
        const audit = await sql()`
          select action from staff_audit_events where actor_account_id = ${member.accountId} and id <> ${siblingId}
        `;
        expect(audit).toEqual([{ action: "kitchen-opened" }]);
      });

      /** A caller's write (a plain event row stands in for a note) followed by the audit statement, in one batch. */
      function batchOf(member: StaffMember, sessionTokenHash: string) {
        const siblingId = nanoid();
        eventIds.push(siblingId);
        const connection = sql();
        const prepared = prepareStaffAuditRecord({
          ...recordFor(member),
          sessionTokenHash,
        });
        return {
          siblingId,
          statements: [
            connection`
              insert into staff_audit_events (id, actor_account_id, action, design_id)
              values (${siblingId}, ${member.accountId}, 'note-added', ${nanoid()})
            `,
            staffAuditInsertStatement(connection, prepared),
          ],
        };
      }
    });

    describe("a row stamped infinity or -infinity (a script around the store could write one)", () => {
      it("is listed, as the latest or earliest instant a Date holds, and the page does not fail", async () => {
        const member = await signIn();
        const plantedAt = async (stamp: string) => {
          const id = nanoid();
          eventIds.push(id);
          await sql()`
            insert into staff_audit_events (id, occurred_at, actor_account_id, action)
            values (${id}, ${stamp}::timestamptz, ${member.accountId}, 'kitchen-opened')
          `;
          return id;
        };
        const latest = await plantedAt("infinity");
        const earliest = await plantedAt("-infinity");

        const page = await store().page({
          actorAccountId: member.accountId,
          action: null,
          occurredFrom: null,
          occurredBefore: null,
          page: 1,
        });

        expect(page.total).toBe(2);
        expect(
          page.events.map(({ id, occurredAt }) => [id, occurredAt.getTime()]),
        ).toEqual([
          [latest, 8.64e15],
          [earliest, -8.64e15],
        ]);
      });
    });

    describe("the page does not carry what the client keeps private", () => {
      it("reads neither the client's postal address nor phone", async () => {
        const world = await newWorld();
        const actor = await world.aStaffMember();
        const client = await world.aClient();
        const kitchen = await world.aKitchen({ client, name: "Casa" });
        await world.plantEvent({
          occurredAt: new Date(),
          actorAccountId: actor.accountId,
          action: "kitchen-opened",
          designId: kitchen.designId,
          subjectAccountId: client.accountId,
        });

        const page = await store().page({
          actorAccountId: actor.accountId,
          action: null,
          occurredFrom: null,
          occurredBefore: null,
          page: 1,
        });

        const text = JSON.stringify(page);
        expect(text).toContain(client.email);
        expect(text).not.toContain(ADDRESS_MARKER);
        expect(text).not.toContain(PHONE_MARKER);
      });
    });
  });
});
