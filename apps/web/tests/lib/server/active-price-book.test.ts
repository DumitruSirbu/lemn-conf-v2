import { SAMPLE_PRICE_BOOK } from "@lemnaria/configurator-domain";
import {
  DashboardStoreError,
  NO_ACTIVE_VERSION,
  type CatalogueAvailabilityStore,
  type PriceBookStore,
} from "@lemnaria/persistence";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NO_PRICE_BOOK } from "@/price/price-book-root";

// The one price-book root of the server (backlog 176, R1): the active version read and parsed once per call, with the
// availability current at that read, and every way of having no book one answer that carries no book.

const parse = vi.hoisted(() => ({
  parsePriceBook: vi.fn(),
}));

vi.mock("@lemnaria/configurator-domain", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@lemnaria/configurator-domain")>();
  parse.parsePriceBook.mockImplementation(original.parsePriceBook);
  return { ...original, parsePriceBook: parse.parsePriceBook };
});

const { readActivePriceBook } = await import("@/lib/server/active-price-book");

const AVAILABILITY = { revision: "7", disabled: [] };
const VERSION_ID = "version-id-of-the-store";

interface CountingStores {
  readonly priceBook: PriceBookStore;
  readonly availability: CatalogueAvailabilityStore;
  readonly readActive: ReturnType<typeof vi.fn>;
  readonly readCurrent: ReturnType<typeof vi.fn>;
}

function storesHolding(book: unknown): CountingStores {
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
  return countingStores(readActive);
}

function countingStores(readActive: ReturnType<typeof vi.fn>): CountingStores {
  const readCurrent = vi.fn(() => Promise.resolve(AVAILABILITY));
  return {
    priceBook: { readActive } as unknown as PriceBookStore,
    availability: { readCurrent } as unknown as CatalogueAvailabilityStore,
    readActive,
    readCurrent,
  };
}

beforeEach(() => {
  parse.parsePriceBook.mockClear();
});

describe("reading the active price book", () => {
  it("hands the version id, the book and the availability together, and nothing else", async () => {
    const stores = storesHolding(SAMPLE_PRICE_BOOK);

    const root = await readActivePriceBook(stores);

    expect(root).toEqual({
      kind: "active",
      versionId: VERSION_ID,
      book: SAMPLE_PRICE_BOOK,
      availability: AVAILABILITY,
    });
    expect(Object.keys(root).sort()).toEqual([
      "availability",
      "book",
      "kind",
      "versionId",
    ]);
  });

  it("asks each store once and parses the book once for one call", async () => {
    const stores = storesHolding(SAMPLE_PRICE_BOOK);

    await readActivePriceBook(stores);

    expect(stores.readActive).toHaveBeenCalledTimes(1);
    expect(stores.readCurrent).toHaveBeenCalledTimes(1);
    expect(parse.parsePriceBook).toHaveBeenCalledTimes(1);
  });

  it("reads again for the next call, so a publish between two requests is seen by the second alone", async () => {
    const stores = storesHolding(SAMPLE_PRICE_BOOK);
    await readActivePriceBook(stores);
    stores.readActive.mockResolvedValueOnce({
      kind: "found",
      version: {
        versionId: "the-next-version",
        sequenceNumber: 2,
        label: "Next",
        publishedAt: new Date(1),
        book: SAMPLE_PRICE_BOOK,
      },
    });

    const second = await readActivePriceBook(stores);

    expect(second.kind === "active" && second.versionId).toBe(
      "the-next-version",
    );
    expect(parse.parsePriceBook).toHaveBeenCalledTimes(2);
  });
});

describe("having no book to price from (A-10)", () => {
  it("is the one no-book answer when no version was ever published, and never a sample book", async () => {
    const stores = countingStores(
      vi.fn(() => Promise.resolve(NO_ACTIVE_VERSION)),
    );

    const root = await readActivePriceBook(stores);

    expect(root).toBe(NO_PRICE_BOOK);
    expect(parse.parsePriceBook).not.toHaveBeenCalled();
    expect(stores.readCurrent).not.toHaveBeenCalled();
  });

  it("is the same answer when the price store cannot answer", async () => {
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
  });

  it("is the same answer when the availability cannot be read", async () => {
    const stores = storesHolding(SAMPLE_PRICE_BOOK);
    stores.readCurrent.mockRejectedValue(
      new DashboardStoreError("read the catalogue availability", "database"),
    );

    expect(await readActivePriceBook(stores)).toBe(NO_PRICE_BOOK);
  });

  it("is the same answer when the stored book does not parse", async () => {
    const stores = storesHolding({ not: "a price book" });

    expect(await readActivePriceBook(stores)).toBe(NO_PRICE_BOOK);
  });

  it("lets a failure that is not the store's propagate, as a defect", async () => {
    const stores = countingStores(
      vi.fn(() => Promise.reject(new TypeError("a defect"))),
    );

    await expect(readActivePriceBook(stores)).rejects.toThrow("a defect");
  });
});
