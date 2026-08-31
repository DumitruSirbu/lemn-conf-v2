// `DEVELOPMENT-SPEC.md` §7's catalogue: the parameterised entries a customer can actually choose.
//
// ADR 0011 Gap A: these live in the *same* `BodyCatalog` map as M2's seeded decomposition entries,
// split only by `insertable`. One map, because a placement created by `insertBody` must resolve
// through the same lookup as a seeded one or `UnknownBodyError` becomes reachable at load; two
// populations, because a seeded entry describes one already-built body and must never be offered.
import { EXTRACTOR_HOOD_KIND } from "./body-kinds.js";
import { toMillimetres } from "./millimetres.js";
import {
  MIN_WIDTH_M,
  type Band,
  type BodyCatalog,
  type BodyDefinition,
  type WidthFlex,
  type WidthRangeMm,
} from "./void-engine.js";
import {
  finishesAtMm,
  NO_FRONT_ASSEMBLY_MM,
  shellPlusFrontMm,
  type OccupiedDepthRule,
} from "./occupied-depth.js";
import {
  WALL_FRONT_ASSEMBLY_MM,
  wallDepthMmForWorktop,
  WORKTOP_DEPTH_MM,
} from "./worktop-depth.js";

/** ADR 0026: §2's `MIN_W` in millimetres, as what it now is — the **default** width floor, which
 *  governs every entry that does not declare one of its own. */
const DEFAULT_MIN_WIDTH_MM = toMillimetres(MIN_WIDTH_M);

/** ADR 0035 decision 1: the module a cabinet's width steps by, and the grid the modular widths §9
 *  offers from a standing start sit on.
 *
 *  A **presentation** constant (ADR 0035 decision 8), and nothing downstream of the panel may depend
 *  on its value: M6 prices width with a formula rather than a table keyed on sizes precisely so that
 *  moving this to 25 mm costs no rework. The stepper itself is **relative** to a body's current
 *  width, not snapped to this grid — the shipped kitchen holds a 570 mm corner return and a 750 mm
 *  fridge column, and snapping would rewrite cabinets nobody touched. */
export const WIDTH_STEP_MM = 50;

/** §7: "everything else" — 1000 mm was dropped, because two doors top out at 800.
 *
 *  ADR 0035 decision 1 makes it the **ceiling** every cabinetry row carries, rather than the last
 *  rung of a ladder. What it stops being is a member of a list: a body is buildable at every width
 *  between its floor and this, and the list that used to stand in for that rule is gone. */
const CABINETRY_MAX_WIDTH_MM = 800;

/** Every multiple of `WIDTH_STEP_MM` inside these ranges: the modular widths a customer picks from.
 *
 *  Derived from the bound rather than maintained beside it (ADR 0035 decision 2). Six ADRs in a row
 *  curated per-entry lists that were really rules about ranges, and each time the list was narrower
 *  than the rule; a derivation cannot drift from the bound it reads. */
function steppedWidths(ranges: readonly WidthRangeMm[]): readonly number[] {
  const widths: number[] = [];
  for (const range of ranges) {
    const firstMm = Math.ceil(range.minMm / WIDTH_STEP_MM) * WIDTH_STEP_MM;
    for (let mm = firstMm; mm <= range.maxMm; mm += WIDTH_STEP_MM)
      widths.push(mm);
  }
  return widths;
}

/** A **cabinetry** row's width model: the bound it may be built inside, and the chips derived from
 *  it. One argument list, two fields, so a row cannot state a bound and a set that disagree. */
function cabinetryWidths(...ranges: readonly WidthRangeMm[]) {
  return { widthRangesMm: ranges, sizesMm: steppedWidths(ranges) } as const;
}

/** A **discrete** row's width model (ADR 0035 decision 3) — widths that are genuinely a set rather
 *  than a bound. Appliances are the main case, not the only one: `base-bottle-cargo` is cabinetry and
 *  stays discrete for ADR 0026's reason, that the proportion is the product: the sizes the appliance genuinely comes
 *  in, as one degenerate range each. A dishwasher is 450 or 600 because dishwashers are, and the
 *  cabinet is built around the appliance.
 *
 *  It writes `widthRangesMm` rather than leaving it absent for the reason `boundedWidths` used to
 *  write `sizesAreStandardLadder: false`: a row built by spreading `baseCabinet` or `wallCabinet`
 *  and then overriding only `sizesMm` would otherwise keep the **cabinetry** bound it inherited from
 *  the spread, and a dishwasher niche would accept every width from 300 to 800. The guard test in
 *  `catalog.test.ts` is what proves no row got it wrong. */
