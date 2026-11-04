import { afterEach, describe, expect, it, vi } from "vitest";

import {
  NO_PRICE_BOOK_CAUSES,
  reportNoPriceBook,
} from "@/lib/server/price-book-log";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the line a request handed no price book writes", () => {
  it("names one cause of a closed list", () => {
    expect([...NO_PRICE_BOOK_CAUSES]).toEqual([
      "store-unavailable",
      "store-failed",
      "book-unparseable",
      "version-mismatch",
      "availability-unreadable",
      "availability-too-large",
      "unexpected",
    ]);
  });

  it("holds the cause alone, or the cause with the store's operation and kind", () => {
    const written = vi.spyOn(console, "error").mockImplementation(() => {
      // Collected through the spy.
    });

    reportNoPriceBook("book-unparseable");
    reportNoPriceBook("store-failed", {
      operation: "read the active price version",
      kind: "database",
    });

    expect(written.mock.calls).toEqual([
      ["[price-book]", { event: "no-price-book", cause: "book-unparseable" }],
      [
        "[price-book]",
        {
          event: "no-price-book",
          cause: "store-failed",
          operation: "read the active price version",
          kind: "database",
        },
      ],
    ]);
  });

  it("never throws, whatever the transport does", () => {
    vi.spyOn(console, "error").mockImplementation(() => {
      throw new Error("the transport failed");
    });

    expect(() => {
      reportNoPriceBook("unexpected");
    }).not.toThrow();
  });
});
