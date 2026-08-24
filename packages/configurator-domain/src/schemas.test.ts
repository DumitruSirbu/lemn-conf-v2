import { describe, expect, it } from "vitest";

import {
  CabinetDefinitionSchema,
  CabinetOptionsSchema,
  ContactDataSchema,
  ContactSubmissionSchema,
  ConfigurationTimestampSchema,
  KitchenConfigurationSchema,
  LayoutPolicyExactnessSchema,
  MdlPriceBookSchema,
  PricingQueryResultSchema,
  PricingResultSchema,
  RoomSchema,
  createCabinetDefinitionSchema,
  createContactSubmissionSchema,
  createKitchenConfigurationSchema,
  createPricingResultSchema,
  createRoomSchema,
} from "./schemas.js";

const wallA = { id: "wall-a", order: 0, lengthM: 4 } as const;
const wallB = { id: "wall-b", order: 1, lengthM: 3 } as const;
const wallC = { id: "wall-c", order: 2, lengthM: 4 } as const;

const layoutPolicy = LayoutPolicyExactnessSchema.parse({
  version: "layout-v1",
  manufacturingGrid: { unitM: 0.001 },
  obstacleRules: [
    {
      id: "standard",
      door: { beforeM: 0, afterM: 0, belowM: 0, aboveM: 0 },
      window: { beforeM: 0, afterM: 0, belowM: 0, aboveM: 0 },
    },
  ],
});

function itemAt<T>(items: T[], index: number): T {
  const item = items[index];
  if (item === undefined)
    throw new Error(`Missing fixture item ${String(index)}`);
  return item;
}

function validRoom() {
  return {
    shape: "linear",
    heightM: 2.6,
    walls: [wallA],
    obstacles: [
      {
        id: "door-1",
        kind: "door",
        wallId: "wall-a",
        offsetM: 0.2,
        widthM: 0.9,
        heightM: 2.1,
        bottomElevationM: 0,
      },
      {
        id: "window-1",
        kind: "window",
        wallId: "wall-a",
        offsetM: 1.1,
        widthM: 1.2,
        heightM: 1,
        bottomElevationM: 1,
      },
    ],
  };
}

function validDefinition() {
  return {
    id: "base-2door",
    family: "base",
    verticalBand: "base",
    variant: "two-door",
    supportedWidthRules: [{ kind: "discrete", widthsM: [0.6, 0.8] }],
    defaultWidthM: 0.8,
    heightM: 0.86,
    depthM: 0.56,
    rendererKey: "base-2door",
    replacementGroup: "base-storage",
    layoutRole: "cabinet",
    optionSupport: {
      materialColourPairs: [{ materialId: "oak", colourIds: ["white"] }],
      handleIds: ["bar"],
      mechanismIds: [],
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
      obstacleClearanceProfileId: "standard",
    },
  };
}

function validationContext() {
  return {
    supportedSchemaVersions: ["1"],
    catalogVersion: "reference-v1",
    pricingVersion: "sample-mdl-v1",
    presetIds: ["reference-linear"],
    layoutPolicy,
    cabinetDefinitions: [CabinetDefinitionSchema.parse(validDefinition())],
    optionIds: {
      material: ["oak"],
      colour: ["white", "black"],
      handle: ["bar", "knob"],
      mechanism: [],
    },
  };
}

function validConfiguration() {
  return {
    schemaVersion: "1",
    room: { shape: "linear", heightM: 2.6, walls: [wallA], obstacles: [] },
    sourcePresetId: "reference-linear",
    placements: [
      {
        id: "placement-1",
        cabinetDefinitionId: "base-2door",
        wallId: "wall-a",
        verticalBand: "base",
        runAnchor: "flow",
        order: 0,
        widthM: 0.8,
        options: {},
      },
    ],
    catalogVersion: "reference-v1",
    layoutPolicyVersion: "layout-v1",
    pricingVersion: "sample-mdl-v1",
    createdAt: "2026-08-20T12:00:00.000Z",
    updatedAt: "2026-08-20T12:00:00.000Z",
  };
}