function discreteWidths(sizesMm: readonly number[]) {
  return {
    widthRangesMm: sizesMm.map((size) => ({ minMm: size, maxMm: size })),
    sizesMm,
  } as const;
}

/** ADR 0033: **the width at which a hinged cabinet stops being a one-door and becomes a two-door**,
 *  and the single point where that flips.
 *
 *  §7's **wall** builder branched here as `w > 0.45 ? 2 : 1` until ADR 0033 moved the branch into this
 *  constant, and it was *right*: a 400 mm carcass with one door is a correct cabinet, whichever side
 *  of the flip it sits on. What was wrong was the **name** on it, because
 *  the door count was declared by which of two catalogue rows the customer picked. `wall-2door` at
 *  400 mm was not a broken cabinet, it was a correct one-door cabinet wearing a two-door name.
 *
 *  So the constant moves **here**, into the domain, and `catalog-bodies.ts` imports it for the door
 *  count it hands the builder. §12 puts product rules in the domain and builders in the adapter, and
 *  "how many doors is this cabinet called" is a product rule. One constant, two readers — ADR 0028's
 *  discipline, applied to the second pair this project has found. Two literals agreeing by luck is
 *  the shape both ADR 0028 and §7's depth cap were written about.
 *
 *  **ADR 0035 decision 4 moved the value from 450 to 500, and the comparison from `>` to `>=`.**
 *  Forced by the stepper rather than chosen beside it. Under a `[400, 600, 800]` ladder nothing ever
 *  landed between 400 and 600, so the threshold's exact value was unobservable; a stepper reaches
 *  500 and 550, and relative stepping reaches 470 as well (570 → 520 → 470). The rule is therefore
 *  stated as a half-open bound over the whole continuum: **499 and below is one door, 500 and above
 *  is two.**
 *
 *  Noted because it reads as an off-by-one: the constant has been holding a value that gets **one**
 *  door. At 500 with `>=` the name finally describes the value. */
export const TWO_DOOR_MIN_WIDTH_MM = 500;

/** ADR 0030's amendment, carried through ADR 0033's merge in the ADR 0026 mechanism: 200 and 300 sit
 *  **below** §2's default floor, so the merged rows must each declare their own or `buildableSizes`
 *  would filter both widths straight back out of the set they were just given.
 *
 *  Three entries declared downward before this merge and three still do — the count is unchanged, but
 *  the rows are not: the two hinged rows (`base-cabinet` and `wall-cabinet`, which ADR 0033 merged the former `base-1door`/`wall-1door` into) are gone and the two merged cabinets carry it
 *  instead, alongside `base-bottle-cargo`. What ADR 0026 protects is untouched: `MIN_WIDTH_M` does
 *  not move, so no row inherits the exception, and each row states it on its own line. */
const HINGED_CABINET_MIN_WIDTH_MM = 200;

/** ADR 0033's amendment, as ADR 0035 leaves it: a hinged cabinet's widths were never a list, and
 *  since the owner's 2026-08-28 decision they are not two ranges either — they are **one continuous
 *  bound**, with the door count following the width inside it.
 *
 *  | width   | builder makes | verdict |
 *  | ------- | ------------- | ------- |
 *  | 200–499 | 1 door        | allowed |
 *  | 500–800 | 2 doors       | allowed |
 *  | 801+    | 2 doors       | refused |
 *
 *  **ADR 0030's 400 mm one-door cap is retired**, and with it the (400, 500) hole a first pass at
 *  this wave preserved. The owner retired it in the same breath as setting the threshold: *"let's
 *  add this 450 for one door… make it still 500, so it'll cover this gap between 450 and 500, and
 *  two doors start from 500."* One door therefore runs to 499, and 450 is an ordinary one-door
 *  cabinet rather than a width that falls between two rules.
 *
 *  That is not a detail. The hole was the reason column `A|2.00` could not take the dishwasher's
 *  450 — the `wall-cabinet` above it could not match — which is the case ADR 0034 was written
 *  around and which §11 row 14 asserts. It closes here.
 *
 *  ADR 0029's half of the old bound is gone for the same reason: its 600 mm two-door floor was the
 *  edge of `wall-2door`'s curated list, and ADR 0035 rejects "forbid 500/550" by name — excluding a
 *  width is reintroducing the list this decision removes. 500 and 550 are two-door cabinets of 250
 *  and 275 mm leaves, and they are offered. */
