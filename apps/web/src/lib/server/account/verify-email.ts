import "server-only";

import type { NextResponse } from "next/server";

import { judgePassword } from "@lemnaria/configurator-domain";
import type { StoredAccount } from "@lemnaria/persistence";

import { reportAccountEvent } from "@/lib/server/account/account-log";
import {
  parseJsonObject,
  textMemberOf,
} from "@/lib/server/account/account-request";
import {
  invalidRequestResponse,
  linkOrPasswordInvalidResponse,
  signedInResponse,
  unavailableResponse,
} from "@/lib/server/account/account-responses";
import { countClaimableDesignsAtSignIn } from "@/lib/server/account/claimable-designs";
import { getAccountStore } from "@/lib/server/account/account-store-instance";
import { isWellFormedEmailToken } from "@/lib/server/account/email-token";
import { checkPassword, DUMMY_PHC } from "@/lib/server/account/password-hash";
import type { SessionCookieReader } from "@/lib/server/account/session-cookie";
import { startSession } from "@/lib/server/account/session-lifecycle";
import { sha256Hex } from "@/lib/server/sha256-hex";

// Flow 2 of the M8B plan: confirming an address with the link's token and the account's password. From the body on; the
// route has already checked the request's origin, media type and size and the network's limit (steps 1 to 4). There
// is no challenge: the token is the proof, and it was sent to the inbox alone. Every way of not succeeding is one
// answer, so a stranger holding a guess learns nothing of which part was wrong.

/** What is hashed in place of a password the policy refused: it is never compared, and no input of the client's is. */
const REFUSED_PASSWORD_STAND_IN = "refused";

export interface VerifyEmailRequest {
  readonly bodyText: string;
  /** The request's cookies: a live session they carry is revoked when the new one starts. */
  readonly presentedCookies: SessionCookieReader;
}

export async function verifyEmail({
  bodyText,
  presentedCookies,
}: VerifyEmailRequest): Promise<NextResponse> {
  const body = parseJsonObject(bodyText);
  if (body === undefined) return invalidRequestResponse();
  const token = textMemberOf(body, "token");
  const password = textMemberOf(body, "password");
  if (!isWellFormedEmailToken(token) || password === undefined) {
    return linkOrPasswordInvalidResponse();
  }
  const tokenHash = sha256Hex(token);
  const holding = await accountHoldingPassword({
    account: await findAccountOfLiveToken(tokenHash),
    password,
  });
  if (holding.kind === "unverifiable") return answerUnavailable();
  if (holding.kind === "not-held") return linkOrPasswordInvalidResponse();
  return confirmAndSignIn({
    account: holding.account,
    tokenHash,
    presentedCookies,
  });
}

/**
 * The password is compared on the platform that computes it; a platform that could not compute is not a wrong password,
 * so it is answered `503` with the token untouched, and the line says `unavailable`.
 */
function answerUnavailable(): NextResponse {
  reportAccountEvent({ event: "confirm-email", outcome: "unavailable" });
  return unavailableResponse();
}

async function findAccountOfLiveToken(
  tokenHash: string,
): Promise<StoredAccount | undefined> {
  const lookup = await getAccountStore().findByLiveToken({
    tokenHash,
    purpose: "verify-email",
  });
  return lookup.kind === "found" ? lookup.account : undefined;
}

/** `unverifiable` is the platform's failure to compute the comparison, told apart from a password that does not match. */
type PasswordHolding =
  | { readonly kind: "holds"; readonly account: StoredAccount }
  | { readonly kind: "not-held" }
  | { readonly kind: "unverifiable" };

/**
 * The account, when `password` is the one it holds. It is checked against **that** account's hash, taken from the
 * token's lookup and from nowhere else. A missing account, or a password the policy refuses, is verified against the
 * fixed dummy hash and answers nothing, so the time spent is the same for every way of failing.
 */
async function accountHoldingPassword({
  account,
  password,
}: {
  account: StoredAccount | undefined;
  password: string;
}): Promise<PasswordHolding> {
  const judgement = judgePassword({ password, email: account?.email ?? "" });
  const comparable = judgement.ok ? account : undefined;
  const check = await checkPassword({
    password: judgement.ok ? judgement.password : REFUSED_PASSWORD_STAND_IN,
    phc: comparable?.passwordHash ?? DUMMY_PHC,
  });
  if (check === "failed") return { kind: "unverifiable" };
  return check === "match" && comparable !== undefined
    ? { kind: "holds", account: comparable }
    : { kind: "not-held" };
}

/**
 * The same hash the password was verified against goes to `confirmEmail` and to the session: a registration that
 * replaced the password meanwhile makes the confirmation answer invalid, and one that lands after it makes the
 * session refuse to bind. Every result of the session store but a started session is a failed confirmation, with no
 * cookie set.
 */
async function confirmAndSignIn({
  account,
  tokenHash,
  presentedCookies,
}: {
  account: StoredAccount;
  tokenHash: string;
  presentedCookies: SessionCookieReader;
}): Promise<NextResponse> {
  const confirmation = await getAccountStore().confirmEmail({
    tokenHash,
    accountId: account.id,
    verifiedPasswordHash: account.passwordHash,
  });
  if (confirmation.kind === "invalid") return linkOrPasswordInvalidResponse();
  const response = signedInResponse(
    await countClaimableDesignsAtSignIn({
      holder: { role: account.role, isEmailVerified: true },
      cookies: presentedCookies,
    }),
  );
  const outcome = await startSession({
    response,
    accountId: account.id,
    role: account.role,
    expectedPasswordHash: account.passwordHash,
    presentedCookies,
  });
  reportAccountEvent({
    event: "confirm-email",
    outcome: outcome === "started" ? "succeeded" : "refused",
  });
  return outcome === "started" ? response : linkOrPasswordInvalidResponse();
}
