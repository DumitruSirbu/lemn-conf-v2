// The cabinet depth as a command: it writes the setting and rebuilds every body at it, in one result.
//
// The rebuild runs through the insert path (`evaluateInsertFit`, the probe, the built-carcass re-check),
// so a body this command writes is one the engine would have accepted. Entries that do not move are
// excluded by reading their declaration (`depthFollowsSetting`), never by naming them.
import {
  alongWallPositionAtMm,
  alongWallShiftByColumnMm,
} from "../along-wall-chain-shift.js";
import { depthFollowsSetting } from "../cabinet-depth-rule.js";
import {
  frozenExtentsSlidAlongTheWall,
  frozenMapAtCabinetDepth,
} from "../frozen-map-at-cabinet-depth.js";
import { seatRuleOf, type SeatRule } from "../seat-rule.js";
import type { BodyProbe, BodyProbeFactory } from "../body-probe.js";
import { cabinetDepthMmOf } from "../design.js";
import type { Design, DesignPlacement } from "../design.js";
import { toMetres, toMillimetres } from "../millimetres.js";
import {
  deriveColumnsOverFrozenExtents,
  deriveRecordedColumns,
  derivePlacementRecords,
  projectFrozenMap,
  withFrozenMap,
  type BodyCatalog,
  type Column,
  type FrozenMapDocument,
  type PlacementRecord,
} from "../void-engine.js";
import {
  declaredCabinetDepthsMm,
  MIN_CABINET_DEPTH_MM,
} from "../worktop-depth.js";
import {
  isValidOccurredAt,
  refuse,
  succeedWith,
  type CabinetDepthSetEffect,
  type CommandResult,
} from "./command-result.js";
import { rebuild } from "./rebuild-resized-bodies.js";
import { resolveRebuildBody } from "./resolve-column-members.js";
import type { RebuildInput } from "./width-resize-model.js";

/** The catalogue is built here from a factory: a `catalog: BodyCatalog` field would let a caller pass 700
 *  with a catalogue built at 600, rebuilding every body to the old depth with the new number beside it. */
export interface SetCabinetDepthInput {
  readonly design: Design;
  readonly catalogAt: (cabinetDepthMm: number) => BodyCatalog;
  readonly cabinetDepthMm: number;
  /** A factory, never a built probe (see `BodyProbeFactory`); leased at the new depth and released on
   *  every path. */
  readonly probeAt: BodyProbeFactory;
  readonly occurredAt: string;
}

export function setCabinetDepth(
  input: SetCabinetDepthInput,
): CommandResult<CabinetDepthSetEffect> {
  const { design } = input;
  if (!isValidOccurredAt(input.occurredAt)) {
    return refuse(design, { code: "INVALID_OCCURRED_AT", params: {} });
  }
  if (!isOfferedCabinetDepthMm(input.cabinetDepthMm)) {
    return refuse(design, { code: "UNKNOWN_CABINET_DEPTH", params: {} });
  }

  // Released by the lease on every path, including a refusal: a kit built per command and never
  // released leaks (ADR 0074 decision 3).
  const rebuilt = input
    .probeAt(input.cabinetDepthMm)
    .use((probe) => rebuildEveryBodyAt(input, probe));
  if (!rebuilt.ok) return refuse(design, rebuilt.detail);

  const deepened: Design = {
    ...design,
    placements: [...rebuilt.value.placements],
    settings: { ...design.settings, cabinetDepthMm: input.cabinetDepthMm },
    updatedAt: input.occurredAt,
  };
  // The frozen map is part of this result (ADR 0090 decision 1): a command may not return a document
  // whose recorded map contradicts its own placements.
  const republished = republishedFrozenMap({
    input,
    rebuilt: rebuilt.value,
    design: deepened,
  });
  return succeedWith(
    withFrozenMap(
      deepened,
      projectFrozenMap(republished.columns, republished.records),
    ),
    {
      type: "cabinet_depth_set",
      cabinetDepthMm: input.cabinetDepthMm,
      rebuiltCount: rebuilt.value.rebuiltCount,
      columns: republished.columns,
    },
  );
}

/** Both rules as one question. The floor is a domain fact, enforced here and not only in a control. */
function isOfferedCabinetDepthMm(cabinetDepthMm: number): boolean {
  return (
    cabinetDepthMm >= MIN_CABINET_DEPTH_MM &&
    declaredCabinetDepthsMm().includes(cabinetDepthMm)
  );
}

