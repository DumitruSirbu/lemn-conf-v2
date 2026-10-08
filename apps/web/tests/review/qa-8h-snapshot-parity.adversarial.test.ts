// Wave 8H, criterion 7 as restated: the server's snapshot is refused exactly when the review's call to action
// is, with the same code and the same bodies, and an allowed kitchen's figure is drawn from the snapshot's own
// total. Each kitchen is judged twice from the same design and the same pricing terms: once as the review
// screen does it, once as the snapshot does.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  drawnButNotSupplied,
  findOverflowingPlacementIds,
  priceDesign,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  snapshotSubmission,
  type Design,
  type DesignWall,
  type PriceBook,
  type SubmissionSnapshotResult,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { describeStartingPrice } from "@/price/starting-price";
import { describeReview, type ReviewView } from "@/review/review-model";

import { ro } from "../support/romanian-content";
import {
  OVERFLOW_MAKERS,
  VARIED_ARMS,
  variedKitchensOf,
  type VariedArm,
} from "../support/varied-kitchens";

interface Terms {
  readonly name: string;
  readonly book: PriceBook;
  readonly pricingVersion: string;
}

const SHIPPED: Terms = {
  name: "the shipped book",
  book: SAMPLE_PRICE_BOOK,
  pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
};

const CUSTOMER_SUPPLIES_EVERYTHING: PriceBook = {
  ...SAMPLE_PRICE_BOOK,
  cabinetRules: SAMPLE_PRICE_BOOK.cabinetRules.map(({ ruleId, buildId }) => ({
    ruleId,
    buildId,
    ...drawnButNotSupplied(),
  })),
};

const TERMS: readonly Terms[] = [
  SHIPPED,
  { ...SHIPPED, name: "a book of another version", pricingVersion: "another" },
  {
    ...SHIPPED,
    name: "a book with no rule for any body",
    book: { ...SAMPLE_PRICE_BOOK, cabinetRules: [] },
  },
  {
    ...SHIPPED,
    name: "a book that hands every body to the customer",
    book: CUSTOMER_SUPPLIES_EVERYTHING,
  },
  {
    name: "a book that hands every body to the customer, at another version",
    book: CUSTOMER_SUPPLIES_EVERYTHING,
    pricingVersion: "another",
  },
];

interface Judged {
  readonly design: Design;
  readonly terms: Terms;
  readonly review: ReviewView;
  readonly snapshot: SubmissionSnapshotResult;
}

/** One design under one book, judged as the review screen judges it and as the snapshot does. */
function judge(design: Design, terms: Terms): Judged {
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
  const { book, pricingVersion } = terms;
  return {
    design,
    terms,
    review: describeReview({
      content: ro,
      design,
      pricing: priceDesign({
        design,
        catalog,
        book,
        pricingVersion,
        selections: design.settings,
      }),
      groups: projectDesignForDisplay(design, catalog),
    }),
    snapshot: snapshotSubmission({ design, catalog, book, pricingVersion }),
  };
}

interface Verdict {
  readonly code: string;
  readonly bodies: readonly string[];
}

function reviewVerdictOf({ review }: Judged): Verdict {
  return review.submit.kind === "allowed"
    ? { code: "allowed", bodies: [] }
    : {
        code: review.submit.code,
        bodies: review.submit.bodies.map((body) => body.placementId).sort(),
      };
}

function snapshotVerdictOf({ snapshot }: Judged): Verdict {
  if (snapshot.ok) return { code: "allowed", bodies: [] };
  const { refusal } = snapshot;
  return {
    code: refusal.code,
    bodies:
      refusal.code === "BODIES_PAST_WALL"
        ? [...refusal.placementIds].sort()
        : [],
  };
}

function everyOther<T>(items: readonly T[]): readonly T[] {
  return items.filter((_, index) => index % 2 === 0);
}

function withoutBodies(design: Design): Design {
  return { ...design, placements: [], emptyColumns: [], columnExtents: [] };
}

/** Only the bodies the shipped book says the customer brings: a kitchen of nothing Lemnaria supplies under
 *  the real book. `undefined` where the kitchen holds none. */
function onlyWhatTheCustomerBrings(design: Design): Design | undefined {
  const customers = new Set(
    SAMPLE_PRICE_BOOK.cabinetRules
      .filter((rule) => rule.suppliedBy === "customer")
      .map((rule) => rule.buildId),
  );
  const placements = design.placements.filter(({ body }) =>
    customers.has(body.buildId),
  );
  if (placements.length === 0) return undefined;
  return { ...design, placements, emptyColumns: [], columnExtents: [] };
}

const judgedByArm = new Map<string, readonly Judged[]>();

