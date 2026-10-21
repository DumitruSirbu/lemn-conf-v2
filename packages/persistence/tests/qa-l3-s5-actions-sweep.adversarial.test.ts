import { randomBytes } from "node:crypto";

import {
  CURRENT_SCHEMA_VERSION,
  REQUEST_STATUSES,
  judgeNoteText,
} from "@lemnaria/configurator-domain";
import type { RequestStatus } from "@lemnaria/configurator-domain";
import { neon } from "@neondatabase/serverless";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import fc from "fast-check";
import { nanoid } from "nanoid";
import { afterAll, describe, expect, it, vi } from "vitest";

import { FakeSessionStore } from "../src/fake-session-store.js";
import { FakeStaffAuditStore } from "../src/fake-staff-audit-store.js";
import { FakeStaffKitchenActionsStore } from "../src/fake-staff-kitchen-actions-store.js";
import { staffAuditInsertStatement } from "../src/neon-staff-audit-store.js";
import {
  NeonStaffKitchenActionsStore,
  addNoteStatement,
  saveStatusStatement,
} from "../src/neon-staff-kitchen-actions-store.js";
import { NeonStaffKitchenReader } from "../src/neon-staff-kitchen-reader.js";
import { prepareStaffAuditRecord } from "../src/staff-audit-store.js";
import type { PreparedStaffAuditRecord } from "../src/staff-audit-store.js";
import { StaffKitchenActionError } from "../src/staff-kitchen-actions-store.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { rejectionOf } from "./support/rejection-of.js";
import type {
  ActionsWorld,
  ClientAccount,
  StaffMember,
} from "./support/staff-kitchen-actions-store-contract.js";
import { holdSharedTestSchemaLock } from "./support/test-schema-lock.js";

// Shared: the live arm writes rows under ids only it mints and deletes them by those ids, and needs the schema intact.
holdSharedTestSchemaLock();

/**
 * Adversarial QA of the staff kitchen actions store (wave L3-S5): what the developer's contract suite
 * (`tests/support/staff-kitchen-actions-store-contract.ts`) does not hold, over **both** arms (the fake and the
 * test database's real Postgres) where the contract's world can state it, and over the real database alone where only it
 * can show the property (a whole-row comparison, a forced race, a dead session in the write's own statement).
 *
 * The live arm runs over the test database's owner credential, so what it shows is what the statements do with rows
 * and not what the application role is granted. A Neon HTTP statement commits, so every row names an account, a kitchen
 * or a note this file minted at random (accounts carry the e-mail prefix `qa-l3-s5-`), and `afterAll` deletes by those
 * ids only.
 */
const SUITE_NAME = "staff kitchen actions store, second sweep (fake and live)";
if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

const PASSWORD_HASH = `$argon2id$v=19$m=19456,t=2,p=1$${"A".repeat(22)}$${"B".repeat(43)}`;
const IDLE_LIFETIMES = {
  client: 2_592_000,
  operator: 43_200,
  administrator: 43_200,
};
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const FAKE_SESSIONS_NOW_MS = Date.parse("2026-10-21T09:00:00.000Z");
const UPDATED_AT = "2026-10-01T09:00:00.000Z";
const SENT_AT = "2026-10-02T09:00:00.000Z";
const NOTE_MAX = 2000;
const LIVE_TIMEOUT_MS = 120_000;
const EMAIL_PREFIX = "qa-l3-s5-";
const DIVISION_BY_ZERO = "22012";

interface LiveWorld extends ActionsWorld {
  readonly sql: () => NeonQueryFunction<false, false>;
  readonly aStaffMemberWithRole: (
    role: "client" | "operator",
  ) => Promise<StaffMember>;
  readonly aHiddenSentKitchenWithStatus: (spec: {
    readonly status: string;
    readonly changedBy: StaffMember;
  }) => Promise<string>;
}

// ---------------------------------------------------------------------------------------------------------------------
// The fake arm
// ---------------------------------------------------------------------------------------------------------------------

