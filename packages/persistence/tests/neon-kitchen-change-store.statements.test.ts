import {
  DIGEST_STOPPING_STATUSES,
  DIGEST_WINDOW_MS,
} from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listDigestEligibleStatement } from "../src/kitchen-change-statements.js";
import {
  ALREADY_CLAIMED,
  DISPLAYED_REVISION_AHEAD,
  DashboardStoreError,
} from "../src/m10-ports.js";
import type { DashboardStoreFailure } from "../src/m10-ports.js";
import { NeonKitchenChangeStore } from "../src/neon-kitchen-change-store.js";
import { NeonSessionStore } from "../src/neon-session-store.js";
import { STAFF_VISIBLE_PREDICATE } from "../src/staff-kitchen-statements.js";
import { WELL_FORMED_UNREACHABLE_VALUE } from "./support/leaked-connection-markers.js";
import {
  answerQueryWith,
  failQueryWith,
  queryDriver,
  resetQueryDriver,
} from "./support/mocked-neon-query-driver.js";
import type { SentQuery } from "./support/mocked-neon-query-driver.js";
import {
  orderByNamesOfAnOutputColumn,
  statementText,
} from "./support/order-by-output-aliases.js";
import { rejectionOf } from "./support/rejection-of.js";

vi.mock("nanoid", () => ({ nanoid: () => "000000000000000000001" }));

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-query-driver.js")).withMockedQueryDriver(
    await importOriginal<object>(),
  ),
);

/**
 * The text of the statements `NeonKitchenChangeStore` sends, read as the driver receives them, with no database, and
 * what the store does with each reply. What a statement does with a row is the live file's to show
 * (`neon-kitchen-change-store.live.test.ts`) and the pglite check's; this file pins the clauses the rulings made
 * conditions: one statement for a mark with its audit row, `greatest` and the strict comparison of the stamp, the
 * visibility test word for word, the digest's window and statuses bound from the domain, no database clock, no retry of
 * a write, and no column the grants of `0026` and `0027` leave out.
 */
const SESSION_HASH = "a".repeat(64);
const LIFETIMES = {
  client: 2_592_000,
  operator: 43_200,
  administrator: 43_200,
};
const SESSION = {
  sessionTokenHash: SESSION_HASH,
  idleLifetimeSeconds: LIFETIMES,
};
const SECRET = "DRIVER-TEXT-SECRET-77c1";
const AUDIT_ID = "000000000000000000001";
const DESIGN_ID = "D".repeat(21);
const OTHER_DESIGN_ID = "E".repeat(21);
const DAY = "2026-10-27";
const NOW = new Date("2026-10-27T05:00:00.000Z");

function seenEntry(
  action = "kitchen-seen",
  detail: Record<string, unknown> = {},
) {
  return { session: SESSION, entry: { action, detail } } as never;
}

function normalised(statement: SentQuery): string {
  return statement.text.replace(/\s+/g, " ").trim().toLowerCase();
}

function newStore(): NeonKitchenChangeStore {
  return new NeonKitchenChangeStore(WELL_FORMED_UNREACHABLE_VALUE);
}

function loneStatement(): SentQuery {
  const [statement, ...others] = queryDriver.statements;
  if (statement === undefined || others.length > 0) {
    throw new Error("the call did not send exactly one lone statement");
  }
  expect(queryDriver.transactions).toHaveLength(0);
  return statement;
}

function livenessPredicateOf(statement: SentQuery): string {
  const text = normalised(statement);
  const start = text.indexOf("from account_sessions s");
  const terminator = "interval '1 second') > now()";
  return text.slice(start, text.indexOf(terminator, start) + terminator.length);
}

function aDriverError(code: string, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(`driver text ${SECRET}`), {
    name: "NeonDbError",
    code,
    ...extra,
  });
}

async function failureOf(
  call: () => Promise<unknown>,
  failure: DashboardStoreFailure,
): Promise<DashboardStoreError> {
  const rejection = await rejectionOf(call());
  expect(rejection).toBeInstanceOf(DashboardStoreError);
  expect((rejection as DashboardStoreError).failure).toBe(failure);
  return rejection as DashboardStoreError;
}

function mark(overrides: Record<string, unknown> = {}) {
  return newStore().markSeen({
    designId: DESIGN_ID,
    displayedRevision: "7",
    audit: seenEntry(),
    ...overrides,
  });
}

