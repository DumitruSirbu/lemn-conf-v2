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
  type BodyCatalog,
  type BodyDefinition,
  type WidthFlex,
} from "./void-engine.js";
import { wallDepthMmForWorktop, WORKTOP_DEPTH_MM } from "./worktop-depth.js";

/** ADR 0026: §2's `MIN_W` in millimetres, as what it now is — the **default** width floor, which
 *  governs every entry that does not declare one of its own. */
const DEFAULT_MIN_WIDTH_MM = toMillimetres(MIN_WIDTH_M);

/** §7: "everything else" — 1000 mm was dropped, because two doors top out at 800.
 *
 *  It is the **ladder**, not a bound: these are the standard module widths a body is offered at, and
 *  an entry carrying it is not asserting that it cannot be built outside them. Every entry using it
 *  therefore declares `sizesAreStandardLadder` (ADR 0031 rule 5), which is what lets such a body sit
 *  in a column that a narrower member takes below 400 without contradicting anything about itself. */
const STANDARD_WIDTHS_MM: readonly number[] = [400, 600, 800];

/** The shape shared by every entry whose `sizesMm` is the ladder above. Spread rather than repeated,
 *  so a row cannot take the standard set and forget to say what it is. */
const STANDARD_LADDER = {
  sizesMm: STANDARD_WIDTHS_MM,
  sizesAreStandardLadder: true,
} as const;

/** The counterpart, for every entry whose set is a **bound of its own** — a manufactured size list, a
 *  door-count threshold, a swing arc, an appliance's fixed width. Written as a helper rather than a
 *  bare `sizesMm:` so that overriding the set on a row built from `baseCabinet` or `wallCabinet`
 *  cannot leave `sizesAreStandardLadder: true` behind from the spread it started with. The guard test
 *  in `catalog.test.ts` is what proves no row got it wrong. */
function boundedWidths(sizesMm: readonly number[]) {
  return { sizesMm, sizesAreStandardLadder: false } as const;
}
/** ADR 0029 (owner, 2026-08-27; closing finding R1.2): a two-door wall cabinet has no 400 mm width.
 *  §7's wall builder is `w > 0.45 ? 2 : 1`, so a `wall-2door` built at 400 mm carries **one** door
 *  while still being labelled *Corp suspendat 2 uși*, priced as one, and badged ACTUAL as one in
 *  its own swap list — §6.3's fridge-housing-priced-as-a-pantry in a different disguise. Letting a
 *  resize migrate the placement to `wall-1door` instead was rejected; this fails at the **offer**
 *  rather than after the tap. `wall-1door`, `wall-lift` and `open-shelf` keep the standard set: a
 *  one-door cabinet at 400 mm is honest, and a shelf has no doors to count. */
const TWO_DOOR_WALL_WIDTHS_MM: readonly number[] = [600, 800];

/** ADR 0030 (owner, 2026-08-27): a single hinged door is not made above 400 mm. The reason is
 *  ergonomic rather than structural — §7's builder makes an 800 mm one-door carcass perfectly
 *  well, and nobody should own the swing arc it comes with — which is what separates this from
 *  ADR 0029, where the builder and the label disagreed. `base-1door` and `wall-1door` are the two
 *  hinged singles and both declare it.
 *
 *  **`wall-lift` and `open-shelf` keep the standard set.** A lift-up is a flap on the top edge and
 *  has no swing arc, and a shelf has no door at all, so neither is reached by the reasoning.
 *
 *  **Amended the same day**: the cap is 400 itself rather than "below 600", and the set extends
 *  *downward* — a 200 mm wall cabinet can then match a 200 mm bottle cargo standing under it, which
 *  is the run ADR 0026 was written for read one level up. */
const ONE_DOOR_WIDTHS_MM: readonly number[] = [200, 300, 400];

