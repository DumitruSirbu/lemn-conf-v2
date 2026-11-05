// The usage read's two guards against a count that outlives its answer: the deadline aborts the reader it started, and one
// count per account is in flight at a time. Held to what each owes on every path, to a second account, and to the draft
// writes beside them. The slot is process state, so every test settles what it left pending.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Design, ItemRef } from "@lemnaria/configurator-domain";
import type { KitchenUsageReader } from "@lemnaria/persistence";

import {
  UsageReadDeadlineError,
  USAGE_READ_DEADLINE_MS,
} from "@/lib/server/price-dashboard/item-usage-read";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  captureConsole,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
} from "../../../support/account-world";
import {
  administrator,
  type Administrator,
} from "../../../support/availability-route-world";
import {
  readUsage,
  setAvailability,
} from "../../../support/price-dashboard-requests";
import {
  ANCHORED_BOOK,
  freshPriceDashboardWorld,
  priceStoreAsks,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import { freshStaffWorld } from "../../../support/staff-world";
import { designOf, readerOver } from "../../../support/usage-parity-model";

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/staff/staff-audit-store-instance", () =>
  import("../../../support/staff-world").then((world) =>
    world.staffAuditStoreModule(),
  ),
);
vi.mock("@/lib/server/price-stores", () =>
  import("../../../support/price-dashboard-world").then((world) =>
    world.priceStoresModule(),
  ),
);

const VENEER = { kind: "material", tierId: "material.veneer" } as const;
const SOFT_CLOSE = { kind: "hardware", tierId: "hardware.soft-close" } as const;
const ONE_MORE_MS = 1;

type KitchenUsageResult = Awaited<ReturnType<KitchenUsageReader["countEach"]>>;

let console_: ReturnType<typeof captureConsole>;
let prices: PriceDashboardWorld;
let admin: Administrator;
let settleWhatIsLeftPending: (() => void)[];

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld();
  admin = await administrator();
  console_ = captureConsole();
  settleWhatIsLeftPending = [];
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(async () => {
  for (const settle of settleWhatIsLeftPending) settle();
  await vi.advanceTimersByTimeAsync(0).catch(() => undefined);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function askedFor(
  items: readonly ItemRef[],
  who: Administrator = admin,
): Promise<Response> {
  return readUsage({ cookie: who.cookie, json: { items } });
}

/** A reader whose answer is held until the test releases it, and which records what it was handed. */
function heldReader() {
  let release: (result: KitchenUsageResult) => void = () => undefined;
  const answer = new Promise<KitchenUsageResult>((resolve) => {
    release = resolve;
  });
  const handed: { signal: AbortSignal | undefined }[] = [];
  const spy = vi
    .spyOn(prices.defaults, "countEach")
    .mockImplementationOnce((_probes, signal) => {
      handed.push({ signal });
      return answer;
    });
  const releaseWithCounts = () => {
    release({
      counts: [{ item: VENEER, designCount: 3 }],
      unreadableDesigns: 0,
    });
  };
  settleWhatIsLeftPending.push(releaseWithCounts);
  return { spy, handed, releaseWithCounts };
}

async function untilTheReaderIsAsked(
  spy: ReturnType<typeof heldReader>["spy"],
): Promise<void> {
  await vi.waitFor(() => {
    expect(spy).toHaveBeenCalled();
  });
}

async function flush(): Promise<void> {
  for (let turn = 0; turn < 30; turn += 1) await vi.advanceTimersByTimeAsync(0);
}

describe("the signal the deadline owns", () => {
  it("is handed to the reader, is not aborted before the deadline, and is aborted at it with the deadline's own error", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { handed } = heldReader();
    const pending = askedFor([VENEER]);
    await flush();

    const signal = handed[0]?.signal;
    await vi.advanceTimersByTimeAsync(USAGE_READ_DEADLINE_MS - ONE_MORE_MS);
    const abortedEarly = signal?.aborted;
    await vi.advanceTimersByTimeAsync(ONE_MORE_MS);

    expect(signal).toBeInstanceOf(AbortSignal);
    expect(abortedEarly).toBe(false);
    expect(signal?.aborted).toBe(true);
    expect(signal?.reason).toBeInstanceOf(UsageReadDeadlineError);
    expect((await pending).status).toBe(503);
  });

  it("is never aborted by a count that arrived in time, however long the clock runs afterwards", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { handed, releaseWithCounts } = heldReader();
    const pending = askedFor([VENEER]);
    await flush();
    releaseWithCounts();
    await flush();
    await vi.advanceTimersByTimeAsync(USAGE_READ_DEADLINE_MS * 3);

    expect((await pending).status).toBe(200);
    expect(handed[0]?.signal?.aborted).toBe(false);
  });

  it("is a fresh signal for each count: a count after an aborted one is not born aborted", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    heldReader();
    const first = askedFor([VENEER]);
    await flush();
    await vi.advanceTimersByTimeAsync(USAGE_READ_DEADLINE_MS);
    await first;

    const second = askedFor([VENEER]);
    await flush();

    expect((await second).status).toBe(200);
  });

  it("lets a reader that rejects with the signal's reason answer 503 with nothing unhandled", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.spyOn(prices.defaults, "countEach").mockImplementation(
      (_probes, signal) =>
        new Promise((_, reject) => {
          signal?.addEventListener("abort", () => {
            reject(signal.reason as Error);
          });
        }),
    );
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);

    const pending = askedFor([VENEER]);
    await flush();
    await vi.advanceTimersByTimeAsync(USAGE_READ_DEADLINE_MS);
    const answer = await pending;
    await flush();
    process.off("unhandledRejection", unhandled);

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(unhandled).not.toHaveBeenCalled();
  });
});

