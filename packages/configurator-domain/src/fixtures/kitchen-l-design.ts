import {
  seatRuleOf,
  seatedByAJoint,
  seatedOnCabinetFrontLine,
  seatedOnWallPlane,
  type SeatRule,
} from "../seat-rule.js";
import {
  baseCarcassFrontMm,
  baseCornerXFrameDepthMm,
  baseFinishedDepthMm,
  baseSeatDepthMm,
  buildInsertableBodyDefinitions,
  columnCarcassDepthMm,
  EXTRACTOR_HOOD_KIND,
  FREESTANDING_FRIDGE_FINISHED_DEPTH_MM,
  hoodFinishedDepthMm,
  hoodFrameDepthMm,
  ovenTowerFinishedDepthMm,
  tallUnitFinishedDepthMm,
  wallCarcassDepthMm,
  wallCarcassSeatDepthMm,
} from "../catalog.js";
import {
  WALL_CORNER_RETURN_KIND,
  WALL_CORNER_RETURN_TOP_KIND,
} from "../body-kinds.js";
import {
  finishesAtMm,
  NO_FRONT_ASSEMBLY_MM,
  shellPlusFrontMm,
} from "../occupied-depth.js";
import { carriesHandles, NO_CABINET_HANDLES } from "../cabinet-handles.js";
import {
  BASE_DOOR_BAND_HEIGHT_MM,
  carriesDrawers,
  carriesFronts,
  doorBandsMm,
  NO_DRAWERS,
  NO_OPENING_FRONTS,
  OVEN_TOWER_DOOR_BAND_HEIGHTS_MM,
  PANTRY_DOOR_BAND_HEIGHTS_MM,
  refuseContradictoryFrontDeclarations,
  wallDoorBandHeightMm,
  type FrontPopulationRule,
} from "../front-population.js";
import {
  cabinetDepthRuleOf,
  FOLLOWS_CABINET_DEPTH,
  FOLLOWS_CABINET_DEPTH_ON_WALL_MAP,
  IS_A_MANUFACTURED_SIZE,
  type CabinetDepthRule,
} from "../cabinet-depth-rule.js";
import {
  bodyFinishRuleOf,
  CHOOSES_ITS_OWN_COLOUR,
  FOLLOWS_THE_KITCHENS_COLOUR,
  IS_NEVER_PAINTED,
  type BodyFinishRule,
} from "../body-finish-rule.js";
import { WALL_FRONT_ASSEMBLY_MM, WORKTOP_DEPTH_MM } from "../worktop-depth.js";
import {
  cornerAlongWallCentreMm,
  cornerAssemblyWidthsMm,
  type CornerAssemblyPiece,
} from "../corner-assembly-size.js";
import type { Design, DesignPlacement, DesignWall } from "../design.js";
import {
  CARRIES_SINK,
  NO_SINK,
  type BodyCatalog,
  type BodyDefinition,
} from "../void-engine.js";

/**
 * The seeded L-kitchen: every body M1's `builders['kitchen-l']()` renders, as individually mounted
 * placements. Excludes the room shell (floor, walls, backsplash, `end_panel_right`).
 *
 * `frameDepthMm` is twice the body's wall-normal seat offset, not its physical depth: the hob and hood
 * are shallower, `base-corner-x-900` is deeper. A wall shell seats at its declared depth less the 39 mm
 * front assembly, and `hood-600` seats on 700 because it hangs at the front line. see ADR 0036
 */

/** The two build ids of the corner wall unit: the middle unit at the wall row and the top unit above it. */
export const WALL_CORNER_X_BUILD_ID = "wall-corner-x-900";
export const WALL_CORNER_X_TOP_BUILD_ID = "wall-corner-x-900-top";

/** `cabinetHandles` is deliberately in no shared shape below: every seeded row states its own count of
 *  cabinet handles (appliance bars are not cabinet handles), held to the built meshes by
 *  `cabinet-handle-count.parity.test.ts`. see ADR 0061 decision 3 */

/** The seat of a deep top cabinet hanging over a full-height column: the cabinet-depth line less the
 *  front assembly (561 at 600, 661 at 700). Unlike `wallCarcassSeatDepthMm` it does not go through the
 *  wall map. see ADR 0101 */
function liftedTopSeatDepthMm(cabinetDepthMm: number): number {
  return cabinetDepthMm - WALL_FRONT_ASSEMBLY_MM;
}

/** A seeded base body's hinged leaves: one `BASE_DOOR_BAND_HEIGHT_MM` band holding `leavesPerBand` leaves. */
function baseLeaves(leavesPerBand: number): FrontPopulationRule {
  return carriesFronts({
    doorBands: doorBandsMm([BASE_DOOR_BAND_HEIGHT_MM]),
    leavesPerBand,
    drawers: NO_DRAWERS,
  });
}

/** A seeded wall body's hinged leaves: one band as tall as `wallDoorBandHeightMm` leaves this carcass, so
 *  the literal and §7's `one-band-under-frame` rule cannot disagree. */