function newFakeWorld(): ActionsWorld {
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 9, 21, 9, 0, 0) + 1000 * tick++);
  const accounts = new Map<
    string,
    { email: string; role: "client" | "operator" }
  >();
  const sessions = new FakeSessionStore({
    now: () => new Date(FAKE_SESSIONS_NOW_MS),
    accountOf: (accountId) => {
      const held = accounts.get(accountId);
      return held === undefined
        ? undefined
        : { id: accountId, ...held, isEmailVerified: true };
    },
    passwordHashOf: (accountId) =>
      accounts.has(accountId) ? PASSWORD_HASH : undefined,
    passwordChangedAtOf: (accountId) =>
      accounts.has(accountId)
        ? new Date("2026-01-01T00:00:00.000Z")
        : undefined,
  });
  const audit = new FakeStaffAuditStore({ now, sessions });
  const fake = new FakeStaffKitchenActionsStore({
    now,
    sessions,
    audit,
    directory: {
      accountOf: (accountId) => {
        const held = accounts.get(accountId);
        return held === undefined
          ? undefined
          : { email: held.email, name: null };
      },
    },
  });

  async function signedIn(): Promise<StaffMember> {
    const accountId = nanoid();
    const email = `${EMAIL_PREFIX}${accountId.toLowerCase()}@example.invalid`;
    accounts.set(accountId, { email, role: "operator" });
    const sessionTokenHash = randomBytes(32).toString("hex");
    await sessions.create({
      tokenHash: sessionTokenHash,
      accountId,
      expectedPasswordHash: PASSWORD_HASH,
      absoluteExpiresAt: new Date(FAKE_SESSIONS_NOW_MS + SESSION_LIFETIME_MS),
    });
    return {
      accountId,
      email,
      session: { sessionTokenHash, idleLifetimeSeconds: IDLE_LIFETIMES },
    };
  }

  return {
    store: fake,
    aStaffMember: signedIn,
    async aStaffMemberWhoseSessionIsRevoked() {
      const member = await signedIn();
      await sessions.revoke(member.session.sessionTokenHash);
      return member;
    },
    aClient(): Promise<ClientAccount> {
      const accountId = nanoid();
      const email = `${EMAIL_PREFIX}${accountId.toLowerCase()}@example.invalid`;
      accounts.set(accountId, { email, role: "client" });
      return Promise.resolve({ accountId, email });
    },
    aKitchen({
      client,
      isSent = false,
      isHidden = false,
      isDeletedByClient = false,
    }) {
      const id = nanoid();
      fake.plantKitchen({
        id,
        accountId: client?.accountId ?? null,
        sentAt: isSent ? new Date(SENT_AT) : null,
        isHidden,
        isDeletedByClient,
      });
      return Promise.resolve(id);
    },
    aStoredStatus({ designId, status, changedBy }) {
      fake.plantStatus({
        designId,
        status,
        changedByAccountId: changedBy.accountId,
        changedAt: new Date("2026-10-03T09:00:00.000Z"),
      });
      return Promise.resolve();
    },
    notesOf: (designId) =>
      Promise.resolve(
        fake.heldNotes(designId).map(({ id, authorAccountId, text }) => ({
          id,
          authorAccountId,
          text,
        })),
      ),
    statusRowOf(designId) {
      const held = fake.heldStatus(designId);
      return Promise.resolve(
        held === undefined
          ? null
          : {
              status: held.status,
              changedByAccountId: held.changedByAccountId,
              changedAtMs: held.changedAt.getTime(),
            },
      );
    },
    isHidden: (designId) =>
      Promise.resolve(fake.heldKitchen(designId)?.isHidden ?? false),
    updatedAtMsOf: () => Promise.resolve(Date.parse(UPDATED_AT)),
    auditEventsOf: (actorAccountId) =>
      Promise.resolve(
        audit
          .heldEvents()
          .filter((event) => event.actorAccountId === actorAccountId)
          .map((event) => ({
            action: event.action,
            designId: event.designId,
            isDetailSqlNull: event.detail === null,
            detail: event.detail,
          })),
      ),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// The live arm
// ---------------------------------------------------------------------------------------------------------------------

const accountIds: string[] = [];
const designIds: string[] = [];
const shareTokenHashes: string[] = [];

function liveSql() {
  return neon(liveTestDatabaseUrl);
}

async function insertAccount(
  role: "client" | "operator",
): Promise<{ accountId: string; email: string }> {
  const accountId = nanoid();
  const email = `${EMAIL_PREFIX}${accountId.toLowerCase()}@example.invalid`;
  accountIds.push(accountId);
  await liveSql()`
    insert into accounts (id, email, email_normal_form, password_hash, role, locale, privacy_notice_version)
    values (${accountId}, ${email}, ${email}, ${PASSWORD_HASH}, ${role}, 'ro', '1')
  `;
  return { accountId, email };
}

async function signInWithRole(
  role: "client" | "operator",
): Promise<StaffMember> {
  const { accountId, email } = await insertAccount(role);
  const sessionTokenHash = randomBytes(32).toString("hex");
  await liveSql()`
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
  await liveSql()`
    insert into designs (id, schema_version, document, account_id, sent_at, updated_at, hidden_by_client_at,
      deleted_by_client_at)
    values (${designId}, ${CURRENT_SCHEMA_VERSION}, '{}'::jsonb, ${spec.client?.accountId ?? null},
      case when ${spec.isSent ?? false}::boolean then ${SENT_AT}::timestamptz end, ${UPDATED_AT}::timestamptz,
      case when ${spec.isHidden ?? false}::boolean then now() end,
      case when ${spec.isDeletedByClient ?? false}::boolean then now() end)
  `;
  return designId;
}

function newLiveWorld(): Promise<LiveWorld> {
  const world: LiveWorld = {
    sql: liveSql,
    store: new NeonStaffKitchenActionsStore(liveTestDatabaseUrl),
    aStaffMember: () => signInWithRole("operator"),
    aStaffMemberWithRole: signInWithRole,
    async aStaffMemberWhoseSessionIsRevoked() {
      const member = await signInWithRole("operator");
      await liveSql()`update account_sessions set revoked_at = now() where token_hash = ${member.session.sessionTokenHash}`;
      return member;
    },
    aClient: () => insertAccount("client"),
    aKitchen: insertKitchen,
    async aStoredStatus({ designId, status, changedBy }) {
      await liveSql()`
        insert into design_request_states (design_id, status, changed_by_account_id)
        values (${designId}, ${status}, ${changedBy.accountId})
      `;
    },
    async aHiddenSentKitchenWithStatus({ status, changedBy }) {
      const designId = await insertKitchen({
        client: await insertAccount("client"),
        isSent: true,
        isHidden: true,
      });
      await world.aStoredStatus({ designId, status, changedBy });
      return designId;
    },
    async notesOf(designId) {
      const rows = await liveSql()`
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
      const rows = await liveSql()`
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
        await liveSql()`select (hidden_by_client_at is not null) as is_hidden from designs where id = ${designId}`;
      return rows[0]?.["is_hidden"] === true;
    },
    async updatedAtMsOf(designId) {
      const rows = await liveSql()`
        select floor(extract(epoch from updated_at) * 1000)::bigint::text as updated_ms from designs where id = ${designId}
      `;
      return Number(rows[0]?.["updated_ms"]);
    },
    async auditEventsOf(actorAccountId) {
      const rows = await liveSql()`
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
  };
  return Promise.resolve(world);
}

