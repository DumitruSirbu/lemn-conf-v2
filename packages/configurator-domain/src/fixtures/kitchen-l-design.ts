import {
  seatRuleOf,
  seatedByAJoint,
  seatedOnCabinetFrontLine,
  seatedOnWallPlane,
  type SeatRule,
} from "../seat-rule.js";
import {
  baseCarcassDepthMm,
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
  pinnedAtFinishedDepthMm,
  type CabinetDepthRule,
} from "../cabinet-depth-rule.js";
import { WALL_FRONT_ASSEMBLY_MM, WORKTOP_DEPTH_MM } from "../worktop-depth.js";
import type { Design, DesignPlacement } from "../design.js";
import type { BodyCatalog, BodyDefinition } from "../void-engine.js";

/**
 * The seeded L-kitchen: every body M1's `builders['kitchen-l']()` renders whole, expressed as
 * individually mounted placements. Excludes the room shell (floor, walls, backsplash,
 * `end_panel_right`), which are not placements — nothing else.
 *
 * `frameDepthMm` values reproduce `kitchen-parts.ts`'s `buildKitchen()` placement coordinates
 * exactly. Each is `2 ×` the body's **wall-normal seat offset** — the distance from its group
 * origin to the wall plane — not a claim about the body's physical depth: several bodies (the hob,
 * the hood) are visually shallower than their `frameDepthMm`, and `base-corner-x-900` is deeper
 * than its own (see `ADR 0025`).
 *
 * **Wave 5F moved three sets of these, and every one of them is a seat and not a depth.**
 * ADR 0036 decision 1 makes a declared dimension the finished cabinet, so a wall shell is now its
 * declared depth less the 39 mm front assembly: the 330 mm wall bodies seat on **291** and the two
 * deliberately deep top bodies on **561**, while `open-shelf-600` keeps 330 because it has no
 * front. ADR 0039 decision 2 hangs the hood at the front, so `hood-600` seats on **700** — twice
 * the distance from the wall to the centre of a 500 mm body whose front face lands on the 600 mm
 * cabinet-depth line. That last one is §11 row 19's second named exception and the one row here
 * where the seat is deliberately larger than the space the body fills.
 */

/** **`cabinetHandles` is deliberately not in any of the shared shapes below** (ADR 0061 decision 3).
 *  Every seeded row states its own, because the shapes cannot: `wallCarcass` is spread by a one-door
 *  300 and a two-door 800 alike, and a count inherited from a shape is the accident DOM-002 was.
 *  Each is the number of **cabinet** handles the row's builder draws — the appliance bars on
 *  `fridge-free-700` and the two on `tall-oven-tower-600` are not among them — and every one of them
 *  is held to the built meshes by `cabinet-handle-count.parity.test.ts` in `@lemnaria/three-adapter`.
 *  The seeded rows all take a `declared-count` rule rather than a per-door one: ADR 0011 Gap A gives
 *  each of them one already-built body at one width, so there is no width for a count to follow. */

/** How much further the X-leg's **corner** worktop reaches than a straight run's — ADR 0025's own
 *  framing of the same measurement, *"630 mm from the wall plane, 10 more than a straight run's"*.
 *  It is the leg's wider slab meeting the base run's, so it is a constant and the run it is measured
 *  from is what follows the setting. */
const CORNER_BASE_X_WORKTOP_REACH_MM = 10;

/** ADR 0025: the X-leg carries a corner worktop, which reaches this far from the wall plane — 630 at
 *  a 600 mm kitchen and 730 at a 700 mm one, both measured on `cornerBaseX`'s own `countertop`. The
 *  leg's seat is `baseCarcassDepthMm` and its own footprint is the full declared depth, so it stands
 *  20 mm inside the wall at every depth; that is the anomaly the record is about and it is preserved
 *  rather than derived away. */
function cornerBaseXFinishedDepthMm(cabinetDepthMm: number): number {
  return baseFinishedDepthMm(cabinetDepthMm) + CORNER_BASE_X_WORKTOP_REACH_MM;
}

/** The return leg's worktop finishes on the front plane of the tall run it butts into, which is what
 *  its placement depth is chosen to make true (`decomposed-bodies.ts`,
 *  `SEEDED_CORNER_RETURN_DEPTH_M`). That lands it on the **cabinet-depth line**: the leg is built
 *  `baseSeatDepthMm` deep and its slab stands 20 mm proud of that, so the two cancel — 600 at a
 *  600 mm kitchen and 700 at a 700 mm one, measured on the built leg in
 *  `cabinet-depth-sweep.parity.test.ts`, where it sits the shipped 1 mm proud of the column run. */