describe("one count in flight per account", () => {
  it("answers a second count of the same account 429 with a wait of 10 seconds, and asks no store and no reader for it", async () => {
    const { spy, releaseWithCounts } = heldReader();
    const first = askedFor([VENEER]);
    await untilTheReaderIsAsked(spy);
    const storeAsksWhileFirstRuns = priceStoreAsks.count;

    const second = await askedFor([VENEER]);

    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).toBe("10");
    expect(second.headers.get("cache-control")).toMatch(/no-store/);
    expect(await jsonOf(second)).toEqual({ status: "rate-limited" });
    expect(priceStoreAsks.count).toBe(storeAsksWhileFirstRuns);
    expect(spy).toHaveBeenCalledTimes(1);
    releaseWithCounts();
    expect((await first).status).toBe(200);
  });

  it("frees the slot when the first count is answered", async () => {
    const { spy, releaseWithCounts } = heldReader();
    const first = askedFor([VENEER]);
    await untilTheReaderIsAsked(spy);
    releaseWithCounts();
    await first;

    const next = await askedFor([VENEER]);

    expect(next.status).toBe(200);
  });

  it("does not hold up another account, whose count runs while the first account's is in flight", async () => {
    const other = await administrator("other-administrator@example.test");
    limiterLedger.knowAccount(other.accountId);
    const { spy, releaseWithCounts } = heldReader();
    const first = askedFor([VENEER]);
    await untilTheReaderIsAsked(spy);

    const otherAccount = await askedFor([SOFT_CLOSE], other);
    const sameAccount = await askedFor([VENEER]);

    expect(otherAccount.status).toBe(200);
    expect(sameAccount.status).toBe(429);
    releaseWithCounts();
    await first;
  });

  it("does not stand in the way of a draft write of the same account", async () => {
    const { spy, releaseWithCounts } = heldReader();
    const first = askedFor([VENEER]);
    await untilTheReaderIsAsked(spy);

    const draft = await setAvailability({
      cookie: admin.cookie,
      json: {
        expectedRevision: (await prices.stores.availability.readCurrent())
          .revision,
        item: SOFT_CLOSE,
        active: false,
      },
    });

    expect(draft.status).toBe(200);
    releaseWithCounts();
    await first;
  });

  it("is spent only once the request was admitted: a refused body does not wait behind a count in flight", async () => {
    const { spy, releaseWithCounts } = heldReader();
    const first = askedFor([VENEER]);
    await untilTheReaderIsAsked(spy);

    const refused = await readUsage({
      cookie: admin.cookie,
      json: { items: [], x: 1 },
    });

    expect(refused.status).toBe(400);
    releaseWithCounts();
    await first;
  });

  const FAILURES: readonly (readonly [string, () => void])[] = [
    [
      "a reader that rejects",
      () => {
        vi.spyOn(prices.defaults, "countEach").mockRejectedValueOnce(
          new Error("down"),
        );
      },
    ],
    [
      "a reader that throws before it returns",
      () => {
        vi.spyOn(prices.defaults, "countEach").mockImplementationOnce(() => {
          throw new Error("thrown");
        });
      },
    ],
    [
      "a reader that answers what is not a count",
      () => {
        vi.spyOn(prices.defaults, "countEach").mockResolvedValueOnce({
          counts: [],
          unreadableDesigns: Number.NaN,
        });
      },
    ],
    [
      "a book that cannot be read",
      () => {
        vi.spyOn(prices.stores.priceBook, "readActive").mockRejectedValueOnce(
          new Error("book store down"),
        );
      },
    ],
    [
      "a store that cannot be reached",
      () => {
        vi.spyOn(prices.stores.priceBook, "readActive").mockImplementationOnce(
          () => {
            throw new Error("thrown");
          },
        );
      },
    ],
  ];

  it.each(FAILURES)(
    "frees the slot after %s, so the next count is answered and not 429",
    async (_name, makeItFail) => {
      makeItFail();

      const failed = await askedFor([VENEER]);
      const next = await askedFor([VENEER]);

      expect(failed.status).toBe(503);
      expect(next.status).toBe(200);
    },
  );

  it("frees the slot after a count given up at the deadline", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    heldReader();
    const first = askedFor([VENEER]);
    await flush();
    await vi.advanceTimersByTimeAsync(USAGE_READ_DEADLINE_MS);
    await first;

    const next = askedFor([VENEER]);
    await flush();

    expect((await next).status).toBe(200);
  });

  it("frees the slot after an answer that is 409 because no version was ever published", async () => {
    freshAccountWorld();
    freshStaffWorld();
    prices = await freshPriceDashboardWorld({ isPublished: false });
    admin = await administrator();

    const first = await askedFor([VENEER]);
    const second = await askedFor([VENEER]);

    expect([first.status, second.status]).toEqual([409, 409]);
  });

  it("frees the slot within the deadline of the count even when the book it started from is never read", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.spyOn(prices.stores.priceBook, "readActive").mockImplementationOnce(
      () => new Promise(() => undefined),
    );
    askedFor([VENEER]).catch(() => undefined);
    await flush();
    await vi.advanceTimersByTimeAsync(USAGE_READ_DEADLINE_MS * 2);

    const next = askedFor([VENEER]);
    await flush();

    expect((await next).status).not.toBe(429);
  });
});

