import { SAMPLE_PRICE_BOOK } from "@lemnaria/configurator-domain";
import {
  DashboardStoreError,
  NO_ACTIVE_VERSION,
  type CatalogueAvailabilityStore,
  type PriceBookStore,
} from "@lemnaria/persistence";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NO_PRICE_BOOK } from "@/price/price-book-root";

// The one price-book root of the server: the active version read and parsed once per call, projected onto the declared
// book, with the availability current at that read; and every way of having no book one answer that carries no book and
// writes one line of its cause.

const parse = vi.hoisted(() => ({
  parsePriceBook: vi.fn(),
}));

vi.mock("@lemnaria/configurator-domain", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@lemnaria/configurator-domain")>();
  parse.parsePriceBook.mockImplementation(original.parsePriceBook);
  return { ...original, parsePriceBook: parse.parsePriceBook };
});

const { readActivePriceBook, MAX_DISABLED_ITEMS } = await import(
  "@/lib/server/active-price-book"
);

const AVAILABILITY = { revision: "7", disabled: [] };
const VERSION_ID = "version-id-of-the-store";
/** A stored book states its own version as its version's id. */
const STORED_BOOK = { ...SAMPLE_PRICE_BOOK, version: VERSION_ID };
const SECRET_MARKER = "marker-that-must-not-reach-a-line";

interface CountingStores {
  readonly priceBook: PriceBookStore;
  readonly availability: CatalogueAvailabilityStore;
  readonly readActive: ReturnType<typeof vi.fn>;
  readonly readCurrent: ReturnType<typeof vi.fn>;
}

function storesHolding(
  book: unknown,
  availability: unknown = AVAILABILITY,
): CountingStores {
  const readActive = vi.fn(() =>
    Promise.resolve({
      kind: "found" as const,
      version: {
        versionId: VERSION_ID,
        sequenceNumber: 1,
        label: "A label",
        publishedAt: new Date(0),
        book,
      },
    }),
  );
  return countingStores(readActive, availability);
}

function countingStores(
  readActive: ReturnType<typeof vi.fn>,
  availability: unknown = AVAILABILITY,
): CountingStores {
  const readCurrent = vi.fn(() => Promise.resolve(availability));
  return {
    priceBook: { readActive } as unknown as PriceBookStore,
    availability: { readCurrent } as unknown as CatalogueAvailabilityStore,
    readActive,
    readCurrent,
  };
}

let written: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  parse.parsePriceBook.mockClear();
  written = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  written.mockRestore();
});

function linesWritten(): unknown[] {
  return written.mock.calls.map(([, line]) => line);
}

describe("reading the active price book", () => {
  it("hands the version id, the book and the availability together, and nothing else", async () => {
    const stores = storesHolding(STORED_BOOK);

    const root = await readActivePriceBook(stores);

    expect(root).toEqual({
      kind: "active",
      versionId: VERSION_ID,
      book: STORED_BOOK,
      availability: AVAILABILITY,
    });
    expect(Object.keys(root).sort()).toEqual([
      "availability",
      "book",
      "kind",
      "versionId",
    ]);
    expect(linesWritten()).toEqual([]);
  });

  it("asks each store once and parses the book once for one call", async () => {
    const stores = storesHolding(STORED_BOOK);

    await readActivePriceBook(stores);

    expect(stores.readActive).toHaveBeenCalledTimes(1);
    expect(stores.readCurrent).toHaveBeenCalledTimes(1);
    expect(parse.parsePriceBook).toHaveBeenCalledTimes(1);
  });

  it("reads again for the next call, so a publish between two requests is seen by the second alone", async () => {
    const stores = storesHolding(STORED_BOOK);
    await readActivePriceBook(stores);
    stores.readActive.mockResolvedValueOnce({
      kind: "found",
      version: {
        versionId: "the-next-version",
        sequenceNumber: 2,
        label: "Next",
        publishedAt: new Date(1),
        book: { ...SAMPLE_PRICE_BOOK, version: "the-next-version" },
      },
    });

    const second = await readActivePriceBook(stores);

    expect(second.kind === "active" && second.versionId).toBe(
      "the-next-version",
    );
    expect(parse.parsePriceBook).toHaveBeenCalledTimes(2);
  });
});

