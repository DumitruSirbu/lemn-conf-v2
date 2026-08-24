import { describe, expect, it } from "vitest";

import { derivePlacementLayout } from "./placement-layout.js";
import {
  CabinetDefinitionSchema,
  LayoutPolicyExactnessSchema,
  type Placement,
  type VerticalBand,
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
    {
      id: "padded",
      door: { beforeM: 1, afterM: 1, belowM: 0, aboveM: 0 },
      window: { beforeM: 1, afterM: 1, belowM: 0.5, aboveM: 0 },
    },
    {
      id: "vertical",
      door: { beforeM: 0, afterM: 0, belowM: 0, aboveM: 0 },
      window: { beforeM: 0, afterM: 0, belowM: 0.5, aboveM: 0 },
    },
  ],
});

function definition(
  id: string,
  widthM: number,
  verticalBand: VerticalBand = "base",
  runMargin:
    | "unrestricted"
    | "placement_touches"
    | "contiguous_group_touches" = "unrestricted",
  profile = "exact",
  heightM = verticalBand === "column" ? 2.6 : 1,
  depthM = 0.5,
) {
  const family =
    verticalBand === "base"
      ? "base"
      : verticalBand === "column"
        ? "column"
        : "wall";
  return CabinetDefinitionSchema.parse({
    id,
    family,
    verticalBand,
    variant: id,
    supportedWidthRules: [{ kind: "discrete", widthsM: [widthM] }],
    defaultWidthM: widthM,
    heightM,
    depthM,
    rendererKey: id,
    replacementGroup: id,
    layoutRole: "cabinet",
    optionSupport: {
      materialColourPairs: [],
      handleIds: [],
      mechanismIds: [],
    },
    defaultOptions: {},
    pricingRuleId: id,
    placementRules: {
      runMargin,
      corner: "prohibited",
      obstacleClearanceProfileId: profile,
    },
  });
}

function junctionDefinition(
  id: string,
  widthM: number,
  verticalBand: VerticalBand = "base",
  runMargin:
    | "unrestricted"
    | "placement_touches"
    | "contiguous_group_touches" = "unrestricted",
) {
  const base = definition(id, widthM, verticalBand, runMargin);
  return CabinetDefinitionSchema.parse({
    ...base,
    placementRules: { ...base.placementRules, corner: "junction_only" },
  });
}

function placement(
  id: string,
  cabinetDefinitionId: string,
  verticalBand: VerticalBand,
  runAnchor: Placement["runAnchor"],
  order: number,
  widthM: number,
): Placement {
  return {
    id,
    cabinetDefinitionId,
    wallId: "wall-a",
    verticalBand,
    runAnchor,
    order,
    widthM,
    options: {},
  };
}

function input(
  definitions: ReturnType<typeof definition>[],
  placements: Placement[],
  options?: {
    lengthM?: number;
    secondWallLengthM?: number;
    thirdWallLengthM?: number;
    obstacles?: unknown[];
  },
) {
  return {
    configuration: {
      schemaVersion: "1",
      room: {
        shape:
          options?.thirdWallLengthM !== undefined
            ? "u_shape"
            : options?.secondWallLengthM === undefined
              ? "linear"
              : "l_shape",
        heightM: 3,
        walls:
          options?.secondWallLengthM === undefined
            ? [
                {
                  id: "wall-a",
                  order: 0,
                  lengthM: options?.lengthM ?? 10,
                },
              ]
            : [
                {
                  id: "wall-a",
                  order: 0,
                  lengthM: options.lengthM ?? 10,
                },
                {
                  id: "wall-b",
                  order: 1,
                  lengthM: options.secondWallLengthM,
                },
                ...(options.thirdWallLengthM === undefined
                  ? []
                  : [
                      {
                        id: "wall-c" as const,
                        order: 2,
                        lengthM: options.thirdWallLengthM,
                      },
                    ]),
              ],
        obstacles: options?.obstacles ?? [],
      },
      sourcePresetId: "preset",
      placements,
      catalogVersion: "catalog-v1",
      layoutPolicyVersion: "layout-v1",
      pricingVersion: "pricing-v1",
      createdAt: "2026-08-20T12:00:00.000Z",
      updatedAt: "2026-08-20T12:00:00.000Z",
    },
    validationContext: {
      supportedSchemaVersions: ["1"],
      catalogVersion: "catalog-v1",
      pricingVersion: "pricing-v1",
      presetIds: ["preset"],
      layoutPolicy: policy,
      cabinetDefinitions: definitions,
      optionIds: { material: [], colour: [], handle: [], mechanism: [] },
    },
  };
}

