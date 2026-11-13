import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DashboardStoreError,
  NEVER_RECORDED,
  REVISION_AHEAD,
  UNKNOWN_VERSION,
} from "../src/m10-ports.js";
import type { DashboardStoreFailure } from "../src/m10-ports.js";
import { NeonPriceNoticeStore } from "../src/neon-price-notice-store.js";
import { WELL_FORMED_UNREACHABLE_VALUE } from "./support/leaked-connection-markers.js";
import {
  answerQueryWith,
  failQueryWith,
  queryDriver,
  resetQueryDriver,
} from "./support/mocked-neon-query-driver.js";
import type { SentQuery } from "./support/mocked-neon-query-driver.js";
import { rejectionOf } from "./support/rejection-of.js";

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-query-driver.js")).withMockedQueryDriver(
    await importOriginal<object>(),
  ),
);

/**
 * The text of the statements `NeonPriceNoticeStore` sends, read as the driver receives them, with no database, and what
 * the store does with each reply. What a statement does with a row is the live file's to show
 * (`neon-price-notice-store.live.test.ts`); this file pins the clauses that are conditions: a first open that never
 * overwrites, an acknowledgement that is one statement conditional on the version and on the head, both compared in SQL,
 * no audit row, no retry of a write, and no column the grants of `0028` leave out.
 */
const SECRET = "DRIVER-TEXT-SECRET-77c1";
const DESIGN_ID = "D".repeat(21);
const VERSION_ID = "V".repeat(21);
const PAIR = { versionId: VERSION_ID, availabilityRevision: "7" };

function normalised(statement: SentQuery): string {
  return statement.text.replace(/\s+/g, " ").trim().toLowerCase();
}

function newStore(): NeonPriceNoticeStore {
  return new NeonPriceNoticeStore(WELL_FORMED_UNREACHABLE_VALUE);
}

