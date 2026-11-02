// Adversarial QA of M10 wave P5 (ADR 0177 A-20) at the application's boundaries: the stored book's projection keeps the
// fourth rate (so a page's preview is priced with it), drops what a tier does not declare beside it, and every place in
// the application that names a hardware count or a rate names the lift where it names its neighbours.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { createTranslator } from "next-intl";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
  parsePriceBook,
  previewCabinet,
  priceDesign,
  SAMPLE_PRICE_BOOK,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { projectPriceBook } from "@/lib/server/project-price-book";

import roMessages from "../../../src/messages/ro.json";
import ruMessages from "../../../src/messages/ru.json";
import { MEASURED_DEEPENING_ROWS } from "../../support/deepening-rows";
import { NOTHING_DISABLED } from "../../support/availability";
import { cldrPluralCategories } from "../../support/icu-signature";
import { leafAt, type Catalogue } from "../../support/catalogues";

const HARDWARE_RATES = [
  "perHingeMinor",
  "perDrawerMinor",
  "perPushToOpenMinor",
  "perLiftMinor",
] as const;

function parsedOrThrow(declared: unknown): PriceBook {
  const result = parsePriceBook(declared);
  if (!result.ok) throw new Error(result.failure.detail);
  return result.book;
}

describe("the projection of a stored book keeps the lift rate", () => {
  const stored: unknown = JSON.parse(JSON.stringify(SAMPLE_PRICE_BOOK));

  it("hands the page every tier with the four rates it was stored with", () => {
    const projected = projectPriceBook(parsedOrThrow(stored));

    expect(projected.hardware.tiers).toEqual(SAMPLE_PRICE_BOOK.hardware.tiers);
    for (const tier of projected.hardware.tiers) {
      for (const rate of HARDWARE_RATES) {
        expect(typeof tier[rate], `${tier.tierId} ${rate}`).toBe("number");
      }
    }
  });

  it("prices a wall-lift kitchen on the projected book as on the stored one, the lift term included", () => {
    const projected = projectPriceBook(parsedOrThrow(stored));
    const standard = projected.hardware.tiers[0];
    const priceOn = (book: PriceBook) => {
      const result = priceDesign({
        design: {
          ...KITCHEN_L_DESIGN,
          settings: { cabinetDepthMm: 600 },
          placements: [
            {
              id: "lift",
              wall: "A",
              alongMm: 1_000,
              y0Mm: 1_500,
              body: { buildId: "wall-lift", widthMm: 600, heightMm: 700 },
            },
          ],
        },
        catalog: buildKitchenLBodyCatalog(600),
        book,
        pricingVersion: book.version,
        deepeningRows: MEASURED_DEEPENING_ROWS,
        availability: NOTHING_DISABLED,
      });
      if (!result.ok) throw new Error(result.failure.code);
      return result.priced.totalMinor;
    };

    expect(priceOn(projected)).toBe(priceOn(SAMPLE_PRICE_BOOK));
    expect(standard?.perLiftMinor).toBeGreaterThan(0);
  });

  it("draws the preview's hardware cell with the lift term on the projected book", () => {
    const projected = projectPriceBook(parsedOrThrow(stored));
    const withoutLift: PriceBook = {
      ...projected,
      hardware: {
        ...projected.hardware,
        tiers: projected.hardware.tiers.map((tier) => ({
          ...tier,
          perLiftMinor: 0,
        })),
      },
    };
    const cellOn = (book: PriceBook) => {
      const rule = book.cabinetRules.find(
        ({ buildId }) => buildId === "wall-lift",
      );
      if (rule === undefined) throw new Error("no wall-lift rule");
      const preview = previewCabinet({
        rule,
        catalog: buildKitchenLBodyCatalog(600),
        book,
        material: book.material.defaultTierId,
        depth: 600,
        deepeningRows: MEASURED_DEEPENING_ROWS,
        hardwareTier: book.hardware.defaultTierId,
      });
      if (!preview.ok) throw new Error(preview.code);
      return preview.rows.find(({ widthMm }) => widthMm === 600)?.hardwareMinor;
    };

    expect(cellOn(projected)).toBeGreaterThan(cellOn(withoutLift) ?? Infinity);
  });
});

