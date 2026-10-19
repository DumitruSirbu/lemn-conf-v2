// `DEVELOPMENT-SPEC.md` §7's catalogue: the parameterised entries a customer can actually choose. One `BodyCatalog` map
// with the seeded entries, split by `insertable`, so inserted placements resolve (ADR 0011 Gap A).
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

// Re-exported unchanged from `door-count.ts`, which exists so the handle rule reads the door count without an import
// cycle.
export { deriveDoorCount, TWO_DOOR_MIN_WIDTH_MM };

/** ADR 0026: §2's `MIN_W` in millimetres, the default width floor for every entry that declares none. */
const DEFAULT_MIN_WIDTH_MM = toMillimetres(MIN_WIDTH_M);

/** ADR 0035 decision 1: the width module and the grid of modular widths §9 offers. Presentation only (decision 8):
 *  the stepper is relative to a body's current width, so moving this to 25 mm costs no rework. */
export const WIDTH_STEP_MM = 50;

/** §7's ceiling every cabinetry row carries, and composition's width limit (`COMPOSITION_WIDTH_LIMIT_MM`). Equal to
 *  but not `MAX_EMPTY_COLUMN_WIDTH_MM`, which must never exceed it and is not read from here, as `module-grid.ts` is a
 *  leaf and this module is not (ADR 0052). */
export const CABINETRY_MAX_WIDTH_MM = 800;

/** Every multiple of `WIDTH_STEP_MM` inside these ranges, derived so the chips cannot drift from the bound (ADR 0035
 *  decision 2). */
function steppedWidths(ranges: readonly WidthRangeMm[]): readonly number[] {
  const widths: number[] = [];
  for (const range of ranges) {
    const firstMm = Math.ceil(range.minMm / WIDTH_STEP_MM) * WIDTH_STEP_MM;
    for (let mm = firstMm; mm <= range.maxMm; mm += WIDTH_STEP_MM)
      widths.push(mm);
  }
  return widths;
}

/** A cabinetry row's width model: the bound and the chips derived from it, so a row cannot state two that disagree. */
function cabinetryWidths(...ranges: readonly WidthRangeMm[]) {
  return { widthRangesMm: ranges, sizesMm: steppedWidths(ranges) } as const;
}

/** A discrete row's width model (ADR 0035 decision 3): one degenerate range per size. It writes `widthRangesMm` so a
 *  row that spreads `baseCabinet` and overrides only `sizesMm` cannot inherit the cabinetry bound. */
function discreteWidths(sizesMm: readonly number[]) {
  return {
    widthRangesMm: sizesMm.map((size) => ({ minMm: size, maxMm: size })),
    sizesMm,
  } as const;
}

/** Below §2's default floor, so each row using it declares its own `minWidthMm` or `buildableSizes` filters 200 out
 *  (ADR 0026). */
const HINGED_CABINET_MIN_WIDTH_MM = 200;

/** One continuous bound: the builder makes one door below 500 mm and two from 500 to 800. No width is excluded:
 *  forbidding 500/550 would reintroduce the curated list (ADR 0035). */
const HINGED_CABINET_WIDTHS = cabinetryWidths({
  minMm: HINGED_CABINET_MIN_WIDTH_MM,
  maxMm: CABINETRY_MAX_WIDTH_MM,
});

/** ADR 0035 decision 1: §2's default floor up to §7's ceiling. `HINGED_CABINET_WIDTHS` differs only by its floor,
 *  kept separate so the exception stays visible on the rows that take it. */
const CABINETRY_WIDTHS = cabinetryWidths({
  minMm: DEFAULT_MIN_WIDTH_MM,
  maxMm: CABINETRY_MAX_WIDTH_MM,
});

/** ADR 0017: the sink aperture's own width, where the geometry is correct rather than merely inside
 *  `FIT_TOLERANCE_M`. */
const SINK_MIN_WIDTH_MM = 560;
/** The bottle cargo's own set, not a cabinetry bound, since the proportion is the product; kept discrete, as
 *  stepping it would invent 250 as a manufactured width (ADR 0035 decision 3). */
const BOTTLE_CARGO_WIDTHS_MM: readonly number[] = [200, 300];

/** ADR 0026: below §2's default floor, deliberately. */
const BOTTLE_CARGO_MIN_WIDTH_MM = 200;

/** ADR 0027: a hob-bearing base is 600 mm only; the hob is a fixed 590 x 520 plate, so `'fit'` would leave it
 *  adrift. */
