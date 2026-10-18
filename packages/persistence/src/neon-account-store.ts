import { isRole } from "@lemnaria/configurator-domain";

import {
  AccountStoreError,
  requireValidEmailConfirmation,
  requireValidLiveTokenLookup,
  requireValidNewAccount,
  requireValidPasswordRehash,
  requireValidPasswordReset,
  requireValidRegistrationReplacement,
  requireValidTokenToIssue,
} from "./account-store.js";
import type {
  AccountCreation,
  AccountLookup,
  AccountStore,
  AccountStoreOperation,
  EmailConfirmation,
  EmailConfirmationOutcome,
  LiveTokenLookup,
  NewAccount,
  PasswordRehash,
  PasswordRehashOutcome,
  PasswordReset,
  PasswordResetOutcome,
  RegistrationReplacement,
  RegistrationReplacementOutcome,
  StoredAccount,
  TokenIssueOutcome,
  TokenToIssue,
} from "./account-store.js";
import { generateAccountId } from "./generate-account-id.js";
import { reducedCauseOf } from "./migration-errors.js";
import { openApplicationDatabase } from "./open-application-database.js";
import { retryOnTransientFailure } from "./retry-on-transient-failure.js";

const VERIFY_EMAIL = "verify-email";
const RESET_PASSWORD = "reset-password";

/**
 * `AccountStore` on Neon Postgres, over `accounts` and `account_email_tokens` (migrations `0012`, `0014`). Every query
 * is a tagged-template `sql`, which parameterises values. Each method is **one statement**, so it is atomic without
 * `sql.transaction` (a batch of statements cannot branch on an earlier one): a token's `update … returning` is the
 * gate, and the other writes are driven from its `returning`. The one exception is `completeReset`, a two-statement
 * transaction whose second statement needs a snapshot taken after the first has finished waiting.
 *
 * The statements write only columns the application role is granted: `accounts` INSERT of the eight registration
 * columns and UPDATE of the verification, password, phone, locale and notice columns; `account_email_tokens` UPDATE of
 * `used_at` alone. None writes `role`, `email`, `email_normal_form` or `id` after insert, and none deletes.
 *
 * A "newest live token" is unused, unexpired by the database's clock, and has no newer unused token of the same
 * account and purpose, ties broken by `token_hash`. Using one marks its unused siblings used, so retiring a newer
 * token can never revive an older one.
 */
export class NeonAccountStore implements AccountStore {
  private readonly sql;

  /** `connectionUrl` defaults to `DATABASE_URL`; only the live tests pass it, to target their own database. */
  constructor(connectionUrl?: string) {
    this.sql = openApplicationDatabase(connectionUrl);
  }

  async findByNormalForm(emailNormalForm: string): Promise<AccountLookup> {
    const rows = await queryRows("look up an account", () =>
      retryOnTransientFailure(
        () => this.sql`
          select a.id, a.email, a.password_hash, a.role, a.locale,
            (a.email_verified_at is not null) as is_email_verified
          from accounts a
          where a.email_normal_form = ${emailNormalForm}
        `,
      ),
    );
    return lookupFrom(rows);
  }

  async findByLiveToken({
    tokenHash,
    purpose,
  }: LiveTokenLookup): Promise<AccountLookup> {
    requireValidLiveTokenLookup({ tokenHash, purpose });
    const rows = await queryRows("look up an account", () =>
      retryOnTransientFailure(
        () => this.sql`
          select a.id, a.email, a.password_hash, a.role, a.locale,
            (a.email_verified_at is not null) as is_email_verified
          from account_email_tokens t
          join accounts a on a.id = t.account_id
          where t.token_hash = ${tokenHash}
            and t.purpose = ${purpose}
            and t.used_at is null
            and t.expires_at > now()
            and not exists (
              select 1 from account_email_tokens newer
              where newer.account_id = t.account_id
                and newer.purpose = t.purpose
                and newer.used_at is null
                and (newer.created_at, newer.token_hash) > (t.created_at, t.token_hash)
            )
        `,
      ),
    );
    return lookupFrom(rows);
  }

  /**
   * The id is minted before the retried callback: a new one per attempt would insert a second account when only an
   * acknowledgement was lost. `on conflict do nothing` takes no target, so it answers both the id and the address; the
   * final `select` finds the row by this call's own id, which is what tells a retry that landed from an address that
   * was already taken. No `on conflict do update` appears, so the grant never needs more than INSERT.
   */
  async createUnverified(account: NewAccount): Promise<AccountCreation> {
    requireValidNewAccount(account);
    const accountId = generateAccountId();
    const rows = await queryRows("create an account", () =>
      retryOnTransientFailure(
        () => this.sql`
          with inserted as (
            insert into accounts (
              id, email, email_normal_form, password_hash, locale, phone, phone_normal_form, privacy_notice_version
            ) values (
              ${accountId}, ${account.email}, ${account.emailNormalForm}, ${account.passwordHash}, ${account.locale},
              ${account.phone?.entered ?? null}::text, ${account.phone?.normalForm ?? null}::text,
              ${account.privacyNoticeVersion}
            )
            on conflict do nothing
            returning id
          )
          select id from inserted
          union
          select id from accounts where id = ${accountId} and email_normal_form = ${account.emailNormalForm}
        `,
      ),
    );
    return rows.length === 0
      ? { kind: "address-taken" }
      : { kind: "created", accountId };
  }

