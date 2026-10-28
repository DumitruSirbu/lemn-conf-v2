// One refusal at a time, the first the customer can act on: a body past its wall, whatever pricing answered;
// then nothing Lemnaria sells; then a price that cannot be computed.
//
// Every unpriced kitchen here is one `priceDesign` itself refuses, for six of its reasons: two the design can
// carry (a tier the book does not offer, a hanging cabinet too low to hang a door on) and four that are the
// book's (another version, another currency, no rule for a body, a formula this build cannot read). No result
// is injected. "Nothing sold" is built from the supplier each priced line publishes, on every swept kitchen.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  findOverflowingPlacementIds,
  priceDesign,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  type Design,
  type DesignPlacement,
  type PriceBook,
  type PricingFailureCode,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import type { Content } from "@/i18n/content";
import { describePriceBar } from "@/price/price-bar-model";
import { describePriceBreakdown } from "@/price/price-breakdown-model";
import {
  describeReview,
  type RefusedSubmit,
  type ReviewView,
} from "@/review/review-model";

import { CATALOGUES, contentFor } from "../support/catalogues";
import {
  priceAndProject,
  type PricedKitchen,
} from "../support/generated-kitchens";
import { ro } from "../support/romanian-content";
import {
  OVERFLOW_MAKERS,
  VARIED_ARMS,
  VARIED_U_ARM,
  variedKitchensOf,
  type VariedArm,
} from "../support/varied-kitchens";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows";
import { NOTHING_DISABLED } from "../support/availability";

const KITCHEN_FLOOR_PER_ARM = 80;
const OVERFLOWING_FLOOR_PER_ARM = 400;

const CONTENTS: readonly (readonly [string, Content])[] = CATALOGUES.map(
  ([locale, messages]) => [locale, contentFor(locale, messages)] as const,
);

interface PricingTerms {
  readonly book: PriceBook;
  readonly pricingVersion: string;
}

const SHIPPED_TERMS: PricingTerms = {
  book: SAMPLE_PRICE_BOOK,
  pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
};

/** Priced and projected as the store does it, under terms the test chooses. */
function priceUnder(design: Design, terms: PricingTerms): PricedKitchen {
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
  return {
    design,
    pricing: priceDesign({
      design,
      catalog,
      book: terms.book,
      pricingVersion: terms.pricingVersion,
      deepeningRows: MEASURED_DEEPENING_ROWS,
      availability: NOTHING_DISABLED,
      selections: design.settings,
    }),
    groups: projectDesignForDisplay(design, catalog),
  };
}

const TOO_LOW_TO_HANG_A_DOOR_MM = 5;

/** The first plain hanging cabinet made too low for a door band; `undefined` where the kitchen hangs none. */
function withAHangingCabinetTooLow(design: Design): Design | undefined {
  const cabinet = design.placements.find(
    (placement) => placement.body.buildId === "wall-cabinet",
  );
  if (cabinet === undefined) return undefined;
  return {
    ...design,
    placements: design.placements.map((placement) =>
      placement === cabinet
        ? {
            ...placement,
            body: { ...placement.body, heightMm: TOO_LOW_TO_HANG_A_DOOR_MM },
          }
        : placement,
    ),
  };
}

interface Unpriceable {
  readonly name: string;
  readonly code: PricingFailureCode;
  /** `undefined` where the design offers nothing for this way of failing to act on. */
  readonly price: (design: Design) => PricedKitchen | undefined;
}

const UNPRICEABLE: readonly Unpriceable[] = [
  {
    name: "a material tier the book does not offer",
    code: "UNKNOWN_TIER",
    price: (design) =>
      priceAndProject({
        ...design,
        settings: { ...design.settings, materialTierId: "material.unoffered" },
      }),
  },
  {
    name: "a hanging cabinet too low to hang a door on",
    code: "UNBUILDABLE_DOOR_BAND",
    price: (design) => {
      const lowered = withAHangingCabinetTooLow(design);
      return lowered === undefined ? undefined : priceAndProject(lowered);
    },
  },
  {
    name: "a book of another version",
    code: "PRICING_VERSION_MISMATCH",
    price: (design) =>
      priceUnder(design, { ...SHIPPED_TERMS, pricingVersion: "another" }),
  },
  {
    name: "a book in another currency",
    code: "INVALID_PRICE_BOOK",
    price: (design) =>
      priceUnder(design, {
        ...SHIPPED_TERMS,
        book: { ...SAMPLE_PRICE_BOOK, currency: "EUR" } as unknown as PriceBook,
      }),
  },
  {
    name: "a book with no rule for any body",
    code: "NO_RULE_FOR_BODY",
    price: (design) =>
      priceUnder(design, {
        ...SHIPPED_TERMS,
        book: { ...SAMPLE_PRICE_BOOK, cabinetRules: [] },
      }),
  },
  {
    name: "a book whose formulas this build cannot read",
    code: "UNKNOWN_FORMULA_SHAPE",
    price: (design) =>
      priceUnder(design, {
        ...SHIPPED_TERMS,
        book: {
          ...SAMPLE_PRICE_BOOK,
          cabinetRules: SAMPLE_PRICE_BOOK.cabinetRules.map((rule) => ({
            ...rule,
            formula: { shape: "unread" } as unknown as typeof rule.formula,
          })),
        },
      }),
  },
];

