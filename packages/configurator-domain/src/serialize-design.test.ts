import { describe, expect, it } from "vitest";

import type { Design } from "./design.js";
import { canonicalSerializeDesign } from "./serialize-design.js";

const placement = {
  id: "placement-1",
  wall: "A" as const,
  alongMm: 1300,
  y0Mm: 0,
  body: { buildId: "base-600", widthMm: 600, heightMm: 720, finish: "oak" as const, handle: "black" as const },
};

const room = { shape: "L" as const, widthMm: 3600, depthMm: 2400, heightMm: 2600 };

const design: Design = {
  room,
  presetId: null,
  placements: [placement],
  createdAt: "2026-08-25T00:00:00.000Z",
  updatedAt: "2026-08-25T00:00:00.000Z",
};

describe("canonicalSerializeDesign", () => {
  it("produces identical output for structurally-identical designs with different key order", () => {
    const reordered: Design = {
      updatedAt: design.updatedAt,
      createdAt: design.createdAt,
      placements: [
        {
          body: {
            handle: placement.body.handle,
            finish: placement.body.finish,
            heightMm: placement.body.heightMm,
            widthMm: placement.body.widthMm,
            buildId: placement.body.buildId,
          },
          y0Mm: placement.y0Mm,
          alongMm: placement.alongMm,
          wall: placement.wall,
          id: placement.id,
        },
      ],
      presetId: design.presetId,
      room: {
        heightMm: room.heightMm,
        depthMm: room.depthMm,
        widthMm: room.widthMm,
        shape: room.shape,
      },
    };

    expect(canonicalSerializeDesign(reordered)).toBe(canonicalSerializeDesign(design));
  });

  it("produces different output for a structurally different design", () => {
    const changed: Design = {
      ...design,
      placements: [{ ...placement, alongMm: 1400 }],
    };

    expect(canonicalSerializeDesign(changed)).not.toBe(canonicalSerializeDesign(design));
  });

  it("is idempotent through a parse/re-serialise round trip", () => {
    const once = canonicalSerializeDesign(design);
    const roundTripped = canonicalSerializeDesign(JSON.parse(once) as Design);

    expect(roundTripped).toBe(once);
  });
});
