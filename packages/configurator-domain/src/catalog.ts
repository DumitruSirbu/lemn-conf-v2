// `DEVELOPMENT-SPEC.md` §7's catalogue: the parameterised entries a customer can actually choose.
//
// ADR 0011 Gap A: these live in the *same* `BodyCatalog` map as M2's seeded decomposition entries,
// split only by `insertable`. One map, because a placement created by `insertBody` must resolve
// through the same lookup as a seeded one or `UnknownBodyError` becomes reachable at load; two
// populations, because a seeded entry describes one already-built body and must never be offered.
import { toMillimetres } from "./millimetres.js";
import {
  MIN_WIDTH_M,
  type Band,
  type BodyDefinition,
  type WidthFlex,
} from "./void-engine.js";

/** ADR 0026: §2's `MIN_W` in millimetres, as what it now is — the **default** width floor, which
 *  governs every entry that does not declare one of its own. */
const DEFAULT_MIN_WIDTH_MM = toMillimetres(MIN_WIDTH_M);

/** §7: "everything else" — 1000 mm was dropped, because two doors top out at 800. */
const STANDARD_WIDTHS_MM: readonly number[] = [400, 600, 800];
/** ADR 0017: the sink base has no 400 — its worktop splits around a fixed 560 mm aperture and does
 *  not build below that, so 400 is not a width this body has. */
const SINK_WIDTHS_MM: readonly number[] = [600, 800];
/** ADR 0017: the sink aperture's own width, which is the width at which the geometry is correct
 *  rather than merely inside `FIT_TOLERANCE_M`. */
const SINK_MIN_WIDTH_MM = 560;
/** ADR 0026: the bottle cargo's own set, and not a new general module width — the standard set
 *  stays {400, 600, 800}. A millimetre set rather than `'fit'`, because the **proportion is the
 *  product**: a `'fit'` body built into an 800 mm opening would be an 800 mm cabinet with one
 *  front, which is not a bottle cargo. Backlog entry 2 fixes the range at 200–300; the two members
 *  inside it are the widths a narrow pull-out is actually made at, and they await the owner's
 *  confirmation. */
const BOTTLE_CARGO_WIDTHS_MM: readonly number[] = [200, 300];

/** ADR 0026: below §2's default floor, deliberately, and the only entry in the catalogue that
 *  declares a floor *under* it rather than over it. */
const BOTTLE_CARGO_MIN_WIDTH_MM = 200;

const DISHWASHER_WIDTHS_MM: readonly number[] = [450, 600];
const HOOD_WIDTHS_MM: readonly number[] = [600, 900];
const COLUMN_WIDTHS_MM: readonly number[] = [600];
const FREESTANDING_FRIDGE_WIDTHS_MM: readonly number[] = [700];

/** §2: worktop top = `PLINTH + CARC_H + CTOP`. Every base carcass builds to it. */
const WORKTOP_HEIGHT_MM = 860;
const WALL_CABINET_HEIGHT_MM = 700;
const HOOD_HEIGHT_MM = 710;
const COLUMN_HEIGHT_MM = 2200;

/** §10's signature flow depends on this exact number: a 2600 mm cleared column minus a
 *  freestanding fridge must leave **one** 750 mm slot above it (§11 row 1). §7's table rounds it
 *  to 1.80 m, which would leave 800. */
const FREESTANDING_FRIDGE_HEIGHT_MM = 1850;

const BASE_DEPTH_MM = 580;
/** A wall entry's nominal depth: §7's head-clearance cap, which is what a wall carcass is built to
 *  over a worktop. It is the `frameDepthMm` fallback for a placement with no measured seat of its
 *  own, **not** the depth anything gets built to — that is decided per opening by
 *  `WALL_CARCASS_MAX_DEPTH_OVER_WORKTOP_M`, and over a full-height column it is deeper than this. */
const WALL_DEPTH_MM = 400;
const HOOD_DEPTH_MM = 500;
const COLUMN_DEPTH_MM = 560;
const FREESTANDING_FRIDGE_DEPTH_MM = 680;

const INSERTABLE_DEFAULTS = {
  insertable: true,
  canFinish: true,
  canHandle: true,
  canReplace: true,
  canDelete: true,
  fixedWidth: false,
  heightFlex: false,
} as const;

interface BodyShape {
  readonly label: string;
  readonly kind: string;
  readonly widthFlex: WidthFlex;
  readonly nominalHeightMm: number;
  readonly nominalDepthMm: number;
  readonly sizesMm: readonly number[];
}

function insertableBody(band: Band, shape: BodyShape): BodyDefinition {
  // An inserted placement carries its own measured `seatDepthMm`, which `deriveFrame` prefers.
  // `frameDepthMm` is the fallback for a placement that somehow lacks one, and the entry's nominal
  // depth is the only honest value available before the body has been built and measured.
  return {
    ...INSERTABLE_DEFAULTS,
    band,
    ...shape,
    frameDepthMm: shape.nominalDepthMm,
  };
}

