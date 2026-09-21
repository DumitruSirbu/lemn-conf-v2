// M7 wave 7D5 S2 — ADR 0110 Amendment J1 (Q-H6 = A): the pan-drawer cabinet stands immediately
// before the hob in the reading order wherever every core role keeps its wall and the tall block keeps
// every column. It is decided first, against the core alone, and wins where it and the bottle cannot
// both stand (Q-H6b); once it stands the bottle gives way rather than a column (Q-H6c). Where it is
// refused against the core alone, S1's bottle is decided first and the pan drawer is tried beside it
// (the coordinator's fallback). The catalogue id is asserted as a literal rather than through
// `PAN_DRAWER_BASE_BUILD_ID`, so a wrong constant and a wrong composer cannot agree (ADR 0121
// decision 3(b)).
//
// 7D5 S3 / Q-H5 (owner ruling 2026-09-21): once the pan drawer and the bottle are decided, a kitchen
// whose plain cabinets *D* reach six with fewer than two drawers among them gains a 600 mm threshold
// drawer after the hob — in the bottle's place where that costs no tall column, otherwise after the
// bottle at the cost of at most one. The census below derives that step too, and keeps S2's own
// decisions counted on the kitchen S2 decided before it. The owner's third candidate — the bottle's
// place for one column, where keeping the bottle would cost two — is not derived here: the approved
// policy never reaches it, and its declared-run witnesses are in `threshold-drawer-after-the-hob`.
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredColumnSizes,
  GENERATION_PRIORITIES,
  isComposedStorageSlot,
  KITCHEN_L_DESIGN,
  lShellFloorRuns,
  planKitchenComposition,
  wallLengthMm,
  type DesignRoom,
  type DesignWall,
  type GenerationCoreRole,
  type GenerationRun,
  type KitchenCompositionPlan,
  type PlannedGenerationBase,
} from "../../src/index.js";
import { planTallEndBlock } from "../../src/generation/tall-end-rule.js";

const DECLARED_COLUMNS = declaredColumnSizes(
  buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN)),
);
const PAN_DRAWER_BODY = "base-panbank";
const PAN_DRAWER_ID = "pan-drawer";
const BOTTLE_BODY = "base-bottle-cargo";
const THREE_DRAWER_BODY = "base-3drawer";
const BOTTLE_WIDTH_MM = 300;
const PAN_DRAWER_WIDTH_MM = 600;
const DRAWER_CABINET_BODIES = new Set([THREE_DRAWER_BODY, PAN_DRAWER_BODY]);
const THRESHOLD_DRAWER_ID = "threshold-drawer";
const THRESHOLD_DRAWER_WIDTH_MM = 600;
/** Q-H5's numbers as the owner stated them: *D* of six, two drawers, and one column at most. */
const OWNERS_PLAIN_CABINET_THRESHOLD = 6;
const OWNERS_DRAWER_COUNT = 2;
const OWNERS_MOST_COLUMNS_FOR_THE_THRESHOLD_DRAWER = 1;
const TALL_BODIES = new Set(["tall-oven-tower", "tall-pantry"]);

function roomOf(widthMm: number, depthMm: number): DesignRoom {
  return { shape: "L", widthMm, depthMm, heightMm: 2600 };
}

function planFor(room: DesignRoom): KitchenCompositionPlan {
  return planKitchenComposition({
    room,
    runs: lShellFloorRuns(room),
    columns: DECLARED_COLUMNS,
  });
}

/** The wider entered wall reads last, and the narrower one is read in reverse (ADR 0120 E). */
function readingWallsOf(room: DesignRoom): {
  readonly prefix: DesignWall;
  readonly suffix: DesignWall;
} {
  const isWallBWider = wallLengthMm("B", room) > wallLengthMm("A", room);
  return isWallBWider
    ? { prefix: "A", suffix: "B" }
    : { prefix: "B", suffix: "A" };
}

function alongTheWall(
  plan: KitchenCompositionPlan,
  wall: DesignWall,
): readonly PlannedGenerationBase[] {
  return plan.bases
    .filter((base) => base.wall === wall)
    .sort((left, right) => left.startMm - right.startMm);
}

function inReadingOrder(
  plan: KitchenCompositionPlan,
): readonly PlannedGenerationBase[] {
  const { prefix, suffix } = readingWallsOf(plan.room);
  return [
    ...[...alongTheWall(plan, prefix)].reverse(),
    ...alongTheWall(plan, suffix),
  ];
}

function panDrawersIn(plan: KitchenCompositionPlan): number {
  return plan.bases.filter((base) => base.buildId === PAN_DRAWER_BODY).length;
}

describe("7D5 S2 — the pan drawer reads immediately before the hob", () => {
  it.each([
    { name: "wall A wider", room: roomOf(6000, 4100) },
    { name: "wall B wider", room: roomOf(4100, 6000) },
  ])(
    "stands between the preparation cabinet and the hob, $name",
    ({ room }) => {
      const reading = inReadingOrder(planFor(room));
      const hobAt = reading.findIndex((base) => base.role === "hob");

      expect(
        reading.slice(hobAt - 3, hobAt + 2).map((base) => base.buildId),
      ).toEqual([
        "base-sink",
        "base-3drawer",
        PAN_DRAWER_BODY,
        "base-hob-2drawer",
        BOTTLE_BODY,
      ]);
      expect(
        reading.filter((base) => base.buildId === PAN_DRAWER_BODY),
      ).toHaveLength(1);
    },
  );

  it.each([
    { name: "wall A wider", room: roomOf(6000, 4100) },
    { name: "wall B wider", room: roomOf(4100, 6000) },
  ])(
    "keeps the pan drawer on the hob's wall, the wider one, $name",
    ({ room }) => {
      const plan = planFor(room);
      const { suffix } = readingWallsOf(room);
      const wallOf = (buildId: string) =>
        plan.bases.find((base) => base.buildId === buildId)?.wall;

      expect(wallOf(PAN_DRAWER_BODY)).toBe(suffix);
      expect(plan.bases.find((base) => base.role === "hob")?.wall).toBe(suffix);
      expect(plan.bases.find((base) => base.role === "sink")?.wall).toBe(
        suffix,
      );
    },
  );
});

describe("7D5 S2 — the pan drawer is omitted where it would cost the kitchen", () => {
  // The hob's wall holds the whole three-column block and no composed storage slot besides, so the
  // only 600 mm module the pan drawer could take is a column. Both mirrors, so no wall letter decides.
  it.each([
    { name: "wall A wider", room: roomOf(5000, 3000) },
    { name: "wall B wider", room: roomOf(3000, 5000) },
  ])("keeps all three tall columns instead, $name", ({ room }) => {
    const plan = planFor(room);
    const { suffix } = readingWallsOf(room);
    const onTheHobsWall = alongTheWall(plan, suffix);

    expect(panDrawersIn(plan)).toBe(0);
    expect(
      onTheHobsWall.filter((base) => TALL_BODIES.has(base.buildId)),
    ).toHaveLength(3);
    expect(onTheHobsWall.filter(isComposedStorageSlot)).toHaveLength(0);
  });

  // The pan drawer fits here only across a different wall cut, which would carry a core role off
  // the wider wall (ADR 0120 Amendment E) — the same population S1's bottle is omitted from.
  it("keeps the sink on the wider wall instead, 1500 x 2800", () => {
    const plan = planFor(roomOf(1500, 2800));

    expect(panDrawersIn(plan)).toBe(0);
    expect(plan.dropped).toEqual(["fridge"]);
    expect(plan.bases.find((base) => base.role === "sink")?.wall).toBe("B");
    expect(plan.bases.find((base) => base.role === "hob")?.wall).toBe("B");
  });
});

/** Every drawer cabinet in the plan, the preparation cabinet included: the group the owner's order
 *  puts astride the hob, counted by catalogue row rather than by role or id. */
