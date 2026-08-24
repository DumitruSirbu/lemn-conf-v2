import { describe, expect, it } from "vitest";

import {
  type CommandFailure,
  type CommandResult,
  moveCabinetToRunMargin,
  reorderCabinet,
  replaceCabinet,
  resizeCabinet,
  setCabinetOptions,
} from "./configuration-commands.js";
import {
  CabinetDefinitionSchema,
  KitchenConfigurationSchema,
  LayoutPolicyExactnessSchema,
  type CabinetDefinition,
  type KitchenConfiguration,
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

function definition(
  id: string,
  options?: {
    family?: "base" | "column";
    replacementGroup?: string;
    handles?: string[];
    defaultHandle?: string;
    widths?: number[];
    runMargin?: "unrestricted" | "contiguous_group_touches";
  },
): CabinetDefinition {
  const family = options?.family ?? "base";
  const widths = options?.widths ?? [1, 2];
  return CabinetDefinitionSchema.parse({
    id,
    family,
    verticalBand: family === "column" ? "column" : "base",
    variant: id,
    supportedWidthRules: [{ kind: "discrete", widthsM: widths }],
    defaultWidthM: widths[0],
    heightM: family === "column" ? 2.6 : 1,
    depthM: 0.5,
    rendererKey: id,
    replacementGroup: options?.replacementGroup ?? "storage",
    layoutRole: "cabinet",
    optionSupport: {
      materialColourPairs: [{ materialId: "oak", colourIds: ["white"] }],
      handleIds: options?.handles ?? ["bar", "knob"],
      mechanismIds: [],
    },
    defaultOptions: {
      materialId: "oak",
      colourId: "white",
      handleId: options?.defaultHandle ?? "bar",
    },
    pricingRuleId: id,
    placementRules: {
      runMargin: options?.runMargin ?? "unrestricted",
      corner: "prohibited",
      obstacleClearanceProfileId: "exact",
    },
  });
}

function placement(
  id: string,
  definitionId: string,
  order: number,
  options?: Partial<Placement>,
): Placement {
  return {
    id,
    cabinetDefinitionId: definitionId,
    wallId: "wall-a",
    verticalBand: "base",
    runAnchor: "flow",
    order,
    widthM: 1,
    options: {},
    ...options,
  };
}

function fixture(
  definitions: CabinetDefinition[] = [definition("base")],
  placements: Placement[] = [
    placement("one", "base", 0),
    placement("two", "base", 1),
    placement("three", "base", 2),
  ],
  room?: KitchenConfiguration["room"],
) {
  const configuration = KitchenConfigurationSchema.parse({
    schemaVersion: "1",
    room: room ?? {
      shape: "linear",
      heightM: 3,
      walls: [{ id: "wall-a", order: 0, lengthM: 6 }],
      obstacles: [],
    },
    sourcePresetId: "preset",
    placements,
    catalogVersion: "catalog-v1",
    layoutPolicyVersion: "layout-v1",
    pricingVersion: "pricing-v1",
    createdAt: "2026-08-20T10:00:00.000Z",
    updatedAt: "2026-08-20T11:00:00.000Z",
  });
  return {
    configuration,
    validationContext: {
      supportedSchemaVersions: ["1"],
      catalogVersion: "catalog-v1",
      pricingVersion: "pricing-v1",
      presetIds: ["preset"],
      layoutPolicy: policy,
      cabinetDefinitions: definitions,
      optionIds: {
        material: ["oak"],
        colour: ["white"],
        handle: ["bar", "knob"],
        mechanism: [],
      },
    },
    cornerReservations: [],
    occurredAt: "2026-08-20T12:00:00.000+00:00",
  } as const;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value))
    return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

