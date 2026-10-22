import { randomBytes } from "node:crypto";
import { inspect } from "node:util";

import { CURRENT_SCHEMA_VERSION } from "@lemnaria/configurator-domain";
import { neon } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { NeonStaffKitchenActionsStore } from "../src/neon-staff-kitchen-actions-store.js";
import { StaffKitchenActionError } from "../src/staff-kitchen-actions-store.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { rejectionOf } from "./support/rejection-of.js";
import { holdExclusiveTestSchemaLock } from "./support/test-schema-lock.js";

// Exclusive: this file adds a temporary constraint or trigger to a shared table, then drops it, and no other run may
// write that table meanwhile.
holdExclusiveTestSchemaLock();

/**
 * Adversarial QA of the staff kitchen actions store (wave L3-S5), part two: **atomicity on a real transaction**, and
 * what a real driver error leaves in the store's error.
 *
 * Each case plants, for the length of one test and scoped to the kitchen it made, a `NOT VALID` check constraint (the
 * write's own statement then fails after the audit statement of the same batch succeeded) or a deferred constraint
 * trigger on `staff_audit_events` (the audit row then fails at COMMIT, after every statement succeeded). It proves that
 * the change is absent in each case, that the audit row is absent, and that the error holds the SQLSTATE and the
 * constraint name and nothing the driver wrote (a `23514` DETAIL quotes the failing row, note text included).
 *
 * Everything planted is named `qa_l3_s5_*`, dropped in a `finally` and again in `afterAll`, and the file's last
 * assertion reads the catalog for any left over. The test database alone (ADR 0006); the application role is not used.
 */
const SUITE_NAME = "staff kitchen actions store, atomicity and errors (live)";
if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

const PASSWORD_HASH = `$argon2id$v=19$m=19456,t=2,p=1$${"A".repeat(22)}$${"B".repeat(43)}`;
const IDLE_LIFETIMES = {
  client: 2_592_000,
  operator: 43_200,
  administrator: 43_200,
};
const SENT_AT = "2026-10-02T09:00:00.000Z";
const NOTE_SECRET = "QA-L3-S5-NOTE-SECRET-d41d8cd9";
const TIMEOUT_MS = 120_000;
const OBJECT_PREFIX = "qa_l3_s5_";
const OUTPUT_METHODS = ["log", "warn", "error", "info", "debug"] as const;

interface Staff {
  readonly accountId: string;
  readonly sessionTokenHash: string;
  readonly session: {
    readonly sessionTokenHash: string;
    readonly idleLifetimeSeconds: typeof IDLE_LIFETIMES;
  };
}

const accountIds: string[] = [];
const designIds: string[] = [];
const sql = () => neon(liveTestDatabaseUrl);
const store = () => new NeonStaffKitchenActionsStore(liveTestDatabaseUrl);

async function signIn(): Promise<Staff> {
  const accountId = nanoid();
  const email = `qa-l3-s5-${accountId.toLowerCase()}@example.invalid`;
  const sessionTokenHash = randomBytes(32).toString("hex");
  accountIds.push(accountId);
  await sql()`
    insert into accounts (id, email, email_normal_form, password_hash, role, locale, privacy_notice_version)
    values (${accountId}, ${email}, ${email}, ${PASSWORD_HASH}, 'operator', 'ro', '1')
  `;
  await sql()`
    insert into account_sessions (token_hash, account_id, absolute_expires_at)
    values (${sessionTokenHash}, ${accountId}, now() + interval '30 days')
  `;
  return {
    accountId,
    sessionTokenHash,
    session: { sessionTokenHash, idleLifetimeSeconds: IDLE_LIFETIMES },
  };
}

async function hiddenSentKitchen(): Promise<string> {
  const designId = nanoid();
  designIds.push(designId);
  await sql()`
    insert into designs (id, schema_version, document, sent_at, hidden_by_client_at)
    values (${designId}, ${CURRENT_SCHEMA_VERSION}, '{}'::jsonb, ${SENT_AT}::timestamptz, now())
  `;
  return designId;
}

