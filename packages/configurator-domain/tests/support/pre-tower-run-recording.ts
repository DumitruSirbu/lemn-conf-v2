// Readers for the two plan recordings either side of S0b (the oven tower over the bottle, ADR 0110 Amendment M11)
// and the classifiers that say how a plan may differ from each. The baselines were captured at `acb7b6f` and at
// `c0018ef` plus S0b's edit alone, over the same 480 drawn rooms (seed 20260921) and 16 witnesses, so they compare
// room by room. Never re-captured to fit a later wave: a later change gets a new recording beside these.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isComposedStorageSlot, type DesignRoom } from "../../src/index.js";
import {
  parseRecordedCanonicalPlan,
  type RecordedCanonicalPlan,
  type RecordedPlanModule,
} from "./pre-width-run-recording.js";

const GENERATION_TESTS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "generation",
);
const PRE_TOWER_FILE = path.join(
  GENERATION_TESTS,
  "7d5b-pre-tower-baseline.json",
);
const POST_TOWER_FILE = path.join(
  GENERATION_TESTS,
  "7d5b-post-tower-baseline.json",
);

interface TowerRecordingDocument {
  readonly capturedFrom: string;
  readonly seed: number;
  readonly runs: number;
  /** Room key to the whole `canonicalPlan` string, one entry per drawn room. */
  readonly rooms: Readonly<Record<string, string>>;
  /** Room key to the whole `canonicalPlan` string, one entry per named witness. */
  readonly witnesses: Readonly<Record<string, string>>;
}

export interface TowerRunRecording {
  readonly capturedFrom: string;
  readonly seed: number;
  readonly runs: number;
  readonly rooms: ReadonlyMap<string, string>;
  readonly witnesses: ReadonlyMap<string, string>;
}

/** S0b's pre-state: HEAD `acb7b6f`, before the tower was kept over the bottle. */
export function readPreTowerRunRecording(): TowerRunRecording {
  return readTowerRunRecording(PRE_TOWER_FILE, "the 7D5b pre-tower recording");
}

/** S1's pre-state: the tree with S0b and nothing after it. */
export function readPostTowerRunRecording(): TowerRunRecording {
  return readTowerRunRecording(
    POST_TOWER_FILE,
    "the 7D5b post-tower recording",
  );
}

function readTowerRunRecording(file: string, name: string): TowerRunRecording {
  const document = JSON.parse(
    readFileSync(file, "utf8"),
  ) as TowerRecordingDocument;
  const rooms = new Map(Object.entries(document.rooms));
  if (rooms.size !== document.runs) {
    throw new Error(
      `${name} declares ${String(document.runs)} runs but holds ${String(rooms.size)} distinct rooms`,
    );
  }
  const witnesses = new Map(Object.entries(document.witnesses));
  if (witnesses.size === 0) {
    throw new Error(`${name} holds no witness room`);
  }
  return {
    capturedFrom: document.capturedFrom,
    seed: document.seed,
    runs: document.runs,
    rooms,
    witnesses,
  };
}

/** The room a recording key names: `<width>x<depth>x<height>`, all whole millimetres. */
export function roomFromRecordedKey(key: string): DesignRoom {
  const [widthMm, depthMm, heightMm, ...rest] = key.split("x").map(Number);
  const isWhole = (value: number | undefined): value is number =>
    value !== undefined && Number.isInteger(value);
  if (
    rest.length > 0 ||
    !isWhole(widthMm) ||
    !isWhole(depthMm) ||
    !isWhole(heightMm)
  ) {
    throw new Error(`a 7D5b tower recording holds an invalid room key: ${key}`);
  }
  return { shape: "L", widthMm, depthMm, heightMm };
}

/** How a plan relates to the plan recorded before S0b. */
export type TowerOverBottleChange =
  | "unchanged"
  | "the oven tower kept over the bottle"
  | "changed otherwise";

