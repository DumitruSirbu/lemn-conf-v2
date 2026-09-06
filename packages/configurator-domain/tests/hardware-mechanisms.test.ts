// ADR 0070 decision 1's three mechanism counts, from the domain side, and ADR 0092's readings of
// the three places it is ambiguous: the drawer denominator (decision 2), the 900 mm boundary's
// strictness and what it is applied *to* (decision 5), and the two rows 6S left open (decision 8).
//
// **This file counts mechanisms and asserts no amount.** `hardware-mechanisms.ts` imports no price
// book by construction (ADR 0062, ADR 0092 decision 4) and neither does its test.
//
// The wave's ADR 0028 parity check is the first block: ADR 0070's 74 hinges and 5 drawers were
// derived by the owner from the real catalogue **before 6S declared any of this**, so the two
// derivations are independent and their agreement means something. If they disagree the declaration
// is wrong and the wave stops — this file does not move the expected number to whatever the code
// produces.
import { describe, expect, it } from "vitest";

import {
  carriesFronts,
  countHardwareMechanisms,
  doorBandHeightsMm,
  doorBandsMm,
  frontPopulationQueryFor,
  HINGES_PER_DOOR_LEAF,
  HINGES_PER_TALL_DOOR_LEAF,
  KITCHEN_L_BODY_CATALOG,
  NO_HARDWARE_MECHANISMS,
  projectDesignForDisplay,
  TALL_DOOR_LEAF_THRESHOLD_MM,
  UndeclaredFrontPopulationError,
  type BodyCatalog,
  type BodyDefinition,
  type DisplayEntry,
  type FrontPopulationRule,
} from "../src/index.js";
import { KITCHEN_L_DESIGN } from "../src/fixtures/kitchen-l-design.js";

const SEEDED_ENTRIES: readonly DisplayEntry[] = projectDesignForDisplay(
  KITCHEN_L_DESIGN,
  KITCHEN_L_BODY_CATALOG,
).flatMap((group) => group.entries);

function definitionOf(buildId: string): BodyDefinition {
  const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
  if (!definition) throw new Error(`No catalogue entry for "${buildId}"`);
  return definition;
}

/** A display entry at a real catalogue row, with only what the caller cares about stated. The
 *  fields this module never reads carry obvious placeholders, so a reader can see at a glance that
 *  a wall, a band and a position are not inputs to a mechanism count. */
function entryAt(overrides: Partial<DisplayEntry> & { buildId: string }): DisplayEntry {
  return {
    placementId: `p-${overrides.buildId}`,
    label: "under test",
    wall: "A",
    band: "base",
    rawBand: "base",
    alongMm: 0,
    y0Mm: 0,
    widthMm: 600,
    heightMm: 720,
    ...overrides,
  };
}

/** One row under test, declaring exactly the leaves the case is about. Spread from a real
 *  definition rather than cast from a literal, so the row stays a valid `BodyDefinition` and the
 *  case differs from the shipped catalogue in the one field it is about. */
function catalogDeclaring(fronts: FrontPopulationRule): BodyCatalog {
  return new Map([["under-test", { ...definitionOf("base-sink"), fronts }]]);
}

/** A row that declares no fronts at all — the key **absent**, not present and `undefined`, which is
 *  what `exactOptionalPropertyTypes` distinguishes and what a catalogue assembled outside TypeScript
 *  actually arrives as. */
function catalogDeclaringNothing(): BodyCatalog {
  const { fronts: _undeclared, ...withoutFronts } = definitionOf("base-sink");
  return new Map([["under-test", withoutFronts]]);
}

function leavesOf(bandHeightsMm: readonly number[], leavesPerBand: number) {
  return carriesFronts({
    doorBands: doorBandsMm(bandHeightsMm),
    leavesPerBand,
    drawers: 0,
  });
}

