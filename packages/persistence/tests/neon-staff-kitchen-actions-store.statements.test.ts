import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NeonSessionStore } from "../src/neon-session-store.js";
import { NeonStaffKitchenActionsStore } from "../src/neon-staff-kitchen-actions-store.js";
import { NeonStaffKitchenReader } from "../src/neon-staff-kitchen-reader.js";
import {
  StaffKitchenActionError,
  type StaffKitchenActionFailure,
} from "../src/staff-kitchen-actions-store.js";
import {
  WELL_FORMED_UNREACHABLE_VALUE,
  markersFoundOn,
} from "./support/leaked-connection-markers.js";
import {
  answerQueryWith,
  answerTransactionWith,
  failQueryWith,
  queryDriver,
  resetQueryDriver,
  type SentQuery,
} from "./support/mocked-neon-query-driver.js";
import { rejectionOf } from "./support/rejection-of.js";

const mintedIds = vi.hoisted(() => ({ count: 0 }));

/** Ids in order: a call's audit event is the first one it mints and a note the second. */
vi.mock("nanoid", () => ({
  nanoid: () => String(++mintedIds.count).padStart(21, "0"),
}));

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-query-driver.js")).withMockedQueryDriver(
    await importOriginal<object>(),
  ),
);

/**
 * The text of the statements `NeonStaffKitchenActionsStore` sends, read as the driver receives them, with no database,
 * and what the store does with each reply. What a statement does with a row is the live file's to show
 * (`neon-staff-kitchen-actions-store.live.test.ts`); this file pins the clauses the security reviews made conditions:
 * the actor comes from the session in the write's own statement, the audit row is in the same transaction and its
 * statement is the audit store's, nothing is retried but a plain read, `changed_at` is the literal `now()`, the reader's
 * visibility test is repeated word for word, and only a SQLSTATE and a constraint name leave the store.
 */
const SESSION_HASH = "a".repeat(64);
const DESIGN_ID = "D".repeat(21);
const ACTOR_ID = "A".repeat(21);
const SECRET_NOTE = "NOTE-TEXT-SECRET-91c3";
const LIFETIMES = {
  client: 2_592_000,
  operator: 43_200,
  administrator: 43_200,
};
const SESSION = {
  sessionTokenHash: SESSION_HASH,
  idleLifetimeSeconds: LIFETIMES,
};
const VISIBLE_TO_STAFF =
  "d.deleted_by_client_at is null and (d.sent_at is not null or d.account_id is not null)";
const NOTE_ID = "000000000000000000002";
const AUDIT_ONE_ROW = [{ recorded: 1 }];
const EMPTY_PRESENT_STATUS_ROW = {
  is_session_live: true,
  is_sent: true,
  stored_status: null,
  changed_by_account_id: null,
  changed_ms: null,
  changed_by_email: null,
  changed_by_name: null,
};

function normalised(statement: SentQuery): string {
  return statement.text.replace(/\s+/g, " ").trim().toLowerCase();
}

function newStore(): NeonStaffKitchenActionsStore {
  return new NeonStaffKitchenActionsStore(WELL_FORMED_UNREACHABLE_VALUE);
}

/** The part of a statement from its session join to the end of the liveness test. */
function livenessPredicateOf(statement: SentQuery): string {
  const text = normalised(statement);
  const start = text.indexOf("from account_sessions s");
  const terminator = "interval '1 second') > now()";
  return text.slice(start, text.indexOf(terminator, start) + terminator.length);
}

function noteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: NOTE_ID,
    body: "hello",
    author_account_id: ACTOR_ID,
    created_ms: "1790000000000",
    author_email: "staff@example.invalid",
    author_name: null,
    ...overrides,
  };
}

function savedStatusRow(status = "contacted") {
  return {
    status,
    changed_by_account_id: ACTOR_ID,
    changed_ms: "1790000000000",
    changed_by_email: "staff@example.invalid",
    changed_by_name: null,
  };
}

/** Plays the reply of a batch the way the driver gives it: one result per statement, the audit statement's first. */
function answerBatchWith(
  writeRows: unknown,
  auditRows: unknown = AUDIT_ONE_ROW,
) {
  answerTransactionWith([auditRows, writeRows]);
}

function addAHelloNote() {
  return newStore().addNote({
    session: SESSION,
    designId: DESIGN_ID,
    text: "hello",
  });
}