const HOB_BASE_WIDTHS_MM: readonly number[] = [600];

/** ADR 0027: the appliance `kind` both hob-bearing bases carry built in; see `carriesAccessoryKind`. Exported so the
 *  preset rule asks the declaration and never writes the literal a second time (ADR 0121). */
export const HOB_ACCESSORY_KIND = "induction_cooktop";

const DISHWASHER_WIDTHS_MM: readonly number[] = [450, 600];

/** The hood starts at 600, its `−50` greyed out there. A bound floor, not a `minWidthMm` (that means a builder
 *  limitation): the builder is correct at 599 and the product does not sell it (ADR 0035 decision 5). */
const HOOD_FLOOR_WIDTH_MM = 600;

const COLUMN_WIDTHS_MM: readonly number[] = [600];

/** ADR 0048: the pantry column's floor, the one full-height row declaring a bound (no appliance fixes its width). A
 *  bound floor rather than a `minWidthMm`, as for `HOOD_FLOOR_WIDTH_MM`; the ceiling is `CABINETRY_MAX_WIDTH_MM`. */
const PANTRY_FLOOR_WIDTH_MM = 400;
const FREESTANDING_FRIDGE_WIDTHS_MM: readonly number[] = [700];

/** §2: worktop top = `PLINTH + CARC_H + CTOP`. Every base carcass builds to it. */
const WORKTOP_HEIGHT_MM = 860;
const WALL_CABINET_HEIGHT_MM = 700;
/** ADR 0039 decision 5: measured on a built hood's carcass, not §11 row 6's "710 mm". `evaluateInsertFit` reserves
 *  this and `BUILT_SIZE_MISMATCH` compares it, so over-declaring refuses openings the hood fits. */
const HOOD_HEIGHT_MM = 700;
const COLUMN_HEIGHT_MM = 2200;

/** §10's signature flow needs exactly 1850: a cleared 2600 mm column minus a freestanding fridge leaves one 750 mm
 *  slot (§11 row 1); §7's rounded 1.80 m would leave 800. */
const FREESTANDING_FRIDGE_HEIGHT_MM = 1850;

/** How far a base worktop stands behind its carcass's back face (a seat is twice the rear overhang, ADR 0018).
 *  Measured on built meshes and held by `occupied-depth.parity.test.ts`. */
const BASE_SEAT_INSET_MM = 20;

/** §7's `nominalDepthMm` for the base rows and `void-engine.ts`'s `frameDepthMm` fallback. A function of the cabinet
 *  depth, so a catalogue built at 700 does not seat a body on a literal 580 (§11 row 19). */
export function baseSeatDepthMm(cabinetDepthMm: number): number {
  return cabinetDepthMm - BASE_SEAT_INSET_MM;
}

/** What a base carcass gives up at the front to the door slab and bar handle; `COLUMN_FRONT_OVERHANG_MM` equals it
 *  by arithmetic only. */
const BASE_FRONT_OVERHANG_MM = 40;

/** A base carcass's own shell: the declared depth less the fronts. Exported because the corner X-leg's recorded seat
 *  is this, not its footprint (ADR 0025). */
export function baseCarcassDepthMm(cabinetDepthMm: number): number {
  return cabinetDepthMm - BASE_FRONT_OVERHANG_MM;
}

/** How far the corner X-leg's carcass stands behind the wall plane, pinned by value; the L-joint seats it, not the
 *  wall (ADR 0025 decision 3). */
const CORNER_BASE_X_BEHIND_WALL_MM = 20;

/** Where a base run's carcass front stands from the wall (570 at 600), so the base return shares the run's door line
 *  (ADR 0135). The adapter derives the same figure; `declared-frame-depth-sweep.test.ts` guards it. */
export function baseCarcassFrontMm(cabinetDepthMm: number): number {
  return (
    (baseSeatDepthMm(cabinetDepthMm) + baseCarcassDepthMm(cabinetDepthMm)) / 2
  );
}

/** The corner X-leg's recorded seat, doubled: 550 at 600, 650 at 700. Its front is the run's and its back face
 *  stands `CORNER_BASE_X_BEHIND_WALL_MM` inside the wall (ADR 0018). */
