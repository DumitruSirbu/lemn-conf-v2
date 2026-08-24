import { z } from "zod";

const stableIdentifierSchema = z
  .string()
  .min(1)
  .refine((value) => value === value.trim(), {
    message: "Identifiers must not contain leading or trailing whitespace",
  });
const positiveFiniteNumberSchema = z.number().positive();
const nonNegativeFiniteNumberSchema = z.number().nonnegative();
const nonNegativeIntegerSchema = z.number().int().nonnegative();
const minorUnitSchema = z
  .number()
  .int()
  .min(Number.MIN_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER);

export const ConfigurationTimestampSchema = z.iso.datetime({
  offset: true,
  precision: 3,
});

export const RoomShapeSchema = z.enum(["linear", "l_shape", "u_shape"]);
export type RoomShape = z.infer<typeof RoomShapeSchema>;

const WallASchema = z.strictObject({
  id: z.literal("wall-a"),
  order: z.literal(0),
  lengthM: positiveFiniteNumberSchema,
});

const WallBSchema = z.strictObject({
  id: z.literal("wall-b"),
  order: z.literal(1),
  lengthM: positiveFiniteNumberSchema,
});

const WallCSchema = z.strictObject({
  id: z.literal("wall-c"),
  order: z.literal(2),
  lengthM: positiveFiniteNumberSchema,
});

export const WallSchema = z.discriminatedUnion("id", [
  WallASchema,
  WallBSchema,
  WallCSchema,
]);
export type Wall = z.infer<typeof WallSchema>;

const wallObstacleFields = {
  id: stableIdentifierSchema,
  wallId: z.enum(["wall-a", "wall-b", "wall-c"]),
  offsetM: nonNegativeFiniteNumberSchema,
  widthM: positiveFiniteNumberSchema,
  heightM: positiveFiniteNumberSchema,
};

const DoorObstacleSchema = z.strictObject({
  ...wallObstacleFields,
  kind: z.literal("door"),
  bottomElevationM: z.literal(0),
});

const WindowObstacleSchema = z.strictObject({
  ...wallObstacleFields,
  kind: z.literal("window"),
  bottomElevationM: nonNegativeFiniteNumberSchema,
});

export const WallObstacleSchema = z.discriminatedUnion("kind", [
  DoorObstacleSchema,
  WindowObstacleSchema,
]);
export type WallObstacle = z.infer<typeof WallObstacleSchema>;

const roomFields = {
  heightM: positiveFiniteNumberSchema,
  obstacles: z.array(WallObstacleSchema),
};

export const RoomSchema = z
  .discriminatedUnion("shape", [
    z.strictObject({
      ...roomFields,
      shape: z.literal("linear"),
      walls: z.tuple([WallASchema]),
    }),
    z.strictObject({
      ...roomFields,
      shape: z.literal("l_shape"),
      walls: z.tuple([WallASchema, WallBSchema]),
    }),
    z.strictObject({
      ...roomFields,
      shape: z.literal("u_shape"),
      walls: z.tuple([WallASchema, WallBSchema, WallCSchema]),
    }),
  ])
  .superRefine((room, context) => {
    const wallLengths = new Map(
      room.walls.map((wall) => [wall.id, wall.lengthM]),
    );
    const obstacleIds = new Set<string>();

    for (const [index, obstacle] of room.obstacles.entries()) {
      if (obstacleIds.has(obstacle.id)) {
        context.addIssue({
          code: "custom",
          message: "Obstacle IDs must be unique within a room",
          path: ["obstacles", index, "id"],
        });
      }
      obstacleIds.add(obstacle.id);

      const wallLengthM = wallLengths.get(obstacle.wallId);
      if (wallLengthM === undefined) {
        context.addIssue({
          code: "custom",
          message: "Obstacle wallId must reference a wall in the room",
          path: ["obstacles", index, "wallId"],
        });
        continue;
      }
    }
  });
export type Room = z.infer<typeof RoomSchema>;

const DiscreteSupportedWidthRuleSchema = z
  .strictObject({
    kind: z.literal("discrete"),
    widthsM: z.array(positiveFiniteNumberSchema).min(1),
  })
  .superRefine((rule, context) => {
    if (new Set(rule.widthsM).size !== rule.widthsM.length) {
      context.addIssue({
        code: "custom",
        message: "Discrete supported widths must be unique",
        path: ["widthsM"],
      });
    }
  });

const SteppedRangeSupportedWidthRuleSchema = z
  .strictObject({
    kind: z.literal("stepped_range"),
    minWidthM: positiveFiniteNumberSchema,
    maxWidthM: positiveFiniteNumberSchema,
    stepM: positiveFiniteNumberSchema,
  })
  .superRefine((rule, context) => {
    if (rule.minWidthM > rule.maxWidthM) {
      context.addIssue({
        code: "custom",
        message: "minWidthM must not exceed maxWidthM",
        path: ["minWidthM"],
      });
    }
  });

export const SupportedWidthRuleSchema = z.discriminatedUnion("kind", [
  DiscreteSupportedWidthRuleSchema,
  SteppedRangeSupportedWidthRuleSchema,
]);
export type SupportedWidthRule = z.infer<typeof SupportedWidthRuleSchema>;

const uniqueIdentifierListSchema = z
  .array(stableIdentifierSchema)
  .superRefine((ids, context) => {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        message: "Option IDs must be unique",
      });
    }
  });

export const CabinetOptionSupportSchema = z
  .strictObject({
    materialColourPairs: z.array(
      z.strictObject({
        materialId: stableIdentifierSchema,
        colourIds: z.array(stableIdentifierSchema).min(1),
      }),
    ),
    handleIds: uniqueIdentifierListSchema,
    mechanismIds: uniqueIdentifierListSchema,
  })
  .superRefine((support, context) => {
    const materialIds = new Set<string>();
    for (const [index, pair] of support.materialColourPairs.entries()) {
      if (materialIds.has(pair.materialId)) {
        context.addIssue({
          code: "custom",
          message: "Material IDs must be unique within option support",
          path: ["materialColourPairs", index, "materialId"],
        });
      }
      materialIds.add(pair.materialId);
      if (new Set(pair.colourIds).size !== pair.colourIds.length) {
        context.addIssue({
          code: "custom",
          message: "Colour IDs must be unique within a material pair",
          path: ["materialColourPairs", index, "colourIds"],
        });
      }
    }
  });