function loneStatement(): SentQuery {
  const [statement, ...others] = queryDriver.statements;
  if (statement === undefined || others.length > 0) {
    throw new Error("the call did not send exactly one lone statement");
  }
  return statement;
}

function onlyBatch() {
  const [batch, ...others] = queryDriver.transactions;
  if (batch === undefined || others.length > 0) {
    throw new Error("the call did not send exactly one batch");
  }
  const [audit, write, ...rest] = batch.statements;
  if (audit === undefined || write === undefined || rest.length > 0) {
    throw new Error("the batch is not an audit statement and one write");
  }
  return { audit, write, options: batch.options };
}

async function failureOf(
  call: () => Promise<unknown>,
): Promise<StaffKitchenActionError> {
  const failure = await rejectionOf(call());
  expect(failure).toBeInstanceOf(StaffKitchenActionError);
  return failure as StaffKitchenActionError;
}

function aDriverError(code: string, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(`driver text ${SECRET_NOTE}`), {
    name: "NeonDbError",
    code,
    ...extra,
  });
}

beforeEach(() => {
  mintedIds.count = 0;
  resetQueryDriver();
});
afterEach(resetQueryDriver);

describe("a note", () => {
  async function addAndCapture(text = "hello") {
    resetQueryDriver();
    answerTransactionWith([
      AUDIT_ONE_ROW,
      [noteRow({ id: NOTE_ID, body: text })],
    ]);
    const result = await newStore().addNote({
      session: SESSION,
      designId: DESIGN_ID,
      text,
    });
    return { result, ...onlyBatch() };
  }

  it("is one transaction of the audit insert and then the note's own statement, in READ COMMITTED", async () => {
    const { audit, write, options } = await addAndCapture();

    expect(normalised(audit)).toContain("insert into staff_audit_events");
    expect(normalised(write)).toContain("insert into design_notes");
    expect(options).toEqual({ isolationLevel: "ReadCommitted" });
    expect(queryDriver.statements).toHaveLength(0);
  });

  it("takes the author from the live session in its own statement, and from no value it was handed", async () => {
    resetQueryDriver();
    answerTransactionWith([AUDIT_ONE_ROW, [noteRow({ id: NOTE_ID })]]);

    await newStore().addNote({
      session: SESSION,
      designId: DESIGN_ID,
      text: "hello",
      authorAccountId: ACTOR_ID,
      actorAccountId: ACTOR_ID,
    } as never);
    const { write } = onlyBatch();

    expect(normalised(write)).toContain(
      "select ?::text, k.id, a.account_id, ?::text from kitchen k cross join actor a",
    );
    expect(write.values).not.toContain(ACTOR_ID);
    expect(write.values).toEqual([
      SESSION_HASH,
      JSON.stringify(LIFETIMES),
      DESIGN_ID,
      expect.stringMatching(/^[A-Za-z0-9_-]{21}$/),
      "hello",
    ]);
  });

  it("names exactly the four columns the grant of 0021 gives the application role, never created_at", async () => {
    const { write } = await addAndCapture();

    expect(normalised(write)).toContain(
      "insert into design_notes (id, design_id, author_account_id, body)",
    );
    expect(normalised(write)).not.toContain(
      "insert into design_notes (id, design_id, author_account_id, body, created_at",
    );
  });

  it("asks of the session what NeonSessionStore.findLive asks, word for word, in the note, the status and the audit statements", async () => {
    resetQueryDriver();
    answerQueryWith([]);
    await new NeonSessionStore(WELL_FORMED_UNREACHABLE_VALUE).findLive({
      tokenHash: SESSION_HASH,
      idleLifetimeSeconds: LIFETIMES,
    });
    const liveness = livenessPredicateOf(loneStatement());
    const note = await addAndCapture();
    resetQueryDriver();
    const status = await saveStatusAndCapture("closed", "contacted");

    expect(liveness).toContain("s.revoked_at is null");
    expect(livenessPredicateOf(note.audit)).toBe(liveness);
    expect(livenessPredicateOf(note.write)).toBe(liveness);
    expect(livenessPredicateOf(status.write)).toBe(liveness);
    expect(livenessPredicateOf(status.read)).toBe(liveness);
  });

  it("divides by the session count it finds, and overflows on a kitchen staff cannot see, so the audit row never commits alone", async () => {
    const { write } = await addAndCapture();

    const text = normalised(write);
    expect(text).toContain(
      "1 / (case when (select reason from refusal) = 'session' then 0 else 1 end) as session_live",
    );
    expect(text).toContain(
      "2147483647 + (case when (select reason from refusal) = 'kitchen' then 1 else 0 end) as kitchen_visible",
    );
  });

  it("answers the kitchen refusal when the write raises the kitchen's SQLSTATE", async () => {
    resetQueryDriver();
    failQueryWith(aDriverError("22003"));

    const result = await newStore().addNote({
      session: SESSION,
      designId: DESIGN_ID,
      text: "hello",
    });

    expect(result).toEqual({ kind: "kitchen-not-found" });
  });

  it("returns the note the database stored, with the author's e-mail and the stamp it gave", async () => {
    const { result } = await addAndCapture("hello");

    expect(result).toMatchObject({
      kind: "added",
      note: {
        text: "hello",
        createdAt: new Date(1_790_000_000_000),
        author: { id: ACTOR_ID, email: "staff@example.invalid", name: null },
      },
    });
  });

  it.each([
    ["an empty reply", []],
    ["two rows", [noteRow(), noteRow()]],
    ["a row for another note", [noteRow({ id: "other" })]],
    ["a row without the author", [noteRow({ author_account_id: null })]],
    ["a stamp that is not milliseconds", [noteRow({ created_ms: "soon" })]],
  ])("refuses %s as an unexpected answer", async (_name, writeRows) => {
    resetQueryDriver();
    answerTransactionWith([AUDIT_ONE_ROW, writeRows]);

    const failure = await failureOf(addAHelloNote);

    expect(failure.failure).toBe("unexpected-answer");
  });
});