function loneStatement(): SentQuery {
  const [statement, ...others] = queryDriver.statements;
  if (statement === undefined || others.length > 0) {
    throw new Error("the call did not send exactly one lone statement");
  }
  expect(queryDriver.transactions).toHaveLength(0);
  return statement;
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

const ACKNOWLEDGED_ROW = {
  is_version_known: true,
  is_revision_ahead: false,
  written_rows: 1,
};

beforeEach(resetQueryDriver);
afterEach(resetQueryDriver);

describe("reading a marker", () => {
  it("selects the pair of one design, with the revision read back as text", async () => {
    answerQueryWith([]);

    await newStore().readAcknowledged(DESIGN_ID);

    const statement = loneStatement();
    expect(normalised(statement)).toBe(
      "select acknowledged_version_id, acknowledged_availability_revision::text as availability_revision from design_price_notices where design_id = ?",
    );
    expect(statement.values).toEqual([DESIGN_ID]);
  });

  it("reads no row as never recorded, and a row as the pair it holds", async () => {
    answerQueryWith([]);
    expect(await newStore().readAcknowledged(DESIGN_ID)).toBe(NEVER_RECORDED);

    resetQueryDriver();
    answerQueryWith([
      { acknowledged_version_id: VERSION_ID, availability_revision: "7" },
    ]);
    expect(await newStore().readAcknowledged(DESIGN_ID)).toEqual({
      kind: "recorded",
      acknowledged: PAIR,
    });
  });

  it.each([
    ["two rows", [{}, {}]],
    [
      "a version id that is not an id's shape",
      [{ acknowledged_version_id: "x", availability_revision: "7" }],
    ],
    [
      "a revision that is not a revision's shape",
      [{ acknowledged_version_id: VERSION_ID, availability_revision: "07" }],
    ],
    [
      "a revision that is not text",
      [{ acknowledged_version_id: VERSION_ID, availability_revision: 7 }],
    ],
    ["a reply that is not rows", { acknowledged_version_id: VERSION_ID }],
  ])("refuses %s as an unexpected answer", async (_name, reply) => {
    answerQueryWith(reply);

    await failureOf(
      () => newStore().readAcknowledged(DESIGN_ID),
      "unexpected-answer",
    );
  });

  it("retries its read after a lost acknowledgement, because the read writes nothing", async () => {
    failQueryWith(new SyntaxError("Unexpected end of JSON input"));
    answerQueryWith([]);

    expect(await newStore().readAcknowledged(DESIGN_ID)).toBe(NEVER_RECORDED);

    expect(queryDriver.statements).toHaveLength(2);
  });

  it("sends nothing for a design id that is not an id's shape", async () => {
    await failureOf(
      () => newStore().readAcknowledged("not an id"),
      "invalid-request",
    );

    expect(queryDriver.statements).toHaveLength(0);
  });
});

describe("a first open", () => {
  it("inserts the pair with on conflict do nothing, so a marker already there is never overwritten, and returns nothing", async () => {
    answerQueryWith([]);

    await newStore().recordIfAbsent(DESIGN_ID, PAIR);

    const statement = loneStatement();
    expect(normalised(statement)).toBe(
      "insert into design_price_notices (design_id, acknowledged_version_id, acknowledged_availability_revision) values (?, ?, ?::bigint) on conflict (design_id) do nothing",
    );
    expect(statement.values).toEqual([DESIGN_ID, VERSION_ID, "7"]);
  });

  it("writes no audit row, names no instant and updates nothing", async () => {
    answerQueryWith([]);

    await newStore().recordIfAbsent(DESIGN_ID, PAIR);

    const text = normalised(loneStatement());
    expect(text).not.toContain("staff_audit_events");
    expect(text).not.toContain("acknowledged_at");
    expect(text).not.toMatch(/\b(?:update|delete)\b/);
  });

  it("is never retried, even after a reply the driver loses", async () => {
    failQueryWith(new SyntaxError("Unexpected end of JSON input"));
    answerQueryWith([]);

    await failureOf(
      () => newStore().recordIfAbsent(DESIGN_ID, PAIR),
      "database",
    );

    expect(queryDriver.statements).toHaveLength(1);
  });

  it.each([
    ["a design id that is not an id's shape", "not an id", PAIR],
    [
      "a version id that is not an id's shape",
      DESIGN_ID,
      { ...PAIR, versionId: "not a version id" },
    ],
    [
      "a revision with a leading zero",
      DESIGN_ID,
      { ...PAIR, availabilityRevision: "07" },
    ],
    [
      "a revision wider than a bigint",
      DESIGN_ID,
      { ...PAIR, availabilityRevision: "9223372036854775808" },
    ],
    ["a negative revision", DESIGN_ID, { ...PAIR, availabilityRevision: "-1" }],
  ])("sends nothing for %s", async (_name, designId, pair) => {
    await failureOf(
      () => newStore().recordIfAbsent(designId, pair),
      "invalid-request",
    );

    expect(queryDriver.statements).toHaveLength(0);
  });
});

describe("an acknowledgement", () => {
  async function acknowledgeAndCapture(reply: unknown = [ACKNOWLEDGED_ROW]) {
    resetQueryDriver();
    answerQueryWith(reply);
    const result = await newStore().recordAcknowledged(DESIGN_ID, PAIR);
    return { result, statement: loneStatement() };
  }

  it("is one statement: the upsert is a branch of a single with, conditional on the version and on the head", async () => {
    const { statement } = await acknowledgeAndCapture();

    const text = normalised(statement);
    expect(text).toContain(
      "known as ( select v.id from price_book_versions v where v.id = ? )",
    );
    expect(text).toContain(
      "head as ( select h.revision from catalogue_availability_head h )",
    );
    expect(text).toContain(
      "admitted as ( select k.id from known k cross join head h where ?::bigint <= h.revision )",
    );
    expect(text).toContain(
      "insert into design_price_notices as notice (design_id, acknowledged_version_id, acknowledged_availability_revision) select ?::text, a.id, ?::bigint from admitted a",
    );
    expect(statement.values).toEqual([VERSION_ID, "7", DESIGN_ID, "7", "7"]);
  });

  it("replaces the pair the design held and restamps the instant, so the last acknowledgement is the one kept", async () => {
    const { statement } = await acknowledgeAndCapture();

    const text = normalised(statement);
    expect(text).toContain(
      "on conflict (design_id) do update set acknowledged_version_id = excluded.acknowledged_version_id, acknowledged_availability_revision = excluded.acknowledged_availability_revision, acknowledged_at = now()",
    );
  });

  it("compares the revision to the head in SQL, as a bigint, and reports which condition refused", async () => {
    const { statement } = await acknowledgeAndCapture();

    const text = normalised(statement);
    expect(text).toContain("exists (select 1 from known) as is_version_known");
    expect(text).toContain(
      "exists (select 1 from head h where ?::bigint > h.revision) as is_revision_ahead",
    );
    expect(text).toContain(
      "(select count(*) from written)::int as written_rows",
    );
  });

  it("writes no audit row and no column the grants leave out, and never deletes", async () => {
    const { statement } = await acknowledgeAndCapture();

    const text = normalised(statement);
    expect(text).not.toContain("staff_audit_events");
    expect(text).not.toMatch(/\bdelete\s+from\b/);
    expect(text).not.toMatch(
      /insert into design_price_notices[^)]*acknowledged_at/,
    );
    expect(text).not.toMatch(/\bset\s+design_id\b|,\s*design_id\s*=/);
  });

  it("answers ok when the one row was written", async () => {
    expect((await acknowledgeAndCapture()).result).toEqual({ kind: "ok" });
  });

  it("answers unknown-version for a version the table does not hold, judged before the revision", async () => {
    const { result } = await acknowledgeAndCapture([
      {
        is_version_known: false,
        is_revision_ahead: true,
        written_rows: 0,
      },
    ]);

    expect(result).toBe(UNKNOWN_VERSION);
  });

  it("answers revision-ahead for a revision beyond the head's", async () => {
    const { result } = await acknowledgeAndCapture([
      { is_version_known: true, is_revision_ahead: true, written_rows: 0 },
    ]);

    expect(result).toBe(REVISION_AHEAD);
  });

  it.each([
    ["no row written", { ...ACKNOWLEDGED_ROW, written_rows: 0 }],
    ["two rows written", { ...ACKNOWLEDGED_ROW, written_rows: 2 }],
    ["a count that is not a count", { ...ACKNOWLEDGED_ROW, written_rows: "1" }],
    [
      "a flag that is not a boolean",
      { ...ACKNOWLEDGED_ROW, is_version_known: "t" },
    ],
  ])("refuses a reply with %s as an unexpected answer", async (_name, row) => {
    resetQueryDriver();
    answerQueryWith([row]);

    await failureOf(
      () => newStore().recordAcknowledged(DESIGN_ID, PAIR),
      "unexpected-answer",
    );
  });

  it("is never retried, even after a reply the driver loses", async () => {
    failQueryWith(new SyntaxError("Unexpected end of JSON input"));
    answerQueryWith([ACKNOWLEDGED_ROW]);

    await failureOf(
      () => newStore().recordAcknowledged(DESIGN_ID, PAIR),
      "database",
    );

    expect(queryDriver.statements).toHaveLength(1);
  });

  it("keeps only a SQLSTATE and a constraint name of a failure", async () => {
    failQueryWith(
      aDriverError("23514", {
        constraint: "design_price_notices_availability_revision_not_negative",
        message: `{"neon:retryable":true} ${SECRET}`,
      }),
    );

    const failure = await failureOf(
      () => newStore().recordAcknowledged(DESIGN_ID, PAIR),
      "database",
    );

    expect(queryDriver.statements).toHaveLength(1);
    expect(failure.cause).toMatchObject({
      code: "23514",
      constraint: "design_price_notices_availability_revision_not_negative",
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
    failQueryWith(aDriverError(code));

    await failureOf(
      () => newStore().recordAcknowledged(DESIGN_ID, PAIR),
      expected,
    );
  });

  it.each([
    ["a design id that is not an id's shape", "not an id", PAIR],
    [
      "a version id that is not an id's shape",
      DESIGN_ID,
      { ...PAIR, versionId: "" },
    ],
    [
      "a revision that is not a revision's shape",
      DESIGN_ID,
      { ...PAIR, availabilityRevision: "01" },
    ],
  ])("sends nothing for %s", async (_name, designId, pair) => {
    await failureOf(
      () => newStore().recordAcknowledged(designId, pair),
      "invalid-request",
    );

    expect(queryDriver.statements).toHaveLength(0);
  });
});
