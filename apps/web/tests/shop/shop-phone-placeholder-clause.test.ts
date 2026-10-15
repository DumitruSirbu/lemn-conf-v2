import { describe, expect, it, vi } from "vitest";

// The phone rule is replaced by one that accepts everything, so the only thing left to refuse the
// placeholder is the predicate's own clause.
vi.mock("@lemnaria/configurator-domain", () => ({
  normalisePhoneNumber: (entered: string) => ({
    ok: true,
    normalForm: entered,
  }),
}));

import {
  isLaunchReadyShopPhone,
  SHOP_PHONE_PLACEHOLDER_E164,
} from "@/shop/shop-phone";

describe("isLaunchReadyShopPhone when the phone rule would accept the placeholder", () => {
  it("is still false for the placeholder", () => {
    expect(isLaunchReadyShopPhone(SHOP_PHONE_PLACEHOLDER_E164)).toBe(false);
  });

  it("is true for another number, so the stubbed phone rule is the one in use", () => {
    expect(isLaunchReadyShopPhone("+37322123456")).toBe(true);
  });
});
