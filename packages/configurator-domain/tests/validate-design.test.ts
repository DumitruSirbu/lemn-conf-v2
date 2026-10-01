import { describe, expect, it } from "vitest";

import {
  MAX_IDENTIFIER_LENGTH,
  MAX_PLACEMENTS,
  MAX_ROOM_DEPTH_MM,
  MAX_ROOM_HEIGHT_MM,
  MAX_ROOM_WIDTH_MM,
  MIN_BODY_HEIGHT_MM,
  NARROWEST_CATALOG_WIDTH_MM,
} from "../src/design-bounds.js";
import { DesignSchema } from "../src/design.js";
import type { Design, DesignPlacement, EmptyColumn } from "../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import { paletteFinish, type Finish } from "../src/materials.js";
import { migrateDesign } from "../src/migrate-design.js";
import { InvalidDesignError } from "../src/repository.js";
import {
  assertDesignValidForCatalog,
  DESIGN_ISSUE_SEVERITY_BY_CODE,
  fatalDesignValidationIssues,
  validateDesignForCatalog,
  type DesignIssueSeverity,
  type DesignValidationCode,
} from "../src/validate-design.js";
import {
  derivePlacementRecords,
  UnknownBodyError,
} from "../src/void-engine.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;

/** Read off the production declaration rather than restated here. A second hand-kept exhaustive
 *  list is the same forgotten-member failure one seam over — the defect ADR 0069 records — and two
 *  such lists disagree the moment a code is added. */
const MARK_VALIDATION_CODES = codesWithSeverity("mark");
const FATAL_VALIDATION_CODES = codesWithSeverity("refusal");

function codesWithSeverity(
  severity: DesignIssueSeverity,
): readonly DesignValidationCode[] {
  return Object.entries(DESIGN_ISSUE_SEVERITY_BY_CODE)
    .filter(([, declared]) => declared === severity)
    .map(([code]) => code as DesignValidationCode);
}

/** A one-placement design that is valid in every respect, so each test below changes exactly one
 *  thing and the issue it asserts can only have come from that change. */
const VALID_PLACEMENT: DesignPlacement = {
  id: "p0",
  wall: "A",
  alongMm: 1300,
  y0Mm: 0,
  body: { buildId: "base-sink-800", widthMm: 800, heightMm: 820 },
};

/** This file's own synthetic room, and **not** the seeded one. Its 2830 is a length the bound cases
 *  below do arithmetic against — wide enough to hold a 2700–3300 run on wall A and short enough to
 *  refuse it on wall B — so it did not move when the demo's wall B did (ADR 0083 decision 1). */
const VALID_DESIGN: Design = {
  room: { shape: "L", widthMm: 3560, depthMm: 2830, heightMm: 2600 },
  presetId: null,
  placements: [VALID_PLACEMENT],
  createdAt: "2026-08-25T00:00:00.000Z",
  updatedAt: "2026-08-25T00:00:00.000Z",
};

function codesFor(design: Design): DesignValidationCode[] {
  return validateDesignForCatalog(design, CATALOG).map((issue) => issue.code);
}

function withPlacement(patch: Partial<DesignPlacement>): Design {
  return { ...VALID_DESIGN, placements: [{ ...VALID_PLACEMENT, ...patch }] };
}

function withBody(patch: Partial<DesignPlacement["body"]>): Design {
  return withPlacement({ body: { ...VALID_PLACEMENT.body, ...patch } });
}

