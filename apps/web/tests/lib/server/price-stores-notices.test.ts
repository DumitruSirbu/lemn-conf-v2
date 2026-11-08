import {
  DashboardStoreError,
  FakePriceNoticeStore,
  NEVER_RECORDED,
  type AcknowledgedPrices,
} from "@lemnaria/persistence";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FAKE_PRICE_BOOK_FLAG,
  FAKE_PRICE_BOOK_FLAG_ENABLED,
} from "@/lib/server/fake-price-book-flag";
import { UNAVAILABLE_PRICE_NOTICE_STORE } from "@/lib/server/unavailable-price-stores";

import {
  AN_UNREACHABLE_DATABASE_URL,
  forgetHeldPriceStores,
} from "../../support/held-price-stores";

// The price-notice store beside the other four (R5a, S5): production makes the database's on first use, once for the
// process; without a connection it answers "unavailable" to every call; the seeded world holds the persistence package's
// fake. Nothing reads `notices` until R5b, so these are the only readers of it.

const made = vi.hoisted(() => ({ notices: [] as object[] }));

vi.mock("@lemnaria/persistence", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lemnaria/persistence")>()),
  NeonPriceNoticeStore: vi.fn(function NoticeStore(this: object) {
    made.notices.push(this);
  }),
}));

const { getPriceStores } = await import("@/lib/server/price-stores");

const A_DESIGN_ID = "A".repeat(21);
const A_PAIR: AcknowledgedPrices = {
  versionId: "V".repeat(21),
  availabilityRevision: "0",
};

function stubProductionEnvironment(databaseUrl: string | undefined): void {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DATABASE_URL", databaseUrl);
  vi.stubEnv("VERCEL_ENV", undefined);
  vi.stubEnv("CLIENT_NETWORK_SOURCE", undefined);
  vi.stubEnv(FAKE_PRICE_BOOK_FLAG, undefined);
}

beforeEach(() => {
  made.notices = [];
  forgetHeldPriceStores();
});

afterEach(() => {
  forgetHeldPriceStores();
  vi.unstubAllEnvs();
});

describe("production with a database", () => {
  beforeEach(() => {
    stubProductionEnvironment(AN_UNREACHABLE_DATABASE_URL);
  });

  it("makes no notice store at import, and one on the first use", async () => {
    expect(made.notices).toHaveLength(0);

    const stores = await getPriceStores();

    expect(made.notices).toEqual([stores.notices]);
  });

  it("makes it once for the process however many requests meet the first use together", async () => {
    const stores = await Promise.all(
      Array.from({ length: 25 }, () => getPriceStores()),
    );
    await getPriceStores();

    expect(made.notices).toHaveLength(1);
    for (const held of stores) expect(held.notices).toBe(made.notices[0]);
  });
});

describe("production without a database", () => {
  it.each([
    ["undefined", undefined],
    ["empty", ""],
  ])(
    "holds the store that answers unavailable when DATABASE_URL is %s, and makes no Neon store",
    async (_description, url) => {
      stubProductionEnvironment(url);

      const stores = await getPriceStores();

      expect(stores.notices).toBe(UNAVAILABLE_PRICE_NOTICE_STORE);
      expect(made.notices).toHaveLength(0);
    },
  );

  it.each([
    [
      "reading a marker",
      () => UNAVAILABLE_PRICE_NOTICE_STORE.readAcknowledged(A_DESIGN_ID),
      "read a design's acknowledged prices",
    ],
    [
      "recording a first open",
      () => UNAVAILABLE_PRICE_NOTICE_STORE.recordIfAbsent(A_DESIGN_ID, A_PAIR),
      "record a design's first-open prices",
    ],
    [
      "recording an acknowledgement",
      () =>
        UNAVAILABLE_PRICE_NOTICE_STORE.recordAcknowledged(A_DESIGN_ID, A_PAIR),
      "record a design's acknowledged prices",
    ],
  ])(
    "refuses %s with the store's own unavailable, naming the operation the Neon store names",
    async (_description, call, operation) => {
      const refusal = call();

      await expect(refusal).rejects.toBeInstanceOf(DashboardStoreError);
      await expect(refusal).rejects.toMatchObject({
        name: "DashboardStoreError",
        failure: "unavailable",
        operation,
      });
    },
  );

  it("is frozen, so no caller can replace a method with one that succeeds", () => {
    expect(Object.isFrozen(UNAVAILABLE_PRICE_NOTICE_STORE)).toBe(true);
  });
});

describe("the seeded world", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
  });

  it("holds the persistence package's fake, with no marker recorded for any design", async () => {
    const stores = await getPriceStores();

    expect(stores.notices).toBeInstanceOf(FakePriceNoticeStore);
    expect(await stores.notices.readAcknowledged(A_DESIGN_ID)).toBe(
      NEVER_RECORDED,
    );
    expect(made.notices).toHaveLength(0);
  });

  it("holds it from the e2e server's flag as well, still making no Neon store", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(FAKE_PRICE_BOOK_FLAG, FAKE_PRICE_BOOK_FLAG_ENABLED);

    const stores = await getPriceStores();

    expect(stores.notices).toBeInstanceOf(FakePriceNoticeStore);
    expect(made.notices).toHaveLength(0);
  });
});
