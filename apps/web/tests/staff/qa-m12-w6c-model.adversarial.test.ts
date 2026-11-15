// Adversarial QA of M12 wave W6c, the cabinet list as a value (ADR 0185 decisions 3 and 4; plan W6c-1, W6c-4, W6c-5).
// The implementer's property masks its mutations over the first 40 placements and returns silently when a review is
// refused; here every placement of every generated kitchen is mutated by the index, the oracle is the stored placement
// and the priced cabinet line (not the model read back), and each branch counts the runs that really asserted.
import { fc } from "@fast-check/vitest";
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  DEEP_CABINET_DEPTH_MM,
  KITCHEN_L_DESIGN,
  projectDesignForDisplay,
  type Design,
  type DesignPlacement,
  type DisplayGroup,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  priceAgainstBook,
  priceFloorOf,
  buildCatalogAtDepthOf,
  type PriceBookRoot,
} from "@/price/price-book-root";
import { describeLineAmount } from "@/price/starting-price";
import { describeReview, describeRowDetails } from "@/review/review-model";
import {
  describeCabinetList,
  type AvailableCabinetList,
  type CabinetChange,
} from "@/staff/staff-cabinet-list-model";
import type { KitchenVersion } from "@/staff/kitchen-version-rows";

import { CATALOGUES, contentFor } from "../support/catalogues";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";
import { VARIED_ARMS, variedKitchensOf } from "../support/varied-kitchens";

type Operation =
  | "keep"
  | "drop"
  | "widen"
  | "move"
  | "ownHandle"
  | "raise"
  | "heighten"
  | "otherWall"
  | "colour";

const OPERATIONS: readonly Operation[] = [
  "keep",
  "keep",
  "drop",
  "widen",
  "move",
  "ownHandle",
  "raise",
  "heighten",
  "otherWall",
  "colour",
];
/** Longer than the largest generated kitchen (58 bodies), so no placement escapes the operations by its index. */
const OPERATION_COUNT = 64;
const RUNS_PER_ARM = 40;

function mutate(placement: DesignPlacement, op: Operation): DesignPlacement {
  const { body } = placement;
  switch (op) {
    case "keep":
    case "drop":
      return placement;
    case "widen":
      return { ...placement, body: { ...body, widthMm: body.widthMm + 100 } };
    case "move":
      return { ...placement, alongMm: placement.alongMm + 50 };
    case "ownHandle":
      return {
        ...placement,
        body: { ...body, handle: body.handle === "black" ? "steel" : "black" },
      };
    case "raise":
      return { ...placement, y0Mm: placement.y0Mm + 10 };
    case "heighten":
      return { ...placement, body: { ...body, heightMm: body.heightMm + 10 } };
    case "otherWall":
      return { ...placement, wall: placement.wall === "A" ? "B" : "A" };
    case "colour":
      return {
        ...placement,
        body: {
          ...body,
          finish: { kind: "free-colour", value: "#336699" },
        },
      };
  }
}

interface Edited {
  readonly sent: Design;
  readonly current: Design;
  readonly dropped: ReadonlySet<string>;
  readonly changed: ReadonlySet<string>;
}

function edit(sent: Design, operations: readonly Operation[]): Edited {
  const dropped = new Set<string>();
  const changed = new Set<string>();
  const kept: DesignPlacement[] = [];
  sent.placements.forEach((placement, index) => {
    const op = operations[index % operations.length] ?? "keep";
    if (op === "drop") {
      dropped.add(placement.id);
      return;
    }
    const edited = mutate(placement, op);
    if (!isSameStoredBody(placement, edited)) changed.add(placement.id);
    kept.push(edited);
  });
  return { sent, current: { ...sent, placements: kept }, dropped, changed };
}

/** The stored facts of a body, compared on the placement and not on the projection the model compares. */
function isSameStoredBody(left: DesignPlacement, right: DesignPlacement) {
  return (
    left.wall === right.wall &&
    left.alongMm === right.alongMm &&
    left.y0Mm === right.y0Mm &&
    left.body.buildId === right.body.buildId &&
    left.body.widthMm === right.body.widthMm &&
    left.body.heightMm === right.body.heightMm &&
    left.body.handle === right.body.handle &&
    JSON.stringify(left.body.finish) === JSON.stringify(right.body.finish)
  );
}

