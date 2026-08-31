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
import type { Design, DesignPlacement } from "../src/design.js";
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
import {
  derivePlacementRecords,
  UnknownBodyError,
} from "../src/void-engine.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;

/** A one-placement design that is valid in every respect, so each test below changes exactly one
 *  thing and the issue it asserts can only have come from that change. */
const VALID_PLACEMENT: DesignPlacement = {
  id: "p0",
  wall: "A",
  alongMm: 1300,
  y0Mm: 0,
  body: { buildId: "base-sink-800", widthMm: 800, heightMm: 820 },
};

const VALID_DESIGN: Design = {
  room: { shape: "L", widthMm: 3600, depthMm: 2400, heightMm: 2600 },
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