function drawerCabinetsIn(plan: KitchenCompositionPlan): number {
  return plan.bases.filter((base) => DRAWER_CABINET_BODIES.has(base.buildId))
    .length;
}

function composedDrawerSlotsIn(
  plan: KitchenCompositionPlan,
): readonly PlannedGenerationBase[] {
  return plan.bases.filter(
    (base) => isComposedStorageSlot(base) && base.buildId === THREE_DRAWER_BODY,
  );
}

function buildIdsReadAroundTheHob(
  plan: KitchenCompositionPlan,
  span: { readonly before: number; readonly after: number },
): readonly string[] {
  const reading = inReadingOrder(plan);
  const hobAt = reading.findIndex((base) => base.role === "hob");
  return reading
    .slice(hobAt - span.before, hobAt + span.after + 1)
    .map((base) => base.buildId);
}

describe("7D5 S2 — where the hob's wall has room for one more cabinet, the pan drawer takes it", () => {
  // Q-H6a = A (owner, 2026-09-21): the post-hob drawer slot is the module the pan drawer displaces,
  // so the kitchen keeps two drawer cabinets rather than gaining a third. 92 015 of the 92 446
  // pan-drawer rooms are this class. One witness per reading direction and per block arm.
  //
  // 7D5 S3 / Q-H5: the block arm's witness was 5200 x 5500 until the threshold drawer gave that room
  // a third drawer cabinet after the bottle (its *D* is seven). It moved to 4500 x 5500 — the same
  // arm, the same reading and the same three columns — where *D* stays below the owner's six, so the
  // S2 subject is asserted whole rather than in part. 5200 x 5500 is now a threshold witness in
  // `threshold-drawer-after-the-hob.test.ts`.
  it.each([
    {
      name: "3602 x 1700, wall A wider, no block",
      room: roomOf(3602, 1700),
      hob: "base-hob-oven",
      afterTheBottle: [],
    },
    {
      name: "4500 x 5500, wall B wider, three columns",
      room: roomOf(4500, 5500),
      hob: "base-hob-2drawer",
      afterTheBottle: ["tall-oven-tower"],
    },
  ])(
    "reads sink, drawer, pan drawer, hob, bottle and keeps two drawer cabinets, $name",
    ({ room, hob, afterTheBottle }) => {
      const plan = planFor(room);

      expect(buildIdsReadAroundTheHob(plan, { before: 3, after: 2 })).toEqual([
        "base-sink",
        THREE_DRAWER_BODY,
        PAN_DRAWER_BODY,
        hob,
        BOTTLE_BODY,
        ...afterTheBottle,
      ]);
      expect(composedDrawerSlotsIn(plan)).toEqual([]);
      expect(drawerCabinetsIn(plan)).toBe(2);
      expect(plainCabinetCountOf(plan)).toBeLessThan(
        OWNERS_PLAIN_CABINET_THRESHOLD,
      );
    },
  );
});

/** E1's *D* before Q-H5: the composed slots and the pan drawer, read off the plan by id. */
function plainCabinetCountOf(plan: KitchenCompositionPlan): number {
  return plan.bases.filter(
    (base) => isComposedStorageSlot(base) || base.id === PAN_DRAWER_ID,
  ).length;
}

describe("7D5 S2 — where the hob's wall has room for two, both drawer cabinets stand", () => {
  // The 431 rooms of the approved range that keep the post-hob drawer slot besides the pan drawer
  // all sit at wall A = 6000 (the census pins that). Wall B's run is shorter than wall A's at the same
  // entered length, so the mirror 4100 x 6000 is a one-slot room — and so is 10 mm less of wall A.
  it("keeps three drawer cabinets, the slot still first after the bottle, 6000 x 4100", () => {
    const plan = planFor(roomOf(6000, 4100));

    expect(buildIdsReadAroundTheHob(plan, { before: 1, after: 3 })).toEqual([
      PAN_DRAWER_BODY,
      "base-hob-2drawer",
      BOTTLE_BODY,
      THREE_DRAWER_BODY,
      "tall-oven-tower",
    ]);
    expect(composedDrawerSlotsIn(plan)).toHaveLength(1);
    expect(drawerCabinetsIn(plan)).toBe(3);
  });

  it.each([
    { name: "10 mm less of wall A, 5990 x 4100", room: roomOf(5990, 4100) },
    { name: "the mirror, 4100 x 6000", room: roomOf(4100, 6000) },
  ])("gives the post-hob slot to the pan drawer, $name", ({ room }) => {
    const plan = planFor(room);

    expect(buildIdsReadAroundTheHob(plan, { before: 1, after: 2 })).toEqual([
      PAN_DRAWER_BODY,
      "base-hob-2drawer",
      BOTTLE_BODY,
      "tall-oven-tower",
    ]);
    expect(composedDrawerSlotsIn(plan)).toEqual([]);
    expect(drawerCabinetsIn(plan)).toBe(2);
  });
});

describe("7D5 S2 — the hob on the wall read in reverse", () => {
  // Unreachable in the approved range (the census below counts it at zero), and so reached through
  // declared runs: the narrower wall is given room for the whole core, the bottle and the pan drawer,
  // and the wider one room for nothing. The hob then reads on the prefix wall, and the pan drawer
  // must stay there with it — the branch that moves the corner cut one item later.
  const CORE_BOTTLE_AND_PAN_DRAWER_MM =
    GENERATION_PRIORITIES.reduce((sum, item) => sum + item.widthMm, 0) +
    BOTTLE_WIDTH_MM +
    PAN_DRAWER_WIDTH_MM;
  const NOTHING_FITS_MM = 250;

  function runsGivingThePrefixWall(
    prefix: DesignWall,
    capacityMm: number,
  ): Readonly<Record<DesignWall, GenerationRun>> {
    const roomy = { startMm: 900, endMm: 900 + capacityMm };
    const cramped = { startMm: 900, endMm: 900 + NOTHING_FITS_MM };
    return prefix === "A"
      ? { A: { wall: "A", ...roomy }, B: { wall: "B", ...cramped } }
      : { A: { wall: "A", ...cramped }, B: { wall: "B", ...roomy } };
  }

  const MIRRORS = [
    { name: "wall A read in reverse", room: roomOf(1500, 4000), prefix: "A" },
    { name: "wall B read in reverse", room: roomOf(4000, 1500), prefix: "B" },
  ] as const;

  it.each(MIRRORS)(
    "reads the pan drawer immediately before the hob, on the hob's wall, $name",
    ({ room, prefix }) => {
      const plan = planKitchenComposition({
        room,
        runs: runsGivingThePrefixWall(prefix, CORE_BOTTLE_AND_PAN_DRAWER_MM),
        columns: DECLARED_COLUMNS,
      });
      const reading = inReadingOrder(plan);
      const hobAt = reading.findIndex((base) => base.role === "hob");

      expect(readingWallsOf(room).prefix).toBe(prefix);
      expect(plan.dropped).toEqual([]);
      expect(reading.map((base) => [base.buildId, base.wall])).toEqual([
        ["fridge-free", prefix],
        ["base-sink", prefix],
        [THREE_DRAWER_BODY, prefix],
        [PAN_DRAWER_BODY, prefix],
        ["base-hob-oven", prefix],
        [BOTTLE_BODY, prefix],
      ]);
      expect(reading[hobAt - 1]?.id).toBe(PAN_DRAWER_ID);
    },
  );

  // One millimetre short of room for both, the core fits with either but not with the two together,
  // so this is Q-H6b on the reversed wall: the pan drawer is decided first and the bottle gives way.
  it.each(MIRRORS)(
    "keeps the pan drawer and omits the bottle one millimetre short of room for both, $name",
    ({ room, prefix }) => {
      const plan = planKitchenComposition({
        room,
        runs: runsGivingThePrefixWall(
          prefix,
          CORE_BOTTLE_AND_PAN_DRAWER_MM - 1,
        ),
        columns: DECLARED_COLUMNS,
      });

      expect(plan.bases.some((base) => base.buildId === BOTTLE_BODY)).toBe(
        false,
      );
      expect(
        inReadingOrder(plan).map((base) => [base.buildId, base.wall]),
      ).toEqual([
        ["fridge-free", prefix],
        ["base-sink", prefix],
        [THREE_DRAWER_BODY, prefix],
        [PAN_DRAWER_BODY, prefix],
        ["base-hob-oven", prefix],
      ]);
    },
  );

  // One millimetre short of room for the core and the pan drawer, the pan drawer is refused against
  // the core alone, S1's bottle stands, and the pan drawer cannot stand beside it either.
  it.each(MIRRORS)(
    "keeps S1's bottle and omits the pan drawer one millimetre short of room for it, $name",
    ({ room, prefix }) => {
      const plan = planKitchenComposition({
        room,
        runs: runsGivingThePrefixWall(
          prefix,
          CORE_BOTTLE_AND_PAN_DRAWER_MM - BOTTLE_WIDTH_MM - 1,
        ),
        columns: DECLARED_COLUMNS,
      });

      expect(panDrawersIn(plan)).toBe(0);
      expect(
        inReadingOrder(plan).map((base) => [base.buildId, base.wall]),
      ).toEqual([
        ["fridge-free", prefix],
        ["base-sink", prefix],
        [THREE_DRAWER_BODY, prefix],
        ["base-hob-oven", prefix],
        [BOTTLE_BODY, prefix],
      ]);
    },
  );
});

