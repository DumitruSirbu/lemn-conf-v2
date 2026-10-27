import { SAMPLE_PRICE_BOOK } from "@lemnaria/configurator-domain";
import {
  DashboardStoreError,
  NO_ACTIVE_VERSION,
  type CatalogueAvailabilityStore,
  type PriceBookStore,
} from "@lemnaria/persistence";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_DISABLED_ITEMS,
  readActivePriceBook,
} from "@/lib/server/active-price-book";
import { NO_PRICE_BOOK_CAUSES } from "@/lib/server/price-book-log";
import {
  PRICE_STORES_GLOBAL_KEY,
  selectPriceStores,
  type PriceStoreEnvironment,
} from "@/lib/server/price-stores";
import { NO_PRICE_BOOK } from "@/price/price-book-root";

// Adversarial QA for M10 wave R1's review round: the version identity a stored book must carry, the bounds on what the
// store may say is switched off, the closed list of causes a refused book writes, and the store-selection tripwire.

const loading = vi.hoisted(() => ({ seedModuleLoads: 0 }));

vi.mock("@/lib/server/price-book-test-seed", async (importOriginal) => {
  loading.seedModuleLoads += 1;
  return importOriginal();
});

const VERSION_ID = "the-stored-version";
const MAX_ID_LENGTH = 64;
const MAX_REVISION_DIGITS = 19;
const SECRET = "hunter2-do-not-log";

const AVAILABLE = { revision: "1", disabled: [] as unknown[] };

function storesHolding(
  stored: { versionId: string; book: unknown } | "none",
  availability: () => Promise<unknown> = () => Promise.resolve(AVAILABLE),
) {
  return {
    priceBook: {
      readActive: () =>
        stored === "none"
          ? Promise.resolve(NO_ACTIVE_VERSION)
          : Promise.resolve({
              kind: "found" as const,
              version: {
                versionId: stored.versionId,
                sequenceNumber: 1,
                label: "A label",
                publishedAt: new Date(0),
                book: stored.book,
              },
            }),
    } as unknown as PriceBookStore,
    availability: {
      readCurrent: availability,
    } as unknown as CatalogueAvailabilityStore,
  };
}

function stampedSample(versionId: string = VERSION_ID): unknown {
  return { ...SAMPLE_PRICE_BOOK, version: versionId };
}

function storesWithAvailability(availability: unknown) {
  return storesHolding({ versionId: VERSION_ID, book: stampedSample() }, () =>
    Promise.resolve(availability),
  );
}

let written: unknown[][];

