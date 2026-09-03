import { describe, expect, it } from "vitest";

import type { Design, DesignPlacement, EmptyColumn } from "../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import { migrateDesign } from "../src/migrate-design.js";
import { InvalidDesignError } from "../src/repository.js";
import {
  validateDesignForCatalog,
  type DesignValidationCode,
} from "../src/validate-design.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const NOW = "2026-08-25T00:00:00.000Z";

/** The two runs ADR 0065 §2 measures, read from the fixture rather than restated, so a later edit
 *  to the document moves these tests with it instead of leaving them asserting a dead number. */
const WALL_A_RUN_MM = KITCHEN_L_DESIGN.room.widthMm;
const WALL_B_RUN_MM = KITCHEN_L_DESIGN.room.depthMm;

const SINK_WIDTH_MM = 800;

/** One placement, at the seeded room, so each case below changes exactly one coordinate and the
 *  code it raises can only have come from that change. */
const ONE_BODY: DesignPlacement = {
  id: "p0",
  wall: "A",
  alongMm: 1300,
  y0Mm: 0,
  body: { buildId: "base-sink-800", widthMm: SINK_WIDTH_MM, heightMm: 820 },
};

const ONE_BODY_DESIGN: Design = {
  room: { ...KITCHEN_L_DESIGN.room },
  presetId: null,
  placements: [ONE_BODY],
  createdAt: NOW,
  updatedAt: NOW,
};

function codesFor(design: Design): DesignValidationCode[] {
  return validateDesignForCatalog(design, CATALOG).map((issue) => issue.code);
}

/** A sink whose run **ends** at `endMm` on `wall`, since §12 stores the centre and every bound in
 *  this file is stated as an extent. */
function bodyEndingAt(wall: "A" | "B", endMm: number): Design {
  return {
    ...ONE_BODY_DESIGN,
    placements: [{ ...ONE_BODY, wall, alongMm: endMm - SINK_WIDTH_MM / 2 }],
  };
}

describe("the along-wall bound is the wall's own run, at the boundary", () => {
  const RUN_BY_WALL = { A: WALL_A_RUN_MM, B: WALL_B_RUN_MM } as const;

  it.each(["A", "B"] as const)(
    "accepts a run on wall %s ending exactly at its wall",
    (wall) => {
      expect(codesFor(bodyEndingAt(wall, RUN_BY_WALL[wall]))).toStrictEqual([]);
    },
  );

  it.each(["A", "B"] as const)(
    "refuses a run on wall %s ending one millimetre past its wall",
    (wall) => {
      expect(codesFor(bodyEndingAt(wall, RUN_BY_WALL[wall] + 1))).toStrictEqual(
        ["PLACEMENT_PAST_WALL_END"],
      );
    },
  );

  /** ADR 0065 decision 4, restated as an assertion so nobody turns the one-sided rule into a gate:
   *  a run stopping short of its wall is the normal case and raises nothing. */
  it.each(["A", "B"] as const)(
    "says nothing about a run on wall %s that leaves bare wall behind it",
    (wall) => {
      expect(
        codesFor(bodyEndingAt(wall, RUN_BY_WALL[wall] - 500)),
      ).toStrictEqual([]);
    },
  );

  /** The tightening's whole point, in one pair: the wall B run is the room's **depth**, so a
   *  coordinate the width covers and the depth does not is legal on one wall and not the other. */
  it("splits one along-coordinate between the two walls", () => {
    const endMm = WALL_B_RUN_MM + 1;

    expect(codesFor(bodyEndingAt("A", endMm))).toStrictEqual([]);
    expect(codesFor(bodyEndingAt("B", endMm))).toStrictEqual([
      "PLACEMENT_PAST_WALL_END",
    ]);
  });

  /** The mirror, on a room deeper than it is wide, so the rule is not "wall A is the generous one"
   *  by accident of the seeded document's shape. */
  it("splits it the other way when the depth is the longer run", () => {
    const turned: Design = {
      ...bodyEndingAt("A", WALL_B_RUN_MM + 1),
      room: {
        ...KITCHEN_L_DESIGN.room,
        widthMm: WALL_B_RUN_MM,
        depthMm: WALL_A_RUN_MM,
      },
    };

    expect(codesFor(turned)).toStrictEqual(["PLACEMENT_PAST_WALL_END"]);
    expect(
      codesFor({
        ...turned,
        placements: turned.placements.map((placement) => ({
          ...placement,
          wall: "B" as const,
        })),
      }),
    ).toStrictEqual([]);
  });
});

