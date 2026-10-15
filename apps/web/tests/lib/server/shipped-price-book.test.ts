import {
  parsePriceBook,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
} from "@lemnaria/configurator-domain";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  shippedPriceBook,
  UnreadableShippedPriceBookError,
} from "@/lib/server/shipped-price-book";

import { readSource } from "./server-source-support";

const DETAIL_MARKER = "FORBIDDEN-BOOK-DETAIL-MARKER-6612";

const parsing = vi.hoisted(() => ({
  failWith: undefined as string | undefined,
}));

vi.mock("@lemnaria/configurator-domain", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@lemnaria/configurator-domain")>();
  return {
    ...actual,
    parsePriceBook: vi.fn((declared: unknown) =>
      parsing.failWith === undefined
        ? actual.parsePriceBook(declared)
        : { ok: false, failure: { detail: parsing.failWith } },
    ),
  };
});

afterEach(() => {
  parsing.failWith = undefined;
  vi.clearAllMocks();
});

describe("the server's price-book root", () => {
  it("answers the book this build ships, parsed", () => {
    const book = shippedPriceBook();

    expect(book).toBe(SAMPLE_PRICE_BOOK);
    expect(book.version).toBe(SAMPLE_PRICE_BOOK_VERSION);
    expect(parsePriceBook).toHaveBeenCalledWith(SAMPLE_PRICE_BOOK);
  });

  it("parses on every call and holds nothing between them", () => {
    shippedPriceBook();
    shippedPriceBook();
    shippedPriceBook();

    expect(parsePriceBook).toHaveBeenCalledTimes(3);
  });

  it("throws an error of its own, with a fixed message that holds nothing of why the book was refused", () => {
    parsing.failWith = DETAIL_MARKER;

    expect(() => shippedPriceBook()).toThrow(UnreadableShippedPriceBookError);
    try {
      shippedPriceBook();
    } catch (thrown) {
      expect((thrown as Error).message).not.toContain(DETAIL_MARKER);
      expect(JSON.stringify(thrown)).not.toContain(DETAIL_MARKER);
      expect((thrown as Error).name).toBe("UnreadableShippedPriceBookError");
    }
  });

  it("recovers once the book reads again, since a failure is not kept", () => {
    parsing.failWith = DETAIL_MARKER;
    expect(() => shippedPriceBook()).toThrow(UnreadableShippedPriceBookError);
    parsing.failWith = undefined;

    expect(shippedPriceBook().version).toBe(SAMPLE_PRICE_BOOK_VERSION);
  });

  it("reads source: holds no state at module level and begins with the server-only import", () => {
    const source = readSource("lib/server/shipped-price-book.ts");

    expect(source.startsWith('import "server-only";\n')).toBe(true);
    expect(source).not.toMatch(/^(?:let|var)\s/m);
    expect(source).not.toMatch(/^const\s+\w+\s*(?::[^=]+)?=\s*parsePriceBook/m);
  });
});
