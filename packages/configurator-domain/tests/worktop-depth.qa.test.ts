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

/** What `buildKitchen()` actually builds a wall carcass to, and therefore what the seeded fixture's
 *  wall and top rows must reproduce. **Not the map's output**: the reference room is fixed geometry
 *  vendored from the supplier, and `kitchen-parts.decomposition.parity.test.ts` gates every seeded
 *  `frame.d` against it at 1e-6 m. It coincides with the map's `600 -> 330` row, which is a fact to
 *  assert once (below) rather than a reason to bind the fixture to whatever worktop is current. */
const REFERENCE_ROOM_WALL_DEPTH_MM = 330;

/** What `wallCabinet` stands in front of the shell it is given: an 18 mm door slab and a bar handle
 *  reaching 21 mm past it (`kitchen-parts.ts`, `FRONT_ASSEMBLY_D`, measured with the real probe in
 *  wave 5F — **not** the "18 + the 4 mm gap" ADR 0036 estimated; that 4 mm is the lateral shadow gap
 *  between two leaves and never reaches the depth axis).
 *
 *  A literal here rather than an import: this package must not depend on the Three.js adapter
 *  (`eslint.config.mjs`'s boundary rule). What keeps the two honest is not this file but
 *  `kitchen-parts.decomposition.parity.test.ts`, which derives every seeded placement's world
 *  transform from its `frame.d` and needs a reference child within 1e-6 m — so a wrong number here
 *  turns that red rather than passing quietly. */
const WALL_FRONT_ASSEMBLY_MM = 39;

/** ADR 0036 decision 1: a declared dimension is the finished cabinet, so the **seat** a seeded wall
 *  row records is the declared depth less the front assembly. Before wave 5F the shell *was* the
 *  declared depth and the built front sat 39 mm proud of it. */
function referenceRoomWallSeatMm(definition: BodyDefinition): number {
  // An open shelf is four boards and a back panel: no door, no handle, nothing in front of the
  // shell, so its seat and its declared depth are the same number and always were.
  const frontMm =
    definition.kind === "open_shelf_unit" ? 0 : WALL_FRONT_ASSEMBLY_MM;
  return REFERENCE_ROOM_WALL_DEPTH_MM - frontMm;
}

/** Every catalogue id whose `frameDepthMm` is deliberately **not** the map's row, with the number
 *  it is instead. Stated as data so a body that quietly stopped following the map cannot hide by
 *  being filtered out: anything in the wall or top band and absent from this record must equal the
 *  map.
 *
 *  `hood`/`hood-600` — **700 since wave 5F**, and it is a seat rather than a depth. ADR 0039
 *  decision 1 keeps the hood exempt from the map at a standard 500 mm; decision 2 then hangs it at
 *  the front, so its group origin sits `600 − 250` off the wall and `frameDepthMm`, being twice the
 *  rear overhang (ADR 0018), is `2 × 600 − 500`. The 500 survives as its `nominalDepthMm`, asserted
 *  separately below.
 *
 *  The two deep top cabinets stand over full-height columns where §7's head-clearance cap is
 *  lifted, which is backlog entry 5's whole decision. **561 since 5F**, for the same reason the
 *  330 rows became 291: ADR 0036 decision 1 makes the declared 600 the finished cabinet, so the
 *  shell — and therefore the seat — is that less the 39 mm front assembly. */
const DEPTH_DECIDED_INDEPENDENTLY_MM: Readonly<Record<string, number>> = {
  hood: 2 * 600 - 500,
  "hood-600": 2 * 600 - 500,
  "wall-2door-600-deep-top": 600 - WALL_FRONT_ASSEMBLY_MM,
  "wall-2door-700-over-fridge": 600 - WALL_FRONT_ASSEMBLY_MM,
};

/** The nine seeded wall/top rows `M5-width.md` measured as already correct at 330, plus §7's wall
 *  entries. Counted rather than trusted, so the sweep cannot go vacuous if the fixture is renamed
 *  out from under it.
 *
 *  **Three catalogue entries since ADR 0033, where there were four**: `wall-2door` and `wall-1door`
 *  are one `wall-cabinet` row now. The seeded rows are untouched — the merge repointed their
 *  `catalogEquivalentId` and changed none of their geometry. */
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
          definition.frameDepthMm !== referenceRoomWallSeatMm(definition),
      )
      .map(
        ([buildId, definition]) =>
          `${buildId}=${String(definition.frameDepthMm)}`,
      );

    expect(offenders).toEqual([]);
  });

  /**
   * **The two populations now answer with one rule, which is the point.**
   *
   * This asserted the §7 rows equal the map's row outright — 330 — while the assertion above holds
   * the *seeded* rows to that row **less the front assembly**, 291. Both were called "the map's own
   * row" and they were two different numbers, which is the drift
   * [ADR 0028](../../../docs/decisions/0028-wall-depth-is-derived-from-the-worktop.md) exists to
   * stop, sitting between two tests in one file.
   *
   * [ADR 0075](../../../docs/decisions/0075-a-recorded-shell-declares-its-shell-not-its-finished-depth.md)
   * decision 1 settled which is right: `frameDepthMm` is twice the rear overhang (ADR 0018), so the
   * seeded rows were correct and the §7 rows were not. Corrected 2026-09-05 — and this now reads
   * through `referenceRoomWallSeatMm`, the **same** helper the seeded assertion uses, so the two
   * cannot be made to disagree again without one of them failing.
   */
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

  // The nominal is untouched by that correction and is still the map's row outright — the finished
  // cabinet the customer is told about (ADR 0036 decision 1). Asserted beside it so the pair is read
  // together and neither can drift into the other.
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
  // `WALL_DEPTH_MM`, so both fields have to be declared on the entry to stay out of the map's
  // reach — ADR 0039 decision 1 exempts the hood from it.
  //
  // **This is the one entry in the catalogue where the two fields deliberately disagree**, and it
  // is the whole content of §11 row 19's second named exception: 500 is what a hood *is*, 700 is
  // where it *hangs*. `catalog.test.ts`'s catalogue-wide "the two depth fields agree" sweep names
  // the same exception from the other side, so neither can be relaxed without the other noticing.
  it("gives the §7 hood entry a standard 500 mm nominal and a front-hung 700 mm seat", () => {
    const hood = KITCHEN_L_BODY_CATALOG.get("hood");

    expect(hood?.nominalDepthMm).toBe(500);
    expect(hood?.frameDepthMm).toBe(2 * 600 - 500);
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