const BOTTLE_ID = "bottle";
const BOTTLE_BODY = "base-bottle-cargo";
const PAN_DRAWER_BODY = "base-panbank";
const HOB_ROLE = "hob";
const HOB_WITH_OVEN_BODY = "base-hob-oven";
const HOB_WITH_DRAWERS_BODY = "base-hob-2drawer";
const OVEN_TOWER_BODY = "tall-oven-tower";
const TALL_BODY_PREFIX = "tall-";
const COLUMN_ROLE = "storage";
/** The block's innermost column, where the tower stands (ADR 0110 E12.2). */
const INNERMOST_COLUMN_INDEX = 0;
const OVEN_TOWER_WIDTH_MM = 600;

/** Classifies `after` against the plan recorded before S0b, both in `canonicalPlan` form. */
export function towerOverBottleChangeBetween(plans: {
  readonly before: string;
  readonly after: string;
}): TowerOverBottleChange {
  if (plans.before === plans.after) return "unchanged";
  const expected = withTheOvenTowerKeptOverTheBottle(
    parseRecordedCanonicalPlan(plans.before),
  );
  const isM11 =
    expected !== undefined &&
    JSON.stringify(expected) ===
      JSON.stringify(parseRecordedCanonicalPlan(plans.after));
  return isM11 ? "the oven tower kept over the bottle" : "changed otherwise";
}

/**
 * The plan S0b makes of a recorded pre-S0b plan, or `undefined` where it does not apply: S1's bottle directly after
 * a `base-hob-oven` on the hob's wall, with no tall column and no pan drawer. The bottle's module becomes a 600 mm
 * oven tower where the bottle started, the hob becomes `base-hob-2drawer`, and that wall's floor width reads 600
 * for 300 with its remainder 300 mm smaller. Every other field is unchanged, so any further difference is
 * "changed otherwise".
 */
export function withTheOvenTowerKeptOverTheBottle(
  before: RecordedCanonicalPlan,
): RecordedCanonicalPlan | undefined {
  const bottle = before.bases.find((base) => base.id === BOTTLE_ID);
  const hob = before.bases.find((base) => base.role === HOB_ROLE);
  if (!bottle || !hob || !isTheTowersCase(before, { bottle, hob })) {
    return undefined;
  }
  const wall = bottle.wall;
  const tower: RecordedPlanModule = {
    id: `column:${wall}:${String(INNERMOST_COLUMN_INDEX)}`,
    role: COLUMN_ROLE,
    buildId: OVEN_TOWER_BODY,
    wall,
    startMm: bottle.startMm,
    endMm: bottle.startMm + OVEN_TOWER_WIDTH_MM,
    widthMm: OVEN_TOWER_WIDTH_MM,
  };
  const widthGainedMm = OVEN_TOWER_WIDTH_MM - bottle.widthMm;
  return {
    ...before,
    remainderMm: {
      ...before.remainderMm,
      [wall]: before.remainderMm[wall] - widthGainedMm,
    },
    floorWidthsMm: {
      ...before.floorWidthsMm,
      [wall]: floorWidthsWithTheTower(before, bottle),
    },
    bases: before.bases.map((base) => {
      if (base === bottle) return tower;
      if (base === hob) return { ...base, buildId: HOB_WITH_DRAWERS_BODY };
      return base;
    }),
  };
}

function isTheTowersCase(
  before: RecordedCanonicalPlan,
  modules: {
    readonly bottle: RecordedPlanModule;
    readonly hob: RecordedPlanModule;
  },
): boolean {
  const { bottle, hob } = modules;
  return (
    bottle.buildId === BOTTLE_BODY &&
    hob.buildId === HOB_WITH_OVEN_BODY &&
    bottle.wall === hob.wall &&
    bottle.startMm === hob.endMm &&
    !before.bases.some(
      (base) =>
        base.buildId === PAN_DRAWER_BODY ||
        base.buildId.startsWith(TALL_BODY_PREFIX),
    )
  );
}