async function snapshotOf(designId: string): Promise<unknown> {
  const rows = await sql()`
    select
      (select to_jsonb(d) from designs d where d.id = ${designId}) as design,
      (select to_jsonb(s) from design_request_states s where s.design_id = ${designId}) as state,
      (select count(*)::int from design_notes n where n.design_id = ${designId}) as notes,
      (select count(*)::int from staff_audit_events e where e.design_id = ${designId}) as audits
  `;
  return rows[0];
}

/** DDL goes through `query`, a statement of fixed text that names only identifiers this file wrote. */
async function run(statement: string): Promise<void> {
  await sql().query(statement);
}

function requireIdShape(id: string): string {
  if (!/^[A-Za-z0-9_-]{21}$/.test(id)) throw new Error("not an id");
  return id;
}

async function dropEverythingPlanted(): Promise<void> {
  await run(
    `drop trigger if exists ${OBJECT_PREFIX}audit_deferred on staff_audit_events`,
  );
  await run(`drop function if exists ${OBJECT_PREFIX}fail_audit()`);
  await run(
    `alter table design_notes drop constraint if exists ${OBJECT_PREFIX}note_marker`,
  );
  await run(
    `alter table design_request_states drop constraint if exists ${OBJECT_PREFIX}status_design`,
  );
  await run(
    `alter table designs drop constraint if exists ${OBJECT_PREFIX}unhide_design`,
  );
}

async function plantedObjects(): Promise<readonly string[]> {
  const rows = await sql()`
    select name from (
      select conname as name from pg_constraint where conname like 'qa\_l3\_s5\_%'
      union all select tgname from pg_trigger where tgname like 'qa\_l3\_s5\_%'
      union all select proname from pg_proc where proname like 'qa\_l3\_s5\_%'
    ) planted order by name
  `;
  return rows.map((row) => row["name"] as string);
}

/** Runs `body` with the objects `create` makes in place, and drops everything planted whether `body` passes or not. */
async function withPlanted(
  create: readonly string[],
  body: () => Promise<void>,
): Promise<void> {
  try {
    for (const statement of create) await run(statement);
    await body();
  } finally {
    await dropEverythingPlanted();
  }
}

function noteMarkerConstraint(): string {
  return `alter table design_notes add constraint ${OBJECT_PREFIX}note_marker check (body <> '${NOTE_SECRET}') not valid`;
}

function statusConstraint(designId: string): string {
  return `alter table design_request_states add constraint ${OBJECT_PREFIX}status_design check (design_id <> '${requireIdShape(designId)}') not valid`;
}

function unhideConstraint(designId: string): string {
  return `alter table designs add constraint ${OBJECT_PREFIX}unhide_design check (id <> '${requireIdShape(designId)}' or hidden_by_client_at is not null) not valid`;
}

function deferredAuditFailure(designId: string): readonly string[] {
  return [
    `create function ${OBJECT_PREFIX}fail_audit() returns trigger language plpgsql as $$
       begin
         if new.design_id = TG_ARGV[0] then
           raise exception 'qa-l3-s5 deferred audit failure' using errcode = 'P0001';
         end if;
         return null;
       end $$`,
    `create constraint trigger ${OBJECT_PREFIX}audit_deferred after insert on staff_audit_events
       deferrable initially deferred for each row
       execute function ${OBJECT_PREFIX}fail_audit('${requireIdShape(designId)}')`,
  ];
}

// ---------------------------------------------------------------------------------------------------------------------
// What the error and the process may not hold
// ---------------------------------------------------------------------------------------------------------------------

interface Observed {
  readonly writes: string[];
}

let observed: Observed;
const spies: { mockRestore: () => void }[] = [];

beforeEach(() => {
  observed = { writes: [] };
  const record = (...args: unknown[]) => {
    observed.writes.push(args.map((argument) => inspect(argument)).join(" "));
  };
  for (const method of OUTPUT_METHODS) {
    spies.push(vi.spyOn(console, method).mockImplementation(record));
  }
  for (const stream of [process.stdout, process.stderr]) {
    const original = stream.write.bind(stream);
    spies.push(
      vi.spyOn(stream, "write").mockImplementation(((chunk: unknown) => {
        record(chunk);
        return original(chunk as string);
      }) as typeof stream.write),
    );
  }
});

