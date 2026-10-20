import type { NeonQueryFunction } from "@neondatabase/serverless";

import {
  AccountStoreError,
  requireValidEmailChangeConfirmation,
  requireValidEmailChangeRetirement,
  requireValidEmailChangeTokenToIssue,
} from "./account-store.js";
import type {
  EmailChangeConfirmation,
  EmailChangeOutcome,
  EmailChangeTokenToIssue,
  TokenIssueOutcome,
} from "./account-store.js";
import { isDone, queryRows } from "./neon-account-rows.js";
import { isNeonDbError } from "./open-database.js";
import { retryOnTransientFailure } from "./retry-on-transient-failure.js";

type ApplicationSql = NeonQueryFunction<false, false>;

const EMAIL_CHANGE = "email-change";

const UNIQUE_VIOLATION = "23505";
/** `0012`'s unique constraint on `accounts.email_normal_form`. */
const ACCOUNT_ADDRESS_UNIQUENESS_NAME = "accounts_email_normal_form_is_unique";

/** What `confirmEmailChange` answers when the new address was taken between the predicate's snapshot and the update. */
const ADDRESS_TAKEN_ROWS: readonly Record<string, unknown>[] = Object.freeze([
  Object.freeze({
    is_done: false,
    account_id: null,
    previous_email: null,
    previous_locale: null,
  }),
]);

/**
 * `issueToken` for an `email-change` token: the row carries the new address (`0018`), and only a **verified** account
 * that still holds the hash the caller verified gets one. Inserted from a `select` of its account, so an account that
 * is gone inserts nothing and raises no foreign-key error. Repeating it after a lost acknowledgement finds its own
 * row and answers issued.
 */
export async function issueEmailChangeToken(
  sql: ApplicationSql,
  token: EmailChangeTokenToIssue,
): Promise<TokenIssueOutcome> {
  requireValidEmailChangeTokenToIssue(token);
  const {
    accountId,
    verifiedPasswordHash,
    tokenHash,
    newEmail,
    newEmailNormalForm,
  } = token;
  const expiresAt = token.expiresAt.toISOString();
  const rows = await queryRows("issue an e-mail change token", () =>
    retryOnTransientFailure(
      () => sql`
          with inserted as (
            insert into account_email_tokens (
              token_hash, account_id, purpose, expires_at, new_email, new_email_normal_form
            )
            select ${tokenHash}, a.id, ${EMAIL_CHANGE}, ${expiresAt}::timestamptz,
              ${newEmail}::text, ${newEmailNormalForm}::text
            from accounts a
            where a.id = ${accountId} and a.email_verified_at is not null
              and a.password_hash = ${verifiedPasswordHash}
            on conflict (token_hash) do nothing
            returning token_hash
          )
          select token_hash from inserted
          union
          select token_hash from account_email_tokens
          where token_hash = ${tokenHash} and account_id = ${accountId} and purpose = ${EMAIL_CHANGE}
        `,
    ),
  );
  return rows.length === 0 ? { kind: "refused" } : { kind: "issued" };
}

/** Idempotent: a repeat finds nothing unused and changes nothing. Names `account_id` and the purpose, so no other
 *  account's token and no reset or confirmation link is touched. */
export async function retireEmailChangeTokens(
  sql: ApplicationSql,
  accountId: string,
): Promise<void> {
  requireValidEmailChangeRetirement(accountId);
  await queryRows("retire e-mail change tokens", () =>
    retryOnTransientFailure(
      () => sql`
          update account_email_tokens
          set used_at = now()
          where account_id = ${accountId} and purpose = ${EMAIL_CHANGE} and used_at is null
          returning token_hash
        `,
    ),
  );
}

/**
 * The same shape as `completeReset`, at READ COMMITTED, with the token alone as the subject. Statement 1 locks the
 * token's account row (`for update`: it waits for a `SessionStore.create` holding it `for share`, and holds the row
 * until the commit) and consumes the token under every rule at once: `email-change` purpose, unused, unexpired, the
 * newest live of its account, a row that carries an address, an account that is verified, **issued no earlier than the
 * account's last password change** (a link mailed before a change of password is refused even if it was never
 * retired), and a new address no other account holds. It then retires every other unused token of the account of any
 * purpose, so a reset link mailed to the old address cannot outlive it, and replaces `email` and `email_normal_form`.
 * Statement 2 revokes the account's unrevoked sessions in a fresh snapshot, only for a token **this transaction**
 * consumed (`used_at = now()`).
 *
 * A new address another account took after statement 1's snapshot raises the unique violation of
 * `accounts_email_normal_form_is_unique`; the transaction rolls back, the token stays whole, and the answer is
 * `invalid`, the same as for an expired link. Any other failure propagates.
 *
 * The old address and language are read from the locked row, for the notice to the old address. On a retry only, a
 * used token whose account already holds its new address is the first attempt's own write: it answers `changed`
 * without them, since the first attempt had replaced them.
 */