describe("the audit statement's own element of the batch reply", () => {
  it.each([
    ["no row", []],
    ["a row that did not record", [{ recorded: 0 }]],
    ["a row of another shape", [{ recorded: "1" }]],
  ])(
    "is read for exactly one inserted row, and %s is refused",
    async (_name, auditRows) => {
      resetQueryDriver();
      answerTransactionWith([auditRows, [noteRow({ id: NOTE_ID })]]);

      const failure = await failureOf(addAHelloNote);

      expect(failure.failure).toBe("unexpected-answer");
    },
  );

  it("is not satisfied by the write's rows when the audit element is empty", async () => {
    resetQueryDriver();
    answerTransactionWith([[], [{ ...noteRow({ id: NOTE_ID }), recorded: 1 }]]);

    const failure = await failureOf(addAHelloNote);

    expect(failure.failure).toBe("unexpected-answer");
  });

  it("refuses a reply that is not one result for each of the two statements", async () => {
    resetQueryDriver();
    answerTransactionWith([AUDIT_ONE_ROW]);

    const failure = await failureOf(addAHelloNote);

    expect(failure.failure).toBe("unexpected-answer");
  });
});

describe("a status", () => {
  it("is read first by a plain statement, then written with the status read as the condition, in one batch", async () => {
    const { read, audit, write } = await saveStatusAndCapture(
      "closed",
      "contacted",
    );

    expect(read.values).toContain(DESIGN_ID);
    expect(normalised(write)).toContain(
      "where design_request_states.status = ?::text",
    );
    expect(write.values).toContain("contacted");
    expect(audit.values).toContain('{"from":"contacted","to":"closed"}');
  });

  it("audits a first save as from new and conditions the write on no row", async () => {
    const { write, audit } = await saveStatusAndCapture("closed", null);

    expect(audit.values).toContain('{"from":"new","to":"closed"}');
    expect(write.values).toEqual([
      SESSION_HASH,
      JSON.stringify(LIFETIMES),
      DESIGN_ID,
      "closed",
      null,
    ]);
  });

  it("writes changed_at as the literal now() and binds no instant", async () => {
    const { write } = await saveStatusAndCapture("closed", "contacted");

    expect(normalised(write)).toContain("changed_at = now()");
    expect(normalised(write)).not.toMatch(/changed_at = \?/);
    expect(write.values.some((value) => value instanceof Date)).toBe(false);
    expect(
      write.values.filter((value) => /\d{4}-\d{2}-\d{2}/.test(String(value))),
    ).toEqual([]);
  });

  it("names exactly the three columns the grant of 0022 lets it insert and the three it lets it update", async () => {
    const { write } = await saveStatusAndCapture("closed", "contacted");

    const text = normalised(write);
    expect(text).toContain(
      "insert into design_request_states (design_id, status, changed_by_account_id)",
    );
    expect(text).toContain(
      "set status = excluded.status, changed_by_account_id = excluded.changed_by_account_id, changed_at = now()",
    );
    expect(write.values).not.toContain(ACTOR_ID);
  });

  it("writes only on a sent kitchen and raises a SQLSTATE of its own for each reason it changed nothing", async () => {
    const { write } = await saveStatusAndCapture("closed", "contacted");

    const text = normalised(write);
    expect(text).toContain("where k.is_sent on conflict");
    expect(text).toContain(
      "ln(case when (select reason from refusal) = 'state' then 0 else 1 end) as kitchen_sent",
    );
    expect(text).toContain(
      "power(case when (select reason from refusal) = 'moved' then 0 else 1 end, -1) as status_unmoved",
    );
  });

  it("sends no batch and no audit row for the status the kitchen already shows", async () => {
    resetQueryDriver();
    answerQueryWith([
      {
        ...EMPTY_PRESENT_STATUS_ROW,
        stored_status: "closed",
        ...savedStatusRow("closed"),
      },
    ]);

    const result = await newStore().setStatus({
      session: SESSION,
      designId: DESIGN_ID,
      status: "closed",
    });

    expect(result).toMatchObject({
      kind: "unchanged",
      current: { value: "closed" },
    });
    expect(queryDriver.transactions).toHaveLength(0);
  });

  it("reads the stamp of a saved status clamped to what a Date holds, and tested for null first", async () => {
    const { read } = await saveStatusAndCapture("closed", "contacted");

    expect(normalised(read)).toContain(
      "case when s.changed_at is null then null else floor(least( greatest(extract(epoch from s.changed_at) * 1000, -8640000000000000), 8640000000000000 ))::bigint::text end as changed_ms",
    );
  });

  it.each([
    ["before 1970", "-2208988800000", new Date(-2_208_988_800_000)],
    [
      "at the earliest instant a Date holds",
      "-8640000000000000",
      new Date(-8.64e15),
    ],
    [
      "at the latest instant a Date holds",
      "8640000000000000",
      new Date(8.64e15),
    ],
  ])("reads a status changed %s", async (_name, changedMs, expected) => {
    resetQueryDriver();
    answerQueryWith([
      {
        ...EMPTY_PRESENT_STATUS_ROW,
        ...savedStatusRow("closed"),
        stored_status: "closed",
        changed_ms: changedMs,
      },
    ]);

    const result = await newStore().setStatus({
      session: SESSION,
      designId: DESIGN_ID,
      status: "closed",
    });

    expect(result).toMatchObject({
      kind: "unchanged",
      current: { at: expected },
    });
  });

  it("sends no batch for new on a kitchen with no saved status", async () => {
    resetQueryDriver();
    answerQueryWith([EMPTY_PRESENT_STATUS_ROW]);

    const result = await newStore().setStatus({
      session: SESSION,
      designId: DESIGN_ID,
      status: "new",
    });

    expect(result).toEqual({ kind: "unchanged", current: null });
    expect(queryDriver.transactions).toHaveLength(0);
  });

  it.each(["new", "closed"] as const)(
    "does not coerce a stored status outside the list to new: a save of %s sends no batch",
    async (requested) => {
      resetQueryDriver();
      answerQueryWith([
        { ...EMPTY_PRESENT_STATUS_ROW, stored_status: "from-a-later-build" },
      ]);

      const result = await newStore().setStatus({
        session: SESSION,
        designId: DESIGN_ID,
        status: requested,
      });

      expect(result).toEqual({ kind: "status-not-recognised" });
      expect(queryDriver.transactions).toHaveLength(0);
    },
  );

  it("answers not-sent and the kitchen refusal from the read, with no batch", async () => {
    resetQueryDriver();
    answerQueryWith([{ ...EMPTY_PRESENT_STATUS_ROW, is_sent: false }]);
    answerQueryWith([{ ...EMPTY_PRESENT_STATUS_ROW, is_sent: null }]);

    const notSent = await newStore().setStatus({
      session: SESSION,
      designId: DESIGN_ID,
      status: "closed",
    });
    const unseen = await newStore().setStatus({
      session: SESSION,
      designId: DESIGN_ID,
      status: "closed",
    });

    expect([notSent, unseen]).toEqual([
      { kind: "not-sent" },
      { kind: "kitchen-not-found" },
    ]);
    expect(queryDriver.transactions).toHaveLength(0);
  });

  it("answers not-recorded, learning nothing of the kitchen, when the read finds no live session", async () => {
    resetQueryDriver();
    answerQueryWith([
      { ...EMPTY_PRESENT_STATUS_ROW, is_session_live: false, is_sent: false },
    ]);

    const failure = await failureOf(() =>
      newStore().setStatus({
        session: SESSION,
        designId: DESIGN_ID,
        status: "closed",
      }),
    );

    expect(failure.failure).toBe("not-recorded");
    expect(queryDriver.transactions).toHaveLength(0);
  });

  it("retries its plain read after a lost acknowledgement, because the read writes nothing", async () => {
    resetQueryDriver();
    failQueryWith(new SyntaxError("Unexpected end of JSON input"));
    answerQueryWith([EMPTY_PRESENT_STATUS_ROW]);

    const result = await newStore().setStatus({
      session: SESSION,
      designId: DESIGN_ID,
      status: "new",
    });

    expect(result.kind).toBe("unchanged");
    expect(queryDriver.statements).toHaveLength(2);
  });

  it.each([
    ["2201F", { kind: "changed-meanwhile" }],
    ["2201E", { kind: "not-sent" }],
    ["22003", { kind: "kitchen-not-found" }],
  ])(
    "reads the write's SQLSTATE %s as the answer %j",
    async (code, expected) => {
      resetQueryDriver();
      answerQueryWith([EMPTY_PRESENT_STATUS_ROW]);
      queryDriver.replies.push(() => Promise.reject(aDriverError(code)));

      const result = await newStore().setStatus({
        session: SESSION,
        designId: DESIGN_ID,
        status: "closed",
      });

      expect(result).toEqual(expected);
    },
  );

  it("refuses a saved row that does not hold the status it was asked to save", async () => {
    resetQueryDriver();
    answerQueryWith([EMPTY_PRESENT_STATUS_ROW]);
    answerBatchWith([savedStatusRow("contacted")]);

    const failure = await failureOf(() =>
      newStore().setStatus({
        session: SESSION,
        designId: DESIGN_ID,
        status: "closed",
      }),
    );

    expect(failure.failure).toBe("unexpected-answer");
  });

  it("returns the saved row with who changed it and when", async () => {
    resetQueryDriver();
    answerQueryWith([EMPTY_PRESENT_STATUS_ROW]);
    answerBatchWith([savedStatusRow("closed")]);

    const result = await newStore().setStatus({
      session: SESSION,
      designId: DESIGN_ID,
      status: "closed",
    });

    expect(result).toEqual({
      kind: "saved",
      saved: {
        value: "closed",
        by: { id: ACTOR_ID, email: "staff@example.invalid", name: null },
        at: new Date(1_790_000_000_000),
      },
    });
  });
});

