import { randomBytes } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import { afterAll, describe, expect, it } from "vitest";

import { FakeSessionStore } from "../src/fake-session-store.js";
import { FakeStaffAuditStore } from "../src/fake-staff-audit-store.js";
import type { StaffAuditDirectory } from "../src/fake-staff-audit-store.js";
import {
  NeonStaffAuditStore,
  staffAuditInsertStatement,
  staffAuditStoreErrorFrom,
} from "../src/neon-staff-audit-store.js";
import {
  MAX_STAFF_AUDIT_PAGE,
  StaffAuditStoreError,
  prepareStaffAuditRecord,
} from "../src/staff-audit-store.js";
import type {
  PreparedStaffAuditRecord,
  StaffAuditPageRequest,
  StaffAuditRecord,
} from "../src/staff-audit-store.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { rejectionOf } from "./support/rejection-of.js";
import type {
  AuditWorld,
  ClientAccount,
  Kitchen,
  StaffMember,
} from "./support/staff-audit-store-contract.js";
import { holdSharedTestSchemaLock } from "./support/test-schema-lock.js";

// Shared: the live arm writes rows under ids only it mints and deletes them by those ids, and needs the schema intact.
holdSharedTestSchemaLock();

/**
 * Adversarial QA of the staff audit store: cases the shared contract suite (`tests/support/staff-audit-store-contract.ts`) does
 * not hold, run over **both** arms, the fake and the live test database, so a difference between the two is a failing
 * test. The suites that own the contract cannot be edited from QA, so the cases live here, each against a world built
 * as the developer's two files build theirs.
 *
 * The live arm runs over the test database's owner credential (what the statements do with rows, not what the
 * application role is granted). A Neon HTTP statement commits, so each row written names an account, kitchen or event
 * id this file minted, and `afterAll` deletes by those ids only.
 */
const SUITE_NAME = "staff audit store contract, second sweep (fake and live)";
if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

const PASSWORD_HASH = `$argon2id$v=19$m=19456,t=2,p=1$${"A".repeat(22)}$${"B".repeat(43)}`;
const IDLE_LIFETIMES = {
  client: 2_592_000,
  operator: 43_200,
  administrator: 43_200,
};
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const FIRST_INSTANT = Date.parse("2026-10-01T09:00:00.000Z");
const ONE_MINUTE_MS = 60_000;
const PAGE_SIZE = 25;
const ID_STARTS = ["-", "_", "0", "A", "Z", "a", "z"] as const;
const MARKER = "qa-l3-s3";

// ---------------------------------------------------------------------------------------------------------------------
// The two worlds
// ---------------------------------------------------------------------------------------------------------------------

