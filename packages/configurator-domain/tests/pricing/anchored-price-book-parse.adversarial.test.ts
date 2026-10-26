// Adversarial QA of the parser's arms for the anchored and fixed-size shapes, attacked with the values a
// book assembled outside TypeScript can carry (ADR 0062 seam 1). Two contracts from `qa-m6-wave-b-parse-boundary`
// carry over to the new fields and are held here: the parser REFUSES and NEVER THROWS (it runs at module scope in
// the web app), and every amount a rule states is swept by KIND, so a field nobody enumerated is still bounded and
// still zero on a customer-supplied row.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  ANCHORED_SHAPES,
  PRICE_STEP_MM,
  type AnchoredShape,
} from "../../src/pricing/anchored-price-formula.js";
import {
  MAX_PRICE_COEFFICIENT_MINOR,
  parsePriceBook,
} from "../../src/pricing/parse-price-book.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";

type Formula = Record<string, unknown>;
type Parsed = ReturnType<typeof parsePriceBook>;

function parseWith(
  formula: unknown,
  rule: Record<string, unknown> = {},
): Parsed {
  const extra = {
    ruleId: "cabinet.anchored",
    buildId: "test-row",
    formula,
    ...rule,
  };
  return parsePriceBook({
    ...SAMPLE_PRICE_BOOK,
    cabinetRules: [...SAMPLE_PRICE_BOOK.cabinetRules, extra],
  });
}

function anchored(shape: AnchoredShape, overrides: Formula = {}): Formula {
  return {
    shape,
    anchorWidthMm: 600,
    anchorMinor: 1_000_000,
    perStepWiderMinor: 70_000,
    perStepNarrowerMinor: 30_000,
    ...(shape.includes("door-leaves") ? { perExtraDoorLeafMinor: 90_000 } : {}),
    ...(shape.includes("height")
      ? { anchorHeightMm: 700, perHeightStepMinor: 20_000 }
      : {}),
    ...overrides,
  };
}

function perSize(sizes: unknown, overrides: Formula = {}): Formula {
  return { shape: "price-per-size", sizes, ...overrides };
}

function amountFieldsOf(shape: AnchoredShape): readonly string[] {
  return [
    "anchorMinor",
    "perStepWiderMinor",
    "perStepNarrowerMinor",
    ...(shape.includes("door-leaves") ? ["perExtraDoorLeafMinor"] : []),
    ...(shape.includes("height") ? ["perHeightStepMinor"] : []),
  ];
}

function dimensionFieldsOf(shape: AnchoredShape): readonly string[] {
  return [
    "anchorWidthMm",
    ...(shape.includes("height") ? ["anchorHeightMm"] : []),
  ];
}

const SHAPE_FIELD_PAIRS = ANCHORED_SHAPES.flatMap((shape) => [
  ...amountFieldsOf(shape).map((field) => [shape, field] as const),
  ...dimensionFieldsOf(shape).map((field) => [shape, field] as const),
]);

/** Values no price can be read from. Includes the ones whose rendering into a refusal message can itself raise. */
function hostileValues(): readonly (readonly [string, unknown])[] {
  const circular: Record<string, unknown> = {};
  circular["self"] = circular;
  return [
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["a fraction", 1.5],
    ["a numeric string", "5"],
    ["null", null],
    ["an empty list", []],
    ["an object", {}],
    ["true", true],
    ["2^53", 2 ** 53],
    ["a BigInt", 10n],
    ["a symbol", Symbol("amount")],
    ["a function", () => 5],
    ["a circular object", circular],
  ];
}

describe("every field of every anchored shape refuses what no price can be read from, and never throws", () => {
  const CASES = SHAPE_FIELD_PAIRS.flatMap(([shape, field]) =>
    hostileValues().map(
      ([label, value]) => [shape, field, label, value] as const,
    ),
  );

  it.each(CASES)("%s . %s = %s", (shape, field, _label, value) => {
    const parse = () => parseWith(anchored(shape, { [field]: value }));

    expect(parse).not.toThrow();
    const result = parse();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe("INVALID_PRICE_BOOK");
      expect(result.failure.detail).toContain(field);
    }
  });
});