async function saveStatusAndCapture(status: "closed", stored: string | null) {
  resetQueryDriver();
  answerQueryWith([
    stored === null
      ? EMPTY_PRESENT_STATUS_ROW
      : {
          ...EMPTY_PRESENT_STATUS_ROW,
          ...savedStatusRow(stored),
          stored_status: stored,
        },
  ]);
  answerBatchWith([savedStatusRow(status)]);
  await newStore().setStatus({ session: SESSION, designId: DESIGN_ID, status });
  const [read] = queryDriver.statements;
  if (read === undefined) throw new Error("the status was not read");
  return { read, ...onlyBatch() };
}

describe("an unhide", () => {
  async function unhideAndCapture() {
    resetQueryDriver();
    answerBatchWith([{ id: DESIGN_ID }]);
    const result = await newStore().unhide({
      session: SESSION,
      designId: DESIGN_ID,
    });
    return { result, ...onlyBatch() };
  }

  it("is the audit insert and then an update of hidden_by_client_at alone, in one transaction", async () => {
    const { result, audit, write } = await unhideAndCapture();

    const text = normalised(write);
    expect(result).toEqual({ kind: "unhidden" });
    expect(normalised(audit)).toContain("insert into staff_audit_events");
    expect(text).toContain(
      "update designs set hidden_by_client_at = null where id = ?",
    );
    expect(text).toContain(
      "and hidden_by_client_at is not null and deleted_by_client_at is null",
    );
    expect(text).not.toContain("updated_at");
    expect(queryDriver.statements).toHaveLength(0);
  });

  it("raises 22003 for a kitchen staff cannot see and 2201E for one that is visible but not hidden", async () => {
    const { write } = await unhideAndCapture();

    const text = normalised(write);
    expect(text).toContain(
      "when not exists (select 1 from kitchen) then 'kitchen'",
    );
    expect(text).toContain(
      "when not exists (select 1 from unhidden) then 'state'",
    );
    expect(text).toContain("2147483647 + (case when");
    expect(text).toContain("ln(case when");
  });

  it.each([
    ["2201E", { kind: "not-hidden" }],
    ["22003", { kind: "kitchen-not-found" }],
  ])(
    "reads the write's SQLSTATE %s as the answer %j",
    async (code, expected) => {
      resetQueryDriver();
      failQueryWith(aDriverError(code));

      const result = await newStore().unhide({
        session: SESSION,
        designId: DESIGN_ID,
      });

      expect(result).toEqual(expected);
    },
  );

  it("does not read the status write's SQLSTATE as an answer to an unhide", async () => {
    resetQueryDriver();
    failQueryWith(aDriverError("2201F"));

    const failure = await failureOf(() =>
      newStore().unhide({ session: SESSION, designId: DESIGN_ID }),
    );

    expect(failure.failure).toBe("database");
  });

  it("refuses an update that returned another kitchen", async () => {
    resetQueryDriver();
    answerBatchWith([{ id: "E".repeat(21) }]);

    const failure = await failureOf(() =>
      newStore().unhide({ session: SESSION, designId: DESIGN_ID }),
    );

    expect(failure.failure).toBe("unexpected-answer");
  });
});