const MARKED_ROW = {
  is_session_live: true,
  is_kitchen_visible: true,
  is_displayed_ahead: false,
  marked_rows: 1,
  audited_rows: 1,
  is_changed_after_seen: false,
};

beforeEach(resetQueryDriver);
afterEach(resetQueryDriver);

describe("a seen mark", () => {
  async function markAndCapture(reply: unknown = [MARKED_ROW]) {
    resetQueryDriver();
    answerQueryWith(reply);
    const result = await mark();
    return { result, statement: loneStatement() };
  }

  it("is one statement: the mark and its audit row are branches of a single with, both conditional on one admission", async () => {
    const { statement } = await markAndCapture();

    const text = normalised(statement);
    expect(text).toContain(
      "admitted as ( select k.id, a.account_id from kitchen k cross join actor a where ?::bigint <= k.revision )",
    );
    expect(text).toContain(
      "insert into design_staff_seen as seen (design_id, seen_revision, seen_by_account_id) select m.id, ?::bigint, m.account_id from admitted m",
    );
    expect(text).toContain(
      "insert into staff_audit_events (id, actor_account_id, action, design_id, subject_account_id, detail) select ?::text, m.account_id, ?::text, m.id, null, '{}'::jsonb from admitted m returning id",
    );
    expect(statement.values).toEqual([
      SESSION_HASH,
      JSON.stringify(LIFETIMES),
      DESIGN_ID,
      "7",
      "7",
      AUDIT_ID,
      "kitchen-seen",
      "7",
    ]);
  });

  it("never lowers the seen revision, and changes the account and the instant only for a strictly greater one", async () => {
    const { statement } = await markAndCapture();

    const text = normalised(statement);
    expect(text).toContain(
      "set seen_revision = greatest(seen.seen_revision, excluded.seen_revision)",
    );
    expect(text).toContain(
      "seen_by_account_id = case when excluded.seen_revision > seen.seen_revision then excluded.seen_by_account_id else seen.seen_by_account_id end",
    );
    expect(text).toContain(
      "seen_at = case when excluded.seen_revision > seen.seen_revision then now() else seen.seen_at end",
    );
    expect(text).toContain("on conflict (design_id) do update");
  });

  it("refuses a displayed revision ahead of the kitchen's in SQL, and writes nothing for it", async () => {
    const { statement } = await markAndCapture();

    const text = normalised(statement);
    expect(text).toContain("where ?::bigint <= k.revision");
    expect(text).toContain(
      "exists (select 1 from kitchen k where ?::bigint > k.revision) as is_displayed_ahead",
    );
  });

  it("tests the kitchen's visibility word for word as the staff statements do, so a deleted or unowned unsent kitchen is not found", async () => {
    const { statement } = await markAndCapture();

    expect(normalised(statement)).toContain(
      `where d.id = ? and ${STAFF_VISIBLE_PREDICATE}`,
    );
  });

  it("judges changed after seen from the revision the upsert returned, for a sent kitchen only", async () => {
    const { statement } = await markAndCapture();

    expect(normalised(statement)).toContain(
      "(select k.sent_at is not null and k.revision <> (select m.seen_revision from marked m) from kitchen k) as is_changed_after_seen",
    );
  });

  it("asks of the session what NeonSessionStore.findLive asks, word for word, and takes the actor of any role", async () => {
    answerQueryWith([]);
    await new NeonSessionStore(WELL_FORMED_UNREACHABLE_VALUE).findLive({
      tokenHash: SESSION_HASH,
      idleLifetimeSeconds: LIFETIMES,
    });
    const liveness = livenessPredicateOf(loneStatement());
    const { statement } = await markAndCapture();

    expect(livenessPredicateOf(statement)).toBe(liveness);
    expect(normalised(statement)).not.toContain("administrator");
    expect(normalised(statement)).not.toContain("a.role =");
  });

  it("names exactly the columns the grants of 0026 and the audit table give, never seen_at on insert and never a delete", async () => {
    const { statement } = await markAndCapture();

    const text = normalised(statement);
    expect(text).not.toMatch(/\bdelete\s+from\b/);
    expect(text).not.toContain("occurred_at");
    expect(text).not.toMatch(/insert into design_staff_seen[^)]*seen_at/);
    expect(text).not.toContain("update designs");
    expect(text).not.toContain("updated_at");
  });

  it("returns ok with the flag the statement computed", async () => {
    expect(
      (await markAndCapture([{ ...MARKED_ROW, is_changed_after_seen: true }]))
        .result,
    ).toEqual({ kind: "ok", changedAfterSeen: true });
    expect(
      (await markAndCapture([{ ...MARKED_ROW, is_changed_after_seen: false }]))
        .result,
    ).toEqual({ kind: "ok", changedAfterSeen: false });
  });

  it("answers not-recorded when no live session stood behind the call, whatever else the reply says", async () => {
    resetQueryDriver();
    answerQueryWith([
      {
        ...MARKED_ROW,
        is_session_live: false,
        is_kitchen_visible: false,
        marked_rows: 0,
        audited_rows: 0,
        is_changed_after_seen: null,
      },
    ]);

    await failureOf(() => mark(), "not-recorded");
  });

  it("answers not-found for a kitchen staff cannot see, and the displayed-revision refusal for one ahead of the kitchen's", async () => {
    resetQueryDriver();
    answerQueryWith([
      {
        ...MARKED_ROW,
        is_kitchen_visible: false,
        marked_rows: 0,
        audited_rows: 0,
        is_changed_after_seen: null,
      },
    ]);
    expect(await mark()).toEqual({ kind: "not-found" });

    resetQueryDriver();
    answerQueryWith([
      {
        ...MARKED_ROW,
        is_displayed_ahead: true,
        marked_rows: 0,
        audited_rows: 0,
        is_changed_after_seen: null,
      },
    ]);
    expect(await mark()).toBe(DISPLAYED_REVISION_AHEAD);
  });

  it.each([
    ["no row written", { ...MARKED_ROW, marked_rows: 0 }],
    ["no audit row written", { ...MARKED_ROW, audited_rows: 0 }],
    ["two rows written", { ...MARKED_ROW, marked_rows: 2 }],
    ["no flag", { ...MARKED_ROW, is_changed_after_seen: null }],
    ["a flag that is text", { ...MARKED_ROW, is_changed_after_seen: "false" }],
    [
      "a session flag that is not a boolean",
      { ...MARKED_ROW, is_session_live: 1 },
    ],
  ])("refuses a reply with %s as an unexpected answer", async (_name, row) => {
    resetQueryDriver();
    answerQueryWith([row]);

    await failureOf(() => mark(), "unexpected-answer");
  });

  it.each([
    ["no row", []],
    ["two rows", [MARKED_ROW, MARKED_ROW]],
  ])("refuses a reply of %s as an unexpected answer", async (_name, rows) => {
    resetQueryDriver();
    answerQueryWith(rows);

    await failureOf(() => mark(), "unexpected-answer");
  });

  it.each([
    ["a revision with a leading zero", { displayedRevision: "07" }],
    ["a revision of zero", { displayedRevision: "0" }],
    [
      "a revision wider than a bigint",
      { displayedRevision: "9223372036854775808" },
    ],
    ["a revision with an exponent", { displayedRevision: "1e3" }],
    [
      "an audit entry for another action",
      { audit: seenEntry("note-added", {}) },
    ],
    [
      "an audit entry for a price action",
      { audit: seenEntry("price-catalogue-viewed", { section: "history" }) },
    ],
    [
      "an audit entry with a detail",
      { audit: seenEntry("kitchen-seen", { x: 1 }) },
    ],
  ])("refuses %s before it sends anything", async (_name, overrides) => {
    await failureOf(() => mark(overrides), "invalid-request");

    expect(queryDriver.statements).toHaveLength(0);
  });

  it.each(["", "a/b", "short", "x".repeat(22), "é".repeat(21)])(
    "answers not-found for the id %j without sending anything",
    async (designId) => {
      expect(await mark({ designId })).toEqual({ kind: "not-found" });
      expect(queryDriver.statements).toHaveLength(0);
    },
  );

  it("is never retried, even after a reply the driver loses", async () => {
    resetQueryDriver();
    failQueryWith(new SyntaxError("Unexpected end of JSON input"));
    answerQueryWith([MARKED_ROW]);

    await failureOf(() => mark(), "database");

    expect(queryDriver.statements).toHaveLength(1);
  });

  it("keeps only a SQLSTATE and a constraint name of a failure", async () => {
    resetQueryDriver();
    failQueryWith(
      aDriverError("23505", {
        constraint: "staff_audit_events_pkey",
        message: `{"neon:retryable":true} ${SECRET}`,
      }),
    );

    const failure = await failureOf(() => mark(), "database");

    expect(queryDriver.statements).toHaveLength(1);
    expect(failure.cause).toMatchObject({
      code: "23505",
      constraint: "staff_audit_events_pkey",
    });
    expect(JSON.stringify([failure.message, failure.cause])).not.toContain(
      SECRET,
    );
  });

  it.each([
    ["42501", "unavailable"],
    ["42P01", "unavailable"],
    ["08006", "database"],
  ] as const)("reads SQLSTATE %s as %s", async (code, expected) => {
    resetQueryDriver();
    failQueryWith(aDriverError(code));

    await failureOf(() => mark(), expected);
  });
});

