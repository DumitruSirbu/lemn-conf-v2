import { randomBytes } from "node:crypto";

import { CURRENT_SCHEMA_VERSION } from "@lemnaria/configurator-domain";
import { neon } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import { afterAll, describe, expect, it } from "vitest";

import {
  NeonStaffKitchenActionsStore,
  addNoteStatement,
  saveStatusStatement,
  unhideStatement,
} from "../src/neon-staff-kitchen-actions-store.js";
import { staffAuditInsertStatement } from "../src/neon-staff-audit-store.js";
import { prepareStaffAuditRecord } from "../src/staff-audit-store.js";
import type { PreparedStaffAuditRecord } from "../src/staff-audit-store.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { rejectionOf } from "./support/rejection-of.js";
import { describeStaffKitchenActionsStoreContract } from "./support/staff-kitchen-actions-store-contract.js";
import type {
  ActionsWorld,
  ClientAccount,
  StaffMember,
} from "./support/staff-kitchen-actions-store-contract.js";
import { holdSharedTestSchemaLock } from "./support/test-schema-lock.js";

// Shared: this file writes rows under ids only it makes and needs the schema intact while it does.
holdSharedTestSchemaLock();

const SUITE_NAME = "NeonStaffKitchenActionsStore (live test database)";

if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

/**
 * `NeonStaffKitchenActionsStore` against the test database, with the contract the fake also passes. The store runs over
 * the test database's **owner** credential, which holds every privilege; what this file proves is what the statements
 * do with rows, and not what the application role is granted (the privilege test reads that from the catalog).
 *
 * A Neon HTTP statement commits, so nothing here can be rolled back by the file. Every row names an account, a kitchen
 * or a note that this file minted at random, and `afterAll` deletes by those ids only, on the test database alone
 * (ADR 0151). The audit rows are found by their actor, who is always one of those accounts.
 */
const PASSWORD_HASH = `$argon2id$v=19$m=19456,t=2,p=1$${"A".repeat(22)}$${"B".repeat(43)}`;
const IDLE_LIFETIMES = {
  client: 2_592_000,
  operator: 43_200,
  administrator: 43_200,
};
const UPDATED_AT = "2026-10-01T09:00:00.000Z";
const SENT_AT = "2026-10-02T09:00:00.000Z";
const DIVISION_BY_ZERO = "22012";
const INTEGER_OUT_OF_RANGE = "22003";
const LOGARITHM_OF_ZERO = "2201E";
const ZERO_TO_A_NEGATIVE_POWER = "2201F";

describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  /** The test database's owner credential, opened per use: a skipped describe still runs this body. */
  const sql = () => neon(liveTestDatabaseUrl);
  const store = () => new NeonStaffKitchenActionsStore(liveTestDatabaseUrl);
  const accountIds: string[] = [];
  const designIds: string[] = [];

  afterAll(async () => {
    if (!isLiveTestDatabaseConfigured) return;
    await sql()`delete from staff_audit_events where actor_account_id = any(${accountIds}) or design_id = any(${designIds})`;
    await sql()`delete from design_notes where design_id = any(${designIds})`;
    await sql()`delete from design_request_states where design_id = any(${designIds})`;
    await sql()`delete from designs where id = any(${designIds})`;
    await sql()`delete from account_sessions where account_id = any(${accountIds})`;
    await sql()`delete from accounts where id = any(${accountIds})`;
  });

  async function insertAccount(
    role: "client" | "operator",
  ): Promise<{ accountId: string; email: string }> {
    const accountId = nanoid();
    const email = `actions-live-${accountId.toLowerCase()}@example.invalid`;
    accountIds.push(accountId);
    await sql()`
      insert into accounts (id, email, email_normal_form, password_hash, role, locale, privacy_notice_version)
      values (${accountId}, ${email}, ${email}, ${PASSWORD_HASH}, ${role}, 'ro', '1')
    `;
    return { accountId, email };
  }

  async function signIn(): Promise<StaffMember> {
    const { accountId, email } = await insertAccount("operator");
    const sessionTokenHash = randomBytes(32).toString("hex");
    await sql()`
      insert into account_sessions (token_hash, account_id, absolute_expires_at)
      values (${sessionTokenHash}, ${accountId}, now() + interval '30 days')
    `;
    return {
      accountId,
      email,
      session: { sessionTokenHash, idleLifetimeSeconds: IDLE_LIFETIMES },
    };
  }

  async function insertKitchen(spec: {
    readonly client: ClientAccount | null;
    readonly isSent?: boolean;
    readonly isHidden?: boolean;
    readonly isDeletedByClient?: boolean;
  }): Promise<string> {
    const designId = nanoid();
    designIds.push(designId);
    await sql()`
      insert into designs (id, schema_version, document, account_id, sent_at, updated_at, hidden_by_client_at,
        deleted_by_client_at)
      values (${designId}, ${CURRENT_SCHEMA_VERSION}, '{}'::jsonb, ${spec.client?.accountId ?? null},
        case when ${spec.isSent ?? false}::boolean then ${SENT_AT}::timestamptz end, ${UPDATED_AT}::timestamptz,
        case when ${spec.isHidden ?? false}::boolean then now() end,
        case when ${spec.isDeletedByClient ?? false}::boolean then now() end)
    `;
    return designId;
  }

  function newWorld(): Promise<ActionsWorld> {
    return Promise.resolve({
      store: store(),
      aStaffMember: signIn,
      async aStaffMemberWhoseSessionIsRevoked() {
        const member = await signIn();
        await sql()`update account_sessions set revoked_at = now() where token_hash = ${member.session.sessionTokenHash}`;
        return member;
      },
      async aClient(): Promise<ClientAccount> {
        return insertAccount("client");
      },
      aKitchen: insertKitchen,
      async aStoredStatus({ designId, status, changedBy }) {
        await sql()`
          insert into design_request_states (design_id, status, changed_by_account_id)
          values (${designId}, ${status}, ${changedBy.accountId})
        `;
      },
      async notesOf(designId) {
        const rows = await sql()`
          select id, author_account_id, body from design_notes where design_id = ${designId}
          order by created_at desc, id desc
        `;
        return rows.map((row) => ({
          id: row["id"] as string,
          authorAccountId: row["author_account_id"] as string,
          text: row["body"] as string,
        }));
      },
      async statusRowOf(designId) {
        const rows = await sql()`
          select status, changed_by_account_id,
            floor(extract(epoch from changed_at) * 1000)::bigint::text as changed_ms
          from design_request_states where design_id = ${designId}
        `;
        const [row] = rows;
        return row === undefined
          ? null
          : {
              status: row["status"] as string,
              changedByAccountId: row["changed_by_account_id"] as string,
              changedAtMs: Number(row["changed_ms"]),
            };
      },
      async isHidden(designId) {
        const rows =
          await sql()`select (hidden_by_client_at is not null) as is_hidden from designs where id = ${designId}`;
        return rows[0]?.["is_hidden"] === true;
      },
      async updatedAtMsOf(designId) {
        const rows = await sql()`
          select floor(extract(epoch from updated_at) * 1000)::bigint::text as updated_ms from designs where id = ${designId}
        `;
        return Number(rows[0]?.["updated_ms"]);
      },
      async auditEventsOf(actorAccountId) {
        const rows = await sql()`
          select action, design_id, (detail is null) as is_detail_sql_null, detail
          from staff_audit_events where actor_account_id = ${actorAccountId} order by occurred_at, id
        `;
        return rows.map((row) => ({
          action: row["action"] as string,
          designId: row["design_id"] as string | null,
          isDetailSqlNull: row["is_detail_sql_null"] as boolean,
          detail: row["detail"] as unknown,
        }));
      },
    });
  }

  describeStaffKitchenActionsStoreContract(
    "NeonStaffKitchenActionsStore",
    newWorld,
  );

  describe("what only the database can show", () => {
    function preparedSessionOf(
      member: StaffMember,
      designId: string,
    ): PreparedStaffAuditRecord {
      return prepareStaffAuditRecord({
        sessionTokenHash: member.session.sessionTokenHash,
        idleLifetimeSeconds: member.session.idleLifetimeSeconds,
        entry: { action: "note-added", detail: null },
        designId,
        subjectAccountId: null,
      });
    }

    async function sqlstateOf(pending: PromiseLike<unknown>): Promise<unknown> {
      const failure = await rejectionOf(pending);
      return (failure as { code?: unknown }).code;
    }

    it("stamps a note with the database's clock and a status with the literal now()", async () => {
      const world = await newWorld();
      const staff = await signIn();
      const designId = await world.aKitchen({
        client: await world.aClient(),
        isSent: true,
      });

      await world.store.addNote({
        session: staff.session,
        designId,
        text: "n",
      });
      await world.store.setStatus({
        session: staff.session,
        designId,
        status: "contacted",
      });

      const rows = await sql()`
        select
          (select created_at between now() - interval '2 minutes' and now() from design_notes where design_id = ${designId}) as is_note_just_now,
          (select changed_at between now() - interval '2 minutes' and now() from design_request_states where design_id = ${designId}) as is_status_just_now
      `;
      expect(rows).toEqual([
        { is_note_just_now: true, is_status_just_now: true },
      ]);
    });

    it("restamps the status row on a later change, with the database's clock", async () => {
      const world = await newWorld();
      const staff = await signIn();
      const designId = await world.aKitchen({
        client: await world.aClient(),
        isSent: true,
      });
      await world.aStoredStatus({
        designId,
        status: "new",
        changedBy: staff,
      });
      await sql()`update design_request_states set changed_at = '2000-01-01T00:00:00Z' where design_id = ${designId}`;

      await world.store.setStatus({
        session: staff.session,
        designId,
        status: "closed",
      });

      const rows = await sql()`
        select changed_at > now() - interval '2 minutes' as is_just_now from design_request_states where design_id = ${designId}
      `;
      expect(rows).toEqual([{ is_just_now: true }]);
    });

    it.each([
      ["infinity", 8.64e15],
      ["-infinity", -8.64e15],
      ["1900-01-01T00:00:00Z", Date.UTC(1900, 0, 1)],
    ])(
      "reads a status stamped %s, which a script around the store could write, as an instant and does not fail",
      async (stamp, expectedMs) => {
        const world = await newWorld();
        const staff = await signIn();
        const designId = await world.aKitchen({
          client: await world.aClient(),
          isSent: true,
        });
        await world.aStoredStatus({
          designId,
          status: "closed",
          changedBy: staff,
        });
        await sql()`update design_request_states set changed_at = ${stamp}::timestamptz where design_id = ${designId}`;

        const result = await world.store.setStatus({
          session: staff.session,
          designId,
          status: "closed",
        });

        expect(result).toMatchObject({
          kind: "unchanged",
          current: { at: new Date(expectedMs) },
        });
      },
    );

    it("rolls the caller's write back when the audit statement raises, so a note never outlives its audit row", async () => {
      const world = await newWorld();
      const staff = await signIn();
      const gone = await signIn();
      await sql()`update account_sessions set revoked_at = now() where token_hash = ${gone.session.sessionTokenHash}`;
      const designId = await world.aKitchen({
        client: await world.aClient(),
        isSent: true,
      });
      const connection = sql();

      const code = await sqlstateOf(
        connection.transaction([
          addNoteStatement(connection, {
            noteId: nanoid(),
            designId,
            text: "orphan",
            session: preparedSessionOf(staff, designId),
          }),
          staffAuditInsertStatement(
            connection,
            preparedSessionOf(gone, designId),
          ),
        ]),
      );

      expect(code).toBe(DIVISION_BY_ZERO);
      expect(await world.notesOf(designId)).toEqual([]);
    });

    it("raises the dedicated SQLSTATE of each reason a write changes nothing, and none on the call that changes something", async () => {
      const world = await newWorld();
      const staff = await signIn();
      const client = await world.aClient();
      const hidden = await world.aKitchen({
        client,
        isSent: true,
        isHidden: true,
      });
      const connection = sql();

      const first = await connection.transaction([
        unhideStatement(connection, hidden),
      ]);
      const second = await sqlstateOf(
        connection.transaction([unhideStatement(connection, hidden)]),
      );
      const unknown = await sqlstateOf(
        connection.transaction([unhideStatement(connection, nanoid())]),
      );
      const draft = await world.aKitchen({ client, isSent: false });
      const unsent = await sqlstateOf(
        connection.transaction([
          saveStatusStatement(connection, {
            designId: draft,
            status: "contacted",
            expectedStored: null,
            session: preparedSessionOf(staff, draft),
          }),
        ]),
      );
      const sent = await world.aKitchen({ client, isSent: true });
      await world.aStoredStatus({
        designId: sent,
        status: "closed",
        changedBy: staff,
      });
      const moved = await sqlstateOf(
        connection.transaction([
          saveStatusStatement(connection, {
            designId: sent,
            status: "contacted",
            expectedStored: "new",
            session: preparedSessionOf(staff, sent),
          }),
        ]),
      );
      const insertMoved = await sqlstateOf(
        connection.transaction([
          saveStatusStatement(connection, {
            designId: sent,
            status: "contacted",
            expectedStored: null,
            session: preparedSessionOf(staff, sent),
          }),
        ]),
      );

      expect(first).toHaveLength(1);
      expect([second, unknown, unsent, moved, insertMoved]).toEqual([
        LOGARITHM_OF_ZERO,
        INTEGER_OUT_OF_RANGE,
        LOGARITHM_OF_ZERO,
        ZERO_TO_A_NEGATIVE_POWER,
        ZERO_TO_A_NEGATIVE_POWER,
      ]);
      expect(await world.statusRowOf(sent)).toMatchObject({ status: "closed" });
    });

    it("leaves a status the caller did not read alone: a row that appeared meanwhile is not overwritten", async () => {
      const world = await newWorld();
      const staff = await signIn();
      const designId = await world.aKitchen({
        client: await world.aClient(),
        isSent: true,
      });
      await world.aStoredStatus({
        designId,
        status: "contacted",
        changedBy: staff,
      });

      const code = await sqlstateOf(
        sql().transaction([
          saveStatusStatement(sql(), {
            designId,
            status: "closed",
            expectedStored: null,
            session: preparedSessionOf(staff, designId),
          }),
        ]),
      );

      expect(code).toBe(ZERO_TO_A_NEGATIVE_POWER);
      expect(await world.statusRowOf(designId)).toMatchObject({
        status: "contacted",
      });
    });
  });
});
