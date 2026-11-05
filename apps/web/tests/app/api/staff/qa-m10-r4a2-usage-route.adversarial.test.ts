// `POST /api/staff/prices/usage` held against what could steer it, exhaust it, or make it answer a number it does not have.
// The bodies that carry a `__proto__` member are sent as raw JSON text: an object literal would set a prototype and
// `JSON.stringify` would drop it, which tests nothing. The route runs over the persistence fakes with the real session,
// capability check, limiter and probe builder.
import { fc } from "@fast-check/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as usageRoute from "@/app/api/staff/prices/usage/route";
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  distinctItemsInOrder,
  usesItem,
  type Design,
  type ItemRef,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import {
  DashboardStoreError,
  type KitchenUsageReader,
} from "@lemnaria/persistence";

import { USAGE_READ_DEADLINE_MS } from "@/lib/server/price-dashboard/item-usage-read";
import {
  STAFF_PRICE_USAGE_BY_ACCOUNT_POLICY,
  STAFF_PRICE_USAGE_PER_ACCOUNT_HOUR_FIGURE,
} from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { MAX_USAGE_ITEMS } from "@/price-dashboard/price-dashboard-wire-contract";

import {
  captureConsole,
  currentAccountWorld,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
} from "../../../support/account-world";
import {
  administrator,
  allRows,
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
  type PriceDashboardWorldOptions,
} from "../../../support/price-dashboard-world";
import { freshStaffWorld, signedInAs } from "../../../support/staff-world";
import {
  aDesignRecipe,
  bookOf,
  designOf,
  HARDWARE_TIERS,
  isUnstatedTierOrLinkedAccessory,
  ITEM_POOL,
  MATERIAL_TIERS,
  readerOver,
  ROW_WITH_SEEDED_EQUIVALENT,
  someItems,
  type BookRecipe,
} from "../../../support/usage-parity-model";

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
const THE_BUCKET = STAFF_PRICE_USAGE_BY_ACCOUNT_POLICY.name;
const THE_BODY_BOUND_BYTES = 8 * 1024;

let prices: PriceDashboardWorld;
let admin: Administrator;
let console_: ReturnType<typeof captureConsole>;

async function startWorld(options?: PriceDashboardWorldOptions): Promise<void> {
  freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld(options);
  admin = await administrator();
  console_ = captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
}

