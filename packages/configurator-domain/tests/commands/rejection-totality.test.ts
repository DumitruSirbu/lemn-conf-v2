// Every refusal the four commands can actually produce, swept for the same three properties.
//
// `rejection.test.ts` proves the message table is total over the code union, but it calls
// `renderRejection` directly — it never asks whether a command can reach the code, nor what the
// command does to the design on the way out. This file drives each code out of a real command and
// asserts the whole refusal contract:
//
//   1. the design that comes back is the **exact original object** (`toBe`, not `toEqual` — a
//      structural copy passes `toEqual` and is still a defect, because a store applying results
//      unconditionally would replace state with an equal-but-different object);
//   2. the code is the stable one the panel switches on;
//   3. the sentence is non-empty Romanian, with no placeholder leaking into the copy.
import { describe, expect, it } from "vitest";

import type { CommandResult } from "../../src/commands/command-result.js";
import { insertBody } from "../../src/commands/insert-body.js";
import type { RejectionCode } from "../../src/commands/rejection.js";
import { removePlacement } from "../../src/commands/remove-placement.js";
import { setFinish, setHandle } from "../../src/commands/set-appearance.js";
import type { Design } from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import type { BodyCatalog, BodyDefinition } from "../../src/void-engine.js";
import { clearBodies, insertInto, OCCURRED_AT } from "../support/commands.js";
import { createFakeProbe } from "../support/fake-probe.js";
import {
  advance,
  createWorld,
  voidAt,
  type KitchenWorld,
} from "../support/kitchen-world.js";
import {
  columnWorld,
  syntheticDesign,
  type SyntheticMember,
} from "../support/synthetic-world.js";

const ROMANIAN_LETTERS = /[ăâîșțĂÂÎȘȚ]/;
const PLACEHOLDER_LEAKS = ["undefined", "null", "NaN", "Infinity", "[object"];
const FRIDGE_COLUMN = "B|2.45";

/** §5.1's third refusal is `!canDelete (corners)`, and the seeded population's only non-deletable
 *  entry is the hob — which is an accessory, so it refuses one guard earlier. The corner bases M1
 *  draws are not placements at all. A structural entry therefore has to be introduced to reach the
 *  code, which is itself worth recording. */
const CORNER_BASE: BodyDefinition = {
  kind: "base_cabinet",
  band: "base",
  frameDepthMm: 580,
  canFinish: true,
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

/** The open shelf is the only catalogue body with no doors, and the seeded design contains none —
 *  so reaching FINISH_NOT_SUPPORTED means inserting one first. */
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
  const clearedFridge = clearBodies(world, ["p7", "p24"]);
  const clearedDishwasher = clearBodies(world, ["p1"]);
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
      code: "ACCESSORY_NOT_DELETABLE",
      design: world.design,
      run: () => removeFrom(world.design, "p3", "placement"),
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
      code: "TARGET_NOT_REPLACEABLE",
      design: world.design,
      run: () =>
        insertInto(world, { kind: "placement", id: "p3" }, "base-2door"),
    },
    {
      code: "BAND_MISMATCH",
      design: clearedDishwasher.design,
      run: () =>
        insertInto(
          clearedDishwasher,
          voidTarget(clearedDishwasher, "A|2.00", 0),
          "wall-2door",
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
          "wall-2door",
        ),
    },
    {
      // §11 row 6: the hood is fixed at 710 mm and only a `column` body may exceed its level. It
      // is the only route to this code — a base body is refused by the band gate first, and every
      // wall body except the hood is height-flexible.
      code: "HEIGHT_EXCEEDS_LEVEL",
      design: clearedFridge.design,
      run: () =>
        insertInto(
          clearedFridge,
          voidTarget(clearedFridge, FRIDGE_COLUMN, 2.2),
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
          "base-2door",
          createFakeProbe({ carcassWidthM: 0.9 }),
        ),
    },
    {
      // ADR 0011 Gap B: the probe is an injected port, so a measurement that is not a number is a
      // data condition the command must answer with a refusal.
      code: "MEASUREMENT_UNUSABLE",
      design: clearedFridge.design,
      run: () =>
        insertInto(
          clearedFridge,
          voidTarget(clearedFridge, FRIDGE_COLUMN, 0),
          "base-2door",
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
          target: { kind: "placement", id: "p0" },
          buildId: "base-2door",
          probe: createFakeProbe(),
          occurredAt: OCCURRED_AT,
        }),
    },
    {
      code: "NON_INTEGER_MILLIMETRES",
      design: offGrid.design,
      run: () =>
        insertInto(offGrid, voidTarget(offGrid, "A|1.00", 0), "base-2door"),
    },
    {
      code: "FINISH_NOT_SUPPORTED",
      design: shelf.world.design,
      run: () =>
        setFinish({
          design: shelf.world.design,
          catalog: KITCHEN_L_BODY_CATALOG,
          target: { kind: "placement", id: shelf.placementId },
          finish: "sage",
          occurredAt: OCCURRED_AT,
        }),
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
  ];
}

/** `NO_SNAP_POSITION` is not in the sweep because no command can reach it: `minY` is always one of
 *  the snap candidates, and `refuseHeight` has already proved that `minY + h` fits inside the span
 *  by the time the candidate list is built. It is an assertion, not a refusal a customer can see.
 *  Recorded here rather than silently omitted. */
const ENGINE_UNREACHABLE: readonly RejectionCode[] = ["NO_SNAP_POSITION"];

/** Every code in the union, as a `Record` keyed by it rather than as a hand-counted list: adding a
 *  code to `RejectionDetail` without adding it here is a **compile error**, so the sweep below
 *  cannot go on passing while a new code sits unswept. A list and a magic number can. */
const ALL_REJECTION_CODES: Readonly<Record<RejectionCode, true>> = {
  VOID_SELECTED: true,
  TARGET_NOT_FOUND: true,
  INVALID_OCCURRED_AT: true,
  ACCESSORY_NOT_DELETABLE: true,
  NOT_DELETABLE: true,
  NOT_IN_LIBRARY: true,
  NOT_INSERTABLE: true,
  TARGET_NOT_REPLACEABLE: true,
  BAND_MISMATCH: true,
  WIDTH_TOO_LARGE: true,
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
  HANDLE_NOT_SUPPORTED: true,
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
    "%s carries that code and a Romanian sentence",
    (code, sweep) => {
      const result = sweep.run();
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.code).toBe(code);
      expect(result.reason.message.trim().length).toBeGreaterThan(0);
      expect(result.reason.message).toMatch(ROMANIAN_LETTERS);
      expect(result.reason.message.endsWith(".")).toBe(true);
      for (const leak of PLACEHOLDER_LEAKS) {
        expect(result.reason.message).not.toContain(leak);
      }
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
