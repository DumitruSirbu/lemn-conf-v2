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
  type WidthRangeMm,
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
/** ADR 0033: **the width at which a hinged cabinet stops being a one-door and becomes a two-door**,
 *  and the single point where that flips.
 *
 *  §7's **wall** builder has always branched here — `w > 0.45 ? 2 : 1` — and has always been *right*:
 *  a 400 mm carcass with one door is a correct cabinet. What was wrong was the **name** on it, because
 *  the door count was declared by which of two catalogue rows the customer picked. `wall-2door` at
 *  400 mm was not a broken cabinet, it was a correct one-door cabinet wearing a two-door name.
 *
 *  So the constant moves **here**, into the domain, and `catalog-bodies.ts` imports it for the door
 *  count it hands the builder. §12 puts product rules in the domain and builders in the adapter, and
 *  "how many doors is this cabinet called" is a product rule. One constant, two readers — ADR 0028's
 *  discipline, applied to the second pair this project has found. Two literals agreeing by luck is
 *  the shape both ADR 0028 and §7's depth cap were written about.
 *
 *  **The value does not move, and for the wall pair nothing else does either.** But the door count a
 *  *base* cabinet is built with **did** change, and saying otherwise was wrong (logic review R1.3).
 *  `base-2door` called `baseCabinet(w, { doors: 2 })` **unconditionally** and carried the standard
 *  ladder, so a 300 or 400 mm base opening produced a genuine two-door — 400 is a chip, so an
 *  ordinary insert reached it. `base-cabinet` derives the count instead, and below 450 a base cabinet
 *  now builds *one* door.
 *
 *  **That is a fix, not a regression**: a 400 mm two-door base was ADR 0029's rule violated on the
 *  pair ADR 0029 never looked at, and the base builder's own geometry at one door is as correct as
 *  the wall builder's. What the merge replaced on the base row is its **declared** count. No builder
 *  was edited in either package, so the M1 fidelity gate is still unreachable from this decision —
 *  that claim is about the reference library, and it holds. */
export const TWO_DOOR_MIN_WIDTH_MM = 450;

/** ADR 0033: the merged hinged-cabinet ladder — `wall-2door`'s `[600, 800]` and `wall-1door`'s
 *  `[200, 300, 400]`, as one entry's set.
 *
 *  **It is still a bound, not a ladder**, and the reason is worth stating because it is not the
 *  reason it used to be. ADR 0029's half of the bound is gone: below 450 the builder makes one door,
 *  and the label now says so, which is exactly what ADR 0033 fixes. **ADR 0030's half is not.** A
 *  single hinged door tops out at 400 mm for an ergonomic reason — nobody should own the swing arc
 *  above it — and §7's builder still makes *one* door anywhere in (400, 450]. That 50 mm band is a
 *  width at which this cabinet cannot honestly be made at all, and no floor can express it. So the
 *  set stays a bound and ADR 0033's rule 3 holds literally: 450 and 500 are simply not offered
 *  widths, which is what keeps the flip clean.
 *
 *  Every member sits unambiguously on one side of `TWO_DOOR_MIN_WIDTH_MM`: 200, 300 and 400 are
 *  one-door widths, 600 and 800 are two-door widths. The derived label is therefore total over this
 *  set, and `catalog.test.ts` proves the set never grows a member inside the dead band. */
const HINGED_CABINET_WIDTHS_MM: readonly number[] = [200, 300, 400, 600, 800];

/** ADR 0030's amendment, carried through ADR 0033's merge in the ADR 0026 mechanism: 200 and 300 sit
 *  **below** §2's default floor, so the merged rows must each declare their own or `buildableSizes`
 *  would filter both widths straight back out of the set they were just given.
 *
 *  Three entries declared downward before this merge and three still do — the count is unchanged, but
 *  the rows are not: `base-1door` and `wall-1door` are gone and the two merged cabinets carry it
 *  instead, alongside `base-bottle-cargo`. What ADR 0026 protects is untouched: `MIN_WIDTH_M` does
 *  not move, so no row inherits the exception, and each row states it on its own line. */
const HINGED_CABINET_MIN_WIDTH_MM = 200;

/** ADR 0030's product cap: a single hinged door is not made above this. Ergonomic — §7's builder
 *  makes an 800 mm one-door carcass perfectly well, and nobody should own the swing arc. */
const ONE_DOOR_MAX_WIDTH_MM = 400;

/** ADR 0029's product floor: two doors are not offered below this. */
const TWO_DOOR_FLOOR_WIDTH_MM = 600;

/** §7: two doors top out here — 1000 was dropped from the standard set for the same reason. */
const TWO_DOOR_MAX_WIDTH_MM = 800;

