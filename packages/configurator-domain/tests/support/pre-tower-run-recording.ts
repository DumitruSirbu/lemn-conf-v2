// M7 wave 7D5b — the readers for the two recordings either side of S0b (the oven tower over the
// bottle, ADR 0110 Amendment M11), the classifier that says how they may differ, and the classifier
// that says how a plan may differ from the post-tower recording once S1 adds the dishwasher (ADR 0110
// Amendment M1, M2, M7(e), M8, M9).
//
// - **`7d5b-pre-tower-baseline.json`**, slice S0: **captured from `acb7b6f` with the production tree
//   clean**, the pre-state of S0b.
// - **`7d5b-post-tower-baseline.json`**, slice S0b: **captured from `c0018ef` plus S0b's uncommitted
//   edit to `optional-run-items.ts` (blob `7e8cbc1`), with no other production file changed**, the
//   pre-state of S1.
//
// Both by the method the earlier recordings used: rooms drawn from `approvedLRoom()` at seed 20260921
// and 480 runs (`fc.sample` and `fc.assert` draw the same rooms at that seed; both were checked), keys
// sorted, each composed through `planKitchenComposition` over `lShellFloorRuns` and stored as the whole
// `canonicalPlan` string, so a later comparison names the field and the module that moved. **The two
// draw the same 480 rooms and the same 16 witnesses**, which is what lets them be compared room by room
// without asking the planner anything. Beside the draw each records the plan's named witness rooms at
// 2600 mm, whole, because a 480-room draw reaches the 5 260-room class S0b changes only ten times and
// never at the rooms the plan and the owner reason from.
//
// **Never re-captured to fit a later wave** (plan risk 5): a late fix that moved either state is a new
// recording beside these, not a patch to them. Decoding goes through the pre-width reader's
// `parseRecordedCanonicalPlan`, so every whole-plan recording is read by one parser.
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

// ---------------------------------------------------------------------------------------------
// The one change S0b may make to a recorded plan.
// ---------------------------------------------------------------------------------------------

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
 * The plan S0b makes of a recorded pre-S0b plan it applies to, or `undefined` where it does not apply.
 * It applies where the recorded kitchen stands S1's bottle immediately after a `base-hob-oven`, on the
 * hob's wall, with **no tall column** (the bottle took the whole block) and **no pan drawer** (none
 * depends on the bottle). The result: the bottle's module becomes the block's innermost column, a
 * 600 mm oven tower starting where the bottle started; the hob becomes `base-hob-2drawer`; that wall's
 * floor width reads 600 where it read 300 and its remainder shrinks by the 300 mm difference. **Every
 * other field — every other module's id, role, body, wall and span, the cut, the dropped list, the
 * other wall — is carried unchanged**, so any further difference is "changed otherwise".
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

// ---------------------------------------------------------------------------------------------
// The changes S1 may make to a plan recorded after S0b (ADR 0110 Amendment M1, M2, M7(e), M8, M9).
// ---------------------------------------------------------------------------------------------

/** How a plan relates to the plan recorded after S0b, before S1. The M2 classes carry the leaf's own
 *  re-identification (M1 or (e)) on top of the re-planned run. */
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

// --- M1 -------------------------------------------------------------------------------------

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

// --- (e) ------------------------------------------------------------------------------------

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

// --- M2 -------------------------------------------------------------------------------------

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

/** **M2, a column back** (E3: *"block 2 → 3"*): the threshold drawer's module goes, and the block is
 *  re-laid from where it stood with one more pantry column at its free end. */
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

/** **M2, the bottle back** (E3: *"where L2 step 1 had put the threshold drawer in its place"*): the
 *  threshold drawer's module becomes the 300 mm bottle, and the same block is re-laid after it. Only
 *  where no bottle stood. */
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
 * The plan with the threshold drawer replaced (or removed) and the block beyond it re-laid by the
 * tall-end rule's own geometry (ADR 0110 E6.2): the columns, in the given bodies, stand one declared
 * module each from where the drawer's replacement ends; the wall's free end is where the recorded run
 * reached (its last module's end plus its remainder); and a bare remainder merges into the outermost
 * column only where that column is a door column and the merged opening is at most the empty-column
 * ceiling. Every module before the drawer, the other wall, the cut and `dropped` are carried unchanged,
 * and the wall's floor widths are the re-laid modules' widths.
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

// --- shared ---------------------------------------------------------------------------------

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