  /** `email_verified_at is null` is in the predicate, so a verified account matches nothing and is never touched.
   *  Repeating it writes the same values. */
  async replaceUnverifiedRegistration(
    replacement: RegistrationReplacement,
  ): Promise<RegistrationReplacementOutcome> {
    requireValidRegistrationReplacement(replacement);
    const rows = await queryRows("replace an unverified registration", () =>
      retryOnTransientFailure(
        () => this.sql`
          update accounts
          set password_hash = ${replacement.passwordHash},
            phone = ${replacement.phone?.entered ?? null}::text,
            phone_normal_form = ${replacement.phone?.normalForm ?? null}::text,
            locale = ${replacement.locale},
            privacy_notice_version = ${replacement.privacyNoticeVersion},
            updated_at = now()
          where email_normal_form = ${replacement.emailNormalForm}
            and email_verified_at is null
          returning id
        `,
      ),
    );
    const accountId = onlyIdOf(rows, "replace an unverified registration");
    return accountId === undefined
      ? { kind: "not-replaceable" }
      : { kind: "replaced", accountId };
  }

  /** The token is inserted from a `select` of its account, so an account that is gone inserts nothing and raises no
   *  foreign-key error. Repeating it after a lost acknowledgement finds its own row and answers issued. */
  async issueToken(token: TokenToIssue): Promise<TokenIssueOutcome> {
    requireValidTokenToIssue(token);
    const { accountId, purpose, tokenHash } = token;
    const expiresAt = token.expiresAt.toISOString();
    const rows = await queryRows("issue an e-mail token", () =>
      retryOnTransientFailure(
        () => this.sql`
          with inserted as (
            insert into account_email_tokens (token_hash, account_id, purpose, expires_at)
            select ${tokenHash}, a.id, ${purpose}, ${expiresAt}::timestamptz
            from accounts a where a.id = ${accountId}
            on conflict (token_hash) do nothing
            returning token_hash
          )
          select token_hash from inserted
          union
          select token_hash from account_email_tokens
          where token_hash = ${tokenHash} and account_id = ${accountId} and purpose = ${purpose}
        `,
      ),
    );
    return rows.length === 0 ? { kind: "refused" } : { kind: "issued" };
  }

  /**
   * The token update is the gate, and it holds the password check: the token must be this account's newest live
   * `verify-email` token **and** the account's hash must still be the one the caller verified. A second call with the
   * same token blocks on the row, re-reads `used_at`, finds it set and changes nothing.
   *
   * The hash check is a **locking** read (`locked`, `for update`), not a subquery of the token update: a subquery reads
   * the statement's snapshot, so a `replaceUnverifiedRegistration` committing after that snapshot would go unseen and
   * the account would be verified under the replacing password. `for update` waits for such a writer, re-checks the
   * row against the predicate, and holds the row until this statement commits, so the later `confirmed` update cannot
   * land on a different password. It needs only the column UPDATE grant the table already carries.
   *
   * On a retry only, a token already used for this account whose account is verified under that same hash is the first
   * attempt's own write, so it answers confirmed rather than a false invalid.
   */
  async confirmEmail({
    tokenHash,
    accountId,
    verifiedPasswordHash,
  }: EmailConfirmation): Promise<EmailConfirmationOutcome> {
    requireValidEmailConfirmation({
      tokenHash,
      accountId,
      verifiedPasswordHash,
    });
    const rows = await queryRows("confirm an e-mail address", () =>
      retryOnTransientFailure(
        ({ isRetry }) => this.sql`
          with locked as (
            select id from accounts
            where id = ${accountId} and password_hash = ${verifiedPasswordHash}
            for update
          ), consumed as (
            update account_email_tokens t
            set used_at = now()
            where t.token_hash = ${tokenHash}
              and t.account_id in (select id from locked)
              and t.purpose = ${VERIFY_EMAIL}
              and t.used_at is null
              and t.expires_at > now()
              and not exists (
                select 1 from account_email_tokens newer
                where newer.account_id = t.account_id
                  and newer.purpose = t.purpose
                  and newer.used_at is null
                  and (newer.created_at, newer.token_hash) > (t.created_at, t.token_hash)
              )
            returning t.account_id
          ), superseded as (
            update account_email_tokens s
            set used_at = now()
            where s.account_id in (select account_id from consumed)
              and s.purpose = ${VERIFY_EMAIL}
              and s.used_at is null
              and s.token_hash <> ${tokenHash}
            returning s.token_hash
          ), confirmed as (
            update accounts
            set email_verified_at = coalesce(email_verified_at, now()), updated_at = now()
            where id in (select account_id from consumed)
            returning id
          )
          select (
            exists (select 1 from consumed)
            or (
              ${isRetry}::boolean
              and exists (
                select 1 from account_email_tokens t
                join accounts a on a.id = t.account_id
                where t.token_hash = ${tokenHash}
                  and t.account_id = ${accountId}
                  and t.purpose = ${VERIFY_EMAIL}
                  and t.used_at is not null
                  and a.email_verified_at is not null
                  and a.password_hash = ${verifiedPasswordHash}
              )
            )
          ) as is_done
        `,
      ),
    );
    return isDone(rows, "confirm an e-mail address")
      ? { kind: "confirmed" }
      : { kind: "invalid" };
  }

