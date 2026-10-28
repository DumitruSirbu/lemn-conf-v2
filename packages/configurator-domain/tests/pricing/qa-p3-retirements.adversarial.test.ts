// Adversarial QA for P3-a and P3-b (M10): the sample book carries a new id, and no source file of the packages or the
// application names a field or a shape the cut-over retired. P3-b is stated as a `grep`; this is the same scan as a
// test, so it runs on every gate and not on the day someone remembers it. The names are written here, in a test file,
// which the scan does not read.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
} from "../../src/pricing/sample-price-book.js";

const REPOSITORY_ROOT = join(import.meta.dirname, "../../../..");
const SOURCE_ROOTS = [
  "packages/configurator-domain/src",
  "packages/three-adapter/src",
  "packages/persistence/src",
  "apps/web/src",
];
const RETIRED_NAMES = /wholeKitchenMinor|linear-in-/;
const RETIRED_SAMPLE_VERSION = "sample-2026-09";

function filesUnder(root: string): string[] {
  return readdirSync(join(REPOSITORY_ROOT, root), {
    recursive: true,
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

describe("P3-b: nothing shipped names what the cut-over retired", () => {
  it("scans the source trees it claims to, so an empty scan cannot pass", () => {
    for (const root of SOURCE_ROOTS) {
      expect(filesUnder(root).length, root).toBeGreaterThan(20);
    }
  });

  it("finds neither the flat material amount nor a linear formula shape in any source file", () => {
    const naming = SOURCE_ROOTS.flatMap(filesUnder).filter((path) =>
      RETIRED_NAMES.test(readFileSync(path, "utf8")),
    );

    expect(naming).toEqual([]);
  });
});

describe("P3-a: the sample book is a new set of figures under a new id", () => {
  it("is not the id the retired figures carried, and the book states the id the constant names", () => {
    expect(SAMPLE_PRICE_BOOK_VERSION).not.toBe(RETIRED_SAMPLE_VERSION);
    expect(SAMPLE_PRICE_BOOK.version).toBe(SAMPLE_PRICE_BOOK_VERSION);
    expect(SAMPLE_PRICE_BOOK_VERSION).toMatch(/^sample-\d{4}-\d{2}$/);
  });
});
