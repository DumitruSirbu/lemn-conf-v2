// The owner's hardware answers, held to oracles written from their words and sharing nothing with the module under
// test: a lift door's third hinge reads the door (the body less 6 mm) strictly above 500 mm; a push-to-open body bills
// one latch per door leaf and none per drawer; a drawer on a push-to-open body is a push runner and never also a drawer.
// Every constant the rules are made of is retyped here, so a change to one in the source meets this file.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  carriesFronts,
  countHardwareMechanisms,
  doorBandsMm,
  KITCHEN_L_BODY_CATALOG,
  type BodyCatalog,
  type BodyDefinition,
  type DisplayEntry,
  type Handle,
  type HardwareMechanismCounts,
  type KitchenHandleSettings,
} from "../src/index.js";
import { KITCHEN_L_DESIGN } from "../src/fixtures/kitchen-l-design.js";
import { priceDesign } from "../src/pricing/price-design.js";
import { SAMPLE_PRICE_BOOK } from "../src/pricing/sample-price-book.js";
import type { PricedDesign } from "../src/pricing/price-lines.js";
import { buildKitchenLBodyCatalog } from "../src/fixtures/kitchen-l-design.js";
import { NOTHING_DISABLED } from "./support/availability.js";
import {
  DEEPENING_ROWS,
  STANDARD_HARDWARE_ID,
} from "./price-dashboard/m2-support.js";

const DOOR_LESS_THAN_BODY_MM = 6;
const THIRD_HINGE_ABOVE_DOOR_MM = 500;
const THIRD_HINGE_ABOVE_LEAF_HEIGHT_MM = 900;
const TOP_ROW_FLOOR_MM = 2_200;
const WALL_ROW_FLOOR_MM = 1_500;
const KITCHEN_DEFAULT_HANDLE: Handle = "steel";
const KITCHEN_TOP_ROW_HANDLE: Handle = "push";
const TEN_LEI_MINOR = 1_000;

const HANDLES_AND_NONE: readonly (Handle | undefined)[] = [
  undefined,
  "steel",
  "black",
  "push",
];

const KITCHEN_SETTINGS: readonly KitchenHandleSettings[] = [
  {},
  { handle: "push" },
  { handle: "black" },
  { topRowHandle: "steel" },
  { topRowHandle: "black" },
  { handle: "push", topRowHandle: "steel" },
  { handle: "black", topRowHandle: "push" },
];

function definitionOf(buildId: string): BodyDefinition {
  const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
  if (!definition) throw new Error(`No catalogue entry for "${buildId}"`);
  return definition;
}

function entryAt(
  overrides: Partial<DisplayEntry> & { buildId: string },
): DisplayEntry {
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
    kitchenSettings: {},
    ...overrides,
  };
}

/** Whether a body's fronts open without a bar, from §6.5's words alone: the handle it wears is its own if the row takes
 *  one, else the kitchen's for its row; wearing none (a row that takes none) falls to the slot. */
function oraclePushToOpen(facts: {
  readonly canHandle: boolean;
  readonly own: Handle | undefined;
  readonly y0Mm: number;
  readonly settings: KitchenHandleSettings;
}): boolean {
  const isTopRow = facts.y0Mm >= TOP_ROW_FLOOR_MM;
  if (!facts.canHandle) return isTopRow;
  const worn =
    facts.own ??
    (isTopRow
      ? (facts.settings.topRowHandle ?? KITCHEN_TOP_ROW_HANDLE)
      : (facts.settings.handle ?? KITCHEN_DEFAULT_HANDLE));
  return worn === "push";
}

function oracleLiftHinges(bodyWidthMm: number): number {
  return bodyWidthMm - DOOR_LESS_THAN_BODY_MM > THIRD_HINGE_ABOVE_DOOR_MM
    ? 3
    : 2;
}

function liftCounts(
  overrides: Partial<DisplayEntry> = {},
): HardwareMechanismCounts {
  return countHardwareMechanisms(
    [entryAt({ buildId: "wall-lift", heightMm: 700, ...overrides })],
    KITCHEN_L_BODY_CATALOG,
  );
}

const WALL_LIFT_WIDTHS_MM = definitionOf("wall-lift").sizesMm ?? [];