  /**
   * The same gate over a `reset-password` token of a **verified** account; the account comes from the token. It is one
   * transaction of two statements, at READ COMMITTED (pinned: the second statement's fresh snapshot is load-bearing).
   *
   * Statement 1 consumes the token, retires its siblings and sets the password and `password_changed_at`, and answers
   * whether the token was consumed. Its `accounts` update waits for any `SessionStore.create` holding the account row
   * `for share`, and then holds the row until the transaction commits, so a later `create` waits and finds the hash
   * replaced. Statement 2 revokes the account's unrevoked sessions. It cannot be a CTE of statement 1: a CTE reads the
   * snapshot taken before that wait, and so misses the session a login committed while the update waited. A separate
   * statement takes a new snapshot after statement 1 has finished waiting, and sees it.
   *
   * `password_changed_at` is `clock_timestamp()`, not the transaction's `now()`: `findLive` refuses a session created
   * before it, and a racing login's `created_at` is its own statement's `now()`, which can be later than this
   * transaction's. The residual sliver: the value is evaluated before the update waits on the share lock, so a login
   * that began between the two can still have `created_at` after it. That session is caught by statement 2's
   * revocation, which is the rule; the `findLive` comparison is a second line behind it.
   *
   * Statement 2 revokes only for a token **this transaction** consumed (`used_at = now()`, the transaction's one
   * instant, which a retry's transaction cannot share): a replayed used token, or a retry after a lost acknowledgement
   * of a commit, revokes nothing, so a login made under the new password meanwhile stands. `account_sessions` is
   * touched only through `revoked_at`.
   *
   * On a retry only, a used token whose account carries exactly this call's new hash is the first attempt's own write:
   * a PHC string holds a random salt, so no other call can have written the same one.
   */
  async completeReset({
    tokenHash,
    passwordHash,
  }: PasswordReset): Promise<PasswordResetOutcome> {
    requireValidPasswordReset({ tokenHash, passwordHash });
    const rows = await queryRows("complete a password reset", async () => {
      const [consumptionRows] = await retryOnTransientFailure(({ isRetry }) =>
        this.sql.transaction(
          [
            this.sql`
                with consumed as (
                  update account_email_tokens t
                  set used_at = now()
                  where t.token_hash = ${tokenHash}
                    and t.purpose = ${RESET_PASSWORD}
                    and t.used_at is null
                    and t.expires_at > now()
                    and exists (
                      select 1 from accounts a
                      where a.id = t.account_id and a.email_verified_at is not null
                    )
                    and not exists (
                      select 1 from account_email_tokens newer
                      where newer.account_id = t.account_id
                        and newer.purpose = t.purpose
                        and newer.used_at is null
                        and (newer.created_at, newer.token_hash) > (t.created_at, t.token_hash)
                    )
                  returning t.account_id
                ), superseded as (
                  update account_email_tokens s
                  set used_at = now()
                  where s.account_id in (select account_id from consumed)
                    and s.purpose = ${RESET_PASSWORD}
                    and s.used_at is null
                    and s.token_hash <> ${tokenHash}
                  returning s.token_hash
                ), changed as (
                  update accounts
                  set password_hash = ${passwordHash}, password_changed_at = clock_timestamp(), updated_at = now()
                  where id in (select account_id from consumed)
                  returning id
                )
                select (
                  exists (select 1 from consumed)
                  or (
                    ${isRetry}::boolean
                    and exists (
                      select 1 from account_email_tokens t
                      join accounts a on a.id = t.account_id
                      where t.token_hash = ${tokenHash}
                        and t.purpose = ${RESET_PASSWORD}
                        and t.used_at is not null
                        and a.password_hash = ${passwordHash}
                    )
                  )
                ) as is_done
              `,
            this.sql`
                update account_sessions
                set revoked_at = now()
                where revoked_at is null
                  and account_id in (
                    select t.account_id from account_email_tokens t
                    where t.token_hash = ${tokenHash}
                      and t.purpose = ${RESET_PASSWORD}
                      and t.used_at = now()
                  )
                returning token_hash
              `,
          ],
          { isolationLevel: "ReadCommitted" },
        ),
      );
      return consumptionRows;
    });
    return isDone(rows, "complete a password reset")
      ? { kind: "password-changed" }
      : { kind: "invalid" };
  }

