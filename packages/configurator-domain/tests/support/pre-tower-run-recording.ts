// M7 wave 7D5b — the readers for the two recordings either side of S0b (the oven tower over the
// bottle, ADR 0110 Amendment M11), and the one classifier that says how they may differ.
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

import type { DesignRoom } from "../../src/index.js";
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
