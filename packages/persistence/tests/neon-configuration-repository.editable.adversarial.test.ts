import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  CURRENT_SCHEMA_VERSION,
  InvalidDesignError,
  KITCHEN_L_DESIGN,
} from "@lemnaria/configurator-domain";
import { NeonDbError } from "@neondatabase/serverless";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DesignWriteForbiddenError,
  NeonConfigurationRepository,
} from "../src/neon-configuration-repository.js";
import type {
  LoadEditableOutcome,
  SaveCredential,
} from "../src/neon-configuration-repository.js";
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
 * A design is readable if and only if a save under the same credential is authorised. A literal pin of the read's text
 * cannot notice the save moving, so the first describe derives the read's predicate from the save's own statement:
 * tightening or loosening either side alone turns it red. The live file shows what the text does to rows.
 */
const DESIGN_ID = "design-under-test";
const WRITE_TOKEN_HASH = "1".repeat(64);
const ACCOUNT_ID = "A".repeat(21);
const TOKEN: SaveCredential = { kind: "write-token", hash: WRITE_TOKEN_HASH };
const ACCOUNT: SaveCredential = { kind: "account", accountId: ACCOUNT_ID };
const ARMS = [
  ["write-token", TOKEN],
  ["account", ACCOUNT],
] as const;
const BACKOFF_LONGER_THAN_EVERY_RETRY_MS = 10_000;
const ATTEMPTS_BEFORE_A_LASTING_FAILURE_REACHES_THE_CALLER = 3;
const VISITOR_FREE_CREDENTIAL_TERMS = {
  "write-token": "write_token_hash = ?",
  account: "account_id = ?",
} as const;

const repository = () =>
  new NeonConfigurationRepository(WELL_FORMED_UNREACHABLE_VALUE);

const storedRow = (overrides: Record<string, unknown> = {}) => ({
  schema_version: CURRENT_SCHEMA_VERSION,
  document: KITCHEN_L_DESIGN,
  revision: "4",
  is_sent: false,
  ...overrides,
});

function normalised(statement: SentQuery | undefined): string {
  return (statement?.text ?? "").replace(/\s+/g, " ").trim();
}

function coldStartRefusal(): NeonDbError {
  return new NeonDbError(
    'Server error (HTTP status 500): {"message":"Couldn\'t connect to compute node","neon:retryable":true}',
  );
}

function emptyReply(): SyntaxError {
  return new SyntaxError("Unexpected end of JSON input");
}

function firstStatement(): SentQuery {
  const [statement] = queryDriver.statements;
  if (!statement) throw new Error("no statement was sent");
  return statement;
}

async function editableStatementFor(
  credential: SaveCredential,
  id: string = DESIGN_ID,
): Promise<SentQuery> {
  resetQueryDriver();
  answerQueryWith([]);
  await repository().loadEditable({ id, credential });
  return firstStatement();
}

async function saveStatementFor(
  credential: SaveCredential,
): Promise<SentQuery> {
  resetQueryDriver();
  answerQueryWith([
    { is_authorised: false, revision: null, owns_visitor: false },
  ]);
  const refusal = await rejectionOf(
    repository().saveAuthorized({
      id: DESIGN_ID,
      design: KITCHEN_L_DESIGN,
      credential,
      expectedRevision: "4",
      requestVisitor: { kind: "absent" },
    }),
  );
  expect(refusal).toBeInstanceOf(DesignWriteForbiddenError);
  return firstStatement();
}

/** What follows `from designs where ` in a read, and what the save's `authorised` CTE holds between its parentheses. */
function readPredicateOf(statement: SentQuery): string {
  const match = /from designs where (.+)$/.exec(normalised(statement));
  if (!match?.[1]) throw new Error(`no predicate in: ${statement.text}`);
  return match[1];
}

function authorisedPredicateOf(statement: SentQuery): string {
  const match =
    /with authorised as \( select 1 from designs where (.+?) \), updated as/.exec(
      normalised(statement),
    );
  if (!match?.[1]) throw new Error(`no authorised CTE in: ${statement.text}`);
  return match[1];
}

beforeEach(() => {
  resetQueryDriver();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  resetQueryDriver();
});