afterEach(() => {
  for (const spy of spies.splice(0)) spy.mockRestore();
});

function everyFormOf(error: unknown): string {
  const forms: string[] = [];
  const seen = new Set<unknown>();
  let link: unknown = error;
  while (link instanceof Error && !seen.has(link)) {
    seen.add(link);
    forms.push(
      link.message,
      String(link.stack),
      JSON.stringify(link, Object.getOwnPropertyNames(link)),
      inspect(link, { depth: 10, showHidden: true }),
    );
    link = link.cause;
  }
  if (link !== undefined && !(link instanceof Error)) {
    forms.push(
      JSON.stringify(link, Object.getOwnPropertyNames(link as object)),
      inspect(link, { depth: 10, showHidden: true }),
    );
  }
  return forms.join("\n");
}

function expectNothingOfTheRowIn(
  error: unknown,
  forbidden: readonly string[],
): void {
  const forms = everyFormOf(error);
  for (const value of forbidden) expect(forms).not.toContain(value);
  expect(forms).not.toMatch(/Failing row|violates check constraint|DETAIL/i);
  for (const output of observed.writes) {
    for (const value of forbidden) expect(output).not.toContain(value);
  }
}

afterAll(async () => {
  if (!isLiveTestDatabaseConfigured) return;
  await dropEverythingPlanted();
  await sql()`delete from staff_audit_events where actor_account_id = any(${accountIds}) or design_id = any(${designIds})`;
  await sql()`delete from design_notes where design_id = any(${designIds})`;
  await sql()`delete from design_request_states where design_id = any(${designIds})`;
  await sql()`delete from designs where id = any(${designIds})`;
  await sql()`delete from account_sessions where account_id = any(${accountIds})`;
  await sql()`delete from accounts where id = any(${accountIds})`;
});

// ---------------------------------------------------------------------------------------------------------------------
// The write fails after the audit statement succeeded
// ---------------------------------------------------------------------------------------------------------------------

describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  describe("a write that fails after its audit row was inserted leaves neither", () => {
    it(
      "a note: the check on the body fires on the second statement; no note, no audit row, and the error holds neither the text nor an id",
      async () => {
        const staff = await signIn();
        const designId = await hiddenSentKitchen();
        const before = await snapshotOf(designId);

        await withPlanted([noteMarkerConstraint()], async () => {
          const failure = (await rejectionOf(
            store().addNote({
              session: staff.session,
              designId,
              text: NOTE_SECRET,
            }),
          )) as StaffKitchenActionError;

          expect(failure).toBeInstanceOf(StaffKitchenActionError);
          expect(failure.failure).toBe("database");
          expect(failure.cause).toEqual({
            name: "NeonDbError",
            code: "23514",
            constraint: `${OBJECT_PREFIX}note_marker`,
          });
          expectNothingOfTheRowIn(failure, [
            NOTE_SECRET,
            designId,
            staff.accountId,
            staff.sessionTokenHash,
          ]);
        });

        expect(await snapshotOf(designId)).toEqual(before);
      },
      TIMEOUT_MS,
    );

    it.each([
      ["no status saved yet", null],
      ["a status saved", "contacted"],
    ] as const)(
      "a status over %s: the check on the status row fires on the second statement; the row is as it was and no audit row stays",
      async (_name, stored) => {
        const staff = await signIn();
        const designId = await hiddenSentKitchen();
        if (stored !== null) {
          await sql()`
            insert into design_request_states (design_id, status, changed_by_account_id, changed_at)
            values (${designId}, ${stored}, ${staff.accountId}, '2026-10-03T09:00:00.000Z')
          `;
        }
        const before = await snapshotOf(designId);

        await withPlanted([statusConstraint(designId)], async () => {
          const failure = (await rejectionOf(
            store().setStatus({
              session: staff.session,
              designId,
              status: "closed",
              seenStatus: stored ?? "new",
            }),
          )) as StaffKitchenActionError;

          expect(failure.failure).toBe("database");
          expect(failure.cause).toEqual({
            name: "NeonDbError",
            code: "23514",
            constraint: `${OBJECT_PREFIX}status_design`,
          });
          expectNothingOfTheRowIn(failure, [
            designId,
            staff.accountId,
            staff.sessionTokenHash,
          ]);
        });

        expect(await snapshotOf(designId)).toEqual(before);
      },
      TIMEOUT_MS,
    );

    it(
      "an unhide: the check on the kitchen fires on the second statement; the kitchen stays hidden, untouched, with no audit row",
      async () => {
        const staff = await signIn();
        const designId = await hiddenSentKitchen();
        const before = await snapshotOf(designId);

        await withPlanted([unhideConstraint(designId)], async () => {
          const failure = (await rejectionOf(
            store().unhide({ session: staff.session, designId }),
          )) as StaffKitchenActionError;

          expect(failure.failure).toBe("database");
          expect(failure.cause).toEqual({
            name: "NeonDbError",
            code: "23514",
            constraint: `${OBJECT_PREFIX}unhide_design`,
          });
          expectNothingOfTheRowIn(failure, [
            designId,
            staff.accountId,
            staff.sessionTokenHash,
          ]);
        });

        expect(await snapshotOf(designId)).toEqual(before);
      },
      TIMEOUT_MS,
    );
  });

  describe("an audit row that fails at COMMIT, after every statement of the batch succeeded, takes the change with it", () => {
    it(
      "a note, a status and an unhide are each absent; a kitchen the failure is not scoped to still succeeds",
      async () => {
        const staff = await signIn();
        const scoped = await hiddenSentKitchen();
        const control = await hiddenSentKitchen();
        await sql()`
        insert into design_request_states (design_id, status, changed_by_account_id)
        values (${scoped}, 'contacted', ${staff.accountId})
      `;
        const before = await snapshotOf(scoped);

        await withPlanted(deferredAuditFailure(scoped), async () => {
          const failures = await Promise.all([
            rejectionOf(
              store().addNote({
                session: staff.session,
                designId: scoped,
                text: NOTE_SECRET,
              }),
            ),
            rejectionOf(
              store().setStatus({
                session: staff.session,
                designId: scoped,
                status: "closed",
                seenStatus: "contacted",
              }),
            ),
            rejectionOf(
              store().unhide({ session: staff.session, designId: scoped }),
            ),
          ]);

          for (const failure of failures) {
            expect(failure).toBeInstanceOf(StaffKitchenActionError);
            expect((failure as StaffKitchenActionError).failure).toBe(
              "database",
            );
            expect((failure as StaffKitchenActionError).cause).toEqual({
              name: "NeonDbError",
              code: "P0001",
            });
            expectNothingOfTheRowIn(failure, [
              NOTE_SECRET,
              scoped,
              staff.accountId,
              staff.sessionTokenHash,
            ]);
          }
          expect(await snapshotOf(scoped)).toEqual(before);

          const onControl = await store().unhide({
            session: staff.session,
            designId: control,
          });
          expect(onControl).toEqual({ kind: "unhidden" });
        });
      },
      TIMEOUT_MS,
    );
  });

  describe("how a failure on the real driver leaves the process", () => {
    it(
      "writes nothing to the console or the standard streams that names a note, an id or a hash, on a refusal as on a failure",
      async () => {
        const staff = await signIn();
        const designId = await hiddenSentKitchen();

        await store().addNote({
          session: staff.session,
          designId,
          text: NOTE_SECRET,
        });
        await store().setStatus({
          session: staff.session,
          designId,
          status: "contacted",
          seenStatus: "new",
        });
        await store().unhide({ session: staff.session, designId });
        await store().unhide({ session: staff.session, designId });
        await rejectionOf(
          store().addNote({
            session: { ...staff.session, sessionTokenHash: "f".repeat(64) },
            designId,
            text: NOTE_SECRET,
          }),
        );

        for (const output of observed.writes) {
          for (const value of [
            NOTE_SECRET,
            designId,
            staff.accountId,
            staff.sessionTokenHash,
          ]) {
            expect(output).not.toContain(value);
          }
        }
      },
      TIMEOUT_MS,
    );
  });

  describe("what this file planted", () => {
    it("is gone: no constraint, trigger or function named qa_l3_s5_* is left on the test database", async () => {
      expect(await plantedObjects()).toEqual([]);
    });
  });
});