// ---------------------------------------------------------------------------------------------
// The derivation — a kitchen composed from run capacities, the public priority list and 7D3's own
// block rule (`planTallEndBlock`), without asking the composer anything. Two kitchens are derived
// per room: **S1's**, the bottle alone as `c67b4ee` composed it, and **S2's**, the pan drawer decided
// first against the core alone (J1, Q-H6b), the bottle beside it only where no column is lost
// (Q-H6c), and S1's bottle first wherever the pan drawer is refused against the core alone (the
// coordinator's fallback). A composer that decided the bottle first, dropped the fallback or let the
// bottle take a column disagrees with a derivation rather than with itself.
// ---------------------------------------------------------------------------------------------

const GRID_STEP_MM = 10;
const STORAGE_MODULE_MM = 600;
const HOB_WITH_ITS_OWN_OVEN = "base-hob-oven";

const APPROVED_L = (() => {
  const shape = APPROVED_ROOM_POLICY.buildableShapes.L;
  if (!shape) throw new Error("the approved policy has no L");
  return shape;
})();

const CORE_ATTEMPTS = [
  GENERATION_PRIORITIES,
  GENERATION_PRIORITIES.filter((item) => item.role !== "fridge"),
  GENERATION_PRIORITIES.filter(
    (item) => item.role !== "fridge" && item.role !== "preparation",
  ),
] as const;

type ReadingSide = "prefix" | "suffix";
type Capacities = Readonly<Record<ReadingSide, number>>;

/** One item of a derived run, in reading order. */
interface DerivedItem {
  readonly kind:
    | GenerationCoreRole
    | "pan-drawer"
    | "bottle"
    | typeof THRESHOLD_DRAWER_ID;
  readonly widthMm: number;
}

/** A derived run and where it splits: `items.slice(0, cut)` reads on the prefix wall. */
interface DerivedRun {
  readonly items: readonly DerivedItem[];
  readonly cut: number;
}

/** Everything about a room the derivation reads besides the run itself. */
interface DerivationBasis {
  readonly room: DesignRoom;
  readonly walls: Readonly<Record<ReadingSide, DesignWall>>;
  readonly capacities: Capacities;
  readonly dropped: readonly GenerationCoreRole[];
}

/** Why the S2 derivation stood what it stood, beyond the plain case. */
type S2Decision =
  | "pan-drawer-first"
  | "pan-drawer-beside-s1-bottle"
  | "pan-drawer-refused"
  | "tower-kept-over-the-bottle";

interface DerivedS2 {
  readonly run: DerivedRun;
  readonly decision: S2Decision;
  readonly bottleGaveWayTo?: "the pan drawer" | "a tall column" | undefined;
}

function runWidthMm(run: GenerationRun): number {
  return Math.max(0, run.endMm - run.startMm);
}

function sumOf(widthsMm: readonly number[]): number {
  return widthsMm.reduce((sum, widthMm) => sum + widthMm, 0);
}

function widthsOn(run: DerivedRun, side: ReadingSide): readonly number[] {
  const onSide =
    side === "prefix" ? run.items.slice(0, run.cut) : run.items.slice(run.cut);
  return onSide.map((item) => item.widthMm);
}

function freeMmOn(
  run: DerivedRun,
  side: ReadingSide,
  capacities: Capacities,
): number {
  return capacities[side] - sumOf(widthsOn(run, side));
}

function fitsAcrossTheCorner(run: DerivedRun, capacities: Capacities): boolean {
  return (
    freeMmOn(run, "prefix", capacities) >= 0 &&
    freeMmOn(run, "suffix", capacities) >= 0
  );
}

/** The core the drop order leaves first, cut as near the fridge-first preference as fits. */
function derivedCore(
  room: DesignRoom,
): { readonly basis: DerivationBasis; readonly core: DerivedRun } | undefined {
  const runs = lShellFloorRuns(room);
  const walls = readingWallsOf(room);
  const capacities = {
    prefix: runWidthMm(runs[walls.prefix]),
    suffix: runWidthMm(runs[walls.suffix]),
  };
  for (const kept of CORE_ATTEMPTS) {
    const items = kept.map((item) => ({
      kind: item.role,
      widthMm: item.widthMm,
    }));
    const cut = preferredCut(items, capacities, kept[0]?.role === "fridge");
    if (cut === undefined) continue;
    const keptRoles = new Set<string>(kept.map((item) => item.role));
    const dropped = GENERATION_PRIORITIES.map((item) => item.role).filter(
      (role) => !keptRoles.has(role),
    );
    return {
      basis: { room, walls, capacities, dropped },
      core: { items, cut },
    };
  }
  return undefined;
}

function preferredCut(
  items: readonly DerivedItem[],
  capacities: Capacities,
  isFridgeFirst: boolean,
): number | undefined {
  const preferred = isFridgeFirst ? 1 : 0;
  const distance = (cut: number) => Math.abs(cut - preferred);
  return Array.from({ length: items.length + 1 }, (_, cut) => cut)
    .filter((cut) => fitsAcrossTheCorner({ items, cut }, capacities))
    .sort((left, right) => distance(left) - distance(right) || left - right)[0];
}

function hobIndexOf(run: DerivedRun): number {
  return run.items.findIndex((item) => item.kind === "hob");
}

/** J1: immediately before the hob, on the hob's side of the cut. */
function withPanDrawerBeforeTheHob(run: DerivedRun): DerivedRun {
  const hobAt = hobIndexOf(run);
  return {
    items: [
      ...run.items.slice(0, hobAt),
      { kind: "pan-drawer", widthMm: PAN_DRAWER_WIDTH_MM },
      ...run.items.slice(hobAt),
    ],
    cut: hobAt < run.cut ? run.cut + 1 : run.cut,
  };
}

/** H1 and J3: last in the reading order, on the prefix wall only where the whole run already is. */
function withBottleAfterTheHob(run: DerivedRun): DerivedRun {
  const isWholeRunOnThePrefix = run.cut === run.items.length;
  return {
    items: [...run.items, { kind: "bottle", widthMm: BOTTLE_WIDTH_MM }],
    cut: isWholeRunOnThePrefix ? run.cut + 1 : run.cut,
  };
}