describe("the read's predicate is the save's, read off the save's own statement", () => {
  it.each(ARMS)(
    "the %s arm reads exactly the save's `authorised` predicate, with the same two bound values",
    async (_arm, credential) => {
      const read = await editableStatementFor(credential);
      const save = await saveStatementFor(credential);

      expect(readPredicateOf(read)).toBe(authorisedPredicateOf(save));
      expect(read.values).toEqual(save.values.slice(0, 2));
    },
  );

  it.each(ARMS)(
    "the %s arm's predicate is also the save's `updated` and `landed` predicate, so no write has a wider reader",
    async (_arm, credential) => {
      const predicate = readPredicateOf(await editableStatementFor(credential));
      const save = normalised(await saveStatementFor(credential));

      const updatedAt = save.indexOf(", updated as");
      const landedAt = save.indexOf(", landed as");
      expect(updatedAt).toBeGreaterThan(0);
      expect(landedAt).toBeGreaterThan(updatedAt);
      expect(save.slice(updatedAt, landedAt)).toContain(predicate);
      expect(save.slice(landedAt)).toContain(predicate);
    },
  );

  it.each(ARMS)(
    "the %s arm asks the credential's own column and no other identity column",
    async (arm, credential) => {
      const text = normalised(await editableStatementFor(credential));

      expect(text).toContain(VISITOR_FREE_CREDENTIAL_TERMS[arm]);
      expect(text).not.toMatch(/visitor/);
      const otherColumn =
        arm === "write-token" ? "account_id" : "write_token_hash";
      expect(text).not.toContain(otherColumn);
    },
  );

  it("a claimed design stays readable by its write token: the token arm has no account term, as the save has none", async () => {
    const read = await editableStatementFor(TOKEN);
    const save = await saveStatementFor(TOKEN);

    expect(readPredicateOf(read)).not.toContain("account_id");
    expect(authorisedPredicateOf(save)).not.toContain("account_id");
  });
});

describe("the statement is one read and nothing that can write or lock", () => {
  it.each(ARMS)(
    "the %s arm is a lone select with no lock, no returning, no clock, no CTE and no second statement",
    async (_arm, credential) => {
      const text = normalised(await editableStatementFor(credential));

      expect(text).toMatch(/^select /);
      expect(text).not.toMatch(
        /\b(?:insert|update|delete|set|returning|with|now\(\)|union|nextval)\b|for (?:update|share|no key update)|;/,
      );
      expect(queryDriver.statements).toHaveLength(1);
      expect(queryDriver.transactions).toHaveLength(0);
    },
  );

  it.each(ARMS)(
    "the %s arm selects sent_at only as a boolean, never the instant",
    async (_arm, credential) => {
      const text = normalised(await editableStatementFor(credential));

      expect(text.match(/sent_at/g)).toHaveLength(1);
      expect(text).toContain("(sent_at is not null) as is_sent");
    },
  );

  it.each(ARMS)(
    "the %s arm selects no identity column into the answer: no hash, no account, no mark",
    async (_arm, credential) => {
      const text = normalised(await editableStatementFor(credential));
      const selected = /^select (.+?) from designs/.exec(text)?.[1] ?? "";

      expect(selected).toBe(
        "schema_version, document, revision::text as revision, (sent_at is not null) as is_sent",
      );
    },
  );
});

