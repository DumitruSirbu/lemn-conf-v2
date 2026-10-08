// Wave 8H, criterion 15: a pricing failure rides the domain's refusal so an endpoint can log it, and the
// review prints none of it. Every failure here carries a marker in each of its parts, and a failure that
// `priceDesign` itself returned is searched for word by word.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  priceDesign,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  snapshotSubmission,
  type Design,
  type PriceBook,
  type PricingFailure,
  type PricingFailureCode,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import type { Content } from "@/i18n/content";
import { describeReview, type ReviewView } from "@/review/review-model";

import { CATALOGUES, contentFor } from "../support/catalogues";
import {
  OVERFLOW_MAKERS,
  VARIED_ARMS,
  variedKitchensOf,
} from "../support/varied-kitchens";

const MARKER = "ZZQA8H";

const FAILURE_CODES: readonly PricingFailureCode[] = [
  "INVALID_PRICE_BOOK",
  "PRICING_VERSION_MISMATCH",
  "UNKNOWN_BODY",
  "NO_RULE_FOR_BODY",
  "UNKNOWN_FORMULA_SHAPE",
  "UNKNOWN_TIER",
  "UNDECLARED_HANDLE_COUNT",
  "UNDECLARED_FRONT_POPULATION",
];

const CONTENTS: readonly Content[] = CATALOGUES.map(([locale, messages]) =>
  contentFor(locale, messages),
);

function markedFailure(code: PricingFailureCode): PricingFailure {
  return {
    code,
    detail: `${MARKER}-detail`,
    placementId: `${MARKER}-placement`,
    id: `${MARKER}-id`,
  };
}

function reviewOf(
  design: Design,
  failure: PricingFailure,
  content: Content,
): ReviewView {
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
  return describeReview({
    content,
    design,
    pricing: { ok: false, failure },
    groups: projectDesignForDisplay(design, catalog),
  });
}

function keysDeep(value: unknown): readonly string[] {
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, nested]) => [
    key,
    ...keysDeep(nested),
  ]);
}

/** A few kitchens of each shape, fitting and with bodies past a wall, and one with no body. */
const DESIGNS: readonly Design[] = VARIED_ARMS.flatMap((arm) => {
  const kitchens = variedKitchensOf(arm).slice(0, 4);
  const overflowing = kitchens.flatMap((kitchen) =>
    OVERFLOW_MAKERS.slice(0, 3).flatMap((maker) => {
      const made = maker.make(kitchen);
      return made === undefined ? [] : [made.design];
    }),
  );
  const [first] = kitchens;
  return [
    ...kitchens.map(({ design }) => design),
    ...overflowing,
    ...(first === undefined
      ? []
      : [
          {
            ...first.design,
            placements: [],
            emptyColumns: [],
            columnExtents: [],
          },
        ]),
  ];
});

describe("8H criterion 15: the review prints nothing of a pricing failure", () => {
  const views = DESIGNS.flatMap((design) =>
    FAILURE_CODES.flatMap((code) =>
      CONTENTS.map((content) => reviewOf(design, markedFailure(code), content)),
    ),
  );

  it("reviews kitchens that draw each of the three refusals, in both locales", () => {
    expect(CONTENTS).toHaveLength(2);
    expect(DESIGNS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(views.map((view) => view.submit.kind))).toEqual(
      new Set(["refused"]),
    );
    expect(
      new Set(
        views.map((view) =>
          view.submit.kind === "refused" ? view.submit.code : "allowed",
        ),
      ),
    ).toEqual(new Set(["BODIES_PAST_WALL", "NO_CABINET", "PRICING_FAILED"]));
  });

  it("holds no part of the failure in anything it publishes", () => {
    const leaking = views.filter((view) =>
      JSON.stringify(view).includes(MARKER),
    );

    expect(leaking).toEqual([]);
  });

  it("holds no pricing failure code and no key a failure has", () => {
    const naming = views.filter((view) => {
      const published = JSON.stringify(view);
      const keys = keysDeep(view);
      return (
        FAILURE_CODES.some((code) => published.includes(code)) ||
        ["failure", "detail", "refusal", "pricing"].some((key) =>
          keys.includes(key),
        )
      );
    });

    expect(naming).toEqual([]);
  });

  it("is, for a kitchen that fits and holds bodies, the same value whatever the failure said", () => {
    const [fitting] = DESIGNS;
    if (fitting === undefined) throw new Error("no kitchen was generated");

    const published = FAILURE_CODES.flatMap((code) =>
      CONTENTS.map((content) =>
        JSON.stringify(reviewOf(fitting, markedFailure(code), content)),
      ),
    );

    expect(new Set(published)).toEqual(
      new Set([
        JSON.stringify({
          kind: "unavailable",
          submit: { kind: "refused", code: "PRICING_FAILED", bodies: [] },
        }),
      ]),
    );
  });
});

describe("8H criterion 15: a failure priceDesign itself returned", () => {
  const UNREADABLE_BOOK = {
    ...SAMPLE_PRICE_BOOK,
    currency: "EUR",
  } as unknown as PriceBook;

  const TERMS = [
    {
      name: "another version",
      book: SAMPLE_PRICE_BOOK,
      pricingVersion: "another",
    },
    {
      name: "no rule for any body",
      book: { ...SAMPLE_PRICE_BOOK, cabinetRules: [] },
      pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    },
    {
      name: "another currency",
      book: UNREADABLE_BOOK,
      pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    },
  ];

  const [design] = DESIGNS;
  if (design === undefined) throw new Error("no kitchen was generated");
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));

  describe.each(TERMS)(
    "under a book with $name",
    ({ book, pricingVersion }) => {
      const pricing = priceDesign({
        design,
        catalog,
        book,
        pricingVersion,
        selections: design.settings,
      });
      if (pricing.ok) throw new Error("expected pricing to refuse");
      const { failure } = pricing;

      it("reaches the snapshot's refusal whole, for the endpoint to log", () => {
        expect(
          snapshotSubmission({ design, catalog, book, pricingVersion }),
        ).toEqual({ ok: false, refusal: { code: "PRICING_FAILED", failure } });
      });

      it("reaches no review: not its code, its detail, nor any id it names", () => {
        const published = CONTENTS.map((content) =>
          JSON.stringify(
            describeReview({
              content,
              design,
              pricing,
              groups: projectDesignForDisplay(design, catalog),
            }),
          ),
        );
        const parts = [
          failure.code,
          failure.detail,
          failure.id,
          failure.placementId,
        ].filter(
          (part): part is string => part !== undefined && part.length > 3,
        );

        expect(parts.length).toBeGreaterThanOrEqual(2);
        expect(
          published.filter((text) => parts.some((part) => text.includes(part))),
        ).toEqual([]);
      });
    },
  );
});
