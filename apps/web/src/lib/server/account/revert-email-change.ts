import "server-only";

import type { NextResponse } from "next/server";

import { judgeAccountEmail } from "@lemnaria/configurator-domain";
import type {
  EmailChangeRevertOutcome,
  StoredAccount,
} from "@lemnaria/persistence";

import { reportAccountEvent } from "@/lib/server/account/account-log";
import {
  parseJsonObject,
  textMemberOf,
} from "@/lib/server/account/account-request";
import {
  emailRevertedResponse,
  invalidInputResponse,
  invalidRequestResponse,
  linkInvalidResponse,
} from "@/lib/server/account/account-responses";
import { getAccountStore } from "@/lib/server/account/account-store-instance";
import { isWellFormedEmailToken } from "@/lib/server/account/email-token";
import { judgeNewPassword } from "@/lib/server/account/judge-new-password";
import { scheduleEmailChangeRevertedNotice } from "@/lib/server/account/email-change-reverted-notice";
import { schedulePasswordChangedNotice } from "@/lib/server/account/password-changed-notice";
import {
  checkPassword,
  hashPassword,
} from "@/lib/server/account/password-hash";
import { getSessionStore } from "@/lib/server/account/session-store-instance";
import { sha256Hex } from "@/lib/server/sha256-hex";

// Using the undo link of an address change (Lot 2 plan 14.3.3, ADR 0172 Amendment H). Steps 1 to 4 of the common order
// are the route's (the cross-site check, media type, bounded body, and the network's limit), and the route is **not**
// behind the e-mail-change flag: switching the feature off must not strand a link already mailed. There is no session
// and no challenge: the token is the subject, and the address it restores is read from its row, never from the request.
//
// One `link-invalid` answers every failure of the link: unknown, malformed, used, expired, retired, a token of another
// purpose, an account never confirmed, and an address another account holds or has reserved. A success restores the
// address, sets the password the request chose and ends every session, this browser's included; it starts none, as a
// reset does, so the person signs in with the restored address and the new password. The attacker who moved the account
// knows the old password, which is why the revert asks for a new one.

const TOKEN_MEMBER = "token";
const NEW_PASSWORD_MEMBER = "newPassword";

export interface EmailRevertRequest {
  readonly bodyText: string;
}

/**
 * The token's shape is checked before anything is read, and the address it restores is read before the password is
 * looked at, so a stranger without a live link learns nothing of the password rules. The password is judged against
 * **that address** (the policy refuses a password equal to the address it protects, and the address the account holds
 * now is the one being left). A password the policy or the breach check refuses consumes no token. The hash is made
 * once, before the token is spent: a platform that cannot compute it throws, which the route answers `503`, and the
 * token stays whole.
 */
export async function completeEmailRevert({
  bodyText,
}: EmailRevertRequest): Promise<NextResponse> {
  const body = parseJsonObject(bodyText);
  if (body === undefined) return invalidRequestResponse();
  const token = textMemberOf(body, TOKEN_MEMBER);
  if (!isWellFormedEmailToken(token)) return linkInvalidResponse();
  const tokenHash = sha256Hex(token);
  const lookup = await getAccountStore().findRevertAddress(tokenHash);
  if (lookup.kind === "none") return linkInvalidResponse();
  const holder = await getAccountStore().findById(lookup.accountId);
  if (holder.kind === "none") return linkInvalidResponse();
  const judgement = await judgeNewPassword({
    password: textMemberOf(body, NEW_PASSWORD_MEMBER),
    email: lookup.email,
    field: NEW_PASSWORD_MEMBER,
  });
  if (!judgement.ok) return invalidInputResponse([judgement.issue]);
  if (await isPasswordHeldBy(holder.account, judgement.password)) {
    return invalidInputResponse([
      { field: NEW_PASSWORD_MEMBER, code: "PASSWORD_UNCHANGED" },
    ]);
  }
  const passwordHash = await hashPassword(judgement.password);
  const reverted = await revertOrRecover({
    restored: lookup,
    tokenHash,
    passwordHash,
  });
  if (reverted.kind === "invalid") return linkInvalidResponse();
  await endEverySessionBestEffort(reverted.accountId);
  schedulePasswordChangedNotice(reverted);
  scheduleLeftAddressNotice(reverted);
  reportAccountEvent({
    event: "email-change-revert",
    outcome: "succeeded",
  });
  return emailRevertedResponse();
}