describe("whatever a caller supplies is a bound value, and the text never depends on it", () => {
  const anyText = fc.oneof(
    fc.string({ maxLength: 40 }),
    fc.string({ unit: "grapheme", maxLength: 20 }),
    fc.string({ unit: "binary", maxLength: 20 }),
    fc.constantFrom(
      "",
      "' or '1'='1",
      "$1",
      "${id}",
      "\\",
      "ünï-çødé 🥬",
      "‮",
      "a".repeat(5_000),
    ),
  );

  propertyTest.prop([anyText, anyText, anyText])(
    "any id, hash and account id: one statement of the same text, the values exactly [id, secret], and none",
    async (id, hash, accountId) => {
      const [tokenText, accountText] = [
        normalised(await editableStatementFor(TOKEN)),
        normalised(await editableStatementFor(ACCOUNT)),
      ];

      const byToken = await editableStatementFor(
        { kind: "write-token", hash },
        id,
      );
      const byAccount = await editableStatementFor(
        { kind: "account", accountId },
        id,
      );

      expect(normalised(byToken)).toBe(tokenText);
      expect(normalised(byAccount)).toBe(accountText);
      expect(byToken.values).toStrictEqual([id, hash]);
      expect(byAccount.values).toStrictEqual([id, accountId]);
    },
  );

  it.each([
    ["a null hash", { kind: "write-token", hash: null }],
    ["an undefined hash", { kind: "write-token", hash: undefined }],
    ["a null account id", { kind: "account", accountId: null }],
    ["an undefined account id", { kind: "account", accountId: undefined }],
  ])(
    "%s is still bound, never dropped from the predicate, and answers none",
    async (_label, credential) => {
      answerQueryWith([]);

      const outcome = await repository().loadEditable({
        id: DESIGN_ID,
        credential: credential as unknown as SaveCredential,
      });

      expect(outcome).toStrictEqual({ kind: "none" });
      expect(firstStatement().text.split("?")).toHaveLength(3);
      expect(firstStatement().values).toHaveLength(2);
    },
  );

  it("a credential of a kind this build does not know is bound to the account arm's column and matches no one", async () => {
    answerQueryWith([]);

    const outcome = await repository().loadEditable({
      id: DESIGN_ID,
      credential: {
        kind: "visitor",
        visitorHash: "2".repeat(64),
      } as unknown as SaveCredential,
    });

    expect(outcome).toStrictEqual({ kind: "none" });
    expect(normalised(firstStatement())).toContain("account_id = ?");
    expect(JSON.stringify(firstStatement().values)).not.toContain("2222");
  });
});

describe("the answer is the one row, shaped exactly", () => {
  it("none carries the kind and nothing else, on both arms", async () => {
    for (const [, credential] of ARMS) {
      answerQueryWith([]);

      const outcome = await repository().loadEditable({
        id: DESIGN_ID,
        credential,
      });

      expect(outcome).toStrictEqual({ kind: "none" });
    }
  });

  it.each(ARMS)(
    "found on the %s arm carries design, revision, isSent and kind, and no column the row held beyond them",
    async (_arm, credential) => {
      answerQueryWith([
        storedRow({
          is_sent: true,
          write_token_hash: WRITE_TOKEN_HASH,
          visitor_hash: "2".repeat(64),
          account_id: ACCOUNT_ID,
          sent_at: "2026-11-08T00:00:00Z",
        }),
      ]);

      const outcome = await repository().loadEditable({
        id: DESIGN_ID,
        credential,
      });

      expect(Object.keys(outcome).sort()).toEqual([
        "design",
        "isSent",
        "kind",
        "revision",
      ]);
      expect(JSON.stringify(outcome)).not.toContain(WRITE_TOKEN_HASH);
      expect(JSON.stringify(outcome)).not.toContain(ACCOUNT_ID);
    },
  );

  it.each(["1", "9007199254740993", "18446744073709551615"])(
    "the revision %s reaches the caller as the same text, never as a number",
    async (revision) => {
      answerQueryWith([storedRow({ revision })]);

      const outcome = await repository().loadEditable({
        id: DESIGN_ID,
        credential: TOKEN,
      });

      expect(outcome).toMatchObject({ kind: "found", revision });
    },
  );

  it("isSent follows the row's column on each reading, not a previous call's", async () => {
    const outcomes: LoadEditableOutcome[] = [];
    for (const isSent of [true, false, true]) {
      answerQueryWith([storedRow({ is_sent: isSent })]);
      outcomes.push(
        await repository().loadEditable({ id: DESIGN_ID, credential: TOKEN }),
      );
    }

    expect(
      outcomes.map((outcome) => outcome.kind === "found" && outcome.isSent),
    ).toEqual([true, false, true]);
  });

  it("is deterministic, and leaves the row the driver gave it as it was", async () => {
    const row = storedRow({ is_sent: true });
    const before = structuredClone(row);
    answerQueryWith([row]);
    answerQueryWith([row]);

    const first = await repository().loadEditable({
      id: DESIGN_ID,
      credential: TOKEN,
    });
    const second = await repository().loadEditable({
      id: DESIGN_ID,
      credential: TOKEN,
    });

    expect(second).toStrictEqual(first);
    expect(row).toStrictEqual(before);
  });
});

