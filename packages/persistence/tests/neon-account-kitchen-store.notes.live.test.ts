import { randomBytes } from "node:crypto";

import {
  CURRENT_SCHEMA_VERSION,
  KITCHEN_L_DESIGN,
} from "@lemnaria/configurator-domain";
import type { DesignId } from "@lemnaria/configurator-domain";
import { neon } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import { afterAll, describe } from "vitest";

import { NeonAccountKitchenStore } from "../src/neon-account-kitchen-store.js";
import {
  describeAccountKitchenNotesContract,
  type NotesWorld,
  type StaffWriter,
} from "./support/account-kitchen-export-notes-contract.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { holdSharedTestSchemaLock } from "./support/test-schema-lock.js";

// Shared: this file writes rows under ids only it makes and needs the schema intact while it does.
holdSharedTestSchemaLock();

const SUITE_NAME = "NeonAccountKitchenStore.exportNotes (live test database)";

if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

/**
 * `NeonAccountKitchenStore.exportNotes` against the test database, with the contract the fake also passes. The store
 * runs over the test database's **owner** credential, which holds every privilege, so this file shows what the
 * statement does with rows and not what the application role may select (the statements file pins the columns, the
 * privilege test reads the grants from the catalog).
 *
 * A Neon HTTP statement commits, so nothing here can be rolled back. Every row names an account, kitchen or note id
 * this file minted at random, and `afterAll` deletes by those ids only, on the test database alone (ADR 0151). The
 * database is shared, so no assertion reads a whole-table figure: every answer is scoped by an account this file made.
 */
const PASSWORD_HASH = `$argon2id$v=19$m=19456,t=2,p=1$${"A".repeat(22)}$${"B".repeat(43)}`;
const PROPERTY_RUNS = 6;
const MARKER_LENGTH = 12;

describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  /** The test database's owner credential, opened per use: a skipped describe still runs this body. */
  const sql = () => neon(liveTestDatabaseUrl);
  const accountIds: string[] = [];
  const designIds: string[] = [];

  afterAll(async () => {
    if (!isLiveTestDatabaseConfigured) return;
    await sql()`delete from design_notes where design_id = any(${designIds})`;
    await sql()`delete from designs where id = any(${designIds})`;
    await sql()`delete from accounts where id = any(${accountIds})`;
  });

  async function insertAccount(
    role: "client" | "operator",
    name: string | null,
  ): Promise<{ accountId: string; email: string }> {
    const accountId = nanoid();
    const marker = randomBytes(MARKER_LENGTH).toString("hex");
    const email = `Notes.${marker}@Example.INVALID`;
    accountIds.push(accountId);
    await sql()`
      insert into accounts (id, email, email_normal_form, password_hash, role, locale, privacy_notice_version, name)
      values (${accountId}, ${email}, ${email.toLowerCase()}, ${PASSWORD_HASH}, ${role}, 'ro', '1', ${name})
    `;
    return { accountId, email };
  }

  function newWorld(): Promise<NotesWorld> {
    return Promise.resolve({
      store: new NeonAccountKitchenStore(liveTestDatabaseUrl),
      async aClient(): Promise<string> {
        return (await insertAccount("client", "Client Name")).accountId;
      },
      async aStaffWriter(): Promise<StaffWriter> {
        const name = `Staff Name ${randomBytes(MARKER_LENGTH).toString("hex")}`;
        const { accountId, email } = await insertAccount("operator", name);
        return { accountId, email, name };
      },
      async aKitchen(spec): Promise<DesignId> {
        const id = nanoid();
        designIds.push(id);
        await sql()`
          insert into designs (id, schema_version, document, account_id, hidden_by_client_at, deleted_by_client_at)
          values (${id}, ${CURRENT_SCHEMA_VERSION}, ${JSON.stringify(KITCHEN_L_DESIGN)}::jsonb, ${spec.accountId},
            case when ${spec.isHidden ?? false}::boolean then now() end,
            case when ${spec.isDeletedByClient ?? false}::boolean then now() end)
        `;
        return id;
      },
      async aNote(spec): Promise<string> {
        const id = spec.id ?? nanoid();
        await sql()`
          insert into design_notes (id, design_id, author_account_id, body, created_at)
          values (${id}, ${spec.designId}, ${spec.author.accountId}, ${spec.text},
            ${spec.createdAt.toISOString()}::timestamptz)
        `;
        return id;
      },
      async someNotes(spec): Promise<void> {
        await sql()`
          insert into design_notes (id, design_id, author_account_id, body, created_at)
          select substr(md5(random()::text || n::text), 1, 21), ${spec.designId}, ${spec.author.accountId},
            'note ' || n::text, ${spec.firstAt.toISOString()}::timestamptz + n * interval '1 minute'
          from generate_series(0, ${spec.count - 1}::int) as n
        `;
      },
    });
  }

  describeAccountKitchenNotesContract("NeonAccountKitchenStore", newWorld, {
    propertyRuns: PROPERTY_RUNS,
  });
});