function wallLeaves(leaves: {
  readonly frameHeightMm: number;
  readonly leavesPerBand: number;
}): FrontPopulationRule {
  return carriesFronts({
    doorBands: doorBandsMm([wallDoorBandHeightMm(leaves.frameHeightMm)]),
    leavesPerBand: leaves.leavesPerBand,
    drawers: NO_DRAWERS,
  });
}

const oneBaseLeaf: FrontPopulationRule = baseLeaves(1);

/** §13.1 / §11 row 16: a corner is structural: no replace, no delete, never a width donor. Shared by the
 *  two wall returns and the two base legs. `kind` is not part of it: the six bodies share four kinds.
 *  Structural is about shape, not colour: the corner is an ordinary cabinet for colour only. */
const STRUCTURAL_CORNER: Pick<
  BodyDefinition,
  | "canReplace"
  | "canDelete"
  | "canFinish"
  | "finishRule"
  | "canHandle"
  | "fixedWidth"
  | "structuralReason"
> = {
  canReplace: false,
  canDelete: false,
  // The corner takes a colour of its own, unlike the hood and the freestanding fridge. see ADR 0099
  canFinish: true,
  // Must move with `canFinish`: `bodyFinishRuleOf` throws on load if the two disagree. With no `finish`
  // key the corner follows the kitchen's colour (`resolvedFinishOf`'s `??` chain).
  finishRule: CHOOSES_ITS_OWN_COLOUR,
  canHandle: false,
  fixedWidth: true,
  // §11 row 16's refusal, rendered beside the Finisaj section in `panel-model.ts`, not instead of it.
  structuralReason: "corner",
};

/** Each `catalogEquivalentId` below names the §7 entry that builds the same body. `resolveBuildableSizes`
 *  (`catalog.ts`) reads the width set and its floor off that entry, so a stale pointer is a wrong width
 *  set as well as a wrong name. The six corner bodies carry none: no §7 entry builds a corner (§13.1). */

/** The pointer plus the door-count flag read off the equivalent, so a body keeps one name across a §5.4
 *  resize that migrates its `buildId` (`resolve-column-members.ts`). The name itself comes from
 *  `describeBodyName`; a pointer at no entry throws at load. see ADR 0064 */
type CatalogEquivalentName = Pick<
  BodyDefinition,
  "catalogEquivalentId" | "doorCountFollowsWidth"
>;

/** The namer, bound to the depth this catalogue is built at: it resolves against
 *  `buildInsertableBodyDefinitions(cabinetDepthMm)`, never the shipped-depth `INSERTABLE_BODY_DEFINITIONS`.
 *  Exported only so a test can reach the `UnknownCatalogEquivalentError` guard, which no literal pointer
 *  in this file can trigger. */
export function catalogEquivalentNamer(
  cabinetDepthMm: number,
): (catalogEquivalentId: string) => CatalogEquivalentName {
  const insertableById = new Map(
    buildInsertableBodyDefinitions(cabinetDepthMm),
  );
  return (catalogEquivalentId: string): CatalogEquivalentName => {
    const equivalent = insertableById.get(catalogEquivalentId);
    if (equivalent === undefined) {
      throw new UnknownCatalogEquivalentError(catalogEquivalentId);
    }
    return {
      catalogEquivalentId,
      ...(equivalent.doorCountFollowsWidth === undefined
        ? {}
        : { doorCountFollowsWidth: equivalent.doorCountFollowsWidth }),
    };
  };
}

/** A seeded row points at a §7 entry that is not in the catalogue — a stale pointer, which is also a
 *  wrong width set (`resolveBuildableSizes`) and not only a wrong name. */
export class UnknownCatalogEquivalentError extends Error {
  constructor(readonly catalogEquivalentId: string) {
    super(
      `Seeded body's catalogEquivalentId "${catalogEquivalentId}" names no catalogue entry`,
    );
    this.name = "UnknownCatalogEquivalentError";
  }
}