export type CabinetOptionSupport = z.infer<typeof CabinetOptionSupportSchema>;

export const PlacementRulesSchema = z.strictObject({
  runMargin: z.enum([
    "unrestricted",
    "placement_touches",
    "contiguous_group_touches",
  ]),
  corner: z.enum(["allowed", "prohibited", "junction_only"]),
  obstacleClearanceProfileId: stableIdentifierSchema,
});
export type PlacementRules = z.infer<typeof PlacementRulesSchema>;

const ObstacleClearanceSchema = z.strictObject({
  beforeM: nonNegativeFiniteNumberSchema,
  afterM: nonNegativeFiniteNumberSchema,
  belowM: nonNegativeFiniteNumberSchema,
  aboveM: nonNegativeFiniteNumberSchema,
});

export const ObstacleClearanceProfileSchema = z.strictObject({
  id: stableIdentifierSchema,
  door: ObstacleClearanceSchema,
  window: ObstacleClearanceSchema,
});
export type ObstacleClearanceProfile = z.infer<
  typeof ObstacleClearanceProfileSchema
>;

export const LayoutPolicyExactnessSchema = z
  .strictObject({
    version: stableIdentifierSchema,
    manufacturingGrid: z.strictObject({
      unitM: positiveFiniteNumberSchema,
    }),
    obstacleRules: z.array(ObstacleClearanceProfileSchema),
  })
  .superRefine((policy, context) => {
    const ids = new Set<string>();
    for (const [index, profile] of policy.obstacleRules.entries()) {
      if (ids.has(profile.id)) {
        context.addIssue({
          code: "custom",
          message: "Obstacle clearance profile IDs must be unique",
          path: ["obstacleRules", index, "id"],
        });
      }
      ids.add(profile.id);

      const clearances = [
        ...Object.values(profile.door),
        ...Object.values(profile.window),
      ];
      if (
        clearances.some(
          (clearance) =>
            metresToGridUnits(clearance, policy.manufacturingGrid.unitM) ===
            undefined,
        )
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Obstacle clearances must be exactly representable on the manufacturing grid",
          path: ["obstacleRules", index],
        });
      }
    }
  });
export type LayoutPolicyExactness = z.infer<typeof LayoutPolicyExactnessSchema>;

interface DecimalInteger {
  coefficient: bigint;
  decimalPlaces: number;
}

function toDecimalInteger(value: number): DecimalInteger {
  const [mantissa = "0", exponentText = "0"] = value
    .toString()
    .toLowerCase()
    .split("e");
  const exponent = Number(exponentText);
  const [whole = "0", fraction = ""] = mantissa.split(".");
  const digits = `${whole}${fraction}`;
  const decimalPlaces = fraction.length - exponent;

  if (decimalPlaces >= 0) {
    return { coefficient: BigInt(digits), decimalPlaces };
  }

  return {
    coefficient: BigInt(digits) * 10n ** BigInt(Math.abs(decimalPlaces)),
    decimalPlaces: 0,
  };
}

function scaleDecimal(value: DecimalInteger, decimalPlaces: number): bigint {
  return value.coefficient * 10n ** BigInt(decimalPlaces - value.decimalPlaces);
}

export function metresToGridUnits(
  valueM: number,
  unitM: number,
): bigint | undefined {
  if (!Number.isFinite(valueM) || !Number.isFinite(unitM) || unitM <= 0) {
    return undefined;
  }
  const value = toDecimalInteger(valueM);
  const unit = toDecimalInteger(unitM);
  const decimalPlaces = Math.max(value.decimalPlaces, unit.decimalPlaces);
  const scaledValue = scaleDecimal(value, decimalPlaces);
  const scaledUnit = scaleDecimal(unit, decimalPlaces);

  if (scaledValue % scaledUnit !== 0n) return undefined;
  return scaledValue / scaledUnit;
}

export function createRoomSchema(policyInput: LayoutPolicyExactness) {
  const policy = LayoutPolicyExactnessSchema.parse(policyInput);
  return RoomSchema.superRefine((room, context) => {
    const unitM = policy.manufacturingGrid.unitM;
    const height = metresToGridUnits(room.heightM, unitM);
    const wallLengths = new Map<string, bigint>();

    if (height === undefined) {
      context.addIssue({
        code: "custom",
        message:
          "Room height must be exactly representable on the manufacturing grid",
        path: ["heightM"],
      });
    }

    for (const [index, wall] of room.walls.entries()) {
      const length = metresToGridUnits(wall.lengthM, unitM);
      if (length === undefined) {
        context.addIssue({
          code: "custom",
          message:
            "Wall length must be exactly representable on the manufacturing grid",
          path: ["walls", index, "lengthM"],
        });
      } else {
        wallLengths.set(wall.id, length);
      }
    }

    const obstacleUnits = room.obstacles.map((obstacle, index) => {
      const offset = metresToGridUnits(obstacle.offsetM, unitM);
      const width = metresToGridUnits(obstacle.widthM, unitM);
      const obstacleHeight = metresToGridUnits(obstacle.heightM, unitM);
      const bottom = metresToGridUnits(obstacle.bottomElevationM, unitM);
      if (
        offset === undefined ||
        width === undefined ||
        obstacleHeight === undefined ||
        bottom === undefined
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Obstacle dimensions must be exactly representable on the manufacturing grid",
          path: ["obstacles", index],
        });
        return undefined;
      }

      const wallLength = wallLengths.get(obstacle.wallId);

      if (wallLength !== undefined && offset + width > wallLength) {
        context.addIssue({
          code: "custom",
          message: "Obstacle must fit within its wall",
          path: ["obstacles", index],
        });
      }
      if (height !== undefined && bottom + obstacleHeight > height) {
        context.addIssue({
          code: "custom",
          message: "Obstacle must fit within the room height",
          path: ["obstacles", index],
        });
      }

      return {
        wallId: obstacle.wallId,
        offset,
        end: offset + width,
        bottom,
        top: bottom + obstacleHeight,
      };
    });

    for (let leftIndex = 0; leftIndex < obstacleUnits.length; leftIndex += 1) {
      const left = obstacleUnits[leftIndex];
      if (left === undefined) continue;
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < obstacleUnits.length;
        rightIndex += 1
      ) {
        const right = obstacleUnits[rightIndex];
        if (right === undefined || left.wallId !== right.wallId) continue;
        const horizontalOverlap =
          left.offset < right.end && right.offset < left.end;
        const verticalOverlap =
          left.bottom < right.top && right.bottom < left.top;
        if (horizontalOverlap && verticalOverlap) {
          context.addIssue({
            code: "custom",
            message: "Obstacle interiors must not overlap on the same wall",
            path: ["obstacles", rightIndex],
          });
        }
      }
    }
  });
}