function viewOf(kitchen: PricedKitchen, content: Content = ro): ReviewView {
  return describeReview({
    content,
    design: kitchen.design,
    pricing: kitchen.pricing,
    groups: kitchen.groups,
  });
}

function refusalOf(
  kitchen: PricedKitchen,
  content: Content = ro,
): RefusedSubmit {
  const view = viewOf(kitchen, content);
  if (view.submit.kind !== "refused") throw new Error("expected a refusal");
  return view.submit;
}

function displayOrderOf(kitchen: PricedKitchen): readonly string[] {
  return kitchen.groups.flatMap((group) =>
    group.entries.map((entry) => entry.placementId),
  );
}

/** The bodies a priced kitchen's lines say the customer brings. */
function suppliedIdsOf(kitchen: PricedKitchen): ReadonlySet<string> {
  if (!kitchen.pricing.ok) throw new Error("expected a priced kitchen");
  return new Set(
    kitchen.pricing.priced.lines.flatMap((line) =>
      line.kind === "cabinet" && line.suppliedBy === "customer"
        ? [line.placementId]
        : [],
    ),
  );
}

function keeping(design: Design, ids: ReadonlySet<string>): Design {
  return {
    ...design,
    placements: design.placements.filter(({ id }) => ids.has(id)),
    emptyColumns: [],
    columnExtents: [],
  };
}

function wallsOf(design: Design): readonly DesignPlacement["wall"][] {
  if (design.room.shape === "U") return ["A", "B", "C"];
  return design.room.shape === "L" ? ["A", "B"] : ["A"];
}

/** Only what the customer brings, and one more of the first of them on every wall the room has. */
function onlySuppliedBodiesOnEveryWall(kitchen: PricedKitchen): Design {
  const supplied = keeping(kitchen.design, suppliedIdsOf(kitchen));
  const [first] = supplied.placements;
  if (first === undefined) throw new Error("the kitchen supplies no body");
  return {
    ...supplied,
    placements: [
      ...supplied.placements,
      ...wallsOf(supplied).map((wall) => ({
        ...first,
        id: `supplied-again-on-${wall}`,
        wall,
        alongMm: first.body.widthMm,
      })),
    ],
  };
}

/** What the customer brings, beside the one first body Lemnaria makes. */
function suppliedBodiesAndOneSold(kitchen: PricedKitchen): Design {
  const supplied = suppliedIdsOf(kitchen);
  const sold = kitchen.design.placements.find(({ id }) => !supplied.has(id));
  if (sold === undefined) throw new Error("the kitchen sells no body");
  return keeping(kitchen.design, new Set([...supplied, sold.id]));
}

/** Every supplied body slid past the end of wall A's length, on whichever wall it stands. */
function slidFarAlong(design: Design): Design {
  const farMm =
    Math.max(
      design.room.widthMm,
      design.room.depthMm,
      design.room.wallCMm ?? 0,
    ) + 1;
  return {
    ...design,
    placements: design.placements.map((placement) => ({
      ...placement,
      alongMm: farMm,
    })),
  };
}

const overflowingByArm = new Map<string, readonly PricedKitchen[]>();

function overflowingKitchensOf(arm: VariedArm): readonly PricedKitchen[] {
  const cached = overflowingByArm.get(arm.name);
  if (cached !== undefined) return cached;
  const made = variedKitchensOf(arm).flatMap((kitchen) =>
    OVERFLOW_MAKERS.flatMap((maker) => {
      const overflowing = maker.make(kitchen);
      return overflowing === undefined
        ? []
        : [priceAndProject(overflowing.design)];
    }),
  );
  overflowingByArm.set(arm.name, made);
  return made;
}

/** Half the sweep, taken evenly, where each kitchen is priced again six ways. */
function everyOther<T>(items: readonly T[]): readonly T[] {
  return items.filter((_, index) => index % 2 === 0);
}

function fits(kitchen: PricedKitchen): boolean {
  return findOverflowingPlacementIds(kitchen.design).length === 0;
}

