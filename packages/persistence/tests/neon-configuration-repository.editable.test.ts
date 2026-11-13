import {
  CURRENT_SCHEMA_VERSION,
  InvalidDesignError,
  KITCHEN_L_DESIGN,
} from "@lemnaria/configurator-domain";
import { NeonDbError } from "@neondatabase/serverless";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SaveCredential } from "../src/neon-configuration-repository.js";
import { NeonConfigurationRepository } from "../src/neon-configuration-repository.js";
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
 * The text `loadEditable` sends, read as the driver receives it, and what it does with a reply, with no database. What
 * the text does to rows (the parity with `saveAuthorized`, the sent mark, the absence of a write) is the live file's to
 * show (`neon-configuration-repository.editable.live.test.ts`); this file pins the clauses that are conditions: the
 * save's predicate and no visitor term, the sent column read in the same statement, no shape check before sending, a
 * retried read, and `migrateDesign` only on a match.
 */
const DESIGN_ID = "design-under-test";
const WRITE_TOKEN_HASH = "1".repeat(64);
const ACCOUNT_ID = "A".repeat(21);
const TOKEN: SaveCredential = { kind: "write-token", hash: WRITE_TOKEN_HASH };
const ACCOUNT: SaveCredential = { kind: "account", accountId: ACCOUNT_ID };
const BACKOFF_LONGER_THAN_EVERY_RETRY_MS = 10_000;

const storedRow = (isSent: boolean, revision = "4") => ({
  schema_version: CURRENT_SCHEMA_VERSION,
  document: KITCHEN_L_DESIGN,
  revision,
  is_sent: isSent,
});

const repository = () =>
  new NeonConfigurationRepository(WELL_FORMED_UNREACHABLE_VALUE);

function normalised(statement: SentQuery | undefined): string {
  return (statement?.text ?? "").replace(/\s+/g, " ").trim();
}

function coldStartRefusal(): NeonDbError {
  return new NeonDbError(
    'Server error (HTTP status 500): {"message":"Couldn\'t connect to compute node","neon:retryable":true}',
  );
}

beforeEach(() => {
  resetQueryDriver();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  resetQueryDriver();
});

describe("the text loadEditable sends", () => {
  it("reads the write-token arm as the save authorises it, plus the sent column, and names no visitor and no account", async () => {
    answerQueryWith([]);

    await repository().loadEditable({ id: DESIGN_ID, credential: TOKEN });

    expect(queryDriver.statements).toHaveLength(1);
    expect(normalised(queryDriver.statements[0])).toBe(
      "select schema_version, document, revision::text as revision, (sent_at is not null) as is_sent " +
        "from designs where id = ? and write_token_hash = ? " +
        "and hidden_by_client_at is null and deleted_by_client_at is null",
    );
    expect(queryDriver.statements[0]?.values).toEqual([
      DESIGN_ID,
      WRITE_TOKEN_HASH,
    ]);
  });

  it("reads the account arm as the save authorises it, plus the sent column, and names no write token and no visitor", async () => {
    answerQueryWith([]);

    await repository().loadEditable({ id: DESIGN_ID, credential: ACCOUNT });

    expect(queryDriver.statements).toHaveLength(1);
    expect(normalised(queryDriver.statements[0])).toBe(
      "select schema_version, document, revision::text as revision, (sent_at is not null) as is_sent " +
        "from designs where id = ? and account_id = ? " +
        "and hidden_by_client_at is null and deleted_by_client_at is null",
    );
    expect(queryDriver.statements[0]?.values).toEqual([DESIGN_ID, ACCOUNT_ID]);
  });

  it("reads and never writes: one select, no transaction, no insert, update or delete", async () => {
    for (const credential of [TOKEN, ACCOUNT]) {
      resetQueryDriver();
      answerQueryWith([]);

      await repository().loadEditable({ id: DESIGN_ID, credential });

      expect(queryDriver.transactions).toHaveLength(0);
      for (const statement of queryDriver.statements)
        expect(normalised(statement)).toMatch(/^select /);
    }
  });
});

describe("what loadEditable answers", () => {
  it.each([true, false])(
    "returns the design, the revision as text and isSent %s from the one row",
    async (isSent) => {
      answerQueryWith([storedRow(isSent, "12")]);

      const outcome = await repository().loadEditable({
        id: DESIGN_ID,
        credential: TOKEN,
      });

      expect(outcome).toEqual({
        kind: "found",
        design: KITCHEN_L_DESIGN,
        revision: "12",
        isSent,
      });
    },
  );

  it("answers none for a statement that matched no row, on both arms", async () => {
    for (const credential of [TOKEN, ACCOUNT]) {
      answerQueryWith([]);

      await expect(
        repository().loadEditable({ id: DESIGN_ID, credential }),
      ).resolves.toEqual({ kind: "none" });
    }
  });

  it("migrates and so rejects a matched row whose document is not a design, with InvalidDesignError", async () => {
    answerQueryWith([{ ...storedRow(false), document: { nonsense: true } }]);

    const failure = await rejectionOf(
      repository().loadEditable({ id: DESIGN_ID, credential: TOKEN }),
    );

    expect(failure).toBeInstanceOf(InvalidDesignError);
  });
});

describe("a credential of the wrong shape", () => {
  const WRONG_SHAPES = [
    "",
    " ",
    "NULL",
    "' or '1'='1",
    "x'; --",
    "%",
    "a".repeat(10_000),
    "1".repeat(64).toUpperCase(),
  ];

  it.each(
    WRONG_SHAPES.map((shape) => [JSON.stringify(shape.slice(0, 20)), shape]),
  )(
    "is sent as a bound value and answers none, never a throw before sending: %s",
    async (_label, shape) => {
      for (const credential of [
        { kind: "write-token", hash: shape },
        { kind: "account", accountId: shape },
      ] as const) {
        resetQueryDriver();
        answerQueryWith([]);

        await expect(
          repository().loadEditable({ id: shape, credential }),
        ).resolves.toEqual({ kind: "none" });

        expect(queryDriver.statements).toHaveLength(1);
        expect(queryDriver.statements[0]?.values).toContain(shape);
        expect(queryDriver.statements[0]?.text.split("?")).toHaveLength(3);
      }
    },
  );
});

describe("a transient failure", () => {
  it.each([
    ["write-token", TOKEN],
    ["account", ACCOUNT],
  ] as const)(
    "is retried on the %s arm, being a read, and the second reply is the answer",
    async (_arm, credential) => {
      failQueryWith(coldStartRefusal());
      answerQueryWith([storedRow(true)]);

      const pending = repository().loadEditable({
        id: DESIGN_ID,
        credential,
      });
      await vi.advanceTimersByTimeAsync(BACKOFF_LONGER_THAN_EVERY_RETRY_MS);

      await expect(pending).resolves.toEqual({
        kind: "found",
        design: KITCHEN_L_DESIGN,
        revision: "4",
        isSent: true,
      });
      expect(queryDriver.statements).toHaveLength(2);
      expect(normalised(queryDriver.statements[1])).toBe(
        normalised(queryDriver.statements[0]),
      );
    },
  );

  it("does not retry a Postgres refusal, which reaches the caller after one statement", async () => {
    failQueryWith(Object.assign(new NeonDbError("refused"), { code: "42501" }));

    const failure = await rejectionOf(
      repository().loadEditable({ id: DESIGN_ID, credential: TOKEN }),
    );

    expect(failure).toBeInstanceOf(NeonDbError);
    expect(queryDriver.statements).toHaveLength(1);
  });
});
