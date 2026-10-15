// The three seams ADR 0062 requires, asserted against the source tree: shape, not behaviour (`price-design.test.ts`
// covers behaviour). Each is the kind of property where the code still works when it is broken.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { INSERTABLE_BODY_DEFINITIONS } from "../../src/catalog.js";
import { SAMPLE_PRICE_BOOK as BARREL_BOOK } from "../../src/index.js";
import {
  amountForBody,
  PRICE_BOOK_CURRENCY,
  type AccessoryRule,
  pricedByWidth,
  pricedByWidthAndDoorLeaves,
  pricedByWidthAndHeight,
  pricedByWidthHeightAndDoorLeaves,
  pricedFlat,
  type PriceFormula,
} from "../../src/pricing/price-book.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";

const SOURCE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src",
);
const PRICING_ROOT = path.join(SOURCE_ROOT, "pricing");

function sourcesUnder(root: string): readonly string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

function read(file: string): string {
  return readFileSync(file, "utf8");
}

/** Only the import and re-export edges, so a module named in a provenance comment — which this
 *  package's comments do constantly — does not read as a dependency. */
function importedSpecifiers(source: string): readonly string[] {
  return [...source.matchAll(/(?:import|export)[^;]*?from\s+"([^"]+)"/g)].map(
    (match) => match[1] ?? "",
  );
}

describe("the query takes a book and imports none", () => {
  it("has no module under pricing/ importing the sample book", () => {
    const importers = sourcesUnder(PRICING_ROOT).filter(
      (file) =>
        path.basename(file) !== "sample-price-book.ts" &&
        importedSpecifiers(read(file)).some((specifier) =>
          specifier.includes("sample-price-book"),
        ),
    );

    expect(importers).toEqual([]);
  });

  it("is named by exactly one module in the package, the barrel", () => {
    const namers = sourcesUnder(SOURCE_ROOT).filter(
      (file) =>
        path.basename(file) !== "sample-price-book.ts" &&
        importedSpecifiers(read(file)).some((specifier) =>
          specifier.includes("sample-price-book"),
        ),
    );

    expect(namers.map((file) => path.relative(SOURCE_ROOT, file))).toEqual([
      "index.ts",
    ]);
  });

  it("exports the same book object through the barrel", () => {
    expect(BARREL_BOOK).toBe(SAMPLE_PRICE_BOOK);
  });
});

/** Every formula shape this build knows and the coefficients each is made of, declared here rather than derived
 *  from the book, so a book that grew a field fails instead of passing a sweep of whatever it holds. The shapes: the
 *  base one, the per-door step, and one reading a body built to its opening; all share the two width coefficients and
 *  none names a width. */
const COEFFICIENTS_BY_SHAPE: Readonly<Record<string, readonly string[]>> = {
  "linear-in-width": ["baseMinor", "perWidthMillimetreMinor"],
  "linear-in-width-and-door-leaves": [
    "baseMinor",
    "perWidthMillimetreMinor",
    "perDoorLeafMinor",
  ],
  "linear-in-width-and-height": [
    "baseMinor",
    "perWidthMillimetreMinor",
    "perHeightMillimetreMinor",
  ],
  "linear-in-width-height-and-door-leaves": [
    "baseMinor",
    "perWidthMillimetreMinor",
    "perHeightMillimetreMinor",
    "perDoorLeafMinor",
  ],
};

/** Which shapes read which derived fact about a body. Read off the coefficient table above rather
 *  than listed again, so a shape cannot be added to one and forgotten in the other. */
function shapesReading(coefficient: string): readonly string[] {
  return Object.entries(COEFFICIENTS_BY_SHAPE)
    .filter(([, coefficients]) => coefficients.includes(coefficient))
    .map(([shape]) => shape);
}

