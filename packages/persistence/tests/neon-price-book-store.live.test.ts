import { Client } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { appendPriceVersionForTests } from "../src/append-price-version-for-tests.js";
import {
  AVAILABILITY_CHANGED_MEANWHILE,
  CHANGED_MEANWHILE,
} from "../src/m10-ports.js";
import { runMigrations } from "../src/migrate.js";
import { NeonCatalogueAvailabilityStore } from "../src/neon-catalogue-availability-store.js";
import { NeonPriceBookStore } from "../src/neon-price-book-store.js";
import { SEQUENCE_NUMBER_IS_UNIQUE } from "../src/price-book-statements.js";
import { seedPriceBook } from "../src/seed-price-book.js";
import {
  A_BOOK,
  DRAFT_CHANGED,
  aNewItemPair,
  auditRecordOf,
  dashboardFailureOf,
  newestSequenceOf,
  publishRequestFor,
} from "./support/dashboard-contract-support.js";
import type { DashboardStaffMember } from "./support/dashboard-contract-support.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { createNeonDashboardStaffWorld } from "./support/neon-dashboard-world.js";
import { describePriceBookStoreContract } from "./support/price-book-store-contract.js";
import type { PriceBookWorld } from "./support/price-book-store-contract.js";
import { rejectionOf } from "./support/rejection-of.js";
import { holdExclusiveTestSchemaLock } from "./support/test-schema-lock.js";

// Exclusive: the contract asserts over global singletons (the draft, the newest version and the availability head), and
// every publish leaves a version that no test can remove (plan S2, recorded choice a).
holdExclusiveTestSchemaLock();

const SUITE_NAME = "NeonPriceBookStore (live test database)";

if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

// Ids the stores are to mint next, in order, then the real `nanoid`. A test that queues an id which is already taken in
// `staff_audit_events` makes the audit insert of the write under test fail at the primary key, which is how this file
// injects the fault the plan's S-b asks for without altering any table.
const minted = vi.hoisted(() => ({ queue: [] as string[] }));
vi.mock("nanoid", async (importOriginal) => {
  const actual = await importOriginal<typeof import("nanoid")>();
  return {
    ...actual,
    nanoid: (size?: number) => minted.queue.shift() ?? actual.nanoid(size),
  };
});

/**
 * `NeonPriceBookStore` against the test database, with the contract the fake also passes, and what only a database can
 * show: the constraint a second publish meets, the lock a publish waits at, the audit row's refusal rolling the publish
 * back, the owner-run seed refusing, and the test-only appender. The stores run over the test database's **owner**
 * credential, which holds every privilege; the privilege test reads what the application role is granted from the
 * catalog.
 *
 * A Neon HTTP statement commits, so nothing here can be rolled back by the file. Every account names an id this file
 * minted at random and `afterAll` deletes by those ids only, on the test database alone (ADR 0151). The versions and the
 * log are append-only and stay, as does the draft's revision, which only ever grows: a later reader of this database
 * seeds its own active book.
 */
describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  const staff = createNeonDashboardStaffWorld(liveTestDatabaseUrl);

  // The tables of 0023 to 0025 must exist: nothing else in a run of this file migrates the test database first.
  beforeAll(async () => {
    await runMigrations(liveTestDatabaseUrl);
  });

  afterAll(async () => {
    if (!isLiveTestDatabaseConfigured) return;
    await staff.removeTheRowsItMinted();
  });

  function newWorld(): Promise<PriceBookWorld> {
    return Promise.resolve({
      ...staff.world,
      store: new NeonPriceBookStore(liveTestDatabaseUrl),
      availability: new NeonCatalogueAvailabilityStore(liveTestDatabaseUrl),
    });
  }

  describePriceBookStoreContract("NeonPriceBookStore", newWorld);

  describe("what only the database can show", () => {
    /** Everything a refused or rolled-back publish must leave as it found it, read straight from the tables. */
    async function tablesOf() {
      const rows = await staff.sql()`
        select (select count(*)::int from price_book_versions) as versions,
          (select coalesce(max(sequence_number), 0)::text from price_book_versions) as newest,
          (select revision::text from price_book_draft) as draft_revision,
          (select changes from price_book_draft) as draft_changes,
          (select revision::text from catalogue_availability_head) as head,
          (select count(*)::int from catalogue_availability_changes) as log_rows
      `;
      return rows[0];
    }

    async function nowAWriterHasChangedTheDraft(
      world: PriceBookWorld,
      member: DashboardStaffMember,
    ) {
      const draft = await world.store.readDraft();
      const written = await world.store.writeDraft({
        expectedDraftRevision: draft.draftRevision,
        changes: [{ address: { kind: "depth-rule" }, value: 40 }],
        audit: auditRecordOf(member, DRAFT_CHANGED),
      });
      if (written.kind !== "ok") throw new Error("the draft write was refused");
    }

    it("appends a version through the test-only helper at the next sequence number, and reads it back as the active one", async () => {
      const world = await newWorld();
      const member = await world.aStaffMember();
      const newestBefore = await newestSequenceOf(world.store);

      const appended = await appendPriceVersionForTests(
        { ...A_BOOK, version: "appended" },
        member.accountId,
      );

      expect(appended.sequenceNumber).toBe(newestBefore + 1);
      expect(await world.store.readActive()).toMatchObject({
        kind: "found",
        version: {
          versionId: appended.versionId,
          sequenceNumber: newestBefore + 1,
          book: { version: appended.versionId },
        },
      });
      expect(await world.store.readVersion(appended.versionId)).toMatchObject({
        version: { state: "active", changeSummary: [] },
      });
    });

    it("refuses to seed while any version exists, leaving the table byte-identical and writing no audit row", async () => {
      const world = await newWorld();
      const owner = await world.aStaffMember();
      await appendPriceVersionForTests(A_BOOK, owner.accountId);
      const versionsAsText = () =>
        staff.sql()`
          select id, sequence_number::text, label, note, book::text, change_summary::text, published_at::text,
            published_by_account_id
          from price_book_versions order by sequence_number
        `;
      const before = await versionsAsText();

      const result = await seedPriceBook({
        connectionUrl: liveTestDatabaseUrl,
        ownerAccountId: owner.accountId,
        book: A_BOOK,
      });

      expect(result).toEqual({ kind: "refused", reason: "versions-exist" });
      expect(await versionsAsText()).toEqual(before);
      expect(await world.auditEventsOf(owner.accountId)).toEqual([]);
    });

    it("holds the constraint the store reads as changed-meanwhile: a second version at one sequence number is a unique violation by that name", async () => {
      const world = await newWorld();
      const member = await world.aStaffMember();
      const { sequenceNumber } = await appendPriceVersionForTests(
        A_BOOK,
        member.accountId,
      );
      const before = await tablesOf();

      const failure = await rejectionOf(
        staff.sql()`
          insert into price_book_versions (id, sequence_number, label, note, book, change_summary, published_by_account_id)
          values (${"d".repeat(21)}, ${sequenceNumber}, 'twin', '', '{}'::jsonb, '[]'::jsonb, ${member.accountId})
        `,
      );

      expect(failure).toMatchObject({
        code: "23505",
        constraint: SEQUENCE_NUMBER_IS_UNIQUE,
      });
      expect(await tablesOf()).toEqual(before);
    });

    it("stamps a version and a draft write with the database's clock", async () => {
      const world = await newWorld();
      const member = await world.aStaffMember();
      await nowAWriterHasChangedTheDraft(world, member);
      const published = await world.store.publish(
        await publishRequestFor(world.store, world.availability, member),
      );
      expect(published.kind).toBe("ok");

      const rows = await staff.sql()`
        select
          (select published_at between now() - interval '2 minutes' and now()
            from price_book_versions order by sequence_number desc limit 1) as is_version_just_now,
          (select updated_at between now() - interval '2 minutes' and now() from price_book_draft) as is_draft_just_now
      `;

      expect(rows).toEqual([
        { is_version_just_now: true, is_draft_just_now: true },
      ]);
    });

    /**
     * Takes `auditId` in the audit log under `member`'s account, so a write that mints it next fails at the primary key of
     * its audit insert, and queues the ids the write will mint (a publish mints its version's first). The row goes with
     * the member's other rows when the file finishes.
     */
    async function withAuditIdTaken(
      member: DashboardStaffMember,
      mintsBeforeTheAudit: number,
      run: () => Promise<void>,
    ) {
      const auditId = nanoid();
      await staff.sql()`
        insert into staff_audit_events (id, actor_account_id, action) values (${auditId}, ${member.accountId}, 'audit-viewed')
      `;
      minted.queue.push(
        ...Array.from({ length: mintsBeforeTheAudit }, () => nanoid()),
        auditId,
      );
      try {
        await run();
        expect(minted.queue, "the write minted every id queued for it").toEqual(
          [],
        );
      } finally {
        minted.queue.length = 0;
      }
    }

    it("rolls a publish back whole when its audit row cannot be inserted, and writes no version, no log row, no head move and no draft reset", async () => {
      const world = await newWorld();
      const member = await world.aStaffMember();
      await nowAWriterHasChangedTheDraft(world, member);
      const before = await tablesOf();
      const request = await publishRequestFor(
        world.store,
        world.availability,
        member,
        { createdItems: aNewItemPair() },
      );

      await withAuditIdTaken(member, 1, async () => {
        const failure = await dashboardFailureOf(
          world.store.publish(request),
          "database",
        );
        expect(failure.cause).toMatchObject({
          code: "23505",
          constraint: "staff_audit_events_pkey",
        });
      });

      expect(await tablesOf()).toEqual(before);
      expect(
        (await world.auditEventsOf(member.accountId)).map(
          (event) => event.action,
        ),
      ).toEqual(["price-draft-changed", "audit-viewed"]);
    });

    it("rolls a draft write back whole when its audit row cannot be inserted", async () => {
      const world = await newWorld();
      const member = await world.aStaffMember();
      const before = await tablesOf();
      const request = {
        expectedDraftRevision: (await world.store.readDraft()).draftRevision,
        changes: [],
        audit: auditRecordOf(member, DRAFT_CHANGED),
      };

      await withAuditIdTaken(member, 0, async () => {
        await dashboardFailureOf(world.store.writeDraft(request), "database");
      });

      expect(await tablesOf()).toEqual(before);
    });

    it("lets exactly one of five publishes racing at one draft revision win, and leaves the state of one publish", async () => {
      const world = await newWorld();
      const member = await world.aStaffMember();
      await nowAWriterHasChangedTheDraft(world, member);
      const before = await tablesOf();
      const items = aNewItemPair();
      const request = await publishRequestFor(
        world.store,
        world.availability,
        member,
        {
          createdItems: items,
          label: "Five",
          note: "",
        },
      );

      const answers = await Promise.all(
        Array.from({ length: 5 }, () => world.store.publish(request)),
      );

      expect(answers.map((answer) => answer.kind).sort()).toEqual([
        "changed-meanwhile",
        "changed-meanwhile",
        "changed-meanwhile",
        "changed-meanwhile",
        "ok",
      ]);
      const after = await tablesOf();
      expect(after).toMatchObject({
        versions: (before?.["versions"] as number) + 1,
        log_rows: (before?.["log_rows"] as number) + items.length,
        draft_changes: [],
      });
      expect(after?.["head"]).toBe(
        await world.aRevisionAfter(before?.["head"] as string, items.length),
      );
      expect(
        (await world.auditEventsOf(member.accountId)).filter(
          (event) => event.action === "price-published",
        ),
      ).toHaveLength(1);
    });

    it("lets exactly one of a draft write and a publish racing at one draft revision succeed, with no state between the two", async () => {
      const world = await newWorld();
      const member = await world.aStaffMember();

      for (let attempt = 0; attempt < 4; attempt += 1) {
        const before = await tablesOf();
        const request = await publishRequestFor(
          world.store,
          world.availability,
          member,
          {
            label: "Race",
            note: "",
          },
        );

        const [written, published] = await Promise.all([
          world.store.writeDraft({
            expectedDraftRevision: request.expectedDraftRevision,
            changes: [{ address: { kind: "depth-rule" }, value: 41 }],
            audit: auditRecordOf(member, DRAFT_CHANGED),
          }),
          world.store.publish(request),
        ]);

        const after = await tablesOf();
        expect(
          [written.kind === "ok", published.kind === "ok"].filter(Boolean),
        ).toHaveLength(1);
        const didPublish = published.kind === "ok";
        expect(after?.["versions"]).toBe(
          (before?.["versions"] as number) + (didPublish ? 1 : 0),
        );
        expect(after?.["draft_revision"]).toBe(
          await world.aRevisionAfter(before?.["draft_revision"] as string, 1),
        );
        expect(after?.["head"]).toBe(
          await world.aRevisionAfter(
            before?.["head"] as string,
            didPublish ? 1 : 0,
          ),
        );
      }
    });

    it("waits at the draft lock of a writer in progress and then answers changed-meanwhile, writing nothing", async () => {
      const world = await newWorld();
      const member = await world.aStaffMember();
      const request = await publishRequestFor(
        world.store,
        world.availability,
        member,
        {
          createdItems: aNewItemPair(),
        },
      );

      const answer = await publishWhileAnotherWriterHolds(
        "update price_book_draft set revision = revision + 1",
        () => world.store.publish(request),
      );

      expect(answer).toBe(CHANGED_MEANWHILE);
    });

    it("waits at the head lock of a writer in progress and then answers availability-changed-meanwhile, writing nothing", async () => {
      const world = await newWorld();
      const member = await world.aStaffMember();
      const request = await publishRequestFor(
        world.store,
        world.availability,
        member,
        {
          createdItems: aNewItemPair(),
        },
      );

      const answer = await publishWhileAnotherWriterHolds(
        "update catalogue_availability_head set revision = revision + 1",
        () => world.store.publish(request),
      );

      expect(answer).toBe(AVAILABILITY_CHANGED_MEANWHILE);
    });

    /**
     * Holds `lockingStatement` in an open transaction on a connection of its own, starts the publish, gives it time to
     * reach the lock, commits, and answers what the publish answered. The tables must be as the other writer left them.
     */
    async function publishWhileAnotherWriterHolds(
      lockingStatement: string,
      publish: () => Promise<{ kind: string }>,
    ) {
      const before = await tablesOf();
      const other = new Client(liveTestDatabaseUrl);
      await other.connect();
      try {
        await other.query("begin");
        await other.query(lockingStatement);
        let isSettled = false;
        const pending = publish().finally(() => {
          isSettled = true;
        });
        await new Promise((resolve) => setTimeout(resolve, 1_500));
        expect(isSettled, "the publish waits at the lock").toBe(false);
        await other.query("commit");
        const answer = await pending;
        const after = await tablesOf();
        expect(after?.["versions"]).toBe(before?.["versions"]);
        expect(after?.["log_rows"]).toBe(before?.["log_rows"]);
        return answer;
      } finally {
        await other.end();
      }
    }

    // The plan's S-b names a racing pair of one publish and one defaults save. The contract has the publish against an
    // availability write; the defaults save belongs to S3, whose `KitchenDefaultsStore` does not exist yet.
    it.skip("lets exactly one of a publish and a defaults save racing at one availability revision succeed — needs KitchenDefaultsStore (S3)", () => {
      // Written by S3 against the same head row.
    });
  });
});
