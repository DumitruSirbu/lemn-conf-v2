// Adversarial QA for M10 Q1c (owner ruling 2026-10-28): a priced LINE is shown to the ten lei, a TOTAL to the thousand.
//
// The oracles here are written for this file and share nothing with `starting-price.ts`, `rawLineAmountOf` or
// `printedAmountOf`, which the wave rewrote beside the code they pin: the expected side is BigInt arithmetic, and each
// printed row is also read back (spaces stripped, times a hundred) and compared with the priced amount, so "the row
// shows what was priced" is asserted as an equality and not only as agreement with a second formatter.
import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  generateKitchen,
  MAX_DEEP_CABINET_PERCENT,
  type CabinetPriceLine,
  type PriceLine,
  type PricedDesign,
} from "@lemnaria/configurator-domain";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { Content } from "@/i18n/content";
import {
  describeBreakdownRows,
  describePriceBreakdown,
  listWholeKitchenRows,
} from "@/price/price-breakdown-model";
import { describeLineAmount } from "@/price/starting-price";
import { describeReview, type AvailableReview } from "@/review/review-model";

import { CATALOGUES, contentFor } from "../support/catalogues";
import {
  builtDeep,
  pricedKitchenAtPercent,
  pricedOf,
  required,
} from "../support/deep-priced-kitchens";
import { createFakeProbeFactory } from "../support/fake-body-probe";
import { filesUnder } from "../support/files-under";
import type { PricedKitchen } from "../support/generated-kitchens";
import { ro } from "../support/romanian-content";
import { codeWithoutComments } from "../support/source-import-closure";
import { TIER_PAIRS, VARIED_ARMS, withTiers } from "../support/varied-kitchens";

const PROPERTY_SEED = 8_102_810;
const GENERATED_AT = "2026-10-28T09:00:00.000Z";
const SAMPLED_ROOMS_PER_ARM = 24;
const BANI_PER_LEU = 100;
const BANI_PER_TEN_LEI = 1_000;
const SOURCE_ROOT = resolve(import.meta.dirname, "../../src");

const CONTENTS: readonly Content[] = CATALOGUES.map(([locale, messages]) =>
  contentFor(locale, messages),
);

// ---------------------------------------------------------------------------------------------------------------
// The oracles