beforeEach(async () => {
  await startWorld();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function askedAsText(bodyText: string): Promise<Response> {
  return readUsage({ cookie: admin.cookie, json: bodyText });
}

function askedFor(items: unknown): Promise<Response> {
  return readUsage({ cookie: admin.cookie, json: { items } });
}

function budgetOf(name: string): number {
  return limiterLedger.counted.filter((counted) => counted === name).length;
}

function refText(ref: object): string {
  return JSON.stringify(ref);
}

function accessories(howMany: number): ItemRef[] {
  return Array.from({ length: howMany }, (_, index) => ({
    kind: "accessory",
    accessoryId: `accessory-${String(index)}`,
  }));
}

function readerAnswering(result: unknown): void {
  vi.spyOn(prices.defaults, "countEach").mockReturnValue(
    result as ReturnType<KitchenUsageReader["countEach"]>,
  );
}

describe("a body that tries to steer a probe, sent as raw JSON text", () => {
  const VENEER_TEXT = refText(VENEER);
  const BODIES: readonly (readonly [string, string])[] = [
    [
      "a __proto__ member beside items",
      `{"__proto__":{"isFallback":true},"items":[${VENEER_TEXT}]}`,
    ],
    ["a __proto__ member that carries items", `{"__proto__":{"items":[]}}`],
    [
      "a __proto__ member inside a ref",
      `{"items":[{"kind":"material","tierId":"material.veneer","__proto__":{"isFallback":true}}]}`,
    ],
    [
      "a __proto__ member in place of the ref's id",
      `{"items":[{"kind":"material","__proto__":"material.veneer"}]}`,
    ],
    [
      "a constructor member inside a ref",
      `{"items":[{"kind":"material","tierId":"material.veneer","constructor":{"prototype":{}}}]}`,
    ],
    ...[
      "__proto__",
      "constructor",
      "toString",
      "hasOwnProperty",
      "valueOf",
    ].map((kind): readonly [string, string] => [
      `a kind that is the name ${kind} on every object`,
      `{"items":[{"kind":"${kind}","tierId":"material.veneer"}]}`,
    ]),
    [
      "items as an object that looks like a list",
      `{"items":{"0":${VENEER_TEXT},"length":1}}`,
    ],
    ["a ref inside a list", `{"items":[[${VENEER_TEXT}]]}`],
    [
      "items named twice, the last not a list",
      `{"items":[${VENEER_TEXT}],"items":7}`,
    ],
  ];

  it.each(BODIES)(
    "refuses %s with the bare 400, touches no store and spends no bucket",
    async (_name, bodyText) => {
      limiterLedger.counted.length = 0;

      const answer = await askedAsText(bodyText);

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({ status: "invalid-request" });
      expect(priceStoreAsks.count).toBe(0);
      expect(budgetOf(THE_BUCKET)).toBe(0);
    },
  );

  it("reads the last of two items members, as JSON does: 51 distinct then one is answered, one then 51 is refused", async () => {
    const fiftyOne = JSON.stringify(accessories(MAX_USAGE_ITEMS + 1));

    const lastIsOne = await askedAsText(
      `{"items":${fiftyOne},"items":[${refText(VENEER)}]}`,
    );
    const lastIsFiftyOne = await askedAsText(
      `{"items":[${refText(VENEER)}],"items":${fiftyOne}}`,
    );

    expect(lastIsOne.status).toBe(200);
    expect(lastIsFiftyOne.status).toBe(400);
    expect(await jsonOf(lastIsFiftyOne)).toEqual({
      status: "invalid-input",
      issues: [{ field: "items", code: "TOO_LARGE" }],
    });
  });
});

describe("an id that is also a name on every object", () => {
  const NAMES = [
    "__proto__",
    "constructor",
    "toString",
    "hasOwnProperty",
    "valueOf",
  ];
  const KINDS = [
    (id: string): ItemRef => ({ kind: "material", tierId: id }),
    (id: string): ItemRef => ({ kind: "hardware", tierId: id }),
    (id: string): ItemRef => ({ kind: "finish", finishId: id }),
    (id: string): ItemRef => ({ kind: "accessory", accessoryId: id }),
  ];

  it("is left out where it names a tier or a linked accessory, and answered 0 where it names a finish, beside a used item that keeps its own count", async () => {
    prices.designs.plant({
      designId: "d1",
      uses: [VENEER],
      isDeletedByClient: false,
    });
    const odd = NAMES.flatMap((name) => KINDS.map((make) => make(name)));

    const answer = await askedFor([VENEER, ...odd]);

    expect(answer.status).toBe(200);
    const { counts } = (await jsonOf(answer)) as {
      counts: { item: ItemRef; count: number }[];
    };
    const finishes = odd.filter(({ kind }) => kind === "finish");
    expect(counts).toHaveLength(finishes.length + 1);
    expect(counts.filter(({ count }) => count > 0)).toEqual([
      { item: VENEER, count: 1 },
    ]);
    for (const item of finishes) {
      expect(counts.map((entry) => entry.item)).toContainEqual(item);
    }
    for (const item of odd.filter(({ kind }) => kind !== "finish")) {
      expect(counts.map((entry) => entry.item)).not.toContainEqual(item);
    }
  });
});

describe("a cap that cannot be walked around", () => {
  it("answers 50 distinct items of mixed kinds, and refuses the 51st of any kind", async () => {
    const mixed: ItemRef[] = [
      ...MATERIAL_TIERS.map(
        (tierId): ItemRef => ({ kind: "material", tierId }),
      ),
      ...HARDWARE_TIERS.map(
        (tierId): ItemRef => ({ kind: "hardware", tierId }),
      ),
      ...accessories(MAX_USAGE_ITEMS),
    ].slice(0, MAX_USAGE_ITEMS);
    const aFinish: ItemRef = { kind: "finish", finishId: "veneer.nuc" };

    const fifty = await askedFor(mixed);
    const fiftyOne = await askedFor([...mixed, aFinish]);

    expect(mixed).toHaveLength(MAX_USAGE_ITEMS);
    expect(fifty.status).toBe(200);
    expect(fiftyOne.status).toBe(400);
  });

  it("counts a ref whose members are written in the other order as the same item, so 50 distinct and its twin are answered, none of them stated", async () => {
    const fifty = accessories(MAX_USAGE_ITEMS).map(refText);
    const twinOfTheFirst = `{"accessoryId":"accessory-0","kind":"accessory"}`;

    const answer = await askedAsText(
      `{"items":[${[...fifty, twinOfTheFirst].join(",")}]}`,
    );

    expect(answer.status).toBe(200);
    expect(((await jsonOf(answer)) as { counts: unknown[] }).counts).toEqual(
      [],
    );
  });

  it("leaves out a material and a hardware class that share an id and that the book does not state, and mistakes neither for the other", async () => {
    const answer = await askedFor([
      { kind: "material", tierId: "shared" },
      { kind: "hardware", tierId: "shared" },
    ]);

    expect(((await jsonOf(answer)) as { counts: unknown[] }).counts).toEqual(
      [],
    );
  });

  it("answers the most duplicates the body bound lets through as one entry, and refuses a body one byte over with 413 before any store", async () => {
    const ref = refText({ kind: "finish", finishId: "a" });
    const bodyOf = (copies: number) =>
      `{"items":[${Array.from({ length: copies }, () => ref).join(",")}]}`;
    let copies = 1;
    while (bodyOf(copies + 1).length <= THE_BODY_BOUND_BYTES) copies += 1;

    const atTheBound = await askedAsText(bodyOf(copies));
    const overTheBound = await askedAsText(bodyOf(copies + 1));

    expect(atTheBound.status).toBe(200);
    expect(
      ((await jsonOf(atTheBound)) as { counts: unknown[] }).counts,
    ).toHaveLength(1);
    expect(overTheBound.status).toBe(413);
    expect(priceStoreAsks.count).toBe(1);
  });
});

describe("the order of checks, beyond the first", () => {
  it("answers a session that has expired 401, and spends nothing", async () => {
    limiterLedger.counted.length = 0;
    const FOUR_HUNDRED_DAYS_MS = 400 * 24 * 60 * 60 * 1000;
    currentAccountWorld().advance(FOUR_HUNDRED_DAYS_MS);

    const answer = await askedFor([VENEER]);

    expect(answer.status).toBe(401);
    expect(budgetOf(THE_BUCKET)).toBe(0);
    expect(priceStoreAsks.count).toBe(0);
  });

  it("only answers methods it is written for: POST alone", () => {
    expect(Object.keys(usageRoute).sort()).toEqual([
      "POST",
      "dynamic",
      "runtime",
    ]);
  });
});

describe("the bucket, spent for real", () => {
  it("lets one account ask 120 times an hour and refuses the 121st, while another account and the draft writes are not touched", async () => {
    const other = await administrator("other-administrator@example.test");
    limiterLedger.knowAccount(other.accountId);
    const answers: number[] = [];
    for (
      let asked = 0;
      asked <= STAFF_PRICE_USAGE_PER_ACCOUNT_HOUR_FIGURE;
      asked += 1
    ) {
      answers.push((await askedFor([VENEER])).status);
    }

    const otherAccount = await readUsage({
      cookie: other.cookie,
      json: { items: [VENEER] },
    });
    const draftWrite = await setAvailability({
      cookie: admin.cookie,
      json: {
        expectedRevision: (await prices.stores.availability.readCurrent())
          .revision,
        item: SOFT_CLOSE,
        active: false,
      },
    });

    expect(answers.slice(0, STAFF_PRICE_USAGE_PER_ACCOUNT_HOUR_FIGURE)).toEqual(
      Array.from(
        { length: STAFF_PRICE_USAGE_PER_ACCOUNT_HOUR_FIGURE },
        () => 200,
      ),
    );
    expect(answers[STAFF_PRICE_USAGE_PER_ACCOUNT_HOUR_FIGURE]).toBe(429);
    expect(otherAccount.status).toBe(200);
    expect(draftWrite.status).toBe(200);
  });
});

describe("a reader that answers what it should not", () => {
  let rowsBefore: number;

  beforeEach(() => {
    rowsBefore = allRows().length;
  });

  async function expectUnavailable(answer: Response): Promise<void> {
    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(allRows()).toHaveLength(rowsBefore);
  }

  const ODD_COUNTS: readonly (readonly [string, unknown])[] = [
    ["NaN", Number.NaN],
    ["1.5", 1.5],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["a number past the safe integers", Number.MAX_SAFE_INTEGER + 1],
    ["the text 3", "3"],
    ["null", null],
    ["nothing", undefined],
    ["a negative number", -1],
  ];

  it.each(ODD_COUNTS)(
    "is 503 and no count for a design count of %s",
    async (_n, designCount) => {
      readerAnswering(
        Promise.resolve({
          counts: [{ item: VENEER, designCount }],
          unreadableDesigns: 0,
        }),
      );

      await expectUnavailable(await askedFor([VENEER]));
    },
  );

  const ODD_RESULTS: readonly (readonly [string, unknown])[] = [
    ["nothing", undefined],
    ["null", null],
    ["no counts member", { unreadableDesigns: 0 }],
    ["counts that is an object", { counts: {}, unreadableDesigns: 0 }],
    ["counts that is text", { counts: "[]", unreadableDesigns: 0 }],
    [
      "a count for another item than the one asked",
      {
        counts: [{ item: SOFT_CLOSE, designCount: 4 }],
        unreadableDesigns: 0,
      },
    ],
  ];

  it.each(ODD_RESULTS)(
    "is 503 and no count for a result of %s",
    async (_n, result) => {
      readerAnswering(Promise.resolve(result));

      await expectUnavailable(await askedFor([VENEER]));
    },
  );

  it("is 503 when the reader throws before it returns a promise", async () => {
    vi.spyOn(prices.defaults, "countEach").mockImplementation(() => {
      throw new Error("thrown synchronously");
    });

    await expectUnavailable(await askedFor([VENEER]));
  });

  it("answers only the items it was asked about when the reader counts one more", async () => {
    readerAnswering(
      Promise.resolve({
        counts: [
          { item: VENEER, designCount: 2 },
          { item: SOFT_CLOSE, designCount: 9 },
        ],
        unreadableDesigns: 0,
      }),
    );

    const answer = await askedFor([VENEER]);

    expect(await jsonOf(answer)).toEqual({
      counts: [{ item: VENEER, count: 2 }],
    });
  });

  it("answers in the domain's order and with the numbers the reader gave each item, whatever order the reader listed them in", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.shuffledSubarray(ITEM_POOL.slice(0, 12), {
          minLength: 2,
          maxLength: 12,
        }),
        fc.nat({ max: 5 }),
        async (asked, rotation) => {
          const withNumbers = asked.map((item, position) => ({
            item,
            designCount: position + 1,
          }));
          const listed = [...withNumbers];
          listed.reverse();
          listed.push(...listed.splice(0, rotation % listed.length));
          vi.spyOn(prices.defaults, "countEach").mockResolvedValue({
            counts: listed,
            unreadableDesigns: 0,
          });

          const answer = await askedFor([...asked, ...asked]);

          const expected = distinctItemsInOrder(asked)
            .filter(
              (item) => !isUnstatedTierOrLinkedAccessory(item, ANCHORED_BOOK),
            )
            .map((item) => ({
              item,
              count: withNumbers.find((entry) => entry.item === item)
                ?.designCount,
            }));
          expect(await jsonOf(answer)).toEqual({ counts: expected });
        },
      ),
      { numRuns: 40, seed: 20_261_105 },
    );
  });
});

