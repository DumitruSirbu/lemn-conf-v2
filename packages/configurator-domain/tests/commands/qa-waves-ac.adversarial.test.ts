// Adversarial QA for the two batched waves.
//
//   Wave A — `Column.hasFullHeightUnder` decides whether §7's `min(d, 0.33)` head-clearance cap is
//            lifted. It is applied by default and lifted only over a full-height member.
//   Wave C — a per-entry `minWidthMm` below §2's `MIN_WIDTH_M` replaces it for that entry alone.
//
// Everything here attacks an assumption rather than a documented case: the predicate behind
// `hasFullHeightUnder`, the codes either side of both floors swept rather than sampled, and
// declared floors the catalogue does not contain but nothing rejects.
import { describe, expect, it } from "vitest";

import {
  buildableSizes,
  INSERTABLE_BODY_DEFINITIONS,
  listInsertableBodies,
} from "../../src/catalog.js";
import type { Design, DesignPlacement } from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { toMillimetres } from "../../src/millimetres.js";
import { offersFor } from "../../src/queries/offers.js";
import { offered as offeredRows } from "../support/offers.js";
import {
  derivePlacementRecords,
  MIN_WIDTH_M,
  withCurrentFullHeightMembers,
  type BodyCatalog,
  type BodyDefinition,
} from "../../src/void-engine.js";
import { clearBodies, insertInto, OCCURRED_AT } from "../support/commands.js";
import {
  createWorld,
  voidAt,
  type KitchenWorld,
} from "../support/kitchen-world.js";

const CARGO_BUILD_ID = "base-bottle-cargo";
const GENERAL_MIN_WIDTH_MM = 300;
const CARGO_MIN_WIDTH_MM = 200;

const OPENING_ALONG_MM = 1000;
const OPENING_COLUMN = "A|1.00";

// ---------------------------------------------------------------------------------------------
// Fixtures: an arbitrary-width base opening in an arbitrary catalogue.
// ---------------------------------------------------------------------------------------------

function design(placements: readonly DesignPlacement[]): Design {
  return {
    room: { shape: "L", widthMm: 3600, depthMm: 2400, heightMm: 2600 },
    presetId: null,
    placements: [...placements],
    createdAt: OCCURRED_AT,
    updatedAt: OCCURRED_AT,
  };
}

/** A base/wall/top stack of the given width, with the base member then removed — so the column is
 *  frozen from the full stack (ADR 0011 Gap D) and the base void is exactly `widthMm` wide. */
function baseOpeningWorld(
  widthMm: number,
  catalog: BodyCatalog = KITCHEN_L_BODY_CATALOG,
): KitchenWorld {
  return clearBodies(
    createWorld(
      design([
        {
          id: "s0",
          wall: "A",
          alongMm: OPENING_ALONG_MM,
          y0Mm: 0,
          body: { buildId: "base-drawer2-600", widthMm, heightMm: 820 },
        },
        {
          id: "s1",
          wall: "A",
          alongMm: OPENING_ALONG_MM,
          y0Mm: 1500,
          body: { buildId: "wall-2door-600", widthMm, heightMm: 700 },
        },
        {
          id: "s2",
          wall: "A",
          alongMm: OPENING_ALONG_MM,
          y0Mm: 2200,
          body: { buildId: "wall-2door-600-top", widthMm, heightMm: 400 },
        },
      ]),
      catalog,
    ),
    ["s0"],
  );
}

function baseVoidTarget(world: KitchenWorld) {
  return { kind: "void", id: voidAt(world, OPENING_COLUMN, 0).id } as const;
}

/** The refusal code for a body in a base opening of this width, or `undefined` when it goes in. */
function codeAt(
  widthMm: number,
  buildId: string,
  catalog: BodyCatalog = KITCHEN_L_BODY_CATALOG,
): string | undefined {
  const world = baseOpeningWorld(widthMm, catalog);
  const result = insertInto(world, baseVoidTarget(world), buildId);
  return result.ok ? undefined : result.reason.code;
}

