// Wave 6E adversarial QA: the settings container at the two seams the wave argues from — the
// persistence round trip that decides no version bump is owed, and the `exactOptionalPropertyTypes`
// widening that made `WholeKitchenSelections` accept an explicit `undefined`.
//
// `design-settings.test.ts` beside this one proves a document *without* the key round-trips
// unchanged. That is only half the criterion: a document *with* it must round-trip unchanged too,
// or the field is a rewrite of somebody's stored kitchen the first time it is loaded. And the
// widening opened a second way to say "nothing chosen" — `{ materialTierId: undefined }` — which
// must be indistinguishable from `{}` everywhere it can be observed.
import { describe, expect, it } from "vitest";

import { MAX_IDENTIFIER_LENGTH } from "../src/design-bounds.js";
import { DesignSchema, DesignSettingsSchema } from "../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import {
  CURRENT_SCHEMA_VERSION,
  migrateDesign,
} from "../src/migrate-design.js";
import { priceDesign } from "../src/pricing/price-design.js";
import {
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
} from "../src/pricing/sample-price-book.js";
import { InvalidDesignError } from "../src/repository.js";
import { canonicalSerializeDesign } from "../src/serialize-design.js";
import { MEASURED_DEEPENING_ROWS } from "./support/deepening-rows.js";
import { NOTHING_DISABLED } from "./support/availability.js";

/** Any room but `3600 × 2400`, so nothing here trips the room normalisation. Not the seeded room —
 *  this file is about settings on a stored document, so the pair only has to miss the trigger. */
const storedDocument = {
  room: { shape: "L" as const, widthMm: 3560, depthMm: 2830, heightMm: 2600 },
  presetId: null,
  placements: [],
  createdAt: "2026-08-25T00:00:00.000Z",
  updatedAt: "2026-08-25T00:00:00.000Z",
};

function withSettings(settings: unknown): Record<string, unknown> {
  return { ...storedDocument, settings };
}

/** A fresh structural copy, so a normalisation that mutated its input rather than returning a new
 *  document could not be masked by the expected side having been mutated too. */
function asStoredJson(document: Record<string, unknown>): unknown {
  return JSON.parse(JSON.stringify(document)) as unknown;
}

describe("a stored settings container survives the load path unchanged", () => {
  const CONTAINERS: readonly (readonly [
    string,
    Record<string, string | number>,
  ])[] = [
    [
      "both tier keys",
      {
        materialTierId: "m-1",
        hardwareTierId: "h-1",
        cabinetDepthMm: 600,
      },
    ],
    ["the material tier key", { materialTierId: "m-1", cabinetDepthMm: 600 }],
    ["the hardware tier key", { hardwareTierId: "h-1", cabinetDepthMm: 600 }],
  ];

  it.each(CONTAINERS)(
    "round-trips byte-identically through parse → migrate → serialise with %s",
    (_shape, settings) => {
      const document = withSettings(settings);
      const parsed = canonicalSerializeDesign(DesignSchema.parse(document));

      const migrated = migrateDesign(
        CURRENT_SCHEMA_VERSION,
        asStoredJson(document),
      );

      expect(canonicalSerializeDesign(migrated)).toBe(parsed);
      expect(migrated.settings).toEqual(settings);
    },
  );

  // The oldest version still readable, and the one the five measured rows sit at (ADR 0052). Both
  // normalisation arms run, and neither may touch a key that did not exist when they were written.
  it("carries a settings container forward from version 1 untouched", () => {
    const settings = { materialTierId: "m-1", hardwareTierId: "h-1" };

    const migrated = migrateDesign(1, asStoredJson(withSettings(settings)));

    expect(migrated.settings).toEqual({ ...settings, cabinetDepthMm: 600 });
  });

  it("carries it through the room correction a version 2 document is owed", () => {
    const preCorrection = {
      ...withSettings({ materialTierId: "m-1" }),
      room: {
        shape: "L" as const,
        widthMm: 3600,
        depthMm: 2400,
        heightMm: 2600,
      },
    };

    const migrated = migrateDesign(2, asStoredJson(preCorrection));

    expect(migrated.room.widthMm).toBe(3560);
    expect(migrated.settings).toEqual({
      materialTierId: "m-1",
      cabinetDepthMm: 600,
    });
  });
});

