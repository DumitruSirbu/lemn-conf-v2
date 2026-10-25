import {
  countedFormOfAddress,
  judgeEmailAddress,
  type EmailAddressCode,
} from "../contact/contact-fields.js";

import {
  judgePassword,
  readExistingPassword,
  type PasswordRefusalCode,
} from "./password-policy.js";

// What a signed-in person asks to change about their sign-in. The field names are the request members' own, so
// that a refusal points at what the page sent. A refusal is a field and a code and never the value.

export interface PasswordChangeRequest {
  /** Untrusted: a body member of any type. Verified against the stored hash, never judged as a new password. */
  readonly currentPassword: unknown;
  /** Untrusted: a body member of any type. */
  readonly newPassword: unknown;
  /** The account's address as stored: the new password may not be it. */
  readonly accountEmail: string;
}

export interface PasswordChangeIssue {
  readonly field: "currentPassword" | "newPassword";
  readonly code: PasswordRefusalCode | "PASSWORD_NOT_TEXT";
}

export type PasswordChangeValidation =
  | {
      readonly ok: true;
      /** The NFKC form to verify against the stored hash. Absent when the length bounds refuse the typed one: no
       *  hash can match it, so it is a wrong password and not a field error (as at sign-in). The rule that a
       *  password may not be the address is not applied: it is for a password being chosen, and this one exists. */
      readonly currentPassword: string | undefined;
      /** The NFKC form to hash. */
      readonly newPassword: string;
    }
  | { readonly ok: false; readonly issue: PasswordChangeIssue };

/** The current password is checked first, then the new one, and the first issue is the one returned. */
export function validatePasswordChange(
  request: PasswordChangeRequest,
): PasswordChangeValidation {
  const { currentPassword, newPassword } = request;
  if (typeof currentPassword !== "string") {
    return refusal("currentPassword", "PASSWORD_NOT_TEXT");
  }
  if (typeof newPassword !== "string") {
    return refusal("newPassword", "PASSWORD_NOT_TEXT");
  }
  const chosen = judgePassword({
    password: newPassword,
    email: request.accountEmail,
  });
  if (!chosen.ok) return refusal("newPassword", chosen.code);
  const existing = readExistingPassword(currentPassword);
  return {
    ok: true,
    currentPassword: existing.ok ? existing.password : undefined,
    newPassword: chosen.password,
  };
}

function refusal(
  field: PasswordChangeIssue["field"],
  code: PasswordChangeIssue["code"],
): PasswordChangeValidation {
  return { ok: false, issue: { field, code } };
}

export interface EmailChangeRequest {
  readonly newEmail: unknown;
  /** The account's address as stored. */
  readonly accountEmail: string;
}

export interface EmailChangeIssue {
  readonly field: "newEmail";
  readonly code: EmailAddressCode;
}

export type EmailChangeValidation =
  | {
      readonly ok: true;
      readonly email: string;
      /** The address as the limiter counts it and as accounts are looked up. */
      readonly emailNormalForm: string;
      /** The caller's own address. Not a refusal: the answer is the same whatever address was named. */
      readonly isCurrentAddress: boolean;
    }
  | { readonly ok: false; readonly issue: EmailChangeIssue };

export function validateEmailChange(
  request: EmailChangeRequest,
): EmailChangeValidation {
  const judgement = judgeEmailAddress(request.newEmail);
  if (!judgement.ok) {
    return { ok: false, issue: { field: "newEmail", code: judgement.code } };
  }
  const emailNormalForm = countedFormOfAddress(judgement.value);
  return {
    ok: true,
    email: judgement.value,
    emailNormalForm,
    isCurrentAddress:
      emailNormalForm === countedFormOfAddress(request.accountEmail),
  };
}
