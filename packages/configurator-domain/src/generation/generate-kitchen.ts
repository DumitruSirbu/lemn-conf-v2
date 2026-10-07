import type { BodyProbe, BodyProbeFactory } from "../body-probe.js";
import {
  cabinetDepthMmOf,
  type Design,
  type DesignPlacement,
  type DesignWall,
} from "../design.js";
import { toMetres } from "../millimetres.js";
import { findOverflowingPlacementIds } from "../queries/overflowing-placements.js";
import { validateDesignForCatalog } from "../validate-design.js";
import {
  deriveColumns,
  derivePlacementRecords,
  deriveRecordedColumns,
  recomputeVoids,
  type BodyCatalog,
  type BodyDefinition,
  type Column,
  type VoidRecord,
} from "../void-engine.js";
import type { CommandResult } from "../commands/command-result.js";
import { reconcileSuccessfulCommandResult } from "../commands/reconcile-command-result.js";
import type { RejectionReason } from "../commands/rejection.js";
import { insertBody } from "../commands/insert-body.js";
import { setWidth } from "../commands/set-width.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../fixtures/kitchen-l-design.js";
import { TOP_ROW_Y0_MM } from "../push-to-open.js";
import {
  GENERATION_PRIORITIES,
  hobWithItsOwnOvenBuildId,
  planKitchenComposition,
  type GenerationBaseRole,
  type GenerationCoreRole,
  type GenerationRun,
  type KitchenCompositionPlan,
} from "./generation-priorities.js";
import { BOTTLE_CARGO_BUILD_ID } from "./body-choice.js";
import type {
  TwoWallDispatch,
  UGenerationRun,
  UKitchenCompositionPlan,
  UPlannedGenerationBase,
} from "./run-layout.js";
import {
  buildLinearShellDesign,
  buildLShellDesign,
  buildUShellDesign,
  linearShellFloorRuns,
  lShellFloorRuns,
  uShellFloorRuns,
} from "./shell-design.js";
import {
  DOOR_COLUMN_BUILD_ID,
  OVEN_TOWER_BUILD_ID,
  type DeclaredColumnSizes,
  type WidthBoundMm,
} from "./tall-end-rule.js";
import { planUKitchenComposition } from "./u-composition.js";
import {
  hasRoomForATopRow,
  isAnUpperOwedOver,
  WALL_CABINET_BUILD_ID,
  upperBuildIdOver,
  TOP_ROLE,
  TOP_STEP_ID_PREFIX,
  upperRoleOver,
  WALL_ROW_Y0_MM,
  type TopRole,
  type UpperRole,
} from "./upper-policy.js";

/** What a generated kitchen was composed from: the L's or the straight room's two-wall plan, or the
 *  U's three-wall one. Every field `generateKitchen` reads is common to both. */
export type GenerationPlan = KitchenCompositionPlan | UKitchenCompositionPlan;

export type GenerationPlanningReason =
  | {
      readonly code: "DROPPED_FOR_FIT";
      readonly params: Readonly<Record<string, never>>;
    }
  | {
      readonly code: "MINIMUM_NOT_MET";
      readonly params: Readonly<Record<string, never>>;
    }
  | {
      readonly code: "BASE_NOT_PLACED";
      readonly params: Readonly<Record<string, never>>;
    };

export interface LoggedInsertBody {
  readonly type: "insert_body";
  readonly targetVoidId: string;
  readonly buildId: string;
  readonly occurredAt: string;
}

export interface LoggedSetWidth {
  readonly type: "set_width";
  readonly placementId: string;
  readonly widthMm: number;
  readonly occurredAt: string;
}

export type GenerationCommand = LoggedInsertBody | LoggedSetWidth;

/** Every role a log step carries: a planned base, the upper or hood over one, or the top cabinet over an upper. */
export type GenerationStepRole = GenerationBaseRole | UpperRole | TopRole;

export type GenerationStep =
  | {
      readonly id: string;
      readonly role: GenerationStepRole;
      readonly buildId: string;
      readonly status: "placed";
      readonly placementId: string;
      readonly commands: readonly GenerationCommand[];
    }
  | {
      readonly id: string;
      readonly role: GenerationStepRole;
      readonly buildId: string;
      readonly status: "not_placed";
      readonly reason: RejectionReason | GenerationPlanningReason;
      readonly commands: readonly GenerationCommand[];
    };