function floorWidthsWithTheTower(
  before: RecordedCanonicalPlan,
  bottle: RecordedPlanModule,
): readonly number[] {
  const bottleAt = before.bases
    .filter((base) => base.wall === bottle.wall)
    .sort((left, right) => left.startMm - right.startMm)
    .indexOf(bottle);
  return before.floorWidthsMm[bottle.wall].map((widthMm, index) =>
    index === bottleAt ? OVEN_TOWER_WIDTH_MM : widthMm,
  );
}

/** How a plan relates to the plan recorded after S0b, before S1 (ADR 0110 Amendment M1, M2). The M2 classes carry
 *  the leaf's own re-identification (M1 or (e)) on top of the re-planned run. */
export type DishwasherChange =
  | "unchanged"
  | "M1: a door cabinet on the sink's wall converted"
  | "M1: a door cabinet across the corner converted"
  | "(e): the preparation 3-drawer converted, its role onto the pan drawer"
  | "M2: the threshold drawer gone, one more column"
  | "M2: the threshold drawer gone, the bottle back"
  | "changed otherwise";

/** Where each wall's floor run starts: its corner end. Read from the room, never from a module. */
export type CornerEnds = Readonly<Record<"A" | "B", number>>;

type Generated = (
  before: RecordedCanonicalPlan,
  cornerEndMm: CornerEnds,
) => RecordedCanonicalPlan | undefined;

const DISHWASHER_IDENTITY = {
  id: "dishwasher",
  role: "storage",
  buildId: "base-dishwasher",
} as const;
const DISHWASHER_WIDTH_MM = 600;
const DOOR_BODY = "base-cabinet";
const THREE_DRAWER_BODY = "base-3drawer";
const SINK_ROLE = "sink";
const PREPARATION_ROLE = "preparation";
const PREPARATION_ID = "preparation";
const THRESHOLD_DRAWER_ID = "threshold-drawer";
const PANTRY_BODY = "tall-pantry";
const BOTTLE_WIDTH_MM = 300;
/** The catalogue's declared column width, one storage module (ADR 0110 E6.2). */
const DECLARED_COLUMN_WIDTH_MM = 600;
/** `MAX_EMPTY_COLUMN_WIDTH_MM`: the widest opening a door column may be built to. */
const EMPTY_COLUMN_CEILING_MM = 800;

/** Each class S1 may produce, with the plan it produces from the recorded one. Tried in this order; the
 *  first whose generated plan equals `after` names the change. */
const DISHWASHER_CHANGES: readonly (readonly [DishwasherChange, Generated])[] =
  [
    [
      "M1: a door cabinet on the sink's wall converted",
      (before) => withADoorCabinetConverted(before, abutsTheSinkOnItsWall),
    ],
    [
      "M1: a door cabinet across the corner converted",
      (before, corner) =>
        withADoorCabinetConverted(before, facesTheSinkAcrossTheCorner(corner)),
    ],
    [
      "(e): the preparation 3-drawer converted, its role onto the pan drawer",
      withTheDrawersSwapped,
    ],
    [
      "M2: the threshold drawer gone, one more column",
      (before, corner) =>
        withTheLeaf(withAColumnForTheThresholdDrawer(before), corner),
    ],
    [
      "M2: the threshold drawer gone, the bottle back",
      (before, corner) =>
        withTheLeaf(withTheBottleForTheThresholdDrawer(before), corner),
    ],
  ];

/** Classifies `after` against the plan recorded after S0b, both in `canonicalPlan` form. */
export function dishwasherChangeBetween(plans: {
  readonly before: string;
  readonly after: string;
  readonly cornerEndMm: CornerEnds;
}): DishwasherChange {
  if (plans.before === plans.after) return "unchanged";
  const before = parseRecordedCanonicalPlan(plans.before);
  const after = JSON.stringify(parseRecordedCanonicalPlan(plans.after));
  const matched = DISHWASHER_CHANGES.find(([, generated]) => {
    const expected = generated(before, plans.cornerEndMm);
    return expected !== undefined && JSON.stringify(expected) === after;
  });
  return matched === undefined ? "changed otherwise" : matched[0];
}

type BesideTheSink = (
  plan: RecordedCanonicalPlan,
  base: RecordedPlanModule,
) => boolean;

