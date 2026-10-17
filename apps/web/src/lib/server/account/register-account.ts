import "server-only";

import type { NextResponse } from "next/server";

import {
  judgePassword,
  validateRegistration,
  type RegistrationFields,
} from "@lemnaria/configurator-domain";
import type { NewAccount } from "@lemnaria/persistence";

import {
  parseJsonObject,
  refusalOfChallenge,
  textMemberOf,
  type AccountRequestBody,
} from "@/lib/server/account/account-request";
import {
  answerOfJudgement,
  checkInboxResponse,
  invalidInputResponse,
  invalidRequestResponse,
  unavailableResponse,
  type AccountInputIssue,
} from "@/lib/server/account/account-responses";
import { getAccountStore } from "@/lib/server/account/account-store-instance";
import { reportAccountEvent } from "@/lib/server/account/account-log";
import { isBreachedPassword } from "@/lib/server/account/breached-password";
import {
  mintEmailToken,
  verifyEmailTokenExpiry,
} from "@/lib/server/account/email-token";
import { hashPassword } from "@/lib/server/account/password-hash";
import {
  prepareAccountMail,
  queueAccountMail,
  type AccountMailOrder,
  type AccountMailReadiness,
} from "@/lib/server/account/queue-account-mail";
import { routing } from "@/i18n/routing";
import { judgeAccountSubject } from "@/lib/server/rate-limit/judge-account-request";
import type { HeaderReader } from "@/lib/server/rate-limit/network-source";

// Flow 1 of the M8B plan: registering an address. From step 5 of the common order on. The route has already checked
// the request's origin, media type and size and the network's limit (steps 1 to 4). Whatever the address is, the
// answer is the same `202`, the work takes the same three store statements and one hash, and one mail is queued after
// the response, so nothing the caller can observe tells an unknown address from a pending or a confirmed one.

const PASSWORD_MEMBER = "password";
const TURNSTILE_ACTION = "register";

export interface RegisterRequest {
  readonly bodyText: string;
  readonly headers: HeaderReader;
}

type PasswordFieldJudgement =
  | { readonly ok: true; readonly password: string }
  | { readonly ok: false; readonly issue: AccountInputIssue };

type RegistrationInputJudgement =
  | {
      readonly ok: true;
      readonly registration: RegistrationFields;
      readonly password: string;
    }
  | { readonly ok: false; readonly issues: readonly AccountInputIssue[] };

/** The one mail the three statements decide on. `nothing-to-mail` is an account that vanished between them. */
type AddressRegistration =
  | AccountMailOrder
  | { readonly kind: "nothing-to-mail" };

export async function registerAccount({
  bodyText,
  headers,
}: RegisterRequest): Promise<NextResponse> {
  const body = parseJsonObject(bodyText);
  if (body === undefined) return invalidRequestResponse();
  const challenged = await refusalOfChallenge({
    body,
    expectedAction: TURNSTILE_ACTION,
  });
  if (challenged !== undefined) return challenged;
  const input = await judgeRegistrationInput(body);
  if (!input.ok) return invalidInputResponse(input.issues);
  const mail = prepareAccountMail();
  if (mail.kind === "unavailable") return unavailableResponse();
  const limited = answerOfJudgement(
    await judgeAccountSubject({
      purpose: "register",
      headers,
      address: input.registration.emailNormalForm,
    }),
  );
  if (limited !== undefined) return limited;
  await registerAddress({ input, readiness: mail.readiness });
  return checkInboxResponse();
}

/** Step 6: every field, and the password, judged without looking at the account. The breach check, which calls out, is
 *  made only when everything else is acceptable. */