export interface GenerationLog {
  /** The shell and commands share this timestamp, making the log replayable on its own. */
  readonly occurredAt: string;
  readonly plan: GenerationPlan;
  readonly steps: readonly GenerationStep[];
  readonly commands: readonly GenerationCommand[];
}

export type GenerateKitchenResult =
  | { readonly ok: true; readonly design: Design; readonly log: GenerationLog }
  | {
      readonly ok: false;
      readonly reason: Extract<
        GenerationPlanningReason,
        { readonly code: "MINIMUM_NOT_MET" }
      >;
      readonly log: GenerationLog;
    };

export interface GenerateKitchenInput {
  readonly room: Design["room"];
  readonly occurredAt: string;
  readonly probeAt: BodyProbeFactory;
}

interface GenerationWorld {
  readonly design: Design;
  readonly catalog: BodyCatalog;
  readonly recordedColumns: ReadonlyMap<string, Column>;
  readonly columns: ReadonlyMap<string, Column>;
  readonly voids: readonly VoidRecord[];
}

const EMPTY_PARAMS = {} as const;

/** The shell copies the reference kitchen's settings for every room (`shell-design.ts`), so the
 *  planning depth is known before the shell exists; `refuseAnUnplannedShellDepth` keeps that true. */
const PLANNING_CABINET_DEPTH_MM = cabinetDepthMmOf(KITCHEN_L_DESIGN);

/** The two bodies a generated kitchen may carry an oven in; exactly one oven is carried (ADR 0110 E4). */
const OVEN_BEARING_BUILD_IDS: ReadonlySet<string> = new Set([
  hobWithItsOwnOvenBuildId(),
  OVEN_TOWER_BUILD_ID,
]);

/** A straight room's one wall is handed over beside an empty, zero-capacity wall B, so
 *  `planKitchenComposition` never branches on the shape: zero capacity cuts the reading order at 0
 *  (ADR 0137 decision 7). */
function shellRunsFor(
  room: Design["room"],
): Readonly<Record<TwoWallDispatch, GenerationRun>> {
  if (room.shape === "linear") {
    return {
      A: linearShellFloorRuns(room),
      B: { wall: "B", startMm: 0, endMm: 0 },
    };
  }
  return lShellFloorRuns(room);
}

/** The shell dispatch by room shape, kept to one place. */
function buildShellFor(args: {
  readonly room: Design["room"];
  readonly occurredAt: string;
  readonly plan: GenerationPlan;
}): Design {
  const { room, occurredAt, plan } = args;
  if (isUKitchenPlan(plan)) return buildUShellFor(room, occurredAt, plan);
  if (room.shape === "linear") {
    return buildLinearShellDesign({
      room,
      occurredAt,
      compositionPlan: { floorWidthsMm: plan.floorWidthsMm.A },
    });
  }
  return buildLShellDesign({
    room,
    occurredAt,
    compositionPlan: { floorWidthsMm: plan.floorWidthsMm },
  });
}

/** Whether `plan` is a U's three-wall plan, and so may carry bases on wall C. */
export function isUKitchenPlan(
  plan: GenerationPlan,
): plan is UKitchenCompositionPlan {
  return plan.room.shape === "U";
}

function buildUShellFor(
  room: Design["room"],
  occurredAt: string,
  plan: UKitchenCompositionPlan,
): Design {
  return buildUShellDesign({
    room,
    occurredAt,
    compositionPlan: { floorWidthsMm: plan.floorWidthsMm },
  });
}

/** Composes one deterministic kitchen — an L, a straight run (ADR 0130) or a U — through the same command
 *  and frozen-map funnel as the editor. One probe lease brackets the entire attempt, including a
 *  minimum refusal or a throw. */
export function generateKitchen(
  input: GenerateKitchenInput,
): GenerateKitchenResult {
  const catalog = buildKitchenLBodyCatalog(PLANNING_CABINET_DEPTH_MM);
  const plan = planComposition(input.room, declaredColumnSizes(catalog));
  const shell = buildShellFor({
    room: input.room,
    occurredAt: input.occurredAt,
    plan,
  });
  refuseAnUnplannedShellDepth(shell);
  const lease = input.probeAt(cabinetDepthMmOf(shell));

  return lease.use((probe) => compose({ shell, catalog, plan, probe, input }));
}