/** M2's seeded instances at one cabinet depth: every `frameDepthMm` below is a seat that moves with the setting. */
export function buildSeededBodyDefinitions(
  cabinetDepthMm: number,
): readonly (readonly [string, BodyDefinition])[] {
  const namedAfterCatalogEquivalent = catalogEquivalentNamer(cabinetDepthMm);

  const baseCarcass: Pick<
    BodyDefinition,
    | "band"
    | "canFinish"
    | "finishRule"
    | "canHandle"
    | "canReplace"
    | "canDelete"
    | "fixedWidth"
    | "insertable"
    | "occupiedDepth"
    | "depthRule"
    | "seatRule"
    | "sink"
  > = {
    band: "base",
    // ADR 0092 decision 9's default; only `base-sink-800` overrides it (see `BodyDefinition.sink`).
    sink: NO_SINK,
    // Fills the same space as a §7 base body: the worktop's front edge. The two corner legs, the
    // dishwasher niche and the oven tower state their own below.
    occupiedDepth: finishesAtMm(baseFinishedDepthMm(cabinetDepthMm)),
    // Cabinetry follows the setting; the freestanding fridge overrides it, and the gate that sweeps both
    // depths catches a row that forgets to. see ADR 0058 decision 2
    depthRule: FOLLOWS_CABINET_DEPTH,
    // Back face on the wall plane, so the seat is measurable (ADR 0077 decision 1); the X-leg and the
    // hood override it.
    seatRule: seatedOnWallPlane,
    canFinish: true,
    // Colourable alone; otherwise follows the kitchen, then the material's default (ADR 0099 decision 1).
    // The hood, shelf and fridge override it, and `STRUCTURAL_CORNER` sets it for the corners.
    finishRule: CHOOSES_ITS_OWN_COLOUR,
    canHandle: true,
    canReplace: true,
    canDelete: true,
    fixedWidth: false,
    // Seeded entries reproduce one already-built body, so they load but are never offered from the
    // catalogue or accepted by `insertBody` (ADR 0011 Gap A).
    insertable: false,
  };

  /** A wall carcass's depth is a formula over its recorded seat: shell plus the front assembly
   *  (ADR 0036 decision 1). `open-shelf-600` and `hood-600` override it. */
  const wallCarcass = {
    seatRule: seatedOnWallPlane,
    ...baseCarcass,
    band: "wall" as const,
    occupiedDepth: shellPlusFrontMm(WALL_FRONT_ASSEMBLY_MM),
  };
  const topCarcass = { ...wallCarcass, band: "top" as const };
  const columnCarcass = {
    seatRule: seatedOnWallPlane,
    ...baseCarcass,
    band: "column" as const,
    occupiedDepth: finishesAtMm(
      tallUnitFinishedDepthMm(columnCarcassDepthMm(cabinetDepthMm)),
    ),
  };

  return [
    // The two base legs of the L (ADR 0025). `frameDepthMm` is the seat, not the depth: the L-joint, not
    // the wall, decides where the X-leg stands. For the return leg the seat is also its depth.
    [
      "base-corner-x-900",
      {
        ...baseCarcass,
        cabinetHandles: carriesHandles(1),
        fronts: oneBaseLeaf,
        ...STRUCTURAL_CORNER,
        kind: "corner_base_x",
        // Seated by the joint: it has no plane of its own to measure, and measuring one re-seats the leg
        // 20 mm forward into its neighbour (ADR 0077 decision 1).
        seatRule: seatedByAJoint,
        // Front on the base run's carcass front, back 20 mm inside the wall at every depth, so it finishes
        // on the run's worktop line (see ADR 0135).
        frameDepthMm: baseCornerXFrameDepthMm(cabinetDepthMm),
        occupiedDepth: finishesAtMm(baseFinishedDepthMm(cabinetDepthMm)),
      },
    ],
    // The id says 320 but the body is 330 wide (ADR 0135). The id is persisted in designs, keyed by the
    // price book and switched on in `decomposed-bodies.ts`, so it is not renamed.
    [
      "base-corner-return-320",
      {
        ...baseCarcass,
        cabinetHandles: NO_CABINET_HANDLES,
        // The one seeded base body with no front: a carcass and a worktop.
        fronts: NO_OPENING_FRONTS,
        ...STRUCTURAL_CORNER,
        kind: "corner_base_return",
        // Built to the run's carcass front with its back on the wall, so the seat is its depth.
        frameDepthMm: baseCarcassFrontMm(cabinetDepthMm),
        occupiedDepth: finishesAtMm(baseFinishedDepthMm(cabinetDepthMm)),
      },
    ],
    [
      "base-sink-800",
      {
        ...baseCarcass,
        cabinetHandles: carriesHandles(2),
        fronts: baseLeaves(2),
        kind: "base_cabinet",
        frameDepthMm: baseSeatDepthMm(cabinetDepthMm),
        // Declared here as well as on `base-sink`: `namedAfterCatalogEquivalent` points a price rule at
        // the §7 row but does not carry its declarations across. see ADR 0092 decision 9
        sink: CARRIES_SINK,
        ...namedAfterCatalogEquivalent("base-sink"),
      },
    ],
    [
      "base-dishwasher-600",
      {
        ...baseCarcass,
        cabinetHandles: carriesHandles(1),
        fronts: oneBaseLeaf,
        kind: "dishwasher_housing",
        frameDepthMm: baseSeatDepthMm(cabinetDepthMm),
        occupiedDepth: finishesAtMm(baseFinishedDepthMm(cabinetDepthMm)),
        ...namedAfterCatalogEquivalent("base-dishwasher"),
      },
    ],
    [
      "base-drawer2-600",
      {
        ...baseCarcass,
        cabinetHandles: carriesHandles(2),
        fronts: carriesDrawers(2),
        kind: "base_cabinet",
        frameDepthMm: baseSeatDepthMm(cabinetDepthMm),
        ...namedAfterCatalogEquivalent("base-panbank"),
      },
    ],
    [
      "base-drawer3-600",
      {
        ...baseCarcass,
        cabinetHandles: carriesHandles(3),
        fronts: carriesDrawers(3),
        kind: "base_cabinet",
        frameDepthMm: baseSeatDepthMm(cabinetDepthMm),
        ...namedAfterCatalogEquivalent("base-3drawer"),
      },
    ],
    // The hob-bearing body: same carcass, seat and frame as `base-drawer2-600`; the hob rides on the
    // worktop and adds nothing to the opening (§5.2 judges fit on the carcass, §11 row 7).
    [
      "base-hob-2drawer-600",
      {
        ...baseCarcass,
        cabinetHandles: carriesHandles(2),
        fronts: carriesDrawers(2),
        kind: "base_cabinet",
        frameDepthMm: baseSeatDepthMm(cabinetDepthMm),
        // Must not inherit `baseCarcass`'s `false`: the hob is a 600 mm appliance with no 400 mm variant, so
        // §5.4's `canGive` would otherwise let this cabinet donate width, and §9 would render a width
        // section over its single-member {600} set.
        fixedWidth: true,
        // Read by nothing today; declared because the body carries a hob and the field says what a body carries.
        carriesAccessoryKind: "induction_cooktop",
        ...namedAfterCatalogEquivalent("base-hob-2drawer"),
      },
    ],
    [
      "tall-oven-tower-600",
      {
        ...columnCarcass,
        cabinetHandles: carriesHandles(2),
        // Two 500 mm cabinet leaves in a 2200 mm frame; the appliance fascias between them are neither
        // (ADR 0061 decision 2).
        fronts: carriesFronts({
          doorBands: doorBandsMm(OVEN_TOWER_DOOR_BAND_HEIGHTS_MM),
          leavesPerBand: 1,
          drawers: NO_DRAWERS,
        }),
        // A body buildable at one width must never be a §5.4 donor (`canGive` reads "not `fixedWidth`"),
        // so this overrides `columnCarcass`'s `false`. It does not copy the catalogue row: `hood-600` is
        // fixed though its `hood` row, buildable at 600–800, is not.
        fixedWidth: true,
        kind: "tall_unit",
        frameDepthMm: columnCarcassDepthMm(cabinetDepthMm),
        frameHeightMm: 2200,
        // The carcass follows the setting and the oven and microwave in it do not: 638 at 600, 738 at 700.
        occupiedDepth: finishesAtMm(
          ovenTowerFinishedDepthMm(columnCarcassDepthMm(cabinetDepthMm)),
        ),
        ...namedAfterCatalogEquivalent("tall-oven-tower"),
      },
    ],
    [
      "tall-pantry-600",
      {
        ...columnCarcass,
        cabinetHandles: carriesHandles(4),
        // Two bands of two leaves, 1290 and 790 mm, against the declared `frameHeightMm: 2200`: they do
        // not sum to it, which is why a band height is declared rather than read off the frame (ADR 0070).
        fronts: carriesFronts({
          doorBands: doorBandsMm(PANTRY_DOOR_BAND_HEIGHTS_MM),
          leavesPerBand: 2,
          drawers: NO_DRAWERS,
        }),
        // Not fixed: `tall-pantry` is buildable at nine widths (400–800), so the seeded pantry is a §5.4
        // width donor; the oven tower above is fixed. see ADR 0048
        fixedWidth: false,
        kind: "tall_unit",
        frameDepthMm: columnCarcassDepthMm(cabinetDepthMm),
        frameHeightMm: 2200,
        ...namedAfterCatalogEquivalent("tall-pantry"),
      },
    ],
    [
      "fridge-free-700",
      {
        ...columnCarcass,
        cabinetHandles: NO_CABINET_HANDLES,
        fronts: NO_OPENING_FRONTS,
        kind: "fridge_freestanding",
        // A freestanding appliance builds no `door_front`, and `canHandle` must stay false too:
        // `handle: "push"` hides every handle mesh in the group, erasing the fridge's own bars.
        canFinish: false,
        // An appliance: no colour reaches it at any level.
        finishRule: IS_NEVER_PAINTED,
        canHandle: false,
        frameDepthMm: 680,
        frameHeightMm: 1850,
        occupiedDepth: finishesAtMm(FREESTANDING_FRIDGE_FINISHED_DEPTH_MM),
        // A machine, not cabinetry, so `columnCarcass`'s `FOLLOWS_CABINET_DEPTH` is wrong: it is 742 deep at
        // every setting (ADR 0058 decision 2).
        depthRule: IS_A_MANUFACTURED_SIZE,
        fixedWidth: true,
        ...namedAfterCatalogEquivalent("fridge-free"),
      },
    ],
    [
      "wall-2door-600",
      {
        ...wallCarcass,
        cabinetHandles: carriesHandles(2),
        // The 700 mm wall carcasses (this, `wall-1door-300`, `wall-2door-800`) omit `frameHeightMm`, the
        // nominal wall height; every leaf is a 694 mm band.
        fronts: wallLeaves({ frameHeightMm: 700, leavesPerBand: 2 }),
        kind: "wall_cabinet",
        frameDepthMm: wallCarcassSeatDepthMm(cabinetDepthMm),
        ...namedAfterCatalogEquivalent("wall-cabinet"),
      },
    ],
    [
      "wall-corner-return-570",
      {
        ...wallCarcass,
        depthRule: FOLLOWS_CABINET_DEPTH_ON_WALL_MAP,
        cabinetHandles: carriesHandles(1),
        fronts: wallLeaves({ frameHeightMm: 700, leavesPerBand: 1 }),
        ...STRUCTURAL_CORNER,
        // Its own kind, so the priced document does not give it and its top-row twin one name at two
        // amounts; `normaliseBand` still groups it with the wall row. see ADR 0066
        kind: WALL_CORNER_RETURN_KIND,
        frameDepthMm: wallCarcassSeatDepthMm(cabinetDepthMm),
      },
    ],
    [
      "wall-1door-300",
      {
        ...wallCarcass,
        cabinetHandles: carriesHandles(1),
        fronts: wallLeaves({ frameHeightMm: 700, leavesPerBand: 1 }),
        kind: "wall_cabinet",
        frameDepthMm: wallCarcassSeatDepthMm(cabinetDepthMm),
        ...namedAfterCatalogEquivalent("wall-cabinet"),
      },
    ],
    [
      "wall-2door-800",
      {
        ...wallCarcass,
        cabinetHandles: carriesHandles(2),
        fronts: wallLeaves({ frameHeightMm: 700, leavesPerBand: 2 }),
        kind: "wall_cabinet",
        frameDepthMm: wallCarcassSeatDepthMm(cabinetDepthMm),
        ...namedAfterCatalogEquivalent("wall-cabinet"),
      },
    ],
    [
      "open-shelf-600",
      {
        ...wallCarcass,
        cabinetHandles: NO_CABINET_HANDLES,
        fronts: NO_OPENING_FRONTS,
        kind: "open_shelf_unit",
        // No door or drawer: `collectFronts` finds nothing to recolour, so `true` would render a Finisaj
        // section of no-op chips. Matches the `open-shelf` catalogue row (capability-parity gate).
        canFinish: false,
        // Cabinetry: painted with the kitchen, with no control of its own since no front exists to recolour.
        finishRule: FOLLOWS_THE_KITCHENS_COLOUR,
        canHandle: false,
        // No front, so the seat is the declared wall depth itself, not that depth less the front assembly.
        frameDepthMm: wallCarcassDepthMm(cabinetDepthMm),
        occupiedDepth: shellPlusFrontMm(NO_FRONT_ASSEMBLY_MM),
        ...namedAfterCatalogEquivalent("open-shelf"),
      },
    ],
    [
      "hood-600",
      {
        ...wallCarcass,
        // Hung at the cabinet front line, not the wall plane: still measurable, but to that plane (ADR 0039).
        seatRule: seatedOnCabinetFrontLine,
        cabinetHandles: NO_CABINET_HANDLES,
        fronts: NO_OPENING_FRONTS,
        kind: EXTRACTOR_HOOD_KIND,
        // A canopy and chimney: no front for a finish chip to recolour. Matches the `hood` catalogue row.
        canFinish: false,
        // An extractor: no colour reaches it, though it counts as cabinetry for width.
        finishRule: IS_NEVER_PAINTED,
        canHandle: false,
        fixedWidth: true,
        frameDepthMm: hoodFrameDepthMm(cabinetDepthMm),
        occupiedDepth: finishesAtMm(hoodFinishedDepthMm(cabinetDepthMm)),
        ...namedAfterCatalogEquivalent("hood"),
      },
    ],
    [
      "wall-2door-600-top",
      {
        ...topCarcass,
        cabinetHandles: carriesHandles(2),
        fronts: wallLeaves({ frameHeightMm: 400, leavesPerBand: 2 }),
        kind: "wall_cabinet",
        frameDepthMm: wallCarcassSeatDepthMm(cabinetDepthMm),
        frameHeightMm: 400,
        ...namedAfterCatalogEquivalent("wall-cabinet"),
      },
    ],
    [
      "wall-1door-300-top",
      {
        ...topCarcass,
        cabinetHandles: carriesHandles(1),
        fronts: wallLeaves({ frameHeightMm: 400, leavesPerBand: 1 }),
        kind: "wall_cabinet",
        frameDepthMm: wallCarcassSeatDepthMm(cabinetDepthMm),
        frameHeightMm: 400,
        ...namedAfterCatalogEquivalent("wall-cabinet"),
      },
    ],
    [
      "wall-2door-800-top",
      {
        ...topCarcass,
        cabinetHandles: carriesHandles(2),
        fronts: wallLeaves({ frameHeightMm: 400, leavesPerBand: 2 }),
        kind: "wall_cabinet",
        frameDepthMm: wallCarcassSeatDepthMm(cabinetDepthMm),
        frameHeightMm: 400,
        ...namedAfterCatalogEquivalent("wall-cabinet"),
      },
    ],
    [
      "wall-corner-return-570-top",
      {
        ...topCarcass,
        depthRule: FOLLOWS_CABINET_DEPTH_ON_WALL_MAP,
        cabinetHandles: carriesHandles(1),
        fronts: wallLeaves({ frameHeightMm: 400, leavesPerBand: 1 }),
        ...STRUCTURAL_CORNER,
        // A separate kind from `wall-corner-return-570`: they differ by row and the breakdown line renders
        // no band (ADR 0066).
        kind: WALL_CORNER_RETURN_TOP_KIND,
        frameDepthMm: wallCarcassSeatDepthMm(cabinetDepthMm),
        frameHeightMm: 400,
      },
    ],
    // The corner wall unit (ADR 0110 Amendment O) takes the side returns' shape — structural, one handle,
    // one leaf, the wall map's depth — and their kinds. Never in the seeded kitchen: `shell-design.ts`
    // places it.
    [
      WALL_CORNER_X_BUILD_ID,
      {
        ...wallCarcass,
        depthRule: FOLLOWS_CABINET_DEPTH_ON_WALL_MAP,
        cabinetHandles: carriesHandles(1),
        fronts: wallLeaves({ frameHeightMm: 700, leavesPerBand: 1 }),
        ...STRUCTURAL_CORNER,
        kind: WALL_CORNER_RETURN_KIND,
        frameDepthMm: wallCarcassSeatDepthMm(cabinetDepthMm),
      },
    ],
    [
      WALL_CORNER_X_TOP_BUILD_ID,
      {
        ...topCarcass,
        depthRule: FOLLOWS_CABINET_DEPTH_ON_WALL_MAP,
        cabinetHandles: carriesHandles(1),
        fronts: wallLeaves({ frameHeightMm: 400, leavesPerBand: 1 }),
        ...STRUCTURAL_CORNER,
        kind: WALL_CORNER_RETURN_TOP_KIND,
        frameDepthMm: wallCarcassSeatDepthMm(cabinetDepthMm),
        frameHeightMm: 400,
      },
    ],
    [
      "wall-2door-600-deep-top",
      {
        ...topCarcass,
        cabinetHandles: carriesHandles(2),
        fronts: wallLeaves({ frameHeightMm: 400, leavesPerBand: 2 }),
        kind: "wall_cabinet",
        // A deep top hangs over a full-height column, so its depth is the cabinet-depth line (561 at 600,
        // 661 at 700) and not `wallCarcassSeatDepthMm`'s wall-map arithmetic (291 at 600). see ADR 0101
        frameDepthMm: liftedTopSeatDepthMm(cabinetDepthMm),
        // Read by the equivalence gate: a rebuild takes `columnBuildDepthM`'s lifted arm, never
        // `wall-cabinet`'s own `frameDepthMm` (the equivalent declares 361 at 700, the rebuild plans 700).
        builtDepthFollowsALiftedColumn: true,
        frameHeightMm: 400,
        ...namedAfterCatalogEquivalent("wall-cabinet"),
      },
    ],
    [
      "wall-2door-700-over-fridge",
      {
        ...topCarcass,
        cabinetHandles: carriesHandles(2),
        // The one seeded wall body that is neither 700 nor 400: a 750 mm box, so a 744 mm band.
        fronts: wallLeaves({ frameHeightMm: 750, leavesPerBand: 2 }),
        kind: "wall_cabinet",
        // Follows the cabinet-depth line, not the freestanding fridge's 742 mm it hangs over, which is a
        // machine's depth and follows no setting.
        frameDepthMm: liftedTopSeatDepthMm(cabinetDepthMm),
        // For `wall-2door-600-deep-top`'s reason.
        builtDepthFollowsALiftedColumn: true,
        frameHeightMm: 750,
        ...namedAfterCatalogEquivalent("wall-cabinet"),
      },
    ],
  ];
}

