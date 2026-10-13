import { normalisePhoneNumber } from "@lemnaria/configurator-domain";

// The owner's placeholder for the shop's phone (Q3 is open). The project's own phone rule refuses
// it as `PHONE_MOLDOVAN_SECOND_ZERO`, so no number the contact form accepts can equal it.
export const SHOP_PHONE_PLACEHOLDER_E164 = "+37300000000";

// Placeholder until the owner answers Q3; `pnpm gate:launch-placeholders` refuses it.
export const SHOP_PHONE_E164 = "+37300000000";

const E164_PLUS_SIGN = "+";

/** `+373` and eight digits, captured as the three groups a Moldovan number is written in. */
const MOLDOVAN_E164_SHAPE = /^\+373(\d{2})(\d{3})(\d{3})$/;

export function shopTelAddress(e164: string = SHOP_PHONE_E164): string {
  return `tel:${e164}`;
}

/** The recipient `https://wa.me/` takes: E.164 without its `+`. */
export function shopWhatsAppDigits(e164: string = SHOP_PHONE_E164): string {
  return e164.startsWith(E164_PLUS_SIGN) ? e164.slice(1) : e164;
}

/** `+373 xx xxx xxx` for a Moldovan number; any other value is shown as it is, never refused, so a
 *  valid international number cannot take a page down. */
export function shopPhoneDisplay(e164: string = SHOP_PHONE_E164): string {
  const groups = MOLDOVAN_E164_SHAPE.exec(e164);
  if (groups === null) {
    return e164;
  }
  return `+373 ${groups.slice(1).join(" ")}`;
}

/** True iff the number is not the placeholder and is its own accepted normal form. The placeholder
 *  is named even though the phone rule refuses it today, so a later loosening of that rule cannot
 *  turn the gate green. */
export function isLaunchReadyShopPhone(e164: string): boolean {
  if (e164 === SHOP_PHONE_PLACEHOLDER_E164) {
    return false;
  }
  const normalised = normalisePhoneNumber(e164);
  return normalised.ok && normalised.normalForm === e164;
}