describe("a lift door's third hinge reads the door, strictly above 500 mm", () => {
  it.each([
    [499, 2],
    [500, 2],
    [505, 2],
    [506, 2],
    [507, 3],
    [508, 3],
    [600, 3],
  ])("hangs a lift body of %i mm on %i hinges", (widthMm, hinges) => {
    expect(liftCounts({ widthMm }).hinges).toBe(hinges);
  });

  it("answers the body's own width the way the door's follows from it, over every integer width", () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 2_000 }), (widthMm) => {
        expect(liftCounts({ widthMm }).hinges).toBe(oracleLiftHinges(widthMm));
      }),
      { numRuns: 500 },
    );
  });

  it("changes its answer at exactly one width between 100 and 2000 mm, from two hinges to three", () => {
    const widthsAtThree = Array.from(
      { length: 1_901 },
      (_, offset) => 100 + offset,
    ).filter((widthMm) => liftCounts({ widthMm }).hinges === 3);

    expect(widthsAtThree[0]).toBe(
      THIRD_HINGE_ABOVE_DOOR_MM + DOOR_LESS_THAN_BODY_MM + 1,
    );
    expect(widthsAtThree).toHaveLength(2_000 - 507 + 1);
  });

  it("hangs the widest wall-lift the catalogue builds on three hinges, and every width the catalogue builds by its door", () => {
    const widest = Math.max(...WALL_LIFT_WIDTHS_MM);

    expect(widest).toBeGreaterThan(507);
    expect(liftCounts({ widthMm: widest }).hinges).toBe(3);
    for (const widthMm of WALL_LIFT_WIDTHS_MM) {
      expect(liftCounts({ widthMm }).hinges).toBe(oracleLiftHinges(widthMm));
    }
  });

  it.each([
    ["the wall row", WALL_ROW_FLOOR_MM, 700],
    ["the top row", TOP_ROW_FLOOR_MM, 400],
    ["a taller body", WALL_ROW_FLOOR_MM, 1_300],
  ])(
    "does not read the body's height or floor: %s hangs by width alone",
    (_label, y0Mm, heightMm) => {
      for (const widthMm of [500, 506, 507, 800]) {
        expect(liftCounts({ widthMm, y0Mm, heightMm }).hinges).toBe(
          oracleLiftHinges(widthMm),
        );
      }
    },
  );

  it("still hangs an ordinary door by its leaf's height and not its width: a wall-cabinet 800 mm wide takes two hinges", () => {
    const counts = countHardwareMechanisms(
      [entryAt({ buildId: "wall-cabinet", widthMm: 400, heightMm: 700 })],
      KITCHEN_L_BODY_CATALOG,
    );

    expect(counts.hinges).toBe(2);
  });
});

describe("a lift door in a push-to-open kitchen", () => {
  it.each([500, 506, 507, 800])(
    "keeps its hinges and its lift and takes one latch at %i mm, in the wall row by its own push",
    (widthMm) => {
      expect(
        liftCounts({ widthMm, y0Mm: WALL_ROW_FLOOR_MM, handle: "push" }),
      ).toEqual({
        hinges: oracleLiftHinges(widthMm),
        drawers: 0,
        pushRunners: 0,
        pushToOpen: 1,
        lifts: 1,
      });
    },
  );

  it("takes one latch in the top row with nothing recorded, and none with a bar recorded", () => {
    expect(liftCounts({ y0Mm: TOP_ROW_FLOOR_MM }).pushToOpen).toBe(1);
    expect(
      liftCounts({ y0Mm: TOP_ROW_FLOOR_MM, handle: "steel" }).pushToOpen,
    ).toBe(0);
    expect(liftCounts({ y0Mm: TOP_ROW_FLOOR_MM, handle: "steel" }).lifts).toBe(
      1,
    );
  });
});

// The catalogue holds no body with doors and drawers both, so the cases that tell a latch-per-front rule from a
// latch-per-leaf rule have to be declared: a row spread from a real definition, differing in its fronts only.
interface MixedBody {
  readonly bandHeightsMm: readonly number[];
  readonly leavesPerBand: number;
  readonly drawers: number;
}

