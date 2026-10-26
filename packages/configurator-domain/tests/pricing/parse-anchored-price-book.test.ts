// The parser's arms for the anchored shapes and the fixed-size shape (P1-f): each refusal names the field, and a
// well-formed formula the rule draws is accepted, so a refusal cannot be a parser that refuses everything.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { MAX_DESIGN_DIMENSION_MM } from "../../src/design-bounds.js";
import {
  MAX_PRICE_COEFFICIENT_MINOR,
  parsePriceBook,
} from "../../src/pricing/parse-price-book.js";
import {
  ANCHORED_SHAPES,
  PRICE_STEP_MM,
  type AnchoredShape,
} from "../../src/pricing/anchored-price-formula.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";

const MAX_SIZES = 20;

type Formula = Record<string, unknown>;

/** The sample book with one extra cabinet rule carrying the declared formula, read back through the parser. */
function parseWith(
  formula: unknown,
  rule: Record<string, unknown> = {},
): ReturnType<typeof parsePriceBook> {
  const extra = {
    ruleId: "cabinet.test-formula",
    buildId: "test-row",
    formula,
    ...rule,
  };
  return parsePriceBook({
    ...SAMPLE_PRICE_BOOK,
    cabinetRules: [...SAMPLE_PRICE_BOOK.cabinetRules, extra],
  });
}