describe("a count that cannot be given, in time", () => {
  function settlingAt(
    milliseconds: number,
    settle: "resolve" | "reject",
    unreadableDesigns = 0,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (settle === "resolve") {
          resolve({
            counts: [{ item: VENEER, designCount: 7 }],
            unreadableDesigns,
          });
        } else {
          reject(new Error("late failure"));
        }
      }, milliseconds);
    });
  }

  async function answeredAtTheDeadline(
    pending: Promise<Response>,
  ): Promise<Response> {
    let answer: Response | undefined;
    void pending.then((settled) => {
      answer = settled;
    });
    await vi.advanceTimersByTimeAsync(USAGE_READ_DEADLINE_MS);
    if (answer === undefined) throw new Error("no answer by the deadline");
    return answer;
  }

  it("is 503 at the deadline for a reader that never settles", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    readerAnswering(new Promise(() => undefined));

    const answer = await answeredAtTheDeadline(askedFor([VENEER]));

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
  });

  it("leaves no timer behind after a count that arrives in time, and none after one that fails in time", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const before = vi.getTimerCount();

    const answered = await askedFor([VENEER]);
    const afterAnswer = vi.getTimerCount();
    readerAnswering(Promise.reject(new Error("down")));
    const failed = await askedFor([VENEER]);

    expect([answered.status, failed.status]).toEqual([200, 503]);
    expect(afterAnswer).toBe(before);
    expect(vi.getTimerCount()).toBe(before);
  });

  it("logs nothing of the unreadable designs a count that arrived after the deadline held", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    readerAnswering(settlingAt(USAGE_READ_DEADLINE_MS + 1, "resolve", 5));

    const answer = await answeredAtTheDeadline(askedFor([VENEER]));
    await vi.advanceTimersByTimeAsync(100);

    expect(answer.status).toBe(503);
    expect(
      console_.accountLines().filter((line) => "unreadableDesigns" in line),
    ).toEqual([]);
  });

  it("does not let a second request be answered by the first one's late count", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const asked = vi
      .spyOn(prices.defaults, "countEach")
      .mockReturnValueOnce(
        settlingAt(USAGE_READ_DEADLINE_MS + 1, "resolve") as ReturnType<
          KitchenUsageReader["countEach"]
        >,
      );

    const first = await answeredAtTheDeadline(askedFor([VENEER]));
    await vi.advanceTimersByTimeAsync(10);
    asked.mockRestore();
    const second = await askedFor([VENEER]);

    expect(first.status).toBe(503);
    expect(await jsonOf(second)).toEqual({
      counts: [{ item: VENEER, count: 0 }],
    });
  });
});