/** **M1**: the composed 600 mm door slot the arm finds beside the sink becomes the dishwasher in place;
 *  nothing else in the plan moves. `undefined` where the arm finds none. */
function withADoorCabinetConverted(
  before: RecordedCanonicalPlan,
  isBeside: BesideTheSink,
): RecordedCanonicalPlan | undefined {
  const doorCabinet = before.bases.find(
    (base) => isAFreeDoorCabinet(base) && isBeside(before, base),
  );
  if (doorCabinet === undefined) return undefined;
  return withModulesReplaced(
    before,
    new Map([[doorCabinet, asTheDishwasher(doorCabinet)]]),
  );
}

function isAFreeDoorCabinet(base: RecordedPlanModule): boolean {
  return (
    isComposedStorageSlot(base) &&
    base.buildId === DOOR_BODY &&
    base.widthMm === DISHWASHER_WIDTH_MM
  );
}

function hasAFreeDoorCabinetBesideTheSink(
  plan: RecordedCanonicalPlan,
  cornerEndMm: CornerEnds,
): boolean {
  const isBeside = facesTheSinkAcrossTheCorner(cornerEndMm);
  return plan.bases.some(
    (base) =>
      isAFreeDoorCabinet(base) &&
      (abutsTheSinkOnItsWall(plan, base) || isBeside(plan, base)),
  );
}

function abutsTheSinkOnItsWall(
  plan: RecordedCanonicalPlan,
  base: RecordedPlanModule,
): boolean {
  const sink = sinkOf(plan);
  return sink !== undefined && base !== sink && abutsOnItsWall(base, sink);
}

/** Across the corner: the sink and the module each stand at their own wall's corner end. */
function facesTheSinkAcrossTheCorner(cornerEndMm: CornerEnds): BesideTheSink {
  return (plan, base) => {
    const sink = sinkOf(plan);
    return (
      sink !== undefined &&
      base.wall !== sink.wall &&
      sink.startMm === cornerEndMm[sink.wall] &&
      base.startMm === cornerEndMm[base.wall]
    );
  };
}

/** **M7(e), modelled by M8/M9**: only where no free door cabinet stands beside the sink, the preparation
 *  3-drawer beside it becomes the dishwasher, and the pan drawer directly beyond it — on the side away
 *  from the sink — takes id and role `preparation`, keeping its `base-panbank` body. */
function withTheDrawersSwapped(
  before: RecordedCanonicalPlan,
  cornerEndMm: CornerEnds,
): RecordedCanonicalPlan | undefined {
  if (hasAFreeDoorCabinetBesideTheSink(before, cornerEndMm)) return undefined;
  const isAcross = facesTheSinkAcrossTheCorner(cornerEndMm);
  const preparation = before.bases.find(
    (base) =>
      base.id === PREPARATION_ID &&
      base.role === PREPARATION_ROLE &&
      base.buildId === THREE_DRAWER_BODY &&
      base.widthMm === DISHWASHER_WIDTH_MM &&
      (abutsTheSinkOnItsWall(before, base) || isAcross(before, base)),
  );
  if (preparation === undefined) return undefined;
  const panDrawer = panDrawerBeyond(before, preparation);
  if (panDrawer === undefined) return undefined;
  return withModulesReplaced(
    before,
    new Map([
      [preparation, asTheDishwasher(preparation)],
      [panDrawer, { ...panDrawer, id: PREPARATION_ID, role: PREPARATION_ROLE }],
    ]),
  );
}

function panDrawerBeyond(
  plan: RecordedCanonicalPlan,
  preparation: RecordedPlanModule,
): RecordedPlanModule | undefined {
  const sink = sinkOf(plan);
  const isSinkAfter =
    sink?.wall === preparation.wall && sink.startMm === preparation.endMm;
  return plan.bases.find(
    (base) =>
      base.buildId === PAN_DRAWER_BODY &&
      base.wall === preparation.wall &&
      (isSinkAfter
        ? base.endMm === preparation.startMm
        : base.startMm === preparation.endMm),
  );
}

