// Criterion 2: the projection the review reads lists its groups and rows in the order ADR 0063 reads them. That the
// review prints exactly those rows is `qa-8c-parity-with-the-price-surfaces.adversarial.test.ts`'s.
import { type DisplayGroup } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { ARMS, composedKitchensOf } from "../support/swept-kitchens";
import { generatePricedKitchen } from "../support/generated-kitchens";

const FLOOR_PER_ARM = 80;

const WALL_RANK = { A: 0, B: 1, C: 2 } as const;
const BAND_RANK = { base: 0, wall: 1, column: 2 } as const;

function wallsOfGroups(groups: readonly DisplayGroup[]): readonly string[] {
  return [...new Set(groups.map((group) => group.wall))];
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

describe.each(ARMS)("over generated $name kitchens", (arm) => {
  it("composes enough kitchens for the sweep to certify the arm", () => {
    expect(composedKitchensOf(arm).length).toBeGreaterThanOrEqual(
      FLOOR_PER_ARM,
    );
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
