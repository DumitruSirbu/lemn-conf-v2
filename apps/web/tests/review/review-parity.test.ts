// Criteria 1 and 2: the review lists exactly the rows the breakdown lists, in the order ADR 0063 reads them.
//
// Both surfaces now call one row builder, so comparing the review with the breakdown only proves the review adds
// or drops nothing after it. What can fail on the builder itself is the second comparison: the expected rows are
// rebuilt here from the projection's entries and the price lines by placement id, with the rounding and grouping
// written out a second time, and the order is checked against the ADR's rule rather than read off either view.
import { fc } from "@fast-check/vitest";
import {
  APPROVED_ROOM_POLICY,
  type CabinetPriceLine,
  type DesignRoom,
  type DisplayEntry,
  type DisplayGroup,
  type PriceLine,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { describeReview, type AvailableReview } from "@/review/review-model";
import { describePriceBreakdown } from "@/price/price-breakdown-model";

import { ro } from "../support/romanian-content";
import {
  generatePricedKitchen,
  type PricedKitchen,
} from "../support/generated-kitchens";

const SWEEP_SEED = 20_261_007;
const RUNS_PER_ARM = 120;
const FLOOR_PER_ARM = 80;
const CEILING_HEIGHTS_MM = [2200, 2600, 3900] as const;

const SHAPES = APPROVED_ROOM_POLICY.buildableShapes;

function requireStated<T>(value: T | undefined, what: string): T {
  if (value === undefined)
    throw new Error(`the approved policy states no ${what}`);
  return value;
}

const LINEAR = requireStated(SHAPES.linear, "linear room");
const L = requireStated(SHAPES.L, "L room");
const U = requireStated(SHAPES.U, "U room");

const heightMm = fc.constantFrom(...CEILING_HEIGHTS_MM);

function lengthIn(bounds: { readonly minMm: number; readonly maxMm: number }) {
  return fc.integer({ min: bounds.minMm, max: bounds.maxMm });
}

interface SweepArm {
  readonly name: string;
  readonly rooms: fc.Arbitrary<DesignRoom>;
  readonly walls: readonly string[];
}

const STRAIGHT_ARM: SweepArm = {
  name: "straight",
  walls: ["A"],
  rooms: fc.tuple(lengthIn(LINEAR.wallA), heightMm).map(
    ([widthMm, heightMm]): DesignRoom => ({
      shape: "linear",
      widthMm,
      depthMm: LINEAR.depthMm,
      heightMm,
    }),
  ),
};

const L_ARM: SweepArm = {
  name: "L",
  walls: ["A", "B"],
  rooms: fc.tuple(lengthIn(L.wallA), lengthIn(L.wallB), heightMm).map(
    ([widthMm, depthMm, heightMm]): DesignRoom => ({
      shape: "L",
      widthMm,
      depthMm,
      heightMm,
    }),
  ),
};

const RIGHT_HAND_L_ARM: SweepArm = {
  name: "right-hand L",
  walls: ["A", "B"],
  rooms: fc.tuple(lengthIn(L.wallA), lengthIn(L.wallB), heightMm).map(
    ([widthMm, depthMm, heightMm]): DesignRoom => ({
      shape: "L",
      widthMm,
      depthMm,
      heightMm,
      cornerDirection: "right",
    }),
  ),
};

const U_ARM: SweepArm = {
  name: "U",
  walls: ["A", "B", "C"],
  rooms: fc
    .tuple(lengthIn(U.wallA), lengthIn(U.wallB), lengthIn(U.wallC), heightMm)
    .map(
      ([widthMm, depthMm, wallCMm, heightMm]): DesignRoom => ({
        shape: "U",
        widthMm,
        depthMm,
        wallCMm,
        heightMm,
      }),
    ),
};

const ARMS: readonly SweepArm[] = [
  STRAIGHT_ARM,
  L_ARM,
  RIGHT_HAND_L_ARM,
  U_ARM,
];

const WALL_RANK = { A: 0, B: 1, C: 2 } as const;
const BAND_RANK = { base: 0, wall: 1, column: 2 } as const;

/** One row as the surfaces print it, so a mismatch names the field that differs. */
interface PrintedRow {
  readonly key: string;
  readonly label: string;
  readonly amountText: string;
}

interface PrintedGroup {
  readonly key: string;
  readonly rows: readonly PrintedRow[];
}

function printedGroups(
  groups: readonly {
    readonly key: string;
    readonly rows: readonly PrintedRow[];
  }[],
): readonly PrintedGroup[] {
  return groups.map(({ key, rows }) => ({
    key,
    rows: rows.map(({ key, label, amountText }) => ({
      key,
      label,
      amountText,
    })),
  }));
}

/** Rounded up to the thousand and grouped by three with a space, written a second time on purpose. */
function expectedAmountMdl(amountMinor: number): string {
  const mdl = Math.ceil(amountMinor / 100_000) * 1000;
  return String(mdl).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function expectedRowAmount(line: PriceLine): string {
  if (line.kind === "cabinet" && line.suppliedBy === "customer") {
    return ro.priceBreakdown.notIncluded;
  }
  if (line.amountMinor === 0) return ro.priceBreakdown.included;
  return expectedAmountMdl(line.amountMinor);
}

function cabinetLineOf(
  kitchen: PricedKitchen,
  placementId: string,
): CabinetPriceLine {
  if (!kitchen.pricing.ok) throw new Error("expected a priced kitchen");
  const line = kitchen.pricing.priced.lines.find(
    (candidate): candidate is CabinetPriceLine =>
      candidate.kind === "cabinet" && candidate.placementId === placementId,
  );
  if (line === undefined) throw new Error(`no cabinet line for ${placementId}`);
  return line;
}

function expectedGroupsOf(kitchen: PricedKitchen): readonly PrintedGroup[] {
  return kitchen.groups.map((group) => ({
    key: `${group.wall}-${group.band}`,
    rows: group.entries.map((entry) => ({
      key: entry.placementId,
      label: ro.priceBreakdown.placementLabel(
        ro.bodyLabel(entry.label),
        entry.widthMm,
      ),
      amountText: expectedRowAmount(cabinetLineOf(kitchen, entry.placementId)),
    })),
  }));
}

function expectedWholeKitchenRowsOf(
  kitchen: PricedKitchen,
): readonly PrintedRow[] {
  if (!kitchen.pricing.ok) throw new Error("expected a priced kitchen");
  return kitchen.pricing.priced.lines.flatMap((line) =>
    line.kind === "cabinet"
      ? []
      : [
          {
            key: line.lineId,
            label: ro.priceBreakdown.wholeKitchenLabel(
              ro.priceBreakdown.wholeKitchenCategories[line.kind],
              ro.bookText(line.name, line.nameKey),
            ),
            amountText: expectedRowAmount(line),
          },
        ],
  );
}

function reviewOf(kitchen: PricedKitchen): AvailableReview {
  const view = describeReview({
    content: ro,
    design: kitchen.design,
    pricing: kitchen.pricing,
    groups: kitchen.groups,
  });
  if (view.kind !== "available") {
    throw new Error("a composed kitchen was expected to be reviewable");
  }
  return view;
}

function breakdownOf(kitchen: PricedKitchen) {
  const view = describePriceBreakdown({
    content: ro,
    pricing: kitchen.pricing,
    groups: kitchen.groups,
  });
  if (view.kind !== "available") {
    throw new Error("a composed kitchen was expected to break down");
  }
  return view;
}

function wallsOfGroups(groups: readonly DisplayGroup[]): readonly string[] {
  return [...new Set(groups.map((group) => group.wall))];
}

function allEntriesOf(
  groups: readonly DisplayGroup[],
): readonly DisplayEntry[] {
  return groups.flatMap((group) => group.entries);
}

/** ADR 0063 as a rule over the sequence of groups and the entries under each, not as a sort. */
function readsInAdr0063Order(groups: readonly DisplayGroup[]): boolean {
  const groupsAscend = groups.every((group, index) => {
    const previous = groups[index - 1];
    if (previous === undefined) return true;
    return (
      WALL_RANK[group.wall] * 10 + BAND_RANK[group.band] >
      WALL_RANK[previous.wall] * 10 + BAND_RANK[previous.band]
    );
  });
  const rowsAreRowMajor = groups.every((group) =>
    group.entries.every((entry, index) => {
      const previous = group.entries[index - 1];
      if (previous === undefined) return true;
      return (
        entry.y0Mm > previous.y0Mm ||
        (entry.y0Mm === previous.y0Mm && entry.alongMm >= previous.alongMm)
      );
    }),
  );
  return groupsAscend && rowsAreRowMajor;
}

const sweptKitchens = new Map<string, readonly PricedKitchen[]>();

/** The kitchens an arm's seeded room sweep composes, generated once however many tests read them. */
function composedKitchensOf(arm: SweepArm): readonly PricedKitchen[] {
  const cached = sweptKitchens.get(arm.name);
  if (cached !== undefined) return cached;

  const composed: PricedKitchen[] = [];
  fc.assert(
    fc.property(arm.rooms, (room) => {
      const generated = generatePricedKitchen(room);
      if (generated.kind === "composed") composed.push(generated.kitchen);
    }),
    { numRuns: RUNS_PER_ARM, seed: SWEEP_SEED },
  );
  sweptKitchens.set(arm.name, composed);
  return composed;
}

describe.each(ARMS)("over generated $name kitchens", (arm) => {
  it("composes enough kitchens for the sweep to certify the arm", () => {
    expect(composedKitchensOf(arm).length).toBeGreaterThanOrEqual(
      FLOOR_PER_ARM,
    );
  });

  it("prints the group keys, row keys, labels and amounts the projection and price lines say", () => {
    for (const kitchen of composedKitchensOf(arm)) {
      const review = reviewOf(kitchen);

      expect(printedGroups(review.groups)).toEqual(expectedGroupsOf(kitchen));
      expect(review.wholeKitchenRows).toEqual(
        expectedWholeKitchenRowsOf(kitchen),
      );
    }
  });

  it("equals the breakdown's groups and rows, in order", () => {
    for (const kitchen of composedKitchensOf(arm)) {
      const review = reviewOf(kitchen);
      const breakdown = breakdownOf(kitchen);

      expect(review.groups).toEqual(breakdown.groups);
      expect(review.wholeKitchenRows).toEqual(breakdown.wholeKitchenRows);
    }
  });

  it("reads wall A, then B, then C, hanging row before top row, and lists a wall only if it holds a body", () => {
    for (const kitchen of composedKitchensOf(arm)) {
      expect(readsInAdr0063Order(kitchen.groups)).toBe(true);
      expect(wallsOfGroups(kitchen.groups)).toEqual(arm.walls);
      expect(kitchen.groups.every((group) => group.entries.length > 0)).toBe(
        true,
      );
    }
  });

  it("lists every body once", () => {
    for (const kitchen of composedKitchensOf(arm)) {
      const rowKeys = reviewOf(kitchen).groups.flatMap((group) =>
        group.rows.map((row) => row.key),
      );

      expect(rowKeys).toEqual(
        allEntriesOf(kitchen.groups).map((entry) => entry.placementId),
      );
      expect(new Set(rowKeys).size).toBe(kitchen.design.placements.length);
    }
  });
});

describe("over generated U kitchens, wall C", () => {
  it("is a group in the review, with at least one body, for every composed U", () => {
    for (const kitchen of composedKitchensOf(U_ARM)) {
      const wallCGroups = reviewOf(kitchen).groups.filter((group) =>
        group.key.startsWith("C-"),
      );

      expect(wallCGroups.length).toBeGreaterThanOrEqual(1);
      expect(wallCGroups.every((group) => group.rows.length > 0)).toBe(true);
    }
  });
});

describe("the sweep's own anti-vacuity checks", () => {
  it("lets the ADR 0063 predicate fail on the column-major order the ADR rejected", () => {
    const group = generatedGroupWithTwoRows();
    const columnMajor: DisplayGroup = {
      ...group,
      entries: [...group.entries].sort(
        (left, right) => left.alongMm - right.alongMm || left.y0Mm - right.y0Mm,
      ),
    };

    expect(readsInAdr0063Order([group])).toBe(true);
    expect(readsInAdr0063Order([columnMajor])).toBe(false);
  });
});

function generatedGroupWithTwoRows(): DisplayGroup {
  for (const wallAMm of [3560, 3900, 4200, 4800, 5400]) {
    const generated = generatePricedKitchen({
      shape: "L",
      widthMm: wallAMm,
      depthMm: 2830,
      heightMm: 2600,
    });
    if (generated.kind !== "composed") continue;
    const twoRows = generated.kitchen.groups.find(
      (group) => new Set(group.entries.map((entry) => entry.y0Mm)).size > 1,
    );
    if (twoRows !== undefined) return twoRows;
  }
  throw new Error("no generated L held a group with two rows to transpose");
}