function isOnSteppedRange(
  widthM: number,
  rule: z.infer<typeof SteppedRangeSupportedWidthRuleSchema>,
): boolean {
  if (widthM < rule.minWidthM || widthM > rule.maxWidthM) return false;

  const width = toDecimalInteger(widthM);
  const minimum = toDecimalInteger(rule.minWidthM);
  const step = toDecimalInteger(rule.stepM);
  const decimalPlaces = Math.max(
    width.decimalPlaces,
    minimum.decimalPlaces,
    step.decimalPlaces,
  );
  const difference =
    scaleDecimal(width, decimalPlaces) - scaleDecimal(minimum, decimalPlaces);

  return difference % scaleDecimal(step, decimalPlaces) === 0n;
}

function supportsWidth(widthM: number, rule: SupportedWidthRule): boolean {
  if (rule.kind === "discrete") return rule.widthsM.includes(widthM);
  return isOnSteppedRange(widthM, rule);
}

export const CabinetOptionsSchema = z
  .strictObject({
    materialId: stableIdentifierSchema.optional(),
    colourId: stableIdentifierSchema.optional(),
    handleId: stableIdentifierSchema.optional(),
    mechanismId: stableIdentifierSchema.optional(),
  })
  .superRefine((options, context) => {
    for (const key of [
      "materialId",
      "colourId",
      "handleId",
      "mechanismId",
    ] as const) {
      if (
        Object.prototype.hasOwnProperty.call(options, key) &&
        options[key] === undefined
      ) {
        context.addIssue({
          code: "custom",
          message: "Undefined option values must be represented by omission",
          path: [key],
        });
      }
    }
  });
export type CabinetOptions = z.infer<typeof CabinetOptionsSchema>;

export const LayoutRoleSchema = z.enum(["cabinet", "filler", "end_panel"]);
export type LayoutRole = z.infer<typeof LayoutRoleSchema>;

export const CabinetDefinitionSchema = z
  .strictObject({
    id: stableIdentifierSchema,
    family: z.enum(["base", "wall", "column"]),
    verticalBand: z.enum(["base", "middle", "top", "column"]),
    variant: stableIdentifierSchema,
    supportedWidthRules: z.array(SupportedWidthRuleSchema).min(1),
    defaultWidthM: positiveFiniteNumberSchema,
    heightM: positiveFiniteNumberSchema,
    depthM: positiveFiniteNumberSchema,
    rendererKey: stableIdentifierSchema,
    replacementGroup: stableIdentifierSchema,
    layoutRole: LayoutRoleSchema,
    optionSupport: CabinetOptionSupportSchema,
    defaultOptions: CabinetOptionsSchema,
    pricingRuleId: stableIdentifierSchema,
    placementRules: PlacementRulesSchema,
  })
  .superRefine((definition, context) => {
    const familyMatchesBand =
      (definition.family === "base" && definition.verticalBand === "base") ||
      (definition.family === "wall" &&
        (definition.verticalBand === "middle" ||
          definition.verticalBand === "top")) ||
      (definition.family === "column" && definition.verticalBand === "column");

    if (!familyMatchesBand) {
      context.addIssue({
        code: "custom",
        message: "Cabinet family and verticalBand are incompatible",
        path: ["verticalBand"],
      });
    }

    if (
      !definition.supportedWidthRules.some((rule) =>
        supportsWidth(definition.defaultWidthM, rule),
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "defaultWidthM must satisfy a supported width rule",
        path: ["defaultWidthM"],
      });
    }

    const materialId = definition.defaultOptions.materialId;
    const colourId = definition.defaultOptions.colourId;
    if ((materialId === undefined) !== (colourId === undefined)) {
      context.addIssue({
        code: "custom",
        message: "Default material and colour must be provided together",
        path: ["defaultOptions"],
      });
    } else if (materialId !== undefined && colourId !== undefined) {
      const pair = definition.optionSupport.materialColourPairs.find(
        (candidate) => candidate.materialId === materialId,
      );
      if (!pair?.colourIds.includes(colourId)) {
        context.addIssue({
          code: "custom",
          message: "Default material and colour pair must be supported",
          path: ["defaultOptions"],
        });
      }
    }
    const handleId = definition.defaultOptions.handleId;
    if (
      handleId !== undefined &&
      !definition.optionSupport.handleIds.includes(handleId)
    ) {
      context.addIssue({
        code: "custom",
        message: "Default handle must be supported",
        path: ["defaultOptions", "handleId"],
      });
    }
    const mechanismId = definition.defaultOptions.mechanismId;
    if (
      mechanismId !== undefined &&
      !definition.optionSupport.mechanismIds.includes(mechanismId)
    ) {
      context.addIssue({
        code: "custom",
        message: "Default mechanism must be supported",
        path: ["defaultOptions", "mechanismId"],
      });
    }
    if (
      definition.verticalBand === "top" &&
      definition.defaultOptions.handleId !== undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "Top-band push-to-open definitions cannot default a handle",
        path: ["defaultOptions", "handleId"],
      });
    }
  });
export type CabinetDefinition = z.infer<typeof CabinetDefinitionSchema>;

