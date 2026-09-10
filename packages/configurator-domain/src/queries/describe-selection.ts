// `DEVELOPMENT-SPEC.md` §8's `meta` — the panel's entire input, minus §5.4's resize slack
// (`minMm`, `growMm`, `donorSide`, `donorMm`), which needs the neighbour scan M5 owns.
//
// §8's rule is the point of this projection: "everything the panel disables, it disables from these
// numbers — never by trying and catching a refusal". Nothing enters `meta` that the panel could not
// derive from the selection itself.
import { deriveSlotBand, isPushOpenByDefault } from "../bands.js";
import {
  describeBodyLabelAt,
  EMPTY_SLOT_LABEL,
  kindLabel,
  resolveBuildableSizes,
  type BodyLabel,
} from "../catalog.js";
import type { CommandTarget } from "../commands/command-result.js";
import type { DesignWall, Handle } from "../design.js";
import type { Finish } from "../materials.js";
import { toMillimetres } from "../millimetres.js";
import {
  VOID_KIND,
  type Band,
  type BodyCatalog,
  type PlacementRecord,
  type StructuralReason,
  type VoidRecord,
} from "../void-engine.js";

export interface SelectionMeta {
  readonly id: string;
  readonly label: BodyLabel;
  /** True for a void: §9 hides Finisaj, Mâner and Lățime, because there is nothing to finish. */
  readonly empty: boolean;
  readonly kind: string;
  readonly band: Band;
  readonly wall: DesignWall;
  readonly widthMm: number;
  readonly heightMm: number;
  /** The opening at this level. */
  readonly openWmm: number;
  readonly openHmm: number;
  /** The free span the opening belongs to. A body's own frame is its span (§5.3). */
  readonly spanHmm: number;
  /** §9's width chips: the legal widths for THIS body, as a catalogue constant. */
  readonly sizesMm: readonly number[];
  readonly fixedWidth: boolean;
  readonly canFinish: boolean;
  readonly canHandle: boolean;
  /** §9 section 6, exactly as §9 states it: `canWidth` = selected · not empty · not `fixedWidth`.
   *  Derived here rather than by each caller, because a second derivation is a second chance to
   *  render a width section on a corner return.
   *
   *  Whether there is anything to *render* is a separate question, answered by the panel: a body
   *  whose `sizesMm` is empty gets no width section. Folding that into this flag made
   *  `canWidth: true, sizesMm: []` unrepresentable-by-accident rather than by contract, and it would
   *  have hidden M5's missing seeded width sets behind a silently-false capability. */
  readonly canWidth: boolean;
  readonly canReplace: boolean;
  readonly canDelete: boolean;
  /** The finish currently applied, so §9's Finisaj chips can mark the active one. Absent means the
   *  body ships in its default finish — a real state, distinct from any of the five choices, and
   *  carried absent rather than defaulted to one of them.
   *
   *  §8's `meta` list omits both this and `handle` because the prototype's panel read them off the
   *  mesh. Reading a rendered material to decide which chip is active is exactly the "derive
   *  identity from the mesh tree" mistake §6.3 records, so they are published here instead. */
  readonly finish?: Finish;
  /** The handle mode currently applied. Absent means none was chosen: §6.5 then decides by module
   *  line — a top-row body ships push-to-open with its handles built and hidden — which is why the
   *  absent case cannot be collapsed into `"push"` here. */
  readonly handle?: Handle;
  /** What §6.5 gives this body when `handle` is absent, decided by the module line it stands on
   *  rather than by its catalogue band: a top-row body ships push-to-open with its handles built
   *  and hidden (§11 row 13). Published so §9's Mâner section can mark the chip the customer is
   *  actually looking at; without it the panel would have to re-derive the rule from a `y0` `meta`
   *  does not carry, or mark nothing and disagree with the scene. */
  readonly defaultHandle: Handle;
  /** Present only when this body offers nothing structural — no swap list, no delete, no finish, no
   *  handle, no width — and says why (§11 row 16, §13.1). Read from the catalogue entry's own
   *  declaration rather than inferred from the four capability flags being false: a panel that
   *  offers nothing never produces the refusal §11 row 16 requires to carry the explanation, so the
   *  explanation has to be a published fact instead of a by-product of one. */
  readonly structuralReason?: StructuralReason;
}

/** §6.5's fallback for a body below the top row: a bar handle, which is what every non-top-row
 *  seeded body renders with. */