export function baseCornerXFrameDepthMm(cabinetDepthMm: number): number {
  return baseCarcassFrontMm(cabinetDepthMm) - CORNER_BASE_X_BEHIND_WALL_MM;
}
/** A wall entry's nominal depth: §7's head-clearance cap and a `frameDepthMm` fallback, not what is built. Read from
 *  the worktop-to-wall map so they cannot drift; throws on an undeclared depth (ADR 0028 decision 4). */
export function wallCarcassDepthMm(cabinetDepthMm: number): number {
  return wallDepthMmForWorktop(cabinetDepthMm);
}

/** The seat a fronted wall or top carcass records: the declared depth less the door-and-handle assembly. Seeded rows
 *  read it here so they cannot drift from `wall-cabinet`; an open shelf uses `wallCarcassDepthMm` (ADR 0028). */
export function wallCarcassSeatDepthMm(cabinetDepthMm: number): number {
  return wallCarcassDepthMm(cabinetDepthMm) - WALL_FRONT_ASSEMBLY_MM;
}
/** The hood's depth is standard and does not follow the depth map, though its width is cabinetry (ADR 0039 decision
 *  1). */
const HOOD_DEPTH_MM = 500;

/** §11 row 19's second named exception: the `frameDepthMm` fallback for a front-hung hood, twice its origin's offset
 *  from the wall (ADR 0018), so 700 at 600 for a 500-deep body. Derived from the cabinet depth, never typed. */
export function hoodFrameDepthMm(cabinetDepthMm: number): number {
  return 2 * cabinetDepthMm - HOOD_DEPTH_MM;
}

// Moved to `body-kinds.ts` so `void-engine.ts` reads them without a cycle; re-exported where callers look for them.
export { EXTRACTOR_HOOD_KIND } from "./body-kinds.js";
/** What a full-height carcass carries in front of its shell: 40 mm like a base, equal by arithmetic only, so this is
 *  what moves if they diverge. */
const COLUMN_FRONT_OVERHANG_MM = 40;

/** A full-height carcass's depth: cabinetry, so it follows the depth setting (ADR 0036 decision 5); 560 at 600, 660
 *  at 700. What stands inside a column (oven, microwave) does not follow it; see `ovenTowerFinishedDepthMm`. */
export function columnCarcassDepthMm(cabinetDepthMm: number): number {
  return cabinetDepthMm - COLUMN_FRONT_OVERHANG_MM;
}

const FREESTANDING_FRIDGE_DEPTH_MM = 680;

// §3.1's depth per body: how far the finished body stands from the wall plane, distinct from the nominal depths above.
// Each value is measured on built geometry and held by `occupied-depth.parity.test.ts` (ADR 0028).

/** How far a worktop stands proud of the cabinet front: the 620 mm `countertop` mesh against the 600 mm line, seated
 *  20 mm forward. */
const WORKTOP_OVERHANG_MM = 20;

/** A base run finishes at its worktop's front edge, not its carcass's or bars'. A constant overhang, never a
 *  proportion (ADR 0036 decision 3), so 720 at 700. */
export function baseFinishedDepthMm(cabinetDepthMm: number): number {
  return cabinetDepthMm + WORKTOP_OVERHANG_MM;
}

/** How far an oven's fascia and bar stand proud of its base body's worktop: 28 mm at every cabinet depth, as the
 *  appliance is manufactured and rests on the carcass front; a dishwasher's decor door stops behind the worktop. */
const OVEN_FRONT_PAST_WORKTOP_MM = 28;

/** ADR 0027's hob-and-oven base finishes at its oven's bar: 648 at 600, 748 at 700, moving with the carcass front. */
export function hobOvenBaseFinishedDepthMm(cabinetDepthMm: number): number {
  return baseFinishedDepthMm(cabinetDepthMm) + OVEN_FRONT_PAST_WORKTOP_MM;
}

/** The hob-and-oven base's finished depth in the shipped kitchen. */
export const HOB_OVEN_BASE_FINISHED_DEPTH_MM =
  hobOvenBaseFinishedDepthMm(WORKTOP_DEPTH_MM);

/** A full-height cabinet is its carcass plus a fronted wall carcass's door-and-handle assembly (ADR 0036 decision
 *  1), derived so a change to either moves it. The argument is a column depth; a pinned carcass passes its own. */
export function tallUnitFinishedDepthMm(columnDepthMm: number): number {
  return columnDepthMm + WALL_FRONT_ASSEMBLY_MM;
}

