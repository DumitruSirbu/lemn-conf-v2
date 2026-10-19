import "server-only";

import { after, type NextResponse } from "next/server";

import {
  readExistingPassword,
  validateEmailChange,
} from "@lemnaria/configurator-domain";
import type { StoredAccount } from "@lemnaria/persistence";

import { reportAccountEvent } from "@/lib/server/account/account-log";
import {
  parseJsonObject,
  textMemberOf,
  type AccountRequestBody,
} from "@/lib/server/account/account-request";
import {
  answerOfJudgement,
  checkInboxResponse,
  invalidInputResponse,
  invalidRequestResponse,
  unauthenticatedResponse,
  unavailableResponse,
  type AccountInputIssue,
} from "@/lib/server/account/account-responses";
import { getAccountStore } from "@/lib/server/account/account-store-instance";
import { refusalOfCurrentPassword } from "@/lib/server/account/current-password-check";
import type { SignedInSession } from "@/lib/server/account/current-session";
import {
  emailChangeTokenExpiry,
  mintEmailToken,
} from "@/lib/server/account/email-token";
import {
  prepareAccountMail,
  queueAccountMail,
  type AccountMailReadiness,
} from "@/lib/server/account/queue-account-mail";
import { judgeAccountSubject } from "@/lib/server/rate-limit/judge-account-request";
import type { HeaderReader } from "@/lib/server/rate-limit/network-source";

// E8 of the Lot 2 plan: a signed-in account asks to change its address. From step 5 of the common order on; the route
// has checked the origin, media type, size, session and capability (steps 1 to 4). The account is the session's.
//
// The answer is `202` and the same for a free address, an address another account holds, and the account's own. Before
// it the request does the same things whatever the address is: the shape of both fields, the account's password-check
// buckets, one argon2id verification of the current password, then the two mail buckets, counted for every request that
// verified. The lookup of the address, the token and every mail run in `after()`, so no work that differs between the
// three cases is visible in the response.

const CURRENT_PASSWORD_MEMBER = "currentPassword";
const NEW_EMAIL_MEMBER = "newEmail";
const PASSWORD_NOT_TEXT = "PASSWORD_NOT_TEXT";

export interface EmailChangeRequest {
  readonly session: SignedInSession;
  readonly bodyText: string;
  readonly headers: HeaderReader;
}

/** The address the domain accepted. */
interface AcceptedAddress {
  readonly email: string;
  readonly emailNormalForm: string;
  readonly isCurrentAddress: boolean;
}

/** What the domain accepted of the body. */
interface JudgedChange {
  /** The NFKC form to verify, or `undefined` for one the length bounds refuse. */
  readonly currentPassword: string | undefined;
  readonly target: AcceptedAddress;
}

type ChangeJudgement =
  | { readonly ok: true; readonly change: JudgedChange }
  | { readonly ok: false; readonly issue: AccountInputIssue };

export async function requestEmailChange({
  session,
  bodyText,
  headers,
}: EmailChangeRequest): Promise<NextResponse> {
  const body = parseJsonObject(bodyText);
  if (body === undefined) return invalidRequestResponse();
  const judgement = judgeChange(body, session.email);
  if (!judgement.ok) return invalidInputResponse([judgement.issue]);
  const mail = prepareAccountMail();
  if (mail.kind === "unavailable") return unavailableResponse();
  const limited = answerOfJudgement(
    await judgeAccountSubject({
      purpose: "password-check",
      headers,
      accountId: session.accountId,
      event: "email-change",
    }),
  );
  if (limited !== undefined) return limited;
  return answerVerifiedRequest({
    session,
    headers,
    change: judgement.change,
    readiness: mail.readiness,
  });
}

/** The current password is checked for its shape first, then the new address, and the first issue is the one returned.
 */
function judgeChange(
  body: AccountRequestBody,
  accountEmail: string,
): ChangeJudgement {
  const typedPassword = textMemberOf(body, CURRENT_PASSWORD_MEMBER);
  if (typedPassword === undefined) {
    return refusalOf(CURRENT_PASSWORD_MEMBER, PASSWORD_NOT_TEXT);
  }
  const address = validateEmailChange({
    newEmail: textMemberOf(body, NEW_EMAIL_MEMBER),
    accountEmail,
  });
  if (!address.ok) return { ok: false, issue: address.issue };
  const existing = readExistingPassword(typedPassword);
  return {
    ok: true,
    change: {
      currentPassword: existing.ok ? existing.password : undefined,
      target: address,
    },
  };
}

