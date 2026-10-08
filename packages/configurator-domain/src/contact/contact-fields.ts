import { z } from "zod";

import { normalisePhoneNumber, type PhoneRefusalCode } from "./phone-number.js";

// These values reach an e-mail and a database row, so every text field is bounded and carries no
// control character. A refusal is a field and a code and no number (ADR 0095, as ADR 0108 decision 3
// for rooms): a refusal carrying its limit would be one ICU argument away from printing an unapproved
// bound.

/** Characters, counted as code points after trimming. */
export const CONTACT_NAME_MAX_LENGTH = 100;
export const CONTACT_LOCALITY_MAX_LENGTH = 100;

/** The longest path RFC 5321 allows, `<` and `>` excluded. */
export const CONTACT_EMAIL_MAX_LENGTH = 254;

/** Room for the longest E.164 number (`+` and fifteen digits) with its grouping characters. */
export const CONTACT_PHONE_MAX_LENGTH = 32;

/** The consent texts a page can have shown. The client states which; only a member is accepted, so no
 *  stored row holds an identifier nobody published. A member is never removed once a submission could
 *  carry it. */
export const CONSENT_TEXT_VERSIONS = ["placeholder"] as const;
export type ConsentTextVersion = (typeof CONSENT_TEXT_VERSIONS)[number];

export const CONTACT_CHANNELS = ["phone", "whatsapp", "email"] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

const CONTACT_FIELDS = [
  "name",
  "phone",
  "locality",
  "channel",
  "email",
  "consent",
  "consentTextVersion",
] as const;
export type ContactField = (typeof CONTACT_FIELDS)[number];

/** Format characters (direction marks, zero-width, soft hyphen) arrive with pasted text and cannot be
 *  seen. They are removed, not refused, so a stored or mailed value never holds one. */
const FORMAT_CHARACTER = /\p{Cf}/gu;

/** Control, unpaired-surrogate, line and paragraph separator characters: none can be shown on one line
 *  of an e-mail or stored as well-formed UTF-8. */
const FORBIDDEN_CHARACTER = /[\p{Cc}\p{Cs}\p{Zl}\p{Zp}]/u;

export type ContactFieldCode =
  | "REQUIRED"
  | "NOT_TEXT"
  | "TOO_LONG"
  | "FORBIDDEN_CHARACTER"
  | "MALFORMED"
  | PhoneRefusalCode
  | "UNKNOWN_CHANNEL"
  | "CONSENT_NOT_GIVEN"
  | "UNKNOWN_CONSENT_TEXT_VERSION";

export interface ContactIssue {
  readonly field: ContactField;
  readonly code: ContactFieldCode;
}

/** What arrives from a form or a request body: any field may be absent or of the wrong type. */
export type ContactFieldsInput = Readonly<
  Partial<Record<ContactField, unknown>>
>;

/** Trimmed values, in the forms that are stored. */
export interface ContactFields {
  readonly name: string;
  readonly phone: string;
  readonly phoneNormalForm: string;
  /** Empty when the customer left it empty. */
  readonly locality: string;
  readonly channel: ContactChannel;
  /** Present exactly when `channel` is `"email"`. */
  readonly email: string | undefined;
  readonly consentTextVersion: ConsentTextVersion;
}

export type ContactFieldsValidation =
  | { readonly ok: true; readonly contact: ContactFields }
  | { readonly ok: false; readonly issues: readonly ContactIssue[] };

type Judgement<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly code: ContactFieldCode };

interface FieldJudgements {
  readonly name: Judgement<string>;
  readonly phone: Judgement<{ entered: string; normalForm: string }>;
  readonly locality: Judgement<string>;
  readonly channel: Judgement<ContactChannel>;
  readonly email: Judgement<string | undefined>;
  readonly consent: Judgement<true>;
  readonly consentTextVersion: Judgement<ConsentTextVersion>;
}

type AcceptedJudgements = {
  readonly [field in ContactField]: Extract<
    FieldJudgements[field],
    { ok: true }
  >;
};

/** Every field is judged and every issue returned, in field order, so each field carries its own
 *  reason. A field is refused for one code only: the first rule it breaks. */
export function validateContactFields(
  input: ContactFieldsInput,
): ContactFieldsValidation {
  const judgements = judgeFields(input);
  if (!isAccepted(judgements)) {
    return { ok: false, issues: issuesOf(judgements) };
  }
  return { ok: true, contact: assemble(judgements) };
}

