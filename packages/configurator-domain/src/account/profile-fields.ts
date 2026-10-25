import {
  CONTACT_LOCALITY_MAX_LENGTH,
  CONTACT_NAME_MAX_LENGTH,
} from "../contact/contact-fields.js";
import {
  isPlainObject,
  ownValueOf,
  readTypedText,
  type PlainObject,
  type TextRefusalCode,
} from "../contact/input-checks.js";
import type { PhoneRefusalCode } from "../contact/phone-number.js";

import { judgeOptionalPhone, type RegisteredPhone } from "./account-fields.js";

// The optional details a person keeps on their account. A member that is absent is left as it is; one that is
// empty clears the field, so `readTypedText` (which reads absent as empty) is asked only about members that
// are present. A refusal is a field and a code and never the value.

/** Characters, as code points. The same bounds as the contact form's name and locality, which these prefill. */
export const PROFILE_NAME_MAX_LENGTH = CONTACT_NAME_MAX_LENGTH;
export const PROFILE_ADDRESS_MAX_LENGTH = CONTACT_LOCALITY_MAX_LENGTH;

const PROFILE_TEXT_BOUNDS = {
  name: PROFILE_NAME_MAX_LENGTH,
  address: PROFILE_ADDRESS_MAX_LENGTH,
} as const;

export const PROFILE_TEXT_FIELDS = ["name", "address"] as const;
export type ProfileTextField = (typeof PROFILE_TEXT_FIELDS)[number];

/** `body` is the request itself, for a request that is not an object. */
export type ProfileIssueField = ProfileTextField | "phone" | "body";

export interface ProfileTextIssue {
  readonly field: ProfileIssueField;
  readonly code: TextRefusalCode | PhoneRefusalCode | "NOT_AN_OBJECT";
}

/** The two phone columns, which are only ever written together: both text, or both null to clear. */
export interface ProfilePhoneChange {
  /** The number as typed and trimmed. */
  readonly phone: string | null;
  /** The number as `normalisePhoneNumber` forms it. */
  readonly phoneNormalForm: string | null;
}

/** A field is a key only when the request named it: `""` clears it and any other value replaces it. A request
 *  member that is not one of these is ignored, so a caller writes only the `changes` it is given and never the
 *  request. */
export interface ProfileTextChanges {
  readonly name?: string;
  readonly address?: string;
  readonly phone?: ProfilePhoneChange;
}

export type ProfileTextValidation =
  | { readonly ok: true; readonly changes: ProfileTextChanges }
  | { readonly ok: false; readonly issues: readonly ProfileTextIssue[] };

const NOT_AN_OBJECT: ProfileTextValidation = {
  ok: false,
  issues: [{ field: "body", code: "NOT_AN_OBJECT" }],
};

/** Every named field is judged and every issue returned, in field order: name, address, phone. A request that is
 *  not an object is refused, and so is not a request to change nothing. */
export function validateProfileText(input: unknown): ProfileTextValidation {
  if (!isPlainObject(input)) return NOT_AN_OBJECT;
  const changes: {
    name?: string;
    address?: string;
    phone?: ProfilePhoneChange;
  } = {};
  const issues: ProfileTextIssue[] = [];
  for (const field of PROFILE_TEXT_FIELDS) {
    const raw = ownValueOf(input, field);
    if (raw === undefined) continue;
    const reading = readTypedText(raw, PROFILE_TEXT_BOUNDS[field]);
    if (reading.ok) changes[field] = reading.value;
    else issues.push({ field, code: reading.code });
  }
  const phone = judgePhoneMember(input);
  if (phone?.ok === true) changes.phone = phone.change;
  else if (phone !== undefined)
    issues.push({ field: "phone", code: phone.code });
  return issues.length === 0 ? { ok: true, changes } : { ok: false, issues };
}

type PhoneMemberJudgement =
  | { readonly ok: true; readonly change: ProfilePhoneChange }
  | { readonly ok: false; readonly code: PhoneRefusalCode | TextRefusalCode };

/** `undefined` when the request did not name the phone: it is then left as it is. */
function judgePhoneMember(
  members: PlainObject,
): PhoneMemberJudgement | undefined {
  const raw = ownValueOf(members, "phone");
  if (raw === undefined) return undefined;
  const judgement = judgeOptionalPhone(raw);
  if (!judgement.ok) return judgement;
  return { ok: true, change: phoneChangeOf(judgement.value) };
}

function phoneChangeOf(phone: RegisteredPhone | undefined): ProfilePhoneChange {
  return phone === undefined
    ? { phone: null, phoneNormalForm: null }
    : { phone: phone.entered, phoneNormalForm: phone.normalForm };
}