function cornerBaseReturnFinishedDepthMm(cabinetDepthMm: number): number {
  return cabinetDepthMm;
}

/** ADR 0058 decision 1: **the finished depth the two deliberately deep top cabinets are pinned at.**
 *
 *  `wall-2door-600-deep-top` (`p22`, `p23`) and `wall-2door-700-over-fridge` (`p24`) are deep because
 *  the *columns* they hang over are — §5.2's head-clearance cap is lifted over a full-height member
 *  rather than mapped — and the owner ruled on 2026-09-02 that they stay put rather than follow the
 *  setting or follow their column. They finish at exactly the 600 mm cabinet-depth line, not at an
 *  arbitrary deep number — the coincidence that makes this readable, and **not** a licence to read
 *  the pin as a setting value. It is a finished depth: rebuilding these rows from a setting of 600
 *  would take them back through the wall map, where `wallCarcassSeatDepthMm(600)` is 291 and would
 *  shrink them by 270 mm. The seat below is this number less the front assembly, which is the one
 *  arithmetic that does not go through the map.
 *
 *  **What this costs at 700 is recorded and accepted, not worked around** (ADR 0058): `p23`'s face
 *  is flush with the pantry below it at 600 and becomes a 99 mm step at 700. Nothing overlaps and
 *  600 remains a manufactured size. Whoever first renders a 700 mm kitchen should read that step as
 *  this decision rather than report it as a regression.
 *
 *  The alternative the planning had recommended — follow their column — would have put `p24` at
 *  exactly the 742 mm `docs/BACKLOG.md` entry 15 names as unmanufacturable, on a shipped body. */
const PINNED_DEEP_TOP_FINISHED_DEPTH_MM = 600;

/** **A seeded base body's hinged leaves** — one 710 mm band, this many leaves standing in it. The
 *  band constant is imported rather than retyped: a seeded base body is `baseCabinet` called at one
 *  width (ADR 0011 Gap A), so it is the same slab §7's own row declares. */
function baseLeaves(leavesPerBand: number): FrontPopulationRule {
  return carriesFronts({
    doorBands: doorBandsMm([BASE_DOOR_BAND_HEIGHT_MM]),
    leavesPerBand,
    drawers: NO_DRAWERS,
  });
}

/** **A seeded wall body's hinged leaves** — one band as tall as this already-built carcass leaves
 *  it, and this many leaves in it. A seeded row states a height rather than a rule for the reason it
 *  states a handle count rather than a per-door one: it is one body at one size, so there is nothing
 *  for the height to follow. `wallDoorBandHeightMm` is what keeps that literal and §7's
 *  `one-band-under-frame` rule from being two numbers that agree by luck. */
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

/** The one seeded base leaf: `base-corner-x-900`'s 280 mm door and `base-dishwasher-600`'s decor
 *  door are both one leaf in the same band. */
const oneBaseLeaf: FrontPopulationRule = baseLeaves(1);

/** §13.1: "Corners are structural. No replace, no delete, never a width donor", repeated by §11
 *  row 16 — so a corner body also has no finish and no handle to offer, and the panel renders
 *  none of those sections for it. Shared by the two wall returns and, since ADR 0025, by the two
 *  base legs, which is what makes §11 row 16 reachable at all: it names the *base* corner, and
 *  until the legs became placements there was no base corner to select. `kind` is deliberately
 *  **not** part of this shape — the four bodies that wear it are three different kinds. */
const STRUCTURAL_CORNER: Pick<
  BodyDefinition,
  | "canReplace"
  | "canDelete"
  | "canFinish"
  | "canHandle"
  | "fixedWidth"
  | "structuralReason"
> = {
  canReplace: false,
  canDelete: false,
  canFinish: false,
  canHandle: false,
  fixedWidth: true,
  // With all four capability flags false the panel offers nothing, so it never produces the refusal
  // §11 row 16 requires to explain why. The reason is declared here and rendered as its own section.
  structuralReason: "corner",
};

