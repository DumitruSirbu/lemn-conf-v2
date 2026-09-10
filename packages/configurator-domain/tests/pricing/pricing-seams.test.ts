// The three seams ADR 0062 says wave 6B owes, asserted against the source tree rather than against
// an intention. Each is cheap to hold now and expensive to retrofit, and every one of them is the
// kind of property a reviewer reads past: the code still works when it is broken.
//
// Read with `price-design.test.ts`, which covers behaviour. This file covers shape.
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

/** Every formula shape this build knows, and the coefficients each is made of.
 *
 *  Declared here rather than derived from the book, so a book that quietly grew a field is a
 *  failure instead of a passing sweep of whatever it happens to hold. Three shapes since
 *  2026-09-03: the base one, the per-door step, and the one that reads a body built to its opening.
 *  All three share the two width coefficients, and none of them names a width. */
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
    // Falsifiable in the data itself: a rule is a build id and a formula, and neither the rule nor
    // its formula carries a field whose name or value is a width.
    //
    // **Stated against the declared shapes rather than against one shape's field list** (owner,
    // 2026-09-03: two more shapes). A literal list of three keys would have passed for the wrong
    // reason from here on — it would have failed on *any* second shape, correct or not, and the
    // property it is protecting has never been "there is one shape". It is that no coefficient is
    // a width. `COEFFICIENTS_BY_SHAPE` is the table this file owns, so a shape added in `price-
    // book.ts` without a line here fails as an unknown shape rather than passing unexamined.
    for (const rule of SAMPLE_PRICE_BOOK.cabinetRules) {
      // `suppliedBy` joins the shape as an **optional** key (owner, 2026-09-10): it says who puts
      // the row in the kitchen, which is not a coefficient and not a width. Still exhaustive —
      // a rule declares the three required keys and at most that one.
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
    // The half the key list above used to carry implicitly, said explicitly so it cannot be lost
    // when a shape is added: no coefficient is a size, and none is keyed on one. `600`, `perMm600`
    // or `at800` would all be a width table wearing a formula's clothes.
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
  // A declared shape with no arm in `amountForBody` is **not** a type error — the switch has a
  // default that refuses — so it fails as `UNKNOWN_FORMULA_SHAPE` on a row the book prices
  // perfectly well, at runtime, on a customer-facing document. The fourth shape did exactly that on
  // its way in. Every constructor the module exports is exercised here, so a fifth cannot repeat it
  // without also being unreachable from any book.
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
    for (const formula of ONE_OF_EACH) {
      expect(
        amountForBody(formula, {
          widthMm: 600,
          heightMm: 700,
          doorLeafCount: 2,
        }),
      ).toEqual(expect.any(Number));
    }
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
  // ADR 0068's population correction. The owner named `wall-lift` and `open-shelf`, and the
  // property is wider than those two rows: `heightFlex: true` is declared on the shared wall-band
  // shape, so `wall-cabinet` has it too — and it declares `doorCountFollowsWidth` as well. A book
  // maintained against a remembered list of ids would be correct today and silently wrong for the
  // third row that already behaves the same way, which is exactly what happened to the first draft
  // of this wave. So the flags decide, and this test is what makes them decide.

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
    // ADR 0062's third prohibition, held over the one package that could break it silently. A
    // catalogue row or a rejection sentence carrying an amount would be a second authority for a
    // price, and the 2E sheet's delta must be this data rendered rather than copy that agrees.
    const carriers = sourcesUnder(SOURCE_ROOT)
      .filter((file) => !file.startsWith(PRICING_ROOT))
      .filter((file) => /Minor\b/.test(read(file)));

    expect(carriers.map((file) => path.relative(SOURCE_ROOT, file))).toEqual(
      [],
    );
  });

  /**
   * **What a row may publish besides its amounts, said rather than assumed** — ADR 0106 decision 1,
   * which is the one change to a row's shape this file has ever had to admit.
   *
   * The sweep above is unchanged and unweakened: it asks where an *amount* lives, and no amount
   * moved. What this adds is the other half of the same claim — that what left the book is a
   * **rendered text and nothing else**. Each row still declares its own `tierId`, its own
   * `ruleId` and its own amounts as own properties, and the two new fields are catalogue paths
   * rather than figures.
   *
   * Stated as a whole-shape assertion for the reason the cabinet-rule sweep above is one: a row that
   * quietly grew a field is a failure here rather than a sweep of whatever it happens to hold.
   */
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
      // Every field the row owed before this wave is still the row's own.
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

/** A line that is entirely comment, in the only two forms this codebase's formatter produces: a
 *  line comment, the opening of a block comment, or its continuation.
 *
 *  **Deliberately conservative, and this is the direction that matters.** A trailing comment after
 *  code is *not* recognised, so a Romanian word in one is reported rather than excused — a false red
 *  a human resolves, never a false green. Nothing that starts with `//`, `/*` or `*` can be code. */
const WHOLE_LINE_COMMENT = /^\s*(\/\/|\/\*|\*)/;

/** The source lines of a module that are not comments, numbered from one. */
function codeLinesOf(source: string): readonly (readonly [number, string])[] {
  return source
    .split("\n")
    .map((text, index) => [index + 1, text] as const)
    .filter(([, text]) => !WHOLE_LINE_COMMENT.test(text));
}

/**
 * **The one module in `src/` allowed to hold Romanian, and the ruling that allows it.**
 *
 * [ADR 0106](../../../../docs/decisions/0106-the-price-books-display-prose-publishes-descriptors-and-the-book-keeps-the-tier.md)
 * decision 2 keeps a row's `name` and `description` **required** and authored, so a book nobody at
 * Lemnaria wrote — a manufacturer's, through ADR 0062's post-M8 dashboard — still renders. Those
 * sentences are not debt and are not owed a key.
 *
 * The exemption is checked against the book's own data below rather than taken on trust, so it
 * covers exactly the ruled fallbacks and not the next sentence somebody adds to the file.
 */
const ROMANIAN_BY_RULING = "pricing/sample-price-book.ts";

describe("this package publishes codes and never Romanian", () => {
  // ADR 0095's boundary, held over the source tree rather than over the exports it happens to
  // remember. Wave 6B-j's lint rule says the same thing per line and would catch a re-entry sooner;
  // this says it about the *package*, survives the rule being deleted, and adds the half a lint rule
  // reads past — that the identifier suffix the Romanian used to travel under is gone too.
  //
  // **Its reach is this package's `src/`, not `packages/*/src`.** A test that walked a sibling
  // package's files would make this one unliftable, which `engineering-conventions.md` forbids;
  // `three-adapter` and `persistence` are covered by the lint rule over `packages/*/src` instead.

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
    // The positive control the sweep above cannot supply, now that every `_RO` export is gone: the
    // three names this package really did publish, against the one constant whose name contains the
    // same two letters in the middle of a word.
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
    // The exemption tied to its ruling rather than to a filename: every Romanian line in the book is
    // one of the row texts the book itself publishes. A rejection sentence, a catalogue label or a
    // fourth kind of prose in the same file matches nothing here and fails.
    const authored = new Set<string>([
      ...SAMPLE_PRICE_BOOK.hardware.tiers.flatMap((tier) => [
        tier.name,
        tier.description,
      ]),
      ...SAMPLE_PRICE_BOOK.material.tiers.flatMap((tier) => [
        tier.name,
        tier.description,
      ]),
      // `BookAccessories` declares its two rows as named fields rather than an index signature, so
      // `Object.values` widens to `any[]`. Read off the book all the same, and typed back: a third
      // accessory must be swept the day it is declared.
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