async function judgeRegistrationInput(
  body: AccountRequestBody,
): Promise<RegistrationInputJudgement> {
  const validation = validateRegistration(body, routing.locales);
  const password = judgePasswordField(
    body,
    validation.ok ? validation.registration.email : "",
  );
  const issues = [
    ...(validation.ok ? [] : validation.issues),
    ...(password.ok ? [] : [password.issue]),
  ];
  if (!validation.ok || !password.ok) return { ok: false, issues };
  if ((await isBreachedPassword(password.password)) === "breached") {
    return {
      ok: false,
      issues: [{ field: PASSWORD_MEMBER, code: "PASSWORD_BREACHED" }],
    };
  }
  return {
    ok: true,
    registration: validation.registration,
    password: password.password,
  };
}

function judgePasswordField(
  body: AccountRequestBody,
  email: string,
): PasswordFieldJudgement {
  const password = textMemberOf(body, PASSWORD_MEMBER);
  if (password === undefined) {
    return {
      ok: false,
      issue: { field: PASSWORD_MEMBER, code: "PASSWORD_NOT_TEXT" },
    };
  }
  const judgement = judgePassword({ password, email });
  return judgement.ok
    ? judgement
    : { ok: false, issue: { field: PASSWORD_MEMBER, code: judgement.code } };
}

/** Step 8: hash once whatever the address is, make the three store statements, queue the one mail. */
async function registerAddress({
  input,
  readiness,
}: {
  input: Extract<RegistrationInputJudgement, { ok: true }>;
  readiness: AccountMailReadiness;
}): Promise<void> {
  const passwordHash = await hashPassword(input.password);
  const registration = await storeRegistration({
    ...input.registration,
    passwordHash,
  });
  if (registration.kind === "nothing-to-mail") {
    reportAccountEvent({ event: "register", outcome: "unavailable" });
    return;
  }
  queueAccountMail(readiness, registration);
}

/**
 * Exactly three statements in every branch, in the same order: the lookup, then the write (or a repeat of the lookup
 * where a confirmed account is left alone), then the token (or a second repeat). A repeated read is harmless and
 * is there so the time spent does not tell a confirmed address from the others (L4a security review).
 */
async function storeRegistration(
  account: NewAccount,
): Promise<AddressRegistration> {
  const store = getAccountStore();
  const found = await store.findByNormalForm(account.emailNormalForm);
  if (found.kind === "found" && found.account.isEmailVerified) {
    await store.findByNormalForm(account.emailNormalForm);
    await store.findByNormalForm(account.emailNormalForm);
    return alreadyRegistered(found.account.email, found.account.locale);
  }
  const accountId = await writeUnverifiedRegistration(found.kind, account);
  if (accountId === undefined) {
    await store.findByNormalForm(account.emailNormalForm);
    return alreadyRegistered(account.email, account.locale);
  }
  return issueConfirmationToken(accountId, account);
}

/** One statement; a second only when a racing registration took the address between the lookup and the insert. Answers
 *  the account's id, or `undefined` when the address belongs to a confirmed account, which is never touched. */
async function writeUnverifiedRegistration(
  lookup: "found" | "none",
  account: NewAccount,
): Promise<string | undefined> {
  const store = getAccountStore();
  if (lookup === "none") {
    const creation = await store.createUnverified(account);
    if (creation.kind === "created") return creation.accountId;
  }
  const replacement = await store.replaceUnverifiedRegistration(account);
  return replacement.kind === "replaced" ? replacement.accountId : undefined;
}

async function issueConfirmationToken(
  accountId: string,
  account: NewAccount,
): Promise<AddressRegistration> {
  const token = mintEmailToken();
  const issue = await getAccountStore().issueToken({
    accountId,
    purpose: "verify-email",
    tokenHash: token.hash,
    expiresAt: verifyEmailTokenExpiry(),
  });
  if (issue.kind === "refused") return { kind: "nothing-to-mail" };
  return {
    kind: "confirm-email",
    recipient: account.email,
    locale: account.locale,
    token: token.value,
  };
}

function alreadyRegistered(
  recipient: string,
  locale: string,
): AddressRegistration {
  return { kind: "already-registered", recipient, locale };
}
