import { normalisePhoneNumber } from "@lemnaria/configurator-domain";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  isLaunchReadyShopPhone,
  SHOP_PHONE_E164,
  SHOP_PHONE_PLACEHOLDER_E164,
  shopPhoneDisplay,
  shopTelAddress,
  shopWhatsAppDigits,
} from "@/shop/shop-phone";

// A number that exists only in this test: it must never appear under `src`.
const FIXTURE_E164 = "+37322123456";

/** Eight digits, the first not 0: what follows `+373` in a Moldovan number the phone rule accepts. */
const subscriberDigits = fc.stringMatching(/^[1-9][0-9]{7}$/);

/** Seven more digits after a first 0: a subscriber number the phone rule refuses, whatever follows. */
const subscriberDigitsWithSecondZero = fc.stringMatching(/^0[0-9]{7}$/);

describe("the placeholder is unreachable by the contact form", () => {
  it("is refused by the phone rule as a second zero", () => {
    expect(normalisePhoneNumber(SHOP_PHONE_PLACEHOLDER_E164)).toEqual({
      ok: false,
      code: "PHONE_MOLDOVAN_SECOND_ZERO",
    });
  });
});

describe("isLaunchReadyShopPhone", () => {
  it.each([
    ["the placeholder", SHOP_PHONE_PLACEHOLDER_E164],
    ["an empty string", ""],
    ["a spaced form, which is not the normal form", "+373 22 123 456"],
    ["a national form, which is not the normal form", "022123456"],
    ["a sixteen-digit number", "+1234567890123456"],
    ["a Moldovan number with a digit too many", "+373221234567"],
    ["a Moldovan number with a digit missing", "+3732212345"],
  ])("is false for %s", (_label, entered) => {
    expect(isLaunchReadyShopPhone(entered)).toBe(false);
  });

  it.each([
    ["a Moldovan number", FIXTURE_E164],
    ["an international number", "+40721234567"],
  ])("is true for %s in its normal form", (_label, entered) => {
    expect(isLaunchReadyShopPhone(entered)).toBe(true);
  });

  it("is true for every +373 number whose eight digits do not begin with 0", () => {
    fc.assert(
      fc.property(subscriberDigits, (digits) => {
        expect(isLaunchReadyShopPhone(`+373${digits}`)).toBe(true);
      }),
    );
  });

  it("is false for every +373 number whose eight digits begin with 0", () => {
    fc.assert(
      fc.property(subscriberDigitsWithSecondZero, (digits) => {
        expect(isLaunchReadyShopPhone(`+373${digits}`)).toBe(false);
      }),
    );
  });

  it("is false for the national form of a number it accepts in E.164", () => {
    fc.assert(
      fc.property(subscriberDigits, (digits) => {
        expect(isLaunchReadyShopPhone(`+373${digits}`)).toBe(true);
        expect(isLaunchReadyShopPhone(`0${digits}`)).toBe(false);
      }),
    );
  });

  it("is false for a number the phone rule accepts only after removing its spaces", () => {
    fc.assert(
      fc.property(subscriberDigits, (digits) => {
        const spaced = `+373 ${digits.slice(0, 2)} ${digits.slice(2)}`;
        expect(isLaunchReadyShopPhone(`+373${digits}`)).toBe(true);
        expect(isLaunchReadyShopPhone(spaced)).toBe(false);
      }),
    );
  });
});

describe("the shop phone's three derivations", () => {
  it.each([
    [
      SHOP_PHONE_PLACEHOLDER_E164,
      "tel:+37300000000",
      "37300000000",
      "+373 00 000 000",
    ],
    [FIXTURE_E164, "tel:+37322123456", "37322123456", "+373 22 123 456"],
  ])(
    "derive the tel address, the WhatsApp digits and the display of %s",
    (e164, tel, digits, display) => {
      expect(shopTelAddress(e164)).toBe(tel);
      expect(shopWhatsAppDigits(e164)).toBe(digits);
      expect(shopPhoneDisplay(e164)).toBe(display);
    },
  );

  it("show a number that is not a +373 number as it is", () => {
    expect(shopPhoneDisplay("+40721234567")).toBe("+40721234567");
  });

  it("keep the display, the digits and the tel address the same number as the E.164", () => {
    fc.assert(
      fc.property(subscriberDigits, (digits) => {
        const e164 = `+373${digits}`;
        expect(shopPhoneDisplay(e164).replaceAll(" ", "")).toBe(e164);
        expect(`+${shopWhatsAppDigits(e164)}`).toBe(e164);
        expect(shopTelAddress(e164)).toBe(`tel:${e164}`);
      }),
    );
  });

  it("default to the shop's constant", () => {
    expect(shopTelAddress()).toBe(shopTelAddress(SHOP_PHONE_E164));
    expect(shopWhatsAppDigits()).toBe(shopWhatsAppDigits(SHOP_PHONE_E164));
    expect(shopPhoneDisplay()).toBe(shopPhoneDisplay(SHOP_PHONE_E164));
  });
});