const MIXED_BODIES: readonly MixedBody[] = [
  { bandHeightsMm: [], leavesPerBand: 0, drawers: 3 },
  { bandHeightsMm: [700], leavesPerBand: 1, drawers: 0 },
  { bandHeightsMm: [700], leavesPerBand: 1, drawers: 1 },
  { bandHeightsMm: [700], leavesPerBand: 2, drawers: 2 },
  { bandHeightsMm: [700, 1_000], leavesPerBand: 2, drawers: 3 },
  { bandHeightsMm: [901], leavesPerBand: 1, drawers: 4 },
];

function mixedCatalog(body: MixedBody, canHandle: boolean): BodyCatalog {
  const fronts = carriesFronts({
    doorBands: doorBandsMm(body.bandHeightsMm),
    leavesPerBand: body.leavesPerBand,
    drawers: body.drawers,
  });
  return new Map([
    ["under-test", { ...definitionOf("base-sink"), fronts, canHandle }],
  ]);
}

function oracleLeaves(body: MixedBody): number {
  return body.bandHeightsMm.length * body.leavesPerBand;
}

function oracleHinges(body: MixedBody): number {
  return (
    body.leavesPerBand *
    body.bandHeightsMm.reduce(
      (total, height) =>
        total + (height > THIRD_HINGE_ABOVE_LEAF_HEIGHT_MM ? 3 : 2),
      0,
    )
  );
}

describe("a body with doors and drawers, on and off push-to-open", () => {
  const PLACEMENTS = MIXED_BODIES.flatMap((body) =>
    [true, false].flatMap((canHandle) =>
      HANDLES_AND_NONE.flatMap((own) =>
        [0, WALL_ROW_FLOOR_MM, TOP_ROW_FLOOR_MM - 1, TOP_ROW_FLOOR_MM].flatMap(
          (y0Mm) =>
            KITCHEN_SETTINGS.map((settings) => ({
              body,
              canHandle,
              own,
              y0Mm,
              settings,
            })),
        ),
      ),
    ),
  );

  it("bills latches over the door leaves, push runners over the drawers and ordinary drawers over none, wherever the bar is hidden", () => {
    for (const { body, canHandle, own, y0Mm, settings } of PLACEMENTS) {
      const entry = entryAt({
        buildId: "under-test",
        y0Mm,
        kitchenSettings: settings,
        ...(own ? { handle: own } : {}),
      });
      const isPush = oraclePushToOpen({ canHandle, own, y0Mm, settings });

      const counts = countHardwareMechanisms(
        [entry],
        mixedCatalog(body, canHandle),
      );

      expect([body, canHandle, own, y0Mm, settings, counts]).toEqual([
        body,
        canHandle,
        own,
        y0Mm,
        settings,
        {
          hinges: oracleHinges(body),
          drawers: isPush ? 0 : body.drawers,
          pushRunners: isPush ? body.drawers : 0,
          pushToOpen: isPush ? oracleLeaves(body) : 0,
          lifts: 0,
        },
      ]);
    }
  });

  it("exercises every cell of the table it holds the rule to", () => {
    const answers = new Set(
      PLACEMENTS.map(({ canHandle, own, y0Mm, settings }) =>
        oraclePushToOpen({ canHandle, own, y0Mm, settings }),
      ),
    );

    expect(answers).toEqual(new Set([true, false]));
  });

  it("splits a body's drawers between the two rates the same way whatever its doors are", () => {
    const withDoors: MixedBody = {
      bandHeightsMm: [700],
      leavesPerBand: 2,
      drawers: 2,
    };
    const withoutDoors: MixedBody = {
      bandHeightsMm: [],
      leavesPerBand: 0,
      drawers: 2,
    };
    const pushEntry = entryAt({ buildId: "under-test", handle: "push" });

    const [mixed, drawersOnly] = [withDoors, withoutDoors].map((body) =>
      countHardwareMechanisms([pushEntry], mixedCatalog(body, true)),
    );

    expect(mixed?.pushRunners).toBe(drawersOnly?.pushRunners);
    expect(mixed?.pushToOpen).toBe(2);
    expect(drawersOnly?.pushToOpen).toBe(0);
  });
});

