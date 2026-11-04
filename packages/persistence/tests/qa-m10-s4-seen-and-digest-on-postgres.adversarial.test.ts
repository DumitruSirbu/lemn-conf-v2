import { randomBytes } from "node:crypto";

import { fc } from "@fast-check/vitest";
import {
  CURRENT_SCHEMA_VERSION,
  DIGEST_STOPPING_STATUSES,
  DIGEST_WINDOW_MS,
  KITCHEN_L_DESIGN,
  isDigestEligible,
} from "@lemnaria/configurator-domain";
import type {
  RequestStatus,
  StaffKitchenQuery,
} from "@lemnaria/configurator-domain";
import type { Client } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { listDigestEligibleStatement } from "../src/kitchen-change-statements.js";
import {
  DashboardStoreError,
  DISPLAYED_REVISION_AHEAD,
} from "../src/m10-ports.js";
import type { DigestEligibleKitchen } from "../src/m10-ports.js";
import { NeonKitchenChangeStore } from "../src/neon-kitchen-change-store.js";
import { NeonStaffKitchenReader } from "../src/neon-staff-kitchen-reader.js";
import { openDatabaseSession } from "../src/open-database.js";
import { StaffKitchenReaderError } from "../src/staff-kitchen-reader.js";
import {
  KITCHEN_SEEN,
  auditRecordOf,
} from "./support/dashboard-contract-support.js";
import type { DashboardStaffMember } from "./support/dashboard-contract-support.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { REAL_SNAPSHOTS } from "./support/qa-8i-real-snapshots.js";
import { rejectionOf } from "./support/rejection-of.js";
import { holdSharedTestSchemaLock } from "./support/test-schema-lock.js";

// Shared: every write below happens inside a transaction that is rolled back, so the file needs the schema intact and
// leaves nothing behind (the rounds and entries it claims included).
holdSharedTestSchemaLock();

/**
 * Adversarial QA of M10 wave S4 (the seen mark, the digest's list and record, the staff kitchen reader's additions),
 * against the statements the stores really send, on a real Postgres.
 *
 * **How the production SQL runs here.** As `qa-l3-s4-statements-on-postgres.adversarial.test.ts` does: each store takes
 * its `sql` from the driver's tagged template, and this file swaps in a tag that sends the same text and parameters over
 * a session on which a transaction is open, so the statements tested are the ones the stores send and nothing a test
 * writes survives. The session is the test database's owner: this file shows what the statements do with rows, and
 * `application-role-privileges.test.ts` shows what the application role may do.
 *
 * **Isolation.** The digest lists over the whole `designs` table, and the changed count is global, so no assertion here
 * is about a whole-table figure: a membership test looks at the kitchens this file planted, and a count is compared with
 * a figure read in the same transaction before the planting (repeatable read, one snapshot).
 *
 * **Mutation proof.** The statements were rewritten with one change at a time (the greatest of two revisions dropped,
 * the strict comparison made inclusive, the window edge made inclusive, `interval '30 days'` for the exact window, the
 * database clock for the passed instant, the hold dropped) and each change turned at least one test here red.
 */
const SUITE_NAME =
  "seen mark and digest statements on a real Postgres (live test database, M10 wave S4)";
if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

const PASSWORD_HASH = `$argon2id$v=19$m=19456,t=2,p=1$${"A".repeat(22)}$${"B".repeat(43)}`;
const IDLE_LIFETIMES = {
  client: 2_592_000,
  operator: 43_200,
  administrator: 43_200,
};
const ONE_HOUR_MS = 3_600_000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;
const NOW = new Date("2026-11-10T08:00:00.000Z");
const A_ROUND = "3500-01-01";
const ANOTHER_ROUND = "3500-01-02";
const LONG_AGO = new Date("2020-01-01T00:00:00.000Z");
const WIDEST_REVISION = "9223372036854775807";

type Row = Record<string, unknown>;
type Role = "administrator" | "operator" | "client";

let client: Client;
let sentStatements: string[] = [];

// ---------------------------------------------------------------------------------------------------------------------
// The harness: the production statements over a transaction that is rolled back
// ---------------------------------------------------------------------------------------------------------------------

function textOf(strings: TemplateStringsArray): string {
  return strings.reduce(
    (built, part, index) =>
      `${built}${index === 0 ? "" : `$${String(index)}`}${part}`,
    "",
  );
}