function planComposition(
  room: Design["room"],
  columns: DeclaredColumnSizes,
): GenerationPlan {
  if (room.shape === "U") {
    return planUKitchenComposition({
      room,
      runs: uShellFloorRuns(room),
      columns,
    });
  }
  return planKitchenComposition({ room, runs: shellRunsFor(room), columns });
}

/** The block's 600 mm and 2200 mm are the catalogue's, read here and threaded into the rule: a
 *  generation-side copy would be a second authority (ADR 0102). */
export function declaredColumnSizes(catalog: BodyCatalog): DeclaredColumnSizes {
  return {
    columnWidthMm: soleDeclaredWidthMm(catalog, OVEN_TOWER_BUILD_ID),
    doorColumnWidthMm: declaredWidthBoundMm(catalog, DOOR_COLUMN_BUILD_ID),
    columnHeightMm: declaredHeightMm(catalog, OVEN_TOWER_BUILD_ID),
    bottleWidthMm: widestDeclaredWidthMm(catalog, BOTTLE_CARGO_BUILD_ID),
  };
}

function declaredEntry(catalog: BodyCatalog, buildId: string): BodyDefinition {
  const definition = catalog.get(buildId);
  if (!definition) {
    throw new Error(`generateKitchen: the catalogue holds no ${buildId}`);
  }
  return definition;
}

function declaredWidthBoundMm(
  catalog: BodyCatalog,
  buildId: string,
): WidthBoundMm {
  const bound = declaredEntry(catalog, buildId).widthRangesMm?.[0];
  if (!bound) {
    throw new Error(`generateKitchen: ${buildId} declares no width bound`);
  }
  return { minMm: bound.minMm, maxMm: bound.maxMm };
}

function widestDeclaredWidthMm(catalog: BodyCatalog, buildId: string): number {
  const ranges = declaredEntry(catalog, buildId).widthRangesMm;
  if (!ranges || ranges.length === 0) {
    throw new Error(`generateKitchen: ${buildId} declares no width bound`);
  }
  return Math.max(...ranges.map((range) => range.maxMm));
}

function soleDeclaredWidthMm(catalog: BodyCatalog, buildId: string): number {
  const bound = declaredWidthBoundMm(catalog, buildId);
  if (bound.minMm !== bound.maxMm) {
    throw new Error(
      `generateKitchen: ${buildId} declares a width range and not the one width a fixed column has`,
    );
  }
  return bound.minMm;
}

function declaredHeightMm(catalog: BodyCatalog, buildId: string): number {
  const heightMm = declaredEntry(catalog, buildId).nominalHeightMm;
  if (heightMm === undefined) {
    throw new Error(`generateKitchen: ${buildId} declares no height`);
  }
  return heightMm;
}

function refuseAnUnplannedShellDepth(shell: Design): void {
  if (cabinetDepthMmOf(shell) === PLANNING_CABINET_DEPTH_MM) return;
  throw new Error(
    `generateKitchen: the shell stands at ${String(cabinetDepthMmOf(shell))} mm, which is not the depth its plan read the catalogue at`,
  );
}

