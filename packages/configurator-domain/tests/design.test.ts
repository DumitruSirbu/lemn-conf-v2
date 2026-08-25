import { describe, expect, it } from "vitest";

import { CabinetBodySchema, DesignSchema } from "../src/design.js";

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
  createdAt: "2026-08-25T00:00:00.000Z",
  updatedAt: "2026-08-25T00:00:00.000Z",
};

describe("CabinetBodySchema", () => {
  it("accepts a body with optional finish and handle", () => {
    const result = CabinetBodySchema.safeParse({
      ...body,
      finish: "oak",
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

  it("rejects an unknown wall", () => {
    const result = DesignSchema.safeParse({
      ...design,
      placements: [{ ...placement, wall: "C" }],
    });
    expect(result.success).toBe(false);
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
