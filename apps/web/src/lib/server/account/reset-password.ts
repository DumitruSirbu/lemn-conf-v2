import "server-only";

import { after, type NextResponse } from "next/server";

import {
  judgeAccountEmail,
  judgePassword,
} from "@lemnaria/configurator-domain";
import type {
  PasswordResetOutcome,
  StoredAccount,
} from "@lemnaria/persistence";

import { reportAccountEvent } from "@/lib/server/account/account-log";
import {
  parseJsonObject,
  refusalOfChallenge,
  textMemberOf,
} from "@/lib/server/account/account-request";
import {
  answerOfJudgement,
  checkInboxResponse,
  invalidInputResponse,
  invalidRequestResponse,
  linkInvalidResponse,
  passwordChangedResponse,
  unavailableResponse,
  type AccountInputIssue,
} from "@/lib/server/account/account-responses";
import { getAccountStore } from "@/lib/server/account/account-store-instance";
import { isBreachedPassword } from "@/lib/server/account/breached-password";
import {
  isWellFormedEmailToken,
  mintEmailToken,
  resetPasswordTokenExpiry,
} from "@/lib/server/account/email-token";
import { hashPassword } from "@/lib/server/account/password-hash";
import { schedulePasswordChangedNotice } from "@/lib/server/account/password-changed-notice";
import {
  prepareAccountMail,
  queueAccountMail,
  type AccountMailReadiness,
} from "@/lib/server/account/queue-account-mail";
import { getSessionStore } from "@/lib/server/account/session-store-instance";
import { judgeAccountSubject } from "@/lib/server/rate-limit/judge-account-request";
import type { HeaderReader } from "@/lib/server/rate-limit/network-source";
import { sha256Hex } from "@/lib/server/sha256-hex";

// Flows 6 and 7 of the M8B plan: asking for a reset link and using it. From step 5 of the common order on; the route
// has already checked the request's origin, media type and size and the network's limit (steps 1 to 4).
//
// The request answers one `202` for every address. Before the answer it does the same things whatever the address is:
// the challenge, the address's syntax, the address's bucket. The lookup, the token and the mail all run in `after()`,
// so no work that differs between a verified account and any other address is visible in the response. The completion
// starts no session: the client signs in afterwards, with the password it chose.

const REQUEST_TURNSTILE_ACTION = "reset";
const EMAIL_MEMBER = "email";
const TOKEN_MEMBER = "token";
const NEW_PASSWORD_MEMBER = "newPassword";
const PASSWORD_FIELD = "password";

export interface ResetLinkRequest {
  readonly bodyText: string;
  readonly headers: HeaderReader;
}

export interface ResetCompletionRequest {
  readonly bodyText: string;
}

export async function requestPasswordReset({
  bodyText,
  headers,
}: ResetLinkRequest): Promise<NextResponse> {
  const body = parseJsonObject(bodyText);
  if (body === undefined) return invalidRequestResponse();
  const challenged = await refusalOfChallenge({
    body,
    expectedAction: REQUEST_TURNSTILE_ACTION,
  });
  if (challenged !== undefined) return challenged;
  const address = judgeAccountEmail(textMemberOf(body, EMAIL_MEMBER));
  if (!address.ok) return invalidInputResponse([address.issue]);
  const mail = prepareAccountMail();
  if (mail.kind === "unavailable") return unavailableResponse();
  const limited = answerOfJudgement(
    await judgeAccountSubject({
      purpose: "password-reset-request",
      headers,
      address: address.emailNormalForm,
    }),
  );
  if (limited !== undefined) return limited;
  scheduleResetLink({
    emailNormalForm: address.emailNormalForm,
    readiness: mail.readiness,
  });
  reportAccountEvent({ event: "password-reset-request", outcome: "succeeded" });
  return checkInboxResponse();
}

interface ResetLinkJob {
  readonly emailNormalForm: string;
  readonly readiness: AccountMailReadiness;
}

/** A thrown value reaches the framework's log and a driver error can quote an address, so nothing is thrown out. */
function scheduleResetLink(job: ResetLinkJob): void {
  try {
    after(() => sendResetLink(job));
  } catch {
    reportAccountEvent({ event: "mail", outcome: "unavailable" });
  }
}

/** The address's bucket was counted before the answer, so nothing here counts it again. Only a verified account gets a
 *  token and a mail; for any other address the job ends after its lookup. The mail goes to the account's own address
 *  and locale, not to what was typed. */
async function sendResetLink({
  emailNormalForm,
  readiness,
}: ResetLinkJob): Promise<void> {
  try {
    const token = await issueResetTokenToVerifiedAccount(emailNormalForm);
    if (token === undefined) return;
    queueAccountMail(readiness, {
      kind: "reset-password",
      recipient: token.account.email,
      locale: token.account.locale,
      token: token.value,
    });
  } catch {
    reportAccountEvent({ event: "mail", outcome: "unavailable" });
  }
}

interface IssuedResetToken {
  readonly account: StoredAccount;
  readonly value: string;
}

/** The lookup and the token insert, with a failure of the store written as the reset request's own, apart from a
 *  failure of the mail. Nothing for an address that is unknown, unconfirmed, or whose token the store refused. */