describe("the claim of a digest day", () => {
  it("inserts the day's key alone, with on conflict do nothing, and returns it", async () => {
    answerQueryWith([{ day_key: DAY }]);

    const result = await newStore().claimDigestDay(DAY);

    expect(result).toEqual({ kind: "claimed", roundId: DAY });
    const statement = loneStatement();
    expect(normalised(statement)).toBe(
      "insert into staff_change_digest_rounds (day_key) values (?) on conflict (day_key) do nothing returning day_key",
    );
    expect(statement.values).toEqual([DAY]);
  });

  it("answers already-claimed when the insert returned no row", async () => {
    answerQueryWith([]);

    expect(await newStore().claimDigestDay(DAY)).toBe(ALREADY_CLAIMED);
  });

  it.each([
    ["two rows", [{ day_key: DAY }, { day_key: DAY }]],
    ["another day", [{ day_key: "2026-10-28" }]],
    ["no day", [{}]],
  ])("refuses a reply of %s as an unexpected answer", async (_name, rows) => {
    answerQueryWith(rows);

    await failureOf(() => newStore().claimDigestDay(DAY), "unexpected-answer");
  });

  it.each([
    "2026-13-01",
    "2026-02-30",
    "26-10-26",
    "2026-10-26T05:00",
    "",
    "today",
  ])(
    "does not send the day %j, which is not a calendar day",
    async (dayKey) => {
      await failureOf(
        () => newStore().claimDigestDay(dayKey),
        "invalid-request",
      );
      expect(queryDriver.statements).toHaveLength(0);
    },
  );

  it("is never retried, even after a reply the driver loses: a repeat could claim a day that was claimed", async () => {
    failQueryWith(new SyntaxError("Unexpected end of JSON input"));
    answerQueryWith([{ day_key: DAY }]);

    await failureOf(() => newStore().claimDigestDay(DAY), "database");

    expect(queryDriver.statements).toHaveLength(1);
  });
});