/** Each `catalogEquivalentId` below was read off the two builder tables in `@lemnaria/three-adapter`
 *  — `decomposed-bodies.ts` for the seeded instance, `catalog-bodies.ts` for the §7 entry — and
 *  points at the entry that builds the *same* body: `base-drawer2-600` is
 *  `baseCabinet(0.6, { drawers: 2 })`, which is exactly what `base-panbank` builds, so the two-drawer
 *  base is the pan bank at 600. Four entries carry no pointer because nothing in §7 builds them:
 *  the four corner bodies — §13.1 is explicit that a corner is not a body a customer chooses, so
 *  having no catalogue equivalent is the correct answer for them, not a missing one.
 *
 *  **The pointer now carries a second fact, and it is the one M5 needs.** A seeded entry declares no
 *  `sizesMm`: ADR 0011 Gap A gives it one already-built geometry, so the widths it *could* be
 *  rebuilt at belong to the §7 entry a §5.4 resize would rebuild it through — the one named here.
 *  `resolveBuildableSizes` (`catalog.ts`) reads the set and its floor off that entry, which is why
 *  a stale pointer is now a wrong width set as well as a wrong badge. Both fail loudly against the
 *  guard test rather than quietly, which is the whole reason the relationship is declared. */

/** ADR 0064: the pointer, **and the name the pointed-at entry carries**, so a body is called the
 *  same thing before and after a §5.4 resize migrates its `buildId` through that entry
 *  (`resolve-column-members.ts`). Before this, the seeded pantry read *"Coloană"* until its first
 *  resize and *"Coloană cămară 2 uși"* after, and 6D puts that name in a priced document.
 *
 *  **Two fields, not one.** `describeBodyLabelAt` appends the door count only for a definition that
 *  declares `doorCountFollowsWidth`, and eight seeded rows point at `wall-cabinet`, whose `label` is
 *  the same *Corp suspendat* the kind table already returns for them — copying the label alone would
 *  leave the whole rename intact for them in the suffix.
 *
 *  Both are **read off the equivalent** rather than written out beside it: one name in two places is
 *  the drift ADR 0028 exists to close, and this is the same relationship `resolveBuildableSizes`
 *  already resolves through. A pointer at no entry throws here, at load, rather than silently
 *  reverting the row to its generic kind name. */
type CatalogEquivalentName = Pick<
  BodyDefinition,
  "catalogEquivalentId" | "label" | "doorCountFollowsWidth"
>;

/** The namer, bound to **the depth this catalogue is being built at**.
 *
 *  It resolves against `buildInsertableBodyDefinitions(cabinetDepthMm)` and deliberately not against
 *  `INSERTABLE_BODY_DEFINITIONS`, the materialisation at the shipped depth: a catalogue built at
 *  700 that resolved half of itself at 600 would be quietly half-built, and it would stay invisible
 *  because `label` and `doorCountFollowsWidth` happen to be depth-independent in every §7 row today.
 *  That coincidence is asserted rather than relied on — `seeded-body-names.test.ts` checks that both
 *  fields are identical for every seeded row at both declared depths — so if a name ever does become
 *  depth-dependent, a test says so instead of a pinned lookup deciding silently. */
function catalogEquivalentNamer(
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
      ...(equivalent.label === undefined ? {} : { label: equivalent.label }),
      ...(equivalent.doorCountFollowsWidth === undefined
        ? {}
        : { doorCountFollowsWidth: equivalent.doorCountFollowsWidth }),
    };
  };
}

/** A seeded row points at a §7 entry that is not in the catalogue — a stale pointer, which is also a
 *  wrong width set (`resolveBuildableSizes`) and not only a wrong name. */
class UnknownCatalogEquivalentError extends Error {
  constructor(readonly catalogEquivalentId: string) {
    super(
      `Seeded body's catalogEquivalentId "${catalogEquivalentId}" names no catalogue entry`,
    );
    this.name = "UnknownCatalogEquivalentError";
  }
}

/** M2's seeded instances **at one cabinet depth** — every body `builders['kitchen-l']()` renders,
 *  as individually mounted placements.
 *
 *  **A function since M6 wave 6I**, the shape wave 6H gave `buildInsertableBodyDefinitions`, and for
 *  the reason that wave gives: a seeded map frozen at one depth cannot describe a design carrying
 *  another, and every `frameDepthMm` below is a *seat* the geometry moves when the setting does.
 *  Without this, `occupied-depth.parity.test.ts` could only ever have been a claim about 600.
 *
 *  Nothing here persists a depth and nothing sets one — the control and the stored setting are waves
 *  6K and 6J. */
