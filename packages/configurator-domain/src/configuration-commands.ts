import {
  type ExplicitCornerReservation,
  type PlacementLayoutErrorCode,
  derivePlacementLayout,
} from "./placement-layout.js";
import {
  type CabinetDefinition,
  type CabinetOptions,
  type ConfigurationValidationContext,
  type KitchenConfiguration,
  type Placement,
  type RunAnchor,
  CabinetOptionsSchema,
  ConfigurationTimestampSchema,
  createKitchenConfigurationSchema,
} from "./schemas.js";

interface CommandBase {
  configuration: KitchenConfiguration;
  validationContext: ConfigurationValidationContext;
  cornerReservations: readonly ExplicitCornerReservation[];
  occurredAt: string;
}

export interface ReorderCabinetInput extends CommandBase {
  placementId: string;
  targetOrder: number;
}
export interface ResizeCabinetInput extends CommandBase {
  placementId: string;
  targetWidthM: number;
}
export interface ReplaceCabinetInput extends CommandBase {
  placementId: string;
  targetCabinetDefinitionId: string;
}
export interface MoveCabinetToRunMarginInput extends CommandBase {
  placementId: string;
  targetRunAnchor: "start" | "end";
  targetOrder: number;
}
export interface SetCabinetOptionsInput extends CommandBase {
  placementId: string;
  options: CabinetOptions;
}

export interface OrderState {
  wallId: Placement["wallId"];
  verticalBand: Placement["verticalBand"];
  runAnchor: RunAnchor;
  order: number;
}
export interface OrderChange {
  placementId: string;
  before: OrderState;
  after: OrderState;
}

export type CommandEffect =
  | {
      type: "cabinet_reordered";
      placementId: string;
      orderChanges: readonly OrderChange[];
    }
  | {
      type: "cabinet_resized";
      placementId: string;
      fromWidthM: number;
      toWidthM: number;
    }
  | {
      type: "cabinet_replaced";
      placementId: string;
      fromDefinitionId: string;
      toDefinitionId: string;
      resolvedOptionsBefore: CabinetOptions;
      resolvedOptionsAfter: CabinetOptions;
    }
  | {
      type: "cabinet_run_margin_moved";
      placementId: string;
      fromRunAnchor: RunAnchor;
      toRunAnchor: "start" | "end";
      orderChanges: readonly OrderChange[];
    }
  | {
      type: "cabinet_options_set";
      placementId: string;
      explicitOptionsBefore: CabinetOptions;
      explicitOptionsAfter: CabinetOptions;
      resolvedOptionsBefore: CabinetOptions;
      resolvedOptionsAfter: CabinetOptions;
    };

export type CommandFailure =
  | { code: "INVALID_CONTEXT" }
  | { code: "INVALID_CONFIGURATION"; cause?: PlacementLayoutErrorCode }
  | { code: "PLACEMENT_NOT_FOUND"; placementId: string }
  | { code: "INVALID_OCCURRED_AT"; occurredAt: string }
  | { code: "NO_CHANGE"; placementId: string }
  | {
      code: "TARGET_ORDER_OUT_OF_RANGE";
      placementId: string;
      targetOrder: number;
    }
  | {
      code: "TARGET_ANCHOR_UNCHANGED";
      placementId: string;
      targetRunAnchor: "start" | "end";
    }
  | { code: "MARGIN_MOVE_NOT_ALLOWED"; placementId: string }
  | { code: "WIDTH_UNSUPPORTED"; placementId: string; targetWidthM: number }
  | {
      code: "REPLACEMENT_NOT_FOUND";
      placementId: string;
      targetCabinetDefinitionId: string;
    }
  | {
      code: "REPLACEMENT_INCOMPATIBLE";
      placementId: string;
      targetCabinetDefinitionId: string;
    }
  | { code: "OPTIONS_UNSUPPORTED"; placementId: string }
  | {
      code: "CANDIDATE_LAYOUT_REJECTED";
      placementId: string;
      cause: PlacementLayoutErrorCode;
    };

export interface CommandEnvelopeFailure {
  code: "INVALID_INPUT";
}

export type CommandResult =
  | {
      ok: true;
      configuration: KitchenConfiguration;
      effects: readonly [CommandEffect];
    }
  | {
      ok: false;
      configuration: KitchenConfiguration;
      reason: CommandFailure;
    }
  | {
      ok: false;
      configuration?: never;
      reason: CommandEnvelopeFailure;
    };

