import type { NeonQueryFunction } from "@neondatabase/serverless";

import {
  AccountStoreError,
  EMAIL_CHANGE_REVERT_PURPOSE,
  requireValidAddressReservationQuestion,
  requireValidEmailChangeConfirmation,
  requireValidEmailChangeRetirement,
  requireValidEmailChangeRevert,
  requireValidEmailChangeTokenToIssue,
} from "./account-store.js";
import type {
  AddressReservationQuestion,
  EmailChangeConfirmation,
  EmailChangeOutcome,
  EmailChangeRevert,
  EmailChangeRevertOutcome,
  EmailChangeTokenToIssue,
  TokenIssueOutcome,
} from "./account-store.js";
import { isDone, queryRows } from "./neon-account-rows.js";
import { isNeonDbError } from "./open-database.js";
import { retryOnTransientFailure } from "./retry-on-transient-failure.js";

type ApplicationSql = NeonQueryFunction<false, false>;

const EMAIL_CHANGE = "email-change";
const EMAIL_CHANGE_REVERT = EMAIL_CHANGE_REVERT_PURPOSE;

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
 * retired), and a new address no other account holds **or has reserved** (a live `email-change-revert` row of another
 * account names it: ADR 0172 Amendment H; the account's own undo link does not block its own change). Both address
 * rules read the statement's one snapshot, in which the move off an address and the undo row that reserves it are
 * either both visible or both absent. It then retires every other unused token of the account of any
 * purpose **except `email-change-revert`**, so a reset link mailed to the old address cannot outlive it but an earlier
 * undo link can (ADR 0172 Amendment H), and replaces `email` and `email_normal_form`. Statement 2 revokes the account's
 * unrevoked sessions in a fresh snapshot, only for a token **this transaction** consumed (`used_at = now()`).
 *
 * The undo link is written by statement 1 as well: one `email-change-revert` row, holding the address being left, the
 * caller's `revertTokenHash` and `revertExpiresAt`, inserted `from consumed`. It is **not** inserted from `locked`
 * alone: `locked` matches the account of any hash submitted, valid or not, so a refused confirmation (a used link
 * clicked again) would write a row that reserves the account's current address. A rolled-back confirmation leaves no
 * row either. The value is minted by the caller once, outside the retry, so every attempt names the same hash.
 *
 * A new address another account took after statement 1's snapshot raises the unique violation of
 * `accounts_email_normal_form_is_unique`; the transaction rolls back, the token stays whole, and the answer is
 * `invalid`, the same as for an expired link. Any other failure propagates, a revert hash already held included.
 *
 * The old address and language are read from the locked row, for the notice to the old address. On a retry only, a
 * used token whose account already holds its new address is the first attempt's own write: it answers `changed`, and
 * the old address comes from the revert row **by this call's hash** (the language from the account, which a change of
 * address leaves alone). No such row means another call made the change: `previous` is absent, so no notice and no
 * link whose hash is in no row is sent.
 */
