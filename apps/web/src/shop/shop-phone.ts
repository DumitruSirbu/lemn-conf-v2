import { normalisePhoneNumber } from "@lemnaria/configurator-domain";

// Not a callable number: the phone rule refuses it (`PHONE_MOLDOVAN_SECOND_ZERO`), so no accepted contact can equal it.
export const SHOP_PHONE_PLACEHOLDER_E164 = "+37300000000";

// The shop's number. Still the placeholder, which `pnpm gate:launch-placeholders` refuses; typed `string` so a real
// number replaces it without touching the types.
export const SHOP_PHONE_E164: string = SHOP_PHONE_PLACEHOLDER_E164;

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

/** True iff the number is not the placeholder and is its own accepted normal form. The placeholder is named although
 *  the phone rule refuses it today, so loosening that rule cannot turn the launch gate green. */
export function isLaunchReadyShopPhone(e164: string): boolean {
  if (e164 === SHOP_PHONE_PLACEHOLDER_E164) {
    return false;
  }
  const normalised = normalisePhoneNumber(e164);
  return normalised.ok && normalised.normalForm === e164;
}