/** 7D3's block on the suffix wall's free end, read from its own rule. */
function tallBlockOf(run: DerivedRun, basis: DerivationBasis) {
  const freeMm = freeMmOn(run, "suffix", basis.capacities);
  return planTallEndBlock({
    coreSurvivedWhole: basis.dropped.length === 0,
    hobStandsOnTheFreeEndWall: hobIndexOf(run) >= run.cut,
    freeEndStorageCount: Math.floor(freeMm / STORAGE_MODULE_MM),
    freeEndRemainderMm: freeMm % STORAGE_MODULE_MM,
    roomHeightMm: basis.room.heightMm,
    hobWithItsOwnOvenBuildId: HOB_WITH_ITS_OWN_OVEN,
    declared: DECLARED_COLUMNS,
  });
}

function columnCountOf(run: DerivedRun, basis: DerivationBasis): number {
  return tallBlockOf(run, basis).columns.length;
}

/** Fits in place and keeps every column the run without it has. */
function standsWithoutLoss(
  candidate: DerivedRun,
  without: DerivedRun,
  basis: DerivationBasis,
): boolean {
  return (
    fitsAcrossTheCorner(candidate, basis.capacities) &&
    columnCountOf(candidate, basis) >= columnCountOf(without, basis)
  );
}

/** S1 (`c67b4ee`): the bottle wherever its in-place cut fits, whatever it costs. */
function derivedS1Run(core: DerivedRun, basis: DerivationBasis): DerivedRun {
  const withBottle = withBottleAfterTheHob(core);
  return fitsAcrossTheCorner(withBottle, basis.capacities) ? withBottle : core;
}

/** S2: the pan drawer first against the core alone, then the bottle beside it where no column is
 *  lost; where the pan drawer is refused there, S1's bottle first and the pan drawer beside it —
 *  unless, with no pan drawer beside it, S1's bottle would leave the core's block no column at all,
 *  in which case the tower is kept and the bottle omitted (7D5b S0b / ADR 0110 M11). */
function derivedS2(core: DerivedRun, basis: DerivationBasis): DerivedS2 {
  const panDrawerFirst = withPanDrawerBeforeTheHob(core);
  if (standsWithoutLoss(panDrawerFirst, core, basis)) {
    const both = withBottleAfterTheHob(panDrawerFirst);
    if (standsWithoutLoss(both, panDrawerFirst, basis)) {
      return { run: both, decision: "pan-drawer-first" };
    }
    return {
      run: panDrawerFirst,
      decision: "pan-drawer-first",
      bottleGaveWayTo: bottleGaveWayTo(both, core, basis),
    };
  }
  const s1 = derivedS1Run(core, basis);
  const beside = withPanDrawerBeforeTheHob(s1);
  if (standsWithoutLoss(beside, s1, basis)) {
    return { run: beside, decision: "pan-drawer-beside-s1-bottle" };
  }
  return isTheTowerTakenByTheBottleAlone(s1, core, basis)
    ? { run: core, decision: "tower-kept-over-the-bottle" }
    : { run: s1, decision: "pan-drawer-refused" };
}

/** 7D5b S0b / ADR 0110 M11, derived from the column count alone: the core's block stands at least
 *  one column (its innermost is the oven tower, E12.2) and S1's bottle leaves it none. */
function isTheTowerTakenByTheBottleAlone(
  s1: DerivedRun,
  core: DerivedRun,
  basis: DerivationBasis,
): boolean {
  return columnCountOf(core, basis) > 0 && columnCountOf(s1, basis) === 0;
}

/** Why a bottle S1 would have stood is missing beside the pan drawer, or `undefined` where S1 would
 *  not have stood it either. */
function bottleGaveWayTo(
  both: DerivedRun,
  core: DerivedRun,
  basis: DerivationBasis,
): DerivedS2["bottleGaveWayTo"] {
  if (fitsAcrossTheCorner(both, basis.capacities)) return "a tall column";
  return fitsAcrossTheCorner(withBottleAfterTheHob(core), basis.capacities)
    ? "the pan drawer"
    : undefined;
}

/** How Q-H5 answered a room, derived from the kitchen S2 decided (7D5 S3). */
type ThresholdDecision =
  | "not short of drawers"
  | "in the bottle's place"
  | "after the bottle, for a column"
  | "after the hob, for a column"
  | "after the hob, at no cost"
  | "after the bottle, at no cost"
  | "refused, it would cost two columns"
  | "refused, it does not fit";

interface DerivedThreshold {
  readonly run: DerivedRun;
  readonly decision: ThresholdDecision;
}

/** E1's *D* and its drawers on a derived run: the composed slots on both walls, the one slot read
 *  first after the hob being the drawer (D15.3), plus the pan drawer and the threshold drawer. The
 *  preparation cabinet, the bottle and the columns are not counted. */
function plainCabinetsOf(
  run: DerivedRun,
  basis: DerivationBasis,
): { readonly count: number; readonly drawers: number } {
  const prefixSlots = Math.floor(
    freeMmOn(run, "prefix", basis.capacities) / STORAGE_MODULE_MM,
  );
  const suffixSlots = tallBlockOf(run, basis).storageCount;
  const isHobOnTheSuffix = hobIndexOf(run) >= run.cut;
  const slotsReadAfterTheHob = isHobOnTheSuffix
    ? suffixSlots
    : prefixSlots + suffixSlots;
  const drawerModules = run.items.filter(
    (item) => item.kind === "pan-drawer" || item.kind === THRESHOLD_DRAWER_ID,
  ).length;
  return {
    count: prefixSlots + suffixSlots + drawerModules,
    drawers: Math.min(1, slotsReadAfterTheHob) + drawerModules,
  };
}

function isShortOfTheOwnersDrawers(
  run: DerivedRun,
  basis: DerivationBasis,
): boolean {
  const { count, drawers } = plainCabinetsOf(run, basis);
  return (
    count >= OWNERS_PLAIN_CABINET_THRESHOLD && drawers < OWNERS_DRAWER_COUNT
  );
}

/** H1's order: the threshold drawer is read last, after the hob and after the bottle. */
function withThresholdDrawerLast(run: DerivedRun): DerivedRun {
  const isWholeRunOnThePrefix = run.cut === run.items.length;
  return {
    items: [
      ...run.items,
      { kind: THRESHOLD_DRAWER_ID, widthMm: THRESHOLD_DRAWER_WIDTH_MM },
    ],
    cut: isWholeRunOnThePrefix ? run.cut + 1 : run.cut,
  };
}

/** The drawer standing where the bottle stood, every other item on its wall. */
function withThresholdDrawerInTheBottlesPlace(run: DerivedRun): DerivedRun {
  const bottleAt = run.items.findIndex((item) => item.kind === "bottle");
  const withoutTheBottle = {
    items: run.items.filter((_, index) => index !== bottleAt),
    cut: bottleAt < run.cut ? run.cut - 1 : run.cut,
  };
  return withThresholdDrawerLast(withoutTheBottle);
}

function columnsLost(
  candidate: DerivedRun,
  without: DerivedRun,
  basis: DerivationBasis,
): number {
  return columnCountOf(without, basis) - columnCountOf(candidate, basis);
}

/** Q-H5 on the kitchen S2 decided: the bottle gives way only where that alone lets the drawer stand
 *  at no column's cost; otherwise the drawer is read after the bottle (or the hob) where it costs at
 *  most one column; otherwise the kitchen stays as S2 decided it. */
function derivedThreshold(
  s2: DerivedRun,
  basis: DerivationBasis,
): DerivedThreshold {
  if (!isShortOfTheOwnersDrawers(s2, basis)) {
    return { run: s2, decision: "not short of drawers" };
  }
  const hasBottle = s2.items.some((item) => item.kind === "bottle");
  if (hasBottle) {
    const inItsPlace = withThresholdDrawerInTheBottlesPlace(s2);
    if (
      fitsAcrossTheCorner(inItsPlace, basis.capacities) &&
      columnsLost(inItsPlace, s2, basis) <= 0
    ) {
      return { run: inItsPlace, decision: "in the bottle's place" };
    }
  }
  const last = withThresholdDrawerLast(s2);
  if (!fitsAcrossTheCorner(last, basis.capacities)) {
    return { run: s2, decision: "refused, it does not fit" };
  }
  const lost = columnsLost(last, s2, basis);
  if (lost > OWNERS_MOST_COLUMNS_FOR_THE_THRESHOLD_DRAWER) {
    return { run: s2, decision: "refused, it would cost two columns" };
  }
  return { run: last, decision: appendedDecision({ hasBottle, lost }) };
}