describe("a corrupt matched document is the owner's InvalidDesignError, never swallowed and never retried", () => {
  const CORRUPT_ROWS = [
    ["a document that is not a design", { document: { nonsense: true } }],
    ["a null document", { document: null }],
    [
      "a schema version from the future",
      { schema_version: CURRENT_SCHEMA_VERSION + 1 },
    ],
    ["a schema version of zero", { schema_version: 0 }],
    ["a fractional schema version", { schema_version: 1.5 }],
    ["a missing schema version", { schema_version: undefined }],
  ] as const;

  it.each(
    ARMS.flatMap(([arm, credential]) =>
      CORRUPT_ROWS.map(
        ([label, overrides]) => [arm, label, credential, overrides] as const,
      ),
    ),
  )("%s arm, %s", async (_arm, _label, credential, overrides) => {
    answerQueryWith([storedRow(overrides)]);

    const failure = await rejectionOf(
      repository().loadEditable({ id: DESIGN_ID, credential }),
    );

    expect(failure).toBeInstanceOf(InvalidDesignError);
    expect(queryDriver.statements).toHaveLength(1);
  });

  it("an unmatched read of a design that would be corrupt answers none: migrateDesign runs on a match only", async () => {
    for (const [, credential] of ARMS) {
      answerQueryWith([]);

      await expect(
        repository().loadEditable({ id: DESIGN_ID, credential }),
      ).resolves.toStrictEqual({ kind: "none" });
    }
  });
});

describe("retrying a read", () => {
  it.each(ARMS)(
    "the %s arm repeats the very same text and values after an empty reply, and answers with the second reply",
    async (_arm, credential) => {
      failQueryWith(emptyReply());
      answerQueryWith([storedRow({ is_sent: true })]);

      const pending = repository().loadEditable({ id: DESIGN_ID, credential });
      await vi.advanceTimersByTimeAsync(BACKOFF_LONGER_THAN_EVERY_RETRY_MS);

      await expect(pending).resolves.toMatchObject({
        kind: "found",
        isSent: true,
      });
      expect(queryDriver.statements).toHaveLength(2);
      expect(queryDriver.statements[1]).toEqual(queryDriver.statements[0]);
    },
  );

  it.each(ARMS)(
    "the %s arm gives up after three cold-start refusals and the driver's own error reaches the caller",
    async (_arm, credential) => {
      const refusals = [
        coldStartRefusal(),
        coldStartRefusal(),
        coldStartRefusal(),
      ];
      for (const refusal of refusals) failQueryWith(refusal);

      const settled = rejectionOf(
        repository().loadEditable({ id: DESIGN_ID, credential }),
      );
      await vi.advanceTimersByTimeAsync(BACKOFF_LONGER_THAN_EVERY_RETRY_MS);
      const failure = await settled;

      expect(failure).toBe(refusals[2]);
      expect(queryDriver.statements).toHaveLength(
        ATTEMPTS_BEFORE_A_LASTING_FAILURE_REACHES_THE_CALLER,
      );
    },
  );

  it.each([
    ["a plain error", new Error("boom")],
    [
      "a retryable:false payload",
      new NeonDbError(
        'Server error (HTTP status 500): {"message":"no","neon:retryable":false}',
      ),
    ],
    [
      "a Postgres permission refusal",
      Object.assign(new NeonDbError("permission denied"), { code: "42501" }),
    ],
    ["a thrown string", "refused"],
  ])(
    "%s is not retried on either arm: one statement, and the same error reaches the caller",
    async (_label, error) => {
      for (const [, credential] of ARMS) {
        resetQueryDriver();
        failQueryWith(error);

        const failure = await rejectionOf(
          repository().loadEditable({ id: DESIGN_ID, credential }),
        );

        expect(failure).toBe(error);
        expect(queryDriver.statements).toHaveLength(1);
      }
    },
  );
});
