// The three seams ADR 0062 requires, asserted against the source tree: shape, not behaviour (`price-design.test.ts`
// covers behaviour). Each is the kind of property where the code still works when it is broken.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { INSERTABLE_BODY_DEFINITIONS } from "../../src/catalog.js";
import { SAMPLE_PRICE_BOOK as BARREL_BOOK } from "../../src/index.js";
import { ANCHORED_SHAPES } from "../../src/pricing/anchored-price-formula.js";
import {
  amountForBody,
  PRICE_BOOK_CURRENCY,
  type AccessoryRule,
  type PriceFormula,
} from "../../src/pricing/price-book.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import type { BodyDefinition } from "../../src/void-engine.js";

const INSERTABLE_ROWS: ReadonlyMap<string, BodyDefinition> = new Map(
  INSERTABLE_BODY_DEFINITIONS,
);

const SOURCE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src",
);
const PRICING_ROOT = path.join(SOURCE_ROOT, "pricing");
const PRICE_DASHBOARD_ROOT = path.join(SOURCE_ROOT, "price-dashboard");

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

/** Every formula shape this build knows and the fields each is made of, declared here rather than derived from the
 *  book, so a book that grew a field fails instead of passing a sweep of whatever it holds. The shapes: an anchor and
 *  its 50 mm steps, with a door-leaf step and a height step where a row's catalogue property asks for one, and a list
 *  of sizes. A width appears only as the dimension a price is quoted at or a size it is listed at; none is a price. */
const FIELDS_BY_SHAPE: Readonly<Record<string, readonly string[]>> = {
  "anchored-width": [
    "anchorWidthMm",
    "anchorMinor",
    "perStepWiderMinor",
    "perStepNarrowerMinor",
  ],
  "anchored-width-and-door-leaves": [
    "anchorWidthMm",
    "anchorMinor",
    "perStepWiderMinor",
    "perStepNarrowerMinor",
    "perExtraDoorLeafMinor",
  ],
  "anchored-width-and-height": [
    "anchorWidthMm",
    "anchorMinor",
    "perStepWiderMinor",
    "perStepNarrowerMinor",
    "anchorHeightMm",
    "perHeightStepMinor",
  ],
  "anchored-width-height-and-door-leaves": [
    "anchorWidthMm",
    "anchorMinor",
    "perStepWiderMinor",
    "perStepNarrowerMinor",
    "perExtraDoorLeafMinor",
    "anchorHeightMm",
    "perHeightStepMinor",
  ],
  "price-per-size": ["sizes"],
};

/** Which shapes read which derived fact about a body. Read off the field table above rather than listed again, so a
 *  shape cannot be added to one and forgotten in the other. */
function shapesReading(field: string): readonly string[] {
  return Object.entries(FIELDS_BY_SHAPE)
    .filter(([, fields]) => fields.includes(field))
    .map(([shape]) => shape);
}

