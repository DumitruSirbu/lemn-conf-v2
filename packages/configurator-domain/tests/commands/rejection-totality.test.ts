// Every refusal the commands can actually produce, swept through the locale-free domain boundary. The returned
// design is asserted `toBe` the original object: a structural copy passes `toEqual`, and a store applying
// results unconditionally would replace state with an equal-but-different object.
import { describe, expect, it } from "vitest";

import { CHOOSES_ITS_OWN_COLOUR } from "../../src/body-finish-rule.js";
import { baseFinishedDepthMm } from "../../src/catalog.js";
import { WORKTOP_DEPTH_MM } from "../../src/worktop-depth.js";
import type { CommandResult } from "../../src/commands/command-result.js";
import { finishesAtMm } from "../../src/occupied-depth.js";
import { insertBody } from "../../src/commands/insert-body.js";
import type { RejectionCode } from "../../src/commands/rejection.js";
import { removePlacement } from "../../src/commands/remove-placement.js";
import { setFinish, setHandle } from "../../src/commands/set-appearance.js";
import {
  setHardwareTier,
  setMaterialTier,
} from "../../src/commands/set-whole-kitchen-settings.js";
import type { Design } from "../../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import type { BodyCatalog, BodyDefinition } from "../../src/void-engine.js";
import {
  clearBodies,
  insertInto,
  resizeTo,
  OCCURRED_AT,
} from "../support/commands.js";
import { setCabinetDepth } from "../../src/commands/set-cabinet-depth.js";
import {
  createFakeProbe,
  createFakeProbeFactory,
} from "../support/fake-probe.js";
import {
  advance,
  createWorld,
  voidAt,
  type KitchenWorld,
} from "../support/kitchen-world.js";
import {
  columnWorld,
  syntheticDesign,
  syntheticWorld,
  type SyntheticMember,
} from "../support/synthetic-world.js";
import {
  witnessWorld,
  WITNESS_COLUMN_KEY,
} from "../support/dependent-replan-witness.js";
import { LEGACY_ENUM_FINISHES } from "../../src/materials.js";

const FRIDGE_COLUMN = "B|2.45";
/** What a caller's book offers, opaque to the domain (ADR 0062 seam 1); both whole-kitchen refusals are reached
 *  by asking for a tier that is not on it. */
const OFFERED_TIER_IDS: readonly string[] = ["offered-tier"];

/** §5.1's second refusal is `!canDelete (corners)`. The shipped design reaches it through `p25` (ADR 0025); this
 *  synthetic entry keeps the sweep's reading of the guard independent of that fixture. */
const CORNER_BASE: BodyDefinition = {
  kind: "base_cabinet",
  band: "base",
  frameDepthMm: 580,
  occupiedDepth: finishesAtMm(baseFinishedDepthMm(WORKTOP_DEPTH_MM)),
  canFinish: true,
  // Declared because `derivePlacementRecords` refuses an entry that says nothing about the colour it draws;
  // ordinary cabinetry, matching `canFinish: true`.
  finishRule: CHOOSES_ITS_OWN_COLOUR,
  canHandle: true,
  canReplace: false,
  canDelete: false,
  fixedWidth: true,
  insertable: false,
};

const CORNER_CATALOG: BodyCatalog = new Map([
  ...KITCHEN_L_BODY_CATALOG,
  ["corner-base-600", CORNER_BASE],
]);

const CORNER_DESIGN: Design = syntheticDesign([
  {
    id: "c0",
    wall: "A",
    alongMm: 300,
    y0Mm: 0,
    body: { buildId: "corner-base-600", widthMm: 600, heightMm: 820 },
  },
]);

const STANDARD_STACK: readonly SyntheticMember[] = [
  { id: "s0", y0Mm: 0, heightMm: 820 },
  { id: "s1", y0Mm: 1500, heightMm: 700, buildId: "wall-2door-600" },
  { id: "s2", y0Mm: 2200, heightMm: 400, buildId: "wall-2door-600-top" },
];

const seeded = () => createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);

function stackOf(widthMm: number): SyntheticMember[] {
  return STANDARD_STACK.map((member) => ({ ...member, widthMm }));
}

