// **What a body's fronts are, told apart** — how many of them open on hinges, how many pull out on
// runners, and how tall each door band is.
//
// ADR 0070 prices hardware **per mechanism**: hinges by door leaf, runners by drawer, and a third
// hinge on any leaf taller than 900 mm. None of those three numbers is reachable from what the
// catalogue declared before this module existed. `cabinetHandles` is **one** number covering two
// different things — `base-3drawer` declares `carriesHandles(3)` and `base-sink` declares
// `carriesHandles(2)`, and nothing in either says which are drawers — and no entry declares a door
// band's height at all, only the placement's overall frame height. `tallPantry`
// (`kitchen-parts.ts`) draws bands of **1290 mm and 790 mm** inside a 2200 mm frame, so a naive read
// of the frame height would put three hinges on a 790 mm door.
//
// **Declared per entry, and forced to be** (ADR 0061 decision 3, §12), exactly as `cabinet-handles.ts`
// is: pricing is a pure domain query, the domain has no meshes to look at, and telling a drawer
// front from a door leaf inspects geometry. So the domain cannot count fronts; it can only read
// numbers the catalogue states. What keeps them honest is a three-adapter parity gate holding every
// declaration to the slabs actually built (`front-population.parity.test.ts`), ADR 0028's remedy for
// two numbers agreeing by luck.
//
// **This module declares; it does not price.** The 900 mm hinge threshold, the runner count and the
// push-to-open rule are ADR 0070's and belong to the wave that builds them. A declaration and its
// first consumer in one diff is how two numbers come to agree by luck.
import { deriveDoorCount } from "./door-count.js";

/** **Where a body's door-band heights come from.** Two shapes, because the shipped builders come in
 *  two kinds and no more:
 *
 *  - **`declared-heights`** — the builder draws bands of fixed height whatever it is built to.
 *    `tallPantry`'s two bands are 1290 and 790 at every width, `tall-fridge-housing`'s three are
 *    1350, 530 and 190, and every seeded row is one of these by construction (ADR 0011 Gap A: one
 *    already-built body at one size).
 *  - **`one-band-under-frame`** — a `heightFlex` row, whose single band is however tall the opening
 *    made it, less a fixed inset. `wallCabinet` builds its leaves `WALL_DOOR_BAND_INSET_MM` shorter
 *    than the carcass it is given, so the band is 694 mm in a 700 mm cabinet and 394 in a 400. */
export type DoorBandsRule =
  | {
      readonly measuredFrom: "declared-heights";
      readonly bandHeightsMm: readonly number[];
    }
  | {
      readonly measuredFrom: "one-band-under-frame";
      readonly frameInsetMm: number;
    };

/** **What fills a body's front, declared per catalogue entry** — never inferred from a `kind` (ADR
 *  0061's rejected alternative: `base-hob-oven` and `base-3drawer` are both `base_cabinet`), and
 *  never from a handle edge. `doorSlab(…, "top")` is a *handle placement*, and the builder's own
 *  comment says `"top"` covers "drawers, **and doors below the worktop**": `bottleCargo`, the
 *  dishwasher's decor door and the oven tower's lower leaf all take it, and `wall-lift`'s single
 *  flap takes `"bottom"`. Inferring drawer-ness from that field is ADR 0061's `kind`-is-not-enough
 *  mistake one field over.
 *
 *  Two shapes, mirroring `CabinetHandleRule`'s own two:
 *
 *  - **`declared-leaves`** — the body's leaf population is fixed at every width. `base-sink` is one
 *    band of two leaves at 600 mm and at 800.
 *  - **`leaves-follow-width`** — a row that declares `doorCountFollowsWidth`, whose leaves per band
 *    are decided at build time by `deriveDoorCount`. `tall-pantry` stacks two bands of such leaves,
 *    so it carries two leaves at 400 mm and four at 600.
 *
 *  `drawers` is a plain count in both, because no shipped builder decides a drawer count from a
 *  width — three drawers are three drawers at 300 mm and at 800. */
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