describe("price is a formula over width, never a table keyed on the ladder", () => {
  it("has no module under pricing/ naming the width step", () => {
    // ADR 0035 decision 8: the 50 mm step is what the panel offers, and nothing downstream of the
    // panel may depend on it. A body built at 570 or 575 is priced like any other.
    const naming = sourcesUnder(PRICING_ROOT).filter((file) =>
      read(file).includes("WIDTH_STEP_MM"),
    );

    expect(naming).toEqual([]);
  });

  it("has no price-data structure keyed on a width", () => {
    // Falsifiable in the data: neither a rule nor its formula carries a field whose name or value is a width. Stated
    // against the declared shapes, not one shape's field list: the property protected is that no coefficient is a
    // width, not that there is one shape. `COEFFICIENTS_BY_SHAPE` is the table this file owns, so a shape added in
    // `price-book.ts` without a line here fails as unknown.
    for (const rule of SAMPLE_PRICE_BOOK.cabinetRules) {
      // `suppliedBy` is an optional key: it says who puts the row in the kitchen, not a coefficient or a width. Still
      // exhaustive: a rule declares the three required keys and at most that one.
      expect(Object.keys(rule).sort()).toEqual(
        rule.suppliedBy === undefined
          ? ["buildId", "formula", "ruleId"]
          : ["buildId", "formula", "ruleId", "suppliedBy"],
      );
      const coefficients = COEFFICIENTS_BY_SHAPE[rule.formula.shape];
      expect(coefficients).toBeDefined();
      expect(Object.keys(rule.formula).sort()).toEqual(
        [...(coefficients ?? []), "shape"].sort(),
      );
    }
  });

  it("names no coefficient after a width the ladder offers", () => {
    // No coefficient is a size and none is keyed on one: `600`, `perMm600` or `at800` would be a width table wearing
    // a formula's clothes.
    for (const rule of SAMPLE_PRICE_BOOK.cabinetRules) {
      for (const coefficient of Object.keys(rule.formula)) {
        expect(coefficient).not.toMatch(/\d/);
      }
    }
  });

  it("prices every catalogue row it names with a formula, not a list of sizes", () => {
    for (const rule of SAMPLE_PRICE_BOOK.cabinetRules) {
      const coefficients = COEFFICIENTS_BY_SHAPE[rule.formula.shape];
      expect(coefficients).toBeDefined();
      for (const coefficient of coefficients ?? []) {
        expect(
          Number.isSafeInteger(
            (rule.formula as unknown as Record<string, unknown>)[coefficient],
          ),
        ).toBe(true);
      }
    }
  });
});

describe("every shape this build declares is a shape this build evaluates", () => {
  // A declared shape with no arm in `amountForBody` is not a type error (the switch default refuses), so it would
  // fail as `UNKNOWN_FORMULA_SHAPE` at runtime on a customer-facing document; every exported constructor is
  // exercised here.
  const ONE_OF_EACH: readonly PriceFormula[] = [
    pricedFlat(1),
    pricedByWidth({ baseMinor: 1, perWidthMillimetreMinor: 1 }),
    pricedByWidthAndDoorLeaves({
      baseMinor: 1,
      perWidthMillimetreMinor: 1,
      perDoorLeafMinor: 1,
    }),
    pricedByWidthAndHeight({
      baseMinor: 1,
      perWidthMillimetreMinor: 1,
      perHeightMillimetreMinor: 1,
    }),
    pricedByWidthHeightAndDoorLeaves({
      baseMinor: 1,
      perWidthMillimetreMinor: 1,
      perHeightMillimetreMinor: 1,
      perDoorLeafMinor: 1,
    }),
  ];

  it("evaluates a formula from every constructor the module exports", () => {
    // Every coefficient is 1, so each amount is the base plus the terms its own shape reads: 600 of width,
    // 700 of height, 2 door leaves. A missing arm answers nothing and a wrong arm answers another row's sum.
    expect(
      ONE_OF_EACH.map((formula) =>
        amountForBody(formula, {
          widthMm: 600,
          heightMm: 700,
          doorLeafCount: 2,
        }),
      ),
    ).toEqual([1, 1 + 600, 1 + 600 + 2, 1 + 600 + 700, 1 + 600 + 700 + 2]);
  });

  it("covers every shape the coefficient table declares, and no other", () => {
    // Ties the two lists together: the table this file prices books against and the constructors
    // the module offers describe the same set, so neither can grow a member the other has not seen.
    expect(
      [...new Set(ONE_OF_EACH.map((formula) => formula.shape))].sort(),
    ).toEqual(Object.keys(COEFFICIENTS_BY_SHAPE).sort());
  });
});