describe("the reader's visibility test, repeated", () => {
  it("is the same text in the reader, the note, the status and the unhide statements", async () => {
    resetQueryDriver();
    answerQueryWith([]);
    await new NeonStaffKitchenReader(WELL_FORMED_UNREACHABLE_VALUE).readOne(
      DESIGN_ID,
    );
    const reader = normalised(loneStatement());
    const note = normalised((await noteBatch()).write);
    const status = normalised(
      (await saveStatusAndCapture("closed", "contacted")).write,
    );
    const facts = normalised(
      (await saveStatusAndCapture("closed", "contacted")).read,
    );
    const unhide = normalised((await unhideBatch()).write);

    expect(reader).toContain(VISIBLE_TO_STAFF);
    expect(note).toContain(VISIBLE_TO_STAFF);
    expect(status).toContain(VISIBLE_TO_STAFF);
    expect(facts).toContain(VISIBLE_TO_STAFF);
    expect(unhide).toContain(VISIBLE_TO_STAFF);
    expect(unhide).toContain(
      "and deleted_by_client_at is null and (sent_at is not null or account_id is not null) returning id",
    );
  });

  async function noteBatch() {
    resetQueryDriver();
    answerTransactionWith([AUDIT_ONE_ROW, [noteRow({ id: NOTE_ID })]]);
    await newStore().addNote({
      session: SESSION,
      designId: DESIGN_ID,
      text: "hello",
    });
    return onlyBatch();
  }

  async function unhideBatch() {
    resetQueryDriver();
    answerBatchWith([{ id: DESIGN_ID }]);
    await newStore().unhide({ session: SESSION, designId: DESIGN_ID });
    return onlyBatch();
  }
});

