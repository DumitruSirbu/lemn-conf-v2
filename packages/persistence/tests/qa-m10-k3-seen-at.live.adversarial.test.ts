import { randomBytes } from "node:crypto";

import { CURRENT_SCHEMA_VERSION } from "@lemnaria/configurator-domain";
import type { StaffKitchenQuery } from "@lemnaria/configurator-domain";
import { neon } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import { afterAll, describe, expect, it } from "vitest";

import { NeonKitchenChangeStore } from "../src/neon-kitchen-change-store.js";
import { NeonStaffKitchenReader } from "../src/neon-staff-kitchen-reader.js";
import {
  KITCHEN_SEEN,
  auditRecordOf,
} from "./support/dashboard-contract-support.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { createNeonDashboardStaffWorld } from "./support/neon-dashboard-world.js";
import { CURRENT_DESIGN } from "./support/staff-kitchen-reader-contract.js";
import { holdSharedTestSchemaLock } from "./support/test-schema-lock.js";

// Adversarial QA of the instant the staff list says a kitchen was seen at, against the test database: floored to the
// millisecond as the list reads every instant, moved only by a mark that raises the revision, read for a mark that sits
// below the latest request, and for the save that lands between a page's load and its mark.

holdSharedTestSchemaLock();

const SUITE_NAME = "the seen instant of the staff list (live test database)";

if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

const PASSWORD_HASH = `$argon2id$v=19$m=19456,t=2,p=1$${"A".repeat(22)}$${"B".repeat(43)}`;
const ERA_START = Date.UTC(2020, 0, 1);
const ONE_DAY_MS = 86_400_000;
const ONE_MINUTE_MS = 60_000;
const SETTLE_MS = 30;

function marker(): string {
  return randomBytes(6).toString("hex");
}

describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  const sql = () => neon(liveTestDatabaseUrl);
  const accountIds: string[] = [];
  const designIds: string[] = [];
  const clientRequestIds: string[] = [];
  const staff = createNeonDashboardStaffWorld(liveTestDatabaseUrl);
  let nextEraDay = Math.floor(Math.random() * 200);

  afterAll(async () => {
    if (!isLiveTestDatabaseConfigured) return;
    await sql()`delete from design_staff_seen where design_id = any(${designIds})`;
    await staff.removeTheRowsItMinted();
    await sql()`delete from contact_submissions where client_request_id = any(${clientRequestIds})`;
    await sql()`delete from designs where id = any(${designIds})`;
    await sql()`delete from accounts where id = any(${accountIds})`;
  });

  async function aWorld() {
    const tag = marker();
    const accountId = nanoid();
    accountIds.push(accountId);
    const email = `seenat.${tag}@example.invalid`;
    await sql()`
      insert into accounts (id, email, email_normal_form, password_hash, role, locale, privacy_notice_version, name)
      values (${accountId}, ${email}, ${email}, ${PASSWORD_HASH}, 'client', 'ro', '1', ${`Name ${tag}`})
    `;
    const era = new Date(ERA_START + ONE_DAY_MS * nextEraDay++);
    const store = new NeonKitchenChangeStore(liveTestDatabaseUrl);
    const reader = new NeonStaffKitchenReader(liveTestDatabaseUrl);
    const staffMember = await staff.world.aStaffMember();

    async function aKitchen(isSent: boolean): Promise<string> {
      const id = nanoid();
      designIds.push(id);
      await sql()`
        insert into designs (id, schema_version, document, account_id, sent_at, updated_at)
        values (${id}, ${CURRENT_SCHEMA_VERSION}, ${JSON.stringify(CURRENT_DESIGN)}::jsonb, ${accountId},
          ${isSent ? era.toISOString() : null}::timestamptz, ${era.toISOString()}::timestamptz)
      `;
      return id;
    }

    return {
      sql,
      aKitchen,
      /** The client saves once more, `minutesAgo` minutes before the database's own clock. */
      async save(designId: string, minutesAgo: number): Promise<string> {
        const rows = await sql()`
          update designs
          set revision = revision + 1,
            updated_at = now() - ${minutesAgo * ONE_MINUTE_MS}::double precision * interval '1 millisecond'
          where id = ${designId}
          returning revision::text as revision
        `;
        return (rows[0] as { revision: string }).revision;
      },
      async markSeen(designId: string, displayedRevision: string) {
        const result = await store.markSeen({
          designId,
          displayedRevision,
          audit: auditRecordOf(staffMember, KITCHEN_SEEN),
        });
        if (result.kind !== "ok") throw new Error(`refused: ${result.kind}`);
        return result;
      },
      async aRequestAt(designId: string, designRevision: string) {
        const clientRequestId = nanoid();
        clientRequestIds.push(clientRequestId);
        await sql()`
          insert into contact_submissions (client_request_id, reference, design_id, design_revision, payload_digest,
            created_at, name, phone, phone_normal_form, locality, channel, email, consent_text_version, locale,
            design_document, priced)
          values (${clientRequestId}, ${`SEENAT-${tag.toUpperCase()}`}, ${designId}, ${designRevision}::bigint,
            ${randomBytes(32).toString("hex")}, ${era.toISOString()}::timestamptz, 'N', '+37360000001',
            '+37360000001', 'L', 'C', 'seenat@example.invalid', '1', 'ro', '{}'::jsonb, '{}'::jsonb)
        `;
      },
      async listed(designId: string, segment: StaffKitchenQuery["segment"]) {
        const page = await reader.listPage({
          segment,
          status: null,
          search: tag,
          page: 1,
        });
        const row = page.kitchens.find((kitchen) => kitchen.id === designId);
        if (row === undefined) throw new Error("the kitchen was not listed");
        return row;
      },
      async storedSeenAt(designId: string): Promise<Date> {
        const rows = await sql()`
          select (extract(epoch from seen_at) * 1000)::text as ms from design_staff_seen where design_id = ${designId}
        `;
        return new Date(Math.floor(Number((rows[0] as { ms: string }).ms)));
      },
    };
  }

  it("floors the seen instant to the millisecond, as every instant of the list is read", async () => {
    const world = await aWorld();
    const kitchen = await world.aKitchen(true);
    await world.sql()`
      insert into design_staff_seen (design_id, seen_revision, seen_by_account_id, seen_at)
      values (${kitchen}, 1, ${nanoid()}, '2026-10-20T07:05:00.123999Z'::timestamptz)
    `;

    const row = await world.listed(kitchen, "all");

    expect(row.seenAt?.toISOString()).toBe("2026-10-20T07:05:00.123Z");
  });

  it("reads a seen instant of infinity or before 1970 as the nearest instant a Date holds", async () => {
    const world = await aWorld();
    const farAhead = await world.aKitchen(true);
    const longAgo = await world.aKitchen(true);
    await world.sql()`
      insert into design_staff_seen (design_id, seen_revision, seen_by_account_id, seen_at)
      values (${farAhead}, 1, ${nanoid()}, 'infinity'::timestamptz),
        (${longAgo}, 1, ${nanoid()}, '1900-01-01T00:00:00Z'::timestamptz)
    `;

    const ahead = await world.listed(farAhead, "all");
    const ago = await world.listed(longAgo, "all");

    expect(ahead.seenAt?.getTime()).toBe(8.64e15);
    expect(ago.seenAt?.toISOString()).toBe("1900-01-01T00:00:00.000Z");
  });

  it("moves the seen instant with a mark that raises the revision and leaves it for an equal or an older one", async () => {
    const world = await aWorld();
    const kitchen = await world.aKitchen(true);
    const first = await world.save(kitchen, 10);
    const second = await world.save(kitchen, 10);

    await world.markSeen(kitchen, first);
    const afterFirstMark = await world.listed(kitchen, "all");
    await new Promise((settle) => setTimeout(settle, SETTLE_MS));
    await world.markSeen(kitchen, first);
    const afterEqualMark = await world.listed(kitchen, "all");
    await world.markSeen(kitchen, "1");
    const afterOlderMark = await world.listed(kitchen, "all");
    await new Promise((settle) => setTimeout(settle, SETTLE_MS));
    await world.markSeen(kitchen, second);
    const afterRisingMark = await world.listed(kitchen, "all");

    expect(afterEqualMark.seenAt?.getTime()).toBe(
      afterFirstMark.seenAt?.getTime(),
    );
    expect(afterOlderMark.seenAt?.getTime()).toBe(
      afterFirstMark.seenAt?.getTime(),
    );
    expect(afterRisingMark.seenAt?.getTime()).toBeGreaterThan(
      afterFirstMark.seenAt?.getTime() ?? Number.POSITIVE_INFINITY,
    );
    expect(afterRisingMark.seenAt).toEqual(await world.storedSeenAt(kitchen));
  });

  it("can hold a seen instant later than the change it reads as followed, when the save landed between a page's load and its mark", async () => {
    const world = await aWorld();
    const kitchen = await world.aKitchen(true);
    await world.save(kitchen, 10);

    const answer = await world.markSeen(kitchen, "1");
    const row = await world.listed(kitchen, "all");

    expect(answer.changedAfterSeen).toBe(true);
    expect(row.isChangedSinceSeen).toBe(true);
    expect(row.seenAt?.getTime()).toBeGreaterThan(row.updatedAt.getTime());
  });

  it("tells the mark's own instant for a mark below the latest request, which the changed judgement measures from instead", async () => {
    const world = await aWorld();
    const kitchen = await world.aKitchen(true);
    await world.aRequestAt(kitchen, "3");
    await world.save(kitchen, 10);
    await world.save(kitchen, 10);
    await world.save(kitchen, 10);

    await world.markSeen(kitchen, "1");
    const row = await world.listed(kitchen, "all");

    expect(row.isChangedSinceSeen).toBe(true);
    expect(row.seenAt).toEqual(await world.storedSeenAt(kitchen));
  });

  it("tells the seen instant of a draft an account holds, which never reads as changed", async () => {
    const world = await aWorld();
    const draft = await world.aKitchen(false);
    await world.save(draft, 10);

    await world.markSeen(draft, "1");
    const row = await world.listed(draft, "drafts");

    expect(row.isChangedSinceSeen).toBe(false);
    expect(row.seenAt).toEqual(await world.storedSeenAt(draft));
  });

  it("tells no seen instant for a kitchen nobody opened, and none for a mark above the kitchen's revision", async () => {
    const world = await aWorld();
    const unopened = await world.aKitchen(true);
    const marked = await world.aKitchen(true);
    await world.sql()`
      insert into design_staff_seen (design_id, seen_revision, seen_by_account_id)
      values (${marked}, 9, ${nanoid()})
    `;

    const never = await world.listed(unopened, "all");
    const ahead = await world.listed(marked, "all");

    expect(never.seenAt).toBeNull();
    expect(ahead.seenAt).toBeNull();
    expect(ahead.isChangedSinceSeen).toBe(false);
  });
});
