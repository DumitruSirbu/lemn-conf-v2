import "server-only";

import { after, type NextResponse } from "next/server";

import {
  judgeAccountEmail,
  judgePassword,
} from "@lemnaria/configurator-domain";
import type { StoredAccount } from "@lemnaria/persistence";

import { reportAccountEvent } from "@/lib/server/account/account-log";
import {
  parseJsonObject,
  refusalOfChallenge,
  textMemberOf,
  type AccountRequestBody,
} from "@/lib/server/account/account-request";
import {
  answerOfJudgement,
  invalidCredentialsResponse,
  invalidInputResponse,
  invalidRequestResponse,
  signedInResponse,
  unavailableResponse,
  type AccountInputIssue,
} from "@/lib/server/account/account-responses";
import { countClaimableDesignsAtSignIn } from "@/lib/server/account/claimable-designs";
import { getAccountStore } from "@/lib/server/account/account-store-instance";
import {
  mintEmailToken,
  verifyEmailTokenExpiry,
} from "@/lib/server/account/email-token";
import {
  checkPassword,
  DUMMY_PHC,
  hashPassword,
  needsRehash,
  REFUSED_PASSWORD_STAND_IN,
} from "@/lib/server/account/password-hash";
import {
  prepareAccountMail,
  queueAccountMail,
} from "@/lib/server/account/queue-account-mail";
import type { SessionCookieReader } from "@/lib/server/account/session-cookie";
import { startSession } from "@/lib/server/account/session-lifecycle";
import { judgeAccountSubject } from "@/lib/server/rate-limit/judge-account-request";
import type { HeaderReader } from "@/lib/server/rate-limit/network-source";

// Flow 3 of the M8B plan: signing in. From step 5 of the common order on; the route has already checked the request's
// origin, media type and size and the network's limit (steps 1 to 4). Every way of not signing in is one `401`: an
// unknown address, a wrong password, a password the policy refuses, and a correct password on an address not yet
// confirmed (ADR 0169 Amendment A). Each of them does the same work before the answer: the address's buckets, one
// lookup and exactly one argon2id verification.
//
// The address's buckets are counted for every valid attempt, before the lookup and before the password is looked at
// (plan section 5), so nothing here counts a "failed" attempt a second time. That is also why a platform failure of the
// hash (answered `503`) cannot be un-counted: the attempt was counted before it was known to be one.

const TURNSTILE_ACTION = "login";
const PASSWORD_MEMBER = "password";

export interface SignInRequest {
  readonly bodyText: string;
  readonly headers: HeaderReader;
  /** The request's cookies: a live session they carry is revoked when the new one starts. */
  readonly presentedCookies: SessionCookieReader;
}

interface Attempt {
  /** The address as the limiter counts it and as accounts are looked up, from the same domain rule registration uses.
   */
  readonly emailNormalForm: string;
  /** The NFKC password, or `undefined` for one the password policy refused. */
  readonly password: string | undefined;
}

type AttemptJudgement =
  | { readonly ok: true; readonly attempt: Attempt }
  | { readonly ok: false; readonly issues: readonly AccountInputIssue[] };

export async function signIn(request: SignInRequest): Promise<NextResponse> {
  const body = parseJsonObject(request.bodyText);
  if (body === undefined) return invalidRequestResponse();
  const challenged = await refusalOfChallenge({
    body,
    expectedAction: TURNSTILE_ACTION,
  });
  if (challenged !== undefined) return challenged;
  const judgement = judgeAttempt(body);
  if (!judgement.ok) return invalidInputResponse(judgement.issues);
  const limited = answerOfJudgement(
    await judgeAccountSubject({
      purpose: "login",
      headers: request.headers,
      address: judgement.attempt.emailNormalForm,
    }),
  );
  if (limited !== undefined) return limited;
  return answerAttempt({ attempt: judgement.attempt, request });
}

/** Step 6: the address by the registration's rule, the password only as text. Nothing here looks at an account, and a
 *  password the policy refuses is not a field error: it is a wrong password, whatever the address. */
function judgeAttempt(body: AccountRequestBody): AttemptJudgement {
  const address = judgeAccountEmail(textMemberOf(body, "email"));
  const typedPassword = textMemberOf(body, PASSWORD_MEMBER);
  const issues: AccountInputIssue[] = [
    ...(address.ok ? [] : [address.issue]),
    ...(typedPassword === undefined
      ? [{ field: PASSWORD_MEMBER, code: "PASSWORD_NOT_TEXT" } as const]
      : []),
  ];
  if (!address.ok || typedPassword === undefined) {
    return { ok: false, issues };
  }
  const { email, emailNormalForm } = address;
  const judgement = judgePassword({ password: typedPassword, email });
  return {
    ok: true,
    attempt: {
      emailNormalForm,
      password: judgement.ok ? judgement.password : undefined,
    },
  };
}

/** What a person claims by signing in: an account that exists, and a password the policy accepted. */
interface Claim {
  readonly account: StoredAccount;
  readonly password: string;
}