/** Everything a failed write must leave exactly as it was, as the database holds it. */
async function snapshotOf(designId: string): Promise<unknown> {
  const rows = await liveSql()`
    select
      (select to_jsonb(d) from designs d where d.id = ${designId}) as design,
      (select to_jsonb(s) from design_request_states s where s.design_id = ${designId}) as state,
      (select count(n.id)::int from design_notes n where n.design_id = ${designId}) as notes,
      (select count(e.id)::int from staff_audit_events e where e.design_id = ${designId}) as audits
  `;
  return rows[0];
}

afterAll(async () => {
  if (!isLiveTestDatabaseConfigured) return;
  const sql = liveSql();
  await sql`delete from staff_audit_events where actor_account_id = any(${accountIds}) or design_id = any(${designIds})`;
  await sql`delete from design_notes where design_id = any(${designIds})`;
  await sql`delete from design_request_states where design_id = any(${designIds})`;
  await sql`delete from design_share_links where token_hash = any(${shareTokenHashes}) or design_id = any(${designIds})`;
  await sql`delete from designs where id = any(${designIds})`;
  await sql`delete from account_sessions where account_id = any(${accountIds})`;
  await sql`delete from accounts where id = any(${accountIds})`;
});

// ---------------------------------------------------------------------------------------------------------------------
// Helpers shared by both arms
// ---------------------------------------------------------------------------------------------------------------------

async function sentKitchen(world: ActionsWorld): Promise<string> {
  return world.aKitchen({ client: await world.aClient(), isSent: true });
}

async function failureOf(
  pending: PromiseLike<unknown>,
): Promise<StaffKitchenActionError> {
  const failure = await rejectionOf(pending);
  expect(failure).toBeInstanceOf(StaffKitchenActionError);
  return failure as StaffKitchenActionError;
}

/** Exactly `NOTE_MAX` code points that the domain keeps as they are: a mix of one-, two- and three-unit characters, a
 *  composed letter, and one interior line feed, with a letter at each end so nothing is trimmed. */
function noteOfExactlyTheLimit(): string {
  const units = ["\u00E9", "\u{1F600}", "a", "\u6F22", "\n", "z"];
  const body = Array.from(
    { length: NOTE_MAX - 2 },
    (_, index) => units[(index + 1) % units.length],
  ).join("");
  return `q${body}q`;
}

