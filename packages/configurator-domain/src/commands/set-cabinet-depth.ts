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
import { depthFollowsSetting } from "../cabinet-depth-rule.js";
import type { BodyProbe, BodyProbeFactory } from "../body-probe.js";
import type { Design, DesignPlacement } from "../design.js";
import { toMetres, toMillimetres } from "../millimetres.js";
import {
  deriveColumns,
  derivePlacementRecords,
  type BodyCatalog,
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
import type { SetWidthInput } from "./width-resize-model.js";

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

  return succeedWith(
    {
      ...design,
      placements: [...rebuilt.value.placements],
      settings: { ...design.settings, cabinetDepthMm: input.cabinetDepthMm },
      updatedAt: input.occurredAt,
    },
    {
      type: "cabinet_depth_set",
      cabinetDepthMm: input.cabinetDepthMm,
      rebuiltCount: rebuilt.value.rebuiltCount,
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

/** `SetWidthInput` names a target and a width because a resize has both. A depth change has
 *  neither: it rebuilds every body at the width it already has. */
const UNUSED_BY_REBUILD = "";

interface RebuiltDesign {
  readonly placements: readonly DesignPlacement[];
  readonly rebuiltCount: number;
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
  // `{}` rather than the document's frozen extents: ADR 0011 Gap D freezes a column's extent at the
  // depth it was loaded at, and this command changes exactly that. Re-deriving is the point.
  const columns = deriveColumns(records, {}, planning.room);
  const widthInput: SetWidthInput = {
    design: planning,
    catalog,
    columns,
    // `setWidth`'s own two fields, unused on the `rebuild` path: it reads `design`, `catalog`,
    // `columns` and `probe` only. Named here rather than cast away so a future `rebuild` that starts
    // reading them fails to compile instead of silently resizing to zero.
    target: { kind: "placement", id: UNUSED_BY_REBUILD },
    widthMm: 0,
    probe,
    occurredAt: input.occurredAt,
  };

  const placements: DesignPlacement[] = [];
  let rebuiltCount = 0;
  for (const placement of input.design.placements) {
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
          declaredDepthM: toMetres(declaredFrameDepthMm(catalog, record)),
        }),
      );
      rebuiltCount += 1;
      continue;
    }
    const written = rebuild(widthInput, records, {
      record,
      body,
      alongMm: placement.alongMm,
      widthMm: placement.body.widthMm,
    });
    if (!written.ok) return { ok: false, detail: written.detail };
    placements.push(written.value);
    rebuiltCount += 1;
  }
  return { ok: true, value: { placements, rebuiltCount } };
}

/** **The design this command plans against: the new setting, and no seat written at the old one.**
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
 *  `column.d` — off members that clearing a seat cannot remove. */
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
      movesWithTheSetting(catalog, placement.body.buildId)
        ? withoutRecordedSeat(placement)
        : placement,
    ),
  };
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
  const measurement = input.probe.measure({
    buildId: placement.body.buildId,
    widthM: toMetres(placement.body.widthMm),
    heightM: toMetres(placement.body.heightMm),
    depthM: input.declaredDepthM,
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