function compose(args: {
  readonly shell: Design;
  readonly catalog: BodyCatalog;
  readonly plan: GenerationPlan;
  readonly probe: BodyProbe;
  readonly input: GenerateKitchenInput;
}): GenerateKitchenResult {
  let world = loadWorld(args.shell, args.catalog);
  const steps: GenerationStep[] = [];
  const commands: GenerationCommand[] = [];

  if (!args.plan.minimumMet) {
    for (const priority of GENERATION_PRIORITIES) {
      steps.push(
        notPlaced(
          priority.role,
          priority.role,
          priority.buildId,
          minimumReason(),
          [],
        ),
      );
    }
    return refused(args.plan, args.input.occurredAt, steps, commands);
  }

  const plannedBases: readonly UPlannedGenerationBase[] = args.plan.bases;
  const plannedByRole = new Map<GenerationCoreRole, UPlannedGenerationBase>(
    plannedBases
      .filter(
        (
          base,
        ): base is UPlannedGenerationBase & {
          readonly role: GenerationCoreRole;
        } => base.role !== "storage",
      )
      .map((base) => [base.role, base]),
  );
  const placedBaseIds = new Map<string, string>();
  const pendingResizes: {
    readonly stepIndex: number;
    readonly command: LoggedSetWidth;
  }[] = [];

  // Core priorities are logged and attempted in their ruled reading order, even though their
  // columns live on two differently-oriented walls.
  for (const priority of GENERATION_PRIORITIES) {
    const planned = plannedByRole.get(priority.role);
    if (!planned) {
      steps.push(
        notPlaced(
          priority.role,
          priority.role,
          priority.buildId,
          droppedReason(),
          [],
        ),
      );
      continue;
    }
    const applied = insertPlannedBase(
      world,
      planned,
      args.probe,
      args.input.occurredAt,
    );
    world = applied.world;
    commands.push(...applied.commands);
    steps.push(applied.step);
    if (applied.step.status === "placed") {
      placedBaseIds.set(planned.id, applied.step.placementId);
      if (applied.pendingResize) {
        pendingResizes.push({
          stepIndex: steps.length - 1,
          command: applied.pendingResize,
        });
      }
    }
  }

  // Storage is the leftover rule, after all four priority items, and each physical body has one
  // deterministic log row rather than hiding a repeated insertion behind a count.
  for (const planned of plannedBases.filter(
    (base) => base.role === "storage",
  )) {
    const applied = insertPlannedBase(
      world,
      planned,
      args.probe,
      args.input.occurredAt,
    );
    world = applied.world;
    commands.push(...applied.commands);
    steps.push(applied.step);
    if (applied.step.status === "placed") {
      placedBaseIds.set(planned.id, applied.step.placementId);
      if (applied.pendingResize) {
        pendingResizes.push({
          stepIndex: steps.length - 1,
          command: applied.pendingResize,
        });
      }
    }
  }

  // All base inserts precede the possible free-end resizes (revised D4). On wall B this also keeps
  // a still-empty planned neighbour from absorbing the width that belongs at the free end.
  for (const pending of pendingResizes) {
    const resized = runCommand(world, pending.command, args.probe);
    if (!resized.result.ok) {
      throw new Error(
        `generateKitchen: free-end resize refused (${resized.result.reason.code})`,
      );
    }
    world = resized.world;
    commands.push(pending.command);
    const previous = steps[pending.stepIndex];
    if (!previous || previous.status !== "placed") {
      throw new Error("generateKitchen: pending resize has no placed log step");
    }
    steps[pending.stepIndex] = {
      ...previous,
      commands: [...previous.commands, pending.command],
    };
  }

  // Every base is settled before any upper is attempted. A refusal is atomic in `insertBody`, so it
  // is logged and the base beneath it remains byte-identical.
  for (const planned of plannedBases) {
    if (
      !isAnUpperOwedOver(planned, {
        room: args.input.room,
        catalog: args.catalog,
      })
    )
      continue;
    const baseId = placedBaseIds.get(planned.id);
    const upperBuildId = upperBuildIdOver(planned);
    const upperRole = upperRoleOver(planned);
    const upperId = `${upperRole}:${planned.id}`;
    if (!baseId) {
      steps.push(
        notPlaced(upperId, upperRole, upperBuildId, baseAbsentReason(), []),
      );
      continue;
    }
    const base = placementById(world.design, baseId);
    const applied = insertOver(
      world,
      {
        id: upperId,
        role: upperRole,
        buildId: upperBuildId,
        floorMm: WALL_ROW_Y0_MM,
        over: base,
      },
      { probe: args.probe, occurredAt: args.input.occurredAt },
    );
    world = applied.world;
    commands.push(...applied.commands);
    steps.push(applied.step);
  }

  const topRow = insertTopRow(world, steps, {
    room: args.input.room,
    occurredAt: args.input.occurredAt,
    probe: args.probe,
  });
  world = topRow.world;
  commands.push(...topRow.commands);
  steps.push(...topRow.steps);

  const hasMinimum = ["sink", "hob"].every((role) =>
    steps.some((step) => step.id === role && step.status === "placed"),
  );
  if (!hasMinimum)
    return refused(args.plan, args.input.occurredAt, steps, commands);

  if (args.input.room.shape === "U") assertAHoodStandsOverTheHob(steps);
  assertExactlyOneOven(world.design);
  assertGeneratedDesign(world.design, args.catalog);
  return {
    ok: true,
    design: world.design,
    log: {
      occurredAt: args.input.occurredAt,
      plan: args.plan,
      steps,
      commands,
    },
  };
}

