import "server-only";

import type { NextResponse } from "next/server";

import { validatePasswordChange } from "@lemnaria/configurator-domain";
import type {
  PasswordChange,
  PasswordChangeOutcome,
  StoredAccount,
} from "@lemnaria/persistence";

import { reportAccountEvent } from "@/lib/server/account/account-log";
import {
  parseJsonObject,
  textMemberOf,
} from "@/lib/server/account/account-request";
import {
  answerOfJudgement,
  invalidInputResponse,
  invalidRequestResponse,
  passwordChangedKeepingSessionResponse,
  passwordChangedSignInResponse,
  unauthenticatedResponse,
  unavailableResponse,
  wrongPasswordResponse,
} from "@/lib/server/account/account-responses";
import { getAccountStore } from "@/lib/server/account/account-store-instance";
import { isBreachedPassword } from "@/lib/server/account/breached-password";
import type { SignedInSession } from "@/lib/server/account/current-session";
import { schedulePasswordChangedNotice } from "@/lib/server/account/password-changed-notice";
import {
  checkPassword,
  hashPassword,
  REFUSED_PASSWORD_STAND_IN,
} from "@/lib/server/account/password-hash";
import {
  clearSessionCookie,
  type SessionCookieReader,
} from "@/lib/server/account/session-cookie";
import { startSession } from "@/lib/server/account/session-lifecycle";
import { judgeAccountSubject } from "@/lib/server/rate-limit/judge-account-request";
import type { HeaderReader } from "@/lib/server/rate-limit/network-source";

// E7 of the Lot 2 plan: a signed-in account changes its password. From step 5 of the common order on; the route has
// checked the origin, media type, size, session and capability (steps 1 to 4). The account is the session's.
//
// Order of work: the shape of both passwords (free, and the same whatever the current one is), then the account's
// password-check buckets, then exactly one argon2id verification of the current password, then the breach check and the
// hash of the new one. The verification is the same work for a right password, a wrong one and a text the password
// policy refuses (that one is verified as a stand-in against the account's own hash): the answer is `wrong-password`
// for the last two, and the time does not tell them apart.

const CURRENT_PASSWORD_MEMBER = "currentPassword";
const NEW_PASSWORD_MEMBER = "newPassword";

export interface OwnPasswordChange {
  readonly session: SignedInSession;
  readonly bodyText: string;
  readonly headers: HeaderReader;
  /** The request's cookies: the presented session is already ended by the change, and is revoked once more. */
  readonly presentedCookies: SessionCookieReader;
}

/** What the domain accepted. */
interface JudgedPasswords {
  /** The NFKC form to verify, or `undefined` for one the length bounds refuse: it can match no hash. */
  readonly currentPassword: string | undefined;
  /** The NFKC form to hash. */
  readonly newPassword: string;
}

export async function changeOwnPassword({
  session,
  bodyText,
  headers,
  presentedCookies,
}: OwnPasswordChange): Promise<NextResponse> {
  const body = parseJsonObject(bodyText);
  if (body === undefined) return invalidRequestResponse();
  const validation = validatePasswordChange({
    currentPassword: textMemberOf(body, CURRENT_PASSWORD_MEMBER),
    newPassword: textMemberOf(body, NEW_PASSWORD_MEMBER),
    accountEmail: session.email,
  });
  if (!validation.ok) return invalidInputResponse([validation.issue]);
  const limited = answerOfJudgement(
    await judgeAccountSubject({
      purpose: "password-check",
      headers,
      accountId: session.accountId,
    }),
  );
  if (limited !== undefined) return limited;
  const passwords = {
    currentPassword: validation.currentPassword,
    newPassword: validation.newPassword,
  };
  return answerChange({ session, passwords, presentedCookies });
}