/** The pieces a typed note is made of: combining marks, format characters, spaces, line breaks, astral characters. */
const NOTE_PIECES = [
  "e",
  "\u0301",
  "\u200B",
  "\u00A0",
  "\u3000",
  "\n",
  "\u{1F44D}",
  "\u{1F3FD}",
  "\u200D",
  "\uFEFF",
  "a",
  " ",
  "\u212B",
  "\u1E9B\u0323",
  "\uFB01",
  "\u0344",
  "\u2060",
  "\u00AD",
  "\u{E0041}",
  "\uFE0F",
  "\r",
  "\t",
  "\u202E",
  "\u0000",
] as const;

const typedNote = fc.oneof(
  fc
    .array(fc.constantFrom(...NOTE_PIECES), { maxLength: 14 })
    .map((pieces) => pieces.join("")),
  fc.string({ unit: "binary", maxLength: 14 }),
);

// ---------------------------------------------------------------------------------------------------------------------
// The text of a note, with no database
// ---------------------------------------------------------------------------------------------------------------------

describe("the domain's judgement of a note is idempotent, so the text a route stores is a text the store accepts", () => {
  it("judges its own output to itself, for any typed text", () => {
    fc.assert(
      fc.property(typedNote, (typed) => {
        const first = judgeNoteText(typed);
        if (!first.ok) return true;
        const second = judgeNoteText(first.text);
        return second.ok && second.text === first.text;
      }),
      { numRuns: 5000 },
    );
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The sweep both arms run
// ---------------------------------------------------------------------------------------------------------------------

function describeSweep(
  arm: string,
  newWorld: () => Promise<ActionsWorld>,
  runs: number,
): void {
  describe(`${arm}: notes`, () => {
    it("stores a note of exactly 2000 code points as it was judged, and refuses 2001 with nothing written", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const designId = await sentKitchen(world);
      const atLimit = noteOfExactlyTheLimit();
      expect(Array.from(atLimit)).toHaveLength(NOTE_MAX);
      expect(judgeNoteText(atLimit)).toEqual({ ok: true, text: atLimit });

      const added = await world.store.addNote({
        session: staff.session,
        designId,
        text: atLimit,
      });
      const failure = await failureOf(
        world.store.addNote({
          session: staff.session,
          designId,
          text: `${atLimit}z`,
        }),
      );

      expect(added).toMatchObject({ kind: "added", note: { text: atLimit } });
      expect((await world.notesOf(designId)).map(({ text }) => text)).toEqual([
        atLimit,
      ]);
      expect(failure.refusal).toBe("NOTE_TEXT_NOT_JUDGED");
      expect(await world.auditEventsOf(staff.accountId)).toHaveLength(1);
    });

    it.each([
      ["a decomposed letter (NFD)", "cafe\u0301"],
      ["a zero width space inside", "a\u200Bb"],
      ["a trailing line feed", "kept?\n"],
      ["a leading space", " kept?"],
      ["a leading no-break space", "\u00A0kept?"],
      ["an ideographic space at the end", "kept?\u3000"],
      ["a byte order mark inside", "a\uFEFFb"],
      ["a soft hyphen inside", "a\u00ADb"],
    ])(
      "refuses %s, which the domain would store differently, with nothing written",
      async (_name, text) => {
        const world = await newWorld();
        const staff = await world.aStaffMember();
        const designId = await sentKitchen(world);

        const failure = await failureOf(
          world.store.addNote({ session: staff.session, designId, text }),
        );

        expect(failure.failure).toBe("invalid-request");
        expect(await world.notesOf(designId)).toEqual([]);
        expect(await world.auditEventsOf(staff.accountId)).toEqual([]);
      },
    );

    it("stores a composed (NFC) accented letter and an interior line feed unchanged", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const designId = await sentKitchen(world);
      const text = "caf\u00E9\nbar \u{1F600}";

      await world.store.addNote({ session: staff.session, designId, text });

      expect((await world.notesOf(designId)).map((note) => note.text)).toEqual([
        text,
      ]);
    });

    it(
      "answers for any typed text either a refusal with nothing written, or a note stored exactly as the domain judged it",
      async () => {
        const world = await newWorld();
        const staff = await world.aStaffMember();
        const designId = await sentKitchen(world);
        let accepted = 0;

        await fc.assert(
          fc.asyncProperty(typedNote, async (typed) => {
            const judgement = judgeNoteText(typed);
            if (!judgement.ok) {
              await expect(
                world.store.addNote({
                  session: staff.session,
                  designId,
                  text: typed,
                }),
              ).rejects.toMatchObject({ failure: "invalid-request" });
              return;
            }
            const result = await world.store.addNote({
              session: staff.session,
              designId,
              text: judgement.text,
            });
            expect(result).toMatchObject({
              kind: "added",
              note: { text: judgement.text },
            });
            accepted += 1;
            const stored = await world.notesOf(designId);
            expect(stored.map(({ text }) => text)).toContain(judgement.text);
          }),
          { numRuns: runs },
        );

        expect(await world.notesOf(designId)).toHaveLength(accepted);
        expect(await world.auditEventsOf(staff.accountId)).toHaveLength(
          accepted,
        );
      },
      LIVE_TIMEOUT_MS,
    );
  });

  describe(`${arm}: status over a sequence`, () => {
    it(
      "chains the audit rows through the statuses really replaced, writes none for a repeat, and ends on the last status",
      async () => {
        const world = await newWorld();
        await fc.assert(
          fc.asyncProperty(
            fc.array(fc.constantFrom(...REQUEST_STATUSES), {
              minLength: 1,
              maxLength: 6,
            }),
            async (statuses) => {
              const staff = await world.aStaffMember();
              const designId = await sentKitchen(world);
              const expectedAudits: { from: string; to: string }[] = [];
              let shown: RequestStatus = "new";

              for (const status of statuses) {
                const result = await world.store.setStatus({
                  session: staff.session,
                  designId,
                  status,
                });
                if (status === shown) {
                  expect(result.kind).toBe("unchanged");
                  continue;
                }
                expect(result).toMatchObject({
                  kind: "saved",
                  saved: { value: status, by: { id: staff.accountId } },
                });
                expectedAudits.push({ from: shown, to: status });
                shown = status;
              }

              expect(
                (await world.auditEventsOf(staff.accountId)).map((event) => ({
                  action: event.action,
                  designId: event.designId,
                  detail: event.detail,
                })),
              ).toEqual(
                expectedAudits.map((detail) => ({
                  action: "status-changed",
                  designId,
                  detail,
                })),
              );
              const row = await world.statusRowOf(designId);
              expect(row?.status ?? "new").toBe(shown);
            },
          ),
          { numRuns: Math.max(3, Math.floor(runs / 2)) },
        );
      },
      LIVE_TIMEOUT_MS,
    );
  });

  describe(`${arm}: unhide raced against itself`, () => {
    it.each([2, 3])(
      "lets %i simultaneous unhides of one hidden kitchen succeed exactly once, with one audit row",
      async (callers) => {
        const world = await newWorld();
        const staff = await world.aStaffMember();
        const designId = await world.aKitchen({
          client: await world.aClient(),
          isSent: true,
          isHidden: true,
        });

        const results = await Promise.all(
          Array.from({ length: callers }, () =>
            world.store.unhide({ session: staff.session, designId }),
          ),
        );

        expect(results.filter((r) => r.kind === "unhidden")).toHaveLength(1);
        expect(results.filter((r) => r.kind === "not-hidden")).toHaveLength(
          callers - 1,
        );
        expect(await world.isHidden(designId)).toBe(false);
        expect(await world.auditEventsOf(staff.accountId)).toHaveLength(1);
      },
      LIVE_TIMEOUT_MS,
    );

    it("lets a hide survive an unhide refused for a deleted kitchen, and leaves a visible kitchen visible", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const deleted = await world.aKitchen({
        client: await world.aClient(),
        isSent: true,
        isHidden: true,
        isDeletedByClient: true,
      });

      const result = await world.store.unhide({
        session: staff.session,
        designId: deleted,
      });

      expect(result).toEqual({ kind: "kitchen-not-found" });
      expect(await world.isHidden(deleted)).toBe(true);
      expect(await world.auditEventsOf(staff.accountId)).toEqual([]);
    });
  });
}

describeSweep(
  "FakeStaffKitchenActionsStore",
  () => Promise.resolve(newFakeWorld()),
  200,
);
describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  describeSweep("NeonStaffKitchenActionsStore", newLiveWorld, 10);
});