function expectDomainRejection(
  run: () => CommandResult,
  original: KitchenConfiguration,
  reason: CommandFailure,
) {
  const before = JSON.stringify(original);
  const result = run();
  expect(result).toEqual({ ok: false, configuration: original, reason });
  expect(result.configuration).toBe(original);
  expect(JSON.stringify(original)).toBe(before);
  expect(Object.hasOwn(result, "effects")).toBe(false);
}

describe("configuration commands", () => {
  it("returns every documented failure reason transactionally", () => {
    expect(reorderCabinet(null as never)).toEqual({
      ok: false,
      reason: { code: "INVALID_INPUT" },
    });
    const input = fixture();
    expectDomainRejection(
      () =>
        reorderCabinet({
          ...input,
          validationContext: {
            ...input.validationContext,
            layoutPolicy: {
              ...input.validationContext.layoutPolicy,
              manufacturingGrid: { unitM: 0 },
            },
          },
          placementId: "one",
          targetOrder: 0,
        }),
      input.configuration,
      { code: "INVALID_CONTEXT" },
    );
    const invalidConfiguration = {
      ...input.configuration,
      placements: input.configuration.placements.map((placement, index) =>
        index === 1 ? { ...placement, order: 9 } : placement,
      ),
    } as KitchenConfiguration;
    expectDomainRejection(
      () =>
        reorderCabinet({
          ...input,
          configuration: invalidConfiguration,
          placementId: "one",
          targetOrder: 0,
        }),
      invalidConfiguration,
      { code: "INVALID_CONFIGURATION" },
    );
    expectDomainRejection(
      () =>
        reorderCabinet({ ...input, placementId: "missing", targetOrder: 0 }),
      input.configuration,
      { code: "PLACEMENT_NOT_FOUND", placementId: "missing" },
    );
    expectDomainRejection(
      () =>
        resizeCabinet({
          ...input,
          occurredAt: input.configuration.updatedAt,
          placementId: "one",
          targetWidthM: 2,
        }),
      input.configuration,
      {
        code: "INVALID_OCCURRED_AT",
        occurredAt: input.configuration.updatedAt,
      },
    );
    expectDomainRejection(
      () => resizeCabinet({ ...input, placementId: "one", targetWidthM: 1 }),
      input.configuration,
      { code: "NO_CHANGE", placementId: "one" },
    );
    expectDomainRejection(
      () => reorderCabinet({ ...input, placementId: "one", targetOrder: 3 }),
      input.configuration,
      { code: "TARGET_ORDER_OUT_OF_RANGE", placementId: "one", targetOrder: 3 },
    );
    expectDomainRejection(
      () =>
        moveCabinetToRunMargin({
          ...input,
          placementId: "one",
          targetRunAnchor: "end",
          targetOrder: 0,
        }),
      input.configuration,
      { code: "MARGIN_MOVE_NOT_ALLOWED", placementId: "one" },
    );
    expectDomainRejection(
      () => resizeCabinet({ ...input, placementId: "one", targetWidthM: 3 }),
      input.configuration,
      { code: "WIDTH_UNSUPPORTED", placementId: "one", targetWidthM: 3 },
    );
    expectDomainRejection(
      () =>
        replaceCabinet({
          ...input,
          placementId: "one",
          targetCabinetDefinitionId: "missing",
        }),
      input.configuration,
      {
        code: "REPLACEMENT_NOT_FOUND",
        placementId: "one",
        targetCabinetDefinitionId: "missing",
      },
    );
    const other = definition("other", { replacementGroup: "other" });
    const replacementInput = fixture(
      [definition("base"), other],
      input.configuration.placements,
    );
    expectDomainRejection(
      () =>
        replaceCabinet({
          ...replacementInput,
          placementId: "one",
          targetCabinetDefinitionId: "other",
        }),
      replacementInput.configuration,
      {
        code: "REPLACEMENT_INCOMPATIBLE",
        placementId: "one",
        targetCabinetDefinitionId: "other",
      },
    );
    expectDomainRejection(
      () =>
        setCabinetOptions({
          ...input,
          placementId: "one",
          options: { handleId: "ghost" },
        }),
      input.configuration,
      { code: "OPTIONS_UNSUPPORTED", placementId: "one" },
    );

    const column = definition("column", {
      family: "column",
      widths: [1],
      runMargin: "contiguous_group_touches",
    });
    const columnInput = fixture(
      [column],
      [
        placement("column", "column", 0, {
          verticalBand: "column",
          runAnchor: "start",
        }),
      ],
    );
    expectDomainRejection(
      () =>
        moveCabinetToRunMargin({
          ...columnInput,
          placementId: "column",
          targetRunAnchor: "start",
          targetOrder: 0,
        }),
      columnInput.configuration,
      {
        code: "TARGET_ANCHOR_UNCHANGED",
        placementId: "column",
        targetRunAnchor: "start",
      },
    );

    const blockedInput = fixture(
      [definition("base")],
      [placement("one", "base", 0)],
      {
        shape: "linear",
        heightM: 3,
        walls: [{ id: "wall-a", order: 0, lengthM: 2.5 }],
        obstacles: [
          {
            id: "door",
            kind: "door",
            wallId: "wall-a",
            offsetM: 1,
            widthM: 0.5,
            heightM: 2,
            bottomElevationM: 0,
          },
        ],
      },
    );
    expectDomainRejection(
      () =>
        resizeCabinet({
          ...blockedInput,
          placementId: "one",
          targetWidthM: 2,
        }),
      blockedInput.configuration,
      {
        code: "CANDIDATE_LAYOUT_REJECTED",
        placementId: "one",
        cause: "NO_FIT",
      },
    );
  });
  it("reorders only its partition, preserves indices, and emits deterministic changes", () => {
    const input = fixture();
    const before = JSON.stringify(input.configuration);
    deepFreeze(input.configuration);
    const result = reorderCabinet({
      ...input,
      placementId: "three",
      targetOrder: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason.code);
    expect(result.configuration.placements.map(({ id }) => id)).toEqual([
      "one",
      "two",
      "three",
    ]);
    expect(result.configuration.placements.map(({ order }) => order)).toEqual([
      1, 2, 0,
    ]);
    expect(result.configuration.createdAt).toBe(input.configuration.createdAt);
    expect(result.configuration.updatedAt).toBe(input.occurredAt);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0].type).toBe("cabinet_reordered");
    if (result.effects[0].type !== "cabinet_reordered")
      throw new Error("fixture");
    expect(
      result.effects[0].orderChanges.map(({ placementId }) => placementId),
    ).toEqual(["three", "one", "two"]);
    expect(result.effects[0]).toEqual({
      type: "cabinet_reordered",
      placementId: "three",
      orderChanges: [
        {
          placementId: "three",
          before: {
            wallId: "wall-a",
            verticalBand: "base",
            runAnchor: "flow",
            order: 2,
          },
          after: {
            wallId: "wall-a",
            verticalBand: "base",
            runAnchor: "flow",
            order: 0,
          },
        },
        {
          placementId: "one",
          before: {
            wallId: "wall-a",
            verticalBand: "base",
            runAnchor: "flow",
            order: 0,
          },
          after: {
            wallId: "wall-a",
            verticalBand: "base",
            runAnchor: "flow",
            order: 1,
          },
        },
        {
          placementId: "two",
          before: {
            wallId: "wall-a",
            verticalBand: "base",
            runAnchor: "flow",
            order: 1,
          },
          after: {
            wallId: "wall-a",
            verticalBand: "base",
            runAnchor: "flow",
            order: 2,
          },
        },
      ],
    });
    expect(JSON.stringify(input.configuration)).toBe(before);

    const forward = reorderCabinet({
      ...fixture(),
      placementId: "one",
      targetOrder: 2,
    });
    expect(forward.ok).toBe(true);
    if (!forward.ok) throw new Error(forward.reason.code);
    expect(forward.configuration.placements.map(({ order }) => order)).toEqual([
      2, 0, 1,
    ]);

    const margin = definition("margin", {
      widths: [1],
      runMargin: "contiguous_group_touches",
    });
    const endInput = fixture(
      [margin],
      [
        placement("end-0", "margin", 0, { runAnchor: "end" }),
        placement("end-1", "margin", 1, { runAnchor: "end" }),
        placement("end-2", "margin", 2, { runAnchor: "end" }),
      ],
    );
    const endResult = reorderCabinet({
      ...endInput,
      placementId: "end-0",
      targetOrder: 2,
    });
    expect(endResult.ok).toBe(true);
    if (!endResult.ok) throw new Error(endResult.reason.code);
    expect(
      endResult.configuration.placements.map(({ order }) => order),
    ).toEqual([2, 0, 1]);
  });

  it("returns INVALID_INPUT without fabricating a snapshot for malformed envelopes", () => {
    const commands = [
      reorderCabinet,
      resizeCabinet,
      replaceCabinet,
      moveCabinetToRunMargin,
      setCabinetOptions,
    ] as const;
    for (const command of commands) {
      for (const malformed of [null, undefined, 42, {}, { occurredAt: "x" }]) {
        const result = command(malformed as never);
        expect(result).toEqual({
          ok: false,
          reason: { code: "INVALID_INPUT" },
        });
        expect(Object.hasOwn(result, "configuration")).toBe(false);
      }
    }
  });

  it("uses strict preflight, target, no-change, and timestamp precedence", () => {
    const input = fixture();
    const missing = reorderCabinet({
      ...input,
      placementId: "missing",
      targetOrder: 99,
      occurredAt: "bad",
    });
    expect(missing).toEqual({
      ok: false,
      configuration: input.configuration,
      reason: { code: "PLACEMENT_NOT_FOUND", placementId: "missing" },
    });
    const range = reorderCabinet({
      ...input,
      placementId: "one",
      targetOrder: 99,
      occurredAt: "bad",
    });
    expect(range.ok || range.reason.code).toBe("TARGET_ORDER_OUT_OF_RANGE");
    const unchanged = resizeCabinet({
      ...input,
      placementId: "one",
      targetWidthM: 1,
      occurredAt: "bad",
    });
    expect(unchanged.ok || unchanged.reason.code).toBe("NO_CHANGE");
    const badTime = resizeCabinet({
      ...input,
      placementId: "one",
      targetWidthM: 2,
      occurredAt: input.configuration.updatedAt,
    });
    expect(badTime.ok || badTime.reason.code).toBe("INVALID_OCCURRED_AT");
    expect(badTime.configuration).toBe(input.configuration);
    const subMillisecond = resizeCabinet({
      ...input,
      placementId: "one",
      targetWidthM: 2,
      occurredAt: "2026-08-20T12:00:00.0001Z",
    });
    expect(subMillisecond.ok || subMillisecond.reason.code).toBe(
      "INVALID_OCCURRED_AT",
    );
    const invalidContext = reorderCabinet({
      ...input,
      validationContext: {
        ...input.validationContext,
        layoutPolicy: {
          ...input.validationContext.layoutPolicy,
          manufacturingGrid: { unitM: 0 },
        },
      },
      placementId: "missing",
      targetOrder: 0,
    });
    expect(invalidContext.ok || invalidContext.reason.code).toBe(
      "INVALID_CONTEXT",
    );

    const invalidConfiguration = {
      ...input.configuration,
      placements: input.configuration.placements.map((placement, index) =>
        index === 1 ? { ...placement, order: 9 } : placement,
      ),
    } as KitchenConfiguration;
    const invalid = reorderCabinet({
      ...input,
      configuration: invalidConfiguration,
      placementId: "missing",
      targetOrder: 0,
    });
    expect(invalid.ok || invalid.reason.code).toBe("INVALID_CONFIGURATION");
    expect(invalid.configuration).toBe(invalidConfiguration);
  });

  it("fails closed for malformed runtime payloads", () => {
    const input = fixture();
    expect(
      setCabinetOptions({
        ...input,
        placementId: "one",
        options: null,
      } as unknown as Parameters<typeof setCabinetOptions>[0]),
    ).toEqual({
      ok: false,
      configuration: input.configuration,
      reason: { code: "OPTIONS_UNSUPPORTED", placementId: "one" },
    });

    const column = definition("column", {
      family: "column",
      widths: [1],
      runMargin: "contiguous_group_touches",
    });
    const columnInput = fixture(
      [column],
      [
        placement("column", "column", 0, {
          verticalBand: "column",
          runAnchor: "start",
        }),
      ],
    );
    const malformedAnchor = moveCabinetToRunMargin({
      ...columnInput,
      placementId: "column",
      targetRunAnchor: "flow",
      targetOrder: 0,
    } as unknown as Parameters<typeof moveCabinetToRunMargin>[0]);
    expect(malformedAnchor.ok || malformedAnchor.reason.code).toBe(
      "MARGIN_MOVE_NOT_ALLOWED",
    );
    expect(malformedAnchor.configuration).toBe(columnInput.configuration);

    const equalInstant = resizeCabinet({
      ...input,
      placementId: "one",
      targetWidthM: 2,
      occurredAt: "2026-08-20T13:00:00.000+02:00",
    });
    expect(equalInstant.ok || equalInstant.reason.code).toBe(
      "INVALID_OCCURRED_AT",
    );
  });

  it("resizes transactionally and reports unsupported or layout-blocked widths", () => {
    const input = fixture();
    const success = resizeCabinet({
      ...input,
      placementId: "one",
      targetWidthM: 2,
    });
    expect(success.ok).toBe(true);
    if (!success.ok) throw new Error(success.reason.code);
    expect(success.configuration.placements[0]?.widthM).toBe(2);
    expect(input.configuration.placements[0]?.widthM).toBe(1);
    expect(success.effects[0]).toEqual({
      type: "cabinet_resized",
      placementId: "one",
      fromWidthM: 1,
      toWidthM: 2,
    });

    const unsupported = resizeCabinet({
      ...input,
      placementId: "one",
      targetWidthM: Number.NaN,
    });
    expect(unsupported.ok || unsupported.reason.code).toBe("WIDTH_UNSUPPORTED");

    const blockedInput = fixture(
      [definition("base")],
      [placement("one", "base", 0)],
      {
        shape: "linear",
        heightM: 3,
        walls: [{ id: "wall-a", order: 0, lengthM: 2.5 }],
        obstacles: [
          {
            id: "door",
            kind: "door",
            wallId: "wall-a",
            offsetM: 1,
            widthM: 0.5,
            heightM: 2,
            bottomElevationM: 0,
          },
        ],
      },
    );
    const blocked = resizeCabinet({
      ...blockedInput,
      placementId: "one",
      targetWidthM: 2,
    });
    expect(blocked.ok || blocked.reason).toEqual({
      code: "CANDIDATE_LAYOUT_REJECTED",
      placementId: "one",
      cause: "NO_FIT",
    });
    expect(blocked.configuration).toBe(blockedInput.configuration);

    const column = definition("column", {
      family: "column",
      widths: [1, 2],
      runMargin: "contiguous_group_touches",
    });
    const crossBandInput = fixture(
      [definition("base"), column],
      [
        placement("column", "column", 0, {
          verticalBand: "column",
          runAnchor: "start",
        }),
        placement("base", "base", 0),
      ],
      {
        shape: "linear",
        heightM: 3,
        walls: [{ id: "wall-a", order: 0, lengthM: 2 }],
        obstacles: [],
      },
    );
    const crossBand = resizeCabinet({
      ...crossBandInput,
      placementId: "column",
      targetWidthM: 2,
    });
    expect(crossBand.ok || crossBand.reason).toEqual({
      code: "CANDIDATE_LAYOUT_REJECTED",
      placementId: "column",
      cause: "NO_FIT",
    });
    expect(crossBand.configuration).toBe(crossBandInput.configuration);
  });

  it("replaces compatibly while preserving explicit state and exposing default changes", () => {
    const source = definition("source", { defaultHandle: "bar" });
    const target = definition("target", { defaultHandle: "knob" });
    const input = fixture([source, target], [placement("one", "source", 0)]);
    const result = replaceCabinet({
      ...input,
      placementId: "one",
      targetCabinetDefinitionId: "target",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason.code);
    expect(result.configuration.placements[0]).toEqual({
      ...input.configuration.placements[0],
      cabinetDefinitionId: "target",
    });
    expect(result.effects[0]).toEqual({
      type: "cabinet_replaced",
      placementId: "one",
      fromDefinitionId: "source",
      toDefinitionId: "target",
      resolvedOptionsBefore: {
        materialId: "oak",
        colourId: "white",
        handleId: "bar",
      },
      resolvedOptionsAfter: {
        materialId: "oak",
        colourId: "white",
        handleId: "knob",
      },
    });
    const missing = replaceCabinet({
      ...input,
      placementId: "one",
      targetCabinetDefinitionId: "missing",
    });
    expect(missing.ok || missing.reason.code).toBe("REPLACEMENT_NOT_FOUND");
    const incompatible = definition("other", { replacementGroup: "other" });
    const wrong = replaceCabinet({
      ...fixture([source, incompatible], [placement("one", "source", 0)]),
      placementId: "one",
      targetCabinetDefinitionId: "other",
    });
    expect(wrong.ok || wrong.reason.code).toBe("REPLACEMENT_INCOMPATIBLE");
  });

  it("rejects unsupported explicit options on replacement without dropping them", () => {
    const source = definition("source");
    const target = definition("target", {
      handles: ["knob"],
      defaultHandle: "knob",
    });
    const selected = placement("one", "source", 0, {
      options: { handleId: "bar" },
    });
    const input = fixture([source, target], [selected]);
    const result = replaceCabinet({
      ...input,
      placementId: "one",
      targetCabinetDefinitionId: "target",
    });
    expect(result.ok || result.reason.code).toBe("OPTIONS_UNSUPPORTED");
    expect(result.configuration).toBe(input.configuration);
    expect(input.configuration.placements[0]?.options).toEqual({
      handleId: "bar",
    });
  });

  it("sets a complete options object and resolves omissions through defaults", () => {
    const input = fixture(
      [definition("base")],
      [placement("one", "base", 0, { options: { handleId: "knob" } })],
    );
    const result = setCabinetOptions({
      ...input,
      placementId: "one",
      options: {},
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason.code);
    expect(result.configuration.placements[0]?.options).toEqual({});
    expect(result.effects[0]).toEqual({
      type: "cabinet_options_set",
      placementId: "one",
      explicitOptionsBefore: { handleId: "knob" },
      explicitOptionsAfter: {},
      resolvedOptionsBefore: {
        materialId: "oak",
        colourId: "white",
        handleId: "knob",
      },
      resolvedOptionsAfter: {
        materialId: "oak",
        colourId: "white",
        handleId: "bar",
      },
    });
    const unsupported = setCabinetOptions({
      ...input,
      placementId: "one",
      options: { handleId: "ghost" },
    });
    expect(unsupported.ok || unsupported.reason.code).toBe(
      "OPTIONS_UNSUPPORTED",
    );
    const undefinedValue = setCabinetOptions({
      ...input,
      placementId: "one",
      options: { handleId: undefined },
    });
    expect(undefinedValue).toEqual({
      ok: false,
      configuration: input.configuration,
      reason: { code: "OPTIONS_UNSUPPORTED", placementId: "one" },
    });
  });

  it("moves only columns between margins and normalizes source/target partitions", () => {
    const column = definition("column", {
      family: "column",
      widths: [1],
      runMargin: "contiguous_group_touches",
    });
    const placements = [
      placement("start-0", "column", 0, {
        verticalBand: "column",
        runAnchor: "start",
      }),
      placement("start-1", "column", 1, {
        verticalBand: "column",
        runAnchor: "start",
      }),
      placement("end-0", "column", 0, {
        verticalBand: "column",
        runAnchor: "end",
      }),
    ];
    const input = fixture([column], placements);
    const result = moveCabinetToRunMargin({
      ...input,
      placementId: "start-0",
      targetRunAnchor: "end",
      targetOrder: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason.code);
    expect(result.configuration.placements.map(({ id }) => id)).toEqual(
      placements.map(({ id }) => id),
    );
    expect(
      result.configuration.placements.map(({ runAnchor, order }) => ({
        runAnchor,
        order,
      })),
    ).toEqual([
      { runAnchor: "end", order: 1 },
      { runAnchor: "start", order: 0 },
      { runAnchor: "end", order: 0 },
    ]);
    expect(result.effects[0].type).toBe("cabinet_run_margin_moved");
    expect(result.effects[0]).toEqual({
      type: "cabinet_run_margin_moved",
      placementId: "start-0",
      fromRunAnchor: "start",
      toRunAnchor: "end",
      orderChanges: [
        {
          placementId: "start-0",
          before: {
            wallId: "wall-a",
            verticalBand: "column",
            runAnchor: "start",
            order: 0,
          },
          after: {
            wallId: "wall-a",
            verticalBand: "column",
            runAnchor: "end",
            order: 1,
          },
        },
        {
          placementId: "start-1",
          before: {
            wallId: "wall-a",
            verticalBand: "column",
            runAnchor: "start",
            order: 1,
          },
          after: {
            wallId: "wall-a",
            verticalBand: "column",
            runAnchor: "start",
            order: 0,
          },
        },
      ],
    });
    expect(result.configuration.placements[2]).toBe(
      input.configuration.placements[2],
    );
    const unchangedAnchor = moveCabinetToRunMargin({
      ...input,
      placementId: "start-0",
      targetRunAnchor: "start",
      targetOrder: 0,
    });
    expect(unchangedAnchor.ok || unchangedAnchor.reason.code).toBe(
      "TARGET_ANCHOR_UNCHANGED",
    );

    const baseInput = fixture();
    const forbidden = moveCabinetToRunMargin({
      ...baseInput,
      placementId: "one",
      targetRunAnchor: "end",
      targetOrder: 0,
    });
    expect(forbidden.ok || forbidden.reason.code).toBe(
      "MARGIN_MOVE_NOT_ALLOWED",
    );
  });

  it("keeps explicit corner reservations immutable and rejects a side-breaking junction move", () => {
    const columnBase = definition("junction-column", {
      family: "column",
      widths: [1, 2],
      runMargin: "contiguous_group_touches",
    });
    const column = CabinetDefinitionSchema.parse({
      ...columnBase,
      placementRules: {
        ...columnBase.placementRules,
        corner: "junction_only",
      },
    });
    const replacement = CabinetDefinitionSchema.parse({
      ...column,
      id: "junction-column-replacement",
      variant: "junction-column-replacement",
      rendererKey: "junction-column-replacement",
      pricingRuleId: "junction-column-replacement",
    });
    const otherColumn = definition("other-column", {
      family: "column",
      widths: [1],
      runMargin: "contiguous_group_touches",
    });
    const legA = placement("leg-a", "junction-column", 0, {
      verticalBand: "column",
      runAnchor: "start",
      junctionGroupId: "corner",
    });
    const legB = placement("leg-b", "junction-column", 0, {
      wallId: "wall-b",
      verticalBand: "column",
      runAnchor: "end",
      junctionGroupId: "corner",
    });
    const other = placement("other", "other-column", 1, {
      verticalBand: "column",
      runAnchor: "start",
    });
    const input = fixture(
      [column, replacement, otherColumn],
      [legA, legB, other],
      {
        shape: "l_shape",
        heightM: 3,
        walls: [
          { id: "wall-a", order: 0, lengthM: 6 },
          { id: "wall-b", order: 1, lengthM: 6 },
        ],
        obstacles: [],
      },
    );
    const cornerReservations = deepFreeze([
      {
        sourceId: "corner",
        wallId: "wall-a" as const,
        verticalBands: ["column" as const],
        startUnits: 0n,
        endUnits: 10n,
      },
      {
        sourceId: "corner",
        wallId: "wall-b" as const,
        verticalBands: ["column" as const],
        startUnits: 50n,
        endUnits: 60n,
      },
    ]);
    const before = cornerReservations.map((reservation) => ({
      ...reservation,
      verticalBands: [...reservation.verticalBands],
    }));
    const result = moveCabinetToRunMargin({
      ...input,
      cornerReservations,
      placementId: "leg-a",
      targetRunAnchor: "end",
      targetOrder: 0,
    });
    expect(result.ok || result.reason).toEqual({
      code: "CANDIDATE_LAYOUT_REJECTED",
      placementId: "leg-a",
      cause: "INVALID_CONFIGURATION",
    });
    expect(result.configuration).toBe(input.configuration);
    expect(cornerReservations).toEqual(before);

    const reordered = reorderCabinet({
      ...input,
      cornerReservations,
      placementId: "leg-a",
      targetOrder: 1,
    });
    expect(reordered.ok || reordered.reason).toEqual({
      code: "CANDIDATE_LAYOUT_REJECTED",
      placementId: "leg-a",
      cause: "ANCHOR_RULE_CONFLICT",
    });
    expect(reordered.configuration).toBe(input.configuration);

    const resized = resizeCabinet({
      ...input,
      cornerReservations,
      placementId: "leg-a",
      targetWidthM: 2,
    });
    expect(resized.ok).toBe(true);
    if (!resized.ok) throw new Error(resized.reason.code);
    expect(resized.configuration.placements[0]?.junctionGroupId).toBe("corner");

    const replaced = replaceCabinet({
      ...input,
      cornerReservations,
      placementId: "leg-a",
      targetCabinetDefinitionId: "junction-column-replacement",
    });
    expect(replaced.ok).toBe(true);
    if (!replaced.ok) throw new Error(replaced.reason.code);
    expect(replaced.configuration.placements[0]).toMatchObject({
      id: "leg-a",
      cabinetDefinitionId: "junction-column-replacement",
      junctionGroupId: "corner",
      runAnchor: "start",
    });
  });

  it("maps a candidate cross-wall collision to CANDIDATE_LAYOUT_REJECTED", () => {
    const anchored = definition("anchored", {
      widths: [1, 2],
      runMargin: "contiguous_group_touches",
    });
    const a = placement("a", "anchored", 0, { runAnchor: "end" });
    const b = placement("b", "anchored", 0, {
      wallId: "wall-b",
      runAnchor: "end",
    });
    const input = fixture([anchored], [a, b], {
      shape: "l_shape",
      heightM: 3,
      walls: [
        { id: "wall-a", order: 0, lengthM: 2 },
        { id: "wall-b", order: 1, lengthM: 1 },
      ],
      obstacles: [],
    });
    expectDomainRejection(
      () =>
        resizeCabinet({
          ...input,
          placementId: "a",
          targetWidthM: 2,
        }),
      input.configuration,
      {
        code: "CANDIDATE_LAYOUT_REJECTED",
        placementId: "a",
        cause: "ROOM_SPACE_COLLISION",
      },
    );
  });
});