/** The leaf as S1 applies it to a re-planned run: M1 on the sink's wall, else across the corner, else
 *  (e); `undefined` where none applies (then S1 could not have re-planned the threshold drawer away). */
function withTheLeaf(
  plan: RecordedCanonicalPlan | undefined,
  cornerEndMm: CornerEnds,
): RecordedCanonicalPlan | undefined {
  if (plan === undefined) return undefined;
  return (
    withADoorCabinetConverted(plan, abutsTheSinkOnItsWall) ??
    withADoorCabinetConverted(plan, facesTheSinkAcrossTheCorner(cornerEndMm)) ??
    withTheDrawersSwapped(plan, cornerEndMm)
  );
}

/** **M2, a column back**: the threshold drawer's module goes, and the block is re-laid from where it stood with
 *  one more pantry column at its free end. */
function withAColumnForTheThresholdDrawer(
  before: RecordedCanonicalPlan,
): RecordedCanonicalPlan | undefined {
  const drawer = thresholdDrawerBeforeOnlyColumns(before);
  if (drawer === undefined) return undefined;
  return withTheBlockRelaid(before, {
    drawer,
    inItsPlace: undefined,
    columnBodies: [
      ...modulesBeyond(before, drawer).map((base) => base.buildId),
      PANTRY_BODY,
    ],
  });
}

/** **M2, the bottle back**: the threshold drawer's module becomes the 300 mm bottle and the same block is re-laid
 *  after it. Only where no bottle stood. */
function withTheBottleForTheThresholdDrawer(
  before: RecordedCanonicalPlan,
): RecordedCanonicalPlan | undefined {
  const drawer = thresholdDrawerBeforeOnlyColumns(before);
  if (
    drawer === undefined ||
    before.bases.some((base) => base.buildId === BOTTLE_BODY)
  ) {
    return undefined;
  }
  const bottle: RecordedPlanModule = {
    id: BOTTLE_ID,
    role: "storage",
    buildId: BOTTLE_BODY,
    wall: drawer.wall,
    startMm: drawer.startMm,
    endMm: drawer.startMm + BOTTLE_WIDTH_MM,
    widthMm: BOTTLE_WIDTH_MM,
  };
  return withTheBlockRelaid(before, {
    drawer,
    inItsPlace: bottle,
    columnBodies: modulesBeyond(before, drawer).map((base) => base.buildId),
  });
}

/**
 * The plan with the threshold drawer replaced (or removed) and the block beyond it re-laid by the tall-end rule's
 * geometry (ADR 0110 E6.2): the columns stand one declared module each from where the replacement ends, the wall's
 * free end is where the recorded run reached, and a bare remainder merges into the outermost column only where
 * that is a door column and the merged opening is at most the empty-column ceiling. Everything else is unchanged.
 */
function withTheBlockRelaid(
  before: RecordedCanonicalPlan,
  relaid: {
    readonly drawer: RecordedPlanModule;
    readonly inItsPlace: RecordedPlanModule | undefined;
    readonly columnBodies: readonly string[];
  },
): RecordedCanonicalPlan {
  const { drawer, inItsPlace, columnBodies } = relaid;
  const wall = drawer.wall;
  const freeEndMm = lastEndOn(before, wall) + before.remainderMm[wall];
  const blockStartMm = inItsPlace?.endMm ?? drawer.startMm;
  const columns = columnBodies.map(
    (buildId, index): RecordedPlanModule => ({
      id: `column:${wall}:${String(index)}`,
      role: "storage",
      buildId,
      wall,
      startMm: blockStartMm + index * DECLARED_COLUMN_WIDTH_MM,
      endMm: blockStartMm + (index + 1) * DECLARED_COLUMN_WIDTH_MM,
      widthMm: DECLARED_COLUMN_WIDTH_MM,
    }),
  );
  const { block, remainderMm } = withTheFreeEndMerged(columns, freeEndMm);
  const beforeTheDrawer = before.bases.filter(
    (base) => base.wall !== wall || base.endMm <= drawer.startMm,
  );
  const drawerAt = before.bases.indexOf(drawer);
  const bases = [
    ...beforeTheDrawer.filter((base) => before.bases.indexOf(base) < drawerAt),
    ...(inItsPlace === undefined ? [] : [inItsPlace]),
    ...block,
    ...beforeTheDrawer.filter((base) => before.bases.indexOf(base) > drawerAt),
  ];
  return {
    ...before,
    remainderMm: { ...before.remainderMm, [wall]: remainderMm },
    floorWidthsMm: {
      ...before.floorWidthsMm,
      [wall]: bases
        .filter((base) => base.wall === wall)
        .sort((left, right) => left.startMm - right.startMm)
        .map((base) => base.widthMm),
    },
    bases,
  };
}

