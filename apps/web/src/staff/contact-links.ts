import {
  judgeAccountEmail,
  normalisePhoneNumber,
} from "@lemnaria/configurator-domain";

// The only place a `tel:` or `mailto:` target is built, from a profile value and nothing else: a value the rules below
// refuse gets no link and stays plain text. see ADR 0185 decision 7.

/** What a link acts on and where it points. `value` is what the accessible name says: the dialled number or the address. */
export interface ContactLink {
  readonly href: string;
  readonly value: string;
}

/** E.164: a calling code that does not begin with 0, then at most fourteen more digits, seven in all at least. */
const DIALLABLE_NORMAL_FORM = /^\+[1-9][0-9]{6,14}$/;

/** What a mailbox on this site is written with: no space, no quote, no query character, no second `@`, nothing outside ASCII. */
const LINKABLE_ADDRESS = /^[A-Za-z0-9._'+-]+@[A-Za-z0-9.-]+$/;

/** What a number is typed with: digits, plus, round brackets, a space or no-break space, a hyphen or a general-punctuation
 *  dash (U+2010 to U+2015). Any other character, a format character or a right-to-left dash included, could reorder the
 *  digits staff read against the number dialled, and is not linked. */
const TYPEABLE_PHONE = /^[0-9+() \-\u00A0\u2010-\u2015]+$/;

/** The `tel:` link of a profile phone, built from the domain's normal form and never from the typed text. */
export function phoneLinkOf(phone: string): ContactLink | null {
  if (!TYPEABLE_PHONE.test(phone)) {
    return null;
  }
  const normalised = normalisePhoneNumber(phone);
  if (!normalised.ok || !DIALLABLE_NORMAL_FORM.test(normalised.normalForm)) {
    return null;
  }
  return { href: `tel:${normalised.normalForm}`, value: normalised.normalForm };
}

/** The `mailto:` link of a stored profile e-mail: the stored address itself, with no query after it. */
export function mailLinkOf(storedEmail: string): ContactLink | null {
  if (!LINKABLE_ADDRESS.test(storedEmail)) {
    return null;
  }
  const judged = judgeAccountEmail(storedEmail);
  if (!judged.ok || judged.email !== storedEmail) {
    return null;
  }
  return { href: `mailto:${storedEmail}`, value: storedEmail };
}