// **The band heights the builders draw, written down once.** They live here rather than in
// `catalog.ts` because both catalogue populations declare them — §7's parameterised rows and
// M2's seeded instances, which are the same builders called at one size (ADR 0011 Gap A) — and a
// second copy in the fixture is the pair-agreeing-by-luck defect ADR 0028 exists to stop. Every
// one of them is held to the built slab by `front-population.parity.test.ts` in
// `@lemnaria/three-adapter`.

/** **The door band a base carcass carries** — its 720 mm carcass less the 10 mm of shadow gap
 *  `baseCabinet` leaves the worktop and the plinth. The same 710 at every width and at every cabinet
 *  depth: a base body's height is fixed at the worktop line, so nothing about the setting moves it.
 *
 *  Declared here and held to the built slab by `front-population.parity.test.ts` in
 *  `@lemnaria/three-adapter`, which is the whole reason a number the builders own may be written
 *  down in the domain at all (ADR 0061 decision 3, ADR 0028's remedy). */
export const BASE_DOOR_BAND_HEIGHT_MM = 710;

/** ADR 0048's pantry, and **the pair of numbers that makes this declaration necessary at all**:
 *  `tallPantry` draws bands of 1290 and 790 inside a 2200 mm frame. They do not sum to the body's
 *  height — the plinth and the carcass rails take the difference — so a reader of `heightMm` would
 *  put ADR 0070's third hinge on the 790 mm door. The band order is the builder's own and is not
 *  read: a hinge rule asks a height, never a position. */
export const PANTRY_DOOR_BAND_HEIGHTS_MM: readonly number[] = [1290, 790];

/** The oven tower's two **cabinet** leaves — one under the oven, one over the microwave — inside the
 *  same 2200 mm frame. The oven's and the microwave's own fascias stand between them and are not
 *  door bands, for the reason their bars are not cabinet handles (ADR 0061 decision 2). */
export const OVEN_TOWER_DOOR_BAND_HEIGHTS_MM: readonly number[] = [500, 500];

/** The integrated fridge housing's three leaves, bottom to top: the fridge door, the freezer door
 *  above it, and the top box's flap. */
export const FRIDGE_HOUSING_DOOR_BAND_HEIGHTS_MM: readonly number[] = [
  1350, 530, 190,
];

/** How much shorter a wall carcass's leaf is than the carcass itself — the 3 mm shadow gap it
 *  leaves at the top and at the bottom. `wallCabinet` builds `H - 0.006` and `wallLift` the same,
 *  which is what `one-band-under-frame` states without pinning the height those rows are built to. */
export const WALL_DOOR_BAND_INSET_MM = 6;

/** A wall carcass's door band at a given frame height — 694 in a 700 mm cabinet, 394 in a 400 mm
 *  one, 744 in the 750 mm box over the fridge. Written once and read by every seeded wall row, so
 *  the already-built bodies and the `heightFlex` rule that reproduces them share one arithmetic
 *  rather than agreeing by luck. */
export function wallDoorBandHeightMm(frameHeightMm: number): number {
  return frameHeightMm - WALL_DOOR_BAND_INSET_MM;
}

/** Bands of fixed height, top-to-bottom order irrelevant: the gate compares them as a multiset,
 *  because what a hinge rule reads is a height and not a position.
 *
 *  **Copied and frozen, once, here.** `doorBandHeightsMm` used to hand its caller the very array a
 *  row declared — `doorBandHeightsMm(pantryQuery) === PANTRY_DOOR_BAND_HEIGHTS_MM` — and `readonly`
 *  is a compile-time promise this port cannot rely on: `BodyCatalog` is reachable from plain
 *  JavaScript, so one caller's `.sort()` reordered a module constant for the rest of the process.
 *  Fixed at declaration rather than per query, so the rule owns an array nothing else holds and no
 *  query allocates. */
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