function groupsOf(design: Design): readonly DisplayGroup[] {
  const catalog = buildCatalogAtDepthOf(design);
  if (catalog === undefined) throw new Error("the depth cannot be built");
  return projectDesignForDisplay(design, catalog);
}

function idGroupsOf(groups: readonly DisplayGroup[]): string[][] {
  return groups.map((group) => group.entries.map((e) => e.placementId));
}

function rowsOf(list: AvailableCabinetList) {
  return list.groups.flatMap((group) => group.rows);
}

function listOf(input: {
  readonly design: Design;
  readonly version: KitchenVersion;
  readonly other?: Design;
  readonly words: ReturnType<typeof contentFor>;
  readonly priceBook?: PriceBookRoot;
}): AvailableCabinetList {
  const list = describeCabinetList({
    shown: { design: input.design, version: input.version },
    other: input.other,
    content: input.words,
    priceBook: input.priceBook ?? SAMPLE_PRICE_ROOT,
    sentLines: [],
  });
  if (list.kind !== "available") {
    throw new Error("a readable pair of copies was not listed");
  }
  return list;
}

/** What the priced cabinet line of a placement says on a row, from the line and the one ten-lei formatter. */
function amountOfLine(
  design: Design,
  words: ReturnType<typeof contentFor>,
): ReadonlyMap<string, string> | undefined {
  const priced = priceFloorOf(SAMPLE_PRICE_ROOT, design);
  if (priced === undefined) return undefined;
  const amounts = new Map<string, string>();
  for (const line of priced.lines) {
    if (line.kind !== "cabinet") continue;
    if (line.suppliedBy === "customer") {
      amounts.set(line.placementId, words.priceBreakdown.notIncluded);
    } else if (line.amountMinor === 0) {
      amounts.set(line.placementId, words.priceBreakdown.included);
    } else {
      amounts.set(line.placementId, describeLineAmount(line.amountMinor));
    }
  }
  return amounts;
}

const bookThatMustNotBeRead = {
  kind: "active",
  versionId: "unread",
  get book(): never {
    throw new Error("the sent copy was priced");
  },
  availability: { revision: "0", disabled: [] },
} as unknown as PriceBookRoot;

const tally = {
  pricedRuns: 0,
  refusedRuns: 0,
  reviewComparisons: 0,
  refusedReviews: 0,
  droppedRows: 0,
  differingRows: 0,
  placementsPastForty: 0,
};

const operationsArbitrary = fc.array(fc.constantFrom(...OPERATIONS), {
  minLength: OPERATION_COUNT,
  maxLength: OPERATION_COUNT,
});