function refusalDetail(result: ReturnType<typeof parsePriceBook>): string {
  if (result.ok) throw new Error("expected the parser to refuse");
  expect(result.failure.code).toBe("INVALID_PRICE_BOOK");
  return result.failure.detail;
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

function perSize(sizes: unknown): Formula {
  return { shape: "price-per-size", sizes };
}

const shapeArbitrary = fc.constantFrom(...ANCHORED_SHAPES);
const rateArbitrary = fc.integer({ min: 0, max: 1_000_000 });
const onStepWidthArbitrary = fc
  .integer({ min: 1, max: MAX_DESIGN_DIMENSION_MM / PRICE_STEP_MM })
  .map((steps) => steps * PRICE_STEP_MM);

describe("a well-formed formula the parser accepts", () => {
  propertyTest.prop([
    shapeArbitrary,
    fc.integer({ min: 0, max: 100_000_000 }),
    rateArbitrary,
    rateArbitrary,
    rateArbitrary,
    fc.integer({ min: 1, max: 200 }),
  ])(
    "reads any anchored shape with drawn amounts and anchors on the step",
    (shape, anchorMinor, wider, narrower, door, anchorSteps) => {
      const formula = anchored(shape, {
        anchorMinor,
        perStepWiderMinor: wider,
        perStepNarrowerMinor: narrower,
        anchorWidthMm: anchorSteps * PRICE_STEP_MM,
        ...(shape.includes("door-leaves")
          ? { perExtraDoorLeafMinor: door }
          : {}),
      });

      expect(parseWith(formula).ok).toBe(true);
    },
  );

  it("accepts a price of zero in every amount field: free is a real answer", () => {
    const zeroes = anchored("anchored-width-height-and-door-leaves", {
      anchorMinor: 0,
      perExtraDoorLeafMinor: 0,
    });

    expect(parseWith(zeroes).ok).toBe(true);
    expect(parseWith(perSize([{ widthMm: 300, amountMinor: 0 }])).ok).toBe(
      true,
    );
  });

  propertyTest.prop([
    fc
      .uniqueArray(onStepWidthArbitrary, {
        minLength: 1,
        maxLength: MAX_SIZES,
      })
      .map((widths) => widths.sort((a, b) => a - b)),
    rateArbitrary,
  ])(
    "reads a fixed-size list of one to twenty ascending widths",
    (widths, amountMinor) => {
      const sizes = widths.map((widthMm) => ({ widthMm, amountMinor }));

      expect(parseWith(perSize(sizes)).ok).toBe(true);
    },
  );
});

describe("a negative step is refused, naming the step (P1-f)", () => {
  const STEP_CASES: readonly (readonly [AnchoredShape, string])[] = [
    ["anchored-width", "perStepWiderMinor"],
    ["anchored-width", "perStepNarrowerMinor"],
    ["anchored-width-and-height", "perHeightStepMinor"],
    ["anchored-width-height-and-door-leaves", "perHeightStepMinor"],
  ];

  it.each(STEP_CASES)("refuses %s with a negative %s", (shape, field) => {
    const formula = anchored(shape, { [field]: -1 });

    expect(refusalDetail(parseWith(formula))).toContain(`"${field}"`);
  });

  propertyTest.prop([
    fc.constantFrom(...STEP_CASES),
    fc.integer({ min: -100_000_000, max: -1 }),
  ])(
    "refuses any drawn negative amount in a step field",
    ([shape, field], step) => {
      expect(
        refusalDetail(parseWith(anchored(shape, { [field]: step }))),
      ).toContain(`"${field}"`);
    },
  );

  it("accepts a step of zero: a free step is a real answer", () => {
    expect(
      parseWith(
        anchored("anchored-width", {
          perStepWiderMinor: 0,
          perStepNarrowerMinor: 0,
        }),
      ).ok,
    ).toBe(true);
  });
});

describe("no price in the book is negative", () => {
  const PRICE_CASES: readonly (readonly [AnchoredShape, string])[] = [
    ["anchored-width", "anchorMinor"],
    ["anchored-width-and-door-leaves", "perExtraDoorLeafMinor"],
    ["anchored-width-height-and-door-leaves", "anchorMinor"],
    ["anchored-width-height-and-door-leaves", "perExtraDoorLeafMinor"],
  ];

  it.each(PRICE_CASES)("refuses %s with a negative %s", (shape, field) => {
    expect(
      refusalDetail(parseWith(anchored(shape, { [field]: -1 }))),
    ).toContain(`"${field}"`);
  });

  propertyTest.prop([
    fc.constantFrom(...PRICE_CASES),
    fc.integer({ min: -100_000_000, max: -1 }),
  ])(
    "refuses any drawn negative anchor or door-leaf amount",
    ([shape, field], amount) => {
      expect(
        refusalDetail(parseWith(anchored(shape, { [field]: amount }))),
      ).toContain(`"${field}"`);
    },
  );

  propertyTest.prop([
    fc.integer({ min: -100_000_000, max: -1 }),
    fc.integer({ min: 0, max: 19 }),
  ])(
    "refuses a negative amount at any position in a fixed-size list",
    (amountMinor, position) => {
      const sizes = Array.from({ length: 20 }, (_, index) => ({
        widthMm: (index + 1) * PRICE_STEP_MM,
        amountMinor: index === position ? amountMinor : 1_000,
      }));
      const detail = refusalDetail(parseWith(perSize(sizes)));

      expect(detail).toContain(`sizes[${String(position)}]`);
      expect(detail).toContain('"amountMinor"');
    },
  );
});

describe("an anchor amount that is not a safe integer is refused, naming anchorMinor (P1-f)", () => {
  it.each([
    ["a fraction", 1.5],
    ["NaN", Number.NaN],
    ["infinity", Number.POSITIVE_INFINITY],
    ["past the safe range", 2 ** 60],
    ["a numeric string", "1000"],
    ["null", null],
    ["absent", undefined],
  ])("refuses %s", (_name, anchorMinor) => {
    expect(
      refusalDetail(parseWith(anchored("anchored-width", { anchorMinor }))),
    ).toContain('"anchorMinor"');
  });

  propertyTest.prop([
    fc.oneof(
      fc.double({ noInteger: true, noNaN: true, noDefaultInfinity: true }),
      fc
        .integer({ min: Number.MAX_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER })
        .map((n) => n * 2),
      fc.constant(Number.NaN),
    ),
  ])("refuses any drawn value that is not a safe integer", (anchorMinor) => {
    expect(
      refusalDetail(parseWith(anchored("anchored-width", { anchorMinor }))),
    ).toContain('"anchorMinor"');
  });

  it("refuses an anchor past the magnitude every book is held to", () => {
    expect(
      refusalDetail(
        parseWith(
          anchored("anchored-width", {
            anchorMinor: MAX_PRICE_COEFFICIENT_MINOR + 1,
          }),
        ),
      ),
    ).toContain('"anchorMinor"');
  });
});

describe("an anchor dimension off the pricing step is refused, naming it (P1-f)", () => {
  propertyTest.prop([
    fc
      .integer({ min: 1, max: MAX_DESIGN_DIMENSION_MM })
      .filter((millimetres) => millimetres % PRICE_STEP_MM !== 0),
  ])(
    "refuses any drawn anchor width that is not a multiple of the step",
    (anchorWidthMm) => {
      expect(
        refusalDetail(parseWith(anchored("anchored-width", { anchorWidthMm }))),
      ).toContain('"anchorWidthMm"');
    },
  );

  it.each([0, -50, MAX_DESIGN_DIMENSION_MM + PRICE_STEP_MM, 600.5, Number.NaN])(
    "refuses an anchor width of %s",
    (anchorWidthMm) => {
      expect(
        refusalDetail(parseWith(anchored("anchored-width", { anchorWidthMm }))),
      ).toContain('"anchorWidthMm"');
    },
  );

  it("refuses an anchor width that is absent", () => {
    expect(
      refusalDetail(
        parseWith(anchored("anchored-width", { anchorWidthMm: undefined })),
      ),
    ).toContain('"anchorWidthMm"');
  });

  it.each([
    ["off the step", 725],
    ["zero", 0],
    ["absent", undefined],
  ])("refuses an anchor height that is %s", (_name, anchorHeightMm) => {
    expect(
      refusalDetail(
        parseWith(anchored("anchored-width-and-height", { anchorHeightMm })),
      ),
    ).toContain('"anchorHeightMm"');
  });
});

describe("a fixed-size list the search cannot rely on is refused, naming sizes (P1-f)", () => {
  const size = (widthMm: number) => ({ widthMm, amountMinor: 1_000 });

  it("refuses an empty list", () => {
    expect(refusalDetail(parseWith(perSize([])))).toContain('"sizes"');
  });

  it.each([
    ["absent", undefined],
    ["an object", { widthMm: 300 }],
    ["a string", "300"],
  ])("refuses a list that is %s", (_name, sizes) => {
    expect(refusalDetail(parseWith(perSize(sizes)))).toContain('"sizes"');
  });

  it("refuses an unsorted list, naming the entry that does not rise", () => {
    const detail = refusalDetail(parseWith(perSize([size(300), size(200)])));

    expect(detail).toContain("sizes[1]");
    expect(detail).toContain('"widthMm"');
  });

  it("refuses a list holding a width twice", () => {
    const detail = refusalDetail(
      parseWith(perSize([size(200), size(300), size(300)])),
    );

    expect(detail).toContain("sizes[2]");
  });

  propertyTest.prop([
    fc
      .uniqueArray(onStepWidthArbitrary, {
        minLength: 2,
        maxLength: MAX_SIZES,
      })
      .filter((widths) =>
        widths.some(
          (width, index) => index > 0 && width < (widths[index - 1] ?? 0),
        ),
      ),
  ])("refuses any drawn list that is not ascending", (widths) => {
    expect(
      refusalDetail(parseWith(perSize(widths.map((width) => size(width))))),
    ).toContain('"widthMm"');
  });

  it("refuses more sizes than a row may list", () => {
    const tooMany = Array.from({ length: MAX_SIZES + 1 }, (_, index) =>
      size((index + 1) * PRICE_STEP_MM),
    );

    expect(refusalDetail(parseWith(perSize(tooMany)))).toContain('"sizes"');
  });

  propertyTest.prop([
    fc
      .integer({ min: 1, max: MAX_DESIGN_DIMENSION_MM })
      .filter((millimetres) => millimetres % PRICE_STEP_MM !== 0),
  ])("refuses any listed width off the pricing step", (widthMm) => {
    expect(
      refusalDetail(parseWith(perSize([{ widthMm, amountMinor: 1 }]))),
    ).toContain('"widthMm"');
  });

  it.each([
    ["a fraction width", { widthMm: 250.5, amountMinor: 1 }, '"widthMm"'],
    ["an off-step width", { widthMm: 225, amountMinor: 1 }, '"widthMm"'],
    ["a zero width", { widthMm: 0, amountMinor: 1 }, '"widthMm"'],
    [
      "a width past a design's",
      { widthMm: MAX_DESIGN_DIMENSION_MM + 1, amountMinor: 1 },
      '"widthMm"',
    ],
    [
      "a fractional amount",
      { widthMm: 300, amountMinor: 0.5 },
      '"amountMinor"',
    ],
    ["no amount", { widthMm: 300 }, '"amountMinor"'],
    ["a negative amount", { widthMm: 300, amountMinor: -1 }, '"amountMinor"'],
    [
      "an amount past the bound",
      { widthMm: 300, amountMinor: MAX_PRICE_COEFFICIENT_MINOR + 1 },
      '"amountMinor"',
    ],
  ])("refuses an entry with %s", (_name, entry, field) => {
    expect(refusalDetail(parseWith(perSize([entry])))).toContain(field);
  });

  it("refuses an entry that is not an object", () => {
    expect(refusalDetail(parseWith(perSize([300])))).toContain("sizes[0]");
  });
});

describe("a shape carries exactly the fields it reads", () => {
  it.each([
    ["anchored-width", "perExtraDoorLeafMinor", 1],
    ["anchored-width", "perHeightStepMinor", 1],
    ["anchored-width", "anchorHeightMm", 700],
    ["anchored-width-and-door-leaves", "perHeightStepMinor", 1],
    ["anchored-width-and-height", "perExtraDoorLeafMinor", 1],
  ] as const)(
    "refuses %s declaring %s, which it does not read",
    (shape, field, value) => {
      expect(
        refusalDetail(parseWith(anchored(shape, { [field]: value }))),
      ).toContain(`"${field}"`);
    },
  );

  it.each([
    ["anchored-width-and-door-leaves", "perExtraDoorLeafMinor"],
    ["anchored-width-and-height", "perHeightStepMinor"],
    ["anchored-width-height-and-door-leaves", "perExtraDoorLeafMinor"],
  ] as const)("refuses %s with no %s, which it reads", (shape, field) => {
    expect(
      refusalDetail(parseWith(anchored(shape, { [field]: undefined }))),
    ).toContain(`"${field}"`);
  });
});

describe("any field a shape does not read is refused, on every shape", () => {
  const LEGACY_FIELDS = [
    "baseMinor",
    "perWidthMillimetreMinor",
    "perHeightMillimetreMinor",
    "perDoorLeafMinor",
  ] as const;

  it.each(
    ANCHORED_SHAPES.flatMap((shape) =>
      LEGACY_FIELDS.map((field) => [shape, field] as const),
    ),
  )("refuses %s carrying the legacy linear field %s", (shape, field) => {
    expect(refusalDetail(parseWith(anchored(shape, { [field]: 1 })))).toContain(
      `"${field}"`,
    );
  });

  it.each(ANCHORED_SHAPES)(
    "refuses %s carrying a field no shape reads",
    (shape) => {
      expect(
        refusalDetail(parseWith(anchored(shape, { perFridgeMinor: 1 }))),
      ).toContain('"perFridgeMinor"');
    },
  );

  it.each([
    "anchorMinor",
    "anchorWidthMm",
    "perStepWiderMinor",
    "perStepNarrowerMinor",
    "perExtraDoorLeafMinor",
    "perHeightStepMinor",
    "anchorHeightMm",
    ...LEGACY_FIELDS,
    "perFridgeMinor",
  ])("refuses price-per-size carrying %s", (field) => {
    const formula = {
      ...perSize([{ widthMm: 300, amountMinor: 1 }]),
      [field]: 1,
    };

    expect(refusalDetail(parseWith(formula))).toContain(`"${field}"`);
  });

  it.each(["perStepWiderMinor", "anchorMinor", "baseMinor", "perFridgeMinor"])(
    "refuses a listed size carrying %s beside its width and amount, naming sizes[i].%s",
    (field) => {
      const sizes = [
        { widthMm: 200, amountMinor: 1 },
        { widthMm: 300, amountMinor: 1, [field]: 9 },
      ];

      expect(refusalDetail(parseWith(perSize(sizes)))).toContain(
        `"sizes[1].${field}"`,
      );
    },
  );

  it("refuses a field the shape does not read when it is inherited, not own", () => {
    const inherited = Object.create({ baseMinor: 1 }) as Formula;
    Object.assign(inherited, anchored("anchored-width"));

    expect(refusalDetail(parseWith(inherited))).toContain('"baseMinor"');
  });

  it("treats a key holding undefined as absent, on both kinds of shape", () => {
    expect(
      parseWith(anchored("anchored-width", { baseMinor: undefined })).ok,
    ).toBe(true);
    expect(
      parseWith({
        ...perSize([{ widthMm: 300, amountMinor: 1 }]),
        anchorMinor: undefined,
      }).ok,
    ).toBe(true);
  });
});

describe("a book is read without running its own code", () => {
  it("refuses, and does not throw, for a sizes list whose length raises", () => {
    const raising = new Proxy([{ widthMm: 300, amountMinor: 1 }], {
      get(target, property, receiver) {
        if (property === "length") throw new Error("trap");
        return Reflect.get(target, property, receiver) as unknown;
      },
    });

    expect(refusalDetail(parseWith(perSize(raising)))).toContain('"sizes"');
  });

  it("refuses, and does not throw, for an anchor whose getter raises", () => {
    const formula = anchored("anchored-width");
    Object.defineProperty(formula, "anchorMinor", {
      enumerable: true,
      get() {
        throw new Error("trap");
      },
    });

    expect(refusalDetail(parseWith(formula))).toContain("anchorMinor");
  });
});

describe("a row the customer supplies is never charged, in any shape", () => {
  const CUSTOMER = { suppliedBy: "customer" };

  it("accepts an anchored rule of zeroes: its anchor width is where the price is quoted, not an amount charged", () => {
    const zeroes = anchored("anchored-width-height-and-door-leaves", {
      anchorMinor: 0,
      perStepWiderMinor: 0,
      perStepNarrowerMinor: 0,
      perExtraDoorLeafMinor: 0,
      perHeightStepMinor: 0,
    });

    expect(parseWith(zeroes, CUSTOMER).ok).toBe(true);
  });

  it.each([
    "anchorMinor",
    "perStepWiderMinor",
    "perStepNarrowerMinor",
    "perExtraDoorLeafMinor",
    "perHeightStepMinor",
  ])("refuses an anchored customer rule charging %s", (field) => {
    const zeroes = anchored("anchored-width-height-and-door-leaves", {
      anchorMinor: 0,
      perStepWiderMinor: 0,
      perStepNarrowerMinor: 0,
      perExtraDoorLeafMinor: 0,
      perHeightStepMinor: 0,
      [field]: 1,
    });

    expect(refusalDetail(parseWith(zeroes, CUSTOMER))).toContain(`"${field}"`);
  });

  it("refuses a fixed-size customer rule charging any listed size", () => {
    const charged = perSize([
      { widthMm: 200, amountMinor: 0 },
      { widthMm: 300, amountMinor: 1 },
    ]);

    expect(refusalDetail(parseWith(charged, CUSTOMER))).toContain(
      '"amountMinor"',
    );
  });

  it("accepts a fixed-size customer rule listing zero for every size", () => {
    expect(
      parseWith(perSize([{ widthMm: 700, amountMinor: 0 }]), CUSTOMER).ok,
    ).toBe(true);
  });
});
