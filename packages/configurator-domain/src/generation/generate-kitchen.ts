import type { BodyProbe, BodyProbeFactory } from "../body-probe.js";
import {
  cabinetDepthMmOf,
  type Design,
  type DesignPlacement,
  type DesignWall,
} from "../design.js";
import { findOverflowingPlacementIds } from "../queries/overflowing-placements.js";
import { validateDesignForCatalog } from "../validate-design.js";
import {
  deriveColumns,
  derivePlacementRecords,
  deriveRecordedColumns,
  recomputeVoids,
  type BodyCatalog,
  type Column,
  type VoidRecord,
} from "../void-engine.js";
import type { CommandResult } from "../commands/command-result.js";
import { reconcileSuccessfulCommandResult } from "../commands/reconcile-command-result.js";
import type { RejectionReason } from "../commands/rejection.js";
import { insertBody } from "../commands/insert-body.js";
import { setWidth } from "../commands/set-width.js";
import { buildKitchenLBodyCatalog } from "../fixtures/kitchen-l-design.js";
import {
  GENERATION_PRIORITIES,
  planKitchenComposition,
  type GenerationBaseRole,
  type GenerationCoreRole,
  type KitchenCompositionPlan,
  type PlannedGenerationBase,
} from "./generation-priorities.js";
import { buildLShellDesign, lShellFloorRuns } from "./shell-design.js";

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

export type GenerationStep =
  | {
      readonly id: string;
      readonly role: GenerationBaseRole | "upper" | "hood";
      readonly buildId: string;
      readonly status: "placed";
      readonly placementId: string;
      readonly commands: readonly GenerationCommand[];
    }
  | {
      readonly id: string;
      readonly role: GenerationBaseRole | "upper" | "hood";
      readonly buildId: string;
      readonly status: "not_placed";
      readonly reason: RejectionReason | GenerationPlanningReason;
      readonly commands: readonly GenerationCommand[];
    };

export interface GenerationLog {
  /** The shell and commands share this timestamp, making the log replayable on its own. */
  readonly occurredAt: string;
  readonly plan: KitchenCompositionPlan;
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
const WALL_ROW_Y0_MM = 1500;
const WALL_CABINET_BUILD_ID = "wall-cabinet";
const HOOD_BUILD_ID = "hood";

/** Composes one deterministic L kitchen through the same command and frozen-map funnel as the
 *  editor. One probe lease brackets the entire attempt, including a minimum refusal or a throw. */
export function generateKitchen(
  input: GenerateKitchenInput,
): GenerateKitchenResult {
  const plan = planKitchenComposition({
    room: input.room,
    runs: lShellFloorRuns(input.room),
  });
  const shell = buildLShellDesign({
    room: input.room,
    occurredAt: input.occurredAt,
    compositionPlan: { floorWidthsMm: plan.floorWidthsMm },
  });
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(shell));
  const lease = input.probeAt(cabinetDepthMmOf(shell));

  return lease.use((probe) => compose({ shell, catalog, plan, probe, input }));
}

function compose(args: {
  readonly shell: Design;
  readonly catalog: BodyCatalog;
  readonly plan: KitchenCompositionPlan;
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

  const plannedByRole = new Map<GenerationCoreRole, PlannedGenerationBase>(
    args.plan.bases
      .filter(
        (
          base,
        ): base is PlannedGenerationBase & {
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
  for (const planned of args.plan.bases.filter(
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
  for (const planned of args.plan.bases) {
    if (risesIntoWallRow(args.catalog, planned.buildId)) continue;
    const baseId = placedBaseIds.get(planned.id);
    const upperBuildId =
      planned.role === "hob" ? HOOD_BUILD_ID : WALL_CABINET_BUILD_ID;
    const upperRole = planned.role === "hob" ? "hood" : "upper";
    const upperId = `${upperRole}:${planned.id}`;
    if (!baseId) {
      steps.push(
        notPlaced(upperId, upperRole, upperBuildId, baseAbsentReason(), []),
      );
      continue;
    }
    const base = placementById(world.design, baseId);
    const applied = insertUpper(
      world,
      base,
      upperId,
      upperRole,
      upperBuildId,
      args.probe,
      args.input.occurredAt,
    );
    world = applied.world;
    commands.push(...applied.commands);
    steps.push(applied.step);
  }

  const hasMinimum = ["sink", "hob"].every((role) =>
    steps.some((step) => step.id === role && step.status === "placed"),
  );
  if (!hasMinimum)
    return refused(args.plan, args.input.occurredAt, steps, commands);

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
  planned: PlannedGenerationBase,
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

/** ADR 0110 Amendment E7: an upper is attempted above a base only where the body's declared top is
 *  at or below the wall row's floor. A body that reaches past it — the fridge today, a full-height
 *  column tomorrow — leaves no opening there, and reading the catalogue's declared height rather
 *  than a list of role names means a new full-height body needs no second place to be remembered. */
function risesIntoWallRow(catalog: BodyCatalog, buildId: string): boolean {
  const declaredTopMm = catalog.get(buildId)?.nominalHeightMm;
  if (declaredTopMm === undefined) {
    throw new Error(
      `generateKitchen: ${buildId} declares no height, so no upper can be ruled above it`,
    );
  }
  return declaredTopMm > WALL_ROW_Y0_MM;
}

function insertUpper(
  world: GenerationWorld,
  base: DesignPlacement,
  id: string,
  role: "upper" | "hood",
  buildId: string,
  probe: BodyProbe,
  occurredAt: string,
): {
  readonly world: GenerationWorld;
  readonly step: GenerationStep;
  readonly commands: readonly GenerationCommand[];
} {
  const startMm = base.alongMm - base.body.widthMm / 2;
  const endMm = base.alongMm + base.body.widthMm / 2;
  const target = plannedVoid(
    world.voids,
    base.wall,
    WALL_ROW_Y0_MM,
    startMm,
    endMm,
  );
  const command: LoggedInsertBody = {
    type: "insert_body",
    targetVoidId: target.id,
    buildId,
    occurredAt,
  };
  const applied = runCommand(world, command, probe);
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
  const placementId = applied.result.effect.placementId;
  return {
    world: applied.world,
    step: placed(id, role, buildId, placementId, [command]),
    commands: [command],
  };
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
  const recordedColumns = deriveRecordedColumns(records, design);
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
  planned: PlannedGenerationBase,
  room: Design["room"],
): boolean {
  const run = lShellFloorRuns(room)[planned.wall];
  return run.endMm - planned.endMm <= 200;
}

function placementById(design: Design, id: string): DesignPlacement {
  const placement = design.placements.find((candidate) => candidate.id === id);
  if (!placement)
    throw new Error(
      `generateKitchen: command reported missing placement ${id}`,
    );
  return placement;
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
  plan: KitchenCompositionPlan,
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
  const shell = buildLShellDesign({
    room: input.log.plan.room,
    occurredAt: input.log.occurredAt,
    compositionPlan: { floorWidthsMm: input.log.plan.floorWidthsMm },
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
