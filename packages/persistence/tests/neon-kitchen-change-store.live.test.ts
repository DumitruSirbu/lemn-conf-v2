import { randomBytes } from "node:crypto";

import {
  CURRENT_SCHEMA_VERSION,
  DIGEST_WINDOW_MS,
  KITCHEN_L_DESIGN,
} from "@lemnaria/configurator-domain";
import { neon } from "@neondatabase/serverless";
import { customAlphabet, nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { runMigrations } from "../src/migrate.js";
import { NeonKitchenChangeStore } from "../src/neon-kitchen-change-store.js";
import {
  KITCHEN_SEEN,
  auditRecordOf,
  dashboardFailureOf,
} from "./support/dashboard-contract-support.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import {
  aDayNobodyClaimed,
  describeKitchenChangeStoreContract,
} from "./support/kitchen-change-store-contract.js";
import type {
  ChangeKitchenSpec,
  ChangeWorld,
} from "./support/kitchen-change-store-contract.js";
import { createNeonDashboardStaffWorld } from "./support/neon-dashboard-world.js";
import { holdExclusiveTestSchemaLock } from "./support/test-schema-lock.js";

// Exclusive: the digest contract lists over the whole `designs` table and writes about eighty kitchens of its own, and
// the rounds and entries it claims are append-only for the application role, so no other run may read the digest tables
// or count designs meanwhile (plan S2, recorded choice a, followed by S4).
holdExclusiveTestSchemaLock();

const SUITE_NAME = "NeonKitchenChangeStore (live test database)";

if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

// Ids the store is to mint next, then the real `nanoid`: a test queues an id already taken in `staff_audit_events`, so the
// audit insert of the write under test fails at the primary key, which injects the fault without altering any table.
const minted = vi.hoisted(() => ({ queue: [] as string[] }));
vi.mock("nanoid", async (importOriginal) => {
  const actual = await importOriginal<typeof import("nanoid")>();
  return {
    ...actual,
    nanoid: (size?: number) => minted.queue.shift() ?? actual.nanoid(size),
  };
});

const PASSWORD_HASH = `$argon2id$v=19$m=19456,t=2,p=1$${"A".repeat(22)}$${"B".repeat(43)}`;
const REQUEST_NAME_MARKER = "Request Typed Name (change store live marker)";
const REQUEST_PHONE_MARKER = "+37360777555";
const REFERENCE_SUFFIX_LENGTH = 12;
const ONE_SECOND = "1 second";
const SENT_LONG_AGO = new Date("2026-10-24T05:00:00.000Z");

const newReferenceSuffix = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  REFERENCE_SUFFIX_LENGTH,
);

/**
 * `NeonKitchenChangeStore` against the test database, with the contract the fake also passes, and what only a database
 * can show: the seen mark and its audit row committing or failing together, the greatest of racing marks kept by the row
 * lock, the round's count following its entries, and an entry never changed. The store runs over the test database's
 * **owner** credential, which holds every privilege; the privilege test reads what the application role is granted from
 * the catalog.
 *
 * Every account, kitchen, request and seen mark names an id this file minted at random, and `afterAll` deletes by those
 * ids only (ADR 0151). **The rounds it claims stay**, as S2's versions and log do: the application role may not delete
 * one, each is claimed at a day key in a year from 3000 to 8999 that no real day shares, and the entries beneath it are
 * deleted with the kitchens they name. As the plan's S2 recorded choice (b) says of the versions, a later reader of this
 * database must not assume the rounds table is empty.
 */
describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  const staff = createNeonDashboardStaffWorld(liveTestDatabaseUrl);
  const sql = () => neon(liveTestDatabaseUrl);
  const accountIds: string[] = [];
  const designIds: string[] = [];
  const clientRequestIds: string[] = [];

  // The tables of 0026 and 0027 must exist: nothing else in a run of this file migrates the test database first.
  beforeAll(async () => {
    await runMigrations(liveTestDatabaseUrl);
  });

  afterAll(async () => {
    if (!isLiveTestDatabaseConfigured) return;
    await sql()`delete from staff_change_digest_entries where design_id = any(${designIds})`;
    await sql()`delete from design_staff_seen where design_id = any(${designIds})`;
    await sql()`delete from design_request_states where design_id = any(${designIds})`;
    await sql()`delete from contact_submissions where client_request_id = any(${clientRequestIds})`;
    await staff.removeTheRowsItMinted();
    await sql()`delete from designs where id = any(${designIds})`;
    await sql()`delete from accounts where id = any(${accountIds})`;
  });

  async function insertAccount(name: string | null): Promise<string> {
    const accountId = nanoid();
    accountIds.push(accountId);
    const email = `change-live-${accountId.toLowerCase()}@example.invalid`;
    await sql()`
      insert into accounts (id, email, email_normal_form, password_hash, role, locale, privacy_notice_version, name)
      values (${accountId}, ${email}, ${email}, ${PASSWORD_HASH}, 'client', 'ro', '1', ${name})
    `;
    return accountId;
  }

  /** A request for the design at `revision`, stored at `createdAt`, or one second after the design's newest request. */
  async function insertSubmission(
    designId: string,
    revision: string,
    createdAt: Date | undefined,
  ): Promise<void> {
    const clientRequestId = nanoid();
    clientRequestIds.push(clientRequestId);
    const reference = `CHG-${newReferenceSuffix()}`;
    const instant = createdAt?.toISOString() ?? null;
    await sql()`
      insert into contact_submissions (client_request_id, reference, design_id, design_revision, payload_digest,
        created_at, name, phone, phone_normal_form, locality, channel, consent_text_version, locale, design_document,
        priced)
      values (${clientRequestId}, ${reference}, ${designId}, ${revision}::bigint, ${randomBytes(32).toString("hex")},
        coalesce(${instant}::timestamptz,
          (select max(created_at) + ${ONE_SECOND}::interval from contact_submissions where design_id = ${designId})),
        ${REQUEST_NAME_MARKER}, ${REQUEST_PHONE_MARKER}, ${REQUEST_PHONE_MARKER}, 'Chisinau', 'phone', '1', 'ro',
        '{}'::jsonb, '{}'::jsonb)
    `;
  }

  async function aKitchen(spec: ChangeKitchenSpec) {
    const designId = nanoid();
    designIds.push(designId);
    // `accounts_name_length` (0017) refuses an empty name, so an account that "has an empty name" has none: the same
    // reading the digest gives a name of spaces, and the fake world, which can hold an empty one, agrees.
    const accountName =
      spec.customerName === undefined || spec.customerName === ""
        ? null
        : spec.customerName;
    const accountId =
      (spec.hasAccount ?? true) ? await insertAccount(accountName) : null;
    await sql()`
      insert into designs (id, schema_version, document, account_id, name, sent_at, updated_at, deleted_by_client_at)
      values (${designId}, ${CURRENT_SCHEMA_VERSION}, ${JSON.stringify(KITCHEN_L_DESIGN)}::jsonb, ${accountId},
        ${spec.kitchenName ?? null}, ${spec.sentAt?.toISOString() ?? null}::timestamptz,
        coalesce(${spec.sentAt?.toISOString() ?? null}::timestamptz, now()),
        case when ${spec.isDeletedByClient ?? false}::boolean then now() end)
    `;
    if (spec.status !== undefined) {
      await sql()`
        insert into design_request_states (design_id, status, changed_by_account_id)
        values (${designId}, ${spec.status}, ${accountId ?? nanoid()})
      `;
    }
    if (spec.sentAt !== undefined && spec.hasNoRequest !== true) {
      await insertSubmission(designId, "1", spec.sentAt);
    }
    return { designId, revision: "1" };
  }

  function newWorld(): Promise<ChangeWorld> {
    return Promise.resolve({
      ...staff.world,
      store: new NeonKitchenChangeStore(liveTestDatabaseUrl),
      aKitchen,
      async saveKitchen(designId) {
        const rows = await sql()`
          update designs set revision = revision + 1 where id = ${designId} returning revision::text as revision
        `;
        return (rows[0] as { revision: string }).revision;
      },
      async resendKitchen(designId) {
        const rows =
          await sql()`select revision::text as revision from designs where id = ${designId}`;
        await insertSubmission(
          designId,
          (rows[0] as { revision: string }).revision,
          undefined,
        );
      },
      async aRevisionAheadOf(designId) {
        const rows =
          await sql()`select (revision + 1)::text as revision from designs where id = ${designId}`;
        return (rows[0] as { revision: string }).revision;
      },
      async plantSeenMark(designId, revision) {
        await sql()`
          insert into design_staff_seen (design_id, seen_revision, seen_by_account_id)
          values (${designId}, ${revision}::bigint, ${nanoid()})
          on conflict (design_id) do update set seen_revision = excluded.seen_revision
        `;
      },
      async seenRevisionOf(designId) {
        const rows =
          await sql()`select seen_revision::text as revision from design_staff_seen where design_id = ${designId}`;
        return (rows[0] as { revision: string } | undefined)?.revision;
      },
      async seenMarkOf(designId) {
        const rows = await sql()`
          select seen_revision::text as revision, seen_by_account_id,
            (extract(epoch from seen_at) * 1000)::double precision as at_ms
          from design_staff_seen where design_id = ${designId}
        `;
        const row = rows[0] as
          | { revision: string; seen_by_account_id: string; at_ms: number }
          | undefined;
        return row === undefined
          ? undefined
          : {
              revision: row.revision,
              byAccountId: row.seen_by_account_id,
              atMs: row.at_ms,
            };
      },
    });
  }

  describeKitchenChangeStoreContract("NeonKitchenChangeStore", newWorld);

  describe("what only the database can show", () => {
    it("compares the window on the milliseconds a Date holds: a send 900 microseconds past a millisecond is out at the exact edge, as the domain's floored instant is", async () => {
      const world = await newWorld();
      const kitchen = await world.aKitchen({ sentAt: SENT_LONG_AGO });
      await world.saveKitchen(kitchen.designId);
      await sql()`
        update designs set sent_at = sent_at + interval '900 microseconds' where id = ${kitchen.designId}
      `;
      const edge = SENT_LONG_AGO.getTime() + DIGEST_WINDOW_MS;
      const listedAt = async (instant: number) =>
        (await world.store.listDigestEligible(new Date(instant))).some(
          (row) => row.designId === kitchen.designId,
        );

      expect([await listedAt(edge - 1), await listedAt(edge)]).toEqual([
        true,
        false,
      ]);
    });

    it("rolls a mark back whole when its audit row cannot be inserted: the seen row that was there is unchanged, in revision, account and instant", async () => {
      const world = await newWorld();
      const member = await world.aStaffMember();
      const other = await world.aStaffMember();
      const kitchen = await world.aKitchen({ sentAt: SENT_LONG_AGO });
      await world.store.markSeen({
        designId: kitchen.designId,
        displayedRevision: kitchen.revision,
        audit: auditRecordOf(member, KITCHEN_SEEN),
      });
      const saved = await world.saveKitchen(kitchen.designId);
      const before = await world.seenMarkOf(kitchen.designId);
      const takenAuditId = nanoid();
      await sql()`
        insert into staff_audit_events (id, actor_account_id, action) values (${takenAuditId}, ${other.accountId}, 'audit-viewed')
      `;
      minted.queue.push(takenAuditId);

      try {
        const failure = await dashboardFailureOf(
          world.store.markSeen({
            designId: kitchen.designId,
            displayedRevision: saved,
            audit: auditRecordOf(other, KITCHEN_SEEN),
          }),
          "database",
        );
        expect(failure.cause).toMatchObject({
          code: "23505",
          constraint: "staff_audit_events_pkey",
        });
        expect(minted.queue).toEqual([]);
      } finally {
        minted.queue.length = 0;
      }

      expect(await world.seenMarkOf(kitchen.designId)).toEqual(before);
      expect(before?.byAccountId).toBe(member.accountId);
    });

    it("writes no first seen row when the audit row cannot be inserted", async () => {
      const world = await newWorld();
      const member = await world.aStaffMember();
      const kitchen = await world.aKitchen({ sentAt: SENT_LONG_AGO });
      const takenAuditId = nanoid();
      await sql()`
        insert into staff_audit_events (id, actor_account_id, action) values (${takenAuditId}, ${member.accountId}, 'audit-viewed')
      `;
      minted.queue.push(takenAuditId);

      try {
        await dashboardFailureOf(
          world.store.markSeen({
            designId: kitchen.designId,
            displayedRevision: kitchen.revision,
            audit: auditRecordOf(member, KITCHEN_SEEN),
          }),
          "database",
        );
      } finally {
        minted.queue.length = 0;
      }

      expect(await world.seenMarkOf(kitchen.designId)).toBeUndefined();
    });

    it("stamps a mark with the database's clock and the session's account, not a value the caller sent", async () => {
      const world = await newWorld();
      const member = await world.aStaffMember();
      const kitchen = await world.aKitchen({ sentAt: SENT_LONG_AGO });

      await world.store.markSeen({
        designId: kitchen.designId,
        displayedRevision: kitchen.revision,
        audit: auditRecordOf(member, KITCHEN_SEEN),
      });

      const rows = await sql()`
        select seen_by_account_id,
          seen_at between now() - interval '2 minutes' and now() as is_just_now
        from design_staff_seen where design_id = ${kitchen.designId}
      `;
      expect(rows).toEqual([
        { seen_by_account_id: member.accountId, is_just_now: true },
      ]);
    });

    it("keeps the greatest of five marks racing at different revisions, in the order they were sent, with one audit row for each", async () => {
      const world = await newWorld();
      const member = await world.aStaffMember();
      const kitchen = await world.aKitchen({ sentAt: SENT_LONG_AGO });
      const revisions = [kitchen.revision];
      for (let save = 0; save < 4; save += 1) {
        revisions.push(await world.saveKitchen(kitchen.designId));
      }
      const newest = revisions.at(-1) ?? kitchen.revision;

      const answers = await Promise.all(
        [...revisions].reverse().map((displayedRevision) =>
          world.store.markSeen({
            designId: kitchen.designId,
            displayedRevision,
            audit: auditRecordOf(member, KITCHEN_SEEN),
          }),
        ),
      );

      expect(answers.map((answer) => answer.kind)).toEqual(
        revisions.map(() => "ok"),
      );
      expect(await world.seenRevisionOf(kitchen.designId)).toBe(newest);
      expect(await world.auditEventsOf(member.accountId)).toHaveLength(
        revisions.length,
      );
    });

    it("writes nothing into designs for a mark: the revision and the update time stay as the client left them", async () => {
      const world = await newWorld();
      const member = await world.aStaffMember();
      const kitchen = await world.aKitchen({ sentAt: SENT_LONG_AGO });
      const saved = await world.saveKitchen(kitchen.designId);
      const read = () =>
        sql()`select revision::text as revision, updated_at from designs where id = ${kitchen.designId}`;
      const before = await read();

      await world.store.markSeen({
        designId: kitchen.designId,
        displayedRevision: saved,
        audit: auditRecordOf(member, KITCHEN_SEEN),
      });

      expect(await read()).toEqual(before);
    });

    describe("a round's count and entries", () => {
      async function countOf(dayKey: string): Promise<number> {
        const rows = await sql()`
          select sent_count from staff_change_digest_rounds where day_key = ${dayKey}
        `;
        return (rows[0] as { sent_count: number }).sent_count;
      }

      it("sets the count to the entries the round holds, and keeps it right when the same entries are sent again", async () => {
        const world = await newWorld();
        const [first, second, third] = [
          await world.aKitchen({ sentAt: SENT_LONG_AGO }),
          await world.aKitchen({ sentAt: SENT_LONG_AGO }),
          await world.aKitchen({ sentAt: SENT_LONG_AGO }),
        ];
        const dayKey = aDayNobodyClaimed();
        await world.store.claimDigestDay(dayKey);
        const atClaim = await countOf(dayKey);

        await world.store.recordDigested(dayKey, [first, second]);
        const afterTwo = await countOf(dayKey);
        await world.store.recordDigested(dayKey, [first, second]);
        const afterTheSameTwo = await countOf(dayKey);
        await world.store.recordDigested(dayKey, [second, third]);
        const afterOneMore = await countOf(dayKey);

        expect([atClaim, afterTwo, afterTheSameTwo, afterOneMore]).toEqual([
          0, 2, 2, 3,
        ]);
      });

      it("never changes an entry it holds: the kitchen named again at another revision keeps the first revision recorded", async () => {
        const world = await newWorld();
        const kitchen = await world.aKitchen({ sentAt: SENT_LONG_AGO });
        const later = await world.saveKitchen(kitchen.designId);
        const dayKey = aDayNobodyClaimed();
        await world.store.claimDigestDay(dayKey);

        await world.store.recordDigested(dayKey, [
          { designId: kitchen.designId, revision: kitchen.revision },
        ]);
        await world.store.recordDigested(dayKey, [
          { designId: kitchen.designId, revision: later },
        ]);

        const rows = await sql()`
          select revision::text as revision from staff_change_digest_entries
          where day_key = ${dayKey} and design_id = ${kitchen.designId}
        `;
        expect(rows).toEqual([{ revision: kitchen.revision }]);
      });

      it("stamps the claim with the database's clock", async () => {
        const world = await newWorld();
        const dayKey = aDayNobodyClaimed();

        await world.store.claimDigestDay(dayKey);

        const rows = await sql()`
          select claimed_at between now() - interval '2 minutes' and now() as is_just_now
          from staff_change_digest_rounds where day_key = ${dayKey}
        `;
        expect(rows).toEqual([{ is_just_now: true }]);
      });
    });
  });
});