interface RebuiltDesign {
  readonly placements: readonly DesignPlacement[];
  readonly rebuiltCount: number;
  /** The catalogue at the depth being moved **to**, carried out of the rebuild: a second `catalogAt`
   *  call is a second place for a depth/map mispairing. */
  readonly catalog: BodyCatalog;
  /** The pre-command run, derived once in the rebuild so the planning map and the republished map come
   *  from one slide. */
  readonly held: HeldRunAcrossTheCommand;
}

type Rebuilt =
  | { readonly ok: true; readonly value: RebuiltDesign }
  | { readonly ok: false; readonly detail: RejectionDetailOf };

type RejectionDetailOf = Parameters<typeof refuse>[1];

/** Every placement written at the new depth, in document order. Records and columns come from the
 *  catalogue built at the new depth, so this function never passes a depth around itself. */
function rebuildEveryBodyAt(
  input: SetCabinetDepthInput,
  probe: BodyProbe,
): Rebuilt {
  const catalog = input.catalogAt(input.cabinetDepthMm);
  // The one design everything below plans against, so no branch reaches a seated version by accident.
  const planning = planningDesign(input, catalog);
  const records = derivePlacementRecords(planning, catalog);
  const held = heldRunAcrossTheCommand(input, catalog);
  // Frozen extent on the vertical and along-wall axes, records on the depth axis (see ADR 0090
  // decision 6): re-taking the depth MAX is the point, but `top`, `regions` and `w` are frozen.
  const columns = deriveColumnsOverFrozenExtents(
    records,
    frozenExtentsSlidAlongTheWall({
      frozen: held.frozen,
      catalog,
      cabinetDepthMm: input.cabinetDepthMm,
      previousCabinetDepthMm: held.previousCabinetDepthMm,
      membersShiftMmByColumn: held.membersShiftMmByColumn,
      room: planning.room,
    }),
    planning.room,
  );
  // The five fields `rebuild` reads, with no sentinel beside them (ADR 0103 decision 5).
  const rebuildInput: RebuildInput = {
    design: planning,
    catalog,
    columns,
    probe,
    occurredAt: input.occurredAt,
  };

  const placements: DesignPlacement[] = [];
  let rebuiltCount = 0;
  // The planning design's placements, not the stored ones: they already carry the along-wall
  // coordinate the corner leaves them at (ADR 0089), so each fit is checked against its real opening.
  for (const placement of planning.placements) {
    const record = records.find((candidate) => candidate.id === placement.id);
    // A body this command cannot resolve is a refusal, never a pass-through: the document would say
    // 700 while carrying a 600 body.
    if (!record) {
      return { ok: false, detail: { code: "TARGET_NOT_FOUND", params: {} } };
    }
    if (!movesWithTheSetting(catalog, record.buildId)) {
      placements.push(placement);
      continue;
    }
    const body = resolveRebuildBody(catalog, record);
    if (!body) {
      // A structural body is re-seated, not rebuilt: a corner return is not insertable, and resolving
      // it to a catalogue equivalent would change its height. Only its seat depends on the depth.
      placements.push(
        reseat({
          probe,
          placement,
          seatRule: seatRuleOf({
            buildId: record.buildId,
            rule: catalog.get(record.buildId)?.seatRule,
          }),
          declaredDepthM: toMetres(declaredFrameDepthMm(catalog, record)),
        }),
      );
      rebuiltCount += 1;
      continue;
    }
    const written = rebuild(rebuildInput, records, {
      record,
      body,
      alongMm: placement.alongMm,
      widthMm: placement.body.widthMm,
    });
    if (!written.ok) return { ok: false, detail: written.detail };
    placements.push(written.value);
    rebuiltCount += 1;
  }
  return { ok: true, value: { placements, rebuiltCount, catalog, held } };
}

/** The run as it stood **before** this command, in the forms both its maps need, derived once so they
 *  cannot describe two runs (ADR 0090). Its fields do not share one key space: two are keyed where the
 *  run is leaving, `previousRecords` where it is arriving; each field says which. */
interface HeldRunAcrossTheCommand {
  /** The frozen map as the pre-command document records it, at the coordinates and depths it was
   *  holding: `frozenExtentsSlidAlongTheWall` requires its operand pre-slide. The recorded face, never
   *  the published one, so a wall-end truncation imposed at one setting is not written back
   *  (ADR 0090 Amendment B). */
  readonly frozen: ReadonlyMap<string, Column>;
  /** How far each column's members moved along their wall, keyed by the column's key before the
   *  command (rung 2 of `alongWallExtentPositionAtMm`'s ladder, the exact one). */
  readonly membersShiftMmByColumn: ReadonlyMap<string, number>;
  /** The same bodies read through the catalogue of the depth being *left*, re-keyed at the coordinates
   *  they are arriving at, so all three of `frozenMapAtCabinetDepth`'s operands share one key space. */
  readonly previousRecords: readonly PlacementRecord[];
  readonly previousCabinetDepthMm: number;
}