const HINGED_CABINET_WIDTHS = cabinetryWidths({
  minMm: HINGED_CABINET_MIN_WIDTH_MM,
  maxMm: CABINETRY_MAX_WIDTH_MM,
});

/** ADR 0035 decision 1: the bound every cabinetry row carries unless it declares one of its own —
 *  §2's default floor up to §7's 800 mm ceiling. It replaces `STANDARD_LADDER`, and the difference
 *  is the whole point of ADR 0035 decision 2: a ladder said "these three widths are offered and the
 *  entry is silent about the rest", a bound says what the entry can be built at.
 *
 *  **`HINGED_CABINET_WIDTHS` above is this bound with a lower floor, and nothing else.** Once the
 *  owner retired ADR 0030's one-door cap the two stopped encoding different rules: both run to
 *  `CABINETRY_MAX_WIDTH_MM` in one unbroken range, and the hinged rows open at their own declared
 *  200 mm (ADR 0026's mechanism) where every other cabinetry row opens at §2's default. They are two
 *  constants because two rows declare a floor and eleven do not, so the exception stays visible on
 *  the rows that take it — not because a hinged cabinet obeys a different width rule. */
const CABINETRY_WIDTHS = cabinetryWidths({
  minMm: DEFAULT_MIN_WIDTH_MM,
  maxMm: CABINETRY_MAX_WIDTH_MM,
});

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

/** ADR 0017: the sink aperture's own width, which is the width at which the geometry is correct
 *  rather than merely inside `FIT_TOLERANCE_M`. */
const SINK_MIN_WIDTH_MM = 560;
/** ADR 0026: the bottle cargo's own set. A millimetre set rather than a cabinetry bound, because the
 *  **proportion is the product**: a body that filled its opening — or that stepped up to 800 — would
 *  be an 800 mm cabinet with one front, which is not a bottle cargo.
 *
 *  **ADR 0035 leaves this row discrete on purpose.** Decision 3 exempts a row whose width is
 *  genuinely fixed, and backlog entry 2 records that the bottle cargo's exact members are *not
 *  established* — "200–300, its own set", with the members awaiting the owner. Stepping it would
 *  invent 250 as a manufactured width, which is the shape of guess ADR 0035 exists to stop. Its
 *  ~200 mm floor (ADR 0026) is the rule that must survive, and `minWidthMm` below is where it does. */
const BOTTLE_CARGO_WIDTHS_MM: readonly number[] = [200, 300];

/** ADR 0026: below §2's default floor, deliberately. It was the only entry declaring *under* the
 *  default until ADR 0030's amendment; the two hinged rows (`base-cabinet` and `wall-cabinet`, which ADR 0033 merged the former `base-1door`/`wall-1door` into) now do too, at the same 200. */
const BOTTLE_CARGO_MIN_WIDTH_MM = 200;

/** ADR 0027: a hob-bearing base is 600 mm and nothing else. The hob itself is a 600 mm appliance
 *  — `builders.cooktop()` is a fixed 590 x 520 glass plate — so the cabinet under it is the one
 *  width that appliance is made for. A single-member set rather than `'fit'`, for the reason the
 *  bottle cargo has one: a `'fit'` body would build an 800 mm cabinet with a 600 mm hob adrift on
 *  it. */
const HOB_BASE_WIDTHS_MM: readonly number[] = [600];

