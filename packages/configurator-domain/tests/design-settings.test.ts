// Wave 6E's container, at the seam that decides whether it owes a schema version bump.
//
// The criterion is `columnExtents`': **absence is a valid, unchanged state**. So the assertion that
// matters is not that the field parses — it is that a document written without it comes back out of
// parse → migrate → serialise exactly as it went in, with no key added and no version arm walked.
import { describe, expect, it } from "vitest";

import {
  DesignSchema,
  DesignSettingsSchema,
  type DesignSettings,
} from "../src/design.js";
import { MAX_IDENTIFIER_LENGTH } from "../src/design-bounds.js";
import {
  CURRENT_SCHEMA_VERSION,
  migrateDesign,
} from "../src/migrate-design.js";
import { canonicalSerializeDesign } from "../src/serialize-design.js";

/** Not `3600 × 2400`: that pair is the room correction's trigger, and nothing here is about a
 *  room. */
const designWithoutSettings = {
  room: { shape: "L" as const, widthMm: 3560, depthMm: 2830, heightMm: 2600 },
  presetId: null,
  placements: [],
  createdAt: "2026-08-25T00:00:00.000Z",
  updatedAt: "2026-08-25T00:00:00.000Z",
};

describe("DesignSettingsSchema", () => {
  it("accepts both keys, either key alone, and neither", () => {
    const shapes: readonly unknown[] = [
      {
        materialTierId: "material-premium",
        hardwareTierId: "hardware-premium",
      },
      { materialTierId: "material-premium" },
      { hardwareTierId: "hardware-premium" },
      {},
    ];
    for (const shape of shapes) {
      expect(DesignSettingsSchema.safeParse(shape).success).toBe(true);
    }
  });

  // Shape only, never membership: the domain imports no price book (ADR 0062 seam 1), so an id it
  // has never heard of is a legal document — `setMaterialTier` is what refuses one.
  it("accepts a tier id no book in this repository declares", () => {
    const result = DesignSettingsSchema.safeParse({
      materialTierId: "a-manufacturer-supplied-tier",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty tier id and one past the identifier bound", () => {
    expect(DesignSettingsSchema.safeParse({ materialTierId: "" }).success).toBe(
      false,
    );
    expect(
      DesignSettingsSchema.safeParse({
        hardwareTierId: "x".repeat(MAX_IDENTIFIER_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it("rejects a non-string tier id — never coerces", () => {
    expect(DesignSettingsSchema.safeParse({ materialTierId: 3 }).success).toBe(
      false,
    );
  });

  // Strict, like every other object in this schema: a third setting has to be declared here before
  // it can be stored, which is what keeps wave 6J's depth a decision rather than a leak.
  it("rejects an undeclared third setting", () => {
    const result = DesignSettingsSchema.safeParse({
      materialTierId: "material-premium",
      cabinetDepthMm: 600,
    });
    expect(result.success).toBe(false);
  });
});

describe("DesignSchema with the settings container", () => {
  it("accepts a design carrying it", () => {
    const settings: DesignSettings = {
      materialTierId: "material-premium",
      hardwareTierId: "hardware-premium",
    };
    const result = DesignSchema.safeParse({
      ...designWithoutSettings,
      settings,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a design with no settings key and adds none", () => {
    const result = DesignSchema.safeParse(designWithoutSettings);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect("settings" in result.data).toBe(false);
  });

  it("rejects a settings value that is not an object", () => {
    const result = DesignSchema.safeParse({
      ...designWithoutSettings,
      settings: "material-premium",
    });
    expect(result.success).toBe(false);
  });
});

// The backward-compatibility criterion, measured rather than argued: no version bump is owed
// because a document written before this field existed is not changed by it.
describe("a design with no settings key round-trips unchanged", () => {
  it("comes back byte-identical through parse → migrate → serialise", () => {
    const before = canonicalSerializeDesign(
      DesignSchema.parse(designWithoutSettings),
    );

    const migrated = migrateDesign(
      CURRENT_SCHEMA_VERSION,
      JSON.parse(JSON.stringify(designWithoutSettings)) as unknown,
    );

    expect(canonicalSerializeDesign(migrated)).toBe(before);
    expect("settings" in migrated).toBe(false);
  });

  // The oldest version still readable, which is where the five measured rows sit (ADR 0052). It
  // walks both normalisation arms and still gains no settings key.
  it("gains no settings key when carried forward from version 1", () => {
    const migrated = migrateDesign(1, designWithoutSettings);
    expect("settings" in migrated).toBe(false);
  });

  it("carries a stored settings container through unchanged", () => {
    const stored = {
      ...designWithoutSettings,
      settings: { materialTierId: "material-premium" },
    };
    expect(migrateDesign(CURRENT_SCHEMA_VERSION, stored).settings).toEqual({
      materialTierId: "material-premium",
    });
  });
});
