import { randomBytes } from "node:crypto";

import { CURRENT_SCHEMA_VERSION } from "@lemnaria/configurator-domain";
import { neon } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import { afterAll, describe, expect, it } from "vitest";

import { NeonStaffKitchenReader } from "../src/neon-staff-kitchen-reader.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import {
  describeStaffKitchenReaderContract,
  CURRENT_DESIGN,
} from "./support/staff-kitchen-reader-contract.js";
import type {
  ClientAccount,
  KitchenWorld,
  StaffAccount,
} from "./support/staff-kitchen-reader-contract.js";
import { holdSharedTestSchemaLock } from "./support/test-schema-lock.js";

// Shared: this file writes rows under ids only it makes and needs the schema intact while it does.
holdSharedTestSchemaLock();

const SUITE_NAME = "NeonStaffKitchenReader (live test database)";

if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

/**
 * `NeonStaffKitchenReader` against the test database, with the contract the fake also passes. The reader runs over the
 * test database's **owner** credential, which holds every privilege, so this file shows what the statements do with
 * rows and not what the application role may select (the statements file pins the columns, the privilege test reads the
 * grants from the catalog).
 *
 * A Neon HTTP statement commits, so nothing here can be rolled back. Every row names an account, kitchen or request id
 * that this file minted at random, and `afterAll` deletes by those ids only, on the test database alone (ADR 0151).
 * The database is shared, so no assertion reads a whole-table figure: a list is scoped by the per-world marker in the
 * accounts' e-mail and name, or by an instant in the year 2999 that no other row holds.
 */
const PASSWORD_HASH = `$argon2id$v=19$m=19456,t=2,p=1$${"A".repeat(22)}$${"B".repeat(43)}`;
const ADDRESS_MARKER = "Strada Secreta 17, ap. 4 (reader live marker)";
const REQUEST_NAME_MARKER = "Request Typed Name (reader live marker)";
const REQUEST_PHONE_MARKER = "+37360777666";
const REQUEST_LOCALITY_MARKER = "Request Typed Locality (reader live marker)";
const REQUEST_CHANNEL_MARKER = "Request Typed Channel (reader live marker)";
const REQUEST_EMAIL_MARKER = "typed-in-request@example.invalid";
const MARKER_LENGTH = 12;
const ID_PREFIX_LENGTH = 20;
const ERA_START = Date.UTC(2999, 0, 1);
const ONE_DAY_MS = 86_400_000;
const ERA_JITTER_DAYS = 200;
const UNREADABLE_DOCUMENT = "{}";

let nextEraDay = Math.floor(Math.random() * ERA_JITTER_DAYS);

