// `DEVELOPMENT-SPEC.md` §8's `meta` — the panel's entire input, minus §5.4's resize slack
// (`minMm`, `growMm`, `donorSide`, `donorMm`), which needs the neighbour scan M5 owns.
//
// §8's rule is the point of this projection: "everything the panel disables, it disables from these
// numbers — never by trying and catching a refusal". Nothing enters `meta` that the panel could not
// derive from the selection itself.
import { describeBandLabel, deriveSlotBand } from "../bands.js";
import { describeKindLabel } from "../catalog.js";
import type { CommandTarget } from "../commands/command-result.js";
import type { DesignWall } from "../design.js";
import { toMillimetres } from "../millimetres.js";
import type {
  Band,
  BodyCatalog,
  PlacementRecord,
  VoidRecord,
} from "../void-engine.js";

export interface SelectionMeta {
  readonly id: string;
  readonly label: string;
  /** True for a void: §9 hides Finisaj, Mâner and Lățime, because there is nothing to finish. */
  readonly empty: boolean;
  readonly kind: string;
  readonly band: Band;
  readonly bandLabel: string;
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
  readonly canReplace: boolean;
  readonly canDelete: boolean;
  readonly accessory: boolean;
}

const EMPTY_SLOT_LABEL_RO = "Spațiu liber";
const VOID_KIND = "void";

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
    label: EMPTY_SLOT_LABEL_RO,
    empty: true,
    kind: VOID_KIND,
    band,
    bandLabel: describeBandLabel(band),
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
    // §9: a void's whole purpose is the "Pune un corp aici" list.
    canReplace: true,
    canDelete: false,
    accessory: false,
  };
}

function describeBody(
  record: PlacementRecord,
  catalog: BodyCatalog,
): SelectionMeta {
  const definition = catalog.get(record.buildId);
  return {
    id: record.id,
    // §6.3: identity comes from the chosen catalogue id, never re-inferred from the mesh tree.
    label: definition?.label ?? describeKindLabel(record.kind),
    empty: false,
    kind: record.kind,
    band: record.band,
    bandLabel: describeBandLabel(record.band),
    wall: record.wall,
    widthMm: record.widthMm,
    heightMm: record.heightMm,
    openWmm: toMillimetres(record.frame.w),
    openHmm: toMillimetres(record.frame.h),
    spanHmm: toMillimetres(record.frame.h),
    sizesMm: definition?.sizesMm ?? [],
    fixedWidth: record.fixedWidth,
    canFinish: record.canFinish,
    canHandle: record.canHandle,
    canReplace: record.canReplace,
    canDelete: record.canDelete,
    accessory: record.accessory,
  };
}
