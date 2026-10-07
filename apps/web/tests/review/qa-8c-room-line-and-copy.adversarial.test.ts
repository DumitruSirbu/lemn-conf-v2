// What the review says in words: the room line with its body count, the estimate's label and notices, the
// not-included slot, and the leaves this screen added to both catalogues.
//
// The expected sentences are written out here in full, or filled from the JSON files by `raw-catalogue-text.ts`;
// none is read back from the content resolver the review itself calls.
import type { Design } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import type { ReviewRoomLine } from "@/i18n/content";
import { describeReview, type AvailableReview } from "@/review/review-model";

import {
  CATALOGUES,
  catalogueLeaves,
  contentFor,
  type CatalogueLocale,
} from "../support/catalogues";
import {
  priceAndProject,
  type PricedKitchen,
} from "../support/generated-kitchens";
import { fillLeaf, type RawCatalogue } from "../support/raw-catalogue-text";
import {
  OVERFLOW_MAKERS,
  VARIED_ARMS,
  VARIED_L_ARM,
  variedKitchensOf,
} from "../support/varied-kitchens";

const RAW_CATALOGUES: readonly RawCatalogue[] = CATALOGUES.map(
  ([locale, messages]) => ({ locale, messages }),
);

function catalogueOf(locale: CatalogueLocale): RawCatalogue {
  const catalogue = RAW_CATALOGUES.find(
    (candidate) => candidate.locale === locale,
  );
  if (catalogue === undefined) throw new Error(`no ${locale} catalogue`);
  return catalogue;
}

function reviewIn(
  catalogue: RawCatalogue,
  kitchen: PricedKitchen,
): AvailableReview {
  const view = describeReview({
    content: contentFor(catalogue.locale, catalogue.messages),
    design: kitchen.design,
    pricing: kitchen.pricing,
    groups: kitchen.groups,
  });
  if (view.kind !== "available") throw new Error("expected a review");
  return view;
}

/* eslint-disable no-restricted-syntax -- the sentences are the subject: written out whole so that no resolver supplies the expected side. */
const BODY_COUNT_WORDS: Readonly<
  Record<CatalogueLocale, readonly (readonly [number, string])[]>
> = {
  ro: [
    [1, "1 corp"],
    [2, "2 corpuri"],
    [19, "19 corpuri"],
    [20, "20 corpuri"],
    [21, "21 corpuri"],
    [101, "101 corpuri"],
    [119, "119 corpuri"],
    [120, "120 corpuri"],
  ],
  ru: [
    [1, "1 шкаф"],
    [2, "2 шкафа"],
    [4, "4 шкафа"],
    [5, "5 шкафов"],
    [11, "11 шкафов"],
    [12, "12 шкафов"],
    [14, "14 шкафов"],
    [21, "21 шкаф"],
    [22, "22 шкафа"],
    [25, "25 шкафов"],
    [111, "111 шкафов"],
    [112, "112 шкафов"],
  ],
};

const WHOLE_LINES: Readonly<
  Record<CatalogueLocale, readonly (readonly [ReviewRoomLine, string])[]>
> = {
  ro: [
    [
      { shape: "linear", wallAMm: 3600, bodyCount: 1 },
      "Liniară · 3600 mm · 1 corp",
    ],
    [
      {
        shape: "L",
        wallAMm: 3600,
        wallBMm: 2400,
        corner: "left",
        bodyCount: 14,
      },
      "În L · 3600 × 2400 mm · cot la stânga · 14 corpuri",
    ],
    [
      {
        shape: "L",
        wallAMm: 900,
        wallBMm: 6000,
        corner: "right",
        bodyCount: 2,
      },
      "În L · 900 × 6000 mm · cot la dreapta · 2 corpuri",
    ],
    [
      {
        shape: "U",
        wallAMm: 4480,
        wallBMm: 2950,
        wallCMm: 3130,
        bodyCount: 21,
      },
      "În U · 4480 × 2950 × 3130 mm · 21 corpuri",
    ],
  ],
  ru: [
    [
      { shape: "linear", wallAMm: 3600, bodyCount: 1 },
      "Линейная · 3600 мм · 1 шкаф",
    ],
    [
      {
        shape: "L",
        wallAMm: 3600,
        wallBMm: 2400,
        corner: "left",
        bodyCount: 14,
      },
      "Г-образная · 3600 × 2400 мм · угол слева · 14 шкафов",
    ],
    [
      {
        shape: "L",
        wallAMm: 900,
        wallBMm: 6000,
        corner: "right",
        bodyCount: 2,
      },
      "Г-образная · 900 × 6000 мм · угол справа · 2 шкафа",
    ],
    [
      {
        shape: "U",
        wallAMm: 4480,
        wallBMm: 2950,
        wallCMm: 3130,
        bodyCount: 21,
      },
      "П-образная · 4480 × 2950 × 3130 мм · 21 шкаф",
    ],
  ],
};