function intervalPairs(result: ReturnType<typeof derivePlacementLayout>) {
  if (!result.ok) throw new Error(result.error.code);
  return Object.fromEntries(
    result.intervals.map(({ placementId, startUnits, endUnits }) => [
      placementId,
      [startUnits, endUnits],
    ]),
  );
}

describe("derivePlacementLayout", () => {
  it("packs start and end partitions with canonical end order semantics", () => {
    const one = definition("one", 1, "base", "contiguous_group_touches");
    const two = definition("two", 2, "base", "contiguous_group_touches");
    const result = derivePlacementLayout(
      input(
        [one, two],
        [
          placement("s0", "one", "base", "start", 0, 1),
          placement("s1", "two", "base", "start", 1, 2),
          placement("e0", "two", "base", "end", 0, 2),
          placement("e1", "one", "base", "end", 1, 1),
        ],
      ),
    );
    expect(intervalPairs(result)).toEqual({
      s0: [0n, 10n],
      s1: [10n, 30n],
      e0: [70n, 90n],
      e1: [90n, 100n],
    });
  });

  it("packs flow at the earliest fit across obstacle reservations", () => {
    const flow = definition("flow", 2);
    const result = derivePlacementLayout(
      input(
        [flow],
        [
          placement("f0", "flow", "base", "flow", 0, 2),
          placement("f1", "flow", "base", "flow", 1, 2),
        ],
        {
          obstacles: [
            {
              id: "door",
              kind: "door",
              wallId: "wall-a",
              offsetM: 2,
              widthM: 1,
              heightM: 2,
              bottomElevationM: 0,
            },
          ],
        },
      ),
    );
    expect(intervalPairs(result)).toEqual({ f0: [0n, 20n], f1: [30n, 50n] });
  });

  it("uses definition-specific clearance and clamps expansions to the wall", () => {
    const exact = definition("exact-flow", 1);
    const padded = definition(
      "padded-flow",
      1,
      "base",
      "unrestricted",
      "padded",
    );
    const obstacle = {
      id: "door",
      kind: "door",
      wallId: "wall-a",
      offsetM: 0,
      widthM: 1,
      heightM: 2,
      bottomElevationM: 0,
    };
    expect(
      intervalPairs(
        derivePlacementLayout(
          input(
            [exact, padded],
            [
              placement("exact", "exact-flow", "base", "flow", 0, 1),
              placement("padded", "padded-flow", "base", "flow", 1, 1),
            ],
            { obstacles: [obstacle] },
          ),
        ),
      ),
    ).toEqual({ exact: [10n, 20n], padded: [20n, 30n] });
  });

  it("projects column intervals across all cabinet bands", () => {
    const column = definition("column", 2, "column", "placement_touches");
    const base = definition("base", 1);
    const middle = definition(
      "middle",
      1,
      "middle",
      "unrestricted",
      "exact",
      0.7,
    );
    const top = definition("top", 1, "top", "unrestricted", "exact", 0.4);
    const result = derivePlacementLayout(
      input(
        [column, base, middle, top],
        [
          placement("column", "column", "column", "start", 0, 2),
          placement("base", "base", "base", "flow", 0, 1),
          placement("middle", "middle", "middle", "flow", 0, 1),
          placement("top", "top", "top", "flow", 0, 1),
        ],
      ),
    );
    expect(intervalPairs(result)).toEqual({
      base: [20n, 30n],
      middle: [20n, 30n],
      top: [20n, 30n],
      column: [0n, 20n],
    });
    if (!result.ok) throw new Error("fixture");
    expect(result.intervals.map(({ placementId }) => placementId)).toEqual([
      "base",
      "middle",
      "top",
      "column",
    ]);
  });

  it("uses actual definition height for vertical obstacle overlap", () => {
    const low = definition("low", 1, "base", "unrestricted", "exact", 1);
    const tall = definition("tall", 1, "base", "unrestricted", "exact", 1.1);
    const window = {
      id: "window",
      kind: "window",
      wallId: "wall-a",
      offsetM: 0,
      widthM: 2,
      heightM: 1,
      bottomElevationM: 1,
    };
    expect(
      intervalPairs(
        derivePlacementLayout(
          input(
            [low, tall],
            [
              placement("low", "low", "base", "flow", 0, 1),
              placement("tall", "tall", "base", "flow", 1, 1),
            ],
            { obstacles: [window] },
          ),
        ),
      ),
    ).toEqual({ low: [0n, 10n], tall: [20n, 30n] });
  });

  it("rejects definitions that cross the documented wall-band ceilings", () => {
    const middle = definition(
      "middle",
      1,
      "middle",
      "unrestricted",
      "exact",
      0.8,
    );
    const top = definition("top", 1, "top", "unrestricted", "exact", 0.5);
    expect(
      derivePlacementLayout(
        input(
          [middle, top],
          [placement("middle", "middle", "middle", "flow", 0, 1)],
        ),
      ),
    ).toEqual({
      ok: false,
      error: { code: "VERTICAL_OVERFLOW", placementId: "middle" },
    });
    expect(
      derivePlacementLayout(
        input([middle, top], [placement("top", "top", "top", "flow", 0, 1)]),
      ),
    ).toEqual({
      ok: false,
      error: { code: "VERTICAL_OVERFLOW", placementId: "top" },
    });
  });

  it("rejects anchored obstacle/column conflicts instead of sliding", () => {
    const anchored = definition("anchored", 1, "base", "placement_touches");
    const blocked = derivePlacementLayout(
      input(
        [anchored],
        [placement("anchored", "anchored", "base", "start", 0, 1)],
        {
          obstacles: [
            {
              id: "door",
              kind: "door",
              wallId: "wall-a",
              offsetM: 0,
              widthM: 1,
              heightM: 2,
              bottomElevationM: 0,
            },
          ],
        },
      ),
    );
    expect(blocked).toEqual({
      ok: false,
      error: { code: "PLACEMENT_BLOCKED", placementId: "anchored" },
    });

    const column = definition("column", 1, "column", "placement_touches");
    expect(
      derivePlacementLayout(
        input(
          [anchored, column],
          [
            placement("anchored", "anchored", "base", "start", 0, 1),
            placement("column", "column", "column", "start", 0, 1),
          ],
        ),
      ),
    ).toEqual({
      ok: false,
      error: { code: "PLACEMENT_OVERLAP", placementId: "anchored" },
    });
  });

  it("accepts exact edge contact and fails when no interval fits", () => {
    const flow = definition("flow", 1);
    expect(
      intervalPairs(
        derivePlacementLayout(
          input([flow], [placement("flow", "flow", "base", "flow", 0, 1)], {
            lengthM: 1,
          }),
        ),
      ),
    ).toEqual({ flow: [0n, 10n] });
    expect(
      derivePlacementLayout(
        input([flow], [placement("flow", "flow", "base", "flow", 0, 1)], {
          lengthM: 0.9,
        }),
      ),
    ).toEqual({
      ok: false,
      error: { code: "NO_FIT", placementId: "flow" },
    });
  });

  it("rejects invalid margin groups, junctions, and invalid input fail-closed", () => {
    const touching = definition("touching", 1, "base", "placement_touches");
    expect(
      derivePlacementLayout(
        input(
          [touching],
          [
            placement("one", "touching", "base", "start", 0, 1),
            placement("two", "touching", "base", "start", 1, 1),
          ],
        ),
      ),
    ).toEqual({
      ok: false,
      error: { code: "ANCHOR_RULE_CONFLICT", placementId: "two" },
    });

    const junctionFlow = junctionDefinition(
      "junction-flow",
      1,
      "base",
      "placement_touches",
    );
    const junction = placement(
      "junction",
      "junction-flow",
      "base",
      "start",
      0,
      1,
    );
    junction.junctionGroupId = "junction-1";
    const junctionPair = placement(
      "junction-pair",
      "junction-flow",
      "base",
      "end",
      0,
      1,
    );
    junctionPair.wallId = "wall-b";
    junctionPair.junctionGroupId = "junction-1";
    expect(
      derivePlacementLayout(
        input([junctionFlow], [junction, junctionPair], {
          secondWallLengthM: 5,
        }),
      ),
    ).toEqual({
      ok: false,
      error: {
        code: "MISSING_CORNER_RESERVATION",
        placementId: "junction",
      },
    });
    const flow = definition("flow", 1);
    const invalid = input(
      [flow],
      [placement("flow", "flow", "base", "flow", 0, 1)],
    );
    invalid.configuration.layoutPolicyVersion = "wrong";
    expect(derivePlacementLayout(invalid)).toEqual({
      ok: false,
      error: { code: "INVALID_CONFIGURATION" },
    });
  });

  it("retains sorted contributors when touching reservations are unioned", () => {
    const ownerDefinition = junctionDefinition(
      "owner",
      1,
      "base",
      "placement_touches",
    );
    const columnDefinition = definition(
      "column",
      1,
      "column",
      "placement_touches",
    );
    const flowDefinition = definition("flow", 1);
    const owner = placement("owner", "owner", "base", "start", 0, 1);
    owner.junctionGroupId = "corner-1";
    const ownerPair = placement("owner-pair", "owner", "base", "end", 0, 1);
    ownerPair.wallId = "wall-b";
    ownerPair.junctionGroupId = "corner-1";
    const result = derivePlacementLayout({
      ...input(
        [ownerDefinition, columnDefinition, flowDefinition],
        [
          owner,
          ownerPair,
          placement("column", "column", "column", "end", 0, 1),
          placement("flow", "flow", "base", "flow", 0, 1),
        ],
        {
          lengthM: 5,
          secondWallLengthM: 5,
          obstacles: [
            {
              id: "door",
              kind: "door",
              wallId: "wall-a",
              offsetM: 1,
              widthM: 1,
              heightM: 2,
              bottomElevationM: 0,
            },
          ],
        },
      ),
      cornerReservations: [
        {
          sourceId: "corner-1",
          wallId: "wall-a",
          verticalBands: ["base"],
          startUnits: 0n,
          endUnits: 30n,
        },
        {
          sourceId: "corner-1",
          wallId: "wall-b",
          verticalBands: ["base"],
          startUnits: 40n,
          endUnits: 50n,
        },
      ],
    });
    expect(intervalPairs(result)).toEqual({
      owner: [0n, 10n],
      "owner-pair": [40n, 50n],
      flow: [30n, 40n],
      column: [40n, 50n],
    });
    if (!result.ok) throw new Error("fixture");
    expect(
      result.rawReservations
        .filter(({ forPlacementId }) => forPlacementId === "flow")
        .map(({ startUnits, endUnits, contributor }) => ({
          startUnits,
          endUnits,
          contributor,
        })),
    ).toEqual([
      {
        startUnits: 0n,
        endUnits: 10n,
        contributor: { kind: "anchored", sourceId: "owner" },
      },
      {
        startUnits: 0n,
        endUnits: 30n,
        contributor: { kind: "corner", sourceId: "corner-1" },
      },
      {
        startUnits: 10n,
        endUnits: 20n,
        contributor: { kind: "obstacle", sourceId: "door" },
      },
      {
        startUnits: 40n,
        endUnits: 50n,
        contributor: { kind: "column", sourceId: "column" },
      },
    ]);
    expect(
      result.reservations.filter(
        ({ forPlacementId }) => forPlacementId === "flow",
      ),
    ).toEqual([
      {
        forPlacementId: "flow",
        wallId: "wall-a",
        verticalBand: "base",
        startUnits: 0n,
        endUnits: 30n,
        contributors: [
          { kind: "corner", sourceId: "corner-1" },
          { kind: "obstacle", sourceId: "door" },
          { kind: "anchored", sourceId: "owner" },
        ],
      },
      {
        forPlacementId: "flow",
        wallId: "wall-a",
        verticalBand: "base",
        startUnits: 40n,
        endUnits: 50n,
        contributors: [{ kind: "column", sourceId: "column" }],
      },
    ]);
    expect(
      result.usableSegments.filter(
        ({ forPlacementId }) => forPlacementId === "flow",
      ),
    ).toEqual([
      {
        forPlacementId: "flow",
        wallId: "wall-a",
        verticalBand: "base",
        startUnits: 30n,
        endUnits: 40n,
      },
    ]);
  });

  it("validates explicit junction reservation identity and bounds", () => {
    const flow = junctionDefinition("flow", 1, "base", "placement_touches");
    const linked = placement("linked", "flow", "base", "start", 0, 1);
    linked.junctionGroupId = "corner-1";
    const linkedPair = placement("linked-pair", "flow", "base", "end", 0, 1);
    linkedPair.wallId = "wall-b";
    linkedPair.junctionGroupId = "corner-1";
    const baseInput = input([flow], [linked, linkedPair], {
      secondWallLengthM: 10,
    });
    expect(
      derivePlacementLayout({
        ...baseInput,
        cornerReservations: [
          {
            sourceId: "unknown",
            wallId: "wall-a",
            verticalBands: ["base"],
            startUnits: 10n,
            endUnits: 20n,
          },
        ],
      }),
    ).toEqual({
      ok: false,
      error: { code: "INVALID_CORNER_RESERVATION" },
    });
    expect(
      derivePlacementLayout({
        ...baseInput,
        cornerReservations: [
          {
            sourceId: "corner-1",
            wallId: "wall-a",
            verticalBands: ["base"],
            startUnits: 10n,
            endUnits: 20n,
          },
          {
            sourceId: "corner-1",
            wallId: "wall-b",
            verticalBands: ["base"],
            startUnits: 90n,
            endUnits: 100n,
          },
        ],
      }),
    ).toEqual({
      ok: false,
      error: { code: "INVALID_CORNER_RESERVATION" },
    });
    expect(
      derivePlacementLayout({
        ...baseInput,
        cornerReservations: [
          {
            sourceId: "corner-1",
            wallId: "wall-a",
            verticalBands: ["base", "middle"],
            startUnits: 0n,
            endUnits: 10n,
          },
          {
            sourceId: "corner-1",
            wallId: "wall-b",
            verticalBands: ["base"],
            startUnits: 90n,
            endUnits: 100n,
          },
        ],
      }),
    ).toEqual({
      ok: false,
      error: { code: "INVALID_CORNER_RESERVATION" },
    });
    expect(
      derivePlacementLayout({
        ...baseInput,
        cornerReservations: [
          {
            sourceId: "corner-1",
            wallId: "wall-a",
            verticalBands: ["base"],
            startUnits: 90n,
            endUnits: 110n,
          },
        ],
      }),
    ).toEqual({
      ok: false,
      error: { code: "INVALID_CORNER_RESERVATION" },
    });
    expect(
      derivePlacementLayout({
        ...baseInput,
        cornerReservations: [null] as unknown as [],
      }),
    ).toEqual({
      ok: false,
      error: { code: "INVALID_CORNER_RESERVATION" },
    });
  });

  it("reports a band-incompatible manufacturing grid as invalid context", () => {
    const incompatible = input([], []);
    incompatible.validationContext.layoutPolicy =
      LayoutPolicyExactnessSchema.parse({
        ...policy,
        manufacturingGrid: { unitM: 0.2 },
        obstacleRules: [policy.obstacleRules[0]],
      });
    expect(derivePlacementLayout(incompatible)).toEqual({
      ok: false,
      error: { code: "INVALID_CONTEXT" },
    });
  });

  it("sorts stable IDs by code units and compares complete contributor sequences", () => {
    const ownerBase = junctionDefinition(
      "owner",
      1,
      "base",
      "placement_touches",
    );
    const ownerDefinition = CabinetDefinitionSchema.parse({
      ...ownerBase,
      heightM: 0.1,
    });
    const short = definition("short", 1, "base", "unrestricted", "exact", 0.5);
    const long = definition("long", 1, "base", "unrestricted", "vertical", 0.5);
    const ownerA = placement("owner-a", "owner", "base", "start", 0, 1);
    ownerA.junctionGroupId = "corner";
    const ownerB = placement("owner-b", "owner", "base", "end", 0, 1);
    ownerB.wallId = "wall-b";
    ownerB.junctionGroupId = "corner";
    const result = derivePlacementLayout({
      ...input(
        [ownerDefinition, short, long],
        [
          ownerA,
          ownerB,
          placement("ä-short", "short", "base", "flow", 0, 1),
          placement("z-short", "short", "base", "flow", 1, 1),
          placement("z-long", "long", "base", "flow", 2, 1),
        ],
        {
          secondWallLengthM: 10,
          obstacles: [
            {
              id: "low",
              kind: "window",
              wallId: "wall-a",
              offsetM: 0,
              widthM: 1,
              heightM: 0.4,
              bottomElevationM: 0.1,
            },
            {
              id: "high",
              kind: "window",
              wallId: "wall-a",
              offsetM: 0,
              widthM: 1,
              heightM: 0.5,
              bottomElevationM: 0.5,
            },
          ],
        },
      ),
      cornerReservations: [
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
          startUnits: 90n,
          endUnits: 100n,
        },
      ],
    });
    if (!result.ok) throw new Error(result.error.code);
    expect(
      result.reservations
        .filter(
          ({ startUnits, endUnits, forPlacementId }) =>
            startUnits === 0n &&
            endUnits === 10n &&
            ["ä-short", "z-short", "z-long"].includes(forPlacementId),
        )
        .map(({ forPlacementId }) => forPlacementId),
    ).toEqual(["z-long", "z-short", "ä-short"]);
  });

  it("derives exact canonical A/B/C bigint occupancies without projection duplicates", () => {
    const cabinet = definition("cabinet", 1);
    const b = placement("b", "cabinet", "base", "flow", 0, 1);
    const c = placement("c", "cabinet", "base", "flow", 0, 1);
    b.wallId = "wall-b";
    c.wallId = "wall-c";
    const placements = [placement("a", "cabinet", "base", "flow", 0, 1), b, c];
    const result = derivePlacementLayout(
      input([cabinet], placements, {
        lengthM: 10,
        secondWallLengthM: 5,
        thirdWallLengthM: 6,
      }),
    );
    if (!result.ok) throw new Error(result.error.code);
    expect(result.occupancies).toEqual([
      {
        placementId: "a",
        wallId: "wall-a",
        verticalBand: "base",
        runAnchor: "flow",
        intervalStartUnits: 0n,
        intervalEndUnits: 10n,
        bounds: {
          minXUnits: 0n,
          maxXUnits: 10n,
          minYUnits: 0n,
          maxYUnits: 10n,
          minZUnits: 0n,
          maxZUnits: 5n,
        },
      },
      {
        placementId: "b",
        wallId: "wall-b",
        verticalBand: "base",
        runAnchor: "flow",
        intervalStartUnits: 0n,
        intervalEndUnits: 10n,
        bounds: {
          minXUnits: 0n,
          maxXUnits: 5n,
          minYUnits: 0n,
          maxYUnits: 10n,
          minZUnits: 40n,
          maxZUnits: 50n,
        },
      },
      {
        placementId: "c",
        wallId: "wall-c",
        verticalBand: "base",
        runAnchor: "flow",
        intervalStartUnits: 0n,
        intervalEndUnits: 10n,
        bounds: {
          minXUnits: 95n,
          maxXUnits: 100n,
          minYUnits: 0n,
          maxYUnits: 10n,
          minZUnits: 0n,
          maxZUnits: 10n,
        },
      },
    ]);
  });

  it("uses strict interior overlap so exact cross-wall edge contact is valid", () => {
    const flow = definition("flow", 1);
    const end = definition("end", 1, "base", "placement_touches");
    const a = placement("a", "flow", "base", "flow", 0, 1);
    const b = placement("b", "end", "base", "end", 0, 1);
    b.wallId = "wall-b";
    const withObstacleWidth = (widthM: number) =>
      derivePlacementLayout(
        input([flow, end], [a, b], {
          secondWallLengthM: 5,
          obstacles: [
            {
              id: "door",
              kind: "door",
              wallId: "wall-a",
              offsetM: 0,
              widthM,
              heightM: 1,
              bottomElevationM: 0,
            },
          ],
        }),
      );
    expect(withObstacleWidth(0.5).ok).toBe(true);
    expect(withObstacleWidth(0.4)).toEqual({
      ok: false,
      error: {
        code: "ROOM_SPACE_COLLISION",
        placementIds: ["a", "b"],
      },
    });
  });

  it("respects actual vertical separation and detects column collisions", () => {
    const middle = definition(
      "middle",
      1,
      "middle",
      "unrestricted",
      "exact",
      0.7,
    );
    const baseEnd = definition("base-end", 1, "base", "placement_touches");
    const a = placement("a-middle", "middle", "middle", "flow", 0, 1);
    const b = placement("b-base", "base-end", "base", "end", 0, 1);
    b.wallId = "wall-b";
    expect(
      derivePlacementLayout(
        input([middle, baseEnd], [a, b], { secondWallLengthM: 1 }),
      ).ok,
    ).toBe(true);

    const column = definition("column", 1, "column", "placement_touches");
    const columnA = placement("column-a", "column", "column", "start", 0, 1);
    const columnB = placement("column-b", "column", "column", "end", 0, 1);
    columnB.wallId = "wall-b";
    expect(
      derivePlacementLayout(
        input([column], [columnA, columnB], { secondWallLengthM: 1 }),
      ),
    ).toEqual({
      ok: false,
      error: {
        code: "ROOM_SPACE_COLLISION",
        placementIds: ["column-a", "column-b"],
      },
    });
  });

  it("checks opposing B/C occupancies in U rooms", () => {
    const deep = definition("deep", 1, "base", "unrestricted", "exact", 1, 0.6);
    const b = placement("b", "deep", "base", "flow", 0, 1);
    const c = placement("c", "deep", "base", "flow", 0, 1);
    b.wallId = "wall-b";
    c.wallId = "wall-c";
    expect(
      derivePlacementLayout(
        input([deep], [b, c], {
          lengthM: 1,
          secondWallLengthM: 1,
          thirdWallLengthM: 1,
        }),
      ),
    ).toEqual({
      ok: false,
      error: { code: "ROOM_SPACE_COLLISION", placementIds: ["b", "c"] },
    });
  });

  it("exempts only the validated junction pair and deterministically rejects a third party", () => {
    const ownerDefinition = junctionDefinition(
      "owner",
      1,
      "base",
      "placement_touches",
    );
    const thirdDefinition = definition(
      "third",
      1,
      "base",
      "unrestricted",
      "exact",
      1,
      0.6,
    );
    const a = placement("owner-a", "owner", "base", "start", 0, 1);
    const b = placement("owner-b", "owner", "base", "end", 0, 1);
    a.junctionGroupId = "corner";
    b.junctionGroupId = "corner";
    b.wallId = "wall-b";
    const c = placement("third", "third", "base", "flow", 0, 1);
    c.wallId = "wall-c";
    const cornerReservations = [
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
        startUnits: 0n,
        endUnits: 10n,
      },
    ];
    const makeInput = (placements: Placement[]) => ({
      ...input([ownerDefinition, thirdDefinition], placements, {
        lengthM: 1,
        secondWallLengthM: 1,
        thirdWallLengthM: 1,
      }),
      cornerReservations,
    });
    const pair = derivePlacementLayout(makeInput([a, b]));
    if (!pair.ok) throw new Error(pair.error.code);
    expect(pair.occupancies.map(({ placementId }) => placementId)).toEqual([
      "owner-a",
      "owner-b",
    ]);
    const expected = {
      ok: false,
      error: {
        code: "ROOM_SPACE_COLLISION",
        placementIds: ["owner-a", "third"],
      },
    } as const;
    expect(derivePlacementLayout(makeInput([a, b, c]))).toEqual(expected);
    expect(derivePlacementLayout(makeInput([c, b, a]))).toEqual(expected);
  });

  it("is deterministic across placement-array ordering", () => {
    const flow = definition("flow", 1);
    const placements = [
      placement("second", "flow", "base", "flow", 1, 1),
      placement("first", "flow", "base", "flow", 0, 1),
    ];
    const forward = derivePlacementLayout(input([flow], placements));
    const reverse = derivePlacementLayout(
      input([flow], [...placements].reverse()),
    );
    expect(reverse).toEqual(forward);
  });
});
