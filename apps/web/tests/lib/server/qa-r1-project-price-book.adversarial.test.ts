import {
  ANCHORED_SHAPES,
  anchoredFieldsReadBy,
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
  parsePriceBook,
  priceDesign,
  pricedByWidth,
  pricedByWidthAndDoorLeaves,
  pricedByWidthAndHeight,
  pricedByWidthHeightAndDoorLeaves,
  PRICE_PER_SIZE_SHAPE,
  SAMPLE_PRICE_BOOK,
  type AnchoredShape,
  type PriceBook,
  type PriceFormula,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { projectPriceBook } from "@/lib/server/project-price-book";

// Adversarial QA for M10 wave R1's projection: a stored book is jsonb and may carry members its type does not declare;
// the page is handed the declared book and nothing else. It must keep every declared member of every shape (or a price
// silently changes) and lose every undeclared one at every level (or the browser is sent what was never part of a price).
// The member lists in `project-price-book.ts` are checked against the types for the book's own shapes, but the linear
// formula members are string literals with no type check, which is why every formula shape is swept here against an
// oracle the projection does not share: the domain's own list of what an anchored shape reads, and the linear shapes' own
// constructors.

const EXTRA_KEY = "undeclaredMemberQa";
const EXTRA_VALUE = "leaked-text-7c41";
const ANCHOR_WIDTH_MM = 600;
const A_DIMENSION = 900;
const A_PRICE = 12_300;
const A_STEP = 450;

function parsed(declared: unknown): PriceBook {
  const result = parsePriceBook(declared);
  if (!result.ok) {
    throw new Error(`the book did not parse: ${JSON.stringify(result)}`);
  }
  return result.book;
}

function aValueFor(kind: "dimension" | "price" | "step"): number {
  if (kind === "dimension") return A_DIMENSION;
  return kind === "price" ? A_PRICE : A_STEP;
}

/** An anchored formula holding exactly the fields its shape reads, each a value the parser accepts. */
function anchoredOf(shape: AnchoredShape): PriceFormula {
  const fields = anchoredFieldsReadBy(shape);
  const formula: Record<string, unknown> = { shape };
  for (const field of fields) {
    formula[field.name] =
      field.name === "anchorWidthMm"
        ? ANCHOR_WIDTH_MM
        : field.name === "anchorHeightMm"
          ? A_DIMENSION
          : aValueFor(field.kind);
  }
  return formula as unknown as PriceFormula;
}

const COEFFICIENTS = { baseMinor: 1_100, perWidthMillimetreMinor: 7 };
const WITH_HEIGHT = { ...COEFFICIENTS, perHeightMillimetreMinor: 13 };
const WITH_LEAVES = { ...COEFFICIENTS, perDoorLeafMinor: 17 };
const WITH_BOTH = { ...WITH_HEIGHT, perDoorLeafMinor: 17 };

const EVERY_FORMULA_SHAPE: readonly (readonly [string, PriceFormula])[] = [
  ["linear-in-width", pricedByWidth(COEFFICIENTS)],
  ["linear-in-width-and-door-leaves", pricedByWidthAndDoorLeaves(WITH_LEAVES)],
  ["linear-in-width-and-height", pricedByWidthAndHeight(WITH_HEIGHT)],
  [
    "linear-in-width-height-and-door-leaves",
    pricedByWidthHeightAndDoorLeaves(WITH_BOTH),
  ],
  ...ANCHORED_SHAPES.map((shape) => [shape, anchoredOf(shape)] as const),
  [
    PRICE_PER_SIZE_SHAPE,
    {
      shape: PRICE_PER_SIZE_SHAPE,
      sizes: [
        { widthMm: 400, amountMinor: 5_000 },
        { widthMm: 600, amountMinor: 7_000 },
      ],
    },
  ],
];

const SAMPLE_FORMULAS_NOT_CUSTOMER_SUPPLIED = SAMPLE_PRICE_BOOK.cabinetRules
  .map((rule, index) => ({ rule, index }))
  .filter(({ rule }) => rule.suppliedBy !== "customer");

/** The sample book with its first manufacturer rules restated one per formula shape: the book that holds every shape. */
function bookHoldingEveryFormulaShape(): unknown {
  const replaced = new Map(
    EVERY_FORMULA_SHAPE.map(([, formula], position) => [
      SAMPLE_FORMULAS_NOT_CUSTOMER_SUPPLIED[position]?.index,
      formula,
    ]),
  );
  return {
    ...SAMPLE_PRICE_BOOK,
    cabinetRules: SAMPLE_PRICE_BOOK.cabinetRules.map((rule, index) =>
      replaced.has(index) ? { ...rule, formula: replaced.get(index) } : rule,
    ),
  };
}

describe("the projection keeps every declared member", () => {
  it("returns the sample book unchanged", () => {
    const book = parsed(SAMPLE_PRICE_BOOK);

    expect(projectPriceBook(book)).toEqual(book);
  });

  it("prices every design the way the book it projects does", () => {
    const book = parsed(SAMPLE_PRICE_BOOK);
    const catalog = buildKitchenLBodyCatalog(600);
    const priceUnder = (candidate: PriceBook) =>
      priceDesign({
        design: KITCHEN_L_DESIGN,
        catalog,
        book: candidate,
        pricingVersion: candidate.version,
        selections: KITCHEN_L_DESIGN.settings,
      });

    expect(priceUnder(projectPriceBook(book))).toEqual(priceUnder(book));
  });

  it("holds a formula of every shape the domain knows: the book built to hold them all parses and projects to itself", () => {
    const book = parsed(bookHoldingEveryFormulaShape());

    const shapesHeld = new Set(
      book.cabinetRules.map((rule) => rule.formula.shape),
    );
    expect(shapesHeld).toEqual(
      new Set(EVERY_FORMULA_SHAPE.map(([shape]) => shape)),
    );
    expect(projectPriceBook(book)).toEqual(book);
  });

  it.each(EVERY_FORMULA_SHAPE)(
    "keeps every member of a %s formula, and the same number of them",
    (shape, formula) => {
      const book = parsed({
        ...(bookHoldingEveryFormulaShape() as object),
      });
      const rule = book.cabinetRules.find(
        (candidate) => candidate.formula.shape === shape,
      );

      const projected = projectPriceBook(book).cabinetRules.find(
        (candidate) => candidate.ruleId === rule?.ruleId,
      );

      expect(Object.keys(projected?.formula ?? {}).sort()).toEqual(
        Object.keys(formula).sort(),
      );
      expect(projected?.formula).toEqual(formula);
    },
  );

  it("keeps every member of the percentage form: its tiers and its depth rule", () => {
    const book = parsed({
      ...SAMPLE_PRICE_BOOK,
      material: {
        defaultTierId: "material.reference",
        tiers: [
          {
            tierId: "material.reference",
            ruleId: "material.reference",
            name: "Reference",
            description: "The reference tier.",
            nameKey: "priceBook.material.melamine.name",
            descriptionKey: "priceBook.material.melamine.description",
            percentOfCabinets: 0,
          },
          {
            tierId: "material.upgrade",
            ruleId: "material.upgrade",
            name: "Upgrade",
            description: "A tier upgrade.",
            percentOfCabinets: 12,
          },
        ],
      },
      depthRule: { deepCabinetPercent: 9 },
      cabinetRules: SAMPLE_PRICE_BOOK.cabinetRules.map((rule) =>
        rule.suppliedBy === "customer"
          ? rule
          : { ...rule, formula: anchoredOf("anchored-width") },
      ),
    });

    const projected = projectPriceBook(book);

    expect(projected).toEqual(book);
    expect(projected.depthRule).toEqual({ deepCabinetPercent: 9 });
  });
});

/** Every plain object inside a value, with the path that reaches it. */
function objectPaths(
  value: unknown,
  path: readonly (string | number)[] = [],
): (readonly (string | number)[])[] {
  if (typeof value !== "object" || value === null) return [];
  const here: (readonly (string | number)[])[] = Array.isArray(value)
    ? []
    : [path];
  const below = Object.entries(value).flatMap(([key, member]) =>
    objectPaths(member, [...path, Array.isArray(value) ? Number(key) : key]),
  );
  return [...here, ...below];
}

function withExtraAt(
  root: unknown,
  path: readonly (string | number)[],
  keyIsOwnProto: boolean,
): unknown {
  const copy = structuredClone(root) as Record<string | number, unknown>;
  let node: Record<string | number, unknown> = copy;
  for (const step of path)
    node = node[step] as Record<string | number, unknown>;
  if (keyIsOwnProto) {
    Object.defineProperty(node, "__proto__", {
      value: { polluted: EXTRA_VALUE },
      enumerable: true,
      configurable: true,
      writable: true,
    });
  } else {
    node[EXTRA_KEY] = EXTRA_VALUE;
  }
  return copy;
}

describe("the projection drops every undeclared member, at every level a book has", () => {
  const rich = bookHoldingEveryFormulaShape();
  const levels = objectPaths(rich);

  it("sweeps a real number of levels: the book, rules, formulas, sizes, tier groups, tiers and accessories", () => {
    expect(levels.length).toBeGreaterThan(40);
  });

  it("reaches levels where the parser lets an undeclared member through, so the projection is what stops it there", () => {
    const letThrough = levels.filter(
      (path) => parsePriceBook(withExtraAt(rich, path, false)).ok,
    );

    expect(letThrough.length).toBeGreaterThan(levels.length / 2);
  });

  it.each(
    levels.map((path) => [path.join(".") || "(the book)", path] as const),
  )("carries nothing undeclared out of %s", (_, path) => {
    for (const keyIsOwnProto of [false, true]) {
      const stored = withExtraAt(rich, path, keyIsOwnProto);
      const result = parsePriceBook(stored);
      if (!result.ok) continue;

      const projected = projectPriceBook(result.book);

      expect(JSON.stringify(projected)).not.toContain(EXTRA_VALUE);
      expect(JSON.stringify(projected)).not.toContain(EXTRA_KEY);
      expect(projected).toEqual(parsed(rich));
      expect(Object.getPrototypeOf(projected)).toBe(Object.prototype);
    }
  });
});

describe("the projection is a copy and reads only what a book owns", () => {
  it("shares no object with the book it projects, so a later change to either cannot reach the other", () => {
    const book = parsed(SAMPLE_PRICE_BOOK);

    const projected = projectPriceBook(book);

    expect(projected).not.toBe(book);
    expect(projected.cabinetRules).not.toBe(book.cabinetRules);
    expect(projected.cabinetRules[0]).not.toBe(book.cabinetRules[0]);
    expect(projected.hardware.tiers[0]).not.toBe(book.hardware.tiers[0]);
    expect(projected.accessories.sinkProtectiveCover).not.toBe(
      book.accessories.sinkProtectiveCover,
    );
  });

  it("projects a frozen book without writing to it", () => {
    const book = parsed(SAMPLE_PRICE_BOOK);
    const frozen = JSON.parse(JSON.stringify(book)) as PriceBook;
    const deepFreeze = (value: unknown): void => {
      if (typeof value !== "object" || value === null) return;
      Object.values(value).forEach(deepFreeze);
      Object.freeze(value);
    };
    deepFreeze(frozen);

    expect(projectPriceBook(frozen)).toEqual(book);
  });

  it("does not read a member a book merely inherits", () => {
    const inherited = Object.create({
      baseMinor: 999,
      perWidthMillimetreMinor: 999,
    }) as Record<string, unknown>;
    inherited.shape = "linear-in-width";
    const book = {
      ...parsed(SAMPLE_PRICE_BOOK),
      cabinetRules: [{ ruleId: "r", buildId: "b", formula: inherited }],
    } as unknown as PriceBook;

    const [rule] = projectPriceBook(book).cabinetRules;

    expect(rule?.formula).toEqual({ shape: "linear-in-width" });
  });

  it("never produces a member whose value is undefined", () => {
    const book = parsed(SAMPLE_PRICE_BOOK);

    const text = JSON.stringify(projectPriceBook(book));
    const roundTripped = JSON.parse(text) as PriceBook;

    expect(roundTripped).toEqual(projectPriceBook(book));
  });
});