/* eslint-enable no-restricted-syntax */

describe.each(CATALOGUES)("the room line in %s", (locale, messages) => {
  const content = contentFor(locale, messages);

  it.each(BODY_COUNT_WORDS[locale])(
    "counts %i bodies as %s",
    (bodyCount, words) => {
      const line = content.reviewRoomLine({
        shape: "linear",
        wallAMm: 3600,
        bodyCount,
      });

      expect(line.split(" · ").at(-1)).toBe(words);
    },
  );

  it.each(WHOLE_LINES[locale])("reads, for %o, %s", (roomLine, sentence) => {
    expect(content.reviewRoomLine(roomLine)).toBe(sentence);
  });
});

/** The line as the catalogue files spell it for this design, the count taken from the design's own bodies. */
function rawRoomLineOf(catalogue: RawCatalogue, design: Design): string {
  const { room } = design;
  const bodies = fillLeaf(catalogue, "review.bodyCount", {
    bodyCount: design.placements.length,
  });
  const shape = fillLeaf(catalogue, `room.shapes.${room.shape}.short`);
  if (room.shape === "linear") {
    return fillLeaf(catalogue, "review.roomLine.linear", {
      shape,
      wallA: room.widthMm,
      bodies,
    });
  }
  if (room.shape === "L") {
    return fillLeaf(catalogue, "review.roomLine.L", {
      shape,
      wallA: room.widthMm,
      wallB: room.depthMm,
      corner: fillLeaf(
        catalogue,
        room.cornerDirection === "right"
          ? "review.roomLine.cornerRight"
          : "review.roomLine.cornerLeft",
      ),
      bodies,
    });
  }
  return fillLeaf(catalogue, "review.roomLine.U", {
    shape,
    wallA: room.widthMm,
    wallB: room.depthMm,
    wallC: room.wallCMm ?? Number.NaN,
    bodies,
  });
}

function numbersIn(text: string): readonly number[] {
  return [...text.matchAll(/\d+/g)].map((match) => Number(match[0]));
}

describe.each(VARIED_ARMS)(
  "the room line over varied $name kitchens",
  (arm) => {
    const fitting = variedKitchensOf(arm);
    const shortened = fitting.flatMap((kitchen) => {
      const made = OVERFLOW_MAKERS[0]?.make(kitchen);
      return made === undefined ? [] : [priceAndProject(made.design)];
    });
    const kitchens = [...fitting, ...shortened];

    it.each(RAW_CATALOGUES)(
      "is, in $locale, the catalogue's sentence for the room as it stands and the bodies the design holds",
      (catalogue) => {
        expect(kitchens.length).toBeGreaterThanOrEqual(160);
        for (const kitchen of kitchens) {
          expect(reviewIn(catalogue, kitchen).roomLine).toBe(
            rawRoomLineOf(catalogue, kitchen.design),
          );
        }
      },
    );

    it("names as many lengths as the shape has walls, then the body count, and nothing else in digits", () => {
      for (const kitchen of kitchens) {
        const { room, placements } = kitchen.design;
        const lengths = [room.widthMm, room.depthMm, room.wallCMm].slice(
          0,
          arm.walls.length,
        );

        expect(
          numbersIn(reviewIn(catalogueOf("ro"), kitchen).roomLine),
        ).toEqual([...lengths, placements.length]);
      }
    });

    it.each(RAW_CATALOGUES)(
      "names in $locale the corner side an L has, and no side for any other shape",
      (catalogue) => {
        const sides = {
          left: fillLeaf(catalogue, "review.roomLine.cornerLeft"),
          right: fillLeaf(catalogue, "review.roomLine.cornerRight"),
        };
        for (const kitchen of kitchens) {
          const { room } = kitchen.design;
          const line = reviewIn(catalogue, kitchen).roomLine;
          const expected =
            room.shape === "L" ? [room.cornerDirection ?? "left"] : [];
          const stated = (["left", "right"] as const).filter((side) =>
            line.includes(sides[side]),
          );

          expect(stated).toEqual(expected);
        }
      },
    );
  },
);

describe("the body counts the varied kitchens reach", () => {
  it.each(CATALOGUES)("exercise more than one plural form in %s", (locale) => {
    const rules = new Intl.PluralRules(locale);
    const reached = new Set(
      VARIED_ARMS.flatMap((arm) => variedKitchensOf(arm)).map((kitchen) =>
        rules.select(kitchen.design.placements.length),
      ),
    );

    expect(reached.size).toBeGreaterThan(1);
  });
});