beforeEach(() => {
  written = [];
  vi.spyOn(console, "error").mockImplementation((...line: unknown[]) => {
    written.push(line);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  Reflect.deleteProperty(globalThis, PRICE_STORES_GLOBAL_KEY);
});

describe("a stored book states its version's id as its own version", () => {
  it("is the book of the request when it does", async () => {
    const root = await readActivePriceBook(
      storesHolding({ versionId: VERSION_ID, book: stampedSample() }),
    );

    expect(root.kind === "active" && root.book.version).toBe(VERSION_ID);
  });

  it.each([
    ["another id", "another-id"],
    ["the same id in another case", VERSION_ID.toUpperCase()],
    ["the id with a trailing space", `${VERSION_ID} `],
    ["the id with a leading space", ` ${VERSION_ID}`],
    ["the id with a trailing line feed", `${VERSION_ID}\n`],
    ["the id as a prefix", `${VERSION_ID}-2`],
    ["the id as a suffix", `2-${VERSION_ID}`],
    ["the sample book's authored text", SAMPLE_PRICE_BOOK.version],
  ])("is refused when the book says %s", async (_, authored) => {
    const root = await readActivePriceBook(
      storesHolding({ versionId: VERSION_ID, book: stampedSample(authored) }),
    );

    expect(root).toBe(NO_PRICE_BOOK);
    expect(written).toEqual([
      ["[price-book]", { event: "no-price-book", cause: "version-mismatch" }],
    ]);
  });

  it("is never taken from the version's id by changing the book: the book handed on says the id, not the text it was stored with", async () => {
    const root = await readActivePriceBook(
      storesHolding({ versionId: VERSION_ID, book: stampedSample() }),
    );

    expect(root.kind === "active" && root.versionId).toBe(
      root.kind === "active" ? root.book.version : "",
    );
  });
});

describe("what the store may say is switched off is bounded", () => {
  const itemsOf = (count: number): unknown[] =>
    Array.from({ length: count }, (_, index) => ({
      kind: "accessory",
      accessoryId: `accessory-${String(index)}`,
    }));

  it("takes exactly the most items, and refuses one more", async () => {
    const atTheMost = await readActivePriceBook(
      storesWithAvailability({
        revision: "1",
        disabled: itemsOf(MAX_DISABLED_ITEMS),
      }),
    );
    const oneMore = await readActivePriceBook(
      storesWithAvailability({
        revision: "1",
        disabled: itemsOf(MAX_DISABLED_ITEMS + 1),
      }),
    );

    expect(atTheMost.kind).toBe("active");
    expect(oneMore).toBe(NO_PRICE_BOOK);
  });

  it.each([
    ["a material tier", (id: string) => ({ kind: "material", tierId: id })],
    ["a hardware tier", (id: string) => ({ kind: "hardware", tierId: id })],
    ["a finish", (id: string) => ({ kind: "finish", finishId: id })],
    ["an accessory", (id: string) => ({ kind: "accessory", accessoryId: id })],
  ])(
    "takes an id of the longest length and refuses one character more, for %s",
    async (_, itemOf) => {
      const atTheMost = await readActivePriceBook(
        storesWithAvailability({
          revision: "1",
          disabled: [itemOf("x".repeat(MAX_ID_LENGTH))],
        }),
      );
      const oneMore = await readActivePriceBook(
        storesWithAvailability({
          revision: "1",
          disabled: [itemOf("x".repeat(MAX_ID_LENGTH + 1))],
        }),
      );

      expect(atTheMost.kind).toBe("active");
      expect(oneMore).toBe(NO_PRICE_BOOK);
    },
  );

  it("takes a revision of nineteen digits and refuses twenty", async () => {
    const widest = await readActivePriceBook(
      storesWithAvailability({
        revision: "9".repeat(MAX_REVISION_DIGITS),
        disabled: [],
      }),
    );
    const tooWide = await readActivePriceBook(
      storesWithAvailability({
        revision: "9".repeat(MAX_REVISION_DIGITS + 1),
        disabled: [],
      }),
    );

    expect(widest.kind).toBe("active");
    expect(tooWide).toBe(NO_PRICE_BOOK);
  });

  it("refuses an oversize answer as one line naming the bound that was broken and nothing it held", async () => {
    await readActivePriceBook(
      storesWithAvailability({
        revision: "1",
        disabled: [{ kind: "material", tierId: `${SECRET}${"x".repeat(80)}` }],
      }),
    );

    expect(written).toEqual([
      [
        "[price-book]",
        { event: "no-price-book", cause: "availability-too-large" },
      ],
    ]);
  });

  it("refuses a revision that is not text, rather than passing it on", async () => {
    const root = await readActivePriceBook(
      storesWithAvailability({ revision: 12, disabled: [] }),
    );

    expect(root).toBe(NO_PRICE_BOOK);
  });

  it("is no book, with the cause availability-unreadable, for an answer with no list of items", async () => {
    for (const answer of [
      { revision: "1", disabled: undefined },
      { revision: "1", disabled: null },
      { revision: "1", disabled: "accessory" },
      { revision: "1", disabled: { length: 1 } },
      { revision: "1" },
    ]) {
      written = [];

      const root = await readActivePriceBook(storesWithAvailability(answer));

      expect(root, JSON.stringify(answer)).toBe(NO_PRICE_BOOK);
      expect(written).toEqual([
        [
          "[price-book]",
          { event: "no-price-book", cause: "availability-unreadable" },
        ],
      ]);
    }
  });

  // The page serialises the answer, so an id held as a nested value rather than as text is the same free multiplier on
  // every page, and the bound measures only the text members of an item.
  it("refuses an item whose id is a nested value of any size", async () => {
    const root = await readActivePriceBook(
      storesWithAvailability({
        revision: "1",
        disabled: [{ kind: "material", tierId: { deep: "x".repeat(100_000) } }],
      }),
    );

    expect(root).toBe(NO_PRICE_BOOK);
  });
});

describe("the lines a refused book writes are of a closed list and hold nothing of the book", () => {
  const FAILURE_WITH_A_SECRET = new Error(SECRET);

  const CASES: readonly (readonly [
    string,
    () => Promise<unknown>,
    Record<string, unknown>,
  ])[] = [
    [
      "store-unavailable",
      () =>
        readActivePriceBook({
          ...storesHolding("none"),
          priceBook: {
            readActive: () =>
              Promise.reject(
                new DashboardStoreError(
                  "read the active price version",
                  "unavailable",
                  { cause: FAILURE_WITH_A_SECRET },
                ),
              ),
          } as unknown as PriceBookStore,
        }),
      {
        event: "no-price-book",
        cause: "store-unavailable",
        operation: "read the active price version",
        kind: "unavailable",
      },
    ],
    [
      "store-failed",
      () =>
        readActivePriceBook({
          ...storesHolding("none"),
          priceBook: {
            readActive: () =>
              Promise.reject(
                new DashboardStoreError(
                  "read the active price version",
                  "database",
                  { cause: FAILURE_WITH_A_SECRET },
                ),
              ),
          } as unknown as PriceBookStore,
        }),
      {
        event: "no-price-book",
        cause: "store-failed",
        operation: "read the active price version",
        kind: "database",
      },
    ],
    [
      "book-unparseable",
      () =>
        readActivePriceBook(
          storesHolding({
            versionId: VERSION_ID,
            book: { label: SECRET, version: VERSION_ID },
          }),
        ),
      { event: "no-price-book", cause: "book-unparseable" },
    ],
    [
      "version-mismatch",
      () =>
        readActivePriceBook(
          storesHolding({
            versionId: VERSION_ID,
            book: { ...(stampedSample(SECRET) as object) },
          }),
        ),
      { event: "no-price-book", cause: "version-mismatch" },
    ],
    [
      "availability-unreadable",
      () =>
        readActivePriceBook(
          storesHolding({ versionId: VERSION_ID, book: stampedSample() }, () =>
            Promise.reject(
              new DashboardStoreError(
                "read the catalogue availability",
                "database",
                { cause: FAILURE_WITH_A_SECRET },
              ),
            ),
          ),
        ),
      {
        event: "no-price-book",
        cause: "availability-unreadable",
        operation: "read the catalogue availability",
        kind: "database",
      },
    ],
    [
      "availability-too-large",
      () =>
        readActivePriceBook(
          storesWithAvailability({
            revision: SECRET.repeat(5),
            disabled: [],
          }),
        ),
      { event: "no-price-book", cause: "availability-too-large" },
    ],
  ];

  it.each(CASES)(
    "writes one line for %s, with its cause and the store's own operation and kind alone",
    async (_, run, line) => {
      const root = await run();

      expect(root).toBe(NO_PRICE_BOOK);
      expect(written).toEqual([["[price-book]", line]]);
      expect(JSON.stringify(written)).not.toContain(SECRET);
    },
  );

  it("writes no line for a version that was never published", async () => {
    expect(await readActivePriceBook(storesHolding("none"))).toBe(
      NO_PRICE_BOOK,
    );

    expect(written).toEqual([]);
  });

  it("writes a line, then lets a defect through, naming nothing the defect said", async () => {
    const stores = {
      ...storesHolding("none"),
      priceBook: {
        readActive: () => Promise.reject(new TypeError(SECRET)),
      } as unknown as PriceBookStore,
    };

    await expect(readActivePriceBook(stores)).rejects.toThrow(SECRET);

    expect(written).toEqual([
      ["[price-book]", { event: "no-price-book", cause: "unexpected" }],
    ]);
  });

  it("answers the same when the line cannot be written", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {
      throw new Error("the log is closed");
    });

    const root = await readActivePriceBook(
      storesHolding({ versionId: VERSION_ID, book: { not: "a book" } }),
    );

    expect(root).toBe(NO_PRICE_BOOK);
  });

  it("never writes a cause that is not on the list, over every way a stored book and an answer can be wrong", async () => {
    const hostile = fc.anything({ withBigInt: true, withNullPrototype: true });
    await fc.assert(
      fc.asyncProperty(hostile, hostile, async (book, availability) => {
        written = [];
        try {
          await readActivePriceBook(
            storesHolding({ versionId: VERSION_ID, book }, () =>
              Promise.resolve(availability),
            ),
          );
        } catch {
          // A defect is allowed to escape; what it wrote must still be of the list.
        }

        for (const [label, line] of written) {
          expect(label).toBe("[price-book]");
          const { cause } = line as { cause: string };
          expect(NO_PRICE_BOOK_CAUSES as readonly string[]).toContain(cause);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("has a case here for every cause on the list that a store's answer can reach", () => {
    const covered = CASES.map(([cause]) => cause);

    expect(
      NO_PRICE_BOOK_CAUSES.filter((cause) => cause !== "unexpected"),
    ).toEqual(expect.arrayContaining(covered));
    expect(covered).toHaveLength(NO_PRICE_BOOK_CAUSES.length - 1);
  });
});

describe("a variable only a deployment has forces the real stores", () => {
  const DEPLOYMENT_VARIABLES = ["VERCEL_ENV", "CLIENT_NETWORK_SOURCE"] as const;
  const fakesAsked = fc.oneof(
    fc.record({ NODE_ENV: fc.constantFrom("development", "test") }),
    fc.record({
      NODE_ENV: fc.constant("production"),
      LEMNARIA_E2E_FAKE_PRICE_BOOK: fc.constant("1"),
    }),
    fc.record({
      NODE_ENV: fc.constantFrom("development", "test"),
      LEMNARIA_E2E_FAKE_PRICE_BOOK: fc.constant("1"),
    }),
  );

  it("is production whatever the deployment variable holds, including nothing, beside any request for the fakes", () => {
    fc.assert(
      fc.property(
        fakesAsked,
        fc.constantFrom(...DEPLOYMENT_VARIABLES),
        fc.oneof(fc.constant(""), fc.string({ maxLength: 12 })),
        (asked, variable, value) => {
          const environment: PriceStoreEnvironment = {
            ...asked,
            [variable]: value,
          };

          expect(selectPriceStores(environment)).toBe("production");
        },
      ),
      { numRuns: 500 },
    );
  });

  it("asks for the fakes without it, which is what the tripwire changes", () => {
    fc.assert(
      fc.property(fakesAsked, (asked) => {
        expect(selectPriceStores(asked)).toBe("seeded-fakes");
      }),
    );
  });

  it("is production when both deployment variables are named at once", () => {
    expect(
      selectPriceStores({
        NODE_ENV: "test",
        VERCEL_ENV: "preview",
        CLIENT_NETWORK_SOURCE: "vercel",
      }),
    ).toBe("production");
  });

  it("does not take a deployment variable the environment merely inherits", () => {
    const inherited = Object.create({
      VERCEL_ENV: "production",
    }) as PriceStoreEnvironment;
    Object.assign(inherited, { NODE_ENV: "test" });

    expect(selectPriceStores(inherited)).toBe("seeded-fakes");
  });

  it("is production for the process too: the live environment is what is read", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("CLIENT_NETWORK_SOURCE", "vercel");
    const { getPriceStores } = await import("@/lib/server/price-stores");

    const { priceBook } = await getPriceStores();

    await expect(priceBook.readActive()).rejects.toMatchObject({
      failure: "unavailable",
    });
    expect(loading.seedModuleLoads).toBe(0);
  });
});

describe("the seeding helper is loaded only when a run seeds", () => {
  it("is not loaded by a production selection, nor by importing the stores", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    loading.seedModuleLoads = 0;
    const { getPriceStores } = await import("@/lib/server/price-stores");

    await getPriceStores();

    expect(loading.seedModuleLoads).toBe(0);
  });

  it("is loaded once for a test run, on the first use", async () => {
    vi.resetModules();
    loading.seedModuleLoads = 0;
    const { getPriceStores } = await import("@/lib/server/price-stores");
    expect(loading.seedModuleLoads).toBe(0);

    await getPriceStores();

    expect(loading.seedModuleLoads).toBe(1);
  });
});
