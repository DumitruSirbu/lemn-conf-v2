// The staff kitchen's cabinet list as a value (ADR 0185 decisions 3 and 4; W6c-1, W6c-4, W6c-5). The oracles are the
// projection's own groups, the review's own rows and the priced cabinet lines, never the model's output read back.
import { fc, test } from "@fast-check/vitest";
import {
  KITCHEN_L_DESIGN,
  projectDesignForDisplay,
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  type Design,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { describeLineAmount } from "@/price/starting-price";
import { NO_PRICE_BOOK, type PriceBookRoot } from "@/price/price-book-root";
import { describeReview, type AvailableReview } from "@/review/review-model";
import {
  describeCabinetList,
  type AvailableCabinetList,
  type CabinetList,
} from "@/staff/staff-cabinet-list-model";
import type { KitchenVersion } from "@/staff/kitchen-version-rows";
import type { StaffSentCabinetLineWire } from "@/staff/staff-kitchens-wire-contract";

import roMessages from "../../src/messages/ro.json";
import { CATALOGUES, contentFor } from "../support/catalogues";
import { priceAndProject } from "../support/generated-kitchens";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";
import { VARIED_ARMS, variedKitchensOf } from "../support/varied-kitchens";

const content = contentFor("ro", roMessages);

function listOf(input: {
  readonly design: Design;
  readonly version: KitchenVersion;
  readonly other?: Design;
  readonly priceBook?: PriceBookRoot;
  readonly sentLines?: readonly StaffSentCabinetLineWire[];
}): AvailableCabinetList {
  const list: CabinetList = describeCabinetList({
    shown: { design: input.design, version: input.version },
    other: input.other,
    content,
    priceBook: input.priceBook ?? SAMPLE_PRICE_ROOT,
    sentLines: input.sentLines ?? [],
  });
  if (list.kind !== "available") throw new Error("the copy was not listed");
  return list;
}

function reviewOf(design: Design): AvailableReview {
  const view = describeReview({ content, ...priceAndProject(design) });
  if (view.kind !== "available") throw new Error("the kitchen has no review");
  return view;
}

function idsOf(list: AvailableCabinetList): string[] {
  return list.groups.flatMap((group) =>
    group.rows.map((row) => row.placementId),
  );
}

function without(design: Design, ids: ReadonlySet<string>): Design {
  return {
    ...design,
    placements: design.placements.filter(({ id }) => !ids.has(id)),
  };
}

function widened(design: Design, ids: ReadonlySet<string>): Design {
  return {
    ...design,
    placements: design.placements.map((placement) =>
      ids.has(placement.id)
        ? {
            ...placement,
            body: { ...placement.body, widthMm: placement.body.widthMm + 100 },
          }
        : placement,
    ),
  };
}

function projectedIds(design: Design): string[][] {
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
  return projectDesignForDisplay(design, catalog).map((group) =>
    group.entries.map((entry) => entry.placementId),
  );
}

function idOfBody(design: Design, buildId: string): string {
  const placement = design.placements.find(
    (candidate) => candidate.body.buildId === buildId,
  );
  if (placement === undefined) throw new Error(`no ${buildId} in the design`);
  return placement.id;
}

function bodyOf(
  design: Design,
  id: string,
): Design["placements"][number]["body"] {
  const placement = design.placements.find((candidate) => candidate.id === id);
  if (placement === undefined) throw new Error(`no placement ${id}`);
  return placement.body;
}

/** The same design with one placement's body replaced by another build, its size and position unchanged. */
function swappedForBody(design: Design, id: string, buildId: string): Design {
  return {
    ...design,
    placements: design.placements.map((placement) =>
      placement.id === id
        ? { ...placement, body: { ...placement.body, buildId } }
        : placement,
    ),
  };
}

const SENT = KITCHEN_L_DESIGN;
const SENT_IDS = SENT.placements.map(({ id }) => id);
const [FIRST_ID, SECOND_ID] = SENT_IDS;
if (FIRST_ID === undefined || SECOND_ID === undefined) {
  throw new Error("the sample kitchen holds fewer than two bodies");
}

describe("the groups and rows of one copy", () => {
  it("lists the projection's groups in its order, with the projection's bodies in each", () => {
    const list = listOf({ design: SENT, version: "sent" });

    expect(
      list.groups.map((group) => group.rows.map((r) => r.placementId)),
    ).toEqual(projectedIds(SENT));
    expect(list.bodyCount).toBe(SENT.placements.length);
  });

  it("marks nothing when no other copy is given", () => {
    const list = listOf({ design: SENT, version: "current" });

    expect(
      list.groups
        .flatMap((group) => group.rows)
        .every((row) => row.change === "same"),
    ).toBe(true);
    expect(list.holdsChanges).toBe(false);
  });

  it("gives every group a distinct key and the review's heading words", () => {
    const list = listOf({ design: SENT, version: "sent" });
    const review = reviewOf(SENT);

    expect(new Set(list.groups.map((group) => group.key)).size).toBe(
      list.groups.length,
    );
    expect(list.groups.map((group) => group.heading)).toEqual(
      review.groups.map((group) => group.heading),
    );
  });

  it("lists nothing, and says it cannot, for a copy holding a body the catalogue does not know", () => {
    const [first, ...rest] = SENT.placements;
    if (first === undefined) throw new Error("no body");
    const unknown: Design = {
      ...SENT,
      placements: [
        {
          ...first,
          body: { ...first.body, buildId: "a-body-no-catalogue-holds" },
        },
        ...rest,
      ],
    };

    expect(
      describeCabinetList({
        shown: { design: unknown, version: "sent" },
        other: undefined,
        content,
        priceBook: SAMPLE_PRICE_ROOT,
        sentLines: [],
      }),
    ).toEqual({ kind: "unavailable" });
  });

  it.each(["sent", "current"] as const)(
    "lists the copy alone, unmarked, when the other copy cannot be read, with the %s copy on screen",
    (version) => {
      const [first, ...rest] = SENT.placements;
      if (first === undefined) throw new Error("no body");
      const unknown: Design = {
        ...SENT,
        placements: [
          {
            ...first,
            body: { ...first.body, buildId: "a-body-no-catalogue-holds" },
          },
          ...rest,
        ],
      };

      const list = listOf({ design: SENT, version, other: unknown });

      expect(idsOf(list)).toEqual(idsOf(listOf({ design: SENT, version })));
      expect(list.holdsChanges).toBe(false);
      expect(
        list.groups
          .flatMap((group) => group.rows)
          .every((row) => row.change === "same"),
      ).toBe(true);
    },
  );
});

describe("the marks against the other copy", () => {
  const changeOf = (list: AvailableCabinetList, id: string) =>
    list.groups.flatMap((g) => g.rows).find((row) => row.placementId === id)
      ?.change;

  it("marks a body only the current copy holds as added, with the current copy on screen", () => {
    const sent = without(SENT, new Set([FIRST_ID]));

    const list = listOf({ design: SENT, version: "current", other: sent });

    expect(changeOf(list, FIRST_ID)).toBe("added");
    expect(changeOf(list, SECOND_ID)).toBe("same");
    expect(list.holdsChanges).toBe(true);
  });

  it("lists a body only the sent copy holds in its group, marked removed, with the current copy on screen", () => {
    const current = without(SENT, new Set([FIRST_ID]));

    const list = listOf({ design: current, version: "current", other: SENT });

    expect(changeOf(list, FIRST_ID)).toBe("removed");
    expect(idsOf(list)).toHaveLength(SENT.placements.length);
    expect(list.bodyCount).toBe(current.placements.length);
  });

  it("marks a sent body the current copy lacks as removed, and lists no body only the current copy holds, with the sent copy on screen", () => {
    const current = without(SENT, new Set([FIRST_ID]));
    const smallerSent = current;

    const listOfSent = listOf({
      design: SENT,
      version: "sent",
      other: current,
    });
    const listOfSmallerSent = listOf({
      design: smallerSent,
      version: "sent",
      other: SENT,
    });

    expect(changeOf(listOfSent, FIRST_ID)).toBe("removed");
    expect(idsOf(listOfSmallerSent)).not.toContain(FIRST_ID);
  });

  it.each(["sent", "current"] as const)(
    "marks a body that is wider as differing with the %s copy on screen",
    (version) => {
      const current = widened(SENT, new Set([FIRST_ID]));
      const design = version === "current" ? current : SENT;
      const other = version === "current" ? SENT : current;

      const list = listOf({ design, version, other });

      expect(changeOf(list, FIRST_ID)).toBe("differs");
      expect(changeOf(list, SECOND_ID)).toBe("same");
    },
  );

  it.each(["sent", "current"] as const)(
    "marks a cabinet swapped for a different one of the same size as differing, with the %s copy on screen",
    (version) => {
      const swappedId = idOfBody(SENT, "base-dishwasher-600");
      const current = swappedForBody(SENT, swappedId, "base-drawer3-600");
      expect(current.placements.map(({ id }) => id)).toEqual(SENT_IDS);
      expect(bodyOf(current, swappedId).widthMm).toBe(
        bodyOf(SENT, swappedId).widthMm,
      );
      expect(bodyOf(current, swappedId).heightMm).toBe(
        bodyOf(SENT, swappedId).heightMm,
      );

      const list = listOf({
        design: version === "current" ? current : SENT,
        version,
        other: version === "current" ? SENT : current,
      });

      expect(changeOf(list, swappedId)).toBe("differs");
      expect(
        list.groups
          .flatMap((group) => group.rows)
          .filter((row) => row.change !== "same")
          .map((row) => row.placementId),
      ).toEqual([swappedId]);
      expect(list.holdsChanges).toBe(true);
    },
  );

  it("marks a swap that mints a new placement id as the old body removed and the new one added, as the insert command does", () => {
    const swappedId = idOfBody(SENT, "base-dishwasher-600");
    const swapped = swappedForBody(SENT, swappedId, "base-drawer3-600");
    const current: Design = {
      ...swapped,
      placements: swapped.placements.map((placement) =>
        placement.id === swappedId
          ? { ...placement, id: "swapped-in" }
          : placement,
      ),
    };

    const list = listOf({ design: current, version: "current", other: SENT });

    expect(changeOf(list, swappedId)).toBe("removed");
    expect(changeOf(list, "swapped-in")).toBe("added");
    expect(list.bodyCount).toBe(SENT.placements.length);
  });

  it("puts a group only the sent copy fills where the projection puts it, and not after the groups that follow it", () => {
    const fullGroups = projectedIds(SENT);
    const [, secondGroup] = fullGroups;
    if (secondGroup === undefined) throw new Error("fewer than two groups");
    const current = without(SENT, new Set(secondGroup));

    const list = listOf({ design: current, version: "current", other: SENT });

    expect(
      list.groups.map((group) => group.rows.map((row) => row.placementId)),
    ).toEqual(fullGroups);
  });
});

describe("the amounts", () => {
  it("gives each current row the review's amount, and each priced cabinet line at ten lei", () => {
    const list = listOf({ design: SENT, version: "current" });
    const { pricing } = priceAndProject(SENT);
    if (!pricing.ok) throw new Error("the sample kitchen is not priced");

    for (const row of list.groups.flatMap((group) => group.rows)) {
      const line = pricing.priced.lines.find(
        (candidate) =>
          candidate.kind === "cabinet" &&
          candidate.placementId === row.placementId,
      );
      if (line?.kind !== "cabinet") throw new Error("no priced line for a row");
      const expected =
        line.suppliedBy === "customer"
          ? content.priceBreakdown.notIncluded
          : line.amountMinor === 0
            ? content.priceBreakdown.included
            : describeLineAmount(line.amountMinor);
      expect(row.amountText).toBe(expected);
    }
  });

  it("gives the sent copy no amount on any row when nothing was stored, and never prices it", () => {
    const bookThatMustNotBeRead = {
      kind: "active",
      versionId: "unread",
      get book(): never {
        throw new Error("the sent copy was priced");
      },
      availability: { revision: "0", disabled: [] },
    } as unknown as PriceBookRoot;

    const list = listOf({
      design: SENT,
      version: "sent",
      priceBook: bookThatMustNotBeRead,
    });

    expect(
      list.groups
        .flatMap((group) => group.rows)
        .every((row) => !("amountText" in row)),
    ).toBe(true);
  });

  it("gives no row an amount, not even a zero, when there is no book to price the current copy", () => {
    const list = listOf({
      design: SENT,
      version: "current",
      priceBook: NO_PRICE_BOOK,
    });

    expect(
      list.groups
        .flatMap((group) => group.rows)
        .every((row) => !("amountText" in row)),
    ).toBe(true);
  });

  it("gives a removed body no amount", () => {
    const current = without(SENT, new Set([FIRST_ID]));

    const list = listOf({ design: current, version: "current", other: SENT });

    const removed = list.groups
      .flatMap((g) => g.rows)
      .find((r) => r.change === "removed");
    expect(removed).toBeDefined();
    expect(removed && "amountText" in removed).toBe(false);
  });
});

describe("the sent copy's stored amounts (ADR 0185 decision 4; W6d-1)", () => {
  // Each stored amount is far from what today's book prices the body at, so a model that priced the sent copy would differ.
  const STORED_AMOUNT_MINOR = 987_650_000;
  const storedLineOf = (placementId: string): StaffSentCabinetLineWire => ({
    placementId,
    amountMinor: STORED_AMOUNT_MINOR + SENT_IDS.indexOf(placementId) * 1_000,
  });
  const allStored = SENT_IDS.map(storedLineOf);
  const amountOf = (list: AvailableCabinetList, id: string) =>
    list.groups.flatMap((g) => g.rows).find((row) => row.placementId === id)
      ?.amountText;

  it("draws on each sent row the amount stored for that placement, at the ten lei a line is shown to", () => {
    const list = listOf({
      design: SENT,
      version: "sent",
      sentLines: allStored,
    });

    for (const id of SENT_IDS) {
      expect(amountOf(list, id)).toBe(
        describeLineAmount(storedLineOf(id).amountMinor),
      );
    }
    expect(amountOf(list, FIRST_ID)).toBe("9 876 500");
  });

  it("never reads the book for the sent copy, and draws no amount the stored lines do not carry", () => {
    const bookThatMustNotBeRead = {
      kind: "active",
      versionId: "unread",
      get book(): never {
        throw new Error("the sent copy was priced");
      },
      availability: { revision: "0", disabled: [] },
    } as unknown as PriceBookRoot;

    const list = listOf({
      design: SENT,
      version: "sent",
      priceBook: bookThatMustNotBeRead,
      sentLines: allStored.filter(
        ({ placementId }) => placementId !== FIRST_ID,
      ),
    });

    expect(amountOf(list, FIRST_ID)).toBeUndefined();
    expect(
      list.groups
        .flatMap((g) => g.rows)
        .filter((row) => row.placementId !== FIRST_ID)
        .every((row) => row.amountText !== undefined),
    ).toBe(true);
    expect(
      list.groups
        .flatMap((g) => g.rows)
        .find((row) => row.placementId === FIRST_ID),
    ).not.toHaveProperty("amountText");
  });

  it("draws no amount, and no zero, for a stored zero, which cannot be told apart as included or as supplied by the customer", () => {
    const list = listOf({
      design: SENT,
      version: "sent",
      sentLines: [{ placementId: FIRST_ID, amountMinor: 0 }],
    });

    expect(list.groups.flatMap((g) => g.rows)).not.toContainEqual(
      expect.objectContaining({ amountText: expect.anything() as unknown }),
    );
  });

  it("draws the stored amount of a placement named __proto__ or constructor on that row alone, and changes no prototype", () => {
    const [first, second, ...rest] = SENT.placements;
    if (first === undefined || second === undefined) throw new Error("no body");
    const renamed: Design = {
      ...SENT,
      placements: [
        { ...first, id: "__proto__" },
        { ...second, id: "constructor" },
        ...rest,
      ],
    };
    const lines: readonly StaffSentCabinetLineWire[] = [
      { placementId: "__proto__", amountMinor: 111_110 },
      { placementId: "constructor", amountMinor: 222_220 },
      { placementId: "toString", amountMinor: 333_330 },
    ];

    const list = listOf({ design: renamed, version: "sent", sentLines: lines });

    const rows = list.groups.flatMap((g) => g.rows);
    expect(rows.find((r) => r.placementId === "__proto__")?.amountText).toBe(
      describeLineAmount(111_110),
    );
    expect(rows.find((r) => r.placementId === "constructor")?.amountText).toBe(
      describeLineAmount(222_220),
    );
    expect(rows.filter((r) => r.amountText !== undefined)).toHaveLength(2);
    expect(Object.prototype).not.toHaveProperty("amountText");
  });

  it("is not read for the current copy, whose amounts are today's book, nor for a body only the sent copy holds", () => {
    const current = without(SENT, new Set([FIRST_ID]));
    const todays = listOf({ design: current, version: "current", other: SENT });

    const withStored = listOf({
      design: current,
      version: "current",
      other: SENT,
      sentLines: allStored,
    });

    expect(withStored).toEqual(todays);
    expect(amountOf(withStored, FIRST_ID)).toBeUndefined();
  });
});

describe.each(CATALOGUES)(
  "over generated kitchens, in %s",
  (locale, messages) => {
    const words = contentFor(locale, messages);

    describe.each(VARIED_ARMS)("on the $name arm", (arm) => {
      const kitchens = variedKitchensOf(arm).filter(
        ({ pricing }) => pricing.ok,
      );

      it("lists the projection's groups, the review's rows and amounts, and one row per body, as the current copy", () => {
        let runsReadAgainstReviews = 0;

        fc.assert(
          fc.property(
            fc.constantFrom(...kitchens),
            MASK_OF_BODIES,
            MASK_OF_BODIES,
            (kitchen, droppedMask, widenedMask) => {
              const ids = kitchen.design.placements.map(({ id }) => id);
              const dropped = new Set(
                ids.filter((_id, index) => droppedMask[index]),
              );
              const changed = new Set(
                ids.filter(
                  (id, index) => widenedMask[index] && !dropped.has(id),
                ),
              );
              const sent = kitchen.design;
              const current = widened(without(sent, dropped), changed);
              const list = describeCabinetList({
                shown: { design: current, version: "current" },
                other: sent,
                content: words,
                priceBook: SAMPLE_PRICE_ROOT,
                sentLines: [],
              });
              if (list.kind !== "available") {
                throw new Error(
                  "the current copy, compared with the sent copy, was not listed",
                );
              }

              const rows = list.groups.flatMap((group) => group.rows);
              expect(rows).toHaveLength(
                current.placements.length + dropped.size,
              );
              expect(list.bodyCount).toBe(current.placements.length);
              expectGroupsInProjectionOrder(list, current, dropped, sent);
              for (const row of rows) {
                expect(row.change).toBe(
                  dropped.has(row.placementId)
                    ? "removed"
                    : changed.has(row.placementId)
                      ? "differs"
                      : "same",
                );
              }
              const reviews = reviewsOf({ current, sent, words });
              if (reviews === undefined) return;
              runsReadAgainstReviews += 1;
              expectRowsFromReviews({ rows, dropped, reviews });
            },
          ),
          { seed: SEED, numRuns: 40 },
        );

        expect(runsReadAgainstReviews).toBeGreaterThanOrEqual(
          MIN_RUNS_READ_AGAINST_REVIEWS,
        );
      });

      test.prop([fc.constantFrom(...kitchens)], { numRuns: 20 })(
        "lists exactly the projection's groups for the copy on screen when it is compared with nothing",
        (kitchen) => {
          const list = describeCabinetList({
            shown: { design: kitchen.design, version: "sent" },
            other: undefined,
            content: words,
            priceBook: SAMPLE_PRICE_ROOT,
            sentLines: [],
          });
          if (list.kind !== "available") throw new Error("not listed");

          expect(
            list.groups.map((g) => g.rows.map((r) => r.placementId)),
          ).toEqual(
            kitchen.groups.map((g) => g.entries.map((e) => e.placementId)),
          );
          expect(list.groups.map((g) => g.heading)).toEqual(
            reviewHeadingsOf(kitchen.design, words),
          );
        },
      );
    });
  },
);

const SEED = 20261115;

/** The runs of one property whose rows were read against both copies' reviews: a generator that drops or widens so much
 *  that no copy is priced would otherwise leave the name, facts and amount assertions with nothing to check. */
const MIN_RUNS_READ_AGAINST_REVIEWS = 5;

/** Which of a kitchen's first forty bodies to touch: none, a few or most, so that some copies stay priced. */
const MASK_OF_BODIES = fc.oneof(
  { weight: 2, arbitrary: sparseMask(10) },
  { weight: 1, arbitrary: sparseMask(2) },
);

function sparseMask(oneIn: number): fc.Arbitrary<boolean[]> {
  return fc.array(
    fc.integer({ min: 0, max: oneIn - 1 }).map((draw) => draw === 0),
    { minLength: 40, maxLength: 40 },
  );
}

/** The reviews of both copies; nothing when either copy has none (a copy the book refuses has no review to read). */
function reviewsOf({
  current,
  sent,
  words,
}: {
  readonly current: Design;
  readonly sent: Design;
  readonly words: ReturnType<typeof contentFor>;
}):
  | { readonly current: AvailableReview; readonly sent: AvailableReview }
  | undefined {
  const currentReview = describeReview({
    content: words,
    ...priceAndProject(current),
  });
  const sentReview = describeReview({
    content: words,
    ...priceAndProject(sent),
  });
  return currentReview.kind === "available" && sentReview.kind === "available"
    ? { current: currentReview, sent: sentReview }
    : undefined;
}

/** A removed row is the sent review's, without an amount; every other row is the current review's, amount included. */
function expectRowsFromReviews({
  rows,
  dropped,
  reviews,
}: {
  readonly rows: readonly AvailableCabinetList["groups"][number]["rows"][number][];
  readonly dropped: ReadonlySet<string>;
  readonly reviews: {
    readonly current: AvailableReview;
    readonly sent: AvailableReview;
  };
}): void {
  const amountOfReview = new Map(
    reviews.current.groups.flatMap((g) =>
      g.rows.map((r) => [r.key, r.amountText]),
    ),
  );
  for (const row of rows) {
    const isRemoved = dropped.has(row.placementId);
    const detail = (isRemoved ? reviews.sent : reviews.current).rowDetails[
      row.placementId
    ];
    expect(row.name).toBe(detail?.name);
    expect(row.facts).toEqual(detail?.facts);
    expect(row.amountText).toBe(
      isRemoved ? undefined : amountOfReview.get(row.placementId),
    );
  }
}

function reviewHeadingsOf(
  design: Design,
  words: ReturnType<typeof contentFor>,
): string[] {
  const view = describeReview({ content: words, ...priceAndProject(design) });
  if (view.kind !== "available") throw new Error("no review");
  return view.groups.map((group) => group.heading);
}

/** The groups and rows are the projection's of the copy on screen with the sent copy's removed bodies added to it, and
 *  every one of them is listed once. */
function expectGroupsInProjectionOrder(
  list: AvailableCabinetList,
  current: Design,
  dropped: ReadonlySet<string>,
  sent: Design,
): void {
  const removed = sent.placements.filter(({ id }) => dropped.has(id));
  const everyBody: Design = {
    ...current,
    placements: [...current.placements, ...removed],
  };

  expect(
    list.groups.map((group) => group.rows.map((row) => row.placementId)),
  ).toEqual(projectedIds(everyBody));
}