function heldRunAcrossTheCommand(
  input: SetCabinetDepthInput,
  catalog: BodyCatalog,
): HeldRunAcrossTheCommand {
  const previousCabinetDepthMm = cabinetDepthMmOf(input.design);
  const previousCatalog = input.catalogAt(previousCabinetDepthMm);
  // The same bodies twice at the setting being left: where they stood, and where the corner leaves
  // them. Their difference is the ladder's exact rung and the `explains` operand's key space.
  const heldRecords = derivePlacementRecords(input.design, previousCatalog);
  const slidRecords = derivePlacementRecords(
    heldDesignSlidAlongTheWall(input, catalog),
    previousCatalog,
  );
  return {
    frozen: deriveRecordedColumns(
      heldRecords,
      storedFrozenMapOf(input.design),
      toMetres(input.design.room.widthMm),
    ),
    membersShiftMmByColumn: alongWallShiftByColumnMm(heldRecords, slidRecords),
    previousRecords: slidRecords,
    previousCabinetDepthMm,
  };
}

/** The command's three inputs to the frozen-map answer, in one place. */
interface RepublishQuery {
  readonly input: SetCabinetDepthInput;
  readonly rebuilt: RebuiltDesign;
  readonly design: Design;
}

/** The published map and the records it describes, derived together so the two halves of
 *  `projectFrozenMap`'s partition share one derivation. */
interface RepublishedFrozenMap {
  readonly columns: ReadonlyMap<string, Column>;
  readonly records: readonly PlacementRecord[];
}

/** The whole frozen map at the new setting (ADR 0090 decision 5), assembled here because this is the one
 *  place holding all three operands: the recorded map, the records just written, and the pre-command
 *  records re-keyed at the new coordinates. The last two are read off the rebuild, never re-derived:
 *  a second derivation is a second author for where the run stands. */
function republishedFrozenMap(query: RepublishQuery): RepublishedFrozenMap {
  const { input, rebuilt, design } = query;
  const { held } = rebuilt;
  const records = derivePlacementRecords(design, rebuilt.catalog);
  return {
    records,
    columns: frozenMapAtCabinetDepth({
      frozen: held.frozen,
      records,
      previousRecords: held.previousRecords,
      membersShiftMmByColumn: held.membersShiftMmByColumn,
      room: design.room,
      catalog: rebuilt.catalog,
      cabinetDepthMm: input.cabinetDepthMm,
      previousCabinetDepthMm: held.previousCabinetDepthMm,
    }),
  };
}

/** The two stored halves of the frozen map, as `deriveColumns` restores them. Read off the document,
 *  not a parameter, because the document is what records the whole map (ADR 0053). */
function storedFrozenMapOf(design: Design): FrozenMapDocument {
  return {
    emptyColumns: design.emptyColumns,
    columnExtents: design.columnExtents,
  };
}

/** The held design with only the along-wall coordinates moved, sharing the move with `planningDesign`
 *  so the `explains` operand and the rebuilt bodies agree on where the run is. It does not clear seats:
 *  this operand reports what the members measured at the depth being left. */
function heldDesignSlidAlongTheWall(
  input: SetCabinetDepthInput,
  catalog: BodyCatalog,
): Design {
  return {
    ...input.design,
    placements: input.design.placements.map((placement) =>
      slidAlongItsWall({ input, catalog, placement }),
    ),
  };
}

/** The design this command plans against: the new setting, no seat recorded at the old one, and wall B's
 *  run where the corner leaves it.
 *
 *  A seat is authoritative only at the setting it was measured at, so a stored seat is not an input to
 *  the command that invalidates it: left in, a capped wall body would be built to the old depth beside
 *  the new setting (ADR 0077 decision 8). A `manufactured-size` body keeps its seat. This suspends the
 *  seat-first fallback (Gap B) only here and only for entries declaring `depthFollowsSetting`. A body
 *  the wall-B slide pushes past its wall is marked by the existing queries, never refused or moved back. */
function planningDesign(
  input: SetCabinetDepthInput,
  catalog: BodyCatalog,
): Design {
  return {
    ...input.design,
    settings: {
      ...input.design.settings,
      cabinetDepthMm: input.cabinetDepthMm,
    },
    placements: input.design.placements.map((placement) =>
      planned({ input, catalog, placement }),
    ),
  };
}