describe("an empty column is held to the same wall's run", () => {
  /** Clear of every seeded key: the design here carries the one sink at 1300 and nothing else, so
   *  only the containment rule can speak. */
  function stripEndingAt(wall: "A" | "B", endMm: number): EmptyColumn {
    const widthMm = 60;
    return {
      wall,
      alongMm: endMm - widthMm / 2,
      widthMm,
      y0Mm: 0,
      topMm: 820,
      depthMm: 580,
    };
  }

  function withStrip(strip: EmptyColumn): Design {
    return { ...ONE_BODY_DESIGN, emptyColumns: [strip] };
  }

  const RUN_BY_WALL = { A: WALL_A_RUN_MM, B: WALL_B_RUN_MM } as const;

  it.each(["A", "B"] as const)(
    "accepts a strip on wall %s ending exactly at its wall",
    (wall) => {
      expect(
        codesFor(withStrip(stripEndingAt(wall, RUN_BY_WALL[wall]))),
      ).toStrictEqual([]);
    },
  );

  it.each(["A", "B"] as const)(
    "refuses a strip on wall %s ending one millimetre past its wall",
    (wall) => {
      expect(
        codesFor(withStrip(stripEndingAt(wall, RUN_BY_WALL[wall] + 1))),
      ).toStrictEqual(["EMPTY_COLUMN_PAST_WALL_END"]);
    },
  );

  it("refuses on wall B the strip wall A accepts", () => {
    const endMm = WALL_B_RUN_MM + 1;

    expect(codesFor(withStrip(stripEndingAt("A", endMm)))).toStrictEqual([]);
    expect(codesFor(withStrip(stripEndingAt("B", endMm)))).toStrictEqual([
      "EMPTY_COLUMN_PAST_WALL_END",
    ]);
  });
});

describe("the shipped kitchen against the corrected bound", () => {
  it("validates clean, with no issue of any code", () => {
    expect(validateDesignForCatalog(KITCHEN_L_DESIGN, CATALOG)).toStrictEqual(
      [],
    );
  });

  /** ADR 0065's consequence note: detection must take the furthest **extent**, never a sum of
   *  widths, because wall B's top band stops being contiguous at a 700 mm depth. Measured here at
   *  600, where the two still agree, so the check is on the bound and not on the arithmetic. */
  it.each([
    { wall: "A" as const, runEndMm: 3500, wallRunMm: WALL_A_RUN_MM },
    { wall: "B" as const, runEndMm: 2800, wallRunMm: WALL_B_RUN_MM },
  ])(
    "ends wall $wall's run at $runEndMm, inside its own $wallRunMm",
    ({ wall, runEndMm, wallRunMm }) => {
      const measured = Math.max(
        ...KITCHEN_L_DESIGN.placements
          .filter((placement) => placement.wall === wall)
          .map((placement) => placement.alongMm + placement.body.widthMm / 2),
      );

      expect(measured).toBe(runEndMm);
      expect(measured).toBeLessThanOrEqual(wallRunMm);
    },
  );

  /** The overrun ADR 0065 decision 1 accepts at a 700 mm cabinet depth — wall B's run reaching
   *  2900 — must still be refused by this bound. Nothing may be widened to let 700 through; the
   *  answer is to mark the body, which is wave 6A3's work and not this rule's. */
  it("still refuses the 2900 mm wall B run a 700 mm depth would produce", () => {
    expect(codesFor(bodyEndingAt("B", 2900))).toStrictEqual([
      "PLACEMENT_PAST_WALL_END",
    ]);
  });
});

/** ADR 0052 measured five rows in the application database on 2026-09-02, every one of them written
 *  from the seeded document as it then stood — `{ widthMm: 3600, depthMm: 2400 }`. The room is
 *  persisted, `migrate-design.ts` never rewrites it, and `assertDesignValidForCatalog` runs on the
 *  load path, so the tightening is applied to those rows on their next read. */
describe("a stored document written before the correction", () => {
  const STORED_UNDER_THE_OLD_ROOM: unknown = {
    ...KITCHEN_L_DESIGN,
    room: { shape: "L", widthMm: 3600, depthMm: 2400, heightMm: 2600 },
  };

  it("names the bound as the only thing wrong with it", () => {
    const issues = validateDesignForCatalog(
      STORED_UNDER_THE_OLD_ROOM as Design,
      CATALOG,
    );

    expect(
      issues.every((issue) => issue.code === "PLACEMENT_PAST_WALL_END"),
    ).toBe(true);
    expect(issues.map((issue) => issue.path).length).toBeGreaterThan(0);
  });

  /** The share link ADR 0052 calls *"the one artefact this project hands to someone who cannot be
   *  asked to reload it"*. This document loaded before 2026-09-03 and is unchanged since; the load
   *  path must still read it. It does not: `migrateDesign` throws, `/d/{id}` renders the invalid
   *  state and `GET /api/designs/{id}` answers 500. */
  it("still loads through the migration seam", () => {
    expect(() => migrateDesign(2, STORED_UNDER_THE_OLD_ROOM)).not.toThrow(
      InvalidDesignError,
    );
  });
});