function newFakeWorld(): AuditWorld {
  const now = () => new Date("2026-10-21T09:00:00.000Z");
  const accounts = new Map<
    string,
    { email: string; name: string | null; role: "client" | "operator" }
  >();
  const designs = new Map<
    string,
    {
      name: string | null;
      ownerAccountId: string | null;
      isDeletedByClient: boolean;
    }
  >();
  const sessions = new FakeSessionStore({
    now,
    accountOf: (accountId) => {
      const held = accounts.get(accountId);
      return held === undefined
        ? undefined
        : {
            id: accountId,
            email: held.email,
            role: held.role,
            isEmailVerified: true,
          };
    },
    passwordHashOf: (accountId) =>
      accounts.has(accountId) ? PASSWORD_HASH : undefined,
    passwordChangedAtOf: (accountId) =>
      accounts.has(accountId)
        ? new Date("2026-01-01T00:00:00.000Z")
        : undefined,
  });
  const directory: StaffAuditDirectory = {
    accountOf: (accountId) => accounts.get(accountId),
    designOf: (designId) => designs.get(designId),
  };
  const fake = new FakeStaffAuditStore({ now, sessions, directory });

  async function signedIn(): Promise<StaffMember> {
    const accountId = nanoid();
    const email = `${MARKER}-${accountId}@example.invalid`;
    accounts.set(accountId, { email, name: "Staff Name", role: "operator" });
    const sessionTokenHash = randomBytes(32).toString("hex");
    await sessions.create({
      tokenHash: sessionTokenHash,
      accountId,
      expectedPasswordHash: PASSWORD_HASH,
      absoluteExpiresAt: new Date(now().getTime() + SESSION_LIFETIME_MS),
    });
    return {
      accountId,
      email,
      name: "Staff Name",
      sessionTokenHash,
      idleLifetimeSeconds: IDLE_LIFETIMES,
    };
  }

  return {
    store: fake,
    aStaffMember: signedIn,
    async aStaffMemberWhoseSessionIsRevoked() {
      const member = await signedIn();
      await sessions.revoke(member.sessionTokenHash);
      return member;
    },
    aClient(): Promise<ClientAccount> {
      const accountId = nanoid();
      const email = `${MARKER}-client-${accountId}@example.invalid`;
      accounts.set(accountId, { email, name: null, role: "client" });
      return Promise.resolve({ accountId, email });
    },
    aKitchen({ client, name, isDeletedByClient = false }): Promise<Kitchen> {
      const designId = nanoid();
      designs.set(designId, {
        name,
        ownerAccountId: client?.accountId ?? null,
        isDeletedByClient,
      });
      return Promise.resolve({ designId, name, client });
    },
    plantEvent(event) {
      const id = event.id ?? nanoid();
      fake.plant({
        id,
        occurredAt: event.occurredAt,
        actorAccountId: event.actorAccountId,
        action: event.action,
        designId: event.designId ?? null,
        subjectAccountId: event.subjectAccountId ?? null,
        detail: event.detail ?? null,
      });
      return Promise.resolve(id);
    },
    storedEventsOf(actorAccountId) {
      return Promise.resolve(
        fake
          .heldEvents()
          .filter((event) => event.actorAccountId === actorAccountId)
          .map((event) => ({
            id: event.id,
            actorAccountId: event.actorAccountId,
            action: event.action,
            designId: event.designId,
            subjectAccountId: event.subjectAccountId,
            isDetailSqlNull: event.detail === null,
            detail: event.detail,
          })),
      );
    },
    removeAccount(accountId) {
      accounts.delete(accountId);
      return Promise.resolve();
    },
  };
}

const sql = () => neon(liveTestDatabaseUrl);
const mintedAccountIds: string[] = [];
const mintedDesignIds: string[] = [];
const mintedEventIds: string[] = [];

async function insertAccount(role: "client" | "operator", name: string | null) {
  const accountId = nanoid();
  const email = `${MARKER}-${accountId.toLowerCase()}@example.invalid`;
  mintedAccountIds.push(accountId);
  await sql()`
    insert into accounts (id, email, email_normal_form, password_hash, role, locale, privacy_notice_version, name)
    values (${accountId}, ${email}, ${email}, ${PASSWORD_HASH}, ${role}, 'ro', '1', ${name})
  `;
  return { accountId, email };
}