function insertPlannedBase(
  world: GenerationWorld,
  planned: UPlannedGenerationBase,
  probe: BodyProbe,
  occurredAt: string,
): {
  readonly world: GenerationWorld;
  readonly step: GenerationStep;
  readonly commands: readonly GenerationCommand[];
  readonly pendingResize?: LoggedSetWidth;
} {
  const target = plannedVoid(
    world.voids,
    planned.wall,
    0,
    planned.startMm,
    planned.endMm,
  );
  const insert: LoggedInsertBody = {
    type: "insert_body",
    targetVoidId: target.id,
    buildId: planned.buildId,
    occurredAt,
  };
  const inserted = runCommand(world, insert, probe);
  if (!inserted.result.ok) {
    return {
      world,
      step: notPlaced(
        planned.id,
        planned.role,
        planned.buildId,
        inserted.result.reason,
        [insert],
      ),
      commands: [insert],
    };
  }
  if (inserted.result.effect.type !== "body_inserted") {
    throw new Error("generateKitchen: insertBody returned a non-insert effect");
  }

  const next = inserted.world;
  const placementId = inserted.result.effect.placementId;
  const placement = placementById(next.design, placementId);
  const logged: GenerationCommand[] = [insert];
  let pendingResize: LoggedSetWidth | undefined;
  if (placement.body.widthMm !== planned.widthMm) {
    const definition = world.catalog.get(planned.buildId);
    if (
      definition?.widthFlex !== "fit" ||
      !isFreeEndBody(planned, world.design.room)
    ) {
      throw new Error(
        `generateKitchen: ${planned.id} received ${String(placement.body.widthMm)} instead of ${String(planned.widthMm)} outside the permitted final fit-body resize`,
      );
    }
    pendingResize = {
      type: "set_width",
      placementId,
      widthMm: planned.widthMm,
      occurredAt,
    };
  }
  return {
    world: next,
    step: placed(
      planned.id,
      planned.role,
      planned.buildId,
      placementId,
      logged,
    ),
    commands: logged,
    ...(pendingResize === undefined ? {} : { pendingResize }),
  };
}

/** One insert into the opening over `over`: the same span, a row's floor, the body that row takes. */
interface InsertOverSpec {
  readonly id: string;
  readonly role: UpperRole | TopRole;
  readonly buildId: string;
  readonly floorMm: number;
  readonly over: DesignPlacement;
}

function insertOver(
  world: GenerationWorld,
  spec: InsertOverSpec,
  when: { readonly probe: BodyProbe; readonly occurredAt: string },
): {
  readonly world: GenerationWorld;
  readonly step: GenerationStep;
  readonly commands: readonly GenerationCommand[];
} {
  const { id, role, buildId, over } = spec;
  const target = plannedVoid(
    world.voids,
    over.wall,
    spec.floorMm,
    over.alongMm - over.body.widthMm / 2,
    over.alongMm + over.body.widthMm / 2,
  );
  const command: LoggedInsertBody = {
    type: "insert_body",
    targetVoidId: target.id,
    buildId,
    occurredAt: when.occurredAt,
  };
  const applied = runCommand(world, command, when.probe);
  if (!applied.result.ok) {
    return {
      world,
      step: notPlaced(id, role, buildId, applied.result.reason, [command]),
      commands: [command],
    };
  }
  if (applied.result.effect.type !== "body_inserted") {
    throw new Error("generateKitchen: insertBody returned a non-insert effect");
  }
  return {
    world: applied.world,
    step: placed(id, role, buildId, applied.result.effect.placementId, [
      command,
    ]),
    commands: [command],
  };
}

/** One top-row cabinet over every upper placed in the wall row (the hood included), in a room tall
 *  enough to hold it. It stands over the upper, so a full-height body has none (ADR 0110 Amendment O9). */