describe("the list of the kitchens a digest holds", () => {
  const ROW = {
    design_id: DESIGN_ID,
    kitchen_name: "Bucatarie",
    customer_name: "Ana Rusu",
    reference: "REF-0001",
    sent_ms: "1790000000000",
    updated_ms: "1790000500000",
    revision: "12",
  };

  async function listAndCapture(rows: unknown = []) {
    resetQueryDriver();
    answerQueryWith(rows);
    const result = await newStore().listDigestEligible(NOW);
    return { result, statement: loneStatement() };
  }

  it("binds the passed instant, the domain's window and the domain's stopping statuses, and reads no clock of its own", async () => {
    const { statement } = await listAndCapture();

    expect(statement.values).toEqual([
      NOW.toISOString(),
      DIGEST_WINDOW_MS,
      [...DIGEST_STOPPING_STATUSES],
    ]);
    const text = normalised(statement);
    expect(text).toContain(
      "d.sent_at > ?::timestamptz - (?::double precision * interval '1 millisecond')",
    );
    expect(text).toContain("coalesce(s.status, 'new') <> all(?::text[])");
    expect(text).not.toMatch(/\bnow\s*\(/);
    expect(text).not.toContain("interval '30 days'");
    expect(text).not.toContain("720");
    expect(text).not.toContain("current_timestamp");
  });

  it("states each clause of S-d1: changed against the effective seen revision, not held by an entry above it, sent and not deleted", async () => {
    const { statement } = await listAndCapture();

    const text = normalised(statement);
    expect(text).toContain(
      "left join lateral ( select cs.reference, cs.design_revision from contact_submissions cs where cs.design_id = d.id order by cs.created_at desc, cs.client_request_id desc limit 1 ) latest on true",
    );
    expect(text).toContain(
      "select coalesce(seen.seen_revision, latest.design_revision) as effective_seen",
    );
    expect(text).toContain("d.revision <> basis.effective_seen");
    expect(text).toContain(
      "not exists ( select 1 from staff_change_digest_entries entry where entry.design_id = d.id and entry.revision > basis.effective_seen )",
    );
    expect(text).toContain(
      "where d.deleted_by_client_at is null and d.sent_at is not null",
    );
  });

  it("names the customer by the account's name with its spaces trimmed, and reads no other column of the account or of the request", async () => {
    const { statement } = await listAndCapture();

    const text = normalised(statement);
    expect(text).toContain("nullif(btrim(a.name), '') as customer_name");
    for (const forbidden of [
      "a.email",
      "a.phone",
      "a.address",
      "cs.name",
      "cs.phone",
      "cs.email",
      "cs.locality",
      "design_document",
      "priced",
    ]) {
      expect(text, forbidden).not.toContain(forbidden);
    }
    expect(
      [...text.matchAll(/\bcs\.(\w+)/g)].map(([, column]) => column),
    ).toEqual(
      expect.arrayContaining(["reference", "design_revision", "design_id"]),
    );
    expect(
      new Set([...text.matchAll(/\bcs\.(\w+)/g)].map(([, column]) => column)),
    ).toEqual(
      new Set([
        "reference",
        "design_revision",
        "design_id",
        "created_at",
        "client_request_id",
      ]),
    );
  });

  it("returns one row per kitchen oldest sent first, and sorts by columns of its tables and not by an output name", async () => {
    const { statement } = await listAndCapture();

    expect(normalised(statement)).toContain("order by d.sent_at asc, d.id asc");
    expect(orderByNamesOfAnOutputColumn(statement.text)).toEqual([]);
    expect(
      orderByNamesOfAnOutputColumn(
        listDigestEligibleStatement(statementText, {
          nowIso: NOW.toISOString(),
          windowMilliseconds: DIGEST_WINDOW_MS,
          stoppingStatuses: DIGEST_STOPPING_STATUSES,
        }),
      ),
    ).toEqual([]);
  });

  it("reads a named kitchen by the customer's name and an unnamed one by the request's reference, with no member the port does not name", async () => {
    const { result } = await listAndCapture([
      ROW,
      {
        ...ROW,
        design_id: OTHER_DESIGN_ID,
        kitchen_name: null,
        customer_name: null,
      },
    ]);

    expect(result).toEqual([
      {
        designId: DESIGN_ID,
        kitchenName: "Bucatarie",
        customerName: "Ana Rusu",
        sentAt: new Date(1790000000000),
        updatedAt: new Date(1790000500000),
        revision: "12",
      },
      {
        designId: OTHER_DESIGN_ID,
        reference: "REF-0001",
        sentAt: new Date(1790000000000),
        updatedAt: new Date(1790000500000),
        revision: "12",
      },
    ]);
  });

  it.each([
    [
      "a row with neither a name nor a reference",
      { customer_name: null, reference: null },
    ],
    ["a revision with a leading zero", { revision: "012" }],
    ["a revision that is a number", { revision: 12 }],
    ["an instant that is not milliseconds", { sent_ms: "yesterday" }],
    ["no design id", { design_id: null }],
  ])("refuses %s as an unexpected answer", async (_name, overrides) => {
    resetQueryDriver();
    answerQueryWith([{ ...ROW, ...overrides }]);

    await failureOf(
      () => newStore().listDigestEligible(NOW),
      "unexpected-answer",
    );
  });

  it("retries its read after a lost acknowledgement, because the read writes nothing", async () => {
    resetQueryDriver();
    failQueryWith(new SyntaxError("Unexpected end of JSON input"));
    answerQueryWith([ROW]);

    const rows = await newStore().listDigestEligible(NOW);

    expect(rows).toHaveLength(1);
    expect(queryDriver.statements).toHaveLength(2);
  });

  it.each([new Date(Number.NaN), "2026-10-27" as never, undefined as never])(
    "does not send an instant that is not a valid date (%s)",
    async (now) => {
      await failureOf(
        () => newStore().listDigestEligible(now),
        "invalid-request",
      );
      expect(queryDriver.statements).toHaveLength(0);
    },
  );
});

describe("the entries of a round", () => {
  const ENTRIES = [
    { designId: DESIGN_ID, revision: "12" },
    { designId: OTHER_DESIGN_ID, revision: "3" },
  ];

  async function recordAndCapture(
    reply: unknown = [{ is_claimed: true, listed_rows: 2, counted_rows: 1 }],
    entries = ENTRIES,
  ) {
    resetQueryDriver();
    answerQueryWith(reply);
    await newStore().recordDigested(DAY, entries);
    return loneStatement();
  }

  it("inserts the entries of a claimed round with on conflict do nothing, from parallel arrays, and sets the count from the table", async () => {
    const statement = await recordAndCapture();

    const text = normalised(statement);
    expect(text).toContain(
      "insert into staff_change_digest_entries (day_key, design_id, revision) select r.day_key, e.design_id, e.revision::bigint from round r cross join unnest(?::text[], ?::text[]) as e(design_id, revision) on conflict (day_key, design_id) do nothing returning design_id",
    );
    expect(text).toContain(
      "set sent_count = (select count(*) from staff_change_digest_entries held where held.day_key = r.day_key) + (select count(*) from listed)",
    );
    expect(statement.values).toEqual([
      DAY,
      [DESIGN_ID, OTHER_DESIGN_ID],
      ["12", "3"],
      DAY,
    ]);
  });

  it("never updates an entry and never deletes one, and writes no column of a round but the count", async () => {
    const text = normalised(await recordAndCapture());

    expect(text).not.toMatch(/update staff_change_digest_entries/);
    expect(text).not.toMatch(/\bdelete\s+from\b/);
    expect(text).not.toContain("claimed_at");
    expect(
      text.match(/update staff_change_digest_rounds r set (\w+)/g),
    ).toEqual(["update staff_change_digest_rounds r set sent_count"]);
  });

  it("sends an empty list and still asks whether the round was claimed", async () => {
    const statement = await recordAndCapture(
      [{ is_claimed: true, listed_rows: 0, counted_rows: 1 }],
      [],
    );

    expect(statement.values).toEqual([DAY, [], [], DAY]);
  });

  it("refuses entries for a round nobody claimed", async () => {
    resetQueryDriver();
    answerQueryWith([{ is_claimed: false, listed_rows: 0, counted_rows: 0 }]);

    await failureOf(
      () => newStore().recordDigested(DAY, ENTRIES),
      "invalid-request",
    );
  });

  it.each([
    [
      "no count of the round written",
      { is_claimed: true, listed_rows: 2, counted_rows: 0 },
    ],
    [
      "a count written twice",
      { is_claimed: true, listed_rows: 2, counted_rows: 2 },
    ],
    [
      "a claim flag that is not a boolean",
      { is_claimed: 1, listed_rows: 2, counted_rows: 1 },
    ],
  ])("refuses a reply with %s as an unexpected answer", async (_name, row) => {
    resetQueryDriver();
    answerQueryWith([row]);

    await failureOf(
      () => newStore().recordDigested(DAY, ENTRIES),
      "unexpected-answer",
    );
  });

  it.each([
    ["a round that is not a day", "2026-13-45", ENTRIES],
    [
      "a design id that is not a design's",
      DAY,
      [{ designId: "short", revision: "1" }],
    ],
    ["a revision of zero", DAY, [{ designId: DESIGN_ID, revision: "0" }]],
    [
      "a revision with a leading zero",
      DAY,
      [{ designId: DESIGN_ID, revision: "01" }],
    ],
    [
      "a revision wider than a bigint",
      DAY,
      [{ designId: DESIGN_ID, revision: "9223372036854775808" }],
    ],
    [
      "one bad entry among good ones",
      DAY,
      [...ENTRIES, { designId: "x", revision: "1" }],
    ],
  ])("refuses %s before it sends anything", async (_name, roundId, entries) => {
    await failureOf(
      () => newStore().recordDigested(roundId, entries),
      "invalid-request",
    );

    expect(queryDriver.statements).toHaveLength(0);
  });

  it("is never retried, even after a reply the driver loses", async () => {
    failQueryWith(new SyntaxError("Unexpected end of JSON input"));
    answerQueryWith([{ is_claimed: true, listed_rows: 2, counted_rows: 1 }]);

    await failureOf(() => newStore().recordDigested(DAY, ENTRIES), "database");

    expect(queryDriver.statements).toHaveLength(1);
  });
});
