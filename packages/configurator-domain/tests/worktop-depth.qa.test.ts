// The seeded fixture's wall depth is compared against the map, not merely equal to it: `worktop-depth.test.ts` gates
// only the pair of constants the map collapsed, and the fixture was a third copy of 330 that nothing checked. Also: the
// refusal swept across the lookup's input range, and `declaredWorktopDepthsMm()` must not hand out the map's keys.
import { describe, expect, it } from "vitest";

import type { BodyDefinition } from "../src/void-engine.js";
import { KITCHEN_L_BODY_CATALOG } from "../src/fixtures/kitchen-l-design.js";
import {
  declaredWorktopDepthsMm,
  UnknownWorktopDepthError,
  wallDepthMmForWorktop,
  WORKTOP_DEPTH_MM,
} from "../src/worktop-depth.js";

/** What `buildKitchen()` builds a wall carcass to, so what the seeded wall and top rows must reproduce. Not the map's
 *  output: the reference room is vendored supplier geometry gated by `kitchen-parts.decomposition.parity.test.ts` at
 *  1e-6 m. It coincides with the map's `600 -> 330` row, which is asserted once below. */
const REFERENCE_ROOM_WALL_DEPTH_MM = 330;

/** What `wallCabinet` stands in front of the shell: an 18 mm door slab and a bar handle reaching 21 mm past it
 *  (`kitchen-parts.ts`, `FRONT_ASSEMBLY_D`; the 4 mm shadow gap between two leaves never reaches the depth axis). A
 *  literal because this package must not depend on the Three.js adapter (`eslint.config.mjs` boundary rule);
 *  `kitchen-parts.decomposition.parity.test.ts` turns red on a wrong number. */
const WALL_FRONT_ASSEMBLY_MM = 39;

/** ADR 0036 decision 1: a declared dimension is the finished cabinet, so a seeded wall row's seat is the declared
 *  depth less the front assembly. */
function referenceRoomWallSeatMm(definition: BodyDefinition): number {
  // An open shelf has no door or handle, so its seat and its declared depth are the same number.
  const frontMm =
    definition.kind === "open_shelf_unit" ? 0 : WALL_FRONT_ASSEMBLY_MM;
  return REFERENCE_ROOM_WALL_DEPTH_MM - frontMm;
}

/** Catalogue ids whose `frameDepthMm` is deliberately not the map's row, stated as data so a body that quietly stopped
 *  following the map cannot hide by being filtered out. `hood`/`hood-600` seat at `2 × 600 − 500`: ADR 0039 decisions
 *  1-2 exempt the hood from the map and hang it at the front, and `frameDepthMm` is twice the rear overhang (ADR 0018);
 *  its 500 survives as `nominalDepthMm`. The two deep top cabinets stand over full-height columns where §7's
 *  head-clearance cap is lifted, and seat at the declared 600 less the front assembly (ADR 0036 decision 1). */
const DEPTH_DECIDED_INDEPENDENTLY_MM: Readonly<Record<string, number>> = {
  hood: 2 * 600 - 500,
  "hood-600": 2 * 600 - 500,
  "wall-2door-600-deep-top": 600 - WALL_FRONT_ASSEMBLY_MM,
  "wall-2door-700-over-fridge": 600 - WALL_FRONT_ASSEMBLY_MM,
};

/** The nine seeded wall/top rows measured as already correct at 330, plus §7's wall entries; counted so the sweep
 *  cannot go vacuous if the fixture is renamed. `wall-2door` and `wall-1door` are one `wall-cabinet` entry (ADR
 *  0033). */
const MAP_GOVERNED_ENTRY_COUNT = 12;
const SEEDED_ROW_COUNT = 9;
const CATALOGUE_ENTRY_COUNT = 3;

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

  it("sweeps at least the nine seeded rows plus §7's wall entries", () => {
    // Counted per population as well as in total: a split that put every entry on one side would leave the other sweep
    // asserting nothing.
    expect(mapGovernedEntries().length).toBeGreaterThanOrEqual(
      MAP_GOVERNED_ENTRY_COUNT,
    );
    expect(seededEntries().length).toBeGreaterThanOrEqual(SEEDED_ROW_COUNT);
    expect(catalogueEntries().length).toBeGreaterThanOrEqual(
      CATALOGUE_ENTRY_COUNT,
    );
  });

  it("gives every seeded wall and top row the depth the reference room builds", () => {
    // The fixture is bound to `buildKitchen()`, not to the current worktop: asserting these rows follow the map would
    // put the fixture under two authorities that contradict each other the moment the worktop moves. The link between
    // the two is asserted once, below.
    const offenders = seededEntries()
      .filter(
        ([, definition]) =>
          definition.frameDepthMm !== referenceRoomWallSeatMm(definition),
      )
      .map(
        ([buildId, definition]) =>
          `${buildId}=${String(definition.frameDepthMm)}`,
      );

    expect(offenders).toEqual([]);
  });

  /** Both populations answer with one rule through `referenceRoomWallSeatMm`: `frameDepthMm` is twice the rear overhang
   *  (ADR 0018), so the §7 rows equal the map's row less the front assembly, as the seeded rows do (ADR 0075
   *  decision 1). */
  it("gives every §7 wall entry the map's own row, less what stands in front of it", () => {
    const offenders = catalogueEntries()
      .filter(
        ([, definition]) =>
          definition.frameDepthMm !== referenceRoomWallSeatMm(definition),
      )
      .map(
        ([buildId, definition]) =>
          `${buildId}=${String(definition.frameDepthMm)}`,
      );

    expect(offenders).toEqual([]);
  });

  // The nominal is the map's row outright, the finished cabinet the customer is told about (ADR 0036 decision 1);
  // asserted beside the seat so the pair cannot drift into each other.
  it("still declares the map's row as every §7 wall entry's nominal depth", () => {
    const expectedMm = wallDepthMmForWorktop(WORKTOP_DEPTH_MM);
    const offenders = catalogueEntries()
      .filter(([, definition]) => definition.nominalDepthMm !== expectedMm)
      .map(
        ([buildId, definition]) =>
          `${buildId}=${String(definition.nominalDepthMm ?? "-")}`,
      );

    expect(offenders).toEqual([]);
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

  // Both fields, because only one decides anything: `void-engine.ts` reads `frameDepthMm`, not `nominalDepthMm`, for a
  // placement with no measured `seatDepthMm`. The hood is spread from `wallCabinet(...)`, which stamps `frameDepthMm`
  // from the map-governed `WALL_DEPTH_MM`, so both fields are declared on it to stay out of the map's reach (ADR 0039
  // decision 1). The one entry where the two deliberately disagree: 500 is what a hood is, 700 is where it hangs.
  it("gives the §7 hood entry a standard 500 mm nominal and a front-hung 700 mm seat", () => {
    const hood = KITCHEN_L_BODY_CATALOG.get("hood");

    expect(hood?.nominalDepthMm).toBe(500);
    expect(hood?.frameDepthMm).toBe(2 * 600 - 500);
  });
});

describe("the refusal, swept across the lookup's whole input range", () => {
  // The map is a `Map`, so `"constructor"`-shaped keys cannot reach a prototype value, but `Map` matches by
  // SameValueZero: `-0` finds a `0` row and `NaN` a `NaN` row. Neither is declared, so both must refuse.
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