function insertTopRow(
  world: GenerationWorld,
  steps: readonly GenerationStep[],
  input: {
    readonly room: Design["room"];
    readonly occurredAt: string;
    readonly probe: BodyProbe;
  },
): {
  readonly world: GenerationWorld;
  readonly steps: readonly GenerationStep[];
  readonly commands: readonly GenerationCommand[];
} {
  const topSteps: GenerationStep[] = [];
  const commands: GenerationCommand[] = [];
  let current = world;
  if (!hasRoomForATopRow(input.room)) {
    return { world, steps: topSteps, commands };
  }
  for (const upper of steps.filter(isAPlacedUpper)) {
    const applied = insertOver(
      current,
      {
        id: `${TOP_STEP_ID_PREFIX}${upper.id}`,
        role: TOP_ROLE,
        buildId: WALL_CABINET_BUILD_ID,
        floorMm: TOP_ROW_Y0_MM,
        over: placementById(current.design, upper.placementId),
      },
      { probe: input.probe, occurredAt: input.occurredAt },
    );
    current = applied.world;
    commands.push(...applied.commands);
    topSteps.push(applied.step);
  }
  return { world: current, steps: topSteps, commands };
}

function isAPlacedUpper(
  step: GenerationStep,
): step is Extract<GenerationStep, { readonly status: "placed" }> {
  return (
    step.status === "placed" && (step.role === "upper" || step.role === "hood")
  );
}

function runCommand(
  world: GenerationWorld,
  command: GenerationCommand,
  probe: BodyProbe,
): { readonly world: GenerationWorld; readonly result: CommandResult } {
  const result =
    command.type === "insert_body"
      ? insertBody({
          design: world.design,
          catalog: world.catalog,
          columns: world.recordedColumns,
          voids: world.voids,
          target: { kind: "void", id: command.targetVoidId },
          buildId: command.buildId,
          probe,
          occurredAt: command.occurredAt,
        })
      : setWidth({
          design: world.design,
          catalog: world.catalog,
          columns: world.recordedColumns,
          target: { kind: "placement", id: command.placementId },
          widthMm: command.widthMm,
          probe,
          occurredAt: command.occurredAt,
        });
  return {
    world: result.ok ? applySuccessfulResult(world, result) : world,
    result,
  };
}

function loadWorld(design: Design, catalog: BodyCatalog): GenerationWorld {
  const records = derivePlacementRecords(design, catalog);
  const recordedColumns = deriveRecordedColumns(
    records,
    design,
    toMetres(design.room.widthMm),
  );
  const columns = deriveColumns(records, design, design.room);
  return {
    design,
    catalog,
    recordedColumns,
    columns,
    voids: recomputeVoids(records, columns),
  };
}

function applySuccessfulResult(
  world: GenerationWorld,
  result: Extract<CommandResult, { readonly ok: true }>,
): GenerationWorld {
  const reconciled = reconcileSuccessfulCommandResult({
    result,
    catalog: world.catalog,
    previousRecordedColumns: world.recordedColumns,
  });
  return {
    design: reconciled.design,
    catalog: world.catalog,
    recordedColumns: reconciled.recordedColumns,
    columns: reconciled.columns,
    voids: reconciled.voids,
  };
}

function plannedVoid(
  voids: readonly VoidRecord[],
  wall: DesignWall,
  y0Mm: number,
  startMm: number,
  endMm: number,
): VoidRecord {
  const found = voids.find((candidate) => {
    if (candidate.wall !== wall || Math.round(candidate.y0 * 1000) !== y0Mm)
      return false;
    const candidateStartMm = Math.round(
      (alongM(candidate, wall) - candidate.w / 2) * 1000,
    );
    const candidateEndMm = Math.round(
      (alongM(candidate, wall) + candidate.w / 2) * 1000,
    );
    return candidateStartMm === startMm && candidateEndMm >= endMm;
  });
  if (!found) {
    throw new Error(
      `generateKitchen: no ${wall} opening covers [${String(startMm)}, ${String(endMm)}] at ${String(y0Mm)}`,
    );
  }
  return found;
}

function alongM(record: VoidRecord, wall: DesignWall): number {
  return wall === "A" ? record.x : record.z;
}

function isFreeEndBody(
  planned: UPlannedGenerationBase,
  room: Design["room"],
): boolean {
  const run = floorRunOf(room, planned.wall);
  return run.endMm - planned.endMm <= 200;
}