// **ADR 0070's own figure, and the only reason the number means anything.** 74 = 34 leaves at two
// hinges plus the pantry's two 1290 mm leaves at three.
describe("the seeded kitchen's mechanisms, against ADR 0070's independent derivation", () => {
  it("counts 74 hinges, 5 drawers and 0 push-to-open", () => {
    expect(countHardwareMechanisms(SEEDED_ENTRIES, KITCHEN_L_BODY_CATALOG)).toEqual({
      hinges: 74,
      drawers: 5,
      pushToOpen: 0,
    });
  });

  // Not a vacuous sweep, and the push count is zero because no seeded placement chose a handle —
  // which is what makes ADR 0092 decision 6's reconciliations safe to compute at zero push
  // mechanisms, and what a fixture adding a push placement would quietly break.
  it("counts them over all 26 placements, none of which is push-to-open", () => {
    expect(SEEDED_ENTRIES.length).toBe(26);
    expect(SEEDED_ENTRIES.some((entry) => entry.handle === "push")).toBe(false);
  });

  it("answers zero of each for a design with no bodies", () => {
    expect(countHardwareMechanisms([], KITCHEN_L_BODY_CATALOG)).toEqual(
      NO_HARDWARE_MECHANISMS,
    );
  });
});

// ADR 0070's wording is *taller than 900*. `>=` is what a re-implementation gets wrong, and nothing
// in the seeded kitchen would notice: its only leaves over the threshold are two 1290s.
describe("the 900 mm threshold is a strict boundary", () => {
  const hingesOnOneLeafOf = (leafHeightMm: number): number =>
    countHardwareMechanisms(
      [entryAt({ buildId: "under-test" })],
      catalogDeclaring(leavesOf([leafHeightMm], 1)),
    ).hinges;

  it("gives a leaf at exactly 900 mm two hinges", () => {
    expect(hingesOnOneLeafOf(TALL_DOOR_LEAF_THRESHOLD_MM)).toBe(
      HINGES_PER_DOOR_LEAF,
    );
  });

  it("gives a leaf at 901 mm three", () => {
    expect(hingesOnOneLeafOf(TALL_DOOR_LEAF_THRESHOLD_MM + 1)).toBe(
      HINGES_PER_TALL_DOOR_LEAF,
    );
  });
});

// **The trap this wave exists to not fall into.** Both readings are plausible and only one is
// right, so the wrong one is computed here and pinned as *different*, rather than left as a comment
// saying it would be.
describe("the threshold is applied to leaves, never to bands", () => {
  const pantryAt600 = entryAt({
    buildId: "tall-pantry",
    widthMm: 600,
    heightMm: 2200,
  });

  it("reads a 600 mm pantry as four leaves, two of them tall", () => {
    const query = frontPopulationQueryFor({
      body: pantryAt600,
      definition: definitionOf("tall-pantry"),
    });

    expect(doorBandHeightsMm(query)).toEqual([1290, 790]);
    expect(
      countHardwareMechanisms([pantryAt600], KITCHEN_L_BODY_CATALOG).hinges,
    ).toBe(HINGES_PER_TALL_DOOR_LEAF * 2 + HINGES_PER_DOOR_LEAF * 2);
  });

  // The band-wise reading, written out so the 45 is measured rather than asserted from the ADR's
  // prose. It must not equal the shipped answer.
  it("counts 74 over the seeded kitchen where the band reading counts 45", () => {
    const bandWiseHinges = SEEDED_ENTRIES.reduce(
      (total, entry) =>
        total +
        doorBandHeightsMm(
          frontPopulationQueryFor({
            body: entry,
            definition: definitionOf(entry.buildId),
          }),
        ).reduce(
          (bands, bandHeightMm) =>
            bands +
            (bandHeightMm > TALL_DOOR_LEAF_THRESHOLD_MM
              ? HINGES_PER_TALL_DOOR_LEAF
              : HINGES_PER_DOOR_LEAF),
          0,
        ),
      0,
    );

    expect(bandWiseHinges).toBe(45);
    expect(
      countHardwareMechanisms(SEEDED_ENTRIES, KITCHEN_L_BODY_CATALOG).hinges,
    ).toBe(74);
  });
});

// ADR 0092 decision 1: the count is a property of the body standing in the kitchen, read through
// `frontPopulationQueryFor` from the placement's own width and height — and a row that declares its
// band heights ignores both.
describe("the counts come from the placement's own catalogue entry", () => {
  it("does not move the pantry's hinges when its placement grows from 2200 to 2600", () => {
    const at = (heightMm: number): number =>
      countHardwareMechanisms(
        [entryAt({ buildId: "tall-pantry", widthMm: 600, heightMm })],
        KITCHEN_L_BODY_CATALOG,
      ).hinges;

    expect(at(2600)).toBe(at(2200));
  });

  // The other half: a width-following row *does* move with its placement's width, so the test above
  // is not passing because nothing is read at all.
  it("does move the pantry's hinges when its placement narrows to one leaf per band", () => {
    const at = (widthMm: number): number =>
      countHardwareMechanisms(
        [entryAt({ buildId: "tall-pantry", widthMm, heightMm: 2200 })],
        KITCHEN_L_BODY_CATALOG,
      ).hinges;

    expect(at(400)).toBeLessThan(at(600));
  });
});