export function buildSeededBodyDefinitions(
  cabinetDepthMm: number,
): readonly (readonly [string, BodyDefinition])[] {
  const namedAfterCatalogEquivalent = catalogEquivalentNamer(cabinetDepthMm);

  const baseCarcass: Pick<
    BodyDefinition,
    | "band"
    | "canFinish"
    | "canHandle"
    | "canReplace"
    | "canDelete"
    | "fixedWidth"
    | "insertable"
    | "occupiedDepth"
    | "depthRule"
    | "seatRule"
  > = {
    band: "base",
    // A seeded base body is a §7 base body that has already been built, so it fills the same space:
    // its worktop's front edge (DOM-002). The four rows that are **not** an ordinary base — the two
    // corner legs, the dishwasher niche and, in the column family, the oven tower — say so on their
    // own line below.
    occupiedDepth: finishesAtMm(baseFinishedDepthMm(cabinetDepthMm)),
    // Cabinetry, so it follows the setting (ADR 0058 decision 2). The three rows this is wrong for
    // — the freestanding fridge and ADR 0058's two pinned tops — override it on their own line, and
    // the gate that sweeps both depths is what catches a fourth that forgets to.
    depthRule: FOLLOWS_CABINET_DEPTH,
    // Its back face sits on the wall plane, so its seat is measurable and must stay measured
    // (ADR 0077 decision 1). The rows this is wrong for — the X-leg, seated by its joint, and the
    // two hoods, seated on the cabinet front line — override it on their own line below.
    seatRule: seatedOnWallPlane,
    canFinish: true,
    canHandle: true,
    canReplace: true,
    canDelete: true,
    fixedWidth: false,
    // ADR 0011 Gap A: every seeded entry reproduces one already-built body at one measured depth,
    // so it can be loaded but never offered from the catalogue or accepted by `insertBody`.
    insertable: false,
  };

  /** A wall carcass's depth is the one depth in the model that is a placement variable, so its rule
   *  is a formula over the seat it records rather than a declared distance: shell plus ADR 0036
   *  decision 1's front assembly. `open-shelf-600` and `hood-600` are the two rows this is wrong for,
   *  and both override it. */
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
    // ADR 0025. The two base legs of the L. `frameDepthMm` is the seat, not the depth: the X-leg's
    // carcass is 600 deep but seats at 560/2 = 280 mm off the wall, because the L-joint — not the
    // wall — decides where it stands. The return leg's 580 is both at once.
    [
      "base-corner-x-900",
      {
        ...baseCarcass,
        cabinetHandles: carriesHandles(1),
        fronts: oneBaseLeaf,
        ...STRUCTURAL_CORNER,
        kind: "corner_base_x",
        // **Seated by the joint, not by the wall** (ADR 0077 decision 1). There is no plane of its
        // own to measure: the return leg decides where it stands, which is why the declared 560
        // disagrees with the 600 its bounding box reports and why measuring it re-seated the leg
        // 20 mm forward into its neighbour.
        seatRule: seatedByAJoint,
        // ADR 0025's anomaly, preserved: the seat is the **base run's carcass depth** and not this
        // leg's own 600 mm footprint, because the L-joint decides where it stands. It therefore
        // stands 20 mm inside the wall — at 600 and at 700 alike.
        frameDepthMm: baseCarcassDepthMm(cabinetDepthMm),
        occupiedDepth: finishesAtMm(cornerBaseXFinishedDepthMm(cabinetDepthMm)),
      },
    ],
    [
      "base-corner-return-320",
      {
        ...baseCarcass,
        cabinetHandles: NO_CABINET_HANDLES,
        // The one seeded base body with no front at all: the return leg is a carcass and a worktop.
        fronts: NO_OPENING_FRONTS,
        ...STRUCTURAL_CORNER,
        kind: "corner_base_return",
        frameDepthMm: baseSeatDepthMm(cabinetDepthMm),
        occupiedDepth: finishesAtMm(
          cornerBaseReturnFinishedDepthMm(cabinetDepthMm),
        ),
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
    // ADR 0027. The hob-bearing body the seeded kitchen now uses: one placement where `p2` + `p3`
    // used to be two. Same carcass, same 580 mm seat, same 820 mm frame as `base-drawer2-600` —
    // the hob rides on the worktop above all of that and adds nothing to the opening, exactly as
    // `base-sink-800`'s faucet does not (§5.2 judges fit on the carcass, §11 row 7).
    [
      "base-hob-2drawer-600",
      {
        ...baseCarcass,
        cabinetHandles: carriesHandles(2),
        fronts: carriesDrawers(2),
        kind: "base_cabinet",
        frameDepthMm: baseSeatDepthMm(cabinetDepthMm),
        // ADR 0027: 600 mm in both directions, matching the catalogue entry. `baseCarcass` defaults
        // to `fixedWidth: false` and this row must not inherit it: the hob is a 600 mm appliance and
        // there is no 400 mm one, so §5.4's `canGive` ("not `fixedWidth`") would otherwise let the
        // one cabinet carrying a hob donate width to a neighbour. It had no symptom when it was
        // written, because no seeded entry resolved a width set; it does now — the pointer below
        // resolves `base-hob-2drawer`'s single-member {600}, and this flag is what keeps §9 from
        // rendering a width section over it.
        fixedWidth: true,
        // ADR 0027: the hob is built into this body. Nothing reads the field since ADR 0038
        // deleted the cascade that used to. It is declared because it is true of the body: the
        // field says what a body carries, and a body that carries a hob and does not say so is the
        // defect waiting to happen the next time something asks.
        carriesAccessoryKind: "induction_cooktop",
        ...namedAfterCatalogEquivalent("base-hob-2drawer"),
      },
    ],
    [
      "tall-oven-tower-600",
      {
        ...columnCarcass,
        cabinetHandles: carriesHandles(2),
        // Two 500 mm cabinet leaves in a 2200 mm frame — the appliance fascias between them are
        // neither, for the reason their bars are not cabinet handles (ADR 0061 decision 2).
        fronts: carriesFronts({
          doorBands: doorBandsMm(OVEN_TOWER_DOOR_BAND_HEIGHTS_MM),
          leavesPerBand: 1,
          drawers: NO_DRAWERS,
        }),
        // The rule: **a body that can only be built at one width must never be a §5.4 donor**,
        // whose `canGive` reads "not `fixedWidth`". A column is 600 and nothing else, so this is
        // `true`; `columnCarcass` defaults to `false`. Latent until M5 wires resize, found in the
        // same pass as the hob's identical gap (ADR 0027).
        //
        // The rule is *not* "match the catalogue row". `hood-600` below is `fixedWidth: true` while
        // its catalogue row (`hood`) never sets the flag and is therefore `false` — and `hood-600`
        // is right: the `hood` entry builds anywhere in 600–800, but this seeded instance is a 600.
        fixedWidth: true,
        kind: "tall_unit",
        frameDepthMm: columnCarcassDepthMm(cabinetDepthMm),
        frameHeightMm: 2200,
        // Wave 6I's criterion 2: the carcass follows the setting and the oven and microwave
        // standing in it do not. 638 at a 600 mm kitchen and 738 at a 700 mm one, which is what
        // ADR 0058 projected for the body `p22` hangs over.
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
        // **ADR 0070's named case.** Two bands of two leaves at this width: 1290 mm and 790 mm,
        // against this row's own declared `frameHeightMm: 2200` below. They do not sum to it, and
        // that gap is the whole reason a band height is declared rather than read off the frame.
        fronts: carriesFronts({
          doorBands: doorBandsMm(PANTRY_DOOR_BAND_HEIGHTS_MM),
          leavesPerBand: 2,
          drawers: NO_DRAWERS,
        }),
        // **Not fixed, since ADR 0048** — and this row is the one place in the fixture where that
        // record is visible. It read "Fixed for `tall-oven-tower-600`'s reason above: one buildable
        // width, so never a §5.4 donor", and that reason has stopped being true of this cabinet:
        // `tall-pantry` is a 400–800 bound now, nine buildable widths, because no appliance stands
        // inside it. The oven tower above still is fixed, for the reason it always was.
        //
        // The rule is still not "match the catalogue row" — `hood-600` below is `fixedWidth: true`
        // beside a `hood` row that is not. What decides it is whether *this* body has more than one
        // width it can be made at, and this one now does.
        //
        // **The owner accepted the §5.4 consequence** (2026-09-01): the seeded pantry becomes a
        // width donor, so shrinking `p6` can hand the width it frees to a neighbour. That is the
        // point of making it resizable rather than a side effect of it.
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
        // A freestanding appliance, not a carcass: it builds no `door_front`, and its two handle
        // bars hang off the appliance's own group. `columnCarcass`'s `true`/`true` therefore
        // offered two sections that could only misfire — and `canHandle` was the live one, because
        // `handle: "push"` reaches `setHandlesVisible(body, false)`, which hides *every* handle mesh
        // in the group and so erased the fridge's own bars. The `fridge-free` catalogue row
        // declares both `false`; this instance is the same builder call and now agrees.
        canFinish: false,
        canHandle: false,
        frameDepthMm: 680,
        frameHeightMm: 1850,
        occupiedDepth: finishesAtMm(FREESTANDING_FRIDGE_FINISHED_DEPTH_MM),
        // **Not cabinetry** (ADR 0058 decision 2's third answer), so `columnCarcass`'s
        // `FOLLOWS_CABINET_DEPTH` is wrong for it: a 680 mm machine is 742 deep in a 600 mm kitchen
        // and 742 in a 700 mm one. Its §7 row says the same thing, and both are swept at both
        // depths rather than either being trusted.
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
        // `wall-2door-600`, `wall-1door-300` and `wall-2door-800` are all 700 mm carcasses — the
        // nominal a wall row is built at, which is why none of them restates it as `frameHeightMm`
        // — so every one of their leaves is a 694 mm band.
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
        // ADR 0066: its own kind, so the priced document does not call it and its top-row twin the
        // same "Corp suspendat" at two different amounts. A name only — it stays structural, keeps
        // its one handle, and `normaliseBand` still puts it in the wall group.
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
        // An open shelf has no door and no drawer: `collectFronts` finds nothing to recolour, so
        // `canFinish: true` from `wallCarcass` made §9 render a *Finisaj* section whose every chip
        // was a no-op. The `open-shelf` catalogue row has declared both `false` all along; this
        // instance is the same body and now says the same thing (capability-parity gate).
        canFinish: false,
        canHandle: false,
        // No front, so unlike its fronted neighbours its seat is the declared wall depth itself
        // rather than that depth less the door-and-handle assembly.
        frameDepthMm: wallCarcassDepthMm(cabinetDepthMm),
        occupiedDepth: shellPlusFrontMm(NO_FRONT_ASSEMBLY_MM),
        ...namedAfterCatalogEquivalent("open-shelf"),
      },
    ],
    [
      "hood-600",
      {
        ...wallCarcass,
        // Front-hung (ADR 0039): fixed against the cabinet front line rather than the wall plane.
        // Still measurable, but to that plane — which is the distinction a boolean would lose.
        seatRule: seatedOnCabinetFrontLine,
        cabinetHandles: NO_CABINET_HANDLES,
        fronts: NO_OPENING_FRONTS,
        kind: EXTRACTOR_HOOD_KIND,
        // A hood is a canopy and a chimney: no front, so nothing for a finish chip to recolour.
        // Same correction as `open-shelf-600` above, matching the `hood` catalogue row.
        canFinish: false,
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
        // ADR 0066, and the reason there are two kinds rather than one: this return differs from
        // `wall-corner-return-570` by its row, and the breakdown line renders no band.
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
        // **Pinned, and the pin is the declaration below rather than this number** (ADR 0058
        // decision 2), so what makes this row hold still is one greppable field and not a constant
        // that has quietly stopped tracking anything. 561 at 600 and 561 at 700.
        //
        // The seat is the pinned **finished** depth less the front assembly, and that is
        // **deliberately not** `wallCarcassSeatDepthMm`'s arithmetic: every other fronted top goes
        // through the wall map first, where 600 maps to a 330 mm carcass and a 291 mm seat. A
        // pinned row skips the map — that is what being pinned means — so the two derivations are
        // different arithmetic over different quantities and only the constant is shared.
        frameDepthMm:
          PINNED_DEEP_TOP_FINISHED_DEPTH_MM - WALL_FRONT_ASSEMBLY_MM,
        depthRule: pinnedAtFinishedDepthMm(
          PINNED_DEEP_TOP_FINISHED_DEPTH_MM,
          "base-formula",
        ),
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
        // Pinned for `wall-2door-600-deep-top`'s reason, and this is the row the decision cost the
        // most argument: over the freestanding fridge it already sits 142 mm recessed at 600, and
        // pinning leaves that **unchanged** at 700 where following its column would have rebuilt it
        // at the fridge's own 742 mm.
        frameDepthMm:
          PINNED_DEEP_TOP_FINISHED_DEPTH_MM - WALL_FRONT_ASSEMBLY_MM,
        depthRule: pinnedAtFinishedDepthMm(
          PINNED_DEEP_TOP_FINISHED_DEPTH_MM,
          "base-formula",
        ),
        frameHeightMm: 750,
        ...namedAfterCatalogEquivalent("wall-cabinet"),
      },
    ],
  ];
}

/** **Every entry states the depth question, or the catalogue does not load** (ADR 0058 decision 2).
 *
 *  The §7 population is a compile error already — `BodyShape.depthRule` is required — but the
 *  *seeded* one is not: `BodyDefinition.depthRule` is optional, for the reason `cabinetHandles` is,
 *  so a seeded row that said nothing would have been read as "does not move" by whatever asked next.
 *  This is where the two populations meet, so it is where the question is asked of both.
 *
 *  Exported for the gate in `cabinet-depth-parameter.test.ts` and deliberately **not** on the
 *  barrel: a caller outside this package has no catalogue of its own to sweep yet. Wave 6J's
 *  migration is the second caller, and it reads the rule rather than merely refusing its absence. */
export function refuseUndeclaredDepthRules(
  entries: readonly (readonly [string, DeclaresADepthRule])[],
): void {
  for (const [buildId, definition] of entries) {
    cabinetDepthRuleOf({ buildId, rule: definition.depthRule });
  }
}

/** What the sweep above reads and nothing more — the same stance `CabinetDepthRuleQuery` takes, and
 *  it is what lets the gate hand it a row that declares nothing without assembling a whole
 *  `BodyDefinition` around the one field under test. Every catalogue entry satisfies it. */
interface DeclaresADepthRule {
  readonly depthRule?: CabinetDepthRule;
}

/** **Every entry states which plane seats it, or the catalogue does not load** (ADR 0077).
 *
 *  The same two-population split `refuseUndeclaredDepthRules` handles, for the same reason and at
 *  the same moment: `BodyShape.seatRule` is required so §7 is a compile error, but a *seeded* row
 *  that said nothing would have been read as `wall-plane` by whatever asked next — and that silent
 *  reading is the whole of ADR 0077's defect. `base-corner-x-900` is a seeded row. */
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
  // The same stance one declaration over (ADR 0070, wave 6S): `carriesFronts` refuses a
  // contradictory rule where it is written, and this refuses one that arrived through the
  // `BodyCatalog` port without passing a constructor — which is also the only caller that has the
  // row's id to name.
  refuseContradictoryFrontDeclarations(entries);
  return new Map<string, BodyDefinition>(entries);
}