function appendedDecision(appended: {
  readonly hasBottle: boolean;
  readonly lost: number;
}): ThresholdDecision {
  const isForAColumn = appended.lost > 0;
  if (appended.hasBottle) {
    return isForAColumn
      ? "after the bottle, for a column"
      : "after the bottle, at no cost";
  }
  return isForAColumn
    ? "after the hob, for a column"
    : "after the hob, at no cost";
}

/** ADR 0110 L2's discriminator: what the drawer read after the bottle would have cost the kitchen S2
 *  decided. The bottle may give way only where keeping it is not free — the drawer after it would
 *  cost a tall column or would not fit at all. */
function keptBottleAlternative(
  s2: DerivedRun,
  basis: DerivationBasis,
): "costsAColumn" | "doesNotFit" | "free" {
  const afterTheBottle = withThresholdDrawerLast(s2);
  if (!fitsAcrossTheCorner(afterTheBottle, basis.capacities))
    return "doesNotFit";
  return columnsLost(afterTheBottle, s2, basis) >= 1 ? "costsAColumn" : "free";
}

/** A kitchen as the census compares it, one reading-order side at a time. */
interface KitchenSummary {
  readonly dropped: readonly GenerationCoreRole[];
  readonly wallOfRole: readonly (readonly [string, DesignWall])[];
  readonly hasBottle: boolean;
  readonly hasPanDrawer: boolean;
  readonly hasThresholdDrawer: boolean;
  readonly columnBodies: readonly string[];
  readonly hobBody: string | undefined;
  readonly composedSlots: Readonly<Record<ReadingSide, number>>;
  readonly remainderMm: Readonly<Record<ReadingSide, number>>;
}

function summaryOfDerived(
  run: DerivedRun,
  basis: DerivationBasis,
): KitchenSummary {
  const block = tallBlockOf(run, basis);
  const prefixFreeMm = freeMmOn(run, "prefix", basis.capacities);
  const kinds = run.items.map((item) => item.kind);
  return {
    dropped: basis.dropped,
    wallOfRole: run.items
      .flatMap((item, index): [string, DesignWall][] =>
        item.kind === "bottle" ||
        item.kind === "pan-drawer" ||
        item.kind === THRESHOLD_DRAWER_ID
          ? []
          : [
              [
                item.kind,
                index < run.cut ? basis.walls.prefix : basis.walls.suffix,
              ],
            ],
      )
      .sort(),
    hasBottle: kinds.includes("bottle"),
    hasPanDrawer: kinds.includes("pan-drawer"),
    hasThresholdDrawer: kinds.includes(THRESHOLD_DRAWER_ID),
    columnBodies: block.columns.map((column) => column.buildId),
    hobBody: block.hobBuildId,
    composedSlots: {
      prefix: Math.floor(prefixFreeMm / STORAGE_MODULE_MM),
      suffix: block.storageCount,
    },
    remainderMm: {
      prefix: prefixFreeMm % STORAGE_MODULE_MM,
      suffix: block.remainderMm,
    },
  };
}

function summaryOfPlan(plan: KitchenCompositionPlan): KitchenSummary {
  const walls = readingWallsOf(plan.room);
  const slotsOn = (wall: DesignWall) =>
    alongTheWall(plan, wall).filter(isComposedStorageSlot).length;
  return {
    dropped: plan.dropped,
    wallOfRole: plan.bases
      .filter((base) => base.role !== "storage")
      .map((base): [string, DesignWall] => [base.role, base.wall])
      .sort(),
    hasBottle: plan.bases.some((base) => base.buildId === BOTTLE_BODY),
    hasPanDrawer: panDrawersIn(plan) > 0,
    hasThresholdDrawer: plan.bases.some(
      (base) => base.id === THRESHOLD_DRAWER_ID,
    ),
    columnBodies: alongTheWall(plan, walls.suffix)
      .filter((base) => TALL_BODIES.has(base.buildId))
      .map((base) => base.buildId),
    hobBody: plan.bases.find((base) => base.role === "hob")?.buildId,
    composedSlots: {
      prefix: slotsOn(walls.prefix),
      suffix: slotsOn(walls.suffix),
    },
    remainderMm: {
      prefix: plan.remainderMm[walls.prefix],
      suffix: plan.remainderMm[walls.suffix],
    },
  };
}

/** Every field in which two summaries differ, named. */
function differences(
  got: KitchenSummary,
  want: KitchenSummary,
): readonly string[] {
  return (Object.keys(want) as (keyof KitchenSummary)[])
    .filter(
      (field) => JSON.stringify(got[field]) !== JSON.stringify(want[field]),
    )
    .map(
      (field) =>
        `${field} ${JSON.stringify(got[field])} != ${JSON.stringify(want[field])}`,
    );
}

/** Where the pan drawer itself is not what J1 places: one module, its own id, before the hob. */
function panDrawerPlacementFaults(
  plan: KitchenCompositionPlan,
): readonly string[] {
  const reading = inReadingOrder(plan);
  const hobAt = reading.findIndex((base) => base.role === "hob");
  const beforeTheHob = reading[hobAt - 1];
  const faults: string[] = [];
  if (panDrawersIn(plan) !== 1)
    faults.push(`${String(panDrawersIn(plan))} pan drawers`);
  if (beforeTheHob?.buildId !== PAN_DRAWER_BODY)
    faults.push("not read before the hob");
  if (beforeTheHob?.id !== PAN_DRAWER_ID)
    faults.push(`id ${String(beforeTheHob?.id)}`);
  if (beforeTheHob && isComposedStorageSlot(beforeTheHob))
    faults.push("reads as a slot");
  if (beforeTheHob?.widthMm !== PAN_DRAWER_WIDTH_MM)
    faults.push("not one module wide");
  if (beforeTheHob?.wall !== reading[hobAt]?.wall)
    faults.push("off the hob's wall");
  return faults;
}

/** What `c67b4ee` promised and S2 must keep: the same core on the same walls, and no column fewer —
 *  but for the one column Q-H5 lets the threshold drawer cost (7D5 S3, owner 2026-09-21). */
function lossesAgainstS1(
  plan: KitchenSummary,
  s1: KitchenSummary,
  columnsTheThresholdDrawerMayCost: number,
): readonly string[] {
  const losses: string[] = [];
  if (JSON.stringify(plan.dropped) !== JSON.stringify(s1.dropped))
    losses.push("dropped");
  if (JSON.stringify(plan.wallOfRole) !== JSON.stringify(s1.wallOfRole))
    losses.push("core walls");
  if (
    plan.columnBodies.length <
    s1.columnBodies.length - columnsTheThresholdDrawerMayCost
  )
    losses.push("a tall column");
  return losses;
}

/** 7D5b S0b / ADR 0110 M11 on the finished plan, against S1's kitchen: the bottle is out, no pan
 *  drawer stands, exactly one column returns and it is the oven tower, and the hob loses its oven. */
function towerKeptOverTheBottleFaults(
  plan: KitchenSummary,
  s1: KitchenSummary,
): readonly string[] {
  const faults: string[] = [];
  if (!s1.hasBottle) faults.push("S1 stood no bottle");
  if (plan.hasBottle) faults.push("the bottle stands");
  if (plan.hasPanDrawer) faults.push("a pan drawer stands");
  if (plan.columnBodies.length !== s1.columnBodies.length + 1)
    faults.push(`${String(plan.columnBodies.length)} columns`);
  if (plan.columnBodies[0] !== "tall-oven-tower")
    faults.push(`innermost ${String(plan.columnBodies[0])}`);
  if (
    plan.hobBody !== "base-hob-2drawer" ||
    s1.hobBody !== HOB_WITH_ITS_OWN_OVEN
  )
    faults.push(`hob ${String(s1.hobBody)} -> ${String(plan.hobBody)}`);
  return faults;
}