/** The open shelf is the only catalogue body with no doors and the seeded design has none, so reaching
 *  FINISH_NOT_SUPPORTED means inserting one first. */
function worldWithOpenShelf(): { world: KitchenWorld; placementId: string } {
  const cleared = clearBodies(seeded(), ["p8"]);
  const result = insertInto(
    cleared,
    { kind: "void", id: voidAt(cleared, "A|0.30", 1.5).id },
    "open-shelf",
  );
  if (!result.ok) {
    throw new Error(
      `fixture could not insert the shelf: ${result.reason.code}`,
    );
  }
  return {
    world: advance(cleared, result.design),
    placementId: result.effect.placementId,
  };
}

interface SweepCase {
  readonly code: RejectionCode;
  readonly design: Design;
  readonly run: () => CommandResult;
}

function voidTarget(world: KitchenWorld, col: string, y0: number) {
  return { kind: "void", id: voidAt(world, col, y0).id } as const;
}

function buildCases(): SweepCase[] {
  const world = seeded();
  // The insert is a full-height body so the column lifts §7's cap and the depth of the body above moves: the
  // insert fits, but that body's re-plan does not (its declared equivalent is built at 300 mm, it stands at 600).
  const replanWitness = witnessWorld();
  const clearedFridge = clearBodies(world, ["p7", "p24"]);
  const clearedDishwasher = clearBodies(world, ["p1"]);
  /** A 600 mm column with its top slot open. The 700 mm fridge column is refused on width by the hood's
   *  `[600, 900]` set before the height guard, so only an opening like this isolates `HEIGHT_EXCEEDS_LEVEL`. */
  const clearedTopSlot = clearBodies(world, ["p18"]);
  // `RESIZE_OPENS_GAP` needs a shape the seeded kitchen lacks: with `A|1.30` emptied, `A|0.75` can reach 200 and
  // widen the empty column across the corner leg.
  const gapWorld = clearBodies(world, ["p0", "p11", "p17"]);
  // ADR 0035 decision 6 as amended: the hood floors its column, so a width every cabinet under it accepts is
  // still refused when the hood is wider.
  const hoodFlooredWorld = syntheticWorld([
    {
      id: "run",
      wall: "A",
      alongMm: 1000,
      y0Mm: 0,
      body: { buildId: "base-cabinet", widthMm: 300, heightMm: 860 },
    },
    {
      id: "hd",
      wall: "A",
      alongMm: 1000,
      y0Mm: 1500,
      body: { buildId: "hood", widthMm: 600, heightMm: 700 },
    },
  ]);

  // §3.2 permits overlapping columns. Shrinking the 600 mm run at 1000 to 500 holds its left edge and puts its
  // centre on the wall unit's key (`A|0.95`), which an unchecked column-map write would overwrite.
  const overlappingWorld = syntheticWorld([
    {
      id: "base-run",
      wall: "A",
      alongMm: 1000,
      y0Mm: 0,
      body: { buildId: "base-panbank", widthMm: 600, heightMm: 860 },
    },
    {
      id: "wall-unit",
      wall: "A",
      alongMm: 950,
      y0Mm: 1500,
      body: { buildId: "wall-cabinet", widthMm: 300, heightMm: 700 },
    },
  ]);
  // A 400 mm base opening: the dishwasher niche is made in 450 and 600 only.
  const narrowBase = clearBodies(columnWorld(1000, stackOf(400)), ["s0"]);
  // No top row, so the freed base span stops at 1.50 and a 2200 mm column cannot fit above it.
  const shortSpan = clearBodies(columnWorld(1000, stackOf(600).slice(0, 2)), [
    "s0",
  ]);
  // A 314 mm wall body leaves a 386 mm opening — under §9's 400 mm minimum by more than the
  // tolerance.
  const shortOpening = columnWorld(1000, [
    { id: "s0", y0Mm: 0, heightMm: 860 },
    { id: "s1", y0Mm: 1500, heightMm: 314, buildId: "wall-2door-600" },
    { id: "s2", y0Mm: 2200, heightMm: 400, buildId: "wall-2door-600-top" },
  ]);
  // A design whose along-wall coordinate is off the millimetre grid. `DesignSchema` forbids one,
  // which is precisely why this guard is unreachable from any document that validated on load.
  const offGrid = clearBodies(columnWorld(1000.5, stackOf(600)), ["s0"]);
  const shelf = worldWithOpenShelf();

  const removeFrom = (design: Design, id: string, kind: "placement" | "void") =>
    removePlacement({
      design,
      catalog: KITCHEN_L_BODY_CATALOG,
      target: { kind, id },
      occurredAt: OCCURRED_AT,
    });

  return [
    {
      code: "VOID_SELECTED",
      design: world.design,
      run: () => removeFrom(world.design, "any-void-id", "void"),
    },
    {
      code: "TARGET_NOT_FOUND",
      design: world.design,
      run: () => removeFrom(world.design, "p999", "placement"),
    },
    {
      code: "INVALID_OCCURRED_AT",
      design: world.design,
      run: () =>
        removePlacement({
          design: world.design,
          catalog: KITCHEN_L_BODY_CATALOG,
          target: { kind: "placement", id: "p2" },
          occurredAt: "yesterday",
        }),
    },
    {
      code: "NOT_DELETABLE",
      design: CORNER_DESIGN,
      run: () =>
        removePlacement({
          design: CORNER_DESIGN,
          catalog: CORNER_CATALOG,
          target: { kind: "placement", id: "c0" },
          occurredAt: OCCURRED_AT,
        }),
    },
    {
      code: "NOT_IN_LIBRARY",
      design: world.design,
      run: () =>
        insertInto(world, { kind: "placement", id: "p0" }, "no-such-body"),
    },
    {
      code: "NOT_INSERTABLE",
      design: world.design,
      run: () =>
        insertInto(world, { kind: "placement", id: "p0" }, "base-sink-800"),
    },
    {
      // ADR 0025 / §13.1: a corner is not a body the customer chooses (`canReplace: false`), so the
      // non-replaceable placements are exactly the four corner bodies: `p25`, `p26`, `p9` and `p21`.
      code: "TARGET_NOT_REPLACEABLE",
      design: world.design,
      run: () =>
        insertInto(world, { kind: "placement", id: "p25" }, "base-3drawer"),
    },
    {
      code: "BAND_MISMATCH",
      design: clearedDishwasher.design,
      run: () =>
        insertInto(
          clearedDishwasher,
          voidTarget(clearedDishwasher, "A|2.00", 0),
          "wall-cabinet",
        ),
    },
    {
      code: "WIDTH_TOO_LARGE",
      design: clearedDishwasher.design,
      run: () =>
        insertInto(
          clearedDishwasher,
          voidTarget(clearedDishwasher, "A|2.00", 0),
          "fridge-free",
        ),
    },
    {
      // ADR 0017: the sink base's worktop splits around a fixed 560 mm aperture.
      code: "WIDTH_TOO_SMALL",
      design: narrowBase.design,
      run: () =>
        insertInto(
          narrowBase,
          voidTarget(narrowBase, "A|1.00", 0),
          "base-sink",
        ),
    },
    {
      code: "WIDTH_NOT_SUPPORTED",
      design: narrowBase.design,
      run: () =>
        insertInto(
          narrowBase,
          voidTarget(narrowBase, "A|1.00", 0),
          "base-dishwasher",
        ),
    },
    {
      code: "OPENING_TOO_SHORT",
      design: shortOpening.design,
      run: () =>
        insertInto(
          shortOpening,
          voidTarget(shortOpening, "A|1.00", 1.814),
          "wall-cabinet",
        ),
    },
    {
      // §11 row 6: the hood is fixed at 710 mm and only a `column` body may exceed its level. It is the only
      // route to this code: a base body is refused by the band gate first and every other wall body flexes.
      code: "HEIGHT_EXCEEDS_LEVEL",
      design: clearedTopSlot.design,
      run: () =>
        insertInto(
          clearedTopSlot,
          voidTarget(clearedTopSlot, "A|2.00", 2.2),
          "hood",
        ),
    },
    {
      code: "HEIGHT_TOO_LARGE",
      design: shortSpan.design,
      run: () =>
        insertInto(
          shortSpan,
          voidTarget(shortSpan, "A|1.00", 0),
          "tall-pantry",
        ),
    },
    {
      code: "BUILT_SIZE_MISMATCH",
      design: clearedFridge.design,
      run: () =>
        insertInto(
          clearedFridge,
          voidTarget(clearedFridge, "B|2.45", 0),
          "base-3drawer",
          createFakeProbe({ carcassWidthM: 0.9 }),
        ),
    },
    {
      // ADR 0011 Gap B: the probe is an injected port, so a measurement that is not a number is a data condition
      // the command must answer with a refusal.
      code: "MEASUREMENT_UNUSABLE",
      design: clearedFridge.design,
      run: () =>
        insertInto(
          clearedFridge,
          voidTarget(clearedFridge, FRIDGE_COLUMN, 0),
          "base-3drawer",
          createFakeProbe({ seatOffsetM: Number.POSITIVE_INFINITY }),
        ),
    },
    {
      code: "COLUMN_MISMATCH",
      design: world.design,
      run: () =>
        insertBody({
          design: world.design,
          catalog: world.catalog,
          columns: new Map(),
          voids: world.voids,
          target: { kind: "placement", id: "p0" },
          buildId: "base-3drawer",
          probe: createFakeProbe(),
          occurredAt: OCCURRED_AT,
        }),
    },
    {
      code: "NON_INTEGER_MILLIMETRES",
      design: offGrid.design,
      run: () =>
        insertInto(offGrid, voidTarget(offGrid, "A|1.00", 0), "base-3drawer"),
    },
    {
      code: "FINISH_NOT_SUPPORTED",
      design: shelf.world.design,
      run: () =>
        setFinish({
          design: shelf.world.design,
          catalog: KITCHEN_L_BODY_CATALOG,
          target: { kind: "placement", id: shelf.placementId },
          finish: LEGACY_ENUM_FINISHES.sage,
          occurredAt: OCCURRED_AT,
        }),
    },
    {
      // ADR 0078 decision 6: *Salvie* is a free colour and the seeded kitchen carries no settings,
      // so it is PAL — a decor list, which offers no free colour at all.
      code: "FINISH_NOT_OFFERED",
      design: world.design,
      run: () =>
        setFinish({
          design: world.design,
          catalog: KITCHEN_L_BODY_CATALOG,
          target: { kind: "placement", id: "p0" },
          finish: LEGACY_ENUM_FINISHES.sage,
          occurredAt: OCCURRED_AT,
        }),
    },
    {
      code: "NOT_RESIZABLE",
      design: world.design,
      // ADR 0027: the hob-bearing base is 600 mm and nothing else, so it has no width to change.
      run: () => resizeTo(world, "p2", 600),
    },
    {
      code: "COLUMN_MEMBER_NOT_RESIZABLE",
      design: world.design,
      // ADR 0031 rule 1: `p19` can change width, but the hob base three levels below it in the
      // same column cannot, and the whole column moves or none of it does.
      run: () => resizeTo(world, "p19", 800),
    },
    {
      code: "WIDTH_UNCHANGED",
      design: world.design,
      run: () => resizeTo(world, "p18", 600),
    },
    {
      code: "NO_EMPTY_SPACE",
      design: world.design,
      // ADR 0031: a growth must consume space that is already there, and the shipped kitchen has none on either
      // side of `A|0.75`. A shrink makes its own space (ADR 0035 decision 7), so the tap is a growth.
      run: () => resizeTo(world, "p10", 350),
    },
    {
      code: "COLUMN_HOOD_FLOOR",
      design: hoodFlooredWorld.design,
      // A 600 mm hood over a 300 mm hinged base, which **is** built at 200 (ADR 0026's floor):
      // the members accept the width and the hood is what refuses it.
      run: () => resizeTo(hoodFlooredWorld, "run", 200),
    },
    {
      code: "COLUMN_KEY_COLLISION",
      design: overlappingWorld.design,
      run: () => resizeTo(overlappingWorld, "base-run", 500),
    },
    {
      code: "RESIZE_OPENS_GAP",
      design: gapWorld.design,
      // Clear `A|1.30`, narrow `A|0.75` to 200, and the empty column reaches 900 mm — offering a
      // base opening across the floor the corner leg `p25` stands on.
      run: () => resizeTo(gapWorld, "p10", 200),
    },
    {
      code: "HANDLE_NOT_SUPPORTED",
      design: world.design,
      run: () =>
        setHandle({
          design: world.design,
          catalog: KITCHEN_L_BODY_CATALOG,
          target: { kind: "placement", id: "p12" },
          handle: "black",
          occurredAt: OCCURRED_AT,
        }),
    },
    // The list of offered tiers is the caller's, so a tier not on it is the whole refusal: no fixture and no book
    // to import (ADR 0062 seam 1).
    {
      code: "UNKNOWN_MATERIAL_TIER",
      design: world.design,
      run: () =>
        setMaterialTier({
          design: world.design,
          tierId: "material-withdrawn",
          availableTierIds: OFFERED_TIER_IDS,
          occurredAt: OCCURRED_AT,
        }),
    },
    {
      code: "UNKNOWN_HARDWARE_TIER",
      design: world.design,
      run: () =>
        setHardwareTier({
          design: world.design,
          tierId: "hardware-withdrawn",
          availableTierIds: OFFERED_TIER_IDS,
          occurredAt: OCCURRED_AT,
        }),
    },
    // The declared witness (ADR 0093 decision 2). The shipped catalogue cannot reach it, since every re-plannable
    // row resolves to `wall-cabinet` built anywhere between 200 and 800 mm, so the case brings its own two entries
    // and design (see `dependent-replan-witness.ts`).
    {
      code: "DEPENDENT_MEMBER_NOT_REBUILDABLE",
      design: replanWitness.design,
      run: () =>
        insertInto(
          replanWitness,
          voidTarget(replanWitness, WITNESS_COLUMN_KEY, 0),
          "tall-pantry",
        ),
    },
    // 650 is between the two declared depths rather than absurd, so the refusal is the declared set at work and
    // not a bounds check catching a wild number.
    {
      code: "UNKNOWN_CABINET_DEPTH",
      design: world.design,
      run: () =>
        setCabinetDepth({
          design: world.design,
          catalogAt: buildKitchenLBodyCatalog,
          cabinetDepthMm: 650,
          probeAt: createFakeProbeFactory(),
          occurredAt: OCCURRED_AT,
        }),
    },
  ];
}