describe.each(CATALOGUES)(
  "W6c-1/4/5 over generated kitchens, in %s",
  (locale, messages) => {
    const words = contentFor(locale, messages);

    describe.each(VARIED_ARMS)("on the $name arm", (arm) => {
      const kitchens = variedKitchensOf(arm);

      it("lists the current copy's rows, order, marks, amounts and facts as the stored copies and the priced lines say", () => {
        fc.assert(
          fc.property(
            fc.constantFrom(...kitchens),
            operationsArbitrary,
            (kitchen, operations) => {
              const { sent, current, dropped, changed } = edit(
                kitchen.design,
                operations,
              );
              const list = listOf({
                design: current,
                version: "current",
                other: sent,
                words,
              });
              const rows = rowsOf(list);

              expect(rows).toHaveLength(sent.placements.length);
              expect(new Set(rows.map((r) => r.placementId)).size).toBe(
                sent.placements.length,
              );
              expect(list.bodyCount).toBe(current.placements.length);
              // Groups: the projection of the copy on screen with the removed bodies added, none empty, keys distinct.
              const removed = sent.placements.filter(({ id }) =>
                dropped.has(id),
              );
              expect(
                idGroupsOf(
                  groupsOf({
                    ...current,
                    placements: [...current.placements, ...removed],
                  }),
                ),
              ).toEqual(
                list.groups.map((g) => g.rows.map((r) => r.placementId)),
              );
              expect(list.groups.every((g) => g.rows.length > 0)).toBe(true);
              expect(new Set(list.groups.map((g) => g.key)).size).toBe(
                list.groups.length,
              );

              const amounts = amountOfLine(current, words);
              const sentFacts = reviewDetailsOf(sent, words);
              const currentFacts = reviewDetailsOf(current, words);
              for (const row of rows) {
                const isRemoved = dropped.has(row.placementId);
                const expectedChange: CabinetChange = isRemoved
                  ? "removed"
                  : changed.has(row.placementId)
                    ? "differs"
                    : "same";
                expect(row.change).toBe(expectedChange);
                const details = isRemoved ? sentFacts : currentFacts;
                expect(row.name).toBe(details[row.placementId]?.name);
                expect(row.facts).toEqual(details[row.placementId]?.facts);
                expect(new Set(row.facts).size).toBe(row.facts.length);
                if (isRemoved || amounts === undefined) {
                  expect("amountText" in row).toBe(false);
                } else {
                  expect(row.amountText).toBe(amounts.get(row.placementId));
                  expect(row.amountText).not.toBe("0");
                }
              }
              expect(list.holdsChanges).toBe(dropped.size + changed.size > 0);

              tally.droppedRows += dropped.size;
              tally.differingRows += changed.size;
              if (amounts === undefined) tally.refusedRuns += 1;
              else tally.pricedRuns += 1;
              tally.placementsPastForty += Math.max(
                0,
                sent.placements.length - 40,
              );
            },
          ),
          { numRuns: RUNS_PER_ARM },
        );
      });

      it("lists the sent copy's own bodies only, never priced, each against the current copy", () => {
        fc.assert(
          fc.property(
            fc.constantFrom(...kitchens),
            operationsArbitrary,
            (kitchen, operations) => {
              const { sent, current, dropped, changed } = edit(
                kitchen.design,
                operations,
              );
              const list = listOf({
                design: sent,
                version: "sent",
                other: current,
                words,
                priceBook: bookThatMustNotBeRead,
              });
              const rows = rowsOf(list);

              expect(idGroupsOf(groupsOf(sent))).toEqual(
                list.groups.map((g) => g.rows.map((r) => r.placementId)),
              );
              expect(rows).toHaveLength(sent.placements.length);
              for (const row of rows) {
                expect("amountText" in row).toBe(false);
                const expected: CabinetChange = dropped.has(row.placementId)
                  ? "removed"
                  : changed.has(row.placementId)
                    ? "differs"
                    : "same";
                expect(row.change).toBe(expected);
              }
            },
          ),
          { numRuns: RUNS_PER_ARM },
        );
      });
    });
  },
);

describe("the generated runs asserted what they claim to", () => {
  it("priced, refused, dropped, differing and past-the-fortieth-body runs all happened", () => {
    // Declared after the properties so vitest runs it last; each tally is a floor on runs that really asserted.
    expect(tally.pricedRuns).toBeGreaterThan(100);
    expect(tally.refusedRuns).toBeGreaterThan(20);
    expect(tally.reviewComparisons).toBeGreaterThan(100);
    expect(tally.droppedRows).toBeGreaterThan(50);
    expect(tally.differingRows).toBeGreaterThan(50);
    expect(tally.placementsPastForty).toBeGreaterThan(0);
  });
});

function reviewDetailsOf(design: Design, words: ReturnType<typeof contentFor>) {
  const catalog = buildCatalogAtDepthOf(design);
  if (catalog === undefined) throw new Error("no catalogue at the depth");
  const pricing = priceAgainstBook(SAMPLE_PRICE_ROOT, design, catalog);
  const view = describeReview({
    content: words,
    design,
    pricing,
    groups: projectDesignForDisplay(design, catalog),
  });
  if (view.kind === "available") {
    tally.reviewComparisons += 1;
    return view.rowDetails;
  }
  // A refused review draws no rows: the row detail is the same exported builder's over the same projection.
  tally.refusedReviews += 1;
  return describeRowDetails(groupsOf(design), words);
}