/** The drawer group astride the hob: the preparation cabinet where kept, the pan drawer, the
 *  post-hob drawer slot where one survives, and the threshold drawer where one stands (7D5 S3). */
function drawerCountFault(
  plan: KitchenCompositionPlan,
  drawerSlots: number,
): string | undefined {
  const preparation = plan.dropped.includes("preparation") ? 0 : 1;
  const thresholdDrawers = plan.bases.filter(
    (base) => base.id === THRESHOLD_DRAWER_ID,
  ).length;
  const expected = preparation + 1 + drawerSlots + thresholdDrawers;
  return drawerSlots > 1 || drawerCabinetsIn(plan) !== expected
    ? `${String(drawerCabinetsIn(plan))} drawer cabinets, not ${String(expected)}`
    : undefined;
}

/** Where the threshold drawer itself is not what Q-H5 places: one 600 mm `base-3drawer` under its own
 *  id, not a composed slot, on the hob's wall, read right after the hob or right after the bottle. */
function thresholdDrawerPlacementFaults(
  plan: KitchenCompositionPlan,
): readonly string[] {
  const reading = inReadingOrder(plan);
  const hobAt = reading.findIndex((base) => base.role === "hob");
  const drawers = reading.filter((base) => base.id === THRESHOLD_DRAWER_ID);
  const [drawer] = drawers;
  if (drawer === undefined) return [];
  const faults: string[] = [];
  if (drawers.length !== 1) faults.push(`${String(drawers.length)} drawers`);
  if (drawer.buildId !== THREE_DRAWER_BODY) faults.push(drawer.buildId);
  if (drawer.role !== "storage") faults.push(`role ${drawer.role}`);
  if (drawer.widthMm !== THRESHOLD_DRAWER_WIDTH_MM)
    faults.push(`${String(drawer.widthMm)} mm`);
  if (isComposedStorageSlot(drawer)) faults.push("reads as a slot");
  if (drawer.wall !== reading[hobAt]?.wall) faults.push("off the hob's wall");
  const readAfterTheHob = reading
    .slice(hobAt + 1, hobAt + 3)
    .map((base) => base.id);
  const isReadRightAfterTheHobOrTheBottle =
    readAfterTheHob[0] === THRESHOLD_DRAWER_ID ||
    (readAfterTheHob[0] === "bottle" &&
      readAfterTheHob[1] === THRESHOLD_DRAWER_ID);
  if (!isReadRightAfterTheHobOrTheBottle)
    faults.push(`read after ${readAfterTheHob.join(",")}`);
  return faults;
}

/** E1's *D* read off the finished plan by id and body: still six or more with fewer than two
 *  drawers is a kitchen Q-H5 left short. */
function isLeftShortOfDrawers(plan: KitchenCompositionPlan): boolean {
  const plainCabinets = plan.bases.filter(
    (base) =>
      isComposedStorageSlot(base) ||
      base.id === PAN_DRAWER_ID ||
      base.id === THRESHOLD_DRAWER_ID,
  );
  const drawers = plainCabinets.filter((base) =>
    DRAWER_CABINET_BODIES.has(base.buildId),
  );
  return (
    plainCabinets.length >= OWNERS_PLAIN_CABINET_THRESHOLD &&
    drawers.length < OWNERS_DRAWER_COUNT
  );
}

/** A room key per Q-H5 decision, so a moved room names itself rather than moving a count. */
function emptyThresholdCensus(): Record<ThresholdDecision, number> {
  return {
    "not short of drawers": 0,
    "in the bottle's place": 0,
    "after the bottle, for a column": 0,
    "after the hob, for a column": 0,
    "after the hob, at no cost": 0,
    "after the bottle, at no cost": 0,
    "refused, it would cost two columns": 0,
    "refused, it does not fit": 0,
  };
}