// ADR 0092 decision 3. The defect 6T exists to remove is a push-to-open kitchen billing zero, so it
// is pinned from the failing side rather than implied by the formula.
describe("push-to-open is counted per opening front, and only on a push body", () => {
  const pushEverywhere = SEEDED_ENTRIES.map((entry) => ({
    ...entry,
    handle: "push" as const,
  }));

  it("counts one per door leaf and one per drawer across the seeded kitchen", () => {
    expect(
      countHardwareMechanisms(pushEverywhere, KITCHEN_L_BODY_CATALOG).pushToOpen,
    ).toBe(36 + 5);
  });

  it("leaves the hinge and drawer counts alone", () => {
    const { hinges, drawers } = countHardwareMechanisms(
      pushEverywhere,
      KITCHEN_L_BODY_CATALOG,
    );

    expect([hinges, drawers]).toEqual([74, 5]);
  });

  it("counts none for a steel handle and none for no handle at all", () => {
    const withSteel = SEEDED_ENTRIES.map((entry) => ({
      ...entry,
      handle: "steel" as const,
    }));

    expect(
      countHardwareMechanisms(withSteel, KITCHEN_L_BODY_CATALOG).pushToOpen,
    ).toBe(0);
    expect(
      countHardwareMechanisms(SEEDED_ENTRIES, KITCHEN_L_BODY_CATALOG).pushToOpen,
    ).toBe(0);
  });
});

// ADR 0092 decision 8 — neither row appears in the seeded design, which is exactly why neither may
// be settled by whichever line happens to typecheck.
describe("the two rows ADR 0092 decision 8 resolves", () => {
  it("prices wall-lift as one hinged leaf at two hinges, and its lift arm as nothing", () => {
    expect(
      countHardwareMechanisms(
        [entryAt({ buildId: "wall-lift", widthMm: 600, heightMm: 700 })],
        KITCHEN_L_BODY_CATALOG,
      ),
    ).toEqual({ hinges: HINGES_PER_DOOR_LEAF, drawers: 0, pushToOpen: 0 });
  });

  it("prices base-bottle-cargo as one drawer and no hinge", () => {
    expect(
      countHardwareMechanisms(
        [entryAt({ buildId: "base-bottle-cargo", widthMm: 300 })],
        KITCHEN_L_BODY_CATALOG,
      ),
    ).toEqual({ hinges: 0, drawers: 1, pushToOpen: 0 });
  });
});

// ADR 0092 decision 1, and ADR 0061 decision 4 one declaration over: a missing declaration is never
// read as zero mechanisms. Zero is what a silent fallback would bill a kitchen's hinges at.
describe("a body whose front population cannot be read refuses", () => {
  it("throws for an entry whose catalogue row declares no fronts", () => {
    expect(() =>
      countHardwareMechanisms(
        [entryAt({ buildId: "under-test" })],
        catalogDeclaringNothing(),
      ),
    ).toThrow(UndeclaredFrontPopulationError);
  });

  it("throws for a body the catalogue does not hold at all", () => {
    expect(() =>
      countHardwareMechanisms(
        [entryAt({ buildId: "not-in-the-catalogue" })],
        KITCHEN_L_BODY_CATALOG,
      ),
    ).toThrow(UndeclaredFrontPopulationError);
  });

  it("names the build id it could not read", () => {
    expect(() =>
      countHardwareMechanisms(
        [entryAt({ buildId: "not-in-the-catalogue" })],
        KITCHEN_L_BODY_CATALOG,
      ),
    ).toThrow(/not-in-the-catalogue/);
  });

  // The whole design refuses, rather than the undeclared body contributing zero to a total that
  // still looks like a number.
  it("refuses the whole design rather than skipping the body", () => {
    expect(() =>
      countHardwareMechanisms(
        [...SEEDED_ENTRIES, entryAt({ buildId: "not-in-the-catalogue" })],
        KITCHEN_L_BODY_CATALOG,
      ),
    ).toThrow(UndeclaredFrontPopulationError);
  });
});