describe("a tier or a linked accessory the active book does not state", () => {
  const NAMED_BY_A_DESIGN_ONLY: readonly ItemRef[] = [
    { kind: "material", tierId: "material.dropped" },
    { kind: "hardware", tierId: "hardware.dropped" },
    { kind: "accessory", accessoryId: "linked-never-stated" },
  ];
  const DESIGN_NAMING_THE_DROPPED_TIERS: Design = {
    ...designOf({
      depthMm: 600,
      hasSettings: true,
      materialTierId: undefined,
      hardwareTierId: undefined,
      kitchenFinish: undefined,
      kitchenHandle: undefined,
      cabinetFinish: undefined,
      removedPlacementIds: [],
    }),
    settings: {
      cabinetDepthMm: 600,
      materialTierId: "material.dropped",
      hardwareTierId: "hardware.dropped",
    },
  };

  it("is left out of the answer with the reader never asked, though a saved design names it: the answer is for items the book states", async () => {
    const spy = vi
      .spyOn(prices.defaults, "countEach")
      .mockImplementation((probes) =>
        readerOver([DESIGN_NAMING_THE_DROPPED_TIERS]).countEach(probes),
      );

    const answer = await askedFor(NAMED_BY_A_DESIGN_ONLY);

    expect(await jsonOf(answer)).toEqual({ counts: [] });
    expect(spy).not.toHaveBeenCalled();
  });

  it("is left out of the probes handed to the reader, and the stated items beside it are still counted", async () => {
    const spy = vi
      .spyOn(prices.defaults, "countEach")
      .mockImplementation((probes) =>
        readerOver([DESIGN_NAMING_THE_DROPPED_TIERS]).countEach(probes),
      );
    const stated: ItemRef = {
      kind: "material",
      tierId: ANCHORED_BOOK.material.defaultTierId,
    };

    const answer = await askedFor([...NAMED_BY_A_DESIGN_ONLY, stated]);

    const handed = spy.mock.calls[0]?.[0] ?? [];
    expect(handed.map(({ item }) => item)).toEqual([stated]);
    const { counts } = (await jsonOf(answer)) as {
      counts: { item: ItemRef; count: number }[];
    };
    expect(counts.map(({ item }) => item)).toEqual([stated]);
  });
});