function baseCabinet(label: string): BodyDefinition {
  return insertableBody("base", {
    label,
    kind: "base_cabinet",
    widthFlex: "fit",
    nominalHeightMm: WORKTOP_HEIGHT_MM,
    nominalDepthMm: BASE_DEPTH_MM,
    sizesMm: STANDARD_WIDTHS_MM,
  });
}

function wallCabinet(label: string): BodyDefinition {
  return {
    ...insertableBody("wall", {
      label,
      kind: "wall_cabinet",
      widthFlex: "fit",
      nominalHeightMm: WALL_CABINET_HEIGHT_MM,
      nominalDepthMm: WALL_DEPTH_MM,
      sizesMm: STANDARD_WIDTHS_MM,
    }),
    heightFlex: true,
  };
}

function fullHeightUnit(label: string, kind: string): BodyDefinition {
  return {
    ...insertableBody("column", {
      label,
      kind,
      widthFlex: COLUMN_WIDTHS_MM,
      nominalHeightMm: COLUMN_HEIGHT_MM,
      nominalDepthMm: COLUMN_DEPTH_MM,
      sizesMm: COLUMN_WIDTHS_MM,
    }),
    fixedWidth: true,
  };
}

/** §7's catalogue, in the order the panel lists it: base, wall, then full-height. */
export const INSERTABLE_BODY_DEFINITIONS: readonly (readonly [
  string,
  BodyDefinition,
])[] = [
  ["base-2door", baseCabinet("Corp bază 2 uși")],
  ["base-1door", baseCabinet("Corp bază 1 ușă")],
  ["base-3drawer", baseCabinet("Corp bază 3 sertare")],
  ["base-panbank", baseCabinet("Sertare pentru oale")],
  [
    "base-bottle-cargo",
    {
      ...baseCabinet("Cargo îngust pentru sticle"),
      widthFlex: BOTTLE_CARGO_WIDTHS_MM,
      sizesMm: BOTTLE_CARGO_WIDTHS_MM,
      minWidthMm: BOTTLE_CARGO_MIN_WIDTH_MM,
    },
  ],
  [
    "base-sink",
    {
      ...baseCabinet("Corp spălător"),
      sizesMm: SINK_WIDTHS_MM,
      minWidthMm: SINK_MIN_WIDTH_MM,
    },
  ],
  [
    "base-dishwasher",
    {
      ...baseCabinet("Nișă mașină de spălat vase"),
      kind: "dishwasher_housing",
      widthFlex: DISHWASHER_WIDTHS_MM,
      sizesMm: DISHWASHER_WIDTHS_MM,
    },
  ],
  ["wall-2door", wallCabinet("Corp suspendat 2 uși")],
  ["wall-1door", wallCabinet("Corp suspendat 1 ușă")],
  ["wall-lift", wallCabinet("Corp suspendat rabatabil")],
  [
    "open-shelf",
    {
      ...wallCabinet("Etajeră deschisă"),
      kind: "open_shelf_unit",
      canFinish: false,
      canHandle: false,
    },
  ],
  [
    "hood",
    {
      ...wallCabinet("Hotă"),
      kind: "extractor_hood",
      canFinish: false,
      canHandle: false,
      heightFlex: false,
      nominalHeightMm: HOOD_HEIGHT_MM,
      nominalDepthMm: HOOD_DEPTH_MM,
      sizesMm: HOOD_WIDTHS_MM,
    },
  ],
  ["tall-pantry", fullHeightUnit("Coloană cămară", "tall_unit")],
  [
    "tall-oven-tower",
    fullHeightUnit("Coloană cuptor + microunde", "tall_unit"),
  ],
  [
    "tall-fridge-housing",
    fullHeightUnit("Nișă frigider integrat", "fridge_housing"),
  ],
  [
    "fridge-free",
    {
      ...fullHeightUnit("Frigider, liber", "fridge_freestanding"),
      widthFlex: FREESTANDING_FRIDGE_WIDTHS_MM,
      sizesMm: FREESTANDING_FRIDGE_WIDTHS_MM,
      nominalHeightMm: FREESTANDING_FRIDGE_HEIGHT_MM,
      nominalDepthMm: FREESTANDING_FRIDGE_DEPTH_MM,
      canFinish: false,
      canHandle: false,
    },
  ],
];

/** §9's header falls back to this when an entry has no `label` of its own — every seeded body,
 *  none of which the customer ever picks from a list. §11 row 24: a kind that is not in this table
 *  is unknown, and an unknown kind renders no replace section at all. */