/** **A body with no door band at all** — an open shelf, a hood, a freestanding fridge, a drawer
 *  stack, a structural corner return, and `base-hob-oven`, whose one front is a fixed facade that
 *  opens nothing. Named rather than written as a bare `doorBandsMm([])`, so the declaration reads
 *  as a statement about the product instead of as an empty list somebody forgot to fill in, exactly
 *  as `NO_FRONT_ASSEMBLY_MM` and `NO_CABINET_HANDLES` do for their own fields. */
export const NO_DOOR_BANDS: DoorBandsRule = doorBandsMm([]);

/** What a body with no door band declares for its leaves-per-band. **Not "one leaf that is
 *  missing"** — there is no band for a leaf to stand in, so the multiplication is over nothing.
 *  Named so a reader does not read the zero as a count that was left blank. */
const NO_LEAVES_PER_BAND = 0;

/** A body with no drawer. Named for `NO_DOOR_BANDS`' reason. */
export const NO_DRAWERS = 0;

/** Everything an entry has to answer about its fronts, in one place so no row can answer two of the
 *  three questions and stay silent on the third — the DOM-002 shape, where four families inherited a
 *  depth nobody had decided for them. */
export interface DeclaredFronts {
  readonly doorBands: DoorBandsRule;
  readonly leavesPerBand: number;
  readonly drawers: number;
}

/** A body whose front population is fixed at every width it is built to.
 *
 *  **Refuses a contradictory declaration here, at construction, rather than answering zero later.**
 *  `doorLeafCount` is bands times leaves per band, so `{ bands: [710], leavesPerBand: 0 }` reports
 *  no leaves on a body with a visible 710 mm door — and ADR 0070 would then price no hinges on it.
 *  The mirror, bands with no heights against a positive leaf count, is the same silence. Both are
 *  caught as the catalogue is assembled, which is module load for all 38 shipped rows, so a bad
 *  declaration cannot reach a query at all. `(no bands, no leaves)` is not a contradiction — it is
 *  `NO_OPENING_FRONTS`, and a hood must keep declaring it. */
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

/** How many bands a rule declares, **statically** — the whole reason the contradiction above can be
 *  caught at declaration rather than at query time. A `declared-heights` rule says so by its length,
 *  and a `one-band-under-frame` rule is exactly one band whatever frame it is later asked about. */
function declaredBandCount(doorBands: DoorBandsRule): number {
  return doorBands.measuredFrom === "declared-heights"
    ? doorBands.bandHeightsMm.length
    : ONE_BAND;
}

/** A `one-band-under-frame` row's band count. Named because the `1` is the rule's whole content on
 *  that arm and not an arbitrary default. */
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

/** **A declaration whose two halves disagree**, refused rather than answered. Distinct from
 *  `UndeclaredFrontPopulationError` on purpose and named for what it is: nothing is missing here —
 *  both numbers are present, usable, and describe a body that cannot exist.
 *
 *  **`buildId` is optional because only one of the two callers has one, and that is the honest
 *  shape rather than a compromise.** A constructor is handed numbers and not the row they belong to
 *  — threading an id through would put one on all 38 call sites — so `carriesFronts` throws at the
 *  call site with the band rule printed, and a developer reads the stack. The catalogue-assembly
 *  sweep does have the row, and names it: an exception carries the operation, the failure type and
 *  the relevant data, and for this failure the relevant datum is *which row*. `[1290,790]` locates
 *  the pantry only for a reader who already knows the catalogue, which is no use in a log. */
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
 * **The port half of the refusal above, and the half that can name the row.**
 *
 * `carriesFronts` catches every rule this repository authors, because every one of them is built by
 * it — but `BodyCatalog` is a port, and a definition assembled outside TypeScript reaches no
 * constructor at all. That is the case `refuseUndeclaredDepthRules` exists for one field over, and
 * this is the same remedy on the same seam: `buildKitchenLBodyCatalog` runs it over both populations
 * as the map is assembled, so a contradictory row cannot reach a query and the refusal names it.
 *
 * A rule that is missing, or tagged with something this module does not know, is **not** this
 * function's to refuse — that is `UndeclaredFrontPopulationError` at query time, and refusing it
 * here would make a catalogue fail to load for a row nothing had asked about yet.
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