export function createCabinetDefinitionSchema(
  policyInput: LayoutPolicyExactness,
) {
  const policy = LayoutPolicyExactnessSchema.parse(policyInput);
  const profileIds = new Set(policy.obstacleRules.map((profile) => profile.id));
  const unitM = policy.manufacturingGrid.unitM;

  return CabinetDefinitionSchema.superRefine((definition, context) => {
    const dimensions = [
      definition.defaultWidthM,
      definition.heightM,
      definition.depthM,
    ];
    for (const rule of definition.supportedWidthRules) {
      if (rule.kind === "discrete") dimensions.push(...rule.widthsM);
      else dimensions.push(rule.minWidthM, rule.maxWidthM, rule.stepM);
    }

    if (
      dimensions.some(
        (dimension) => metresToGridUnits(dimension, unitM) === undefined,
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Cabinet dimensions must be exactly representable on the manufacturing grid",
        path: ["supportedWidthRules"],
      });
    }

    if (!profileIds.has(definition.placementRules.obstacleClearanceProfileId)) {
      context.addIssue({
        code: "custom",
        message: "Cabinet must reference a resolved obstacle clearance profile",
        path: ["placementRules", "obstacleClearanceProfileId"],
      });
    }
  });
}

export const VerticalBandSchema = z.enum(["base", "middle", "top", "column"]);
export type VerticalBand = z.infer<typeof VerticalBandSchema>;

export const RunAnchorSchema = z.enum(["flow", "start", "end"]);
export type RunAnchor = z.infer<typeof RunAnchorSchema>;

export const PlacementSchema = z.strictObject({
  id: stableIdentifierSchema,
  cabinetDefinitionId: stableIdentifierSchema,
  wallId: z.enum(["wall-a", "wall-b", "wall-c"]),
  verticalBand: VerticalBandSchema,
  runAnchor: RunAnchorSchema,
  order: nonNegativeIntegerSchema,
  widthM: positiveFiniteNumberSchema,
  options: CabinetOptionsSchema,
  junctionGroupId: stableIdentifierSchema.optional(),
});
export type Placement = z.infer<typeof PlacementSchema>;

export const KitchenConfigurationSchema = z
  .strictObject({
    schemaVersion: stableIdentifierSchema,
    room: RoomSchema,
    sourcePresetId: stableIdentifierSchema,
    placements: z.array(PlacementSchema),
    catalogVersion: stableIdentifierSchema,
    layoutPolicyVersion: stableIdentifierSchema,
    pricingVersion: stableIdentifierSchema,
    createdAt: ConfigurationTimestampSchema,
    updatedAt: ConfigurationTimestampSchema,
  })
  .superRefine((configuration, context) => {
    const placementIds = new Set<string>();
    const wallIds = new Set(configuration.room.walls.map((wall) => wall.id));
    const ordersByPartition = new Map<string, number[]>();
    const junctionGroups = new Map<
      string,
      {
        index: number;
        wallId: Placement["wallId"];
        runAnchor: RunAnchor;
      }[]
    >();

    for (const [index, placement] of configuration.placements.entries()) {
      if (placementIds.has(placement.id)) {
        context.addIssue({
          code: "custom",
          message: "Placement IDs must be unique",
          path: ["placements", index, "id"],
        });
      }
      placementIds.add(placement.id);

      if (placement.junctionGroupId !== undefined) {
        const members = junctionGroups.get(placement.junctionGroupId) ?? [];
        members.push({
          index,
          wallId: placement.wallId,
          runAnchor: placement.runAnchor,
        });
        junctionGroups.set(placement.junctionGroupId, members);
      }

      if (!wallIds.has(placement.wallId)) {
        context.addIssue({
          code: "custom",
          message: "Placement wallId must reference a wall in the room",
          path: ["placements", index, "wallId"],
        });
      }

      const groupKey = `${placement.wallId}:${placement.verticalBand}:${placement.runAnchor}`;
      const orders = ordersByPartition.get(groupKey) ?? [];
      orders.push(placement.order);
      ordersByPartition.set(groupKey, orders);
    }

    for (const orders of ordersByPartition.values()) {
      orders.sort((left, right) => left - right);
      for (const [index, order] of orders.entries()) {
        if (order !== index) {
          context.addIssue({
            code: "custom",
            message:
              "Placement orders must be unique and contiguous within each wall, verticalBand, and runAnchor",
            path: ["placements"],
          });
          break;
        }
      }
    }
    for (const members of junctionGroups.values()) {
      if (members.length !== 2) {
        context.addIssue({
          code: "custom",
          message: "A junction group must link exactly two placements",
          path: ["placements", members[0]?.index ?? 0, "junctionGroupId"],
        });
      } else if (members[0]?.wallId === members[1]?.wallId) {
        context.addIssue({
          code: "custom",
          message: "Junction-group placements must be on distinct walls",
          path: ["placements", members[1]?.index ?? 0, "junctionGroupId"],
        });
      } else {
        const byWall = new Map(
          members.map((member) => [member.wallId, member]),
        );
        const wallA = byWall.get("wall-a");
        const wallB = byWall.get("wall-b");
        const wallC = byWall.get("wall-c");
        const isFirstCanonicalCorner =
          configuration.room.shape !== "linear" &&
          wallA?.runAnchor === "start" &&
          wallB?.runAnchor === "end" &&
          wallC === undefined;
        const isSecondCanonicalCorner =
          configuration.room.shape === "u_shape" &&
          wallA?.runAnchor === "end" &&
          wallB === undefined &&
          wallC?.runAnchor === "start";
        if (!isFirstCanonicalCorner && !isSecondCanonicalCorner) {
          context.addIssue({
            code: "custom",
            message:
              "Junction-group placements must use a canonical adjacent wall/terminal pair",
            path: ["placements", members[0]?.index ?? 0, "junctionGroupId"],
          });
        }
      }
    }
  });
export type KitchenConfiguration = z.infer<typeof KitchenConfigurationSchema>;

export interface ConfigurationValidationContext {
  supportedSchemaVersions: readonly string[];
  catalogVersion: string;
  pricingVersion: string;
  presetIds: readonly string[];
  layoutPolicy: LayoutPolicyExactness;
  cabinetDefinitions: readonly CabinetDefinition[];
  optionIds: {
    material: readonly string[];
    colour: readonly string[];
    handle: readonly string[];
    mechanism: readonly string[];
  };
}