describe("a count whose book arrives after the deadline", () => {
  /** The active version, answered `afterMs` after it was asked for. */
  function bookArrivingAt(afterMs: number): void {
    const real = prices.stores.priceBook.readActive.bind(
      prices.stores.priceBook,
    );
    vi.spyOn(prices.stores.priceBook, "readActive").mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            void real().then(resolve);
          }, afterMs);
        }),
    );
  }

  it("is 503 at the deadline, and the reader it would then start is given a signal that has already aborted", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    bookArrivingAt(USAGE_READ_DEADLINE_MS + 1);
    const spy = vi.spyOn(prices.defaults, "countEach");

    const pending = askedFor([VENEER]);
    await flush();
    await vi.advanceTimersByTimeAsync(USAGE_READ_DEADLINE_MS);
    const answer = await pending;
    await vi.advanceTimersByTimeAsync(100);
    await flush();

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    for (const [, signal] of spy.mock.calls) {
      expect(signal?.aborted).toBe(true);
    }
  });

  it("writes no line of unreadable designs for a count that finishes late", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    bookArrivingAt(USAGE_READ_DEADLINE_MS + 1);
    vi.spyOn(prices.defaults, "countEach").mockResolvedValue({
      counts: [{ item: VENEER, designCount: 1 }],
      unreadableDesigns: 5,
    });

    const pending = askedFor([VENEER]);
    await flush();
    await vi.advanceTimersByTimeAsync(USAGE_READ_DEADLINE_MS);
    await pending;
    await vi.advanceTimersByTimeAsync(100);
    await flush();

    const written = console_
      .accountLines()
      .filter((line) => "unreadableDesigns" in line);
    expect(written).toEqual([]);
  });

  it("is answered normally when the book arrives the instant before the deadline", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    bookArrivingAt(USAGE_READ_DEADLINE_MS - 1);

    const pending = askedFor([VENEER]);
    await flush();
    await vi.advanceTimersByTimeAsync(USAGE_READ_DEADLINE_MS);

    expect((await pending).status).toBe(200);
  });

  it("is 503 at the deadline, with the slot freed, when the book arrives as no version after the deadline", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.spyOn(prices.stores.priceBook, "readActive").mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({ kind: "none" } as never);
          }, USAGE_READ_DEADLINE_MS + 1);
        }),
    );

    const first = askedFor([VENEER]);
    await flush();
    await vi.advanceTimersByTimeAsync(USAGE_READ_DEADLINE_MS);
    const answered = await first;
    await vi.advanceTimersByTimeAsync(100);
    const next = askedFor([VENEER]);
    await flush();

    expect(answered.status).toBe(503);
    expect((await next).status).toBe(200);
  });
});