describe("7D5 S2 — the pan-drawer census over the approved L, 10 mm grid, 2600 mm", () => {
  it("pins the census, and every room's plan against the derived S2 kitchen and the S1 one", () => {
    // S2's own decisions are counted on the kitchen S2 decided, before Q-H5 is applied, so they
    // stay S2's subject; the finished kitchen is counted separately, and the derivation that ends
    // in it (S2 then Q-H5) is what every room's plan is compared against (7D5 S3).
    const census = {
      swept: 0,
      placed: 0,
      hobOnThePrefixWall: 0,
      panDrawer: 0,
      oneSlotClass: 0,
      twoSlotClass: 0,
      decidedByS2: {
        bothStand: 0,
        panDrawerOnly: 0,
        bottleOnly: 0,
        neither: 0,
      },
      finished: {
        bothStand: 0,
        panDrawerOnly: 0,
        bottleOnly: 0,
        neither: 0,
      },
      panDrawerBesideS1Bottle: 0,
      bottleGaveWayToThePanDrawer: 0,
      bottleGaveWayToATallColumn: 0,
      s1BottleBecamePanDrawerOnly: 0,
      towerKeptOverTheBottle: 0,
      towerKeptOverTheBottleFaults: [] as string[],
      totals: { bottles: 0, ovenTowerRooms: 0, columns: 0 },
      thresholdDrawer: 0,
      thresholdDecisions: emptyThresholdCensus(),
      thresholdDrawerBesideThePanDrawer: 0,
      columnToTheThresholdDrawerAgainstS1: 0,
      refusedDisagreements: [] as string[],
      disagreementsWithS2: [] as string[],
      lossesAgainstS1: [] as string[],
      placementFaults: [] as string[],
      thresholdPlacementFaults: [] as string[],
      inTheBottlesPlaceWhereKeepingItWasFree: [] as string[],
      keepingTheBottleInTheBottlesPlaceRooms: {
        costsAColumn: 0,
        doesNotFit: 0,
      },
      leftShortOfDrawers: [] as string[],
      drawerCountFaults: [] as string[],
      twoSlotClassOffWallA6000: [] as string[],
    };

    for (
      let widthMm = APPROVED_L.wallA.minMm;
      widthMm <= APPROVED_L.wallA.maxMm;
      widthMm += GRID_STEP_MM
    ) {
      for (
        let depthMm = APPROVED_L.wallB.minMm;
        depthMm <= APPROVED_L.wallB.maxMm;
        depthMm += GRID_STEP_MM
      ) {
        census.swept += 1;
        const room = roomOf(widthMm, depthMm);
        const where = `${String(widthMm)}x${String(depthMm)}`;
        const plan = planFor(room);
        const derived = derivedCore(room);
        if (!derived || !plan.minimumMet) {
          if (Boolean(derived) !== plan.minimumMet)
            census.refusedDisagreements.push(where);
          continue;
        }
        census.placed += 1;
        const { basis, core } = derived;
        const s2 = derivedS2(core, basis);
        const threshold = derivedThreshold(s2.run, basis);
        const s1 = summaryOfDerived(derivedS1Run(core, basis), basis);
        const decidedByS2 = summaryOfDerived(s2.run, basis);
        const actual = summaryOfPlan(plan);
        if (hobIndexOf(threshold.run) < threshold.run.cut)
          census.hobOnThePrefixWall += 1;

        const againstDerived = differences(
          actual,
          summaryOfDerived(threshold.run, basis),
        );
        if (againstDerived.length > 0)
          census.disagreementsWithS2.push(
            `${where}: ${againstDerived.join("; ")}`,
          );
        const columnsItMayCost = actual.hasThresholdDrawer
          ? OWNERS_MOST_COLUMNS_FOR_THE_THRESHOLD_DRAWER
          : 0;
        const losses = lossesAgainstS1(actual, s1, columnsItMayCost);
        if (losses.length > 0)
          census.lossesAgainstS1.push(`${where}: ${losses.join("; ")}`);
        if (actual.columnBodies.length < s1.columnBodies.length)
          census.columnToTheThresholdDrawerAgainstS1 += 1;

        if (s2.decision === "pan-drawer-beside-s1-bottle")
          census.panDrawerBesideS1Bottle += 1;
        if (s2.bottleGaveWayTo === "the pan drawer")
          census.bottleGaveWayToThePanDrawer += 1;
        if (s2.bottleGaveWayTo === "a tall column")
          census.bottleGaveWayToATallColumn += 1;
        if (s1.hasBottle && decidedByS2.hasPanDrawer && !decidedByS2.hasBottle)
          census.s1BottleBecamePanDrawerOnly += 1;
        if (s2.decision === "tower-kept-over-the-bottle") {
          census.towerKeptOverTheBottle += 1;
          const faults = towerKeptOverTheBottleFaults(actual, s1);
          if (faults.length > 0)
            census.towerKeptOverTheBottleFaults.push(
              `${where}: ${faults.join("; ")}`,
            );
        }
        countKitchenShape(census.decidedByS2, decidedByS2);
        countKitchenShape(census.finished, actual);
        if (actual.hasBottle) census.totals.bottles += 1;
        if (actual.columnBodies.includes("tall-oven-tower"))
          census.totals.ovenTowerRooms += 1;
        census.totals.columns += actual.columnBodies.length;

        census.thresholdDecisions[threshold.decision] += 1;
        const isTheBottleGivenWay =
          actual.hasThresholdDrawer &&
          decidedByS2.hasBottle &&
          !actual.hasBottle;
        if (isTheBottleGivenWay) {
          const keepingTheBottle = keptBottleAlternative(s2.run, basis);
          if (keepingTheBottle === "free")
            census.inTheBottlesPlaceWhereKeepingItWasFree.push(where);
          else
            census.keepingTheBottleInTheBottlesPlaceRooms[keepingTheBottle] +=
              1;
        }
        if (actual.hasThresholdDrawer) {
          census.thresholdDrawer += 1;
          if (actual.hasPanDrawer)
            census.thresholdDrawerBesideThePanDrawer += 1;
          const thresholdFaults = thresholdDrawerPlacementFaults(plan);
          if (thresholdFaults.length > 0)
            census.thresholdPlacementFaults.push(
              `${where}: ${thresholdFaults.join("; ")}`,
            );
        }
        if (isLeftShortOfDrawers(plan)) census.leftShortOfDrawers.push(where);
        if (!actual.hasPanDrawer) continue;

        census.panDrawer += 1;
        const faults = panDrawerPlacementFaults(plan);
        if (faults.length > 0)
          census.placementFaults.push(`${where}: ${faults.join("; ")}`);
        const drawerSlots = composedDrawerSlotsIn(plan).length;
        if (drawerSlots === 0) census.oneSlotClass += 1;
        if (drawerSlots === 1) census.twoSlotClass += 1;
        if (drawerSlots === 1 && widthMm !== APPROVED_L.wallA.maxMm)
          census.twoSlotClassOffWallA6000.push(where);
        const drawerFault = drawerCountFault(plan, drawerSlots);
        if (drawerFault)
          census.drawerCountFaults.push(`${where}: ${drawerFault}`);
      }
    }

    // Derived here and matched against the implementer's measurement, 2026-09-21. The bottle gave
    // way in 35 580 rooms S1 stood it in, all of them Q-H6b (11 440) or Q-H6c (24 140); the fallback
    // stands a pan drawer beside S1's bottle in 11 240; and no room loses a core wall or a core role
    // against `c67b4ee`. 7D5 S3 / Q-H5: S2's own decisions are unchanged; the threshold drawer stands
    // in 15 795 rooms — 6 195 in the bottle's place, 5 700 after the bottle and 3 900 after a hob with
    // no bottle, each of those 9 600 for exactly the one column the owner allows — and no room at
    // D >= 6 is left short of its two drawers. L2 (QA, 7D5 S3): in every one of the 6 195 rooms the
    // bottle gave way, the drawer read after it would have cost a tall column; none was free.
    //
    // 7D5b S0b / ADR 0110 M11: derived, then matched against the implementer's measurement. In 5 260
    // rooms of the K3 fallback with no pan drawer, S1's bottle would have left the block no column;
    // the tower is kept and the bottle omitted. Each moves from bottleOnly to neither (was 127 820 /
    // 24 945), in S2's kitchen and in the finished one alike, and nothing else in the census moves.
    // The totals: bottles 178 491 -> 173 231, oven-tower rooms 167 286, columns 389 018.
    expect(census).toEqual({
      swept: 256_011,
      placed: 245_211,
      hobOnThePrefixWall: 0,
      panDrawer: 92_446,
      oneSlotClass: 92_015,
      twoSlotClass: 431,
      decidedByS2: {
        bothStand: 56_866,
        panDrawerOnly: 35_580,
        bottleOnly: 122_560,
        neither: 30_205,
      },
      finished: {
        bothStand: 50_671,
        panDrawerOnly: 41_775,
        bottleOnly: 122_560,
        neither: 30_205,
      },
      panDrawerBesideS1Bottle: 11_240,
      bottleGaveWayToThePanDrawer: 11_440,
      bottleGaveWayToATallColumn: 24_140,
      s1BottleBecamePanDrawerOnly: 35_580,
      towerKeptOverTheBottle: 5_260,
      towerKeptOverTheBottleFaults: [],
      totals: { bottles: 173_231, ovenTowerRooms: 167_286, columns: 389_018 },
      thresholdDrawer: 15_795,
      thresholdDecisions: {
        "not short of drawers": 229_416,
        "in the bottle's place": 6_195,
        "after the bottle, for a column": 5_700,
        "after the hob, for a column": 3_900,
        "after the hob, at no cost": 0,
        "after the bottle, at no cost": 0,
        "refused, it would cost two columns": 0,
        "refused, it does not fit": 0,
      },
      thresholdDrawerBesideThePanDrawer: 15_795,
      columnToTheThresholdDrawerAgainstS1: 9_600,
      refusedDisagreements: [],
      disagreementsWithS2: [],
      lossesAgainstS1: [],
      placementFaults: [],
      thresholdPlacementFaults: [],
      inTheBottlesPlaceWhereKeepingItWasFree: [],
      keepingTheBottleInTheBottlesPlaceRooms: {
        costsAColumn: 6_195,
        doesNotFit: 0,
      },
      leftShortOfDrawers: [],
      drawerCountFaults: [],
      twoSlotClassOffWallA6000: [],
    });
  }, 60_000);
});

interface KitchenShapeCount {
  bothStand: number;
  panDrawerOnly: number;
  bottleOnly: number;
  neither: number;
}

function countKitchenShape(
  counts: KitchenShapeCount,
  kitchen: KitchenSummary,
): void {
  if (kitchen.hasBottle && kitchen.hasPanDrawer) counts.bothStand += 1;
  if (!kitchen.hasBottle && kitchen.hasPanDrawer) counts.panDrawerOnly += 1;
  if (kitchen.hasBottle && !kitchen.hasPanDrawer) counts.bottleOnly += 1;
  if (!kitchen.hasBottle && !kitchen.hasPanDrawer) counts.neither += 1;
}

// ---------------------------------------------------------------------------------------------
// Witnesses for the owner's Q-H6b and Q-H6c, the coordinator's fallback and ADR 0110 J5, each read
// in full and each with its precondition stated as arithmetic on the room's own run, so a witness
// that stopped discriminating goes red at the precondition rather than passing quietly.
// ---------------------------------------------------------------------------------------------

const CORE_ON_THE_HOB_WALL_MM = 1800;

/** The hob's wall's free run, measured from the shell rather than read off the plan. */
function hobWallCapacityMm(room: DesignRoom): number {
  return runWidthMm(lShellFloorRuns(room)[readingWallsOf(room).suffix]);
}