/** Codes no command can produce. `NO_SNAP_POSITION`: `minY` is always a snap candidate and `refuseHeight` has
 *  proved `minY + h` fits. `BODY_PROBE_UNAVAILABLE`: `insertBody` requires a `BodyProbe`, so the caller returns it
 *  and `apps/web`'s store tests sweep it. `ACCESSORY_NOT_DELETABLE`: the hob is part of its cabinet's body (ADR 0027)
 *  so no placement is a standalone accessory and §11 row 15 holds by construction; the code stays declared for
 *  the day a body stands on another one. */
const ENGINE_UNREACHABLE: readonly RejectionCode[] = [
  "NO_SNAP_POSITION",
  "BODY_PROBE_UNAVAILABLE",
  "ACCESSORY_NOT_DELETABLE",
];

/** Every code in the union, as a `Record` keyed by it rather than as a hand-counted list: adding a
 *  code to `RejectionDetail` without adding it here is a **compile error**, so the sweep below
 *  cannot go on passing while a new code sits unswept. A list and a magic number can. */
const ALL_REJECTION_CODES: Readonly<Record<RejectionCode, true>> = {
  VOID_SELECTED: true,
  TARGET_NOT_FOUND: true,
  INVALID_OCCURRED_AT: true,
  BODY_PROBE_UNAVAILABLE: true,
  ACCESSORY_NOT_DELETABLE: true,
  NOT_DELETABLE: true,
  NOT_IN_LIBRARY: true,
  NOT_INSERTABLE: true,
  TARGET_NOT_REPLACEABLE: true,
  BAND_MISMATCH: true,
  WIDTH_TOO_LARGE: true,
  WIDTH_TOO_SMALL: true,
  WIDTH_NOT_SUPPORTED: true,
  OPENING_TOO_SHORT: true,
  HEIGHT_EXCEEDS_LEVEL: true,
  HEIGHT_TOO_LARGE: true,
  NO_SNAP_POSITION: true,
  BUILT_SIZE_MISMATCH: true,
  MEASUREMENT_UNUSABLE: true,
  COLUMN_MISMATCH: true,
  NON_INTEGER_MILLIMETRES: true,
  FINISH_NOT_SUPPORTED: true,
  FINISH_NOT_OFFERED: true,
  HANDLE_NOT_SUPPORTED: true,
  NOT_RESIZABLE: true,
  WIDTH_UNCHANGED: true,
  NO_EMPTY_SPACE: true,
  COLUMN_MEMBER_NOT_RESIZABLE: true,
  DEPENDENT_MEMBER_NOT_REBUILDABLE: true,
  RESIZE_OPENS_GAP: true,
  COLUMN_KEY_COLLISION: true,
  COLUMN_HOOD_FLOOR: true,
  UNKNOWN_MATERIAL_TIER: true,
  UNKNOWN_HARDWARE_TIER: true,
  UNKNOWN_CABINET_DEPTH: true,
};

