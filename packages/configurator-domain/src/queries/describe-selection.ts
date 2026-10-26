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
import {
  DEFAULT_HANDLE,
  defaultHandleOf,
} from "../kitchen-handle/kitchen-handle.js";
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
  /** §9 section 6: `canWidth` = selected · not empty · not `fixedWidth`. Derived here, not by each caller,
   *  so a second derivation cannot render a width section on a corner return. Whether there is anything to
   *  render is the panel's separate question (a body whose `sizesMm` is empty gets no width section):
   *  folding it into this flag would hide missing seeded width sets behind a silently-false capability. */
  readonly canWidth: boolean;
  readonly canReplace: boolean;
  readonly canDelete: boolean;
  /** The finish currently applied, so §9's Finisaj chips can mark the active one. Absent means the body
   *  ships in its default finish, a real state distinct from any choice. Published here (with `handle`)
   *  because reading a rendered material to decide the active chip is the "derive identity from the mesh
   *  tree" mistake §6.3 records. */
  readonly finish?: Finish;
  /** The handle mode currently applied. Absent means none was chosen: §6.5 then decides by module line, so
   *  the absent case cannot be collapsed into `"push"`. */
  readonly handle?: Handle;
  /** What §6.5 gives this body when `handle` is absent, decided by the module line it stands on, not its
   *  catalogue band: a top-row body ships push-to-open with handles built and hidden (§11 row 13). Below the
   *  top row, a body that takes a handle follows the kitchen's where the kitchen has one; a body that takes
   *  none reports the slot's default and never the kitchen's. Published so §9's Mâner section can mark the
   *  chip the customer is looking at without re-deriving the rule from a `y0` `meta` does not carry. */
  readonly defaultHandle: Handle;
  /** Present only when this body offers nothing structural (no swap list, delete, finish, handle or width)
   *  and says why (§11 row 16, §13.1). Read from the catalogue entry's declaration, not inferred from the
   *  four capability flags: a panel that offers nothing never produces the refusal §11 row 16 requires to
   *  carry the explanation. */
  readonly structuralReason?: StructuralReason;
}

export interface DescribeSelectionInput {
  readonly records: readonly PlacementRecord[];
  readonly voids: readonly VoidRecord[];
  readonly catalog: BodyCatalog;
  readonly target: CommandTarget;
  /** `design.settings.handle`, which a body with no handle of its own follows below the top row. Absent is
   *  a kitchen that has chosen none. A field of its own, not the whole design: the records already carry
   *  everything else this projection reads. */
  readonly kitchenHandle?: Handle | undefined;
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
  return record
    ? describeBody(record, input.catalog, input.kitchenHandle)
    : undefined;
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
    // A void has no handles and `canHandle` is false, so this is never read; an empty slot is not a
    // push-to-open body.
    defaultHandle: DEFAULT_HANDLE,
    // §9: a void's whole purpose is the "Pune un corp aici" list.
    canReplace: true,
    canDelete: false,
  };
}

function describeBody(
  record: PlacementRecord,
  catalog: BodyCatalog,
  kitchenHandle: Handle | undefined,
): SelectionMeta {
  const definition = catalog.get(record.buildId);
  // The chips are the widths this body can be built at, never its raw catalogue row: `offersFor` narrows by
  // the same `buildableSizes`, so chips and offer rows cannot drift (ADR 0017).
  //
  // For a seeded body the set comes from the §7 entry the row declares it is an instance of, the entry a
  // §5.4 resize would rebuild it through, never inferred from the mesh tree (ADR 0022).
  const sizesMm = resolveBuildableSizes(catalog, record.buildId);
  return {
    id: record.id,
    // §6.3: identity comes from the chosen catalogue id, never the mesh tree. The door count comes from
    // the width the body actually has: a `wall-cabinet` resized from 600 to 400 reads as a one-door cabinet
    // (ADR 0033). A seeded row carries no `label` of its own and falls back to its kind.
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
    defaultHandle: defaultHandleOf({
      kitchenHandle,
      canHandle: record.canHandle,
      isTopRow: isPushOpenByDefault(record.frame.y0),
    }),
    ...(definition?.structuralReason === undefined
      ? {}
      : { structuralReason: definition.structuralReason }),
  };
}