export async function confirmEmailChange(
  sql: ApplicationSql,
  { tokenHash }: EmailChangeConfirmation,
): Promise<EmailChangeOutcome> {
  requireValidEmailChangeConfirmation({ tokenHash });
  const rows = await queryRows("change an e-mail address", async () => {
    try {
      const [changeRows] = await retryOnTransientFailure(({ isRetry }) =>
        sql.transaction(
          [
            sql`
                with locked as (
                  select a.id, a.email, a.locale, a.email_verified_at, a.password_changed_at
                  from accounts a
                  where a.id in (select t.account_id from account_email_tokens t where t.token_hash = ${tokenHash})
                  for update
                ), consumed as (
                  update account_email_tokens t
                  set used_at = now()
                  from locked l
                  where t.token_hash = ${tokenHash}
                    and t.account_id = l.id
                    and t.purpose = ${EMAIL_CHANGE}
                    and t.used_at is null
                    and t.expires_at > now()
                    and t.new_email is not null
                    and t.new_email_normal_form is not null
                    and l.email_verified_at is not null
                    and t.created_at >= l.password_changed_at
                    and not exists (
                      select 1 from account_email_tokens newer
                      where newer.account_id = t.account_id
                        and newer.purpose = t.purpose
                        and newer.used_at is null
                        and (newer.created_at, newer.token_hash) > (t.created_at, t.token_hash)
                    )
                    and not exists (
                      select 1 from accounts holder
                      where holder.email_normal_form = t.new_email_normal_form and holder.id <> t.account_id
                    )
                  returning t.account_id, t.new_email, t.new_email_normal_form
                ), superseded as (
                  update account_email_tokens s
                  set used_at = now()
                  where s.account_id in (select account_id from consumed)
                    and s.used_at is null
                    and s.token_hash <> ${tokenHash}
                  returning s.token_hash
                ), changed as (
                  update accounts a
                  set email = c.new_email, email_normal_form = c.new_email_normal_form, updated_at = now()
                  from consumed c
                  where a.id = c.account_id
                  returning a.id
                )
                select
                  (
                    exists (select 1 from consumed)
                    or (
                      ${isRetry}::boolean
                      and exists (
                        select 1 from account_email_tokens t
                        join accounts a on a.id = t.account_id
                        where t.token_hash = ${tokenHash}
                          and t.purpose = ${EMAIL_CHANGE}
                          and t.used_at is not null
                          and a.email_normal_form = t.new_email_normal_form
                      )
                    )
                  ) as is_done,
                  (select t.account_id from account_email_tokens t where t.token_hash = ${tokenHash}) as account_id,
                  (select l.email from locked l where exists (select 1 from consumed)) as previous_email,
                  (select l.locale from locked l where exists (select 1 from consumed)) as previous_locale
              `,
            sql`
                update account_sessions
                set revoked_at = now()
                where revoked_at is null
                  and account_id in (
                    select t.account_id from account_email_tokens t
                    where t.token_hash = ${tokenHash}
                      and t.purpose = ${EMAIL_CHANGE}
                      and t.used_at = now()
                  )
                returning token_hash
              `,
          ],
          { isolationLevel: "ReadCommitted" },
        ),
      );
      return changeRows;
    } catch (failure) {
      if (isAddressTakenViolation(failure)) return ADDRESS_TAKEN_ROWS;
      throw failure;
    }
  });
  return emailChangeOutcomeFrom(rows);
}

/** Asked once, of one failure: an error that cannot be read answers no. */
function isAddressTakenViolation(failure: unknown): boolean {
  try {
    return (
      isNeonDbError(failure) &&
      failure.code === UNIQUE_VIOLATION &&
      failure.constraint === ACCOUNT_ADDRESS_UNIQUENESS_NAME
    );
  } catch {
    return false;
  }
}

/** The old address and language arrive together or not at all: both null is the retry arm. */
function emailChangeOutcomeFrom(
  rows: readonly Record<string, unknown>[],
): EmailChangeOutcome {
  const operation = "change an e-mail address";
  if (!isDone(rows, operation)) return { kind: "invalid" };
  const accountId = rows[0]?.["account_id"];
  const email = rows[0]?.["previous_email"];
  const locale = rows[0]?.["previous_locale"];
  if (typeof accountId !== "string") throw new AccountStoreError(operation);
  if (email === null && locale === null) {
    return { kind: "changed", accountId, previous: undefined };
  }
  if (typeof email !== "string" || typeof locale !== "string") {
    throw new AccountStoreError(operation);
  }
  return { kind: "changed", accountId, previous: { email, locale } };
}
