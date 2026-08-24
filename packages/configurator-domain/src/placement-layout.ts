import {
  type CabinetDefinition,
  type ConfigurationValidationContext,
  type KitchenConfiguration,
  type Placement,
  type RunAnchor,
  type VerticalBand,
  createCabinetDefinitionSchema,
  createKitchenConfigurationSchema,
  metresToGridUnits,
} from "./schemas.js";

export interface PlacementWallInterval {
  placementId: string;
  wallId: Placement["wallId"];
  verticalBand: VerticalBand;
  runAnchor: RunAnchor;
  startUnits: bigint;
  endUnits: bigint;
}

/** `anchored` identifies fixed non-column start/end placement blockers. */
export type ReservationKind = "corner" | "column" | "obstacle" | "anchored";

export interface ReservationContributor {
  kind: ReservationKind;
  sourceId: string;
}

export interface PlacementLayoutReservation {
  forPlacementId: string;
  wallId: Placement["wallId"];
  verticalBand: VerticalBand;
  startUnits: bigint;
  endUnits: bigint;
  contributors: readonly ReservationContributor[];
}

export interface PlacementLayoutRawReservation {
  forPlacementId: string;
  wallId: Placement["wallId"];
  verticalBand: VerticalBand;
  startUnits: bigint;
  endUnits: bigint;
  contributor: ReservationContributor;
}

export interface UsableWallSegment {
  forPlacementId: string;
  wallId: Placement["wallId"];
  verticalBand: VerticalBand;
  startUnits: bigint;
  endUnits: bigint;
}

export interface PlacementRoomOccupancy {
  placementId: string;
  wallId: Placement["wallId"];
  verticalBand: VerticalBand;
  runAnchor: RunAnchor;
  intervalStartUnits: bigint;
  intervalEndUnits: bigint;
  bounds: {
    minXUnits: bigint;
    maxXUnits: bigint;
    minYUnits: bigint;
    maxYUnits: bigint;
    minZUnits: bigint;
    maxZUnits: bigint;
  };
}

export type PlacementLayoutPreOccupancyErrorCode =
  | "INVALID_CONTEXT"
  | "INVALID_CONFIGURATION"
  | "INVALID_CORNER_RESERVATION"
  | "MISSING_CORNER_RESERVATION"
  | "ANCHOR_RULE_CONFLICT"
  | "VERTICAL_OVERFLOW"
  | "PLACEMENT_BLOCKED"
  | "PLACEMENT_OVERLAP"
  | "NO_FIT";

export type PlacementLayoutErrorCode =
  | PlacementLayoutPreOccupancyErrorCode
  | "ROOM_SPACE_COLLISION";

export type PlacementLayoutError =
  | {
      code: PlacementLayoutPreOccupancyErrorCode;
      placementId?: string;
    }
  | {
      code: "ROOM_SPACE_COLLISION";
      placementIds: readonly [string, string];
    };

export type PlacementLayoutResult =
  | {
      ok: true;
      intervals: readonly PlacementWallInterval[];
      rawReservations: readonly PlacementLayoutRawReservation[];
      reservations: readonly PlacementLayoutReservation[];
      usableSegments: readonly UsableWallSegment[];
      occupancies: readonly PlacementRoomOccupancy[];
    }
  | {
      ok: false;
      error: PlacementLayoutError;
    };

export interface PlacementLayoutInput {
  configuration: unknown;
  validationContext: ConfigurationValidationContext;
  cornerReservations?: readonly ExplicitCornerReservation[];
}

export interface ExplicitCornerReservation {
  sourceId: string;
  wallId: Placement["wallId"];
  verticalBands: readonly VerticalBand[];
  startUnits: bigint;
  endUnits: bigint;
}

interface UnitInterval {
  start: bigint;
  end: bigint;
}

interface UnitReservation extends UnitInterval {
  contributors: ReservationContributor[];
}

interface ResolvedPlacement {
  placement: Placement;
  definition: CabinetDefinition;
  width: bigint;
}