/** ADR 0027: the kind of appliance both hob-bearing bases declare they carry built into them.
 *  It was the `kind` of the standalone `cooktop-600` placement before the migration; ADR 0038
 *  deleted that entry along with the rest of the accessory machinery, so the string now names the
 *  appliance and nothing else — see `carriesAccessoryKind`. */
const HOB_ACCESSORY_KIND = "induction_cooktop";

const DISHWASHER_WIDTHS_MM: readonly number[] = [450, 600];

/** ADR 0035 decision 5: **the hood starts at 600 and its `−50` is greyed out there.** The owner,
 *  on the hood specifically. It replaces the discrete `{600, 900}` ADR 0033's amendment left it
 *  with — 900 was above §7's own ceiling for every other cabinetry row, and refusing 700 was the
 *  defect that amendment had already set out to fix.
 *
 *  **It is the bound's floor and not a `minWidthMm`, and the difference is ADR 0026 clause 2.** A
 *  floor declared *upward* through `minWidthMm` is a **builder limitation** — an entry admitting its
 *  builder is not parameterised, the way `base-sink` inverts below its 560 mm aperture — and
 *  `catalog-bodies.adversarial.test.ts` holds every such row to actually breaking below it. §7's
 *  hood builder is perfectly correct at 599. What is true at 599 is that the owner does not sell
 *  one, which is a product decision and belongs in the range. */
const HOOD_FLOOR_WIDTH_MM = 600;

const COLUMN_WIDTHS_MM: readonly number[] = [600];
const FREESTANDING_FRIDGE_WIDTHS_MM: readonly number[] = [700];

/** §2: worktop top = `PLINTH + CARC_H + CTOP`. Every base carcass builds to it. */
const WORKTOP_HEIGHT_MM = 860;
const WALL_CABINET_HEIGHT_MM = 700;
/** ADR 0039 decision 5. It was **710**, and §11 row 6's prose still says "fixed 710 mm", against a
 *  seeded `hood-600` storing 700 — two records against one, which is how the wrong datum survived.
 *  The geometry settles it: wave 5F measured a built hood with the real `BodyProbe` and its carcass
 *  — canopy plus chimney, ADR 0016 — is **700.000 mm**, confirming the fixture rather than the
 *  catalogue. (Its *full* extent is 706: `hood_filter` hangs 6 mm below the canopy, which is why
 *  the ADR's "130 + 570" arithmetic and a measurement are not the same number. `fullHeightM` is
 *  deliberately not a fit gate, §5.2.)
 *
 *  Not tidiness: the declared nominal is what `evaluateInsertFit` reserves and what
 *  `BUILT_SIZE_MISMATCH` compares against, so over-declaring by 10 mm made a hood refuse openings
 *  it fits, and (until 5D2b) grew a resized seeded hood into the level above. */
const HOOD_HEIGHT_MM = 700;
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
/** ADR 0039 decision 1: **the hood's depth is standard and does not follow the depth map.** A hood
 *  is a manufactured appliance sized to the cooktop it covers, not cabinetry sized to the run it
 *  hangs on — which is the opposite direction from ADR 0035 decision 5, where its *width* is
 *  cabinetry bounded 600–800. */
const HOOD_DEPTH_MM = 500;

/** §11 row 19's second named exception, as the number `void-engine.ts` falls back to when a
 *  placement carries no measured `seatDepthMm`.
 *
 *  A front-hung hood's group origin sits `cabinetDepth − 500/2` off the wall, and `frameDepthMm` is
 *  twice that offset (ADR 0018), so at a 600 mm kitchen it is 700 for a body that is 500 deep. The
 *  gap behind it is real and declared; the number is derived from the same constant the rest of the
 *  depth story reads, never typed. */
function hoodFrameDepthMm(): number {
  return 2 * WORKTOP_DEPTH_MM - HOOD_DEPTH_MM;
}

// `EXTRACTOR_HOOD_KIND` and `WALL_CABINET_KIND` moved to `body-kinds.ts` so `void-engine.ts` can
// read them without a cycle; re-exported here, where every existing caller already looks for them.
export { EXTRACTOR_HOOD_KIND } from "./body-kinds.js";
const COLUMN_DEPTH_MM = 560;
const FREESTANDING_FRIDGE_DEPTH_MM = 680;