describe("a shape is assigned by the catalogue's property, not by a list of ids", () => {
  // ADR 0068's population correction: `heightFlex: true` is declared on the shared wall-band shape, so `wall-cabinet`
  // has it too beyond the owner's `wall-lift` and `open-shelf`. A book kept against a remembered id list would be
  // silently wrong for the next such row, so the flags decide.

  function shapeFor(buildId: string): string {
    const rule = SAMPLE_PRICE_BOOK.cabinetRules.find(
      (candidate) => candidate.buildId === buildId,
    );
    if (!rule) throw new Error(`the sample book prices no "${buildId}"`);
    return rule.formula.shape;
  }

  it("prices every height-flexible row with a shape that reads height", () => {
    const flexible = [...INSERTABLE_BODY_DEFINITIONS]
      .filter(([, definition]) => definition.heightFlex === true)
      .map(([buildId]) => buildId);

    // Not a vacuous sweep: the wall band is height-flexible and the hood opts out of it.
    expect(flexible).toEqual(["wall-cabinet", "wall-lift", "open-shelf"]);
    for (const buildId of flexible) {
      expect(shapesReading("perHeightMillimetreMinor")).toContain(
        shapeFor(buildId),
      );
    }
  });

  it("prices every row whose door count follows its width with a shape that steps", () => {
    const hinged = [...INSERTABLE_BODY_DEFINITIONS]
      .filter(([, definition]) => definition.doorCountFollowsWidth === true)
      .map(([buildId]) => buildId);

    expect(hinged).toEqual(["base-cabinet", "wall-cabinet", "tall-pantry"]);
    for (const buildId of hinged) {
      expect(shapesReading("perDoorLeafMinor")).toContain(shapeFor(buildId));
    }
  });

  it("gives a row neither term where the catalogue declares neither property", () => {
    // The other half, which stops the two sweeps above from being satisfied by giving every row
    // every term — a book that did that would price correctly and say nothing about the product.
    for (const [buildId, definition] of INSERTABLE_BODY_DEFINITIONS) {
      if (definition.heightFlex === true) continue;
      if (definition.doorCountFollowsWidth === true) continue;
      expect(shapesReading("perHeightMillimetreMinor")).not.toContain(
        shapeFor(buildId),
      );
      expect(shapesReading("perDoorLeafMinor")).not.toContain(
        shapeFor(buildId),
      );
    }
  });
});

describe("no amount, tier, delta or rule exists outside the book", () => {
  it("keeps every minor-unit amount in the sample book file", () => {
    // ADR 0062's third prohibition: an amount in a catalogue row or a rejection sentence would be a second authority
    // for a price; the sheet's delta must be this data rendered.
    const carriers = sourcesUnder(SOURCE_ROOT)
      .filter((file) => !file.startsWith(PRICING_ROOT))
      .filter((file) => /Minor\b/.test(read(file)));

    expect(carriers.map((file) => path.relative(SOURCE_ROOT, file))).toEqual(
      [],
    );
  });

  /** What a row may publish besides its amounts (ADR 0106 decision 1): a rendered text and nothing else. Each row
   *  still declares its own `tierId`, `ruleId` and amounts as own properties, and the two added fields are catalogue
   *  paths, not figures. A whole-shape assertion, so a row that quietly grew a field fails here. */
  it("lets a row name the leaf its text is written in, and nothing else", () => {
    const tierFields = ["tierId", "ruleId", "name", "description"];
    const rows: readonly (readonly [
      Record<string, unknown>,
      readonly string[],
    ])[] = [
      ...SAMPLE_PRICE_BOOK.hardware.tiers.map(
        (tier) =>
          [
            tier as unknown as Record<string, unknown>,
            [
              ...tierFields,
              "perHingeMinor",
              "perDrawerMinor",
              "perPushToOpenMinor",
            ],
          ] as const,
      ),
      ...SAMPLE_PRICE_BOOK.material.tiers.map(
        (tier) =>
          [
            tier as unknown as Record<string, unknown>,
            [...tierFields, "wholeKitchenMinor"],
          ] as const,
      ),
      ...Object.values(SAMPLE_PRICE_BOOK.accessories).map(
        (accessory) =>
          [
            accessory as unknown as Record<string, unknown>,
            ["ruleId", "name", "description", "perUnitMinor"],
          ] as const,
      ),
    ];

    expect(rows).toHaveLength(8);
    for (const [row, required] of rows) {
      const declared = Object.keys(row);
      expect(declared.sort()).toEqual(expect.arrayContaining([...required]));
      // And the only two it may have gained are the catalogue-key fields.
      const permitted = [...required, "nameKey", "descriptionKey"];
      expect(declared.filter((field) => !permitted.includes(field))).toEqual(
        [],
      );

      for (const field of ["nameKey", "descriptionKey"] as const) {
        const key = row[field];
        if (key === undefined) continue;
        // A catalogue path, never a figure and never an id a rule traces to. One anchored pattern
        // carries the whole claim: its character class admits no digit, so a separate `\d`
        // falsification could never fire, and a non-string fails `toMatch` on its own.
        expect(key, field).toMatch(/^priceBook(\.[a-z-]+)+$/);
      }
    }
  });
});