const bandBottomM: Readonly<Record<VerticalBand, number>> = {
  base: 0,
  middle: 1.5,
  top: 2.2,
  column: 0,
};
const bandOrder: Readonly<Record<VerticalBand, number>> = {
  base: 0,
  middle: 1,
  top: 2,
  column: 3,
};
const bandCeilingM: Readonly<Partial<Record<VerticalBand, number>>> = {
  middle: 2.2,
  top: 2.6,
};
const projectedColumnBands = ["base", "middle", "top"] as const;
const reservationKindOrder: Readonly<Record<ReservationKind, number>> = {
  corner: 0,
  column: 1,
  obstacle: 2,
  anchored: 3,
};

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function overlaps(left: UnitInterval, right: UnitInterval): boolean {
  return left.start < right.end && right.start < left.end;
}

function partitionKey(
  wallId: Placement["wallId"],
  band: VerticalBand,
  anchor: RunAnchor,
): string {
  return `${wallId}:${band}:${anchor}`;
}

function staticBandKey(
  wallId: Placement["wallId"],
  band: VerticalBand,
): string {
  return `${wallId}:${band}`;
}

function failure(
  code: PlacementLayoutPreOccupancyErrorCode,
  placementId?: string,
): PlacementLayoutResult {
  return {
    ok: false,
    error: placementId === undefined ? { code } : { code, placementId },
  };
}

function collisionFailure(
  leftPlacementId: string,
  rightPlacementId: string,
): PlacementLayoutResult {
  return {
    ok: false,
    error: {
      code: "ROOM_SPACE_COLLISION",
      placementIds: [leftPlacementId, rightPlacementId],
    },
  };
}

function validateMarginPartition(
  placements: readonly ResolvedPlacement[],
  anchor: "start" | "end",
): string | undefined {
  if (placements.length === 0) return undefined;
  const marginOwnerIndex = anchor === "start" ? 0 : placements.length - 1;
  const marginKinds = new Set(
    placements.map(({ definition }) => definition.placementRules.runMargin),
  );
  if (marginKinds.size > 1) return placements[0]?.placement.id;
  if (
    placements.some(
      ({ definition }, index) =>
        definition.placementRules.runMargin === "placement_touches" &&
        index !== marginOwnerIndex,
    )
  ) {
    return placements.find(
      ({ definition }, index) =>
        definition.placementRules.runMargin === "placement_touches" &&
        index !== marginOwnerIndex,
    )?.placement.id;
  }
  return undefined;
}

function obstacleReservations(
  configuration: KitchenConfiguration,
  resolved: ResolvedPlacement,
  wallLength: bigint,
  unitM: number,
  validationContext: ConfigurationValidationContext,
): UnitReservation[] | undefined {
  const profile = validationContext.layoutPolicy.obstacleRules.find(
    ({ id }) =>
      id === resolved.definition.placementRules.obstacleClearanceProfileId,
  );
  if (profile === undefined) return undefined;
  const bottom = metresToGridUnits(
    bandBottomM[resolved.placement.verticalBand],
    unitM,
  );
  const height = metresToGridUnits(resolved.definition.heightM, unitM);
  if (bottom === undefined || height === undefined) return undefined;
  const top = bottom + height;
  const reservations: UnitReservation[] = [];

  for (const obstacle of configuration.room.obstacles) {
    if (obstacle.wallId !== resolved.placement.wallId) continue;
    const clearance = profile[obstacle.kind];
    const offset = metresToGridUnits(obstacle.offsetM, unitM);
    const width = metresToGridUnits(obstacle.widthM, unitM);
    const obstacleBottom = metresToGridUnits(obstacle.bottomElevationM, unitM);
    const obstacleHeight = metresToGridUnits(obstacle.heightM, unitM);
    const before = metresToGridUnits(clearance.beforeM, unitM);
    const after = metresToGridUnits(clearance.afterM, unitM);
    const below = metresToGridUnits(clearance.belowM, unitM);
    const above = metresToGridUnits(clearance.aboveM, unitM);
    if (
      offset === undefined ||
      width === undefined ||
      obstacleBottom === undefined ||
      obstacleHeight === undefined ||
      before === undefined ||
      after === undefined ||
      below === undefined ||
      above === undefined
    ) {
      return undefined;
    }
    const expandedBottom = obstacleBottom - below;
    const expandedTop = obstacleBottom + obstacleHeight + above;
    if (!(bottom < expandedTop && expandedBottom < top)) continue;
    const start = offset > before ? offset - before : 0n;
    const rawEnd = offset + width + after;
    const end = rawEnd < wallLength ? rawEnd : wallLength;
    if (start < end) {
      reservations.push({
        start,
        end,
        contributors: [{ kind: "obstacle", sourceId: obstacle.id }],
      });
    }
  }
  return reservations;
}