/** How much further the oven-and-microwave tower's appliance fronts reach than neighbouring doors: constant at every
 *  depth. Its own constant, not `WALL_FRONT_ASSEMBLY_MM`: both are 39 by arithmetic only (ADR 0028). */
const OVEN_TOWER_APPLIANCE_FRONT_MM = 39;

/** The oven tower: a full-height carcass whose two appliance fronts stand where its neighbours'
 *  cabinet doors do, plus their bars. 638 on a 560 mm column, 738 on a 660 mm one. */
export function ovenTowerFinishedDepthMm(columnDepthMm: number): number {
  return tallUnitFinishedDepthMm(columnDepthMm) + OVEN_TOWER_APPLIANCE_FRONT_MM;
}

/** A freestanding fridge: a 680 mm appliance body and the two door bars hung on it. */
export const FREESTANDING_FRIDGE_FINISHED_DEPTH_MM = 742;

/** ADR 0039 decision 2: a hood hangs at the front, so its finished face is the cabinet-depth line whatever seat it
 *  records. The gap behind the chimney grows with depth by design (decision 1). */
export function hoodFinishedDepthMm(cabinetDepthMm: number): number {
  return cabinetDepthMm;
}

const INSERTABLE_DEFAULTS = {
  insertable: true,
  // ADR 0092 decision 9's default; `base-sink` overrides it. Safe only because the parity gate checks both directions.
  sink: NO_SINK,
  canFinish: true,
  // Ordinary cabinetry colours itself (ADR 0099 decision 1); declared beside `canFinish`, since `bodyFinishRuleOf`
  // refuses a disagreeing pair. The shelf, the hood and the fridge override it.
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
  /** Twice the body's rear overhang, declared per row rather than derived from `occupiedDepth`. Absent means it
   *  equals the nominal, true of base, full-height and appliance rows (ADR 0075 decision 1). */
  readonly frameDepthMm?: number;
  /** Required, as are the declarations below: a shape that stayed silent would inherit whatever its helper happens
   *  to carry. */
  readonly occupiedDepth: OccupiedDepthRule;
  /** Required like `occupiedDepth` (ADR 0061 decision 3): `base-3drawer`, `base-sink` and `base-hob-oven` are all a
   *  `baseCabinet` with different counts. */
  readonly cabinetHandles: CabinetHandleRule;
  /** Required like `cabinetHandles`: an inherited front population would put hinges on drawers. */
  readonly fronts: FrontPopulationRule;
  /** Required (ADR 0058 decision 2), so a missing §7 declaration is a compile error; seeded rows are refused at
   *  assembly by `refuseUndeclaredDepthRules`. */
  readonly depthRule: CabinetDepthRule;
  /** Required, no default (ADR 0077): a silent `?? wall-plane` would mis-seat a joint-seated corner leg. */
  readonly seatRule: SeatRule;
  readonly sizesMm: readonly number[];
  /** Required, unlike on `BodyDefinition`: helpers spread `CABINETRY_WIDTHS`, so a silent shape would inherit the
   *  permissive 300–800 bound. Travels with `sizesMm`. */
  readonly widthRangesMm: readonly WidthRangeMm[];
}

function insertableBody(band: Band, shape: BodyShape): BodyDefinition {
  // Fallback for a placement with no measured `seatDepthMm`, such as a `/d/{id}` link. The nominal is only the default:
  // a fronted wall carcass states its own (ADR 0075 decision 1).
  return {
    ...INSERTABLE_DEFAULTS,
    band,
    ...shape,
    frameDepthMm: shape.frameDepthMm ?? shape.nominalDepthMm,
  };
}

/** `cabinetHandles` and `fronts`, handed together so a row states both or neither: a push-to-open cabinet has fronts
 *  and no handles. */
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
    // Back face on the wall plane, so the seat stays measured (ADR 0077 decision 1); the two exceptions are seeded
    // rows.
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

