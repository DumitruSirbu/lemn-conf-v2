// M7C wave C2 slice S2: the corner wall unit enters generated shells (FB-004 / FB-011).
//
// The owner's rulings: the corner is "fixed, non editable and cover all empty space within the corner";
// in a U whose three entered walls total 10 000 mm or more the back wall stays base-only, no unit, the
// wall-A strips tiled as before; the top unit follows the ceiling rule (a room 2600 mm high or more).
//
// Asked of **generated** rooms, at 600 and after a change to 700, for an L, a right-hand L and both
// corners of a U.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  buildLShellDesign,
  buildUShellDesign,
  cabinetDepthMmOf,
  cornerOf,
  derivePlacementRecords,
  priceDesign,
  recomputeVoids,
  type Design,
  type DesignPlacement,
  type DesignRoom,
  MAX_PLACEMENTS,
} from "../../src/index.js";
import { removePlacement } from "../../src/commands/remove-placement.js";
import { setCabinetDepth } from "../../src/commands/set-cabinet-depth.js";
import { setWidth } from "../../src/commands/set-width.js";
import { buildKitchenLBodyCatalog } from "../../src/fixtures/kitchen-l-design.js";
import { generateKitchen } from "../../src/generation/generate-kitchen.js";
import { describeSelection } from "../../src/queries/describe-selection.js";
import { offersFor } from "../../src/queries/offers.js";
import {
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
} from "../../src/pricing/sample-price-book.js";
import { validateDesignForCatalog } from "../../src/validate-design.js";
import { deriveRecordedColumns } from "../../src/void-engine.js";
import { toMetres } from "../../src/millimetres.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";
import { createWorld } from "../support/kitchen-world.js";
import { asBeforeTheCornerUnit } from "../support/before-c2-corner-unit.js";

const OCCURRED_AT = "2026-10-01T10:00:00.000Z";
const UNIT_BUILD_ID = "wall-corner-x-900";
const TOP_UNIT_BUILD_ID = "wall-corner-x-900-top";
const X_LEG_BUILD_ID = "base-corner-x-900";
const WALL_ROW_FLOOR_MM = 1500;
const TOP_ROW_FLOOR_MM = 2200;
const TOP_ROW_MIN_ROOM_HEIGHT_MM = 2600;
const LARGE_U_TOTAL_MM = 10_000;
const UNIT_PRICE_MINOR = 160_000;
const TOP_UNIT_PRICE_MINOR = 90_000;

const L_ROOM: DesignRoom = {
  shape: "L",
  widthMm: 4100,
  depthMm: 3300,
  heightMm: 2600,
};
const RIGHT_L_ROOM: DesignRoom = { ...L_ROOM, cornerDirection: "right" };

function uRoom(
  widthMm: number,
  depthMm: number,
  wallCMm: number,
  heightMm = 2600,
): DesignRoom {
  return { shape: "U", widthMm, depthMm, wallCMm, heightMm };
}

/** Totals 9 999 and 10 000: either side of the large U's threshold. */
const U_JUST_UNDER = uRoom(3333, 3333, 3333);
const U_AT_THE_THRESHOLD = uRoom(3334, 3333, 3333);

function generated(room: DesignRoom): Design {
  const result = generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
  return result.design;
}

