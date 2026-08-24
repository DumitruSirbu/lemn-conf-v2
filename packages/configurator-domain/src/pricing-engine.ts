import {
  type ExplicitCornerReservation,
  derivePlacementLayout,
} from "./placement-layout.js";
import {
  type ConfigurationValidationContext,
  type MdlPriceBook,
  type PricingError,
  type PricingLine,
  type PricingQueryResult,
  type PricingResult,
  KitchenConfigurationSchema,
  MdlPriceBookSchema,
  PricingResultSchema,
  createKitchenConfigurationSchema,
  metresToGridUnits,
} from "./schemas.js";

export interface PriceConfigurationInput {
  configuration: unknown;
  validationContext: ConfigurationValidationContext;
  cornerReservations: readonly ExplicitCornerReservation[];
  priceBook: MdlPriceBook;
}

export interface VerifyPricingSnapshotInput extends PriceConfigurationInput {
  pricingSnapshot: unknown;
}

export type PricingSnapshotVerificationResult =
  | { ok: true; pricing: PricingResult }
  | {
      ok: false;
      error:
        | PricingError
        | { code: "INVALID_PRICING_SNAPSHOT" }
        | { code: "PRICING_SNAPSHOT_MISMATCH" };
    };

type WidthAmounts = readonly { widthM: number; amountMinor: number }[];

function failure(error: PricingError): PricingQueryResult {
  return { ok: false, error };
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function structurallyEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => structurallyEqual(value, right[index]))
    );
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort(compareCodeUnits);
  const rightKeys = Object.keys(rightRecord).sort(compareCodeUnits);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] &&
        structurallyEqual(leftRecord[key], rightRecord[key]),
    )
  );
}

function validIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" && value.length > 0 && value === value.trim()
  );
}

function isDenseArray(
  value: unknown,
  predicate: (item: unknown) => boolean,
): value is unknown[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index) || !predicate(value[index])) return false;
  }
  return true;
}