/** ADR 0030's amendment, in the ADR 0026 mechanism: 200 and 300 sit **below** §2's default floor, so
 *  the two hinged singles must each declare their own or `buildableSizes` would filter both widths
 *  straight back out of the set the ADR just gave them.
 *
 *  This makes three entries declaring downward where ADR 0026 said one. What that record protects is
 *  untouched: `MIN_WIDTH_M` does not move, so no row inherits the exception, and each of the three
 *  states it on its own line where a reader of that row can see it. What it retires is one of the
 *  three arguments ADR 0026 gave for keeping the constant at 300 — §5.4's donor rule, which ADR 0031
 *  deleted. Nothing is left narrow as the residue of somebody else's edit because nothing is
 *  resized as the residue of somebody else's edit. */
const ONE_DOOR_MIN_WIDTH_MM = 200;

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

/** ADR 0026: below §2's default floor, deliberately. It was the only entry declaring *under* the
 *  default until ADR 0030's amendment; `base-1door` and `wall-1door` now do too, at the same 200. */
const BOTTLE_CARGO_MIN_WIDTH_MM = 200;

/** ADR 0027: a hob-bearing base is 600 mm and nothing else. The hob itself is a 600 mm appliance
 *  — `builders.cooktop()` is a fixed 590 x 520 glass plate — so the cabinet under it is the one
 *  width that appliance is made for. A single-member set rather than `'fit'`, for the reason the
 *  bottle cargo has one: a `'fit'` body would build an 800 mm cabinet with a 600 mm hob adrift on
 *  it. */
const HOB_BASE_WIDTHS_MM: readonly number[] = [600];

/** ADR 0027: the `kind` a hob placement had before the migration, and the kind both hob-bearing
 *  bases now declare they carry themselves. The string is the seeded `cooktop-600` entry's own
 *  `kind`, which is what makes the two comparable at all — see `carriesAccessoryKind`. */
const HOB_ACCESSORY_KIND = "induction_cooktop";

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
 *  `WALL_CARCASS_MAX_DEPTH_OVER_WORKTOP_M`, and over a full-height column it is deeper than this.
 *
 *  Read from the worktop → wall depth map rather than written down, so it and that cap are the same
 *  number by construction. Two independent literals agreeing at 400 is the defect this replaces. */
const WALL_DEPTH_MM = wallDepthMmForWorktop(WORKTOP_DEPTH_MM);
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
  /** **Required, not optional** (logic review R1.10). `BodyDefinition` reads an absent flag as
   *  `false` — the set is a bound — which is the conservative direction there. It is *not* the
   *  conservative direction here: `baseCabinet` and `wallCabinet` spread `STANDARD_LADDER`, which
   *  sets it `true`, so a shape that simply said nothing would inherit the **permissive** answer
   *  from the helper it was built with. Required, so every shape has to state which it has and the
   *  guard test in `catalog.test.ts` is a second line rather than the only one. */
  readonly sizesAreStandardLadder: boolean;
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
    ...STANDARD_LADDER,
  });
}

/** ADR 0027: a base cabinet that carries the hob. Every other property is a base cabinet's — same
 *  band, same 860 mm worktop line, same 580 mm depth — so it is a `baseCabinet` with its width
 *  fixed, and the width is fixed because the appliance is. */
function hobBase(label: string): BodyDefinition {
  return {
    ...baseCabinet(label),
    widthFlex: HOB_BASE_WIDTHS_MM,
    ...boundedWidths(HOB_BASE_WIDTHS_MM),
    fixedWidth: true,
    carriesAccessoryKind: HOB_ACCESSORY_KIND,
  };
}