// ---------------------------------------------------------------------------------------------
// Wave C — the two floors, swept 195–305 mm, asserting the code and not merely the refusal.
// ---------------------------------------------------------------------------------------------

/** One row per shipped entry the sweep can reach in a base opening, with the code each width must
 *  produce. Stated as a rule per entry rather than as a table of 111 literals, but the rule is
 *  restated here rather than imported, so a change to the width floors cannot move both.
 *
 *  `distinctOutcomes` is how many different answers the row must produce across the sweep, written
 *  as a literal for the same reason: it is the part of the claim `expected` cannot make, since a
 *  rule that collapsed to one code everywhere would still satisfy itself. */
const WIDTH_SWEEP_CASES = [
  {
    buildId: "base-3drawer",
    note: "'fit', declares no floor — §2's default governs",
    expected: (widthMm: number) =>
      widthMm < GENERAL_MIN_WIDTH_MM ? "WIDTH_NOT_SUPPORTED" : undefined,
    // Refused below the default, accepted at and above it.
    distinctOutcomes: 2,
  },
  {
    buildId: "base-sink",
    note: "'fit', declares 560 — above the default, so both fire in turn",
    expected: (widthMm: number) =>
      widthMm < GENERAL_MIN_WIDTH_MM
        ? "WIDTH_NOT_SUPPORTED"
        : "WIDTH_TOO_SMALL",
    // Refused at every width in the sweep, but under two different codes — that is the handover.
    distinctOutcomes: 2,
  },
  {
    buildId: "base-dishwasher",
    note: "millimetre set [450, 600], declares no floor",
    expected: () => "WIDTH_NOT_SUPPORTED",
    // Its narrowest size is 450, so the whole sweep sits under the default: one answer throughout.
    distinctOutcomes: 1,
  },
  {
    buildId: CARGO_BUILD_ID,
    note: "millimetre set [200, 300], declares 200 — below the default, replacing it",
    expected: (widthMm: number) =>
      widthMm < CARGO_MIN_WIDTH_MM ? "WIDTH_TOO_SMALL" : undefined,
    // Refused below its own floor, accepted at and above it — and never under the default's code.
    distinctOutcomes: 2,
  },
] as const;