/** ADR 0027: a `baseCabinet` with its width fixed, because the hob appliance is. */
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
      // Back face on the wall plane, so the seat stays measured (ADR 0077 decision 1).
      seatRule: seatedOnWallPlane,
      ...declarations,
      kind: "wall_cabinet",
      widthFlex: "fit",
      nominalHeightMm: WALL_CABINET_HEIGHT_MM,
      nominalDepthMm: wallCarcassDepthMm(cabinetDepthMm),
      // `wallCabinet` centres its shell on z = 0, so `frame.d` is the shell and the nominal the finished cabinet, 39 mm
      // deeper. `wallCarcassSeatDepthMm` is shared with the seeded rows (ADR 0028).
      frameDepthMm: wallCarcassSeatDepthMm(cabinetDepthMm),
      occupiedDepth: shellPlusFrontMm(WALL_FRONT_ASSEMBLY_MM),
      // Through the map, not a formula (ADR 0028 decision 2): 330 at 600 and 400 at 700.
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
      // Back face on the wall plane, so the seat stays measured (ADR 0077 decision 1).
      seatRule: seatedOnWallPlane,

      ...declarations,
      widthFlex: COLUMN_WIDTHS_MM,
      nominalHeightMm: COLUMN_HEIGHT_MM,
      nominalDepthMm: columnDepthMm,
      occupiedDepth: finishesAtMm(tallUnitFinishedDepthMm(columnDepthMm)),
      // A full-height cabinet is cabinetry, so its carcass follows the setting; what an entry carries on top is
      // declared on that entry.
      depthRule: FOLLOWS_CABINET_DEPTH,
      ...discreteWidths(COLUMN_WIDTHS_MM),
    }),
    fixedWidth: true,
  };
}

/** A catalogue entry as it is filed: the id, and the definition under it. */
export type CatalogEntry = readonly [string, BodyDefinition];

/** §7's catalogue at one cabinet depth, in the panel's order: base, wall, full-height. Throws
 *  `UnknownWorktopDepthError` for a depth the wall map does not declare (ADR 0028 decision 4). */