/**
 * Whoever moved the account knows its password, so a revert that kept it would hand the account straight back. The
 * password the account holds now is refused as the new one: one more argon2 verification, behind the limiter and the
 * live link, and a refusal consumes nothing. It does not catch an intruder who changed the password before the revert
 * (the hash held then is theirs, and the person's old password is not stored anywhere); the owner accepted that.
 * A platform that cannot compute the verification throws, which the route answers `503` with the token whole.
 */
async function isPasswordHeldBy(
  account: StoredAccount,
  password: string,
): Promise<boolean> {
  const check = await checkPassword({ password, phc: account.passwordHash });
  if (check === "failed") throw new PasswordCheckFailedError();
  return check === "match";
}

class PasswordCheckFailedError extends Error {
  constructor() {
    super("The password check could not be computed.");
    this.name = "PasswordCheckFailedError";
  }
}

interface RevertToComplete {
  readonly restored: { readonly accountId: string; readonly email: string };
  readonly tokenHash: string;
  readonly passwordHash: string;
}

/**
 * `revertEmailChange` can throw after its transaction committed (an acknowledgement lost past the retry). The account
 * is read again at the restored address, and a stored hash equal to the one just made, a hash that carries a random salt
 * and so is no one else's, means the revert took effect: it is answered as the success it is, since a `503` would send
 * the client to a link already spent. Any other state, and a read that fails, answer as before: the failure is
 * rethrown for the route's `503`.
 */
async function revertOrRecover({
  restored,
  tokenHash,
  passwordHash,
}: RevertToComplete): Promise<EmailChangeRevertOutcome> {
  try {
    return await getAccountStore().revertEmailChange({
      tokenHash,
      passwordHash,
    });
  } catch (failure) {
    const recovered = await revertAlreadyTakenEffect({
      restored,
      passwordHash,
    });
    if (recovered !== undefined) return recovered;
    throw failure;
  }
}

async function revertAlreadyTakenEffect({
  restored,
  passwordHash,
}: Pick<RevertToComplete, "restored" | "passwordHash">): Promise<
  EmailChangeRevertOutcome | undefined
> {
  try {
    const address = judgeAccountEmail(restored.email);
    if (!address.ok) return undefined;
    const lookup = await getAccountStore().findByNormalForm(
      address.emailNormalForm,
    );
    if (
      lookup.kind !== "found" ||
      lookup.account.id !== restored.accountId ||
      lookup.account.passwordHash !== passwordHash
    ) {
      return undefined;
    }
    const { id, email, locale } = lookup.account;
    return {
      kind: "reverted",
      accountId: id,
      email,
      locale,
      leftEmail: undefined,
    };
  } catch {
    return undefined;
  }
}

/**
 * The address the account has just left is told too, in the account's language, with its own notice (not the
 * password-changed one, whose remedy leads nowhere there). Best-effort, like the notice to the restored address. The
 * store cannot say what was left after a lost acknowledgement, and then no notice is sent.
 */
function scheduleLeftAddressNotice({
  leftEmail,
  email,
  locale,
}: Extract<EmailChangeRevertOutcome, { kind: "reverted" }>): void {
  if (leftEmail === undefined) return;
  scheduleEmailChangeRevertedNotice({
    leftEmail,
    restoredEmail: email,
    locale,
  });
}

/**
 * `revertEmailChange` already revoked the account's sessions in its third statement; this pass catches a session that
 * committed after it. The address is restored either way, so a failure here is written down and does not change the
 * answer: telling the client "unavailable" for a revert that took effect would send it to a link that no longer works.
 */
async function endEverySessionBestEffort(accountId: string): Promise<void> {
  try {
    await getSessionStore().revokeAllForAccount(accountId);
  } catch {
    reportAccountEvent({ event: "session-revoke", outcome: "unavailable" });
  }
}
