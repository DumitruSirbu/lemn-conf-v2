// The design an adaptation is working on, with the maps the editor's commands read beside it, and the two commands
// adaptation uses: removing a body and inserting one. The same loop `generateKitchen` runs (ADR 0110 decision 2):
// every change goes through `removePlacement` or `insertBody` and is reconciled by the editor's own funnel, so a
// preset has no privileged path to a document (ADR 0109 decision 3). Unlike generation, the funnel keeps the editor's
// merge and split limits: a preset's own wide empty spaces must come out as they went in.

import type { BodyProbe } from "../body-probe.js";
import { insertBody } from "../commands/insert-body.js";
import { reconcileSuccessfulCommandResult } from "../commands/reconcile-command-result.js";
import { removePlacement } from "../commands/remove-placement.js";
import type { CommandSuccess } from "../commands/command-result.js";
import type { Design } from "../design.js";
import { toMetres } from "../millimetres.js";
import {
  deriveColumns,
  derivePlacementRecords,
  deriveRecordedColumns,
  projectFrozenMap,
  recomputeVoids,
  withFrozenMap,
  type BodyCatalog,
  type Column,
  type PlacementRecord,
  type PlannedBoundariesMm,
  type VoidRecord,
} from "../void-engine.js";

export interface PresetWorld {
  readonly design: Design;
  readonly catalog: BodyCatalog;
  readonly records: readonly PlacementRecord[];
  /** The room-independent face a command replaces (ADR 0090 Amendment B). */
  readonly recordedColumns: ReadonlyMap<string, Column>;
  /** The wall-bounded face: the openings are cut from it. */
  readonly columns: ReadonlyMap<string, Column>;
  readonly voids: readonly VoidRecord[];
  /** The edges between tiles that were planned apart, which the merge never joins across (ADR 0167 D6). */
  readonly plannedBoundaries: PlannedBoundariesMm;
}

export type WorldStep =
  | { readonly ok: true; readonly world: PresetWorld }
  | { readonly ok: false; readonly refusalCode: string };

export interface InsertedStep {
  readonly world: PresetWorld;
  readonly placementId: string;
}

export type InsertStep =
  | ({ readonly ok: true } & InsertedStep)
  | { readonly ok: false; readonly refusalCode: string };

export interface PresetWorldInput {
  readonly design: Design;
  readonly catalog: BodyCatalog;
  readonly plannedBoundaries?: PlannedBoundariesMm;
}

/** The world as the editor loads `design`. */
export function loadPresetWorld(input: PresetWorldInput): PresetWorld {
  const { design, catalog } = input;
  const plannedBoundaries = input.plannedBoundaries ?? new Map();
  const records = derivePlacementRecords(design, catalog);
  const recordedColumns = deriveRecordedColumns(
    records,
    design,
    toMetres(design.room.widthMm),
    undefined,
    plannedBoundaries,
  );
  const columns = deriveColumns(
    records,
    design,
    design.room,
    undefined,
    plannedBoundaries,
  );
  return {
    design,
    catalog,
    records,
    recordedColumns,
    columns,
    voids: recomputeVoids(records, columns),
    plannedBoundaries,
  };
}

export function afterRemoving(
  world: PresetWorld,
  input: { readonly placementId: string; readonly occurredAt: string },
): WorldStep {
  const result = removePlacement({
    design: world.design,
    catalog: world.catalog,
    target: { kind: "placement", id: input.placementId },
    occurredAt: input.occurredAt,
  });
  return result.ok
    ? { ok: true, world: reconciled(world, result) }
    : { ok: false, refusalCode: result.reason.code };
}

export function afterInserting(
  world: PresetWorld,
  input: {
    readonly voidId: string;
    readonly buildId: string;
    readonly probe: BodyProbe;
    readonly occurredAt: string;
  },
): InsertStep {
  const result = insertBody({
    design: world.design,
    catalog: world.catalog,
    columns: world.recordedColumns,
    voids: world.voids,
    target: { kind: "void", id: input.voidId },
    buildId: input.buildId,
    probe: input.probe,
    occurredAt: input.occurredAt,
  });
  if (!result.ok) return { ok: false, refusalCode: result.reason.code };
  return {
    ok: true,
    world: reconciled(world, result),
    placementId: result.effect.placementId,
  };
}

function reconciled(world: PresetWorld, result: CommandSuccess): PresetWorld {
  const next = reconcileSuccessfulCommandResult({
    result,
    catalog: world.catalog,
    previousRecordedColumns: world.recordedColumns,
    plannedBoundaries: world.plannedBoundaries,
  });
  return {
    design: next.design,
    catalog: world.catalog,
    records: next.records,
    recordedColumns: next.recordedColumns,
    columns: next.columns,
    voids: next.voids,
    plannedBoundaries: world.plannedBoundaries,
  };
}

/** The world's design with its frozen map as the editor's own load derives it (merge uncapped, no planned
 *  boundaries): the only map a customer sees. It moves no placement. */
export function inTheEditorsCanonicalForm(world: PresetWorld): Design {
  const records = derivePlacementRecords(world.design, world.catalog);
  const recordedColumns = deriveRecordedColumns(
    records,
    world.design,
    toMetres(world.design.room.widthMm),
  );
  return withFrozenMap(
    world.design,
    projectFrozenMap(recordedColumns, records),
  );
}