describe("a magnitude past the bound is refused on every amount field, positive or negative", () => {
  const AMOUNT_CASES = ANCHORED_SHAPES.flatMap((shape) =>
    amountFieldsOf(shape).map((field) => [shape, field] as const),
  );

  it.each(AMOUNT_CASES)("%s . %s", (shape, field) => {
    const atBound = parseWith(
      anchored(shape, { [field]: MAX_PRICE_COEFFICIENT_MINOR }),
    );
    const pastBound = parseWith(
      anchored(shape, { [field]: MAX_PRICE_COEFFICIENT_MINOR + 1 }),
    );

    expect(atBound.ok).toBe(true);
    expect(pastBound.ok).toBe(false);
  });

  it("accepts the widest legal book at the bound on all five rates and the largest anchors", () => {
    const widest = anchored("anchored-width-height-and-door-leaves", {
      anchorWidthMm: 10_000,
      anchorHeightMm: 10_000,
      anchorMinor: MAX_PRICE_COEFFICIENT_MINOR,
      perStepWiderMinor: MAX_PRICE_COEFFICIENT_MINOR,
      perStepNarrowerMinor: MAX_PRICE_COEFFICIENT_MINOR,
      perExtraDoorLeafMinor: MAX_PRICE_COEFFICIENT_MINOR,
      perHeightStepMinor: MAX_PRICE_COEFFICIENT_MINOR,
    });

    expect(parseWith(widest).ok).toBe(true);
  });
});

describe("an anchor dimension is a positive multiple of the step within a design's dimensions", () => {
  const DIMENSION_CASES = ANCHORED_SHAPES.flatMap((shape) =>
    dimensionFieldsOf(shape).map((field) => [shape, field] as const),
  );

  it.each(DIMENSION_CASES)(
    "%s . %s refuses every off-step value in 1..10100 and accepts every step",
    (shape, field) => {
      for (let millimetres = 0; millimetres <= 10_100; millimetres += 1) {
        const isOnStep =
          millimetres > 0 &&
          millimetres <= 10_000 &&
          millimetres % PRICE_STEP_MM === 0;

        const result = parseWith(anchored(shape, { [field]: millimetres }));

        expect(result.ok, `${field} = ${String(millimetres)}`).toBe(isOnStep);
      }
    },
  );
});

describe("a fixed-size row carries only its sizes: a cabinet field it does not read is an editable number no price reads (§8.4 b addresses)", () => {
  it.each([
    ["anchorMinor", 1],
    ["anchorWidthMm", 600],
    ["perStepWiderMinor", 1],
    ["perStepNarrowerMinor", 1],
    ["perExtraDoorLeafMinor", 1],
    ["perHeightStepMinor", 1],
    ["anchorHeightMm", 700],
  ] as const)(
    "refuses price-per-size carrying %s, which it does not read",
    (field, value) => {
      expect(
        parseWith(
          perSize([{ widthMm: 300, amountMinor: 1 }], { [field]: value }),
        ).ok,
      ).toBe(false);
    },
  );
});

/** A list with a hole at index 1, built by assignment so the literal is not a sparse-array lint error. */
function sparseListOfSizes(): unknown[] {
  const sparse: unknown[] = [];
  sparse[0] = { widthMm: 200, amountMinor: 1 };
  sparse[2] = { widthMm: 300, amountMinor: 1 };
  return sparse;
}

