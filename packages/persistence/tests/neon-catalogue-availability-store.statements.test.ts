import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AVAILABILITY_REVISION_NOT_FOUND,
  CHANGED_MEANWHILE,
  DashboardStoreError,
} from "../src/m10-ports.js";
import type { DashboardStoreFailure } from "../src/m10-ports.js";
import { NeonCatalogueAvailabilityStore } from "../src/neon-catalogue-availability-store.js";
import { NeonSessionStore } from "../src/neon-session-store.js";
import { WELL_FORMED_UNREACHABLE_VALUE } from "./support/leaked-connection-markers.js";
import {
  answerQueryWith,
  failQueryWith,
  queryDriver,
  resetQueryDriver,
} from "./support/mocked-neon-query-driver.js";
import type { SentQuery } from "./support/mocked-neon-query-driver.js";
import { rejectionOf } from "./support/rejection-of.js";

vi.mock("nanoid", () => ({ nanoid: () => "000000000000000000001" }));

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-query-driver.js")).withMockedQueryDriver(
    await importOriginal<object>(),
  ),
);

/**
 * The text of the statements `NeonCatalogueAvailabilityStore` sends, read as the driver receives them, with no database,
 * and what the store does with each reply. What a statement does with a row is the live file's to show
 * (`neon-catalogue-availability-store.live.test.ts`); this file pins the clauses the rulings made conditions: one
 * statement for a write, its log row and its audit row, the log row's revision and the audit row's both taken from the
 * head's own update, nothing written when the head did not move, the actor from the session in the statement, no retry
 * of a write, and the log read only up to the head.
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
const SECRET = "DRIVER-TEXT-SECRET-5be2";
const AUDIT_ID = "000000000000000000001";
const MATERIAL = { kind: "material", tierId: "item-abc" } as const;

function activation(
  detail: Record<string, unknown> = {
    itemKind: "material",
    itemId: "item-abc",
    active: false,
  },
  action = "catalogue-item-active-changed",
) {
  return { session: SESSION, entry: { action, detail } } as never;
}

function normalised(statement: SentQuery): string {
  return statement.text.replace(/\s+/g, " ").trim().toLowerCase();
}

function newStore(): NeonCatalogueAvailabilityStore {
  return new NeonCatalogueAvailabilityStore(WELL_FORMED_UNREACHABLE_VALUE);
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

function setMaterialOff(overrides: Record<string, unknown> = {}) {
  return newStore().setActive({
    item: MATERIAL,
    active: false,
    expectedRevision: "7",
    audit: activation(),
    ...overrides,
  });
}

const WRITTEN_ROW = {
  revision: "8",
  logged_revision: "8",
  audited_rows: 1,
  is_session_live: true,
};

beforeEach(resetQueryDriver);
afterEach(resetQueryDriver);

describe("reading what is switched off", () => {
  it("reads the head's revision and each switched-off item in one statement, the log only up to the head", async () => {
    answerQueryWith([
      { revision: "5", item_kind: "finish", item_id: "oak" },
      { revision: "5", item_kind: "handle", item_id: "steel" },
      { revision: "5", item_kind: "hardware", item_id: "premium" },
      { revision: "5", item_kind: "accessory", item_id: "plinth-light" },
      { revision: "5", item_kind: "material", item_id: "pal" },
    ]);

    const current = await newStore().readCurrent();

    expect(current).toEqual({
      revision: "5",
      disabled: [
        { kind: "finish", finishId: "oak" },
        { kind: "handle", handle: "steel" },
        { kind: "hardware", tierId: "premium" },
        { kind: "accessory", accessoryId: "plinth-light" },
        { kind: "material", tierId: "pal" },
      ],
    });
    const text = normalised(loneStatement());
    expect(text).toContain("where l.revision <= h.revision");
    expect(text).toContain("select distinct on (l.item_kind, l.item_id)");
    expect(text).toContain("order by l.item_kind, l.item_id, l.revision desc");
    expect(text).toContain("where not latest.active");
  });

  it("reads one row with no item as nothing switched off", async () => {
    answerQueryWith([{ revision: "0", item_kind: null, item_id: null }]);

    expect(await newStore().readCurrent()).toEqual({
      revision: "0",
      disabled: [],
    });
  });

  it.each([
    ["no row, which is a head that is not there", []],
    [
      "rows that disagree on the revision",
      [
        { revision: "5", item_kind: "material", item_id: "a" },
        { revision: "6", item_kind: "material", item_id: "b" },
      ],
    ],
    [
      "a revision that is not a revision's shape",
      [{ revision: "05", item_kind: null, item_id: null }],
    ],
    [
      "a kind this build does not know",
      [{ revision: "5", item_kind: "colour", item_id: "a" }],
    ],
    [
      "a handle this build does not know",
      [{ revision: "5", item_kind: "handle", item_id: "gold" }],
    ],
    [
      "a kind without an id",
      [{ revision: "5", item_kind: "material", item_id: null }],
    ],
  ])("refuses %s as an unexpected answer", async (_name, rows) => {
    answerQueryWith(rows);

    await failureOf(() => newStore().readCurrent(), "unexpected-answer");
  });

  it("reads the state at a revision from the replay of the log up to it, and no state beyond the head", async () => {
    answerQueryWith([{ revision: "3", item_kind: "material", item_id: "a" }]);
    expect(await newStore().readAt("3")).toEqual({
      kind: "found",
      availability: {
        revision: "3",
        disabled: [{ kind: "material", tierId: "a" }],
      },
    });
    const statement = loneStatement();
    expect(statement.values).toEqual(["3", "3", "3"]);
    expect(normalised(statement)).toContain("where ?::bigint <= h.revision");

    resetQueryDriver();
    answerQueryWith([]);
    expect(await newStore().readAt("4")).toBe(AVAILABILITY_REVISION_NOT_FOUND);
  });

  it.each(["", "01", "-1", "abc", "1e1", "1 ", "9223372036854775808"])(
    "does not send revision %j, which is not a revision's shape",
    async (revision) => {
      expect(await newStore().readAt(revision)).toBe(
        AVAILABILITY_REVISION_NOT_FOUND,
      );
      expect(queryDriver.statements).toHaveLength(0);
    },
  );
});

describe("an availability write", () => {
  async function writeAndCapture(reply: unknown) {
    resetQueryDriver();
    answerQueryWith(reply);
    const result = await setMaterialOff();
    return { result, statement: loneStatement() };
  }

  it("is one statement: the head's compare-and-set, the log row and the audit row are branches of a single with", async () => {
    const { result, statement } = await writeAndCapture([WRITTEN_ROW]);

    const text = normalised(statement);
    expect(result).toEqual({ kind: "ok", revision: "8" });
    expect(text).toContain(
      "moved_head as ( update catalogue_availability_head set revision = revision + 1 where revision = ?::bigint and exists (select 1 from actor) returning revision )",
    );
    expect(text).toContain(
      "insert into catalogue_availability_changes (revision, item_kind, item_id, active, changed_by_account_id) select h.revision, ?::text, ?::text, ?::boolean, a.account_id from moved_head h cross join actor a returning revision",
    );
    expect(text).toContain(
      "insert into staff_audit_events (id, actor_account_id, action, design_id, subject_account_id, detail) select ?::text, a.account_id, ?::text, null, null, ?::jsonb || jsonb_build_object('availabilityrevision', h.revision::text) from moved_head h cross join actor a returning id",
    );
    expect(statement.values).toEqual([
      SESSION_HASH,
      JSON.stringify(LIFETIMES),
      "7",
      "material",
      "item-abc",
      false,
      AUDIT_ID,
      "catalogue-item-active-changed",
      JSON.stringify({
        itemKind: "material",
        itemId: "item-abc",
        active: false,
      }),
    ]);
  });

  it("writes the log row and the audit row from the revision the head's update returned, and from none the caller supplied", async () => {
    resetQueryDriver();
    answerQueryWith([WRITTEN_ROW]);

    await setMaterialOff({
      audit: activation({
        itemKind: "material",
        itemId: "item-abc",
        active: false,
        availabilityRevision: "424242",
      }),
    });
    const { values } = loneStatement();

    expect(JSON.stringify(values)).not.toContain("424242");
  });

  it("names exactly the columns the grant of 0025 gives, never changed_at and never the head's key", async () => {
    const { statement } = await writeAndCapture([WRITTEN_ROW]);

    const text = normalised(statement);
    expect(text).not.toMatch(/(?<!password_)changed_at/);
    expect(text).not.toContain("singleton");
    expect(text).not.toContain("occurred_at");
    expect(text).not.toContain("delete");
  });

  it("asks of the session what NeonSessionStore.findLive asks, word for word", async () => {
    answerQueryWith([]);
    await new NeonSessionStore(WELL_FORMED_UNREACHABLE_VALUE).findLive({
      tokenHash: SESSION_HASH,
      idleLifetimeSeconds: LIFETIMES,
    });
    const liveness = livenessPredicateOf(loneStatement());
    const { statement } = await writeAndCapture([WRITTEN_ROW]);

    expect(livenessPredicateOf(statement)).toBe(liveness);
  });

  it("takes the actor only from an administrator's session, as the route also requires", async () => {
    const { statement } = await writeAndCapture([WRITTEN_ROW]);

    expect(normalised(statement)).toContain(
      "interval '1 second') > now() and a.role = 'administrator' ), moved_head as",
    );
  });

  it("answers changed-meanwhile when the head did not move, and not-recorded when no session stood behind the call", async () => {
    expect(
      (
        await writeAndCapture([
          {
            revision: null,
            logged_revision: null,
            audited_rows: 0,
            is_session_live: true,
          },
        ])
      ).result,
    ).toBe(CHANGED_MEANWHILE);

    resetQueryDriver();
    answerQueryWith([
      {
        revision: null,
        logged_revision: null,
        audited_rows: 0,
        is_session_live: false,
      },
    ]);
    await failureOf(() => setMaterialOff(), "not-recorded");
  });

  it.each([
    [
      "an item the audit entry does not describe",
      {
        audit: activation({
          itemKind: "material",
          itemId: "other",
          active: false,
        }),
      },
    ],
    [
      "a flag the audit entry does not describe",
      {
        audit: activation({
          itemKind: "material",
          itemId: "item-abc",
          active: true,
        }),
      },
    ],
    ["another action", { audit: activation({}, "kitchen-seen") }],
    ["a malformed expected revision", { expectedRevision: "01" }],
    ["a flag that is not a boolean", { active: "no" }],
    ["an item with an empty id", { item: { kind: "material", tierId: "" } }],
    [
      "an item id the table refuses",
      { item: { kind: "material", tierId: "a b" } },
    ],
  ])("refuses %s before it sends anything", async (_name, overrides) => {
    await failureOf(() => setMaterialOff(overrides), "invalid-request");

    expect(queryDriver.statements).toHaveLength(0);
  });

  it("is never retried, and keeps only a SQLSTATE and a constraint name of a failure", async () => {
    resetQueryDriver();
    failQueryWith(
      aDriverError("23505", {
        constraint: "catalogue_availability_changes_pkey",
        message: `{"neon:retryable":true} ${SECRET}`,
      }),
    );

    const failure = await failureOf(() => setMaterialOff(), "database");

    expect(queryDriver.statements).toHaveLength(1);
    expect(failure.cause).toMatchObject({
      code: "23505",
      constraint: "catalogue_availability_changes_pkey",
    });
    expect(JSON.stringify([failure.message, failure.cause])).not.toContain(
      SECRET,
    );
  });

  it.each([
    ["42501", "unavailable"],
    ["42P01", "unavailable"],
  ] as const)("reads SQLSTATE %s as %s", async (code, expected) => {
    resetQueryDriver();
    failQueryWith(aDriverError(code));

    await failureOf(() => setMaterialOff(), expected);
  });

  it.each([
    [
      "a log row at another revision than the head's",
      { ...WRITTEN_ROW, logged_revision: "9" },
    ],
    ["no log row", { ...WRITTEN_ROW, logged_revision: null }],
    ["no audit row", { ...WRITTEN_ROW, audited_rows: 0 }],
    [
      "a revision that is not a revision",
      { ...WRITTEN_ROW, revision: "08", logged_revision: "08" },
    ],
  ])("refuses %s as an unexpected answer", async (_name, row) => {
    resetQueryDriver();
    answerQueryWith([row]);

    await failureOf(() => setMaterialOff(), "unexpected-answer");
  });
});