// ---------------------------------------------------------------------------------------------------------------------
// What only the real database can show
// ---------------------------------------------------------------------------------------------------------------------

describe.skipIf(!isLiveTestDatabaseConfigured)(
  "NeonStaffKitchenActionsStore on Postgres: unhide",
  () => {
    it("changes hidden_by_client_at and nothing else of the kitchen, and leaves a revoked share link as it was", async () => {
      const world = await newLiveWorld();
      const staff = await world.aStaffMember();
      const designId = await world.aKitchen({
        client: await world.aClient(),
        isSent: true,
        isHidden: true,
      });
      const tokenHash = randomBytes(32).toString("hex");
      shareTokenHashes.push(tokenHash);
      await world.sql()`
        insert into design_share_links (token_hash, design_id, created_at, revoked_at)
        values (${tokenHash}, ${designId}, now() - interval '1 hour', now() - interval '30 minutes')
      `;
      const kitchenRowWithoutHide = () =>
        world.sql()`select to_jsonb(d) - 'hidden_by_client_at' as rest from designs d where d.id = ${designId}`;
      const linkRow = () =>
        world.sql()`select to_jsonb(l) as link from design_share_links l where l.token_hash = ${tokenHash}`;
      const restBefore = await kitchenRowWithoutHide();
      const linkBefore = await linkRow();

      const result = await world.store.unhide({
        session: staff.session,
        designId,
      });

      expect(result).toEqual({ kind: "unhidden" });
      expect(await kitchenRowWithoutHide()).toEqual(restBefore);
      expect(await linkRow()).toEqual(linkBefore);
      const [after] = await world.sql()`
        select hidden_by_client_at is null as is_visible from designs where id = ${designId}
      `;
      expect(after).toEqual({ is_visible: true });
    });

    it(
      "writes the same single audit row whichever way the race between two staff members falls",
      async () => {
        const world = await newLiveWorld();
        const first = await world.aStaffMember();
        const second = await world.aStaffMember();
        const designId = await world.aKitchen({
          client: await world.aClient(),
          isSent: true,
          isHidden: true,
        });

        const results = await Promise.all([
          world.store.unhide({ session: first.session, designId }),
          world.store.unhide({ session: second.session, designId }),
        ]);

        expect(results.map(({ kind }) => kind).sort()).toEqual([
          "not-hidden",
          "unhidden",
        ]);
        const audits = [
          ...(await world.auditEventsOf(first.accountId)),
          ...(await world.auditEventsOf(second.accountId)),
        ];
        expect(audits).toEqual([
          {
            action: "kitchen-unhidden",
            designId,
            isDetailSqlNull: true,
            detail: null,
          },
        ]);
      },
      LIVE_TIMEOUT_MS,
    );
  },
);