describe("a fixed-size list is read without running its own code, and holds every size to the same rules", () => {
  it("accepts exactly twenty sizes and refuses twenty-one", () => {
    const sizes = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        widthMm: (index + 1) * PRICE_STEP_MM,
        amountMinor: 1,
      }));

    expect(parseWith(perSize(sizes(20))).ok).toBe(true);
    expect(parseWith(perSize(sizes(21))).ok).toBe(false);
  });

  it.each([
    ["a sparse list", sparseListOfSizes()],
    ["a list holding null", [{ widthMm: 200, amountMinor: 1 }, null]],
    ["a list holding a number", [200]],
    ["a list of lists", [[200, 1]]],
    [
      "an object posing as a list",
      { length: 1, 0: { widthMm: 200, amountMinor: 1 } },
    ],
    ["a string", "300"],
    ["null", null],
  ])("refuses %s", (_label, sizes) => {
    expect(parseWith(perSize(sizes)).ok).toBe(false);
  });

  it.each([
    ["a fractional width", 250.5],
    ["a zero width", 0],
    ["a negative width", -250],
    ["a width past the design maximum", 10_001],
    ["a NaN width", Number.NaN],
    ["a string width", "250"],
    ["a BigInt width", 250n],
  ])("refuses %s without throwing", (_label, widthMm) => {
    const parse = () => parseWith(perSize([{ widthMm, amountMinor: 1 }]));

    expect(parse).not.toThrow();
    expect(parse().ok).toBe(false);
  });

  it.each(hostileValues())(
    "refuses an amount of %s without throwing",
    (_label, amountMinor) => {
      const parse = () => parseWith(perSize([{ widthMm: 300, amountMinor }]));

      expect(parse).not.toThrow();
      expect(parse().ok).toBe(false);
    },
  );

  it("refuses a negative and an oversized amount, and a missing one", () => {
    for (const amountMinor of [
      -1,
      MAX_PRICE_COEFFICIENT_MINOR + 1,
      undefined,
    ]) {
      expect(parseWith(perSize([{ widthMm: 300, amountMinor }])).ok).toBe(
        false,
      );
    }
  });

  it("refuses descending, repeated and out-of-order widths anywhere in the list", () => {
    const row = (widthMm: number) => ({ widthMm, amountMinor: 1 });

    expect(parseWith(perSize([row(300), row(200)])).ok).toBe(false);
    expect(parseWith(perSize([row(200), row(200)])).ok).toBe(false);
    expect(parseWith(perSize([row(200), row(300), row(250)])).ok).toBe(false);
    expect(parseWith(perSize([row(200), row(300), row(300)])).ok).toBe(false);
  });

  const RAISING_SITES: readonly (readonly [string, () => Formula])[] = [
    [
      "the sizes getter",
      () => {
        const formula = perSize([]);
        Object.defineProperty(formula, "sizes", {
          enumerable: true,
          get() {
            throw new Error("trap");
          },
        });
        return formula;
      },
    ],
    [
      "a size's widthMm getter",
      () => {
        const size = { amountMinor: 1 };
        Object.defineProperty(size, "widthMm", {
          enumerable: true,
          get() {
            throw new Error("trap");
          },
        });
        return perSize([size]);
      },
    ],
    [
      "a size's amountMinor getter",
      () => {
        const size = { widthMm: 300 };
        Object.defineProperty(size, "amountMinor", {
          enumerable: true,
          get() {
            throw new Error("trap");
          },
        });
        return perSize([size]);
      },
    ],
    [
      "an element getter",
      () => {
        const sizes: unknown[] = [];
        Object.defineProperty(sizes, "0", {
          enumerable: true,
          get() {
            throw new Error("trap");
          },
        });
        return perSize(sizes);
      },
    ],
    [
      "a proxied size whose ownKeys raises",
      () =>
        perSize([
          new Proxy(
            { widthMm: 300, amountMinor: 1 },
            {
              ownKeys() {
                throw new Error("trap");
              },
            },
          ),
        ]),
    ],
    [
      "a proxied formula whose ownKeys raises",
      () =>
        new Proxy(perSize([{ widthMm: 300, amountMinor: 1 }]), {
          ownKeys() {
            throw new Error("trap");
          },
        }),
    ],
    [
      "the shape getter",
      () => {
        const formula = anchored("anchored-width");
        Object.defineProperty(formula, "shape", {
          enumerable: true,
          get() {
            throw new Error("trap");
          },
        });
        return formula;
      },
    ],
  ];

  it.each(RAISING_SITES)(
    "refuses and does not throw when %s raises",
    (_label, build) => {
      const parse = () => parseWith(build());

      expect(parse).not.toThrow();
      expect(parse().ok).toBe(false);
    },
  );
});

describe("every anchored field raising on read is a refusal, never a throw", () => {
  it.each(SHAPE_FIELD_PAIRS)("%s . %s", (shape, field) => {
    const formula = anchored(shape);
    Object.defineProperty(formula, field, {
      enumerable: true,
      get() {
        throw new Error("trap");
      },
    });

    const parse = () => parseWith(formula);

    expect(parse).not.toThrow();
    expect(parse().ok).toBe(false);
  });
});

