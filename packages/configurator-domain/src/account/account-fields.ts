import {
  CONTACT_PHONE_MAX_LENGTH,
  countedFormOfAddress,
  judgeEmailAddress,
  type EmailAddressCode,
} from "../contact/contact-fields.js";
import {
  holdsForbiddenCharacter,
  isPlainObject,
  ownValueOf,
  readTypedText,
  type PlainObject,
} from "../contact/input-checks.js";
import {
  normalisePhoneNumber,
  type PhoneRefusalCode,
} from "../contact/phone-number.js";

// What a person types to register (ADR 0169 decision 1). The password is not here: its rule needs the
// address and its text is never trimmed, so `judgePassword` reads it. A refusal is a field and a code and
// never the value.

/** The longest notice version the `accounts.privacy_notice_version` column accepts. */
export const PRIVACY_NOTICE_VERSION_MAX_LENGTH = 32;

/** The shape the column's check enforces. No closed list exists yet: the notice's text is a later wave, and
 *  a list would be an identifier nobody had published. */
const PRIVACY_NOTICE_VERSION_SHAPE = new RegExp(
  `^[a-z0-9.-]{1,${String(PRIVACY_NOTICE_VERSION_MAX_LENGTH)}}$`,
);

export const ACCOUNT_FIELDS = [
  "email",
  "phone",
  "locale",
  "privacyNoticeVersion",
] as const;
export type AccountField = (typeof ACCOUNT_FIELDS)[number];

export type AccountFieldCode =
  | EmailAddressCode
  | PhoneRefusalCode
  | "UNKNOWN_LOCALE";

export interface AccountIssue {
  readonly field: AccountField;
  readonly code: AccountFieldCode;
}

/** A phone as typed and as stored. It is unverified, and is labelled so wherever it is shown. */
export interface RegisteredPhone {
  readonly entered: string;
  readonly normalForm: string;
}

/** Trimmed values in the forms that are stored. */
export interface RegistrationFields {
  readonly email: string;
  /** The address as the limiter counts it and as the account is looked up: the one identity of a person. */
  readonly emailNormalForm: string;
  /** Absent when the person left it empty: both stored columns are then null together. */
  readonly phone: RegisteredPhone | undefined;
  readonly locale: string;
  readonly privacyNoticeVersion: string;
}

export type RegistrationValidation =
  | { readonly ok: true; readonly registration: RegistrationFields }
  | { readonly ok: false; readonly issues: readonly AccountIssue[] };

type Judgement<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly code: AccountFieldCode };

interface FieldJudgements {
  readonly email: Judgement<string>;
  readonly phone: Judgement<RegisteredPhone | undefined>;
  readonly locale: Judgement<string>;
  readonly privacyNoticeVersion: Judgement<string>;
}

type AcceptedJudgements = {
  readonly [field in AccountField]: Extract<
    FieldJudgements[field],
    { ok: true }
  >;
};

/** Every field is judged and every issue returned, in field order. `servedLocales` is the app's list,
 *  passed in because the domain cannot import it; an empty list is a programming error and throws. */
export function validateRegistration(
  input: unknown,
  servedLocales: readonly string[],
): RegistrationValidation {
  if (servedLocales.length === 0) {
    throw new Error(
      "validateRegistration: the list of served locales is empty",
    );
  }
  const fields: PlainObject = isPlainObject(input) ? input : {};
  const judgements = judgeFields(fields, servedLocales);
  if (!isAccepted(judgements)) {
    return { ok: false, issues: issuesOf(judgements) };
  }
  return { ok: true, registration: assemble(judgements) };
}

/** What a person claims by an address alone, as login does: the address by the registration's rule and in the form
 *  the limiter counts and accounts are looked up by, with no other field asked. */
export type AccountEmailJudgement =
  | {
      readonly ok: true;
      readonly email: string;
      readonly emailNormalForm: string;
    }
  | { readonly ok: false; readonly issue: AccountIssue };

export function judgeAccountEmail(raw: unknown): AccountEmailJudgement {
  const judgement = judgeEmailAddress(raw);
  if (!judgement.ok) {
    return { ok: false, issue: { field: "email", code: judgement.code } };
  }
  return {
    ok: true,
    email: judgement.value,
    emailNormalForm: countedFormOfAddress(judgement.value),
  };
}

function judgeFields(
  input: PlainObject,
  servedLocales: readonly string[],
): FieldJudgements {
  return {
    email: judgeEmailAddress(ownValueOf(input, "email")),
    phone: judgeOptionalPhone(ownValueOf(input, "phone")),
    locale: judgeLocale(ownValueOf(input, "locale"), servedLocales),
    privacyNoticeVersion: judgePrivacyNoticeVersion(
      ownValueOf(input, "privacyNoticeVersion"),
    ),
  };
}

function isAccepted(
  judgements: FieldJudgements,
): judgements is AcceptedJudgements {
  return ACCOUNT_FIELDS.every((field) => judgements[field].ok);
}

function issuesOf(judgements: FieldJudgements): readonly AccountIssue[] {
  return ACCOUNT_FIELDS.flatMap((field) => {
    const judgement = judgements[field];
    return judgement.ok ? [] : [{ field, code: judgement.code }];
  });
}

function assemble(accepted: AcceptedJudgements): RegistrationFields {
  return {
    email: accepted.email.value,
    emailNormalForm: countedFormOfAddress(accepted.email.value),
    phone: accepted.phone.value,
    locale: accepted.locale.value,
    privacyNoticeVersion: accepted.privacyNoticeVersion.value,
  };
}

/** Left empty, the phone is simply not given. Given, it is judged by the contact rule for a number. */
function judgeOptionalPhone(
  raw: unknown,
): Judgement<RegisteredPhone | undefined> {
  const entered = readTypedText(raw, CONTACT_PHONE_MAX_LENGTH);
  if (!entered.ok) return entered;
  if (entered.value === "") return accept(undefined);
  const phone = normalisePhoneNumber(entered.value);
  return phone.ok
    ? accept({ entered: entered.value, normalForm: phone.normalForm })
    : refuse(phone.code);
}

function judgeLocale(
  raw: unknown,
  servedLocales: readonly string[],
): Judgement<string> {
  const text = readSelectedText(raw);
  if (!text.ok) return text;
  return servedLocales.includes(text.value) ? text : refuse("UNKNOWN_LOCALE");
}

function judgePrivacyNoticeVersion(raw: unknown): Judgement<string> {
  const text = readSelectedText(raw);
  if (!text.ok) return text;
  if (text.value.length > PRIVACY_NOTICE_VERSION_MAX_LENGTH) {
    return refuse("TOO_LONG");
  }
  return PRIVACY_NOTICE_VERSION_SHAPE.test(text.value)
    ? text
    : refuse("MALFORMED");
}

/** A value the page chooses from a set is not typed, so nothing is trimmed or stripped to make it match. */
function readSelectedText(raw: unknown): Judgement<string> {
  if (raw === undefined || raw === "") return refuse("REQUIRED");
  if (typeof raw !== "string") return refuse("NOT_TEXT");
  if (holdsForbiddenCharacter(raw)) return refuse("FORBIDDEN_CHARACTER");
  return accept(raw);
}

function accept<Value>(value: Value): Judgement<Value> {
  return { ok: true, value };
}

function refuse(code: AccountFieldCode): { ok: false; code: AccountFieldCode } {
  return { ok: false, code };
}