type ConfigurationSchema = ReturnType<typeof createKitchenConfigurationSchema>;
interface PreflightSuccess {
  schema: ConfigurationSchema;
  definitions: Map<string, CabinetDefinition>;
  placement: Placement;
}

function fail(
  configuration: KitchenConfiguration,
  reason: CommandFailure,
): CommandResult {
  return { ok: false, configuration, reason };
}

function hasOriginalConfiguration(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const configuration = Reflect.get(value, "configuration") as unknown;
  return (
    typeof configuration === "object" &&
    configuration !== null &&
    !Array.isArray(configuration)
  );
}

function invalidInput(): CommandResult {
  return { ok: false, reason: { code: "INVALID_INPUT" } };
}

function preflight(
  input: CommandBase & { placementId: string },
): PreflightSuccess | CommandResult {
  let schema: ConfigurationSchema;
  try {
    schema = createKitchenConfigurationSchema(input.validationContext);
  } catch {
    return fail(input.configuration, { code: "INVALID_CONTEXT" });
  }
  if (!schema.safeParse(input.configuration).success) {
    return fail(input.configuration, { code: "INVALID_CONFIGURATION" });
  }
  const originalLayout = derivePlacementLayout({
    configuration: input.configuration,
    validationContext: input.validationContext,
    cornerReservations: input.cornerReservations,
  });
  if (!originalLayout.ok) {
    return fail(
      input.configuration,
      originalLayout.error.code === "INVALID_CONTEXT"
        ? { code: "INVALID_CONTEXT" }
        : { code: "INVALID_CONFIGURATION", cause: originalLayout.error.code },
    );
  }
  const placement = input.configuration.placements.find(
    ({ id }) => id === input.placementId,
  );
  if (placement === undefined) {
    return fail(input.configuration, {
      code: "PLACEMENT_NOT_FOUND",
      placementId: input.placementId,
    });
  }
  return {
    schema,
    placement,
    definitions: new Map(
      input.validationContext.cabinetDefinitions.map((definition) => [
        definition.id,
        definition,
      ]),
    ),
  };
}

function isFailure(
  value: PreflightSuccess | CommandResult,
): value is CommandResult {
  return "ok" in value;
}

function validateOccurredAt(input: CommandBase): CommandResult | undefined {
  const parsed = ConfigurationTimestampSchema.safeParse(input.occurredAt);
  if (
    !parsed.success ||
    Date.parse(input.occurredAt) <= Date.parse(input.configuration.updatedAt)
  ) {
    return fail(input.configuration, {
      code: "INVALID_OCCURRED_AT",
      occurredAt: input.occurredAt,
    });
  }
  return undefined;
}

function withUpdatedPlacement(
  configuration: KitchenConfiguration,
  placementId: string,
  update: (placement: Placement) => Placement,
  occurredAt: string,
): KitchenConfiguration {
  return {
    ...configuration,
    placements: configuration.placements.map((placement) =>
      placement.id === placementId ? update(placement) : placement,
    ),
    updatedAt: occurredAt,
  };
}

function validateCandidate(
  input: CommandBase & { placementId: string },
  candidate: KitchenConfiguration,
  effect: CommandEffect,
): CommandResult {
  const layout = derivePlacementLayout({
    configuration: candidate,
    validationContext: input.validationContext,
    cornerReservations: input.cornerReservations,
  });
  if (!layout.ok) {
    return fail(input.configuration, {
      code: "CANDIDATE_LAYOUT_REJECTED",
      placementId: input.placementId,
      cause: layout.error.code,
    });
  }
  return { ok: true, configuration: candidate, effects: [effect] };
}

function optionsEqual(left: CabinetOptions, right: CabinetOptions): boolean {
  return (
    left.materialId === right.materialId &&
    left.colourId === right.colourId &&
    left.handleId === right.handleId &&
    left.mechanismId === right.mechanismId
  );
}

function resolveOptions(
  definition: CabinetDefinition,
  explicit: CabinetOptions,
): CabinetOptions {
  const resolved: CabinetOptions = {};
  for (const key of [
    "materialId",
    "colourId",
    "handleId",
    "mechanismId",
  ] as const) {
    const value = explicit[key] ?? definition.defaultOptions[key];
    if (value !== undefined) resolved[key] = value;
  }
  return resolved;
}

function orderState(placement: Placement): OrderState {
  const { wallId, verticalBand, runAnchor, order } = placement;
  return { wallId, verticalBand, runAnchor, order };
}