/** Throws unless every entry states its depth rule. `BodyShape.depthRule` is required for §7 entries but
 *  optional on a seeded `BodyDefinition`, and an absent rule would read as "does not move". Exported for
 *  `cabinet-depth-parameter.test.ts`, not on the barrel. see ADR 0058 decision 2 */
export function refuseUndeclaredDepthRules(
  entries: readonly (readonly [string, DeclaresADepthRule])[],
): void {
  for (const [buildId, definition] of entries) {
    cabinetDepthRuleOf({ buildId, rule: definition.depthRule });
  }
}

/** What the sweep reads, so a gate can hand it a row declaring nothing without a whole `BodyDefinition`. */
interface DeclaresADepthRule {
  readonly depthRule?: CabinetDepthRule;
}

/** Throws unless every entry states which plane seats it: an undeclared seeded row would be read as
 *  `wall-plane`, which is wrong for `base-corner-x-900`. see ADR 0077 */
export function refuseUndeclaredSeatRules(
  entries: readonly (readonly [string, DeclaresASeatRule])[],
): void {
  for (const [buildId, definition] of entries) {
    seatRuleOf({ buildId, rule: definition.seatRule });
  }
}

interface DeclaresASeatRule {
  readonly seatRule?: SeatRule;
}

/** Throws unless every entry states its colour rule and `finishRule` agrees with `canFinish`. An absent
 *  rule is wrong both ways: read as "chooses" it paints a fridge, read as "never" it leaves a structural
 *  body white. Exported for `structural-cabinetry-follows-the-kitchens-colour.test.ts`, not on the barrel. */