function tagOverTransaction(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<Row[]> {
  const text = textOf(strings);
  sentStatements.push(text);
  return client
    .query(text, values as never[])
    .then((reply) => reply.rows as Row[]);
}

function storeOverTransaction(): NeonKitchenChangeStore {
  const store = new NeonKitchenChangeStore(liveTestDatabaseUrl);
  Object.assign(store, { sql: tagOverTransaction });
  return store;
}

function readerOverTransaction(): NeonStaffKitchenReader {
  const reader = new NeonStaffKitchenReader(liveTestDatabaseUrl);
  Object.assign(reader, { sql: tagOverTransaction });
  return reader;
}

async function run(text: string, values: readonly unknown[] = []) {
  const reply = await client.query(text, [...values] as never[]);
  return reply.rows as Row[];
}

async function inARolledBackTransaction<Result>(
  body: () => Promise<Result>,
): Promise<Result> {
  await run("begin isolation level repeatable read");
  try {
    return await body();
  } finally {
    await run("rollback");
  }
}

beforeAll(async () => {
  if (!isLiveTestDatabaseConfigured) return;
  client = openDatabaseSession(liveTestDatabaseUrl, "TEST_DATABASE_URL");
  await client.connect();
});

afterAll(async () => {
  if (!isLiveTestDatabaseConfigured) return;
  await client.end();
});

// ---------------------------------------------------------------------------------------------------------------------
// Planting
// ---------------------------------------------------------------------------------------------------------------------

function randomToken(): string {
  return randomBytes(6).toString("hex");
}

function isoOf(instant: Date | null): string | null {
  return instant === null ? null : instant.toISOString();
}

async function anAccount(
  name: string | null,
  token = randomToken(),
): Promise<string> {
  const accountId = nanoid();
  const email = `s4qa-${token}-${accountId.toLowerCase()}@example.invalid`;
  await run(
    `insert into accounts (id, email, email_normal_form, password_hash, role, locale, privacy_notice_version, name)
     values ($1, $2, $2, $3, 'client', 'ro', '1', $4)`,
    [accountId, email, PASSWORD_HASH, name],
  );
  return accountId;
}

async function aStaffMember(
  role: Role = "administrator",
): Promise<DashboardStaffMember> {
  const accountId = nanoid();
  const email = `s4qa-staff-${accountId.toLowerCase()}@example.invalid`;
  await run(
    `insert into accounts (id, email, email_normal_form, password_hash, role, locale, privacy_notice_version)
     values ($1, $2, $2, $3, $4, 'ro', '1')`,
    [accountId, email, PASSWORD_HASH, role],
  );
  const sessionTokenHash = randomBytes(32).toString("hex");
  await run(
    `insert into account_sessions (token_hash, account_id, absolute_expires_at)
     values ($1, $2, now() + interval '30 days')`,
    [sessionTokenHash, accountId],
  );
  return {
    accountId,
    session: { sessionTokenHash, idleLifetimeSeconds: IDLE_LIFETIMES },
  };
}

interface PlantedRequest {
  readonly revision: number;
  readonly createdAt?: Date;
  readonly clientRequestId?: string;
  readonly reference?: string;
  readonly priced?: unknown;
}

interface KitchenSpec {
  readonly revision?: number;
  readonly sentAt?: Date | null;
  readonly accountName?: string | null;
  readonly hasAccount?: boolean;
  readonly isDeleted?: boolean;
  readonly isHidden?: boolean;
  readonly kitchenName?: string | null;
  readonly requests?: readonly PlantedRequest[];
  readonly status?: RequestStatus;
  readonly seenRevision?: number;
  readonly emailToken?: string;
}

interface PlantedKitchen {
  readonly id: string;
  readonly accountId: string | null;
}

const A_SENT_INSTANT = new Date("2026-11-01T08:00:00.000Z");

/** A kitchen at `revision` (default 1), sent at `sentAt` (default a week before `NOW`; `null` for a draft). */
async function aKitchen(spec: KitchenSpec = {}): Promise<PlantedKitchen> {
  const id = nanoid();
  const revision = spec.revision ?? 1;
  const sentAt = spec.sentAt === undefined ? A_SENT_INSTANT : spec.sentAt;
  const accountId =
    (spec.hasAccount ?? true)
      ? await anAccount(spec.accountName ?? null, spec.emailToken)
      : null;
  await run(
    `insert into designs (id, schema_version, document, account_id, name, sent_at, updated_at, revision,
       hidden_by_client_at, deleted_by_client_at)
     values ($1, $2, $3::jsonb, $4, $5, $6::timestamptz, coalesce($6::timestamptz, now()), $7::bigint,
       case when $8::boolean then now() end, case when $9::boolean then now() end)`,
    [
      id,
      CURRENT_SCHEMA_VERSION,
      JSON.stringify(KITCHEN_L_DESIGN),
      accountId,
      spec.kitchenName ?? null,
      isoOf(sentAt),
      String(revision),
      spec.isHidden ?? false,
      spec.isDeleted ?? false,
    ],
  );
  const requests = spec.requests ?? (sentAt === null ? [] : [{ revision: 1 }]);
  for (const request of requests) await aRequest(id, request, sentAt);
  if (spec.status !== undefined) {
    await run(
      `insert into design_request_states (design_id, status, changed_by_account_id) values ($1, $2, $3)`,
      [id, spec.status, accountId ?? nanoid()],
    );
  }
  if (spec.seenRevision !== undefined) {
    await run(
      `insert into design_staff_seen (design_id, seen_revision, seen_by_account_id) values ($1, $2::bigint, $3)`,
      [id, String(spec.seenRevision), nanoid()],
    );
  }
  return { id, accountId };
}

async function aRequest(
  designId: string,
  request: PlantedRequest,
  sentAt: Date | null,
): Promise<void> {
  const createdAt = request.createdAt ?? sentAt ?? NOW;
  await run(
    `insert into contact_submissions (client_request_id, reference, design_id, design_revision, payload_digest,
       created_at, name, phone, phone_normal_form, locality, channel, consent_text_version, locale, design_document,
       priced)
     values ($1, $2, $3, $4::bigint, $5, $6::timestamptz, 'Typed Name', '+37360777555', '+37360777555', 'Chisinau',
       'phone', '1', 'ro', '{}'::jsonb, $7::jsonb)`,
    [
      request.clientRequestId ?? nanoid(),
      request.reference ?? `S4Q-${randomToken().toUpperCase()}`,
      designId,
      String(request.revision),
      randomBytes(32).toString("hex"),
      createdAt.toISOString(),
      JSON.stringify(request.priced ?? {}),
    ],
  );
}

async function aClaimedRound(dayKey: string): Promise<void> {
  await run(
    `insert into staff_change_digest_rounds (day_key) values ($1) on conflict (day_key) do nothing`,
    [dayKey],
  );
}

async function anEntry(
  dayKey: string,
  designId: string,
  revision: number,
): Promise<void> {
  await run(
    `insert into staff_change_digest_entries (day_key, design_id, revision) values ($1, $2, $3::bigint)`,
    [dayKey, designId, String(revision)],
  );
}

async function saveKitchen(designId: string): Promise<void> {
  await run(`update designs set revision = revision + 1 where id = $1`, [
    designId,
  ]);
}

async function seenRowOf(designId: string): Promise<Row | undefined> {
  const rows = await run(
    `select seen_revision::text as revision, seen_by_account_id, seen_at from design_staff_seen where design_id = $1`,
    [designId],
  );
  return rows[0];
}

async function auditRowsFor(designId: string): Promise<number> {
  const rows = await run(
    `select id from staff_audit_events where design_id = $1 and action = 'kitchen-seen'`,
    [designId],
  );
  return rows.length;
}

async function stampSeenAtLongAgo(designId: string): Promise<void> {
  await run(
    `update design_staff_seen set seen_at = $2::timestamptz where design_id = $1`,
    [designId, LONG_AGO.toISOString()],
  );
}

function markOf(
  member: DashboardStaffMember,
  designId: string,
  displayedRevision: string | number,
) {
  return storeOverTransaction().markSeen({
    designId,
    displayedRevision: String(displayedRevision),
    audit: auditRowOf(member),
  });
}

function auditRowOf(member: DashboardStaffMember) {
  return auditRecordOf(member, KITCHEN_SEEN);
}

function queryOf(
  overrides: Partial<StaffKitchenQuery> = {},
): StaffKitchenQuery {
  return { segment: "sent", status: null, search: null, page: 1, ...overrides };
}

async function detailOf(designId: string) {
  const reading = await readerOverTransaction().readOne(designId);
  if (reading.kind !== "found") throw new Error("the kitchen was not found");
  return reading.kitchen;
}

async function digestAmong(
  kitchens: readonly PlantedKitchen[],
  now: Date = NOW,
): Promise<DigestEligibleKitchen[]> {
  const listed = await storeOverTransaction().listDigestEligible(now);
  const ids = new Set(kitchens.map(({ id }) => id));
  return listed.filter(({ designId }) => ids.has(designId));
}

/** Every place a kitchen's "changed" is read must say `isChanged`, and the digest lists it exactly when `isEligible`. */
async function expectAgreement(
  kitchen: PlantedKitchen,
  token: string,
  expected: { isChanged: boolean; isEligible: boolean },
) {
  const reader = readerOverTransaction();
  const detail = await detailOf(kitchen.id);
  const listed = await reader.listPage(
    queryOf({ segment: "all", search: token }),
  );
  const filtered = await reader.listPage(
    queryOf({ segment: "all", search: token, onlyChanged: true }),
  );
  const digested = await digestAmong([kitchen]);

  expect(detail.isChangedSinceSeen).toBe(expected.isChanged);
  expect(listed.kitchens.map((k) => k.isChangedSinceSeen)).toEqual([
    expected.isChanged,
  ]);
  expect(filtered.total).toBe(expected.isChanged ? 1 : 0);
  expect(digested).toHaveLength(expected.isEligible ? 1 : 0);
}

// ---------------------------------------------------------------------------------------------------------------------
// The seen mark
// ---------------------------------------------------------------------------------------------------------------------

describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  describe("a seen mark never lowers the mark, and moves the account and the instant only upward", () => {
    it("ends at the greatest revision of any order of marks, with one audit row for each mark admitted", async () => {
      await inARolledBackTransaction(async () => {
        const member = await aStaffMember();
        const kitchen = await aKitchen({ revision: 4 });
        const marks = [2, 4, 1, 3, 4, 2];

        for (const displayed of marks)
          await markOf(member, kitchen.id, displayed);

        expect((await seenRowOf(kitchen.id))?.["revision"]).toBe("4");
        expect(await auditRowsFor(kitchen.id)).toBe(marks.length);
      });
    });

    it("changes the account and the instant for a strictly greater revision, and for no equal or lower one", async () => {
      await inARolledBackTransaction(async () => {
        const first = await aStaffMember();
        const second = await aStaffMember("operator");
        const kitchen = await aKitchen({ revision: 5 });
        await markOf(first, kitchen.id, 3);
        await stampSeenAtLongAgo(kitchen.id);

        await markOf(second, kitchen.id, 3);
        const afterEqual = await seenRowOf(kitchen.id);
        await markOf(second, kitchen.id, 2);
        const afterLower = await seenRowOf(kitchen.id);
        await markOf(second, kitchen.id, 4);
        const afterGreater = await seenRowOf(kitchen.id);

        for (const kept of [afterEqual, afterLower]) {
          expect(kept?.["revision"]).toBe("3");
          expect(kept?.["seen_by_account_id"]).toBe(first.accountId);
          expect(new Date(kept?.["seen_at"] as string).toISOString()).toBe(
            LONG_AGO.toISOString(),
          );
        }
        expect(afterGreater?.["revision"]).toBe("4");
        expect(afterGreater?.["seen_by_account_id"]).toBe(second.accountId);
        expect(
          new Date(afterGreater?.["seen_at"] as string).getTime(),
        ).toBeGreaterThan(LONG_AGO.getTime());
      });
    });

    it("leaves a kitchen neither changed nor held when a stale mark follows a digest of the revision seen, and eligible after the next save", async () => {
      await inARolledBackTransaction(async () => {
        const member = await aStaffMember();
        const kitchen = await aKitchen({
          revision: 2,
          requests: [{ revision: 1 }],
        });
        const store = storeOverTransaction();
        await markOf(member, kitchen.id, 2);
        await store.claimDigestDay(A_ROUND);
        await store.recordDigested(A_ROUND, [
          { designId: kitchen.id, revision: "2" },
        ]);

        const stale = await markOf(member, kitchen.id, 1);

        expect(stale).toEqual({ kind: "ok", changedAfterSeen: false });
        expect(await digestAmong([kitchen])).toEqual([]);
        await saveKitchen(kitchen.id);
        expect(await digestAmong([kitchen])).toHaveLength(1);
      });
    });
  });

  describe("the effective seen revision is the greater of the seen mark and the latest request's revision (S-c0)", () => {
    it("leaves a kitchen sent at revision 3 unchanged and out of the digest after a stale first mark at 1, in every place, and eligible after the next save", async () => {
      await inARolledBackTransaction(async () => {
        const member = await aStaffMember();
        const token = randomToken();
        const reader = readerOverTransaction();
        const baseline = (await reader.listPage(queryOf())).changedCount;
        const kitchen = await aKitchen({
          emailToken: token,
          revision: 3,
          requests: [{ revision: 3 }],
        });

        const answer = await markOf(member, kitchen.id, 1);

        expect(answer).toEqual({ kind: "ok", changedAfterSeen: false });
        expect((await seenRowOf(kitchen.id))?.["revision"]).toBe("1");
        await expectAgreement(kitchen, token, {
          isChanged: false,
          isEligible: false,
        });
        expect((await reader.listPage(queryOf())).changedCount).toBe(baseline);
        await saveKitchen(kitchen.id);
        await expectAgreement(kitchen, token, {
          isChanged: true,
          isEligible: true,
        });
        expect((await reader.listPage(queryOf())).changedCount).toBe(
          baseline + 1,
        );
        expect(await markOf(member, kitchen.id, 4)).toEqual({
          kind: "ok",
          changedAfterSeen: false,
        });
        await expectAgreement(kitchen, token, {
          isChanged: false,
          isEligible: false,
        });
      });
    });

    it("measures from the mark when it is above the sent revision, and from the sent revision when the mark is below or equal to it", async () => {
      await inARolledBackTransaction(async () => {
        const member = await aStaffMember();
        const cases = [
          { mark: 2, sent: 3, current: 5, isChanged: true },
          { mark: 3, sent: 3, current: 5, isChanged: true },
          { mark: 4, sent: 3, current: 5, isChanged: true },
          { mark: 5, sent: 3, current: 5, isChanged: false },
          { mark: 2, sent: 5, current: 5, isChanged: false },
          { mark: 4, sent: 5, current: 5, isChanged: false },
          { mark: 4, sent: 4, current: 4, isChanged: false },
        ];
        for (const { mark, sent, current, isChanged } of cases) {
          const token = randomToken();
          const kitchen = await aKitchen({
            emailToken: token,
            revision: current,
            requests: [{ revision: sent }],
          });

          const answer = await markOf(member, kitchen.id, mark);

          expect(answer, JSON.stringify({ mark, sent, current })).toEqual({
            kind: "ok",
            changedAfterSeen: isChanged,
          });
          await expectAgreement(kitchen, token, {
            isChanged,
            isEligible: isChanged,
          });
        }
      });
    });

    it("takes the sent revision for the mark's answer from the same request the list, the detail and the digest take when two requests share an instant", async () => {
      await inARolledBackTransaction(async () => {
        const member = await aStaffMember();
        const sameInstant = new Date("2026-11-02T08:00:00.000Z");
        const sentAtFive = await aKitchen({
          revision: 5,
          requests: [
            {
              revision: 4,
              createdAt: sameInstant,
              clientRequestId: "c".repeat(21),
            },
            {
              revision: 5,
              createdAt: sameInstant,
              clientRequestId: "x".repeat(21),
            },
          ],
        });
        const sentAtFour = await aKitchen({
          revision: 5,
          requests: [
            {
              revision: 5,
              createdAt: sameInstant,
              clientRequestId: "d".repeat(21),
            },
            {
              revision: 4,
              createdAt: sameInstant,
              clientRequestId: "w".repeat(21),
            },
          ],
        });

        const unchanged = await markOf(member, sentAtFive.id, 1);
        const changed = await markOf(member, sentAtFour.id, 1);

        expect(unchanged).toEqual({ kind: "ok", changedAfterSeen: false });
        expect(changed).toEqual({ kind: "ok", changedAfterSeen: true });
        expect((await detailOf(sentAtFive.id)).isChangedSinceSeen).toBe(false);
        expect((await detailOf(sentAtFour.id)).isChangedSinceSeen).toBe(true);
      });
    });

    it("reads a mark on a sent kitchen that has no request as the mark alone", async () => {
      await inARolledBackTransaction(async () => {
        const member = await aStaffMember();
        const token = randomToken();
        const kitchen = await aKitchen({
          emailToken: token,
          revision: 3,
          requests: [],
        });

        const answer = await markOf(member, kitchen.id, 1);

        expect(answer).toEqual({ kind: "ok", changedAfterSeen: true });
        expect((await detailOf(kitchen.id)).isChangedSinceSeen).toBe(true);
      });
    });

    it("takes a request sent after the mark as the new floor, so a new request at the current revision clears the badge a lower mark left", async () => {
      await inARolledBackTransaction(async () => {
        const member = await aStaffMember();
        const token = randomToken();
        const kitchen = await aKitchen({
          emailToken: token,
          revision: 3,
          requests: [{ revision: 3 }],
        });
        await saveKitchen(kitchen.id);
        await saveKitchen(kitchen.id);
        await markOf(member, kitchen.id, 4);
        await expectAgreement(kitchen, token, {
          isChanged: true,
          isEligible: true,
        });

        await aRequest(
          kitchen.id,
          { revision: 5, createdAt: new Date(NOW.getTime() + 1000) },
          A_SENT_INSTANT,
        );

        await expectAgreement(kitchen, token, {
          isChanged: false,
          isEligible: false,
        });
      });
    });

    it("keeps a digested revision held against a stale first mark, and lets a later save through", async () => {
      await inARolledBackTransaction(async () => {
        const member = await aStaffMember();
        const token = randomToken();
        const kitchen = await aKitchen({
          emailToken: token,
          revision: 4,
          requests: [{ revision: 3 }],
        });
        const store = storeOverTransaction();
        await expectAgreement(kitchen, token, {
          isChanged: true,
          isEligible: true,
        });
        await store.claimDigestDay(A_ROUND);
        await store.recordDigested(A_ROUND, [
          { designId: kitchen.id, revision: "4" },
        ]);
        await expectAgreement(kitchen, token, {
          isChanged: true,
          isEligible: false,
        });

        await markOf(member, kitchen.id, 1);
        await expectAgreement(kitchen, token, {
          isChanged: true,
          isEligible: false,
        });
        await markOf(member, kitchen.id, 4);
        await expectAgreement(kitchen, token, {
          isChanged: false,
          isEligible: false,
        });
        await saveKitchen(kitchen.id);

        await expectAgreement(kitchen, token, {
          isChanged: true,
          isEligible: true,
        });
      });
    });
  });

  describe("a seen mark above the kitchen's revision is ignored, and a mark at it hides only until the next save", () => {
    it("leaves an unchanged kitchen unchanged in every place when its stored mark is above its revision, and never hides a change", async () => {
      await inARolledBackTransaction(async () => {
        const reader = readerOverTransaction();
        const baseline = (await reader.listPage(queryOf())).changedCount;
        const unchangedToken = randomToken();
        const changedToken = randomToken();
        const unchanged = await aKitchen({
          emailToken: unchangedToken,
          revision: 3,
          requests: [{ revision: 3 }],
          seenRevision: 9,
        });
        const changed = await aKitchen({
          emailToken: changedToken,
          revision: 4,
          requests: [{ revision: 3 }],
          seenRevision: 9,
        });
        const noRequest = await aKitchen({
          emailToken: randomToken(),
          revision: 4,
          requests: [],
          seenRevision: 9,
        });

        await expectAgreement(unchanged, unchangedToken, {
          isChanged: false,
          isEligible: false,
        });
        await expectAgreement(changed, changedToken, {
          isChanged: true,
          isEligible: true,
        });
        expect((await detailOf(noRequest.id)).isChangedSinceSeen).toBe(false);
        expect((await reader.listPage(queryOf())).changedCount).toBe(
          baseline + 1,
        );
      });
    });

    it("answers a mark on a kitchen whose stored mark is above its revision from the request alone", async () => {
      await inARolledBackTransaction(async () => {
        const member = await aStaffMember();
        const token = randomToken();
        const unchanged = await aKitchen({
          emailToken: token,
          revision: 3,
          requests: [{ revision: 3 }],
          seenRevision: 9,
        });
        const changed = await aKitchen({
          revision: 4,
          requests: [{ revision: 3 }],
          seenRevision: 9,
        });

        const first = await markOf(member, unchanged.id, 3);
        const second = await markOf(member, changed.id, 3);

        expect(first).toEqual({ kind: "ok", changedAfterSeen: false });
        expect(second).toEqual({ kind: "ok", changedAfterSeen: true });
        expect((await seenRowOf(unchanged.id))?.["revision"]).toBe("9");
      });
    });

    it("measures from the request while the mark is above the kitchen, and from the mark once the kitchen has caught up to it", async () => {
      await inARolledBackTransaction(async () => {
        const token = randomToken();
        const kitchen = await aKitchen({
          emailToken: token,
          revision: 3,
          requests: [{ revision: 3 }],
          seenRevision: 5,
        });
        await expectAgreement(kitchen, token, {
          isChanged: false,
          isEligible: false,
        });
        await saveKitchen(kitchen.id);
        await expectAgreement(kitchen, token, {
          isChanged: true,
          isEligible: true,
        });
        await saveKitchen(kitchen.id);
        await expectAgreement(kitchen, token, {
          isChanged: false,
          isEligible: false,
        });
        await saveKitchen(kitchen.id);
        await expectAgreement(kitchen, token, {
          isChanged: true,
          isEligible: true,
        });
      });
    });

    it("hides a change from a mark at the current revision until the next save", async () => {
      await inARolledBackTransaction(async () => {
        const member = await aStaffMember();
        const token = randomToken();
        const kitchen = await aKitchen({
          emailToken: token,
          revision: 4,
          requests: [{ revision: 3 }],
        });
        await expectAgreement(kitchen, token, {
          isChanged: true,
          isEligible: true,
        });

        await markOf(member, kitchen.id, 4);
        await expectAgreement(kitchen, token, {
          isChanged: false,
          isEligible: false,
        });
        await saveKitchen(kitchen.id);

        await expectAgreement(kitchen, token, {
          isChanged: true,
          isEligible: true,
        });
      });
    });
  });

  describe("a digest entry holds a kitchen only at a revision the kitchen has reached", () => {
    it("holds for an entry between the effective seen revision and the kitchen's own, inclusive of the kitchen's, and for none outside it", async () => {
      await inARolledBackTransaction(async () => {
        await aClaimedRound(A_ROUND);
        const cases = [
          { entry: 3, isHeld: false },
          { entry: 4, isHeld: true },
          { entry: 5, isHeld: true },
          { entry: 6, isHeld: false },
          { entry: 9, isHeld: false },
        ];
        for (const { entry, isHeld } of cases) {
          const token = randomToken();
          const kitchen = await aKitchen({
            emailToken: token,
            revision: 5,
            requests: [{ revision: 3 }],
          });
          await anEntry(A_ROUND, kitchen.id, entry);

          await expectAgreement(kitchen, token, {
            isChanged: true,
            isEligible: !isHeld,
          });
        }
      });
    });

    it("lets a kitchen through that an entry above its revision once held, after the kitchen's own saves", async () => {
      await inARolledBackTransaction(async () => {
        await aClaimedRound(A_ROUND);
        const token = randomToken();
        const kitchen = await aKitchen({
          emailToken: token,
          revision: 4,
          requests: [{ revision: 3 }],
        });
        await anEntry(A_ROUND, kitchen.id, 6);
        await expectAgreement(kitchen, token, {
          isChanged: true,
          isEligible: true,
        });

        await saveKitchen(kitchen.id);
        await saveKitchen(kitchen.id);

        await expectAgreement(kitchen, token, {
          isChanged: true,
          isEligible: false,
        });
      });
    });
  });

  describe("the digest skips a row with nothing to name the customer by and lists the others", () => {
    it("lists the named kitchens of a day that also holds one with neither an account name nor a request reference", async () => {
      await inARolledBackTransaction(async () => {
        const member = await aStaffMember();
        const named = await aKitchen({ revision: 3, accountName: "Ana Pop" });
        const referenced = await aKitchen({ revision: 3 });
        const nameless = await aKitchen({ revision: 3, requests: [] });
        const spaces = await aKitchen({
          revision: 3,
          requests: [],
          accountName: "   ",
        });
        const anonymous = await aKitchen({
          revision: 3,
          requests: [],
          hasAccount: false,
        });
        for (const kitchen of [nameless, spaces, anonymous]) {
          await markOf(member, kitchen.id, 1);
        }

        const listed = await digestAmong([
          named,
          referenced,
          nameless,
          spaces,
          anonymous,
        ]);

        expect(listed.map((k) => k.designId).sort()).toEqual(
          [named.id, referenced.id].sort(),
        );
      });
    });

    it("leaves such a row out in the statement itself, so the store's own skip is a second guard and not the only one", async () => {
      await inARolledBackTransaction(async () => {
        const member = await aStaffMember();
        const nameless = await aKitchen({ revision: 3, requests: [] });
        const named = await aKitchen({ revision: 3, accountName: "Ana Pop" });
        await markOf(member, nameless.id, 1);

        const rows = await listDigestEligibleStatement(tagOverTransaction, {
          nowIso: NOW.toISOString(),
          windowMilliseconds: DIGEST_WINDOW_MS,
          stoppingStatuses: DIGEST_STOPPING_STATUSES,
        });

        const ids = rows.map((row) => row["design_id"]);
        expect(ids).toContain(named.id);
        expect(ids).not.toContain(nameless.id);
      });
    });

    it("names a kitchen with a request but no account name by the reference, and one with a name but no request by the name", async () => {
      await inARolledBackTransaction(async () => {
        const member = await aStaffMember();
        const byReference = await aKitchen({
          revision: 3,
          requests: [{ revision: 1, reference: "S4Q-ONLYREF" }],
        });
        const byName = await aKitchen({
          revision: 3,
          requests: [],
          accountName: "Ion Rusu",
        });
        await markOf(member, byName.id, 1);

        const listed = await digestAmong([byReference, byName]);

        const byId = new Map(listed.map((k) => [k.designId, k]));
        expect(byId.get(byReference.id)).toMatchObject({
          reference: "S4Q-ONLYREF",
        });
        expect(byId.get(byName.id)).toMatchObject({ customerName: "Ion Rusu" });
      });
    });
  });

  describe("only staff can mark a kitchen seen", () => {
    it("answers not-recorded for a client session, writing no seen row and no audit row, on a visible kitchen and an invisible one", async () => {
      await inARolledBackTransaction(async () => {
        const client = await aStaffMember("client");
        const visible = await aKitchen({ revision: 2 });
        const invisible = await aKitchen({ isDeleted: true });

        for (const kitchen of [visible, invisible]) {
          const failure = await rejectionOf(markOf(client, kitchen.id, 1));
          expect(failure).toBeInstanceOf(DashboardStoreError);
          expect((failure as DashboardStoreError).failure).toBe("not-recorded");
          expect(await seenRowOf(kitchen.id)).toBeUndefined();
          expect(await auditRowsFor(kitchen.id)).toBe(0);
        }
      });
    });
  });

  describe("what a mark admits, and what it writes when it admits nothing", () => {
    it("refuses a revision ahead of the kitchen's by one, and by the widest bigint, writing no seen row and no audit row", async () => {
      await inARolledBackTransaction(async () => {
        const member = await aStaffMember();
        const kitchen = await aKitchen({ revision: 3 });

        const aheadByOne = await markOf(member, kitchen.id, 4);
        const aheadByTheWidest = await markOf(
          member,
          kitchen.id,
          WIDEST_REVISION,
        );

        expect(aheadByOne).toBe(DISPLAYED_REVISION_AHEAD);
        expect(aheadByTheWidest).toBe(DISPLAYED_REVISION_AHEAD);
        expect(await seenRowOf(kitchen.id)).toBeUndefined();
        expect(await auditRowsFor(kitchen.id)).toBe(0);
        expect(await markOf(member, kitchen.id, 3)).toEqual({
          kind: "ok",
          changedAfterSeen: false,
        });
      });
    });

    it("admits a sent kitchen, a sent kitchen with no account, one its client hid, and an account's unsent draft, for an administrator and an operator alike", async () => {
      await inARolledBackTransaction(async () => {
        const kitchens = [
          await aKitchen({ revision: 2 }),
          await aKitchen({ revision: 2, hasAccount: false }),
          await aKitchen({ revision: 2, isHidden: true }),
          await aKitchen({ revision: 2, sentAt: null }),
        ];
        const roles: readonly Role[] = ["administrator", "operator"];
        for (const role of roles) {
          const member = await aStaffMember(role);
          for (const kitchen of kitchens) {
            const answer = await markOf(member, kitchen.id, 1);
            expect(answer.kind, `${role} ${kitchen.id}`).toBe("ok");
          }
        }

        for (const kitchen of kitchens) {
          expect(await auditRowsFor(kitchen.id)).toBe(roles.length);
        }
      });
    });

    it("answers not-found, writing nothing, for a kitchen its client deleted, a draft nobody holds, and an id nobody has", async () => {
      await inARolledBackTransaction(async () => {
        const member = await aStaffMember();
        const refused = [
          await aKitchen({ isDeleted: true }),
          await aKitchen({ isDeleted: true, sentAt: null }),
          await aKitchen({ sentAt: null, hasAccount: false }),
          { id: nanoid(), accountId: null },
        ];

        for (const kitchen of refused) {
          expect(await markOf(member, kitchen.id, 1)).toEqual({
            kind: "not-found",
          });
          expect(await seenRowOf(kitchen.id)).toBeUndefined();
          expect(await auditRowsFor(kitchen.id)).toBe(0);
        }
      });
    });

    it("reports a dead session before the kitchen's visibility and before the revision being ahead, and writes nothing", async () => {
      await inARolledBackTransaction(async () => {
        const member = await aStaffMember();
        await run(
          `update account_sessions set revoked_at = now() where token_hash = $1`,
          [member.session.sessionTokenHash],
        );
        const visible = await aKitchen({ revision: 2 });
        const invisible = await aKitchen({ isDeleted: true });

        for (const [kitchen, displayed] of [
          [visible, 1],
          [visible, 3],
          [invisible, 1],
        ] as const) {
          const failure = await rejectionOf(
            markOf(member, kitchen.id, displayed),
          );
          expect(failure).toBeInstanceOf(DashboardStoreError);
          expect((failure as DashboardStoreError).failure).toBe("not-recorded");
        }

        expect(await seenRowOf(visible.id)).toBeUndefined();
        expect(await auditRowsFor(visible.id)).toBe(0);
      });
    });
  });

  describe("changedAfterSeen, the list's flag and the detail's flag are one judgement", () => {
    const operationArbitrary = fc.oneof(
      fc.constant({ kind: "save" } as const),
      fc.constant({ kind: "resend" } as const),
      fc.constant({ kind: "mark-ahead" } as const),
      fc.record({ kind: fc.constant("mark" as const), pick: fc.nat(1000) }),
    );

    it("agrees with a model of the rule over any sequence of saves, requests and marks, in the mark's answer, the detail, the list, the count and the filter", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(operationArbitrary, { minLength: 1, maxLength: 9 }),
          fc.boolean(),
          async (operations, isSent) => {
            await inARolledBackTransaction(async () => {
              const member = await aStaffMember();
              const token = randomToken();
              const reader = readerOverTransaction();
              const baseline = (await reader.listPage(queryOf())).changedCount;
              const kitchen = await aKitchen({
                emailToken: token,
                sentAt: isSent ? A_SENT_INSTANT : null,
                requests: isSent ? [{ revision: 1 }] : [],
              });
              let current = 1;
              let seen: number | undefined;
              let latestRequest = 1;
              const model = () =>
                isSent && current !== Math.max(seen ?? 0, latestRequest);

              for (const operation of operations) {
                if (operation.kind === "save") {
                  await saveKitchen(kitchen.id);
                  current += 1;
                } else if (operation.kind === "resend") {
                  if (!isSent) continue;
                  await aRequest(
                    kitchen.id,
                    {
                      revision: current,
                      createdAt: new Date(NOW.getTime() + current * 1000),
                    },
                    A_SENT_INSTANT,
                  );
                  latestRequest = current;
                } else if (operation.kind === "mark-ahead") {
                  const answer = await markOf(member, kitchen.id, current + 1);
                  expect(answer).toBe(DISPLAYED_REVISION_AHEAD);
                } else {
                  const displayed = 1 + (operation.pick % current);
                  const answer = await markOf(member, kitchen.id, displayed);
                  seen = Math.max(seen ?? displayed, displayed);
                  expect(answer).toEqual({
                    kind: "ok",
                    changedAfterSeen: model(),
                  });
                }
              }

              const detail = await detailOf(kitchen.id);
              const listed = await reader.listPage(
                queryOf({ segment: "all", search: token }),
              );
              const filtered = await reader.listPage(
                queryOf({ segment: "all", search: token, onlyChanged: true }),
              );
              const after = (await reader.listPage(queryOf())).changedCount;
              expect(detail.isChangedSinceSeen).toBe(model());
              expect(listed.kitchens.map((k) => k.isChangedSinceSeen)).toEqual([
                model(),
              ]);
              expect(filtered.total).toBe(model() ? 1 : 0);
              expect(after - baseline).toBe(model() ? 1 : 0);
            });
          },
        ),
        { numRuns: 25 },
      );
    });
  });

  describe("the latest request of a kitchen is one request in every statement", () => {
    it("takes the greater client request id when two requests share an instant, in the list, the detail and the digest", async () => {
      await inARolledBackTransaction(async () => {
        const sameInstant = new Date("2026-11-02T08:00:00.000Z");
        const kitchen = await aKitchen({
          revision: 5,
          requests: [
            {
              revision: 5,
              createdAt: sameInstant,
              clientRequestId: "a".repeat(21),
            },
            {
              revision: 4,
              createdAt: sameInstant,
              clientRequestId: "z".repeat(21),
            },
          ],
        });
        const swapped = await aKitchen({
          revision: 5,
          requests: [
            {
              revision: 4,
              createdAt: sameInstant,
              clientRequestId: "b".repeat(21),
            },
            {
              revision: 5,
              createdAt: sameInstant,
              clientRequestId: "y".repeat(21),
            },
          ],
        });
        const reader = readerOverTransaction();

        const flagsInDetail = [
          (await detailOf(kitchen.id)).isChangedSinceSeen,
          (await detailOf(swapped.id)).isChangedSinceSeen,
        ];
        const digested = (await digestAmong([kitchen, swapped])).map(
          (k) => k.designId,
        );

        expect(flagsInDetail).toEqual([true, false]);
        expect(digested).toEqual([kitchen.id]);
        const firstPage = await reader.listPage(queryOf({ onlyChanged: true }));
        const listedIds = new Set(firstPage.kitchens.map(({ id }) => id));
        expect(listedIds.has(swapped.id)).toBe(false);
      });
    });

    it("lists a kitchen of three requests once in the digest, under the reference of the newest, when its account has no name", async () => {
      await inARolledBackTransaction(async () => {
        const kitchen = await aKitchen({
          revision: 3,
          requests: [
            {
              revision: 1,
              createdAt: new Date("2026-11-01T08:00:00Z"),
              reference: "S4Q-OLDEST",
            },
            {
              revision: 2,
              createdAt: new Date("2026-11-03T08:00:00Z"),
              reference: "S4Q-NEWEST",
            },
            {
              revision: 1,
              createdAt: new Date("2026-11-02T08:00:00Z"),
              reference: "S4Q-MIDDLE",
            },
          ],
        });

        const listed = await digestAmong([kitchen]);

        expect(listed).toHaveLength(1);
        expect(listed[0]).toMatchObject({
          designId: kitchen.id,
          reference: "S4Q-NEWEST",
          revision: "3",
        });
        expect(listed[0]).not.toHaveProperty("customerName");
      });
    });

    it("prints the account's name trimmed of spaces, and the request's reference for a name of spaces alone", async () => {
      await inARolledBackTransaction(async () => {
        const named = await aKitchen({
          revision: 2,
          accountName: "  Ana Pop  ",
        });
        const blank = await aKitchen({ revision: 2, accountName: "   " });

        const listed = await digestAmong([named, blank]);

        const byId = new Map(listed.map((k) => [k.designId, k]));
        expect(byId.get(named.id)).toMatchObject({ customerName: "Ana Pop" });
        expect(byId.get(blank.id)).not.toHaveProperty("customerName");
        expect(byId.get(blank.id)).toHaveProperty("reference");
      });
    });
  });

  // -------------------------------------------------------------------------------------------------------------------
  // The digest
  // -------------------------------------------------------------------------------------------------------------------

  describe("the digest's membership is the domain's rule over the facts SQL judges", () => {
    const REVISION_NOW = 5;
    /** The seen mark and the latest request's revision of each cell; the kitchen stands at `REVISION_NOW`. */
    const FACTS_OF_CHANGED: Readonly<
      Record<string, { seen?: number; requested: number }>
    > = {
      "latest-request-older": { requested: 3 },
      "stale-mark-below-the-sent-revision": { seen: 3, requested: 5 },
      "latest-request-current": { requested: 5 },
      "mark-above-the-sent-revision-below-current": { seen: 4, requested: 3 },
      "mark-at-current-above-an-older-request": { seen: 5, requested: 3 },
    };
    const changedArbitrary = fc.constantFrom(...Object.keys(FACTS_OF_CHANGED));
    const entryArbitrary = fc.constantFrom(
      "none",
      "at-seen",
      "above-seen",
      "below-seen",
      "claimed-day-without-entries",
      "above-seen-in-another-round",
      "above-the-kitchen's-own-revision",
    );
    const cellArbitrary = fc.record({
      changed: changedArbitrary,
      entry: entryArbitrary,
      ageMs: fc.constantFrom(
        DIGEST_WINDOW_MS - 1,
        DIGEST_WINDOW_MS,
        DIGEST_WINDOW_MS + 1,
        0,
        29 * ONE_DAY_MS,
        -1,
        -ONE_DAY_MS,
      ),
      status: fc.constantFrom<RequestStatus | undefined>(
        undefined,
        "new",
        "contacted",
        "offer-sent",
        "closed",
      ),
      isDeleted: fc.boolean(),
      isUnsent: fc.boolean(),
    });

    interface Cell {
      readonly changed: string;
      readonly entry: string;
      readonly ageMs: number;
      readonly status: RequestStatus | undefined;
      readonly isDeleted: boolean;
      readonly isUnsent: boolean;
    }

    async function plantCell(cell: Cell): Promise<{
      kitchen: PlantedKitchen;
      expected: boolean;
    }> {
      const { seen, requested } = FACTS_OF_CHANGED[cell.changed] ?? {
        requested: REVISION_NOW,
      };
      const effectiveSeen = Math.max(seen ?? 0, requested);
      const sentAt = new Date(NOW.getTime() - cell.ageMs);
      const kitchen = await aKitchen({
        revision: REVISION_NOW,
        sentAt: cell.isUnsent ? null : sentAt,
        isDeleted: cell.isDeleted,
        requests: cell.isUnsent ? [] : [{ revision: requested }],
        ...(seen === undefined ? {} : { seenRevision: seen }),
        ...(cell.status === undefined ? {} : { status: cell.status }),
      });
      const isHeld = await plantEntry(cell.entry, kitchen.id, effectiveSeen);
      const facts = {
        nowMs: NOW.getTime(),
        sentAtMs: sentAt.getTime(),
        status: cell.status ?? "new",
        isChangedSinceSeen: REVISION_NOW !== effectiveSeen,
        isDigestedSinceSeen: isHeld,
      };
      return {
        kitchen,
        expected: !cell.isUnsent && !cell.isDeleted && isDigestEligible(facts),
      };
    }

    /** Whether the entry planted holds the kitchen: above the effective seen revision and not above the kitchen's own. */
    async function plantEntry(
      entry: string,
      designId: string,
      effectiveSeen: number,
    ): Promise<boolean> {
      await aClaimedRound(A_ROUND);
      await aClaimedRound(ANOTHER_ROUND);
      const revisionOf: Readonly<Record<string, number>> = {
        "at-seen": effectiveSeen,
        "above-seen": effectiveSeen + 1,
        "below-seen": effectiveSeen - 1,
        "above-seen-in-another-round": effectiveSeen + 1,
        "above-the-kitchen's-own-revision": REVISION_NOW + 1,
      };
      const revision = revisionOf[entry];
      if (revision === undefined) return false;
      const round =
        entry === "above-seen-in-another-round" ? ANOTHER_ROUND : A_ROUND;
      await anEntry(round, designId, revision);
      return revision > effectiveSeen && revision <= REVISION_NOW;
    }

    it("lists exactly the kitchens the domain's isDigestEligible accepts, over every cell of changed, held, window edge, status, deleted and unsent", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(cellArbitrary, { minLength: 1, maxLength: 10 }),
          async (cells) => {
            await inARolledBackTransaction(async () => {
              const planted = [];
              for (const cell of cells) planted.push(await plantCell(cell));

              const listed = new Set(
                (await digestAmong(planted.map(({ kitchen }) => kitchen))).map(
                  ({ designId }) => designId,
                ),
              );

              const members = planted.map(({ kitchen }) =>
                listed.has(kitchen.id),
              );
              expect(members).toEqual(planted.map(({ expected }) => expected));
            });
          },
        ),
        { numRuns: 40 },
      );
    });

    it("covers each of the four stopping and continuing statuses of the domain's list, with none stored read as new", async () => {
      await inARolledBackTransaction(async () => {
        const statuses: (RequestStatus | undefined)[] = [
          undefined,
          "new",
          "contacted",
          "offer-sent",
          "closed",
        ];
        const planted = [];
        for (const status of statuses) {
          planted.push({
            status,
            kitchen: await aKitchen({
              revision: 3,
              requests: [{ revision: 1 }],
              ...(status === undefined ? {} : { status }),
            }),
          });
        }

        const listed = new Set(
          (await digestAmong(planted.map((p) => p.kitchen))).map(
            (k) => k.designId,
          ),
        );

        for (const { status, kitchen } of planted) {
          const stops = DIGEST_STOPPING_STATUSES.some(
            (stopping) => stopping === status,
          );
          expect(listed.has(kitchen.id), String(status)).toBe(!stops);
        }
      });
    });

    it("compares the window on the milliseconds a Date holds: exclusive at the edge millisecond, inclusive from the next", async () => {
      await inARolledBackTransaction(async () => {
        const edge = NOW.getTime() - DIGEST_WINDOW_MS;
        const text = (ms: number, microseconds: string) =>
          new Date(ms).toISOString().replace("Z", `${microseconds}Z`);
        const instants: Readonly<Record<string, string>> = {
          oneMillisecondInside: text(edge + 1, "000"),
          lastMicrosecondOfTheEdgeMillisecond: text(edge, "999"),
          exactlyOnTheEdge: text(edge, "000"),
          lastMicrosecondOfTheMillisecondOutside: text(edge - 1, "999"),
        };
        const expected: Readonly<Record<string, boolean>> = {
          oneMillisecondInside: true,
          lastMicrosecondOfTheEdgeMillisecond: false,
          exactlyOnTheEdge: false,
          lastMicrosecondOfTheMillisecondOutside: false,
        };
        const kitchens: Record<string, PlantedKitchen> = {};
        for (const [name, instant] of Object.entries(instants)) {
          const kitchen = await aKitchen({
            revision: 3,
            requests: [{ revision: 1 }],
          });
          kitchens[name] = kitchen;
          await run(
            `update designs set sent_at = $2::timestamptz where id = $1`,
            [kitchen.id, instant],
          );
        }

        const listed = new Set(
          (await digestAmong(Object.values(kitchens))).map((k) => k.designId),
        );

        const observed = Object.fromEntries(
          Object.entries(kitchens).map(([name, kitchen]) => [
            name,
            listed.has(kitchen.id),
          ]),
        );
        expect(observed).toEqual(expected);
      });
    });

    it.each([
      ["a session in UTC", "UTC", NOW],
      [
        "a session in Europe/Chisinau across the autumn clock change",
        "Europe/Chisinau",
        NOW,
      ],
      [
        "a session in Europe/Chisinau across the spring clock change",
        "Europe/Chisinau",
        new Date("2026-04-15T12:00:00.000Z"),
      ],
    ])(
      "keeps the window 720 hours, not thirty calendar days, under %s",
      async (_label, zone, now) => {
        await inARolledBackTransaction(async () => {
          await run(`set local time zone '${zone}'`);
          const offsetsFromTheExactEdge = [-30 * 60_000, -1, 0, 1, 30 * 60_000];
          const exactEdge = now.getTime() - DIGEST_WINDOW_MS;
          const planted = [];
          for (const offset of offsetsFromTheExactEdge) {
            const kitchen = await aKitchen({
              revision: 3,
              requests: [{ revision: 1 }],
            });
            const sentAtMs = exactEdge + offset;
            await run(
              `update designs set sent_at = $2::timestamptz where id = $1`,
              [kitchen.id, new Date(sentAtMs).toISOString()],
            );
            planted.push({ kitchen, sentAtMs });
          }

          const listed = new Set(
            (
              await digestAmong(
                planted.map((p) => p.kitchen),
                now,
              )
            ).map((k) => k.designId),
          );

          for (const { kitchen, sentAtMs } of planted) {
            expect(
              listed.has(kitchen.id),
              `${String(sentAtMs - exactEdge)} ms from the exact edge`,
            ).toBe(now.getTime() - sentAtMs < DIGEST_WINDOW_MS);
          }
        });
      },
    );

    it("reads the instant it is passed and never the database's clock, for a past instant and a future one", async () => {
      await inARolledBackTransaction(async () => {
        const wasSentJustBefore = new Date("2000-12-31T00:00:00.000Z");
        const past = await aKitchen({
          revision: 3,
          sentAt: wasSentJustBefore,
          requests: [{ revision: 1 }],
        });
        const recent = await aKitchen({
          revision: 3,
          requests: [{ revision: 1 }],
        });

        const inThePast = await digestAmong(
          [past],
          new Date("2001-01-01T00:00:00.000Z"),
        );
        const inTheFuture = await digestAmong(
          [past, recent],
          new Date("2040-01-01T00:00:00.000Z"),
        );

        expect(inThePast.map((k) => k.designId)).toEqual([past.id]);
        expect(inTheFuture).toEqual([]);
      });
    });

    it("lists a kitchen sent after the instant it is passed: the window has no upper bound", async () => {
      await inARolledBackTransaction(async () => {
        const kitchen = await aKitchen({
          revision: 3,
          requests: [{ revision: 1 }],
        });

        const listed = await digestAmong(
          [kitchen],
          new Date("2026-10-01T00:00:00.000Z"),
        );

        expect(listed).toHaveLength(1);
      });
    });

    it("never lists a kitchen with neither a seen mark nor a request, which has nothing to differ from", async () => {
      await inARolledBackTransaction(async () => {
        const kitchen = await aKitchen({ revision: 3, requests: [] });
        const reader = readerOverTransaction();

        const listed = await digestAmong([kitchen]);
        const detail = await detailOf(kitchen.id);
        const filtered = await reader.listPage(queryOf({ onlyChanged: true }));

        expect(listed).toEqual([]);
        expect(detail.isChangedSinceSeen).toBe(false);
        expect(filtered.kitchens.some(({ id }) => id === kitchen.id)).toBe(
          false,
        );
      });
    });
  });

  describe("the instants the store lets through are ones Postgres reads", () => {
    it.each([
      ["the first millisecond of year 0001", "0001-01-01T00:00:00.000Z"],
      ["the last millisecond of year 9999", "9999-12-31T23:59:59.999Z"],
    ])("lists for %s without a database error", async (_label, iso) => {
      await inARolledBackTransaction(async () => {
        const listed = await storeOverTransaction().listDigestEligible(
          new Date(iso),
        );

        expect(Array.isArray(listed)).toBe(true);
      });
    });
  });

  describe("recording a round", () => {
    it("refuses a round nobody claimed with invalid-request and writes no entry, not even for a list that would otherwise insert", async () => {
      await inARolledBackTransaction(async () => {
        const kitchen = await aKitchen({ revision: 3 });
        const store = storeOverTransaction();

        const failure = await rejectionOf(
          store.recordDigested(A_ROUND, [
            { designId: kitchen.id, revision: "3" },
          ]),
        );

        expect(failure).toBeInstanceOf(DashboardStoreError);
        expect((failure as DashboardStoreError).failure).toBe(
          "invalid-request",
        );
        const rows = await run(
          `select day_key from staff_change_digest_entries where design_id = $1`,
          [kitchen.id],
        );
        expect(rows).toEqual([]);
      });
    });

    it("keeps the first revision named for a kitchen listed twice in one call, and counts it once", async () => {
      await inARolledBackTransaction(async () => {
        const kitchen = await aKitchen({ revision: 4 });
        const store = storeOverTransaction();
        await store.claimDigestDay(A_ROUND);

        await store.recordDigested(A_ROUND, [
          { designId: kitchen.id, revision: "2" },
          { designId: kitchen.id, revision: "4" },
        ]);

        const entries = await run(
          `select revision::text as revision from staff_change_digest_entries where design_id = $1`,
          [kitchen.id],
        );
        const rounds = await run(
          `select sent_count from staff_change_digest_rounds where day_key = $1`,
          [A_ROUND],
        );
        expect(entries).toEqual([{ revision: "2" }]);
        expect(rounds[0]?.["sent_count"]).toBe(1);
      });
    });

    it("sets an empty round's count to zero and leaves a round already holding entries as it was", async () => {
      await inARolledBackTransaction(async () => {
        const kitchen = await aKitchen({ revision: 4 });
        const store = storeOverTransaction();
        await store.claimDigestDay(A_ROUND);
        await store.recordDigested(A_ROUND, [
          { designId: kitchen.id, revision: "4" },
        ]);

        await store.recordDigested(A_ROUND, []);

        const rounds = await run(
          `select sent_count from staff_change_digest_rounds where day_key = $1`,
          [A_ROUND],
        );
        expect(rounds[0]?.["sent_count"]).toBe(1);
      });
    });
  });

  // -------------------------------------------------------------------------------------------------------------------
  // The staff kitchen reader's additions
  // -------------------------------------------------------------------------------------------------------------------

  describe("the list puts the changed kitchens first and counts them whatever the query", () => {
    it("heads the list with the changed kitchens, newest first, then the rest newest first, and filters to the changed on request", async () => {
      await inARolledBackTransaction(async () => {
        const token = randomToken();
        const reader = readerOverTransaction();
        const at = (day: number) => new Date(Date.UTC(3500, 0, day));
        const spec = (day: number, revision: number) => ({
          emailToken: token,
          revision,
          sentAt: at(day),
          requests: [{ revision: 1, createdAt: at(day) }],
        });
        const changedOld = await aKitchen(spec(1, 2));
        const calm = await aKitchen(spec(3, 1));
        const changedNew = await aKitchen(spec(2, 2));
        const calmNewest = await aKitchen(spec(4, 1));
        const draft = await aKitchen({
          emailToken: token,
          revision: 2,
          sentAt: null,
        });

        const everything = await reader.listPage(
          queryOf({ segment: "all", search: token }),
        );
        const onlyChanged = await reader.listPage(
          queryOf({ segment: "all", search: token, onlyChanged: true }),
        );

        expect(everything.kitchens.map(({ id }) => id)).toEqual([
          changedNew.id,
          changedOld.id,
          calmNewest.id,
          calm.id,
          draft.id,
        ]);
        expect(onlyChanged.kitchens.map(({ id }) => id)).toEqual([
          changedNew.id,
          changedOld.id,
        ]);
        expect(onlyChanged.total).toBe(2);
        expect(
          everything.kitchens.find(({ id }) => id === draft.id)
            ?.isChangedSinceSeen,
        ).toBe(false);
      });
    });

    it("counts the same changed kitchens under every segment, status, search, page and filter, and equals the total of the unfiltered changed query", async () => {
      await inARolledBackTransaction(async () => {
        const token = randomToken();
        const reader = readerOverTransaction();
        const baseline = (await reader.listPage(queryOf())).changedCount;
        await aKitchen({ emailToken: token, revision: 2 });
        await aKitchen({ emailToken: token, revision: 2, isHidden: true });
        await aKitchen({ emailToken: token, revision: 2, isDeleted: true });
        await aKitchen({ emailToken: token, revision: 1 });
        await aKitchen({ emailToken: token, revision: 3, sentAt: null });
        await aKitchen({ emailToken: token, revision: 2, status: "closed" });

        const queries: StaffKitchenQuery[] = [
          queryOf(),
          queryOf({ segment: "all" }),
          queryOf({ segment: "drafts" }),
          queryOf({ status: "closed" }),
          queryOf({ search: token }),
          queryOf({ search: "no-kitchen-has-this-text" }),
          queryOf({ onlyChanged: true }),
          queryOf({ page: 9999 }),
        ];
        const counts: number[] = [];
        for (const query of queries)
          counts.push((await reader.listPage(query)).changedCount);
        const unfilteredChanged = await reader.listPage(
          queryOf({ segment: "all", onlyChanged: true }),
        );

        expect(counts.every((count) => count === counts[0])).toBe(true);
        expect((counts[0] ?? 0) - baseline).toBe(3);
        expect(unfilteredChanged.total).toBe(counts[0]);
      });
    });

    it("answers a page past the end with no kitchens, the same total and the same count", async () => {
      await inARolledBackTransaction(async () => {
        const reader = readerOverTransaction();
        const first = await reader.listPage(queryOf({ onlyChanged: true }));

        const far = await reader.listPage(
          queryOf({ onlyChanged: true, page: 900_000 }),
        );

        expect(far.kitchens).toEqual([]);
        expect({ total: far.total, changedCount: far.changedCount }).toEqual({
          total: first.total,
          changedCount: first.changedCount,
        });
      });
    });

    it("refuses an onlyChanged that is not a boolean before sending a statement", async () => {
      for (const onlyChanged of ["true", 1, null]) {
        sentStatements = [];
        const failure = await rejectionOf(
          readerOverTransaction().listPage(
            queryOf({ onlyChanged: onlyChanged as never }),
          ),
        );
        expect(failure).toBeInstanceOf(StaffKitchenReaderError);
        expect((failure as StaffKitchenReaderError).failure).toBe(
          "invalid-query",
        );
        expect(sentStatements).toEqual([]);
      }
    });
  });

  describe("the total a request was sent at, read from a real snapshot", () => {
    it.each(REAL_SNAPSHOTS.map((real) => [real.name, real] as const))(
      "reads the total of %s as priceDesign stored it",
      async (_name, real) => {
        await inARolledBackTransaction(async () => {
          const kitchen = await aKitchen({
            requests: [{ revision: 1, priced: real.snapshot.priced }],
          });

          const detail = await detailOf(kitchen.id);

          expect(detail.sentTotal).toEqual({
            totalMinor: real.snapshot.priced.totalMinor,
            currency: real.snapshot.priced.currency,
          });
        });
      },
    );

    it("takes the total of the newest request and never an older one's", async () => {
      await inARolledBackTransaction(async () => {
        const kitchen = await aKitchen({
          requests: [
            {
              revision: 1,
              createdAt: new Date("2026-11-01T08:00:00Z"),
              priced: { totalMinor: 111, currency: "MDL" },
            },
            {
              revision: 1,
              createdAt: new Date("2026-11-02T08:00:00Z"),
              priced: { totalMinor: 222, currency: "MDL" },
            },
          ],
        });

        expect((await detailOf(kitchen.id)).sentTotal).toEqual({
          totalMinor: 222,
          currency: "MDL",
        });
      });
    });

    it.each([
      ["no total in the snapshot", {}, null],
      [
        "a total written as text",
        { totalMinor: "5000", currency: "MDL" },
        null,
      ],
      ["a total that is null", { totalMinor: null, currency: "MDL" }, null],
      [
        "a total written in exponent form that is a whole number",
        { totalMinor: 1e3, currency: "MDL" },
        1000,
      ],
    ])("reads %s as %j", async (_label, priced, expected) => {
      await inARolledBackTransaction(async () => {
        const kitchen = await aKitchen({ requests: [{ revision: 1, priced }] });

        const detail = await detailOf(kitchen.id);

        expect(detail.sentTotal?.totalMinor ?? null).toBe(expected);
      });
    });

    it.each([
      ["a fraction", { totalMinor: 12.5, currency: "MDL" }],
      ["a negative total", { totalMinor: -5, currency: "MDL" }],
      [
        "a total past what a number holds exactly",
        { totalMinor: 9_007_199_254_740_993n, currency: "MDL" },
      ],
      ["a total of 1e300", { totalMinor: 1e300, currency: "MDL" }],
      [
        "a currency this build does not price in",
        { totalMinor: 5000, currency: "EUR" },
      ],
      [
        "a currency written in lower case",
        { totalMinor: 5000, currency: "mdl" },
      ],
      ["a total with no currency", { totalMinor: 5000 }],
      ["a currency that is a number", { totalMinor: 5000, currency: 1 }],
    ])(
      "reads %s as no total, and still reads the kitchen",
      async (_label, priced) => {
        await inARolledBackTransaction(async () => {
          const kitchen = await aKitchen({
            requests: [
              {
                revision: 1,
                priced: JSON.parse(
                  JSON.stringify(priced, (_k, v: unknown) =>
                    typeof v === "bigint" ? Number(v) : v,
                  ),
                ) as unknown,
              },
            ],
          });

          const detail = await detailOf(kitchen.id);

          expect(detail.sentTotal).toBeNull();
          expect(detail.request?.reference).toMatch(/^S4Q-/);
        });
      },
    );
  });
});