export async function confirmEmailChange(
  sql: ApplicationSql,
  confirmation: EmailChangeConfirmation,
): Promise<EmailChangeOutcome> {
  requireValidEmailChangeConfirmation(confirmation);
  const { tokenHash, revertTokenHash } = confirmation;
  const revertExpiresAt = confirmation.revertExpiresAt.toISOString();
  const rows = await queryRows("change an e-mail address", async () => {
    try {
      const [changeRows] = await retryOnTransientFailure(({ isRetry }) =>
        sql.transaction(
          [
            sql`
                with locked as (
                  select a.id, a.email, a.email_normal_form, a.locale, a.email_verified_at, a.password_changed_at
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
                    and not exists (
                      select 1 from account_email_tokens reservation
                      where reservation.purpose = ${EMAIL_CHANGE_REVERT}
                        and reservation.used_at is null
                        and reservation.expires_at > now()
                        and reservation.new_email_normal_form = t.new_email_normal_form
                        and reservation.account_id <> t.account_id
                    )
                  returning t.account_id, t.new_email, t.new_email_normal_form
                ), superseded as (
                  update account_email_tokens s
                  set used_at = now()
                  where s.account_id in (select account_id from consumed)
                    and s.used_at is null
                    and s.token_hash <> ${tokenHash}
                    and s.purpose <> ${EMAIL_CHANGE_REVERT}
                  returning s.token_hash
                ), reverted as (
                  insert into account_email_tokens (
                    token_hash, account_id, purpose, expires_at, new_email, new_email_normal_form
                  )
                  select ${revertTokenHash}, c.account_id, ${EMAIL_CHANGE_REVERT}, ${revertExpiresAt}::timestamptz,
                    l.email, l.email_normal_form
                  from consumed c
                  join locked l on l.id = c.account_id
                  returning token_hash
                ), previous_address as (
                  select l.email, l.locale from locked l where exists (select 1 from consumed)
                  union all
                  select r.new_email, l.locale
                  from account_email_tokens r
                  join locked l on l.id = r.account_id
                  where ${isRetry}::boolean
                    and r.token_hash = ${revertTokenHash}
                    and r.purpose = ${EMAIL_CHANGE_REVERT}
                    and not exists (select 1 from consumed)
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
                  (select p.email from previous_address p) as previous_email,
                  (select p.locale from previous_address p) as previous_locale
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

/** What `revertEmailChange` answers when the address was taken between the predicate's snapshot and the update. */
const REVERT_ADDRESS_TAKEN_ROWS: readonly Record<string, unknown>[] =
  Object.freeze([
    Object.freeze({
      is_done: false,
      account_id: null,
      restored_email: null,
      restored_locale: null,
    }),
  ]);

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

/**
 * The undo link's transaction, at READ COMMITTED, the token alone as the subject (ADR 0172 Amendment H). Statement 1
 * locks the token's account row (`for update`, as `confirmEmailChange` does) and consumes the token under: the
 * `email-change-revert` purpose, unused, unexpired, a row that carries an address, an account that is verified, an
 * address no other account holds, and an address no **other** account's live undo link reserves. It has **neither** of
 * the two rules every other token obeys: it need not be the newest of its purpose (any live undo link is valid), and it
 * need not be issued after the last password change (a change of password is no reason to lose the way back). It then
 * retires every other unused token of the account that is not an undo link, **and every undo link created after this
 * one** (`(created_at, token_hash) >`, as everywhere else): the oldest wins, so using a later link never kills an
 * earlier one. It replaces `email` and `email_normal_form` from the row and sets the new hash, `password_changed_at`
 * (`clock_timestamp()`, see `completeReset`) and `updated_at`. Statement 2 revokes every unrevoked session of the
 * account in a fresh snapshot, only for a token **this transaction** consumed (`used_at = now()`).
 *
 * A unique violation (an address another account took after the snapshot) rolls the transaction back and answers
 * `invalid`, as for any refusal. Any other failure propagates.
 *
 * On a retry only, a used undo link whose account already holds exactly this call's new hash is the first attempt's own
 * write (a PHC string holds a random salt): it answers `reverted`, the address and language read from the account.
 */
export async function revertEmailChange(
  sql: ApplicationSql,
  revert: EmailChangeRevert,
): Promise<EmailChangeRevertOutcome> {
  requireValidEmailChangeRevert(revert);
  const { tokenHash, passwordHash } = revert;
  const rows = await queryRows("revert an e-mail address change", async () => {
    try {
      const [revertRows] = await retryOnTransientFailure(({ isRetry }) =>
        sql.transaction(
          [
            sql`
                with locked as (
                  select a.id, a.locale, a.email_verified_at
                  from accounts a
                  where a.id in (select t.account_id from account_email_tokens t where t.token_hash = ${tokenHash})
                  for update
                ), consumed as (
                  update account_email_tokens t
                  set used_at = now()
                  from locked l
                  where t.token_hash = ${tokenHash}
                    and t.account_id = l.id
                    and t.purpose = ${EMAIL_CHANGE_REVERT}
                    and t.used_at is null
                    and t.expires_at > now()
                    and t.new_email is not null
                    and t.new_email_normal_form is not null
                    and l.email_verified_at is not null
                    and not exists (
                      select 1 from accounts holder
                      where holder.email_normal_form = t.new_email_normal_form and holder.id <> t.account_id
                    )
                    and not exists (
                      select 1 from account_email_tokens reservation
                      where reservation.purpose = ${EMAIL_CHANGE_REVERT}
                        and reservation.used_at is null
                        and reservation.expires_at > now()
                        and reservation.new_email_normal_form = t.new_email_normal_form
                        and reservation.account_id <> t.account_id
                    )
                  returning t.account_id, t.created_at, t.new_email, t.new_email_normal_form
                ), superseded as (
                  update account_email_tokens s
                  set used_at = now()
                  from consumed c
                  where s.account_id = c.account_id
                    and s.used_at is null
                    and s.token_hash <> ${tokenHash}
                    and (
                      s.purpose <> ${EMAIL_CHANGE_REVERT}
                      or (s.created_at, s.token_hash) > (c.created_at, ${tokenHash}::text)
                    )
                  returning s.token_hash
                ), changed as (
                  update accounts a
                  set email = c.new_email, email_normal_form = c.new_email_normal_form,
                    password_hash = ${passwordHash}, password_changed_at = clock_timestamp(), updated_at = now()
                  from consumed c
                  where a.id = c.account_id
                  returning a.id
                ), restored as (
                  select c.account_id, c.new_email as email, l.locale
                  from consumed c
                  join locked l on l.id = c.account_id
                  union all
                  select a.id, a.email, a.locale
                  from account_email_tokens t
                  join accounts a on a.id = t.account_id
                  where ${isRetry}::boolean
                    and t.token_hash = ${tokenHash}
                    and t.purpose = ${EMAIL_CHANGE_REVERT}
                    and t.used_at is not null
                    and a.password_hash = ${passwordHash}
                    and not exists (select 1 from consumed)
                )
                select
                  exists (select 1 from restored) as is_done,
                  (select r.account_id from restored r) as account_id,
                  (select r.email from restored r) as restored_email,
                  (select r.locale from restored r) as restored_locale
              `,
            sql`
                update account_sessions
                set revoked_at = now()
                where revoked_at is null
                  and account_id in (
                    select t.account_id from account_email_tokens t
                    where t.token_hash = ${tokenHash}
                      and t.purpose = ${EMAIL_CHANGE_REVERT}
                      and t.used_at = now()
                  )
                returning token_hash
              `,
          ],
          { isolationLevel: "ReadCommitted" },
        ),
      );
      return revertRows;
    } catch (failure) {
      if (isAddressTakenViolation(failure)) return REVERT_ADDRESS_TAKEN_ROWS;
      throw failure;
    }
  });
  return revertOutcomeFrom(rows);
}

function revertOutcomeFrom(
  rows: readonly Record<string, unknown>[],
): EmailChangeRevertOutcome {
  const operation = "revert an e-mail address change";
  if (!isDone(rows, operation)) return { kind: "invalid" };
  const accountId = rows[0]?.["account_id"];
  const email = rows[0]?.["restored_email"];
  const locale = rows[0]?.["restored_locale"];
  if (
    typeof accountId !== "string" ||
    typeof email !== "string" ||
    typeof locale !== "string"
  ) {
    throw new AccountStoreError(operation);
  }
  return { kind: "reverted", accountId, email, locale };
}

/**
 * One read: whether a live (unused, unexpired by the database's clock) `email-change-revert` row of an account other
 * than `exceptAccountId` names the address. The account's own row does not reserve the address against it.
 */
export async function isAddressReserved(
  sql: ApplicationSql,
  question: AddressReservationQuestion,
): Promise<boolean> {
  requireValidAddressReservationQuestion(question);
  const { emailNormalForm, exceptAccountId } = question;
  const rows = await queryRows("look up an address reservation", () =>
    retryOnTransientFailure(
      () => sql`
          select exists (
            select 1 from account_email_tokens reservation
            where reservation.purpose = ${EMAIL_CHANGE_REVERT}
              and reservation.used_at is null
              and reservation.expires_at > now()
              and reservation.new_email_normal_form = ${emailNormalForm}
              and reservation.account_id <> ${exceptAccountId}
          ) as is_reserved
        `,
    ),
  );
  return isReservedFrom(rows);
}

function isReservedFrom(rows: readonly Record<string, unknown>[]): boolean {
  const [row, ...others] = rows;
  if (row === undefined || others.length > 0) {
    throw new AccountStoreError("look up an address reservation");
  }
  const isReserved = row["is_reserved"];
  if (typeof isReserved !== "boolean") {
    throw new AccountStoreError("look up an address reservation");
  }
  return isReserved;
}