describe.each(RAW_CATALOGUES)(
  "the estimate's wording in $locale",
  (catalogue) => {
    const [kitchen] = variedKitchensOf(VARIED_L_ARM);
    if (kitchen === undefined) throw new Error("no kitchen");
    const review = reviewIn(catalogue, kitchen);

    it("labels the figure with the price bar's starting prefix", () => {
      expect(review.figure.label).toBe(
        fillLeaf(catalogue, "price.startingPrefix"),
      );
    });

    it("says rounded up in the review's own leaf, and not an offer and subject to measurement in the breakdown's", () => {
      expect(review.disclaimer).toEqual({
        rounding: fillLeaf(catalogue, "review.roundedUpNote"),
        notice: fillLeaf(catalogue, "priceBreakdown.note"),
      });
    });

    it("fills the not-included slot with the breakdown's disclaimer and nothing else", () => {
      expect(review.notIncluded).toEqual({
        lines: [fillLeaf(catalogue, "priceBreakdown.disclaimer")],
      });
    });

    it("takes its title from the review's own leaf", () => {
      expect(review.title).toBe(fillLeaf(catalogue, "review.title"));
    });
  },
);

/* eslint-disable no-restricted-syntax -- the wording is the subject: what the estimate must say, and four lines the catalogue must not hold. */
describe("the Romanian the estimate is described in", () => {
  const ro = catalogueOf("ro");

  it("calls it a starting price, rounded up", () => {
    expect(fillLeaf(ro, "price.startingPrefix")).toBe("De la");
    expect(fillLeaf(ro, "review.roundedUpNote")).toMatch(
      /Preț de pornire, rotunjit în sus/,
    );
  });

  it("says it is no commercial offer and waits on measurement", () => {
    const notice = fillLeaf(ro, "priceBreakdown.note");

    expect(notice).toMatch(/Nu reprezintă o ofertă comercială/);
    expect(notice).toMatch(/după măsur/i);
  });
});

const REVIEW_LEAVES = [
  "review.bodyCount",
  "review.refusalReasons.BODIES_PAST_WALL",
  "review.refusalReasons.NO_CABINET",
  "review.refusalReasons.PRICING_FAILED",
  "review.roomLine.L",
  "review.roomLine.U",
  "review.roomLine.cornerLeft",
  "review.roomLine.cornerRight",
  "review.roomLine.linear",
  "review.roundedUpNote",
  "review.title",
];

/** The frame's four not-included lines, which wait for the owner and may not ship as catalogue text. */
const UNCONFIRMED_NOT_INCLUDED_LINES = [
  /blat de lucru și cant/i,
  /electrocasnice și chiuvetă/i,
  /transport și montaj/i,
  /racorduri electrice/i,
];

/* eslint-enable no-restricted-syntax */

function argumentNamesOf(leaf: string): readonly string[] {
  return [...leaf.matchAll(/\{(\w+)(?=[,}])/g)]
    .map((match) => match[1] ?? "")
    .sort();
}

describe("the review's leaves", () => {
  it.each(RAW_CATALOGUES)(
    "are, in $locale, exactly the eleven the screen's model reads",
    ({ messages }) => {
      const keys = catalogueLeaves(messages)
        .map(([key]) => key)
        .filter((key) => key.startsWith("review."));

      expect([...keys].sort()).toEqual(REVIEW_LEAVES);
    },
  );

  it.each(REVIEW_LEAVES)(
    "%s takes the same arguments in both languages",
    (key) => {
      const [first, second] = RAW_CATALOGUES.map(({ messages }) => {
        const leaf = catalogueLeaves(messages).find(([path]) => path === key);
        if (leaf === undefined) throw new Error(`no leaf ${key}`);
        return argumentNamesOf(leaf[1]);
      });

      expect(first).toEqual(second);
    },
  );

  it.each(RAW_CATALOGUES)(
    "say something, in $locale, and differ from one another",
    ({ messages }) => {
      const texts = catalogueLeaves(messages)
        .filter(([key]) => key.startsWith("review."))
        .map(([, text]) => text);

      expect(texts.every((text) => text.trim() !== "")).toBe(true);
      expect(new Set(texts).size).toBe(texts.length);
    },
  );

  it("differ between the two languages, leaf for leaf", () => {
    const [romanian, russian] = RAW_CATALOGUES.map(
      ({ messages }) => new Map(catalogueLeaves(messages)),
    );
    for (const key of REVIEW_LEAVES) {
      expect(russian?.get(key), key).not.toBe(romanian?.get(key));
    }
  });

  it("are not joined, anywhere in the Romanian catalogue, by one of the frame's not-included lines", () => {
    const romanian = catalogueLeaves(catalogueOf("ro").messages);

    for (const [key, text] of romanian) {
      for (const line of UNCONFIRMED_NOT_INCLUDED_LINES) {
        expect(text, key).not.toMatch(line);
      }
    }
  });
});
