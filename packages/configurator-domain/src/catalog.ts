// `DEVELOPMENT-SPEC.md` §7's catalogue: the parameterised entries a customer can actually choose.
//
// ADR 0011 Gap A: these live in the *same* `BodyCatalog` map as M2's seeded decomposition entries,
// split only by `insertable`. One map, because a placement created by `insertBody` must resolve
// through the same lookup as a seeded one or `UnknownBodyError` becomes reachable at load; two
// populations, because a seeded entry describes one already-built body and must never be offered.
import { seatedOnCabinetFrontLine, seatedOnWallPlane } from "./seat-rule.js";
import type { SeatRule } from "./seat-rule.js";
import {
  EXTRACTOR_HOOD_KIND,
  WALL_CORNER_RETURN_KIND,
  WALL_CORNER_RETURN_TOP_KIND,
} from "./body-kinds.js";
import { toMillimetres } from "./millimetres.js";
import {
  CARRIES_SINK,
  MIN_WIDTH_M,
  NO_SINK,
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
import {
  carriesHandles,
  handlesOnDoorLeaves,
  NO_CABINET_HANDLES,
  type CabinetHandleRule,
} from "./cabinet-handles.js";
import {
  BASE_DOOR_BAND_HEIGHT_MM,
  carriesDrawers,
  carriesFronts,
  doorBandsMm,
  FRIDGE_HOUSING_DOOR_BAND_HEIGHTS_MM,
  OVEN_TOWER_DOOR_BAND_HEIGHTS_MM,
  PANTRY_DOOR_BAND_HEIGHTS_MM,
  doorLeavesFollowWidth,
  NO_DRAWERS,
  NO_OPENING_FRONTS,
  oneBandInsetFromFrameMm,
  WALL_DOOR_BAND_INSET_MM,
  type FrontPopulationRule,
} from "./front-population.js";
import { deriveDoorCount, TWO_DOOR_MIN_WIDTH_MM } from "./door-count.js";
import {
  FOLLOWS_CABINET_DEPTH,
  IS_A_MANUFACTURED_SIZE,
  type CabinetDepthRule,
} from "./cabinet-depth-rule.js";
import {
  CHOOSES_ITS_OWN_COLOUR,
  FOLLOWS_THE_KITCHENS_COLOUR,
  IS_NEVER_PAINTED,
} from "./body-finish-rule.js";

// Wave 6L moved these two into `door-count.ts`, and they are re-exported here unchanged: every
// reader imports them from this module or from the package barrel, and the move exists only so the
// handle rule can read the door count without `catalog.ts` and `cabinet-handles.ts` importing each
// other.
export { deriveDoorCount, TWO_DOOR_MIN_WIDTH_MM };

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
 *  between its floor and this, and the list that used to stand in for that rule is gone.
 *
 *  **Not the same constant as `MAX_EMPTY_COLUMN_WIDTH_MM`**, which is ADR 0052's ceiling on an empty
 *  column. They carry the same 800 and they are not the same rule: this one says how wide a cabinet
 *  may be built, that one how wide a space may be left. The ceiling on a space exists so that any
 *  space the customer is left with is one the catalogue can fill, so it must never exceed this —
 *  the direction of the dependency, asserted by a test rather than by an import. Exported for that
 *  assertion alone; nothing in the empty-column code may read it, because `module-grid.ts` is a leaf
 *  and this module is not. */
export const CABINETRY_MAX_WIDTH_MM = 800;

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

/** ADR 0048: **the pantry column's own floor**, and the one place a full-height row declares a
 *  bound instead of a single width. The owner's reason for exempting this row and no other: it has
 *  no appliance inside it, so nothing fixed constrains how narrow it may be, where an oven tower's
 *  opening is sized to the appliance it holds.
 *
 *  It is the **bound's floor and not a `minWidthMm`**, for the reason `HOOD_FLOOR_WIDTH_MM` is
 *  (ADR 0026 clause 2): `tallPantry` builds a perfectly correct 350 mm cabinet. What is true at 350
 *  is that the owner does not sell one, which is a product decision and belongs in the range.
 *
 *  The ceiling is `CABINETRY_MAX_WIDTH_MM` — §7's own 800 — so the pantry stops where every other
 *  cabinetry row stops, rather than carrying a second copy of that number. */
const PANTRY_FLOOR_WIDTH_MM = 400;
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

/** How far a base body's **worktop** stands behind its carcass's back face. The counter is 60 mm
 *  deeper than the carcass and seated 20 mm forward, so 10 mm of it hangs off the back — and since
 *  ADR 0018 records a seat as twice the rear overhang, the seat is 20 mm inside the declared depth
 *  rather than the 40 the front overhang takes off it.
 *
 *  Measured on the built meshes at both declared depths — a base body seats on 580 at 600 and 680 at
 *  700 — and held to them by `occupied-depth.parity.test.ts`. Not derived from the builder's own
 *  constants: §12 keeps those in the adapter, and this is the same relationship
 *  `WORKTOP_OVERHANG_MM` below already states from the front. */
const BASE_SEAT_INSET_MM = 20;

/** §7's `nominalDepthMm` for the base rows, and therefore the `frameDepthMm` fallback
 *  `void-engine.ts` seats a placement with no measured seat of its own from.
 *
 *  **A function of the cabinet depth since M6 wave 6I**, which is 6H's own recorded carry-out: the
 *  finished depth followed the setting while this seat stayed the literal 580, so a catalogue built
 *  at 700 described a body finishing at 720 on a 580 mm seat — a back face 50 mm off the wall plane
 *  (§11 row 19). */
export function baseSeatDepthMm(cabinetDepthMm: number): number {
  return cabinetDepthMm - BASE_SEAT_INSET_MM;
}

/** What a base carcass gives up at the front to the door slab and bar handle that stand on it. Named
 *  for the base band alone: `COLUMN_FRONT_OVERHANG_MM` is the column's own, and the two are the same
 *  40 mm by arithmetic rather than by being one fact. */
const BASE_FRONT_OVERHANG_MM = 40;

/** A base carcass's own shell — the declared depth less the fronts in front of it, which is the
 *  adapter's `KitDepths.baseCarcassDepthM` seen from the domain side.
 *
 *  Exported because ADR 0025 seats the corner X-leg on it: that leg's carcass is the full declared
 *  depth, and it stands 20 mm inside the wall so that its *front* lines up with the base run's, so
 *  its recorded seat is this number and not its own footprint. */
export function baseCarcassDepthMm(cabinetDepthMm: number): number {
  return cabinetDepthMm - BASE_FRONT_OVERHANG_MM;
}
/** A wall entry's nominal depth: §7's head-clearance cap, which is what a wall carcass is built to
 *  over a worktop. It is the `frameDepthMm` fallback for a placement with no measured seat of its
 *  own, **not** the depth anything gets built to — that is decided per opening by
 *  `WALL_CARCASS_MAX_DEPTH_OVER_WORKTOP_M`, and over a full-height column it is deeper than this.
 *
 *  Read from the worktop → wall depth map rather than written down, so it and that cap are the same
 *  number by construction. Two independent literals agreeing at 400 is the defect this replaces.
 *
 *  **A function of the cabinet depth since M6 wave 6H**, not a constant resolved at import time: a
 *  catalogue frozen at one depth cannot serve a design that carries another, and 6J's *Setări
 *  globale* control is what makes the argument vary. It throws on a depth the map does not declare
 *  (ADR 0028 decision 4) — the refusal travels with the parameterisation rather than being softened
 *  by it. */
export function wallCarcassDepthMm(cabinetDepthMm: number): number {
  return wallDepthMmForWorktop(cabinetDepthMm);
}

/** The **seat** a fronted wall or top carcass records: its shell, which is the declared depth less
 *  ADR 0036 decision 1's door-and-handle assembly. 291 at a 600 mm kitchen and 361 at a 700 mm one.
 *
 *  Exported for the seeded rows, which record a measured seat rather than a nominal depth. They read
 *  it here rather than deriving it themselves so a seeded top and the §7 `wall-cabinet` a §5.4
 *  resize would rebuild it through cannot answer differently — the drift ADR 0028 exists to stop.
 *  An open shelf is the one fronted-band body this is wrong for: it has no front, so its seat is
 *  `wallCarcassDepthMm` all by itself. */
export function wallCarcassSeatDepthMm(cabinetDepthMm: number): number {
  return wallCarcassDepthMm(cabinetDepthMm) - WALL_FRONT_ASSEMBLY_MM;
}
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
 *  gap behind it is real and declared; the number is derived from the same cabinet depth the rest of
 *  the depth story reads, never typed. */
export function hoodFrameDepthMm(cabinetDepthMm: number): number {
  return 2 * cabinetDepthMm - HOOD_DEPTH_MM;
}

// `EXTRACTOR_HOOD_KIND` and `WALL_CABINET_KIND` moved to `body-kinds.ts` so `void-engine.ts` can
// read them without a cycle; re-exported here, where every existing caller already looks for them.
export { EXTRACTOR_HOOD_KIND } from "./body-kinds.js";
/** What a full-height carcass carries in front of its shell, the same 40 mm a base carcass gives up
 *  to its own fronts. Named separately because the two are different products and only agree by
 *  arithmetic: a column's fronts and a base's are the same slab and bar, and if one ever stops being
 *  so, this is the number that moves. */
const COLUMN_FRONT_OVERHANG_MM = 40;

/** A full-height carcass's depth — **cabinetry, so it follows the depth setting** (M6 wave 6I,
 *  ADR 0036 decision 5). 560 at a 600 mm kitchen and 660 at a 700 mm one, both measured on
 *  `tallCarcass`'s own meshes rather than projected.
 *
 *  What does **not** follow is what stands *inside* a column: an oven and a microwave are
 *  manufactured sizes, and `ovenTowerFinishedDepthMm` states that split rather than moving the whole
 *  body together. This is the half of wave 6I's criterion 2 that a full-height cabinet is a cabinet. */
export function columnCarcassDepthMm(cabinetDepthMm: number): number {
  return cabinetDepthMm - COLUMN_FRONT_OVERHANG_MM;
}

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
 *  and not its bar handles' (609), both of which stand behind the counter that is already there.
 *
 *  The overhang is a constant and never a proportion (ADR 0036 decision 3 puts the worktop outside
 *  geometry and price), so a 700 mm kitchen finishes at 720. */
export function baseFinishedDepthMm(cabinetDepthMm: number): number {
  return cabinetDepthMm + WORKTOP_OVERHANG_MM;
}

/** How far an oven's fascia and bar stand proud of the **worktop** of the base body they are built
 *  into. A dishwasher's decor door stops behind that worktop; an oven's does not.
 *
 *  **The manufactured half of wave 6I's criterion 2, on the base band.** The number is a property of
 *  the appliance and of where it is mounted — its fascia rests on the carcass's front edge — so it
 *  is the same 28 mm at every cabinet depth, while the worktop it is measured from follows the
 *  setting. Moving the appliance's own dimensions with the setting would build an oven nobody
 *  manufactures; holding the whole body still would leave the oven behind its own cabinet front. */
const OVEN_FRONT_PAST_WORKTOP_MM = 28;

/** ADR 0027's hob-and-oven base: a base body finishing at its oven's bar instead of its worktop.
 *  648 at a 600 mm kitchen, 748 at a 700 mm one — the same +100 the formula moves `baseCabinet` by,
 *  because the carcass front the oven is mounted on moves by it. */
export function hobOvenBaseFinishedDepthMm(cabinetDepthMm: number): number {
  return baseFinishedDepthMm(cabinetDepthMm) + OVEN_FRONT_PAST_WORKTOP_MM;
}

/** The hob-and-oven base's finished depth in the shipped kitchen. */
export const HOB_OVEN_BASE_FINISHED_DEPTH_MM =
  hobOvenBaseFinishedDepthMm(WORKTOP_DEPTH_MM);

/** A full-height cabinet is its carcass plus the **same** door-and-handle assembly a fronted wall
 *  carcass carries — ADR 0036 decision 1's 39 mm, on the same door and bar meshes. Derived from the
 *  carcass it is given rather than written as 599, so a change to either moves this with it.
 *
 *  **Its argument is the column depth and not the cabinet depth, which wave 6I keeps.** 6H left the
 *  distinction open because `COLUMN_DEPTH_MM` was a literal; `columnCarcassDepthMm` now answers it,
 *  and this function is called with a carcass depth that follows the setting exactly as that note
 *  said it would be. The signature stays a column depth because that is what the arithmetic is over
 *  — a caller holding a carcass still, as ADR 0058's pinned entries do, passes the depth it means. */
export function tallUnitFinishedDepthMm(columnDepthMm: number): number {
  return columnDepthMm + WALL_FRONT_ASSEMBLY_MM;
}

/** How much further an oven-and-microwave tower's appliance fronts reach than the cabinet doors on
 *  the columns beside them.
 *
 *  **The manufactured half of wave 6I's criterion 2, on the column band**, and the same statement
 *  `OVEN_FRONT_PAST_WORKTOP_MM` makes for the base band: the two machines are the same size at every
 *  cabinet depth, and what moves is the carcass front their fascias rest on.
 *
 *  **Deliberately its own constant and not `WALL_FRONT_ASSEMBLY_MM`, which is also 39.** A door slab
 *  and a bar handle is not an oven fascia and its bar; they agree here by arithmetic, and two
 *  independent numbers agreeing by luck is the drift ADR 0028 exists to stop. */
const OVEN_TOWER_APPLIANCE_FRONT_MM = 39;

/** The oven tower: a full-height carcass whose two appliance fronts stand where its neighbours'
 *  cabinet doors do, plus their bars. 638 on a 560 mm column, 738 on a 660 mm one. */
export function ovenTowerFinishedDepthMm(columnDepthMm: number): number {
  return tallUnitFinishedDepthMm(columnDepthMm) + OVEN_TOWER_APPLIANCE_FRONT_MM;
}

/** A freestanding fridge: a 680 mm appliance body and the two door bars hung on it. */
export const FREESTANDING_FRIDGE_FINISHED_DEPTH_MM = 742;

/** ADR 0039 decision 2: a hood is hung at the **front**, so its finished face is the cabinet-depth
 *  line whatever seat it records, and the gap its chimney hides sits behind it. The one entry whose
 *  finished depth is smaller than its `frameDepthMm`.
 *
 *  **The finished line follows the setting and the body does not**: `HOOD_DEPTH_MM` stays 500 at
 *  every depth (ADR 0039 decision 1, *"hood is always standard"*), so the concealed gap behind the
 *  chimney is 100 mm at 600 and 200 mm at 700. That growing gap is the decision, not a defect to be
 *  closed by putting the hood back on the map. */
export function hoodFinishedDepthMm(cabinetDepthMm: number): number {
  return cabinetDepthMm;
}

const INSERTABLE_DEFAULTS = {
  insertable: true,
  // ADR 0092 decision 9's default, right for every §7 row but `base-sink`, which overrides it on its
  // own line. Safe only because the parity gate holds both directions of the declaration against the
  // `sink_faucet` group the builders draw — see `BodyDefinition.sink`.
  sink: NO_SINK,
  canFinish: true,
  // Ordinary cabinetry: the customer may colour this body alone, and where they have not it follows
  // the kitchen and then the material's default (ADR 0099 decision 1's order). Declared beside
  // `canFinish` because `bodyFinishRuleOf` refuses an entry where the two disagree, and overridden
  // by the three §7 rows that are not ordinary cabinetry — the shelf, the hood and the fridge.
  finishRule: CHOOSES_ITS_OWN_COLOUR,
  canHandle: true,
  canReplace: true,
  canDelete: true,
  fixedWidth: false,
  heightFlex: false,
} as const;

interface BodyShape {
  readonly kind: string;
  readonly widthFlex: WidthFlex;
  readonly nominalHeightMm: number;
  readonly nominalDepthMm: number;
  /** **Twice the body's rear overhang** (ADR 0018), where that is not the nominal depth — which is
   *  the case for every fronted wall row: `wallCabinet` builds `D − 39` centred on `z = 0`, so its
   *  frame is the **shell** and its nominal is the finished cabinet, 39 mm deeper.
   *
   *  Declared per row rather than derived from `occupiedDepth` inside `insertableBody` (ADR 0075
   *  decision 1): that would be one declaration deriving another, which is ADR 0028 decision 4's own
   *  subject, and it would read the wrong `frontAssemblyMm` for `open-shelf` — which overrides its
   *  `occupiedDepth` **after** the spread and whose seat genuinely is the full nominal.
   *
   *  Absent means the two are the same number, which is true of every base, full-height and
   *  appliance row: their builders ignore the depth they are handed and their nominal already states
   *  the seat (`baseSeatDepthMm` is 580 at 600, not 600). */
  readonly frameDepthMm?: number;
  /** **Required, like `widthRangesMm` below and for the same reason.** `baseCabinet`, `wallCabinet`
   *  and `fullHeightUnit` each spread a shape, so a shape that stayed silent would inherit whatever
   *  rule the helper it was built with happened to carry — and a depth rule inherited by accident is
   *  precisely DOM-002. Every shape states its own. */
  readonly occupiedDepth: OccupiedDepthRule;
  /** **Required, for the reason `occupiedDepth` above is** (ADR 0061 decision 3). The three helpers
   *  below each spread a shape and none of them can carry a useful default: `base-3drawer` draws
   *  three handles, `base-sink` two, `base-hob-oven` none of its own, and all three are a
   *  `baseCabinet`. A handle count inherited from whichever helper an entry happened to be built
   *  with is DOM-002 in a second field, so every entry passes its own. */
  readonly cabinetHandles: CabinetHandleRule;
  /** **Required, for the reason `cabinetHandles` above is**, and it is the same three bodies that
   *  make the point: `base-3drawer` is three drawers, `base-sink` is two door leaves, `base-hob-oven`
   *  is neither, and all three are a `baseCabinet`. A front population inherited from whichever
   *  helper an entry happened to be built with would put hinges on drawers, which is DOM-002 in a
   *  fourth field. Every entry passes its own, beside its handle count so the two are read together. */
  readonly fronts: FrontPopulationRule;
  /** **Required, for the reason the two above are** (ADR 0058 decision 2). A shape that stayed
   *  silent would be a §7 row nobody had decided the depth question for, and the whole point of the
   *  declaration is that "holds still because it was decided to" and "holds still because it was
   *  forgotten" stop looking alike. Required here makes the §7 population a compile error rather
   *  than a test failure; `cabinetDepthRuleOf` is what refuses the entries no required field can
   *  reach, and `refuseUndeclaredDepthRules` runs it over both populations as the catalogue is
   *  assembled — so the seeded rows, whose own field is optional, are refused at load. A definition
   *  arriving through the `BodyCatalog` port from outside TypeScript reaches neither, and is refused
   *  by the same function at the first wave that reads a rule off it: 6J's migration. */
  readonly depthRule: CabinetDepthRule;
  /** **Required, and with no default anywhere** (ADR 0077). Which plane fixes this body along the
   *  wall normal. A silent `?? wall-plane` is how a joint-seated corner leg came to be measured and
   *  re-seated 40 mm too deep; making the field required turns the §7 population into a compile
   *  error rather than a sweep somebody has to remember to run. */
  readonly seatRule: SeatRule;
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
  // `frameDepthMm` is the fallback for a placement that lacks one — a document written before a
  // measured seat existed, or one that arrived by a `/d/{id}` link (ADR 0052: a load that refuses is
  // a dead link, so such a document is loaded rather than rejected).
  //
  // **The nominal is the default and not the rule.** ADR 0018 fixes this field as twice the body's
  // rear overhang, which equals the nominal only where the builder seats the whole declared depth.
  // A fronted wall carcass does not: it builds `D − 39` centred on `z = 0`, so it states its own
  // (ADR 0075 decision 1). Stated at 330 rather than 291 the round trip is `330 → 369 → 408` —
  // ADR 0018 clause 4's compounding, in the growing direction — and `occupiedDepthM` publishes a
  // 369 mm wall cabinet nobody manufactures.
  return {
    ...INSERTABLE_DEFAULTS,
    band,
    ...shape,
    frameDepthMm: shape.frameDepthMm ?? shape.nominalDepthMm,
  };
}

/** **The two front declarations every §7 helper is handed together**, because they are two readings
 *  of the same fact and are wrong when they disagree: `cabinetHandles` is what the customer grips,
 *  `fronts` is what the hardware moves, and a push-to-open cabinet has the second and none of the
 *  first. Passed as one named object rather than as two positional arguments so a row states both or
 *  neither — and so the identity a reader wants to check (leaves plus drawers against handles) is
 *  legible in one place at each entry. */
interface FrontDeclarations {
  readonly cabinetHandles: CabinetHandleRule;
  readonly fronts: FrontPopulationRule;
}

function baseCabinet(
  cabinetDepthMm: number,
  declarations: FrontDeclarations,
): BodyDefinition {
  return insertableBody("base", {
    kind: "base_cabinet",
    // Every insertable body's back face sits on the wall plane, so its seat is measurable and
    // must stay measured (ADR 0077 decision 1; ADR 0011 Gap B §6.2 records two failed attempts at
    // predicting one). The two exceptions are seeded rows and declare their own.
    seatRule: seatedOnWallPlane,

    widthFlex: "fit",
    nominalHeightMm: WORKTOP_HEIGHT_MM,
    nominalDepthMm: baseSeatDepthMm(cabinetDepthMm),
    occupiedDepth: finishesAtMm(baseFinishedDepthMm(cabinetDepthMm)),
    depthRule: FOLLOWS_CABINET_DEPTH,
    ...declarations,
    ...CABINETRY_WIDTHS,
  });
}

/** ADR 0027: a base cabinet that carries the hob. Every other property is a base cabinet's — same
 *  band, same 860 mm worktop line, same 580 mm depth — so it is a `baseCabinet` with its width
 *  fixed, and the width is fixed because the appliance is. */
function hobBase(
  cabinetDepthMm: number,
  declarations: FrontDeclarations,
): BodyDefinition {
  return {
    ...baseCabinet(cabinetDepthMm, declarations),
    widthFlex: HOB_BASE_WIDTHS_MM,
    ...discreteWidths(HOB_BASE_WIDTHS_MM),
    fixedWidth: true,
    carriesAccessoryKind: HOB_ACCESSORY_KIND,
  };
}

function wallCabinet(
  cabinetDepthMm: number,
  declarations: FrontDeclarations,
): BodyDefinition {
  return {
    ...insertableBody("wall", {
      // Every insertable body's back face sits on the wall plane, so its seat is measurable and
      // must stay measured (ADR 0077 decision 1; ADR 0011 Gap B §6.2 records two failed attempts at
      // predicting one). The two exceptions are seeded rows and declare their own.
      seatRule: seatedOnWallPlane,
      ...declarations,
      kind: "wall_cabinet",
      widthFlex: "fit",
      nominalHeightMm: WALL_CABINET_HEIGHT_MM,
      nominalDepthMm: wallCarcassDepthMm(cabinetDepthMm),
      // The one builder family whose depth is a placement variable: `wallCabinet` centres the shell
      // it is given on z = 0, so `frame.d` is that shell and the finished cabinet is 39 mm deeper.
      //
      // **So the frame depth is the shell and the nominal is the finished cabinet**, and they are
      // two numbers here where every other band has one. `wallCarcassSeatDepthMm` is the same
      // function the seeded rows read, which is what makes a rebuild's swap
      // (`resolveRebuildBody`, ADR 0022) depth-neutral — the drift ADR 0028 exists to stop, and the
      // invariant `wallCarcassSeatDepthMm`'s own comment already claimed.
      frameDepthMm: wallCarcassSeatDepthMm(cabinetDepthMm),
      occupiedDepth: shellPlusFrontMm(WALL_FRONT_ASSEMBLY_MM),
      // Through the map rather than through a formula (ADR 0028 decision 2), which is still the
      // setting deciding it: 330 at 600 and 400 at 700.
      depthRule: FOLLOWS_CABINET_DEPTH,
      ...CABINETRY_WIDTHS,
    }),
    heightFlex: true,
  };
}

function fullHeightUnit(
  kind: string,
  cabinetDepthMm: number,
  declarations: FrontDeclarations,
): BodyDefinition {
  const columnDepthMm = columnCarcassDepthMm(cabinetDepthMm);
  return {
    ...insertableBody("column", {
      kind,
      // Every insertable body's back face sits on the wall plane, so its seat is measurable and
      // must stay measured (ADR 0077 decision 1; ADR 0011 Gap B §6.2 records two failed attempts at
      // predicting one). The two exceptions are seeded rows and declare their own.
      seatRule: seatedOnWallPlane,

      ...declarations,
      widthFlex: COLUMN_WIDTHS_MM,
      nominalHeightMm: COLUMN_HEIGHT_MM,
      nominalDepthMm: columnDepthMm,
      occupiedDepth: finishesAtMm(tallUnitFinishedDepthMm(columnDepthMm)),
      // Wave 6I's criterion 2: **a full-height cabinet is cabinetry**, so its carcass follows the
      // setting like any other. What it carries is a separate declaration on the entries that carry
      // anything — `tall-oven-tower` below, and `fridge-free`, which is not a carcass at all.
      depthRule: FOLLOWS_CABINET_DEPTH,
      ...discreteWidths(COLUMN_WIDTHS_MM),
    }),
    fixedWidth: true,
  };
}

/** A catalogue entry as it is filed: the id, and the definition under it. */
export type CatalogEntry = readonly [string, BodyDefinition];

/** §7's catalogue **at one cabinet depth**, in the order the panel lists it: base, wall, then
 *  full-height.
 *
 *  **A function since M6 wave 6H, and that is the whole of the wave** (ADR 0036 decision 3 makes the
 *  setting the cabinet's depth; decision 5 makes every body follow it). Until now the depth-derived
 *  entries were computed at import time from one module constant, so a catalogue could describe
 *  exactly one kitchen; a design carrying another depth had nothing to resolve against. Nothing here
 *  persists a depth and nothing sets one — the *Setări globale* control and the stored setting are
 *  waves 6J and 6K.
 *
 *  Throws `UnknownWorktopDepthError` for a depth the wall map does not declare (ADR 0028 decision 4).
 *  The refusal is deliberately at the front of the build rather than at the wall rows: a catalogue
 *  half-built at an undeclared depth is worse than no catalogue. */
export function buildInsertableBodyDefinitions(
  cabinetDepthMm: number,
): readonly CatalogEntry[] {
  return [
    // ADR 0033: `base-2door` + `base-1door`, merged. The door count is a **consequence of the width**,
    // never a separate product to pick, so there is one row and the customer chooses a cabinet and a
    // width. `kind` was always the real identity — both halves have carried `base_cabinet` since M3 —
    // and the id now says so.
    [
      "base-cabinet",
      {
        // ADR 0061: the door count decides the handle count as well as the label — one bar per
        // leaf, so one handle below 500 mm and two at and above it.
        ...baseCabinet(cabinetDepthMm, {
          cabinetHandles: handlesOnDoorLeaves({
            doorTiers: 1,
            handlesPerLeaf: 1,
          }),
          // One band of hinged leaves, and the width decides how many stand in it — the same
          // `deriveDoorCount` the handle rule above reads and the builder is handed.
          fronts: doorLeavesFollowWidth(
            doorBandsMm([BASE_DOOR_BAND_HEIGHT_MM]),
          ),
        }),
        ...HINGED_CABINET_WIDTHS,
        minWidthMm: HINGED_CABINET_MIN_WIDTH_MM,
        doorCountFollowsWidth: true,
      },
    ],
    [
      "base-3drawer",
      baseCabinet(cabinetDepthMm, {
        cabinetHandles: carriesHandles(3),
        // Three drawers and no door leaf. This is the row ADR 0070 names first: `carriesHandles(3)`
        // here and `base-sink`'s `carriesHandles(2)` are the same kind of declaration, and one is
        // runners while the other is hinges.
        fronts: carriesDrawers(3),
      }),
    ],
    [
      "base-panbank",
      baseCabinet(cabinetDepthMm, {
        cabinetHandles: carriesHandles(2),
        fronts: carriesDrawers(2),
      }),
    ],
    // ADR 0027: the two hob-bearing bodies. The hob is part of the cabinet, not a separate placement
    // sitting on it, which is what makes it restorable at all — a seeded entry is never offerable
    // (ADR 0011 Gap A), so before these two rows existed a deleted hob could never come back.
    //
    // Both are `fixedWidth` at 600. They differ only in what fills the carcass, which is the choice
    // the customer is actually making: drawers when the oven lives in a column, an oven when there is
    // no room for one.
    [
      "base-hob-2drawer",
      hobBase(cabinetDepthMm, {
        cabinetHandles: carriesHandles(2),
        fronts: carriesDrawers(2),
      }),
    ],
    [
      "base-hob-oven",
      {
        // ADR 0061 decision 2: the body's one bar belongs to the **oven**, so it has no cabinet
        // handle to bill and none for a hardware chip to reach. This is the same fact `canHandle:
        // false` below states about the panel, said about the price and the meshes.
        ...hobBase(cabinetDepthMm, {
          cabinetHandles: NO_CABINET_HANDLES,
          // **A front, and not a door band.** `ovenFillerFront` closes the cavity the oven leaves
          // under the worktop with a fixed facade: nothing behind it opens, so it hangs on no hinge
          // and its height is not a number ADR 0070's rule may read. `canFinish: true` below is
          // about that same panel and is not a contradiction — a facade is finished, not opened.
          fronts: NO_OPENING_FRONTS,
        }),
        // §9's "never offer what cannot be satisfied", and §13.1's "disable, don't warn".
        //
        // Q6 (owner, 2026-09-01): this body owns **exactly one finishable front** — the fixed filler
        // panel across the hob band, `oven_filler_door_front`, which M5B wave 5B6 added to close the
        // cavity the oven leaves under the worktop. So a recorded finish now recolours something, and
        // the panel takes the run's colour instead of standing default white beside neighbours the
        // customer can set to sage, clay or graphite. Before that panel existed the body was
        // front-less and `canFinish` was correctly `false`; the ground has changed, not the rule.
        //
        // `canHandle` stays `false`, and for the reason the whole pair once shared: the filler is a
        // facade, not a leaf — nothing behind it opens — and the body's only bar belongs to the
        // **oven**, so `handle: "push"` would be a cabinet-hardware chip mutating an appliance.
        canFinish: true,
        canHandle: false,
        // The oven's own fascia and bar, which reach past the worktop every other base body stops
        // at — by the same 28 mm at every depth, because the fascia rests on a carcass front that
        // moves with the setting. Wave 6I's criterion 2 on the base band; the tower states the same
        // split for the column band.
        occupiedDepth: finishesAtMm(hobOvenBaseFinishedDepthMm(cabinetDepthMm)),
      },
    ],
    [
      "base-bottle-cargo",
      {
        ...baseCabinet(cabinetDepthMm, {
          cabinetHandles: carriesHandles(1),
          // ADR 0026: **a pull-out, so a drawer and not a leaf.** The builder says so in as many
          // words — "the front is a pull-out's, not a door's" — and it runs on runners like any
          // other drawer. It carries the whole carcass height as one front, which is why its handle
          // count alone cannot tell it from a single-door base.
          fronts: carriesDrawers(1),
        }),
        widthFlex: BOTTLE_CARGO_WIDTHS_MM,
        ...discreteWidths(BOTTLE_CARGO_WIDTHS_MM),
        minWidthMm: BOTTLE_CARGO_MIN_WIDTH_MM,
      },
    ],
    [
      "base-sink",
      {
        ...baseCabinet(cabinetDepthMm, {
          cabinetHandles: carriesHandles(2),
          // Two hinged leaves in one band, at every width from the 560 mm aperture up. ADR 0070's
          // other named row: the same `2` as `base-panbank` above, and nothing but this declaration
          // says one pair is hinges and the other runners.
          fronts: carriesFronts({
            doorBands: doorBandsMm([BASE_DOOR_BAND_HEIGHT_MM]),
            leavesPerBand: 2,
            drawers: NO_DRAWERS,
          }),
        }),
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
        // ADR 0092 decision 9. **The one §7 row that holds a sink, and it says so rather than being
        // recognised.** Its `kind` is `base_cabinet`, its label is Romanian and its id is spelled
        // however §7 spells it; none of the three is the fact ADR 0070 decision 4 prices two extras
        // per, and each of them is a way of getting a second sink row wrong.
        sink: CARRIES_SINK,
      },
    ],
    // ADR 0051: an integrated dishwasher wears a decor door, so this niche is a fronted base body
    // like any other. `canFinish` and `canHandle` come from `INSERTABLE_DEFAULTS` and both are true
    // of the geometry: the finish lands on the `door_front` slab `dishwasherHousing` builds with
    // `doorSlab`, and the only handle in the body hangs beside that slab — the appliance behind it is
    // built fully integrated and has no bar of its own to mutate. Before that record the flags were
    // right and the geometry was missing (`docs/BACKLOG.md` entry 11).
    //
    // It therefore no longer overrides `baseCabinet`'s occupied depth: what used to reach 632 mm was
    // the appliance's bar, and the decor door's reaches 619, behind the worktop that already sets the
    // number for every other base body.
    [
      "base-dishwasher",
      {
        // ADR 0051: the niche wears a decor door of its own, and the one bar on this body is that
        // door's — the appliance behind it carries none.
        ...baseCabinet(cabinetDepthMm, {
          cabinetHandles: carriesHandles(1),
          // ADR 0051: one decor door over the machine, drawn by `doorSlab` at `baseCabinet`'s own
          // anchors, so it is the same 710 mm band every base leaf is.
          fronts: carriesFronts({
            doorBands: doorBandsMm([BASE_DOOR_BAND_HEIGHT_MM]),
            leavesPerBand: 1,
            drawers: NO_DRAWERS,
          }),
        }),
        kind: "dishwasher_housing",
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
        ...wallCabinet(cabinetDepthMm, {
          cabinetHandles: handlesOnDoorLeaves({
            doorTiers: 1,
            handlesPerLeaf: 1,
          }),
          // **The one row family whose band height is not a constant**, because it is the one that
          // is `heightFlex`: the same entry is built 700 mm tall on the wall row and 400 in the top
          // row, so its leaves are 694 and 394. The rule follows the frame the body was built into
          // rather than pinning either number.
          fronts: doorLeavesFollowWidth(
            oneBandInsetFromFrameMm(WALL_DOOR_BAND_INSET_MM),
          ),
        }),
        ...HINGED_CABINET_WIDTHS,
        minWidthMm: HINGED_CABINET_MIN_WIDTH_MM,
        doorCountFollowsWidth: true,
      },
    ],
    [
      "wall-lift",
      wallCabinet(cabinetDepthMm, {
        cabinetHandles: carriesHandles(1),
        // **One full-face leaf, and its handle edge is `"bottom"` rather than `"top"`** — which is
        // one half of why drawer-ness is declared here and never read off that field. A flap opens
        // upward on the band's own hinges: one leaf, not a drawer. Its lift mechanism is none of
        // ADR 0070's three, and decision 6 leaves vertical-opening mechanisms out of scope.
        fronts: carriesFronts({
          doorBands: oneBandInsetFromFrameMm(WALL_DOOR_BAND_INSET_MM),
          leavesPerBand: 1,
          drawers: NO_DRAWERS,
        }),
      }),
    ],
    [
      "open-shelf",
      {
        ...wallCabinet(cabinetDepthMm, {
          cabinetHandles: NO_CABINET_HANDLES,
          fronts: NO_OPENING_FRONTS,
        }),
        kind: "open_shelf_unit",
        // **No door and no handle, so its shell and its finished depth are the same number** — and
        // the two overrides below move together or not at all (ADR 0075 decision 1). Taking
        // `wallCabinet`'s shell here would state a seat 39 mm shallower than this body is built to,
        // for a front it does not have.
        frameDepthMm: wallCarcassDepthMm(cabinetDepthMm),
        occupiedDepth: shellPlusFrontMm(NO_FRONT_ASSEMBLY_MM),
        // Open by definition: no fixed front to finish, no leaf to open. Unlike `base-hob-oven`
        // above, wave 5B6 gave this body no filler panel, so ADR 0050 does not reach it.
        canFinish: false,
        // **Cabinetry, so it wears the kitchen's colour** — the owner's *"open shelves can have and
        // by default should inherit global set color"* (2026-09-09; backlog entry 60). It offers no
        // control of its own, which is the line above and unchanged: it follows, it does not choose.
        finishRule: FOLLOWS_THE_KITCHENS_COLOUR,
        canHandle: false,
      },
    ],
    [
      "hood",
      {
        ...wallCabinet(cabinetDepthMm, {
          cabinetHandles: NO_CABINET_HANDLES,
          fronts: NO_OPENING_FRONTS,
        }),
        kind: EXTRACTOR_HOOD_KIND,
        // **Front-hung** (ADR 0039 decision 2): its front face sits on the cabinet-depth line, so
        // its seat is measured forward to that line rather than back from its own rear face. Still
        // measurable — which is why `cabinet-front-line` is its own arm and not folded in with the
        // corner leg's `joint`. This override is what the adapter's deleted `FRONT_ALIGNED_BUILD_IDS`
        // used to stand in for, and that set had already drifted: it held "hood" and not "hood-600".
        seatRule: seatedOnCabinetFrontLine,
        // A hood is a canopy and a chimney: no front, so nothing for a finish chip to recolour.
        // `handle: "push"` here would put cabinet hardware on an extractor. This says nothing about
        // whether a hood is cabinetry — ADR 0035 decision 5 below rules that it is, for width.
        canFinish: false,
        // **No colour at any level** — the owner's *"hood also no"* (2026-09-09). ADR 0035 decision 5
        // calls the hood cabinetry *for width*; this calls it a machine *for colour*. Two facts about
        // different things, declared separately so neither is read off the other.
        finishRule: IS_NEVER_PAINTED,
        canHandle: false,
        heightFlex: false,
        nominalHeightMm: HOOD_HEIGHT_MM,
        nominalDepthMm: HOOD_DEPTH_MM,
        // Front-hung (ADR 0039 decision 2), so neither the wall rule above nor its own 500 mm body
        // answers this: what it occupies is the wall plane to the cabinet-depth line.
        //
        // It keeps the spread's `depthRule: FOLLOWS_CABINET_DEPTH`, and that is right even though
        // ADR 0039 decision 1 says *"hood is always standard"*. The rule is about the space the body
        // fills, and this one's finished line **is** the setting — 600 at 600 and 700 at 700. What
        // stays standard is `HOOD_DEPTH_MM`, the canopy behind that line, and calling the entry a
        // manufactured size would claim the wrong one of the two moves.
        occupiedDepth: finishesAtMm(hoodFinishedDepthMm(cabinetDepthMm)),
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
        frameDepthMm: hoodFrameDepthMm(cabinetDepthMm),
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
    // ADR 0048: **the one resizable column.** No appliance stands inside it, so it is built to its
    // opening between 400 and 800 mm and its door count follows that width through the threshold
    // ADR 0035 decision 4 already fixed at 500 — one door below, two at and above. There is no
    // `tall-pantry-1door` row, and there must not be: ADR 0033 merged exactly that split away, and a
    // second row would put the threshold in two places.
    //
    // `widthFlex` is restated rather than inherited, and that is the load-bearing line. The spread
    // above stamps `COLUMN_WIDTHS_MM`, and a row that declared a bound while keeping a fixed set
    // would resolve on `resolveFixedSetWidth` and build 600 into every opening — which is the hood's
    // R1.2 defect verbatim (`insert-fit.ts`, `resolveFixedSetWidth`).
    [
      "tall-pantry",
      {
        // Two tiers of doors, each leaf carrying one bar: two handles at 400 mm and four at 600.
        // The width decides the leaves *per tier* through the same `doorCountFollowsWidth` this row
        // declares below, and the pantry stacks two such tiers.
        ...fullHeightUnit("tall_unit", cabinetDepthMm, {
          cabinetHandles: handlesOnDoorLeaves({
            doorTiers: 2,
            handlesPerLeaf: 1,
          }),
          // **The entry ADR 0070 wrote the band declaration for.** Two bands, 1290 and 790, and
          // they do not sum to this body's 2200 mm frame — so an implementation that read
          // `heightMm` would disagree with this row everywhere and would put a third hinge on the
          // short door.
          fronts: doorLeavesFollowWidth(
            doorBandsMm(PANTRY_DOOR_BAND_HEIGHTS_MM),
          ),
        }),
        widthFlex: "fit",
        ...cabinetryWidths({
          minMm: PANTRY_FLOOR_WIDTH_MM,
          maxMm: CABINETRY_MAX_WIDTH_MM,
        }),
        fixedWidth: false,
        doorCountFollowsWidth: true,
      },
    ],
    [
      "tall-oven-tower",
      {
        // **ADR 0061's named case, on the counting half.** The builder draws four `handle_bar`
        // groups and exactly **two** are the cabinet's; the other two are the oven's and the
        // microwave's, which arrived with the appliances. 6B bills two.
        ...fullHeightUnit("tall_unit", cabinetDepthMm, {
          cabinetHandles: carriesHandles(2),
          // Two 500 mm cabinet leaves in a 2200 mm frame, one under the oven and one over the
          // microwave. The lower one is drawn with a `"top"` handle edge and is a door all the
          // same — the builder's own comment says that edge covers "doors below the worktop" too.
          fronts: carriesFronts({
            doorBands: doorBandsMm(OVEN_TOWER_DOOR_BAND_HEIGHTS_MM),
            leavesPerBand: 1,
            drawers: NO_DRAWERS,
          }),
        }),
        // Two appliance fronts instead of two cabinet doors, and their bars reach further.
        //
        // **Wave 6I's criterion 2, as one line: the carcass follows and the appliances do not.**
        // `columnCarcassDepthMm` is what moves with the setting; the 39 mm the fascias and bars add
        // to it is the machines' own and is the same at every depth. `depthRule` therefore stays the
        // `cabinet-depth` the spread above declares — a body whose depth is a function of the
        // setting, even though not every millimetre of it is.
        occupiedDepth: finishesAtMm(
          ovenTowerFinishedDepthMm(columnCarcassDepthMm(cabinetDepthMm)),
        ),
      },
    ],
    [
      "tall-fridge-housing",
      fullHeightUnit("fridge_housing", cabinetDepthMm, {
        cabinetHandles: carriesHandles(3),
        // Three leaves in three bands of their own heights: the fridge door, the freezer door and
        // the top box's flap. **The clearest case for declaring bands per entry** — one body, three
        // different heights, and only the tallest is over ADR 0070's 900 mm threshold.
        fronts: carriesFronts({
          doorBands: doorBandsMm(FRIDGE_HOUSING_DOOR_BAND_HEIGHTS_MM),
          leavesPerBand: 1,
          drawers: NO_DRAWERS,
        }),
      }),
    ],
    [
      "fridge-free",
      {
        // A freestanding appliance: its two bars hang off the appliance's own group and none of
        // them is cabinetry, which is what `canFinish`/`canHandle` below already say of the panel.
        ...fullHeightUnit("fridge_freestanding", cabinetDepthMm, {
          cabinetHandles: NO_CABINET_HANDLES,
          // A machine somebody else builds: its two fronts are the appliance's own and it draws
          // no `door_front` at all, so there is no cabinet leaf and no cabinet drawer here.
          fronts: NO_OPENING_FRONTS,
        }),
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
        // **The one insertable entry that is not cabinetry at all** (ADR 0058 decision 2's third
        // answer). A freestanding fridge is a machine somebody else builds at 680 mm, so it is 742
        // deep in a 600 mm kitchen and 742 in a 700 mm one — and it says so, rather than inheriting
        // `fullHeightUnit`'s `cabinet-depth` and quietly failing the gate that sweeps it.
        depthRule: IS_A_MANUFACTURED_SIZE,
        canFinish: false,
        // **No colour at any level** — the owner's *"fridge no"* (2026-09-09), and the same fact
        // `IS_A_MANUFACTURED_SIZE` above states about its depth: a machine somebody else builds is
        // not painted with the kitchen.
        finishRule: IS_NEVER_PAINTED,
        canHandle: false,
      },
    ],
  ];
}

/** §7's catalogue at the depth the kitchen is declared at today.
 *
 *  **The one materialisation of the build above**, kept because every reader that is not yet
 *  depth-aware — `design-bounds.ts`, the seeded fixture, the panel's offer list — needs a catalogue
 *  and M6 has not yet given them a setting to read. It is the *shipped* catalogue and not the rule:
 *  the rule is `buildInsertableBodyDefinitions`, and wave 6J re-points these readers at it. */
export const INSERTABLE_BODY_DEFINITIONS: readonly CatalogEntry[] =
  buildInsertableBodyDefinitions(WORKTOP_DEPTH_MM);

/** The thirteen `kind` strings the catalogue names. **A set and not a table of words** (ADR 0095
 *  decision 4): §11 row 24 asks a structural question — does the catalogue know this kind — and the
 *  sentence that answers a customer lives in `catalog.kinds.*`, one message leaf per member here.
 *
 *  The two wall corner returns are spelled from `body-kinds.ts` for the reason that module gives:
 *  three declarations have to agree, and a divergence drops the kind through to `catalog.unknownKind`
 *  in the panel header and on a priced line (ADR 0066). */
const KNOWN_BODY_KINDS: ReadonlySet<string> = new Set([
  "base_cabinet",
  "dishwasher_housing",
  "induction_cooktop",
  "tall_unit",
  "fridge_housing",
  "fridge_freestanding",
  "wall_cabinet",
  "open_shelf_unit",
  EXTRACTOR_HOOD_KIND,
  // ADR 0025: §3.1 lists both as kinds, but until the base legs became placements no selection
  // could carry one, so neither was ever named. Without a leaf for them the base corner's header
  // reads the generic `catalog.unknownKind` — and §11 row 16 asks the panel to *explain* a corner,
  // which starts with calling it one.
  "corner_base_x",
  "corner_base_return",
  // ADR 0066: the wall band's mirror of the two rows above. Both returns are 570 mm wide and carry
  // no catalogue equivalent (ADR 0022), so under the shared `wall_cabinet` kind both would read the
  // same words — and the breakdown line renders the label and the width with no band, so 6D's
  // priced document showed two identical descriptions at two different amounts. They differ by
  // *row*, and their two leaves say so.
  WALL_CORNER_RETURN_KIND,
  WALL_CORNER_RETURN_TOP_KIND,
]);

/** **What the domain publishes in place of a name** (ADR 0095 decision 4): which message the app
 *  must resolve, and the data that message interpolates — never the sentence itself.
 *
 *  A **closed** union of four cases rather than a generic `{ key, params }`, because a generic
 *  descriptor would let a refusal carry any leaf in the catalogue, and the whole point of this seam
 *  is that the domain cannot author copy. Four cases are switched over exhaustively by one resolver
 *  and cannot be widened by accident.
 *
 *  Three cases are flat and `withDoors` wraps one of them, to a depth of exactly one — see
 *  `labelWithDoors`, which refuses to nest. */
export type BodyLabel =
  /** One of §7's parameterised entries, by the id the customer chose: `catalog.entries.<buildId>`. */
  | { readonly kind: "entry"; readonly buildId: string }
  /** A body named by what it *is* rather than by a row a customer picked — every seeded instance
   *  with no catalogue equivalent. `catalog.kinds.<bodyKind>`, falling through to
   *  `catalog.unknownKind` for a kind the catalogue does not name. */
  | { readonly kind: "bodyKind"; readonly bodyKind: string }
  /** §9's empty slot: `catalog.emptySlot`. */
  | { readonly kind: "emptySlot" }
  /** ADR 0033's door count, wrapped around the name it qualifies: `catalog.bodyLabelWithDoors`. */
  | {
      readonly kind: "withDoors";
      readonly name: BodyLabel;
      readonly doors: number;
    };

export function entryLabel(buildId: string): BodyLabel {
  return { kind: "entry", buildId };
}

export function kindLabel(bodyKind: string): BodyLabel {
  return { kind: "bodyKind", bodyKind };
}

/** §9's empty slot. A constant rather than a constructor: the case carries no payload. */
export const EMPTY_SLOT_LABEL: BodyLabel = { kind: "emptySlot" };

/** ADR 0033's count, around the name it counts the doors of.
 *
 *  **Throws on a nested wrap**, because that is the boundary a careless `describeBodyLabelAt`
 *  refactor crosses first: a doubly-wrapped label renders *"Dulap 2 uși 2 uși"* in front of a
 *  customer rather than failing, and a name that is already counted has nothing left to count. */
export function labelWithDoors(name: BodyLabel, doors: number): BodyLabel {
  if (name.kind === "withDoors") {
    throw new Error(
      "A body label already counting doors cannot count them again",
    );
  }
  return { kind: "withDoors", name, doors };
}

/** A catalogue row and the id it is filed under — the two facts a name is derived from, passed
 *  together because neither answers alone: the id says which entry leaf, the definition says
 *  whether there is one. */
export interface LabelledBody {
  readonly buildId: string;
  readonly definition: BodyDefinition;
}

/** The body's **generic** descriptor: true at every width and at no width at all.
 *
 *  Three sources, in the order a body's identity is actually decided. A §7 entry is named by the row
 *  the customer picked. A seeded instance is named by the row a §5.4 resize would rebuild it through
 *  (ADR 0064), so it is called the same thing before and after that resize migrates its `buildId`.
 *  Everything else — the four corner bodies, which declare no equivalent because §13.1 says a corner
 *  is not a body a customer chooses — is named by its kind. */
export function describeBodyName(body: LabelledBody): BodyLabel {
  const { definition } = body;
  if (definition.insertable === true) return entryLabel(body.buildId);
  if (definition.catalogEquivalentId !== undefined) {
    return entryLabel(definition.catalogEquivalentId);
  }
  return kindLabel(definition.kind);
}

/** ADR 0033: the descriptor for this entry **at this width**.
 *
 *  For every row but the two merged cabinets this is just the generic name — a hood is a hood at any
 *  width. For a row that declares `doorCountFollowsWidth` the count from `deriveDoorCount` is
 *  wrapped around it, so one `wall-cabinet` entry reads *1 ușă* at 400 and *2 uși* at 600.
 *
 *  **Call it wherever a label reaches a customer and a width is known** — the offer row, the ACTUAL
 *  badge, the panel header, and M6's price line. A caller that reads `describeBodyName` directly
 *  gets the generic name, which is correct rather than merely safe: it is what a body with no
 *  settled width *is*. That is why the width is a required argument and not an optional one — a
 *  caller without a width has to say so by not calling this. */
export function describeBodyLabelAt(
  body: LabelledBody,
  widthMm: number,
): BodyLabel {
  const name = describeBodyName(body);
  if (body.definition.doorCountFollowsWidth !== true) return name;
  return labelWithDoors(name, deriveDoorCount(widthMm));
}

/** §11 row 24: a kind the catalogue does not name is unknown, and an unknown kind renders no
 *  replace section at all. */
export function isKnownKind(kind: string): boolean {
  return KNOWN_BODY_KINDS.has(kind);
}

/** Every member of the set above, so a caller can ask what the whole set *is* rather than only
 *  whether one kind is in it.
 *
 *  **The predicate alone cannot be swept.** A fourteenth member added here with no
 *  `catalog.kinds.<kind>` leaf renders `catalog.unknownKind` in front of a customer, and a test
 *  that has to name a kind before it can ask about it never sees the new one — which is how 6Z's
 *  35th refusal code reached a screen as an empty string. `apps/web/tests/i18n/body-label.test.ts`
 *  walks this list and requires a leaf for each member.
 *
 *  Copied into an array rather than handing out the set: a `ReadonlySet` is a compile-time promise
 *  over a mutable object, and this crosses a package boundary. */
export function knownBodyKinds(): readonly string[] {
  return [...KNOWN_BODY_KINDS];
}

/** Everything §5.2 needs about a catalogue entry, with the optional fields resolved. A seeded
 *  entry has no insertable shape — that is the `NOT_INSERTABLE` refusal, not a defect. */
export interface InsertableBody {
  readonly buildId: string;
  /** The entry's generic descriptor, which is `entryLabel(buildId)` for every insertable row. Held
   *  here rather than rebuilt at each refusal so a body and the sentence refusing it name it the
   *  same way. */
  readonly label: BodyLabel;
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
  const { widthFlex, nominalHeightMm, sizesMm } = definition;
  if (definition.insertable !== true) return undefined;
  if (
    widthFlex === undefined ||
    nominalHeightMm === undefined ||
    sizesMm === undefined
  ) {
    return undefined;
  }
  return {
    buildId,
    label: entryLabel(buildId),
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