describe("amounts are swept by kind, wherever the book keeps them (extends the M6 wave-B guarantees to the new fields)", () => {
  // `it.fails`: a KNOWN, PRE-EXISTING hole (the LINEAR case below fails the same way at base 275ca17b). `enumerableFieldsOf`
  // lists `Object.keys` per prototype level, so an accessor on a class prototype is read by the arithmetic yet
  // invisible to the magnitude and customer-zero sweeps. the anchored shapes extend the hole to anchorMinor, the steps and `sizes[i]`.
  // Each case turns red when the sweep is fixed, which is the cue to drop the `.fails`.
  /** A rule backed by a model object: its rates sit behind accessors on the prototype, the way a class-backed book
   *  would state them. `Object.keys` never lists those, so a sweep that enumerates only own keys does not see them. */
  function prototypeBacked(fields: Record<string, unknown>): Formula {
    const prototype = {};
    for (const [field, value] of Object.entries(fields)) {
      Object.defineProperty(prototype, field, {
        enumerable: false,
        get: () => value,
      });
    }
    return Object.create(prototype) as Formula;
  }

  it.fails(
    "refuses an anchor past the magnitude bound when the field is non-enumerable",
    () => {
      const formula = prototypeBacked({
        shape: "anchored-width",
        anchorWidthMm: 600,
        anchorMinor: MAX_PRICE_COEFFICIENT_MINOR + 1,
        perStepWiderMinor: 0,
        perStepNarrowerMinor: 0,
      });

      expect(parseWith(formula).ok).toBe(false);
    },
  );

  it.fails(
    "refuses a charged anchor on a customer-supplied rule when the field is non-enumerable",
    () => {
      const formula = prototypeBacked({
        shape: "anchored-width",
        anchorWidthMm: 600,
        anchorMinor: 5_000,
        perStepWiderMinor: 0,
        perStepNarrowerMinor: 0,
      });

      expect(parseWith(formula, { suppliedBy: "customer" }).ok).toBe(false);
    },
  );

  it("refuses a charged size on a customer-supplied rule when the size's amount is non-enumerable", () => {
    const size = prototypeBacked({ widthMm: 300, amountMinor: 5_000 });

    expect(parseWith(perSize([size]), { suppliedBy: "customer" }).ok).toBe(
      false,
    );
  });

  it.fails("refuses an oversized size amount when it is non-enumerable", () => {
    const size = prototypeBacked({
      widthMm: 300,
      amountMinor: MAX_PRICE_COEFFICIENT_MINOR + 1,
    });

    expect(parseWith(perSize([size])).ok).toBe(false);
  });

  it.fails(
    "refuses the same charged amount on the LINEAR shape (the M6 baseline this extends)",
    () => {
      const formula = prototypeBacked({
        shape: "linear-in-width",
        baseMinor: 5_000,
        perWidthMillimetreMinor: 0,
      });

      expect(parseWith(formula, { suppliedBy: "customer" }).ok).toBe(false);
    },
  );
});

describe("a row the customer supplies is never charged: any one nonzero amount anywhere is refused", () => {
  const CUSTOMER = { suppliedBy: "customer" };
  const zeroed = (shape: AnchoredShape) =>
    anchored(
      shape,
      Object.fromEntries(amountFieldsOf(shape).map((field) => [field, 0])),
    );

  propertyTest.prop([
    fc.constantFrom(...ANCHORED_SHAPES),
    fc.nat(),
    fc.oneof(
      fc.integer({ min: 1, max: 1_000_000 }),
      fc.constant(MAX_PRICE_COEFFICIENT_MINOR),
    ),
  ])(
    "refuses a single charged field of an anchored customer rule",
    (shape, pick, amount) => {
      const fields = amountFieldsOf(shape);
      const field = fields[pick % fields.length] ?? "anchorMinor";

      expect(parseWith(zeroed(shape), CUSTOMER).ok).toBe(true);
      expect(
        parseWith({ ...zeroed(shape), [field]: amount }, CUSTOMER).ok,
      ).toBe(false);
    },
  );

  propertyTest.prop([
    fc.integer({ min: 1, max: 20 }),
    fc.nat(),
    fc.integer({ min: 1, max: 1_000_000 }),
  ])(
    "refuses a single charged size anywhere in a fixed-size customer rule",
    (count, pick, amount) => {
      const sizes = Array.from({ length: count }, (_, index) => ({
        widthMm: (index + 1) * PRICE_STEP_MM,
        amountMinor: 0,
      }));
      const charged = sizes.map((size, index) =>
        index === pick % count ? { ...size, amountMinor: amount } : size,
      );

      expect(parseWith(perSize(sizes), CUSTOMER).ok).toBe(true);
      expect(parseWith(perSize(charged), CUSTOMER).ok).toBe(false);
    },
  );

  it("refuses a negative charge too: a credit is still a charge", () => {
    expect(
      parseWith({ ...zeroed("anchored-width"), anchorMinor: -1 }, CUSTOMER).ok,
    ).toBe(false);
  });
});