function changedOrders(
  before: readonly Placement[],
  after: readonly Placement[],
  commandedId: string,
  configuration: KitchenConfiguration,
): OrderChange[] {
  const afterById = new Map(
    after.map((placement) => [placement.id, placement]),
  );
  const changes = before.flatMap((placement) => {
    const next = afterById.get(placement.id);
    if (next === undefined) return [];
    const previousState = orderState(placement);
    const nextState = orderState(next);
    return previousState.order === nextState.order &&
      previousState.runAnchor === nextState.runAnchor
      ? []
      : [
          {
            placementId: placement.id,
            before: previousState,
            after: nextState,
          },
        ];
  });
  const wallOrder = new Map(
    configuration.room.walls.map((wall) => [wall.id, wall.order]),
  );
  const bands = { base: 0, middle: 1, top: 2, column: 3 } as const;
  const anchors = { flow: 0, start: 1, end: 2 } as const;
  const commanded = changes.find(
    ({ placementId }) => placementId === commandedId,
  );
  const others = changes
    .filter(({ placementId }) => placementId !== commandedId)
    .sort((left, right) => {
      const byWall =
        (wallOrder.get(left.after.wallId) ?? 0) -
        (wallOrder.get(right.after.wallId) ?? 0);
      if (byWall !== 0) return byWall;
      const byBand =
        bands[left.after.verticalBand] - bands[right.after.verticalBand];
      if (byBand !== 0) return byBand;
      const byAnchor =
        anchors[left.after.runAnchor] - anchors[right.after.runAnchor];
      if (byAnchor !== 0) return byAnchor;
      if (left.after.order !== right.after.order)
        return left.after.order - right.after.order;
      return left.placementId < right.placementId
        ? -1
        : left.placementId > right.placementId
          ? 1
          : 0;
    });
  return commanded === undefined ? others : [commanded, ...others];
}

function normalizedPartition(
  placements: readonly Placement[],
  selectedId: string,
  targetOrder: number,
): Map<string, number> {
  const ordered = [...placements].sort(
    (left, right) => left.order - right.order,
  );
  const selectedIndex = ordered.findIndex(({ id }) => id === selectedId);
  const [selected] = ordered.splice(selectedIndex, 1);
  if (selected !== undefined) ordered.splice(targetOrder, 0, selected);
  return new Map(ordered.map((placement, order) => [placement.id, order]));
}

export function reorderCabinet(input: ReorderCabinetInput): CommandResult {
  if (!hasOriginalConfiguration(input as unknown)) return invalidInput();
  const checked = preflight(input);
  if (isFailure(checked)) return checked;
  const { placement } = checked;
  const partition = input.configuration.placements.filter(
    (candidate) =>
      candidate.wallId === placement.wallId &&
      candidate.verticalBand === placement.verticalBand &&
      candidate.runAnchor === placement.runAnchor,
  );
  if (
    !Number.isInteger(input.targetOrder) ||
    input.targetOrder < 0 ||
    input.targetOrder >= partition.length
  )
    return fail(input.configuration, {
      code: "TARGET_ORDER_OUT_OF_RANGE",
      placementId: input.placementId,
      targetOrder: input.targetOrder,
    });
  if (input.targetOrder === placement.order)
    return fail(input.configuration, {
      code: "NO_CHANGE",
      placementId: input.placementId,
    });
  const invalidTime = validateOccurredAt(input);
  if (invalidTime !== undefined) return invalidTime;
  const orders = normalizedPartition(
    partition,
    placement.id,
    input.targetOrder,
  );
  const placements = input.configuration.placements.map((candidate) => {
    const order = orders.get(candidate.id);
    return order === undefined || order === candidate.order
      ? candidate
      : { ...candidate, order };
  });
  const candidate = {
    ...input.configuration,
    placements,
    updatedAt: input.occurredAt,
  };
  return validateCandidate(input, candidate, {
    type: "cabinet_reordered",
    placementId: placement.id,
    orderChanges: changedOrders(
      input.configuration.placements,
      placements,
      placement.id,
      input.configuration,
    ),
  });
}