function compareContributors(
  left: ReservationContributor,
  right: ReservationContributor,
): number {
  return left.kind === right.kind
    ? compareCodeUnits(left.sourceId, right.sourceId)
    : reservationKindOrder[left.kind] - reservationKindOrder[right.kind];
}

function compareContributorSequences(
  left: readonly ReservationContributor[],
  right: readonly ReservationContributor[],
): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftContributor = left[index];
    const rightContributor = right[index];
    if (leftContributor === undefined || rightContributor === undefined) break;
    const comparison = compareContributors(leftContributor, rightContributor);
    if (comparison !== 0) return comparison;
  }
  return left.length - right.length;
}

function mergedReservations(
  intervals: readonly UnitReservation[],
): UnitReservation[] {
  const sorted = [...intervals].sort((left, right) =>
    left.start === right.start
      ? left.end < right.end
        ? -1
        : left.end > right.end
          ? 1
          : compareContributors(
              left.contributors[0] ?? { kind: "corner", sourceId: "" },
              right.contributors[0] ?? { kind: "corner", sourceId: "" },
            )
      : left.start < right.start
        ? -1
        : 1,
  );
  const merged: UnitReservation[] = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (previous !== undefined && interval.start <= previous.end) {
      if (interval.end > previous.end) previous.end = interval.end;
      const contributors = new Map(
        [...previous.contributors, ...interval.contributors].map(
          (contributor) => [
            `${contributor.kind}:${contributor.sourceId}`,
            contributor,
          ],
        ),
      );
      previous.contributors = [...contributors.values()].sort(
        compareContributors,
      );
    } else {
      merged.push({
        ...interval,
        contributors: [...interval.contributors].sort(compareContributors),
      });
    }
  }
  return merged;
}

function usableSegments(
  reservations: readonly UnitReservation[],
  wallLength: bigint,
): UnitInterval[] {
  const segments: UnitInterval[] = [];
  let cursor = 0n;
  for (const reservation of reservations) {
    if (cursor < reservation.start) {
      segments.push({ start: cursor, end: reservation.start });
    }
    cursor = reservation.end;
  }
  if (cursor < wallLength) segments.push({ start: cursor, end: wallLength });
  return segments;
}

