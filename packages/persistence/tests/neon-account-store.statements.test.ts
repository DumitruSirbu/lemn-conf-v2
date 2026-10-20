import { NeonDbError } from "@neondatabase/serverless";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccountStoreError } from "../src/account-store.js";
import { NeonAccountStore } from "../src/neon-account-store.js";
import { WELL_FORMED_UNREACHABLE_VALUE } from "./support/leaked-connection-markers.js";
import {
  answerQueryWith,
  answerTransactionWith,
  failQueryWith,
  queryDriver,
  resetQueryDriver,
  type SentQuery,
  type SentTransaction,
} from "./support/mocked-neon-query-driver.js";
import { rejectionOf } from "./support/rejection-of.js";

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-query-driver.js")).withMockedQueryDriver(
    await importOriginal<object>(),
  ),
);

/**
 * The statements Lot 2 added to `NeonAccountStore` (profile, signed-in password change, e-mail change), read as the text
 * the driver receives, with no database. The behaviour that matters is in the text: which rows each statement may touch,
 * what a refused one leaves alone, and which instant revokes what.
 */
const ACCOUNT_ID = "A".repeat(21);
const TOKEN_HASH = "c".repeat(64);
const PASSWORD_HASH = `$argon2id$v=19$m=19456,t=2,p=1$${"A".repeat(22)}$${"B".repeat(43)}`;
const NEW_PASSWORD_HASH = `$argon2id$v=19$m=19456,t=2,p=1$${"C".repeat(22)}$${"D".repeat(43)}`;
const EXPIRES_AT = new Date("2030-01-01T00:00:00.000Z");
const REVERT_HASH = "d".repeat(64);
const REVERT_EXPIRES_AT = new Date("2030-01-02T00:00:00.000Z");

function normalised(statement: SentQuery): string {
  return statement.text.replace(/\s+/g, " ").trim().toLowerCase();
}

function newStore(): NeonAccountStore {
  return new NeonAccountStore(WELL_FORMED_UNREACHABLE_VALUE);
}

async function loneStatementOf(
  call: () => Promise<unknown>,
  reply: unknown,
): Promise<SentQuery> {
  resetQueryDriver();
  answerQueryWith(reply);
  await call();
  const [statement, ...others] = queryDriver.statements;
  if (
    statement === undefined ||
    others.length > 0 ||
    queryDriver.transactions.length > 0
  ) {
    throw new Error("the call did not send exactly one lone statement");
  }
  return statement;
}

async function transactionOf(
  call: () => Promise<unknown>,
  results: readonly unknown[],
): Promise<SentTransaction> {
  resetQueryDriver();
  answerTransactionWith(results);
  await call();
  const [transaction, ...others] = queryDriver.transactions;
  if (
    transaction === undefined ||
    others.length > 0 ||
    queryDriver.statements.length > 0
  ) {
    throw new Error("the call did not send exactly one transaction");
  }
  return transaction;
}

function statementsOf(transaction: SentTransaction): string[] {
  return transaction.statements.map(normalised);
}

const changePassword = () =>
  newStore().changePassword({
    accountId: ACCOUNT_ID,
    expectedPasswordHash: PASSWORD_HASH,
    passwordHash: NEW_PASSWORD_HASH,
  });
const confirmEmailChange = () =>
  newStore().confirmEmailChange({
    tokenHash: TOKEN_HASH,
    revertTokenHash: REVERT_HASH,
    revertExpiresAt: REVERT_EXPIRES_AT,
  });
const DONE = [{ is_done: true }];

const CONFIRM_ANSWERED = [
  {
    is_done: true,
    account_id: ACCOUNT_ID,
    previous_email: "old@example.md",
    previous_locale: "ro",
  },
];

/** The confirmation's transaction as the statements after its lock send it: the lock statement is read by its own
 *  test, so that every other claim names the consuming statement as the first. */
async function confirmTransactionOf(): Promise<SentTransaction> {
  const transaction = await transactionOf(confirmEmailChange, [
    [],
    CONFIRM_ANSWERED,
    [],
  ]);
  return { ...transaction, statements: transaction.statements.slice(1) };
}

/** The one predicate every statement that could give an address away asks, in the snapshot of its own statement. */
const LIVE_RESERVATION_ROW =
  "reservation.purpose = ? and reservation.used_at is null and reservation.expires_at > now() and reservation.new_email_normal_form = ?";
const RESERVED_BY_ANOTHER_ACCOUNT =
  "not exists ( select 1 from account_email_tokens reservation where reservation.purpose = ? and reservation.used_at is null and reservation.expires_at > now() and reservation.new_email_normal_form = t.new_email_normal_form and reservation.account_id <> t.account_id )";

beforeEach(resetQueryDriver);
afterEach(resetQueryDriver);