describe("a shape carries exactly the fields it reads, whatever they are called and wherever they are kept", () => {
  const FOREIGN_NAMES = [
    "baseMinor",
    "perWidthMillimetreMinor",
    "perHeightMillimetreMinor",
    "perDoorLeafMinor",
    "wholeKitchenMinor",
    "amountMinor",
    "sizes",
    "note",
    "perStepWiderMinorr",
    "ANCHORMINOR",
  ];
  const ANCHORED_CASES = ANCHORED_SHAPES.flatMap((shape) =>
    FOREIGN_NAMES.map((field) => [shape, field] as const),
  );

  it.each(ANCHORED_CASES)("refuses %s carrying %s", (shape, field) => {
    for (const value of [0, 1, "x", null, false, [], {}]) {
      expect(
        parseWith(anchored(shape, { [field]: value })).ok,
        `${field} = ${JSON.stringify(value)}`,
      ).toBe(false);
    }
  });

  it.each(FOREIGN_NAMES.filter((field) => field !== "sizes"))(
    "refuses price-per-size carrying %s",
    (field) => {
      const sizes = [{ widthMm: 300, amountMinor: 1 }];

      expect(parseWith(perSize(sizes, { [field]: 1 })).ok).toBe(false);
    },
  );

  it.each(ANCHORED_SHAPES)(
    "accepts %s whose unread fields are keys holding undefined, as absent",
    (shape) => {
      const withUndefinedKeys = anchored(shape, {
        baseMinor: undefined,
        note: undefined,
        ...(shape.includes("door-leaves")
          ? {}
          : { perExtraDoorLeafMinor: undefined }),
        ...(shape.includes("height")
          ? {}
          : { anchorHeightMm: undefined, perHeightStepMinor: undefined }),
      });

      expect(parseWith(withUndefinedKeys).ok).toBe(true);
    },
  );

  it.each(ANCHORED_SHAPES)(
    "refuses %s carrying an unread field it inherits from its prototype",
    (shape) => {
      const inherited = Object.create({ baseMinor: 5 }) as Formula;
      Object.assign(inherited, anchored(shape));

      expect(parseWith(inherited).ok).toBe(false);
    },
  );

  it("refuses price-per-size carrying an inherited unread field", () => {
    const inherited = Object.create({ anchorMinor: 5 }) as Formula;
    Object.assign(inherited, perSize([{ widthMm: 300, amountMinor: 1 }]));

    expect(parseWith(inherited).ok).toBe(false);
  });

  function withoutAnchorMinor(): Formula {
    const formula = anchored("anchored-width");
    delete formula["anchorMinor"];
    return formula;
  }

  it("accepts a formula whose READ fields are inherited, since an inherited read field is still read", () => {
    const inherited = Object.create({ anchorMinor: 5 }) as Formula;
    Object.assign(inherited, withoutAnchorMinor());

    expect(parseWith(inherited).ok).toBe(true);
  });

  it("refuses, and does not throw, for an unread field whose getter raises", () => {
    const formula = anchored("anchored-width");
    Object.defineProperty(formula, "note", {
      enumerable: true,
      get() {
        throw new Error("trap");
      },
    });

    const parse = () => parseWith(formula);

    expect(parse).not.toThrow();
    expect(parse().ok).toBe(false);
  });

  it("leaves the linear shapes alone: a field they do not read is not this wave's to refuse", () => {
    const linear = {
      shape: "linear-in-width",
      baseMinor: 1,
      perWidthMillimetreMinor: 1,
      note: 1,
    };

    expect(parseWith(linear).ok).toBe(true);
  });

  it("refuses a size entry carrying a field beside its width and amount (probe: the sizes of a fixed-size row are fields too)", () => {
    expect(
      parseWith(
        perSize([{ widthMm: 300, amountMinor: 1, perStepWiderMinor: 9 }]),
      ).ok,
    ).toBe(false);
  });
});

describe("a fixed-size list is held to the pricing step", () => {
  it("accepts exactly the multiples of 50 from 50 to 10 000 and refuses every other whole width", () => {
    for (let widthMm = 1; widthMm <= 10_001; widthMm += 1) {
      const isOnStep = widthMm <= 10_000 && widthMm % PRICE_STEP_MM === 0;

      expect(
        parseWith(perSize([{ widthMm, amountMinor: 1 }])).ok,
        String(widthMm),
      ).toBe(isOnStep);
    }
  });

  it("refuses an off-step width in the middle or at the end of an otherwise good list", () => {
    const good = [
      { widthMm: 200, amountMinor: 1 },
      { widthMm: 300, amountMinor: 1 },
    ];

    expect(
      parseWith(perSize([...good, { widthMm: 325, amountMinor: 1 }])).ok,
    ).toBe(false);
    expect(
      parseWith(perSize([{ widthMm: 280, amountMinor: 1 }, good[1]])).ok,
    ).toBe(false);
  });
});