describe("every refusal a command can produce", () => {
  const cases = buildCases();
  const rows = cases.map((sweep) => [sweep.code, sweep] as const);

  it.each(rows)(
    "%s returns the exact original design object, unmodified",
    (_code, sweep) => {
      const before = JSON.stringify(sweep.design);
      const result = sweep.run();
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.design).toBe(sweep.design);
      expect(JSON.stringify(sweep.design)).toBe(before);
      expect(result).not.toHaveProperty("effect");
    },
  );

  it.each(rows)(
    "%s carries that code and locale-free params",
    (code, sweep) => {
      const result = sweep.run();
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.code).toBe(code);
      expect(result.reason.params).toBeTypeOf("object");
      expect(result.reason).not.toHaveProperty("message");
    },
  );

  it("reaches every code the union declares, except the ones recorded as unreachable", () => {
    const reached = new Set<RejectionCode>(cases.map((sweep) => sweep.code));
    for (const code of ENGINE_UNREACHABLE) reached.add(code);
    const unswept = Object.keys(ALL_REJECTION_CODES).filter(
      (code) => !reached.has(code as RejectionCode),
    );
    expect(unswept).toEqual([]);
  });
});

describe("the two refusals ADR 0031's side scan can produce", () => {
  // `NO_EMPTY_SPACE` and `RESIZE_OPENS_GAP` carry the same per-side record and the phantom verdict wins whenever any
  // side answered `opens_a_gap`; the invariant binding the two is asserted. Both codes stay: they are different
  // sentences about different situations.
  const SCAN_CODES: readonly RejectionCode[] = [
    "NO_EMPTY_SPACE",
    "RESIZE_OPENS_GAP",
  ];

  it.each(buildCases().filter((sweep) => SCAN_CODES.includes(sweep.code)))(
    "$code is exactly what its own sides record implies",
    (sweep) => {
      const result = sweep.run();
      expect(result.ok).toBe(false);
      if (
        result.ok ||
        (result.reason.code !== "NO_EMPTY_SPACE" &&
          result.reason.code !== "RESIZE_OPENS_GAP")
      ) {
        expect.unreachable("expected one of the two side-scan refusals");
      }
      const opensAGap = result.reason.params.sides.some(
        (side) => side.reason === "opens_a_gap",
      );
      expect(result.reason.code).toBe(
        opensAGap ? "RESIZE_OPENS_GAP" : "NO_EMPTY_SPACE",
      );
      // And the scan really did try both sides, so the invariant is not holding vacuously.
      expect(result.reason.params.sides.map((side) => side.side)).toEqual([
        "right",
        "left",
      ]);
    },
  );

  it("covers both verdicts, so neither branch of the invariant is untested", () => {
    const produced = buildCases()
      .filter((sweep) => SCAN_CODES.includes(sweep.code))
      .map((sweep) => {
        const result = sweep.run();
        return result.ok ? "accepted" : result.reason.code;
      });

    expect(produced.sort()).toEqual(["NO_EMPTY_SPACE", "RESIZE_OPENS_GAP"]);
  });
});