const DEFAULT_HANDLE: Handle = "steel";
/** §6.5: at or above the top module line, handles are built and hidden. */
const TOP_ROW_HANDLE: Handle = "push";

export interface DescribeSelectionInput {
  readonly records: readonly PlacementRecord[];
  readonly voids: readonly VoidRecord[];
  readonly catalog: BodyCatalog;
  readonly target: CommandTarget;
}

/** `undefined` when the target no longer resolves — a stale void id after a recompute, which §9
 *  renders as "nothing selected" rather than as an error. */
export function describeSelection(
  input: DescribeSelectionInput,
): SelectionMeta | undefined {
  if (input.target.kind === "void") {
    const record = input.voids.find(
      (candidate) => candidate.id === input.target.id,
    );
    return record ? describeVoid(record) : undefined;
  }
  const record = input.records.find(
    (candidate) => candidate.id === input.target.id,
  );
  return record ? describeBody(record, input.catalog) : undefined;
}

function describeVoid(record: VoidRecord): SelectionMeta {
  const band: Band = deriveSlotBand(record);
  const widthMm = toMillimetres(record.w);
  const heightMm = toMillimetres(record.h);
  return {
    id: record.id,
    label: EMPTY_SLOT_LABEL,
    empty: true,
    kind: VOID_KIND,
    band,
    wall: record.wall,
    widthMm,
    heightMm,
    openWmm: widthMm,
    openHmm: heightMm,
    spanHmm: toMillimetres(record.spanH),
    sizesMm: [],
    fixedWidth: false,
    canFinish: false,
    canHandle: false,
    // §9: an empty slot hides Finisaj, Mâner and Lățime — there is nothing to finish.
    canWidth: false,
    // A void has no handles, and `canHandle` is false, so this is never read. It is still the
    // honest value rather than a placeholder: an empty slot is not a push-to-open body.
    defaultHandle: DEFAULT_HANDLE,
    // §9: a void's whole purpose is the "Pune un corp aici" list.
    canReplace: true,
    canDelete: false,
  };
}

function describeBody(
  record: PlacementRecord,
  catalog: BodyCatalog,
): SelectionMeta {
  const definition = catalog.get(record.buildId);
  // ADR 0017, and R2.9: the chips are the widths this body can be *built* at, never its raw
  // catalogue row. `offersFor` narrows by the same floor rule through the same `buildableSizes`, so
  // the width chips cannot drift from the offer rows the day a second entry declares a `minWidthMm`
  // without pre-filtering its set.
  //
  // ADR 0022: for a seeded body the set comes from the §7 entry the row **declares** it is an
  // instance of, because that is the entry a §5.4 resize would rebuild it through. Never inferred
  // from the mesh tree — ADR 0011 Gap A closes that door by name.
  const sizesMm = resolveBuildableSizes(catalog, record.buildId);
  return {
    id: record.id,
    // §6.3: identity comes from the chosen catalogue id, never re-inferred from the mesh tree.
    //
    // ADR 0033: and the **door count** comes from the width the body actually has, at the one
    // threshold the builder branches on. A `wall-cabinet` placement resized from 600 to 400 is a
    // one-door cabinet and the header says so, without the customer ever having owned a different
    // entry. A row that does not declare `doorCountFollowsWidth` is unaffected, and a seeded row —
    // which carries no `label` of its own — still falls back to its kind, as it always has.
    label:
      definition === undefined
        ? kindLabel(record.kind)
        : describeBodyLabelAt(
            { buildId: record.buildId, definition },
            record.widthMm,
          ),
    empty: false,
    kind: record.kind,
    band: record.band,
    wall: record.wall,
    widthMm: record.widthMm,
    heightMm: record.heightMm,
    openWmm: toMillimetres(record.frame.w),
    openHmm: toMillimetres(record.frame.h),
    spanHmm: toMillimetres(record.frame.h),
    sizesMm,
    fixedWidth: record.fixedWidth,
    canFinish: record.canFinish,
    canHandle: record.canHandle,
    canWidth: !record.fixedWidth,
    canReplace: record.canReplace,
    canDelete: record.canDelete,
    ...(record.finishKey === undefined ? {} : { finish: record.finishKey }),
    ...(record.handleMode === undefined ? {} : { handle: record.handleMode }),
    defaultHandle: isPushOpenByDefault(record.frame.y0)
      ? TOP_ROW_HANDLE
      : DEFAULT_HANDLE,
    ...(definition?.structuralReason === undefined
      ? {}
      : { structuralReason: definition.structuralReason }),
  };
}