describe("the width floors, swept 195–305 mm, by rejection code", () => {
  it.each(WIDTH_SWEEP_CASES)(
    "$buildId — $note",
    ({ buildId, expected, distinctOutcomes }) => {
      const wrong: string[] = [];
      const seen = new Map<string, number>();

      for (let widthMm = 195; widthMm <= 305; widthMm += 1) {
        const actual = codeAt(widthMm, buildId);
        seen.set(
          actual ?? "ACCEPTED",
          (seen.get(actual ?? "ACCEPTED") ?? 0) + 1,
        );
        if (actual !== expected(widthMm)) {
          wrong.push(
            `${String(widthMm)} mm: expected ${String(expected(widthMm))}, got ${String(actual)}`,
          );
        }
      }

      expect(wrong).toEqual([]);
      // A sweep that never crossed its transition is not evidence, and the loop bound cannot show
      // that it did: summing the counts back to 111 restates how many times the loop ran and holds
      // whatever the code under test answers. The number of *distinct* answers is the part that
      // depends on the code — a floor that vanished, or one that swallowed the other's code, drops
      // a row to a single outcome and fails here.
      expect(seen.size).toBe(distinctOutcomes);
    },
  );

  it("crosses a real transition for both entries that have one", () => {
    expect(codeAt(299, "base-3drawer")).toBe("WIDTH_NOT_SUPPORTED");
    expect(codeAt(300, "base-3drawer")).toBeUndefined();
    expect(codeAt(199, CARGO_BUILD_ID)).toBe("WIDTH_TOO_SMALL");
    expect(codeAt(200, CARGO_BUILD_ID)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------
// Wave C — declared floors the shipped catalogue does not contain.
// ---------------------------------------------------------------------------------------------

function baseEntry(minWidthMm: number | undefined): BodyDefinition {
  const template = KITCHEN_L_BODY_CATALOG.get("base-3drawer");
  if (!template) throw new Error("no base-3drawer");
  return {
    ...template,
    label: "Probă",
    ...(minWidthMm === undefined ? {} : { minWidthMm }),
  };
}

function catalogDeclaring(minWidthMm: number | undefined): BodyCatalog {
  return new Map([
    ...KITCHEN_L_BODY_CATALOG,
    ["qa-probe", baseEntry(minWidthMm)],
  ]);
}

describe("a declared floor at, above and below §2's default", () => {
  it.each([
    // ADR 0026 point 2: at or above the default, the default is checked first and both can fire.
    { declaredMm: 300, widthMm: 299, expected: "WIDTH_NOT_SUPPORTED" },
    { declaredMm: 300, widthMm: 300, expected: undefined },
    { declaredMm: 301, widthMm: 299, expected: "WIDTH_NOT_SUPPORTED" },
    { declaredMm: 301, widthMm: 300, expected: "WIDTH_TOO_SMALL" },
    { declaredMm: 301, widthMm: 301, expected: undefined },
    // ADR 0026 point 3: below it, the declaration replaces the default for that entry alone.
    { declaredMm: 299, widthMm: 298, expected: "WIDTH_TOO_SMALL" },
    { declaredMm: 299, widthMm: 299, expected: undefined },
    { declaredMm: 250, widthMm: 249, expected: "WIDTH_TOO_SMALL" },
    { declaredMm: 250, widthMm: 250, expected: undefined },
  ])(
    "declaring $declaredMm mm, at a $widthMm mm opening, answers $expected",
    ({ declaredMm, widthMm, expected }) => {
      expect(codeAt(widthMm, "qa-probe", catalogDeclaring(declaredMm))).toBe(
        expected,
      );
    },
  );

  // A `'fit'` entry declaring downward builds to its opening all the way down to its own floor,
  // which is what "replaces the default" means for the fit path. Pinned because it is the shape
  // §5.4's donor rule will have to reason about in M5.
  it("builds a downward-declaring 'fit' entry to the opening, not to a module width", () => {
    const catalog = catalogDeclaring(250);
    const world = baseOpeningWorld(263, catalog);
    const result = insertInto(world, baseVoidTarget(world), "qa-probe");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.placements.at(-1)?.body.widthMm).toBe(263);
  });
});

describe("declared floors that are not widths at all", () => {
  // A floor of 0 or below makes `replacesDefaultFloor` true and then `refuseBelowBuilderFloor`
  // vacuous, so §2's floor is not replaced — it is **removed**. Nothing in the catalogue loader,
  // the schema or the command validates a declaration, so one typo in a row makes that row
  // insertable at any width the void engine can produce.
  it.each([0, -1, -600])(
    "declaring %i mm leaves the entry with no width floor at all",
    (declaredMm) => {
      const catalog = catalogDeclaring(declaredMm);

      expect(codeAt(299, "qa-probe", catalog)).toBeUndefined();
      expect(codeAt(100, "qa-probe", catalog)).toBeUndefined();
      expect(codeAt(1, "qa-probe", catalog)).toBeUndefined();
    },
  );

  // `NaN < MIN_WIDTH_M` is false, so a `NaN` declaration is treated as an *upward* one and reaches
  // `refuseBelowBuilderFloor`, where `opening.w >= NaN` is false at every width. The entry becomes
  // uninsertable — the safe direction — but the refusal the customer reads names `NaN` millimetres.
  it("renders a NaN declaration into the sentence the customer reads", () => {
    const catalog = catalogDeclaring(Number.NaN);
    const world = baseOpeningWorld(600, catalog);
    const result = insertInto(world, baseVoidTarget(world), "qa-probe");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("WIDTH_TOO_SMALL");
    expect(result.reason.message).not.toContain("NaN");
  });

  it("rejects a non-integer declaration, or applies it consistently", () => {
    const catalog = catalogDeclaring(250.5);

    expect(codeAt(250, "qa-probe", catalog)).toBe("WIDTH_TOO_SMALL");
    expect(codeAt(251, "qa-probe", catalog)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------
// Wave C — the cargo's floor must not leak into any other entry.
// ---------------------------------------------------------------------------------------------

/** Every insertable entry whose row declares a floor **below** §2's default. ADR 0026 shipped with
 *  one; ADR 0030's amendment made it three, because a `[200, 300, 400]` one-door set is filtered
 *  straight back out again unless the row declares the floor to keep it.
 *
 *  Derived rather than written down, so a fourth declaration fails these sweeps loudly. ADR 0026 is
 *  explicit that any such row "needs its own record" — this is the assertion that enforces it. */
function entriesDeclaringDown(): string[] {
  return INSERTABLE_BODY_DEFINITIONS.filter(
    ([, definition]) =>
      definition.minWidthMm !== undefined &&
      definition.minWidthMm < toMillimetres(MIN_WIDTH_M),
  ).map(([buildId]) => buildId);
}

describe("a sub-300 mm width is reached only by naming a row that declares one", () => {
  it("names the three insertable entries declaring below §2's default", () => {
    // **This asserted "the cargo, and only the cargo" until 2026-08-27.** It was right until ADR
    // 0030's amendment; the rule it was protecting — nobody gets a narrow cabinet they did not ask
    // for — is unchanged and is what the two sweeps below still assert.
    //
    // Still three after ADR 0033, and deliberately re-checked rather than assumed: the merge retired
    // `base-1door` and `wall-1door`, which were two of the three, and their 200 mm floor moved onto
    // the merged cabinets that replaced them. Same count, different rows.
    expect(entriesDeclaringDown()).toEqual([
      "base-cabinet",
      CARGO_BUILD_ID,
      "wall-cabinet",
    ]);
  });

  // §9's two narrowing paths. `buildableSizes` now defaults its floor to 300 instead of "no
  // floor", so every entry's chips have to be re-proved unchanged rather than assumed.
  it("leaves every entry's chips exactly its own set", () => {
    const narrowed = listInsertableBodies(KITCHEN_L_BODY_CATALOG)
      .map((body) => ({
        buildId: body.buildId,
        sizesMm: body.sizesMm,
        chips: buildableSizes(body.minWidthMm, body.sizesMm),
      }))
      .filter((row) => row.chips.length !== row.sizesMm.length);

    expect(narrowed).toEqual([]);
  });

  // The seeded (non-insertable) rows reach `buildableSizes` too, through `describeSelection`. None
  // of them declares a floor, so the new default must not silently delete a chip from one.
  it("leaves every seeded entry's chips alone as well", () => {
    const narrowed = [...KITCHEN_L_BODY_CATALOG]
      .filter(([, definition]) => (definition.sizesMm?.length ?? 0) > 0)
      .filter(
        ([, definition]) =>
          buildableSizes(definition.minWidthMm, definition.sizesMm ?? [])
            .length !== (definition.sizesMm?.length ?? 0),
      )
      .map(([buildId]) => buildId);

    expect(narrowed).toEqual([]);
  });

  // Every offer in the shipped kitchen, at every void and at every replaceable body. No row but
  // the cargo may resolve to a width under §2's floor.
  it("offers no sub-300 mm width anywhere in the shipped kitchen but theirs", () => {
    const world = createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);
    const targets = [
      ...world.voids.map(
        (record) => ({ kind: "void", id: record.id }) as const,
      ),
      ...world.records
        .filter((record) => record.canReplace)
        .map((record) => ({ kind: "placement", id: record.id }) as const),
    ];
    const offending: string[] = [];
    let offersSeen = 0;

    for (const target of targets) {
      const declaringDown = new Set(entriesDeclaringDown());
      for (const offer of offeredRows(offersFor({ ...world, target }))) {
        offersSeen += 1;
        if (declaringDown.has(offer.buildId)) continue;
        if (offer.verdict.widthMm < GENERAL_MIN_WIDTH_MM) {
          offending.push(
            `${target.id} → ${offer.buildId} @ ${String(offer.verdict.widthMm)}`,
          );
        }
        if (offer.sizesMm.some((size) => size < GENERAL_MIN_WIDTH_MM)) {
          offending.push(
            `${target.id} → ${offer.buildId} chips ${offer.sizesMm.join("/")}`,
          );
        }
      }
    }

    expect(targets.length).toBeGreaterThanOrEqual(15);
    expect(offersSeen).toBeGreaterThanOrEqual(40);
    expect(offending).toEqual([]);
  });

  // The owner's rule is that a narrow cabinet is only ever reached by being chosen. Nothing may
  // produce one as the residue of another edit — which ADR 0031 strengthened rather than weakened,
  // by deleting the donor that was the one way it could have happened.
  it("never produces a sub-300 mm placement except by naming a row that declares one", () => {
    const narrow: string[] = [];
    const declaringDown = new Set(entriesDeclaringDown());
    let inserts = 0;

    for (let widthMm = 190; widthMm <= 900; widthMm += 10) {
      const world = baseOpeningWorld(widthMm);
      const target = baseVoidTarget(world);
      for (const offer of offersFor({ ...world, target })) {
        const result = insertInto(world, target, offer.buildId);
        inserts += 1;
        if (!result.ok) continue;
        const placed = result.design.placements.at(-1);
        if (
          placed !== undefined &&
          placed.body.widthMm < GENERAL_MIN_WIDTH_MM &&
          !declaringDown.has(placed.body.buildId)
        ) {
          narrow.push(
            `${String(widthMm)} mm opening → ${offer.buildId} @ ${String(placed.body.widthMm)}`,
          );
        }
      }
    }

    // A sweep of 72 openings that produced no insert at all would pass vacuously.
    expect(inserts).toBeGreaterThanOrEqual(100);
    expect(narrow).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Wave A — the `hasFullHeightUnder` predicate.
// ---------------------------------------------------------------------------------------------

/** §7's head-clearance cap on a wall carcass over a worktop, at the shipped 600 mm worktop. Restated
 *  here rather than imported from `insert-fit.ts`: a test that reads the number it is checking out
 *  of the code under test proves nothing. `insert-depth.test.ts` and the three-adapter's
 *  `swap-depth.test.ts` restate the same rule for the same reason.
 *
 *  M5 wave 5A moved it from 400 to 330: the cap is now the worktop → wall depth map's row rather
 *  than a literal of its own, and `worktop-depth.test.ts` is the gate that keeps the two linked. */
const CAP_OVER_WORKTOP_MM = 330;

describe("the claim the band predicate rests on", () => {
  // `isFullHeightUnder` reads the band rather than any measurement, and the band it reads has to
  // separate the two populations cleanly. Kept from the wave's first round, where the predicate
  // read `band === "base"`: it verifies that the seeded base bodies really do all record 820 mm
  // rather than §7's 860, which is why neither predicate could be written against a frame top.
  it("has every seeded base body at 820 mm and nothing else near the worktop line", () => {
    const records = derivePlacementRecords(
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    );
    const bases = records.filter((record) => record.band === "base");
    const nearWorktop = records.filter(
      (record) =>
        record.band !== "base" &&
        record.frame.y0 + record.frame.h > 0.8 &&
        record.frame.y0 + record.frame.h < 0.9,
    );

    expect(bases.length).toBeGreaterThanOrEqual(6);
    expect(
      bases.map((record) => toMillimetres(record.frame.y0 + record.frame.h)),
    ).toEqual(bases.map(() => 820));
    expect(nearWorktop).toEqual([]);
  });
});

/** A wall body deep enough for the cap to be observable, over whatever is placed below it. */
function stackedWorld(
  below: DesignPlacement | undefined,
  wallAlongMm: number,
): KitchenWorld {
  const wallBody: DesignPlacement = {
    id: "w0",
    wall: "A",
    alongMm: wallAlongMm,
    y0Mm: 1500,
    body: {
      buildId: "wall-2door-600-deep-top",
      widthMm: 600,
      heightMm: 700,
      seatDepthMm: 600,
    },
  };
  return createWorld(
    design(below ? [below, wallBody] : [wallBody]),
    KITCHEN_L_BODY_CATALOG,
  );
}

const BASE_CABINET: DesignPlacement = {
  id: "b0",
  wall: "A",
  alongMm: 1000,
  y0Mm: 0,
  body: { buildId: "base-drawer2-600", widthMm: 900, heightMm: 820 },
};

const TALL_COLUMN: DesignPlacement = {
  id: "c0",
  wall: "A",
  alongMm: 1000,
  y0Mm: 0,
  body: { buildId: "tall-pantry-600", widthMm: 600, heightMm: 2200 },
};

/** Wide enough that a wall body 300 mm along the wall from it still stands entirely above it, which
 *  is what separates the geometric predicate from a column-membership one. */
const WIDE_TALL_COLUMN: DesignPlacement = {
  ...TALL_COLUMN,
  body: { buildId: "tall-pantry-600", widthMm: 900, heightMm: 2200 },
};

/** The depth `insertBody` builds a wall cabinet to when it replaces `w0`. */
function swapDepthMm(world: KitchenWorld): number {
  const result = insertInto(
    world,
    { kind: "placement", id: "w0" },
    "wall-cabinet",
  );
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
  const placed = result.design.placements.find(
    (placement) => placement.id === result.effect.placementId,
  );
  return placed?.body.seatDepthMm ?? -1;
}

describe("hasFullHeightUnder — what the predicate answers, member by member", () => {
  it("caps a wall carcass over a base cabinet in the same column", () => {
    const world = stackedWorld(BASE_CABINET, 1000);

    expect(world.columns.get("A|1.00")?.hasFullHeightUnder).toBe(false);
    expect(swapDepthMm(world)).toBe(CAP_OVER_WORKTOP_MM);
  });

  it("does not cap a wall carcass over a full-height column", () => {
    const world = stackedWorld(TALL_COLUMN, 1000);

    expect(world.columns.get("A|1.00")?.hasFullHeightUnder).toBe(true);
    expect(swapDepthMm(world)).toBe(600);
  });

  // The rule read positively: the cap is the default, and only a full-height member lifts it. Read
  // the other way round — cap where a worktop is present — this case is *uncapped*, because the
  // absence of a worktop is not the presence of a column. That was the wave-A regression, and this
  // is the test that would have caught it at the predicate.
  it("caps a wall carcass with nothing at all below it", () => {
    const world = stackedWorld(undefined, 1000);

    expect(world.columns.get("A|1.00")?.hasFullHeightUnder).toBe(false);
    expect(swapDepthMm(world)).toBe(CAP_OVER_WORKTOP_MM);
  });

  // §7's cap is a head-clearance rule about what a person leans over, so `isFullHeightUnder` asks
  // about geometry — `overlapsAlongWall` — and not about column membership. A column key is one
  // along-wall coordinate, so a wall cabinet hanging entirely over a wider tall unit that starts
  // 300 mm to its left has no full-height member of its own; overlap is what lifts the cap anyway.
  //
  // The shipped kitchen has the mirror of this shape twice — p8 and p10 hang over p25's 900 mm
  // corner base — and would not have shown it, because those wall columns are 330 mm deep and under
  // the cap either way. History in ADR 0011's corrections.
  it("does not cap a wall carcass that overhangs a wider tall unit in a neighbouring column", () => {
    // `c0` spans 1000–1900 mm; the wall body spans 1300–1900 mm, entirely above it.
    const world = stackedWorld(WIDE_TALL_COLUMN, 1300);

    expect(world.columns.get("A|1.00")?.hasFullHeightUnder).toBe(true);
    expect(swapDepthMm(world)).toBe(600);
  });

  // `hasFullHeightUnder` is the one field on `Column` that is not frozen at load, and
  // `withCurrentFullHeightMembers` is what keeps that true: the store re-answers it from the new
  // records after every command, so deleting the member below in this session and reloading a
  // design without it give the same answer and therefore the same swap depth. One document, one
  // depth.
  it("answers the same for a design whether it was mutated in session or reloaded", () => {
    // Deleting the tall unit is the case where the answer actually moves — `true` while it stands,
    // `false` once it is gone — so the two routes have something to disagree about.
    const loaded = stackedWorld(TALL_COLUMN, 1000);
    const withoutColumn: Design = {
      ...loaded.design,
      placements: loaded.design.placements.filter(
        (placement) => placement.id !== "c0",
      ),
    };

    const inSession: KitchenWorld = {
      ...loaded,
      ...deriveInto(withoutColumn, loaded),
    };
    const reloaded = createWorld(withoutColumn, KITCHEN_L_BODY_CATALOG);

    expect(loaded.columns.get("A|1.00")?.hasFullHeightUnder).toBe(true);
    expect(inSession.columns.get("A|1.00")?.hasFullHeightUnder).toBe(false);
    expect(reloaded.columns.get("A|1.00")?.hasFullHeightUnder).toBe(
      inSession.columns.get("A|1.00")?.hasFullHeightUnder,
    );
    expect(swapDepthMm(reloaded)).toBe(swapDepthMm(inSession));
  });
});

/** The store's own contract: records re-derived after a command, the columns' frozen **extent**
 *  not — and `hasFullHeightUnder` re-answered from the new records, which is what the test above pins. */
function deriveInto(next: Design, world: KitchenWorld) {
  const records = derivePlacementRecords(next, world.catalog);
  return {
    design: next,
    records,
    columns: withCurrentFullHeightMembers(world.columns, records),
  };
}

// ---------------------------------------------------------------------------------------------
// Cross-wave: a narrow body meeting a deep opening.
// ---------------------------------------------------------------------------------------------

describe("cross-wave — the cargo and the depth rule in one opening", () => {
  it("refuses the cargo into a wall slot on band, never on its new width floor", () => {
    // The floor moving downwards must not open a band it never had. A 250 mm wall opening is now
    // wide enough for the cargo's own floor, so band is the only thing left refusing it.
    const world = baseOpeningWorld(250);
    const result = insertInto(
      world,
      { kind: "placement", id: "s1" },
      CARGO_BUILD_ID,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("BAND_MISMATCH");
  });

  it("builds the cargo against its opening's depth, not the column's deepest member", () => {
    const world = createWorld(
      design([
        {
          id: "b0",
          wall: "A",
          alongMm: 1000,
          y0Mm: 0,
          body: { buildId: "base-drawer2-600", widthMm: 250, heightMm: 820 },
        },
        {
          id: "w0",
          wall: "A",
          alongMm: 1000,
          y0Mm: 1500,
          body: {
            buildId: "wall-2door-600-deep-top",
            widthMm: 250,
            heightMm: 700,
            seatDepthMm: 600,
          },
        },
      ]),
      KITCHEN_L_BODY_CATALOG,
    );
    const result = insertInto(
      world,
      { kind: "placement", id: "b0" },
      CARGO_BUILD_ID,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const placed = result.design.placements.find(
      (placement) => placement.id === result.effect.placementId,
    );
    expect(placed?.body.widthMm).toBe(200);
    // A base builder ignores the depth it is handed, so the seat is the base cabinet's own 580 —
    // never the 600 mm wall body above it that makes this column deep.
    expect(placed?.body.seatDepthMm).toBe(580);
  });
});
