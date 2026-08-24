import { describe, expect, expectTypeOf, it } from "vitest";

import {
  type PriceConfigurationInput,
  priceConfiguration,
  verifyPricingSnapshot,
} from "./pricing-engine.js";
import {
  CabinetDefinitionSchema,
  KitchenConfigurationSchema,
  LayoutPolicyExactnessSchema,
  MdlPriceBookSchema,
  type CabinetDefinition,
  type KitchenConfiguration,
  type MdlPriceBook,
  type Placement,
} from "./schemas.js";

const policy = LayoutPolicyExactnessSchema.parse({
  version: "layout-v1",
  manufacturingGrid: { unitM: 0.1 },
  obstacleRules: [
    {
      id: "exact",
      door: { beforeM: 0, afterM: 0, belowM: 0, aboveM: 0 },
      window: { beforeM: 0, afterM: 0, belowM: 0, aboveM: 0 },
    },
  ],
});

const definition = CabinetDefinitionSchema.parse({
  id: "base",
  family: "base",
  verticalBand: "base",
  variant: "base",
  supportedWidthRules: [{ kind: "discrete", widthsM: [1, 2] }],
  defaultWidthM: 1,
  heightM: 1,
  depthM: 0.5,
  rendererKey: "base",
  replacementGroup: "base",
  layoutRole: "cabinet",
  optionSupport: {
    materialColourPairs: [
      { materialId: "oak", colourIds: ["white"] },
      { materialId: "walnut", colourIds: ["black"] },
    ],
    handleIds: ["bar"],
    mechanismIds: ["soft-close"],
  },
  defaultOptions: {
    materialId: "oak",
    colourId: "white",
    handleId: "bar",
  },
  pricingRuleId: "cabinet-base",
  placementRules: {
    runMargin: "unrestricted",
    corner: "prohibited",
    obstacleClearanceProfileId: "exact",
  },
});

function placement(
  id: string,
  order: number,
  options: Placement["options"] = {},
  widthM = 1,
): Placement {
  return {
    id,
    cabinetDefinitionId: "base",
    wallId: "wall-a",
    verticalBand: "base",
    runAnchor: "flow",
    order,
    widthM,
    options,
  };
}

function configuration(
  placements: Placement[] = [placement("one", 0)],
  lengthM = 5,
): KitchenConfiguration {
  return KitchenConfigurationSchema.parse({
    schemaVersion: "1",
    room: {
      shape: "linear",
      heightM: 3,
      walls: [{ id: "wall-a", order: 0, lengthM }],
      obstacles: [],
    },
    sourcePresetId: "preset",
    placements,
    catalogVersion: "catalog-v1",
    layoutPolicyVersion: "layout-v1",
    pricingVersion: "pricing-v1",
    createdAt: "2026-08-20T10:00:00.000Z",
    updatedAt: "2026-08-20T10:00:00.000Z",
  });
}

function context(definitions: CabinetDefinition[] = [definition]) {
  return {
    supportedSchemaVersions: ["1"],
    catalogVersion: "catalog-v1",
    pricingVersion: "pricing-v1",
    presetIds: ["preset"],
    layoutPolicy: policy,
    cabinetDefinitions: definitions,
    optionIds: {
      material: ["oak", "walnut"],
      colour: ["white", "black"],
      handle: ["bar"],
      mechanism: ["soft-close"],
    },
  };
}

function book(): MdlPriceBook {
  return MdlPriceBookSchema.parse({
    version: "pricing-v1",
    currency: "MDL",
    status: "estimate",
    cabinetRules: [
      {
        id: "cabinet-base",
        labelKey: "price.cabinet",
        amountsByWidth: [
          { widthM: 2, amountMinor: 200 },
          { widthM: 1, amountMinor: 100 },
        ],
      },
    ],
    materialColourRules: [
      {
        id: "material-oak-white",
        labelKey: "price.oak-white",
        materialId: "oak",
        colourId: "white",
        amountsByWidth: [
          { widthM: 1, amountMinor: 10 },
          { widthM: 2, amountMinor: 20 },
        ],
      },
      {
        id: "material-walnut-black",
        labelKey: "price.walnut-black",
        materialId: "walnut",
        colourId: "black",
        amountsByWidth: [{ widthM: 1, amountMinor: 30 }],
      },
    ],
    handleRules: [
      {
        id: "handle-bar",
        labelKey: "price.bar",
        handleId: "bar",
        amountMinor: 0,
      },
    ],
    mechanismRules: [
      {
        id: "mechanism-soft",
        labelKey: "price.soft",
        mechanismId: "soft-close",
        amountMinor: 5,
      },
    ],
    projectRules: [
      {
        id: "z-charge",
        labelKey: "price.z",
        component: "charge",
        amountMinor: 7,
      },
      {
        id: "a-discount",
        labelKey: "price.discount",
        component: "discount",
        amountMinor: -2,
      },
      {
        id: "a-charge",
        labelKey: "price.a",
        component: "charge",
        amountMinor: 3,
      },
    ],
  });
}