/** Romanian's five letters in both spellings — the comma-below pair and the Turkish cedillas that
 *  render almost identically. The lint gate in `eslint.config.mjs` reads the same set. */
// eslint-disable-next-line no-restricted-syntax -- 6B-j allow-list: a character class, spelled in characters so a reader can check it against the gate's escaped copy. Escaping it here would hide it from the very rule it mirrors.
const ROMANIAN_LETTER = /[ăâîșțĂÂÎȘȚşţŞŢ]/;

/** An identifier ending in the suffix this package used to publish its Romanian under —
 *  `KIND_LABELS_RO`, `BAND_LABELS_RO`, `EMPTY_SLOT_LABEL_RO`. Anchored on a word boundary, so
 *  `TOP_ROW_Y0_MM` is not a match. */
const ROMANIAN_SUFFIXED_IDENTIFIER = /\b[A-Za-z_$][\w$]*_RO\b/;

/** A line that is entirely comment: a line comment, the opening of a block comment or its continuation. Deliberately
 *  conservative: a trailing comment after code is not recognised, so a Romanian word in one is reported rather than
 *  excused (a false red a human resolves, never a false green). */
const WHOLE_LINE_COMMENT = /^\s*(\/\/|\/\*|\*)/;

/** The source lines of a module that are not comments, numbered from one. */
function codeLinesOf(source: string): readonly (readonly [number, string])[] {
  return source
    .split("\n")
    .map((text, index) => [index + 1, text] as const)
    .filter(([, text]) => !WHOLE_LINE_COMMENT.test(text));
}

/** The one module in `src/` allowed to hold Romanian: ADR 0106 decision 2 keeps a row's `name` and `description`
 *  required and authored, so a book nobody at Lemnaria wrote still renders. The exemption is checked against the
 *  book's own data below, so it covers exactly the ruled fallbacks. */
const ROMANIAN_BY_RULING = "pricing/sample-price-book.ts";

