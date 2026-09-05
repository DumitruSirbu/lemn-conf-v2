// **Adversarial QA for the one thing wave 6Q-a says is not recoverable by a follow-up commit: no
// stored document may now be refused that could be loaded before it.**
//
// ADR 0078 decision 2 puts the resolution in 6Q-b and the refusal after it, in that order, because
// the documents a refusal-first ordering would strand exist in the preview database (ADR 0054) — a
// PAL kitchen wearing *Lut* or *Salvie*, written by the panel 6P shipped and still writes. This file
// constructs those documents and drives them through the actual load seam rather than reading the
// diff and concluding nothing changed.
//
// It also holds ADR 0078 decision 3 — an undeclared `materialTierId` resolves nothing and refuses
// nothing — at every seam a stored id reaches, because wave 6G's recovery path stands on it.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { setFinish } from "../src/commands/set-appearance.js";
import { setMaterialTier } from "../src/commands/set-whole-kitchen-settings.js";
import type { Design } from "../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import {
  DEFAULT_FINISH,
  DEFAULT_MATERIAL_ID,
  freeColourFinish,
  LEGACY_ENUM_FINISH_NAMES,
  LEGACY_ENUM_FINISHES,
  lookUpMaterial,
  materialById,
  MATERIAL_IDS,
  MATERIALS,
  PALETTE_ENTRY_IDS,
  paletteFinish,
  UnknownMaterialError,
  type Finish,
} from "../src/materials.js";
import {
  CURRENT_SCHEMA_VERSION,
  migrateDesign,
} from "../src/migrate-design.js";
import { priceDesign } from "../src/pricing/price-design.js";
import { SAMPLE_PRICE_BOOK } from "../src/pricing/sample-price-book.js";
import { OCCURRED_AT } from "./support/commands.js";
import {
  DESIGN_ISSUE_SEVERITY_BY_CODE,
  validateDesignForCatalog,
} from "../src/validate-design.js";

/** A finishable seeded body — `dropFinishFromBodiesThatCannotWearOne` strips the other kind at the
 *  load seam, so a document that put a colour on a hood would be rewritten for a reason that has
 *  nothing to do with this wave. */
const FINISHABLE_ID = "p0";

/** A tier id the schema accepts and this product declares nothing for. ADR 0072's reachable state,
 *  and the one 6G's recovery path leaves behind. */
const UNDECLARED_TIER_ID = "material.laminate";

/** The severity map's size, pinned so a code added anywhere in the repository has to come past this
 *  file. 6Q-a is the wave that must add **none**. */
const DECLARED_VALIDATION_CODE_COUNT = 29;

const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function sourceOf(relativePath: string): string {
  return readFileSync(path.join(PACKAGE_ROOT, "src", relativePath), "utf8");
}

/** The stored row, as JSON — the only form a load ever meets. `finish` is typed `unknown` because
 *  the legacy shape is a bare string the current schema cannot express. */
function storedRow(options: {
  readonly finish?: unknown;
  readonly materialTierId?: string;
}): unknown {
  const design = {
    ...KITCHEN_L_DESIGN,
    settings:
      options.materialTierId === undefined
        ? KITCHEN_L_DESIGN.settings
        : {
            ...KITCHEN_L_DESIGN.settings,
            materialTierId: options.materialTierId,
          },
    placements: KITCHEN_L_DESIGN.placements.map((placement) =>
      placement.id === FINISHABLE_ID && options.finish !== undefined
        ? { ...placement, body: { ...placement.body, finish: options.finish } }
        : placement,
    ),
  };
  return JSON.parse(JSON.stringify(design));
}

function finishOn(design: Design, placementId: string): Finish | undefined {
  return design.placements.find((placement) => placement.id === placementId)
    ?.body.finish;
}

function everyFinish(): readonly Finish[] {
  return [
    ...PALETTE_ENTRY_IDS.map((entryId) => paletteFinish(entryId)),
    freeColourFinish("#8d9a84"),
    freeColourFinish("#cbc3b8"),
    freeColourFinish("#ECEEEB"),
  ];
}