export function buildInsertableBodyDefinitions(
  cabinetDepthMm: number,
): readonly CatalogEntry[] {
  return [
    // ADR 0033: one row for both door counts; the count follows the width, so the customer chooses a cabinet and a
    // width.
    [
      "base-cabinet",
      {
        // ADR 0061: one bar per leaf, so one handle below 500 mm and two from 500.
        ...baseCabinet(cabinetDepthMm, {
          cabinetHandles: handlesOnDoorLeaves({
            doorTiers: 1,
            handlesPerLeaf: 1,
          }),
          // One band of hinged leaves; the width decides how many, through `deriveDoorCount`.
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
        // Three drawers, no door leaf (ADR 0070): a handle count alone cannot tell runners from hinges.
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
    // ADR 0027: the hob is part of the cabinet, not a placement on it, so a deleted hob can come back. Both are
    // `fixedWidth` at 600.
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
        // ADR 0061 decision 2: the one bar is the oven's, so there is no cabinet handle to bill; `canHandle: false`
        // says the same of the panel.
        ...hobBase(cabinetDepthMm, {
          cabinetHandles: NO_CABINET_HANDLES,
          // A fixed filler front, not a door band: nothing behind it opens, so ADR 0070's height rule may not read it.
          fronts: NO_OPENING_FRONTS,
        }),
        // `canFinish` is true because the fixed `oven_filler_door_front` panel is finishable; `canHandle` stays false,
        // as the filler is a facade and the only bar is the oven's (§9, §13.1).
        canFinish: true,
        canHandle: false,
        // The oven's fascia and bar reach 28 mm past the worktop at every depth, as the fascia rests on a carcass front
        // that moves with the setting.
        occupiedDepth: finishesAtMm(hobOvenBaseFinishedDepthMm(cabinetDepthMm)),
      },
    ],
    [
      "base-bottle-cargo",
      {
        ...baseCabinet(cabinetDepthMm, {
          cabinetHandles: carriesHandles(1),
          // ADR 0026: a pull-out is a drawer on runners, not a leaf; it carries the whole carcass height as one front,
          // so its handle count cannot tell it from a single-door base.
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
          // Two hinged leaves in one band (ADR 0070): the same handle count as `base-panbank`'s drawers, told apart
          // only by this declaration.
          fronts: carriesFronts({
            doorBands: doorBandsMm([BASE_DOOR_BAND_HEIGHT_MM]),
            leavesPerBand: 2,
            drawers: NO_DRAWERS,
          }),
        }),
        // ADR 0033 amendment: a sink base is cabinetry with a fixed 560 mm aperture (`minWidthMm`), so its bound runs
        // from the aperture up to §7's ceiling.
        ...cabinetryWidths({
          minMm: SINK_MIN_WIDTH_MM,
          maxMm: CABINETRY_MAX_WIDTH_MM,
        }),
        minWidthMm: SINK_MIN_WIDTH_MM,
        // ADR 0092 decision 9: the one §7 row that holds a sink, declared rather than recognised from its `kind`, label
        // or id.
        sink: CARRIES_SINK,
      },
    ],
    // ADR 0051: the niche wears a decor door, so `canFinish` and `canHandle` are true of its geometry; the door reaches
    // 619 mm, behind the worktop, so it keeps `baseCabinet`'s occupied depth.
    [
      "base-dishwasher",
      {
        // One bar, and it is the decor door's: the appliance behind carries none.
        ...baseCabinet(cabinetDepthMm, {
          cabinetHandles: carriesHandles(1),
          // One decor door drawn by `doorSlab`: the same 710 mm band as every base leaf (ADR 0051).
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
    // ADR 0033: one row for both door counts; a resize to 400 mm makes it a one-door without migrating the placement to
    // another row.
    [
      "wall-cabinet",
      {
        ...wallCabinet(cabinetDepthMm, {
          cabinetHandles: handlesOnDoorLeaves({
            doorTiers: 1,
            handlesPerLeaf: 1,
          }),
          // The one family whose band height is not constant, being `heightFlex`: leaves are 694 on the wall row and
          // 394 in the top row.
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
        // One full-face leaf with a `"bottom"` handle edge, which is why drawer-ness is declared and not read off that
        // field; lift mechanisms are out of ADR 0070's scope (decision 6).
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
        // No door and no handle, so shell and finished depth are one number and the two overrides move together (ADR
        // 0075 decision 1).
        frameDepthMm: wallCarcassDepthMm(cabinetDepthMm),
        occupiedDepth: shellPlusFrontMm(NO_FRONT_ASSEMBLY_MM),
        // Open by definition: no front to finish and no leaf to open; it has no filler panel, so ADR 0050 does not
        // reach it.
        canFinish: false,
        // Cabinetry, so it follows the kitchen's colour (ADR 0099) while offering no control of its own.
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
        // Front-hung (ADR 0039 decision 2): its seat is measured forward from the cabinet-depth line, so
        // `cabinet-front-line` is its own arm, not folded into the corner leg's `joint`.
        seatRule: seatedOnCabinetFrontLine,
        // No front, so nothing for a finish chip to recolour; `handle: "push"` would put cabinet hardware on an
        // extractor.
        canFinish: false,
        // Never painted: the hood is cabinetry for width (ADR 0035 decision 5) but a machine for colour; declared
        // separately so neither is read off the other.
        finishRule: IS_NEVER_PAINTED,
        canHandle: false,
        heightFlex: false,
        nominalHeightMm: HOOD_HEIGHT_MM,
        nominalDepthMm: HOOD_DEPTH_MM,
        // Front-hung, so it occupies the wall plane to the cabinet-depth line. It keeps `FOLLOWS_CABINET_DEPTH`: its
        // finished line is the setting; only `HOOD_DEPTH_MM` stays standard (ADR 0039).
        occupiedDepth: finishesAtMm(hoodFinishedDepthMm(cabinetDepthMm)),
        // Declared, not inherited: ADR 0039 decision 1 exempts the hood from the depth map. The one entry whose depth
        // fields disagree (`catalog.test.ts`): §11 row 19's second named exception.
        frameDepthMm: hoodFrameDepthMm(cabinetDepthMm),
        // The hood is cabinetry bounded 600–800: it keeps `widthFlex: 'fit'` and declares the floor its `−50` greys out
        // at (ADR 0035 decision 5).
        ...cabinetryWidths({
          minMm: HOOD_FLOOR_WIDTH_MM,
          maxMm: CABINETRY_MAX_WIDTH_MM,
        }),
      },
    ],
    // The one resizable column, 400–800 mm, its door count following width. `widthFlex` is restated, not inherited: the
    // spread's fixed set would build 600 into every opening (`resolveFixedSetWidth`; ADR 0048).
    [
      "tall-pantry",
      {
        // Two tiers of doors, one bar per leaf: two handles at 400 mm and four at 600.
        ...fullHeightUnit("tall_unit", cabinetDepthMm, {
          cabinetHandles: handlesOnDoorLeaves({
            doorTiers: 2,
            handlesPerLeaf: 1,
          }),
          // ADR 0070's reason for per-entry bands: 1290 and 790 do not sum to the 2200 mm frame, so reading `heightMm`
          // would be wrong everywhere.
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
        // ADR 0061's named case: the builder draws four `handle_bar` groups and only two are the cabinet's; the oven's
        // and microwave's are not billed.
        ...fullHeightUnit("tall_unit", cabinetDepthMm, {
          cabinetHandles: carriesHandles(2),
          // Two 500 mm cabinet leaves, one under the oven and one over the microwave; the lower has a `"top"` handle
          // edge and is still a door.
          fronts: carriesFronts({
            doorBands: doorBandsMm(OVEN_TOWER_DOOR_BAND_HEIGHTS_MM),
            leavesPerBand: 1,
            drawers: NO_DRAWERS,
          }),
        }),
        // The carcass follows the setting but the appliance fronts add 39 mm at every depth; `depthRule` stays the
        // spread's `cabinet-depth`.
        occupiedDepth: finishesAtMm(
          ovenTowerFinishedDepthMm(columnCarcassDepthMm(cabinetDepthMm)),
        ),
      },
    ],
    [
      "tall-fridge-housing",
      fullHeightUnit("fridge_housing", cabinetDepthMm, {
        cabinetHandles: carriesHandles(3),
        // Three leaves in three bands (fridge, freezer, top box's flap): only the tallest is over ADR 0070's 900 mm
        // threshold.
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
        // A freestanding appliance: its two bars belong to the appliance, none is cabinetry.
        ...fullHeightUnit("fridge_freestanding", cabinetDepthMm, {
          cabinetHandles: NO_CABINET_HANDLES,
          // The appliance's own fronts: no `door_front`, so no cabinet leaf or drawer.
          fronts: NO_OPENING_FRONTS,
        }),
        widthFlex: FREESTANDING_FRIDGE_WIDTHS_MM,
        ...discreteWidths(FREESTANDING_FRIDGE_WIDTHS_MM),
        nominalHeightMm: FREESTANDING_FRIDGE_HEIGHT_MM,
        nominalDepthMm: FREESTANDING_FRIDGE_DEPTH_MM,
        occupiedDepth: finishesAtMm(FREESTANDING_FRIDGE_FINISHED_DEPTH_MM),
        // Declared, not inherited: overriding only the nominal left the two 120 mm apart, so a placement with no
        // measured seat would sit 60 mm off the wall plane (§11 row 19).
        frameDepthMm: FREESTANDING_FRIDGE_DEPTH_MM,
        // The one insertable entry that is not cabinetry (ADR 0058 decision 2): a machine built at 680 mm, 742 deep at
        // every setting.
        depthRule: IS_A_MANUFACTURED_SIZE,
        canFinish: false,
        // Never painted: a machine somebody else builds is not painted with the kitchen.
        finishRule: IS_NEVER_PAINTED,
        canHandle: false,
      },
    ],
  ];
}

/** §7's catalogue at the shipped depth, for readers not yet depth-aware (`design-bounds.ts`, the seeded fixture, the
 *  panel's offer list). The rule is `buildInsertableBodyDefinitions`. */
export const INSERTABLE_BODY_DEFINITIONS: readonly CatalogEntry[] =
  buildInsertableBodyDefinitions(WORKTOP_DEPTH_MM);

/** The `kind` strings the catalogue names, as a set since §11 row 24 asks only whether one is known. The wall corner
 *  returns come from `body-kinds.ts` so three declarations agree (ADR 0095 decision 4). */
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
  // ADR 0025: without a leaf the base corner's header reads the generic `catalog.unknownKind`, which §11 row 16
  // forbids.
  "corner_base_x",
  "corner_base_return",
  // ADR 0066: the wall mirror of the two above; a shared `wall_cabinet` kind would give two same-width returns
  // identical priced descriptions.
  WALL_CORNER_RETURN_KIND,
  WALL_CORNER_RETURN_TOP_KIND,
]);

/** What the domain publishes in place of a name (ADR 0095 decision 4): the message to resolve and its data, never
 *  the sentence. A closed union, so the domain cannot author copy; `withDoors` wraps one flat case. */
export type BodyLabel =
  /** One of §7's parameterised entries, by the id the customer chose: `catalog.entries.<buildId>`. */
  | { readonly kind: "entry"; readonly buildId: string }
  /** A body named by what it is, with no catalogue equivalent: `catalog.kinds.<bodyKind>`, falling back to
   *  `catalog.unknownKind`. */
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

/** ADR 0033's door count around a name. Throws on a nested wrap, which would render "Dulap 2 uși 2 uși" to a
 *  customer. */
export function labelWithDoors(name: BodyLabel, doors: number): BodyLabel {
  if (name.kind === "withDoors") {
    throw new Error(
      "A body label already counting doors cannot count them again",
    );
  }
  return { kind: "withDoors", name, doors };
}

/** A catalogue row with its id, passed together: the id picks the entry leaf, the definition says whether there is
 *  one. */
export interface LabelledBody {
  readonly buildId: string;
  readonly definition: BodyDefinition;
}

/** The body's generic descriptor, true at every width: a §7 entry is named by its row, a seeded instance by the row
 *  a §5.4 resize would rebuild it through (ADR 0064), anything else (the corner bodies, §13.1) by its kind. */
export function describeBodyName(body: LabelledBody): BodyLabel {
  const { definition } = body;
  if (definition.insertable === true) return entryLabel(body.buildId);
  if (definition.catalogEquivalentId !== undefined) {
    return entryLabel(definition.catalogEquivalentId);
  }
  return kindLabel(definition.kind);
}

/** ADR 0033: the descriptor at this width, wrapping `deriveDoorCount` around the generic name for a
 *  `doorCountFollowsWidth` row. Call it wherever a label reaches a customer and a width is known. */
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

/** Every member of the set above, copied since it crosses a package boundary. A member with no
 *  `catalog.kinds.<kind>` leaf renders `catalog.unknownKind`; `body-label.test.ts` sweeps this list for that. */
export function knownBodyKinds(): readonly string[] {
  return [...KNOWN_BODY_KINDS];
}

/** Everything §5.2 needs about a catalogue entry, with the optional fields resolved. A seeded
 *  entry has no insertable shape — that is the `NOT_INSERTABLE` refusal, not a defect. */
export interface InsertableBody {
  readonly buildId: string;
  /** The entry's generic descriptor, held so a body and the sentence refusing it name it the same way. */
  readonly label: BodyLabel;
  readonly kind: string;
  readonly band: Band;
  readonly widthFlex: WidthFlex;
  readonly heightFlex: boolean;
  readonly nominalHeightMm: number;
  readonly sizesMm: readonly number[];
  /** This body's own width floor; absent means `MIN_WIDTH_M` governs (a different rejection code), so it is not
   *  defaulted. A floor below it replaces it, one above is checked after it (ADR 0026). */
  readonly minWidthMm?: number;
  readonly definition: BodyDefinition;
}

/** Narrows an entry to its insertable shape, or `undefined` for a seeded instance, which `insertBody` turns into
 *  `NOT_INSERTABLE`. */
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

/** The given widths less any under the floor that governs the entry (its `minWidthMm`, else §2's default). One
 *  function, so a panel chip is a width the engine accepts; a no-op for every shipped row (ADR 0026). */
export function buildableSizes(
  minWidthMm: number | undefined,
  sizesMm: readonly number[],
): readonly number[] {
  const floorMm = minWidthMm ?? DEFAULT_MIN_WIDTH_MM;
  return sizesMm.filter((size) => size >= floorMm);
}

/** The widths this entry may be built to, as ranges. A declared range is raised to the governing floor so
 *  `refuseWidthFloor` stays the one place a floor applies (ADR 0035 decision 2). */
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

/** May this entry be built at this width? Shared by §5.2's insert (any width in a range) and §5.4's resize (only the
 *  column's chip union, so a resize stays modular); both paths answer alike (ADR 0032 decision 4). Width in
 *  millimetres. */
export function acceptsWidthMm(body: InsertableBody, widthMm: number): boolean {
  return resolveWidthRangesMm(body).some(
    (range) => widthMm >= range.minMm && widthMm <= range.maxMm,
  );
}

/** The resolved entry with its id, since a `BodyDefinition` carries none: the badge needs the id and the chips the
 *  definition, from one lookup. */
export interface CatalogEquivalent {
  readonly buildId: string;
  readonly definition: BodyDefinition;
}

/** The §7 entry a body is: itself if insertable, else its declared `catalogEquivalentId` (ADR 0022). Declared, never
 *  inferred (§6.3); the target must be `insertable`, or `canGive` promises a rebuild `insertBody` refuses. */
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

/** The widths a body can be built at: its equivalent's set narrowed by that entry's floor, both from one row. An
 *  empty set is a real answer: §9's width section declines to render (ADR 0026). */
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
