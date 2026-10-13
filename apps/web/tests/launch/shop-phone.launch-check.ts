import { describe, expect, it } from "vitest";

import {
  isLaunchReadyShopPhone,
  SHOP_PHONE_E164,
} from "../../src/shop/shop-phone";

// Red until the owner replaces the placeholder (Q3). Run only by `pnpm gate:launch-placeholders`.
describe("launch gate: the shop's phone", () => {
  it("SHOP_PHONE_E164 is a real number, not the placeholder", () => {
    expect(
      isLaunchReadyShopPhone(SHOP_PHONE_E164),
      `SHOP_PHONE_E164 in apps/web/src/shop/shop-phone.ts is "${SHOP_PHONE_E164}": ` +
        "the placeholder or not a valid number. Replace it with the shop's number (Q3).",
    ).toBe(true);
  });
});