async function issueResetTokenToVerifiedAccount(
  emailNormalForm: string,
): Promise<IssuedResetToken | undefined> {
  try {
    const store = getAccountStore();
    const lookup = await store.findByNormalForm(emailNormalForm);
    if (lookup.kind !== "found" || !lookup.account.isEmailVerified) return;
    const { account } = lookup;
    const token = mintEmailToken();
    const issue = await store.issueToken({
      accountId: account.id,
      purpose: "reset-password",
      tokenHash: token.hash,
      expiresAt: resetPasswordTokenExpiry(),
    });
    return issue.kind === "refused"
      ? undefined
      : { account, value: token.value };
  } catch {
    reportAccountEvent({
      event: "password-reset-request",
      outcome: "unavailable",
    });
    return undefined;
  }
}

type NewPasswordJudgement =
  | { readonly ok: true; readonly password: string }
  | { readonly ok: false; readonly issue: AccountInputIssue };

/**
 * Flow 7. The token's shape is checked before anything is hashed, and the account it names is read before the password
 * is looked at, so a stranger without a live link learns nothing of the password rules. A password the policy or the
 * breach check refuses consumes no token. The hash is made once, before the token is spent: a platform that cannot
 * compute it throws, which the route answers `503`, and the token stays whole.
 */
export async function completePasswordReset({
  bodyText,
}: ResetCompletionRequest): Promise<NextResponse> {
  const body = parseJsonObject(bodyText);
  if (body === undefined) return invalidRequestResponse();
  const token = textMemberOf(body, TOKEN_MEMBER);
  if (!isWellFormedEmailToken(token)) return linkInvalidResponse();
  const tokenHash = sha256Hex(token);
  const account = await findAccountOfLiveResetToken(tokenHash);
  if (account === undefined) return linkInvalidResponse();
  const judgement = await judgeNewPassword({
    password: textMemberOf(body, NEW_PASSWORD_MEMBER),
    email: account.email,
  });
  if (!judgement.ok) return invalidInputResponse([judgement.issue]);
  const passwordHash = await hashPassword(judgement.password);
  const reset = await completeResetOrRecover({
    account,
    tokenHash,
    passwordHash,
  });
  if (reset.kind === "invalid") return linkInvalidResponse();
  await endEverySessionBestEffort(account.id);
  schedulePasswordChangedNotice(account);
  reportAccountEvent({
    event: "password-reset-complete",
    outcome: "succeeded",
  });
  return passwordChangedResponse();
}

interface ResetToComplete {
  readonly account: StoredAccount;
  readonly tokenHash: string;
  readonly passwordHash: string;
}

/**
 * `completeReset` can throw after its transaction committed (an acknowledgement lost past the retry). The account is
 * read again, and a stored hash equal to the one just made, a hash that carries a random salt and so is no one else's,
 * means the reset took effect: it is answered as the success it is, since a `503` would send the client to a link
 * already spent. Any other state, and a read that fails, answer as before: the failure is rethrown for the route's
 * `503`.
 */
async function completeResetOrRecover({
  account,
  tokenHash,
  passwordHash,
}: ResetToComplete): Promise<PasswordResetOutcome> {
  try {
    return await getAccountStore().completeReset({ tokenHash, passwordHash });
  } catch (failure) {
    if (await isPasswordHashStored({ account, passwordHash })) {
      return { kind: "password-changed" };
    }
    throw failure;
  }
}

async function isPasswordHashStored({
  account,
  passwordHash,
}: Pick<ResetToComplete, "account" | "passwordHash">): Promise<boolean> {
  try {
    const address = judgeAccountEmail(account.email);
    if (!address.ok) return false;
    const lookup = await getAccountStore().findByNormalForm(
      address.emailNormalForm,
    );
    return (
      lookup.kind === "found" &&
      lookup.account.id === account.id &&
      lookup.account.passwordHash === passwordHash
    );
  } catch {
    return false;
  }
}

/** The account a live reset token names, or nothing for an unknown, used, expired or superseded token and for an
 *  account never confirmed: `completeReset` refuses the last too, and this saves the hashing. */
async function findAccountOfLiveResetToken(
  tokenHash: string,
): Promise<StoredAccount | undefined> {
  const lookup = await getAccountStore().findByLiveToken({
    tokenHash,
    purpose: "reset-password",
  });
  return lookup.kind === "found" && lookup.account.isEmailVerified
    ? lookup.account
    : undefined;
}

/** The registration's rules: NFKC and the length cap first, then the policy, then the breach corpus. When the corpus
 *  cannot be reached the length rule alone decides (owner decision Q-L2). */
async function judgeNewPassword({
  password,
  email,
}: {
  password: string | undefined;
  email: string;
}): Promise<NewPasswordJudgement> {
  if (password === undefined) {
    return refusalOf("PASSWORD_NOT_TEXT");
  }
  const judgement = judgePassword({ password, email });
  if (!judgement.ok) return refusalOf(judgement.code);
  if ((await isBreachedPassword(judgement.password)) === "breached") {
    return refusalOf("PASSWORD_BREACHED");
  }
  return judgement;
}

function refusalOf(code: AccountInputIssue["code"]): NewPasswordJudgement {
  return { ok: false, issue: { field: PASSWORD_FIELD, code } };
}

/**
 * `completeReset` already revoked the account's sessions in its second statement; this pass catches a session that
 * committed after it. The password is changed either way, so a failure here is written down and does not change the
 * answer: telling the client "unavailable" for a reset that took effect would send it to a link that no longer works.
 */
async function endEverySessionBestEffort(accountId: string): Promise<void> {
  try {
    await getSessionStore().revokeAllForAccount(accountId);
  } catch {
    reportAccountEvent({ event: "session-revoke", outcome: "unavailable" });
  }
}