/** ADR 0033's amendment: **the rules were never a list of five widths; they are two ranges.**
 *
 *  Worked width by width, which is how the owner and the M5 architect arrived at it:
 *
 *  | width    | builder makes | rule                            | verdict |
 *  | -------- | ------------- | ------------------------------- | ------- |
 *  | 200–400  | 1 door        | one door caps at 400 (ADR 0030) | allowed |
 *  | 401–450  | 1 door        | above the one-door cap          | refused |
 *  | 451–599  | 2 doors       | below the two-door floor        | refused |
 *  | 600–800  | 2 doors       | in range                        | allowed |
 *  | 900+     | 2 doors       | above the 800 maximum           | refused |
 *
 *  The refused band spans `TWO_DOOR_MIN_WIDTH_MM` — the flip itself sits at 450, inside 401–599 — so
 *  it reads as one gap rather than two rules meeting. That is *why* it is a gap: on one side of the
 *  flip the cabinet is a one-door too wide to use, on the other a two-door too narrow to offer.
 *
 *  **570 and 900 are correctly refused and must stay so.** An earlier reading of QA's finding treated
 *  them as casualties of the merge; they are not. **700 was the only genuine loss** — the shipped
 *  opening under the freestanding fridge, where §7's builder makes an entirely honest two-door of two
 *  350 mm leaves — and restoring it is the whole of this amendment.
 *
 *  This is the third correction to ADR 0033's numbers in a day, and the pattern is worth carrying in
 *  the code as well as the record: each time, a **discrete list was standing in for a rule about a
 *  range**, and the list was narrower than the rule. */
const HINGED_CABINET_WIDTH_RANGES_MM: readonly WidthRangeMm[] = [
  { minMm: HINGED_CABINET_MIN_WIDTH_MM, maxMm: ONE_DOOR_MAX_WIDTH_MM },
  { minMm: TWO_DOOR_FLOOR_WIDTH_MM, maxMm: TWO_DOOR_MAX_WIDTH_MM },
];

/** ADR 0033: the merged rows' **generic** names — no door count in them, so they are true at every
 *  width and at no width at all.
 *
 *  They are the same two strings §9's header already falls back to for a body whose kind the
 *  catalogue knows, and `KIND_LABELS_RO` below is defined from these rather than repeating them: the
 *  entry's name and its kind's name are now literally the same fact, which is what "the kind is the
 *  real identity" means once the door count stops being part of the identity.
 *
 *  The door count is added by `describeBodyLabelAt`, and **only where a width is actually known**. A
 *  refusal that is still deciding a width has no honest count to state, so it names the cabinet. */