export function resizeCabinet(input: ResizeCabinetInput): CommandResult {
  if (!hasOriginalConfiguration(input as unknown)) return invalidInput();
  const checked = preflight(input);
  if (isFailure(checked)) return checked;
  if (input.targetWidthM === checked.placement.widthM)
    return fail(input.configuration, {
      code: "NO_CHANGE",
      placementId: input.placementId,
    });
  const widthCandidate = withUpdatedPlacement(
    input.configuration,
    input.placementId,
    (placement) => ({ ...placement, widthM: input.targetWidthM }),
    input.configuration.updatedAt,
  );
  if (!checked.schema.safeParse(widthCandidate).success)
    return fail(input.configuration, {
      code: "WIDTH_UNSUPPORTED",
      placementId: input.placementId,
      targetWidthM: input.targetWidthM,
    });
  const invalidTime = validateOccurredAt(input);
  if (invalidTime !== undefined) return invalidTime;
  const candidate = { ...widthCandidate, updatedAt: input.occurredAt };
  return validateCandidate(input, candidate, {
    type: "cabinet_resized",
    placementId: input.placementId,
    fromWidthM: checked.placement.widthM,
    toWidthM: input.targetWidthM,
  });
}

export function replaceCabinet(input: ReplaceCabinetInput): CommandResult {
  if (!hasOriginalConfiguration(input as unknown)) return invalidInput();
  const checked = preflight(input);
  if (isFailure(checked)) return checked;
  const current = checked.definitions.get(
    checked.placement.cabinetDefinitionId,
  );
  const target = checked.definitions.get(input.targetCabinetDefinitionId);
  if (target === undefined)
    return fail(input.configuration, {
      code: "REPLACEMENT_NOT_FOUND",
      placementId: input.placementId,
      targetCabinetDefinitionId: input.targetCabinetDefinitionId,
    });
  if (target.id === checked.placement.cabinetDefinitionId)
    return fail(input.configuration, {
      code: "NO_CHANGE",
      placementId: input.placementId,
    });
  const compatible =
    current !== undefined &&
    target.family === current.family &&
    target.verticalBand === current.verticalBand &&
    target.replacementGroup === current.replacementGroup &&
    target.layoutRole === current.layoutRole &&
    (target.placementRules.runMargin === "unrestricted") ===
      (checked.placement.runAnchor === "flow") &&
    (target.placementRules.corner === "junction_only") ===
      (checked.placement.junctionGroupId !== undefined);
  if (!compatible)
    return fail(input.configuration, {
      code: "REPLACEMENT_INCOMPATIBLE",
      placementId: input.placementId,
      targetCabinetDefinitionId: input.targetCabinetDefinitionId,
    });
  const replace = (placement: Placement, options = placement.options) => ({
    ...placement,
    cabinetDefinitionId: target.id,
    options,
  });
  const emptyOptionsCandidate = withUpdatedPlacement(
    input.configuration,
    input.placementId,
    (placement) => replace(placement, {}),
    input.configuration.updatedAt,
  );
  const actualCandidate = withUpdatedPlacement(
    input.configuration,
    input.placementId,
    replace,
    input.configuration.updatedAt,
  );
  if (!checked.schema.safeParse(emptyOptionsCandidate).success)
    return fail(input.configuration, {
      code: "REPLACEMENT_INCOMPATIBLE",
      placementId: input.placementId,
      targetCabinetDefinitionId: input.targetCabinetDefinitionId,
    });
  if (!checked.schema.safeParse(actualCandidate).success)
    return fail(input.configuration, {
      code: "OPTIONS_UNSUPPORTED",
      placementId: input.placementId,
    });
  const invalidTime = validateOccurredAt(input);
  if (invalidTime !== undefined) return invalidTime;
  const candidate = { ...actualCandidate, updatedAt: input.occurredAt };
  return validateCandidate(input, candidate, {
    type: "cabinet_replaced",
    placementId: input.placementId,
    fromDefinitionId: current.id,
    toDefinitionId: target.id,
    resolvedOptionsBefore: resolveOptions(current, checked.placement.options),
    resolvedOptionsAfter: resolveOptions(target, checked.placement.options),
  });
}

