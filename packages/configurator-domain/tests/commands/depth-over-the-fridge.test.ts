// M12 wave W3a (owner feedback 2026-11-14, item 3; ADR 0183 decisions 4 and 7, ADR 0103 decision 3), at the editor: a
// wall body over a freestanding fridge is built 700 mm deep at every cabinet depth, over a pantry, a tower or a fridge
// housing it is built to the cabinet-depth line, over a base cabinet to the map's row, and the depth follows the fridge
// when the fridge goes and when it comes back.
//
// The oracle for "every other body is as it was" is the depth rule as W2 left it (`support/before-m12-w3a.ts`).
import { describe, expect, it, vi } from "vitest";

import { setCabinetDepth } from "../../src/commands/set-cabinet-depth.js";
import type { Design, DesignPlacement } from "../../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { WALL_FRONT_ASSEMBLY_MM } from "../../src/worktop-depth.js";
import { beforeM12W3a } from "../support/before-m12-w3a.js";
import { insertInto, OCCURRED_AT } from "../support/commands.js";
import {
  builtDepthMm,
  FRIDGE,
  placement,
  withoutBodies,
  worldAt,
  type Setting,
  type Tall,
} from "../support/depth-over-the-fridge-world.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";
import {
  advance,
  voidAt,
  type KitchenWorld,
} from "../support/kitchen-world.js";

vi.mock("../../src/wall-body-over-it.js", async (importOriginal) => {
  const { withTheDeepWallBodySwitchable } = await import(
    "../support/before-m12-w3a.js"
  );
  return withTheDeepWallBodySwitchable(await importOriginal());
});

/** The owner's number (ADR 0183 decision 4), the capped map rows (ADR 0060) and the cabinet-depth line, stated here. */
const OVER_THE_FRIDGE_MM = 700;
const CAPPED_MM = { 600: 330, 700: 400 } as const;
const WALL_ROW_FLOOR_M = 1.5;
const FRIDGE_TOP_M = 1.85;
const CEILING_MM = 2600;
const PROBE_AT = createFakeProbeFactory();

const SETTINGS: readonly Setting[] = [600, 700];

const COVERED_BY_THE_LINE: readonly Tall[] = [
  { buildId: "tall-fridge-housing", heightMm: 2200, widthMm: 600 },
  { buildId: "tall-pantry", heightMm: 2200, widthMm: 600 },
  { buildId: "tall-oven-tower", heightMm: 2200, widthMm: 600 },
];

/** A column with `tall` standing in it and an open void above it: a cabinet stood there first so the column's extent
 *  reaches the ceiling (ADR 0011 Gap D), then was removed. */
function openOver(setting: Setting, tall: Tall): KitchenWorld {
  return withoutBodies(
    worldAt(setting, [
      placement("tall", tall.buildId, 0, tall.widthMm, 0, tall.heightMm),
      placement(
        "cap",
        "wall-cabinet",
        0,
        tall.widthMm,
        tall.heightMm,
        CEILING_MM - tall.heightMm,
      ),
    ]),
    ["cap"],
  );
}

function openOverABase(setting: Setting): KitchenWorld {
  return withoutBodies(
    worldAt(setting, [
      placement("base", "base-drawer2-600", 0, 600, 0, 820),
      placement("wall", "wall-cabinet", 0, 600, 1500, 700),
      placement("top", "wall-cabinet", 0, 600, 2200, 400),
    ]),
    ["wall", "top"],
  );
}

/** The world has one column; the depth a wall cabinet in the void at `floorM` of it is built to. */
function builtOverTheFirstMemberMm(
  world: KitchenWorld,
  floorM: number,
): number {
  const column = world.records[0]?.col;
  if (column === undefined) throw new Error("the world has no member");
  return builtDepthMm(world, column, floorM);
}