describe("validateDesignForCatalog", () => {
  it("accepts the design the product actually ships", () => {
    expect(validateDesignForCatalog(KITCHEN_L_DESIGN, CATALOG)).toEqual([]);
  });

  it("accepts the minimal valid design, so every rejection below is the change under test", () => {
    expect(codesFor(VALID_DESIGN)).toEqual([]);
  });

  it("rejects two placements sharing one id, which no id-keyed map can represent", () => {
    const design: Design = {
      ...VALID_DESIGN,
      placements: [VALID_PLACEMENT, { ...VALID_PLACEMENT, alongMm: 2400 }],
    };

    expect(codesFor(design)).toEqual(["DUPLICATE_PLACEMENT_ID"]);
  });

  it("rejects a buildId no catalogue entry covers, before hydration throws on it", () => {
    const design = withBody({ buildId: "unknown-builder" });

    expect(codesFor(design)).toEqual(["UNKNOWN_BUILD_ID"]);
    expect(() => derivePlacementRecords(design, CATALOG)).toThrow(
      UnknownBodyError,
    );
  });

  it("rejects a width the body's own catalogue row cannot be built to", () => {
    const design = withBody({ buildId: "base-dishwasher-600", widthMm: 500 });

    expect(codesFor(design)).toEqual(["WIDTH_NOT_BUILDABLE"]);
  });

  it("rejects a width above the cabinetry ceiling", () => {
    const design = withBody({ buildId: "base-drawer3-600", widthMm: 900 });

    expect(codesFor(design)).toEqual(["WIDTH_NOT_BUILDABLE"]);
  });

  it("rejects a body narrower than the narrowest width the catalogue offers", () => {
    const design = withBody({ widthMm: NARROWEST_CATALOG_WIDTH_MM - 1 });

    expect(codesFor(design)).toContain("BODY_TOO_NARROW");
  });

  it("rejects the 40 mm body ADR 0038 recorded as unreachable", () => {
    const design = withBody({ heightMm: 40 });

    expect(codesFor(design)).toEqual(["BODY_TOO_SHORT"]);
    expect(MIN_BODY_HEIGHT_MM).toBeGreaterThan(40);
  });

  it("rejects a placement whose run starts before the wall does", () => {
    const design = withPlacement({ alongMm: 100 });

    expect(codesFor(design)).toEqual(["PLACEMENT_BEFORE_WALL_START"]);
  });

  it("rejects a placement whose run ends past every wall of the room", () => {
    const design = withPlacement({ alongMm: 3500 });

    expect(codesFor(design)).toEqual(["PLACEMENT_PAST_WALL_END"]);
  });

  /** ADR 0065 decision 5. The bound was `max(widthMm, depthMm)` until 2026-09-03, which let the
   *  shorter wall borrow the longer one's run; these are the cases that borrowing hid. */
  describe("the along-wall bound is each wall's own run", () => {
    /** The run this refuses — 2700–3300 on wall B — fits inside the room's 3560 mm **width** and
     *  not inside its 2830 mm depth, so it is exactly what `max(width, depth)` accepted. Widen the
     *  bound back and this test goes green while the body still hangs 470 mm past wall B.
     *
     *  The room here is this file's own synthetic one and stays at 2830 deliberately: the number is
     *  doing arithmetic, not standing for the demo's wall. */
    it("refuses a wall B run that fits only the room's width", () => {
      const design = withPlacement({ wall: "B", alongMm: 3000 });

      expect(codesFor(design)).toEqual(["PLACEMENT_PAST_WALL_END"]);
    });

    it("accepts the same run on wall A, whose own bound is the width", () => {
      expect(codesFor(withPlacement({ alongMm: 3000 }))).toEqual([]);
    });

    /** The residual `max(width, depth)` left behind, measured rather than reasoned about: a 600 mm
     *  body on wall B at 6000 in a `{ widthMm: 6300, depthMm: 1 }` room used to validate clean. */
    it("refuses a run 5700 mm past a wall the other axis is long enough to cover", () => {
      const design: Design = {
        ...withPlacement({ wall: "B", alongMm: 6000 }),
        room: { shape: "L", widthMm: 6300, depthMm: 1, heightMm: 3900 },
      };

      expect(codesFor(design)).toEqual(["PLACEMENT_PAST_WALL_END"]);
    });
  });

  /** The seeded kitchen against **its own** two walls, which is what the fixture correction of
   *  2026-09-03 made assertable: wall A's run ends at 3500 with 60 mm of the 3560 to spare and
   *  wall B's at 2800 with 120 mm of the 2920. Under `max(width, depth)` both were held to 3560 and
   *  wall B passed by luck — the fridge (`p7`) reached 400 mm past the 2400 the document declared.
   *
   *  **The two bounds are not the same kind of number** (ADR 0083 decision 1): wall A's 3560 is the
   *  design reference's measurement and wall B's 2920 is chosen, 20 mm past the 2900 its run reaches
   *  at the 700 mm cabinet depth. The 2830 the reference gives wall B would put the marking on the
   *  design the app opens with, and the owner ruled the demo fits at both depths instead. */
  describe("the shipped kitchen's runs, per wall", () => {
    const BOUND_BY_WALL = {
      A: KITCHEN_L_DESIGN.room.widthMm,
      B: KITCHEN_L_DESIGN.room.depthMm,
    } as const;

    /** The furthest along-wall **extent** on the wall, and deliberately not the sum of the widths
     *  on it. The two agree only while the band is contiguous, and wall B's top band stops being
     *  contiguous at a 700 mm cabinet depth: the structural corner return is seated off the wall
     *  map (+70 mm) while the deep tops follow the base formula (+100 mm), so a 30 mm slot opens
     *  between them that nothing absorbs. ADR 0065's coverage figures were read as a contiguous
     *  chain, which is why a sum would quietly read 30 mm short there. An extent is right at both
     *  depths. */
    function runEndOnWall(wall: "A" | "B"): number {
      return Math.max(
        ...KITCHEN_L_DESIGN.placements
          .filter((placement) => placement.wall === wall)
          .map((placement) => placement.alongMm + placement.body.widthMm / 2),
      );
    }

    it.each([
      { wall: "A" as const, runEndMm: 3500 },
      { wall: "B" as const, runEndMm: 2800 },
    ])(
      "wall $wall's run ends at $runEndMm, inside its own bound",
      ({ wall, runEndMm }) => {
        expect(runEndOnWall(wall)).toBe(runEndMm);
        expect(runEndMm).toBeLessThanOrEqual(BOUND_BY_WALL[wall]);
      },
    );

    /** Pinned by value so wall B's bound is a **stated** number rather than whatever the fixture
     *  happens to say. 2920 is inside the owner's ruled 20–50 mm clearance band past 2900; a wave
     *  that moves it to 2930 edits this line, and one that moves it to 2900 or 3000 needs a ruling
     *  first. */
    it("declares the two runs the demo room is built to clear", () => {
      expect(BOUND_BY_WALL).toStrictEqual({ A: 3560, B: 2920 });
    });
  });

  /** ADR 0132 decision 7 (D10): a U's wall A backs onto both side walls, so its own across-room
   *  bound is `max(depthMm, wallCMm)` — whichever side wall the floor is actually drawn to — never
   *  `depthMm` alone once a second side wall exists. Wall C's own bound is `widthMm`, the same run
   *  wall B's already reads, so only the wall-A arm changes. */
  describe("the across-room bound follows the drawn floor (D10)", () => {
    function emptyColumnAt(patch: Partial<EmptyColumn>): EmptyColumn {
      return {
        wall: "A",
        alongMm: 300,
        widthMm: 300,
        y0Mm: 0,
        topMm: 820,
        depthMm: 2830,
        ...patch,
      };
    }

    function withEmptyColumn(room: Design["room"], entry: EmptyColumn): Design {
      return {
        ...VALID_DESIGN,
        room,
        placements: [],
        emptyColumns: [entry],
      };
    }

    const U_ROOM: Design["room"] = {
      shape: "U",
      widthMm: 2000,
      depthMm: 2000,
      wallCMm: 2800,
      heightMm: 2600,
    };

    it("still reads plain depthMm for wall A on an L, which has no wallCMm", () => {
      expect(
        codesFor(
          withEmptyColumn(VALID_DESIGN.room, emptyColumnAt({ depthMm: 2830 })),
        ),
      ).toEqual([]);
      expect(
        codesFor(
          withEmptyColumn(VALID_DESIGN.room, emptyColumnAt({ depthMm: 2831 })),
        ),
      ).toEqual(["EMPTY_COLUMN_DEEPER_THAN_ROOM"]);
    });

    it("reads max(depthMm, wallCMm) for wall A on a U, where wallCMm is the deeper side", () => {
      expect(
        codesFor(withEmptyColumn(U_ROOM, emptyColumnAt({ depthMm: 2800 }))),
      ).toEqual([]);
      expect(
        codesFor(withEmptyColumn(U_ROOM, emptyColumnAt({ depthMm: 2801 }))),
      ).toEqual(["EMPTY_COLUMN_DEEPER_THAN_ROOM"]);
    });

    it("bounds wall C by the room's width, the same run wall B already reads", () => {
      expect(
        codesFor(
          withEmptyColumn(U_ROOM, emptyColumnAt({ wall: "C", depthMm: 2000 })),
        ),
      ).toEqual([]);
      expect(
        codesFor(
          withEmptyColumn(U_ROOM, emptyColumnAt({ wall: "C", depthMm: 2001 })),
        ),
      ).toEqual(["EMPTY_COLUMN_DEEPER_THAN_ROOM"]);
    });
  });

  it("rejects a body standing through the ceiling", () => {
    const design = withPlacement({ y0Mm: 2400 });

    expect(codesFor(design)).toEqual(["PLACEMENT_ABOVE_ROOM"]);
  });

  it("rejects a document last updated before it was created", () => {
    const design: Design = {
      ...VALID_DESIGN,
      createdAt: "2026-08-25T00:00:00.000Z",
      updatedAt: "2026-08-24T00:00:00.000Z",
    };

    expect(codesFor(design)).toEqual(["TIMESTAMPS_OUT_OF_ORDER"]);
  });

  it("accepts a document created and updated in the same millisecond", () => {
    expect(
      codesFor({ ...VALID_DESIGN, updatedAt: VALID_DESIGN.createdAt }),
    ).toEqual([]);
  });
});

