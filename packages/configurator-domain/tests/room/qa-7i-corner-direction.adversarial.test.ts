// M7 wave 7I adversarial QA (ADR 0129 D2/D3): what the stored document does with the new key on
// the paths the product actually loads and saves through — `migrateDesign` (every `/d/{id}` and
// `/s/{token}` read), `CurrentDesignSchema` (every write), `canonicalSerializeDesign` (every save's
// bytes) — plus hostile values arriving as the entered direction, and the byte cap with a
// right-hand room in it.
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  canonicalSerializeDesign,
  CURRENT_SCHEMA_VERSION,
  CurrentDesignSchema,
  cornerDirectionOf,
  KITCHEN_L_DESIGN,
  MAX_DESIGN_BYTES,
  migrateDesign,
  validateRoomInput,
  type Design,
} from "../../src/index.js";
import {
  MAX_ROOM_DEPTH_MM,
  MAX_ROOM_HEIGHT_MM,
  MAX_ROOM_WIDTH_MM,
} from "../../src/design-bounds.js";

const RIGHT_DESIGN: Design = {
  ...KITCHEN_L_DESIGN,
  room: { ...KITCHEN_L_DESIGN.room, cornerDirection: "right" },
};

function storedBytes(design: unknown): unknown {
  return JSON.parse(JSON.stringify(design));
}

describe("7I-A1/A2 — the load path keeps the direction exactly as stored", () => {
  it("reloads a right-hand document as right-hand", () => {
    const loaded = migrateDesign(
      CURRENT_SCHEMA_VERSION,
      storedBytes(RIGHT_DESIGN),
    );

    expect(cornerDirectionOf(loaded.room)).toBe("right");
    expect(loaded.room).toStrictEqual(RIGHT_DESIGN.room);
  });

  it("reloads a left-hand document with no key written onto it", () => {
    const loaded = migrateDesign(
      CURRENT_SCHEMA_VERSION,
      storedBytes(KITCHEN_L_DESIGN),
    );

    expect(Object.keys(loaded.room)).toStrictEqual(
      Object.keys(KITCHEN_L_DESIGN.room),
    );
    expect(canonicalSerializeDesign(loaded)).not.toContain("cornerDirection");
    expect(cornerDirectionOf(loaded.room)).toBe("left");
  });

  it("reloads a truthful explicit left as left, without rewriting it to absent or to right", () => {
    const explicit = {
      ...KITCHEN_L_DESIGN,
      room: { ...KITCHEN_L_DESIGN.room, cornerDirection: "left" },
    };
    const loaded = migrateDesign(CURRENT_SCHEMA_VERSION, storedBytes(explicit));

    expect(cornerDirectionOf(loaded.room)).toBe("left");
  });

  it("round-trips the right-hand document's canonical bytes through save → load → save", () => {
    const bytes = canonicalSerializeDesign(RIGHT_DESIGN);
    const reloaded = migrateDesign(CURRENT_SCHEMA_VERSION, JSON.parse(bytes));

    expect(canonicalSerializeDesign(reloaded)).toBe(bytes);
    expect(bytes).toContain('"cornerDirection":"right"');
  });

  it.each([
    ["mis-cased", "Right"],
    ["upper-cased", "RIGHT"],
    ["padded", " right"],
    ["empty", ""],
    ["null", null],
    ["a number", 1],
    ["a boolean", true],
    ["an object", { value: "right" }],
    ["an array", ["right"]],
  ])(
    "refuses a stored document whose direction is %s, on load and on write",
    (_name, value) => {
      const hostile = {
        ...KITCHEN_L_DESIGN,
        room: { ...KITCHEN_L_DESIGN.room, cornerDirection: value },
      };

      expect(() =>
        migrateDesign(CURRENT_SCHEMA_VERSION, storedBytes(hostile)),
      ).toThrow();
      expect(CurrentDesignSchema.safeParse(storedBytes(hostile)).success).toBe(
        false,
      );
    },
  );

  it("accepts a right-hand document at the write seam", () => {
    expect(
      CurrentDesignSchema.safeParse(storedBytes(RIGHT_DESIGN)).success,
    ).toBe(true);
  });
});

describe("7I-A4 — a hostile entered direction is never written as a direction", () => {
  const VALID = {
    shape: "L" as const,
    wallAMm: KITCHEN_L_DESIGN.room.widthMm,
    wallBMm: KITCHEN_L_DESIGN.room.depthMm,
    heightMm: KITCHEN_L_DESIGN.room.heightMm,
  };

  it("finds the valid input accepted (non-vacuous)", () => {
    expect(
      validateRoomInput(
        { ...VALID, cornerDirection: "left" },
        APPROVED_ROOM_POLICY,
      ).ok,
    ).toBe(true);
  });

  it.each([
    "Right",
    "RIGHT",
    " right",
    "",
    null,
    undefined,
    1,
    ["right"],
    { toString: () => "right" },
  ])(
    "writes no direction for %o, so the room reads left and stays storable",
    (value) => {
      const result = validateRoomInput(
        { ...VALID, cornerDirection: value } as never,
        APPROVED_ROOM_POLICY,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect("cornerDirection" in result.room).toBe(false);
      expect(
        CurrentDesignSchema.safeParse({
          ...KITCHEN_L_DESIGN,
          room: result.room,
        }).success,
      ).toBe(true);
    },
  );
});

describe("7I-A2 — the byte cap holds a right-hand room at its longest", () => {
  it("keeps room + presetId + both timestamps inside the 1024-byte envelope with the key present", () => {
    const envelope = JSON.stringify({
      room: {
        shape: "L",
        widthMm: MAX_ROOM_WIDTH_MM,
        depthMm: MAX_ROOM_DEPTH_MM,
        heightMm: MAX_ROOM_HEIGHT_MM,
        cornerDirection: "right",
      },
      presetId: "p".repeat(64),
      createdAt: "2026-09-23T10:00:00.000Z",
      updatedAt: "2026-09-23T10:00:00.000Z",
    });

    expect(Buffer.byteLength(envelope, "utf8")).toBeLessThan(1024);
  });

  // M7B wave U1 slice S2 moved this cap (ADR 0132 decision 5's third wall run), so this test's own
  // claim narrows: `cornerDirection` itself still moves nothing, over whatever qa-5h currently pins.
  it("does not move MAX_DESIGN_BYTES beyond qa-5h's pinned value", () => {
    expect(MAX_DESIGN_BYTES).toBe(523_972);
  });
});