describe("W6c-5 at a deeper cabinet depth, where the deepening rows are priced", () => {
  const DEEP_SENT: Design = {
    ...KITCHEN_L_DESIGN,
    settings: {
      ...KITCHEN_L_DESIGN.settings,
      cabinetDepthMm: DEEP_CABINET_DEPTH_MM,
    },
  };

  it.each(CATALOGUES)(
    "gives every current row of a %s deep kitchen its priced line, at ten lei",
    (locale, messages) => {
      const words = contentFor(locale, messages);
      const list = listOf({ design: DEEP_SENT, version: "current", words });
      const amounts = amountOfLine(DEEP_SENT, words);
      if (amounts === undefined)
        throw new Error("the deep sample is not priced");

      for (const row of rowsOf(list)) {
        expect(row.amountText).toBe(amounts.get(row.placementId));
      }
      expect(rowsOf(list)).toHaveLength(KITCHEN_L_DESIGN.placements.length);
    },
  );

  it("lists a current copy built deep against a sent copy built at the default depth, with the removed rows the sent copy's own", () => {
    const words = contentFor("ro", CATALOGUES[0][1]);
    const [first] = KITCHEN_L_DESIGN.placements;
    if (first === undefined) throw new Error("no body");
    const currentDeep: Design = {
      ...DEEP_SENT,
      placements: DEEP_SENT.placements.filter(({ id }) => id !== first.id),
    };

    const list = listOf({
      design: currentDeep,
      version: "current",
      other: KITCHEN_L_DESIGN,
      words,
    });

    const removed = rowsOf(list).filter((row) => row.change === "removed");
    expect(removed.map((row) => row.placementId)).toEqual([first.id]);
    expect(cabinetDepthMmOf(KITCHEN_L_DESIGN)).not.toBe(
      cabinetDepthMmOf(currentDeep),
    );
    const sentDetail = reviewDetailsOf(KITCHEN_L_DESIGN, words)[first.id];
    expect(removed[0]?.facts).toEqual(sentDetail?.facts);
    expect(removed[0]?.name).toBe(sentDetail?.name);
    expect(buildKitchenLBodyCatalog(DEEP_CABINET_DEPTH_MM)).toBeDefined();
  });
});

describe("a copy that can be read is listed although the other copy cannot (the dispatch's 'the list shows for any readable copy')", () => {
  const words = contentFor("ro", CATALOGUES[0][1]);
  const [first, ...rest] = KITCHEN_L_DESIGN.placements;
  if (first === undefined) throw new Error("no body");
  const UNREADABLE: Design = {
    ...KITCHEN_L_DESIGN,
    placements: [
      {
        ...first,
        body: { ...first.body, buildId: "a-body-no-catalogue-holds" },
      },
      ...rest,
    ],
  };

  it.each(["sent", "current"] as const)(
    "lists every body of the readable %s copy, marking nothing against the copy it cannot read",
    (version) => {
      const list = describeCabinetList({
        shown: { design: KITCHEN_L_DESIGN, version },
        other: UNREADABLE,
        content: words,
        priceBook: SAMPLE_PRICE_ROOT,
        sentLines: [],
      });

      expect(list.kind).toBe("available");
      if (list.kind !== "available") return;
      expect(rowsOf(list)).toHaveLength(KITCHEN_L_DESIGN.placements.length);
    },
  );
});

describe("a pair of identical copies", () => {
  it("marks no row and notes no change when the other copy is the same design", () => {
    const words = contentFor("ro", CATALOGUES[0][1]);
    for (const version of ["sent", "current"] as const) {
      const list = listOf({
        design: KITCHEN_L_DESIGN,
        version,
        other: KITCHEN_L_DESIGN,
        words,
      });

      expect(rowsOf(list).every((row) => row.change === "same")).toBe(true);
      expect(list.holdsChanges).toBe(false);
    }
  });
});