describe("a price is an anchor and steps, never a table keyed on the ladder", () => {
  it("has no module under pricing/ naming the catalogue's width step", () => {
    // ADR 0177 A-4: pricing declares its own pricing step and never imports or derives it from the catalogue's width
    // module (ADR 0035 decision 8 keeps the 50 mm step a presentation fact). Neither name nor import may appear.
    const naming = sourcesUnder(PRICING_ROOT).filter((file) =>
      read(file).includes("WIDTH_STEP_MM"),
    );

    expect(naming).toEqual([]);
  });

  it("has no price-data structure keyed on a width", () => {
    // Falsifiable in the data: neither a rule nor its formula carries a field whose name or value is a price keyed on
    // a width. Stated against the declared shapes, not one shape's field list. `FIELDS_BY_SHAPE` is the table this file
    // owns, so a shape added in `price-book.ts` without a line here fails as unknown.
    for (const rule of SAMPLE_PRICE_BOOK.cabinetRules) {
      // `suppliedBy` is an optional key: it says who puts the row in the kitchen, not a coefficient or a width. Still
      // exhaustive: a rule declares the three required keys and at most that one.
      expect(Object.keys(rule).sort()).toEqual(
        rule.suppliedBy === undefined
          ? ["buildId", "formula", "ruleId"]
          : ["buildId", "formula", "ruleId", "suppliedBy"],
      );
      const fields = FIELDS_BY_SHAPE[rule.formula.shape];
      expect(fields).toBeDefined();
      expect(Object.keys(rule.formula).sort()).toEqual(
        [...(fields ?? []), "shape"].sort(),
      );
    }
  });

  it("names no field after a width the ladder offers", () => {
    // No field is a size and none is keyed on one: `perMm600` or `at800` would be a width table wearing a formula's
    // clothes.
    for (const rule of SAMPLE_PRICE_BOOK.cabinetRules) {
      for (const field of Object.keys(rule.formula)) {
        expect(field).not.toMatch(/\d/);
      }
    }
  });

  it("states every amount, step and dimension of an anchored row as an exact integer", () => {
    for (const rule of SAMPLE_PRICE_BOOK.cabinetRules) {
      if (rule.formula.shape === "price-per-size") continue;
      const formula = rule.formula as unknown as Record<string, unknown>;
      for (const field of FIELDS_BY_SHAPE[rule.formula.shape] ?? []) {
        expect(Number.isSafeInteger(formula[field]), field).toBe(true);
      }
    }
  });

  it("lists sizes only for a row the catalogue makes in listed sizes, and lists exactly those", () => {
    // A-7: a row made in one or two widths carries those sizes; every row with a continuous range is an anchor and
    // steps. The insertable rows are checked against the catalogue's own sizes; a structural corner, which the
    // catalogue does not list as insertable, is made in one width and lists one.
    const listedBy = new Map(
      SAMPLE_PRICE_BOOK.cabinetRules.flatMap((rule) =>
        rule.formula.shape === "price-per-size"
          ? [
              [
                rule.buildId,
                rule.formula.sizes.map((size) => size.widthMm),
              ] as const,
            ]
          : [],
      ),
    );

    for (const [buildId, definition] of INSERTABLE_BODY_DEFINITIONS) {
      const isCustomerSupplied =
        SAMPLE_PRICE_BOOK.cabinetRules.find((rule) => rule.buildId === buildId)
          ?.suppliedBy === "customer";
      const isMadeInListedSizes = (definition.widthRangesMm ?? []).every(
        (range) => range.minMm === range.maxMm,
      );
      if (isCustomerSupplied) continue;
      expect(listedBy.has(buildId), buildId).toBe(isMadeInListedSizes);
      if (isMadeInListedSizes) {
        expect(listedBy.get(buildId), buildId).toEqual(definition.sizesMm);
      }
    }
    const corners = [...listedBy.entries()].filter(
      ([buildId]) => !INSERTABLE_ROWS.has(buildId),
    );
    expect(corners).toHaveLength(6);
    for (const [buildId, widthsMm] of corners) {
      expect(widthsMm, buildId).toHaveLength(1);
    }
  });

  it("quotes every anchored insertable row at the width the catalogue says it is made at by default", () => {
    // The book-by-catalogue rule M2 will enforce at publish, held for the shipped book here: an anchor quoted at a width
    // nothing is built at would make every step count from a width nobody orders.
    for (const rule of SAMPLE_PRICE_BOOK.cabinetRules) {
      const definition = INSERTABLE_ROWS.get(rule.buildId);
      if (definition === undefined || rule.formula.shape === "price-per-size") {
        continue;
      }
      expect(rule.formula.anchorWidthMm, rule.buildId).toBe(
        definition.defaultWidthMm,
      );
    }
  });
});