function withTheFreeEndMerged(
  columns: readonly RecordedPlanModule[],
  freeEndMm: number,
): { readonly block: RecordedPlanModule[]; readonly remainderMm: number } {
  const outermost = columns.at(-1);
  const bareMm = freeEndMm - (outermost?.endMm ?? freeEndMm);
  const canMerge =
    outermost !== undefined &&
    outermost.buildId === PANTRY_BODY &&
    bareMm > 0 &&
    outermost.widthMm + bareMm <= EMPTY_COLUMN_CEILING_MM;
  if (!canMerge) return { block: [...columns], remainderMm: bareMm };
  const merged = {
    ...outermost,
    endMm: freeEndMm,
    widthMm: outermost.widthMm + bareMm,
  };
  return { block: [...columns.slice(0, -1), merged], remainderMm: 0 };
}

function lastEndOn(plan: RecordedCanonicalPlan, wall: "A" | "B"): number {
  return Math.max(
    ...plan.bases
      .filter((base) => base.wall === wall)
      .map((base) => base.endMm),
  );
}

/** The threshold drawer, where every module beyond it on its wall is a tall column. */
function thresholdDrawerBeforeOnlyColumns(
  plan: RecordedCanonicalPlan,
): RecordedPlanModule | undefined {
  const drawer = plan.bases.find((base) => base.id === THRESHOLD_DRAWER_ID);
  if (drawer === undefined) return undefined;
  const isOnlyColumnsBeyond = modulesBeyond(plan, drawer).every((base) =>
    base.buildId.startsWith(TALL_BODY_PREFIX),
  );
  return isOnlyColumnsBeyond ? drawer : undefined;
}

function modulesBeyond(
  plan: RecordedCanonicalPlan,
  drawer: RecordedPlanModule,
): readonly RecordedPlanModule[] {
  return plan.bases
    .filter((base) => base.wall === drawer.wall && base.startMm >= drawer.endMm)
    .sort((left, right) => left.startMm - right.startMm);
}

function asTheDishwasher(base: RecordedPlanModule): RecordedPlanModule {
  return { ...base, ...DISHWASHER_IDENTITY };
}

function withModulesReplaced(
  plan: RecordedCanonicalPlan,
  replaced: ReadonlyMap<RecordedPlanModule, RecordedPlanModule>,
): RecordedCanonicalPlan {
  return {
    ...plan,
    bases: plan.bases.map((base) => replaced.get(base) ?? base),
  };
}

function abutsOnItsWall(
  base: RecordedPlanModule,
  other: RecordedPlanModule,
): boolean {
  return (
    base.wall === other.wall &&
    (base.endMm === other.startMm || base.startMm === other.endMm)
  );
}

function sinkOf(plan: RecordedCanonicalPlan): RecordedPlanModule | undefined {
  return plan.bases.find((base) => base.role === SINK_ROLE);
}

/** How a live plan relates to S1's plan for the same room (leaf on, S2's trades off; ADR 0110 Amendment M7). */
export type DishwasherTrade =
  | "unchanged"
  | "(b): one pantry column traded"
  | "(d): the bottle traded"
  | "(c): the oven tower traded, the hob given its oven"
  | "changed otherwise";