function designsOf(arm: VariedArm): readonly Design[] {
  const kitchens = variedKitchensOf(arm);
  const overflowing = everyOther(
    kitchens.flatMap((kitchen) =>
      OVERFLOW_MAKERS.flatMap((maker) => {
        const made = maker.make(kitchen);
        return made === undefined ? [] : [made.design];
      }),
    ),
  );
  const fitting = kitchens.map(({ design }) => design);
  const customers = fitting.flatMap((design) => {
    const kept = onlyWhatTheCustomerBrings(design);
    return kept === undefined ? [] : [kept];
  });
  const [first] = fitting;
  return [
    ...fitting,
    ...overflowing,
    ...customers,
    ...(first === undefined ? [] : [withoutBodies(first)]),
  ];
}

function judgedOf(arm: VariedArm): readonly Judged[] {
  const cached = judgedByArm.get(arm.name);
  if (cached !== undefined) return cached;
  const judged = designsOf(arm).flatMap((design) =>
    TERMS.map((terms) => judge(design, terms)),
  );
  judgedByArm.set(arm.name, judged);
  return judged;
}

function countOf(judged: readonly Judged[], code: string): number {
  return judged.filter((one) => snapshotVerdictOf(one).code === code).length;
}

function wallsNamedBy(judged: readonly Judged[]): readonly DesignWall[] {
  const walls = judged.flatMap((one) => {
    const named = new Set(snapshotVerdictOf(one).bodies);
    return one.design.placements
      .filter(({ id }) => named.has(id))
      .map(({ wall }) => wall);
  });
  return [...new Set(walls)].sort();
}

describe.each(VARIED_ARMS)("over varied $name kitchens", (arm) => {
  const judged = judgedOf(arm);

  it("judges enough kitchens of every outcome for the comparison to mean something", () => {
    expect(countOf(judged, "allowed")).toBeGreaterThanOrEqual(80);
    expect(countOf(judged, "BODIES_PAST_WALL")).toBeGreaterThanOrEqual(800);
    expect(countOf(judged, "NO_CABINET")).toBeGreaterThanOrEqual(80);
    expect(countOf(judged, "PRICING_FAILED")).toBeGreaterThanOrEqual(160);
  });

  it("refuses for bodies on every wall the shape has", () => {
    expect(wallsNamedBy(judged)).toEqual(arm.walls);
  });

  it("refuses the snapshot exactly when the review refuses, with the same code and the same bodies", () => {
    const disagreeing = judged
      .filter(
        (one) =>
          JSON.stringify(reviewVerdictOf(one)) !==
          JSON.stringify(snapshotVerdictOf(one)),
      )
      .map((one) => ({
        terms: one.terms.name,
        room: one.design.room,
        review: reviewVerdictOf(one),
        snapshot: snapshotVerdictOf(one),
      }));

    expect(disagreeing).toEqual([]);
  });

  it("names, in a snapshot's refusal, exactly the fit query's bodies in the fit query's order", () => {
    const differing = judged.filter(
      ({ snapshot, design }) =>
        !snapshot.ok &&
        snapshot.refusal.code === "BODIES_PAST_WALL" &&
        JSON.stringify(snapshot.refusal.placementIds) !==
          JSON.stringify(findOverflowingPlacementIds(design)),
    );

    expect(differing).toEqual([]);
  });

  it("refuses for a body past its wall whenever the fit query names one, whatever the book", () => {
    const missed = judged.filter(
      (one) =>
        findOverflowingPlacementIds(one.design).length > 0 &&
        snapshotVerdictOf(one).code !== "BODIES_PAST_WALL",
    );

    expect(missed).toEqual([]);
  });

  it("draws an allowed kitchen's figure from the snapshot's own total, and flags none", () => {
    const allowed = judged.filter(({ snapshot }) => snapshot.ok);

    const differing = allowed.filter(({ review, snapshot }) => {
      if (!snapshot.ok || review.kind !== "available") return true;
      const figure = describeStartingPrice({
        totalMinor: snapshot.snapshot.priced.totalMinor,
        copy: ro.price,
      });
      return (
        JSON.stringify(review.figure) !== JSON.stringify(figure) ||
        review.overflowWarning !== undefined ||
        snapshot.snapshot.priced.totalIsFlagged
      );
    });

    expect(differing).toEqual([]);
  });

  it("shows a review for no kitchen the snapshot refuses as unsupplied or unpriced", () => {
    const shown = judged.filter(
      (one) =>
        ["NO_CABINET", "PRICING_FAILED"].includes(
          snapshotVerdictOf(one).code,
        ) && one.review.kind !== "unavailable",
    );

    expect(shown).toEqual([]);
  });
});
