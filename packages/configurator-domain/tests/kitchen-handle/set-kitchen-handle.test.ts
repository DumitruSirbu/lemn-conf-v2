// H1 items 3 and 5: the command that writes `settings.handle`, and the seams that must carry it.
import { describe, expect, it } from "vitest";

import { setKitchenHandle } from "../../src/commands/set-kitchen-handle.js";
import {
  CurrentDesignSchema,
  DesignSchema,
  DesignSettingsSchema,
  type Design,
  type Handle,
} from "../../src/design.js";
import { KITCHEN_L_DESIGN } from "../../src/fixtures/kitchen-l-design.js";
import {
  CURRENT_SCHEMA_VERSION,
  migrateDesign,
} from "../../src/migrate-design.js";
import { canonicalSerializeDesign } from "../../src/serialize-design.js";

const OCCURRED_AT = "2026-10-26T09:30:00.000Z";
const EVERY_HANDLE: readonly Handle[] = ["steel", "black", "push"];

function applied(design: Design, handle: Handle): Design {
  const result = setKitchenHandle({ design, handle, occurredAt: OCCURRED_AT });
  if (!result.ok)
    throw new Error(`setKitchenHandle refused: ${result.reason.code}`);
  return result.design;
}

/** A seeded design in which every cabinet has chosen its own handle, so nothing is left to follow. */
function withEveryCabinetChoosing(design: Design): Design {
  return {
    ...design,
    placements: design.placements.map((placement) => ({
      ...placement,
      body: { ...placement.body, handle: "black" },
    })),
  };
}

describe("setKitchenHandle", () => {
  it("writes the handle into settings and nothing else but the timestamp", () => {
    for (const handle of EVERY_HANDLE) {
      const result = setKitchenHandle({
        design: KITCHEN_L_DESIGN,
        handle,
        occurredAt: OCCURRED_AT,
      });

      expect(result).toMatchObject({
        ok: true,
        effect: { type: "kitchen_handle_set", handle },
      });
      if (!result.ok) return;
      expect(result.design).toEqual({
        ...KITCHEN_L_DESIGN,
        settings: { ...KITCHEN_L_DESIGN.settings, handle },
        updatedAt: OCCURRED_AT,
      });
    }
  });

  it("leaves every placement the very same object, so no cabinet's own choice can be overwritten", () => {
    const own = withEveryCabinetChoosing(KITCHEN_L_DESIGN);

    const after = applied(own, "push");

    expect(after.placements).toBe(own.placements);
  });

  it("grows no handle key on a cabinet that has chosen nothing", () => {
    const after = applied(KITCHEN_L_DESIGN, "push");

    expect(
      after.placements.some((placement) => "handle" in placement.body),
    ).toBe(false);
  });

  it("keeps the other whole-kitchen settings", () => {
    const configured: Design = {
      ...KITCHEN_L_DESIGN,
      settings: {
        ...KITCHEN_L_DESIGN.settings,
        materialTierId: "material-premium",
        hardwareTierId: "hardware-premium",
      },
    };

    expect(applied(configured, "black").settings).toEqual({
      ...configured.settings,
      handle: "black",
    });
  });

  it("replaces the previous kitchen handle, and setting the same one again is not a refusal", () => {
    const first = applied(KITCHEN_L_DESIGN, "black");

    expect(applied(first, "push").settings?.handle).toBe("push");
    expect(applied(first, "black").settings?.handle).toBe("black");
  });

  it("refuses a timestamp the document cannot hold and returns the very same design", () => {
    const result = setKitchenHandle({
      design: KITCHEN_L_DESIGN,
      handle: "push",
      occurredAt: "yesterday",
    });

    expect(result.ok).toBe(false);
    expect(result.design).toBe(KITCHEN_L_DESIGN);
    if (result.ok) return;
    expect(result.reason.code).toBe("INVALID_OCCURRED_AT");
  });
});

describe("settings.handle at the load and write seams", () => {
  it("is accepted by the settings schema, alone and beside the other keys", () => {
    for (const handle of EVERY_HANDLE) {
      expect(DesignSettingsSchema.safeParse({ handle }).success).toBe(true);
      expect(
        DesignSettingsSchema.safeParse({
          materialTierId: "material-premium",
          handle,
        }).success,
      ).toBe(true);
    }
  });

  it("refuses a value that is not a handle", () => {
    expect(DesignSettingsSchema.safeParse({ handle: "gold" }).success).toBe(
      false,
    );
    expect(DesignSettingsSchema.safeParse({ handle: "" }).success).toBe(false);
  });

  it("parses, migrates and serialises a document carrying it without a schema version bump", () => {
    for (const handle of EVERY_HANDLE) {
      const stored = applied(KITCHEN_L_DESIGN, handle);
      const json = JSON.parse(canonicalSerializeDesign(stored)) as unknown;

      const migrated = migrateDesign(CURRENT_SCHEMA_VERSION, json);

      expect(migrated.settings?.handle).toBe(handle);
      expect(canonicalSerializeDesign(migrated)).toBe(
        canonicalSerializeDesign(stored),
      );
      expect(CurrentDesignSchema.safeParse(migrated).success).toBe(true);
    }
  });

  it("round-trips a document without it byte-for-byte, with no key added", () => {
    const json = JSON.parse(
      canonicalSerializeDesign(KITCHEN_L_DESIGN),
    ) as unknown;

    const migrated = migrateDesign(CURRENT_SCHEMA_VERSION, json);

    expect(canonicalSerializeDesign(migrated)).toBe(
      canonicalSerializeDesign(KITCHEN_L_DESIGN),
    );
    expect(migrated.settings).not.toHaveProperty("handle");
    expect(DesignSchema.safeParse(migrated).success).toBe(true);
  });

  it("is carried through a version-3 document's migration beside the depth it adds", () => {
    const version3 = {
      ...KITCHEN_L_DESIGN,
      settings: { handle: "push" },
    };

    const migrated = migrateDesign(3, version3);

    expect(migrated.settings).toEqual({ handle: "push", cabinetDepthMm: 600 });
  });
});
