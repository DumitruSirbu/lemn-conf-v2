import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  readSource,
  sourceFilesMatching,
} from "../lib/server/server-source-support";

// One price-book root (backlog 176, M10 wave R1, criterion R-a): the application reads its book from the active version
// on the server and hands it to the browser as a prop, so no module that runs in the browser can name a book, and no
// module outside one test-only helper can name the sample.

const SEEDING_HELPER = "lib/server/price-book-test-seed.ts";
const THE_ONE_PARSE = "lib/server/active-price-book.ts";

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function filesNamingInCode(pattern: RegExp): string[] {
  return sourceFilesMatching(/./).filter((path) =>
    pattern.test(withoutComments(readSource(path))),
  );
}

function isClientModule(path: string): boolean {
  return /^\s*(?:\/\/.*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(
    readSource(path),
  );
}

describe("the sample book is named by the seeding helper alone", () => {
  it("is not named in the code of any other module under src", () => {
    expect(filesNamingInCode(/\bSAMPLE_PRICE_BOOK(?:_VERSION)?\b/)).toEqual([
      SEEDING_HELPER,
    ]);
  });

  it("has no server module of its own that ships a book", () => {
    expect(
      existsSync(
        join(import.meta.dirname, "../../src/lib/server/shipped-price-book.ts"),
      ),
    ).toBe(false);
    expect(filesNamingInCode(/shipped-price-book|shippedPriceBook/)).toEqual(
      [],
    );
  });

  it("is loaded by the store selection on the branch that seeds, never by a static import", () => {
    const source = withoutComments(readSource("lib/server/price-stores.ts"));

    expect(source).not.toMatch(/^import[^;]*price-book-test-seed/m);
    expect(source).toMatch(
      /await import\(\s*"@\/lib\/server\/price-book-test-seed"/,
    );
  });

  it("is reached only through the store selection, which is the only importer of the helper", () => {
    expect(filesNamingInCode(/price-book-test-seed/)).toEqual([
      "lib/server/price-stores.ts",
    ]);
  });
});

describe("the book is parsed in one place", () => {
  it("is parsed by the active-price-book module alone, once per read", () => {
    expect(filesNamingInCode(/\bparsePriceBook\b/)).toEqual([THE_ONE_PARSE]);
    const source = withoutComments(readSource(THE_ONE_PARSE));
    expect(source.match(/parsePriceBook\(/g)).toHaveLength(1);
  });
});

describe("no client module names a book", () => {
  it("imports no server module, no parser and no sample", () => {
    const clientModules = sourceFilesMatching(/./).filter(isClientModule);
    expect(clientModules.length).toBeGreaterThan(50);

    const naming = clientModules.filter((path) =>
      /@\/lib\/server\/|\bparsePriceBook\b|\bSAMPLE_PRICE_BOOK|\bPriceBookStore\b/.test(
        withoutComments(readSource(path)),
      ),
    );

    expect(naming).toEqual([]);
  });

  it("reads its book from the provider the page supplied, in the hooks and the two card readers alone", () => {
    const readers = sourceFilesMatching(/\busePriceBookRoot\b/).filter(
      (path) => path !== "price/price-book-provider.tsx",
    );

    expect(readers.sort()).toEqual([
      "account/kitchens/kitchen-card.tsx",
      "contact/use-contact-submission.ts",
      "price/use-priced-design.ts",
      "staff/staff-kitchen-view.tsx",
    ]);
  });

  it("never writes the book into the configurator store, which no server render may write (ADR 0133)", () => {
    const store = withoutComments(readSource("store/configurator-store.ts"));

    expect(store).not.toMatch(/priceBook|PriceBookRoot|versionId/);
  });
});