/** Holds each caller after its status read until `parties` callers have read, so both writes are decided on one read. */
function holdStatusReadsUntil(parties: number): () => void {
  interface WithRead {
    readStatusFacts: (...args: unknown[]) => Promise<unknown>;
  }
  const prototype =
    NeonStaffKitchenActionsStore.prototype as unknown as WithRead;
  const original = prototype.readStatusFacts;
  let arrived = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const spy = vi
    .spyOn(prototype, "readStatusFacts")
    .mockImplementation(async function (this: unknown, ...args: unknown[]) {
      const facts = await original.apply(this, args);
      arrived += 1;
      if (arrived >= parties) release();
      await gate;
      return facts;
    });
  return () => {
    spy.mockRestore();
  };
}

describe.skipIf(!isLiveTestDatabaseConfigured)(
  "NeonStaffKitchenActionsStore on Postgres: status saves decided on the same read",
  () => {
    it.each([
      ["no saved status", null],
      ["a saved status", "contacted"],
    ] as const)(
      "lets exactly one of two saves win from %s and writes no audit row for the other",
      async (_name, stored) => {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const world = await newLiveWorld();
          const staff = await world.aStaffMember();
          const other = await world.aStaffMember();
          const designId = await sentKitchen(world);
          if (stored !== null) {
            await world.aStoredStatus({
              designId,
              status: stored,
              changedBy: staff,
            });
          }
          const replaced = stored ?? "new";
          const targets = REQUEST_STATUSES.filter(
            (status) => status !== replaced,
          );
          const [targetA, targetB] = [targets[0], targets[1]] as [
            RequestStatus,
            RequestStatus,
          ];
          const restore = holdStatusReadsUntil(2);

          let results;
          try {
            results = await Promise.all([
              world.store.setStatus({
                session: staff.session,
                designId,
                status: targetA,
              }),
              world.store.setStatus({
                session: other.session,
                designId,
                status: targetB,
              }),
            ]);
          } finally {
            restore();
          }

          expect(results.map(({ kind }) => kind).sort()).toEqual([
            "changed-meanwhile",
            "saved",
          ]);
          const winnerIndex = results.findIndex(({ kind }) => kind === "saved");
          const winner = winnerIndex === 0 ? staff : other;
          const winnerTarget = winnerIndex === 0 ? targetA : targetB;
          const audits = [
            ...(await world.auditEventsOf(staff.accountId)),
            ...(await world.auditEventsOf(other.accountId)),
          ];
          expect(audits).toEqual([
            {
              action: "status-changed",
              designId,
              isDetailSqlNull: false,
              detail: { from: replaced, to: winnerTarget },
            },
          ]);
          expect(await world.auditEventsOf(winner.accountId)).toHaveLength(1);
          expect(await world.statusRowOf(designId)).toMatchObject({
            status: winnerTarget,
            changedByAccountId: winner.accountId,
          });
        }
      },
      LIVE_TIMEOUT_MS,
    );

    it("takes changed_by from the session of the call, and changed_at from the database clock whatever the process clock says", async () => {
      const world = await newLiveWorld();
      const first = await world.aStaffMember();
      const second = await world.aStaffMember();
      const designId = await sentKitchen(world);
      await world.store.setStatus({
        session: first.session,
        designId,
        status: "contacted",
      });

      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2001-02-03T04:05:06.000Z"));
      let result;
      try {
        result = await world.store.setStatus({
          session: second.session,
          designId,
          status: "closed",
        });
      } finally {
        vi.useRealTimers();
      }

      const [row] = await world.sql()`
        select changed_by_account_id, changed_at between now() - interval '2 minutes' and now() as is_just_now
        from design_request_states where design_id = ${designId}
      `;
      expect(row).toEqual({
        changed_by_account_id: second.accountId,
        is_just_now: true,
      });
      expect(result).toMatchObject({
        kind: "saved",
        saved: { by: { id: second.accountId } },
      });
      expect(
        (result as { saved: { at: Date } }).saved.at.getFullYear(),
      ).toBeGreaterThanOrEqual(2026);
    });
  },
);

