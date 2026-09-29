import { describe, expect, it } from "vitest";

import {
  CabinetBodySchema,
  DesignRoomSchema,
  DesignSchema,
} from "../src/design.js";
import { LEGACY_ENUM_FINISHES } from "../src/materials.js";

const body = {
  buildId: "base-600",
  widthMm: 600,
  heightMm: 720,
};

const placement = {
  id: "placement-1",
  wall: "A" as const,
  alongMm: 1300,
  y0Mm: 0,
  body,
};

const design = {
  room: { shape: "L" as const, widthMm: 3600, depthMm: 2400, heightMm: 2600 },
  presetId: null,
  placements: [placement],
  settings: { cabinetDepthMm: 600 },
  createdAt: "2026-08-25T00:00:00.000Z",
  updatedAt: "2026-08-25T00:00:00.000Z",
};

describe("CabinetBodySchema", () => {
  it("accepts a body with optional finish and handle", () => {
    const result = CabinetBodySchema.safeParse({
      ...body,
      finish: LEGACY_ENUM_FINISHES.oak,
      handle: "black",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a body without finish or handle", () => {
    expect(CabinetBodySchema.safeParse(body).success).toBe(true);
  });

  it("rejects an unknown finish", () => {
    expect(
      CabinetBodySchema.safeParse({ ...body, finish: "purple" }).success,
    ).toBe(false);
  });
});

describe("DesignSchema", () => {
  it("accepts a well-formed design", () => {
    const result = DesignSchema.safeParse(design);
    expect(result.success).toBe(true);
  });

  it("accepts an empty placements list", () => {
    expect(DesignSchema.safeParse({ ...design, placements: [] }).success).toBe(
      true,
    );
  });

  it("accepts a null presetId", () => {
    expect(DesignSchema.safeParse(design).success).toBe(true);
  });

  it("rejects a non-integral alongMm — never rounds or coerces", () => {
    const result = DesignSchema.safeParse({
      ...design,
      placements: [{ ...placement, alongMm: 100.5 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integral y0Mm", () => {
    const result = DesignSchema.safeParse({
      ...design,
      placements: [{ ...placement, y0Mm: 0.5 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integral widthMm on the cabinet body", () => {
    const result = DesignSchema.safeParse({
      ...design,
      placements: [{ ...placement, body: { ...body, widthMm: 600.1 } }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integral heightMm on the cabinet body", () => {
    const result = DesignSchema.safeParse({
      ...design,
      placements: [{ ...placement, body: { ...body, heightMm: 719.9 } }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integral room dimensions", () => {
    const result = DesignSchema.safeParse({
      ...design,
      room: { ...design.room, widthMm: 3600.5 },
    });
    expect(result.success).toBe(false);
  });

  // ADR 0132 decision 1 widened `DesignWallSchema` to include `"C"` this wave — see "accepts a
  // wall-C placement" below — so an unknown wall now needs a letter the schema truly never named.
  it("rejects an unknown wall", () => {
    const result = DesignSchema.safeParse({
      ...design,
      placements: [{ ...placement, wall: "D" }],
    });
    expect(result.success).toBe(false);
  });

  // ADR 0132 decision 1: wall C is additive, so an L document may carry a wall-C placement — the
  // schema stores it whether or not the room it names has a wall C at all (ADR 0132 decision 5,
  // `wallLengthMm`'s job, not this one's).
  it("accepts a wall-C placement", () => {
    const result = DesignSchema.safeParse({
      ...design,
      placements: [{ ...placement, wall: "C" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing createdAt/updatedAt", () => {
    const withoutCreatedAt: Partial<typeof design> = { ...design };
    delete withoutCreatedAt.createdAt;
    expect(DesignSchema.safeParse(withoutCreatedAt).success).toBe(false);
  });

  it("rejects an unknown extra field (strict object)", () => {
    const result = DesignSchema.safeParse({ ...design, extra: "nope" });
    expect(result.success).toBe(false);
  });

  // ADR 0011 Gap B: `seatDepthMm` is optional precisely so every design stored before M3 still
  // validates — no schema version bump, and no new `migrateDesign` arm.
  it("accepts a body with a measured seat depth and one without", () => {
    const seated = {
      ...design,
      placements: [
        { ...placement, body: { ...placement.body, seatDepthMm: 580 } },
      ],
    };
    expect(DesignSchema.safeParse(seated).success).toBe(true);
    expect(DesignSchema.safeParse(design).success).toBe(true);
  });

  it("rejects a fractional seat depth", () => {
    const result = DesignSchema.safeParse({
      ...design,
      placements: [
        { ...placement, body: { ...placement.body, seatDepthMm: 580.5 } },
      ],
    });
    expect(result.success).toBe(false);
  });
});

// ADR 0132 decision 6 (M7B wave U1 slice S1): the stored U room, and `wallCMm`'s iff-refinement.
describe("DesignRoomSchema — the U room (ADR 0132 decision 6)", () => {
  const uRoom = {
    shape: "U" as const,
    widthMm: 3600,
    depthMm: 2400,
    wallCMm: 2000,
    heightMm: 2600,
  };

  it("accepts a well-formed U room", () => {
    expect(DesignRoomSchema.safeParse(uRoom).success).toBe(true);
  });

  it("refuses a U room with no wallCMm", () => {
    const withoutWallC = {
      shape: uRoom.shape,
      widthMm: uRoom.widthMm,
      depthMm: uRoom.depthMm,
      heightMm: uRoom.heightMm,
    };
    expect(DesignRoomSchema.safeParse(withoutWallC).success).toBe(false);
  });

  it.each(["L", "linear"] as const)(
    "refuses a %s room that carries wallCMm",
    (shape) => {
      const room = {
        shape,
        widthMm: 3600,
        depthMm: 2400,
        wallCMm: 2000,
        heightMm: 2600,
      };
      expect(DesignRoomSchema.safeParse(room).success).toBe(false);
    },
  );

  it('refuses cornerDirection: "right" on a U (Q-U4 (b), ADR 0104 Amendment C)', () => {
    const result = DesignRoomSchema.safeParse({
      ...uRoom,
      cornerDirection: "right",
    });
    expect(result.success).toBe(false);
  });

  it.each([
    ["an absent key", {}],
    ["left", { cornerDirection: "left" }],
  ])("still accepts a U with %s", (_name, extra) => {
    const result = DesignRoomSchema.safeParse({ ...uRoom, ...extra });
    expect(result.success).toBe(true);
  });

  it("leaves an L room byte-identical — no wallCMm key, cornerDirection still optional", () => {
    const lRoom = {
      shape: "L" as const,
      widthMm: 3600,
      depthMm: 2400,
      heightMm: 2600,
    };
    expect(DesignRoomSchema.safeParse(lRoom).success).toBe(true);
    expect(
      DesignRoomSchema.safeParse({ ...lRoom, cornerDirection: "right" })
        .success,
    ).toBe(true);
  });
});