describe("what a failure may say", () => {
  const DESIGN_ID = "design-id-4f9a1c";
  const CONNECTION = "postgres://user:secret@db.internal.example/lemnaria";

  it("names no design, no connection string and no item in the answer or in any line written", async () => {
    readerAnswering(
      Promise.reject(
        new Error(`connect failed for ${DESIGN_ID} at ${CONNECTION}`, {
          cause: new Error(`${DESIGN_ID} ${CONNECTION}`),
        }),
      ),
    );

    const answer = await askedFor([{ kind: "finish", finishId: "veneer.nuc" }]);

    const written = `${await answer.clone().text()}${console_.everything()}`;
    expect(answer.status).toBe(503);
    expect(written).not.toContain(DESIGN_ID);
    expect(written).not.toContain("secret");
    expect(written).not.toContain("postgres");
    expect(written).not.toContain("veneer.nuc");
  });

  it("writes lines that hold no item and no design in any outcome, the unreadable-count line included", async () => {
    prices.designs.plant({
      designId: DESIGN_ID,
      uses: [],
      isDeletedByClient: false,
      isUnreadable: true,
    });
    const item = { kind: "finish", finishId: "veneer.nuc" } as const;

    await askedFor([item]);
    await askedFor([]);
    await askedFor(accessories(MAX_USAGE_ITEMS + 1));
    await askedAsText("{nope");
    readerAnswering(Promise.reject(new Error("down")));
    await askedFor([item]);

    const lines = console_.accountLines().map((line) => JSON.stringify(line));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).not.toContain(DESIGN_ID);
      expect(line).not.toContain("veneer.nuc");
      expect(line).not.toContain("accessory-");
    }
  });

  it.each([
    ["NaN", Number.NaN],
    ["a fraction", 1.5],
    ["a negative number", -1],
    ["text", "3"],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])(
    "answers 503 with no counts and writes no line for an unreadable-design count that is %s",
    async (_n, unreadableDesigns) => {
      readerAnswering(
        Promise.resolve({
          counts: [{ item: VENEER, designCount: 1 }],
          unreadableDesigns,
        }),
      );

      const answer = await askedFor([VENEER]);

      expect(answer.status).toBe(503);
      expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
      expect(
        console_.accountLines().filter((line) => "unreadableDesigns" in line),
      ).toEqual([]);
    },
  );

  it("answers 401 and never a count when the reader says no live session was behind it", async () => {
    readerAnswering(
      Promise.reject(
        new DashboardStoreError(
          "count the kitchens using an item",
          "not-recorded",
        ),
      ),
    );

    const answer = await askedFor([VENEER]);
    expect(answer.status).toBe(401);
    expect(await answer.clone().text()).not.toContain("count");
  });
});

