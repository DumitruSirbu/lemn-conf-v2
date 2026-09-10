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

import { kindLabel } from "../src/catalog.js";

import {
  cabinetHandleCount,
  carriesFronts,
  countHardwareMechanisms,
  doorBandHeightsMm,
  doorBandsMm,
  doorLeafCount,
  drawerCount,
  frontPopulationQueryFor,
  HINGES_PER_DOOR_LEAF,
  HINGES_PER_TALL_DOOR_LEAF,
  KITCHEN_L_BODY_CATALOG,
  NO_HARDWARE_MECHANISMS,
  projectDesignForDisplay,
  TALL_DOOR_LEAF_THRESHOLD_MM,
  TOP_ROW_Y0_MM,
  UndeclaredFrontPopulationError,
  type BodyCatalog,
  type BodyDefinition,
  type DisplayEntry,
  type FrontPopulationRule,
  type Handle,
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
function entryAt(
  overrides: Partial<DisplayEntry> & { buildId: string },
): DisplayEntry {
  return {
    placementId: `p-${overrides.buildId}`,
    label: kindLabel("under_test"),
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
  const declared = definitionOf("base-sink");
  if (!declared.fronts) {
    throw new Error(
      "base-sink declares no fronts, so removing them proves nothing",
    );
  }
  const withoutFronts = Object.fromEntries(
    Object.entries(declared).filter(([field]) => field !== "fronts"),
  ) as BodyDefinition;

  return new Map([["under-test", withoutFronts]]);
}

/** §5.5's three modes and the absence of one, which is a fourth case rather than a default: a
 *  placement that records nothing is what the whole seeded design is. */
const HANDLE_MODES_AND_NONE: readonly (Handle | undefined)[] = [
  undefined,
  "steel",
  "black",
  "push",
];

interface SizedRow {
  readonly buildId: string;
  readonly widthMm: number;
  readonly heightMm: number;
}

/** Every row of both catalogue populations (ADR 0011 Gap A), each insertable one at every width it
 *  declares. A seeded row is one already-built body, so its size decides nothing and its nominal is
 *  what a placement of it carries. */
const EVERY_CATALOGUE_ENTRY_AT_EVERY_SIZE: readonly SizedRow[] = [
  ...KITCHEN_L_BODY_CATALOG,
].flatMap(([buildId, definition]) => {
  const heightMm = definition.nominalHeightMm ?? definition.frameHeightMm ?? 0;
  const widths =
    definition.insertable === true && definition.sizesMm?.length
      ? definition.sizesMm
      : [definition.sizesMm?.[0] ?? 600];
  return widths.map((widthMm) => ({ buildId, widthMm, heightMm }));
});

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
  /** **The 16 is ADR 0092 Amendment C's correction**, not a new fact about the demo: `p15`–`p23`
   *  are nine top-row placements carrying 16 door leaves whose bars the scene has always hidden and
   *  whose latches pricing counted at zero. ADR 0070's totals table has no push row because the
   *  owner published no push figure, not because the kitchen has no latches in it. */
  it("counts 74 hinges, 5 drawers and 16 push-to-open", () => {
    expect(
      countHardwareMechanisms(SEEDED_ENTRIES, KITCHEN_L_BODY_CATALOG),
    ).toEqual({
      hinges: 74,
      drawers: 5,
      pushToOpen: 16,
    });
  });

  // Not a vacuous sweep — and the premise the superseded count rested on, stated as the measurement
  // it is: **no seeded placement records a handle at all**, and 16 of its fronts are push-to-open
  // regardless, by the slot. Reading the recorded mode instead is what answered zero.
  it("counts them over all 26 placements, none of which records a handle", () => {
    expect(SEEDED_ENTRIES.length).toBe(26);
    expect(SEEDED_ENTRIES.some((entry) => entry.handle !== undefined)).toBe(
      false,
    );
  });

  /** The 16 belong to the top row and to nothing else, so the number is a census rather than a
   *  total that happens to land. Every latch in the shipped demo stands at or above §6.5's module
   *  line, and no front below it carries one. */
  it("puts every one of the 16 in the top row and none below it", () => {
    const latchedFloorsMm = SEEDED_ENTRIES.filter(
      (entry) =>
        countHardwareMechanisms([entry], KITCHEN_L_BODY_CATALOG).pushToOpen > 0,
    ).map((entry) => entry.y0Mm);

    expect(latchedFloorsMm.length).toBe(9);
    for (const y0Mm of latchedFloorsMm) {
      expect(y0Mm).toBeGreaterThanOrEqual(TOP_ROW_Y0_MM);
    }
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

// ADR 0092 decision 3, Amendment C. The count is per opening front, and **which** bodies are
// push-to-open is `isPushToOpen`'s answer — the same one `scene-sync.ts` draws the bar by. Both
// directions of the disagreement it replaced are pinned from the failing side.
describe("push-to-open is counted per opening front, on the bodies whose bars are not on them", () => {
  /** A genuine push kitchen: every body that **can** take a mode records one. Named for what it is,
   *  unlike the fixture it replaces, which stamped `push` onto `hood-600`, `open-shelf-600`,
   *  `fridge-free-700` and both corner returns and so exercised direction B while claiming to
   *  demonstrate a push kitchen. */
  const pushWhereverPermitted = SEEDED_ENTRIES.map((entry) =>
    definitionOf(entry.buildId).canHandle
      ? { ...entry, handle: "push" as const }
      : entry,
  );

  /** Read from the declaration rather than divided out of the hinge total, because a leaf carries
   *  two hinges or three and the two are not recoverable from a sum. */
  function openingFrontsOf(entry: DisplayEntry): number {
    const query = frontPopulationQueryFor({
      body: entry,
      definition: definitionOf(entry.buildId),
    });
    return doorLeafCount(query) + drawerCount(query);
  }

  it("puts exactly one latch on every opening front of a body that records push", () => {
    for (const entry of pushWhereverPermitted) {
      if (!definitionOf(entry.buildId).canHandle) continue;

      expect(
        countHardwareMechanisms([entry], KITCHEN_L_BODY_CATALOG).pushToOpen,
      ).toBe(openingFrontsOf(entry));
    }
  });

  /** 39, not 41: the two leaves that keep their bars are `base-corner-x-900`'s and
   *  `wall-corner-return-570`'s, which declare `canHandle: false` and stand below the top row. Their
   *  `-top` twin's leaf is counted, because the slot hides its bar. */
  it("counts 39 of the seeded kitchen's 41 opening fronts", () => {
    expect(
      countHardwareMechanisms(pushWhereverPermitted, KITCHEN_L_BODY_CATALOG)
        .pushToOpen,
    ).toBe(39);
  });

  it("leaves the hinge and drawer counts alone", () => {
    const { hinges, drawers } = countHardwareMechanisms(
      pushWhereverPermitted,
      KITCHEN_L_BODY_CATALOG,
    );

    expect([hinges, drawers]).toEqual([74, 5]);
  });

  /** **Direction B, from the failing side** (ADR 0092 decision 3, Amendment C). A recorded `push` on
   *  a body whose definition refuses a mode keeps its bars in the scene, so it takes no latch — and
   *  a fixture that only stamps `push` on `canHandle: true` bodies does not witness it. */
  it("counts none for a recorded push on a body that permits no mode", () => {
    const cornerReturn = entryAt({
      buildId: "wall-corner-return-570",
      y0Mm: 1_500,
      handle: "push",
    });

    expect(definitionOf("wall-corner-return-570").canHandle).toBe(false);
    expect(
      countHardwareMechanisms([cornerReturn], KITCHEN_L_BODY_CATALOG),
    ).toEqual({ hinges: 2, drawers: 0, pushToOpen: 0 });
  });

  /** Its `-top` twin declares the identical `carriesHandles(1)` and the identical `canHandle: false`
   *  and differs only by the row it stands on — which is the whole of ADR 0092's `canHandle` ruling,
   *  measured. */
  it("counts one for the same body's twin in the top row", () => {
    expect(
      countHardwareMechanisms(
        [
          entryAt({
            buildId: "wall-corner-return-570-top",
            y0Mm: TOP_ROW_Y0_MM,
          }),
        ],
        KITCHEN_L_BODY_CATALOG,
      ),
    ).toEqual({ hinges: 2, drawers: 0, pushToOpen: 1 });
  });

  it("counts none for a recorded bar, including in the top row", () => {
    const withSteel = SEEDED_ENTRIES.map((entry) =>
      definitionOf(entry.buildId).canHandle
        ? { ...entry, handle: "steel" as const }
        : entry,
    );

    expect(
      countHardwareMechanisms(withSteel, KITCHEN_L_BODY_CATALOG).pushToOpen,
      // The one that remains is `wall-corner-return-570-top`, whose bar no recorded mode can
      // restore.
    ).toBe(1);
  });
});

/** **A latch is never counted on a front that does not open**, over the whole catalogue at every
 *  legal size and at every handle mode, on the floor and in the top row. `hood`, `open-shelf` and
 *  `fridge-free` declare `NO_OPENING_FRONTS` and contribute zero however they are stamped. */
describe("the push count never exceeds the fronts that open", () => {
  it.each(HANDLE_MODES_AND_NONE)("holds at handle %s", (handle) => {
    for (const sized of EVERY_CATALOGUE_ENTRY_AT_EVERY_SIZE) {
      for (const y0Mm of [0, TOP_ROW_Y0_MM]) {
        const entry = entryAt({
          ...sized,
          y0Mm,
          ...(handle ? { handle } : {}),
        });
        const { hinges, drawers, pushToOpen } = countHardwareMechanisms(
          [entry],
          KITCHEN_L_BODY_CATALOG,
        );
        const leaves = doorLeafCount(
          frontPopulationQueryFor({
            body: entry,
            definition: definitionOf(sized.buildId),
          }),
        );

        expect(hinges).toBeGreaterThanOrEqual(0);
        expect(pushToOpen).toBeLessThanOrEqual(leaves + drawers);
      }
    }
  });

  it.each(["hood-600", "open-shelf-600", "fridge-free-700"])(
    "contributes nothing at all for %s, however it is stamped",
    (buildId) => {
      for (const handle of HANDLE_MODES_AND_NONE) {
        for (const y0Mm of [0, TOP_ROW_Y0_MM]) {
          expect(
            countHardwareMechanisms(
              [entryAt({ buildId, y0Mm, ...(handle ? { handle } : {}) })],
              KITCHEN_L_BODY_CATALOG,
            ),
          ).toEqual(NO_HARDWARE_MECHANISMS);
        }
      }
    },
  );
});

/**
 * **An opening front always has something to open it** (ADR 0092 decision 3, Amendment C).
 *
 * A row declaring leaves or drawers and **no** cabinet handle would have a front with neither a bar
 * nor — below the top row — a latch, and nothing could open it. No row violates it today; the case
 * is a catalogue defect this gate refuses rather than a question pricing invents an answer for.
 *
 * **The one place `cabinetHandles` is read for this wave**, and it is a static gate: ADR 0070
 * decision 2 makes that number a count of the bars the *body* builds, deliberately decoupled from
 * the fronts that open — `wall-corner-return-570` declares `carriesHandles(1)` beside two openings —
 * so it is not a source the predicate may take.
 */
describe("every opening front in the catalogue has a bar or a latch available to it", () => {
  it("declares a cabinet handle wherever it declares something that opens", () => {
    const violating = EVERY_CATALOGUE_ENTRY_AT_EVERY_SIZE.filter((sized) => {
      const query = frontPopulationQueryFor({
        body: entryAt(sized),
        definition: definitionOf(sized.buildId),
      });
      const openingFronts = doorLeafCount(query) + drawerCount(query);
      if (openingFronts === 0) return false;
      return (
        cabinetHandleCount({
          buildId: sized.buildId,
          rule: definitionOf(sized.buildId).cabinetHandles,
          widthMm: sized.widthMm,
        }) === 0
      );
    });

    expect(violating).toEqual([]);
  });

  // Not a vacuous sweep: most of the catalogue does declare something that opens.
  it("sweeps rows that actually declare opening fronts", () => {
    const opening = EVERY_CATALOGUE_ENTRY_AT_EVERY_SIZE.filter((sized) => {
      const query = frontPopulationQueryFor({
        body: entryAt(sized),
        definition: definitionOf(sized.buildId),
      });
      return doorLeafCount(query) + drawerCount(query) > 0;
    });

    expect(opening.length).toBeGreaterThan(20);
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