describe("RoomSchema", () => {
  it.each([
    ["linear", [wallA]],
    ["l_shape", [wallA, wallB]],
    ["u_shape", [wallA, wallB, wallC]],
  ] as const)("accepts the canonical %s wall tuple", (shape, walls) => {
    expect(
      RoomSchema.safeParse({ shape, heightM: 2.6, walls, obstacles: [] })
        .success,
    ).toBe(true);
  });

  it("rejects a wrong wall tuple and non-positive dimensions", () => {
    expect(
      RoomSchema.safeParse({
        shape: "l_shape",
        heightM: 0,
        walls: [wallB, wallA],
        obstacles: [],
      }).success,
    ).toBe(false);
  });

  it("accepts obstacle edge contact but rejects interior overlap", () => {
    const contextualRoomSchema = createRoomSchema(layoutPolicy);
    expect(contextualRoomSchema.safeParse(validRoom()).success).toBe(true);
    const overlapping = validRoom();
    itemAt(overlapping.obstacles, 1).offsetM = 1;
    expect(contextualRoomSchema.safeParse(overlapping).success).toBe(false);
  });

  it.each([
    ["unknown wall", { wallId: "wall-b" }],
    ["wall overflow", { offsetM: 3.5, widthM: 0.6 }],
    ["height overflow", { bottomElevationM: 1, heightM: 2 }],
    ["negative offset", { offsetM: -0.1 }],
  ])("rejects an obstacle with %s", (_label, patch) => {
    const room = validRoom();
    Object.assign(itemAt(room.obstacles, 0), patch);
    expect(createRoomSchema(layoutPolicy).safeParse(room).success).toBe(false);
  });

  it("rejects duplicate obstacle IDs, nonzero door elevation, and unknown kinds", () => {
    const duplicate = validRoom();
    itemAt(duplicate.obstacles, 1).id = "door-1";
    expect(createRoomSchema(layoutPolicy).safeParse(duplicate).success).toBe(
      false,
    );

    const raisedDoor = validRoom();
    itemAt(raisedDoor.obstacles, 0).bottomElevationM = 0.1;
    expect(createRoomSchema(layoutPolicy).safeParse(raisedDoor).success).toBe(
      false,
    );

    const socketRoom = validRoom();
    const socket = {
      ...socketRoom,
      obstacles: [
        { ...itemAt(socketRoom.obstacles, 0), kind: "socket" },
        itemAt(socketRoom.obstacles, 1),
      ],
    };
    expect(RoomSchema.safeParse(socket).success).toBe(false);
  });

  it("uses exact grid integers for decimal boundaries and rejects off-grid values", () => {
    const decimalBoundary = {
      shape: "linear",
      heightM: 2.6,
      walls: [{ id: "wall-a", order: 0, lengthM: 0.3 }],
      obstacles: [
        {
          id: "window-decimal",
          kind: "window",
          wallId: "wall-a",
          offsetM: 0.1,
          widthM: 0.2,
          heightM: 1,
          bottomElevationM: 1,
        },
      ],
    };
    expect(
      createRoomSchema(layoutPolicy).safeParse(decimalBoundary).success,
    ).toBe(true);
    expect(
      createRoomSchema(layoutPolicy).safeParse({
        ...decimalBoundary,
        obstacles: [
          { ...itemAt(decimalBoundary.obstacles, 0), widthM: 0.2005 },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects an invalid runtime policy before creating contextual schemas", () => {
    const invalidPolicy = {
      ...layoutPolicy,
      manufacturingGrid: { unitM: 0 },
    };
    expect(() => createRoomSchema(invalidPolicy)).toThrow();
    expect(() => createCabinetDefinitionSchema(invalidPolicy)).toThrow();
  });
});

describe("CabinetDefinitionSchema", () => {
  it("accepts discrete and policy-neutral stepped width rules", () => {
    expect(CabinetDefinitionSchema.safeParse(validDefinition()).success).toBe(
      true,
    );
    const stepped = {
      ...validDefinition(),
      supportedWidthRules: [
        { kind: "stepped_range", minWidthM: 0.6, maxWidthM: 0.9, stepM: 0.1 },
      ],
    };
    expect(CabinetDefinitionSchema.safeParse(stepped).success).toBe(true);
  });

  it.each([
    ["duplicate widths", [{ kind: "discrete", widthsM: [0.6, 0.6] }]],
    ["empty widths", [{ kind: "discrete", widthsM: [] }]],
    [
      "invalid range",
      [{ kind: "stepped_range", minWidthM: 0.9, maxWidthM: 0.6, stepM: 0.1 }],
    ],
  ])("rejects %s", (_label, supportedWidthRules) => {
    expect(
      CabinetDefinitionSchema.safeParse({
        ...validDefinition(),
        supportedWidthRules,
      }).success,
    ).toBe(false);
  });

  it("rejects an unsupported default, incompatible band, and unknown fields", () => {
    expect(
      CabinetDefinitionSchema.safeParse({
        ...validDefinition(),
        defaultWidthM: 0.7,
      }).success,
    ).toBe(false);
    expect(
      CabinetDefinitionSchema.safeParse({
        ...validDefinition(),
        verticalBand: "top",
      }).success,
    ).toBe(false);
    expect(
      CabinetDefinitionSchema.safeParse({
        ...validDefinition(),
        price: 100,
      }).success,
    ).toBe(false);
  });

  it("requires a documented layout role", () => {
    expect(
      CabinetDefinitionSchema.safeParse({
        ...validDefinition(),
        layoutRole: "implicit_gap",
      }).success,
    ).toBe(false);
  });

  it("resolves manufacturing-grid and obstacle-profile references", () => {
    expect(
      createCabinetDefinitionSchema(layoutPolicy).safeParse(validDefinition())
        .success,
    ).toBe(true);
    expect(
      createCabinetDefinitionSchema(layoutPolicy).safeParse({
        ...validDefinition(),
        supportedWidthRules: [{ kind: "discrete", widthsM: [0.6005, 0.8] }],
      }).success,
    ).toBe(false);
    expect(
      createCabinetDefinitionSchema(layoutPolicy).safeParse({
        ...validDefinition(),
        placementRules: {
          ...validDefinition().placementRules,
          obstacleClearanceProfileId: "missing",
        },
      }).success,
    ).toBe(false);
  });

  it("requires deterministic defaults to be definition-supported", () => {
    expect(
      CabinetDefinitionSchema.safeParse({
        ...validDefinition(),
        defaultOptions: { handleId: "knob" },
      }).success,
    ).toBe(false);
    expect(
      CabinetDefinitionSchema.safeParse({
        ...validDefinition(),
        defaultOptions: { materialId: "oak" },
      }).success,
    ).toBe(false);
  });
});

describe("CabinetOptionsSchema", () => {
  it("requires omission instead of own undefined values for JSON safety", () => {
    expect(CabinetOptionsSchema.safeParse({}).success).toBe(true);
    expect(
      CabinetOptionsSchema.safeParse({ handleId: undefined }).success,
    ).toBe(false);
  });
});

describe("KitchenConfigurationSchema", () => {
  it("accepts the versioned configuration and excludes contact fields", () => {
    expect(
      KitchenConfigurationSchema.safeParse(validConfiguration()).success,
    ).toBe(true);
    expect(
      KitchenConfigurationSchema.safeParse({
        ...validConfiguration(),
        phone: "+37360000000",
      }).success,
    ).toBe(false);
    expect(
      KitchenConfigurationSchema.safeParse({
        ...validConfiguration(),
        schemaVersion: " 1 ",
      }).success,
    ).toBe(false);
  });

  it("requires exactly millisecond timestamp precision", () => {
    expect(
      ConfigurationTimestampSchema.safeParse("2026-08-20T12:00:00.000Z")
        .success,
    ).toBe(true);
    expect(
      KitchenConfigurationSchema.safeParse({
        ...validConfiguration(),
        updatedAt: "2026-08-20T12:00:00.0001Z",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown walls, duplicate IDs, and non-contiguous order", () => {
    const wrongWall = validConfiguration();
    itemAt(wrongWall.placements, 0).wallId = "wall-b";
    expect(KitchenConfigurationSchema.safeParse(wrongWall).success).toBe(false);

    const invalidOrder = validConfiguration();
    invalidOrder.placements.push({
      ...itemAt(invalidOrder.placements, 0),
      id: "placement-2",
      order: 2,
    });
    expect(KitchenConfigurationSchema.safeParse(invalidOrder).success).toBe(
      false,
    );

    const duplicate = validConfiguration();
    duplicate.placements.push({
      ...itemAt(duplicate.placements, 0),
      order: 1,
    });
    expect(KitchenConfigurationSchema.safeParse(duplicate).success).toBe(false);
  });

  it("tracks contiguous order independently per run anchor", () => {
    const configuration = validConfiguration();
    configuration.placements.push({
      ...itemAt(configuration.placements, 0),
      id: "placement-at-start",
      runAnchor: "start",
      order: 0,
    });
    expect(KitchenConfigurationSchema.safeParse(configuration).success).toBe(
      true,
    );
    itemAt(configuration.placements, 1).order = 1;
    expect(KitchenConfigurationSchema.safeParse(configuration).success).toBe(
      false,
    );
  });

  it("enforces definition run-margin and column anchor compatibility", () => {
    const contextualSchema =
      createKitchenConfigurationSchema(validationContext());
    const anchored = validConfiguration();
    itemAt(anchored.placements, 0).runAnchor = "start";
    expect(contextualSchema.safeParse(anchored).success).toBe(false);

    const marginDefinition = {
      ...validDefinition(),
      id: "base-at-margin",
      placementRules: {
        ...validDefinition().placementRules,
        runMargin: "placement_touches",
      },
    } as const;
    const marginContext = {
      ...validationContext(),
      cabinetDefinitions: [CabinetDefinitionSchema.parse(marginDefinition)],
    };
    const marginConfiguration = validConfiguration();
    itemAt(marginConfiguration.placements, 0).cabinetDefinitionId =
      "base-at-margin";
    expect(
      createKitchenConfigurationSchema(marginContext).safeParse(
        marginConfiguration,
      ).success,
    ).toBe(false);
    itemAt(marginConfiguration.placements, 0).runAnchor = "end";
    expect(
      createKitchenConfigurationSchema(marginContext).safeParse(
        marginConfiguration,
      ).success,
    ).toBe(true);

    const columnDefinition = CabinetDefinitionSchema.parse({
      ...validDefinition(),
      id: "column",
      family: "column",
      verticalBand: "column",
      placementRules: {
        ...validDefinition().placementRules,
        runMargin: "placement_touches",
      },
    });
    const columnContext = {
      ...validationContext(),
      cabinetDefinitions: [columnDefinition],
    };
    const columnConfiguration = validConfiguration();
    Object.assign(itemAt(columnConfiguration.placements, 0), {
      cabinetDefinitionId: "column",
      verticalBand: "column",
      runAnchor: "flow",
    });
    expect(
      createKitchenConfigurationSchema(columnContext).safeParse(
        columnConfiguration,
      ).success,
    ).toBe(false);
  });

  it("allows junction groups only for junction-only definitions", () => {
    const configuration = validConfiguration();
    Object.assign(itemAt(configuration.placements, 0), {
      junctionGroupId: "corner-1",
    });
    expect(
      createKitchenConfigurationSchema(validationContext()).safeParse(
        configuration,
      ).success,
    ).toBe(false);

    const junctionDefinition = CabinetDefinitionSchema.parse({
      ...validDefinition(),
      placementRules: {
        ...validDefinition().placementRules,
        runMargin: "placement_touches",
        corner: "junction_only",
      },
    });
    const baseConfiguration = validConfiguration();
    const firstJunctionPlacement = {
      ...itemAt(baseConfiguration.placements, 0),
      runAnchor: "start",
      junctionGroupId: "corner-1",
    };
    const validJunction = {
      ...baseConfiguration,
      room: {
        shape: "l_shape",
        heightM: 2.6,
        walls: [wallA, wallB],
        obstacles: [],
      },
      placements: [
        firstJunctionPlacement,
        {
          ...firstJunctionPlacement,
          id: "placement-2",
          wallId: "wall-b",
          runAnchor: "end",
        },
      ],
    };
    expect(
      createKitchenConfigurationSchema({
        ...validationContext(),
        cabinetDefinitions: [junctionDefinition],
      }).safeParse(validJunction).success,
    ).toBe(true);

    const sameWall = {
      ...validJunction,
      placements: validJunction.placements.map((placement) => ({
        ...placement,
      })),
    };
    itemAt(sameWall.placements, 1).wallId = "wall-a";
    expect(KitchenConfigurationSchema.safeParse(sameWall).success).toBe(false);
    const wrongSide = {
      ...validJunction,
      placements: validJunction.placements.map((placement) => ({
        ...placement,
      })),
    };
    itemAt(wrongSide.placements, 1).runAnchor = "start";
    expect(KitchenConfigurationSchema.safeParse(wrongSide).success).toBe(false);
  });

  it("fails unresolved versions, definitions, widths, and options at hydration", () => {
    const contextualSchema =
      createKitchenConfigurationSchema(validationContext());
    expect(contextualSchema.safeParse(validConfiguration()).success).toBe(true);
    expect(
      contextualSchema.safeParse({
        ...validConfiguration(),
        schemaVersion: "unknown",
      }).success,
    ).toBe(false);
    const unknownDefinition = validConfiguration();
    itemAt(unknownDefinition.placements, 0).cabinetDefinitionId = "ghost";
    expect(contextualSchema.safeParse(unknownDefinition).success).toBe(false);
    const unsupportedWidth = validConfiguration();
    itemAt(unsupportedWidth.placements, 0).widthM = 0.7;
    expect(contextualSchema.safeParse(unsupportedWidth).success).toBe(false);
    const unknownOption = validConfiguration();
    itemAt(unknownOption.placements, 0).options = {
      materialId: "ghost",
      colourId: "white",
    };
    expect(contextualSchema.safeParse(unknownOption).success).toBe(false);

    const unsupportedHandle = validConfiguration();
    itemAt(unsupportedHandle.placements, 0).options = { handleId: "knob" };
    expect(contextualSchema.safeParse(unsupportedHandle).success).toBe(false);

    const unsupportedPair = validConfiguration();
    itemAt(unsupportedPair.placements, 0).options = {
      materialId: "oak",
      colourId: "black",
    };
    expect(contextualSchema.safeParse(unsupportedPair).success).toBe(false);
  });

  it("rejects a policy grid that cannot represent canonical band boundaries", () => {
    const incompatiblePolicy = LayoutPolicyExactnessSchema.parse({
      ...layoutPolicy,
      manufacturingGrid: { unitM: 0.2 },
    });
    expect(() =>
      createKitchenConfigurationSchema({
        ...validationContext(),
        layoutPolicy: incompatiblePolicy,
      }),
    ).toThrow(/vertical-band boundaries/);
  });
});

describe("ContactDataSchema", () => {
  it("requires name and phone, permits an optional valid email, and stays separate", () => {
    expect(
      ContactDataSchema.parse({
        name: "Ana",
        phone: "+373 60 000 000",
      }),
    ).toEqual({ name: "Ana", phone: "+373 60 000 000" });
    expect(
      ContactDataSchema.safeParse({
        name: "Ana",
        phone: "+373 60 000 000",
        email: "ana@example.com",
      }).success,
    ).toBe(true);
    expect(ContactDataSchema.safeParse({ name: "Ana" }).success).toBe(false);
    expect(
      ContactDataSchema.safeParse({
        name: "Ana",
        phone: "123",
        configuration: validConfiguration(),
      }).success,
    ).toBe(false);
  });
});

describe("PricingResultSchema", () => {
  const validPricing = {
    lines: [
      {
        lineId: "placement:placement-1:cabinet",
        kind: "cabinet",
        component: "cabinet",
        placementId: "placement-1",
        cabinetDefinitionId: "base-2door",
        widthM: 0.8,
        ruleId: "cabinet-base",
        labelKey: "pricing.cabinet",
        quantity: 1,
        unitAmountMinor: 100_00,
        amountMinor: 100_00,
      },
      {
        lineId: "project:installation",
        kind: "project",
        component: "charge",
        ruleId: "installation",
        labelKey: "pricing.installation",
        quantity: 1,
        unitAmountMinor: 20_00,
        amountMinor: 20_00,
      },
    ],
    totalMinor: 120_00,
    currency: "MDL",
    pricingVersion: "sample-mdl-v1",
    status: "estimate",
  };

  it("validates strict price books and query envelopes", () => {
    const book = {
      version: "sample-mdl-v1",
      currency: "MDL",
      status: "estimate",
      cabinetRules: [
        {
          id: "cabinet-base",
          labelKey: "pricing.cabinet",
          amountsByWidth: [{ widthM: 0.6, amountMinor: 0 }],
        },
      ],
      materialColourRules: [],
      handleRules: [],
      mechanismRules: [],
      projectRules: [
        {
          id: "discount",
          labelKey: "pricing.discount",
          component: "discount",
          amountMinor: -1,
        },
      ],
    } as const;
    expect(MdlPriceBookSchema.safeParse(book).success).toBe(true);
    expect(
      MdlPriceBookSchema.safeParse({
        ...book,
        projectRules: [
          ...book.projectRules,
          {
            id: "cabinet-base",
            labelKey: "duplicate",
            component: "charge",
            amountMinor: 1,
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      PricingQueryResultSchema.safeParse({ ok: true, pricing: validPricing })
        .success,
    ).toBe(true);
  });

  it("requires placement traceability and exact integer totals", () => {
    expect(PricingResultSchema.safeParse(validPricing).success).toBe(true);
    const missingLine: Record<string, unknown> = {
      ...itemAt(validPricing.lines, 0),
    };
    delete missingLine["placementId"];
    const missingPlacement = {
      ...validPricing,
      lines: [missingLine, itemAt(validPricing.lines, 1)],
    };
    expect(PricingResultSchema.safeParse(missingPlacement).success).toBe(false);
    expect(
      createPricingResultSchema(
        KitchenConfigurationSchema.parse(validConfiguration()),
      ).safeParse({
        ...validPricing,
        lines: [
          {
            ...itemAt(validPricing.lines, 0),
            placementId: "ghost",
          },
          itemAt(validPricing.lines, 1),
        ],
      }).success,
    ).toBe(false);

    expect(
      PricingResultSchema.safeParse({ ...validPricing, totalMinor: 119_99 })
        .success,
    ).toBe(false);
    expect(
      PricingResultSchema.safeParse({ ...validPricing, totalMinor: 12_000.5 })
        .success,
    ).toBe(false);
  });

  it("rejects project placement IDs and duplicate line IDs", () => {
    const projectPlacement = {
      ...validPricing,
      lines: [
        itemAt(validPricing.lines, 0),
        { ...itemAt(validPricing.lines, 1), placementId: "placement-1" },
      ],
    };
    expect(PricingResultSchema.safeParse(projectPlacement).success).toBe(false);

    const duplicate = {
      ...validPricing,
      lines: [
        itemAt(validPricing.lines, 0),
        {
          ...itemAt(validPricing.lines, 1),
          lineId: itemAt(validPricing.lines, 0).lineId,
        },
      ],
    };
    expect(PricingResultSchema.safeParse(duplicate).success).toBe(false);
    expect(
      PricingResultSchema.safeParse({ ...validPricing, currency: "ZZZ" })
        .success,
    ).toBe(false);
  });

  it("enforces derived line IDs and context-free canonical line ordering", () => {
    expect(
      PricingResultSchema.safeParse({
        ...validPricing,
        lines: [
          {
            ...itemAt(validPricing.lines, 0),
            lineId: "arbitrary",
          },
          itemAt(validPricing.lines, 1),
        ],
      }).success,
    ).toBe(false);
    const handle = {
      lineId: "placement:placement-1:handle",
      kind: "option",
      component: "handle",
      placementId: "placement-1",
      handleId: "bar",
      ruleId: "handle-bar",
      labelKey: "pricing.handle",
      quantity: 1,
      unitAmountMinor: 0,
      amountMinor: 0,
    } as const;
    expect(
      PricingResultSchema.safeParse({
        ...validPricing,
        lines: [handle, itemAt(validPricing.lines, 0)],
      }).success,
    ).toBe(false);
    expect(
      PricingResultSchema.safeParse({
        ...validPricing,
        lines: [itemAt(validPricing.lines, 1), itemAt(validPricing.lines, 0)],
      }).success,
    ).toBe(false);
    const chargeZ = {
      ...itemAt(validPricing.lines, 1),
      lineId: "project:z-charge",
      ruleId: "z-charge",
    };
    const chargeA = {
      ...itemAt(validPricing.lines, 1),
      lineId: "project:a-charge",
      ruleId: "a-charge",
    };
    expect(
      PricingResultSchema.safeParse({
        ...validPricing,
        lines: [itemAt(validPricing.lines, 0), chargeZ, chargeA],
        totalMinor: 140_00,
      }).success,
    ).toBe(false);
  });

  it("rejects configuration-visible pricing source mismatches", () => {
    const config = KitchenConfigurationSchema.parse({
      ...validConfiguration(),
      placements: [
        {
          ...itemAt(validConfiguration().placements, 0),
          options: { handleId: "bar" },
        },
      ],
    });
    const schema = createPricingResultSchema(config);
    expect(
      schema.safeParse({
        ...validPricing,
        lines: [
          {
            ...itemAt(validPricing.lines, 0),
            cabinetDefinitionId: "other",
          },
          itemAt(validPricing.lines, 1),
        ],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...validPricing,
        lines: [
          itemAt(validPricing.lines, 0),
          {
            lineId: "placement:placement-1:handle",
            kind: "option",
            component: "handle",
            placementId: "placement-1",
            handleId: "other",
            ruleId: "handle-other",
            labelKey: "pricing.handle",
            quantity: 1,
            unitAmountMinor: 0,
            amountMinor: 0,
          },
          itemAt(validPricing.lines, 1),
        ],
      }).success,
    ).toBe(false);
  });

  it("sums minor units exactly beyond floating-point accumulation", () => {
    expect(
      PricingResultSchema.safeParse({
        lines: [
          {
            ...itemAt(validPricing.lines, 1),
            lineId: "large-positive",
            amountMinor: Number.MAX_SAFE_INTEGER,
          },
          {
            ...itemAt(validPricing.lines, 1),
            lineId: "small-positive",
            amountMinor: 2,
          },
          {
            ...itemAt(validPricing.lines, 1),
            lineId: "large-negative",
            amountMinor: -Number.MAX_SAFE_INTEGER,
          },
        ],
        totalMinor: 1,
        currency: "MDL",
        pricingVersion: "sample-mdl-v1",
        status: "estimate",
      }).success,
    ).toBe(false);
  });

  it("validates the immutable contact submission envelope", () => {
    expect(
      ContactSubmissionSchema.safeParse({
        idempotencyKey: "submission-1",
        contact: { name: "Ana", phone: "+373 60 000 000" },
        configurationSnapshot: validConfiguration(),
        pricing: validPricing,
      }).success,
    ).toBe(true);
    expect(
      ContactSubmissionSchema.safeParse({
        idempotencyKey: "submission-1",
        contact: { name: "Ana", phone: "+373 60 000 000" },
        configurationSnapshot: validConfiguration(),
        pricing: {
          ...validPricing,
          pricingVersion: "other",
        },
      }).success,
    ).toBe(false);
    expect(
      createContactSubmissionSchema(validationContext()).safeParse({
        idempotencyKey: "submission-1",
        contact: { name: "Ana", phone: "+373 60 000 000" },
        configurationSnapshot: {
          ...validConfiguration(),
          catalogVersion: "missing",
        },
        pricing: validPricing,
      }).success,
    ).toBe(false);
  });
});