describe("findProfile and updateProfile", () => {
  it("reads the three profile columns and nothing else of the row, by the account's id", async () => {
    const statement = await loneStatementOf(
      () => newStore().findProfile(ACCOUNT_ID),
      [{ name: null, address: null, phone: null }],
    );

    expect(normalised(statement)).toBe(
      "select a.name, a.address, a.phone from accounts a where a.id = ?",
    );
    expect(statement.values).toEqual([ACCOUNT_ID]);
  });

  describe("updateProfile writes the four profile columns and updated_at, by the account's id, and nothing else", () => {
    async function updateStatementFor(
      changes: Parameters<NeonAccountStore["updateProfile"]>[0]["changes"],
    ) {
      return loneStatementOf(
        () => newStore().updateProfile({ accountId: ACCOUNT_ID, changes }),
        [{ id: ACCOUNT_ID }],
      );
    }

    it("sets each column only when its flag is true, otherwise to itself", async () => {
      const statement = await updateStatementFor({ name: "Ana" });
      const text = normalised(statement);

      expect(text).toContain(
        "set name = case when ?::boolean then ?::text else name end",
      );
      expect(text).toContain(
        "address = case when ?::boolean then ?::text else address end",
      );
      expect(text).toContain(
        "phone = case when ?::boolean then ?::text else phone end",
      );
      expect(text).toContain(
        "phone_normal_form = case when ?::boolean then ?::text else phone_normal_form end",
      );
      expect(text).toMatch(/updated_at = now\(\) where id = \? returning id$/);
    });

    it("assigns exactly name, address, phone, phone_normal_form and updated_at", async () => {
      const text = normalised(await updateStatementFor({ name: "Ana" }));
      const assigned = [...text.matchAll(/(?:\bset |, )([a-z_]+) = /g)].map(
        (match) => match[1],
      );

      expect(assigned).toEqual([
        "name",
        "address",
        "phone",
        "phone_normal_form",
        "updated_at",
      ]);
    });

    it("an absent member is flagged false and bound as null: the column keeps its value", async () => {
      const statement = await updateStatementFor({ name: "Ana" });

      expect(statement.values).toEqual([
        true,
        "Ana",
        false,
        null,
        false,
        null,
        false,
        null,
        ACCOUNT_ID,
      ]);
    });

    it("an empty text is flagged true and bound as null: the column is cleared", async () => {
      const statement = await updateStatementFor({ name: "", address: "" });

      expect(statement.values).toEqual([
        true,
        null,
        true,
        null,
        false,
        null,
        false,
        null,
        ACCOUNT_ID,
      ]);
    });

    it("the phone pair is flagged together: set, or cleared", async () => {
      const set = await updateStatementFor({
        phone: { phone: "079 123 456", phoneNormalForm: "+37379123456" },
      });
      const cleared = await updateStatementFor({
        phone: { phone: null, phoneNormalForm: null },
      });

      expect(set.values).toEqual([
        false,
        null,
        false,
        null,
        true,
        "079 123 456",
        true,
        "+37379123456",
        ACCOUNT_ID,
      ]);
      expect(cleared.values).toEqual([
        false,
        null,
        false,
        null,
        true,
        null,
        true,
        null,
        ACCOUNT_ID,
      ]);
    });

    it("never names the address, the password, the role or the verification", async () => {
      const text = normalised(await updateStatementFor({ name: "Ana" }));
      const words = new Set(text.match(/[a-z_][a-z0-9_]*/g));

      for (const column of [
        "email",
        "email_normal_form",
        "password_hash",
        "role",
        "email_verified_at",
        "password_changed_at",
      ]) {
        expect(words.has(column)).toBe(false);
      }
    });

    it("answers none when the account is not there", async () => {
      resetQueryDriver();
      answerQueryWith([]);

      expect(
        await newStore().updateProfile({
          accountId: ACCOUNT_ID,
          changes: { name: "Ana" },
        }),
      ).toEqual({ kind: "none" });
    });
  });
});