describe("a book that cannot be read", () => {
  it("is 503 and no count when the active version cannot be read, and the reader is not asked", async () => {
    vi.spyOn(prices.stores.priceBook, "readActive").mockRejectedValue(
      new Error("book store down"),
    );
    const asked = vi.spyOn(prices.defaults, "countEach");

    const answer = await askedFor([VENEER]);

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(asked).not.toHaveBeenCalled();
  });
});

describe("a design that names no class", () => {
  const NAMELESS: Design = designOf({
    depthMm: 600,
    hasSettings: false,
    materialTierId: undefined,
    hardwareTierId: undefined,
    kitchenFinish: undefined,
    kitchenHandle: undefined,
    cabinetFinish: undefined,
    removedPlacementIds: [],
  });

  it("is counted for the active book's default class of each kind, and for no other", async () => {
    vi.spyOn(prices.defaults, "countEach").mockImplementation((probes) =>
      readerOver([NAMELESS]).countEach(probes),
    );
    const everyClass: ItemRef[] = [
      ...MATERIAL_TIERS.map(
        (tierId): ItemRef => ({ kind: "material", tierId }),
      ),
      ...HARDWARE_TIERS.map(
        (tierId): ItemRef => ({ kind: "hardware", tierId }),
      ),
    ];

    const answer = await askedFor(everyClass);

    const { counts } = (await jsonOf(answer)) as {
      counts: { item: ItemRef; count: number }[];
    };
    expect(
      counts.filter(({ count }) => count === 1).map(({ item }) => item),
    ).toEqual([
      { kind: "material", tierId: ANCHORED_BOOK.material.defaultTierId },
      { kind: "hardware", tierId: ANCHORED_BOOK.hardware.defaultTierId },
    ]);
  });
});