/** Step 8: one lookup, one verification, then the branch. */
async function answerAttempt({
  attempt,
  request,
}: {
  attempt: Attempt;
  request: SignInRequest;
}): Promise<NextResponse> {
  const claim = await claimOf(attempt);
  const check = await checkPassword({
    password: claim?.password ?? REFUSED_PASSWORD_STAND_IN,
    phc: claim?.account.passwordHash ?? DUMMY_PHC,
  });
  if (check === "failed") return answerUnavailable();
  if (claim === undefined || check !== "match") return answerFailedSignIn();
  if (!claim.account.isEmailVerified) {
    scheduleConfirmationResend({
      account: claim.account,
      emailNormalForm: attempt.emailNormalForm,
      headers: request.headers,
    });
    return answerFailedSignIn();
  }
  return signInVerifiedAccount({
    ...claim,
    presentedCookies: request.presentedCookies,
  });
}

/** The one lookup. An unknown address and a refused password are both no claim, and are verified against the dummy
 *  hash. */
async function claimOf({
  emailNormalForm,
  password,
}: Attempt): Promise<Claim | undefined> {
  const lookup = await getAccountStore().findByNormalForm(emailNormalForm);
  return lookup.kind === "found" && password !== undefined
    ? { account: lookup.account, password }
    : undefined;
}

/**
 * The hash is compared on the platform that computes it; a platform that could not compute is not a wrong password, so
 * it is answered `503` and the line says `unavailable`. The attempt itself stays counted (see the file's head).
 */
function answerUnavailable(): NextResponse {
  reportAccountEvent({ event: "login", outcome: "unavailable" });
  return unavailableResponse();
}

function answerFailedSignIn(): NextResponse {
  reportAccountEvent({ event: "login", outcome: "refused" });
  return invalidCredentialsResponse();
}

/**
 * The session is bound to the hash the account holds **after** any rehash. Every result of the session store but a
 * started session is a failed sign-in, with no cookie set: a reset or a rehash that won the race (`stale`) and a
 * vanished account (`refused`) alike.
 */
async function signInVerifiedAccount({
  account,
  password,
  presentedCookies,
}: {
  account: StoredAccount;
  password: string;
  presentedCookies: SessionCookieReader;
}): Promise<NextResponse> {
  const response = signedInResponse(
    await countClaimableDesignsAtSignIn({
      holder: { role: account.role, isEmailVerified: account.isEmailVerified },
      cookies: presentedCookies,
    }),
  );
  const outcome = await startSession({
    response,
    accountId: account.id,
    role: account.role,
    expectedPasswordHash: await passwordHashAfterRehash({ account, password }),
    presentedCookies,
  });
  if (outcome !== "started") return answerFailedSignIn();
  reportAccountEvent({ event: "login", outcome: "succeeded" });
  return response;
}

/**
 * A hash made with older parameters is replaced by one at the current cost, as a compare-and-set on the hash that was
 * verified, so it cannot restore a password a reset replaced. The new hash is the account's only when the store says it
 * replaced; on `stale` the verified hash is answered, and the session store then refuses to bind to it.
 */
async function passwordHashAfterRehash({
  account,
  password,
}: {
  account: StoredAccount;
  password: string;
}): Promise<string> {
  if (!needsRehash(account.passwordHash)) return account.passwordHash;
  const replacementHash = await hashPassword(password);
  const rehash = await getAccountStore().replacePasswordHash({
    accountId: account.id,
    expectedPasswordHash: account.passwordHash,
    passwordHash: replacementHash,
  });
  return rehash.kind === "replaced" ? replacementHash : account.passwordHash;
}

interface ConfirmationResend {
  readonly account: StoredAccount;
  readonly emailNormalForm: string;
  readonly headers: HeaderReader;
}

/**
 * Everything the resend does runs after the response, so the answer is the wrong-password answer after the same work:
 * the limiter count, the readiness of the mail, the token and the mail. A refusal or an unavailability is silent, and
 * nothing is thrown out of the job (a thrown value reaches the framework's log, and a driver error can quote an
 * address). The mail goes to the account's own address and locale, not to what was typed.
 */
function scheduleConfirmationResend(resend: ConfirmationResend): void {
  try {
    after(() => resendConfirmation(resend));
  } catch {
    reportAccountEvent({ event: "mail", outcome: "unavailable" });
  }
}

async function resendConfirmation({
  account,
  emailNormalForm,
  headers,
}: ConfirmationResend): Promise<void> {
  try {
    const judgement = await judgeAccountSubject({
      purpose: "mail",
      headers,
      address: emailNormalForm,
    });
    if (judgement.decision.kind !== "allow") return;
    const mail = prepareAccountMail();
    if (mail.kind === "unavailable") return;
    const token = mintEmailToken();
    const issue = await getAccountStore().issueToken({
      accountId: account.id,
      purpose: "verify-email",
      tokenHash: token.hash,
      expiresAt: verifyEmailTokenExpiry(),
    });
    if (issue.kind === "refused") return;
    queueAccountMail(mail.readiness, {
      kind: "confirm-email",
      recipient: account.email,
      locale: account.locale,
      token: token.value,
    });
  } catch {
    reportAccountEvent({ event: "mail", outcome: "unavailable" });
  }
}
