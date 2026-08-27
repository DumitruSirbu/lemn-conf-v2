// Adversarial QA for M5 wave 5A's worktop → wall depth map.
//
// `worktop-depth.test.ts` gates the pair the wave collapsed — `catalog.ts`'s `WALL_DEPTH_MM` and
// `insert-fit.ts`'s `WALL_CARCASS_MAX_DEPTH_OVER_WORKTOP_M`. This file attacks what that gate does
// **not** reach:
//
//   1. **The seeded fixture is a third copy of 330.** `M5-width.md`'s Depth criteria claim the
//      single-source gate "is what makes the fixture's 330 checkable rather than a number somebody
//      typed". Nothing compared them. Measured: with the map's row temporarily moved to `600 -> 350`
//      the fixture stayed at 330 and the three-adapter's "agrees with the swap route into the same
//      slot" went red — the two routes agree today only because the fixture happens to carry the
//      number the map produces. The sweep below is the missing comparison.
//   2. **The refusal, swept rather than sampled.** `-0`, `Infinity`, `-Infinity` and the shape of
//      the message in every case, not just for `650`.
//   3. **`declaredWorktopDepthsMm()` must not hand out the live map's keys.**
import { describe, expect, it } from "vitest";

import type { BodyDefinition } from "../src/void-engine.js";
import { KITCHEN_L_BODY_CATALOG } from "../src/fixtures/kitchen-l-design.js";
import {
  declaredWorktopDepthsMm,
  UnknownWorktopDepthError,
  wallDepthMmForWorktop,
  WORKTOP_DEPTH_MM,
} from "../src/worktop-depth.js";

/** Every catalogue id whose depth is deliberately **not** the map's row, with the number it is
 *  instead. Stated as data so a body that quietly stopped following the map cannot hide by being
 *  filtered out: anything in the wall or top band and absent from this record must equal the map.
 *
 *  `hood`/`hood-600` — a canopy, 500, and whether a hood follows the worktop is undecided
 *  (`M5-width.md`, *Not established*). The two deep top cabinets stand over full-height columns
 *  where §7's head-clearance cap is lifted, which is backlog entry 5's whole decision. */
const DEPTH_DECIDED_INDEPENDENTLY_MM: Readonly<Record<string, number>> = {
  hood: 500,
  "hood-600": 500,
  "wall-2door-600-deep-top": 600,
  "wall-2door-700-over-fridge": 600,
};

/** The nine seeded wall/top rows `M5-width.md` measured as already correct at 330, plus the four
 *  §7 wall entries. Counted rather than trusted, so the sweep cannot go vacuous if the fixture is
 *  renamed out from under it. */
const MAP_GOVERNED_ENTRY_COUNT = 13;
const SEEDED_ROW_COUNT = 9;
const CATALOGUE_ENTRY_COUNT = 4;

/** What `buildKitchen()` actually builds a wall carcass to, and therefore what the seeded fixture's
 *  wall and top rows must reproduce. **Not the map's output**: the reference room is fixed geometry
 *  vendored from the supplier, and `kitchen-parts.decomposition.parity.test.ts` gates every seeded
 *  `frame.d` against it at 1e-6 m. It coincides with the map's `600 -> 330` row, which is a fact to
 *  assert once (below) rather than a reason to bind the fixture to whatever worktop is current. */
const REFERENCE_ROOM_WALL_DEPTH_MM = 330;

function wallAndTopEntries(): (readonly [string, BodyDefinition])[] {
  return [...KITCHEN_L_BODY_CATALOG.entries()].filter(
    ([, definition]) => definition.band === "wall" || definition.band === "top",
  );
}

/** The map-governed entries, split by which authority owns their depth: a seeded row reproduces
 *  what `buildKitchen()` built, a §7 entry is what the map produces for the current worktop. */
function mapGovernedEntries(): (readonly [string, BodyDefinition])[] {
  return wallAndTopEntries().filter(
    ([buildId]) => !(buildId in DEPTH_DECIDED_INDEPENDENTLY_MM),
  );
}

function seededEntries(): (readonly [string, BodyDefinition])[] {
  return mapGovernedEntries().filter(
    ([, definition]) => !definition.insertable,
  );
}

function catalogueEntries(): (readonly [string, BodyDefinition])[] {
  return mapGovernedEntries().filter(([, definition]) => definition.insertable);
}