// ---------------------------------------------------------------------------------------------------------------------
// The session test, in the store's calls and in each write's own statement
// ---------------------------------------------------------------------------------------------------------------------

const DEAD_SESSIONS: readonly (readonly [
  string,
  (
    sql: NeonQueryFunction<false, false>,
    member: StaffMember,
  ) => Promise<unknown>,
])[] = [
  [
    "revoked",
    (sql, m) =>
      sql`update account_sessions set revoked_at = now() where token_hash = ${m.session.sessionTokenHash}`,
  ],
  [
    "past its absolute expiry",
    (sql, m) =>
      sql`update account_sessions set absolute_expires_at = now() - interval '1 second' where token_hash = ${m.session.sessionTokenHash}`,
  ],
  [
    "idle for 13 hours, past an operator's 12 (a client's 30 days would keep it live)",
    (sql, m) =>
      sql`update account_sessions set last_seen_at = now() - interval '13 hours' where token_hash = ${m.session.sessionTokenHash}`,
  ],
  [
    "older than the password change",
    (sql, m) =>
      sql`update accounts set password_changed_at = now() + interval '1 minute' where id = ${m.accountId}`,
  ],
  [
    "of an account that was deleted",
    (sql, m) => sql`delete from accounts where id = ${m.accountId}`,
  ],
];