function refusalOf(
  field: AccountInputIssue["field"],
  code: AccountInputIssue["code"],
): ChangeJudgement {
  return { ok: false, issue: { field, code } };
}

interface VerifiedRequest {
  readonly session: SignedInSession;
  readonly headers: HeaderReader;
  readonly change: JudgedChange;
  readonly readiness: AccountMailReadiness;
}

/** One lookup, one verification, the mail buckets, then the job and the answer. */
async function answerVerifiedRequest({
  session,
  headers,
  change,
  readiness,
}: VerifiedRequest): Promise<NextResponse> {
  const lookup = await getAccountStore().findById(session.accountId);
  if (lookup.kind === "none") return unauthenticatedResponse();
  const { account } = lookup;
  const refused = await refusalOfCurrentPassword({
    currentPassword: change.currentPassword,
    account,
    event: "email-change",
  });
  if (refused !== undefined) return refused;
  const limited = await refusalOfMailLimits({
    accountId: account.id,
    address: change.target.emailNormalForm,
    headers,
  });
  if (limited !== undefined) return limited;
  scheduleChangeMail({ requester: account, target: change.target, readiness });
  reportAccountEvent({ event: "email-change", outcome: "succeeded" });
  return checkInboxResponse();
}

/** The account's own cap first, then the address asked for. Counted for a free, a taken and the account's own address
 *  alike, so a refusal reads the same for every address. */
async function refusalOfMailLimits({
  accountId,
  address,
  headers,
}: {
  accountId: string;
  address: string;
  headers: HeaderReader;
}): Promise<NextResponse | undefined> {
  const byAccount = answerOfJudgement(
    await judgeAccountSubject({ purpose: "email-change", headers, accountId }),
  );
  if (byAccount !== undefined) return byAccount;
  return answerOfJudgement(
    await judgeAccountSubject({
      purpose: "email-change-mail",
      headers,
      address,
    }),
  );
}

interface ChangeMailJob {
  readonly requester: Pick<StoredAccount, "id" | "locale" | "passwordHash">;
  readonly target: AcceptedAddress;
  readonly readiness: AccountMailReadiness;
}

/** A thrown value reaches the framework's log and a driver error can quote an address, so nothing is thrown out. */
function scheduleChangeMail(job: ChangeMailJob): void {
  try {
    after(() => sendChangeMail(job));
  } catch {
    reportAccountEvent({ event: "mail", outcome: "unavailable" });
  }
}

/**
 * Both mail buckets were counted before the answer, so nothing here counts them again. The account's earlier unused
 * links are retired first, whatever the address is, so the token table does not tell the three cases apart. The
 * account's own address then gets nothing. An address another account holds gets a notice, sent to that account's own
 * address and language. A free address gets the link, in the requester's language.
 */
async function sendChangeMail(job: ChangeMailJob): Promise<void> {
  try {
    await getAccountStore().retireEmailChangeTokens(job.requester.id);
    if (job.target.isCurrentAddress) return;
    const holder = await getAccountStore().findByNormalForm(
      job.target.emailNormalForm,
    );
    if (holder.kind === "found") {
      sendAddressInUseNotice(job.readiness, holder.account);
      return;
    }
    await sendChangeLink(job);
  } catch {
    reportAccountEvent({ event: "email-change", outcome: "unavailable" });
  }
}

/** Only an account that confirmed its address is told: an unconfirmed one cannot sign in, and its holder may be nobody. */
function sendAddressInUseNotice(
  readiness: AccountMailReadiness,
  holder: StoredAccount,
): void {
  if (!holder.isEmailVerified) return;
  queueAccountMail(readiness, {
    kind: "email-change-address-in-use",
    recipient: holder.email,
    locale: holder.locale,
  });
}

/** The link goes to the address as typed. A token the store refused (the account is gone, no longer verified, or its
 *  password changed since it was checked) sends nothing. */
async function sendChangeLink({
  requester,
  target,
  readiness,
}: ChangeMailJob): Promise<void> {
  const token = mintEmailToken();
  const issue = await getAccountStore().issueEmailChangeToken({
    accountId: requester.id,
    verifiedPasswordHash: requester.passwordHash,
    newEmail: target.email,
    newEmailNormalForm: target.emailNormalForm,
    tokenHash: token.hash,
    expiresAt: emailChangeTokenExpiry(),
  });
  if (issue.kind === "refused") return;
  queueAccountMail(readiness, {
    kind: "email-change",
    recipient: target.email,
    locale: requester.locale,
    token: token.value,
  });
}