// §3.1's depth, per body: **how far the finished body stands from the wall plane.** A separate
// vocabulary from the nominal depths above, and it has to be one — a nominal depth is what §5.2
// hands the probe, a finished depth is the space the built body fills, and every constant below is
// a case where the two are different numbers. Wave 5F found two of them (ADR 0036, ADR 0039); DOM-002
// found that the four families nobody had measured were wrong in the same direction.
//
// Every value here was **measured on the built geometry**, and `occupied-depth.parity.test.ts` in
// `@lemnaria/three-adapter` holds each one to the meshes it was read off. That gate is what keeps a
// declaration like this honest: ADR 0028's own remedy for two numbers agreeing by luck.

/** How far a worktop stands proud of the cabinet front it sits on. The `countertop` mesh is 620 mm
 *  deep against the 600 mm cabinet-depth line, seated 20 mm forward. */
const WORKTOP_OVERHANG_MM = 20;

/** A base run finishes at its **worktop's** front edge — not its carcass's (588 mm from the wall)
 *  and not its bar handles' (609), both of which stand behind the counter that is already there. */
export const BASE_FINISHED_DEPTH_MM = WORKTOP_DEPTH_MM + WORKTOP_OVERHANG_MM;

/** The dishwasher niche is the one ordinary base body whose front passes its own worktop: the
 *  appliance's door bar reaches 12 mm past it. */
export const DISHWASHER_BASE_FINISHED_DEPTH_MM = 632;

/** An oven fascia and its bar stand further proud than a dishwasher door, so the hob-and-oven base
 *  passes its worktop by 28 mm. */
export const HOB_OVEN_BASE_FINISHED_DEPTH_MM = 648;

/** A full-height cabinet is its carcass plus the **same** door-and-handle assembly a fronted wall
 *  carcass carries — ADR 0036 decision 1's 39 mm, on the same door and bar meshes. Derived from the
 *  two constants rather than written as 599, so a change to either moves this with it. */
export const TALL_UNIT_FINISHED_DEPTH_MM =
  COLUMN_DEPTH_MM + WALL_FRONT_ASSEMBLY_MM;

/** The oven tower is a full-height carcass carrying an oven and a microwave, whose handles reach
 *  39 mm further than the cabinet doors beside them. */
export const OVEN_TOWER_FINISHED_DEPTH_MM = 638;

/** A freestanding fridge: a 680 mm appliance body and the two door bars hung on it. */
export const FREESTANDING_FRIDGE_FINISHED_DEPTH_MM = 742;

/** ADR 0039 decision 2: a hood is hung at the **front**, so its finished face is the cabinet-depth
 *  line whatever seat it records, and the gap its chimney hides sits behind it. The one entry whose
 *  finished depth is smaller than its `frameDepthMm`. */
export const HOOD_FINISHED_DEPTH_MM = WORKTOP_DEPTH_MM;

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
  /** **Required, like `widthRangesMm` below and for the same reason.** `baseCabinet`, `wallCabinet`
   *  and `fullHeightUnit` each spread a shape, so a shape that stayed silent would inherit whatever
   *  rule the helper it was built with happened to carry — and a depth rule inherited by accident is
   *  precisely DOM-002. Every shape states its own. */
  readonly occupiedDepth: OccupiedDepthRule;
  readonly sizesMm: readonly number[];
  /** **Required, not optional** (logic review R1.10, carried through ADR 0035). `BodyDefinition`
   *  reads an absent declaration as "derive the ranges", which is the conservative direction there.
   *  It is *not* the conservative direction here: `baseCabinet` and `wallCabinet` spread
   *  `CABINETRY_WIDTHS`, so a shape that said nothing would inherit the **permissive** 300–800 bound
   *  from the helper it was built with. Required, so every shape states its own and the guard test in
   *  `catalog.test.ts` is a second line rather than the only one.
   *
   *  It travels with `sizesMm` and is never written beside it: `cabinetryWidths` and
   *  `discreteWidths` each produce both fields from one argument. */
  readonly widthRangesMm: readonly WidthRangeMm[];
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
    occupiedDepth: finishesAtMm(BASE_FINISHED_DEPTH_MM),
    ...CABINETRY_WIDTHS,
  });
}