describe("nothing is sent for a request the code refuses", () => {
  it.each([
    [
      "a note that is not as the domain judged it",
      () =>
        newStore().addNote({
          session: SESSION,
          designId: DESIGN_ID,
          text: " padded ",
        }),
    ],
    [
      "a status outside the list",
      () =>
        newStore().setStatus({
          session: SESSION,
          designId: DESIGN_ID,
          status: "won" as "new",
        }),
    ],
    [
      "a session that is not well formed",
      () =>
        newStore().unhide({
          session: { ...SESSION, sessionTokenHash: "nope" },
          designId: DESIGN_ID,
        }),
    ],
    [
      "idle lifetimes that cannot be read",
      () =>
        newStore().addNote({
          session: { ...SESSION, idleLifetimeSeconds: null as never },
          designId: DESIGN_ID,
          text: "hello",
        }),
    ],
  ])("%s", async (_name, call) => {
    resetQueryDriver();

    const failure = await failureOf(call);

    expect(failure.failure).toBe("invalid-request");
    expect(queryDriver.statements).toHaveLength(0);
    expect(queryDriver.transactions).toHaveLength(0);
  });

  it.each([
    [
      "a note",
      () =>
        newStore().addNote({
          session: SESSION,
          designId: "short",
          text: "hello",
        }),
    ],
    [
      "a status",
      () =>
        newStore().setStatus({
          session: SESSION,
          designId: "short",
          status: "closed",
        }),
    ],
    [
      "an unhide",
      () => newStore().unhide({ session: SESSION, designId: "short" }),
    ],
  ])(
    "%s on an id that is not a kitchen's shape answers the kitchen refusal",
    async (_name, call) => {
      resetQueryDriver();

      const result = await call();

      expect(result).toEqual({ kind: "kitchen-not-found" });
      expect(queryDriver.statements).toHaveLength(0);
      expect(queryDriver.transactions).toHaveLength(0);
    },
  );
});