export function createKitchenConfigurationSchema(
  validationContext: ConfigurationValidationContext,
) {
  const policy = LayoutPolicyExactnessSchema.parse(
    validationContext.layoutPolicy,
  );
  if (
    [1.5, 2.2, 2.6].some(
      (boundaryM) =>
        metresToGridUnits(boundaryM, policy.manufacturingGrid.unitM) ===
        undefined,
    )
  ) {
    throw new Error(
      "Canonical vertical-band boundaries must be exactly representable on the manufacturing grid",
    );
  }
  const definitionSchema = createCabinetDefinitionSchema(policy);
  const definitions = new Map(
    validationContext.cabinetDefinitions.map((definition) => {
      const parsed = definitionSchema.parse(definition);
      return [parsed.id, parsed] as const;
    }),
  );
  if (definitions.size !== validationContext.cabinetDefinitions.length) {
    throw new Error(
      "Resolved catalog contains duplicate cabinet definition IDs",
    );
  }
  const optionIds = {
    material: new Set(validationContext.optionIds.material),
    colour: new Set(validationContext.optionIds.colour),
    handle: new Set(validationContext.optionIds.handle),
    mechanism: new Set(validationContext.optionIds.mechanism),
  };
  for (const definition of definitions.values()) {
    for (const pair of definition.optionSupport.materialColourPairs) {
      if (!optionIds.material.has(pair.materialId)) {
        throw new Error(
          `Unknown material ID in cabinet option support: ${pair.materialId}`,
        );
      }
      for (const colourId of pair.colourIds) {
        if (!optionIds.colour.has(colourId)) {
          throw new Error(
            `Unknown colour ID in cabinet option support: ${colourId}`,
          );
        }
      }
    }
    for (const handleId of definition.optionSupport.handleIds) {
      if (!optionIds.handle.has(handleId)) {
        throw new Error(
          `Unknown handle ID in cabinet option support: ${handleId}`,
        );
      }
    }
    for (const mechanismId of definition.optionSupport.mechanismIds) {
      if (!optionIds.mechanism.has(mechanismId)) {
        throw new Error(
          `Unknown mechanism ID in cabinet option support: ${mechanismId}`,
        );
      }
    }
  }
  const roomSchema = createRoomSchema(policy);

  return KitchenConfigurationSchema.superRefine((configuration, context) => {
    if (
      !validationContext.supportedSchemaVersions.includes(
        configuration.schemaVersion,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Unsupported configuration schema version",
        path: ["schemaVersion"],
      });
    }
    if (configuration.catalogVersion !== validationContext.catalogVersion) {
      context.addIssue({
        code: "custom",
        message: "Catalog version does not match the resolved catalog",
        path: ["catalogVersion"],
      });
    }
    if (configuration.layoutPolicyVersion !== policy.version) {
      context.addIssue({
        code: "custom",
        message: "Layout policy version does not match the resolved policy",
        path: ["layoutPolicyVersion"],
      });
    }
    if (configuration.pricingVersion !== validationContext.pricingVersion) {
      context.addIssue({
        code: "custom",
        message: "Pricing version does not match the resolved pricing data",
        path: ["pricingVersion"],
      });
    }
    if (!validationContext.presetIds.includes(configuration.sourcePresetId)) {
      context.addIssue({
        code: "custom",
        message: "Source preset does not exist in the resolved catalog",
        path: ["sourcePresetId"],
      });
    }

    const roomResult = roomSchema.safeParse(configuration.room);
    if (!roomResult.success) {
      for (const issue of roomResult.error.issues) {
        context.addIssue({
          code: "custom",
          message: issue.message,
          path: ["room", ...issue.path],
        });
      }
    }

    for (const [index, placement] of configuration.placements.entries()) {
      const definition = definitions.get(placement.cabinetDefinitionId);
      if (definition === undefined) {
        context.addIssue({
          code: "custom",
          message: "Unknown cabinet definition",
          path: ["placements", index, "cabinetDefinitionId"],
        });
        continue;
      }
      if (placement.verticalBand !== definition.verticalBand) {
        context.addIssue({
          code: "custom",
          message: "Placement verticalBand must match its definition",
          path: ["placements", index, "verticalBand"],
        });
      }
      const hasMarginRule =
        definition.placementRules.runMargin !== "unrestricted";
      if (
        (!hasMarginRule && placement.runAnchor !== "flow") ||
        (hasMarginRule && placement.runAnchor === "flow")
      ) {
        context.addIssue({
          code: "custom",
          message: "Placement runAnchor is incompatible with its definition",
          path: ["placements", index, "runAnchor"],
        });
      }
      if (
        definition.verticalBand === "column" &&
        placement.runAnchor === "flow"
      ) {
        context.addIssue({
          code: "custom",
          message: "Column placements must use a start or end runAnchor",
          path: ["placements", index, "runAnchor"],
        });
      }
      if (
        metresToGridUnits(placement.widthM, policy.manufacturingGrid.unitM) ===
        undefined
      ) {
        context.addIssue({
          code: "custom",
          message: "Placement width is off the manufacturing grid",
          path: ["placements", index, "widthM"],
        });
      }
      if (
        !definition.supportedWidthRules.some((rule) =>
          supportsWidth(placement.widthM, rule),
        )
      ) {
        context.addIssue({
          code: "custom",
          message: "Placement width is unsupported",
          path: ["placements", index, "widthM"],
        });
      }
      if (
        definition.placementRules.corner === "junction_only" &&
        placement.junctionGroupId === undefined
      ) {
        context.addIssue({
          code: "custom",
          message: "Junction-only definitions require a junctionGroupId",
          path: ["placements", index, "junctionGroupId"],
        });
      }
      if (
        definition.placementRules.corner !== "junction_only" &&
        placement.junctionGroupId !== undefined
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Only junction-only definitions may reference a junctionGroupId",
          path: ["placements", index, "junctionGroupId"],
        });
      }

      const materialId = placement.options.materialId;
      const colourId = placement.options.colourId;
      if ((materialId === undefined) !== (colourId === undefined)) {
        context.addIssue({
          code: "custom",
          message: "Material and colour selections must be provided together",
          path: ["placements", index, "options"],
        });
      } else if (materialId !== undefined && colourId !== undefined) {
        const pair = definition.optionSupport.materialColourPairs.find(
          (candidate) => candidate.materialId === materialId,
        );
        if (!pair?.colourIds.includes(colourId)) {
          context.addIssue({
            code: "custom",
            message:
              "Material and colour pair is unsupported by the cabinet definition",
            path: ["placements", index, "options"],
          });
        }
      }

      const handleId = placement.options.handleId;
      if (
        handleId !== undefined &&
        !definition.optionSupport.handleIds.includes(handleId)
      ) {
        context.addIssue({
          code: "custom",
          message: "Handle is unsupported by the cabinet definition",
          path: ["placements", index, "options", "handleId"],
        });
      }
      const mechanismId = placement.options.mechanismId;
      if (
        mechanismId !== undefined &&
        !definition.optionSupport.mechanismIds.includes(mechanismId)
      ) {
        context.addIssue({
          code: "custom",
          message: "Mechanism is unsupported by the cabinet definition",
          path: ["placements", index, "options", "mechanismId"],
        });
      }
      if (
        placement.verticalBand === "top" &&
        placement.options.handleId !== undefined
      ) {
        context.addIssue({
          code: "custom",
          message: "Top-band push-to-open placements cannot select a handle",
          path: ["placements", index, "options", "handleId"],
        });
      }
    }
  });
}

