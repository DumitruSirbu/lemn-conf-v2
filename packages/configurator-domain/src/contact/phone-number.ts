// The phone rule: a Moldovan number (0 and eight digits, or +373 and eight) or any international number
// written with `+` (Q24). The normal form is E.164, `+` and digits only, so one subscriber has one
// stored form however it was typed.

const MOLDOVA_CALLING_CODE = "373";
const MOLDOVAN_SUBSCRIBER_DIGITS = 8;

/** The shortest E.164 numbers in use (calling code included) are seven digits. */
const INTERNATIONAL_MIN_DIGITS = 7;

/** E.164 (ITU-T) allows at most fifteen digits, calling code included. */
const INTERNATIONAL_MAX_DIGITS = 15;

/** Spaces, hyphens and round brackets are how people group a number; none of them is a digit. */
const GROUPING_CHARACTERS = /[ ()-]/g;

/** A calling code never starts with 0, so `+0…` is not an international number. */
const INTERNATIONAL_SHAPE = /^\+[1-9][0-9]*$/;

const MOLDOVAN_NATIONAL_SHAPE = /^0[0-9]*$/;

/** Codes only (ADR 0095): fewer digits than the form needs, more than it allows, or neither form. */
export type PhoneRefusalCode =
  | "PHONE_INCOMPLETE"
  | "PHONE_TOO_MANY_DIGITS"
  | "PHONE_FORMAT_UNRECOGNISED";

export type PhoneNumberResult =
  | { readonly ok: true; readonly normalForm: string }
  | { readonly ok: false; readonly code: PhoneRefusalCode };

export function normalisePhoneNumber(entered: string): PhoneNumberResult {
  const compact = entered.replace(GROUPING_CHARACTERS, "");
  if (INTERNATIONAL_SHAPE.test(compact)) {
    return judgeInternationalDigits(compact.slice(1));
  }
  if (MOLDOVAN_NATIONAL_SHAPE.test(compact)) {
    return judgeMoldovanSubscriber(compact.slice(1));
  }
  return refuse("PHONE_FORMAT_UNRECOGNISED");
}

function judgeInternationalDigits(digits: string): PhoneNumberResult {
  if (digits.startsWith(MOLDOVA_CALLING_CODE)) {
    return judgeMoldovanSubscriber(digits.slice(MOLDOVA_CALLING_CODE.length));
  }
  if (digits.length < INTERNATIONAL_MIN_DIGITS) {
    return refuse("PHONE_INCOMPLETE");
  }
  if (digits.length > INTERNATIONAL_MAX_DIGITS) {
    return refuse("PHONE_TOO_MANY_DIGITS");
  }
  return { ok: true, normalForm: `+${digits}` };
}

function judgeMoldovanSubscriber(subscriberDigits: string): PhoneNumberResult {
  if (subscriberDigits.length < MOLDOVAN_SUBSCRIBER_DIGITS) {
    return refuse("PHONE_INCOMPLETE");
  }
  if (subscriberDigits.length > MOLDOVAN_SUBSCRIBER_DIGITS) {
    return refuse("PHONE_TOO_MANY_DIGITS");
  }
  return {
    ok: true,
    normalForm: `+${MOLDOVA_CALLING_CODE}${subscriberDigits}`,
  };
}

function refuse(code: PhoneRefusalCode): PhoneNumberResult {
  return { ok: false, code };
}