/** ADR 0027: a base cabinet that carries the hob. Every other property is a base cabinet's — same
 *  band, same 860 mm worktop line, same 580 mm depth — so it is a `baseCabinet` with its width
 *  fixed, and the width is fixed because the appliance is. */
function hobBase(label: string): BodyDefinition {
  return {
    ...baseCabinet(label),
    widthFlex: HOB_BASE_WIDTHS_MM,
    ...discreteWidths(HOB_BASE_WIDTHS_MM),
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
      // The one builder family whose depth is a placement variable: `wallCabinet` centres the shell
      // it is given on z = 0, so `frame.d` is that shell and the finished cabinet is 39 mm deeper.
      occupiedDepth: shellPlusFrontMm(WALL_FRONT_ASSEMBLY_MM),
      ...CABINETRY_WIDTHS,
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
      occupiedDepth: finishesAtMm(TALL_UNIT_FINISHED_DEPTH_MM),
      ...discreteWidths(COLUMN_WIDTHS_MM),
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
      ...HINGED_CABINET_WIDTHS,
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
      // The oven's own fascia and bar, which reach past the worktop every other base body stops at.
      occupiedDepth: finishesAtMm(HOB_OVEN_BASE_FINISHED_DEPTH_MM),
    },
  ],
  [
    "base-bottle-cargo",
    {
      ...baseCabinet("Cargo îngust pentru sticle"),
      widthFlex: BOTTLE_CARGO_WIDTHS_MM,
      ...discreteWidths(BOTTLE_CARGO_WIDTHS_MM),
      minWidthMm: BOTTLE_CARGO_MIN_WIDTH_MM,
    },
  ],
  [
    "base-sink",
    {
      ...baseCabinet("Corp spălător"),
      // ADR 0033's amendment (owner, 2026-08-27; logic review R1.1): **a sink base is cabinetry with
      // a fixed aperture, not an appliance that comes in sizes.** What is fixed is the bowl — 560 mm,
      // which `minWidthMm` below states — and not the carcass around it. The owner's own case:
      // "there are a lot of cases when the sink is 800 — in my kitchen it's an 800 cabinet." An 800
      // sink base is ordinary, and so is a 700.
      //
      // `{600, 800}` was the chip ladder ADR 0017 left behind when it removed 400. The bound says the
      // rule instead: anything from the aperture up to §7's ceiling.
      ...cabinetryWidths({
        minMm: SINK_MIN_WIDTH_MM,
        maxMm: CABINETRY_MAX_WIDTH_MM,
      }),
      minWidthMm: SINK_MIN_WIDTH_MM,
    },
  ],
  [
    "base-dishwasher",
    {
      ...baseCabinet("Nișă mașină de spălat vase"),
      kind: "dishwasher_housing",
      occupiedDepth: finishesAtMm(DISHWASHER_BASE_FINISHED_DEPTH_MM),
      widthFlex: DISHWASHER_WIDTHS_MM,
      ...discreteWidths(DISHWASHER_WIDTHS_MM),
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
      ...HINGED_CABINET_WIDTHS,
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
      // No door and no handle, so its shell and its finished depth are the same number.
      occupiedDepth: shellPlusFrontMm(NO_FRONT_ASSEMBLY_MM),
      canFinish: false,
      canHandle: false,
    },
  ],
  [
    "hood",
    {
      ...wallCabinet("Hotă"),
      kind: EXTRACTOR_HOOD_KIND,
      canFinish: false,
      canHandle: false,
      heightFlex: false,
      nominalHeightMm: HOOD_HEIGHT_MM,
      nominalDepthMm: HOOD_DEPTH_MM,
      // Front-hung (ADR 0039 decision 2), so neither the wall rule above nor its own 500 mm body
      // answers this: what it occupies is the wall plane to the cabinet-depth line.
      occupiedDepth: finishesAtMm(HOOD_FINISHED_DEPTH_MM),
      // Declared, not inherited: the spread above stamps `frameDepthMm` from `WALL_DEPTH_MM`, which
      // ADR 0036's depth map governs, and ADR 0039 decision 1 exempts the hood from that map —
      // *"hood is always standard"*, 500 at a 600 mm kitchen and 500 at a 700 mm one. Leaving it
      // inherited put a map-derived number behind a rule the map does not reach (QA finding Q1.1).
      //
      // **The one entry where the two depth fields deliberately disagree** (`catalog.test.ts` names
      // it as the exception rather than dropping the sweep). `frameDepthMm` is not a depth — ADR
      // 0018 — it is twice the body's rear overhang, and ADR 0039 decision 2 hangs the hood at the
      // front, so its back face is `cabinetDepth − 500` off the wall plane and its seat is measured
      // from the cabinet-depth line instead. That is §11 row 19's second named exception, after
      // ADR 0025's corner leg, and this is the fallback that has to agree with the probe.
      frameDepthMm: hoodFrameDepthMm(),
      // ADR 0035 decision 5: **the hood is cabinetry, bounded 600–800.** It keeps `wallCabinet`'s
      // `widthFlex: 'fit'` — so a 700 mm opening gets a 700 mm hood rather than a 600 adrift in it —
      // and declares the floor its `−50` is greyed out at.
      //
      // This retires ADR 0033's amendment on this row rather than contradicting it. That amendment
      // was fixing the same defect from the other side: the hood was the one row that was both
      // `'fit'` and discretely bounded, so it alone refused a 700 mm opening where every discrete row
      // narrows into one. ADR 0035 removes the discrete set instead, and "a 700 mm hood is not a
      // product" goes with it — the owner has ruled that a hood is made anywhere in 600–800.
      ...cabinetryWidths({
        minMm: HOOD_FLOOR_WIDTH_MM,
        maxMm: CABINETRY_MAX_WIDTH_MM,
      }),
    },
  ],
  ["tall-pantry", fullHeightUnit("Coloană cămară", "tall_unit")],
  [
    "tall-oven-tower",
    {
      ...fullHeightUnit("Coloană cuptor + microunde", "tall_unit"),
      // Two appliance fronts instead of two cabinet doors, and their bars reach further.
      occupiedDepth: finishesAtMm(OVEN_TOWER_FINISHED_DEPTH_MM),
    },
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
      ...discreteWidths(FREESTANDING_FRIDGE_WIDTHS_MM),
      nominalHeightMm: FREESTANDING_FRIDGE_HEIGHT_MM,
      nominalDepthMm: FREESTANDING_FRIDGE_DEPTH_MM,
      occupiedDepth: finishesAtMm(FREESTANDING_FRIDGE_FINISHED_DEPTH_MM),
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
 *  function.
 *
 *  The comparison is `>=` (ADR 0035 decision 4): **499 and below is one door, 500 and above is two.**
 *  It was `>` against 450 while the ladder made everything between 400 and 600 unreachable; a stepper
 *  reaches 470, 500 and 550, so the half-open bound has to be right rather than merely unobserved. */
export function deriveDoorCount(widthMm: number): number {
  return widthMm >= TWO_DOOR_MIN_WIDTH_MM ? 2 : 1;
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
 *  It is a no-op for every shipped entry, and ADR 0035 keeps it one by construction:
 *  `cabinetryWidths` steps from the entry's own floor, so a chip under it is not generated in the
 *  first place. `base-bottle-cargo`'s 200 and 300 sit on the floor it declares, and every discrete
 *  row's narrowest size is at or above the 300 mm default — 450 for the dishwasher, 600 for the
 *  columns, 700 for `fridge-free`. Nothing is filtered out.
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
 *  **ADR 0035 decision 2 left every §7 row declaring its own**, through `cabinetryWidths` or
 *  `discreteWidths`, each of which produces the ranges and the chips from one argument. The
 *  standard-ladder arm this used to carry — one range from the floor upward with **no maximum** — is
 *  gone with the ladder: a cabinetry row now has a ceiling, and "unbounded above" was the ladder
 *  saying it had no opinion rather than a rule anybody decided.
 *
 *  The undeclared arm survives as the derivation for an entry that carries only `sizesMm`: one
 *  degenerate range per size, which is the conservative reading of a bare list. No shipped §7 row
 *  reaches it, and `catalog.test.ts` asserts that.
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
