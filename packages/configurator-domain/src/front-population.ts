// What a body's fronts are, told apart: how many open on hinges, how many pull out on runners, and how
// tall each door band is (ADR 0070 prices hinges by door leaf, runners by drawer, and a third hinge on
// any leaf taller than 900 mm).
//
// Declared per catalogue entry, because the domain has no meshes to inspect (ADR 0061 decision 3). A
// door band's height is not the frame height: `tallPantry` draws 1290 mm and 790 mm bands inside a
// 2200 mm frame. `front-population.parity.test.ts` in `@lemnaria/three-adapter` holds every declaration
// to the slabs actually built. This module declares; it does not price.
import { deriveDoorCount } from "./door-count.js";

/** Where a body's door-band heights come from.
 *
 *  - `declared-heights`: the builder draws bands of fixed height at every width (`tallPantry`'s 1290 and
 *    790); every seeded row is one of these (ADR 0011 Gap A).
 *  - `one-band-under-frame`: a `heightFlex` row whose single band is the frame height less a fixed inset
 *    (`wallCabinet`: 694 mm in a 700 mm cabinet, 394 in a 400). */
export type DoorBandsRule =
  | {
      readonly measuredFrom: "declared-heights";
      readonly bandHeightsMm: readonly number[];
    }
  | {
      readonly measuredFrom: "one-band-under-frame";
      readonly frameInsetMm: number;
    };

/** What fills a body's front, declared per catalogue entry: never inferred from a `kind` (`base-hob-oven`
 *  and `base-3drawer` are both `base_cabinet`) nor from a handle edge (`doorSlab(…, "top")` covers
 *  drawers and doors below the worktop alike). see ADR 0061
 *
 *  - `declared-leaves`: the leaf population is fixed at every width (`base-sink`: one band of two).
 *  - `leaves-follow-width`: a `doorCountFollowsWidth` row whose leaves per band come from
 *    `deriveDoorCount` (`tall-pantry`: two bands, so two leaves at 400 mm and four at 600).
 *
 *  `drawers` is a plain count in both: no builder decides a drawer count from a width. */
export type FrontPopulationRule =
  | {
      readonly countedFrom: "declared-leaves";
      readonly doorBands: DoorBandsRule;
      readonly leavesPerBand: number;
      readonly drawers: number;
    }
  | {
      readonly countedFrom: "leaves-follow-width";
      readonly doorBands: DoorBandsRule;
      readonly drawers: number;
    };

// The band heights the builders draw, written down once here because both catalogue populations (§7's
// rows and the seeded instances) declare them. Each is held to the built slab by
// `front-population.parity.test.ts` in `@lemnaria/three-adapter`.

/** The door band a base carcass carries: its 720 mm carcass less the 10 mm shadow gap `baseCabinet`
 *  leaves the worktop and plinth. The same at every width and cabinet depth. */
export const BASE_DOOR_BAND_HEIGHT_MM = 710;

/** The pantry's bands: `tallPantry` draws 1290 and 790 inside a 2200 mm frame, which do not sum to its
 *  height (the plinth and rails take the difference), so the frame height must not be read as a band.
 *  Order is not read: a hinge rule asks a height, never a position. */
export const PANTRY_DOOR_BAND_HEIGHTS_MM: readonly number[] = [1290, 790];

/** The oven tower's two cabinet leaves, one under the oven and one over the microwave, in the same 2200 mm
 *  frame; the appliance fascias between them are not door bands (ADR 0061 decision 2). */
export const OVEN_TOWER_DOOR_BAND_HEIGHTS_MM: readonly number[] = [500, 500];

/** The integrated fridge housing's three leaves, bottom to top: the fridge door, the freezer door
 *  above it, and the top box's flap. */
export const FRIDGE_HOUSING_DOOR_BAND_HEIGHTS_MM: readonly number[] = [
  1350, 530, 190,
];

/** How much shorter a wall carcass's leaf is than the carcass: a 3 mm shadow gap at top and bottom
 *  (`wallCabinet` and `wallLift` build `H - 0.006`). */
export const WALL_DOOR_BAND_INSET_MM = 6;

/** A wall carcass's door band at a frame height (694 in a 700 mm cabinet, 744 in the 750 mm box over the
 *  fridge), so the seeded wall rows and the `heightFlex` rule that reproduces them share one arithmetic. */
export function wallDoorBandHeightMm(frameHeightMm: number): number {
  return frameHeightMm - WALL_DOOR_BAND_INSET_MM;
}