function wallCabinet(label: string): BodyDefinition {
  return {
    ...insertableBody("wall", {
      label,
      kind: "wall_cabinet",
      widthFlex: "fit",
      nominalHeightMm: WALL_CABINET_HEIGHT_MM,
      nominalDepthMm: WALL_DEPTH_MM,
      ...STANDARD_LADDER,
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
      ...boundedWidths(COLUMN_WIDTHS_MM),
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
  [
    "base-1door",
    {
      ...baseCabinet("Corp bază 1 ușă"),
      ...boundedWidths(ONE_DOOR_WIDTHS_MM),
      minWidthMm: ONE_DOOR_MIN_WIDTH_MM,
    },
  ],
  ["base-3drawer", baseCabinet("Corp bază 3 sertare")],
  ["base-panbank", baseCabinet("Sertare pentru oale")],
  // ADR 0027: the two hob-bearing bodies. The hob is part of the cabinet, not a separate placement
  // sitting on it, which is what makes it restorable at all — a seeded entry is never offerable
  // (ADR 0011 Gap A), so before these two rows existed a deleted hob could never come back.
  //
  // Both are `fixedWidth` at 600. They differ only in what fills the carcass, which is the choice
  // the customer is actually making: drawers when the oven lives in a column, an oven when there is
  // no room for one.
  ["base-hob-2drawer", hobBase("Corp plită și 2 sertare")],
  [
    "base-hob-oven",
    {
      ...hobBase("Corp plită și cuptor"),
      // §9's "never offer what cannot be satisfied", and §13.1's "disable, don't warn". This body
      // is deliberately open-front — the oven *is* the front — so it owns no `door_front` and no
      // cabinet handle. Measured before this line existed: a recorded finish recoloured nothing,
      // and `handle: "push"` hid the **oven's** own bar, a cabinet-hardware chip mutating an
      // appliance. `open-shelf` and `hood` below declare the same two `false` for the same reason.
      canFinish: false,
      canHandle: false,
    },
  ],
  [
    "base-bottle-cargo",
    {
      ...baseCabinet("Cargo îngust pentru sticle"),
      widthFlex: BOTTLE_CARGO_WIDTHS_MM,
      ...boundedWidths(BOTTLE_CARGO_WIDTHS_MM),
      minWidthMm: BOTTLE_CARGO_MIN_WIDTH_MM,
    },
  ],
  [
    "base-sink",
    {
      ...baseCabinet("Corp spălător"),
      ...boundedWidths(SINK_WIDTHS_MM),
      minWidthMm: SINK_MIN_WIDTH_MM,
    },
  ],
  [
    "base-dishwasher",
    {
      ...baseCabinet("Nișă mașină de spălat vase"),
      kind: "dishwasher_housing",
      widthFlex: DISHWASHER_WIDTHS_MM,
      ...boundedWidths(DISHWASHER_WIDTHS_MM),
    },
  ],
  [
    "wall-2door",
    {
      ...wallCabinet("Corp suspendat 2 uși"),
      // ADR 0029. Declared on the row in `base-sink`'s form (ADR 0017) rather
      // than by narrowing `STANDARD_WIDTHS_MM`, which the three other standard-width entries share.
      //
      // This governs the **chips and the offer rows**, not what the body builds into: `widthFlex`
      // stays `'fit'`, so §5.2 still builds this entry to its opening at any width. See the note at
      // `TWO_DOOR_WALL_WIDTHS_MM`.
      ...boundedWidths(TWO_DOOR_WALL_WIDTHS_MM),
    },
  ],
  [
    "wall-1door",
    {
      ...wallCabinet("Corp suspendat 1 ușă"),
      ...boundedWidths(ONE_DOOR_WIDTHS_MM),
      minWidthMm: ONE_DOOR_MIN_WIDTH_MM,
    },
  ],
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
      // Declared, not inherited: the spread above has already stamped `frameDepthMm` from
      // `WALL_DEPTH_MM`, which the worktop → wall depth map governs. Whether a hood follows the
      // worktop is an open question, so both of the hood's depth fields say 500 and neither reads
      // the map. `void-engine.ts` takes `frameDepthMm` as the fallback for a placement with no
      // measured `seatDepthMm`, so leaving it inherited put a map-derived number behind an
      // undecided rule (QA finding Q1.1).
      frameDepthMm: HOOD_DEPTH_MM,
      ...boundedWidths(HOOD_WIDTHS_MM),
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
      ...boundedWidths(FREESTANDING_FRIDGE_WIDTHS_MM),
      nominalHeightMm: FREESTANDING_FRIDGE_HEIGHT_MM,
      nominalDepthMm: FREESTANDING_FRIDGE_DEPTH_MM,
      // Declared, not inherited, for the reason the hood declares its own: the spread above has
      // already stamped `frameDepthMm` from `COLUMN_DEPTH_MM` (560), and overriding only the
      // nominal left the two 120 mm apart. A `fridge-free` placement with no measured
      // `seatDepthMm` then seats 60 mm off the wall plane (§11 row 19), because `void-engine.ts`
      // falls back to `frameDepthMm`.
      frameDepthMm: FREESTANDING_FRIDGE_DEPTH_MM,
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

/** The resolved entry with the id it is filed under, because a `BodyDefinition` does not carry its
 *  own — §9's badge needs the id and §9's chips need the definition, and both must come from the
 *  same answer rather than from two lookups that could disagree. */
export interface CatalogEquivalent {
  readonly buildId: string;
  readonly definition: BodyDefinition;
}

/** The §7 entry a body **is**, as one resolution with two readers.
 *
 *  An insertable row is its own equivalent; a seeded one is the row its `catalogEquivalentId`
 *  declares (ADR 0022), because ADR 0011 Gap A gives every seeded entry a non-insertable `buildId`
 *  and one already-built geometry. Two facts hang off that same pointer and must not drift apart:
 *  §9 badges the swap row a body already stands on ACTUAL, and §9's width chips are the widths that
 *  entry can be built at — the widths a §5.4 resize would rebuild the body through. This is one
 *  function with a thin adapter per reader (FINDING R1.5/R2.2: it was two implementations of one
 *  rule, differing only in what they returned, and the whole argument for declaring the pointer is
 *  that it states **one** fact).
 *
 *  **The resolved entry is verified `insertable`, not merely present** (FINDING R1.1). A pointer at
 *  another seeded row would otherwise resolve to a body with no `sizesMm` — an empty set, so the
 *  width section silently disappears — and would answer §5.4's `canGive` ("resolves to an
 *  insertable catalogue entry") with a body `insertBody` cannot rebuild, turning a refusal that
 *  belongs before the offer into one that arrives after the tap. No shipped pointer does this; the
 *  invariant now holds for **every** catalogue rather than for the one map the fixture guard test
 *  iterates, and that guard test still earns its place by catching the typo case this cannot.
 *
 *  **Declared, never inferred.** ADR 0011 Gap A closes §5.4's `buildIdOf` mesh-tree inspection by
 *  name, §6.3 records that inferring a body's identity produced a fridge housing labelled and priced
 *  as a pantry, and ADR 0022 rejected the same shortcut for the badge. Matching a seeded body to a
 *  catalogue row by kind + band + width would be that mistake once more, and would be wrong
 *  silently: `base-drawer2-600` is a 600 mm two-drawer base and so is `base-3drawer`'s sibling row.
 *
 *  `undefined` for a body with no declared equivalent — the hob and the four corner bodies — which
 *  is the correct answer for them rather than a missing one. */
export function resolveCatalogEquivalent(
  catalog: BodyCatalog,
  buildId: string,
): CatalogEquivalent | undefined {
  const definition = catalog.get(buildId);
  if (!definition) return undefined;
  const equivalentId =
    definition.insertable === true ? buildId : definition.catalogEquivalentId;
  if (equivalentId === undefined) return undefined;
  const equivalent = catalog.get(equivalentId);
  if (equivalent?.insertable !== true) return undefined;
  return { buildId: equivalentId, definition: equivalent };
}

/** The widths a body can actually be built at: its catalogue equivalent's set, narrowed by the
 *  floor that governs **that** entry (ADR 0017, ADR 0026).
 *
 *  Both halves come from the same resolved row on purpose — a set and the floor under it are one
 *  catalogue fact, and reading `sizesMm` from the equivalent while reading `minWidthMm` off the
 *  seeded row would let a body offer a chip its own builder refuses.
 *
 *  An empty set is a real answer, not a defect to paper over: it is what a body with no catalogue
 *  equivalent has, and §9's width section declines to render on it. */
export function resolveBuildableSizes(
  catalog: BodyCatalog,
  buildId: string,
): readonly number[] {
  const equivalent = resolveCatalogEquivalent(catalog, buildId);
  if (!equivalent) return [];
  return buildableSizes(
    equivalent.definition.minWidthMm,
    equivalent.definition.sizesMm ?? [],
  );
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