describe("push-to-open is decided per cabinet, on the real catalogue, and the price follows it", () => {
  const DRAWER_BODY = "base-3drawer";
  const DOOR_BODY = "base-sink";
  const LEAVES_ON_DOOR_BODY = 2;
  const DRAWERS_ON_DRAWER_BODY = 3;
  const CASES = [DRAWER_BODY, DOOR_BODY].flatMap((buildId) =>
    HANDLES_AND_NONE.flatMap((own) =>
      [0, WALL_ROW_FLOOR_MM, TOP_ROW_FLOOR_MM].flatMap((y0Mm) =>
        KITCHEN_SETTINGS.map((settings) => ({ buildId, own, y0Mm, settings })),
      ),
    ),
  );

  function pricedHardwareAmount(
    placement: (typeof CASES)[number],
    book = SAMPLE_PRICE_BOOK,
  ): number {
    const design = {
      ...KITCHEN_L_DESIGN,
      settings: { cabinetDepthMm: 600, ...placement.settings },
      placements: [
        {
          id: "only",
          wall: "A" as const,
          alongMm: 400,
          y0Mm: placement.y0Mm,
          body: {
            buildId: placement.buildId,
            widthMm: 600,
            heightMm: placement.y0Mm === 0 ? 820 : 700,
            ...(placement.own ? { handle: placement.own } : {}),
          },
        },
      ],
    };
    const result = priceDesign({
      design,
      catalog: buildKitchenLBodyCatalog(600),
      book,
      pricingVersion: book.version,
      selections: { hardwareTierId: STANDARD_HARDWARE_ID },
      deepeningRows: DEEPENING_ROWS,
      availability: NOTHING_DISABLED,
    });
    if (!result.ok) throw new Error(result.failure.detail);
    return hardwareLineOf(result.priced);
  }

  function hardwareLineOf(priced: PricedDesign): number {
    const line = priced.lines.find(({ kind }) => kind === "hardware");
    if (!line) throw new Error("no hardware line");
    return line.amountMinor;
  }

  const TIER = SAMPLE_PRICE_BOOK.hardware.tiers.find(
    ({ tierId }) => tierId === STANDARD_HARDWARE_ID,
  );

  it("bills the drawer rate off push-to-open and the push-runner rate on it, to the bani, for every handle, row and kitchen setting", () => {
    if (!TIER) throw new Error("no standard tier");
    expect(TIER.perPushRunnerMinor).not.toBe(TIER.perDrawerMinor);

    for (const placement of CASES) {
      const { canHandle } = definitionOf(placement.buildId);
      const isPush = oraclePushToOpen({
        canHandle,
        own: placement.own,
        y0Mm: placement.y0Mm,
        settings: placement.settings,
      });
      const drawers =
        placement.buildId === DRAWER_BODY ? DRAWERS_ON_DRAWER_BODY : 0;
      const leaves = placement.buildId === DOOR_BODY ? LEAVES_ON_DOOR_BODY : 0;
      const exactMinor =
        2 * leaves * TIER.perHingeMinor +
        (isPush
          ? leaves * TIER.perPushToOpenMinor + drawers * TIER.perPushRunnerMinor
          : drawers * TIER.perDrawerMinor);

      expect([placement, pricedHardwareAmount(placement)]).toEqual([
        placement,
        Math.floor((exactMinor + TEN_LEI_MINOR / 2) / TEN_LEI_MINOR) *
          TEN_LEI_MINOR,
      ]);
    }
  });

  it("moves a drawer body's price with the push-runner rate on push-to-open and not off it", () => {
    if (!TIER) throw new Error("no standard tier");
    const raised = {
      ...SAMPLE_PRICE_BOOK,
      hardware: {
        ...SAMPLE_PRICE_BOOK.hardware,
        tiers: SAMPLE_PRICE_BOOK.hardware.tiers.map((tier) =>
          tier.tierId === STANDARD_HARDWARE_ID
            ? { ...tier, perPushRunnerMinor: tier.perPushRunnerMinor + 50_000 }
            : tier,
        ),
      },
    };
    const onPush = {
      buildId: DRAWER_BODY,
      own: "push" as const,
      y0Mm: 0,
      settings: {},
    };
    const offPush = {
      buildId: DRAWER_BODY,
      own: "steel" as const,
      y0Mm: 0,
      settings: {},
    };

    expect(
      pricedHardwareAmount(onPush, raised) - pricedHardwareAmount(onPush),
    ).toBe(DRAWERS_ON_DRAWER_BODY * 50_000);
    expect(pricedHardwareAmount(offPush, raised)).toBe(
      pricedHardwareAmount(offPush),
    );
  });
});