function deriveOccupancies(
  intervals: readonly PlacementWallInterval[],
  configuration: KitchenConfiguration,
  definitions: ReadonlyMap<string, CabinetDefinition>,
  wallLengths: ReadonlyMap<Placement["wallId"], bigint | undefined>,
  unitM: number,
): PlacementRoomOccupancy[] | undefined {
  const placements = new Map(
    configuration.placements.map((placement) => [placement.id, placement]),
  );
  const wallALength = wallLengths.get("wall-a");
  const wallBLength = wallLengths.get("wall-b");
  if (wallALength === undefined) return undefined;

  const occupancies: PlacementRoomOccupancy[] = [];
  for (const interval of intervals) {
    const placement = placements.get(interval.placementId);
    const definition =
      placement === undefined
        ? undefined
        : definitions.get(placement.cabinetDefinitionId);
    const depth =
      definition === undefined
        ? undefined
        : metresToGridUnits(definition.depthM, unitM);
    const height =
      definition === undefined
        ? undefined
        : metresToGridUnits(definition.heightM, unitM);
    const minY = metresToGridUnits(bandBottomM[interval.verticalBand], unitM);
    if (
      placement === undefined ||
      depth === undefined ||
      height === undefined ||
      minY === undefined
    ) {
      return undefined;
    }

    const common = {
      placementId: interval.placementId,
      wallId: interval.wallId,
      verticalBand: interval.verticalBand,
      runAnchor: interval.runAnchor,
      intervalStartUnits: interval.startUnits,
      intervalEndUnits: interval.endUnits,
    };
    const yBounds = { minYUnits: minY, maxYUnits: minY + height };
    switch (interval.wallId) {
      case "wall-a":
        occupancies.push({
          ...common,
          bounds: {
            minXUnits: interval.startUnits,
            maxXUnits: interval.endUnits,
            ...yBounds,
            minZUnits: 0n,
            maxZUnits: depth,
          },
        });
        break;
      case "wall-b":
        if (wallBLength === undefined) return undefined;
        occupancies.push({
          ...common,
          bounds: {
            minXUnits: 0n,
            maxXUnits: depth,
            ...yBounds,
            minZUnits: wallBLength - interval.endUnits,
            maxZUnits: wallBLength - interval.startUnits,
          },
        });
        break;
      case "wall-c":
        occupancies.push({
          ...common,
          bounds: {
            minXUnits: wallALength - depth,
            maxXUnits: wallALength,
            ...yBounds,
            minZUnits: interval.startUnits,
            maxZUnits: interval.endUnits,
          },
        });
        break;
    }
  }
  return occupancies;
}

function boundsOverlap(
  left: PlacementRoomOccupancy["bounds"],
  right: PlacementRoomOccupancy["bounds"],
): boolean {
  return (
    left.minXUnits < right.maxXUnits &&
    right.minXUnits < left.maxXUnits &&
    left.minYUnits < right.maxYUnits &&
    right.minYUnits < left.maxYUnits &&
    left.minZUnits < right.maxZUnits &&
    right.minZUnits < left.maxZUnits
  );
}