/** That catalogue at the depth the kitchen is declared at today — **the one materialisation**, and
 *  what every reader M6 has not yet given a setting to still uses. */
export const KITCHEN_L_BODY_CATALOG: BodyCatalog =
  buildKitchenLBodyCatalog(WORKTOP_DEPTH_MM);

function placement(
  id: string,
  wall: "A" | "B",
  alongMm: number,
  y0Mm: number,
  buildId: string,
  widthMm: number,
  heightMm: number,
): DesignPlacement {
  return { id, wall, alongMm, y0Mm, body: { buildId, widthMm, heightMm } };
}

export const KITCHEN_L_PLACEMENTS: readonly DesignPlacement[] = [
  placement("p0", "A", 1300, 0, "base-sink-800", 800, 820),
  placement("p1", "A", 2000, 0, "base-dishwasher-600", 600, 820),
  // ADR 0027: one body, not a cabinet plus an accessory standing on it. `p3` is gone and its id is
  // not reused — ids are persisted, and a freed id that reappears meaning something else is worse
  // than a gap in the sequence.
  placement("p2", "A", 2600, 0, "base-hob-2drawer-600", 600, 820),
  placement("p4", "A", 3200, 0, "base-drawer3-600", 600, 820),
  // ADR 0025. Appended ids, out of positional order on purpose: `p0`…`p24` are persisted in real
  // designs, so renumbering the base row to seat the corner at its head would rewrite saved data.
  placement("p25", "A", 450, 0, "base-corner-x-900", 900, 820),
  placement("p26", "B", 740, 0, "base-corner-return-320", 320, 820),
  placement("p5", "B", 1200, 0, "tall-oven-tower-600", 600, 2200),
  placement("p6", "B", 1800, 0, "tall-pantry-600", 600, 2200),
  placement("p7", "B", 2450, 0, "fridge-free-700", 700, 1850),
  placement("p8", "A", 300, 1500, "wall-2door-600", 600, 700),
  placement("p9", "B", 615, 1500, "wall-corner-return-570", 570, 700),
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
  placement("p21", "B", 615, 2200, "wall-corner-return-570-top", 570, 400),
  placement("p22", "B", 1200, 2200, "wall-2door-600-deep-top", 600, 400),
  placement("p23", "B", 1800, 2200, "wall-2door-600-deep-top", 600, 400),
  placement("p24", "B", 2450, 1850, "wall-2door-700-over-fridge", 700, 750),
];