export function refuseUndeclaredFinishRules(
  entries: readonly (readonly [string, DeclaresAFinishRule])[],
): void {
  for (const [buildId, definition] of entries) {
    bodyFinishRuleOf({
      buildId,
      rule: definition.finishRule,
      canFinish: definition.canFinish,
    });
  }
}

interface DeclaresAFinishRule {
  readonly finishRule?: BodyFinishRule;
  readonly canFinish: boolean;
}

/** One map, two populations (ADR 0011 Gap A): M2's seeded instances, which reproduce M1's scene
 *  and are never offered, and §7's parameterised entries, which are the only ones a customer can
 *  insert. Both resolve through the same lookup, so a placement created by `insertBody` loads the
 *  same way a seeded one does. */
export function buildKitchenLBodyCatalog(cabinetDepthMm: number): BodyCatalog {
  const entries = [
    ...buildSeededBodyDefinitions(cabinetDepthMm),
    ...buildInsertableBodyDefinitions(cabinetDepthMm),
  ];
  refuseUndeclaredDepthRules(entries);
  refuseUndeclaredSeatRules(entries);
  refuseUndeclaredFinishRules(entries);
  // `carriesFronts` refuses a contradictory rule where it is written; this refuses one that reached the
  // `BodyCatalog` port without a constructor, and has the row id to name (ADR 0070).
  refuseContradictoryFrontDeclarations(entries);
  return new Map<string, BodyDefinition>(entries);
}