export function derivePlacementLayout({
  configuration: configurationInput,
  validationContext,
  cornerReservations: cornerReservationsInput = [],
}: PlacementLayoutInput): PlacementLayoutResult {
  let configurationSchema: ReturnType<typeof createKitchenConfigurationSchema>;
  let definitions: Map<string, CabinetDefinition>;
  try {
    configurationSchema = createKitchenConfigurationSchema(validationContext);
    const definitionSchema = createCabinetDefinitionSchema(
      validationContext.layoutPolicy,
    );
    definitions = new Map(
      validationContext.cabinetDefinitions.map((definition) => {
        const parsed = definitionSchema.parse(definition);
        return [parsed.id, parsed] as const;
      }),
    );
  } catch {
    return failure("INVALID_CONTEXT");
  }
  const parsed = configurationSchema.safeParse(configurationInput);
  if (!parsed.success) return failure("INVALID_CONFIGURATION");
  const configuration = parsed.data;

  const unitM = validationContext.layoutPolicy.manufacturingGrid.unitM;
  const roomHeight = metresToGridUnits(configuration.room.heightM, unitM);
  if (roomHeight === undefined) return failure("INVALID_CONFIGURATION");
  const wallLengths = new Map(
    configuration.room.walls.map((wall) => [
      wall.id,
      metresToGridUnits(wall.lengthM, unitM),
    ]),
  );
  const junctionGroupIds = new Set(
    configuration.placements.flatMap((placement) =>
      placement.junctionGroupId === undefined
        ? []
        : [placement.junctionGroupId],
    ),
  );
  const validBands = new Set<VerticalBand>(["base", "middle", "top", "column"]);
  const reservationIdentities = new Set<string>();
  if (!Array.isArray(cornerReservationsInput)) {
    return failure("INVALID_CORNER_RESERVATION");
  }
  const cornerReservations: ExplicitCornerReservation[] = [];
  for (const reservationInput of cornerReservationsInput as unknown[]) {
    if (typeof reservationInput !== "object" || reservationInput === null) {
      return failure("INVALID_CORNER_RESERVATION");
    }
    const reservation = reservationInput as Partial<ExplicitCornerReservation>;
    const wallId = reservation.wallId;
    const wallLength =
      wallId === undefined ? undefined : wallLengths.get(wallId);
    if (
      typeof reservation.sourceId !== "string" ||
      reservation.sourceId.length === 0 ||
      reservation.sourceId !== reservation.sourceId.trim() ||
      !junctionGroupIds.has(reservation.sourceId) ||
      wallLength === undefined ||
      typeof reservation.startUnits !== "bigint" ||
      typeof reservation.endUnits !== "bigint" ||
      reservation.startUnits < 0n ||
      reservation.startUnits >= reservation.endUnits ||
      reservation.endUnits > wallLength ||
      !Array.isArray(reservation.verticalBands) ||
      reservation.verticalBands.length === 0 ||
      reservation.verticalBands.some(
        (band: unknown) =>
          typeof band !== "string" || !validBands.has(band as VerticalBand),
      ) ||
      new Set(reservation.verticalBands).size !==
        reservation.verticalBands.length
    ) {
      return failure("INVALID_CORNER_RESERVATION");
    }
    const validated = reservation as ExplicitCornerReservation;
    for (const band of validated.verticalBands) {
      const owner = configuration.placements.find(
        (placement) =>
          placement.junctionGroupId === validated.sourceId &&
          placement.wallId === validated.wallId &&
          placement.verticalBand === band,
      );
      const touchesOwnedTerminal =
        owner?.runAnchor === "start"
          ? validated.startUnits === 0n
          : owner?.runAnchor === "end"
            ? validated.endUnits === wallLength
            : false;
      if (!touchesOwnedTerminal) {
        return failure("INVALID_CORNER_RESERVATION");
      }
      const identity = `${validated.sourceId}:${validated.wallId}:${band}`;
      if (reservationIdentities.has(identity)) {
        return failure("INVALID_CORNER_RESERVATION");
      }
      reservationIdentities.add(identity);
    }
    cornerReservations.push(validated);
  }
  for (const placement of configuration.placements) {
    if (
      placement.junctionGroupId !== undefined &&
      !cornerReservations.some(
        (reservation) =>
          reservation.sourceId === placement.junctionGroupId &&
          reservation.wallId === placement.wallId &&
          reservation.verticalBands.includes(placement.verticalBand),
      )
    ) {
      return failure("MISSING_CORNER_RESERVATION", placement.id);
    }
  }
  const resolvedByPartition = new Map<string, ResolvedPlacement[]>();
  for (const placement of configuration.placements) {
    const definition = definitions.get(placement.cabinetDefinitionId);
    const width = metresToGridUnits(placement.widthM, unitM);
    const bottom = metresToGridUnits(
      bandBottomM[placement.verticalBand],
      unitM,
    );
    const height =
      definition === undefined
        ? undefined
        : metresToGridUnits(definition.heightM, unitM);
    const bandCeiling = metresToGridUnits(
      bandCeilingM[placement.verticalBand] ?? configuration.room.heightM,
      unitM,
    );
    if (
      definition === undefined ||
      width === undefined ||
      bottom === undefined ||
      height === undefined ||
      bandCeiling === undefined
    ) {
      return failure("INVALID_CONFIGURATION", placement.id);
    }
    if (bottom + height > roomHeight || bottom + height > bandCeiling) {
      return failure("VERTICAL_OVERFLOW", placement.id);
    }
    const key = partitionKey(
      placement.wallId,
      placement.verticalBand,
      placement.runAnchor,
    );
    const partition = resolvedByPartition.get(key) ?? [];
    partition.push({ placement, definition, width });
    resolvedByPartition.set(key, partition);
  }
  for (const partition of resolvedByPartition.values()) {
    partition.sort(
      (left, right) => left.placement.order - right.placement.order,
    );
  }

  const intervals: PlacementWallInterval[] = [];
  for (const wall of configuration.room.walls) {
    const wallLength = metresToGridUnits(wall.lengthM, unitM);
    if (wallLength === undefined) return failure("INVALID_CONFIGURATION");
    for (const band of ["base", "middle", "top", "column"] as const) {
      const start =
        resolvedByPartition.get(partitionKey(wall.id, band, "start")) ?? [];
      const end =
        resolvedByPartition.get(partitionKey(wall.id, band, "end")) ?? [];
      const invalidStart = validateMarginPartition(start, "start");
      const invalidEnd = validateMarginPartition(end, "end");
      if (invalidStart !== undefined || invalidEnd !== undefined) {
        return failure("ANCHOR_RULE_CONFLICT", invalidStart ?? invalidEnd);
      }
      let cursor = 0n;
      for (const resolved of start) {
        const interval = {
          placementId: resolved.placement.id,
          wallId: wall.id,
          verticalBand: band,
          runAnchor: "start" as const,
          startUnits: cursor,
          endUnits: cursor + resolved.width,
        };
        if (interval.endUnits > wallLength) {
          return failure("NO_FIT", resolved.placement.id);
        }
        cursor = interval.endUnits;
        intervals.push(interval);
      }
      const endWidth = end.reduce((sum, item) => sum + item.width, 0n);
      cursor = wallLength - endWidth;
      if (cursor < 0n) return failure("NO_FIT", end[0]?.placement.id);
      for (const resolved of end) {
        const interval = {
          placementId: resolved.placement.id,
          wallId: wall.id,
          verticalBand: band,
          runAnchor: "end" as const,
          startUnits: cursor,
          endUnits: cursor + resolved.width,
        };
        cursor = interval.endUnits;
        intervals.push(interval);
      }
    }
  }

  for (const placement of configuration.placements) {
    if (placement.junctionGroupId === undefined) continue;
    const interval = intervals.find(
      (candidate) => candidate.placementId === placement.id,
    );
    const wallLength = wallLengths.get(placement.wallId);
    const touchesTerminal =
      interval !== undefined && wallLength !== undefined
        ? placement.runAnchor === "start"
          ? interval.startUnits === 0n
          : placement.runAnchor === "end"
            ? interval.endUnits === wallLength
            : false
        : false;
    if (!touchesTerminal) {
      return failure("ANCHOR_RULE_CONFLICT", placement.id);
    }
  }

  const staticByBand = new Map<string, UnitReservation[]>();
  for (const interval of intervals) {
    const affectedBands =
      interval.verticalBand === "column"
        ? [...projectedColumnBands, "column" as const]
        : [interval.verticalBand];
    for (const band of affectedBands) {
      const key = staticBandKey(interval.wallId, band);
      const reservations = staticByBand.get(key) ?? [];
      reservations.push({
        start: interval.startUnits,
        end: interval.endUnits,
        contributors: [
          {
            kind: interval.verticalBand === "column" ? "column" : "anchored",
            sourceId: interval.placementId,
          },
        ],
      });
      staticByBand.set(key, reservations);
    }
  }
  for (const reservation of cornerReservations) {
    for (const band of reservation.verticalBands) {
      const key = staticBandKey(reservation.wallId, band);
      const reservations = staticByBand.get(key) ?? [];
      reservations.push({
        start: reservation.startUnits,
        end: reservation.endUnits,
        contributors: [{ kind: "corner", sourceId: reservation.sourceId }],
      });
      staticByBand.set(key, reservations);
    }
  }

  const rawPublicReservations: PlacementLayoutRawReservation[] = [];
  const publicReservations: PlacementLayoutReservation[] = [];
  const publicSegments: UsableWallSegment[] = [];
  const addDiagnostics = (
    resolved: ResolvedPlacement,
    rawReservations: readonly UnitReservation[],
    reservations: readonly UnitReservation[],
    wallLength: bigint,
  ) => {
    const { placement } = resolved;
    for (const reservation of rawReservations) {
      for (const contributor of reservation.contributors) {
        rawPublicReservations.push({
          forPlacementId: placement.id,
          wallId: placement.wallId,
          verticalBand: placement.verticalBand,
          startUnits: reservation.start,
          endUnits: reservation.end,
          contributor,
        });
      }
    }
    publicReservations.push(
      ...reservations.map((reservation) => ({
        forPlacementId: placement.id,
        wallId: placement.wallId,
        verticalBand: placement.verticalBand,
        startUnits: reservation.start,
        endUnits: reservation.end,
        contributors: reservation.contributors,
      })),
    );
    publicSegments.push(
      ...usableSegments(reservations, wallLength).map((segment) => ({
        forPlacementId: placement.id,
        wallId: placement.wallId,
        verticalBand: placement.verticalBand,
        startUnits: segment.start,
        endUnits: segment.end,
      })),
    );
  };

  for (const wall of configuration.room.walls) {
    const wallLength = metresToGridUnits(wall.lengthM, unitM);
    if (wallLength === undefined) return failure("INVALID_CONFIGURATION");
    const anchoredOnWall = intervals.filter(
      (interval) => interval.wallId === wall.id,
    );
    for (const interval of anchoredOnWall) {
      const placement = configuration.placements.find(
        ({ id }) => id === interval.placementId,
      );
      if (placement === undefined) return failure("INVALID_CONFIGURATION");
      const definition = definitions.get(placement.cabinetDefinitionId);
      const width = metresToGridUnits(placement.widthM, unitM);
      if (definition === undefined || width === undefined) {
        return failure("INVALID_CONFIGURATION", placement.id);
      }
      const reservations = obstacleReservations(
        configuration,
        { placement, definition, width },
        wallLength,
        unitM,
        validationContext,
      );
      if (reservations === undefined) {
        return failure("INVALID_CONTEXT", placement.id);
      }
      const fixed =
        staticByBand.get(staticBandKey(wall.id, placement.verticalBand)) ?? [];
      const effectiveFixed = fixed.filter(
        (reservation) =>
          !reservation.contributors.some(
            (contributor) =>
              ((contributor.kind === "anchored" ||
                contributor.kind === "column") &&
                contributor.sourceId === placement.id) ||
              (contributor.kind === "corner" &&
                contributor.sourceId === placement.junctionGroupId),
          ),
      );
      const rawReservations = [...effectiveFixed, ...reservations];
      const merged = mergedReservations(rawReservations);
      addDiagnostics(
        { placement, definition, width },
        rawReservations,
        merged,
        wallLength,
      );
      const placementInterval = {
        start: interval.startUnits,
        end: interval.endUnits,
      };
      if (
        effectiveFixed.some((reservation) =>
          overlaps(placementInterval, reservation),
        )
      ) {
        return failure("PLACEMENT_OVERLAP", placement.id);
      }
      if (
        reservations.some((reservation) =>
          overlaps(placementInterval, reservation),
        )
      ) {
        return failure("PLACEMENT_BLOCKED", placement.id);
      }
    }

    for (const band of projectedColumnBands) {
      const flows =
        resolvedByPartition.get(partitionKey(wall.id, band, "flow")) ?? [];
      let cursor = 0n;
      const fixed = staticByBand.get(staticBandKey(wall.id, band)) ?? [];
      for (const resolved of flows) {
        const obstacleIntervals = obstacleReservations(
          configuration,
          resolved,
          wallLength,
          unitM,
          validationContext,
        );
        if (obstacleIntervals === undefined) {
          return failure("INVALID_CONTEXT", resolved.placement.id);
        }
        const effectiveFixed = fixed.filter(
          (reservation) =>
            !reservation.contributors.some(
              (contributor) =>
                contributor.kind === "corner" &&
                contributor.sourceId === resolved.placement.junctionGroupId,
            ),
        );
        const rawReservations = [...effectiveFixed, ...obstacleIntervals];
        const reservations = mergedReservations(rawReservations);
        addDiagnostics(resolved, rawReservations, reservations, wallLength);
        let start = cursor;
        for (const reservation of reservations) {
          if (start + resolved.width <= reservation.start) break;
          if (
            start < reservation.end &&
            reservation.start < start + resolved.width
          ) {
            start = reservation.end;
          }
        }
        const end = start + resolved.width;
        if (end > wallLength) return failure("NO_FIT", resolved.placement.id);
        const interval = {
          placementId: resolved.placement.id,
          wallId: wall.id,
          verticalBand: band,
          runAnchor: "flow" as const,
          startUnits: start,
          endUnits: end,
        };
        cursor = end;
        intervals.push(interval);
      }
    }
  }

  const wallOrder = new Map(
    configuration.room.walls.map((wall) => [wall.id, wall.order]),
  );
  intervals.sort((left, right) => {
    const byWall =
      (wallOrder.get(left.wallId) ?? 0) - (wallOrder.get(right.wallId) ?? 0);
    if (byWall !== 0) return byWall;
    const byBand = bandOrder[left.verticalBand] - bandOrder[right.verticalBand];
    if (byBand !== 0) return byBand;
    if (left.startUnits !== right.startUnits)
      return left.startUnits < right.startUnits ? -1 : 1;
    if (left.endUnits !== right.endUnits)
      return left.endUnits < right.endUnits ? -1 : 1;
    return compareCodeUnits(left.placementId, right.placementId);
  });
  const compareRunPosition = (
    left: {
      forPlacementId: string;
      wallId: Placement["wallId"];
      verticalBand: VerticalBand;
      startUnits: bigint;
      endUnits: bigint;
    },
    right: {
      forPlacementId: string;
      wallId: Placement["wallId"];
      verticalBand: VerticalBand;
      startUnits: bigint;
      endUnits: bigint;
    },
  ): number => {
    const byWall =
      (wallOrder.get(left.wallId) ?? 0) - (wallOrder.get(right.wallId) ?? 0);
    if (byWall !== 0) return byWall;
    const byBand = bandOrder[left.verticalBand] - bandOrder[right.verticalBand];
    if (byBand !== 0) return byBand;
    if (left.startUnits !== right.startUnits)
      return left.startUnits < right.startUnits ? -1 : 1;
    if (left.endUnits !== right.endUnits)
      return left.endUnits < right.endUnits ? -1 : 1;
    return 0;
  };
  rawPublicReservations.sort((left, right) => {
    const byRun = compareRunPosition(left, right);
    if (byRun !== 0) return byRun;
    const byContributor = compareContributors(
      left.contributor,
      right.contributor,
    );
    return byContributor !== 0
      ? byContributor
      : compareCodeUnits(left.forPlacementId, right.forPlacementId);
  });
  publicReservations.sort((left, right) => {
    const byRun = compareRunPosition(left, right);
    if (byRun !== 0) return byRun;
    const byContributor = compareContributorSequences(
      left.contributors,
      right.contributors,
    );
    return byContributor !== 0
      ? byContributor
      : compareCodeUnits(left.forPlacementId, right.forPlacementId);
  });
  publicSegments.sort((left, right) => {
    const byRun = compareRunPosition(left, right);
    return byRun !== 0
      ? byRun
      : compareCodeUnits(left.forPlacementId, right.forPlacementId);
  });
  const occupancies = deriveOccupancies(
    intervals,
    configuration,
    definitions,
    wallLengths,
    unitM,
  );
  if (occupancies === undefined) return failure("INVALID_CONFIGURATION");
  const placementsById = new Map(
    configuration.placements.map((placement) => [placement.id, placement]),
  );
  for (let leftIndex = 0; leftIndex < occupancies.length; leftIndex += 1) {
    const left = occupancies[leftIndex];
    if (left === undefined) continue;
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < occupancies.length;
      rightIndex += 1
    ) {
      const right = occupancies[rightIndex];
      if (right === undefined || left.wallId === right.wallId) continue;
      const leftPlacement = placementsById.get(left.placementId);
      const rightPlacement = placementsById.get(right.placementId);
      const isValidatedJunctionPair =
        leftPlacement?.junctionGroupId !== undefined &&
        leftPlacement.junctionGroupId === rightPlacement?.junctionGroupId;
      if (
        !isValidatedJunctionPair &&
        boundsOverlap(left.bounds, right.bounds)
      ) {
        return collisionFailure(left.placementId, right.placementId);
      }
    }
  }
  return {
    ok: true,
    intervals,
    rawReservations: rawPublicReservations,
    reservations: publicReservations,
    usableSegments: publicSegments,
    occupancies,
  };
}
