// The phone rule: a Moldovan number (0 and eight digits, or +373 and eight) or any international number
// written with `+`. The normal form is E.164, `+` and digits only, so one subscriber has one stored form
// however it was typed (see ADR 0150).

const MOLDOVA_CALLING_CODE = "373";
const MOLDOVAN_SUBSCRIBER_DIGITS = 8;

/** The 0 of "0 and eight digits" is the trunk prefix, so the digits after it, or after +373, do not
 *  begin with one: two zeros begin a call abroad. */
const MOLDOVAN_TRUNK_PREFIX = "0";

/** The shortest E.164 numbers in use (calling code included) are seven digits. */
const INTERNATIONAL_MIN_DIGITS = 7;

/** E.164 (ITU-T) allows at most fifteen digits, calling code included. */
const INTERNATIONAL_MAX_DIGITS = 15;

/** How people group a number: any space separator (Zs), any dash (Pd), round brackets. Format characters
 *  (direction marks, zero-width) arrive with a pasted number and are not seen. A minus sign is not a dash. */
const IGNORED_CHARACTERS = /[\p{Zs}\p{Pd}()\p{Cf}]/gu;

/** A calling code never starts with 0, so `+0…` is not an international number. */
const INTERNATIONAL_SHAPE = /^\+[1-9][0-9]*$/;

/** The trunk prefix and digits only; how many digits is judged afterwards, so the refusal can say. */
const MOLDOVAN_NATIONAL_SHAPE = /^0[0-9]*$/;

/** Codes only: fewer digits than the form needs, more than it allows, a second 0, or neither form. The
 *  Moldovan form and the international one are told apart because "eight digits after the prefix" is true
 *  of the first and false of the second. */
export type PhoneRefusalCode =
  | "PHONE_MOLDOVAN_INCOMPLETE"
  | "PHONE_MOLDOVAN_TOO_MANY_DIGITS"
  | "PHONE_MOLDOVAN_SECOND_ZERO"
  | "PHONE_INTERNATIONAL_INCOMPLETE"
  | "PHONE_INTERNATIONAL_TOO_MANY_DIGITS"
  | "PHONE_FORMAT_UNRECOGNISED";

export type PhoneNumberResult =
  | { readonly ok: true; readonly normalForm: string }
  | { readonly ok: false; readonly code: PhoneRefusalCode };

export function normalisePhoneNumber(entered: string): PhoneNumberResult {
  const compact = entered.replace(IGNORED_CHARACTERS, "");
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
    return refuse("PHONE_INTERNATIONAL_INCOMPLETE");
  }
  if (digits.length > INTERNATIONAL_MAX_DIGITS) {
    return refuse("PHONE_INTERNATIONAL_TOO_MANY_DIGITS");
  }
  return { ok: true, normalForm: `+${digits}` };
}

/** A subscriber number that begins with 0 can be completed by nothing, so it is neither incomplete nor
 *  too long, at whatever length. */
function judgeMoldovanSubscriber(subscriberDigits: string): PhoneNumberResult {
  if (subscriberDigits.startsWith(MOLDOVAN_TRUNK_PREFIX)) {
    return refuse("PHONE_MOLDOVAN_SECOND_ZERO");
  }
  if (subscriberDigits.length < MOLDOVAN_SUBSCRIBER_DIGITS) {
    return refuse("PHONE_MOLDOVAN_INCOMPLETE");
  }
  if (subscriberDigits.length > MOLDOVAN_SUBSCRIBER_DIGITS) {
    return refuse("PHONE_MOLDOVAN_TOO_MANY_DIGITS");
  }
  return {
    ok: true,
    normalForm: `+${MOLDOVA_CALLING_CODE}${subscriberDigits}`,
  };
}

function refuse(code: PhoneRefusalCode): PhoneNumberResult {
  return { ok: false, code };
}