describe("every shape this build declares is a shape this build evaluates", () => {
  // A declared shape with no arm in `amountForBody` is not a type error (the switch default refuses), so it would
  // fail as `UNKNOWN_FORMULA_SHAPE` at runtime on a customer-facing document; every shape is exercised here. Every
  // rate is a different power of ten, so a wrong arm answers another shape's sum.
  const ANCHOR = 1;
  const WIDER = 10;
  const NARROWER = 100;
  const DOOR = 1_000;
  const HEIGHT = 10_000;
  const anchored = (
    shape: Extract<PriceFormula, { anchorMinor: number }>["shape"],
  ): PriceFormula => ({
    shape,
    anchorWidthMm: 600,
    anchorHeightMm: 700,
    anchorMinor: ANCHOR,
    perStepWiderMinor: WIDER,
    perStepNarrowerMinor: NARROWER,
    perExtraDoorLeafMinor: DOOR,
    perHeightStepMinor: HEIGHT,
  });
  const ONE_OF_EACH: readonly PriceFormula[] = [
    anchored("anchored-width"),
    anchored("anchored-width-and-door-leaves"),
    anchored("anchored-width-and-height"),
    anchored("anchored-width-height-and-door-leaves"),
    { shape: "price-per-size", sizes: [{ widthMm: 650, amountMinor: 7 }] },
  ];

  it("evaluates a formula of every shape the book seam names", () => {
    // The body is one step wider than the width anchor, one step taller than the height anchor and one door leaf over
    // the anchor's. Each amount is the anchor plus the terms its own shape reads.
    expect(
      ONE_OF_EACH.map((formula) =>
        amountForBody(formula, {
          widthMm: 650,
          heightMm: 750,
          doorLeafCount: 3,
          doorLeafCountAt: () => 2,
        }),
      ),
    ).toEqual([
      ANCHOR + WIDER,
      ANCHOR + WIDER + DOOR,
      ANCHOR + WIDER + HEIGHT,
      ANCHOR + WIDER + HEIGHT + DOOR,
      7,
    ]);
  });

  it("covers every shape the field table declares, and no other", () => {
    // Ties the lists together: the table this file prices books against, the shapes the module exports and the shapes
    // exercised above describe the same set, so none can grow a member the others have not seen.
    const exercised = [...new Set(ONE_OF_EACH.map((formula) => formula.shape))];
    expect(exercised.sort()).toEqual(Object.keys(FIELDS_BY_SHAPE).sort());
    expect([...ANCHORED_SHAPES, "price-per-size"].sort()).toEqual(
      Object.keys(FIELDS_BY_SHAPE).sort(),
    );
  });

  it("does not evaluate a shape this build has retired", () => {
    const retired = { shape: "linear-in-width" } as unknown as PriceFormula;

    expect(
      amountForBody(retired, { widthMm: 600, heightMm: 700, doorLeafCount: 2 }),
    ).toBeUndefined();
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
      expect(shapesReading("perHeightStepMinor")).toContain(shapeFor(buildId));
    }
  });

  it("prices every row whose door count follows its width with a shape that steps", () => {
    const hinged = [...INSERTABLE_BODY_DEFINITIONS]
      .filter(([, definition]) => definition.doorCountFollowsWidth === true)
      .map(([buildId]) => buildId);

    expect(hinged).toEqual(["base-cabinet", "wall-cabinet", "tall-pantry"]);
    for (const buildId of hinged) {
      expect(shapesReading("perExtraDoorLeafMinor")).toContain(
        shapeFor(buildId),
      );
    }
  });

  it("gives a row neither term where the catalogue declares neither property", () => {
    // The other half, which stops the two sweeps above from being satisfied by giving every row
    // every term — a book that did that would price correctly and say nothing about the product.
    for (const [buildId, definition] of INSERTABLE_BODY_DEFINITIONS) {
      if (definition.heightFlex === true) continue;
      if (definition.doorCountFollowsWidth === true) continue;
      expect(shapesReading("perHeightStepMinor")).not.toContain(
        shapeFor(buildId),
      );
      expect(shapesReading("perExtraDoorLeafMinor")).not.toContain(
        shapeFor(buildId),
      );
    }
  });
});

describe("no amount, tier, delta or rule exists outside the book", () => {
  it("keeps every minor-unit amount in the sample book file", () => {
    // ADR 0062's third prohibition: an amount in a catalogue row or a rejection sentence would be a second authority
    // for a price; the sheet's delta must be this data rendered.
    // `price-dashboard/` is exempt as a directory: it names the book's fields (`anchorMinor`, `perHingeMinor`) to
    // address them, which is not an amount. The test after this one holds that directory to naming and never to
    // valuing.
    const carriers = sourcesUnder(SOURCE_ROOT)
      .filter((file) => !file.startsWith(PRICING_ROOT))
      .filter((file) => !file.startsWith(PRICE_DASHBOARD_ROOT + path.sep))
      .filter((file) => /Minor\b/.test(read(file)));

    expect(carriers.map((file) => path.relative(SOURCE_ROOT, file))).toEqual(
      [],
    );
  });

  it("assigns no minor-unit field a number anywhere under price-dashboard/", () => {
    // The replacement for the exemption above (M10 X0-1): the dashboard may name an amount's field, never state one.
    const files = sourcesUnder(PRICE_DASHBOARD_ROOT);
    const assigners = files.filter((file) =>
      /Minor\??\s*[:=]\s*-?\d/.test(read(file)),
    );

    expect(files.length).toBeGreaterThan(0);
    expect(assigners.map((file) => path.relative(SOURCE_ROOT, file))).toEqual(
      [],
    );
  });

  it("states no amount as the value of a draft change under price-dashboard/", () => {
    // The second pattern (X0 review, QA pin gap): a `DraftChange` holds its amount in `value`, not in a `…Minor` member,
    // so `{address: {field: "anchorMinor"}, value: 145000}` slips past the pin above. Two shapes catch it: a number of
    // four digits or more in a `value` position (a percentage is at most `100`), and
    // any number in the `value` of an object whose address names a `…Minor` field.
    const amountInValuePosition =
      /\bvalue"?\s*:\s*-?(?:\d[\d_]{3,}|0x[\da-f]{3,})/i;
    const numberBesideAMinorAddress =
      /Minor"?\s*[,}\s]*\}[,\s]*value"?\s*:\s*-?(?:\d|0x)/i;
    const stating = sourcesUnder(PRICE_DASHBOARD_ROOT).filter((file) => {
      const code = read(file);
      return (
        amountInValuePosition.test(code) || numberBesideAMinorAddress.test(code)
      );
    });

    expect(stating.map((file) => path.relative(SOURCE_ROOT, file))).toEqual([]);
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
            [...tierFields, "percentOfCabinets"],
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