function randomText(alphabet: string, length: number): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  /** The test database's owner credential, opened per use: a skipped describe still runs this body. */
  const sql = () => neon(liveTestDatabaseUrl);
  const accountIds: string[] = [];
  const designIds: string[] = [];
  const clientRequestIds: string[] = [];
  const noteIds: string[] = [];

  afterAll(async () => {
    if (!isLiveTestDatabaseConfigured) return;
    await sql()`delete from design_notes where design_id = any(${designIds}) or id = any(${noteIds})`;
    await sql()`delete from design_request_states where design_id = any(${designIds})`;
    await sql()`delete from contact_submissions where client_request_id = any(${clientRequestIds})`;
    await sql()`delete from designs where id = any(${designIds})`;
    await sql()`delete from accounts where id = any(${accountIds})`;
  });

  function newWorld(): Promise<KitchenWorld> {
    const marker = randomText(
      "abcdefghijklmnopqrstuvwxyz0123456789",
      MARKER_LENGTH,
    );
    let accountCount = 0;
    let requestCount = 0;

    async function insertAccount(spec: {
      readonly role: "client" | "operator";
      readonly name: string | null;
      readonly phone: string | null;
      readonly emailNormalForm?: string;
    }): Promise<{ accountId: string; email: string }> {
      const accountId = nanoid();
      accountCount += 1;
      const email = `Mixed.${marker}.${String(accountCount)}@Example.INVALID`;
      accountIds.push(accountId);
      await sql()`
        insert into accounts (id, email, email_normal_form, password_hash, role, locale, privacy_notice_version,
          phone, phone_normal_form, address, name)
        values (${accountId}, ${email}, ${spec.emailNormalForm ?? email.toLowerCase()}, ${PASSWORD_HASH}, ${spec.role}, 'ro', '1',
          ${spec.phone}, ${spec.phone}, ${ADDRESS_MARKER}, ${spec.name})
      `;
      return { accountId, email };
    }

    return Promise.resolve({
      reader: new NeonStaffKitchenReader(liveTestDatabaseUrl),
      marker,
      idPrefix: randomText("ABCDEFGHIJKLMNOPQRSTUVWXYZ", ID_PREFIX_LENGTH),
      nextEra: () => new Date(ERA_START + ONE_DAY_MS * nextEraDay++),
      async aClient(spec = {}): Promise<ClientAccount> {
        const name = spec.name === undefined ? `Name ${marker}` : spec.name;
        const phone = spec.phone ?? null;
        const { accountId, email } = await insertAccount({
          role: "client",
          name,
          phone,
          ...(spec.emailNormalForm === undefined
            ? {}
            : { emailNormalForm: spec.emailNormalForm }),
        });
        return { accountId, email, name, phone };
      },
      async aStaffMember(): Promise<StaffAccount> {
        const { accountId, email } = await insertAccount({
          role: "operator",
          name: "Staff Name",
          phone: null,
        });
        return { accountId, email, name: "Staff Name" };
      },
      async aKitchen(spec): Promise<string> {
        const id = spec.id ?? nanoid();
        designIds.push(id);
        const document =
          spec.document === "unreadable"
            ? UNREADABLE_DOCUMENT
            : JSON.stringify(CURRENT_DESIGN);
        await sql()`
          insert into designs (id, schema_version, document, account_id, name, sent_at, updated_at,
            hidden_by_client_at, deleted_by_client_at)
          values (${id}, ${CURRENT_SCHEMA_VERSION}, ${document}::jsonb, ${spec.client?.accountId ?? null},
            ${spec.name ?? null}, ${spec.sentAt?.toISOString() ?? null}::timestamptz,
            ${spec.updatedAt.toISOString()}::timestamptz,
            case when ${spec.isHidden ?? false}::boolean then now() end,
            case when ${spec.isDeletedByClient ?? false}::boolean then now() end)
        `;
        return id;
      },
      async aRequest(spec) {
        requestCount += 1;
        const clientRequestId = spec.clientRequestId ?? nanoid();
        const reference = `LIVE-${marker.toUpperCase()}-${String(requestCount)}`;
        clientRequestIds.push(clientRequestId);
        await sql()`
          insert into contact_submissions (client_request_id, reference, design_id, design_revision, payload_digest,
            created_at, name, phone, phone_normal_form, locality, channel, email, consent_text_version, locale,
            design_document, priced)
          values (${clientRequestId}, ${reference}, ${spec.designId}, 1, ${randomBytes(32).toString("hex")},
            ${spec.createdAt.toISOString()}::timestamptz, ${REQUEST_NAME_MARKER}, ${REQUEST_PHONE_MARKER},
            ${REQUEST_PHONE_MARKER}, ${REQUEST_LOCALITY_MARKER}, ${REQUEST_CHANNEL_MARKER}, ${REQUEST_EMAIL_MARKER},
            '1', 'ro', '{}'::jsonb, '{}'::jsonb)
        `;
        return { clientRequestId, reference };
      },
      async aSentCopy(spec): Promise<void> {
        const document =
          spec.design === "unreadable"
            ? UNREADABLE_DOCUMENT
            : JSON.stringify(spec.design);
        await sql()`
          insert into contact_submission_views (token_hash, client_request_id, schema_version, design_document,
            created_at, revoked_at)
          values (${spec.tokenHash ?? randomBytes(32).toString("hex")}, ${spec.clientRequestId}, ${CURRENT_SCHEMA_VERSION},
            ${document}::jsonb, ${spec.createdAt.toISOString()}::timestamptz,
            case when ${spec.isRevoked ?? false}::boolean then now() end)
        `;
      },
      async aStatus(spec): Promise<void> {
        await sql()`
          insert into design_request_states (design_id, status, changed_by_account_id, changed_at)
          values (${spec.designId}, ${spec.status}, ${spec.changedBy.accountId},
            ${spec.changedAt.toISOString()}::timestamptz)
        `;
      },
      async aNote(spec): Promise<string> {
        const id = spec.id ?? nanoid();
        noteIds.push(id);
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
      async removeAccount(accountId): Promise<void> {
        await sql()`delete from accounts where id = ${accountId}`;
      },
    });
  }

  describeStaffKitchenReaderContract("NeonStaffKitchenReader", newWorld);

  async function foundOne(world: KitchenWorld, designId: string) {
    const reading = await world.reader.readOne(designId);
    if (reading.kind !== "found") throw new Error("the kitchen was not found");
    return reading.kitchen;
  }

  describe("what only the database can show", () => {
    const LATEST_INSTANT_MS = 8.64e15;
    const START_OF_1900_MS = Date.UTC(1900, 0, 1);

    it("reads an instant of infinity, minus infinity, before 1970 or past year 275760 as the nearest instant a Date holds", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const staff = await world.aStaffMember();
      const era = world.nextEra();
      const unbounded = await world.aKitchen({
        client,
        sentAt: era,
        updatedAt: era,
      });
      const oldAndFar = await world.aKitchen({
        client,
        sentAt: era,
        updatedAt: era,
      });
      const request = await world.aRequest({
        designId: unbounded,
        createdAt: era,
      });
      await world.aStatus({
        designId: unbounded,
        status: "closed",
        changedBy: staff,
        changedAt: era,
      });
      const note = await world.aNote({
        designId: unbounded,
        author: staff,
        text: "odd",
        createdAt: era,
      });
      await sql()`update designs set sent_at = 'infinity', updated_at = '-infinity' where id = ${unbounded}`;
      await sql()`update designs set sent_at = '1900-01-01T00:00:00Z', updated_at = '280000-01-01T00:00:00Z' where id = ${oldAndFar}`;
      await sql()`update contact_submissions set created_at = 'infinity' where client_request_id = ${request.clientRequestId}`;
      await sql()`update design_request_states set changed_at = '-infinity' where design_id = ${unbounded}`;
      await sql()`update design_notes set created_at = '280000-01-01T00:00:00Z' where id = ${note}`;

      const page = await world.reader.listPage({
        segment: "all",
        status: null,
        search: world.marker,
        page: 1,
      });
      const unboundedDetail = await foundOne(world, unbounded);
      const oldAndFarDetail = await foundOne(world, oldAndFar);

      const times = (id: string) => {
        const row = page.kitchens.find((kitchen) => kitchen.id === id);
        return [row?.sentAt?.getTime(), row?.updatedAt.getTime()];
      };
      expect(times(unbounded)).toEqual([LATEST_INSTANT_MS, -LATEST_INSTANT_MS]);
      expect(times(oldAndFar)).toEqual([START_OF_1900_MS, LATEST_INSTANT_MS]);
      expect([
        unboundedDetail.sentAt?.getTime(),
        unboundedDetail.updatedAt.getTime(),
      ]).toEqual([LATEST_INSTANT_MS, -LATEST_INSTANT_MS]);
      expect([
        oldAndFarDetail.sentAt?.getTime(),
        oldAndFarDetail.updatedAt.getTime(),
      ]).toEqual([START_OF_1900_MS, LATEST_INSTANT_MS]);
      expect(unboundedDetail.request?.sentAt.getTime()).toBe(LATEST_INSTANT_MS);
      expect(unboundedDetail.status?.change?.at.getTime()).toBe(
        -LATEST_INSTANT_MS,
      );
      expect(unboundedDetail.notes[0]?.createdAt.getTime()).toBe(
        LATEST_INSTANT_MS,
      );
    });

    it("reads nothing the client typed into a request, no postal address and no credential", async () => {
      const world = await newWorld();
      const client = await world.aClient({ phone: "+37360111000" });
      const era = world.nextEra();
      const sentAt = new Date(era.getTime() + 60_000);
      const kitchen = await world.aKitchen({
        client,
        sentAt,
        updatedAt: sentAt,
      });
      const request = await world.aRequest({
        designId: kitchen,
        createdAt: sentAt,
      });
      await world.aSentCopy({
        clientRequestId: request.clientRequestId,
        createdAt: sentAt,
        design: CURRENT_DESIGN,
      });

      const page = await world.reader.listPage({
        segment: "sent",
        status: null,
        search: world.marker,
        page: 1,
      });
      const reading = await world.reader.readOne(kitchen);

      const text = JSON.stringify([page, reading]);
      expect(text).toContain(client.email);
      expect(text).toContain(request.reference);
      for (const forbidden of [
        ADDRESS_MARKER,
        REQUEST_NAME_MARKER,
        REQUEST_PHONE_MARKER,
        REQUEST_LOCALITY_MARKER,
        REQUEST_CHANNEL_MARKER,
        REQUEST_EMAIL_MARKER,
        PASSWORD_HASH,
      ]) {
        expect(text).not.toContain(forbidden);
      }
    });
  });
});