/** Bands of fixed height; order is irrelevant (the parity gate compares them as a multiset). Copied and
 *  frozen here, once: `readonly` is compile-time only and `BodyCatalog` is reachable from plain
 *  JavaScript, so a caller's `.sort()` would otherwise reorder a module constant for the whole process. */
export function doorBandsMm(bandHeightsMm: readonly number[]): DoorBandsRule {
  return {
    measuredFrom: "declared-heights",
    bandHeightsMm: Object.freeze([...bandHeightsMm]),
  };
}

/** One band as tall as the opening made it, less this inset. The `heightFlex` rows' shape. */
export function oneBandInsetFromFrameMm(frameInsetMm: number): DoorBandsRule {
  return { measuredFrom: "one-band-under-frame", frameInsetMm };
}

/** A body with no door band: an open shelf, a hood, a freestanding fridge, a drawer stack, a structural
 *  corner return, and `base-hob-oven` (its one front is a fixed facade). Named so it reads as a
 *  statement, not an empty list somebody forgot to fill. */
export const NO_DOOR_BANDS: DoorBandsRule = doorBandsMm([]);

/** Leaves per band for a body with no band: there is no band for a leaf to stand in, not a blank count. */
const NO_LEAVES_PER_BAND = 0;

/** A body with no drawer. */
export const NO_DRAWERS = 0;

/** Everything an entry has to answer about its fronts, so no row can answer two of the three questions
 *  and stay silent on the third. */
export interface DeclaredFronts {
  readonly doorBands: DoorBandsRule;
  readonly leavesPerBand: number;
  readonly drawers: number;
}

/** A body whose front population is fixed at every width it is built to. Throws at construction on a
 *  contradiction: bands with zero leaves per band would price no hinges on a visible door, and leaves
 *  with no bands are the mirror. `(no bands, no leaves)` is `NO_OPENING_FRONTS`, not a contradiction. */
export function carriesFronts(fronts: DeclaredFronts): FrontPopulationRule {
  refuseContradiction({
    bands: declaredBandCount(fronts.doorBands),
    leavesPerBand: fronts.leavesPerBand,
    doorBands: fronts.doorBands,
  });
  return {
    countedFrom: "declared-leaves",
    doorBands: fronts.doorBands,
    leavesPerBand: fronts.leavesPerBand,
    drawers: fronts.drawers,
  };
}

/** How many bands a rule declares, statically, so a contradiction is caught at declaration rather than
 *  at query time. */
function declaredBandCount(doorBands: DoorBandsRule): number {
  return doorBands.measuredFrom === "declared-heights"
    ? doorBands.bandHeightsMm.length
    : ONE_BAND;
}

/** A `one-band-under-frame` row is exactly one band whatever frame it is asked about. */
const ONE_BAND = 1;

function refuseContradiction(declared: {
  readonly bands: number;
  readonly leavesPerBand: number;
  readonly doorBands: DoorBandsRule;
  readonly buildId?: string;
}): void {
  const bandsButNoLeaves = declared.bands > 0 && declared.leavesPerBand === 0;
  const leavesButNoBands = declared.bands === 0 && declared.leavesPerBand > 0;
  if (bandsButNoLeaves || leavesButNoBands) {
    throw new ContradictoryFrontDeclarationError(declared);
  }
}

/** A declaration whose two halves disagree: both numbers are present and usable but describe a body that
 *  cannot exist, unlike `UndeclaredFrontPopulationError`. `buildId` is optional because a constructor
 *  has no row id (`carriesFronts` throws with the band rule printed); the catalogue-assembly sweep has
 *  the row and names it. */
export class ContradictoryFrontDeclarationError extends Error {
  constructor(declared: {
    readonly bands: number;
    readonly leavesPerBand: number;
    readonly doorBands: DoorBandsRule;
    readonly buildId?: string;
  }) {
    super(
      `Contradictory front declaration${describeRow(declared.buildId)}: ` +
        `${String(declared.bands)} door band(s) against ` +
        `${String(declared.leavesPerBand)} leaves per band. ` +
        `One is zero and the other is not, so the body has a door nothing opens ` +
        `or a leaf standing in no band. Bands: ${JSON.stringify(declared.doorBands)}.`,
    );
    this.name = "ContradictoryFrontDeclarationError";
  }
}

function describeRow(buildId: string | undefined): string {
  return buildId === undefined ? "" : ` for buildId "${buildId}"`;
}