/** Each trade by the body it frees on the sink's wall, and the exact bodies it gives up and adds, as
 *  sorted multisets. */
interface TradedBodies {
  readonly freed: string;
  readonly givenUp: readonly string[];
  readonly added: readonly string[];
}

const TRADES_BY_BODIES: readonly (readonly [DishwasherTrade, TradedBodies])[] =
  [
    [
      "(b): one pantry column traded",
      {
        freed: PANTRY_BODY,
        givenUp: [PANTRY_BODY],
        added: [DISHWASHER_IDENTITY.buildId],
      },
    ],
    [
      "(d): the bottle traded",
      {
        freed: BOTTLE_BODY,
        givenUp: [BOTTLE_BODY],
        added: [DISHWASHER_IDENTITY.buildId],
      },
    ],
    [
      "(c): the oven tower traded, the hob given its oven",
      {
        freed: OVEN_TOWER_BODY,
        givenUp: [HOB_WITH_DRAWERS_BODY, OVEN_TOWER_BODY],
        added: [DISHWASHER_IDENTITY.buildId, HOB_WITH_OVEN_BODY],
      },
    ],
  ];

/**
 * Classifies the live plan against S1's, both in `canonicalPlan` form. A trade is named only where the live plan is
 * S1's with exactly this done: one 600 mm dishwasher stands directly beyond the sink on its wall, every module
 * between the sink and the body given up is S1's 600 mm further along (the hob changing only its body, and only
 * in (c)), the sink's other side, the other wall, `minimumMet` and `dropped` are S1's exactly, and the bodies
 * given up and added are the trade's. Anything else is "changed otherwise".
 */
export function dishwasherTradeBetween(plans: {
  readonly afterS1: string;
  readonly live: string;
}): DishwasherTrade {
  if (plans.afterS1 === plans.live) return "unchanged";
  const afterS1 = parseRecordedCanonicalPlan(plans.afterS1);
  const live = parseRecordedCanonicalPlan(plans.live);
  const matched = tradeByBodies(afterS1, live);
  if (matched === undefined) return "changed otherwise";
  const [trade, bodies] = matched;
  const isHobReBodied =
    trade === "(c): the oven tower traded, the hob given its oven";
  const shape = { freed: bodies.freed, isHobReBodied };
  return isTheDishwasherInsertedAfterTheSink({ afterS1, live }, shape)
    ? trade
    : "changed otherwise";
}

/** Where the live plan's bodies are the trade's, what the trade frees and whether it re-bodies the hob. */
interface TradeShape {
  readonly freed: string;
  readonly isHobReBodied: boolean;
}

interface ComparedPlans {
  readonly afterS1: RecordedCanonicalPlan;
  readonly live: RecordedCanonicalPlan;
}

function tradeByBodies(
  afterS1: RecordedCanonicalPlan,
  live: RecordedCanonicalPlan,
): (typeof TRADES_BY_BODIES)[number] | undefined {
  const givenUp = bodiesOnlyIn(afterS1, live);
  const added = bodiesOnlyIn(live, afterS1);
  return TRADES_BY_BODIES.find(
    ([, bodies]) =>
      bodies.givenUp.join() === givenUp.join() &&
      bodies.added.join() === added.join(),
  );
}

/** The multiset `plan`'s bodies less `other`'s, sorted. */
function bodiesOnlyIn(
  plan: RecordedCanonicalPlan,
  other: RecordedCanonicalPlan,
): readonly string[] {
  const remaining = other.bases.map((base) => base.buildId);
  const only: string[] = [];
  for (const base of plan.bases) {
    const at = remaining.indexOf(base.buildId);
    if (at < 0) only.push(base.buildId);
    else remaining.splice(at, 1);
  }
  return only.sort();
}