const KIND_LABELS_RO: Readonly<Record<string, string>> = {
  base_cabinet: "Corp bază",
  dishwasher_housing: "Nișă mașină de spălat vase",
  induction_cooktop: "Plită cu inducție",
  tall_unit: "Coloană",
  fridge_housing: "Nișă frigider integrat",
  fridge_freestanding: "Frigider",
  wall_cabinet: "Corp suspendat",
  open_shelf_unit: "Etajeră deschisă",
  extractor_hood: "Hotă",
  // ADR 0025: §3.1 lists both as kinds, but until the base legs became placements no selection
  // could carry one, so neither was ever named. Without a name here the base corner's header reads
  // the generic "Corp" — and §11 row 16 asks the panel to *explain* a corner, which starts with
  // calling it one.
  corner_base_x: "Corp bază de colț",
  corner_base_return: "Racord bază de colț",
};

/** What a body is called when the catalogue does not know its kind. */
export const UNKNOWN_KIND_LABEL_RO = "Corp";

export function isKnownKind(kind: string): boolean {
  // Own properties only: `kind in KIND_LABELS_RO` walks `Object.prototype`, so "toString" and its
  // fellow inherited members would answer "known" and §11 row 24 would fail open on them.
  return Object.hasOwn(KIND_LABELS_RO, kind);
}

export function describeKindLabel(kind: string): string {
  const label = isKnownKind(kind) ? KIND_LABELS_RO[kind] : undefined;
  return label ?? UNKNOWN_KIND_LABEL_RO;
}

/** Everything §5.2 needs about a catalogue entry, with the optional fields resolved. A seeded
 *  entry has no insertable shape — that is the `NOT_INSERTABLE` refusal, not a defect. */
export interface InsertableBody {
  readonly buildId: string;
  readonly label: string;
  readonly kind: string;
  readonly band: Band;
  readonly widthFlex: WidthFlex;
  readonly heightFlex: boolean;
  readonly nominalHeightMm: number;
  readonly sizesMm: readonly number[];
  /** ADR 0017: this body's own width floor, when its row declares one. Absent means `MIN_WIDTH_M`
   *  governs — the two are different facts and carry different rejection codes, so this is carried
   *  absent rather than defaulted. ADR 0026: a floor below `MIN_WIDTH_M` replaces it for this
   *  entry; a floor above it is checked after it. */
  readonly minWidthMm?: number;
  readonly definition: BodyDefinition;
}

/** Narrows a catalogue entry to its insertable shape, or `undefined` when the entry is one of
 *  M2's seeded instances. Returning `undefined` rather than throwing keeps the caller's refusal
 *  path a value, which is what `insertBody` turns into `NOT_INSERTABLE`. */
export function toInsertableBody(
  buildId: string,
  definition: BodyDefinition,
): InsertableBody | undefined {
  const { label, widthFlex, nominalHeightMm, sizesMm } = definition;
  if (definition.insertable !== true) return undefined;
  if (
    label === undefined ||
    widthFlex === undefined ||
    nominalHeightMm === undefined ||
    sizesMm === undefined
  ) {
    return undefined;
  }
  return {
    buildId,
    label,
    kind: definition.kind,
    band: definition.band,
    widthFlex,
    heightFlex: definition.heightFlex ?? false,
    nominalHeightMm,
    sizesMm,
    ...(definition.minWidthMm === undefined
      ? {}
      : { minWidthMm: definition.minWidthMm }),
    definition,
  };
}

/** ADR 0017: the widths an entry can actually be built at — the given set, less anything under the
 *  floor that governs it. ADR 0026: that is the entry's own `minWidthMm` where it declares one, in
 *  either direction, and §2's default floor where it does not. Reading the default here rather
 *  than treating an absent declaration as "no floor" is what keeps a chip under 300 mm off a row
 *  that never asked to be an exception.
 *
 *  It is a no-op for every shipped entry: `base-sink`'s chips start at 600, above its own 560 mm
 *  floor; `base-bottle-cargo`'s are its own 200 and 300 and it declares that floor; and every other
 *  row's narrowest chip is at or above the 300 mm default — 400 for the standard set, 450 for the
 *  dishwasher, 600 for the hood and the columns, 700 for `fridge-free`. Nothing is filtered out.
 *
 *  Catalogue data rather than command logic, because two callers apply it to two different sets and
 *  neither owns the rule: §5.2's guard narrows `widthFlex` to decide what to build, and §9's offer
 *  narrows `sizesMm` to decide which chips to render. One function, so a width the panel offers is
 *  a width the engine will accept. */
export function buildableSizes(
  minWidthMm: number | undefined,
  sizesMm: readonly number[],
): readonly number[] {
  const floorMm = minWidthMm ?? DEFAULT_MIN_WIDTH_MM;
  return sizesMm.filter((size) => size >= floorMm);
}

/** Every insertable entry of a catalogue, in catalogue order — the raw list §9's offer filter
 *  narrows. */
export function listInsertableBodies(
  catalog: ReadonlyMap<string, BodyDefinition>,
): InsertableBody[] {
  const insertable: InsertableBody[] = [];
  for (const [buildId, definition] of catalog) {
    const body = toInsertableBody(buildId, definition);
    if (body) insertable.push(body);
  }
  return insertable;
}