function isRecord(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isResolvedContext(
  value: unknown,
): value is ConfigurationValidationContext {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const context = value as Record<string, unknown>;
  const optionIdsValue = context["optionIds"];
  if (
    typeof optionIdsValue !== "object" ||
    optionIdsValue === null ||
    Array.isArray(optionIdsValue)
  ) {
    return false;
  }
  const optionIds = optionIdsValue as Record<string, unknown>;
  return (
    isDenseArray(context["supportedSchemaVersions"], validIdentifier) &&
    validIdentifier(context["catalogVersion"]) &&
    validIdentifier(context["pricingVersion"]) &&
    isDenseArray(context["presetIds"], validIdentifier) &&
    isDenseArray(context["cabinetDefinitions"], isRecord) &&
    isDenseArray(optionIds["material"], validIdentifier) &&
    isDenseArray(optionIds["colour"], validIdentifier) &&
    isDenseArray(optionIds["handle"], validIdentifier) &&
    isDenseArray(optionIds["mechanism"], validIdentifier)
  );
}

function hasGridExactWidths(book: MdlPriceBook, unitM: number): boolean {
  return [...book.cabinetRules, ...book.materialColourRules].every((rule) =>
    rule.amountsByWidth.every(
      ({ widthM }) => metresToGridUnits(widthM, unitM) !== undefined,
    ),
  );
}

function widthAmount(
  amounts: WidthAmounts,
  widthUnits: bigint,
  unitM: number,
): number | undefined {
  return amounts.find(
    ({ widthM }) => metresToGridUnits(widthM, unitM) === widthUnits,
  )?.amountMinor;
}

function placementLine(line: PricingLine, lines: PricingLine[]): void {
  lines.push(line);
}

export function priceConfiguration(
  input: PriceConfigurationInput,
): PricingQueryResult;
export function priceConfiguration(input: unknown): PricingQueryResult {
  const runtimeInput = input;
  const envelope =
    typeof runtimeInput === "object" &&
    runtimeInput !== null &&
    !Array.isArray(runtimeInput)
      ? (runtimeInput as Record<string, unknown>)
      : undefined;
  const validationContext = envelope?.["validationContext"];
  let contextualSchema: ReturnType<typeof createKitchenConfigurationSchema>;
  if (!isResolvedContext(validationContext)) {
    return failure({ code: "INVALID_CONTEXT" });
  }
  try {
    contextualSchema = createKitchenConfigurationSchema(validationContext);
  } catch {
    return failure({ code: "INVALID_CONTEXT" });
  }

  const parsedBook = MdlPriceBookSchema.safeParse(envelope?.["priceBook"]);
  if (
    !parsedBook.success ||
    !hasGridExactWidths(
      parsedBook.data,
      validationContext.layoutPolicy.manufacturingGrid.unitM,
    )
  ) {
    return failure({ code: "INVALID_PRICE_BOOK" });
  }
  const priceBook = parsedBook.data;

  const structuralConfiguration = KitchenConfigurationSchema.safeParse(
    envelope?.["configuration"],
  );
  if (!structuralConfiguration.success) {
    return failure({ code: "INVALID_CONFIGURATION" });
  }
  const configuration = structuralConfiguration.data;
  if (
    configuration.pricingVersion !== validationContext.pricingVersion ||
    configuration.pricingVersion !== priceBook.version
  ) {
    return failure({ code: "PRICING_VERSION_MISMATCH" });
  }
  if (
    configuration.catalogVersion !== validationContext.catalogVersion ||
    configuration.layoutPolicyVersion !== validationContext.layoutPolicy.version
  ) {
    return failure({ code: "INVALID_CONFIGURATION" });
  }
  const contextualConfiguration = contextualSchema.safeParse(configuration);
  if (!contextualConfiguration.success) {
    return failure({ code: "INVALID_CONFIGURATION" });
  }
  const validatedConfiguration = contextualConfiguration.data;

  const cornerReservations = envelope?.["cornerReservations"];
  if (!Array.isArray(cornerReservations)) {
    return failure({
      code: "LAYOUT_REJECTED",
      cause: "INVALID_CORNER_RESERVATION",
    });
  }
  const layout = derivePlacementLayout({
    configuration: validatedConfiguration,
    validationContext,
    cornerReservations:
      cornerReservations as unknown as readonly ExplicitCornerReservation[],
  });
  if (!layout.ok) {
    return failure({
      code: "LAYOUT_REJECTED",
      cause: layout.error.code,
    });
  }

  const unitM = validationContext.layoutPolicy.manufacturingGrid.unitM;
  const definitions = new Map(
    validationContext.cabinetDefinitions.map((definition) => [
      definition.id,
      definition,
    ]),
  );
  const placements = new Map(
    validatedConfiguration.placements.map((placement) => [
      placement.id,
      placement,
    ]),
  );
  const cabinetRules = new Map(
    priceBook.cabinetRules.map((rule) => [rule.id, rule]),
  );
  const materialRules = new Map(
    priceBook.materialColourRules.map((rule) => [
      JSON.stringify([rule.materialId, rule.colourId]),
      rule,
    ]),
  );
  const handleRules = new Map(
    priceBook.handleRules.map((rule) => [rule.handleId, rule]),
  );
  const mechanismRules = new Map(
    priceBook.mechanismRules.map((rule) => [rule.mechanismId, rule]),
  );
  const lines: PricingLine[] = [];

  for (const occupancy of layout.occupancies) {
    const placement = placements.get(occupancy.placementId);
    const definition =
      placement === undefined
        ? undefined
        : definitions.get(placement.cabinetDefinitionId);
    if (placement === undefined || definition === undefined) {
      return failure({ code: "INVALID_CONFIGURATION" });
    }
    const widthUnits = metresToGridUnits(placement.widthM, unitM);
    const cabinetRule = cabinetRules.get(definition.pricingRuleId);
    const cabinetAmount =
      cabinetRule === undefined || widthUnits === undefined
        ? undefined
        : widthAmount(cabinetRule.amountsByWidth, widthUnits, unitM);
    if (cabinetRule === undefined || cabinetAmount === undefined) {
      return failure({
        code: "MISSING_PRICE_RULE",
        placementId: placement.id,
        lookup: {
          component: "cabinet",
          pricingRuleId: definition.pricingRuleId,
          widthM: placement.widthM,
        },
      });
    }
    placementLine(
      {
        lineId: `placement:${placement.id}:cabinet`,
        kind: "cabinet",
        component: "cabinet",
        placementId: placement.id,
        cabinetDefinitionId: definition.id,
        widthM: placement.widthM,
        ruleId: cabinetRule.id,
        labelKey: cabinetRule.labelKey,
        quantity: 1,
        unitAmountMinor: cabinetAmount,
        amountMinor: cabinetAmount,
      },
      lines,
    );

    const materialId =
      placement.options.materialId ?? definition.defaultOptions.materialId;
    const colourId =
      placement.options.colourId ?? definition.defaultOptions.colourId;
    if (materialId !== undefined && colourId !== undefined) {
      const rule = materialRules.get(JSON.stringify([materialId, colourId]));
      const amount =
        rule === undefined || widthUnits === undefined
          ? undefined
          : widthAmount(rule.amountsByWidth, widthUnits, unitM);
      if (rule === undefined || amount === undefined) {
        return failure({
          code: "MISSING_PRICE_RULE",
          placementId: placement.id,
          lookup: {
            component: "material_colour",
            materialId,
            colourId,
            widthM: placement.widthM,
          },
        });
      }
      placementLine(
        {
          lineId: `placement:${placement.id}:material-colour`,
          kind: "option",
          component: "material_colour",
          placementId: placement.id,
          materialId,
          colourId,
          widthM: placement.widthM,
          ruleId: rule.id,
          labelKey: rule.labelKey,
          quantity: 1,
          unitAmountMinor: amount,
          amountMinor: amount,
        },
        lines,
      );
    }

    const fixedOptions = [
      {
        component: "handle" as const,
        id: placement.options.handleId ?? definition.defaultOptions.handleId,
        rules: handleRules,
      },
      {
        component: "mechanism" as const,
        id:
          placement.options.mechanismId ??
          definition.defaultOptions.mechanismId,
        rules: mechanismRules,
      },
    ];
    for (const option of fixedOptions) {
      if (option.id === undefined) continue;
      const rule = option.rules.get(option.id);
      if (rule === undefined) {
        return failure({
          code: "MISSING_PRICE_RULE",
          placementId: placement.id,
          lookup:
            option.component === "handle"
              ? { component: "handle", handleId: option.id }
              : { component: "mechanism", mechanismId: option.id },
        });
      }
      const common = {
        lineId: `placement:${placement.id}:${option.component}`,
        kind: "option" as const,
        placementId: placement.id,
        ruleId: rule.id,
        labelKey: rule.labelKey,
        quantity: 1 as const,
        unitAmountMinor: rule.amountMinor,
        amountMinor: rule.amountMinor,
      };
      placementLine(
        option.component === "handle"
          ? {
              ...common,
              component: "handle",
              handleId: option.id,
            }
          : {
              ...common,
              component: "mechanism",
              mechanismId: option.id,
            },
        lines,
      );
    }
  }

  const projectRules = [...priceBook.projectRules].sort((left, right) => {
    if (left.component !== right.component) {
      return left.component === "charge" ? -1 : 1;
    }
    return compareCodeUnits(left.id, right.id);
  });
  for (const rule of projectRules) {
    lines.push({
      lineId: `project:${rule.id}`,
      kind: "project",
      component: rule.component,
      ruleId: rule.id,
      labelKey: rule.labelKey,
      quantity: 1,
      unitAmountMinor: rule.amountMinor,
      amountMinor: rule.amountMinor,
    });
  }

  const total = lines.reduce((sum, line) => sum + BigInt(line.amountMinor), 0n);
  if (
    total < BigInt(Number.MIN_SAFE_INTEGER) ||
    total > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    return failure({ code: "ARITHMETIC_OVERFLOW" });
  }
  if (total < 0n) return failure({ code: "NEGATIVE_TOTAL" });
  return {
    ok: true,
    pricing: {
      lines,
      totalMinor: Number(total),
      currency: priceBook.currency,
      pricingVersion: priceBook.version,
      status: priceBook.status,
    },
  };
}

export function verifyPricingSnapshot({
  pricingSnapshot,
  ...pricingInput
}: VerifyPricingSnapshotInput): PricingSnapshotVerificationResult {
  const parsed = PricingResultSchema.safeParse(pricingSnapshot);
  if (!parsed.success) {
    return { ok: false, error: { code: "INVALID_PRICING_SNAPSHOT" } };
  }
  const recomputed = priceConfiguration(pricingInput);
  if (!recomputed.ok) return recomputed;
  if (!structurallyEqual(parsed.data, recomputed.pricing)) {
    return { ok: false, error: { code: "PRICING_SNAPSHOT_MISMATCH" } };
  }
  return { ok: true, pricing: recomputed.pricing };
}