/** One lookup, one verification, then the branch. */
async function answerChange({
  session,
  passwords,
  presentedCookies,
}: {
  session: SignedInSession;
  passwords: JudgedPasswords;
  presentedCookies: SessionCookieReader;
}): Promise<NextResponse> {
  const lookup = await getAccountStore().findById(session.accountId);
  if (lookup.kind === "none") return unauthenticatedResponse();
  const { account } = lookup;
  const refused = await refusalOfCurrentPassword(passwords, account);
  if (refused !== undefined) return refused;
  if ((await isBreachedPassword(passwords.newPassword)) === "breached") {
    return invalidInputResponse([
      { field: NEW_PASSWORD_MEMBER, code: "PASSWORD_BREACHED" },
    ]);
  }
  const passwordHash = await hashPassword(passwords.newPassword);
  const outcome = await changeOrRecover({
    accountId: account.id,
    expectedPasswordHash: account.passwordHash,
    passwordHash,
  });
  if (outcome.kind === "stale") return answerWrongPassword();
  schedulePasswordChangedNotice(account);
  return replacingSessionResponse({
    session,
    expectedPasswordHash: passwordHash,
    presentedCookies,
  });
}

/**
 * The one argon2id verification, whatever was typed: a text the password policy refused is verified as a stand-in
 * against the account's own hash, so it costs what a wrong password costs. A platform that could not compute is not a
 * wrong password, and is answered `503`.
 */
async function refusalOfCurrentPassword(
  { currentPassword }: JudgedPasswords,
  account: StoredAccount,
): Promise<NextResponse | undefined> {
  const check = await checkPassword({
    password: currentPassword ?? REFUSED_PASSWORD_STAND_IN,
    phc: account.passwordHash,
  });
  if (check === "failed") return answerUnavailable();
  const isVerified = currentPassword !== undefined && check === "match";
  return isVerified ? undefined : answerWrongPassword();
}

function answerUnavailable(): NextResponse {
  reportAccountEvent({ event: "password-change", outcome: "unavailable" });
  return unavailableResponse();
}

function answerWrongPassword(): NextResponse {
  reportAccountEvent({ event: "password-change", outcome: "refused" });
  return wrongPasswordResponse();
}

/**
 * `changePassword` can throw after its transaction committed (an acknowledgement lost past the retry). The account is
 * read again, and a stored hash equal to the one just made, which carries a random salt and so is no one else's, means
 * the change took effect: it is answered as the success it is, since a `503` would tell the person nothing changed.
 * Any other state, and a read that fails, rethrow the failure for the route's `503`.
 */
async function changeOrRecover(
  change: PasswordChange,
): Promise<PasswordChangeOutcome> {
  try {
    return await getAccountStore().changePassword(change);
  } catch (failure) {
    if (await isNewHashStored(change)) return { kind: "changed" };
    throw failure;
  }
}

async function isNewHashStored({
  accountId,
  passwordHash,
}: PasswordChange): Promise<boolean> {
  try {
    const lookup = await getAccountStore().findById(accountId);
    return (
      lookup.kind === "found" && lookup.account.passwordHash === passwordHash
    );
  } catch {
    return false;
  }
}

/**
 * Every session of the account ended with the change, this device's too, so this device is given a new one, bound to
 * the new hash, on the success response itself. The password is changed either way: if the new session cannot be
 * started (a store failure, or a racing reset or change that replaced the hash again) the person is answered `401`
 * `password-changed-sign-in` with the cookie cleared, which is the truth ("changed, now signed out"), and never a `200`
 * without a live session.
 */
async function replacingSessionResponse({
  session,
  expectedPasswordHash,
  presentedCookies,
}: {
  session: SignedInSession;
  expectedPasswordHash: string;
  presentedCookies: SessionCookieReader;
}): Promise<NextResponse> {
  const response = passwordChangedKeepingSessionResponse();
  const outcome = await startSessionOrFail({
    response,
    accountId: session.accountId,
    role: session.role,
    expectedPasswordHash,
    presentedCookies,
  });
  if (outcome === "started") {
    reportAccountEvent({ event: "password-change", outcome: "succeeded" });
    return response;
  }
  reportAccountEvent({ event: "password-change", outcome: "unavailable" });
  const signedOut = passwordChangedSignInResponse();
  clearSessionCookie(signedOut);
  return signedOut;
}

async function startSessionOrFail(
  start: Parameters<typeof startSession>[0],
): Promise<"started" | "failed"> {
  try {
    return (await startSession(start)) === "started" ? "started" : "failed";
  } catch {
    return "failed";
  }
}
