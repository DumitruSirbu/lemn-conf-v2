import { createHash, randomBytes } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import { afterAll, describe, expect, it } from "vitest";

import { NeonSessionStore } from "../src/neon-session-store.js";
import {
  countStaffFixturesForTests,
  newStaffFixtureMarker,
  plantStaffAccountForTests,
  plantStaffAuditEventForTests,
  plantStaffDesignForTests,
  plantStaffNoteForTests,
  plantStaffRequestForTests,
  plantStaffRequestStateForTests,
  removeStaffFixturesForTests,
} from "../src/staff-fixtures-for-tests.js";
import type { StaffFixtureCounts } from "../src/staff-fixtures-for-tests.js";
import { STAFF_VISIBLE_PREDICATE } from "../src/staff-kitchen-statements.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { holdSharedTestSchemaLock } from "./support/test-schema-lock.js";

// Shared: this file writes rows under markers only it mints and needs the schema intact while it does.
holdSharedTestSchemaLock();

const SUITE_NAME = "staff fixtures for tests (live test database)";
if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

const IDLE_LIFETIMES = {
  client: 2_592_000,
  operator: 43_200,
  administrator: 43_200,
};
const SHA256_BYTES = 32;
const ZERO_COUNTS: StaffFixtureCounts = {
  designNotes: 0,
  designRequestStates: 0,
  staffAuditEvents: 0,
  contactSubmissions: 0,
  designShareLinks: 0,
  designs: 0,
  accountSessions: 0,
  accountEmailTokens: 0,
  accounts: 0,
  rateLimitCounters: 0,
};

function randomDigest(): string {
  return randomBytes(SHA256_BYTES).toString("hex");
}

/** A Neon HTTP statement commits, so a leaked marker is removed by the marker, whatever failed first. */
const markersToSweep: string[] = [];

function freshMarker(): string {
  const marker = newStaffFixtureMarker();
  markersToSweep.push(marker);
  return marker;
}

describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  /** The test database's owner credential, opened per use: a skipped describe still runs this body. */
  const sql = () => neon(liveTestDatabaseUrl);

  afterAll(async () => {
    if (!isLiveTestDatabaseConfigured) return;
    for (const marker of markersToSweep) {
      await removeStaffFixturesForTests(marker);
    }
  });

  /** The rows only the application would write: random ids that point at planted rows. */
  async function writeLikeTheApplication(spec: {
    readonly operatorId: string;
    readonly clientId: string;
    readonly designId: string;
  }): Promise<void> {
    const appDesignId = nanoid();
    await sql()`
      insert into designs (id, schema_version, document, account_id, sent_at)
      values (${appDesignId}, 1, '{}'::jsonb, ${spec.clientId}, now())
    `;
    await sql()`insert into design_share_links (token_hash, design_id) values (${randomDigest()}, ${appDesignId})`;
    await sql()`
      insert into design_notes (id, design_id, author_account_id, body)
      values (${nanoid()}, ${appDesignId}, ${spec.operatorId}, 'written by the application')
    `;
    await sql()`
      insert into staff_audit_events (id, actor_account_id, action, design_id)
      values (${nanoid()}, ${spec.operatorId}, 'kitchen-opened', ${spec.designId})
    `;
    await sql()`
      insert into staff_audit_events (id, actor_account_id, action)
      values (${nanoid()}, ${spec.operatorId}, 'kitchens-listed')
    `;
    await sql()`
      insert into account_sessions (token_hash, account_id, absolute_expires_at)
      values (${randomDigest()}, ${spec.clientId}, now() + interval '1 day')
    `;
    await sql()`
      insert into account_email_tokens (token_hash, account_id, purpose, expires_at)
      values (${randomDigest()}, ${spec.clientId}, 'confirm-email', now() + interval '1 day')
    `;
  }

  it("plants a staff scenario, counts a row in every table, and removes every row by its marker", async () => {
    const marker = freshMarker();
    const operatorToken = randomBytes(SHA256_BYTES).toString("hex");
    const operatorHash = createHash("sha256")
      .update(operatorToken)
      .digest("hex");
    const rateLimitKey = randomDigest();
    const operator = await plantStaffAccountForTests(marker, {
      role: "operator",
      sessionTokenHash: operatorHash,
    });
    const client = await plantStaffAccountForTests(marker, { role: "client" });
    const designId = await plantStaffDesignForTests(marker, {
      kind: "visible",
      ownerAccountId: client.accountId,
    });
    await plantStaffRequestForTests(marker, { designId });
    await plantStaffRequestStateForTests(marker, {
      designId,
      status: "contacted",
      changedByAccountId: operator.accountId,
    });
    await plantStaffNoteForTests(marker, {
      designId,
      authorAccountId: operator.accountId,
      body: "planted note",
    });
    await plantStaffAuditEventForTests(marker, {
      actorAccountId: operator.accountId,
      action: "note-added",
      designId,
    });
    await writeLikeTheApplication({
      operatorId: operator.accountId,
      clientId: client.accountId,
      designId,
    });
    await sql()`
      insert into rate_limit_counters (bucket_key, window_start, window_end, hits)
      values (${rateLimitKey}, now(), now() + interval '1 hour', 1)
    `;
    const scope = { rateLimitKeys: [rateLimitKey] };

    const planted = await countStaffFixturesForTests(marker, scope);
    const removed = await removeStaffFixturesForTests(marker, scope);
    const leaked = await countStaffFixturesForTests(marker, scope);

    expect(planted).toEqual({
      designNotes: 2,
      designRequestStates: 1,
      staffAuditEvents: 3,
      contactSubmissions: 1,
      designShareLinks: 1,
      designs: 2,
      accountSessions: 2,
      accountEmailTokens: 1,
      accounts: 2,
      rateLimitCounters: 1,
    });
    expect(removed).toEqual(planted);
    expect(leaked).toEqual(ZERO_COUNTS);
  });

  it("plants an account with its role, a verified address and a session the session store reads as live", async () => {
    const marker = freshMarker();
    const tokenHash = randomDigest();
    const administrator = await plantStaffAccountForTests(marker, {
      role: "administrator",
      sessionTokenHash: tokenHash,
    });

    const lookup = await new NeonSessionStore(liveTestDatabaseUrl).findLive({
      tokenHash,
      idleLifetimeSeconds: IDLE_LIFETIMES,
    });

    expect(lookup.kind).toBe("live");
    if (lookup.kind !== "live") return;
    expect(lookup.account).toEqual({
      id: administrator.accountId,
      email: administrator.email,
      role: "administrator",
      isEmailVerified: true,
    });
    await removeStaffFixturesForTests(marker);
    expect(
      (
        await new NeonSessionStore(liveTestDatabaseUrl).findLive({
          tokenHash,
          idleLifetimeSeconds: IDLE_LIFETIMES,
        })
      ).kind,
    ).toBe("none");
  });

  it("plants the four kinds of kitchen so that staff see the visible and the hidden, and neither the deleted nor the visitor's draft", async () => {
    const marker = freshMarker();
    const client = await plantStaffAccountForTests(marker, { role: "client" });
    const visible = await plantStaffDesignForTests(marker, {
      kind: "visible",
      ownerAccountId: client.accountId,
    });
    const hidden = await plantStaffDesignForTests(marker, { kind: "hidden" });
    const deleted = await plantStaffDesignForTests(marker, {
      kind: "client-deleted",
    });
    const draft = await plantStaffDesignForTests(marker, {
      kind: "visitor-draft",
    });

    const rows = (await sql().query(
      `select d.id, (d.hidden_by_client_at is not null) as is_hidden from designs d
       where d.id = any($1) and ${STAFF_VISIBLE_PREDICATE}`,
      [[visible, hidden, deleted, draft]],
    )) as { id: string; is_hidden: boolean }[];
    const hiddenById = new Map(rows.map((row) => [row.id, row.is_hidden]));

    expect(hiddenById).toEqual(
      new Map([
        [visible, false],
        [hidden, true],
      ]),
    );
    await removeStaffFixturesForTests(marker);
  });

  it("removes only the rows of its own marker, leaving a neighbour's scenario whole", async () => {
    const mine = freshMarker();
    const neighbour = freshMarker();
    await plantStaffAccountForTests(mine, { role: "operator" });
    const neighbourOperator = await plantStaffAccountForTests(neighbour, {
      role: "operator",
      sessionTokenHash: randomDigest(),
    });
    await plantStaffDesignForTests(neighbour, {
      kind: "visible",
      ownerAccountId: neighbourOperator.accountId,
    });

    await removeStaffFixturesForTests(mine);

    expect(await countStaffFixturesForTests(mine)).toEqual(ZERO_COUNTS);
    expect(await countStaffFixturesForTests(neighbour)).toEqual({
      ...ZERO_COUNTS,
      designs: 1,
      accounts: 1,
      accountSessions: 1,
    });
    await removeStaffFixturesForTests(neighbour);
  });

  it("finds that deleting an account alone leaves its kitchen behind, which is why removal names designs by owner", async () => {
    const marker = freshMarker();
    const client = await plantStaffAccountForTests(marker, { role: "client" });
    const appDesignId = nanoid();
    await sql()`
      insert into designs (id, schema_version, document, account_id) values (${appDesignId}, 1, '{}'::jsonb, ${client.accountId})
    `;
    await sql()`delete from accounts where id = ${client.accountId}`;

    const survivors =
      await sql()`select id from designs where id = ${appDesignId}`;

    expect(survivors).toHaveLength(1);
    await sql()`delete from designs where id = ${appDesignId}`;
  });

  it("removes nothing and answers zero for a marker that holds nothing, repeatedly", async () => {
    const marker = freshMarker();

    expect(await removeStaffFixturesForTests(marker)).toEqual(ZERO_COUNTS);
    expect(await removeStaffFixturesForTests(marker)).toEqual(ZERO_COUNTS);
  });
});