function newLiveWorld(): AuditWorld {
  async function signIn(): Promise<StaffMember> {
    const { accountId, email } = await insertAccount("operator", "Staff Name");
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
  return {
    store: new NeonStaffAuditStore(liveTestDatabaseUrl),
    aStaffMember: signIn,
    async aStaffMemberWhoseSessionIsRevoked() {
      const member = await signIn();
      await sql()`update account_sessions set revoked_at = now() where token_hash = ${member.sessionTokenHash}`;
      return member;
    },
    aClient: () => insertAccount("client", null),
    async aKitchen({
      client,
      name,
      isDeletedByClient = false,
    }): Promise<Kitchen> {
      const designId = nanoid();
      mintedDesignIds.push(designId);
      await sql()`
        insert into designs (id, schema_version, document, account_id, name, deleted_by_client_at)
        values (${designId}, 1, '{}'::jsonb, ${client?.accountId ?? null}, ${name},
          case when ${isDeletedByClient}::boolean then now() end)
      `;
      return { designId, name, client };
    },
    async plantEvent(event) {
      const id = event.id ?? nanoid();
      mintedEventIds.push(id);
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
        select id, actor_account_id, action, design_id, subject_account_id, (detail is null) as is_detail_sql_null, detail
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
  };
}

afterAll(async () => {
  if (!isLiveTestDatabaseConfigured) return;
  await sql()`delete from staff_audit_events where actor_account_id = any(${mintedAccountIds}) or id = any(${mintedEventIds})`;
  await sql()`delete from designs where id = any(${mintedDesignIds})`;
  await sql()`delete from accounts where id = any(${mintedAccountIds})`;
});

// ---------------------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------------------

function requestFor(
  member: StaffMember,
  overrides: Partial<StaffAuditPageRequest> = {},
): StaffAuditPageRequest {
  return {
    actorAccountId: member.accountId,
    action: null,
    occurredFrom: null,
    occurredBefore: null,
    page: 1,
    ...overrides,
  };
}

function recordFor(
  member: StaffMember,
  overrides: Partial<StaffAuditRecord> = {},
): StaffAuditRecord {
  return {
    sessionTokenHash: member.sessionTokenHash,
    idleLifetimeSeconds: member.idleLifetimeSeconds,
    entry: { action: "kitchen-opened", detail: null },
    designId: nanoid(),
    subjectAccountId: null,
    ...overrides,
  };
}

async function plant(
  world: AuditWorld,
  actor: StaffMember,
  occurredAt: Date,
  options: { id?: string; action?: string; designId?: string | null } = {},
): Promise<string> {
  return world.plantEvent({
    occurredAt,
    actorAccountId: actor.accountId,
    action: options.action ?? "kitchen-opened",
    designId: options.designId ?? null,
    ...(options.id === undefined ? {} : { id: options.id }),
  });
}

/** An id that starts with the given character and is random after it. */
function idStartingWith(first: string): string {
  return first + nanoid(20);
}

async function allPages(
  world: AuditWorld,
  request: StaffAuditPageRequest,
  pageCount: number,
) {
  const pages = [];
  for (let page = 1; page <= pageCount; page += 1) {
    pages.push(await world.store.page({ ...request, page }));
  }
  return pages;
}

async function failureOf(
  pending: PromiseLike<unknown>,
): Promise<StaffAuditStoreError> {
  const failure = await rejectionOf(pending);
  expect(failure).toBeInstanceOf(StaffAuditStoreError);
  return failure as StaffAuditStoreError;
}

type Outcome = "page" | StaffAuditStoreError["failure"];

/** What a request for an instant outside the database's range may end as: never the 503 of a `database` failure. */
const PAGE_OR_REFUSAL: readonly Outcome[] = ["page", "invalid-record"];

async function outcomeOf(pending: PromiseLike<unknown>): Promise<Outcome> {
  try {
    await pending;
    return "page";
  } catch (failure) {
    return failure instanceof StaffAuditStoreError
      ? failure.failure
      : "database";
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The cases both arms must satisfy
// ---------------------------------------------------------------------------------------------------------------------

function describeSecondSweep(
  armName: string,
  newWorld: () => AuditWorld,
): void {
  describe(`${armName}: ordering and paging`, () => {
    it("orders ids that differ in punctuation and case by code-unit order within one instant (the test database is C.UTF-8)", async () => {
      const world = newWorld();
      const actor = await world.aStaffMember();
      const ids = ["-", "_", "0", "A", "Z", "a", "z"].map(idStartingWith);
      for (const id of ids)
        await plant(world, actor, new Date(FIRST_INSTANT), { id });

      const page = await world.store.page(requestFor(actor));

      expect(page.events.map(({ id }) => id)).toEqual(
        [...ids].sort().reverse(),
      );
    });

    it("pages thirty rows of one instant as 25 and 5 with no row twice and none skipped", async () => {
      const world = newWorld();
      const actor = await world.aStaffMember();
      const ids = Array.from({ length: 30 }, (_, index) =>
        idStartingWith(ID_STARTS[index % ID_STARTS.length] ?? "a"),
      );
      for (const id of ids)
        await plant(world, actor, new Date(FIRST_INSTANT), { id });

      const pages = await allPages(world, requestFor(actor), 3);

      expect(pages.map((page) => [page.total, page.events.length])).toEqual([
        [30, PAGE_SIZE],
        [30, 5],
        [30, 0],
      ]);
      expect(pages.flatMap((page) => page.events.map(({ id }) => id))).toEqual(
        [...ids].sort().reverse(),
      );
    });

    it("counts a row the domain refuses and gives it its place in the order and on its page", async () => {
      const world = newWorld();
      const actor = await world.aStaffMember();
      const refusedPositions = new Set([24, 25]);
      const planted: { id: string; isRefused: boolean }[] = [];
      for (let position = 0; position < 27; position += 1) {
        const isRefused = refusedPositions.has(position);
        const id = await plant(
          world,
          actor,
          new Date(FIRST_INSTANT - position * ONE_MINUTE_MS),
          {
            action: isRefused ? "preset-hidden" : "kitchen-opened",
          },
        );
        planted.push({ id, isRefused });
      }

      const [first, second] = await allPages(world, requestFor(actor), 2);

      expect(first?.total).toBe(27);
      expect(first?.events.map(({ id }) => id)).toEqual(
        planted.slice(0, 25).map(({ id }) => id),
      );
      expect(first?.events.at(-1)?.reading).toEqual({
        kind: "unrecognised",
        action: "preset-hidden",
      });
      expect(
        second?.events.map(({ id, reading }) => [id, reading.kind]),
      ).toEqual([
        [planted[25]?.id, "unrecognised"],
        [planted[26]?.id, "recognised"],
      ]);
    });

    it("finds rows by an action code the domain does not list", async () => {
      const world = newWorld();
      const actor = await world.aStaffMember();
      await plant(world, actor, new Date(FIRST_INSTANT), {
        action: "preset-hidden",
      });
      await plant(world, actor, new Date(FIRST_INSTANT + 1), {
        action: "kitchen-opened",
      });

      const page = await world.store.page(
        requestFor(actor, { action: "preset-hidden" }),
      );

      expect([page.total, page.events.map(({ reading }) => reading)]).toEqual([
        1,
        [{ kind: "unrecognised", action: "preset-hidden" }],
      ]);
    });

    it("combines the actor, the action and the window with AND", async () => {
      const world = newWorld();
      const actor = await world.aStaffMember();
      const other = await world.aStaffMember();
      const at = (minutes: number) =>
        new Date(FIRST_INSTANT + minutes * ONE_MINUTE_MS);
      const wanted = await plant(world, actor, at(5), { action: "note-added" });
      await plant(world, actor, at(5), { action: "kitchen-opened" });
      await plant(world, actor, at(20), { action: "note-added" });
      await plant(world, other, at(5), { action: "note-added" });

      const page = await world.store.page(
        requestFor(actor, {
          action: "note-added",
          occurredFrom: at(0),
          occurredBefore: at(10),
        }),
      );

      expect([page.total, page.events.map(({ id }) => id)]).toEqual([
        1,
        [wanted],
      ]);
    });

    it.each([
      ["a window that ends before it starts", 10, 0],
      ["an empty window (start equals end)", 5, 5],
    ])(
      "answers %s with no rows and a zero total, though a row sits on its bounds",
      async (_label, fromMinutes, beforeMinutes) => {
        const world = newWorld();
        const actor = await world.aStaffMember();
        await plant(world, actor, new Date(FIRST_INSTANT + 5 * ONE_MINUTE_MS));

        const page = await world.store.page(
          requestFor(actor, {
            occurredFrom: new Date(FIRST_INSTANT + fromMinutes * ONE_MINUTE_MS),
            occurredBefore: new Date(
              FIRST_INSTANT + beforeMinutes * ONE_MINUTE_MS,
            ),
          }),
        );

        expect([page.total, page.events]).toEqual([0, []]);
      },
    );

    it.each([
      [
        "the 23-hour Chisinau day of the spring change (29 March 2026)",
        "2026-03-28T22:00:00.000Z",
        "2026-03-29T21:00:00.000Z",
      ],
      [
        "the 25-hour Chisinau day of the autumn change (25 October 2026)",
        "2026-10-24T21:00:00.000Z",
        "2026-10-25T22:00:00.000Z",
      ],
    ])(
      "keeps %s half-open at both instants",
      async (_label, startText, endText) => {
        const world = newWorld();
        const actor = await world.aStaffMember();
        const start = new Date(startText);
        const end = new Date(endText);
        await plant(world, actor, new Date(start.getTime() - 1));
        const atStart = await plant(world, actor, start);
        const lastInside = await plant(
          world,
          actor,
          new Date(end.getTime() - 1),
        );
        await plant(world, actor, end);

        const page = await world.store.page(
          requestFor(actor, { occurredFrom: start, occurredBefore: end }),
        );

        expect(page.events.map(({ id }) => id)).toEqual([lastInside, atStart]);
        expect(page.total).toBe(2);
      },
    );

    it("accepts the last page a request may name and answers it empty with the real total", async () => {
      const world = newWorld();
      const actor = await world.aStaffMember();
      await plant(world, actor, new Date(FIRST_INSTANT));

      const page = await world.store.page(
        requestFor(actor, { page: MAX_STAFF_AUDIT_PAGE }),
      );

      expect([page.total, page.events, page.page]).toEqual([
        1,
        [],
        MAX_STAFF_AUDIT_PAGE,
      ]);
    });
  });

  describe(`${armName}: names that no longer resolve`, () => {
    it("keeps the client of a kitchen by id, without address or name, when the client's account is gone but the kitchen remains", async () => {
      const world = newWorld();
      const actor = await world.aStaffMember();
      const client = await world.aClient();
      const kitchen = await world.aKitchen({ client, name: "Casa" });
      await plant(world, actor, new Date(FIRST_INSTANT), {
        action: "kitchen-opened",
        designId: kitchen.designId,
      });
      await world.removeAccount(client.accountId);

      const page = await world.store.page(requestFor(actor));

      expect(page.events[0]?.design).toEqual({
        id: kitchen.designId,
        name: "Casa",
        client: { id: client.accountId, email: null, name: null },
      });
    });

    it("keeps the subject of a row by id, without address or name, when the subject's account is gone", async () => {
      const world = newWorld();
      const actor = await world.aStaffMember();
      const subject = await world.aClient();
      await world.plantEvent({
        occurredAt: new Date(FIRST_INSTANT),
        actorAccountId: actor.accountId,
        action: "kitchen-opened",
        subjectAccountId: subject.accountId,
      });
      await world.removeAccount(subject.accountId);

      const page = await world.store.page(requestFor(actor));

      expect(page.events[0]?.subject).toEqual({
        id: subject.accountId,
        email: null,
        name: null,
      });
    });

    it("writes nothing and throws not-recorded once the staff member's account is gone", async () => {
      const world = newWorld();
      const actor = await world.aStaffMember();
      await world.removeAccount(actor.accountId);

      const failure = await failureOf(world.store.record(recordFor(actor)));

      expect(failure.failure).toBe("not-recorded");
      expect(await world.storedEventsOf(actor.accountId)).toHaveLength(0);
    });

    it("reads a stored row at an instant before 1970 as a row, not as a failure of the whole page", async () => {
      const world = newWorld();
      const actor = await world.aStaffMember();
      const id = await plant(world, actor, new Date(-1));
      await plant(world, actor, new Date(FIRST_INSTANT));

      const page = await world.store.page(requestFor(actor));

      expect(page.events.map((event) => event.id)).toContain(id);
      expect(page.total).toBe(2);
    });
  });

  describe(`${armName}: what a request may hold`, () => {
    const NOT_A_PAGE_REQUEST: readonly (readonly [
      string,
      Record<string, unknown>,
    ])[] = [
      ["page -1", { page: -1 }],
      ["page NaN", { page: Number.NaN }],
      ["page Infinity", { page: Number.POSITIVE_INFINITY }],
      ["page -Infinity", { page: Number.NEGATIVE_INFINITY }],
      ["page 1e21", { page: 1e21 }],
      ["page 2^53", { page: 2 ** 53 }],
      ["a page given as text", { page: "1" }],
      ["a page given as a bigint", { page: 1n }],
      ["no page", { page: undefined }],
      ["an actor left out (undefined)", { actorAccountId: undefined }],
      ["an action left out (undefined)", { action: undefined }],
      ["a start left out (undefined)", { occurredFrom: undefined }],
      ["an empty actor id", { actorAccountId: "" }],
      ["an empty action", { action: "" }],
      ["an action with a trailing line feed", { action: "note-added\n" }],
      ["an action with a NUL", { action: "note\u0000added" }],
      ["an action of 33 characters", { action: "a".repeat(33) }],
      ["an upper-case action", { action: "Note-Added" }],
      ["an actor id of 22 characters", { actorAccountId: "a".repeat(22) }],
      [
        "an actor id with a trailing line feed",
        { actorAccountId: `${"a".repeat(20)}\n` },
      ],
      ["a full-width actor id", { actorAccountId: "\uFF21".repeat(21) }],
      [
        "a start that is an invalid Date",
        { occurredFrom: new Date(Number.NaN) },
      ],
      [
        "an end that is an invalid Date",
        { occurredBefore: new Date(Number.NaN) },
      ],
      ["a start given as a number", { occurredFrom: 0 }],
      ["an end given as text", { occurredBefore: "2026-10-01T00:00:00.000Z" }],
      [
        "a start that quacks like a Date",
        { occurredFrom: { getTime: () => 0, toISOString: () => "x'; --" } },
      ],
    ];

    it.each(NOT_A_PAGE_REQUEST)(
      "refuses %s as invalid-record before any statement",
      async (_label, overrides) => {
        const world = newWorld();
        const actor = await world.aStaffMember();

        const failure = await failureOf(
          world.store.page({ ...requestFor(actor), ...overrides }),
        );

        expect(failure.failure).toBe("invalid-record");
      },
    );

    it.each([
      ["an action of only hyphens", { action: "--" }],
      ["an actor id of only hyphens", { actorAccountId: "-".repeat(21) }],
    ] satisfies readonly (readonly [string, Partial<StaffAuditPageRequest>])[])(
      "reads %s, which the shape allows and which would be a comment in SQL, as a value that matches nothing",
      async (_label, overrides) => {
        const world = newWorld();
        const actor = await world.aStaffMember();
        await plant(world, actor, new Date(FIRST_INSTANT));

        const page = await world.store.page(requestFor(actor, overrides));
        const unfiltered = await world.store.page(requestFor(actor));

        expect([page.total, page.events]).toEqual([0, []]);
        expect(unfiltered.total).toBe(1);
      },
    );

    it.each([
      ["the largest instant a Date holds", new Date(8.64e15)],
      ["the smallest instant a Date holds", new Date(-8.64e15)],
      ["an instant in year 10000", new Date("+010000-01-01T00:00:00.000Z")],
      ["an instant in year 0", new Date("0000-01-01T00:00:00.000Z")],
    ])(
      "never answers %s as a database failure (a page or a refusal of the request, not a 503)",
      async (_label, instant) => {
        const world = newWorld();
        const actor = await world.aStaffMember();
        await plant(world, actor, new Date(FIRST_INSTANT));

        const asStart = await outcomeOf(
          world.store.page(requestFor(actor, { occurredFrom: instant })),
        );
        const asEnd = await outcomeOf(
          world.store.page(requestFor(actor, { occurredBefore: instant })),
        );

        expect(PAGE_OR_REFUSAL).toContain(asStart);
        expect(PAGE_OR_REFUSAL).toContain(asEnd);
      },
    );
  });

  describe(`${armName}: record`, () => {
    const NOT_AN_ENTRY: readonly (readonly [string, unknown])[] = [
      [
        "kitchen-opened with an empty object as detail",
        { action: "kitchen-opened", detail: {} },
      ],
      [
        "kitchen-opened with an array as detail",
        { action: "kitchen-opened", detail: [] },
      ],
      [
        "kitchen-opened with a detail of the status shape",
        { action: "kitchen-opened", detail: { from: "new", to: "closed" } },
      ],
      [
        "status-changed without a detail",
        { action: "status-changed", detail: null },
      ],
      [
        "status-changed with a third key",
        {
          action: "status-changed",
          detail: { from: "new", to: "closed", note: "secret text" },
        },
      ],
      [
        "status-changed with an unlisted status",
        { action: "status-changed", detail: { from: "new", to: "gone" } },
      ],
      [
        "status-changed with an own __proto__ key",
        {
          action: "status-changed",
          detail: JSON.parse(
            '{"from":"new","to":"closed","__proto__":{"x":1}}',
          ) as unknown,
        },
      ],
      [
        "an action the domain does not list",
        { action: "preset-hidden", detail: null },
      ],
      ["an action in capitals", { action: "KITCHEN-OPENED", detail: null }],
    ];

    it.each(NOT_AN_ENTRY)(
      "refuses %s as an unrecognised entry and stores nothing",
      async (_label, entry) => {
        const world = newWorld();
        const actor = await world.aStaffMember();

        const failure = await failureOf(
          world.store.record(
            recordFor(actor, { entry: entry as StaffAuditRecord["entry"] }),
          ),
        );

        expect([failure.failure, failure.refusal]).toEqual([
          "invalid-record",
          "ENTRY_NOT_RECOGNISED",
        ]);
        expect(await world.storedEventsOf(actor.accountId)).toHaveLength(0);
      },
    );

    it("stores a missing detail (undefined) as SQL null", async () => {
      const world = newWorld();
      const actor = await world.aStaffMember();

      await world.store.record(
        recordFor(actor, {
          entry: {
            action: "kitchen-opened",
            detail: undefined,
          } as unknown as StaffAuditRecord["entry"],
        }),
      );

      expect(await world.storedEventsOf(actor.accountId)).toMatchObject([
        { isDetailSqlNull: true },
      ]);
    });

    it("stores a status change whose keys came in the other order as the same two codes", async () => {
      const world = newWorld();
      const actor = await world.aStaffMember();

      await world.store.record(
        recordFor(actor, {
          entry: {
            action: "status-changed",
            detail: { to: "closed", from: "new" },
          } as StaffAuditRecord["entry"],
        }),
      );

      const [stored] = await world.storedEventsOf(actor.accountId);
      expect(stored?.detail).toEqual({ from: "new", to: "closed" });
    });

    it("writes one row per call, with distinct ids, when twelve calls are made at once", async () => {
      const world = newWorld();
      const actor = await world.aStaffMember();

      await Promise.all(
        Array.from({ length: 12 }, () => world.store.record(recordFor(actor))),
      );

      const stored = await world.storedEventsOf(actor.accountId);
      expect(new Set(stored.map(({ id }) => id)).size).toBe(12);
    });
  });

  describe(`${armName}: what the page may carry`, () => {
    const ACCOUNT_KEYS = ["email", "id", "name"];
    const DESIGN_KEYS = ["client", "id", "name"];
    const ROW_KEYS = [
      "actor",
      "design",
      "id",
      "occurredAt",
      "reading",
      "subject",
    ];

    it("holds, in every row of every page, only the keys the port declares: no postal address, phone, note text or kitchen document", async () => {
      const world = newWorld();
      const actor = await world.aStaffMember();
      const client = await world.aClient();
      const kitchen = await world.aKitchen({ client, name: "Casa" });
      await world.plantEvent({
        occurredAt: new Date(FIRST_INSTANT),
        actorAccountId: actor.accountId,
        action: "kitchen-opened",
        designId: kitchen.designId,
        subjectAccountId: client.accountId,
      });

      const page = await world.store.page(requestFor(actor));

      const [row] = page.events;
      expect(Object.keys(page).sort()).toEqual([
        "events",
        "page",
        "pageSize",
        "total",
      ]);
      expect(Object.keys(row ?? {}).sort()).toEqual(ROW_KEYS);
      expect(Object.keys(row?.actor ?? {}).sort()).toEqual(ACCOUNT_KEYS);
      expect(Object.keys(row?.subject ?? {}).sort()).toEqual(ACCOUNT_KEYS);
      expect(Object.keys(row?.design ?? {}).sort()).toEqual(DESIGN_KEYS);
      expect(Object.keys(row?.design?.client ?? {}).sort()).toEqual(
        ACCOUNT_KEYS,
      );
    });
  });
}

describeSecondSweep("FakeStaffAuditStore", newFakeWorld);

describe.skipIf(!isLiveTestDatabaseConfigured)(
  "NeonStaffAuditStore (live test database)",
  () => {
    describeSecondSweep("NeonStaffAuditStore", newLiveWorld);

    describe("what only a real database shows of a failure", () => {
      const LEAK_ID_MARKER = "LEAKID";

      async function liveSession() {
        const world = newLiveWorld();
        const member = await world.aStaffMember();
        return { world, member };
      }

      function preparedFor(
        member: StaffMember,
        overrides: Partial<PreparedStaffAuditRecord> = {},
      ) {
        const id = `${LEAK_ID_MARKER}${nanoid(15)}`;
        mintedEventIds.push(id);
        return {
          ...prepareStaffAuditRecord(recordFor(member)),
          id,
          ...overrides,
        };
      }

      function everythingReadableFrom(failure: unknown): string {
        const seen = new Set<unknown>();
        const walk = (value: unknown): string => {
          if (typeof value !== "object" || value === null || seen.has(value))
            return String(value);
          seen.add(value);
          const own = Object.getOwnPropertyNames(value).map((key) =>
            walk((value as Record<string, unknown>)[key]),
          );
          return own.join("|");
        };
        return walk(failure);
      }

      it("keeps the failing row out of the error of a real 23514, and names the constraint", async () => {
        const { member } = await liveSession();
        const prepared = preparedFor(member, { designId: "design-LEAKMARK!!" });

        const raw = await rejectionOf(
          staffAuditInsertStatement(sql(), prepared),
        );
        const reduced = staffAuditStoreErrorFrom(
          "record a staff audit event",
          raw,
        );

        expect(everythingReadableFrom(raw)).toContain("design-LEAKMARK!!");
        expect(reduced).toMatchObject({
          failure: "database",
          cause: {
            code: "23514",
            constraint: "staff_audit_events_design_id_shape",
          },
        });
        const readable =
          everythingReadableFrom(reduced) + (reduced.stack ?? "");
        for (const secret of [
          "design-LEAKMARK",
          prepared.id,
          member.sessionTokenHash,
          "Failing row",
        ]) {
          expect(readable).not.toContain(secret);
        }
      });

      it("keeps the id and the session out of the error of a real 23505 (a collision), and names the primary key", async () => {
        const { member } = await liveSession();
        const prepared = preparedFor(member);
        await staffAuditInsertStatement(sql(), prepared);

        const raw = await rejectionOf(
          staffAuditInsertStatement(sql(), prepared),
        );
        const reduced = staffAuditStoreErrorFrom(
          "record a staff audit event",
          raw,
        );

        expect(everythingReadableFrom(raw)).toContain(prepared.id);
        expect(reduced).toMatchObject({
          failure: "database",
          cause: { code: "23505", constraint: "staff_audit_events_pkey" },
        });
        const readable =
          everythingReadableFrom(reduced) + (reduced.stack ?? "");
        expect(readable).not.toContain(prepared.id);
        expect(readable).not.toContain(member.sessionTokenHash);
      });

      it("leaves no audit row behind when a later statement of the caller's batch fails", async () => {
        const { world, member } = await liveSession();
        const existingId = await world.plantEvent({
          occurredAt: new Date(FIRST_INSTANT),
          actorAccountId: member.accountId,
          action: "note-added",
          designId: nanoid(),
        });
        const connection = sql();
        const prepared = preparedFor(member);

        const failure = await rejectionOf(
          connection.transaction([
            staffAuditInsertStatement(connection, prepared),
            connection`insert into staff_audit_events (id, actor_account_id, action, design_id)
            values (${existingId}, ${member.accountId}, 'note-added', ${nanoid()})`,
          ]),
        );

        expect((failure as { code?: string }).code).toBe("23505");
        const stored = await world.storedEventsOf(member.accountId);
        expect(stored.map(({ id }) => id)).toEqual([existingId]);
      });

      it("reads a real 42501 as unavailable (the error of a refused SET ROLE; the audit statements are not run as the application role)", async () => {
        const failure = await rejectionOf(sql()`set role app_designs`);

        expect((failure as { code?: string }).code).toBe("42501");
        expect(
          staffAuditStoreErrorFrom("read the staff audit log", failure).failure,
        ).toBe("unavailable");
      });
    });
  },
);

// ---------------------------------------------------------------------------------------------------------------------
// Needs no database
// ---------------------------------------------------------------------------------------------------------------------

describe("prepareStaffAuditRecord holds what it validated", () => {
  const VALID_ID = "A".repeat(21);
  const HOSTILE = "x'; delete from staff_audit_events; --";

  /** A getter that answers the checked value the first time it is read and a hostile one every time after. */
  function recordWhoseFieldChangesAfterTheFirstRead(
    field: "designId" | "subjectAccountId" | "sessionTokenHash",
  ) {
    const valid = field === "sessionTokenHash" ? "0".repeat(64) : VALID_ID;
    const hostile = field === "sessionTokenHash" ? HOSTILE : HOSTILE;
    let reads = 0;
    const record = {
      sessionTokenHash: "0".repeat(64),
      idleLifetimeSeconds: IDLE_LIFETIMES,
      entry: { action: "kitchen-opened", detail: null },
      designId: VALID_ID,
      subjectAccountId: null,
    } as StaffAuditRecord;
    Object.defineProperty(record, field, {
      enumerable: true,
      get: () => {
        reads += 1;
        return reads === 1 ? valid : hostile;
      },
    });
    return record;
  }

  it.each(["designId", "subjectAccountId", "sessionTokenHash"] as const)(
    "prepares the %s it checked and not a second reading of the caller's object",
    (field) => {
      const prepared = prepareStaffAuditRecord(
        recordWhoseFieldChangesAfterTheFirstRead(field),
      );

      expect(prepared[field]).not.toContain("delete from");
    },
  );

  it("holds the idle lifetimes it checked, so a value the check refuses cannot reach the statement by the caller changing them later", () => {
    const lifetimes = { ...IDLE_LIFETIMES };
    const prepared = prepareStaffAuditRecord({
      sessionTokenHash: "0".repeat(64),
      idleLifetimeSeconds: lifetimes,
      entry: { action: "kitchen-opened", detail: null },
      designId: VALID_ID,
      subjectAccountId: null,
    });

    lifetimes.operator = -1;

    expect(prepared.idleLifetimeSeconds.operator).toBe(IDLE_LIFETIMES.operator);
  });
});