describe("a book is handed over as declared and nothing more (security)", () => {
  function withUndeclaredMembers(book: typeof STORED_BOOK): unknown {
    const extra = { undeclared: SECRET_MARKER };
    return {
      ...book,
      ...extra,
      // An anchored formula states exactly its fields, and so does a tier or an accessory row, so an extra member there
      // is refused by the parser and never reaches the projection; the book, each rule, each group and the accessory
      // section are the levels this sweep can reach.
      cabinetRules: book.cabinetRules.map((rule) => ({ ...rule, ...extra })),
      hardware: { ...book.hardware, ...extra },
      material: { ...book.material, ...extra },
      accessories: { ...book.accessories, ...extra },
    };
  }

  it("drops a member the book does not declare, at the book, each rule, each group and the accessory section", async () => {
    const stores = storesHolding(withUndeclaredMembers(STORED_BOOK));

    const root = await readActivePriceBook(stores);

    expect(root.kind === "active" && root.book).toEqual(STORED_BOOK);
    expect(JSON.stringify(root)).not.toContain(SECRET_MARKER);
  });

  it("refuses a book whose tier or accessory row states a member it does not declare, rather than serving the rest", async () => {
    const stray = { undeclared: SECRET_MARKER };
    const strayRows = [
      {
        ...STORED_BOOK,
        hardware: {
          ...STORED_BOOK.hardware,
          tiers: STORED_BOOK.hardware.tiers.map((tier) => ({
            ...tier,
            ...stray,
          })),
        },
      },
      {
        ...STORED_BOOK,
        material: {
          ...STORED_BOOK.material,
          tiers: STORED_BOOK.material.tiers.map((tier) => ({
            ...tier,
            ...stray,
          })),
        },
      },
      {
        ...STORED_BOOK,
        accessories: {
          ...STORED_BOOK.accessories,
          sinkProtectiveCover: {
            ...STORED_BOOK.accessories.sinkProtectiveCover,
            ...stray,
          },
        },
      },
    ];

    for (const book of strayRows) {
      const root = await readActivePriceBook(storesHolding(book));

      expect(root).toBe(NO_PRICE_BOOK);
      expect(JSON.stringify(linesWritten())).not.toContain(SECRET_MARKER);
    }
  });

  it("keeps every declared member of the sample book, so a price is never lost to the projection", async () => {
    const stores = storesHolding(STORED_BOOK);

    const root = await readActivePriceBook(stores);

    expect(root.kind === "active" && root.book).toStrictEqual(STORED_BOOK);
  });
});

describe("a book whose version is not its version's id (one identity)", () => {
  it("is no book, with the cause written once and nothing of the book", async () => {
    const stores = storesHolding({ ...SAMPLE_PRICE_BOOK, version: "another" });

    const root = await readActivePriceBook(stores);

    expect(root).toBe(NO_PRICE_BOOK);
    expect(linesWritten()).toEqual([
      { event: "no-price-book", cause: "version-mismatch" },
    ]);
    expect(stores.readCurrent).not.toHaveBeenCalled();
  });
});

describe("the availability is bounded", () => {
  const item = (id: string) => ({ kind: "accessory", accessoryId: id });

  it("hands over the switched-off items up to the bound, with ids up to the identifier bound", async () => {
    const disabled = Array.from({ length: MAX_DISABLED_ITEMS }, (_, index) =>
      item(`item-${String(index)}`),
    );
    const stores = storesHolding(STORED_BOOK, { revision: "3", disabled });

    const root = await readActivePriceBook(stores);

    expect(root.kind).toBe("active");
  });

  it.each([
    [
      "more items than the bound",
      {
        revision: "3",
        disabled: Array.from({ length: MAX_DISABLED_ITEMS + 1 }, (_, index) =>
          item(`item-${String(index)}`),
        ),
      },
    ],
    [
      "an id longer than the identifier bound",
      { revision: "3", disabled: [item("x".repeat(65))] },
    ],
    [
      "a revision wider than a bigint",
      { revision: "1".repeat(20), disabled: [] },
    ],
  ])("is no book for %s, with its cause written once", async (_, bound) => {
    const stores = storesHolding(STORED_BOOK, bound);

    const root = await readActivePriceBook(stores);

    expect(root).toBe(NO_PRICE_BOOK);
    expect(linesWritten()).toEqual([
      { event: "no-price-book", cause: "availability-too-large" },
    ]);
  });
});