/** How many columns 7D3's own rule stands on a free end of this length, in a whole-core kitchen. */
function columnsOnAFreeEnd(room: DesignRoom, freeMm: number): number {
  return planTallEndBlock({
    coreSurvivedWhole: true,
    hobStandsOnTheFreeEndWall: true,
    freeEndStorageCount: Math.floor(freeMm / STORAGE_MODULE_MM),
    freeEndRemainderMm: freeMm % STORAGE_MODULE_MM,
    roomHeightMm: room.heightMm,
    hobWithItsOwnOvenBuildId: HOB_WITH_ITS_OWN_OVEN,
    declared: DECLARED_COLUMNS,
  }).columns.length;
}

function readingOf(
  plan: KitchenCompositionPlan,
): readonly [string, DesignWall][] {
  return inReadingOrder(plan).map((base): [string, DesignWall] => [
    base.buildId,
    base.wall,
  ]);
}

describe("7D5 S2 — Q-H6b: where the pan drawer and the bottle cannot both stand, the pan drawer does", () => {
  // The hob's wall holds the core with the bottle or with the pan drawer, but not with both. S1 stood
  // the bottle in both rooms; the owner's Q-H6b stands the pan drawer instead.
  it.each([
    {
      name: "wall A wider, 3350 x 1700",
      room: roomOf(3350, 1700),
      fridge: "B",
      hobWall: "A",
    },
    {
      name: "wall B wider, 1700 x 3600",
      room: roomOf(1700, 3600),
      fridge: "A",
      hobWall: "B",
    },
  ] as const)(
    "reads sink, drawer, pan drawer, hob and no bottle, $name",
    ({ room, fridge, hobWall }) => {
      const capacityMm = hobWallCapacityMm(room);
      expect(capacityMm).toBeGreaterThanOrEqual(
        CORE_ON_THE_HOB_WALL_MM + BOTTLE_WIDTH_MM,
      );
      expect(capacityMm).toBeGreaterThanOrEqual(
        CORE_ON_THE_HOB_WALL_MM + PAN_DRAWER_WIDTH_MM,
      );
      expect(capacityMm).toBeLessThan(
        CORE_ON_THE_HOB_WALL_MM + PAN_DRAWER_WIDTH_MM + BOTTLE_WIDTH_MM,
      );

      expect(readingOf(planFor(room))).toEqual([
        ["fridge-free", fridge],
        ["base-sink", hobWall],
        [THREE_DRAWER_BODY, hobWall],
        [PAN_DRAWER_BODY, hobWall],
        [HOB_WITH_ITS_OWN_OVEN, hobWall],
      ]);
    },
  );
});

describe("7D5 S2 — Q-H6c: once the pan drawer stands, the bottle gives way rather than a column", () => {
  // The bottle fits beside the pan drawer, but the 300 mm it takes leaves the block two columns
  // instead of three. S1 stood the bottle and three columns; the pan drawer and three columns win.
  it.each([
    {
      name: "wall A wider, 5100 x 1700",
      room: roomOf(5100, 1700),
      fridge: "B",
      hobWall: "A",
    },
    {
      name: "wall B wider, 1700 x 5200",
      room: roomOf(1700, 5200),
      fridge: "A",
      hobWall: "B",
    },
  ] as const)(
    "keeps the pan drawer and all three columns and omits the bottle, $name",
    ({ room, fridge, hobWall }) => {
      const panDrawerFreeMm =
        hobWallCapacityMm(room) - CORE_ON_THE_HOB_WALL_MM - PAN_DRAWER_WIDTH_MM;
      expect(panDrawerFreeMm).toBeGreaterThanOrEqual(BOTTLE_WIDTH_MM);
      expect(columnsOnAFreeEnd(room, panDrawerFreeMm)).toBe(3);
      expect(columnsOnAFreeEnd(room, panDrawerFreeMm - BOTTLE_WIDTH_MM)).toBe(
        2,
      );

      expect(readingOf(planFor(room))).toEqual([
        ["fridge-free", fridge],
        ["base-sink", hobWall],
        [THREE_DRAWER_BODY, hobWall],
        [PAN_DRAWER_BODY, hobWall],
        ["base-hob-2drawer", hobWall],
        ["tall-oven-tower", hobWall],
        ["tall-pantry", hobWall],
        ["tall-pantry", hobWall],
      ]);
    },
  );
});

describe("7D5 S2 — the fallback: refused against the core alone, the pan drawer stands beside S1's bottle", () => {
  // Against the core alone the pan drawer would take the one column the free end holds, so it is
  // refused. S1's bottle already costs that column, and beside the bottle the pan drawer costs
  // nothing more — so the room keeps both.
  it.each([
    {
      name: "wall A wider, 3650 x 1700",
      room: roomOf(3650, 1700),
      fridge: "B",
      hobWall: "A",
    },
    {
      name: "wall B wider, 1700 x 3800",
      room: roomOf(1700, 3800),
      fridge: "A",
      hobWall: "B",
    },
  ] as const)(
    "reads sink, drawer, pan drawer, hob, bottle and no column, $name",
    ({ room, fridge, hobWall }) => {
      const coreFreeMm = hobWallCapacityMm(room) - CORE_ON_THE_HOB_WALL_MM;
      expect(columnsOnAFreeEnd(room, coreFreeMm)).toBe(1);
      expect(columnsOnAFreeEnd(room, coreFreeMm - PAN_DRAWER_WIDTH_MM)).toBe(0);
      expect(columnsOnAFreeEnd(room, coreFreeMm - BOTTLE_WIDTH_MM)).toBe(0);
      expect(
        coreFreeMm - BOTTLE_WIDTH_MM - PAN_DRAWER_WIDTH_MM,
      ).toBeGreaterThanOrEqual(0);

      expect(readingOf(planFor(room))).toEqual([
        ["fridge-free", fridge],
        ["base-sink", hobWall],
        [THREE_DRAWER_BODY, hobWall],
        [PAN_DRAWER_BODY, hobWall],
        [HOB_WITH_ITS_OWN_OVEN, hobWall],
        [BOTTLE_BODY, hobWall],
      ]);
    },
  );
});

describe("7D5 S2 — ADR 0110 J5: a kitchen without its fridge gets no block, and that decides the pan drawer", () => {
  // ADR 0093 decision 1: the clause is live, so it has a witness. Wall A's 900 mm leaves no run at
  // all, and wall B's 2400 mm cannot hold the 2500 mm whole core, so the fridge is dropped. Without
  // J5's clause the 600 mm left beside the core would stand an oven tower, the pan drawer would cost
  // it and be refused, and the room would read sink, drawer, hob, bottle with 300 mm bare.
  const room = roomOf(900, 3400);

  it("reads sink, drawer, pan drawer and the hob with its own oven, flush to the end of wall B", () => {
    const plan = planFor(room);

    expect(plan.dropped).toEqual(["fridge"]);
    expect(
      plan.bases.map((base) => [
        base.buildId,
        base.wall,
        base.startMm,
        base.endMm,
      ]),
    ).toEqual([
      ["base-sink", "B", 900, 1500],
      [THREE_DRAWER_BODY, "B", 1500, 2100],
      [PAN_DRAWER_BODY, "B", 2100, 2700],
      [HOB_WITH_ITS_OWN_OVEN, "B", 2700, 3300],
    ]);
    expect(plan.remainderMm).toEqual({ A: 0, B: 0 });
  });

  it("is a witness only because the clause is what refuses the block", () => {
    const coreFreeMm = hobWallCapacityMm(room) - CORE_ON_THE_HOB_WALL_MM;

    expect(runWidthMm(lShellFloorRuns(room).A)).toBe(0);
    expect(coreFreeMm).toBe(STORAGE_MODULE_MM);
    expect(columnsOnAFreeEnd(room, coreFreeMm)).toBe(1);
    expect(columnsOnAFreeEnd(room, coreFreeMm - PAN_DRAWER_WIDTH_MM)).toBe(0);
  });
});