/**
 * The port half of the refusal above, which can name the row: `BodyCatalog` is a port, so a definition
 * assembled outside TypeScript reaches no `carriesFronts`. `buildKitchenLBodyCatalog` runs this over
 * both populations as the map is assembled. A missing or unrecognised rule is not refused here: that
 * is `UndeclaredFrontPopulationError` at query time, and refusing it here would fail the catalogue
 * load for a row nothing had asked about yet.
 */
export function refuseContradictoryFrontDeclarations(
  entries: readonly (readonly [string, DeclaresFronts])[],
): void {
  for (const [buildId, definition] of entries) {
    const rule = definition.fronts;
    if (!isRecognisedRule(rule) || !isRecognisedBands(rule.doorBands)) continue;
    refuseContradiction({
      bands: declaredBandCount(rule.doorBands),
      leavesPerBand:
        rule.countedFrom === "leaves-follow-width"
          ? LEAVES_FOLLOW_THE_WIDTH
          : rule.leavesPerBand,
      doorBands: rule.doorBands,
      buildId,
    });
  }
}

function isRecognisedRule(
  rule: FrontPopulationRule | undefined,
): rule is FrontPopulationRule {
  return (
    rule?.countedFrom === "declared-leaves" ||
    rule?.countedFrom === "leaves-follow-width"
  );
}

function isRecognisedBands(bands: DoorBandsRule | undefined): boolean {
  return (
    bands?.measuredFrom === "declared-heights" ||
    bands?.measuredFrom === "one-band-under-frame"
  );
}

/** A body whose only fronts are drawers: a pan bank, a three-drawer base, a bottle cargo's pull-out. */
export function carriesDrawers(drawers: number): FrontPopulationRule {
  return carriesFronts({
    doorBands: NO_DOOR_BANDS,
    leavesPerBand: NO_LEAVES_PER_BAND,
    drawers,
  });
}

/** A body with nothing that opens: an open shelf, a hood, a freestanding appliance, a structural corner
 *  return, and the hob-and-oven base whose single front is a facade. */
export const NO_OPENING_FRONTS: FrontPopulationRule =
  carriesDrawers(NO_DRAWERS);

/** A row whose leaves per band follow its width through `deriveDoorCount` and which carries no drawer.
 *  No built body mixes width-derived leaves with drawers, so no `countedFrom` arm carries both. */
export function doorLeavesFollowWidth(
  doorBands: DoorBandsRule,
): FrontPopulationRule {
  // The same contradiction on this arm: `deriveDoorCount` always answers at least one leaf, so a body
  // with no band has nowhere for it to stand.
  refuseContradiction({
    bands: declaredBandCount(doorBands),
    leavesPerBand: LEAVES_FOLLOW_THE_WIDTH,
    doorBands,
  });
  return { countedFrom: "leaves-follow-width", doorBands, drawers: NO_DRAWERS };
}

/** What a width-following row contributes to the contradiction check: `deriveDoorCount` never answers
 *  zero, so any positive stand-in says this row expects bands to put leaves in. */
const LEAVES_FOLLOW_THE_WIDTH = 1;

/** Every rule field a refusal can name; a literal union so a typo in a message is a compile error. Two
 *  are millimetre lengths (`bandHeightsMm`, `frameInsetMm`) and two are counts; they share one validator
 *  because they share one shape of unusable. */
export type FrontPopulationField =
  | "leavesPerBand"
  | "drawers"
  | "bandHeightsMm"
  | "frameInsetMm";

/** A catalogue entry that declares nothing usable about its fronts: a programming error, not a number to
 *  guess at. A fallback to zero would price no hinges, and a fallback to the frame height would put a
 *  third hinge on a pantry's 790 mm door, and neither is visible in a scene. `missingField` names which
 *  number was not there. see ADR 0061 decision 4 */
export class UndeclaredFrontPopulationError extends Error {
  constructor(refusal: {
    readonly buildId: string;
    readonly declared: unknown;
    /** The rule field that held no usable value, on a rule whose tag was recognised. */
    readonly missingField?: FrontPopulationField;
  }) {
    super(
      `No front population declared for buildId "${refusal.buildId}". ` +
        describeMissing(refusal.missingField) +
        `Found: ${describeDeclared(refusal.declared)}.`,
    );
    this.name = "UndeclaredFrontPopulationError";
  }
}

function describeMissing(
  missingField: FrontPopulationField | undefined,
): string {
  if (missingField === undefined) return "";
  return `Its rule declares no usable "${missingField}". `;
}