/** A body whose only fronts are drawers — a pan bank, a three-drawer base, a bottle cargo's
 *  full-height pull-out. Reads as the statement it is, rather than as a `carriesFronts` call whose
 *  two door fields are both a named nothing. */
export function carriesDrawers(drawers: number): FrontPopulationRule {
  return carriesFronts({
    doorBands: NO_DOOR_BANDS,
    leavesPerBand: NO_LEAVES_PER_BAND,
    drawers,
  });
}

/** **A body with nothing that opens** — an open shelf, a hood, a freestanding appliance, a
 *  structural corner return, and the hob-and-oven base whose single front is a facade. */
export const NO_OPENING_FRONTS: FrontPopulationRule =
  carriesDrawers(NO_DRAWERS);

/** A row whose leaves per band follow its width through `deriveDoorCount`, and which carries no
 *  drawer. The three rows that declare `doorCountFollowsWidth` are all of this shape; a row that
 *  mixed width-derived leaves with drawers would need `carriesFronts`' general form and a
 *  `countedFrom` arm that carries both, and none exists because no such body is built. */
export function doorLeavesFollowWidth(
  doorBands: DoorBandsRule,
): FrontPopulationRule {
  // The same contradiction on this arm, where `deriveDoorCount` always answers at least one leaf: a
  // row declaring that a width decides its leaves, in a body with nowhere for a leaf to stand.
  refuseContradiction({
    bands: declaredBandCount(doorBands),
    leavesPerBand: LEAVES_FOLLOW_THE_WIDTH,
    doorBands,
  });
  return { countedFrom: "leaves-follow-width", doorBands, drawers: NO_DRAWERS };
}

/** What a width-following row contributes to the contradiction check above. `deriveDoorCount` never
 *  answers zero, so any positive stand-in states the same fact: this row expects bands to put leaves
 *  in. */
const LEAVES_FOLLOW_THE_WIDTH = 1;

/** Every rule field a refusal can name. A literal union rather than `string`, for the reason
 *  `CabinetHandleCountField` is one: a typo in a refusal message is a compile error instead of a
 *  message pointing at a field no rule has.
 *
 *  **Not "count fields", which is what this was called.** Two of the four are millimetre *lengths* —
 *  a band's height and a frame inset — and only the other two are counted objects. They share one
 *  validator because they share one shape of unusable, not because they are the same kind of
 *  number. */
export type FrontPopulationField =
  | "leavesPerBand"
  | "drawers"
  | "bandHeightsMm"
  | "frameInsetMm";

/** A catalogue entry that declares nothing usable about its fronts. **A programming error rather
 *  than a number to guess at** (ADR 0061 decision 4, restated one declaration over): a silent
 *  fallback to zero would price a whole kitchen's hinges at nothing, and a silent fallback to the
 *  frame height would put three hinges on a pantry's 790 mm door. Neither failure is visible in a
 *  scene, which is how four families carried a wrong `occupiedDepth` with every suite green
 *  (DOM-002).
 *
 *  `missingField` names which number was not there, so the refusal points at the row's field rather
 *  than only at the row — the shape `UndeclaredCabinetHandleCountError` arrived at after QA found
 *  its second unusable case one field later than its first. */
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

/** What the three queries below need and nothing more: the declaration, the two dimensions a rule
 *  may be relative to, and the id a refusal has to name.
 *
 *  `rule` is typed **wider than `BodyDefinition` declares it, on purpose**, for the reason
 *  `cabinet-handles.ts` and `occupied-depth.ts` widen their own: `BodyCatalog` is a port, a
 *  definition assembled outside TypeScript can arrive with no rule at all, and that is the case
 *  these functions must refuse rather than guess at. */