function preparedFor(
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

describe.skipIf(!isLiveTestDatabaseConfigured)(
  "NeonStaffKitchenActionsStore on Postgres: a session that is not live writes nothing",
  () => {
    it.each(DEAD_SESSIONS)(
      "a session %s: no call changes the kitchen, its status, its notes or its audit rows",
      async (_name, kill) => {
        const world = await newLiveWorld();
        const staff = await world.aStaffMember();
        const designId = await world.aHiddenSentKitchenWithStatus({
          status: "contacted",
          changedBy: staff,
        });
        await kill(world.sql(), staff);
        const before = await snapshotOf(designId);

        const failures = await Promise.all([
          failureOf(
            world.store.addNote({
              session: staff.session,
              designId,
              text: "must not be written",
            }),
          ),
          failureOf(
            world.store.setStatus({
              session: staff.session,
              designId,
              status: "closed",
            }),
          ),
          failureOf(world.store.unhide({ session: staff.session, designId })),
        ]);

        expect(failures.map(({ failure }) => failure)).toEqual([
          "not-recorded",
          "not-recorded",
          "not-recorded",
        ]);
        expect(await snapshotOf(designId)).toEqual(before);
      },
      LIVE_TIMEOUT_MS,
    );

    it.each(DEAD_SESSIONS)(
      "a session %s in the write's own statement, behind a live audit statement: the batch raises and rolls the audit row back",
      async (_name, kill) => {
        const world = await newLiveWorld();
        const dead = await world.aStaffMember();
        const live = await world.aStaffMember();
        const designId = await world.aHiddenSentKitchenWithStatus({
          status: "contacted",
          changedBy: live,
        });
        await kill(world.sql(), dead);
        const before = await snapshotOf(designId);
        const connection = world.sql();
        const liveAudit = () =>
          staffAuditInsertStatement(connection, preparedFor(live, designId));

        const noteCode = (
          (await rejectionOf(
            connection.transaction([
              liveAudit(),
              addNoteStatement(connection, {
                noteId: nanoid(),
                designId,
                text: "orphan",
                session: preparedFor(dead, designId),
              }),
            ]),
          )) as { code?: unknown }
        ).code;
        const statusCode = (
          (await rejectionOf(
            connection.transaction([
              liveAudit(),
              saveStatusStatement(connection, {
                designId,
                status: "closed",
                expectedStored: "contacted",
                session: preparedFor(dead, designId),
              }),
            ]),
          )) as { code?: unknown }
        ).code;

        expect([noteCode, statusCode]).toEqual([
          DIVISION_BY_ZERO,
          DIVISION_BY_ZERO,
        ]);
        expect(await snapshotOf(designId)).toEqual(before);
      },
      LIVE_TIMEOUT_MS,
    );

    it("takes the idle figure of the account's own role: 13 idle hours are dead for an operator and live for a client-role account", async () => {
      const world = await newLiveWorld();
      const operator = await world.aStaffMemberWithRole("operator");
      const clientRole = await world.aStaffMemberWithRole("client");
      await world.sql()`
        update account_sessions set last_seen_at = now() - interval '13 hours'
        where token_hash = any(${[operator.session.sessionTokenHash, clientRole.session.sessionTokenHash]})
      `;
      const designId = await sentKitchen(world);

      const deadOne = await failureOf(
        world.store.unhide({ session: operator.session, designId }),
      );
      const liveOne = await world.store.addNote({
        session: clientRole.session,
        designId,
        text: "live under its own role's figure",
      });

      expect(deadOne.failure).toBe("not-recorded");
      expect(liveOne.kind).toBe("added");
    });
  },
);

// ---------------------------------------------------------------------------------------------------------------------
// The notes the store wrote, read back by the staff reader
// ---------------------------------------------------------------------------------------------------------------------

describe.skipIf(!isLiveTestDatabaseConfigured)(
  "NeonStaffKitchenActionsStore on Postgres: the notes it writes, as the reader lists them",
  () => {
    it(
      "lists the newest note first, then notes of one instant by descending id, the same on every read",
      async () => {
        const world = await newLiveWorld();
        const staff = await world.aStaffMember();
        const designId = await world.aHiddenSentKitchenWithStatus({
          status: "new",
          changedBy: staff,
        });
        const tiedIds = ["a", "b", "c"].map(
          (letter) => `${letter}${nanoid().slice(1)}`,
        );
        for (const id of tiedIds) {
          await world.sql()`
          insert into design_notes (id, design_id, author_account_id, body, created_at)
          values (${id}, ${designId}, ${staff.accountId}, ${`tied ${id}`}, '2026-10-05T10:00:00.000Z')
        `;
        }
        const added = await world.store.addNote({
          session: staff.session,
          designId,
          text: "newest",
        });
        const reader = new NeonStaffKitchenReader(liveTestDatabaseUrl);
        const orderOf = async () => {
          const reading = await reader.readOne(designId);
          if (reading.kind !== "found") throw new Error("kitchen not read");
          return reading.kitchen.notes.map(({ id }) => id);
        };

        const first = await orderOf();
        const second = await orderOf();

        const addedId = (added as { note: { id: string } }).note.id;
        const tiedRows = await world.sql()`
          select id from design_notes where design_id = ${designId} and id <> ${addedId}
          order by id desc
        `;
        const databaseOrderOfTies = tiedRows.map((row) => row["id"] as string);
        expect(first).toEqual([addedId, ...databaseOrderOfTies]);
        expect(second).toEqual(first);
      },
      LIVE_TIMEOUT_MS,
    );

    it("shows a note written on a hidden kitchen to the reader, with its author", async () => {
      const world = await newLiveWorld();
      const staff = await world.aStaffMember();
      const designId = await world.aHiddenSentKitchenWithStatus({
        status: "new",
        changedBy: staff,
      });

      await world.store.addNote({
        session: staff.session,
        designId,
        text: "seen on a hidden kitchen",
      });

      const reading = await new NeonStaffKitchenReader(
        liveTestDatabaseUrl,
      ).readOne(designId);
      expect(reading).toMatchObject({
        kind: "found",
        kitchen: {
          isHidden: true,
          notes: [
            {
              text: "seen on a hidden kitchen",
              author: { id: staff.accountId },
            },
          ],
        },
      });
    });
  },
);