describe("lookUpMaterial is total, and nothing on a load path can throw through it", () => {
  it("answers for every string a tier id can be, and throws for none of them", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 120 }), (candidate) => {
        const lookup = lookUpMaterial(candidate);
        const declared = MATERIAL_IDS.some((id) => id === candidate);
        expect(lookup.kind).toBe(declared ? "declared" : "undeclared");
      }),
      { numRuns: 500 },
    );
  });

  it("meets both arms, so the sweep above is not answering 'undeclared' every time", () => {
    for (const materialId of MATERIAL_IDS) {
      const lookup = lookUpMaterial(materialId);
      expect(lookup.kind).toBe("declared");
      if (lookup.kind !== "declared") return;
      expect(lookup.material.materialId).toBe(materialId);
    }
    expect(lookUpMaterial(UNDECLARED_TIER_ID).kind).toBe("undeclared");
    expect(lookUpMaterial("").kind).toBe("undeclared");
  });

  it("resolves the same object the declaration holds, not a copy of it", () => {
    for (const material of MATERIALS) {
      const lookup = lookUpMaterial(material.materialId);
      expect(lookup.kind === "declared" && lookup.material).toBe(material);
    }
  });

  it("keeps materialById throwing, and reachable from one declared id only", () => {
    // The throwing lookup is fine to keep **because nothing on a stored-id path calls it**. Asserted
    // structurally rather than argued: a later wave that points a load path at it has to come here.
    expect(() => materialById(UNDECLARED_TIER_ID)).toThrow(
      UnknownMaterialError,
    );

    const callSites = ["materials.ts", "commands/set-appearance.ts"].flatMap(
      (file) =>
        sourceOf(file)
          .split("\n")
          .filter((line) => /(?<!function )materialById\(/.test(line))
          .map((line) => `${file}: ${line.trim()}`),
    );

    expect(callSites).toEqual([
      "materials.ts: materialById(DEFAULT_MATERIAL_ID).defaultFinish;",
    ]);
  });
});

describe("no stored document is refused that could be loaded before wave 6Q-a", () => {
  it.each(
    everyFinish().map((finish) => [JSON.stringify(finish), finish] as const),
  )(
    "loads %s on a PAL kitchen and leaves it exactly as stored",
    (_label, finish) => {
      const loaded = migrateDesign(
        CURRENT_SCHEMA_VERSION,
        storedRow({ finish }),
        KITCHEN_L_BODY_CATALOG,
      );

      expect(finishOn(loaded, FINISHABLE_ID)).toEqual(finish);
    },
  );

  it("loads every (material, finish) pair unchanged — the whole space, not a sample", () => {
    let loadedCount = 0;

    for (const materialId of MATERIAL_IDS) {
      for (const finish of everyFinish()) {
        const loaded = migrateDesign(
          CURRENT_SCHEMA_VERSION,
          storedRow({ finish, materialTierId: materialId }),
          KITCHEN_L_BODY_CATALOG,
        );

        expect(loaded.settings?.materialTierId).toBe(materialId);
        expect(finishOn(loaded, FINISHABLE_ID)).toEqual(finish);
        loadedCount += 1;
      }
    }

    // Three materials by eleven finishes — eight declared entries and three free colours, of which
    // *Lut* and *Salvie* are the two the panel still writes onto a PAL kitchen today.
    expect(loadedCount).toBe(33);
  });

  it("reports no validation finding for a document wearing an unoffered finish", () => {
    for (const materialId of MATERIAL_IDS) {
      for (const finish of everyFinish()) {
        const loaded = migrateDesign(
          CURRENT_SCHEMA_VERSION,
          storedRow({ finish, materialTierId: materialId }),
          KITCHEN_L_BODY_CATALOG,
        );

        expect(
          validateDesignForCatalog(loaded, KITCHEN_L_BODY_CATALOG),
        ).toEqual([]);
      }
    }
  });

  it("still carries all five legacy strings forward, at every version that owes it", () => {
    // The 6P behaviour this wave must not have disturbed: *Lut* and *Salvie* land on free colours a
    // PAL kitchen does not offer, and the load keeps them rather than refusing or resetting.
    for (const name of LEGACY_ENUM_FINISH_NAMES) {
      for (const version of [1, 2, 3, 4] as const) {
        const stored = storedRow({ finish: name });
        const withDepth = {
          ...(stored as Record<string, unknown>),
          settings: { cabinetDepthMm: 600 },
        };

        const loaded = migrateDesign(
          version,
          version === 4 ? withDepth : stored,
          KITCHEN_L_BODY_CATALOG,
        );

        // 6P's own rule, re-asserted rather than assumed: a legacy name whose row is a palette
        // entry carries its colour forward; *Lut* and *Salvie* have no entry to carry to and reset
        // to PAL's *Alb*. What 6Q-a must not have changed is that both outcomes are a **load**.
        const carried = LEGACY_ENUM_FINISHES[name];
        expect(finishOn(loaded, FINISHABLE_ID)).toEqual(
          carried.kind === "palette-entry" ? carried : DEFAULT_FINISH,
        );
      }
    }
  });

  it("adds no validation code, and the severity map is the size it was", () => {
    const codes = Object.keys(DESIGN_ISSUE_SEVERITY_BY_CODE);

    expect(codes).toHaveLength(DECLARED_VALIDATION_CODE_COUNT);
    expect(
      codes.filter((code) => /FINISH|MATERIAL|COLOUR|OFFER/.test(code)),
    ).toEqual([]);
  });

  it("leaves the two load-seam modules untouched by this wave's vocabulary", () => {
    for (const file of ["validate-design.ts", "migrate-design.ts"]) {
      const source = sourceOf(file);
      expect(source).not.toContain("materialOffersFinish");
      expect(source).not.toContain("FINISH_NOT_OFFERED");
      expect(source).not.toContain("lookUpMaterial");
    }
  });

  it("keeps FINISH_NOT_OFFERED reachable from the command and from nowhere else", () => {
    for (const file of [
      "validate-design.ts",
      "migrate-design.ts",
      "materials.ts",
      "repository.ts",
      "serialize-design.ts",
    ]) {
      expect(sourceOf(file)).not.toContain("FINISH_NOT_OFFERED");
    }

    expect(sourceOf("commands/set-appearance.ts")).toContain(
      "FINISH_NOT_OFFERED",
    );
  });
});