describe.each(VARIED_ARMS)("over varied $name kitchens", (arm) => {
  const fitting = variedKitchensOf(arm);
  const overflowing = overflowingKitchensOf(arm);

  describe.each(UNPRICEABLE)("priced under $name", (unpriceable) => {
    const unpricedFitting = fitting.flatMap((kitchen) => {
      const unpriced = unpriceable.price(kitchen.design);
      return unpriced === undefined ? [] : [unpriced];
    });
    const pairs = everyOther(overflowing).flatMap((priced) => {
      const unpriced = unpriceable.price(priced.design);
      return unpriced === undefined ? [] : [{ priced, unpriced }];
    });

    it("is refused by the pricing query itself, for that reason, on enough kitchens", () => {
      expect(unpricedFitting.length).toBeGreaterThanOrEqual(
        KITCHEN_FLOOR_PER_ARM / 2,
      );
      expect(pairs.length).toBeGreaterThanOrEqual(
        OVERFLOWING_FLOOR_PER_ARM / 2,
      );
      for (const kitchen of [
        ...unpricedFitting,
        ...pairs.map((pair) => pair.unpriced),
      ]) {
        expect(
          kitchen.pricing.ok ? "priced" : kitchen.pricing.failure.code,
        ).toBe(unpriceable.code);
      }
    });

    it("says the price cannot be computed, and names no body, while every body fits", () => {
      for (const kitchen of unpricedFitting) {
        expect(findOverflowingPlacementIds(kitchen.design)).toEqual([]);
        expect(viewOf(kitchen)).toEqual({
          kind: "unavailable",
          submit: { kind: "refused", code: "PRICING_FAILED", bodies: [] },
        });
      }
    });

    it("shows nothing and refuses for the bodies past their wall, the query's, in the list's order", () => {
      for (const { unpriced } of pairs) {
        const reported = new Set(findOverflowingPlacementIds(unpriced.design));
        const view = viewOf(unpriced);

        expect(reported.size).toBeGreaterThan(0);
        expect(view.kind).toBe("unavailable");
        expect(view.submit).toMatchObject({
          kind: "refused",
          code: "BODIES_PAST_WALL",
        });
        expect(
          refusalOf(unpriced).bodies.map((body) => body.placementId),
        ).toEqual(displayOrderOf(unpriced).filter((id) => reported.has(id)));
      }
    });

    it.each(CONTENTS)(
      "names each body in %s as the priced kitchen's refusal and row name it",
      (_locale, content) => {
        for (const { priced, unpriced } of pairs) {
          const view = viewOf(priced, content);
          if (view.kind !== "available") throw new Error("expected a review");
          const rowLabels = new Map(
            view.groups.flatMap((group) =>
              group.rows.map((row) => [row.key, row.label] as const),
            ),
          );
          const named = refusalOf(unpriced, content).bodies;

          // A lowered cabinet is another design from the priced one only in a height no label prints.
          expect(named).toEqual(refusalOf(priced, content).bodies);
          for (const body of named) {
            expect(body.label).toBe(rowLabels.get(body.placementId));
          }
        }
      },
    );
  });

  describe("holding only bodies the customer supplies, some on every wall", () => {
    const supplied = fitting.map((kitchen) =>
      priceAndProject(onlySuppliedBodiesOnEveryWall(kitchen)),
    );

    it("builds enough such kitchens, of several bodies, each priced with no line Lemnaria supplies", () => {
      expect(supplied.length).toBeGreaterThanOrEqual(KITCHEN_FLOOR_PER_ARM);
      for (const kitchen of supplied) {
        expect(kitchen.design.placements.length).toBeGreaterThanOrEqual(
          1 + arm.walls.length,
        );
        expect(suppliedIdsOf(kitchen).size).toBe(
          kitchen.design.placements.length,
        );
        expect(
          new Set(kitchen.design.placements.map(({ wall }) => wall)).size,
        ).toBe(arm.walls.length);
      }
    });

    it("has no cabinet to offer for: nothing is shown and a cabinet is asked for", () => {
      expect(supplied.filter(fits).length).toBeGreaterThanOrEqual(
        KITCHEN_FLOOR_PER_ARM / 2,
      );
      for (const kitchen of supplied.filter(fits)) {
        expect(viewOf(kitchen)).toEqual({
          kind: "unavailable",
          submit: { kind: "refused", code: "NO_CABINET", bodies: [] },
        });
      }
    });

    it("leaves the price bar and the breakdown as they were for the same kitchen", () => {
      for (const kitchen of supplied) {
        expect(
          describePriceBar({ content: ro, pricing: kitchen.pricing }).kind,
        ).toBe("priced");
        expect(
          describePriceBreakdown({
            content: ro,
            pricing: kitchen.pricing,
            groups: kitchen.groups,
          }).kind,
        ).toBe("available");
      }
    });

    it("is refused for its bodies past the wall first, every one named, when they stand past it", () => {
      for (const kitchen of supplied) {
        const slid = priceAndProject(slidFarAlong(kitchen.design));

        expect(viewOf(slid).kind).toBe("unavailable");
        expect(refusalOf(slid).code).toBe("BODIES_PAST_WALL");
        expect(refusalOf(slid).bodies.map((body) => body.placementId)).toEqual(
          displayOrderOf(slid),
        );
      }
    });

    it("says the price cannot be computed when it cannot, the suppliers then being unknown", () => {
      for (const kitchen of supplied.filter(fits)) {
        const unpriced = priceUnder(kitchen.design, {
          ...SHIPPED_TERMS,
          pricingVersion: "another",
        });

        expect(unpriced.pricing.ok).toBe(false);
        expect(refusalOf(unpriced)).toEqual({
          kind: "refused",
          code: "PRICING_FAILED",
          bodies: [],
        });
      }
    });
  });

  it("may be submitted once one body Lemnaria makes stands among those the customer supplies", () => {
    for (const kitchen of fitting) {
      const oneSold = priceAndProject(suppliedBodiesAndOneSold(kitchen));

      expect(suppliedIdsOf(oneSold).size).toBe(
        oneSold.design.placements.length - 1,
      );
      expect(viewOf(oneSold)).toMatchObject({
        kind: "available",
        submit: { kind: "allowed" },
      });
    }
  });
});

