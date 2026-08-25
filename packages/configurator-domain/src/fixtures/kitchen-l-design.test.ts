import { describe, expect, it } from "vitest";

import { DesignSchema } from "../design.js";
import {
  deriveColumns,
  derivePlacementRecords,
  recomputeVoids,
} from "../void-engine.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "./kitchen-l-design.js";

describe("KITCHEN_L_DESIGN", () => {
  it("is a valid Design", () => {
    expect(DesignSchema.safeParse(KITCHEN_L_DESIGN).success).toBe(true);
  });

  it("every placement's buildId resolves in the catalog", () => {
    for (const placement of KITCHEN_L_DESIGN.placements) {
      expect(KITCHEN_L_BODY_CATALOG.has(placement.body.buildId)).toBe(true);
    }
  });

  it("derives placement records and columns without throwing", () => {
    const records = derivePlacementRecords(
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    );
    expect(records).toHaveLength(KITCHEN_L_DESIGN.placements.length);
    const columns = deriveColumns(records);
    expect(columns.size).toBeGreaterThan(0);
    expect(() => recomputeVoids(records, columns)).not.toThrow();
  });
});