describe("changePassword: three statements in one ReadCommitted transaction", () => {
  it("compare-and-sets the hash, then revokes the sessions, then retires the tokens, in that order", async () => {
    const transaction = await transactionOf(changePassword, [DONE, [], []]);
    const [change, revoke, retire] = statementsOf(transaction);

    expect(transaction.options).toEqual({ isolationLevel: "ReadCommitted" });
    expect(transaction.statements).toHaveLength(3);
    expect(change).toMatch(/^with changed as \( update accounts set /);
    expect(revoke).toMatch(/^update account_sessions set revoked_at = now\(\)/);
    expect(retire).toMatch(
      /^update account_email_tokens set used_at = now\(\)/,
    );
  });

  it("the first statement replaces the hash only while it is the expected one, and stamps the change with the wall clock", async () => {
    const [change] = statementsOf(
      await transactionOf(changePassword, [DONE, [], []]),
    );

    expect(change).toContain(
      "set password_hash = ?, password_changed_at = clock_timestamp(), updated_at = now() where id = ? and password_hash = ? returning id",
    );
    expect(change).not.toMatch(/password_changed_at = now\(\)/);
  });

  it("the first statement answers done on a retry for an account already holding the new hash, and never on a first attempt", async () => {
    const transaction = await transactionOf(changePassword, [DONE, [], []]);
    const [change] = transaction.statements;

    expect(normalised(change ?? { text: "", values: [] })).toContain(
      "or ( ?::boolean and exists ( select 1 from accounts where id = ? and password_hash = ? ) ) ) as is_done",
    );
    expect(change?.values).toEqual([
      NEW_PASSWORD_HASH,
      ACCOUNT_ID,
      PASSWORD_HASH,
      false,
      ACCOUNT_ID,
      NEW_PASSWORD_HASH,
    ]);
  });

  it("revokes only the account's unrevoked sessions, and only when this transaction changed the hash (updated_at = now())", async () => {
    const [, revoke] = statementsOf(
      await transactionOf(changePassword, [DONE, [], []]),
    );

    expect(revoke).toBe(
      "update account_sessions set revoked_at = now() where revoked_at is null and account_id = ? and exists ( select 1 from accounts a where a.id = ? and a.password_hash = ? and a.updated_at = now() )",
    );
  });

  it("retires every unused token of the account of any purpose, under the same condition, and no other account's", async () => {
    const [, , retire] = statementsOf(
      await transactionOf(changePassword, [DONE, [], []]),
    );

    expect(retire).toBe(
      "update account_email_tokens set used_at = now() where used_at is null and purpose <> ? and account_id = ? and exists ( select 1 from accounts a where a.id = ? and a.password_hash = ? and a.updated_at = now() )",
    );
  });

  it("spares the undo link of an address change: the retire excludes the email-change-revert purpose, bound and not inlined", async () => {
    const transaction = await transactionOf(changePassword, [DONE, [], []]);
    const [, , retire] = transaction.statements;

    expect(retire?.values[0]).toBe("email-change-revert");
    expect(normalised(retire ?? { text: "", values: [] })).not.toContain(
      "email-change-revert",
    );
  });

  it("binds the new hash and the account in the revoke and the retire, never the expected one", async () => {
    const transaction = await transactionOf(changePassword, [DONE, [], []]);
    const [, revoke, retire] = transaction.statements;

    expect(revoke?.values).toEqual([ACCOUNT_ID, ACCOUNT_ID, NEW_PASSWORD_HASH]);
    expect(retire?.values).toEqual([
      "email-change-revert",
      ACCOUNT_ID,
      ACCOUNT_ID,
      NEW_PASSWORD_HASH,
    ]);
  });

  it("answers changed when the first statement is done, and stale when it is not", async () => {
    resetQueryDriver();
    answerTransactionWith([DONE, [], []]);
    expect(await changePassword()).toEqual({ kind: "changed" });

    resetQueryDriver();
    answerTransactionWith([[{ is_done: false }], [], []]);
    expect(await changePassword()).toEqual({ kind: "stale" });
  });

  it.each([
    ["no row", [[], [], []]],
    ["two rows", [[{ is_done: true }, { is_done: true }], [], []]],
    ["a flag that is text", [[{ is_done: "t" }], [], []]],
  ])("is the store error for %s", async (_label, results) => {
    resetQueryDriver();
    answerTransactionWith(results);

    const failure = await rejectionOf(changePassword());

    expect(failure).toBeInstanceOf(AccountStoreError);
    expect((failure as AccountStoreError).operation).toBe("change a password");
  });

  it("sends nothing for a hash that is not argon2id", async () => {
    resetQueryDriver();

    await expect(
      newStore().changePassword({
        accountId: ACCOUNT_ID,
        expectedPasswordHash: PASSWORD_HASH,
        passwordHash: "plain",
      }),
    ).rejects.toThrow();

    expect(queryDriver.transactions).toEqual([]);
  });
});

describe("confirmEmailChange: three statements in one ReadCommitted transaction", () => {
  const CONFIRMED = [
    {
      is_done: true,
      account_id: ACCOUNT_ID,
      previous_email: "old@example.md",
      previous_locale: "ro",
    },
  ];

  it("locks the account row, then consumes the token and changes the address, then revokes the sessions", async () => {
    const transaction = await transactionOf(confirmEmailChange, [
      [],
      CONFIRMED,
      [],
    ]);
    const [lock, consume, revoke] = statementsOf(transaction);

    expect(transaction.options).toEqual({ isolationLevel: "ReadCommitted" });
    expect(transaction.statements).toHaveLength(3);
    expect(lock).toMatch(/^select a\.id from accounts a where/);
    expect(consume).toMatch(/^with locked as \(/);
    expect(revoke).toMatch(/^update account_sessions set revoked_at = now\(\)/);
  });

  // Serial mock driver: the interleaving cannot be run here. A statement reads the snapshot taken when it starts, before
  // it waits on a row lock, so the sweep of the account's other tokens (`superseded`) must not share a statement with the
  // lock. A reset token that `issueToken` committed while this transaction waited would be missing from that snapshot and
  // would survive the sweep, mailed to the address being left. The lock is therefore a statement of its own, and the
  // statement after it takes its snapshot once the lock is held.
  it("takes the account row lock in a statement of its own, bound to the token's hash and the e-mail-change purpose, and holds it to the commit", async () => {
    const transaction = await transactionOf(confirmEmailChange, [
      [],
      CONFIRMED,
      [],
    ]);
    const [lock] = statementsOf(transaction);

    expect(lock).toBe(
      "select a.id from accounts a where a.id in ( select t.account_id from account_email_tokens t where t.token_hash = ? and t.purpose = ? ) for update",
    );
    expect(transaction.statements[0]?.values).toEqual([
      TOKEN_HASH,
      "email-change",
    ]);
  });

  it("does not sweep in the statement that locks: the sweep is in a later statement than the lock", async () => {
    const [lock, consume] = statementsOf(
      await transactionOf(confirmEmailChange, [[], CONFIRMED, []]),
    );

    expect(lock).not.toContain("superseded");
    expect(lock).not.toContain("update account_email_tokens");
    expect(consume).toContain("superseded as ( update account_email_tokens s");
  });

  it("locks the token's account row again in the consuming statement, for the update it makes (no wait: it is held)", async () => {
    const [consume] = statementsOf(await confirmTransactionOf());

    expect(consume).toContain(
      "from accounts a where a.id in (select t.account_id from account_email_tokens t where t.token_hash = ?) for update )",
    );
  });

  describe("the token is consumed only under every rule at once", () => {
    const RULES = [
      ["its purpose is email-change", "t.purpose = ?"],
      ["it is unused", "t.used_at is null"],
      ["it is unexpired by the database's clock", "t.expires_at > now()"],
      [
        "it carries an address",
        "t.new_email is not null and t.new_email_normal_form is not null",
      ],
      ["the account is verified", "l.email_verified_at is not null"],
      [
        "it was issued no earlier than the account's last password change",
        "t.created_at >= l.password_changed_at",
      ],
      [
        "it is the newest unused token of its account and purpose",
        "not exists ( select 1 from account_email_tokens newer where newer.account_id = t.account_id and newer.purpose = t.purpose and newer.used_at is null and (newer.created_at, newer.token_hash) > (t.created_at, t.token_hash) )",
      ],
      [
        "no other account holds the new address",
        "not exists ( select 1 from accounts holder where holder.email_normal_form = t.new_email_normal_form and holder.id <> t.account_id )",
      ],
      [
        "no other account's live undo link reserves the new address (the account's own does not)",
        RESERVED_BY_ANOTHER_ACCOUNT,
      ],
    ] as const;

    it.each(RULES)("%s", async (_label, predicate) => {
      const [consume] = statementsOf(await confirmTransactionOf());

      expect(consume).toContain(predicate);
    });

    it("and the token is found by its hash and tied to the locked account", async () => {
      const [consume] = statementsOf(await confirmTransactionOf());

      expect(consume).toContain(
        "where t.token_hash = ? and t.account_id = l.id",
      );
    });
  });

  it("retires every other unused token of the account, of any purpose but email-change-revert (an earlier undo link survives)", async () => {
    const [consume] = statementsOf(await confirmTransactionOf());

    expect(consume).toContain(
      "superseded as ( update account_email_tokens s set used_at = now() where s.account_id in (select account_id from consumed) and s.used_at is null and s.token_hash <> ? and s.purpose <> ? returning s.token_hash )",
    );
  });

  describe("the undo link row", () => {
    it("is inserted from the consumed token, not from the locked account, so a refused confirmation writes none", async () => {
      const [consume] = statementsOf(await confirmTransactionOf());

      expect(consume).toContain(
        "reverted as ( insert into account_email_tokens ( token_hash, account_id, purpose, expires_at, new_email, new_email_normal_form ) select ?, c.account_id, ?, ?::timestamptz, l.email, l.email_normal_form from consumed c join locked l on l.id = c.account_id returning token_hash )",
      );
    });

    it("holds the address being left, read from the locked row before the change, never a bound value", async () => {
      const transaction = await confirmTransactionOf();
      const [consume] = statementsOf(transaction);

      expect(consume).toContain("l.email, l.email_normal_form from consumed c");
      expect(consume).toContain(
        "select a.id, a.email, a.email_normal_form, a.locale, a.email_verified_at, a.password_changed_at from accounts a",
      );
      expect(
        transaction.statements[0]?.values.filter(
          (value) => typeof value === "string" && value.includes("@"),
        ),
      ).toEqual([]);
    });

    it("is the caller's hash, the revert purpose and the caller's expiry, as bound values", async () => {
      const transaction = await confirmTransactionOf();

      expect(transaction.statements[0]?.values).toEqual([
        TOKEN_HASH,
        TOKEN_HASH,
        "email-change",
        "email-change-revert",
        TOKEN_HASH,
        "email-change-revert",
        REVERT_HASH,
        "email-change-revert",
        REVERT_EXPIRES_AT.toISOString(),
        false,
        REVERT_HASH,
        "email-change-revert",
        false,
        TOKEN_HASH,
        "email-change",
        TOKEN_HASH,
      ]);
    });

    it("is written without `on conflict`, so a revert hash already held fails the transaction instead of a silent no-op", async () => {
      const [consume] = statementsOf(await confirmTransactionOf());

      expect(consume).not.toContain("on conflict");
    });

    it.each([
      ["a revert hash of the wrong shape", { revertTokenHash: "short" }],
      ["an invalid revert expiry", { revertExpiresAt: new Date(Number.NaN) }],
    ])("sends nothing for %s", async (_label, override) => {
      resetQueryDriver();

      await expect(
        newStore().confirmEmailChange({
          tokenHash: TOKEN_HASH,
          revertTokenHash: REVERT_HASH,
          revertExpiresAt: REVERT_EXPIRES_AT,
          ...override,
        }),
      ).rejects.toThrow();

      expect(queryDriver.transactions).toEqual([]);
    });
  });

  it("writes the address and its normal form from the token's row, never from the request", async () => {
    const transaction = await confirmTransactionOf();
    const [consume] = statementsOf(transaction);

    expect(consume).toContain(
      "changed as ( update accounts a set email = c.new_email, email_normal_form = c.new_email_normal_form, updated_at = now() from consumed c where a.id = c.account_id returning a.id )",
    );
    expect(
      transaction.statements[0]?.values.filter(
        (value) => typeof value === "string" && value.includes("@"),
      ),
    ).toEqual([]);
  });

  it("takes the old address and language from the locked row, and only for a token this transaction consumed", async () => {
    const [consume] = statementsOf(await confirmTransactionOf());

    expect(consume).toContain(
      "previous_address as ( select l.email, l.locale from locked l where exists (select 1 from consumed) union all",
    );
    expect(consume).toContain(
      "(select p.email from previous_address p) as previous_email, (select p.locale from previous_address p) as previous_locale",
    );
  });

  it("on a retry, reads the old address back from the revert row of this call's hash, for the same account, and only when nothing was consumed", async () => {
    const [consume] = statementsOf(await confirmTransactionOf());

    expect(consume).toContain(
      "union all select r.new_email, l.locale from account_email_tokens r join locked l on l.id = r.account_id where ?::boolean and r.token_hash = ? and r.purpose = ? and not exists (select 1 from consumed) )",
    );
  });

  it("the retry arm answers done only for a used token whose account already holds its new address, and never on a first attempt", async () => {
    const transaction = await confirmTransactionOf();
    const [consume] = transaction.statements;

    expect(normalised(consume ?? { text: "", values: [] })).toContain(
      "or ( ?::boolean and exists ( select 1 from account_email_tokens t join accounts a on a.id = t.account_id where t.token_hash = ? and t.purpose = ? and t.used_at is not null and a.email_normal_form = t.new_email_normal_form ) )",
    );
    expect(consume?.values).toContain(false);
  });

  it("the second statement revokes only the sessions of an account whose e-mail-change token this transaction used (used_at = now())", async () => {
    const transaction = await confirmTransactionOf();
    const [, revoke] = statementsOf(transaction);

    expect(revoke).toBe(
      "update account_sessions set revoked_at = now() where revoked_at is null and account_id in ( select t.account_id from account_email_tokens t where t.token_hash = ? and t.purpose = ? and t.used_at = now() ) returning token_hash",
    );
    expect(transaction.statements[1]?.values).toEqual([
      TOKEN_HASH,
      "email-change",
    ]);
  });

  it("answers changed with the old address and language the locked row held", async () => {
    resetQueryDriver();
    answerTransactionWith([[], CONFIRMED, []]);

    expect(await confirmEmailChange()).toEqual({
      kind: "changed",
      accountId: ACCOUNT_ID,
      previous: { email: "old@example.md", locale: "ro" },
    });
  });

  it("answers changed with no previous address for a retry whose first attempt already replaced it", async () => {
    resetQueryDriver();
    answerTransactionWith([
      [],
      [
        {
          is_done: true,
          account_id: ACCOUNT_ID,
          previous_email: null,
          previous_locale: null,
        },
      ],
      [],
    ]);

    expect(await confirmEmailChange()).toEqual({
      kind: "changed",
      accountId: ACCOUNT_ID,
      previous: undefined,
    });
  });

  it("answers invalid for a token the statement did not consume", async () => {
    resetQueryDriver();
    answerTransactionWith([
      [],
      [
        {
          is_done: false,
          account_id: null,
          previous_email: null,
          previous_locale: null,
        },
      ],
      [],
    ]);

    expect(await confirmEmailChange()).toEqual({ kind: "invalid" });
  });

  describe("a new address another account took after the snapshot", () => {
    function uniqueViolation(
      constraint: string | undefined,
      code = "23505",
    ): NeonDbError {
      return Object.assign(
        new NeonDbError("duplicate key value violates unique constraint"),
        { code, constraint },
      );
    }

    it("is invalid, the same as for an expired link, never a server error", async () => {
      resetQueryDriver();
      failQueryWith(uniqueViolation("accounts_email_normal_form_is_unique"));

      expect(await confirmEmailChange()).toEqual({ kind: "invalid" });
    });

    it.each([
      ["another constraint", uniqueViolation("accounts_pkey")],
      [
        "another violation code",
        uniqueViolation("accounts_email_normal_form_is_unique", "23503"),
      ],
      ["no constraint named", uniqueViolation(undefined)],
    ])("is the store error for %s", async (_label, failure) => {
      resetQueryDriver();
      failQueryWith(failure);

      const rejection = await rejectionOf(confirmEmailChange());

      expect(rejection).toBeInstanceOf(AccountStoreError);
      expect((rejection as AccountStoreError).operation).toBe(
        "change an e-mail address",
      );
    });
  });

  it("sends nothing for a token hash of the wrong shape", async () => {
    resetQueryDriver();

    await expect(
      newStore().confirmEmailChange({
        tokenHash: "short",
        revertTokenHash: REVERT_HASH,
        revertExpiresAt: REVERT_EXPIRES_AT,
      }),
    ).rejects.toThrow();

    expect(queryDriver.transactions).toEqual([]);
  });
});

describe("issueEmailChangeToken and retireEmailChangeTokens", () => {
  const issue = () =>
    newStore().issueEmailChangeToken({
      accountId: ACCOUNT_ID,
      verifiedPasswordHash: PASSWORD_HASH,
      newEmail: "New@Example.md",
      newEmailNormalForm: "new@example.md",
      tokenHash: TOKEN_HASH,
      expiresAt: EXPIRES_AT,
    });

  it("inserts from a select of a verified account that still holds the hash the caller verified", async () => {
    const statement = await loneStatementOf(issue, [
      { token_hash: TOKEN_HASH },
    ]);
    const text = normalised(statement);

    expect(text).toContain(
      "where a.id = ? and a.email_verified_at is not null and a.password_hash = ?",
    );
    expect(text).toContain(
      "insert into account_email_tokens ( token_hash, account_id, purpose, expires_at, new_email, new_email_normal_form )",
    );
    expect(text).toContain("on conflict (token_hash) do nothing");
    expect(statement.values).toEqual([
      TOKEN_HASH,
      "email-change",
      EXPIRES_AT.toISOString(),
      "New@Example.md",
      "new@example.md",
      ACCOUNT_ID,
      PASSWORD_HASH,
      TOKEN_HASH,
      ACCOUNT_ID,
      "email-change",
    ]);
  });

  // Serial mock driver: the revert holding the row cannot be interleaved here, so the lock clause is asserted in the
  // text, where it must sit between the predicate it re-checks and the insert it guards.
  it("locks the account row for share, after the hash predicate it re-checks and before the insert's conflict clause, so a revert in flight is waited for", async () => {
    const text = normalised(
      await loneStatementOf(issue, [{ token_hash: TOKEN_HASH }]),
    );

    expect(text).toContain(
      "and a.password_hash = ? for share of a on conflict (token_hash) do nothing",
    );
  });

  it("finds a row its own earlier attempt inserted only under the same account and the e-mail-change purpose", async () => {
    const text = normalised(
      await loneStatementOf(issue, [{ token_hash: TOKEN_HASH }]),
    );

    expect(text).toMatch(
      /union select token_hash from account_email_tokens where token_hash = \? and account_id = \? and purpose = \?$/,
    );
  });

  it("answers refused when nothing was inserted or found", async () => {
    resetQueryDriver();
    answerQueryWith([]);

    expect(await issue()).toEqual({ kind: "refused" });
  });

  it("retires the account's unused e-mail-change tokens only: by account, by purpose, by unused", async () => {
    const statement = await loneStatementOf(
      () => newStore().retireEmailChangeTokens(ACCOUNT_ID),
      [],
    );

    expect(normalised(statement)).toBe(
      "update account_email_tokens set used_at = now() where account_id = ? and purpose = ? and used_at is null returning token_hash",
    );
    expect(statement.values).toEqual([ACCOUNT_ID, "email-change"]);
  });
});

describe("the other token-retiring statement Lot 2 changed", () => {
  it("completeReset retires every other unused token of the account of any purpose, in the consuming statement", async () => {
    resetQueryDriver();
    answerTransactionWith([[{ is_done: true }], []]);

    await newStore().completeReset({
      tokenHash: TOKEN_HASH,
      passwordHash: NEW_PASSWORD_HASH,
    });

    const [consume] = statementsOf(
      queryDriver.transactions[0] ?? { statements: [], options: undefined },
    );
    expect(consume).toMatch(
      /update account_email_tokens s set used_at = now\(\) where s\.account_id in \(select account_id from consumed\) and s\.used_at is null/,
    );
    expect(consume).toMatch(
      /and s\.token_hash <> \? and s\.purpose <> \? returning s\.token_hash/,
    );
  });

  it("completeReset spares the undo link of an address change: the retire excludes email-change-revert, bound", async () => {
    resetQueryDriver();
    answerTransactionWith([[{ is_done: true }], []]);

    await newStore().completeReset({
      tokenHash: TOKEN_HASH,
      passwordHash: NEW_PASSWORD_HASH,
    });

    const [consume] = queryDriver.transactions[0]?.statements ?? [];
    expect(consume?.values).toContain("email-change-revert");
    expect(normalised(consume ?? { text: "", values: [] })).not.toContain(
      "email-change-revert",
    );
  });

  it("completeReset consumes only a token issued no earlier than the account's last password change, inside the verified-account test", async () => {
    resetQueryDriver();
    answerTransactionWith([[{ is_done: true }], []]);

    await newStore().completeReset({
      tokenHash: TOKEN_HASH,
      passwordHash: NEW_PASSWORD_HASH,
    });

    const [consume] = statementsOf(
      queryDriver.transactions[0] ?? { statements: [], options: undefined },
    );
    expect(consume).toContain(
      "and exists ( select 1 from accounts a where a.id = t.account_id and a.email_verified_at is not null and t.created_at >= a.password_changed_at )",
    );
  });

  it("completeReset stamps password_changed_at with the wall clock, as changePassword does, not the transaction's now()", async () => {
    resetQueryDriver();
    answerTransactionWith([[{ is_done: true }], []]);

    await newStore().completeReset({
      tokenHash: TOKEN_HASH,
      passwordHash: NEW_PASSWORD_HASH,
    });

    const [consume] = statementsOf(
      queryDriver.transactions[0] ?? { statements: [], options: undefined },
    );
    expect(consume).toContain(
      "set password_hash = ?, password_changed_at = clock_timestamp(), updated_at = now()",
    );
  });
});

describe("createUnverified: one statement, the address refused when held or reserved", () => {
  const NORMAL_FORM = "new@example.md";
  const create = () =>
    newStore().createUnverified({
      email: "New@Example.md",
      emailNormalForm: NORMAL_FORM,
      phone: undefined,
      locale: "ro",
      privacyNoticeVersion: "v1",
      passwordHash: PASSWORD_HASH,
    });
  const CREATED = [{ account_id: ACCOUNT_ID, is_reserved: false }];
  const TAKEN = [{ account_id: null, is_reserved: false }];
  const RESERVED = [{ account_id: null, is_reserved: true }];

  it("is one lone statement, not a transaction: the count of statements a registration costs does not change", async () => {
    const statement = await loneStatementOf(create, CREATED);

    expect(statement.text).toContain("inserted as (");
  });

  it("reads the reservation once, in a materialized CTE, and no other part of the statement touches the token table", async () => {
    const text = normalised(await loneStatementOf(create, CREATED));

    expect(text).toMatch(
      /^with reservation as materialized \( select exists \( select 1 from account_email_tokens r where r\.purpose = \? and r\.used_at is null and r\.expires_at > now\(\) and r\.new_email_normal_form = \? \) as is_live \), inserted as \(/,
    );
    expect(text.match(/account_email_tokens/g)).toHaveLength(1);
    expect(text.match(/from reservation/g)).toHaveLength(2);
  });

  it("inserts from a select that holds both predicates in the statement's one snapshot: no holder, no live undo row", async () => {
    const text = normalised(await loneStatementOf(create, CREATED));

    expect(text).toContain(
      "where not exists ( select 1 from accounts holder where holder.email_normal_form = ? ) and not (select is_live from reservation) on conflict do nothing returning id",
    );
    expect(text).not.toContain("values (");
  });

  it("keeps on conflict do nothing as the backstop, and never on conflict do update", async () => {
    const text = normalised(await loneStatementOf(create, CREATED));

    expect(text).toContain("on conflict do nothing");
    expect(text).not.toContain("do update");
  });

  it("answers reserved only for an address no account holds and a live undo row names", async () => {
    const text = normalised(await loneStatementOf(create, CREATED));

    expect(text).toContain(
      "( not exists (select 1 from accounts holder where holder.email_normal_form = ?) and (select is_live from reservation) ) as is_reserved",
    );
  });

  it("binds the undo purpose once and the address, never an address in the text", async () => {
    const statement = await loneStatementOf(create, CREATED);

    expect(
      statement.values.filter((value) => value === "email-change-revert"),
    ).toHaveLength(1);
    expect(statement.text).not.toContain(NORMAL_FORM);
  });

  it("answers created for this call's own id, which is the row's id for a retry whose first attempt landed", async () => {
    resetQueryDriver();
    answerQueryWith(CREATED);

    const creation = await create();

    expect(creation.kind).toBe("created");
    expect(creation).toEqual({
      kind: "created",
      accountId: expect.stringMatching(/^[A-Za-z0-9_-]{21}$/) as string,
    });
  });

  it("answers address-taken when nothing was inserted and no undo row reserves the address", async () => {
    resetQueryDriver();
    answerQueryWith(TAKEN);

    expect(await create()).toEqual({ kind: "address-taken" });
  });

  it("answers address-reserved, and not created, when nothing was inserted and the address is reserved", async () => {
    resetQueryDriver();
    answerQueryWith(RESERVED);

    expect(await create()).toEqual({ kind: "address-reserved" });
  });

  it("answers created over reserved when the row is there: a retry's own landed row is never reported as refused", async () => {
    resetQueryDriver();
    answerQueryWith([{ account_id: ACCOUNT_ID, is_reserved: true }]);

    expect((await create()).kind).toBe("created");
  });

  it.each([
    ["no row", []],
    ["two rows", [...CREATED, ...CREATED]],
    ["an id that is not text", [{ account_id: 7, is_reserved: false }]],
    [
      "a reserved flag that is not a boolean",
      [{ account_id: null, is_reserved: "yes" }],
    ],
  ])("is the store error for %s", async (_label, reply) => {
    resetQueryDriver();
    answerQueryWith(reply);

    const rejection = await rejectionOf(create());

    expect(rejection).toBeInstanceOf(AccountStoreError);
    expect((rejection as AccountStoreError).operation).toBe(
      "create an account",
    );
  });
});

describe("revertEmailChange: three statements in one ReadCommitted transaction", () => {
  const REVERTED = [
    {
      is_done: true,
      account_id: ACCOUNT_ID,
      restored_email: "old@example.md",
      restored_locale: "ro",
      left_email: "left@example.md",
    },
  ];
  const revert = () =>
    newStore().revertEmailChange({
      tokenHash: TOKEN_HASH,
      passwordHash: NEW_PASSWORD_HASH,
    });
  const lockOf = async () =>
    statementsOf(await transactionOf(revert, [[], REVERTED, []]))[0] ?? "";
  const consumeOf = async () =>
    statementsOf(await transactionOf(revert, [[], REVERTED, []]))[1] ?? "";

  it("locks the account, then consumes the undo link and restores the address, then revokes the sessions", async () => {
    const transaction = await transactionOf(revert, [[], REVERTED, []]);
    const [lock, consume, revoke] = statementsOf(transaction);

    expect(transaction.options).toEqual({ isolationLevel: "ReadCommitted" });
    expect(transaction.statements).toHaveLength(3);
    expect(lock).toMatch(/^select a\.id from accounts a where /);
    expect(consume).toMatch(/^with locked as \(/);
    expect(revoke).toMatch(/^update account_sessions set revoked_at = now\(\)/);
  });

  // The mock driver and the fake are serial: neither can commit a second transaction while the first waits on a row
  // lock, so the interleaving below cannot be run here, only its precondition asserted. A statement reads the snapshot
  // taken when it starts, and the lock wait happens inside it; the oldest-wins sweep sees an undo link a concurrent
  // confirm committed during that wait only if it starts after the wait is over, that is, in a later statement.
  describe("oldest wins against a confirm that commits while the revert waits for the account row", () => {
    it("takes the account row lock in a statement of its own, which does nothing else", async () => {
      expect(await lockOf()).toBe(
        "select a.id from accounts a where a.id in ( select t.account_id from account_email_tokens t where t.token_hash = ? and t.purpose = ? ) for update",
      );
    });

    it("sweeps the later undo links in a later statement than the one that locks, and locks once, first", async () => {
      const statements = statementsOf(
        await transactionOf(revert, [[], REVERTED, []]),
      );

      const lockPositions = statements.flatMap((text, position) =>
        text.startsWith("select a.id from accounts a") ? [position] : [],
      );
      const sweepPosition = statements.findIndex((text) =>
        text.includes("(s.created_at, s.token_hash) > (c.created_at, ?::text)"),
      );
      expect(lockPositions).toEqual([0]);
      expect(sweepPosition).toBeGreaterThan(0);
    });
  });

  it("is exempt from the newest-token rule and from the password-change binding", async () => {
    const consume = await consumeOf();
    const consumedClause = consume.slice(
      consume.indexOf("consumed as ("),
      consume.indexOf("superseded as ("),
    );

    expect(consumedClause).not.toContain("newer.");
    expect(consumedClause).not.toContain("password_changed_at");
  });

  it("retires every other unused token of the account that is not an undo link, and every undo link created after this one", async () => {
    expect(await consumeOf()).toContain(
      "superseded as ( update account_email_tokens s set used_at = now() from consumed c where s.account_id = c.account_id and s.used_at is null and s.token_hash <> ? and ( s.purpose <> ? or (s.created_at, s.token_hash) > (c.created_at, ?::text) ) returning s.token_hash )",
    );
  });

  it("restores the address and its normal form from the token's row, and sets the new hash, password_changed_at (the wall clock) and updated_at", async () => {
    expect(await consumeOf()).toContain(
      "changed as ( update accounts a set email = c.new_email, email_normal_form = c.new_email_normal_form, password_hash = ?, password_changed_at = clock_timestamp(), updated_at = now() from consumed c where a.id = c.account_id returning a.id )",
    );
  });

  it("binds the caller's hashes and the undo purpose, and no address", async () => {
    const transaction = await transactionOf(revert, [[], REVERTED, []]);

    expect(transaction.statements[0]?.values).toEqual([
      TOKEN_HASH,
      "email-change-revert",
    ]);
    expect(transaction.statements[1]?.values).toEqual([
      TOKEN_HASH,
      TOKEN_HASH,
      "email-change-revert",
      "email-change-revert",
      TOKEN_HASH,
      "email-change-revert",
      TOKEN_HASH,
      NEW_PASSWORD_HASH,
      false,
      TOKEN_HASH,
      "email-change-revert",
      NEW_PASSWORD_HASH,
    ]);
  });

  it("on a retry only, answers done for a used undo link whose account holds exactly this call's new hash", async () => {
    const consume = await consumeOf();

    expect(consume).toContain(
      "union all select a.id, a.email, a.locale, null::text from account_email_tokens t join accounts a on a.id = t.account_id where ?::boolean and t.token_hash = ? and t.purpose = ? and t.used_at is not null and a.password_hash = ? and not exists (select 1 from consumed) )",
    );
    expect(consume).toContain("exists (select 1 from restored) as is_done");
  });

  it("the second statement revokes only the sessions of an account whose undo link this transaction used (used_at = now())", async () => {
    const transaction = await transactionOf(revert, [[], REVERTED, []]);
    const [, , revoke] = statementsOf(transaction);

    expect(revoke).toBe(
      "update account_sessions set revoked_at = now() where revoked_at is null and account_id in ( select t.account_id from account_email_tokens t where t.token_hash = ? and t.purpose = ? and t.used_at = now() ) returning token_hash",
    );
    expect(transaction.statements[2]?.values).toEqual([
      TOKEN_HASH,
      "email-change-revert",
    ]);
  });

  it("writes nothing but the grant allows: no role, no id, and no delete", async () => {
    const consume = await consumeOf();

    expect(consume).not.toMatch(/\b(role|delete)\b/);
    expect(consume).not.toContain("set id =");
  });

  it("answers reverted with the restored address, the account's language and the address just left", async () => {
    resetQueryDriver();
    answerTransactionWith([[], REVERTED, []]);

    expect(await revert()).toEqual({
      kind: "reverted",
      accountId: ACCOUNT_ID,
      email: "old@example.md",
      locale: "ro",
      leftEmail: "left@example.md",
    });
  });

  it("answers no address left for a retry whose first attempt had already made the change: the left address is unknown then", async () => {
    resetQueryDriver();
    answerTransactionWith([[], [{ ...REVERTED[0], left_email: null }], []]);

    expect(await revert()).toEqual({
      kind: "reverted",
      accountId: ACCOUNT_ID,
      email: "old@example.md",
      locale: "ro",
      leftEmail: undefined,
    });
  });

  it("reads the address left from the locked row before the change, never a bound value", async () => {
    const consume = await consumeOf();

    expect(consume).toContain(
      "select a.id, a.email, a.locale, a.email_verified_at from accounts a",
    );
    expect(consume).toContain(
      "select c.account_id, c.new_email as email, l.locale, l.email as left_email from consumed c join locked l on l.id = c.account_id",
    );
    expect(consume).toContain(
      "(select r.left_email from restored r) as left_email",
    );
  });

  it("is the store error for a left address that is neither text nor null", async () => {
    resetQueryDriver();
    answerTransactionWith([[], [{ ...REVERTED[0], left_email: 5 }], []]);

    expect(await rejectionOf(revert())).toBeInstanceOf(AccountStoreError);
  });

  it("answers invalid, the one answer, for a token the statement did not consume", async () => {
    resetQueryDriver();
    answerTransactionWith([
      [],
      [
        {
          is_done: false,
          account_id: null,
          restored_email: null,
          restored_locale: null,
        },
      ],
      [],
    ]);

    expect(await revert()).toEqual({ kind: "invalid" });
  });

  it("is the store error for a done answer that names no address", async () => {
    resetQueryDriver();
    answerTransactionWith([
      [],
      [
        {
          is_done: true,
          account_id: ACCOUNT_ID,
          restored_email: null,
          restored_locale: "ro",
        },
      ],
      [],
    ]);

    const rejection = await rejectionOf(revert());

    expect(rejection).toBeInstanceOf(AccountStoreError);
    expect((rejection as AccountStoreError).operation).toBe(
      "revert an e-mail address change",
    );
  });

  describe("an address another account took after the snapshot", () => {
    function uniqueViolation(constraint: string | undefined): NeonDbError {
      return Object.assign(
        new NeonDbError("duplicate key value violates unique constraint"),
        { code: "23505", constraint },
      );
    }

    it("is invalid, the same one answer, never a server error", async () => {
      resetQueryDriver();
      failQueryWith(uniqueViolation("accounts_email_normal_form_is_unique"));

      expect(await revert()).toEqual({ kind: "invalid" });
    });

    it("is the store error for any other unique violation", async () => {
      resetQueryDriver();
      failQueryWith(uniqueViolation("accounts_pkey"));

      const rejection = await rejectionOf(revert());

      expect(rejection).toBeInstanceOf(AccountStoreError);
    });
  });

  it.each([
    ["a token hash of the wrong shape", { tokenHash: "short" }],
    ["a password hash that is not argon2id", { passwordHash: "plain" }],
  ])("sends nothing for %s", async (_label, override) => {
    resetQueryDriver();

    await expect(
      newStore().revertEmailChange({
        tokenHash: TOKEN_HASH,
        passwordHash: NEW_PASSWORD_HASH,
        ...override,
      }),
    ).rejects.toThrow();

    expect(queryDriver.transactions).toEqual([]);
  });
});

describe("isAddressReserved: one read of the live undo rows of other accounts", () => {
  const NORMAL_FORM = "old@example.md";
  const ask = () =>
    newStore().isAddressReserved({
      emailNormalForm: NORMAL_FORM,
      exceptAccountId: ACCOUNT_ID,
    });

  it("is one lone statement that names the live undo rows of every account but the asking one", async () => {
    const statement = await loneStatementOf(ask, [{ is_reserved: true }]);

    expect(normalised(statement)).toBe(
      "select exists ( select 1 from account_email_tokens reservation where " +
        LIVE_RESERVATION_ROW +
        " and reservation.account_id <> ? ) as is_reserved",
    );
    expect(statement.values).toEqual([
      "email-change-revert",
      NORMAL_FORM,
      ACCOUNT_ID,
    ]);
  });

  it.each([true, false])("answers %s as the database does", async (answer) => {
    resetQueryDriver();
    answerQueryWith([{ is_reserved: answer }]);

    expect(await ask()).toBe(answer);
  });

  it.each([
    ["no row", []],
    ["a non-boolean", [{ is_reserved: "t" }]],
  ])("is the store error for %s", async (_label, reply) => {
    resetQueryDriver();
    answerQueryWith(reply);

    const rejection = await rejectionOf(ask());

    expect(rejection).toBeInstanceOf(AccountStoreError);
    expect((rejection as AccountStoreError).operation).toBe(
      "look up an address reservation",
    );
  });

  it("sends nothing for an account id of the wrong shape", async () => {
    resetQueryDriver();

    await expect(
      newStore().isAddressReserved({
        emailNormalForm: NORMAL_FORM,
        exceptAccountId: "short",
      }),
    ).rejects.toThrow();

    expect(queryDriver.statements).toEqual([]);
  });
});

describe("issueToken: a reset link is issued only while the account still holds the address it was looked up by", () => {
  const HELD_NORMAL_FORM = "ana@example.md";
  const issue = (holdingEmailNormalForm?: string) => () =>
    newStore().issueToken({
      accountId: ACCOUNT_ID,
      purpose: "reset-password",
      tokenHash: TOKEN_HASH,
      expiresAt: EXPIRES_AT,
      ...(holdingEmailNormalForm === undefined
        ? {}
        : { holdingEmailNormalForm }),
    });

  it("puts the address predicate on the locked row itself and locks that row for share, before the conflict clause", async () => {
    const text = normalised(
      await loneStatementOf(issue(HELD_NORMAL_FORM), [
        { token_hash: TOKEN_HASH },
      ]),
    );

    expect(text).toContain(
      "from accounts a where a.id = ? and (?::text is null or a.email_normal_form = ?::text) for share of a on conflict (token_hash) do nothing",
    );
  });

  it("binds the address to both of its places, in order, and the account and the hash as before", async () => {
    const statement = await loneStatementOf(issue(HELD_NORMAL_FORM), [
      { token_hash: TOKEN_HASH },
    ]);

    expect(statement.values).toEqual([
      TOKEN_HASH,
      "reset-password",
      EXPIRES_AT.toISOString(),
      ACCOUNT_ID,
      HELD_NORMAL_FORM,
      HELD_NORMAL_FORM,
      TOKEN_HASH,
      ACCOUNT_ID,
      "reset-password",
    ]);
  });

  it("binds no address, and so conditions on none, when the caller names none", async () => {
    const statement = await loneStatementOf(issue(), [
      { token_hash: TOKEN_HASH },
    ]);

    expect(statement.values.slice(3, 6)).toEqual([ACCOUNT_ID, null, null]);
  });

  it("answers refused when the predicate matched no row and nothing was found", async () => {
    resetQueryDriver();
    answerQueryWith([]);

    expect(await issue(HELD_NORMAL_FORM)()).toEqual({ kind: "refused" });
  });

  it("sends nothing for an address of the wrong length", async () => {
    resetQueryDriver();

    await expect(issue("x")()).rejects.toThrow();

    expect(queryDriver.statements).toEqual([]);
  });
});

describe("findRevertAddress: one read of a live undo row, which uses nothing up", () => {
  const find = () => newStore().findRevertAddress(REVERT_HASH);
  const ROW = { account_id: ACCOUNT_ID, restored_email: "Ana@Example.md" };

  it("is one lone select, with no write and no lock", async () => {
    const text = normalised(await loneStatementOf(find, [ROW]));

    expect(text.startsWith("select a.id as account_id, t.new_email as")).toBe(
      true,
    );
    expect(text).not.toMatch(/\b(insert|update|delete|for update|for share)\b/);
  });

  it("finds the row by its hash alone, bound to the undo purpose as a value, unused, unexpired and carrying an address", async () => {
    const statement = await loneStatementOf(find, [ROW]);
    const text = normalised(statement);

    expect(text).toContain(
      "where t.token_hash = ? and t.purpose = ? and t.used_at is null and t.expires_at > now() and t.new_email is not null and t.new_email_normal_form is not null and a.email_verified_at is not null",
    );
    expect(statement.values.slice(0, 2)).toEqual([
      REVERT_HASH,
      "email-change-revert",
    ]);
  });

  it("is refused for an address another account holds or a live undo link of another account names", async () => {
    const text = normalised(await loneStatementOf(find, [ROW]));

    expect(text).toContain(
      "and not exists ( select 1 from accounts holder where holder.email_normal_form = t.new_email_normal_form and holder.id <> t.account_id )",
    );
    expect(text).toContain(RESERVED_BY_ANOTHER_ACCOUNT);
  });

  it("does not apply the newest-token rule: an earlier undo link is found while a later one exists", async () => {
    const text = normalised(await loneStatementOf(find, [ROW]));

    expect(text).not.toContain("newer");
  });

  it("answers the link's account and the address it restores", async () => {
    resetQueryDriver();
    answerQueryWith([ROW]);

    expect(await find()).toEqual({
      kind: "found",
      accountId: ACCOUNT_ID,
      email: "Ana@Example.md",
    });
  });

  it("answers none, and only none, when no row matched", async () => {
    resetQueryDriver();
    answerQueryWith([]);

    expect(await find()).toEqual({ kind: "none" });
  });

  it.each([
    ["two rows", [ROW, ROW]],
    ["a row without an address", [{ account_id: ACCOUNT_ID }]],
    ["a row whose account is not text", [{ ...ROW, account_id: 7 }]],
  ])("is the store error for %s", async (_label, reply) => {
    resetQueryDriver();
    answerQueryWith(reply);

    const rejection = await rejectionOf(find());

    expect(rejection).toBeInstanceOf(AccountStoreError);
    expect((rejection as AccountStoreError).operation).toBe(
      "look up an undo link",
    );
  });

  it("sends nothing for a token hash of the wrong shape", async () => {
    resetQueryDriver();

    await expect(newStore().findRevertAddress("short")).rejects.toThrow();

    expect(queryDriver.statements).toEqual([]);
  });
});