describe("the batch is never retried", () => {
  it.each([
    [
      "a note",
      () =>
        newStore().addNote({
          session: SESSION,
          designId: DESIGN_ID,
          text: "hello",
        }),
    ],
    [
      "an unhide",
      () => newStore().unhide({ session: SESSION, designId: DESIGN_ID }),
    ],
  ])(
    "%s: a lost acknowledgement fails closed after one batch",
    async (_name, call) => {
      resetQueryDriver();
      queryDriver.replies.push(() =>
        Promise.reject(new SyntaxError("Unexpected end of JSON input")),
      );

      const failure = await failureOf(call);

      expect(failure.failure).toBe("database");
      expect(queryDriver.transactions).toHaveLength(1);
    },
  );

  it("a status: a lost acknowledgement of the batch fails closed after one batch", async () => {
    resetQueryDriver();
    answerQueryWith([EMPTY_PRESENT_STATUS_ROW]);
    queryDriver.replies.push(() =>
      Promise.reject(new SyntaxError("Unexpected end of JSON input")),
    );

    const failure = await failureOf(() =>
      newStore().setStatus({
        session: SESSION,
        designId: DESIGN_ID,
        status: "closed",
      }),
    );

    expect(failure.failure).toBe("database");
    expect(queryDriver.transactions).toHaveLength(1);
  });
});

describe("how a failure leaves the store", () => {
  const SQLSTATE_TO_KIND: readonly (readonly [
    string,
    StaffKitchenActionFailure,
  ])[] = [
    ["42501", "unavailable"],
    ["42P01", "unavailable"],
    ["22012", "not-recorded"],
    ["23505", "database"],
    ["23514", "database"],
    ["08006", "database"],
  ];

  it.each(SQLSTATE_TO_KIND)(
    "reads SQLSTATE %s on a write as %s",
    async (code, kind) => {
      resetQueryDriver();
      failQueryWith(aDriverError(code));

      const failure = await failureOf(() =>
        newStore().unhide({ session: SESSION, designId: DESIGN_ID }),
      );

      expect(failure.failure).toBe(kind);
      expect(failure.cause).toMatchObject({ code });
    },
  );

  it.each(SQLSTATE_TO_KIND.filter(([, kind]) => kind !== "not-recorded"))(
    "reads SQLSTATE %s on the status read as %s",
    async (code, kind) => {
      resetQueryDriver();
      failQueryWith(aDriverError(code));

      const failure = await failureOf(() =>
        newStore().setStatus({
          session: SESSION,
          designId: DESIGN_ID,
          status: "closed",
        }),
      );

      expect(failure.failure).toBe(kind);
    },
  );

  it("carries the type name, the SQLSTATE and the constraint name of a 23514, and none of the row its DETAIL quotes", async () => {
    resetQueryDriver();
    failQueryWith(
      aDriverError("23514", {
        constraint: "design_notes_body_length",
        detail: `Failing row contains (x, y, z, ${SECRET_NOTE}, now).`,
        where: SECRET_NOTE,
        hint: SECRET_NOTE,
        query: `insert ... ${SECRET_NOTE}`,
      }),
    );

    const failure = await failureOf(() =>
      newStore().addNote({
        session: SESSION,
        designId: DESIGN_ID,
        text: SECRET_NOTE,
      }),
    );

    expect(markersFoundOn(failure, [SECRET_NOTE])).toEqual([]);
    expect(failure.cause).toEqual({
      name: "NeonDbError",
      code: "23514",
      constraint: "design_notes_body_length",
    });
    expect(failure.message).not.toContain(SECRET_NOTE);
  });

  it("leaves a constraint name off the cause when it is not shaped like an identifier", async () => {
    resetQueryDriver();
    failQueryWith(
      aDriverError("23514", { constraint: `Key (body)=(${SECRET_NOTE})` }),
    );

    const failure = await failureOf(() =>
      newStore().unhide({ session: SESSION, designId: DESIGN_ID }),
    );

    expect(failure.cause).not.toHaveProperty("constraint");
    expect(markersFoundOn(failure, [SECRET_NOTE])).toEqual([]);
  });
});