describe("the availability is handed over as the catalogue declares it", () => {
  it("keeps the kinds the catalogue can switch off, each with its one id, and drops any other member", async () => {
    const disabled = [
      { kind: "material", tierId: "mdf", extra: SECRET_MARKER },
      { kind: "hardware", tierId: "premium" },
      { kind: "finish", finishId: "oak" },
      { kind: "handle", handle: "black" },
      { kind: "accessory", accessoryId: "sinkProtectiveCover" },
    ];
    const stores = storesHolding(STORED_BOOK, { revision: "3", disabled });

    const root = await readActivePriceBook(stores);

    expect(root.kind === "active" && root.availability).toEqual({
      revision: "3",
      disabled: [
        { kind: "material", tierId: "mdf" },
        { kind: "hardware", tierId: "premium" },
        { kind: "finish", finishId: "oak" },
        { kind: "handle", handle: "black" },
        { kind: "accessory", accessoryId: "sinkProtectiveCover" },
      ],
    });
    expect(JSON.stringify(root)).not.toContain(SECRET_MARKER);
  });

  it.each([
    [
      "an id held as a nested value of any size",
      [{ kind: "material", tierId: { deep: "x".repeat(100_000) } }],
    ],
    ["an id held as an array", [{ kind: "finish", finishId: ["oak"] }]],
    ["an id held as a number", [{ kind: "accessory", accessoryId: 7 }]],
    ["an empty id", [{ kind: "material", tierId: "" }]],
    [
      "a kind the catalogue does not switch",
      [{ kind: "cabinet", tierId: "x" }],
    ],
    ["an item with no kind", [{ tierId: "mdf" }]],
    ["a handle outside the closed list", [{ kind: "handle", handle: "gold" }]],
    ["an item that is text", ["accessory.x"]],
    ["an item that is null", [null]],
  ])("is no book for %s, as unreadable", async (_, disabled) => {
    const stores = storesHolding(STORED_BOOK, { revision: "3", disabled });

    expect(await readActivePriceBook(stores)).toBe(NO_PRICE_BOOK);
    expect(linesWritten()).toEqual([
      { event: "no-price-book", cause: "availability-unreadable" },
    ]);
  });

  it.each([
    ["no list of items", { revision: "3" }],
    ["a list that is not an array", { revision: "3", disabled: { length: 1 } }],
    ["a revision that is not text", { revision: 3, disabled: [] }],
    ["no answer at all", null],
  ])(
    "is no book for an answer with %s, and never a failed request",
    async (_, answer) => {
      const stores = storesHolding(STORED_BOOK, answer);

      expect(await readActivePriceBook(stores)).toBe(NO_PRICE_BOOK);
      expect(linesWritten()).toEqual([
        { event: "no-price-book", cause: "availability-unreadable" },
      ]);
    },
  );
});

describe("having no book to price from (A-10)", () => {
  it("is the one no-book answer when no version was ever published, with no line: that is not a failure", async () => {
    const stores = countingStores(
      vi.fn(() => Promise.resolve(NO_ACTIVE_VERSION)),
    );

    const root = await readActivePriceBook(stores);

    expect(root).toBe(NO_PRICE_BOOK);
    expect(parse.parsePriceBook).not.toHaveBeenCalled();
    expect(stores.readCurrent).not.toHaveBeenCalled();
    expect(linesWritten()).toEqual([]);
  });

  it("is the same answer when the price store cannot answer, with its operation and kind written once", async () => {
    const stores = countingStores(
      vi.fn(() =>
        Promise.reject(
          new DashboardStoreError(
            "read the active price version",
            "unavailable",
          ),
        ),
      ),
    );

    expect(await readActivePriceBook(stores)).toBe(NO_PRICE_BOOK);
    expect(linesWritten()).toEqual([
      {
        event: "no-price-book",
        cause: "store-unavailable",
        operation: "read the active price version",
        kind: "unavailable",
      },
    ]);
  });

  it("is the same answer when the price store fails another way, as its own cause", async () => {
    const stores = countingStores(
      vi.fn(() =>
        Promise.reject(
          new DashboardStoreError("read the active price version", "database", {
            cause: new Error(SECRET_MARKER),
          }),
        ),
      ),
    );

    expect(await readActivePriceBook(stores)).toBe(NO_PRICE_BOOK);
    expect(linesWritten()).toEqual([
      {
        event: "no-price-book",
        cause: "store-failed",
        operation: "read the active price version",
        kind: "database",
      },
    ]);
    expect(JSON.stringify(written.mock.calls)).not.toContain(SECRET_MARKER);
  });

  it("is the same answer when the availability cannot be read, with its operation and kind", async () => {
    const stores = storesHolding(STORED_BOOK);
    stores.readCurrent.mockRejectedValue(
      new DashboardStoreError("read the catalogue availability", "database"),
    );

    expect(await readActivePriceBook(stores)).toBe(NO_PRICE_BOOK);
    expect(linesWritten()).toEqual([
      {
        event: "no-price-book",
        cause: "availability-unreadable",
        operation: "read the catalogue availability",
        kind: "database",
      },
    ]);
  });

  it("is the same answer when the stored book does not parse, with no word of the book", async () => {
    const stores = storesHolding({
      not: "a price book",
      marker: SECRET_MARKER,
    });

    expect(await readActivePriceBook(stores)).toBe(NO_PRICE_BOOK);
    expect(linesWritten()).toEqual([
      { event: "no-price-book", cause: "book-unparseable" },
    ]);
    expect(JSON.stringify(written.mock.calls)).not.toContain(SECRET_MARKER);
  });

  it("lets a failure that is not the store's propagate, as a defect, after one line", async () => {
    const stores = countingStores(
      vi.fn(() => Promise.reject(new TypeError("a defect"))),
    );

    await expect(readActivePriceBook(stores)).rejects.toThrow("a defect");
    expect(linesWritten()).toEqual([
      { event: "no-price-book", cause: "unexpected" },
    ]);
  });
});