export function setCabinetOptions(
  input: SetCabinetOptionsInput,
): CommandResult {
  if (!hasOriginalConfiguration(input as unknown)) return invalidInput();
  const checked = preflight(input);
  if (isFailure(checked)) return checked;
  const parsedOptions = CabinetOptionsSchema.safeParse(input.options);
  if (!parsedOptions.success)
    return fail(input.configuration, {
      code: "OPTIONS_UNSUPPORTED",
      placementId: input.placementId,
    });
  const options = parsedOptions.data;
  if (optionsEqual(options, checked.placement.options))
    return fail(input.configuration, {
      code: "NO_CHANGE",
      placementId: input.placementId,
    });
  const optionCandidate = withUpdatedPlacement(
    input.configuration,
    input.placementId,
    (placement) => ({ ...placement, options: { ...options } }),
    input.configuration.updatedAt,
  );
  if (!checked.schema.safeParse(optionCandidate).success)
    return fail(input.configuration, {
      code: "OPTIONS_UNSUPPORTED",
      placementId: input.placementId,
    });
  const invalidTime = validateOccurredAt(input);
  if (invalidTime !== undefined) return invalidTime;
  const definition = checked.definitions.get(
    checked.placement.cabinetDefinitionId,
  );
  if (definition === undefined)
    return fail(input.configuration, { code: "INVALID_CONTEXT" });
  const candidate = { ...optionCandidate, updatedAt: input.occurredAt };
  return validateCandidate(input, candidate, {
    type: "cabinet_options_set",
    placementId: input.placementId,
    explicitOptionsBefore: checked.placement.options,
    explicitOptionsAfter: { ...options },
    resolvedOptionsBefore: resolveOptions(
      definition,
      checked.placement.options,
    ),
    resolvedOptionsAfter: resolveOptions(definition, options),
  });
}

export function moveCabinetToRunMargin(
  input: MoveCabinetToRunMarginInput,
): CommandResult {
  if (!hasOriginalConfiguration(input as unknown)) return invalidInput();
  const checked = preflight(input);
  if (isFailure(checked)) return checked;
  const definition = checked.definitions.get(
    checked.placement.cabinetDefinitionId,
  );
  const targetRunAnchor: unknown = input.targetRunAnchor;
  if (
    (targetRunAnchor !== "start" && targetRunAnchor !== "end") ||
    definition?.verticalBand !== "column" ||
    definition.placementRules.runMargin === "unrestricted"
  )
    return fail(input.configuration, {
      code: "MARGIN_MOVE_NOT_ALLOWED",
      placementId: input.placementId,
    });
  if (input.targetRunAnchor === checked.placement.runAnchor)
    return fail(input.configuration, {
      code: "TARGET_ANCHOR_UNCHANGED",
      placementId: input.placementId,
      targetRunAnchor: input.targetRunAnchor,
    });
  const source = input.configuration.placements.filter(
    (placement) =>
      placement.wallId === checked.placement.wallId &&
      placement.verticalBand === "column" &&
      placement.runAnchor === checked.placement.runAnchor,
  );
  const target = input.configuration.placements.filter(
    (placement) =>
      placement.wallId === checked.placement.wallId &&
      placement.verticalBand === "column" &&
      placement.runAnchor === input.targetRunAnchor,
  );
  if (
    !Number.isInteger(input.targetOrder) ||
    input.targetOrder < 0 ||
    input.targetOrder > target.length
  )
    return fail(input.configuration, {
      code: "TARGET_ORDER_OUT_OF_RANGE",
      placementId: input.placementId,
      targetOrder: input.targetOrder,
    });
  const invalidTime = validateOccurredAt(input);
  if (invalidTime !== undefined) return invalidTime;
  const sourceOrders = new Map(
    source
      .filter(({ id }) => id !== checked.placement.id)
      .sort((a, b) => a.order - b.order)
      .map((placement, order) => [placement.id, order]),
  );
  const targetWithSelected = [...target].sort((a, b) => a.order - b.order);
  targetWithSelected.splice(input.targetOrder, 0, {
    ...checked.placement,
    runAnchor: input.targetRunAnchor,
  });
  const targetOrders = new Map(
    targetWithSelected.map((placement, order) => [placement.id, order]),
  );
  const placements = input.configuration.placements.map((placement) => {
    const sourceOrder = sourceOrders.get(placement.id);
    if (sourceOrder !== undefined)
      return sourceOrder === placement.order
        ? placement
        : { ...placement, order: sourceOrder };
    const targetOrder = targetOrders.get(placement.id);
    if (targetOrder === undefined) return placement;
    const runAnchor =
      placement.id === checked.placement.id
        ? input.targetRunAnchor
        : placement.runAnchor;
    return runAnchor === placement.runAnchor && targetOrder === placement.order
      ? placement
      : { ...placement, runAnchor, order: targetOrder };
  });
  const candidate = {
    ...input.configuration,
    placements,
    updatedAt: input.occurredAt,
  };
  return validateCandidate(input, candidate, {
    type: "cabinet_run_margin_moved",
    placementId: input.placementId,
    fromRunAnchor: checked.placement.runAnchor,
    toRunAnchor: input.targetRunAnchor,
    orderChanges: changedOrders(
      input.configuration.placements,
      placements,
      input.placementId,
      input.configuration,
    ),
  });
}