// Wave 6Q-b, ADR 0057's invariant at the write seam. `migrateDesign` resolves the same violation
// immediately before it asserts (ADR 0078 decision 2), so this code is reachable only where a client
// handed `PUT /api/designs/[id]` a whole document that bypassed the command.
describe("a placement wearing a finish its material does not offer", () => {
  function onVeneerWearing(finish: Finish | undefined): Design {
    return {
      ...withBody(finish === undefined ? {} : { finish }),
      settings: { cabinetDepthMm: 600, materialTierId: "material.veneer" },
    };
  }

  it("is refused, and the path names the finish rather than the placement", () => {
    const issues = validateDesignForCatalog(
      onVeneerWearing(paletteFinish("pal.alb")),
      CATALOG,
    );

    expect(issues).toEqual([
      {
        code: "PLACEMENT_WEARS_UNOFFERED_FINISH",
        path: "placements.0.body.finish",
      },
    ]);
  });

  it("is a refusal and not a mark, which ADR 0069 decision 2 leaves no discretion about", () => {
    expect(DESIGN_ISSUE_SEVERITY_BY_CODE.PLACEMENT_WEARS_UNOFFERED_FINISH).toBe(
      "refusal",
    );
    expect(FATAL_VALIDATION_CODES).toContain(
      "PLACEMENT_WEARS_UNOFFERED_FINISH",
    );
  });

  it("is accepted when the material does offer it", () => {
    expect(codesFor(onVeneerWearing(paletteFinish("veneer.stejar")))).toEqual(
      [],
    );
  });

  it("reports nothing when the placement wears no finish at all", () => {
    expect(codesFor(onVeneerWearing(undefined))).toEqual([]);
  });

  // ADR 0078 decision 3: a material this product does not declare makes no offer, so there is
  // nothing to judge the document against and wave 6G's recovery path keeps saving.
  it("reports nothing under a material tier the product declares nothing for", () => {
    const design: Design = {
      ...withBody({ finish: paletteFinish("pal.alb") }),
      settings: { cabinetDepthMm: 600, materialTierId: "material.laminate" },
    };

    expect(codesFor(design)).toEqual([]);
  });

  // **ADR 0084 decision 2d, pinned so a later wave does not "fix" it.** This validator is
  // document-level and catalogue-blind by design, so a payload arriving at `PUT /api/designs/[id]`
  // with an unoffered finish on a frontless body **is** refused. That is correct: no command in this
  // product produces such a document, nothing stored is refused (the load seam strips and then
  // resolves before `assertDesignValidForCatalog`), and exempting it would make the write seam accept
  // a document the product cannot write while adding a third authority on `canFinish` beside the two
  // that exist.
  it("refuses one on a frontless body too, rather than consulting the catalogue", () => {
    const hood: DesignPlacement = {
      id: "p13",
      wall: "A",
      alongMm: 2600,
      y0Mm: 1500,
      body: {
        buildId: "hood-600",
        widthMm: 600,
        heightMm: 700,
        finish: paletteFinish("pal.alb"),
      },
    };
    expect(CATALOG.get("hood-600")?.canFinish).toBe(false);

    const design: Design = {
      ...VALID_DESIGN,
      placements: [hood],
      settings: { cabinetDepthMm: 600, materialTierId: "material.veneer" },
    };

    expect(codesFor(design)).toEqual(["PLACEMENT_WEARS_UNOFFERED_FINISH"]);
  });

  // A document with no `materialTierId` is deemed to be on PAL, so the offer is PAL's.
  it("judges a document carrying no material tier against the default material", () => {
    expect(codesFor(withBody({ finish: paletteFinish("pal.alb") }))).toEqual(
      [],
    );
    expect(codesFor(withBody({ finish: paletteFinish("veneer.nuc") }))).toEqual(
      ["PLACEMENT_WEARS_UNOFFERED_FINISH"],
    );
  });
});