function isAmountKey(key: string): boolean {
  return key.endsWith("Minor");
}

/** The same book with every amount it states set to nothing, its suppliers untouched. */
function withEveryAmountZero<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withEveryAmountZero) as T;
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => [
      key,
      isAmountKey(key) && typeof inner === "number"
        ? 0
        : withEveryAmountZero(inner as unknown),
    ]),
  ) as T;
}

describe("a kitchen of cabinets Lemnaria makes, priced by a book that charges nothing", () => {
  const FREE_TERMS: PricingTerms = {
    ...SHIPPED_TERMS,
    book: withEveryAmountZero(SAMPLE_PRICE_BOOK),
  };

  it.each(VARIED_ARMS)(
    "is reviewed and may be submitted, in a $name room: free is not the same as not supplied",
    (arm) => {
      const [kitchen] = variedKitchensOf(arm);
      if (kitchen === undefined) throw new Error("no kitchen");
      const free = priceUnder(kitchen.design, FREE_TERMS);
      if (!free.pricing.ok) throw new Error("expected the free book to price");

      expect(free.pricing.priced.totalMinor).toBe(0);
      expect(
        free.pricing.priced.lines.every((line) => line.amountMinor === 0),
      ).toBe(true);
      expect(suppliedIdsOf(free)).toEqual(suppliedIdsOf(kitchen));
      expect(viewOf(free)).toMatchObject({
        kind: "available",
        submit: { kind: "allowed" },
      });
    },
  );
});

describe("the three reasons, each pair and all at once, on one U kitchen", () => {
  const [kitchen] = variedKitchensOf(VARIED_U_ARM);
  if (kitchen === undefined) throw new Error("no kitchen");
  const sold = kitchen.design;
  const supplied = onlySuppliedBodiesOnEveryWall(kitchen);
  const empty = keeping(sold, new Set());
  const anotherVersion: PricingTerms = {
    ...SHIPPED_TERMS,
    pricingVersion: "another",
  };

  const TABLE: readonly (readonly [
    string,
    Design,
    PricingTerms,
    RefusedSubmit["code"] | "allowed",
  ])[] = [
    ["nothing wrong", sold, SHIPPED_TERMS, "allowed"],
    [
      "a body past its wall",
      slidFarAlong(sold),
      SHIPPED_TERMS,
      "BODIES_PAST_WALL",
    ],
    ["nothing sold", supplied, SHIPPED_TERMS, "NO_CABINET"],
    ["no body at all", empty, SHIPPED_TERMS, "NO_CABINET"],
    ["no price", sold, anotherVersion, "PRICING_FAILED"],
    [
      "a body past its wall and nothing sold",
      slidFarAlong(supplied),
      SHIPPED_TERMS,
      "BODIES_PAST_WALL",
    ],
    [
      "a body past its wall and no price",
      slidFarAlong(sold),
      anotherVersion,
      "BODIES_PAST_WALL",
    ],
    ["nothing sold and no price", supplied, anotherVersion, "PRICING_FAILED"],
    ["no body at all and no price", empty, anotherVersion, "NO_CABINET"],
    [
      "a body past its wall, nothing sold and no price",
      slidFarAlong(supplied),
      anotherVersion,
      "BODIES_PAST_WALL",
    ],
  ];

  it.each(TABLE)(
    "with %s, the answer is %4$s",
    (_name, design, terms, answer) => {
      const { submit } = viewOf(priceUnder(design, terms));

      expect(submit.kind === "refused" ? submit.code : submit.kind).toBe(
        answer,
      );
      expect(submit.kind === "refused" && submit.bodies.length > 0).toBe(
        answer === "BODIES_PAST_WALL",
      );
    },
  );
});