function judgeFields(input: ContactFieldsInput): FieldJudgements {
  const channel = judgeChannel(input.channel);
  return {
    name: judgeRequiredText(input.name, CONTACT_NAME_MAX_LENGTH),
    phone: judgePhone(input.phone),
    locality: judgeBoundedText(input.locality, CONTACT_LOCALITY_MAX_LENGTH),
    channel,
    email: judgeEmail(input.email, channel),
    consent: judgeConsent(input.consent),
    consentTextVersion: judgeConsentTextVersion(input.consentTextVersion),
  };
}

function isAccepted(
  judgements: FieldJudgements,
): judgements is AcceptedJudgements {
  return CONTACT_FIELDS.every((field) => judgements[field].ok);
}

function issuesOf(judgements: FieldJudgements): readonly ContactIssue[] {
  return CONTACT_FIELDS.flatMap((field) => {
    const judgement = judgements[field];
    return judgement.ok ? [] : [{ field, code: judgement.code }];
  });
}

function assemble(accepted: AcceptedJudgements): ContactFields {
  return {
    name: accepted.name.value,
    phone: accepted.phone.value.entered,
    phoneNormalForm: accepted.phone.value.normalForm,
    locality: accepted.locality.value,
    channel: accepted.channel.value,
    email: accepted.email.value,
    consentTextVersion: accepted.consentTextVersion.value,
  };
}

function judgeRequiredText(raw: unknown, maxLength: number): Judgement<string> {
  const bounded = judgeBoundedText(raw, maxLength);
  return bounded.ok && bounded.value === "" ? refuse("REQUIRED") : bounded;
}

function judgeBoundedText(raw: unknown, maxLength: number): Judgement<string> {
  const trimmed = judgeTrimmedText(raw);
  return trimmed.ok && countCharacters(trimmed.value) > maxLength
    ? refuse("TOO_LONG")
    : trimmed;
}

/** Format characters go first, then forbidden ones are looked for before trimming: a trailing line
 *  feed is a refusal, not whitespace to be quietly dropped. */
function judgeTrimmedText(raw: unknown): Judgement<string> {
  if (raw === undefined) return accept("");
  if (typeof raw !== "string") return refuse("NOT_TEXT");
  const visible = raw.replace(FORMAT_CHARACTER, "");
  if (FORBIDDEN_CHARACTER.test(visible)) return refuse("FORBIDDEN_CHARACTER");
  return accept(visible.trim());
}

function countCharacters(text: string): number {
  return Array.from(text).length;
}

function judgePhone(raw: unknown): Judgement<{
  entered: string;
  normalForm: string;
}> {
  const entered = judgeRequiredText(raw, CONTACT_PHONE_MAX_LENGTH);
  if (!entered.ok) return entered;
  const phone = normalisePhoneNumber(entered.value);
  return phone.ok
    ? accept({ entered: entered.value, normalForm: phone.normalForm })
    : refuse(phone.code);
}

function judgeChannel(raw: unknown): Judgement<ContactChannel> {
  return isContactChannel(raw) ? accept(raw) : refuse("UNKNOWN_CHANNEL");
}

function isContactChannel(value: unknown): value is ContactChannel {
  return CONTACT_CHANNELS.some((channel) => channel === value);
}

/** The e-mail input is shown only with the e-mail channel (Q6 (ii)), so for any other channel
 *  whatever it holds is not carried and not judged. */
function judgeEmail(
  raw: unknown,
  channel: Judgement<ContactChannel>,
): Judgement<string | undefined> {
  if (!channel.ok || channel.value !== "email") return accept(undefined);
  const email = judgeRequiredText(raw, CONTACT_EMAIL_MAX_LENGTH);
  if (!email.ok) return email;
  return z.email().safeParse(email.value).success ? email : refuse("MALFORMED");
}

function judgeConsent(raw: unknown): Judgement<true> {
  return raw === true ? accept(true) : refuse("CONSENT_NOT_GIVEN");
}

function judgeConsentTextVersion(raw: unknown): Judgement<ConsentTextVersion> {
  const version = judgeTrimmedText(raw);
  if (!version.ok) return version;
  if (version.value === "") return refuse("REQUIRED");
  return isConsentTextVersion(version.value)
    ? accept(version.value)
    : refuse("UNKNOWN_CONSENT_TEXT_VERSION");
}

function isConsentTextVersion(value: string): value is ConsentTextVersion {
  return CONSENT_TEXT_VERSIONS.some((version) => version === value);
}

function accept<Value>(value: Value): Judgement<Value> {
  return { ok: true, value };
}

function refuse(code: ContactFieldCode): { ok: false; code: ContactFieldCode } {
  return { ok: false, code };
}
