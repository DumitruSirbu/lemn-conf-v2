import { nanoid } from "nanoid";

import { newFakeDashboardWorld } from "./support/fake-dashboard-world.js";
import { describePriceNoticeStoreContract } from "./support/price-notice-store-contract.js";
import type { NoticeWorld } from "./support/price-notice-store-contract.js";

/**
 * The fake with the fake price book and availability log behind it, as the contract's world. The same contract runs
 * against `NeonPriceNoticeStore` when lane S builds it.
 */
describePriceNoticeStoreContract("FakePriceNoticeStore", () => {
  const world = newFakeDashboardWorld();
  const noticeWorld: NoticeWorld = {
    ...world,
    store: world.notice,
    aDesignId: () => Promise.resolve(nanoid()),
  };
  return Promise.resolve(noticeWorld);
});