/** Wall B's declared length, and the **one number in this room that is not a measurement**.
 *
 *  ADR 0083 decision 1. The design reference's wall-coverage panel gives wall B as 2830 mm, landed
 *  on 2026-09-03 and corroborated against built geometry to the millimetre. The demo declares
 *  **2920** instead, which moves it 90 mm *away* from the kitchen it was measured from, on purpose:
 *  the seeded run's intended end at the 700 mm cabinet depth is 2900, and at 2830 the demo would
 *  overrun by 70 mm and wear ADR 0065's overflow marking on the design the app opens with.
 *
 *  **The owner's clearance band is 20–50 mm past that 2900 end.** 2920 spends 20 of it. A later
 *  wave wanting 2930 or 2950 is making a fixture adjustment inside a ruled range and needs no
 *  ruling; 2900 (a flush fit, which the gate would accept — equality fits) or 3000 is outside the
 *  band and is a new question for the owner.
 *
 *  **A later reader must not "correct" this back to 2830.** The bar's two denominators are not the
 *  same kind of number — wall A's 3560 is the reference's own and wall B's length does not move it,
 *  so one is measured and one is chosen. */
const WALL_B_LENGTH_MM = 2920;

export const KITCHEN_L_DESIGN: Design = {
  // ADR 0065 §2: the two wall runs the design reference's wall-coverage panel gives — wall A
  // 3560 mm (3520 occupied, 40 free at the run end) and wall B 2800 occupied. Wall A corroborates
  // against the built tree: its placements end at 3500 plus the run-end panel's 18 mm and its 1 mm
  // gap, the 3519 `kitchen-shell.ts` names in its own comment. Wall B's run ends at 2800 exactly at
  // the 600 mm cabinet depth and at 2900 at the 700 mm one, inside the length above. The room read
  // `3600 × 2400` until 2026-09-03, and the 2400 in particular was what made the along-wall bound
  // take the longer run.
  room: {
    shape: "L",
    widthMm: 3560,
    depthMm: WALL_B_LENGTH_MM,
    heightMm: 2600,
  },
  presetId: null,
  settings: { cabinetDepthMm: WORKTOP_DEPTH_MM },
  placements: [...KITCHEN_L_PLACEMENTS],
  createdAt: "2026-08-25T00:00:00.000Z",
  updatedAt: "2026-08-25T00:00:00.000Z",
};