describe("liftCount reads right across the count range, in both languages", () => {
  const CATALOGUES: readonly [string, Catalogue][] = [
    ["ro", roMessages],
    ["ru", ruMessages as Catalogue],
  ];
  const COUNT_SWEEP_UPPER_BOUND = 130;

  function render(
    locale: string,
    messages: Catalogue,
    key: string,
    count: number,
  ) {
    const translate = createTranslator({ locale, messages }) as unknown as (
      key: string,
      values: Record<string, number>,
    ) => string;
    return translate(key, { count });
  }

  it.each(CATALOGUES)(
    "%s: names one noun form per CLDR category, as the hinge count beside it does",
    (locale, messages) => {
      const categoryOf = (count: number) =>
        new Intl.PluralRules(locale).select(count);
      const formOf = (key: string, count: number) =>
        render(locale, messages, key, count).replace(String(count), "#");
      const formsByCategory = (key: string) =>
        new Map(
          Array.from({ length: COUNT_SWEEP_UPPER_BOUND + 1 }, (_, count) => [
            categoryOf(count),
            formOf(key, count),
          ]),
        );
      const lifts = formsByCategory("priceDashboard.cabinet.liftCount");
      const hinges = formsByCategory("priceDashboard.cabinet.hingeCount");

      expect([...lifts.keys()].sort()).toEqual([...hinges.keys()].sort());
      expect(new Set(lifts.values()).size).toBe(lifts.size);
    },
  );

  it.each(CATALOGUES)(
    "%s: says each count's own figure, never another's, over 0 to 130",
    (locale, messages) => {
      for (let count = 0; count <= COUNT_SWEEP_UPPER_BOUND; count += 1) {
        const sentence = render(
          locale,
          messages,
          "priceDashboard.cabinet.liftCount",
          count,
        );

        expect(sentence.startsWith(`${String(count)} `), sentence).toBe(true);
        expect(sentence).not.toMatch(/[{}]/u);
      }
    },
  );

  it.each(CATALOGUES)(
    "%s: has a branch for every plural category the language's integers reach",
    (locale, messages) => {
      const integerCategories = new Set(
        Array.from({ length: COUNT_SWEEP_UPPER_BOUND + 1 }, (_, count) =>
          new Intl.PluralRules(locale).select(count),
        ),
      );
      const leaf = leafAt(messages, "priceDashboard.cabinet.liftCount") ?? "";

      for (const category of integerCategories) {
        expect(leaf, `${locale} ${category}`).toContain(`${category} {`);
      }
      expect(cldrPluralCategories(locale as "ro" | "ru")).toEqual(
        expect.arrayContaining([...integerCategories]),
      );
    },
  );
});

function sourceFilesUnder(directory: string): readonly string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFilesUnder(path);
    return /\.(ts|tsx)$/u.test(path) && !path.endsWith(".d.json.ts")
      ? [path]
      : [];
  });
}

describe("every source that names a hardware count or rate names the lift beside it", () => {
  const WEB_SOURCES = sourceFilesUnder(
    join(import.meta.dirname, "../../../src"),
  );
  const DOMAIN_SOURCES = sourceFilesUnder(
    join(
      import.meta.dirname,
      "../../../../../packages/configurator-domain/src",
    ),
  );
  const ALL_SOURCES = [...WEB_SOURCES, ...DOMAIN_SOURCES].map((path) => ({
    path,
    text: readFileSync(path, "utf8"),
  }));

  /** The staged sample draft edits one drawer rate and one hinge rate as an example change: not an enumeration of rates. */
  const NAMES_ONE_FIELD_BY_DESIGN = ["price-dashboard/publish-sample.ts"];

  const NEIGHBOUR_AND_LIFT: readonly (readonly [RegExp, string])[] = [
    [/perPushToOpenMinor/u, "perLiftMinor"],
    [/perDrawerMinor/u, "perLiftMinor"],
    [
      /priceDashboard\.cabinet\.hingeCount/u,
      "priceDashboard.cabinet.liftCount",
    ],
    [
      /priceDashboard\.cabinet\.slidePairCount/u,
      "priceDashboard.cabinet.liftCount",
    ],
    [/\.pushToOpen\b/u, "lifts"],
  ];

  it.each(NEIGHBOUR_AND_LIFT)(
    "%s is never named in a file that does not also name %s",
    (neighbour, lift) => {
      const withoutLift = ALL_SOURCES.filter(
        ({ path, text }) =>
          neighbour.test(text) &&
          !text.includes(lift) &&
          !NAMES_ONE_FIELD_BY_DESIGN.some((site) => path.endsWith(site)),
      ).map(({ path }) => path);

      expect(withoutLift).toEqual([]);
    },
  );

  it("reads the lift count in the cabinet page's hardware readout itself, not merely somewhere", () => {
    const readout = ALL_SOURCES.find(({ path }) =>
      path.endsWith("price-dashboard/cabinet-hardware-readout.tsx"),
    );

    expect(readout?.text).toContain("priceDashboard.cabinet.liftCount");
  });

  it("reaches the sites it is meant to: the sweep is not empty", () => {
    const naming = ALL_SOURCES.filter(({ text }) =>
      text.includes("perPushToOpenMinor"),
    );

    expect(naming.length).toBeGreaterThanOrEqual(6);
  });
});