interface PlannedPlacementInput {
  readonly input: SetCabinetDepthInput;
  readonly catalog: BodyCatalog;
  readonly placement: DesignPlacement;
}

/** One placement as planned: seatless if its depth follows the setting, and at the along-wall coordinate
 *  the new corner leaves it. The two are independent: entries that pin their depth still slide. */
function planned(planning: PlannedPlacementInput): DesignPlacement {
  const slid = slidAlongItsWall(planning);
  return movesWithTheSetting(planning.catalog, slid.body.buildId)
    ? withoutRecordedSeat(slid)
    : slid;
}

/** One placement at the along-wall coordinate the new corner leaves it (ADR 0089), nothing else touched;
 *  shared with `heldDesignSlidAlongTheWall` so the run has one author for where it stands. */
function slidAlongItsWall(planning: PlannedPlacementInput): DesignPlacement {
  const { placement } = planning;
  const alongMm = alongWallPositionAtMm({
    placement,
    catalog: planning.catalog,
    fromCabinetDepthMm: cabinetDepthMmOf(planning.input.design),
    toCabinetDepthMm: planning.input.cabinetDepthMm,
    shape: planning.input.design.room.shape,
  });
  return alongMm === placement.alongMm ? placement : { ...placement, alongMm };
}

/** The placement with no `seatDepthMm` at all, not the declared number: absent is what `deriveFrame`'s
 *  `??` reads, and writing that fallback by hand would be a second author. */
function withoutRecordedSeat(placement: DesignPlacement): DesignPlacement {
  const { seatDepthMm, ...seatlessBody } = placement.body;
  if (seatDepthMm === undefined) return placement;
  return { ...placement, body: seatlessBody };
}

interface ReseatInput {
  readonly probe: BodyProbe;
  readonly placement: DesignPlacement;
  /** Which plane seats this body, deciding whether it is measured at all (ADR 0077 decision 1); read off
   *  the entry, never inferred from its band or id. */
  readonly seatRule: SeatRule;
  /** What the catalogue built at the **new** setting declares this body's frame depth to be. */
  readonly declaredDepthM: number;
}

/** One structural body measured again at the depth the new catalogue declares; only its seat depends on
 *  the setting.
 *
 *  The depth comes from the catalogue entry, never `record.frame.d`: once a seat is written,
 *  `deriveFrame`'s `seatDepthMm ?? frameDepthMm` takes the stored one, and a `recorded-shell` entry's
 *  builder would come out 39 mm shallower on every change, in either direction, with nothing refusing. */
function reseat(input: ReseatInput): DesignPlacement {
  const { placement } = input;
  if (input.seatRule.seatedOn === "joint") {
    // A joint-seated body is never measured (ADR 0077 decision 1): it has no plane of its own, and
    // persisting a measurement drove its carcass into `base-corner-return-320`. The stored seat is
    // removed so `deriveFrame` falls through to the declaration; "take the declaration where it
    // disagrees" would make agreement an input, silently wrong once a neighbour moves.
    return withoutRecordedSeat(placement);
  }
  const measurement = input.probe.measure({
    buildId: placement.body.buildId,
    widthM: toMetres(placement.body.widthMm),
    heightM: toMetres(placement.body.heightMm),
    depthM: input.declaredDepthM,
    seatedOn: input.seatRule.seatedOn,
  });
  return {
    ...placement,
    body: {
      ...placement.body,
      seatDepthMm: toMillimetres(2 * measurement.seatOffsetM),
    },
  };
}

/** The entry's declared frame depth at the catalogue's setting. Total, not optional: `movesWithTheSetting`
 *  already read a rule off this entry, so absence means the map changed under the loop. */
function declaredFrameDepthMm(
  catalog: BodyCatalog,
  record: PlacementRecord,
): number {
  const definition = catalog.get(record.buildId);
  if (!definition) {
    throw new Error(`setCabinetDepth: ${record.buildId} left the catalogue`);
  }
  return definition.frameDepthMm;
}

/** Whether the entry's declaration lets its depth follow the setting. An entry with no rule is left
 *  alone: `cabinetDepthRuleOf` refuses those at catalogue assembly. Takes a `buildId` so the seat
 *  clearing, before any record exists, and the rebuild loop share one author for which bodies move. */
function movesWithTheSetting(catalog: BodyCatalog, buildId: string): boolean {
  const rule = catalog.get(buildId)?.depthRule;
  return rule !== undefined && depthFollowsSetting(rule);
}