export const ContactDataSchema = z.strictObject({
  name: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  email: z.email().optional(),
});
export type ContactData = z.infer<typeof ContactDataSchema>;

const WidthAmountSchema = z.strictObject({
  widthM: positiveFiniteNumberSchema,
  amountMinor: minorUnitSchema.nonnegative(),
});

const CabinetPriceRuleSchema = z.strictObject({
  id: stableIdentifierSchema,
  labelKey: stableIdentifierSchema,
  amountsByWidth: z.array(WidthAmountSchema).min(1),
});
const MaterialColourPriceRuleSchema = z.strictObject({
  id: stableIdentifierSchema,
  labelKey: stableIdentifierSchema,
  materialId: stableIdentifierSchema,
  colourId: stableIdentifierSchema,
  amountsByWidth: z.array(WidthAmountSchema).min(1),
});
const FixedHandlePriceRuleSchema = z.strictObject({
  id: stableIdentifierSchema,
  labelKey: stableIdentifierSchema,
  handleId: stableIdentifierSchema,
  amountMinor: minorUnitSchema.nonnegative(),
});
const FixedMechanismPriceRuleSchema = z.strictObject({
  id: stableIdentifierSchema,
  labelKey: stableIdentifierSchema,
  mechanismId: stableIdentifierSchema,
  amountMinor: minorUnitSchema.nonnegative(),
});
const ProjectPriceRuleSchema = z.discriminatedUnion("component", [
  z.strictObject({
    id: stableIdentifierSchema,
    labelKey: stableIdentifierSchema,
    component: z.literal("charge"),
    amountMinor: minorUnitSchema.nonnegative(),
  }),
  z.strictObject({
    id: stableIdentifierSchema,
    labelKey: stableIdentifierSchema,
    component: z.literal("discount"),
    amountMinor: minorUnitSchema.nonpositive(),
  }),
]);

export const MdlPriceBookSchema = z
  .strictObject({
    version: stableIdentifierSchema,
    currency: z.literal("MDL"),
    status: z.enum(["estimate", "commercial"]),
    cabinetRules: z.array(CabinetPriceRuleSchema),
    materialColourRules: z.array(MaterialColourPriceRuleSchema),
    handleRules: z.array(FixedHandlePriceRuleSchema),
    mechanismRules: z.array(FixedMechanismPriceRuleSchema),
    projectRules: z.array(ProjectPriceRuleSchema),
  })
  .superRefine((book, context) => {
    const ruleIds = new Set<string>();
    const registerRule = (id: string, path: (string | number)[]) => {
      if (ruleIds.has(id)) {
        context.addIssue({
          code: "custom",
          message: "Pricing rule IDs must be globally unique",
          path,
        });
      }
      ruleIds.add(id);
    };
    const validateWidths = (
      rows: readonly { widthM: number }[],
      path: (string | number)[],
    ) => {
      const widths = new Set<number>();
      for (const [index, row] of rows.entries()) {
        if (widths.has(row.widthM)) {
          context.addIssue({
            code: "custom",
            message: "Pricing width selectors must be unique within a rule",
            path: [...path, index, "widthM"],
          });
        }
        widths.add(row.widthM);
      }
    };
    for (const [index, rule] of book.cabinetRules.entries()) {
      registerRule(rule.id, ["cabinetRules", index, "id"]);
      validateWidths(rule.amountsByWidth, [
        "cabinetRules",
        index,
        "amountsByWidth",
      ]);
    }
    const materialColourSelectors = new Set<string>();
    for (const [index, rule] of book.materialColourRules.entries()) {
      registerRule(rule.id, ["materialColourRules", index, "id"]);
      const selector = JSON.stringify([rule.materialId, rule.colourId]);
      if (materialColourSelectors.has(selector)) {
        context.addIssue({
          code: "custom",
          message: "Material/colour pricing selectors must be unique",
          path: ["materialColourRules", index],
        });
      }
      materialColourSelectors.add(selector);
      validateWidths(rule.amountsByWidth, [
        "materialColourRules",
        index,
        "amountsByWidth",
      ]);
    }
    for (const [key, rules] of [
      ["handleRules", book.handleRules],
      ["mechanismRules", book.mechanismRules],
    ] as const) {
      const selectors = new Set<string>();
      for (const [index, rule] of rules.entries()) {
        registerRule(rule.id, [key, index, "id"]);
        const selector = "handleId" in rule ? rule.handleId : rule.mechanismId;
        if (selectors.has(selector)) {
          context.addIssue({
            code: "custom",
            message: "Fixed option pricing selectors must be unique",
            path: [key, index],
          });
        }
        selectors.add(selector);
      }
    }
    for (const [index, rule] of book.projectRules.entries()) {
      registerRule(rule.id, ["projectRules", index, "id"]);
    }
  });
export type MdlPriceBook = z.infer<typeof MdlPriceBookSchema>;

const pricingLineFields = {
  lineId: stableIdentifierSchema,
  ruleId: stableIdentifierSchema,
  labelKey: stableIdentifierSchema,
  quantity: z.literal(1),
  unitAmountMinor: minorUnitSchema,
  amountMinor: minorUnitSchema,
};