function changeTo(design: Design, cabinetDepthMm: number): Design {
  const result = setCabinetDepth({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    cabinetDepthMm,
    probeAt: PROBE_AT,
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
  return result.design;
}

describe("an inserted wall cabinet is built to what the column declares (W3a-3)", () => {
  for (const setting of SETTINGS) {
    it(`builds ${String(OVER_THE_FRIDGE_MM)} over a freestanding fridge at setting ${String(setting)}`, () => {
      const world = openOver(setting, FRIDGE);

      expect(
        world.columns.get(world.records[0]?.col ?? "")?.hasDeepWallBodyUnder,
      ).toBe(true);
      expect(builtOverTheFirstMemberMm(world, FRIDGE_TOP_M)).toBe(
        OVER_THE_FRIDGE_MM,
      );
    });

    for (const tall of COVERED_BY_THE_LINE) {
      it(`builds the cabinet-depth line over a ${tall.buildId} at setting ${String(setting)}, as before`, () => {
        const world = openOver(setting, tall);

        expect(
          world.columns.get(world.records[0]?.col ?? "")?.hasDeepWallBodyUnder,
        ).toBe(false);
        expect(builtOverTheFirstMemberMm(world, tall.heightMm / 1000)).toBe(
          setting,
        );
      });
    }

    it(`builds the map's wall row over a base cabinet at setting ${String(setting)}, as before`, () => {
      expect(
        builtOverTheFirstMemberMm(openOverABase(setting), WALL_ROW_FLOOR_M),
      ).toBe(CAPPED_MM[setting]);
    });
  }

  it("builds the deepest declared depth over the fridge whatever the setting is, never the machine's 742", () => {
    const depths = SETTINGS.map((setting) =>
      builtOverTheFirstMemberMm(openOver(setting, FRIDGE), FRIDGE_TOP_M),
    );

    expect(new Set(depths)).toEqual(new Set([OVER_THE_FRIDGE_MM]));
  });
});

describe("the depth follows the setting's round trip and the fridge's coming and going (W3a-4)", () => {
  const OTHERS: readonly DesignPlacement[] = [
    placement("base", "base-drawer2-600", 700, 600, 0, 820),
    placement("over-base", "wall-cabinet", 700, 600, 1500, 700),
    placement("pantry", "tall-pantry", 1300, 600, 0, 2200),
    placement("over-pantry", "wall-cabinet", 1300, 600, 2200, 400),
  ];

  /** One design with a fridge, a cabinet inserted over it by the editor, and bodies of the other three kinds. */
  function kitchenWithACabinetOverTheFridge(): Design {
    const open = withoutBodies(
      worldAt(600, [
        placement("fridge", "fridge-free", 0, 700, 0, 1850),
        placement("cap", "wall-cabinet", 0, 700, 1850, 750),
        ...OTHERS,
      ]),
      ["cap"],
    );
    const inserted = insertInto(
      open,
      { kind: "void", id: voidAt(open, "A|0.35", FRIDGE_TOP_M).id },
      "wall-cabinet",
    );
    if (!inserted.ok) throw new Error(`refused: ${inserted.reason.code}`);
    return inserted.design;
  }

  function walk(start: Design): readonly Design[] {
    const up = changeTo(start, 700);
    return [start, up, changeTo(up, 600)];
  }

  it("keeps the over-fridge cabinet at 700 through 600, 700, 600 while every other body is as W2 left it", () => {
    const now = walk(kitchenWithACabinetOverTheFridge());
    const w2 = beforeM12W3a(() => walk(kitchenWithACabinetOverTheFridge()));
    const seatOf = (design: Design, id: string) =>
      design.placements.find((candidate) => candidate.id === id)?.body
        .seatDepthMm;
    const others = (design: Design) =>
      design.placements.filter(
        (candidate) => candidate.id !== overTheFridgeId(design),
      );

    for (const [step, design] of now.entries()) {
      expect(
        seatOf(design, overTheFridgeId(design)),
        `step ${String(step)}`,
      ).toBe(OVER_THE_FRIDGE_MM - WALL_FRONT_ASSEMBLY_MM);
      const baseline = w2[step];
      if (!baseline) throw new Error(`no W2 design at step ${String(step)}`);
      expect(others(design), `step ${String(step)}`).toEqual(others(baseline));
    }
    // The baseline really is different where it should be: W2 followed the setting, so the comparison can fail.
    expect(w2.map((design) => seatOf(design, overTheFridgeId(design)))).toEqual(
      [
        600 - WALL_FRONT_ASSEMBLY_MM,
        OVER_THE_FRIDGE_MM - WALL_FRONT_ASSEMBLY_MM,
        600 - WALL_FRONT_ASSEMBLY_MM,
      ],
    );
  });

  /** The one cabinet standing on the fridge's top, found by where it is and not by an id the engine chose. */
  function overTheFridgeId(design: Design): string {
    const found = design.placements.find(
      (candidate) =>
        candidate.body.buildId === "wall-cabinet" &&
        candidate.y0Mm === 1850 &&
        candidate.alongMm === 350,
    );
    if (!found) throw new Error("no cabinet over the fridge");
    return found.id;
  }
});

describe("the cabinet over a column is re-planned when the fridge under it is replaced, and back (W3a-4, ADR 0103 decision 3)", () => {
  const COLUMN = "A|0.35";

  /** A fridge with its cabinet standing at 2200, above a 350 mm gap: the pantry that replaces it fits under the
   *  cabinet, which a cabinet on the fridge's own top would refuse (ADR 0183 Amendment A). The cabinet records the
   *  700 mm build the fridge gave it. */
  function fridgeWithACabinetAbove(): KitchenWorld {
    return worldAt(600, [
      placement("fridge", "fridge-free", 0, 700, 0, 1850),
      placement(
        "cabinet",
        "wall-cabinet",
        0,
        700,
        2200,
        400,
        OVER_THE_FRIDGE_MM - WALL_FRONT_ASSEMBLY_MM,
      ),
    ]);
  }

  function cabinetSeatMm(world: KitchenWorld): number | undefined {
    return world.design.placements.find(({ id }) => id === "cabinet")?.body
      .seatDepthMm;
  }

  function insertedInto(
    world: KitchenWorld,
    floorM: number,
    buildId: string,
  ): KitchenWorld {
    const result = insertInto(
      world,
      { kind: "void", id: voidAt(world, COLUMN, floorM).id },
      buildId,
    );
    if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
    return advance(world, result.design);
  }

  it("re-plans the cabinet to the cabinet-depth line when a pantry takes the fridge's place, and to 700 when the fridge returns", () => {
    const withFridge = fridgeWithACabinetAbove();
    expect(withFridge.columns.get(COLUMN)?.hasDeepWallBodyUnder).toBe(true);

    const fridgeGone = withoutBodies(withFridge, ["fridge"]);
    expect(cabinetSeatMm(fridgeGone)).toBe(
      OVER_THE_FRIDGE_MM - WALL_FRONT_ASSEMBLY_MM,
    );
    expect(fridgeGone.columns.get(COLUMN)?.hasDeepWallBodyUnder).toBe(false);

    const withPantry = insertedInto(fridgeGone, 0, "tall-pantry");
    expect(cabinetSeatMm(withPantry)).toBe(600 - WALL_FRONT_ASSEMBLY_MM);

    const pantryGone = withoutBodies(withPantry, [
      withPantry.design.placements.find(
        ({ body }) => body.buildId === "tall-pantry",
      )?.id ?? "",
    ]);
    const fridgeBack = insertedInto(pantryGone, 0, "fridge-free");
    expect(fridgeBack.columns.get(COLUMN)?.hasDeepWallBodyUnder).toBe(true);
    expect(cabinetSeatMm(fridgeBack)).toBe(
      OVER_THE_FRIDGE_MM - WALL_FRONT_ASSEMBLY_MM,
    );
  });
});

describe("the reference kitchen at setting 700 is byte-equal to W2's, and at 600 only the over-fridge body moves (W3a-1, W3a-2)", () => {
  const walkTo = (cabinetDepthMm: number) =>
    JSON.stringify(changeTo(KITCHEN_L_DESIGN, cabinetDepthMm));

  it("writes the same design at 700 with the rule live as with it read off", () => {
    expect(walkTo(700)).toBe(beforeM12W3a(() => walkTo(700)));
  });

  it("writes a different design at 600 only in `p24`, the body over the fridge, and only in its recorded seat", () => {
    const now = changeTo(KITCHEN_L_DESIGN, 600);
    const w2 = beforeM12W3a(() => changeTo(KITCHEN_L_DESIGN, 600));
    const differing = now.placements.filter(
      (placement, index) =>
        JSON.stringify(placement) !== JSON.stringify(w2.placements[index]),
    );

    expect(differing.map(({ id }) => id)).toEqual(["p24"]);
    expect(differing[0]?.body.seatDepthMm).toBe(
      OVER_THE_FRIDGE_MM - WALL_FRONT_ASSEMBLY_MM,
    );
    expect(w2.placements.find(({ id }) => id === "p24")?.body.seatDepthMm).toBe(
      600 - WALL_FRONT_ASSEMBLY_MM,
    );
  });
});