describe("fatalDesignValidationIssues", () => {
  it("keeps placement overflow in the full diagnostic report but not in the fatal report", () => {
    const overflowing = withPlacement({ alongMm: 3500 });
    const diagnostic = validateDesignForCatalog(overflowing, CATALOG);

    expect(diagnostic.map((issue) => issue.code)).toEqual([
      "PLACEMENT_PAST_WALL_END",
    ]);
    expect(fatalDesignValidationIssues(diagnostic)).toEqual([]);
    expect(() => {
      assertDesignValidForCatalog(overflowing, CATALOG);
    }).not.toThrow();
  });

  it("excludes only placement overflow and still refuses every accompanying fatal issue", () => {
    const overflowingAndTooTall = withPlacement({
      alongMm: 3500,
      y0Mm: 2400,
    });
    const fatal = fatalDesignValidationIssues(
      validateDesignForCatalog(overflowingAndTooTall, CATALOG),
    );

    expect(fatal.map((issue) => issue.code)).toEqual(["PLACEMENT_ABOVE_ROOM"]);
    expect(() => {
      assertDesignValidForCatalog(overflowingAndTooTall, CATALOG);
    }).toThrow(/PLACEMENT_ABOVE_ROOM/);
  });

  it("keeps every other validation code fatal, including adjacent containment codes", () => {
    const issues = [
      ...MARK_VALIDATION_CODES.map((code) => ({
        code,
        path: "placements.0",
      })),
      ...FATAL_VALIDATION_CODES.map((code, index) => ({
        code,
        path: `hostile.${String(index)}`,
      })),
    ];

    expect(
      fatalDesignValidationIssues(issues).map((issue) => issue.code),
    ).toEqual(FATAL_VALIDATION_CODES);
  });

  /** The marks by name, so a reader can answer *which codes are marks?* from one assertion and a
   *  new member arriving by accident is a red test rather than a silent demotion.
   *
   *  **Three of the four are ADR 0069 decision 1's family**: exactly the findings whose sole
   *  assertion is that a run reaches past the end of the wall it stands on, on each of the three
   *  arrays it can be recorded in.
   *
   *  **The fourth is not, and it is a ruling rather than a membership.** The owner ruled
   *  `RECORDED_SPAN_OVERLAPS_CORNER_BODY` a mark on 2026-09-09 (backlog 50, M6-AUD-008): the fact it
   *  asserts is a cross-wall corner intersection and not "past the end of its wall", so the
   *  membership rule alone would have made it a refusal — and a refusal makes an already-stored
   *  document unloadable, which is ADR 0052's dead link. It is a mark for the reason
   *  `PLACEMENT_PAST_WALL_END` is one (ADR 0065): reported, visible, carried, and not moved. A
   *  *fifth* member is still a wave that has to justify itself here, and "there are already two
   *  kinds" is not a justification. */
  it("demotes the three past-the-wall-end codes and the corner ruling, and nothing else", () => {
    expect([...MARK_VALIDATION_CODES].sort()).toStrictEqual([
      "COLUMN_EXTENT_PAST_WALL_END",
      "EMPTY_COLUMN_PAST_WALL_END",
      "PLACEMENT_PAST_WALL_END",
      "RECORDED_SPAN_OVERLAPS_CORNER_BODY",
    ]);
  });

  /** The wall's *start* is not the wall's *end*. ADR 0069 decision 2 is one-sided on purpose, and
   *  these are the codes a reader who reads "wall bound" for "wall end" would sweep into it. */
  it("keeps all three before-wall-start codes fatal", () => {
    for (const code of [
      "PLACEMENT_BEFORE_WALL_START",
      "EMPTY_COLUMN_BEFORE_WALL_START",
      "COLUMN_EXTENT_BEFORE_WALL_START",
    ] as const) {
      expect(DESIGN_ISSUE_SEVERITY_BY_CODE[code]).toBe("refusal");
    }
  });
});