export interface FrontPopulationQuery {
  readonly buildId: string;
  readonly rule: FrontPopulationRule | undefined;
  /** The width the body is built to — what a `leaves-follow-width` rule is relative to. */
  readonly widthMm: number;
  /** The frame height the body is built to — what a `one-band-under-frame` rule is relative to.
   *  Ignored by a rule that declares its band heights, which is every seeded row. */
  readonly frameHeightMm: number;
}

/** What this module reads off a placement's body, and nothing more. **Structural rather than an
 *  import of `CabinetBody`**, for the reason `DeclaresFronts` below is structural: `void-engine.ts`
 *  imports *this* module for `FrontPopulationRule`, so an import back would be a cycle. */
export interface PlacedBody {
  readonly buildId: string;
  readonly widthMm: number;
  readonly heightMm: number;
}

/** What this module reads off a catalogue entry. See `PlacedBody` above for why it is structural. */
export interface DeclaresFronts {
  readonly fronts?: FrontPopulationRule;
}

/**
 * **The query, built from the placement rather than assembled by hand — and this exists to remove a
 * choice, not to save typing.**
 *
 * `frameHeightMm` is what a `one-band-under-frame` row's bands are relative to, and it is the
 * **built** height: the height `buildCatalogBody` is handed, which is the placement's own. A caller
 * writing the query by hand can just as easily reach for `definition.nominalHeightMm`, which reads
 * plausible and is wrong — one `wall-cabinet` entry declares 700 while its placements are built at
 * 400, 700 and 750, so a nominal source pins every leaf at 694.
 *
 * **Nothing in the shipped catalogue would catch that.** All 26 seeded rows declare their band
 * heights outright (ADR 0011 Gap A: one already-built body at one size), so no seeded placement's
 * rule reads `frameHeightMm` at all — ADR 0070's 74-hinge cross-check answers 74 whatever is passed
 * here. The two `heightFlex` §7 rows are the only ones the input reaches, and today every band they
 * produce is under ADR 0070's 900 mm threshold, so the wrong source is silent as well as unguarded.
 * That is latency, not safety, and this constructor is what removes the chance to take it.
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

/** **The height of each door leaf this body carries, one entry per leaf** — the list ADR 0070's
 *  900 mm hinge rule is applied over, and the pairing the two counts below cannot express between
 *  them. A pantry at 600 mm answers `[1290, 1290, 790, 790]`.
 *
 *  **Published because both of this wave's test files had already rebuilt it**, five lines each,
 *  one of them with a doc comment explaining why the division is exact. A caller that has a total
 *  leaf count and a band list and reconstructs the pairing itself will sooner or later apply the
 *  threshold to the *bands* instead — which counts 45 hinges on the seeded kitchen against the
 *  correct 74, silently. The pairing is this module's fact, so it is this module's function.
 *
 *  Band-major, which is how the builders stack them: a band's leaves are adjacent. */
export function doorLeafHeightsMm(
  query: FrontPopulationQuery,
): readonly number[] {
  const leavesPerBand = leavesPerBandOf(query);
  return doorBandHeightsMm(query).flatMap((bandHeightMm) =>
    Array.from<number>({ length: leavesPerBand }).fill(bandHeightMm),
  );
}

/** **How many door leaves this body carries at this size** — the quantity ADR 0070's hinge rule is
 *  counted over, and the number the three-adapter parity gate holds to the built slabs.
 *
 *  The length of the list above rather than a product of two numbers, so the count and the heights
 *  cannot come apart: `tall-fridge-housing` is three bands of one leaf, `base-sink` is one band of
 *  two, and `tall-pantry` is two bands of however many `deriveDoorCount` puts in one. A drawer is
 *  not among them and never was.
 *
 *  Fails closed: a query whose entry declares nothing throws rather than answering. */
export function doorLeafCount(query: FrontPopulationQuery): number {
  return doorLeafHeightsMm(query).length;
}