/** The floor run `wall` of `room` was planned against: a U's three, or the L's and the straight
 *  room's two. Wall C exists in a U alone. */
function floorRunOf(room: Design["room"], wall: DesignWall): UGenerationRun {
  if (room.shape === "U") return uShellFloorRuns(room)[wall];
  if (wall === "C") {
    throw new Error(`generateKitchen: a ${room.shape} room has no wall C`);
  }
  return shellRunsFor(room)[wall];
}

function placementById(design: Design, id: string): DesignPlacement {
  const placement = design.placements.find((candidate) => candidate.id === id);
  if (!placement)
    throw new Error(
      `generateKitchen: command reported missing placement ${id}`,
    );
  return placement;
}

/** Exactly one oven, never two and never zero (ADR 0110 Amendment E4). Zero means a planned column was
 *  refused after the hob gave its oven up: a programming error, so it throws rather than ships. */
function assertExactlyOneOven(design: Design): void {
  const ovenCount = design.placements.filter((placement) =>
    OVEN_BEARING_BUILD_IDS.has(placement.body.buildId),
  ).length;
  if (ovenCount === 1) return;
  throw new Error(
    `generateKitchen: a generated kitchen carries exactly one oven and this one carries ${String(ovenCount)}`,
  );
}

/** The hood over the hob is mandatory in every U (ADR 0110 *N3 revised* 11); a refused hood throws, as
 *  a missing oven does. */
function assertAHoodStandsOverTheHob(steps: readonly GenerationStep[]): void {
  const hood = steps.find((step) => step.role === "hood");
  if (hood?.status === "placed") return;
  throw new Error(
    "generateKitchen: a U's hob has no hood over it, and the hood is mandatory in every U",
  );
}

function assertGeneratedDesign(design: Design, catalog: BodyCatalog): void {
  const findings = validateDesignForCatalog(design, catalog);
  const overflowing = findOverflowingPlacementIds(design);
  if (findings.length > 0 || overflowing.length > 0) {
    throw new Error(
      `generateKitchen: generated invariant failed (${findings.map((finding) => finding.code).join(",")}; overflow ${overflowing.join(",")})`,
    );
  }
}

function placed(
  id: string,
  role: GenerationStep["role"],
  buildId: string,
  placementId: string,
  commands: readonly GenerationCommand[],
): GenerationStep {
  return { id, role, buildId, status: "placed", placementId, commands };
}

function notPlaced(
  id: string,
  role: GenerationStep["role"],
  buildId: string,
  reason: RejectionReason | GenerationPlanningReason,
  commands: readonly GenerationCommand[],
): GenerationStep {
  return { id, role, buildId, status: "not_placed", reason, commands };
}

function droppedReason(): GenerationPlanningReason {
  return { code: "DROPPED_FOR_FIT", params: EMPTY_PARAMS };
}

function minimumReason(): Extract<
  GenerationPlanningReason,
  { readonly code: "MINIMUM_NOT_MET" }
> {
  return { code: "MINIMUM_NOT_MET", params: EMPTY_PARAMS };
}

function baseAbsentReason(): GenerationPlanningReason {
  return { code: "BASE_NOT_PLACED", params: EMPTY_PARAMS };
}

function refused(
  plan: GenerationPlan,
  occurredAt: string,
  steps: readonly GenerationStep[],
  commands: readonly GenerationCommand[],
): GenerateKitchenResult {
  return {
    ok: false,
    reason: minimumReason(),
    log: { occurredAt, plan, steps, commands },
  };
}

/** Replays the exact command sequence recorded by production through the same frozen-map funnel. */
export function replayGenerationLog(input: {
  readonly log: GenerationLog;
  readonly probeAt: BodyProbeFactory;
}): Design {
  const shell = buildShellFor({
    room: input.log.plan.room,
    occurredAt: input.log.occurredAt,
    plan: input.log.plan,
  });
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(shell));
  const lease = input.probeAt(cabinetDepthMmOf(shell));
  return lease.use(
    (probe) =>
      input.log.commands.reduce(
        (world, command) => runCommand(world, command, probe).world,
        loadWorld(shell, catalog),
      ).design,
  );
}
