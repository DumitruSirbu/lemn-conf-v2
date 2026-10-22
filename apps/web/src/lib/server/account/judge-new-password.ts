import "server-only";

import { judgePassword } from "@lemnaria/configurator-domain";

import type { AccountInputIssue } from "@/lib/server/account/account-responses";
import { isBreachedPassword } from "@/lib/server/account/breached-password";

export type NewPasswordJudgement =
  | { readonly ok: true; readonly password: string }
  | { readonly ok: false; readonly issue: AccountInputIssue };

export interface NewPasswordToJudge {
  readonly password: string | undefined;
  /** The address the password protects: the policy refuses a password equal to it. */
  readonly email: string;
  /** The request member the refusal is written against, so a screen finds the field that was refused. */
  readonly field: AccountInputIssue["field"];
}

/** The registration's rules: NFKC and the length cap first, then the policy, then the breach corpus. When the corpus
 *  cannot be reached the length rule alone decides (owner decision Q-L2). */
export async function judgeNewPassword({
  password,
  email,
  field,
}: NewPasswordToJudge): Promise<NewPasswordJudgement> {
  if (password === undefined) {
    return refusalOf(field, "PASSWORD_NOT_TEXT");
  }
  const judgement = judgePassword({ password, email });
  if (!judgement.ok) return refusalOf(field, judgement.code);
  if ((await isBreachedPassword(judgement.password)) === "breached") {
    return refusalOf(field, "PASSWORD_BREACHED");
  }
  return judgement;
}

function refusalOf(
  field: AccountInputIssue["field"],
  code: AccountInputIssue["code"],
): NewPasswordJudgement {
  return { ok: false, issue: { field, code } };
}
