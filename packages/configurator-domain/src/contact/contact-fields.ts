import { z } from "zod";

import {
  countCharacters,
  holdsForbiddenCharacter,
  ownValueOf,
  readTypedText,
} from "./input-checks.js";
import { normalisePhoneNumber, type PhoneRefusalCode } from "./phone-number.js";

// These values reach an e-mail and a database row, so every text field is bounded and carries no
// control character. A refusal is a field and a code and never a number or a value (see ADR 0150).

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

export const CONTACT_FIELDS = [
  "name",
  "phone",
  "locality",
  "channel",
  "email",
  "consent",
  "consentTextVersion",
] as const;
export type ContactField = (typeof CONTACT_FIELDS)[number];

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

/**
 * An address as a limit counts it: in lower case, and nothing stripped. A plus-tag or a dot is part of the address:
 * removing them would make two different people one at the providers that keep them apart. Whoever varies the
 * address is bounded by the network's limit alone, which is recorded and accepted.
 */
export function countedFormOfAddress(email: string): string {
  return email.toLowerCase();
}

/** Whether text is an address in its counted form: one the form would accept, already in lower case, so that no text
 *  but an address a request validated can name a subject. */
export function isCountedFormOfAddress(text: string): boolean {
  return (
    text !== "" &&
    countCharacters(text) <= CONTACT_EMAIL_MAX_LENGTH &&
    !holdsForbiddenCharacter(text) &&
    text === countedFormOfAddress(text) &&
    z.email().safeParse(text).success
  );
}

function judgeFields(input: ContactFieldsInput): FieldJudgements {
  const channel = judgeChannel(ownValueOf(input, "channel"));
  return {
    name: judgeRequiredText(ownValueOf(input, "name"), CONTACT_NAME_MAX_LENGTH),
    phone: judgePhone(ownValueOf(input, "phone")),
    locality: readTypedText(
      ownValueOf(input, "locality"),
      CONTACT_LOCALITY_MAX_LENGTH,
    ),
    channel,
    email: judgeEmail(ownValueOf(input, "email"), channel),
    consent: judgeConsent(ownValueOf(input, "consent")),
    consentTextVersion: judgeConsentTextVersion(
      ownValueOf(input, "consentTextVersion"),
    ),
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
  const bounded = readTypedText(raw, maxLength);
  return bounded.ok && bounded.value === "" ? refuse("REQUIRED") : bounded;
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

/** The e-mail input exists only for the e-mail channel, so for any other whatever it holds is neither
 *  carried nor judged. */
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

/** A closed set is matched exactly, as the channel is: what the page sends from a set is not typed,
 *  so nothing is trimmed or stripped to make it match. */
function judgeConsentTextVersion(raw: unknown): Judgement<ConsentTextVersion> {
  if (raw === undefined || raw === "") return refuse("REQUIRED");
  if (typeof raw !== "string") return refuse("NOT_TEXT");
  if (holdsForbiddenCharacter(raw)) return refuse("FORBIDDEN_CHARACTER");
  return isConsentTextVersion(raw)
    ? accept(raw)
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