function input(
  config: unknown = configuration(),
  priceBook: unknown = book(),
): PriceConfigurationInput {
  return {
    configuration: config,
    validationContext: context(),
    cornerReservations: [],
    priceBook: priceBook as MdlPriceBook,
  };
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

describe("priceConfiguration", () => {
  it("exposes only the typed PriceConfigurationInput call contract", () => {
    expectTypeOf<
      Parameters<typeof priceConfiguration>[0]
    >().toEqualTypeOf<PriceConfigurationInput>();
  });

  it("emits exact default/explicit/zero lines in canonical component and project order", () => {
    const config = configuration([
      placement("second", 1, {
        materialId: "walnut",
        colourId: "black",
        mechanismId: "soft-close",
      }),
      placement("first", 0),
    ]);
    const result = priceConfiguration(input(config));
    if (!result.ok) throw new Error(result.error.code);
    expect(result.pricing).toEqual({
      lines: [
        {
          lineId: "placement:first:cabinet",
          kind: "cabinet",
          component: "cabinet",
          placementId: "first",
          cabinetDefinitionId: "base",
          widthM: 1,
          ruleId: "cabinet-base",
          labelKey: "price.cabinet",
          quantity: 1,
          unitAmountMinor: 100,
          amountMinor: 100,
        },
        {
          lineId: "placement:first:material-colour",
          kind: "option",
          component: "material_colour",
          placementId: "first",
          materialId: "oak",
          colourId: "white",
          widthM: 1,
          ruleId: "material-oak-white",
          labelKey: "price.oak-white",
          quantity: 1,
          unitAmountMinor: 10,
          amountMinor: 10,
        },
        {
          lineId: "placement:first:handle",
          kind: "option",
          component: "handle",
          placementId: "first",
          handleId: "bar",
          ruleId: "handle-bar",
          labelKey: "price.bar",
          quantity: 1,
          unitAmountMinor: 0,
          amountMinor: 0,
        },
        {
          lineId: "placement:second:cabinet",
          kind: "cabinet",
          component: "cabinet",
          placementId: "second",
          cabinetDefinitionId: "base",
          widthM: 1,
          ruleId: "cabinet-base",
          labelKey: "price.cabinet",
          quantity: 1,
          unitAmountMinor: 100,
          amountMinor: 100,
        },
        {
          lineId: "placement:second:material-colour",
          kind: "option",
          component: "material_colour",
          placementId: "second",
          materialId: "walnut",
          colourId: "black",
          widthM: 1,
          ruleId: "material-walnut-black",
          labelKey: "price.walnut-black",
          quantity: 1,
          unitAmountMinor: 30,
          amountMinor: 30,
        },
        {
          lineId: "placement:second:handle",
          kind: "option",
          component: "handle",
          placementId: "second",
          handleId: "bar",
          ruleId: "handle-bar",
          labelKey: "price.bar",
          quantity: 1,
          unitAmountMinor: 0,
          amountMinor: 0,
        },
        {
          lineId: "placement:second:mechanism",
          kind: "option",
          component: "mechanism",
          placementId: "second",
          mechanismId: "soft-close",
          ruleId: "mechanism-soft",
          labelKey: "price.soft",
          quantity: 1,
          unitAmountMinor: 5,
          amountMinor: 5,
        },
        {
          lineId: "project:a-charge",
          kind: "project",
          component: "charge",
          ruleId: "a-charge",
          labelKey: "price.a",
          quantity: 1,
          unitAmountMinor: 3,
          amountMinor: 3,
        },
        {
          lineId: "project:z-charge",
          kind: "project",
          component: "charge",
          ruleId: "z-charge",
          labelKey: "price.z",
          quantity: 1,
          unitAmountMinor: 7,
          amountMinor: 7,
        },
        {
          lineId: "project:a-discount",
          kind: "project",
          component: "discount",
          ruleId: "a-discount",
          labelKey: "price.discount",
          quantity: 1,
          unitAmountMinor: -2,
          amountMinor: -2,
        },
      ],
      totalMinor: 253,
      currency: "MDL",
      pricingVersion: "pricing-v1",
      status: "estimate",
    });
  });

  it("returns empty pricing and omits intentionally absent option components", () => {
    const emptyBook = MdlPriceBookSchema.parse({
      version: "pricing-v1",
      currency: "MDL",
      status: "estimate",
      cabinetRules: [],
      materialColourRules: [],
      handleRules: [],
      mechanismRules: [],
      projectRules: [],
    });
    expect(priceConfiguration(input(configuration([]), emptyBook))).toEqual({
      ok: true,
      pricing: {
        lines: [],
        totalMinor: 0,
        currency: "MDL",
        pricingVersion: "pricing-v1",
        status: "estimate",
      },
    });
    const noOptions = CabinetDefinitionSchema.parse({
      ...definition,
      id: "plain",
      variant: "plain",
      rendererKey: "plain",
      pricingRuleId: "cabinet-base",
      optionSupport: {
        materialColourPairs: [],
        handleIds: [],
        mechanismIds: [],
      },
      defaultOptions: {},
    });
    const plain = placement("plain", 0);
    plain.cabinetDefinitionId = "plain";
    const result = priceConfiguration({
      ...input(configuration([plain])),
      validationContext: context([noOptions]),
    });
    if (!result.ok) throw new Error(result.error.code);
    expect(result.pricing.lines.map(({ component }) => component)).toEqual([
      "cabinet",
      "charge",
      "charge",
      "discount",
    ]);
  });

  it("enforces fail-whole validation precedence for context, book, configuration, versions, and layout", () => {
    expect(priceConfiguration(null as never)).toEqual({
      ok: false,
      error: { code: "INVALID_CONTEXT" },
    });
    expect(
      priceConfiguration({
        ...input(null, null),
        validationContext: null as never,
      }),
    ).toEqual({ ok: false, error: { code: "INVALID_CONTEXT" } });
    expect(priceConfiguration(input(null, null))).toEqual({
      ok: false,
      error: { code: "INVALID_PRICE_BOOK" },
    });
    expect(priceConfiguration(input(null))).toEqual({
      ok: false,
      error: { code: "INVALID_CONFIGURATION" },
    });

    const wrongVersion = { ...configuration(), pricingVersion: "other" };
    expect(priceConfiguration(input(wrongVersion))).toEqual({
      ok: false,
      error: { code: "PRICING_VERSION_MISMATCH" },
    });
    expect(
      priceConfiguration(
        input(configuration(), { ...book(), version: "other" }),
      ),
    ).toEqual({
      ok: false,
      error: { code: "PRICING_VERSION_MISMATCH" },
    });
    const wrongCatalog = { ...configuration(), catalogVersion: "other" };
    expect(priceConfiguration(input(wrongCatalog))).toEqual({
      ok: false,
      error: { code: "INVALID_CONFIGURATION" },
    });
    expect(priceConfiguration(input(configuration(undefined, 0.5)))).toEqual({
      ok: false,
      error: { code: "LAYOUT_REJECTED", cause: "NO_FIT" },
    });
    expect(
      priceConfiguration({ ...input(), cornerReservations: null as never }),
    ).toEqual({
      ok: false,
      error: {
        code: "LAYOUT_REJECTED",
        cause: "INVALID_CORNER_RESERVATION",
      },
    });
  });

  it("rejects sparse arrays in every resolved-context collection without throwing", () => {
    const sparse = (item: unknown) => {
      const values: unknown[] = new Array(2);
      values[0] = item;
      return values;
    };
    const resolved = context();
    const malformedContexts = [
      { ...resolved, supportedSchemaVersions: sparse("1") },
      { ...resolved, presetIds: sparse("preset") },
      { ...resolved, cabinetDefinitions: sparse(definition) },
      {
        ...resolved,
        optionIds: { ...resolved.optionIds, material: sparse("oak") },
      },
      {
        ...resolved,
        optionIds: { ...resolved.optionIds, colour: sparse("white") },
      },
      {
        ...resolved,
        optionIds: { ...resolved.optionIds, handle: sparse("bar") },
      },
      {
        ...resolved,
        optionIds: {
          ...resolved.optionIds,
          mechanism: sparse("soft-close"),
        },
      },
    ];
    for (const validationContext of malformedContexts) {
      expect(
        priceConfiguration({ ...input(), validationContext } as never),
      ).toEqual({ ok: false, error: { code: "INVALID_CONTEXT" } });
    }
  });

  it("rejects invalid, duplicate, signed, unsafe, and non-grid price-book data", () => {
    const valid = book();
    const invalidBooks = [
      { ...valid, currency: "EUR" },
      {
        ...valid,
        handleRules: [
          ...valid.handleRules,
          { ...valid.handleRules[0], id: "duplicate-selector" },
        ],
      },
      {
        ...valid,
        projectRules: [
          {
            id: "bad-discount",
            labelKey: "bad",
            component: "discount",
            amountMinor: 1,
          },
        ],
      },
      {
        ...valid,
        cabinetRules: [
          {
            ...valid.cabinetRules[0],
            amountsByWidth: [{ widthM: 0.15, amountMinor: 1 }],
          },
        ],
      },
      {
        ...valid,
        projectRules: [
          {
            id: "unsafe",
            labelKey: "unsafe",
            component: "charge",
            amountMinor: Number.MAX_SAFE_INTEGER + 1,
          },
        ],
      },
    ];
    for (const invalid of invalidBooks) {
      expect(priceConfiguration(input(configuration(), invalid))).toEqual({
        ok: false,
        error: { code: "INVALID_PRICE_BOOK" },
      });
    }
  });

  it.each([
    [
      "cabinet rule",
      (value: MdlPriceBook) => ({ ...value, cabinetRules: [] }),
      {
        component: "cabinet",
        pricingRuleId: "cabinet-base",
        widthM: 1,
      },
    ],
    [
      "cabinet width",
      (value: MdlPriceBook) => ({
        ...value,
        cabinetRules: value.cabinetRules.map((rule) => ({
          ...rule,
          amountsByWidth: [{ widthM: 2, amountMinor: 200 }],
        })),
      }),
      {
        component: "cabinet",
        pricingRuleId: "cabinet-base",
        widthM: 1,
      },
    ],
    [
      "material colour",
      (value: MdlPriceBook) => ({ ...value, materialColourRules: [] }),
      {
        component: "material_colour",
        materialId: "oak",
        colourId: "white",
        widthM: 1,
      },
    ],
    [
      "handle",
      (value: MdlPriceBook) => ({ ...value, handleRules: [] }),
      { component: "handle", handleId: "bar" },
    ],
  ])("fails whole on a missing %s selector", (_name, mutate, lookup) => {
    expect(priceConfiguration(input(configuration(), mutate(book())))).toEqual({
      ok: false,
      error: {
        code: "MISSING_PRICE_RULE",
        placementId: "one",
        lookup,
      },
    });
  });

  it("reports mechanism lookup after earlier components", () => {
    const config = configuration([
      placement("one", 0, { mechanismId: "soft-close" }),
    ]);
    expect(
      priceConfiguration(input(config, { ...book(), mechanismRules: [] })),
    ).toEqual({
      ok: false,
      error: {
        code: "MISSING_PRICE_RULE",
        placementId: "one",
        lookup: { component: "mechanism", mechanismId: "soft-close" },
      },
    });
  });

  it("uses bigint aggregation and rejects overflow before a safe negative total", () => {
    const projectBook = (amounts: number[]): MdlPriceBook =>
      MdlPriceBookSchema.parse({
        version: "pricing-v1",
        currency: "MDL",
        status: "estimate",
        cabinetRules: [],
        materialColourRules: [],
        handleRules: [],
        mechanismRules: [],
        projectRules: amounts.map((amountMinor, index) => ({
          id: `rule-${String(index)}`,
          labelKey: `rule.${String(index)}`,
          component: amountMinor < 0 ? "discount" : "charge",
          amountMinor,
        })),
      });
    expect(
      priceConfiguration(
        input(
          configuration([]),
          projectBook([Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]),
        ),
      ),
    ).toEqual({ ok: false, error: { code: "ARITHMETIC_OVERFLOW" } });
    expect(
      priceConfiguration(input(configuration([]), projectBook([-1]))),
    ).toEqual({ ok: false, error: { code: "NEGATIVE_TOTAL" } });
    const boundary = priceConfiguration(
      input(configuration([]), projectBook([Number.MAX_SAFE_INTEGER])),
    );
    expect(boundary.ok && boundary.pricing.totalMinor).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it("is deterministic across input permutations and does not mutate frozen inputs", () => {
    const config = configuration([
      placement("second", 1),
      placement("first", 0),
    ]);
    const priceBook = book();
    const original = input(config, priceBook);
    const before = JSON.stringify(original);
    deepFreeze(original);
    const forward = priceConfiguration(original);
    const reverse = priceConfiguration({
      ...original,
      configuration: {
        ...config,
        placements: [...config.placements].reverse(),
      },
      priceBook: {
        ...priceBook,
        cabinetRules: [...priceBook.cabinetRules].reverse(),
        materialColourRules: [...priceBook.materialColourRules].reverse(),
        projectRules: [...priceBook.projectRules].reverse(),
      },
    });
    expect(reverse).toEqual(forward);
    expect(JSON.stringify(original)).toBe(before);
  });

  it("prices with immutable explicit corner reservations without altering them", () => {
    const cornerDefinition = CabinetDefinitionSchema.parse({
      ...definition,
      id: "corner-base",
      variant: "corner-base",
      rendererKey: "corner-base",
      pricingRuleId: "corner-price",
      placementRules: {
        ...definition.placementRules,
        runMargin: "placement_touches",
        corner: "junction_only",
      },
    });
    const legA = placement("leg-a", 0);
    const legB = placement("leg-b", 0);
    legA.cabinetDefinitionId = "corner-base";
    legA.runAnchor = "start";
    legA.junctionGroupId = "corner";
    legB.cabinetDefinitionId = "corner-base";
    legB.wallId = "wall-b";
    legB.runAnchor = "end";
    legB.junctionGroupId = "corner";
    const config = KitchenConfigurationSchema.parse({
      ...configuration([]),
      room: {
        shape: "l_shape",
        heightM: 3,
        walls: [
          { id: "wall-a", order: 0, lengthM: 5 },
          { id: "wall-b", order: 1, lengthM: 5 },
        ],
        obstacles: [],
      },
      placements: [legA, legB],
    });
    const corners = deepFreeze([
      {
        sourceId: "corner",
        wallId: "wall-a" as const,
        verticalBands: ["base" as const],
        startUnits: 0n,
        endUnits: 10n,
      },
      {
        sourceId: "corner",
        wallId: "wall-b" as const,
        verticalBands: ["base" as const],
        startUnits: 40n,
        endUnits: 50n,
      },
    ]);
    const priceBook = {
      ...book(),
      cabinetRules: [
        {
          id: "corner-price",
          labelKey: "price.corner",
          amountsByWidth: [{ widthM: 1, amountMinor: 100 }],
        },
      ],
    };
    const result = priceConfiguration({
      configuration: config,
      validationContext: context([cornerDefinition]),
      cornerReservations: corners,
      priceBook,
    });
    expect(result.ok).toBe(true);
    expect(corners).toEqual([
      {
        sourceId: "corner",
        wallId: "wall-a",
        verticalBands: ["base"],
        startUnits: 0n,
        endUnits: 10n,
      },
      {
        sourceId: "corner",
        wallId: "wall-b",
        verticalBands: ["base"],
        startUnits: 40n,
        endUnits: 50n,
      },
    ]);
  });

  it("verifies snapshots with parse, recomputation, then equality precedence", () => {
    const pricingInput = { ...input(), priceBook: book() };
    const result = priceConfiguration(pricingInput);
    if (!result.ok) throw new Error(result.error.code);
    expect(
      verifyPricingSnapshot({
        ...pricingInput,
        pricingSnapshot: result.pricing,
      }),
    ).toEqual({ ok: true, pricing: result.pricing });

    const structurallyValidMutations = [
      {
        ...result.pricing,
        lines: result.pricing.lines.map((line, index) =>
          index === 0 ? { ...line, ruleId: "arbitrary-rule" } : line,
        ),
      },
      {
        ...result.pricing,
        lines: result.pricing.lines.map((line, index) =>
          index === 0 ? { ...line, labelKey: "arbitrary.label" } : line,
        ),
      },
      {
        ...result.pricing,
        lines: result.pricing.lines.map((line, index) =>
          index === 0 && line.component === "cabinet"
            ? { ...line, cabinetDefinitionId: "arbitrary-definition" }
            : line,
        ),
      },
    ];
    for (const candidate of structurallyValidMutations) {
      expect(
        verifyPricingSnapshot({
          ...pricingInput,
          pricingSnapshot: candidate,
        }),
      ).toEqual({
        ok: false,
        error: { code: "PRICING_SNAPSHOT_MISMATCH" },
      });
    }
    expect(
      verifyPricingSnapshot({
        ...pricingInput,
        priceBook: null as never,
        pricingSnapshot: null,
      }),
    ).toEqual({
      ok: false,
      error: { code: "INVALID_PRICING_SNAPSHOT" },
    });
    expect(
      verifyPricingSnapshot({
        ...pricingInput,
        pricingSnapshot: {
          ...result.pricing,
          lines: [...result.pricing.lines].reverse(),
        },
      }),
    ).toEqual({
      ok: false,
      error: { code: "INVALID_PRICING_SNAPSHOT" },
    });
    expect(
      verifyPricingSnapshot({
        ...pricingInput,
        priceBook: null as never,
        pricingSnapshot: result.pricing,
      }),
    ).toEqual({ ok: false, error: { code: "INVALID_PRICE_BOOK" } });
  });
});
