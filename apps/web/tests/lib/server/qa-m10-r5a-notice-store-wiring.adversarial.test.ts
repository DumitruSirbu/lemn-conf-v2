import {
  DashboardStoreError,
  FakePriceNoticeStore,
  NEVER_RECORDED,
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

// Adversarial QA for M10 wave R5a (criterion R5a-a): which notice store a process holds. Production makes the database's on
// first use and never at import, however the first use is met; without a connection it holds the store that answers
// "unavailable"; a seeded world holds the persistence package's fake. The constructions are counted by a spy on the
// constructor, and the module is imported anew under the production environment so that an import-time construction is
// counted too (the existing wiring test imports it once, then clears its count).

const constructions = vi.hoisted(() => ({
  notices: [] as object[],
  failuresToThrow: 0,
}));

vi.mock("@lemnaria/persistence", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lemnaria/persistence")>()),
  NeonPriceNoticeStore: vi.fn(function NoticeStore(this: object) {
    if (constructions.failuresToThrow > 0) {
      constructions.failuresToThrow -= 1;
      throw new Error("the notice store was refused");
    }
    constructions.notices.push(this);
  }),
}));

/** A new module graph, so the unavailable store it holds is that graph's own: compare it to the one imported with it. */
async function importPriceStoresAnew(): Promise<
  typeof import("@/lib/server/price-stores")
> {
  vi.resetModules();
  return import("@/lib/server/price-stores");
}

async function unavailableNoticeStoreOfTheNewGraph(): Promise<
  typeof import("@/lib/server/unavailable-price-stores").UNAVAILABLE_PRICE_NOTICE_STORE
> {
  const module = await import("@/lib/server/unavailable-price-stores");
  return module.UNAVAILABLE_PRICE_NOTICE_STORE;
}

function stubProductionEnvironment(databaseUrl: string | undefined): void {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DATABASE_URL", databaseUrl);
  vi.stubEnv("VERCEL_ENV", undefined);
  vi.stubEnv("CLIENT_NETWORK_SOURCE", undefined);
  vi.stubEnv(FAKE_PRICE_BOOK_FLAG, undefined);
}

beforeEach(() => {
  constructions.notices = [];
  constructions.failuresToThrow = 0;
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

  it("makes no notice store when the module is imported, and none until a request asks for the stores", async () => {
    const { getPriceStores } = await importPriceStoresAnew();

    expect(constructions.notices).toHaveLength(0);
    await getPriceStores();

    expect(constructions.notices).toHaveLength(1);
  });

  it("hands every concurrent first use the one notice store, made once", async () => {
    const { getPriceStores } = await importPriceStoresAnew();

    const stores = await Promise.all(
      Array.from({ length: 50 }, () => getPriceStores()),
    );

    expect(constructions.notices).toHaveLength(1);
    expect(new Set(stores.map((held) => held.notices)).size).toBe(1);
    expect(new Set(stores).size).toBe(1);
  });

  it("holds the same notice store across a later request, which makes nothing", async () => {
    const { getPriceStores } = await importPriceStoresAnew();
    const first = await getPriceStores();

    const later = await getPriceStores();

    expect(later.notices).toBe(first.notices);
    expect(constructions.notices).toHaveLength(1);
  });

  it("tells the requests awaiting a refused construction, and tries again for the next", async () => {
    const { getPriceStores } = await importPriceStoresAnew();
    constructions.failuresToThrow = 1;

    const waiting = await Promise.allSettled([
      getPriceStores(),
      getPriceStores(),
      getPriceStores(),
    ]);
    const afterwards = await getPriceStores();

    expect(waiting.map(({ status }) => status)).toEqual([
      "rejected",
      "rejected",
      "rejected",
    ]);
    expect(constructions.notices).toEqual([afterwards.notices]);
    expect(await getPriceStores()).toBe(afterwards);
  });
});

describe("production without a usable database", () => {
  it.each([
    ["absent", undefined],
    ["empty", ""],
  ])(
    "holds the unavailable notice store, and makes no database one, when DATABASE_URL is %s",
    async (_description, url) => {
      stubProductionEnvironment(url);
      const { getPriceStores } = await importPriceStoresAnew();

      const stores = await getPriceStores();

      expect(stores.notices).toBe(await unavailableNoticeStoreOfTheNewGraph());
      expect(constructions.notices).toHaveLength(0);
    },
  );

  it.each([
    ["spaces", "   "],
    ["a line break", "\n"],
    ["tabs", "\t\t"],
  ])(
    "is refused to the request that met a DATABASE_URL of %s, which is no connection to make, and is tried again by the next",
    async (_description, url) => {
      stubProductionEnvironment(url);
      const { getPriceStores } = await importPriceStoresAnew();

      await expect(getPriceStores()).rejects.toBeInstanceOf(Error);
      stubProductionEnvironment(AN_UNREACHABLE_DATABASE_URL);
      const recovered = await getPriceStores();

      expect(recovered.notices).toBe(constructions.notices[0]);
    },
  );

  it("holds the unavailable notice store on a deployment that vetoes the fakes, even with the e2e flag", async () => {
    stubProductionEnvironment(undefined);
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv(FAKE_PRICE_BOOK_FLAG, FAKE_PRICE_BOOK_FLAG_ENABLED);
    const { getPriceStores } = await importPriceStoresAnew();

    const stores = await getPriceStores();

    expect(stores.notices).toBe(await unavailableNoticeStoreOfTheNewGraph());
  });

  it("holds the unavailable notice store when NODE_ENV is unset, which is production", async () => {
    stubProductionEnvironment(undefined);
    vi.stubEnv("NODE_ENV", undefined);
    const { getPriceStores } = await importPriceStoresAnew();

    const stores = await getPriceStores();

    expect(stores.notices).toBe(await unavailableNoticeStoreOfTheNewGraph());
  });
});