describe("any items, any saved designs of either depth, under the book the store holds", () => {
  const BOOK_RECIPE: BookRecipe = {
    materialDefault: ANCHORED_BOOK.material.defaultTierId,
    hardwareDefault: ANCHORED_BOOK.hardware.defaultTierId,
    linked: [
      { id: "linked-a", row: ROW_WITH_SEEDED_EQUIVALENT ?? "wall-cabinet" },
      { id: "linked-b", row: "wall-cabinet" },
    ],
  };
  const BOOK: PriceBook = bookOf(BOOK_RECIPE, ANCHORED_BOOK);

  function usedBy(designs: readonly Design[], item: ItemRef): number {
    return designs.filter((design) =>
      usesItem({
        design,
        item,
        catalog: buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
        book: BOOK,
      }),
    ).length;
  }

  it("answers for each item the number of designs usesItem says use it", async () => {
    await startWorld({ book: BOOK });
    let designs: readonly Design[] = [];
    vi.spyOn(prices.defaults, "countEach").mockImplementation((probes) =>
      readerOver(designs).countEach(probes),
    );
    let answeredDeep = 0;
    let answeredLinked = 0;

    await fc.assert(
      fc.asyncProperty(
        fc.array(aDesignRecipe, { maxLength: 6 }),
        someItems,
        async (recipes, items) => {
          designs = recipes.map(designOf);

          const answer = await askedFor(items);

          const expected = distinctItemsInOrder(items)
            .filter((item) => !isUnstatedTierOrLinkedAccessory(item, BOOK))
            .map((item) => ({ item, count: usedBy(designs, item) }));
          expect(answer.status).toBe(200);
          expect(await jsonOf(answer)).toEqual({ counts: expected });
          if (designs.some((design) => cabinetDepthMmOf(design) === 700)) {
            answeredDeep += 1;
          }
          if (
            expected.some(
              ({ item, count }) =>
                item.kind === "accessory" &&
                item.accessoryId.startsWith("linked-") &&
                count > 0,
            )
          ) {
            answeredLinked += 1;
          }
        },
      ),
      { numRuns: 60, seed: 20_261_105 },
    );

    expect(answeredDeep).toBeGreaterThan(0);
    expect(answeredLinked).toBeGreaterThan(0);
    expect(budgetOf(THE_BUCKET)).toBeLessThan(
      STAFF_PRICE_USAGE_PER_ACCOUNT_HOUR_FIGURE,
    );
  });
});

describe("every answer, whatever its status", () => {
  it("is not kept by a cache", async () => {
    const operator = await signedInAs({ role: "operator" }, "op@example.test");
    const noBook = async () => {
      await startWorld({ isPublished: false });
      return askedFor([VENEER]);
    };
    const answers = [
      await askedFor([VENEER]),
      await askedFor([]),
      await askedAsText("{nope"),
      await readUsage({ json: { items: [VENEER] } }),
      await readUsage({
        cookie: operator.session.cookie,
        json: { items: [VENEER] },
      }),
    ];
    limiterLedger.refusing.set(THE_BUCKET, 5);
    answers.push(await askedFor([VENEER]));
    limiterLedger.refusing.clear();
    limiterLedger.unavailable.add(THE_BUCKET);
    answers.push(await askedFor([VENEER]));
    limiterLedger.unavailable.clear();
    answers.push(await noBook());

    expect(answers.map(({ status }) => status)).toEqual([
      200, 400, 400, 401, 403, 429, 503, 409,
    ]);
    for (const answer of answers) {
      expect(
        answer.headers.get("cache-control"),
        String(answer.status),
      ).toMatch(/no-store/);
    }
  });
});