function atDepth(design: Design, cabinetDepthMm: number): Design {
  const result = setCabinetDepth({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    cabinetDepthMm,
    probeAt: createFakeProbeFactory(),
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) throw new Error(`depth refused: ${result.reason.code}`);
  return result.design;
}

function unitsOf(design: Design): DesignPlacement[] {
  return design.placements.filter((placement) =>
    placement.body.buildId.startsWith(UNIT_BUILD_ID),
  );
}

function xLegsOf(design: Design): DesignPlacement[] {
  return design.placements.filter(
    (placement) => placement.body.buildId === X_LEG_BUILD_ID,
  );
}

function spanOf(placement: DesignPlacement): [number, number] {
  return [
    placement.alongMm - placement.body.widthMm / 2,
    placement.alongMm + placement.body.widthMm / 2,
  ];
}

const CORNER_COUNT_BY_ROOM: readonly (readonly [string, DesignRoom, number])[] =
  [
    ["L", L_ROOM, 1],
    ["right-hand L", RIGHT_L_ROOM, 1],
    ["U", uRoom(4000, 3000, 2800), 2],
    ["U at 9 999", U_JUST_UNDER, 2],
  ];

describe.each(CORNER_COUNT_BY_ROOM)(
  "a generated %s",
  (_label, room, cornerCount) => {
    const design = generated(room);

    it("carries the middle unit at each corner, spanning exactly the base X-leg's span", () => {
      const middles = unitsOf(design).filter(
        (placement) => placement.body.buildId === UNIT_BUILD_ID,
      );

      expect(middles).toHaveLength(cornerCount);
      expect(
        middles.map(spanOf).sort((one, other) => one[0] - other[0]),
      ).toEqual(
        xLegsOf(design)
          .map(spanOf)
          .sort((one, other) => one[0] - other[0]),
      );
      for (const middle of middles) {
        expect([middle.wall, middle.y0Mm, middle.body.heightMm]).toEqual([
          "A",
          WALL_ROW_FLOOR_MM,
          700,
        ]);
      }
    });

    it("carries the top unit at each corner when the room is 2600 high", () => {
      const tops = unitsOf(design).filter(
        (placement) => placement.body.buildId === TOP_UNIT_BUILD_ID,
      );

      expect(tops).toHaveLength(cornerCount);
      for (const top of tops) {
        expect([top.wall, top.y0Mm, top.body.heightMm]).toEqual([
          "A",
          TOP_ROW_FLOOR_MM,
          400,
        ]);
      }
    });

    it("records no empty column over a corner base on the back wall at the wall or top row, and no void", () => {
      const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
      const records = derivePlacementRecords(design, catalog);
      const columns = deriveRecordedColumns(
        records,
        {
          emptyColumns: design.emptyColumns,
          columnExtents: design.columnExtents,
        },
        toMetres(design.room.widthMm),
      );
      const corners = xLegsOf(design).map(spanOf);
      const overACorner = (wall: string, fromMm: number, toMm: number) =>
        wall === "A" &&
        corners.some(([start, end]) => fromMm < end && toMm > start);

      expect(
        (design.emptyColumns ?? []).filter(
          (entry) =>
            entry.y0Mm >= WALL_ROW_FLOOR_MM &&
            overACorner(
              entry.wall,
              entry.alongMm - entry.widthMm / 2,
              entry.alongMm + entry.widthMm / 2,
            ),
        ),
      ).toEqual([]);
      expect(
        recomputeVoids(records, columns).filter(
          (gap) =>
            gap.y0 * 1000 >= WALL_ROW_FLOOR_MM &&
            overACorner(gap.wall, gap.x * 1000 - 1, gap.x * 1000 + 1),
        ),
      ).toEqual([]);
    });

    it("raises no finding", () => {
      expect(
        validateDesignForCatalog(
          design,
          buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
        ),
      ).toEqual([]);
    });

    it("keeps each unit's span through 600 → 700 → 600 and raises no finding", () => {
      const deep = atDepth(design, 700);
      const back = atDepth(deep, 600);

      for (const moved of [deep, back]) {
        expect(
          unitsOf(moved).map((placement) => [
            placement.id,
            ...spanOf(placement),
          ]),
        ).toEqual(
          unitsOf(design).map((placement) => [
            placement.id,
            ...spanOf(placement),
          ]),
        );
        expect(
          validateDesignForCatalog(
            moved,
            buildKitchenLBodyCatalog(cabinetDepthMmOf(moved)),
          ),
        ).toEqual([]);
      }
    });

    it("files every unit under its corner by cornerOf, left or right", () => {
      const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
      const corners = unitsOf(design).map((placement) =>
        cornerOf(placement, design.room, catalog),
      );

      expect(corners.filter((corner) => corner === "right")).toHaveLength(
        design.room.shape === "U" ? corners.length / 2 : 0,
      );
      expect(corners).not.toContain(undefined);
    });
  },
);

describe("the large U's back wall stays base-only (owner, Q8 (iii); criterion 2a)", () => {
  it("places no unit at 10 000 mm in total and tiles wall A's strips as before, 800 + 100 at both corners", () => {
    const design = generated(U_AT_THE_THRESHOLD);
    const stripsAt = (fromMm: number, toMm: number) =>
      (design.emptyColumns ?? [])
        .filter(
          (entry) =>
            entry.wall === "A" &&
            entry.y0Mm === WALL_ROW_FLOOR_MM &&
            entry.alongMm - entry.widthMm / 2 >= fromMm &&
            entry.alongMm + entry.widthMm / 2 <= toMm,
        )
        .map((entry) => entry.widthMm);

    expect(unitsOf(design)).toEqual([]);
    expect(stripsAt(0, 900)).toEqual([800, 100]);
    expect(
      stripsAt(U_AT_THE_THRESHOLD.widthMm - 900, U_AT_THE_THRESHOLD.widthMm),
    ).toEqual([800, 100]);
  });

  it("has a unit one millimetre of total below the threshold and none at it", () => {
    const below = buildUShellDesign({
      room: U_JUST_UNDER,
      occurredAt: OCCURRED_AT,
    });
    const at = buildUShellDesign({
      room: U_AT_THE_THRESHOLD,
      occurredAt: OCCURRED_AT,
    });

    expect(
      U_JUST_UNDER.widthMm + U_JUST_UNDER.depthMm + (U_JUST_UNDER.wallCMm ?? 0),
    ).toBe(LARGE_U_TOTAL_MM - 1);
    expect(unitsOf(below)).toHaveLength(4);
    expect(unitsOf(at)).toEqual([]);
  });
});

describe("the top unit follows the ceiling rule", () => {
  it.each([2200, 2599, 2600, 3900])(
    "at %i mm the shell holds the middle unit, and the top unit only from 2600",
    (heightMm) => {
      const shell = buildLShellDesign({
        room: { ...L_ROOM, heightMm },
        occurredAt: OCCURRED_AT,
      });

      expect(unitsOf(shell).map((placement) => placement.body.buildId)).toEqual(
        heightMm >= TOP_ROW_MIN_ROOM_HEIGHT_MM
          ? [UNIT_BUILD_ID, TOP_UNIT_BUILD_ID]
          : [UNIT_BUILD_ID],
      );
    },
  );
});

describe("the unit is structural (ADR 0021): fixed, not editable, nothing insertable in its span", () => {
  const world = createWorld(generated(L_ROOM), buildKitchenLBodyCatalog(600));

  it.each(["p27", "p28"])(
    "%s offers nothing, refuses deletion and every width",
    (id) => {
      const target = { kind: "placement", id } as const;
      const meta = describeSelection({ kitchenSettings: {}, ...world, target });
      const removal = removePlacement({
        design: world.design,
        catalog: world.catalog,
        target,
        occurredAt: OCCURRED_AT,
      });
      const columns = deriveRecordedColumns(
        world.records,
        {
          emptyColumns: world.design.emptyColumns,
          columnExtents: world.design.columnExtents,
        },
        toMetres(world.design.room.widthMm),
      );
      const widthMm =
        world.design.placements.find((p) => p.id === id)?.body.widthMm ?? 0;

      expect({
        canReplace: meta?.canReplace,
        canDelete: meta?.canDelete,
        canHandle: meta?.canHandle,
        canWidth: meta?.canWidth,
        fixedWidth: meta?.fixedWidth,
        structuralReason: meta?.structuralReason,
      }).toEqual({
        canReplace: false,
        canDelete: false,
        canHandle: false,
        canWidth: false,
        fixedWidth: true,
        structuralReason: "corner",
      });
      expect(offersFor({ ...world, target })).toEqual([]);
      expect(removal.ok ? "removed" : removal.reason.code).toBe(
        "NOT_DELETABLE",
      );
      createFakeProbeFactory()(600).use((probe) => {
        for (const resized of [widthMm - 50, widthMm + 50]) {
          expect(
            setWidth({
              design: world.design,
              columns,
              target,
              catalog: world.catalog,
              widthMm: resized,
              probe,
              occurredAt: OCCURRED_AT,
            }).ok,
          ).toBe(false);
        }
      });
    },
  );

  it("declares one handle and one leaf, as the side corner pieces do", () => {
    for (const buildId of [UNIT_BUILD_ID, TOP_UNIT_BUILD_ID]) {
      const definition = world.catalog.get(buildId);

      expect(definition?.cabinetHandles).toEqual(
        world.catalog.get("wall-corner-return-570")?.cabinetHandles,
      );
      expect(definition?.kind).toBe(
        world.catalog.get(
          buildId === UNIT_BUILD_ID
            ? "wall-corner-return-570"
            : "wall-corner-return-570-top",
        )?.kind,
      );
    }
  });

  it("is not a catalogue row a customer can choose", () => {
    for (const buildId of [UNIT_BUILD_ID, TOP_UNIT_BUILD_ID]) {
      expect(world.catalog.get(buildId)?.insertable).not.toBe(true);
    }
  });
});

describe("the price rises by exactly the units' lines", () => {
  const pricedLines = (design: Design) => {
    const result = priceDesign({
      design,
      catalog: buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
      book: SAMPLE_PRICE_BOOK,
      pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    });
    if (!result.ok) throw new Error(`unpriced: ${result.failure.code}`);
    const byKind = (kind: string) =>
      result.priced.lines
        .filter((line) => line.kind === kind)
        .reduce((sum, line) => sum + line.amountMinor, 0);
    return {
      total: result.priced.totalMinor,
      cabinet: byKind("cabinet"),
      hardware: byKind("hardware"),
      material: byKind("material"),
    };
  };
  const withoutTheUnits = (design: Design): Design => ({
    ...design,
    placements: design.placements.filter(
      (placement) => !placement.body.buildId.startsWith(UNIT_BUILD_ID),
    ),
  });

  it.each([
    ["L", L_ROOM, 1],
    ["U", uRoom(4000, 3000, 2800), 2],
  ] as const)(
    "in a %s: the cabinet lines rise by 160 000 + 90 000 per corner (%i), the hardware tier by the units' leaves and bars, and nothing else",
    (_label, room, corners) => {
      const design = generated(room);
      const full = pricedLines(design);
      const bare = pricedLines(withoutTheUnits(design));

      expect(full.cabinet - bare.cabinet).toBe(
        corners * (UNIT_PRICE_MINOR + TOP_UNIT_PRICE_MINOR),
      );
      expect(full.material - bare.material).toBe(0);
      expect(full.hardware - bare.hardware).toBeGreaterThan(0);
      expect(full.total - bare.total).toBe(
        full.cabinet - bare.cabinet + (full.hardware - bare.hardware),
      );
    },
  );

  it("below 2600 the middle unit's one cabinet line is the whole cabinet difference", () => {
    const design = generated({ ...L_ROOM, heightMm: 2200 });

    expect(
      pricedLines(design).cabinet -
        pricedLines(withoutTheUnits(design)).cabinet,
    ).toBe(UNIT_PRICE_MINOR);
  });
});

describe("what a design stored before the unit does", () => {
  it("loads with no finding and takes the depth command, keeping its strips and having no unit", () => {
    const shell = buildLShellDesign({ room: L_ROOM, occurredAt: OCCURRED_AT });
    const before = asBeforeTheCornerUnit(
      JSON.parse(JSON.stringify(shell)) as never,
      330,
      L_ROOM.heightMm,
    ) as unknown as Design;

    expect(unitsOf(before)).toEqual([]);
    expect(
      (before.emptyColumns ?? []).filter(
        (entry) => entry.wall === "A" && entry.y0Mm === WALL_ROW_FLOOR_MM,
      ),
    ).toHaveLength(2);
    expect(
      validateDesignForCatalog(before, buildKitchenLBodyCatalog(600)),
    ).toEqual([]);
    const deep = atDepth(before, 700);
    expect(
      validateDesignForCatalog(deep, buildKitchenLBodyCatalog(700)),
    ).toEqual([]);
    expect(unitsOf(deep)).toEqual([]);
  });
});

describe("the shells at the edges of the approved range", () => {
  it("builds and validates the approved L 900 × 1000's shell, with no recorded space and the unit over the whole corner", () => {
    const room: DesignRoom = {
      shape: "L",
      widthMm: 900,
      depthMm: 1000,
      heightMm: 2200,
    };
    const shell = buildLShellDesign({ room, occurredAt: OCCURRED_AT });

    expect(shell.emptyColumns ?? []).toEqual([]);
    expect(unitsOf(shell).map((placement) => placement.body.buildId)).toEqual([
      UNIT_BUILD_ID,
    ]);
    expect(
      validateDesignForCatalog(shell, buildKitchenLBodyCatalog(600)),
    ).toEqual([]);
  });

  it("builds an odd-width U whose two units end on the base X-legs' own ends, on whole millimetres", () => {
    const shell = buildUShellDesign({
      room: uRoom(3701, 2801, 2801),
      occurredAt: OCCURRED_AT,
    });
    const units = unitsOf(shell)
      .filter((placement) => placement.body.buildId === UNIT_BUILD_ID)
      .map(spanOf)
      .sort((one, other) => one[0] - other[0]);

    expect(units).toEqual(
      xLegsOf(shell)
        .map(spanOf)
        .sort((one, other) => one[0] - other[0]),
    );
    expect(units[1]?.[1]).toBe(3701);
    expect(
      [...shell.placements, ...(shell.emptyColumns ?? [])].filter(
        (entry) => !Number.isInteger(entry.alongMm),
      ),
    ).toEqual([]);
    expect(
      validateDesignForCatalog(shell, buildKitchenLBodyCatalog(600)),
    ).toEqual([]);
  });

  propertyTest.prop(
    [
      fc.integer({ min: 900, max: 6000 }),
      fc.integer({ min: 1000, max: 6000 }),
      fc.constantFrom(2200, 2599, 2600, 3900),
    ],
    { numRuns: 150 },
  )(
    "every approved L shell holds the unit over exactly the X-leg's span, and no finding",
    (widthMm, depthMm, heightMm) => {
      const room: DesignRoom = { shape: "L", widthMm, depthMm, heightMm };
      const shell = buildLShellDesign({ room, occurredAt: OCCURRED_AT });
      const middle = unitsOf(shell).find(
        (placement) => placement.body.buildId === UNIT_BUILD_ID,
      );

      const xLeg = xLegsOf(shell)[0];

      expect(middle && spanOf(middle)).toEqual(xLeg && spanOf(xLeg));
      expect(
        unitsOf(shell).some(
          (placement) => placement.body.buildId === TOP_UNIT_BUILD_ID,
        ),
      ).toBe(heightMm >= TOP_ROW_MIN_ROOM_HEIGHT_MM);
      expect(
        validateDesignForCatalog(shell, buildKitchenLBodyCatalog(600)),
      ).toEqual([]);
    },
  );

  it("keeps the largest generated design under MAX_PLACEMENTS", () => {
    const largest = generated(uRoom(3300, 3300, 3300, 3900));

    expect(largest.placements.length).toBeLessThanOrEqual(MAX_PLACEMENTS);
  });
});