function grouped(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** The amount up to the next ten lei, in lei, grouped by three with a plain space. */
function toTenLei(bani: number): string {
  const tensOfLei = (BigInt(bani) + 999n) / 1_000n;
  return grouped(String(tensOfLei * 10n));
}

/** The amount up to the next thousand lei, in lei, grouped by three with a plain space. */
function toThousandLei(bani: number): string {
  const thousandsOfLei = (BigInt(bani) + 99_999n) / 100_000n;
  return grouped(String(thousandsOfLei * 1000n));
}

/** What a shown figure says, read back as bani. */
function baniOf(text: string): number {
  return Number(text.replaceAll(" ", "")) * BANI_PER_LEU;
}

const NON_BREAKING_SPACES = new RegExp("[\\u00a0\\u202f]", "u");

const AN_INTEGER_IN_GROUPS = /^(0|[1-9]\d{0,2}( \d{3})*)$/;

function expectedRowText(line: PriceLine, content: Content): string {
  if (line.kind === "cabinet" && line.suppliedBy === "customer") {
    return content.priceBreakdown.notIncluded;
  }
  if (line.amountMinor === 0) return content.priceBreakdown.included;
  return toTenLei(line.amountMinor);
}

function keyOf(line: PriceLine): string {
  return line.kind === "cabinet" ? line.placementId : line.lineId;
}

// ---------------------------------------------------------------------------------------------------------------
// describeLineAmount, alone

describe("describeLineAmount: literal pins", () => {
  it.each([
    [0, "0"],
    [1, "10"],
    [999, "10"],
    [1_000, "10"],
    [1_001, "20"],
    [1_999, "20"],
    [2_000, "20"],
    [100_000, "1 000"],
    [100_001, "1 010"],
    [173_000, "1 730"],
    [951_000, "9 510"],
    [9_999_000, "99 990"],
    [9_999_001, "100 000"],
    [10_000_000, "100 000"],
    [10_000_001, "100 010"],
  ])("%i bani is shown as %s", (bani, shown) => {
    expect(describeLineAmount(bani)).toBe(shown);
  });

  it("never reads a thousand-lei step into a ten-lei line (1 730 stays 1 730, not 2 000)", () => {
    expect(describeLineAmount(173_000)).not.toBe("2 000");
    expect(describeLineAmount(173_000)).not.toBe("1 000");
  });

  it("does not print a negative zero", () => {
    expect(describeLineAmount(-0)).toBe("0");
  });

  it("writes the space between groups as U+0020, never a non-breaking one", () => {
    expect(describeLineAmount(123_457_000)).toBe("1 234 570");
    expect(describeLineAmount(123_457_000)).not.toMatch(NON_BREAKING_SPACES);
  });
});

describe("describeLineAmount: refusals", () => {
  it.each([
    -1,
    -1_000,
    -0.5,
    0.5,
    1.5,
    999.999,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    2 ** 53,
    1e21,
    Number.MIN_SAFE_INTEGER,
  ])("throws a RangeError for %s", (refused) => {
    expect(() => describeLineAmount(refused)).toThrow(RangeError);
  });
});

describe("describeLineAmount: swept over every safe integer shape", () => {
  const anyAmount = fc.oneof(
    { arbitrary: fc.integer({ min: 0, max: 5_000 }), weight: 3 },
    { arbitrary: fc.maxSafeNat(), weight: 3 },
    {
      arbitrary: fc.integer({
        min: Number.MAX_SAFE_INTEGER - 5_000,
        max: Number.MAX_SAFE_INTEGER,
      }),
      weight: 2,
    },
    {
      arbitrary: fc
        .tuple(fc.integer({ min: 0, max: 9_000_000_000_000 }), fc.nat(2))
        .map(([tens, offset]) => tens * BANI_PER_TEN_LEI + offset - 1)
        .filter((bani) => bani >= 0),
      weight: 3,
    },
  );

  propertyTest.prop([anyAmount], { numRuns: 2_000, seed: PROPERTY_SEED })(
    "is the BigInt round-up to ten lei, never below the amount, never ten lei above it, exact on a multiple",
    (bani) => {
      const shown = describeLineAmount(bani);
      const shownBani = baniOf(shown);

      expect(shown).toBe(toTenLei(bani));
      expect(shown).toMatch(AN_INTEGER_IN_GROUPS);
      expect(shownBani).toBeGreaterThanOrEqual(bani);
      expect(shownBani - bani).toBeLessThan(BANI_PER_TEN_LEI);
      expect(shownBani % BANI_PER_TEN_LEI).toBe(0);
      if (bani % BANI_PER_TEN_LEI === 0) expect(shownBani).toBe(bani);
    },
  );

  propertyTest.prop([anyAmount, anyAmount], {
    numRuns: 1_000,
    seed: PROPERTY_SEED,
  })("never makes a dearer line read cheaper", (first, second) => {
    const [smaller, larger] =
      first <= second ? [first, second] : [second, first];

    expect(baniOf(describeLineAmount(smaller))).toBeLessThanOrEqual(
      baniOf(describeLineAmount(larger)),
    );
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The sweep: every printed row of a generated kitchen is its priced amount; every printed total is the thousand

const PERCENTS = [0, 1, 12, 50, MAX_DEEP_CABINET_PERCENT] as const;

function kitchensOfArm(armIndex: number): PricedKitchen[] {
  const arm = required(VARIED_ARMS[armIndex], "an arm");
  const rooms = [
    ...arm.boundaryRooms,
    ...fc.sample(arm.sampledRooms, {
      numRuns: SAMPLED_ROOMS_PER_ARM,
      seed: PROPERTY_SEED,
    }),
  ];
  return rooms.flatMap((room, index) => {
    const generated = generateKitchen({
      room,
      occurredAt: GENERATED_AT,
      probeAt: createFakeProbeFactory(),
    });
    if (!generated.ok) return [];
    const tiers = required(TIER_PAIRS[index % TIER_PAIRS.length], "tiers");
    const sized =
      index % 2 === 0 ? builtDeep(generated.design) : generated.design;
    const kitchen = pricedKitchenAtPercent(
      withTiers(sized, tiers),
      required(PERCENTS[index % PERCENTS.length], "a percent"),
    );
    return kitchen.pricing.ok ? [kitchen] : [];
  });
}

function availableReviewOf(
  kitchen: PricedKitchen,
  content: Content,
): AvailableReview {
  const view = describeReview({
    content,
    design: kitchen.design,
    pricing: kitchen.pricing,
    groups: kitchen.groups,
  });
  if (view.kind !== "available") throw new Error("expected a review");
  return view;
}

interface PrintedRow {
  readonly key: string;
  readonly amountText: string;
}

/** Every row a surface lists: the body rows of every group, then the whole-kitchen rows with the depth line among them. */
function rowsOf(
  groups: readonly { readonly rows: readonly PrintedRow[] }[],
  wholeKitchen: readonly PrintedRow[],
): ReadonlyMap<string, string> {
  return new Map(
    [...groups.flatMap((group) => group.rows), ...wholeKitchen].map((row) => [
      row.key,
      row.amountText,
    ]),
  );
}

const tally = {
  rows: 0,
  positive: 0,
  differsFromThousand: 0,
  customer: 0,
  zero: 0,
};

function expectSurfaceRowsToBePriced(
  surface: string,
  printed: ReadonlyMap<string, string>,
  priced: PricedDesign,
  content: Content,
): void {
  expect(printed.size, surface).toBe(priced.lines.length);
  for (const line of priced.lines) {
    const text = printed.get(keyOf(line));
    const expected = expectedRowText(line, content);

    expect(text, `${surface} ${keyOf(line)}`).toBe(expected);
    tally.rows += 1;
    if (line.kind === "cabinet" && line.suppliedBy === "customer") {
      tally.customer += 1;
      continue;
    }
    if (line.amountMinor === 0) {
      tally.zero += 1;
      continue;
    }
    tally.positive += 1;
    // The domain prices every line to the ten lei, so what is shown is the amount: an equality, not an inequality.
    expect(line.amountMinor % BANI_PER_TEN_LEI, keyOf(line)).toBe(0);
    expect(baniOf(text ?? ""), `${surface} ${keyOf(line)}`).toBe(
      line.amountMinor,
    );
    if (text !== toThousandLei(line.amountMinor))
      tally.differsFromThousand += 1;
  }
}

function expectFigureToBeTheThousand(
  surface: string,
  figure: { readonly label: string; readonly amountText: string },
  priced: PricedDesign,
  content: Content,
): void {
  const thousand = toThousandLei(priced.totalMinor);

  expect(figure.amountText, surface).toBe(
    content.price.amountWithCurrency(thousand),
  );
  expect(figure.amountText.endsWith(" MDL"), surface).toBe(true);
  expect(figure.label, surface).toBe(content.price.startingPrefix);
  const shownBani = baniOf(thousand);
  expect(shownBani, surface).toBeGreaterThanOrEqual(priced.totalMinor);
  expect(shownBani - priced.totalMinor, surface).toBeLessThan(
    BANI_PER_LEU * 1000,
  );
  expect(shownBani % (BANI_PER_LEU * 1000), surface).toBe(0);
}

describe.each(VARIED_ARMS.map((arm, index) => [arm.name, index] as const))(
  "over the generated %s rooms, flat and 700 mm, across every tier pair and depth percent",
  (_name, armIndex) => {
    const kitchens = kitchensOfArm(armIndex);

    it("composed kitchens to sweep", () => {
      expect(kitchens.length).toBeGreaterThanOrEqual(8);
    });

    it("prints every breakdown and review row at its priced amount, and each figure at the thousand", () => {
      for (const kitchen of kitchens) {
        const priced = pricedOf(kitchen);
        expect(
          priced.lines.reduce((sum, line) => sum + line.amountMinor, 0),
        ).toBe(priced.totalMinor);

        for (const content of CONTENTS) {
          const breakdown = describePriceBreakdown({
            content,
            pricing: kitchen.pricing,
            groups: kitchen.groups,
          });
          if (breakdown.kind !== "available") throw new Error("breakdown");
          const review = availableReviewOf(kitchen, content);

          expectSurfaceRowsToBePriced(
            "breakdown",
            rowsOf(breakdown.groups, breakdown.wholeKitchenListing),
            priced,
            content,
          );
          expectSurfaceRowsToBePriced(
            "review",
            rowsOf(review.groups, listWholeKitchenRows(review)),
            priced,
            content,
          );
          expectFigureToBeTheThousand(
            "breakdown figure",
            breakdown.figure,
            priced,
            content,
          );
          expectFigureToBeTheThousand(
            "review figure",
            review.figure,
            priced,
            content,
          );
        }
      }
    });
  },
);

describe("the sweep was not vacuous", () => {
  it("met positive rows that differ from their thousand rounding, free rows and the customer's own bodies", () => {
    expect(tally.rows).toBeGreaterThan(1_000);
    expect(tally.positive).toBeGreaterThan(500);
    expect(tally.differsFromThousand).toBeGreaterThan(300);
    expect(tally.zero).toBeGreaterThan(0);
    expect(tally.customer).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Stored lines that are not a multiple of ten lei (a snapshot stored by another build), and the zero/customer rules

function leftKitchen(): PricedKitchen {
  const arm = required(VARIED_ARMS[1], "the L arm");
  const [first] = kitchensOfArm(VARIED_ARMS.indexOf(arm)).filter(
    (kitchen) =>
      pricedOf(kitchen).lines.some((line) => line.kind === "depth") &&
      pricedOf(kitchen).lines.filter((line) => line.kind === "cabinet")
        .length >= 4,
  );
  return required(first, "a deep L kitchen");
}

const STORED = leftKitchen();
const STORED_PRICED = pricedOf(STORED);
const CABINET_INDEXES = STORED_PRICED.lines.flatMap((line, index) =>
  line.kind === "cabinet" ? [index] : [],
);

function storedWith(
  amounts: readonly number[],
  totalMinor: number,
  customerAt: ReadonlySet<number> = new Set(),
): PricedDesign {
  return {
    ...STORED_PRICED,
    totalMinor,
    lines: STORED_PRICED.lines.map((line, index): PriceLine => {
      const amountMinor = required(
        amounts[index % amounts.length],
        "an amount",
      );
      if (line.kind === "cabinet") {
        const suppliedBy = customerAt.has(index) ? "customer" : "manufacturer";
        return { ...line, amountMinor, suppliedBy };
      }
      return { ...line, amountMinor };
    }),
  };
}

function printedFor(
  priced: PricedDesign,
  content: Content,
): { rows: ReadonlyMap<string, string>; figureText: string } {
  const rows = describeBreakdownRows({
    content,
    priced,
    groups: STORED.groups,
  });
  const review = describeReview({
    content,
    design: STORED.design,
    pricing: { ok: true, priced },
    groups: STORED.groups,
  });
  if (review.kind !== "available") throw new Error("expected a review");
  const fromBreakdown = rowsOf(
    rows.groups,
    listWholeKitchenRows({
      wholeKitchenRows: rows.wholeKitchenRows,
      ...rows.depth,
    }),
  );
  const fromReview = rowsOf(review.groups, listWholeKitchenRows(review));
  expect([...fromReview]).toEqual([...fromBreakdown]);
  return { rows: fromBreakdown, figureText: review.figure.amountText };
}

describe("a stored line that is not a multiple of ten lei", () => {
  const storedAmount = fc.oneof(
    { arbitrary: fc.constant(0), weight: 1 },
    { arbitrary: fc.integer({ min: 1, max: 2_500 }), weight: 4 },
    { arbitrary: fc.integer({ min: 0, max: 50_000_000 }), weight: 2 },
  );

  propertyTest.prop(
    [
      fc.array(storedAmount, { minLength: 1, maxLength: 40 }),
      fc.integer({ min: 0, max: 900_000_000 }),
      // A kitchen whose every body the customer supplies has no review to print (the domain's own predicate).
      fc
        .subarray(CABINET_INDEXES)
        .filter((indexes) => indexes.length < CABINET_INDEXES.length),
    ],
    { numRuns: 300, seed: PROPERTY_SEED },
  )(
    "rounds UP to the next ten lei on every surface, never shows bani, and leaves the stored total to the thousand",
    (amounts, totalMinor, customerIndexes) => {
      const priced = storedWith(amounts, totalMinor, new Set(customerIndexes));

      for (const content of CONTENTS) {
        const { rows, figureText } = printedFor(priced, content);

        for (const line of priced.lines) {
          const text = required(rows.get(keyOf(line)), "a printed row");
          expect(text).toBe(expectedRowText(line, content));
          if (
            line.amountMinor === 0 ||
            text === content.priceBreakdown.notIncluded
          )
            continue;
          expect(text).toMatch(AN_INTEGER_IN_GROUPS);
          expect(baniOf(text)).toBeGreaterThanOrEqual(line.amountMinor);
          expect(baniOf(text) - line.amountMinor).toBeLessThan(
            BANI_PER_TEN_LEI,
          );
        }
        expect(figureText).toBe(
          content.price.amountWithCurrency(toThousandLei(totalMinor)),
        );
      }
    },
  );

  it("shows one ban as ten lei, not as free and not as a thousand", () => {
    const priced = storedWith([1], 1);
    const { rows, figureText } = printedFor(priced, ro);

    for (const line of priced.lines) {
      if (line.kind === "cabinet") expect(rows.get(keyOf(line))).toBe("10");
    }
    expect([...rows.values()]).not.toContain(ro.priceBreakdown.included);
    expect(figureText).toBe("1 000 MDL");
  });

  it("shows 999 bani as ten and 1 001 bani as twenty", () => {
    expect(
      [...printedFor(storedWith([999], 999), ro).rows.values()].every(
        (text) => text === "10",
      ),
    ).toBe(true);
    expect(
      [...printedFor(storedWith([1_001], 1_001), ro).rows.values()].every(
        (text) => text === "20",
      ),
    ).toBe(true);
  });

  it("does not take the figure from the rows: the stored total is the total, whatever the lines add to", () => {
    const priced = storedWith([123_456], 7_777_777);

    expect(printedFor(priced, ro).figureText).toBe("78 000 MDL");
  });

  it.each([-1_000, -1, 0.5, 1_000.25, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses a stored line of %s bani with a RangeError rather than printing it",
    (refused) => {
      const priced = storedWith([refused], 0);

      expect(() =>
        describeBreakdownRows({ content: ro, priced, groups: STORED.groups }),
      ).toThrow(RangeError);
    },
  );
});

describe("a free line and a line the customer supplies", () => {
  it("reads inclus at exactly zero on every kind of line, and never on one ban", () => {
    const free = printedFor(storedWith([0], 0), ro).rows;
    const nearlyFree = printedFor(storedWith([1], 1), ro).rows;

    expect(
      [...free.values()].every((text) => text === ro.priceBreakdown.included),
    ).toBe(true);
    expect([...nearlyFree.values()]).not.toContain(ro.priceBreakdown.included);
  });

  it.each([0, 1, 1_000, 480_000])(
    "reads nu este inclus for a customer-supplied body priced at %i bani, keyed on who supplies it and not on the amount",
    (amountMinor) => {
      const customerAt = new Set(CABINET_INDEXES.slice(0, 2));
      const priced = storedWith([amountMinor], amountMinor, customerAt);
      const { rows } = printedFor(priced, ro);

      for (const index of CABINET_INDEXES) {
        const line = required(
          priced.lines[index],
          "a line",
        ) as CabinetPriceLine;
        const text = rows.get(line.placementId);

        expect(text).toBe(
          customerAt.has(index)
            ? ro.priceBreakdown.notIncluded
            : expectedRowText(line, ro),
        );
      }
    },
  );

  it("words the two kinds of nothing differently", () => {
    expect(ro.priceBreakdown.included).not.toBe(ro.priceBreakdown.notIncluded);
    expect(ro.priceBreakdown.notIncluded).toBe("nu este inclus");
    expect(ro.priceBreakdown.included).toBe("inclus");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The source: which module may round what, and which surfaces print a row

const SOURCE_FILES = filesUnder(SOURCE_ROOT).filter(
  (path) => !path.includes("/messages/"),
);

const CODE = new Map(
  SOURCE_FILES.map((path) => [
    relative(SOURCE_ROOT, path),
    codeWithoutComments(path, readFileSync(path, "utf8")),
  ]),
);

function sorted(paths: readonly string[]): string[] {
  return [...paths].sort();
}

function filesCalling(name: string): string[] {
  return [...CODE]
    .filter(([, code]) => new RegExp(`\\b${name}\\s*\\(`).test(code))
    .map(([path]) => path)
    .sort();
}

function filesMatching(pattern: RegExp): string[] {
  return [...CODE]
    .filter(([, code]) => pattern.test(code))
    .map(([path]) => path)
    .sort();
}

const THE_FORMATTER = "price/starting-price.ts";
const THE_BREAKDOWN_MODEL = "price/price-breakdown-model.ts";

describe("which module rounds what", () => {
  it("lets only the breakdown model call the line formatter, and nothing but the formatter call the total's rule", () => {
    expect(filesCalling("describeLineAmount")).toEqual(
      sorted([THE_BREAKDOWN_MODEL, THE_FORMATTER]),
    );
    expect(filesCalling("roundUpToThousandMdl")).toEqual([THE_FORMATTER]);
    expect(filesCalling("describeRoundedAmount")).toEqual([THE_FORMATTER]);
  });

  it("lets only the settings model print a tier delta, through the total's rule", () => {
    expect(filesCalling("describeAddedAmount")).toEqual(
      sorted(["settings/global-settings-model.ts", THE_FORMATTER]),
    );
  });

  it("builds every figure through describeStartingPrice, from the known callers", () => {
    expect(filesCalling("describeStartingPrice")).toEqual(
      sorted([
        "account/kitchens/kitchen-summary.ts",
        "panel/panel-model.ts",
        THE_BREAKDOWN_MODEL,
        "price/price-bar-model.ts",
        "review/review-model.ts",
        "settings/global-settings-model.ts",
        THE_FORMATTER,
      ]),
    );
  });

  it("keeps the breakdown model to one line call and one figure call, and never to the thousand rule for a row", () => {
    const code = CODE.get(THE_BREAKDOWN_MODEL) ?? "";

    expect(code.match(/\bdescribeLineAmount\s*\(/g)).toHaveLength(1);
    expect(code.match(/\bdescribeStartingPrice\s*\(/g)).toHaveLength(1);
    expect(code).not.toMatch(/describeRoundedAmount|roundUpToThousandMdl/);
  });

  it("formats a number by no other means in the application: no NumberFormat, toLocaleString, toFixed or regex grouping", () => {
    const formatsANumber =
      /NumberFormat|toLocaleString|\.toFixed\s*\(|\\B\(\?=|\(\?=\(\\d\{3\}\)/;

    expect(
      filesMatching(formatsANumber).filter(
        (path) => !path.startsWith("price-dashboard/"),
      ),
    ).toEqual([]);
  });

  it("holds every module that prints an amountText to the known list, so a new surface must be pinned here", () => {
    expect(filesMatching(/\bamountText\b/)).toEqual(
      sorted([
        "account/kitchens/kitchen-card.tsx",
        "app/d/[id]/review/review-screen.tsx",
        "contact/contact-design-card.tsx",
        "lib/server/mail/lead-notification.ts",
        "panel/editor-panel.tsx",
        THE_BREAKDOWN_MODEL,
        "price/price-bar.tsx",
        "price/price-breakdown.tsx",
        "review/review-groups.tsx",
        "settings/global-settings.tsx",
        "staff/staff-kitchen-view.tsx",
        THE_FORMATTER,
      ]),
    );
  });

  it("lists rows only from the breakdown and the review", () => {
    expect(
      filesMatching(
        /\b(describeBreakdownRows|listWholeKitchenRows|describePriceBreakdown|describeReview|describeDepthLine)\b/,
      ),
    ).toEqual(
      sorted([
        "app/d/[id]/review/review-screen.tsx",
        "lib/server/mail/lead-notification.ts",
        THE_BREAKDOWN_MODEL,
        "price/price-breakdown.tsx",
        "review/review-model.ts",
        "review/use-review.ts",
      ]),
    );
  });

  it("gives the staff kitchen, the account card and the share view no row: they import neither row model nor row component", () => {
    const rowSources =
      /price-breakdown-model|price\/price-breakdown"|review\/review-model|review-groups|review\/use-review/;
    const quiet = [...CODE.keys()].filter(
      (path) =>
        /^(staff|account|share)\//.test(path) || path.startsWith("app/s/"),
    );

    expect(quiet.length).toBeGreaterThan(20);
    for (const path of quiet)
      expect(CODE.get(path), path).not.toMatch(rowSources);
  });

  it("prints a row only through a model's amountText: the row components hold no arithmetic of their own", () => {
    for (const path of [
      "price/price-breakdown.tsx",
      "review/review-groups.tsx",
    ]) {
      const code = CODE.get(path) ?? "";

      expect(code, path).not.toMatch(/Math\.|amountMinor|toString\(|String\(/);
    }
  });
});
