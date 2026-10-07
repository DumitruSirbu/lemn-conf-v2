import { describe, expect, it } from "vitest";

import {
  cabinetDepthRuleOf,
  type CabinetDepthRule,
} from "../src/cabinet-depth-rule.js";
import { CurrentDesignSchema, DesignSchema } from "../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import {
  CURRENT_SCHEMA_VERSION,
  migrateDesign,
} from "../src/migrate-design.js";
import {
  CabinetDepthBelowMinimumError,
  declaredCabinetDepthsMm,
  DEFAULT_CABINET_DEPTH_MM,
  MIN_CABINET_DEPTH_MM,
  requireDeclaredCabinetDepthMm,
  UnknownWorktopDepthError,
} from "../src/worktop-depth.js";

function stored(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

describe("Wave 6J-a: persisted cabinet-depth version contract", () => {
  it("normalises every legacy version to 600 without dropping either tier", () => {
    const legacy = {
      ...KITCHEN_L_DESIGN,
      settings: {
        materialTierId: "material-premium",
        hardwareTierId: "hardware-premium",
      },
    };

    for (const version of [1, 2, 3]) {
      expect(migrateDesign(version, stored(legacy)).settings).toStrictEqual({
        materialTierId: "material-premium",
        hardwareTierId: "hardware-premium",
        cabinetDepthMm: DEFAULT_CABINET_DEPTH_MM,
      });
    }
  });

  it.each(declaredCabinetDepthsMm())(
    "loads a current document at the declared %i mm depth",
    (cabinetDepthMm) => {
      const current = {
        ...KITCHEN_L_DESIGN,
        settings: { cabinetDepthMm },
      };

      expect(migrateDesign(CURRENT_SCHEMA_VERSION, stored(current))).toEqual(
        current,
      );
      expect(() => buildKitchenLBodyCatalog(cabinetDepthMm)).not.toThrow();
    },
  );

  /**
   * A schema used at both the current write boundary and the legacy load parser cannot silently
   * accept a document the current-version loader refuses. The API persists every accepted save
   * with `CURRENT_SCHEMA_VERSION`, so this is the exact accepted-write/dead-share-link seam.
   */
  it("does not accept as current wire data a document current migration refuses", () => {
    const missingDepth = stored({ ...KITCHEN_L_DESIGN, settings: undefined });
    const acceptedAtTheWriteSchema =
      CurrentDesignSchema.safeParse(missingDepth);
    let reloadsAtCurrentVersion = true;
    try {
      migrateDesign(CURRENT_SCHEMA_VERSION, missingDepth);
    } catch {
      reloadsAtCurrentVersion = false;
    }

    expect({
      acceptedBySharedSchema: acceptedAtTheWriteSchema.success,
      reloadsAtCurrentVersion,
    }).not.toStrictEqual({
      acceptedBySharedSchema: true,
      reloadsAtCurrentVersion: false,
    });
  });
});

describe("Wave 6J-a: the floor and declared manufactured set fail closed", () => {
  it("classifies every whole-millimetre candidate around both boundaries", () => {
    const declared = new Set(declaredCabinetDepthsMm());

    for (let candidate = 500; candidate <= 720; candidate += 1) {
      if (candidate < MIN_CABINET_DEPTH_MM) {
        expect(
          () => requireDeclaredCabinetDepthMm(candidate),
          `${String(candidate)} mm must hit the physical floor before map membership`,
        ).toThrow(CabinetDepthBelowMinimumError);
      } else if (declared.has(candidate)) {
        expect(requireDeclaredCabinetDepthMm(candidate)).toBe(candidate);
      } else {
        expect(
          () => requireDeclaredCabinetDepthMm(candidate),
          `${String(candidate)} mm must not be rounded to a manufactured row`,
        ).toThrow(UnknownWorktopDepthError);
      }
    }
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 599.5, "600", null])(
    "rejects a non-whole numeric cabinet depth (%s) at the wire schema",
    (cabinetDepthMm) => {
      expect(
        DesignSchema.safeParse({
          ...KITCHEN_L_DESIGN,
          settings: { cabinetDepthMm },
        }).success,
      ).toBe(false);
    },
  );
});

describe("Wave 6J-a: along-wall movement is a declaration", () => {
  it("classifies the complete catalogue without an undeclared or invented chain", () => {
    const allowed = new Set(["base-formula", "wall-map"]);

    for (const [buildId, definition] of buildKitchenLBodyCatalog(700)) {
      const rule = cabinetDepthRuleOf({
        buildId,
        rule: definition.depthRule,
      });

      expect(allowed.has(rule.alongWallPositionFollows), buildId).toBe(true);
    }
  });

  it("declares only the four structural wall corner bodies on the wall-map chain", () => {
    const wallMapIds = [...buildKitchenLBodyCatalog(700)]
      .filter(([, definition]) => {
        const rule = cabinetDepthRuleOf({
          buildId: "swept-entry",
          rule: definition.depthRule,
        });
        return rule.alongWallPositionFollows === "wall-map";
      })
      .map(([buildId]) => buildId)
      .sort();

    // Two → four (M7C wave C2): the corner wall unit's rows follow the wall map as the returns do.
    expect(wallMapIds).toStrictEqual([
      "wall-corner-return-570",
      "wall-corner-return-570-top",
      "wall-corner-x-900",
      "wall-corner-x-900-top",
    ]);
  });

  it.each([undefined, "kind", "id-prefix"])(
    "refuses an absent or invented position chain (%s)",
    (alongWallPositionFollows) => {
      const malformed = {
        follows: "cabinet-depth",
        alongWallPositionFollows,
      } as unknown as CabinetDepthRule;

      expect(() =>
        cabinetDepthRuleOf({ buildId: "hostile-row", rule: malformed }),
      ).toThrow(/hostile-row/);
    },
  );
});