describe("this package publishes codes and never Romanian", () => {
  // ADR 0095's boundary held over this package's `src/` tree, surviving the lint rule being deleted and also checking
  // that the identifier suffix the Romanian travelled under is gone. Not `packages/*/src`: walking a sibling package
  // would make this one unliftable (`engineering-conventions.md`); the lint rule covers those.

  const sources = sourcesUnder(SOURCE_ROOT).map(
    (file) => [path.relative(SOURCE_ROOT, file), read(file)] as const,
  );

  it("walks a source tree rather than an empty one", () => {
    // Non-vacuity for the three sweeps below, each of which passes trivially on no files.
    expect(sources.length).toBeGreaterThan(20);
    expect(sources.map(([name]) => name)).toContain(ROMANIAN_BY_RULING);
  });

  it("names no identifier after the language it used to publish", () => {
    const naming = sources
      .flatMap(([name, source]) =>
        codeLinesOf(source).map(([line, text]) => [name, line, text] as const),
      )
      .filter(([, , text]) => ROMANIAN_SUFFIXED_IDENTIFIER.test(text))
      .map(([name, line]) => `${name}:${String(line)}`);

    expect(naming).toEqual([]);
  });

  it("recognises that suffix when it is there, and only that suffix", () => {
    // Positive control: the three names this package really did publish, against the one constant whose name
    // contains the same two letters mid-word.
    for (const gone of [
      "export const KIND_LABELS_RO = {",
      "const BAND_LABELS_RO: Readonly<Record<Band, string>> = {",
      "export { EMPTY_SLOT_LABEL_RO };",
    ])
      expect(ROMANIAN_SUFFIXED_IDENTIFIER.test(gone), gone).toBe(true);

    for (const kept of ["const TOP_ROW_Y0_MM = 1_400;", "type Row = 'RO';"])
      expect(ROMANIAN_SUFFIXED_IDENTIFIER.test(kept), kept).toBe(false);
  });

  it("carries no Romanian letter in code, outside the one ruled module", () => {
    const carriers = sources
      .filter(([name]) => name !== ROMANIAN_BY_RULING)
      .flatMap(([name, source]) =>
        codeLinesOf(source)
          .filter(([, text]) => ROMANIAN_LETTER.test(text))
          .map(([line]) => `${name}:${String(line)}`),
      );

    expect(carriers).toEqual([]);
  });

  it("tells a Romanian comment from a Romanian string", () => {
    // The claim the sweep above rests on, made falsifiable: this package's comments quote approved
    // copy constantly and must stay legal, while the same words one line down must not.
    /* eslint-disable no-restricted-syntax -- 6B-j allow-list: a five-line source fixture handed to the comment detector, three of whose lines have to be Romanian comments for the claim to mean anything. It is a detector input, not copy, and no catalogue leaf can supply a comment. */
    const module = [
      "// Comentariu: „nu poate fi adăugat aici” — the sentence this code refuses.",
      "/** Blocul de comentarii ține și el diacritice. */",
      " * și continuarea lui.",
      'const refusal = "nu poate fi adăugat aici";',
      "const code = REJECTION_CODES.NOT_INSERTABLE;",
    ].join("\n");
    /* eslint-enable no-restricted-syntax */

    expect(
      codeLinesOf(module)
        .filter(([, text]) => ROMANIAN_LETTER.test(text))
        .map(([line]) => line),
    ).toEqual([4]);
  });

  it("exempts exactly the fallbacks ADR 0106 decision 2 keeps required", () => {
    // The exemption is tied to its ruling, not a filename: every Romanian line in the book is a row text the book
    // publishes; a rejection sentence, catalogue label or fourth kind of prose fails.
    const authored = new Set<string>([
      ...SAMPLE_PRICE_BOOK.hardware.tiers.flatMap((tier) => [
        tier.name,
        tier.description,
      ]),
      ...SAMPLE_PRICE_BOOK.material.tiers.flatMap((tier) => [
        tier.name,
        tier.description,
      ]),
      // `BookAccessories` declares its two rows as named fields, so `Object.values` widens to `any[]`; read off the
      // book and typed back so a third accessory is swept the day it is declared.
      ...(
        Object.values(SAMPLE_PRICE_BOOK.accessories) as readonly AccessoryRule[]
      ).flatMap((accessory) => [accessory.name, accessory.description]),
    ]);
    const source = sources.find(([name]) => name === ROMANIAN_BY_RULING)?.[1];
    if (source === undefined) throw new Error("the ruled module is not there");

    const romanianLines = codeLinesOf(source).filter(([, text]) =>
      ROMANIAN_LETTER.test(text),
    );

    expect(romanianLines).toHaveLength(10);
    for (const [line, text] of romanianLines) {
      const quoted = /"([^"]*)"/.exec(text)?.[1];
      expect(quoted, `${ROMANIAN_BY_RULING}:${String(line)}`).toBeDefined();
      expect(
        authored.has(quoted ?? ""),
        `${ROMANIAN_BY_RULING}:${String(line)}`,
      ).toBe(true);
    }
  });
});

describe("the sample book says what it is worth", () => {
  it("is provisional, an estimate, and in MDL", () => {
    expect(SAMPLE_PRICE_BOOK.amountsProvisional).toBe(true);
    expect(SAMPLE_PRICE_BOOK.status).toBe("estimate");
    expect(SAMPLE_PRICE_BOOK.status).not.toBe("commercial");
    expect(SAMPLE_PRICE_BOOK.currency).toBe(PRICE_BOOK_CURRENCY);
  });

  it("lives in a file whose name says it is a sample", () => {
    const files = sourcesUnder(PRICING_ROOT).map((file) => path.basename(file));

    expect(files).toContain("sample-price-book.ts");
    expect(files.filter((file) => file.includes("price-book"))).toEqual(
      expect.arrayContaining(["price-book.ts", "sample-price-book.ts"]),
    );
  });

  it("declares a unique rule id for every rule and every tier", () => {
    const ruleIds = [
      ...SAMPLE_PRICE_BOOK.cabinetRules.map((rule) => rule.ruleId),
      ...SAMPLE_PRICE_BOOK.hardware.tiers.map((tier) => tier.ruleId),
      ...SAMPLE_PRICE_BOOK.material.tiers.map((tier) => tier.ruleId),
    ];

    expect(new Set(ruleIds).size).toBe(ruleIds.length);
  });

  it("declares a default tier that exists in each group", () => {
    expect(
      SAMPLE_PRICE_BOOK.hardware.tiers.map((tier) => tier.tierId),
    ).toContain(SAMPLE_PRICE_BOOK.hardware.defaultTierId);
    expect(
      SAMPLE_PRICE_BOOK.material.tiers.map((tier) => tier.tierId),
    ).toContain(SAMPLE_PRICE_BOOK.material.defaultTierId);
  });
});