function isTheDishwasherInsertedAfterTheSink(
  { afterS1, live }: ComparedPlans,
  shape: TradeShape,
): boolean {
  const dishwashers = live.bases.filter(
    (base) => base.buildId === DISHWASHER_IDENTITY.buildId,
  );
  const [dishwasher] = dishwashers;
  const sink = sinkOf(live);
  const sinkBefore = sinkOf(afterS1);
  if (
    dishwashers.length !== 1 ||
    dishwasher === undefined ||
    sink === undefined ||
    sinkBefore === undefined ||
    !isTheOwnersDishwasher(dishwasher) ||
    !abutsOnItsWall(dishwasher, sink) ||
    JSON.stringify(sink) !== JSON.stringify(sinkBefore) ||
    afterS1.minimumMet !== live.minimumMet ||
    afterS1.dropped.join() !== live.dropped.join()
  ) {
    return false;
  }
  const shiftMm =
    dishwasher.startMm === sink.endMm
      ? DISHWASHER_WIDTH_MM
      : -DISHWASHER_WIDTH_MM;
  return (
    isEveryModuleOffTheShiftedSideKept(afterS1, live, { sink, shiftMm }) &&
    isTheShiftedSideShiftedUpToTheBodyGivenUp(
      { afterS1, live },
      { sink, shiftMm, ...shape },
    )
  );
}

function isTheOwnersDishwasher(base: RecordedPlanModule): boolean {
  return (
    base.id === DISHWASHER_IDENTITY.id &&
    base.role === DISHWASHER_IDENTITY.role &&
    base.widthMm === DISHWASHER_WIDTH_MM
  );
}

interface ShiftedSide {
  readonly sink: RecordedPlanModule;
  readonly shiftMm: number;
}

/** The other wall, and the sink's wall on the side away from the dishwasher, are S1's exactly. */
function isEveryModuleOffTheShiftedSideKept(
  afterS1: RecordedCanonicalPlan,
  live: RecordedCanonicalPlan,
  side: ShiftedSide,
): boolean {
  const offTheSide = (plan: RecordedCanonicalPlan) =>
    JSON.stringify(
      plan.bases.filter((base) => !isOnTheShiftedSide(base, side)),
    );
  return offTheSide(afterS1) === offTheSide(live);
}

function isOnTheShiftedSide(
  base: RecordedPlanModule,
  { sink, shiftMm }: ShiftedSide,
): boolean {
  if (base.wall !== sink.wall) return false;
  return shiftMm > 0 ? base.startMm >= sink.endMm : base.endMm <= sink.startMm;
}

/** Read from the sink outward on the shifted side: S1's modules, up to the first module of the body the
 *  trade frees, stand in the live plan 600 mm further along, each with its own id, role, body and width
 *  — the hob's body alone may differ, and only in (c). */
function isTheShiftedSideShiftedUpToTheBodyGivenUp(
  { afterS1, live }: ComparedPlans,
  side: ShiftedSide & TradeShape,
): boolean {
  const fromTheSink = (plan: RecordedCanonicalPlan) =>
    plan.bases
      .filter((base) => isOnTheShiftedSide(base, side))
      .sort((left, right) =>
        side.shiftMm > 0
          ? left.startMm - right.startMm
          : right.startMm - left.startMm,
      );
  const before = fromTheSink(afterS1);
  const [dishwasher, ...after] = fromTheSink(live);
  if (dishwasher?.buildId !== DISHWASHER_IDENTITY.buildId) return false;
  const freedAt = before.findIndex((base) => base.buildId === side.freed);
  if (freedAt < 0) return false;
  const kept = before.slice(0, freedAt);
  return kept.every((base, index) =>
    isTheSameModuleShifted(base, after[index], side),
  );
}

function isTheSameModuleShifted(
  before: RecordedPlanModule,
  after: RecordedPlanModule | undefined,
  side: ShiftedSide & TradeShape,
): boolean {
  if (after === undefined) return false;
  const expectedBody =
    side.isHobReBodied && before.role === HOB_ROLE
      ? HOB_WITH_OVEN_BODY
      : before.buildId;
  return (
    after.id === before.id &&
    after.role === before.role &&
    after.buildId === expectedBody &&
    after.widthMm === before.widthMm &&
    after.startMm === before.startMm + side.shiftMm &&
    after.endMm === before.endMm + side.shiftMm
  );
}