export const PricingLineSchema = z
  .discriminatedUnion("component", [
    z.strictObject({
      ...pricingLineFields,
      kind: z.literal("cabinet"),
      component: z.literal("cabinet"),
      placementId: stableIdentifierSchema,
      cabinetDefinitionId: stableIdentifierSchema,
      widthM: positiveFiniteNumberSchema,
      unitAmountMinor: minorUnitSchema.nonnegative(),
      amountMinor: minorUnitSchema.nonnegative(),
    }),
    z.strictObject({
      ...pricingLineFields,
      kind: z.literal("option"),
      component: z.literal("material_colour"),
      placementId: stableIdentifierSchema,
      materialId: stableIdentifierSchema,
      colourId: stableIdentifierSchema,
      widthM: positiveFiniteNumberSchema,
      unitAmountMinor: minorUnitSchema.nonnegative(),
      amountMinor: minorUnitSchema.nonnegative(),
    }),
    z.strictObject({
      ...pricingLineFields,
      kind: z.literal("option"),
      component: z.literal("handle"),
      placementId: stableIdentifierSchema,
      handleId: stableIdentifierSchema,
      unitAmountMinor: minorUnitSchema.nonnegative(),
      amountMinor: minorUnitSchema.nonnegative(),
    }),
    z.strictObject({
      ...pricingLineFields,
      kind: z.literal("option"),
      component: z.literal("mechanism"),
      placementId: stableIdentifierSchema,
      mechanismId: stableIdentifierSchema,
      unitAmountMinor: minorUnitSchema.nonnegative(),
      amountMinor: minorUnitSchema.nonnegative(),
    }),
    z.strictObject({
      ...pricingLineFields,
      kind: z.literal("project"),
      component: z.literal("charge"),
      unitAmountMinor: minorUnitSchema.nonnegative(),
      amountMinor: minorUnitSchema.nonnegative(),
    }),
    z.strictObject({
      ...pricingLineFields,
      kind: z.literal("project"),
      component: z.literal("discount"),
      unitAmountMinor: minorUnitSchema.nonpositive(),
      amountMinor: minorUnitSchema.nonpositive(),
    }),
  ])
  .superRefine((line, context) => {
    const expectedLineId =
      line.kind === "project"
        ? `project:${line.ruleId}`
        : `placement:${line.placementId}:${
            line.component === "material_colour"
              ? "material-colour"
              : line.component
          }`;
    if (line.lineId !== expectedLineId) {
      context.addIssue({
        code: "custom",
        message: "Pricing line ID must match its derived source identity",
        path: ["lineId"],
      });
    }
    if (line.unitAmountMinor !== line.amountMinor) {
      context.addIssue({
        code: "custom",
        message: "M0 pricing lines require equal unit and total amounts",
        path: ["amountMinor"],
      });
    }
  });
export type PricingLine = z.infer<typeof PricingLineSchema>;

export const PricingResultSchema = z
  .strictObject({
    lines: z.array(PricingLineSchema),
    totalMinor: minorUnitSchema.nonnegative(),
    currency: z.literal("MDL"),
    pricingVersion: stableIdentifierSchema,
    status: z.enum(["estimate", "commercial"]),
  })
  .superRefine((result, context) => {
    const lineIds = new Set<string>();
    let expectedTotalMinor = 0n;
    const placementComponentOrder = {
      cabinet: 0,
      material_colour: 1,
      handle: 2,
      mechanism: 3,
    } as const;
    const closedPlacementIds = new Set<string>();
    let activePlacementId: string | undefined;
    let previousPlacementComponent = -1;
    let projectLinesStarted = false;
    let discountLinesStarted = false;
    let previousProjectRuleId: string | undefined;

    for (const [index, line] of result.lines.entries()) {
      if (lineIds.has(line.lineId)) {
        context.addIssue({
          code: "custom",
          message: "Pricing line IDs must be unique",
          path: ["lines", index, "lineId"],
        });
      }
      lineIds.add(line.lineId);
      expectedTotalMinor += BigInt(line.amountMinor);

      if (line.kind === "project") {
        if (activePlacementId !== undefined) {
          closedPlacementIds.add(activePlacementId);
          activePlacementId = undefined;
        }
        projectLinesStarted = true;
        if (line.component === "discount") {
          if (!discountLinesStarted) previousProjectRuleId = undefined;
          discountLinesStarted = true;
        } else if (discountLinesStarted) {
          context.addIssue({
            code: "custom",
            message: "Project charges must precede project discounts",
            path: ["lines", index],
          });
        }
        if (
          previousProjectRuleId !== undefined &&
          line.ruleId < previousProjectRuleId
        ) {
          context.addIssue({
            code: "custom",
            message: "Project rules must use code-unit rule-ID order",
            path: ["lines", index, "ruleId"],
          });
        }
        previousProjectRuleId = line.ruleId;
        continue;
      }

      if (projectLinesStarted) {
        context.addIssue({
          code: "custom",
          message: "Placement pricing lines must precede project lines",
          path: ["lines", index],
        });
      }
      if (line.placementId !== activePlacementId) {
        if (activePlacementId !== undefined) {
          closedPlacementIds.add(activePlacementId);
        }
        if (closedPlacementIds.has(line.placementId)) {
          context.addIssue({
            code: "custom",
            message: "Each placement's pricing lines must form one block",
            path: ["lines", index, "placementId"],
          });
        }
        activePlacementId = line.placementId;
        previousPlacementComponent = -1;
        if (line.component !== "cabinet") {
          context.addIssue({
            code: "custom",
            message: "Each placement pricing block must start with cabinet",
            path: ["lines", index, "component"],
          });
        }
      }
      const componentIndex = placementComponentOrder[line.component];
      if (componentIndex <= previousPlacementComponent) {
        context.addIssue({
          code: "custom",
          message:
            "Placement components must be unique and canonically ordered",
          path: ["lines", index, "component"],
        });
      }
      previousPlacementComponent = componentIndex;
    }

    if (BigInt(result.totalMinor) !== expectedTotalMinor) {
      context.addIssue({
        code: "custom",
        message: "totalMinor must equal the sum of line amountMinor values",
        path: ["totalMinor"],
      });
    }
  });
export type PricingResult = z.infer<typeof PricingResultSchema>;