describe("the unavailable notice store", () => {
  const A_DESIGN_ID = "D".repeat(21);
  const A_PAIR = { versionId: "V".repeat(21), availabilityRevision: "0" };

  const callEachMethod = [
    () => UNAVAILABLE_PRICE_NOTICE_STORE.readAcknowledged(A_DESIGN_ID),
    () => UNAVAILABLE_PRICE_NOTICE_STORE.recordIfAbsent(A_DESIGN_ID, A_PAIR),
    () =>
      UNAVAILABLE_PRICE_NOTICE_STORE.recordAcknowledged(A_DESIGN_ID, A_PAIR),
  ];

  it("has exactly the three methods of the port, no more", () => {
    expect(Object.keys(UNAVAILABLE_PRICE_NOTICE_STORE).sort()).toEqual([
      "readAcknowledged",
      "recordAcknowledged",
      "recordIfAbsent",
    ]);
  });

  it.each(callEachMethod.map((call, index) => [index, call] as const))(
    "answers method %i with a rejection and never throws before it returns one",
    async (_index, call) => {
      let returned: Promise<unknown> | undefined;
      expect(() => {
        returned = call();
      }).not.toThrow();

      await expect(returned).rejects.toBeInstanceOf(DashboardStoreError);
    },
  );

  it.each(callEachMethod.map((call, index) => [index, call] as const))(
    "answers method %i with a fresh rejection each time, so no caller shares or mutates another's",
    async (_index, call) => {
      const first = call();
      const second = call();
      const [firstError, secondError] = await Promise.all([
        first.catch((error: unknown) => error),
        second.catch((error: unknown) => error),
      ]);

      expect(first).not.toBe(second);
      expect(firstError).not.toBe(secondError);
    },
  );

  it("cannot have a method replaced, added or removed", () => {
    const replaced = Reflect.set(
      UNAVAILABLE_PRICE_NOTICE_STORE,
      "readAcknowledged",
      () => Promise.resolve(NEVER_RECORDED),
    );
    const added = Reflect.set(UNAVAILABLE_PRICE_NOTICE_STORE, "extra", 1);
    const removed = Reflect.deleteProperty(
      UNAVAILABLE_PRICE_NOTICE_STORE,
      "recordAcknowledged",
    );

    expect([replaced, added, removed]).toEqual([false, false, false]);
    expect(Object.keys(UNAVAILABLE_PRICE_NOTICE_STORE)).toHaveLength(3);
  });

  it("refuses with unavailable even for arguments the database store would call invalid, so an outage is never read as a bad request", async () => {
    await expect(
      UNAVAILABLE_PRICE_NOTICE_STORE.recordAcknowledged("not-an-id", {
        versionId: "x",
        availabilityRevision: "-1",
      }),
    ).rejects.toMatchObject({ failure: "unavailable" });
  });
});

describe("the seeded world", () => {
  it("holds the fake in a development or test process whatever DATABASE_URL names, and makes no database store", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATABASE_URL", AN_UNREACHABLE_DATABASE_URL);
    const { getPriceStores } = await importPriceStoresAnew();

    const stores = await getPriceStores();

    expect(stores.notices).toBeInstanceOf(FakePriceNoticeStore);
    expect(constructions.notices).toHaveLength(0);
  });

  it("hands every concurrent first use the one fake, made over the one world", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const { getPriceStores } = await importPriceStoresAnew();

    const stores = await Promise.all(
      Array.from({ length: 20 }, () => getPriceStores()),
    );

    expect(new Set(stores.map((held) => held.notices)).size).toBe(1);
    expect(new Set(stores).size).toBe(1);
  });

  it("holds a fresh fake, with no marker, for a process whose world was forgotten", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const { getPriceStores } = await importPriceStoresAnew();
    const first = await getPriceStores();
    await first.notices.recordIfAbsent("D".repeat(21), {
      versionId: "V".repeat(21),
      availabilityRevision: "0",
    });

    forgetHeldPriceStores();
    const second = await getPriceStores();

    expect(second.notices).not.toBe(first.notices);
    expect(await second.notices.readAcknowledged("D".repeat(21))).toBe(
      NEVER_RECORDED,
    );
  });
});
