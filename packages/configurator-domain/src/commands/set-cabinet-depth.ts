// Wave 6J-b: the cabinet depth as a command, and what changing it does to every body.
//
// `set-whole-kitchen-settings.ts` one file over writes a tier id and nothing else, because a tier is
// a price fact. A depth is a **geometry** fact: every base carcass is built to it, every capped wall
// body follows, and `Column.d` is a MAX over what stands in the run. So this command writes the
// setting *and* rebuilds the design at it, in one result.
//
// **The rebuild runs through the same path an insert takes** (ADR 0055 decision 1) — `evaluateInsertFit`,
// the probe, and the built-carcass re-check behind it — so every fit rule, band gate and width guard
// fires on the rebuilt bodies. A bespoke transform over the document is the wrong shape *even where
// it would produce the same numbers*, because the numbers agreeing today is not the property being
// bought; the property is that a body this command writes is one the engine would have accepted.
//
// **Two entries do not move, and they are excluded by reading their declaration** (ADR 0058), never
// by naming them here. `depthFollowsSetting` is the one question this module asks about an entry,
// and it lives in `cabinet-depth-rule.ts` so wave 6I's gate and this migration cannot drift.
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

/** **The catalogue is built here, from a factory, rather than handed in already built.**
 *
 *  A `catalog: BodyCatalog` field would let a caller ask for 700 while passing a catalogue built at
 *  600, and every body would be rebuilt to the old depth with the new number written beside it —
 *  silently, because nothing downstream can tell the two apart. That is the defect wave 6S found one
 *  declaration over, where a query took a frame height no arm read. A factory makes the wrong call
 *  site impossible to write instead of merely wrong. */
export interface SetCabinetDepthInput {
  readonly design: Design;
  readonly catalogAt: (cabinetDepthMm: number) => BodyCatalog;
  readonly cabinetDepthMm: number;
  /** **A factory, never a built probe** — see `BodyProbeFactory`. The command leases one at the
   *  depth it is moving to and releases it on every path. */
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