const MissingPriceLookupSchema = z.discriminatedUnion("component", [
  z.strictObject({
    component: z.literal("cabinet"),
    pricingRuleId: stableIdentifierSchema,
    widthM: positiveFiniteNumberSchema,
  }),
  z.strictObject({
    component: z.literal("material_colour"),
    materialId: stableIdentifierSchema,
    colourId: stableIdentifierSchema,
    widthM: positiveFiniteNumberSchema,
  }),
  z.strictObject({
    component: z.literal("handle"),
    handleId: stableIdentifierSchema,
  }),
  z.strictObject({
    component: z.literal("mechanism"),
    mechanismId: stableIdentifierSchema,
  }),
]);

export const PricingErrorSchema = z.discriminatedUnion("code", [
  z.strictObject({ code: z.literal("INVALID_CONTEXT") }),
  z.strictObject({ code: z.literal("INVALID_PRICE_BOOK") }),
  z.strictObject({ code: z.literal("INVALID_CONFIGURATION") }),
  z.strictObject({ code: z.literal("PRICING_VERSION_MISMATCH") }),
  z.strictObject({
    code: z.literal("LAYOUT_REJECTED"),
    cause: z.enum([
      "INVALID_CONTEXT",
      "INVALID_CONFIGURATION",
      "INVALID_CORNER_RESERVATION",
      "MISSING_CORNER_RESERVATION",
      "ANCHOR_RULE_CONFLICT",
      "VERTICAL_OVERFLOW",
      "PLACEMENT_BLOCKED",
      "PLACEMENT_OVERLAP",
      "NO_FIT",
      "ROOM_SPACE_COLLISION",
    ]),
  }),
  z.strictObject({
    code: z.literal("MISSING_PRICE_RULE"),
    placementId: stableIdentifierSchema,
    lookup: MissingPriceLookupSchema,
  }),
  z.strictObject({ code: z.literal("ARITHMETIC_OVERFLOW") }),
  z.strictObject({ code: z.literal("NEGATIVE_TOTAL") }),
]);
export type PricingError = z.infer<typeof PricingErrorSchema>;

export const PricingQueryResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), pricing: PricingResultSchema }),
  z.strictObject({ ok: z.literal(false), error: PricingErrorSchema }),
]);
export type PricingQueryResult = z.infer<typeof PricingQueryResultSchema>;

export function createPricingResultSchema(configuration: KitchenConfiguration) {
  const placements = new Map(
    configuration.placements.map((placement) => [placement.id, placement]),
  );
  return PricingResultSchema.superRefine((result, context) => {
    if (result.pricingVersion !== configuration.pricingVersion) {
      context.addIssue({
        code: "custom",
        message: "Pricing result version must match the configuration",
        path: ["pricingVersion"],
      });
    }
    const pricedCabinetIds = new Set<string>();
    for (const [index, line] of result.lines.entries()) {
      if (line.kind === "project") continue;
      const placement = placements.get(line.placementId);
      if (placement === undefined) {
        context.addIssue({
          code: "custom",
          message: "Pricing line placementId must exist in the configuration",
          path: ["lines", index, "placementId"],
        });
        continue;
      }
      if (line.component === "cabinet") {
        pricedCabinetIds.add(line.placementId);
        if (line.cabinetDefinitionId !== placement.cabinetDefinitionId) {
          context.addIssue({
            code: "custom",
            message:
              "Cabinet pricing source must match the placement definition",
            path: ["lines", index, "cabinetDefinitionId"],
          });
        }
      }
      if (
        (line.component === "cabinet" ||
          line.component === "material_colour") &&
        line.widthM !== placement.widthM
      ) {
        context.addIssue({
          code: "custom",
          message: "Width-based pricing source must match the placement width",
          path: ["lines", index, "widthM"],
        });
      }
      if (line.component === "material_colour") {
        if (
          placement.options.materialId !== undefined &&
          line.materialId !== placement.options.materialId
        ) {
          context.addIssue({
            code: "custom",
            message: "Material pricing source must match the explicit option",
            path: ["lines", index, "materialId"],
          });
        }
        if (
          placement.options.colourId !== undefined &&
          line.colourId !== placement.options.colourId
        ) {
          context.addIssue({
            code: "custom",
            message: "Colour pricing source must match the explicit option",
            path: ["lines", index, "colourId"],
          });
        }
      }
      if (
        line.component === "handle" &&
        placement.options.handleId !== undefined &&
        line.handleId !== placement.options.handleId
      ) {
        context.addIssue({
          code: "custom",
          message: "Handle pricing source must match the explicit option",
          path: ["lines", index, "handleId"],
        });
      }
      if (
        line.component === "mechanism" &&
        placement.options.mechanismId !== undefined &&
        line.mechanismId !== placement.options.mechanismId
      ) {
        context.addIssue({
          code: "custom",
          message: "Mechanism pricing source must match the explicit option",
          path: ["lines", index, "mechanismId"],
        });
      }
    }
    for (const placement of configuration.placements) {
      if (!pricedCabinetIds.has(placement.id)) {
        context.addIssue({
          code: "custom",
          message: "Every placement must have one cabinet pricing line",
          path: ["lines"],
        });
      }
    }
  });
}

/** Transport structure only; use verifyPricingSnapshot for authoritative pricing ingress. */
export const ContactSubmissionSchema = z
  .strictObject({
    idempotencyKey: stableIdentifierSchema,
    contact: ContactDataSchema,
    configurationSnapshot: KitchenConfigurationSchema,
    pricing: PricingResultSchema,
  })
  .superRefine((submission, context) => {
    const pricingResult = createPricingResultSchema(
      submission.configurationSnapshot,
    ).safeParse(submission.pricing);
    if (!pricingResult.success) {
      for (const issue of pricingResult.error.issues) {
        context.addIssue({
          code: "custom",
          message: issue.message,
          path: ["pricing", ...issue.path],
        });
      }
    }
  });
export type ContactSubmission = z.infer<typeof ContactSubmissionSchema>;

export function createContactSubmissionSchema(
  validationContext: ConfigurationValidationContext,
) {
  const configurationSchema =
    createKitchenConfigurationSchema(validationContext);
  return ContactSubmissionSchema.superRefine((submission, context) => {
    const configurationResult = configurationSchema.safeParse(
      submission.configurationSnapshot,
    );
    if (!configurationResult.success) {
      for (const issue of configurationResult.error.issues) {
        context.addIssue({
          code: "custom",
          message: issue.message,
          path: ["configurationSnapshot", ...issue.path],
        });
      }
    }
  });
}