/** That catalogue at the declared depth: the one materialisation for readers without a depth setting. */
export const KITCHEN_L_BODY_CATALOG: BodyCatalog =
  buildKitchenLBodyCatalog(WORKTOP_DEPTH_MM);

function placement(
  id: string,
  wall: DesignWall,
  alongMm: number,
  y0Mm: number,
  buildId: string,
  widthMm: number,
  heightMm: number,
): DesignPlacement {
  return { id, wall, alongMm, y0Mm, body: { buildId, widthMm, heightMm } };
}

/** Wall B's declared length: 2920, deliberately not the design reference's measured 2830. The seeded run
 *  ends at 2900 at the 700 mm depth, so 2830 would overrun and mark the opening design as overflowing.
 *  The owner's band is 20–50 mm past 2900; outside it is an owner question. Do not "correct" it to 2830.
 *  see ADR 0083 decision 1 */
const WALL_B_LENGTH_MM = 2920;

/** The reference room: wall A is the design reference's 3560 mm. Declared above the placements because
 *  the corner's own size is derived from the room. */
const KITCHEN_L_ROOM: Design["room"] = {
  shape: "L",
  widthMm: 3560,
  depthMm: WALL_B_LENGTH_MM,
  heightMm: 2600,
};

/** The corner sized for this room at the declared depth (`corner-assembly-size.ts`): 900 mm on wall A,
 *  330 on wall B's base row and 570 in each upper row, all flush at a 900 mm far edge on both walls.
 *  Derived, never stored, so the widths cannot drift from the reach the room policy reads. A narrower
 *  room gives a narrower corner; a larger one does not widen it. see ADR 0120 Amendment A */