  /** A compare-and-set on the hash the login verified, so a rehash racing a reset cannot restore the old password. It
   *  leaves `password_changed_at` alone: the password did not change. On a retry only, an account already holding the
   *  new hash is the first attempt's own write. */
  async replacePasswordHash({
    accountId,
    expectedPasswordHash,
    passwordHash,
  }: PasswordRehash): Promise<PasswordRehashOutcome> {
    requireValidPasswordRehash({
      accountId,
      expectedPasswordHash,
      passwordHash,
    });
    const rows = await queryRows("replace a password hash", () =>
      retryOnTransientFailure(
        ({ isRetry }) => this.sql`
          with replaced as (
            update accounts
            set password_hash = ${passwordHash}, updated_at = now()
            where id = ${accountId} and password_hash = ${expectedPasswordHash}
            returning id
          )
          select (
            exists (select 1 from replaced)
            or (
              ${isRetry}::boolean
              and exists (
                select 1 from accounts where id = ${accountId} and password_hash = ${passwordHash}
              )
            )
          ) as is_done
        `,
      ),
    );
    return isDone(rows, "replace a password hash")
      ? { kind: "replaced" }
      : { kind: "stale" };
  }
}

/** The rows of a statement, or the store error. A failure leaves as a store error holding a built cause (ADR 0146 B3),
 *  and the driver's own error is thrown by nothing here. */
async function queryRows(
  operation: AccountStoreOperation,
  runQuery: () => PromiseLike<unknown>,
): Promise<readonly Record<string, unknown>[]> {
  let reply: unknown;
  try {
    reply = await runQuery();
  } catch (failure) {
    throw new AccountStoreError(operation, reducedCauseOf(failure));
  }
  return plainRowsOf(reply, operation);
}

/** Each row is copied in one guarded step, so a row that throws when read is the store error with no cause. */
function plainRowsOf(
  reply: unknown,
  operation: AccountStoreOperation,
): readonly Record<string, unknown>[] {
  try {
    if (!Array.isArray(reply) || !reply.every(isRecord)) {
      throw new AccountStoreError(operation);
    }
    return Array.from(reply, (row) => ({ ...row }));
  } catch {
    throw new AccountStoreError(operation);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function lookupFrom(rows: readonly Record<string, unknown>[]): AccountLookup {
  const [row, ...others] = rows;
  if (row === undefined) return { kind: "none" };
  if (others.length > 0) throw new AccountStoreError("look up an account");
  return { kind: "found", account: storedAccountFrom(row) };
}

function storedAccountFrom(row: Record<string, unknown>): StoredAccount {
  const { id, email, password_hash, role, locale, is_email_verified } = row;
  if (
    typeof id !== "string" ||
    typeof email !== "string" ||
    typeof password_hash !== "string" ||
    typeof locale !== "string" ||
    typeof is_email_verified !== "boolean" ||
    typeof role !== "string" ||
    !isRole(role)
  ) {
    throw new AccountStoreError("look up an account");
  }
  return {
    id,
    email,
    passwordHash: password_hash,
    isEmailVerified: is_email_verified,
    role,
    locale,
  };
}

/** The id of the one row an `update … returning id` changed, or `undefined` when it changed none. */
function onlyIdOf(
  rows: readonly Record<string, unknown>[],
  operation: AccountStoreOperation,
): string | undefined {
  const [row, ...others] = rows;
  if (row === undefined) return undefined;
  if (others.length > 0 || typeof row["id"] !== "string") {
    throw new AccountStoreError(operation);
  }
  return row["id"];
}

/** The one boolean a token statement answers. Anything else is not that statement's reply. */
function isDone(
  rows: readonly Record<string, unknown>[],
  operation: AccountStoreOperation,
): boolean {
  const [row, ...others] = rows;
  if (
    row === undefined ||
    others.length > 0 ||
    typeof row["is_done"] !== "boolean"
  ) {
    throw new AccountStoreError(operation);
  }
  return row["is_done"];
}