describe("DesignSchema bounds", () => {
  it("refuses a zero room dimension", () => {
    const room = { ...VALID_DESIGN.room, widthMm: 0 };

    expect(DesignSchema.safeParse({ ...VALID_DESIGN, room }).success).toBe(
      false,
    );
  });

  it("refuses a negative room dimension", () => {
    const room = { ...VALID_DESIGN.room, heightMm: -20 };

    expect(DesignSchema.safeParse({ ...VALID_DESIGN, room }).success).toBe(
      false,
    );
  });

  it("refuses a room wider than the scene shell allows", () => {
    const room = { ...VALID_DESIGN.room, widthMm: MAX_ROOM_WIDTH_MM + 1 };

    expect(DesignSchema.safeParse({ ...VALID_DESIGN, room }).success).toBe(
      false,
    );
  });

  it("refuses a room deeper than the scene shell allows", () => {
    const room = { ...VALID_DESIGN.room, depthMm: MAX_ROOM_DEPTH_MM + 1 };

    expect(DesignSchema.safeParse({ ...VALID_DESIGN, room }).success).toBe(
      false,
    );
  });

  it("refuses a room taller than the scene shell allows", () => {
    const room = { ...VALID_DESIGN.room, heightMm: MAX_ROOM_HEIGHT_MM + 1 };

    expect(DesignSchema.safeParse({ ...VALID_DESIGN, room }).success).toBe(
      false,
    );
  });

  it("refuses the 10 m cube that made containment vacuous", () => {
    const room = {
      shape: "L" as const,
      widthMm: 10_000,
      depthMm: 10_000,
      heightMm: 10_000,
    };

    expect(DesignSchema.safeParse({ ...VALID_DESIGN, room }).success).toBe(
      false,
    );
  });

  it("accepts a room at each bound, so the limits are reachable", () => {
    const room = {
      shape: "L" as const,
      widthMm: MAX_ROOM_WIDTH_MM,
      depthMm: MAX_ROOM_DEPTH_MM,
      heightMm: MAX_ROOM_HEIGHT_MM,
    };

    expect(DesignSchema.safeParse({ ...VALID_DESIGN, room }).success).toBe(
      true,
    );
  });

  it("refuses a negative placement coordinate", () => {
    expect(DesignSchema.safeParse(withPlacement({ alongMm: -1 })).success).toBe(
      false,
    );
  });

  it("refuses a zero body dimension", () => {
    expect(DesignSchema.safeParse(withBody({ widthMm: 0 })).success).toBe(
      false,
    );
  });

  it("refuses a non-positive seat depth, which world transforms throw on", () => {
    expect(DesignSchema.safeParse(withBody({ seatDepthMm: 0 })).success).toBe(
      false,
    );
  });

  it("refuses an identifier longer than the bound", () => {
    const buildId = "x".repeat(MAX_IDENTIFIER_LENGTH + 1);

    expect(DesignSchema.safeParse(withBody({ buildId })).success).toBe(false);
  });

  it("refuses more placements than a supported room can physically contain", () => {
    const placements = Array.from(
      { length: MAX_PLACEMENTS + 1 },
      (_unused, index) => ({ ...VALID_PLACEMENT, id: `p${String(index)}` }),
    );

    expect(
      DesignSchema.safeParse({ ...VALID_DESIGN, placements }).success,
    ).toBe(false);
  });

  it("accepts exactly MAX_PLACEMENTS placements", () => {
    const placements = Array.from(
      { length: MAX_PLACEMENTS },
      (_unused, index) => ({ ...VALID_PLACEMENT, id: `p${String(index)}` }),
    );

    expect(
      DesignSchema.safeParse({ ...VALID_DESIGN, placements }).success,
    ).toBe(true);
  });

  it("round-trips the seeded design unchanged", () => {
    const result = DesignSchema.safeParse(KITCHEN_L_DESIGN);

    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual(KITCHEN_L_DESIGN);
  });
});