const REFERENCE_CORNER_WIDTHS = cornerAssemblyWidthsMm({
  cabinetDepthMm: WORKTOP_DEPTH_MM,
  room: KITCHEN_L_ROOM,
});

/** A structural corner piece at the width and centre the derivation gives it; `cornerAlongWallCentreMm`
 *  refuses a centre off the whole-millimetre grid rather than rounding one into a stored design. */
function cornerPlacement(
  id: string,
  piece: CornerAssemblyPiece,
  y0Mm: number,
  buildId: string,
  heightMm: number,
): DesignPlacement {
  const { alongMm } = cornerAlongWallCentreMm({
    widths: REFERENCE_CORNER_WIDTHS,
    cabinetDepthMm: WORKTOP_DEPTH_MM,
    wall: piece.wall,
    band: piece.band,
  });
  return placement(
    id,
    piece.wall,
    alongMm,
    y0Mm,
    buildId,
    cornerWidthMm(piece),
    heightMm,
  );
}

function cornerWidthMm(piece: CornerAssemblyPiece): number {
  const sized = REFERENCE_CORNER_WIDTHS.pieces.find(
    (candidate) =>
      candidate.wall === piece.wall && candidate.band === piece.band,
  );
  if (sized === undefined) {
    throw new Error(
      `kitchen-l-design: the corner assembly stands on no wall ${piece.wall} piece in the ${piece.band} row`,
    );
  }
  return sized.widthMm;
}

/** The corner wall unit's two placements as `shell-design.ts` templates them. Not in `KITCHEN_L_PLACEMENTS`:
 *  the seeded kitchen keeps the supplier's corner on wall A and only generated shells carry the unit.
 *  Ids follow `p26` because persisted ids are never reused. */
export const CORNER_WALL_UNIT_TEMPLATES: readonly DesignPlacement[] = [
  cornerPlacement(
    "p27",
    { wall: "A", band: "wall" },
    1500,
    WALL_CORNER_X_BUILD_ID,
    700,
  ),
  cornerPlacement(
    "p28",
    { wall: "A", band: "top" },
    2200,
    WALL_CORNER_X_TOP_BUILD_ID,
    400,
  ),
];