  // Borrowed for the length of the rebuild and released by the lease itself, on every path
  // including a refusal: the adapter's implementation closes over a `Kit`, and a kit built per
  // command and never released is a leak per command (ADR 0074 decision 3). The `try/finally` this
  // used to spell out lives in `createBodyProbeLease` now — one obligation, written once, rather
  // than once per borrower (ADR 0076 decision 3).
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
  // **The frozen map is part of this result, not something the store adds afterwards** (ADR 0090
  // decision 1). `Design.emptyColumns` and `Design.columnExtents` record where a column stands, the
  // expression above just moved wall B's whole run, and a command may not return a document whose
  // recorded map contradicts its own placements.
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

/** Both independent rules, asked as one question so a caller cannot satisfy the set and miss the
 *  floor. The floor is a domain fact and is enforced here rather than only in 6K's control: a
 *  control is a surface, and a stored document must not depend on one. */
function isOfferedCabinetDepthMm(cabinetDepthMm: number): boolean {
  return (
    cabinetDepthMm >= MIN_CABINET_DEPTH_MM &&
    declaredCabinetDepthsMm().includes(cabinetDepthMm)
  );
}

interface RebuiltDesign {
  readonly placements: readonly DesignPlacement[];
  readonly rebuiltCount: number;
  /** The catalogue built at the depth being moved **to**, carried out of the rebuild rather than
   *  built a second time beside it. `SetCabinetDepthInput` takes a factory precisely so that a
   *  caller cannot pair one depth with another's map (see that type), and a second `catalogAt` call
   *  here would be a second place the pairing could go wrong. */
  readonly catalog: BodyCatalog;
  /** The run as it stood before the command, derived inside the rebuild and carried out rather than
   *  derived a second time beside the republish: the planning map and the republished map are built
   *  from the same slide, and two derivations of it are two runs. */
  readonly held: HeldRunAcrossTheCommand;
}

type Rebuilt =
  | { readonly ok: true; readonly value: RebuiltDesign }
  | { readonly ok: false; readonly detail: RejectionDetailOf };

type RejectionDetailOf = Parameters<typeof refuse>[1];

/** Every placement written at the new depth, in document order.
 *
 *  The records and columns are derived from the catalogue **built at the new depth**, so the opening
 *  each body is re-fitted into already carries the new depth — this function never passes a depth
 *  around itself, which is why it cannot pass the wrong one. */
function rebuildEveryBodyAt(
  input: SetCabinetDepthInput,
  probe: BodyProbe,
): Rebuilt {
  const catalog = input.catalogAt(input.cabinetDepthMm);
  // The one design everything below plans against, so no branch can reach the seated version by
  // accident: the records, the columns derived from them, and the design `rebuild` itself reads.
  const planning = planningDesign(input, catalog);
  const records = derivePlacementRecords(planning, catalog);
  const held = heldRunAcrossTheCommand(input, catalog);
  // **The frozen extent on the vertical and along-wall axes, the records on the depth axis**
  // (ADR 0088 decision 1, as ADR 0090 decision 6 amends it). This used to be
  // `deriveColumns(records, {}, room)`. The `{}` was right about the depth — §3.2's MAX is the fact
  // this command changes, and re-taking it at the new setting is the point — and it discarded `top`,
  // `regions` and `w` with it, which ADR 0011 Gap D froze precisely because the placements no longer
  // imply them. Two ordinary deletes then collapsed `A|2.00` from 2600 to 820 mm and the rebuild
  // refused §7's own 860 mm base body.
  const columns = deriveColumnsOverFrozenExtents(
    records,
    frozenExtentsSlidAlongTheWall({
      frozen: held.frozen,
      catalog,
      cabinetDepthMm: input.cabinetDepthMm,
      previousCabinetDepthMm: held.previousCabinetDepthMm,
      membersShiftMmByColumn: held.membersShiftMmByColumn,
    }),
    planning.room,
  );
  // **The five fields `rebuild` reads, and no sentinel beside them** (ADR 0103 decision 5). This
  // used to be a whole `SetWidthInput`, with an empty-string target and `widthMm: 0` standing in for
  // a resize this command is not — and wave 6Z would have been the third caller to copy them.
  const rebuildInput: RebuildInput = {
    design: planning,
    catalog,
    columns,
    probe,
    occurredAt: input.occurredAt,
  };

  const placements: DesignPlacement[] = [];
  let rebuiltCount = 0;
  // **The planning design's placements, not the stored ones.** They are the same bodies in the same
  // order, already carrying the along-wall coordinate the corner leaves them at (ADR 0089), so the
  // fit each body is re-checked against is the opening it will actually stand in — and the three
  // branches below cannot part company over where a body is. Reading the stored list here would
  // re-fit wall B's run at the coordinates of the depth it is leaving and then write the new ones
  // over the top, which is the "silent mixture" this loop refuses one branch down.
  for (const placement of planning.placements) {
    const record = records.find((candidate) => candidate.id === placement.id);
    // **A body this command cannot resolve is a refusal, never a pass-through.** Leaving it at the
    // old depth beside the new setting is the worst of the three outcomes: the document would say
    // 700 while carrying a 600 body, and nothing downstream could tell. Refusing loses the whole
    // change, which is recoverable; a silent mixture is not.
    if (!record) {
      return { ok: false, detail: { code: "TARGET_NOT_FOUND", params: {} } };
    }
    if (!movesWithTheSetting(catalog, record.buildId)) {
      placements.push(placement);
      continue;
    }
    const body = resolveRebuildBody(catalog, record);
    if (!body) {
      // **A structural body is re-seated, not rebuilt** — the same split `moveHood` makes one file
      // over, for the same reason. A corner return is not insertable, so it has no `InsertableBody`
      // and cannot go through `evaluateInsertFit`; and resolving it to a catalogue equivalent is
      // precisely the mistake that once turned `hood-600` into `hood` and changed its height. Its
      // width, height and position are not functions of the depth. Its **seat** is, so that is the
      // one field this rewrites, measured off a body probed at the new depth.
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

/** The run as it stood **before** this command, in the three forms both of its maps need.
 *
 *  Both maps are built from it: the planning map every rebuilt body is fitted against, and the
 *  frozen map the result publishes. Derived once so the two cannot describe two different runs — the
 *  failure ADR 0090 measured, where the map kept the coordinates the command had just left and four
 *  standing runs were filed under no column at all.
 *
 *  **Its three fields do not share one key space, and the name says nothing about coordinates for
 *  that reason.** Two of them are keyed where the run is *leaving*, because that is what their
 *  consumers require; only `previousRecords` is keyed where it is arriving. Each field says which
 *  below, because in this file a name claiming one key space for all three is the hazard. */
interface HeldRunAcrossTheCommand {
  /** The frozen map as the pre-command document records it, **at the coordinates and depths it was
   *  holding** — the operand `frozenExtentsSlidAlongTheWall` moves, so it is pre-slide by
   *  requirement rather than by omission.
   *
   *  **The recorded face, never the published one** (ADR 0090 Amendment B). `deriveColumns` ends in
   *  ADR 0069's wall-end cap, and a map this command slides and then writes back into the document
   *  must not carry a truncation the room imposed at one setting: a space flush to wall B's end went
   *  600 → 500 mm at 700 and kept the 500 on the way back to 600. */
  readonly frozen: ReadonlyMap<string, Column>;
  /** How far each column's members moved along their wall, **by the key that column had before the
   *  command** — rung 2 of `alongWallExtentPositionAtMm`'s ladder, and the one rung that is exact.
   *  Keyed the leaving way because the extent it is looked up for has not moved yet. */
  readonly membersShiftMmByColumn: ReadonlyMap<string, number>;
  /** The same bodies as they stood before the command, read through the catalogue of the depth
   *  being *left* and **re-keyed at the coordinates they are arriving at** — the one field of the
   *  three that is, so all three of `frozenMapAtCabinetDepth`'s operands share one key space. */
  readonly previousRecords: readonly PlacementRecord[];
  readonly previousCabinetDepthMm: number;
}

function heldRunAcrossTheCommand(
  input: SetCabinetDepthInput,
  catalog: BodyCatalog,
): HeldRunAcrossTheCommand {
  const previousCabinetDepthMm = cabinetDepthMmOf(input.design);
  const previousCatalog = input.catalogAt(previousCabinetDepthMm);
  // The same bodies twice, at the setting being left: where they stood, and where the corner leaves
  // them. Their difference is the ladder's exact rung and the `explains` operand's key space, and
  // both come from one pair so the two cannot describe different runs.
  const heldRecords = derivePlacementRecords(input.design, previousCatalog);
  const slidRecords = derivePlacementRecords(
    heldDesignSlidAlongTheWall(input, catalog),
    previousCatalog,
  );
  return {
    frozen: deriveRecordedColumns(heldRecords, storedFrozenMapOf(input.design)),
    membersShiftMmByColumn: alongWallShiftByColumnMm(heldRecords, slidRecords),
    previousRecords: slidRecords,
    previousCabinetDepthMm,
  };
}

/** The command's three inputs to the frozen-map answer, in one place. */
interface RepublishQuery {
  readonly input: SetCabinetDepthInput;
  readonly rebuilt: RebuiltDesign;
  /** The design as this command is about to return it — the new setting, the rebuilt bodies and the
   *  along-wall coordinates the corner leaves them at. */
  readonly design: Design;
}

/** The published map and the records it describes, derived once and returned together so the two
 *  halves of `projectFrozenMap`'s partition cannot come from two different derivations. */
interface RepublishedFrozenMap {
  readonly columns: ReadonlyMap<string, Column>;
  readonly records: readonly PlacementRecord[];
}

/** **The whole frozen map at the new setting** — ADR 0090 decision 5, assembled here because this is
 *  the one place that holds all three of its operands.
 *
 *  `frozen-map-at-cabinet-depth.ts` states the rules; this states where their inputs come from:
 *
 *  - the **frozen map the document records**, rebuilt from the design this command was handed, at
 *    the coordinates and depths it was holding;
 *  - the **records the command just wrote**, at the new depth and the new coordinates;
 *  - the **pre-command records, re-keyed at the new coordinates** — the same bodies with the same
 *    stored seats read through the catalogue of the depth being *left*, moved onto the chain their
 *    entries declare so that all three operands share one key space. Keyed the old way this operand
 *    answers for no column on wall B and every one of them falls into ADR 0080's surplus arm.
 *
 *  The last two are `HeldRunAcrossTheCommand`, and they are **read off the rebuild rather than
 *  re-derived here**: the rebuild plans against the same slide, and a second derivation of it is a
 *  second author for where the run stands. */
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

/** The two stored halves of the frozen map, as the document carries them and as `deriveColumns`
 *  restores them.
 *
 *  **Read off the document rather than taken as a parameter**, because the document is what ADR 0053
 *  says records the whole map — a command that took the caller's map would be answerable for a map
 *  its own result cannot reproduce, which is the shape of the defect this wave closes. */
function storedFrozenMapOf(design: Design): FrozenMapDocument {
  return {
    emptyColumns: design.emptyColumns,
    columnExtents: design.columnExtents,
  };
}

/** The held design with **only** the along-wall coordinates moved: the old setting, the old seats,
 *  the old catalogue's answer for every body — measured where the run is arriving rather than where
 *  it is leaving.
 *
 *  It is `planningDesign`'s smaller sibling and shares the move with it, so the coordinate the
 *  `explains` operand is keyed at and the coordinate the rebuilt bodies land at cannot part company.
 *  What it deliberately does **not** share is the seat clearing: this operand exists to say what the
 *  members measured at the depth being left, and clearing their seats would answer with the
 *  declaration instead of the measurement. */
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

/** **The design this command plans against: the new setting, no seat written at the old one, and
 *  wall B's run standing where the corner leaves it.**
 *
 *  Two things are stripped of the depth the kitchen is leaving, for one reason.
 *
 *  **The setting itself.** `rebuild` reaches `evaluateInsertFit`, which since wave 6K-b reads the
 *  cabinet depth off the design it is given — so planning against `input.design` would rebuild every
 *  wall body to the map row of the depth being left, write that as its seat, and leave the new number
 *  beside bodies built to the old one. That is the "silent mixture" the rebuild loop refuses, and the
 *  same constant-versus-document defect ADR 0073's finding records, arriving through an argument.
 *
 *  **And the recorded seats of the bodies that follow it** (ADR 0077 decision 8). A seat carries a
 *  qualifier the number does not: the setting it was measured at. It is authoritative for the design
 *  at that setting and for nothing else, so **a stored seat is not an input to the command that
 *  invalidates it** — not directly, and not through a column derived from one. Left in, `deriveFrame`
 *  resolves `seatDepthMm ?? frameDepthMm` (ADR 0011 Gap B), §3.2's `Column.d` is a MAX over frames
 *  measured at the old depth, and `resolveDepthM`'s capped arm returns `min(declared 400, stale 330)`
 *  — a 600 mm wall shell built, measured and persisted in a 700 mm kitchen. It is the move this
 *  function already makes by passing `{}` for the frozen extents, extended to the other fact this
 *  command changes; discarding the extents while re-deriving from stale seats discards the copy and
 *  keeps the original.
 *
 *  **A `manufactured-size` body keeps its seat, and that is not an exception being granted.** Its
 *  seat is a fact about a real machine rather than about the setting, so it keeps its full
 *  contribution to the MAX — as do ADR 0058's pinned rows, by the same declaration. Clearing every
 *  seat instead of the declared ones is the mirror of the defect being fixed.
 *
 *  **Gap B is suspended here and narrowed nowhere.** Only inside this command, only for entries that
 *  declare `depthFollowsSetting`, and only for planning; every read path outside — load, scene sync,
 *  picking, pricing, validation — reads the stored seat exactly as before. The case Gap B protects is
 *  re-derived rather than lost: a wall cabinet seating at 561 does so because it stands over a
 *  full-height column, and `resolveDepthM`'s lifted arm reads `column.hasFullHeightUnder` — never
 *  `column.d` — off members that clearing a seat cannot remove.
 *
 *  **And the third thing, which is a move rather than a removal: wall B's along-wall coordinates**
 *  (ADR 0089). A deeper corner body on wall A consumes more of wall B, so wall B's run slides by
 *  what the corner gained — `base-formula` by 100 mm and `wall-map` by 70 mm between 600 and 700,
 *  each read off the chain its own catalogue entry declares. It is applied here rather than after
 *  the loop so that the records, the columns and every fit check below see the run where it will
 *  stand; wall A is anchored at the corner and does not move. Nothing is refused or moved back:
 *  a body the slide pushes past the end of its wall is **marked** (ADR 0065), by the queries that
 *  already do that, and this command writes it where the geometry puts it. */
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

/** One placement as the command plans it: seatless if its depth follows the setting, and at the
 *  along-wall coordinate the new corner leaves it. The two are independent questions asked of the
 *  same entry — ADR 0058's pinned tops and the freestanding fridge keep their depth **and** still
 *  slide, because the corner in front of them took more wall. */
function planned(planning: PlannedPlacementInput): DesignPlacement {
  const slid = slidAlongItsWall(planning);
  return movesWithTheSetting(planning.catalog, slid.body.buildId)
    ? withoutRecordedSeat(slid)
    : slid;
}

/** One placement at the along-wall coordinate the new corner leaves it (ADR 0089), and nothing else
 *  touched. Shared with `heldDesignSlidAlongTheWall` above so the run has one author for where it
 *  stands, whichever of the command's two derivations is asking. */
function slidAlongItsWall(planning: PlannedPlacementInput): DesignPlacement {
  const { placement } = planning;
  const alongMm = alongWallPositionAtMm({
    placement,
    catalog: planning.catalog,
    fromCabinetDepthMm: cabinetDepthMmOf(planning.input.design),
    toCabinetDepthMm: planning.input.cabinetDepthMm,
  });
  return alongMm === placement.alongMm ? placement : { ...placement, alongMm };
}

/** The placement with no `seatDepthMm` **at all**, rather than one holding the catalogue's declared
 *  number: absent is what `deriveFrame`'s `??` is written for, and writing that fallback in by hand
 *  here would be a second author for it. A placement that carries no seat is already what this
 *  function is asked for and is returned as it stands. */
function withoutRecordedSeat(placement: DesignPlacement): DesignPlacement {
  const { seatDepthMm, ...seatlessBody } = placement.body;
  if (seatDepthMm === undefined) return placement;
  return { ...placement, body: seatlessBody };
}

interface ReseatInput {
  readonly probe: BodyProbe;
  readonly placement: DesignPlacement;
  /** Which plane seats this body — the one question that decides whether it is measured at all
   *  (ADR 0077 decision 1). Read off the entry, never inferred from its band or its id. */
  readonly seatRule: SeatRule;
  /** What the catalogue built at the **new** setting declares this body's frame depth to be. */
  readonly declaredDepthM: number;
}

/** One structural body measured again at the depth the new catalogue declares for it. Its width,
 *  height and position are not functions of the setting; its **seat** is, so that is the one field
 *  this rewrites.
 *
 *  **The depth comes from the catalogue entry, never from the record's own frame.** `record.frame.d`
 *  reads as the rebuilt world's answer and is one only the first time: `deriveFrame` resolves it as
 *  `placement.body.seatDepthMm ?? definition.frameDepthMm` (ADR 0011 Gap B), so the moment this
 *  function has written a seat, that `??` takes the stored one and the new catalogue's number is
 *  never consulted again. Every later change then asks the probe to build the body at the depth it
 *  already has — and for a `recorded-shell` entry, whose builder consumes the depth it is handed and
 *  subtracts its front assembly, the answer is 39 mm shallower each time, in **either** direction:
 *  291 → 322 → 283 → 244 → 174, with no floor and nothing on the way refusing it, because each
 *  individual document is valid. That is the "silent mixture" `rebuildEveryBodyAt` refuses one
 *  branch over, arriving through this one. `frameDepthMm` is the same fallback `deriveFrame` reads
 *  for a placement with no seat, so this is the number the first change was already right by. */
function reseat(input: ReseatInput): DesignPlacement {
  const { placement } = input;
  if (input.seatRule.seatedOn === "joint") {
    // **A joint-seated body is never measured** (ADR 0077 decision 1). There is no plane of its own
    // to measure: `base-corner-x-900` declares 560 and its bounding box reports 600, and persisting
    // the measurement made the leg flush and drove 0.00835 m³ of its carcass into
    // `base-corner-return-320`. The stored seat is **removed** rather than rewritten, so
    // `deriveFrame` falls through to the declaration at whatever depth is current — one authority,
    // not a copy of it that can go stale.
    //
    // Deliberately not "take the declaration where it disagrees with the measurement": that would
    // make the agreement an *input*, so a joint-seated body that happened to be flush would take the
    // measured path and be silently right until its neighbour moved.
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

/** The entry's declared frame depth, at whatever setting the catalogue handed here was built at.
 *  Total rather than optional: `movesWithTheSetting` has already read a depth rule off this same
 *  entry to get here, so an absent one means the map changed underneath the loop. */
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

/** ADR 0058's exclusion, asked of the declaration. An entry with no rule at all is left alone rather
 *  than guessed at — `cabinetDepthRuleOf` already refuses those as the catalogue is assembled, so
 *  reaching one here means the catalogue was built outside that path.
 *
 *  **Takes a `buildId` rather than a record, so the two questions this module asks are one author.**
 *  The seats are cleared before any record exists and the rebuild loop decides from a record, and
 *  "does this entry move" answered twice is exactly how a clearing and a rebuild come to disagree
 *  about which bodies the setting reaches. */
function movesWithTheSetting(catalog: BodyCatalog, buildId: string): boolean {
  const rule = catalog.get(buildId)?.depthRule;
  return rule !== undefined && depthFollowsSetting(rule);
}