describe("the seeded fixture's depths are checked against the map, not merely equal to it", () => {
  it("finds every wall and top entry, and every named exception really exists", () => {
    const entries = wallAndTopEntries();
    const ids = entries.map(([buildId]) => buildId);

    expect(entries.length).toBeGreaterThan(0);
    for (const exceptionId of Object.keys(DEPTH_DECIDED_INDEPENDENTLY_MM)) {
      expect(ids).toContain(exceptionId);
    }
  });

  it("sweeps at least the nine seeded rows plus §7's four wall entries", () => {
    // Counted per population as well as in total: the two sweeps below take one each, and a split
    // that put all thirteen on one side would leave the other asserting nothing.
    expect(mapGovernedEntries().length).toBeGreaterThanOrEqual(
      MAP_GOVERNED_ENTRY_COUNT,
    );
    expect(seededEntries().length).toBeGreaterThanOrEqual(SEEDED_ROW_COUNT);
    expect(catalogueEntries().length).toBeGreaterThanOrEqual(
      CATALOGUE_ENTRY_COUNT,
    );
  });

  it("gives every seeded wall and top row the depth the reference room builds", () => {
    // The fixture is bound to `buildKitchen()`, not to whatever worktop is current: ADR 0025, and
    // `kitchen-parts.decomposition.parity.test.ts` derives each placement's world transform from
    // `record.frame.d` and needs a reference child within 1e-6 m. Asserting these rows follow the
    // map would put the fixture under two authorities that contradict each other the moment the
    // worktop moves. The link between the two is asserted once, below.
    const offenders = seededEntries()
      .filter(
        ([, definition]) =>
          definition.frameDepthMm !== REFERENCE_ROOM_WALL_DEPTH_MM,
      )
      .map(
        ([buildId, definition]) =>
          `${buildId}=${String(definition.frameDepthMm)}`,
      );

    expect(offenders).toEqual([]);
  });

  it("gives every §7 wall entry the map's own row", () => {
    const expectedMm = wallDepthMmForWorktop(WORKTOP_DEPTH_MM);
    const offenders = catalogueEntries()
      .filter(([, definition]) => definition.frameDepthMm !== expectedMm)
      .map(
        ([buildId, definition]) =>
          `${buildId}=${String(definition.frameDepthMm)}`,
      );

    expect(offenders).toEqual([]);
  });

  it("puts the shipped worktop's row on the depth the reference room builds", () => {
    // The one assertion that ties the two populations together, and the one that fails if the map's
    // 600 row ever leaves the shipped geometry behind.
    expect(wallDepthMmForWorktop(600)).toBe(REFERENCE_ROOM_WALL_DEPTH_MM);
  });

  it("leaves the two deep top cabinets and the seeded hood exactly where their record says", () => {
    for (const buildId of [
      "hood-600",
      "wall-2door-600-deep-top",
      "wall-2door-700-over-fridge",
    ]) {
      expect(KITCHEN_L_BODY_CATALOG.get(buildId)?.frameDepthMm).toBe(
        DEPTH_DECIDED_INDEPENDENTLY_MM[buildId],
      );
    }
  });

  // Both fields, because only one of them decides anything: `void-engine.ts` reads `frameDepthMm`,
  // not `nominalDepthMm`, for a placement with no measured `seatDepthMm`. The `hood` entry is
  // spread from `wallCabinet(...)`, which stamps `frameDepthMm` from the map-governed
  // `WALL_DEPTH_MM`, so the field has to be declared on the entry to stay out of the map's reach —
  // and whether a hood follows the worktop is undecided.
  it("gives the §7 hood entry the 500 mm its nominal declares, on both depth fields", () => {
    const hood = KITCHEN_L_BODY_CATALOG.get("hood");

    expect(hood?.nominalDepthMm).toBe(500);
    expect(hood?.frameDepthMm).toBe(500);
  });
});

describe("the refusal, swept across the lookup's whole input range", () => {
  // The map is a `Map`, not an object literal, so `"constructor"`-shaped keys cannot reach a
  // prototype value — but the numeric edges can, and `Map` matches by SameValueZero, which means
  // `-0` finds a `0` row and `NaN` finds a `NaN` row. Neither is declared, so both must refuse.
  it.each([
    { input: 0, named: "0" },
    { input: -0, named: "0" },
    { input: -600, named: "-600" },
    { input: 599.9, named: "599.9" },
    { input: 600.0000001, named: "600.0000001" },
    { input: 650, named: "650" },
    { input: 800, named: "800" },
    { input: Number.NaN, named: "NaN" },
    { input: Number.POSITIVE_INFINITY, named: "Infinity" },
    { input: Number.NEGATIVE_INFINITY, named: "-Infinity" },
    { input: Number.MAX_SAFE_INTEGER, named: "9007199254740991" },
  ])("refuses $named and names it in the message", ({ input, named }) => {
    let thrown: unknown;
    try {
      wallDepthMmForWorktop(input);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UnknownWorktopDepthError);
    if (!(thrown instanceof UnknownWorktopDepthError)) return;
    expect(thrown.message).toContain(`${named} mm`);
    // Diagnosable: the sentence also has to say what *was* on offer.
    for (const declared of declaredWorktopDepthsMm()) {
      expect(thrown.message).toContain(String(declared));
    }
  });

  it("accepts every declared row and only those", () => {
    for (const declared of declaredWorktopDepthsMm()) {
      expect(() => wallDepthMmForWorktop(declared)).not.toThrow();
    }
  });
});

describe("declaredWorktopDepthsMm hands out a copy, not the map's own keys", () => {
  it("survives a caller mutating what it returned", () => {
    const first = declaredWorktopDepthsMm() as number[];
    first.push(9999);
    first.length = 0;

    expect(declaredWorktopDepthsMm()).toEqual([600, 700]);
    expect(wallDepthMmForWorktop(600)).toBe(330);
    expect(() => wallDepthMmForWorktop(9999)).toThrow(UnknownWorktopDepthError);
  });
});