describe("the store logs nothing, whatever the call comes to", () => {
  const WRITE_METHODS = ["log", "warn", "error", "info", "debug"] as const;
  const THE_NOTE = {
    session: SESSION,
    designId: DESIGN_ID,
    text: SECRET_NOTE,
  } as const;
  const STATUS = {
    session: SESSION,
    designId: DESIGN_ID,
    status: "closed",
  } as const;
  const UNHIDE = { session: SESSION, designId: DESIGN_ID } as const;

  const CALLS: readonly (readonly [
    string,
    () => void,
    () => Promise<unknown>,
  ])[] = [
    [
      "a note that is added",
      () => {
        answerBatchWith([noteRow({ body: SECRET_NOTE })]);
      },
      () => newStore().addNote(THE_NOTE),
    ],
    [
      "a note on a kitchen staff cannot see",
      () => {
        failQueryWith(aDriverError("22003"));
      },
      () => newStore().addNote(THE_NOTE),
    ],
    [
      "a note a check refused",
      () => {
        failQueryWith(
          aDriverError("23514", {
            constraint: "design_notes_body_length",
            detail: `Failing row contains (${SECRET_NOTE}).`,
          }),
        );
      },
      () => newStore().addNote(THE_NOTE),
    ],
    [
      "a note the code refuses before any statement",
      () => undefined,
      () => newStore().addNote({ ...THE_NOTE, text: ` ${SECRET_NOTE} ` }),
    ],
    [
      "a status that is saved",
      () => {
        answerQueryWith([EMPTY_PRESENT_STATUS_ROW]);
        answerBatchWith([savedStatusRow("closed")]);
      },
      () => newStore().setStatus(STATUS),
    ],
    [
      "a status that moved meanwhile",
      () => {
        answerQueryWith([EMPTY_PRESENT_STATUS_ROW]);
        failQueryWith(aDriverError("2201F"));
      },
      () => newStore().setStatus(STATUS),
    ],
    [
      "a status the database failed on",
      () => {
        failQueryWith(aDriverError("08006"));
      },
      () => newStore().setStatus(STATUS),
    ],
    [
      "an unhide that is done",
      () => {
        answerBatchWith([{ id: DESIGN_ID }]);
      },
      () => newStore().unhide(UNHIDE),
    ],
    [
      "an unhide of a kitchen that is not hidden",
      () => {
        failQueryWith(aDriverError("2201E"));
      },
      () => newStore().unhide(UNHIDE),
    ],
    [
      "an unhide the database failed on",
      () => {
        failQueryWith(aDriverError("42501"));
      },
      () => newStore().unhide(UNHIDE),
    ],
  ];

  it.each(CALLS)(
    "writes nothing to the console or the streams for %s",
    async (_name, queueReplies, call) => {
      const written: unknown[] = [];
      const spies = WRITE_METHODS.map((method) =>
        vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
          written.push(args);
        }),
      );
      const streams = [process.stdout, process.stderr].map((stream) =>
        vi.spyOn(stream, "write").mockImplementation((chunk: unknown) => {
          written.push(chunk);
          return true;
        }),
      );
      resetQueryDriver();
      queueReplies();

      try {
        await call();
      } catch {
        // A refusal or a failure is the answer under test; what it wrote is checked below.
      } finally {
        [...spies, ...streams].forEach((spy) => {
          spy.mockRestore();
        });
      }

      expect(written).toEqual([]);
    },
  );
});