export const KITCHEN_L_PLACEMENTS: readonly DesignPlacement[] = [
  placement("p0", "A", 1300, 0, "base-sink-800", 800, 820),
  placement("p1", "A", 2000, 0, "base-dishwasher-600", 600, 820),
  // `p3` is retired and its id is never reused: ids are persisted.
  placement("p2", "A", 2600, 0, "base-hob-2drawer-600", 600, 820),
  placement("p4", "A", 3200, 0, "base-drawer3-600", 600, 820),
  // Appended ids, out of positional order: `p0`…`p24` are persisted, so renumbering would rewrite saved data.
  cornerPlacement(
    "p25",
    { wall: "A", band: "base" },
    0,
    "base-corner-x-900",
    820,
  ),
  cornerPlacement(
    "p26",
    { wall: "B", band: "base" },
    0,
    "base-corner-return-320",
    820,
  ),
  placement("p5", "B", 1200, 0, "tall-oven-tower-600", 600, 2200),
  placement("p6", "B", 1800, 0, "tall-pantry-600", 600, 2200),
  placement("p7", "B", 2450, 0, "fridge-free-700", 700, 1850),
  placement("p8", "A", 300, 1500, "wall-2door-600", 600, 700),
  cornerPlacement(
    "p9",
    { wall: "B", band: "wall" },
    1500,
    "wall-corner-return-570",
    700,
  ),
  placement("p10", "A", 750, 1500, "wall-1door-300", 300, 700),
  placement("p11", "A", 1300, 1500, "wall-2door-800", 800, 700),
  placement("p12", "A", 2000, 1500, "open-shelf-600", 600, 700),
  placement("p13", "A", 2600, 1500, "hood-600", 600, 700),
  placement("p14", "A", 3200, 1500, "wall-2door-600", 600, 700),
  placement("p15", "A", 300, 2200, "wall-2door-600-top", 600, 400),
  placement("p16", "A", 750, 2200, "wall-1door-300-top", 300, 400),
  placement("p17", "A", 1300, 2200, "wall-2door-800-top", 800, 400),
  placement("p18", "A", 2000, 2200, "wall-2door-600-top", 600, 400),
  placement("p19", "A", 2600, 2200, "wall-2door-600-top", 600, 400),
  placement("p20", "A", 3200, 2200, "wall-2door-600-top", 600, 400),
  cornerPlacement(
    "p21",
    { wall: "B", band: "top" },
    2200,
    "wall-corner-return-570-top",
    400,
  ),
  placement("p22", "B", 1200, 2200, "wall-2door-600-deep-top", 600, 400),
  placement("p23", "B", 1800, 2200, "wall-2door-600-deep-top", 600, 400),
  placement("p24", "B", 2450, 1850, "wall-2door-700-over-fridge", 700, 750),
];

export const KITCHEN_L_DESIGN: Design = {
  room: KITCHEN_L_ROOM,
  presetId: null,
  settings: { cabinetDepthMm: WORKTOP_DEPTH_MM },
  placements: [...KITCHEN_L_PLACEMENTS],
  createdAt: "2026-08-25T00:00:00.000Z",
  updatedAt: "2026-08-25T00:00:00.000Z",
};

/** How far past its wall's end the body in `OVERFLOWING_KITCHEN_L_DESIGN` reaches: one millimetre is the
 *  smallest overrun the integer wire schema can express, and equality fits, so zero reports nothing
 *  (ADR 0083 decision 3). */
const PAST_WALL_END_MM = 1;

/** A body declared by **which wall it overruns and what it is**, never by where it stands. */
type OverflowingBody = Pick<DesignPlacement, "id" | "wall" | "body">;

/** The overflowing population as data; `seatedPastItsWall` derives each seat from the room, so it follows
 *  a room change. */
const OVERFLOWING_POPULATION: readonly OverflowingBody[] = [
  {
    id: "dragged-past-wall-b",
    wall: "B",
    body: { buildId: "base-sink-800", widthMm: 800, heightMm: 820 },
  },
];

/** The seeded kitchen with one body one millimetre past the end of wall B and nothing else changed; its
 *  only diagnostic is `PLACEMENT_PAST_WALL_END`. The one shared overflow fixture. see ADR 0083 decision 10 */
export const OVERFLOWING_KITCHEN_L_DESIGN: Design = {
  ...KITCHEN_L_DESIGN,
  placements: [
    ...KITCHEN_L_DESIGN.placements,
    ...OVERFLOWING_POPULATION.map(seatedPastItsWall),
  ],
};

function seatedPastItsWall(overflowing: OverflowingBody): DesignPlacement {
  const wallRunMm =
    overflowing.wall === "A"
      ? KITCHEN_L_DESIGN.room.widthMm
      : KITCHEN_L_DESIGN.room.depthMm;
  return {
    id: overflowing.id,
    wall: overflowing.wall,
    alongMm: wallRunMm - overflowing.body.widthMm / 2 + PAST_WALL_END_MM,
    y0Mm: 0,
    body: { ...overflowing.body },
  };
}

/** The seeded kitchen with wall A declared narrower than its run. Only `room.widthMm` changes, so a capture
 *  differs from `KITCHEN_L_DESIGN` by the overflow mark alone. 2800 keeps the six marked bodies inside the
 *  overview camera's frame; a narrower room marks bodies past its right edge. */
export const NARROWED_ROOM_OVERFLOWING_DESIGN: Design = {
  ...KITCHEN_L_DESIGN,
  room: { ...KITCHEN_L_DESIGN.room, widthMm: 2800 },
};