function describeDeclared(declared: unknown): string {
  return declared === undefined ? "nothing" : JSON.stringify(declared);
}

/** What the three queries below need: the declaration, the two dimensions a rule may be relative to, and
 *  the id a refusal names. `rule` is typed wider than `BodyDefinition` declares it: `BodyCatalog` is a
 *  port, so a definition from outside TypeScript can arrive with no rule, which must be refused. */
export interface FrontPopulationQuery {
  readonly buildId: string;
  readonly rule: FrontPopulationRule | undefined;
  /** The width the body is built to — what a `leaves-follow-width` rule is relative to. */
  readonly widthMm: number;
  /** The frame height the body is built to — what a `one-band-under-frame` rule is relative to.
   *  Ignored by a rule that declares its band heights, which is every seeded row. */
  readonly frameHeightMm: number;
}

/** What this module reads off a placement's body. Structural, not an import of `CabinetBody`:
 *  `void-engine.ts` imports this module for `FrontPopulationRule`, so an import back would be a cycle. */
export interface PlacedBody {
  readonly buildId: string;
  readonly widthMm: number;
  readonly heightMm: number;
}

/** What this module reads off a catalogue entry; structural for `PlacedBody`'s reason. */
export interface DeclaresFronts {
  readonly fronts?: FrontPopulationRule;
}

/**
 * The query, built from the placement rather than by hand. `frameHeightMm` is the built height (the
 * placement's own, as handed to `buildCatalogBody`); reading `definition.nominalHeightMm` instead is
 * wrong, because one `wall-cabinet` entry declares 700 while its placements are built at 400, 700 and
 * 750. Nothing in the shipped catalogue catches that: no seeded rule reads `frameHeightMm`, and today
 * every `heightFlex` band stays under the 900 mm hinge threshold.
 */
export function frontPopulationQueryFor(placed: {
  readonly body: PlacedBody;
  readonly definition: DeclaresFronts;
}): FrontPopulationQuery {
  return {
    buildId: placed.body.buildId,
    rule: placed.definition.fronts,
    widthMm: placed.body.widthMm,
    frameHeightMm: placed.body.heightMm,
  };
}

/** The height of each door leaf this body carries, one entry per leaf: the list ADR 0070's 900 mm hinge
 *  rule is applied over. A pantry at 600 mm answers `[1290, 1290, 790, 790]`. Callers must not rebuild
 *  the band-to-leaf pairing themselves: applying the threshold to the bands instead counts 45 hinges on
 *  the seeded kitchen against the correct 74. Band-major, as the builders stack them. */
export function doorLeafHeightsMm(
  query: FrontPopulationQuery,
): readonly number[] {
  const leavesPerBand = leavesPerBandOf(query);
  return doorBandHeightsMm(query).flatMap((bandHeightMm) =>
    Array.from<number>({ length: leavesPerBand }).fill(bandHeightMm),
  );
}

/** How many door leaves this body carries at this size: the length of the list above, so count and heights
 *  cannot come apart. A drawer is not a leaf. Fails closed: a query whose entry declares nothing throws. */
export function doorLeafCount(query: FrontPopulationQuery): number {
  return doorLeafHeightsMm(query).length;
}

/** How many drawers this body carries: the quantity ADR 0070's runner rule is counted over. Its
 *  precondition is deliberately weaker than `doorLeafCount`'s: it reads only `drawers`, so a row with a
 *  broken band list still answers a drawer count, since a drawer has no band. */
export function drawerCount(query: FrontPopulationQuery): number {
  const rule = recognisedRuleOf(query);
  return usableCountOf(query, rule.drawers, "drawers");
}

/** How many fronts of this body open: its door leaves and its drawers. The quantity a push-to-open latch is billed
 *  over, one per front, and zero for a body with nothing that opens (an open shelf). */
export function openingFrontCount(query: FrontPopulationQuery): number {
  return doorLeafCount(query) + drawerCount(query);
}

/** How tall each of this body's door bands is, in millimetres, one entry per band. Not the frame height
 *  (`tall-pantry` declares 1290 and 790 inside 2200). A body with nothing that opens answers an empty
 *  list, which is an answer and not a refusal. */
export function doorBandHeightsMm(
  query: FrontPopulationQuery,
): readonly number[] {
  const bands = declaredBandsOf(query);
  switch (bands?.measuredFrom) {
    case "declared-heights":
      return usableBandHeightsOf(query, bands.bandHeightsMm);
    case "one-band-under-frame":
      return [
        buildableBandHeightMm(
          query,
          query.frameHeightMm -
            usableCountOf(query, bands.frameInsetMm, "frameInsetMm"),
        ),
      ];
    default:
      throw new UndeclaredFrontPopulationError({
        buildId: query.buildId,
        declared: query.rule,
      });
  }
}