describe("the settings container's own bounds, at the seam that enforces them", () => {
  it("accepts a tier id of exactly the identifier length", () => {
    const tierId = "x".repeat(MAX_IDENTIFIER_LENGTH);

    expect(
      DesignSettingsSchema.safeParse({ materialTierId: tierId }).success,
    ).toBe(true);
    expect(
      DesignSettingsSchema.safeParse({ hardwareTierId: tierId }).success,
    ).toBe(true);
    expect(
      DesignSchema.safeParse(withSettings({ materialTierId: tierId })).success,
    ).toBe(true);
  });

  it("refuses one character past it on either key", () => {
    const tierId = "x".repeat(MAX_IDENTIFIER_LENGTH + 1);

    expect(
      DesignSettingsSchema.safeParse({ materialTierId: tierId }).success,
    ).toBe(false);
    expect(
      DesignSettingsSchema.safeParse({ hardwareTierId: tierId }).success,
    ).toBe(false);
    expect(
      DesignSchema.safeParse(withSettings({ hardwareTierId: tierId })).success,
    ).toBe(false);
  });

  // `strictObject` inside `strictObject`: the nested refusal has to reach the load path, not only
  // the schema read in isolation — that is the difference between a bound and a bound that is
  // enforced where documents arrive.
  it("refuses an undeclared setting at the load path, without echoing it", () => {
    const document = withSettings({
      materialTierId: "m-1",
      cabinetDepthMm: 600,
      secretCanary: "do-not-echo",
    });

    expect(() =>
      migrateDesign(CURRENT_SCHEMA_VERSION, asStoredJson(document)),
    ).toThrow(InvalidDesignError);
    try {
      migrateDesign(CURRENT_SCHEMA_VERSION, asStoredJson(document));
    } catch (error) {
      expect((error as Error).message).not.toContain("do-not-echo");
    }
  });

  it("refuses an out-of-bound tier id at the load path", () => {
    expect(() =>
      migrateDesign(
        CURRENT_SCHEMA_VERSION,
        asStoredJson(withSettings({ materialTierId: "" })),
      ),
    ).toThrow(InvalidDesignError);
  });
});

// The widening `PriceDesignRequest.selections` and `WholeKitchenSelections` took under
// `exactOptionalPropertyTypes` created a second spelling of "nothing chosen". Three observers can
// tell an absent key from a present-and-`undefined` one if anything does: the wire form, the load
// path, and the price.
describe("an explicitly-undefined tier id is the same thing as an absent one", () => {
  const EXPLICIT_UNDEFINED = {
    materialTierId: undefined,
    cabinetDepthMm: 600,
  };
  const EMPTY_CURRENT_SETTINGS = { cabinetDepthMm: 600 };

  it("serialises identically", () => {
    const explicit = DesignSchema.parse(withSettings(EXPLICIT_UNDEFINED));
    const empty = DesignSchema.parse(withSettings(EMPTY_CURRENT_SETTINGS));

    expect(canonicalSerializeDesign(explicit)).toBe(
      canonicalSerializeDesign(empty),
    );
  });

  it("survives the load path as the same document", () => {
    const explicit = migrateDesign(
      CURRENT_SCHEMA_VERSION,
      withSettings(EXPLICIT_UNDEFINED),
    );
    const empty = migrateDesign(
      CURRENT_SCHEMA_VERSION,
      withSettings(EMPTY_CURRENT_SETTINGS),
    );

    expect(canonicalSerializeDesign(explicit)).toBe(
      canonicalSerializeDesign(empty),
    );
    expect(explicit.settings?.materialTierId).toBeUndefined();
  });

  it("prices identically to an empty container and to no container at all", () => {
    const totals = [
      EXPLICIT_UNDEFINED,
      {},
      { materialTierId: undefined, hardwareTierId: undefined },
      undefined,
    ].map((selections) => {
      const result = priceDesign({
        design: KITCHEN_L_DESIGN,
        catalog: KITCHEN_L_BODY_CATALOG,
        book: SAMPLE_PRICE_BOOK,
        pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
        deepeningRows: MEASURED_DEEPENING_ROWS,
        availability: NOTHING_DISABLED,
        selections,
      });
      if (!result.ok) throw new Error("expected the seeded design to price");
      return result.priced.totalMinor;
    });

    // Compared against the book's own defaults, not against each other's answers: the point is that
    // all four mean "unset", which is the tier the book names.
    const defaultTierIds = [
      SAMPLE_PRICE_BOOK.material.defaultTierId,
      SAMPLE_PRICE_BOOK.hardware.defaultTierId,
    ];
    const atDefaults = priceDesign({
      design: KITCHEN_L_DESIGN,
      catalog: KITCHEN_L_BODY_CATALOG,
      book: SAMPLE_PRICE_BOOK,
      pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
      deepeningRows: MEASURED_DEEPENING_ROWS,
      availability: NOTHING_DISABLED,
      selections: {
        materialTierId: defaultTierIds[0],
        hardwareTierId: defaultTierIds[1],
      },
    });
    if (!atDefaults.ok) throw new Error("expected the seeded design to price");

    for (const total of totals) {
      expect(total).toBe(atDefaults.priced.totalMinor);
    }
  });
});