describe("an undeclared material id at every seam a stored one reaches", () => {
  it("loads, at the current version and at every legacy one", () => {
    for (const version of [1, 2, 3, 4, CURRENT_SCHEMA_VERSION] as const) {
      const stored = storedRow({
        materialTierId: UNDECLARED_TIER_ID,
      }) as Record<string, unknown>;
      const raw =
        version <= 3
          ? {
              ...stored,
              settings: { materialTierId: UNDECLARED_TIER_ID },
            }
          : stored;

      const loaded = migrateDesign(version, raw, KITCHEN_L_BODY_CATALOG);

      expect(loaded.settings?.materialTierId).toBe(UNDECLARED_TIER_ID);
    }
  });

  it("recolours rather than refusing, whatever the colour is", () => {
    const design = migrateDesign(
      CURRENT_SCHEMA_VERSION,
      storedRow({ materialTierId: UNDECLARED_TIER_ID }),
      KITCHEN_L_BODY_CATALOG,
    );

    for (const finish of everyFinish()) {
      const result = setFinish({
        design,
        catalog: KITCHEN_L_BODY_CATALOG,
        target: { kind: "placement", id: FINISHABLE_ID },
        finish,
        occurredAt: OCCURRED_AT,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(finishOn(result.design, FINISHABLE_ID)).toEqual(finish);
    }
  });

  it("prices without throwing — it refuses at the book, which is 6E's rule and not this wave's", () => {
    const design = migrateDesign(
      CURRENT_SCHEMA_VERSION,
      storedRow({ materialTierId: UNDECLARED_TIER_ID }),
      KITCHEN_L_BODY_CATALOG,
    );

    const result = priceDesign({
      design,
      catalog: KITCHEN_L_BODY_CATALOG,
      book: SAMPLE_PRICE_BOOK,
      pricingVersion: SAMPLE_PRICE_BOOK.version,
      selections: { materialTierId: UNDECLARED_TIER_ID },
    });

    expect(result.ok).toBe(false);
  });

  it("is replaceable — setMaterialTier answers rather than throwing on the way in", () => {
    const design = migrateDesign(
      CURRENT_SCHEMA_VERSION,
      storedRow({ materialTierId: UNDECLARED_TIER_ID }),
      KITCHEN_L_BODY_CATALOG,
    );

    const result = setMaterialTier({
      design,
      tierId: DEFAULT_MATERIAL_ID,
      availableTierIds: MATERIAL_IDS,
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.settings?.materialTierId).toBe(DEFAULT_MATERIAL_ID);
  });

  it("serialises and reloads to the same id, so the state survives a round trip", () => {
    const design = migrateDesign(
      CURRENT_SCHEMA_VERSION,
      storedRow({
        materialTierId: UNDECLARED_TIER_ID,
        finish: paletteFinish("veneer.nuc"),
      }),
      KITCHEN_L_BODY_CATALOG,
    );

    const reloaded = migrateDesign(
      CURRENT_SCHEMA_VERSION,
      JSON.parse(JSON.stringify(design)),
      KITCHEN_L_BODY_CATALOG,
    );

    expect(reloaded.settings?.materialTierId).toBe(UNDECLARED_TIER_ID);
    expect(finishOn(reloaded, FINISHABLE_ID)).toEqual(
      paletteFinish("veneer.nuc"),
    );
  });
});