describe("migrateDesign at the stored-row seam", () => {
  it("loads a stored row that names an unknown body as InvalidDesignError, not UnknownBodyError", () => {
    const stored = withBody({ buildId: "unknown-builder" });

    expect(() => migrateDesign(1, stored)).toThrow(InvalidDesignError);
    expect(() => migrateDesign(1, stored)).not.toThrow(UnknownBodyError);
  });

  it("loads a stored row with duplicate placement ids as InvalidDesignError", () => {
    const stored: Design = {
      ...VALID_DESIGN,
      placements: [VALID_PLACEMENT, { ...VALID_PLACEMENT, alongMm: 2400 }],
    };

    expect(() => migrateDesign(1, stored)).toThrow(InvalidDesignError);
  });

  it("still loads the seeded design unchanged", () => {
    expect(migrateDesign(1, KITCHEN_L_DESIGN)).toEqual(KITCHEN_L_DESIGN);
  });

  it("describes a schema failure by path and code, never by the row's values", () => {
    const canary = "LEAK-CANARY-9f3a2b";
    const stored = { ...VALID_DESIGN, [canary]: canary };

    expect(() => migrateDesign(1, stored)).toThrow(/unrecognized_keys/);
    expect(() => migrateDesign(1, stored)).not.toThrow(new RegExp(canary));
  });

  it("bounds the message however many issues one row provokes", () => {
    // The most a document may carry, so every placement reaches the domain validator and the
    // message really is describing MAX_PLACEMENTS issues rather than one schema cap.
    const placements = Array.from(
      { length: MAX_PLACEMENTS },
      (_unused, index) => ({
        ...VALID_PLACEMENT,
        id: `p${String(index)}`,
        body: { ...VALID_PLACEMENT.body, buildId: "unknown-builder" },
      }),
    );

    const message = messageFromMigrating({ ...VALID_DESIGN, placements });

    expect(message.length).toBeLessThan(400);
    expect(message).toContain(`${String(MAX_PLACEMENTS)} issue(s)`);
  });
});

/** The message `migrateDesign` refuses a row with, as a value. Throws rather than returning a
 *  default: a row that loaded is this test's own premise failing, not a passing case. */
function messageFromMigrating(stored: unknown): string {
  try {
    migrateDesign(1, stored);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("Expected the stored row to be refused");
}
