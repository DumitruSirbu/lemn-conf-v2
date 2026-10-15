// **No finish, decor or colour ever enters pricing** — ADR 0071 decision 1, asserted rather than
// noted.
//
// Two halves, because they fail at different times. The **property** is the one that survives
// somebody adding a "premium decor" coefficient later: it prices a design, repaints every cabinet
// with any legal finish, and demands the same `PricedDesign` back. The **structural** check is what
// makes the failure obvious at the seam rather than three sweeps deep in a total: no module under
// `pricing/` may import the declaration at all.
//
// The property sweeps **both kinds** of finish, because they are two shapes and only one of them
// existed before wave 6P — a coefficient keyed on a palette entry and a coefficient keyed on a hex
// value are different mistakes. It repaints **every** body, including the ones that cannot wear a
// finish: a document can hold one, and pricing must not read it there either.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Design } from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import {
  freeColourFinish,
  paletteFinish,
  PALETTE_ENTRIES,
  type Finish,
} from "../../src/materials.js";
import { priceDesign } from "../../src/pricing/price-design.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";

const PRICING_ROOT = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src"),
  "pricing",
);

/** Every legal finish, as one arbitrary: the declared palette entries and the free colours MDF's
 *  control produces. */
const anyLegalFinish: fc.Arbitrary<Finish> = fc.oneof(
  fc
    .constantFrom(...PALETTE_ENTRIES.map((entry) => entry.entryId))
    .map(paletteFinish),
  fc
    .stringMatching(/^[0-9a-fA-F]{6}$/)
    .map((digits) => freeColourFinish(`#${digits}`)),
);

/** A legal free colour no fixture wears, written onto bodies that have no colour control. */
const A_FINISH_NOBODY_CHOSE = freeColourFinish("#123456");

function repaintedWith(finish: Finish): Design {
  return {
    ...KITCHEN_L_DESIGN,
    placements: KITCHEN_L_DESIGN.placements.map((placement) => ({
      ...placement,
      body: { ...placement.body, finish },
    })),
  };
}

function priceOf(design: Design) {
  return priceDesign({
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK.version,
  });
}

describe("a finish never reaches an amount", () => {
  const unpainted = priceOf(KITCHEN_L_DESIGN);

  it("prices the seeded kitchen at all, so the sweeps below are not comparing two refusals", () => {
    expect(unpainted.ok).toBe(true);
    if (!unpainted.ok) return;
    expect(unpainted.priced.lines.length).toBeGreaterThan(0);
    expect(unpainted.priced.totalMinor).toBeGreaterThan(0);
  });

  it("returns a byte-identical PricedDesign for any legal finish on every body", () => {
    fc.assert(
      fc.property(anyLegalFinish, (finish) => {
        const repainted = priceOf(repaintedWith(finish));

        // Same lines, same amounts, same total, same order — and `JSON.stringify` is what says
        // "same order" without a second assertion that could agree by sorting.
        expect(JSON.stringify(repainted)).toBe(JSON.stringify(unpainted));
        expect(repainted).toEqual(unpainted);
      }),
    );
  });

  it("repaints bodies that cannot wear a finish too, and still prices them the same", () => {
    // `open-shelf`, `hood` and `fridge-free` declare `canFinish: false`. `repaintedWith` writes a
    // finish onto every placement, so this is only worth asserting if the seeded kitchen actually
    // holds one of them — otherwise the sweep above is quietly weaker than it reads.
    const unfinishableIds = KITCHEN_L_DESIGN.placements
      .filter(
        (placement) =>
          KITCHEN_L_BODY_CATALOG.get(placement.body.buildId)?.canFinish ===
          false,
      )
      .map((placement) => placement.id);
    const onlyTheUnfinishableRepainted: Design = {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.map((placement) =>
        unfinishableIds.includes(placement.id)
          ? {
              ...placement,
              body: { ...placement.body, finish: A_FINISH_NOBODY_CHOSE },
            }
          : placement,
      ),
    };

    expect(unfinishableIds.length).toBeGreaterThan(0);
    expect(JSON.stringify(priceOf(onlyTheUnfinishableRepainted))).toBe(
      JSON.stringify(unpainted),
    );
  });
});

describe("nothing under pricing/ can even see the declaration", () => {
  function sourcesUnderPricing(): readonly string[] {
    return readdirSync(PRICING_ROOT, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .map((entry) => path.join(entry.parentPath, entry.name));
  }

  /** Import and re-export edges only, like `pricing-seams.test.ts`: this package's comments name
   *  modules constantly, and a provenance sentence is not a dependency. */
  function importedSpecifiers(source: string): readonly string[] {
    return [...source.matchAll(/(?:import|export)[^;]*?from\s+"([^"]+)"/g)].map(
      (match) => match[1] ?? "",
    );
  }

  it("has no module under pricing/ importing the material and palette declaration", () => {
    const importers = sourcesUnderPricing().filter((file) =>
      importedSpecifiers(readFileSync(file, "utf8")).some((specifier) =>
        specifier.includes("materials"),
      ),
    );

    expect(importers).toEqual([]);
  });

  /** Comments stripped, because this package's prose names the modules it collaborates with and
   *  a sentence about a finish is not a coefficient keyed on one. */
  function codeOf(file: string): string {
    return readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/.*$/gm, " ");
  }

  it("has no module under pricing/ naming a finish, a decor or a palette entry", () => {
    // The other half of the same seam, in the data rather than the graph: a coefficient could be
    // keyed on a decor without importing anything, by writing the id as a literal.
    const namers = sourcesUnderPricing().filter((file) =>
      /\b(finish|finishes|decor|decors|palette)\b/i.test(codeOf(file)),
    );

    expect(namers.map((file) => path.basename(file))).toEqual([]);
  });
});
