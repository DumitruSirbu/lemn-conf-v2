// One refusal at a time, the first the customer can act on: a body past its wall, then nothing Lemnaria
// sells, then a price that cannot be computed.
//
// Every row below is a kitchen made to hold one reason or several. The pricing failure is a real one (a
// material tier the book does not offer, so `priceDesign` itself refuses); nothing here injects a result.
import {
  KITCHEN_L_DESIGN,
  type DisplayEntry,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import type { Content } from "@/i18n/content";
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
import {
  customerSuppliedIds,
  emptied,
  keepingOnly,
  pastTheWall,
  withAnUnofferedTier,
} from "../support/review-edits";
import { ro } from "../support/romanian-content";
import { ARMS, composedKitchensOf } from "../support/swept-kitchens";

const NAMED_FLOOR_PER_ARM = 80;

function viewOf(kitchen: PricedKitchen, content: Content = ro): ReviewView {
  return describeReview({
    content,
    design: kitchen.design,
    pricing: kitchen.pricing,
    groups: kitchen.groups,
  });
}

function entriesInDisplayOrder(
  kitchen: PricedKitchen,
): readonly DisplayEntry[] {
  return kitchen.groups.flatMap((group) => group.entries);
}

/** Built by hand on purpose: importing `describePlacementLabel` would feed both sides of the comparison from one function. */
function placementLabelOf(entry: DisplayEntry, content: Content): string {
  return content.priceBreakdown.placementLabel(
    content.bodyLabel(entry.label),
    entry.widthMm,
  );
}

/** The bodies a refusal for `ids` must name: the projection's entries in its order, worded as a row words them. */
function namedBy(
  kitchen: PricedKitchen,
  ids: ReadonlySet<string>,
  content: Content = ro,
) {
  return entriesInDisplayOrder(kitchen)
    .filter((entry) => ids.has(entry.placementId))
    .map((entry) => ({
      placementId: entry.placementId,
      label: placementLabelOf(entry, content),
    }));
}

function refusal(code: RefusedSubmit["code"], bodies: RefusedSubmit["bodies"]) {
  return { kind: "refused", code, bodies } as const;
}

const SEEDED = priceAndProject(KITCHEN_L_DESIGN);
const SEEDED_PRICED = SEEDED.pricing.ok ? SEEDED.pricing.priced : undefined;
if (SEEDED_PRICED === undefined) throw new Error("the seeded kitchen prices");

const SUPPLIED_BY_CUSTOMER = customerSuppliedIds(SEEDED_PRICED);
const SOLD_IDS = SEEDED.design.placements
  .map((placement) => placement.id)
  .filter((id) => !SUPPLIED_BY_CUSTOMER.has(id));
const [FIRST_SOLD_ID] = SOLD_IDS;
const [FIRST_SUPPLIED_ID] = [...SUPPLIED_BY_CUSTOMER];
if (FIRST_SOLD_ID === undefined || FIRST_SUPPLIED_ID === undefined) {
  throw new Error("the seeded kitchen holds bodies of both suppliers");
}

const ALL_SUPPLIED = priceAndProject(
  keepingOnly(SEEDED.design, SUPPLIED_BY_CUSTOMER),
);
const ONE_SOLD_BESIDE_SUPPLIED = priceAndProject(
  keepingOnly(SEEDED.design, new Set([...SUPPLIED_BY_CUSTOMER, FIRST_SOLD_ID])),
);

function pastWallIds(...ids: string[]): ReadonlySet<string> {
  return new Set(ids);
}

const OVERFLOW_IDS = pastWallIds(SOLD_IDS[0] ?? "", SOLD_IDS[3] ?? "");
const OVERFLOWING = priceAndProject(pastTheWall(SEEDED.design, OVERFLOW_IDS));
const ALL_SUPPLIED_OVERFLOWING = priceAndProject(
  pastTheWall(ALL_SUPPLIED.design, pastWallIds(FIRST_SUPPLIED_ID)),
);

const UNPRICED = (design: PricedKitchen["design"]) =>
  priceAndProject(withAnUnofferedTier(design));

/** Name, kitchen, whether it prices, the view's kind, and the refusal it earns (or `allowed`). */
const PRECEDENCE_TABLE = [
  ["fits and prices", SEEDED, true, "available", { kind: "allowed" }],
  [
    "a body past its wall",
    OVERFLOWING,
    true,
    "available",
    refusal("BODIES_PAST_WALL", namedBy(OVERFLOWING, OVERFLOW_IDS)),
  ],
  [
    "only bodies the customer supplies",
    ALL_SUPPLIED,
    true,
    "unavailable",
    refusal("NO_CABINET", []),
  ],
  [
    "no body at all",
    priceAndProject(emptied(SEEDED.design)),
    true,
    "unavailable",
    refusal("NO_CABINET", []),
  ],
  [
    "one body sold beside bodies supplied",
    ONE_SOLD_BESIDE_SUPPLIED,
    true,
    "available",
    { kind: "allowed" },
  ],
  [
    "a price that cannot be computed",
    UNPRICED(SEEDED.design),
    false,
    "unavailable",
    refusal("PRICING_FAILED", []),
  ],
  [
    "a body past its wall, and a body only the customer supplies",
    ALL_SUPPLIED_OVERFLOWING,
    true,
    "unavailable",
    refusal(
      "BODIES_PAST_WALL",
      namedBy(ALL_SUPPLIED_OVERFLOWING, pastWallIds(FIRST_SUPPLIED_ID)),
    ),
  ],
  [
    "a body past its wall, and a price that cannot be computed",
    UNPRICED(OVERFLOWING.design),
    false,
    "unavailable",
    refusal("BODIES_PAST_WALL", namedBy(OVERFLOWING, OVERFLOW_IDS)),
  ],
  [
    "nothing sold, and a price that cannot be computed",
    UNPRICED(ALL_SUPPLIED.design),
    false,
    "unavailable",
    refusal("PRICING_FAILED", []),
  ],
  [
    "no body, and a price that cannot be computed",
    UNPRICED(emptied(SEEDED.design)),
    false,
    "unavailable",
    refusal("NO_CABINET", []),
  ],
  [
    "a body past its wall, nothing sold, and a price that cannot be computed",
    UNPRICED(ALL_SUPPLIED_OVERFLOWING.design),
    false,
    "unavailable",
    refusal(
      "BODIES_PAST_WALL",
      namedBy(ALL_SUPPLIED_OVERFLOWING, pastWallIds(FIRST_SUPPLIED_ID)),
    ),
  ],
] as const;

describe("which reason a kitchen is refused for", () => {
  it.each(PRECEDENCE_TABLE)(
    "for %s: prices=%s, the view is %s, the submission is %j",
    (_name, kitchen, prices, viewKind, submission) => {
      const view = viewOf(kitchen);

      expect(kitchen.pricing.ok).toBe(prices);
      expect(view.kind).toBe(viewKind);
      expect(view.submit).toEqual(submission);
    },
  );

  it("builds its kitchens as described, so the table is not over the wrong ones", () => {
    expect(SUPPLIED_BY_CUSTOMER.size).toBeGreaterThan(0);
    expect(SOLD_IDS.length).toBeGreaterThan(3);
    expect(OVERFLOW_IDS.size).toBe(2);
    expect(ALL_SUPPLIED.design.placements.length).toBe(
      SUPPLIED_BY_CUSTOMER.size,
    );
    expect(ONE_SOLD_BESIDE_SUPPLIED.design.placements.length).toBe(
      SUPPLIED_BY_CUSTOMER.size + 1,
    );
  });
});

describe.each(CATALOGUES)(
  "the bodies a refusal names, in %s",
  (locale, messages) => {
    const content = contentFor(locale, messages);

    describe.each(ARMS)("over generated $name kitchens", (arm) => {
      const refused = composedKitchensOf(arm).map((kitchen) => {
        const { placements } = kitchen.design;
        const ids = new Set(
          [0, Math.floor(placements.length / 2), placements.length - 1].map(
            (index) => placements[index]?.id ?? "",
          ),
        );
        return priceAndProject(pastTheWall(kitchen.design, ids));
      });

      it("names the same bodies, worded as their rows, whether or not the kitchen prices", () => {
        expect(refused.length).toBeGreaterThanOrEqual(NAMED_FLOOR_PER_ARM);
        for (const kitchen of refused) {
          const priced = viewOf(kitchen, content);
          const unpriced = viewOf(
            priceAndProject(withAnUnofferedTier(kitchen.design)),
            content,
          );
          if (priced.kind !== "available") throw new Error("expected a review");
          if (priced.submit.kind !== "refused") throw new Error("refused");
          const rowLabelOf = new Map(
            priced.groups
              .flatMap((group) => group.rows)
              .map((row) => [row.key, row.label]),
          );

          expect(priced.submit.bodies.length).toBeGreaterThan(0);
          for (const body of priced.submit.bodies) {
            expect(body.label).toBe(rowLabelOf.get(body.placementId));
          }
          expect(unpriced.kind).toBe("unavailable");
          expect(unpriced.submit).toEqual(priced.submit);
        }
      });
    });
  },
);