const BASE_CABINET_LABEL_RO = "Corp bază";
const WALL_CABINET_LABEL_RO = "Corp suspendat";

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
  // ADR 0033: `base-2door` + `base-1door`, merged. The door count is a **consequence of the width**,
  // never a separate product to pick, so there is one row and the customer chooses a cabinet and a
  // width. `kind` was always the real identity — both halves have carried `base_cabinet` since M3 —
  // and the id now says so.
  [
    "base-cabinet",
    {
      ...baseCabinet(BASE_CABINET_LABEL_RO),
      ...boundedWidths(HINGED_CABINET_WIDTHS_MM),
      widthRangesMm: HINGED_CABINET_WIDTH_RANGES_MM,
      minWidthMm: HINGED_CABINET_MIN_WIDTH_MM,
      doorCountFollowsWidth: true,
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
      // ADR 0033's amendment (owner, 2026-08-27; logic review R1.1): **a sink base is cabinetry with
      // a fixed aperture, not an appliance that comes in sizes.** What is fixed is the bowl — 560 mm,
      // which `minWidthMm` below already states — and not the carcass around it. The owner's own
      // case: "there are a lot of cases when the sink is 800 — in my kitchen it's an 800 cabinet."
      // An 800 sink base is ordinary, and so is a 700.
      //
      // `{600, 800}` was the chip ladder ADR 0017 left behind when it removed 400, and 5C2 turned it
      // into a bound without an argument — the same move the merge made on `base-2door`, and the
      // third time in this milestone that a discrete list stood in for a rule about a range. The
      // range says the rule: anything from the aperture up to the two-door maximum.
      widthRangesMm: [
        { minMm: SINK_MIN_WIDTH_MM, maxMm: TWO_DOOR_MAX_WIDTH_MM },
      ],
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
  // ADR 0033: `wall-2door` + `wall-1door`, merged, for the reason the base pair is. This is the pair
  // the whole decision was written about — `wall-2door` at 400 mm was ADR 0029's finding, and
  // `wall-1door` at 800 mm was ADR 0030's, and both are now the same fact stated once: below
  // `TWO_DOOR_MIN_WIDTH_MM` one door, above it two.
  //
  // A resize that takes a column to 400 turns this cabinet into a one-door **without changing which
  // entry the customer owns**, because there is no other entry to migrate to. That is why the
  // alternative both earlier records rejected — migrating the placement between two rows — is not
  // merely still rejected but no longer expressible.
  [
    "wall-cabinet",
    {
      ...wallCabinet(WALL_CABINET_LABEL_RO),
      ...boundedWidths(HINGED_CABINET_WIDTHS_MM),
      widthRangesMm: HINGED_CABINET_WIDTH_RANGES_MM,
      minWidthMm: HINGED_CABINET_MIN_WIDTH_MM,
      doorCountFollowsWidth: true,
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
      // ADR 0033's amendment (owner, 2026-08-27; logic review R1.2): **declared, so the hood narrows
      // instead of refusing.** `wallCabinet` spreads `widthFlex: 'fit'`, which left the hood the only
      // row in the catalogue that was both `'fit'` and discretely bounded — so where every other
      // discrete row installs its widest fitting size in a larger opening, the hood alone refused.
      // `base-dishwasher` has always put a 600 in a 700 mm slot; the hood now does the same.
      //
      // **"A 700 mm hood is not a product" is unchanged and still enforced.** The hood is never
      // *built* at 700: `resolveFixedSetWidth` picks 600, and the 600 lands centred in the wider
      // opening because §5.2 seats every body on `opening.alongM`. What changes is that the customer
      // gets a hood there at all, which was never a decision anyone took — it was a spread.
      widthFlex: HOOD_WIDTHS_MM,
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
  base_cabinet: BASE_CABINET_LABEL_RO,
  dishwasher_housing: "Nișă mașină de spălat vase",
  induction_cooktop: "Plită cu inducție",
  tall_unit: "Coloană",
  fridge_housing: "Nișă frigider integrat",
  fridge_freestanding: "Frigider",
  wall_cabinet: WALL_CABINET_LABEL_RO,
  open_shelf_unit: "Etajeră deschisă",
  extractor_hood: "Hotă",
  // ADR 0025: §3.1 lists both as kinds, but until the base legs became placements no selection
  // could carry one, so neither was ever named. Without a name here the base corner's header reads
  // the generic "Corp" — and §11 row 16 asks the panel to *explain* a corner, which starts with
  // calling it one.
  corner_base_x: "Corp bază de colț",
  corner_base_return: "Racord bază de colț",
};

/** ADR 0033: **how many hinged doors a cabinet of this width is made with.** The one place the
 *  question is answered, in either package.
 *
 *  `catalog-bodies.ts` calls it for the count it hands `kit.make.wallCabinet(w, doors, …)` and
 *  `kit.make.baseCabinet(w, { doors })`, and `describeBodyLabelAt` calls it for the name the customer
 *  reads. That is the whole mechanism of this decision: the builder and the label cannot disagree
 *  about a door count because there is nothing for them to disagree with — they ask the same
 *  function. The comparison is `>` and not `>=` deliberately; it is the builder's own, unchanged, so
 *  450 mm is a one-door width and no geometry moves. */
export function deriveDoorCount(widthMm: number): number {
  return widthMm > TWO_DOOR_MIN_WIDTH_MM ? 2 : 1;
}

/** ADR 0033: the name the customer reads for this entry **at this width**.
 *
 *  For every row but the two merged cabinets this is just `label` — a hood is a hood at any width.
 *  For a row that declares `doorCountFollowsWidth` the count is appended from `deriveDoorCount`, so
 *  *Corp suspendat* becomes *Corp suspendat 1 ușă* at 400 and *Corp suspendat 2 uși* at 600. The two
 *  strings are byte-identical to the labels the two former entries carried, which is what makes this
 *  a merge rather than a rename.
 *
 *  **Call it wherever a label reaches a customer and a width is known** — the offer row, the ACTUAL
 *  badge, the panel header, and M6's price line. A caller that reads `definition.label` directly
 *  gets the generic name, which is correct rather than merely safe: it is what a body with no
 *  settled width *is*. That is why the width is a required argument and not an optional one — a
 *  caller without a width has to say so by not calling this.
 *
 *  Romanian counts its nouns: *1 ușă*, *2 uși*. The two forms are written here rather than in the
 *  panel because §12 keeps product copy out of components, and because the count that selects
 *  between them is decided here. */
export function describeBodyLabelAt(
  definition: BodyDefinition,
  widthMm: number,
): string {
  const name = definition.label ?? describeKindLabel(definition.kind);
  if (definition.doorCountFollowsWidth !== true) return name;
  const doors = deriveDoorCount(widthMm);
  return `${name} ${String(doors)} ${doors === 1 ? "ușă" : "uși"}`;
}

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

/** ADR 0033's amendment: **the widths this entry may actually be built to**, as ranges.
 *
 *  Three cases, and only the first is declared:
 *
 *  1. **A row with real ranges** — the two hinged cabinets — declares them. Cabinetry is continuous
 *     within its door-count range, so a 700 mm opening takes a two-door even though 700 is not a chip.
 *  2. **A standard-ladder row** (ADR 0031 rule 5) is one range from the floor that governs it upward,
 *     with no maximum: 400 is the narrowest standard module, not the narrowest honest pan bank.
 *  3. **Everything else is discrete** — one degenerate range per size. Appliances really do come in
 *     the sizes they come in, and `base-bottle-cargo` is a proportion (ADR 0026).
 *
 *  **Cases 2 and 3 are derived rather than declared, on purpose.** Writing them into the catalogue
 *  would restate `sizesMm` on twelve rows and put the floor in two places, which is the drift ADR 0028
 *  and ADR 0033 exist to close — a second source that agrees with the first by luck until it does not.
 *  So `sizesAreStandardLadder` survives *beside* ranges rather than being subsumed by them: it is the
 *  fact about `sizesMm` that this derivation consumes, and deleting it would mean declaring `[floor,
 *  ∞)` on four rows whose floor already lives in `minWidthMm`. Ranges express the hole the boolean
 *  could not; the boolean still says which of the other two shapes a row has.
 *
 *  **A declared range is raised to the floor that governs the entry, never trusted past it** (logic
 *  review R1.4). `refuseWidthFloor`'s doc calls itself "the one place a width floor is applied", and
 *  a declaration that could reach under it would make that sentence false — the same shape as
 *  `FIT_TOLERANCE_M` being kept from lowering a floor, and the same shape as backlog entry 13, where
 *  a rule stated in prose was not implemented by a second code path. The insert path happens to be
 *  covered anyway, because `refuseWidthFloor` runs before `resolveFitWidth`; **the resize path has
 *  `acceptsWidthMm` as its only predicate**, so without this the two would disagree again.
 *
 *  It is a no-op for both shipped rows — each hinged cabinet's lower range opens at exactly its
 *  declared 200 mm floor — and that is the point: the guard is here so the invariant holds for a
 *  catalogue this function has never seen, not to repair the one it has. The *shape* of a declared
 *  range (non-empty, `minMm <= maxMm`) is a catalogue defect rather than a rule, and
 *  `catalog.test.ts` fails on it loudly instead of this function quietly papering over it. */
export function resolveWidthRangesMm(
  body: InsertableBody,
): readonly WidthRangeMm[] {
  const floorMm = body.minWidthMm ?? DEFAULT_MIN_WIDTH_MM;
  const declared = body.definition.widthRangesMm;
  if (declared !== undefined) {
    return declared.map((range) => ({
      minMm: Math.max(range.minMm, floorMm),
      maxMm: range.maxMm,
    }));
  }
  if (body.definition.sizesAreStandardLadder === true) {
    return [{ minMm: floorMm, maxMm: Number.POSITIVE_INFINITY }];
  }
  return buildableSizes(body.minWidthMm, body.sizesMm).map((size) => ({
    minMm: size,
    maxMm: size,
  }));
}

/** ADR 0031 rule 5, read as the one question both width paths ask: **may this entry be built at
 *  this width?**
 *
 *  **One function, both callers** (ADR 0032 rule 4). §5.4's resize asks it of every column member;
 *  §5.2's `resolveWidth` asks it of the opening a `widthFlex: 'fit'` body would fill. Until this was
 *  shared the ladder flag was read by `setWidth` alone, so the insert path offered `wall-2door` into a
 *  300 mm opening and built exactly the mislabelled cabinet ADR 0029 forbids — `docs/BACKLOG.md`
 *  entry 13. ADR 0033's amendment did not add a second predicate beside this one either: it changed
 *  what this one reads.
 *
 *  **One predicate; two candidate sets, which differ on purpose** (logic review R1.5). It is the
 *  *question* that is shared, not the population it is asked about. §5.2 asks it of the opening's own
 *  width, so an insert reaches any width in a range. §5.4 asks it only of widths in
 *  `intersectColumnWidths`' candidate union — the **chips** somebody in the column offers — so a
 *  resize can only ever land on a modular width. That is why a 700 mm opening takes a hinged cabinet
 *  while no column can be resized *to* 700: `p24` can be rebuilt at the width it stands at and cannot
 *  be resized back to it. Deliberate, and the chip union is what keeps a resize modular; if that ever
 *  changes, §12's re-split (`docs/BACKLOG.md` entry 2) is the decision that would change it, not this
 *  function.
 *
 *  The width is in millimetres because that is the side the sets and ranges are stated on; a caller
 *  holding metres rounds through `toMillimetres` first. */
export function acceptsWidthMm(body: InsertableBody, widthMm: number): boolean {
  return resolveWidthRangesMm(body).some(
    (range) => widthMm >= range.minMm && widthMm <= range.maxMm,
  );
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