/** The band rule a recognised declaration carries, typed as possibly absent although the rule requires
 *  it: a definition arriving through the `BodyCatalog` port with a recognised `countedFrom` and no
 *  `doorBands` must reach a refusal, not crash on `undefined`. */
function declaredBandsOf(
  query: FrontPopulationQuery,
): DoorBandsRule | undefined {
  return recognisedRuleOf(query).doorBands;
}

/** How many leaves stand in one of this body's bands: declared, or derived from the width by `deriveDoorCount`. */
function leavesPerBandOf(query: FrontPopulationQuery): number {
  const rule = recognisedRuleOf(query);
  if (rule.countedFrom === "leaves-follow-width") {
    return deriveDoorCount(query.widthMm);
  }
  return usableCountOf(query, rule.leavesPerBand, "leavesPerBand");
}

/** The declaration, or a refusal naming the row. A rule that is missing, `null` or tagged with an unknown
 *  `countedFrom` is refused here; a recognised rule carrying no usable number is refused by `usableCountOf`. */
function recognisedRuleOf(query: FrontPopulationQuery): FrontPopulationRule {
  switch (query.rule?.countedFrom) {
    case "declared-leaves":
    case "leaves-follow-width":
      return query.rule;
    default:
      throw new UndeclaredFrontPopulationError({
        buildId: query.buildId,
        declared: query.rule,
      });
  }
}

/** A band a `one-band-under-frame` row's frame height produced, held to being a door somebody could hang.
 *  Not a declaration check: the frame height is the caller's input, and a frame shorter than the inset
 *  would otherwise yield a zero or negative band read as a leaf under 900 mm, silently wrong. */
function buildableBandHeightMm(
  query: FrontPopulationQuery,
  bandHeightMm: number,
): number {
  if (isDoorBandHeightMm(bandHeightMm)) return bandHeightMm;
  throw new UnbuildableDoorBandError({
    buildId: query.buildId,
    frameHeightMm: query.frameHeightMm,
    bandHeightMm,
  });
}

/** A body whose frame height leaves no door band to build. See `buildableBandHeightMm`. */
export class UnbuildableDoorBandError extends Error {
  constructor(refusal: {
    readonly buildId: string;
    readonly frameHeightMm: number;
    readonly bandHeightMm: number;
  }) {
    super(
      `Frame height ${String(refusal.frameHeightMm)} mm leaves buildId ` +
        `"${refusal.buildId}" a ${String(refusal.bandHeightMm)} mm door band, ` +
        `which is not a door.`,
    );
    this.name = "UnbuildableDoorBandError";
  }
}

function usableBandHeightsOf(
  query: FrontPopulationQuery,
  declaredHeights: unknown,
): readonly number[] {
  if (isDoorBandHeightList(declaredHeights)) return declaredHeights;
  throw new UndeclaredFrontPopulationError({
    buildId: query.buildId,
    declared: query.rule,
    missingField: "bandHeightsMm",
  });
}

/** Every entry a positive whole number of millimetres; an empty list passes (a hood has no door band). */
function isDoorBandHeightList(
  declared: unknown,
): declared is readonly number[] {
  if (!Array.isArray(declared)) return false;
  const heights: readonly unknown[] = declared;
  return heights.every(isDoorBandHeightMm);
}

function isDoorBandHeightMm(declaredHeightMm: unknown): boolean {
  return (
    typeof declaredHeightMm === "number" &&
    Number.isSafeInteger(declaredHeightMm) &&
    declaredHeightMm > 0
  );
}

/** A number a recognised rule is made of, held to being whole, non-negative and exact: a leaf count, a
 *  drawer count or a millimetre inset. `0` passes (a hood carries no drawer). Typed `unknown` because
 *  the `BodyCatalog` port cannot guarantee the declared `number`. */
function usableCountOf(
  query: FrontPopulationQuery,
  declaredCount: unknown,
  field: FrontPopulationField,
): number {
  if (
    typeof declaredCount === "number" &&
    Number.isSafeInteger(declaredCount) &&
    declaredCount >= 0
  ) {
    return declaredCount;
  }
  throw new UndeclaredFrontPopulationError({
    buildId: query.buildId,
    declared: query.rule,
    missingField: field,
  });
}
