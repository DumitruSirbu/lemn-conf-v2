import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  DesignSchema,
  type Design,
  type DesignPlacement,
} from "../../src/design.js";
import {
  MAX_ROOM_DEPTH_MM,
  MAX_ROOM_WIDTH_MM,
} from "../../src/design-bounds.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { findOverflowingPlacementIds } from "../../src/queries/overflowing-placements.js";
import { validateDesignForCatalog } from "../../src/validate-design.js";
import { setCabinetDepth } from "../../src/commands/set-cabinet-depth.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";

const NOW = "2026-08-25T00:00:00.000Z";
const SHALLOW_DEPTH_MM = 600;
const DEEP_DEPTH_MM = 700;
const CATALOG = buildKitchenLBodyCatalog(SHALLOW_DEPTH_MM);

function placement(
  id: string,
  wall: "A" | "B",
  alongMm: number,
  widthMm = 200,
): DesignPlacement {
  return {
    id,
    wall,
    alongMm,
    y0Mm: 0,
    body: { buildId: "base-cabinet", widthMm, heightMm: 820 },
  };
}

function designOf(
  placements: readonly DesignPlacement[],
  room: Design["room"] = {
    shape: "L",
    widthMm: 2000,
    depthMm: 1000,
    heightMm: 2600,
  },
): Design {
  return {
    room,
    presetId: null,
    placements: [...placements],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

/**
 * The seeded design at a cabinet depth, **from the command that writes it**.
 *
 * This was a hand-written projection of `setCabinetDepth`'s along-wall chain until wave 6J-c gave
 * that chain its production reader (ADR 0089). A second model of a rule, living in a test beside the
 * real one, is the drift this project keeps finding — so the model is gone and the question is asked
 * of the command.
 */
function seededDesignAt(cabinetDepthMm: number): Design {
  const result = setCabinetDepth({
    design: KITCHEN_L_DESIGN,
    catalogAt: buildKitchenLBodyCatalog,
    cabinetDepthMm,
    probeAt: createFakeProbeFactory(),
    occurredAt: NOW,
  });
  if (!result.ok) {
    throw new Error(`setCabinetDepth refused: ${result.reason.code}`);
  }
  return result.design;
}

describe("findOverflowingPlacementIds", () => {
  it("reports no placement in an empty design", () => {
    expect(findOverflowingPlacementIds(designOf([]))).toEqual([]);
  });

  it.each(["A", "B"] as const)(
    "treats equality as fitting and one millimetre beyond wall %s as overflow",
    (wall) => {
      const room = designOf([]).room;
      const wallLengthMm = wall === "A" ? room.widthMm : room.depthMm;
      const atEnd = placement("fits", wall, wallLengthMm - 100);
      const onePast = placement("over", wall, wallLengthMm - 99);

      expect(findOverflowingPlacementIds(designOf([atEnd], room))).toEqual([]);
      expect(findOverflowingPlacementIds(designOf([onePast], room))).toEqual([
        "over",
      ]);
    },
  );

  it.each(["A", "B"] as const)(
    "keeps the half-millimetre boundary of an odd, buildable width on wall %s",
    (wall) => {
      const room = designOf([]).room;
      const wallLengthMm = wall === "A" ? room.widthMm : room.depthMm;
      const halfMillimetreInside = designOf(
        [placement("inside", wall, wallLengthMm - 101, 201)],
        room,
      );
      const halfMillimetrePast = designOf(
        [placement("past", wall, wallLengthMm - 100, 201)],
        room,
      );

      expect(DesignSchema.safeParse(halfMillimetreInside).success).toBe(true);
      expect(validateDesignForCatalog(halfMillimetreInside, CATALOG)).toEqual(
        [],
      );
      expect(findOverflowingPlacementIds(halfMillimetreInside)).toEqual([]);
      expect(findOverflowingPlacementIds(halfMillimetrePast)).toEqual(["past"]);
    },
  );

  it("uses both maximum legal wall lengths without truncating their coordinates", () => {
    const room: Design["room"] = {
      shape: "L",
      widthMm: MAX_ROOM_WIDTH_MM,
      depthMm: MAX_ROOM_DEPTH_MM,
      heightMm: 2600,
    };
    const design = designOf(
      [
        placement("a-fits", "A", MAX_ROOM_WIDTH_MM - 100),
        placement("a-past", "A", MAX_ROOM_WIDTH_MM - 99),
        placement("b-fits", "B", MAX_ROOM_DEPTH_MM - 100),
        placement("b-past", "B", MAX_ROOM_DEPTH_MM - 99),
      ],
      room,
    );

    expect(DesignSchema.safeParse(design).success).toBe(true);
    expect(findOverflowingPlacementIds(design)).toEqual(["a-past", "b-past"]);
  });

  it("uses width for wall A and depth for wall B at the same coordinate", () => {
    const design = designOf([
      placement("on-a", "A", 1400),
      placement("on-b", "B", 1400),
    ]);

    expect(findOverflowingPlacementIds(design)).toEqual(["on-b"]);
  });

  it("does not report a large underfill on either wall", () => {
    const design = designOf([
      placement("a", "A", 100),
      placement("b", "B", 100),
    ]);

    expect(findOverflowingPlacementIds(design)).toEqual([]);
  });

  it("uses the furthest extent, not the sum of widths across a gapped run", () => {
    const design = designOf([
      placement("near", "B", 100, 200),
      placement("past-a-gap", "B", 1050, 200),
    ]);
    const summedWidthsMm = design.placements.reduce(
      (sum, candidate) => sum + candidate.body.widthMm,
      0,
    );

    expect(summedWidthsMm).toBeLessThan(design.room.depthMm);
    expect(findOverflowingPlacementIds(design)).toEqual(["past-a-gap"]);
  });

  it("reports every overflowing placement on both walls in deterministic byte-id order", () => {
    const design = designOf([
      placement("z", "B", 1000),
      placement("B", "A", 2000),
      placement("a", "B", 1000),
    ]);

    expect(findOverflowingPlacementIds(design)).toEqual(["B", "a", "z"]);
  });

  it("orders hostile but schema-valid ids deterministically without rewriting the document", () => {
    const ids = ["\uE000", "constructor", "\u{10000}", "__proto__", "\0"];
    const design = designOf(
      ids.map((id, index) => placement(id, "B", 1100 + index)),
    );
    const before = design.placements.map((candidate) => candidate.id);

    expect(DesignSchema.safeParse(design).success).toBe(true);
    expect(findOverflowingPlacementIds(design)).toEqual([
      "\0",
      "__proto__",
      "constructor",
      "\u{10000}",
      "\uE000",
    ]);
    expect(design.placements.map((candidate) => candidate.id)).toEqual(before);
  });

  propertyTest.prop([
    fc.shuffledSubarray(
      [
        placement("z", "B", 1000),
        placement("fits", "A", 100),
        placement("B", "A", 2000),
        placement("a", "B", 1000),
      ],
      { minLength: 4, maxLength: 4 },
    ),
  ])("is invariant under every placement-array permutation", (permuted) => {
    expect(findOverflowingPlacementIds(designOf(permuted))).toEqual([
      "B",
      "a",
      "z",
    ]);
  });

  it("reports no seeded body at 600 and exactly p7 and p24 at 700", () => {
    expect(
      findOverflowingPlacementIds(seededDesignAt(SHALLOW_DEPTH_MM)),
    ).toEqual([]);
    expect(findOverflowingPlacementIds(seededDesignAt(DEEP_DEPTH_MM))).toEqual([
      "p24",
      "p7",
    ]);
  });

  it("leaves malformed and duplicate ids to the existing wire and validation boundaries", () => {
    const duplicate = designOf([
      placement("same", "A", 2000),
      placement("same", "B", 1000),
    ]);
    const malformed = designOf([placement("", "A", 2000)]);

    expect(findOverflowingPlacementIds(duplicate)).toEqual(["same", "same"]);
    expect(
      validateDesignForCatalog(duplicate, CATALOG).map((issue) => issue.code),
    ).toContain("DUPLICATE_PLACEMENT_ID");
    expect(DesignSchema.safeParse(malformed).success).toBe(false);
  });

  it("stays geometry-only when an unknown build id is refused by validation", () => {
    const unknown = designOf([
      {
        ...placement("unknown", "B", 1000),
        body: {
          ...placement("unknown", "B", 1000).body,
          buildId: "unknown-builder",
        },
      },
    ]);

    expect(findOverflowingPlacementIds(unknown)).toEqual(["unknown"]);
    expect(
      validateDesignForCatalog(unknown, CATALOG).map((issue) => issue.code),
    ).toEqual(["UNKNOWN_BUILD_ID"]);
  });
});