/** **How many drawers this body carries** — the quantity ADR 0070's runner rule is counted over. A
 *  drawer's *size* does not change the mechanism count, so no height is declared for one and none
 *  is asked for here.
 *
 *  **Its precondition is deliberately weaker than `doorLeafCount`'s on the same query**, and that is
 *  worth stating because two queries over one object with different failure conditions is what a
 *  later reader gets wrong: a leaf count routes through the band declaration and refuses an unusable
 *  one, while this reads only `drawers`. So a row with a broken band list still answers a drawer
 *  count — correct rather than lax, because a drawer has no band and there is nothing about it for a
 *  broken band list to make wrong. */
export function drawerCount(query: FrontPopulationQuery): number {
  const rule = recognisedRuleOf(query);
  return usableCountOf(query, rule.drawers, "drawers");
}

/** **How tall each of this body's door bands is, in millimetres** — one entry per band, and the
 *  number ADR 0070's 900 mm hinge threshold is applied to. **Not the frame height**, which is the
 *  wrong number and is why this declaration exists: `tall-pantry` declares 1290 and 790 inside a
 *  2200 mm frame.
 *
 *  A body with nothing that opens answers with an empty list, which is a real answer and not a
 *  refusal — a hood has no door band. */
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

/** The band rule a recognised declaration carries, **typed as possibly absent although the rule
 *  declares it required** — for the reason `FrontPopulationQuery.rule` itself is typed wider than
 *  `BodyDefinition` declares it. A row authored with a recognised `countedFrom` and no `doorBands`
 *  at all is the shape a definition arrives as through the `BodyCatalog` port, and it has to reach
 *  a refusal rather than crash reading a property of `undefined`. */
function declaredBandsOf(
  query: FrontPopulationQuery,
): DoorBandsRule | undefined {
  return recognisedRuleOf(query).doorBands;
}

/** How many leaves stand in one of this body's bands — declared, or derived from the width by the
 *  one threshold `deriveDoorCount` owns (ADR 0033). */
function leavesPerBandOf(query: FrontPopulationQuery): number {
  const rule = recognisedRuleOf(query);
  if (rule.countedFrom === "leaves-follow-width") {
    return deriveDoorCount(query.widthMm);
  }
  return usableCountOf(query, rule.leavesPerBand, "leavesPerBand");
}

/** The declaration, or a refusal naming the row. A rule that is missing, `null`, or tagged with a
 *  `countedFrom` this module does not know is refused here; a rule tagged with one it *does* know
 *  and carrying no number is refused by `usableCountOf` below, which is the second shape of
 *  unusable and the one that used to come back as `NaN` out of a function typed `: number`. */
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

/** The band heights a recognised rule declares, held to being **millimetres of a real door**: a
 *  list, every entry a positive whole number. A zero-height band is not a band, and a fraction of a
 *  millimetre is not a height the builders draw. An empty list passes and means what it says — a
 *  hood has no door band. */
/** A band a `one-band-under-frame` row's own frame height produced, held to being a door somebody
 *  could hang. **Not a declaration check** — the inset is declared and already checked; the frame
 *  height is the *caller's* input, and a query that passes a frame shorter than the inset would
 *  otherwise get a zero or negative band back and read it as a leaf under 900 mm, which is a wrong
 *  answer rather than a crash. This module's whole premise is that a silently wrong number is worse
 *  than a refusal. */
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

/** A number a recognised rule is made of, held to being **whole, non-negative and small enough to
 *  be exact** — what a leaf count, a drawer count and a millimetre inset all have to be here. A
 *  fraction or a negative is not a value that was merely surprising: it is one nothing can be billed
 *  for or built to. `0` is a real answer and passes: a hood carries no drawer, and a row could in
 *  principle inset its band by nothing.
 *
 *  Typed `unknown` deliberately, although the rule declares every one of these fields `number`.
 *  That declaration is what the port cannot guarantee, and this function exists for exactly the
 *  values TypeScript already believes are impossible. */
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