/** How far past the end of its own wall a body in `OVERFLOWING_KITCHEN_L_DESIGN` reaches.
 *
 *  One millimetre is the smallest overrun the wire schema can express — `alongMm` and `widthMm` are
 *  integers — so the fixture demonstrates ADR 0065's marking at the boundary the gate is written
 *  against rather than at a comfortable distance from it. Equality fits (ADR 0083 decision 3), so
 *  zero would report nothing. */
const PAST_WALL_END_MM = 1;

/** A body declared by **which wall it overruns and what it is**, never by where it stands. */
type OverflowingBody = Pick<DesignPlacement, "id" | "wall" | "body">;

/** The overflowing population, declared as data. Each entry's seat is derived from the room by
 *  `seatedPastItsWall`, so the population follows a room change instead of being re-measured once
 *  per reader — which is how six hand-written copies stayed in agreement only by luck. */
const OVERFLOWING_POPULATION: readonly OverflowingBody[] = [
  {
    id: "dragged-past-wall-b",
    wall: "B",
    body: { buildId: "base-sink-800", widthMm: 800, heightMm: 820 },
  },
];

/** The seeded kitchen with one body standing one millimetre past the end of wall B, and nothing
 *  else changed. Its only diagnostic is `PLACEMENT_PAST_WALL_END`.
 *
 *  **ADR 0083 decision 10: one declared fixture, not six hand-built copies.** This shape was written
 *  out in six test files and agreed everywhere only because the six were written together. The scene
 *  mark, the warning band, the loading gate, the API seam and 6N-c's visual gate all read this one.
 *
 *  It follows the room: at 2830 the body seated at 2431 and at 2920 it seats at 2521, one
 *  millimetre past the wall in both, so a room change never silently stops it overflowing. */
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

/** The seeded kitchen in a room whose **wall A is declared narrower than the run standing on it** —
 *  the second reachable overflow shape, and the one ADR 0065 was actually written from: a room
 *  measured smaller than its kitchen, which M7's room control makes reachable.
 *
 *  **Nothing moves.** Only `room.widthMm` changes, so a capture of this design and one of
 *  `KITCHEN_L_DESIGN` are the same scene and whatever differs between them *is* the mark. A fixture
 *  that added a body instead cannot tell a wash from the cabinet it just added.
 *
 *  **2800 rather than any narrower value**, because the six bodies it marks stand in the middle of
 *  the overview camera preset. A narrower room marks bodies past the right edge of the frame, where
 *  the mark renders perfectly and photographs as nothing. */
export const NARROWED_ROOM_OVERFLOWING_DESIGN: Design = {
  ...KITCHEN_L_DESIGN,
  room: { ...KITCHEN_L_DESIGN.room, widthMm: 2800 },
};
