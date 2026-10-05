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
//
// 7D5b S1 / ADR 0110 M1/M2/M9: the dishwasher is decided before the threshold drawer and *D* excludes
// it. The census derives it too — M1's door cabinet beside the sink, else (e)'s drawer swap — and
// counts *D* on the kitchen it leaves. In (e) rooms the pan drawer carries the preparation id and
// role, so it is looked up by its body, never by `pan-drawer`.
//
// 7D5b S2 / ADR 0110 M7/M10: where S1 stood no dishwasher, it is traded in for (b) one pantry column,
// then (d) the bottle, then (c) the oven tower, directly after the sink — before the threshold drawer.
// The census derives the three trades from capacities and 7D3's block rule in that precedence, each
// in the contract's own terms: the named body goes and nothing else — no composed slot, no drawer
// cabinet, no other column (plan B1/B2).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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
import {
  switchTheFridgeEndLeafOff,
  switchTheFridgeEndLeafOn,
} from "../support/before-c5-fridge-end-leftover.js";

// M7C wave C5 S1: the census below models a planner that stood before the leftover beside an end fridge was
// absorbed into the cabinet inboard of it (`fridge-end-leftover.ts`), so it asks the planner as it stood before
// that rule; every other test in this file runs on the shipped planner, leaf on. The rule's own figures are
// `fridge-end-leftover.rooms.test.ts`'s.
vi.mock(
  "../../src/generation/fridge-end-leftover.js",
  async (importOriginal) => {
    const { withTheFridgeEndLeafSwitchable } = await import(
      "../support/before-c5-fridge-end-leftover.js"
    );
    return withTheFridgeEndLeafSwitchable(await importOriginal());
  },
);

// M7B U1 slice S1's minimal type-level fix: `DesignWall` widened to include `"C"` (ADR 0132), but
// this census is `lShellFloorRuns`' own two-wall composer, keyed the same way `LWall` is in
// `shell-design.ts`. Wall C's own census is U3's.
type TwoWallDispatch = Extract<DesignWall, "A" | "B">;

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
/** 7D5b S1 / ADR 0110 M1/M2/M9: the dishwasher's body and id, and the id the preparation role carries
 *  onto the pan drawer in an (e) swap. Literals, for the same reason as every body above. */
const DISHWASHER_BODY = "base-dishwasher";
const DISHWASHER_ID = "dishwasher";
const DISHWASHER_WIDTH_MM = 600;
const PREPARATION_ID = "preparation";

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
  readonly prefix: TwoWallDispatch;
  readonly suffix: TwoWallDispatch;
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

/** 7D5b S1 / ADR 0110 M7(e), M9: where no door cabinet stands beside the sink, the dishwasher takes
 *  the preparation 3-drawer's module and the preparation id and role move one module along onto the
 *  pan drawer, which keeps its body — so the pan drawer is found by body here, never by id. Read off
 *  the two modules before the hob, so a swap that stood anywhere else fails. */
function expectTheDrawerSwapBeforeTheHob(plan: KitchenCompositionPlan): void {
  const reading = inReadingOrder(plan);
  const hobAt = reading.findIndex((base) => base.role === "hob");

  expect(reading[hobAt - 2]).toMatchObject({
    id: DISHWASHER_ID,
    role: "storage",
    buildId: DISHWASHER_BODY,
    widthMm: DISHWASHER_WIDTH_MM,
  });
  expect(reading[hobAt - 1]).toMatchObject({
    id: PREPARATION_ID,
    role: "preparation",
    buildId: PAN_DRAWER_BODY,
    widthMm: PAN_DRAWER_WIDTH_MM,
  });
  expect(plan.dropped).not.toContain("preparation");
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
  //
  // 7D5b S1 / ADR 0110 M1/M2/M9: the no-block arm's witness was 3602 x 1700 until (e) gave it a
  // dishwasher in the preparation 3-drawer's module — its wall B holds the fridge and no door cabinet,
  // so the kitchen keeps one drawer cabinet, not two, and this subject no longer holds there. It moved
  // to 3602 x 2300: the same wall A, arm and reading, where wall B's extra 600 mm stands a door cabinet
  // across the corner from the sink for M1 to convert, so the drawer group is untouched.
  it.each([
    {
      name: "3602 x 2300, wall A wider, no block",
      room: roomOf(3602, 2300),
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
    prefix: TwoWallDispatch,
    capacityMm: number,
  ): Readonly<Record<TwoWallDispatch, GenerationRun>> {
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

  // 7D5b S1 / ADR 0110 M1/M2/M9: the whole run stands on the prefix wall with no door cabinet, and the
  // preparation 3-drawer and the pan drawer are its two drawer cabinets, so (e) swaps them: the
  // dishwasher stands in the 3-drawer's module beside the sink and the pan drawer carries the
  // preparation id and role. The subject survives — the pan drawer's body is still read immediately
  // before the hob on the reversed wall — and the swap is now witnessed on a wall laid out in reverse.
  it.each(MIRRORS)(
    "reads the pan drawer immediately before the hob, on the hob's wall, $name",
    ({ room, prefix }) => {
      const plan = planKitchenComposition({
        room,
        runs: runsGivingThePrefixWall(prefix, CORE_BOTTLE_AND_PAN_DRAWER_MM),
        columns: DECLARED_COLUMNS,
      });
      const reading = inReadingOrder(plan);

      expect(readingWallsOf(room).prefix).toBe(prefix);
      expect(plan.dropped).toEqual([]);
      expect(reading.map((base) => [base.buildId, base.wall])).toEqual([
        ["fridge-free", prefix],
        ["base-sink", prefix],
        [DISHWASHER_BODY, prefix],
        [PAN_DRAWER_BODY, prefix],
        ["base-hob-oven", prefix],
        [BOTTLE_BODY, prefix],
      ]);
      expectTheDrawerSwapBeforeTheHob(plan);
    },
  );

  // One millimetre short of room for both, the core fits with either but not with the two together,
  // so this is Q-H6b on the reversed wall: the pan drawer is decided first and the bottle gives way.
  // 7D5b S1 / ADR 0110 M1/M2/M9: then (e) swaps the two drawer cabinets, as in the row above.
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
        [DISHWASHER_BODY, prefix],
        [PAN_DRAWER_BODY, prefix],
        ["base-hob-oven", prefix],
      ]);
      expectTheDrawerSwapBeforeTheHob(plan);
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
    | typeof THRESHOLD_DRAWER_ID
    | typeof DISHWASHER_ID;
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
  readonly walls: Readonly<Record<ReadingSide, TwoWallDispatch>>;
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

interface PlainCabinetCount {
  readonly count: number;
  readonly drawers: number;
}

/** E1's *D* and its drawers on a derived run as 7D5 counted it, before the dishwasher existed: the
 *  composed slots on both walls, the one slot read first after the hob being the drawer (D15.3), plus
 *  the pan drawer and the threshold drawer. The preparation cabinet, the bottle and the columns are
 *  not counted. Kept to measure what the owner's *"dishwasher first"* (M2) took away. */
function plainCabinetsCountingTheDishwasherOf(
  run: DerivedRun,
  basis: DerivationBasis,
): PlainCabinetCount {
  const slots = derivedSlotsOf(run, basis);
  const drawerModules = run.items.filter(
    (item) => item.kind === "pan-drawer" || item.kind === THRESHOLD_DRAWER_ID,
  ).length;
  return {
    count: slots.prefix + slots.suffix + drawerModules,
    drawers: (slots.drawerSlot === undefined ? 0 : 1) + drawerModules,
  };
}

/** 7D5b S1 / ADR 0110 M1/M2/M9: *D* on the kitchen whose dishwasher is already decided. M1's dishwasher
 *  is a door cabinet that is no longer a composed slot, so *D* loses one; (e)'s pan drawer now carries
 *  the preparation id, so *D* loses it and its drawer with it. 7D5b S2 / ADR 0110 M7/M10: a traded
 *  dishwasher is a module of its own and was never a slot, so *D* loses nothing for it. */
function plainCabinetsOf(
  run: DerivedRun,
  basis: DerivationBasis,
): PlainCabinetCount {
  const before = plainCabinetsCountingTheDishwasherOf(run, basis);
  const { decision } = derivedDishwasherOf(run, basis);
  const tookAPlainCabinet = decision !== "none" && decision !== TRADED_IN;
  return {
    count: before.count - (tookAPlainCabinet ? 1 : 0),
    drawers: before.drawers - (decision === DRAWER_SWAP ? 1 : 0),
  };
}

function isShortOfTheOwnersDrawers({
  count,
  drawers,
}: PlainCabinetCount): boolean {
  return (
    count >= OWNERS_PLAIN_CABINET_THRESHOLD && drawers < OWNERS_DRAWER_COUNT
  );
}

// ---------------------------------------------------------------------------------------------
// 7D5b S1 / ADR 0110 M1/M2/M9 — the dishwasher, derived from the run's own layout rather than asked of
// the composer. Each wall stands its modules contiguous from the corner: the prefix wall its composed
// slots (index 0 at the corner) and then its reading-order items reversed; the suffix wall its items
// in reading order, then its slots (index 0 first), then the block. Two modules abut where they are
// neighbours on one wall, and face each other across the corner where each is first from it.
// ---------------------------------------------------------------------------------------------

type DishwasherDecision =
  | "none"
  | "M1, on the sink's wall"
  | "M1, across the corner"
  | typeof DRAWER_SWAP
  | typeof TRADED_IN;

const DRAWER_SWAP = "(e), the drawer swap";
/** 7D5b S2 / ADR 0110 M7/M10: a dishwasher standing in the run directly after the sink, for a body
 *  the run gave up. Which body is the derivation's to say; the plan shows only where it stands. */
const TRADED_IN = "S2, traded in after the sink";

interface DerivedDishwasher {
  readonly decision: DishwasherDecision;
  /** The side whose composed door slot M1 converted; `undefined` for (e) and for none. */
  readonly convertedSlotSide?: ReadingSide | undefined;
}

interface SlotPosition {
  readonly side: ReadingSide;
  readonly index: number;
}

/** A derived run's composed slots on each side, and the one the owner's order makes the drawer: the
 *  first read after the hob (D15.7) — the prefix wall's highest index where the hob reads on it,
 *  otherwise the suffix wall's first. */
interface DerivedSlots {
  readonly prefix: number;
  readonly suffix: number;
  readonly drawerSlot: SlotPosition | undefined;
}

function derivedSlotsOf(run: DerivedRun, basis: DerivationBasis): DerivedSlots {
  const prefix = Math.floor(
    freeMmOn(run, "prefix", basis.capacities) / STORAGE_MODULE_MM,
  );
  const suffix = tallBlockOf(run, basis).storageCount;
  const isHobOnTheSuffix = hobIndexOf(run) >= run.cut;
  const readAfterTheHob: SlotPosition[] = [
    ...(isHobOnTheSuffix || prefix === 0
      ? []
      : [{ side: "prefix" as const, index: prefix - 1 }]),
    ...(suffix === 0 ? [] : [{ side: "suffix" as const, index: 0 }]),
  ];
  return { prefix, suffix, drawerSlot: readAfterTheHob[0] };
}

/** M1 where a composed door slot abuts the sink, else (e) where the swap is open, else none — and a
 *  run that already carries S2's traded dishwasher as an item answers that (7D5b S2). */
function derivedDishwasherOf(
  run: DerivedRun,
  basis: DerivationBasis,
): DerivedDishwasher {
  if (indexOfKind(run, DISHWASHER_ID) >= 0) return { decision: TRADED_IN };
  const slots = derivedSlotsOf(run, basis);
  const doorSlot = doorSlotBesideTheSink(run, slots);
  if (doorSlot !== undefined) return doorSlot;
  return isTheDrawerSwapOpen(run, slots)
    ? { decision: DRAWER_SWAP }
    : { decision: "none" };
}

function indexOfKind(run: DerivedRun, kind: DerivedItem["kind"]): number {
  return run.items.findIndex((item) => item.kind === kind);
}

function sideOf(run: DerivedRun, index: number): ReadingSide {
  return index < run.cut ? "prefix" : "suffix";
}

/** **M1**: the slots that can abut the sink. On the prefix wall, the sink nearest the corner abuts
 *  the slot nearest the items (the highest index) — or, with no slot there, faces the suffix wall's
 *  first module across the corner, a slot only where no item reads on the suffix. As the suffix
 *  wall's first item, it faces the prefix wall's first module, which is slot 0 wherever one stands.
 *  The drawer slot is not a door cabinet. */
function doorSlotBesideTheSink(
  run: DerivedRun,
  slots: DerivedSlots,
): DerivedDishwasher | undefined {
  const sinkAt = indexOfKind(run, "sink");
  const isNearestTheCornerOnThePrefix = sinkAt === run.cut - 1;
  const isFirstOnTheSuffix = sinkAt === run.cut;
  const isNothingReadOnTheSuffix = run.cut === run.items.length;
  const candidates: {
    readonly slot: SlotPosition;
    readonly decision: DishwasherDecision;
  }[] = [];
  if (isNearestTheCornerOnThePrefix && slots.prefix > 0)
    candidates.push({
      slot: { side: "prefix", index: slots.prefix - 1 },
      decision: "M1, on the sink's wall",
    });
  if (
    isNearestTheCornerOnThePrefix &&
    slots.prefix === 0 &&
    isNothingReadOnTheSuffix &&
    slots.suffix > 0
  )
    candidates.push({
      slot: { side: "suffix", index: 0 },
      decision: "M1, across the corner",
    });
  if (isFirstOnTheSuffix && slots.prefix > 0)
    candidates.push({
      slot: { side: "prefix", index: 0 },
      decision: "M1, across the corner",
    });
  const door = candidates.find(
    ({ slot }) =>
      slot.side !== slots.drawerSlot?.side ||
      slot.index !== slots.drawerSlot.index,
  );
  return door && { decision: door.decision, convertedSlotSide: door.slot.side };
}

/** **M7(e)**: at least two drawer cabinets, the preparation 3-drawer beside the sink (along its wall,
 *  or across the corner where the sink is the prefix wall's first module), and the pan drawer
 *  directly beyond it on the same wall. */
function isTheDrawerSwapOpen(run: DerivedRun, slots: DerivedSlots): boolean {
  const sinkAt = indexOfKind(run, "sink");
  const preparationAt = indexOfKind(run, "preparation");
  const panDrawerAt = preparationAt + 1;
  if (preparationAt !== sinkAt + 1) return false;
  const isPreparationBesideTheSink =
    sideOf(run, sinkAt) === sideOf(run, preparationAt) || slots.prefix === 0;
  const isPanDrawerBeyondIt =
    run.items[panDrawerAt]?.kind === "pan-drawer" &&
    sideOf(run, panDrawerAt) === sideOf(run, preparationAt);
  return (
    isPreparationBesideTheSink &&
    isPanDrawerBeyondIt &&
    drawerCabinetsOfRun(run, slots) >= OWNERS_DRAWER_COUNT
  );
}

/** Every drawer cabinet a derived run stands, by what it is: the preparation cabinet, the pan drawer,
 *  the threshold drawer and the drawer slot. */
function drawerCabinetsOfRun(run: DerivedRun, slots: DerivedSlots): number {
  const drawerItems = run.items.filter(
    (item) =>
      item.kind === "preparation" ||
      item.kind === "pan-drawer" ||
      item.kind === THRESHOLD_DRAWER_ID,
  ).length;
  return drawerItems + (slots.drawerSlot === undefined ? 0 : 1);
}

// ---------------------------------------------------------------------------------------------
// 7D5b S2 / ADR 0110 M7/M10 — the trades, derived. Where S1 stood no dishwasher, one 600 mm dishwasher
// is read directly after the sink on the sink's side of the cut, and the run gives up in exchange, in
// M10's precedence: (b) exactly one pantry column, keeping the block; (d) exactly the bottle, the block
// unchanged; (c) exactly the oven tower, the block's only column, so the hob takes the oven (E4, M12).
// Each is refused unless the named body is the only thing that goes: every composed slot on both walls
// stays, and so every drawer cabinet does (M8 / D7). Written from the contract, not from
// `optional-run-items.ts`: a trade that paid for the dishwasher with anything else disagrees here.
// ---------------------------------------------------------------------------------------------

type DishwasherTrade =
  | "(b) a pantry column"
  | "(d) the bottle"
  | "(c) the oven tower";

interface DerivedTrade {
  readonly run: DerivedRun;
  readonly trade: DishwasherTrade;
}

/** S2 on the kitchen S2 of 7D5 decided, or `undefined` where S1 stood a dishwasher or no trade holds. */
function derivedDishwasherTrade(
  run: DerivedRun,
  basis: DerivationBasis,
): DerivedTrade | undefined {
  if (derivedDishwasherOf(run, basis).decision !== "none") return undefined;
  const columnsBefore = columnCountOf(run, basis);
  const besideTheSink = withTheDishwasherAfterTheSink(run);
  const candidates: readonly (DerivedTrade & { readonly holds: boolean })[] = [
    {
      trade: "(b) a pantry column",
      run: besideTheSink,
      holds:
        columnCountOf(besideTheSink, basis) === columnsBefore - 1 &&
        columnCountOf(besideTheSink, basis) > 0,
    },
    {
      trade: "(d) the bottle",
      run: withTheDishwasherAfterTheSink(withoutTheBottle(run)),
      holds:
        run.items.some((item) => item.kind === "bottle") &&
        columnCountOf(
          withTheDishwasherAfterTheSink(withoutTheBottle(run)),
          basis,
        ) === columnsBefore,
    },
    {
      trade: "(c) the oven tower",
      run: besideTheSink,
      holds: columnsBefore === 1 && columnCountOf(besideTheSink, basis) === 0,
    },
  ];
  const taken = candidates.find(
    (candidate) =>
      candidate.holds &&
      fitsAcrossTheCorner(candidate.run, basis.capacities) &&
      keepsEveryComposedSlot(candidate.run, { before: run, basis }),
  );
  return taken && { run: taken.run, trade: taken.trade };
}

function withTheDishwasherAfterTheSink(run: DerivedRun): DerivedRun {
  const sinkAt = indexOfKind(run, "sink");
  return {
    items: [
      ...run.items.slice(0, sinkAt + 1),
      { kind: DISHWASHER_ID, widthMm: DISHWASHER_WIDTH_MM },
      ...run.items.slice(sinkAt + 1),
    ],
    cut: sinkAt < run.cut ? run.cut + 1 : run.cut,
  };
}

function withoutTheBottle(run: DerivedRun): DerivedRun {
  const bottleAt = indexOfKind(run, "bottle");
  if (bottleAt < 0) return run;
  return {
    items: run.items.filter((_, index) => index !== bottleAt),
    cut: bottleAt < run.cut ? run.cut - 1 : run.cut,
  };
}

/** The contract's *"exactly its own body"*: the traded run keeps the composed slots of both walls, so
 *  no door cabinet and no drawer slot pays for the dishwasher. */
function keepsEveryComposedSlot(
  candidate: DerivedRun,
  context: { readonly before: DerivedRun; readonly basis: DerivationBasis },
): boolean {
  const after = derivedSlotsOf(candidate, context.basis);
  const before = derivedSlotsOf(context.before, context.basis);
  return after.prefix === before.prefix && after.suffix === before.suffix;
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
 *  most one column; otherwise the kitchen stays as S2 decided it. 7D5b S1 / ADR 0110 M2: *D* is
 *  counted on the kitchen with its dishwasher decided; `countPlainCabinets` is swapped only to
 *  measure the order M2 replaced. */
function derivedThreshold(
  s2: DerivedRun,
  basis: DerivationBasis,
  countPlainCabinets = plainCabinetsOf,
): DerivedThreshold {
  if (!isShortOfTheOwnersDrawers(countPlainCabinets(s2, basis))) {
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
  /** 7D5b S1 / ADR 0110 M1/M2/M9: which of the owner's two answers stood the dishwasher, if either. */
  readonly dishwasher: DishwasherDecision;
}

function summaryOfDerived(
  run: DerivedRun,
  basis: DerivationBasis,
): KitchenSummary {
  const block = tallBlockOf(run, basis);
  const prefixFreeMm = freeMmOn(run, "prefix", basis.capacities);
  const kinds = run.items.map((item) => item.kind);
  const dishwasher = derivedDishwasherOf(run, basis);
  const convertedOn = (side: ReadingSide) =>
    dishwasher.convertedSlotSide === side ? 1 : 0;
  return {
    dropped: basis.dropped,
    wallOfRole: run.items
      .flatMap((item, index): [string, DesignWall][] =>
        item.kind === "bottle" ||
        item.kind === "pan-drawer" ||
        item.kind === THRESHOLD_DRAWER_ID ||
        item.kind === DISHWASHER_ID
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
      prefix:
        Math.floor(prefixFreeMm / STORAGE_MODULE_MM) - convertedOn("prefix"),
      suffix: block.storageCount - convertedOn("suffix"),
    },
    remainderMm: {
      prefix: prefixFreeMm % STORAGE_MODULE_MM,
      suffix: block.remainderMm,
    },
    dishwasher: dishwasher.decision,
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
    dishwasher: dishwasherDecisionOfPlan(plan),
  };
}

/** Which answer the plan's dishwasher is, read off what stands: (e) where the pan drawer carries the
 *  preparation role, otherwise M1 by the dishwasher's wall against the sink's. */
function dishwasherDecisionOfPlan(
  plan: KitchenCompositionPlan,
): DishwasherDecision {
  const dishwasher = plan.bases.find(
    (base) => base.buildId === DISHWASHER_BODY,
  );
  if (dishwasher === undefined) return "none";
  const isDrawerSwap = plan.bases.some(
    (base) => base.buildId === PAN_DRAWER_BODY && base.role === "preparation",
  );
  if (isDrawerSwap) return DRAWER_SWAP;
  if (isReadAmongTheItemsAfterTheSink(plan, dishwasher)) return TRADED_IN;
  const sink = plan.bases.find((base) => base.role === "sink");
  return dishwasher.wall === sink?.wall
    ? "M1, on the sink's wall"
    : "M1, across the corner";
}

/** 7D5b S2 / ADR 0110 M7/M10: a dishwasher read directly after the sink with the run's next item —
 *  not a composed slot — directly after it on the same wall stands among the items, where only a trade
 *  inserts one. M1's converted slot stands between the items and the corner, so what is read after it
 *  is another slot or the other wall; (e) is answered before this is asked. */
function isReadAmongTheItemsAfterTheSink(
  plan: KitchenCompositionPlan,
  dishwasher: PlannedGenerationBase,
): boolean {
  const reading = inReadingOrder(plan);
  const at = reading.indexOf(dishwasher);
  const readNext = reading[at + 1];
  return (
    reading[at - 1]?.role === "sink" &&
    readNext !== undefined &&
    readNext.wall === dishwasher.wall &&
    !isComposedStorageSlot(readNext)
  );
}

/** 7D5b S1 / ADR 0110 M1/M2/M9: where the dishwasher is not what the owner's rulings stand — one
 *  600 mm `base-dishwasher` under its own id and the storage role, never a composed slot, abutting the
 *  sink along its wall or facing it across the corner; and in (e), the pan drawer carrying the one
 *  preparation role, abutting the dishwasher on its wall. */
function dishwasherPlacementFaults(
  plan: KitchenCompositionPlan,
): readonly string[] {
  const dishwashers = plan.bases.filter(
    (base) => base.buildId === DISHWASHER_BODY || base.id === DISHWASHER_ID,
  );
  const [dishwasher] = dishwashers;
  if (dishwasher === undefined) return [];
  const faults: string[] = [];
  if (dishwashers.length !== 1)
    faults.push(`${String(dishwashers.length)} dishwashers`);
  if (dishwasher.id !== DISHWASHER_ID) faults.push(`id ${dishwasher.id}`);
  if (dishwasher.buildId !== DISHWASHER_BODY) faults.push(dishwasher.buildId);
  if (dishwasher.role !== "storage") faults.push(`role ${dishwasher.role}`);
  if (dishwasher.widthMm !== DISHWASHER_WIDTH_MM)
    faults.push(`${String(dishwasher.widthMm)} mm`);
  if (isComposedStorageSlot(dishwasher)) faults.push("reads as a slot");
  const sink = plan.bases.find((base) => base.role === "sink");
  if (sink === undefined || !isBeside(plan, [dishwasher, sink]))
    faults.push("not beside the sink");
  if (dishwasherDecisionOfPlan(plan) !== DRAWER_SWAP) return faults;
  const preparations = plan.bases.filter((base) => base.role === "preparation");
  const [preparation] = preparations;
  if (preparations.length !== 1 || preparation?.buildId !== PAN_DRAWER_BODY)
    faults.push("the preparation role is not the pan drawer's alone");
  if (preparation?.id !== PREPARATION_ID)
    faults.push(`preparation id ${String(preparation?.id)}`);
  if (preparation === undefined || !abutsAlongItsWall(preparation, dishwasher))
    faults.push("the pan drawer does not abut the dishwasher");
  return faults;
}

type PlannedPair = readonly [PlannedGenerationBase, PlannedGenerationBase];

function isBeside(plan: KitchenCompositionPlan, pair: PlannedPair): boolean {
  const [one, other] = pair;
  const isFirstFromTheCorner = (base: PlannedGenerationBase) =>
    alongTheWall(plan, base.wall)[0] === base;
  return (
    abutsAlongItsWall(one, other) ||
    (one.wall !== other.wall &&
      isFirstFromTheCorner(one) &&
      isFirstFromTheCorner(other))
  );
}

function abutsAlongItsWall(
  one: PlannedGenerationBase,
  other: PlannedGenerationBase,
): boolean {
  return (
    one.wall === other.wall &&
    (one.endMm === other.startMm || one.startMm === other.endMm)
  );
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

/** Where the pan drawer itself is not what J1 places: one module, its own id, before the hob.
 *  7D5b S1 / ADR 0110 M1/M2/M9: in a room the derivation swaps under (e), its id is the preparation
 *  role's, so the id expected is the derivation's answer rather than the plan's. */
function panDrawerPlacementFaults(
  plan: KitchenCompositionPlan,
  isSwappedForTheDishwasher: boolean,
): readonly string[] {
  const expectedId = isSwappedForTheDishwasher ? PREPARATION_ID : PAN_DRAWER_ID;
  const reading = inReadingOrder(plan);
  const hobAt = reading.findIndex((base) => base.role === "hob");
  const beforeTheHob = reading[hobAt - 1];
  const faults: string[] = [];
  if (panDrawersIn(plan) !== 1)
    faults.push(`${String(panDrawersIn(plan))} pan drawers`);
  if (beforeTheHob?.buildId !== PAN_DRAWER_BODY)
    faults.push("not read before the hob");
  if (beforeTheHob?.id !== expectedId)
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
 *  post-hob drawer slot where one survives, and the threshold drawer where one stands (7D5 S3).
 *  7D5b S1 / ADR 0110 M1/M2/M9: less the 3-drawer an (e) swap gave the dishwasher, where the
 *  derivation swaps. */
function drawerCountFault(
  plan: KitchenCompositionPlan,
  group: { readonly drawerSlots: number; readonly isSwapped: boolean },
): string | undefined {
  const { drawerSlots } = group;
  const preparation = plan.dropped.includes("preparation") ? 0 : 1;
  const thresholdDrawers = plan.bases.filter(
    (base) => base.id === THRESHOLD_DRAWER_ID,
  ).length;
  const swapped = group.isSwapped ? 1 : 0;
  const expected = preparation + 1 + drawerSlots + thresholdDrawers - swapped;
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
  beforeAll(switchTheFridgeEndLeafOff);
  afterAll(switchTheFridgeEndLeafOn);

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
      columnToTheDishwasherAgainstS1: 0,
      dishwasherTrades: emptyTradeCensus(),
      towerKeptThenTraded: emptyTradeCensus(),
      tradeFaults: [] as string[],
      kitchensWithoutAnOven: [] as string[],
      remaindersOfAModuleOrMore: [] as string[],
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
      dishwasher: emptyDishwasherCensus(),
      drawerSwapByDrawerCabinets: { two: 0, three: 0, more: 0 },
      dishwasherPlacementFaults: [] as string[],
      theDishwasherFirst: {
        thresholdDrawersItRemoved: 0,
        aColumnReturned: 0,
        theBottleReturned: 0,
        thresholdDrawersItAdded: [] as string[],
      },
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
        // 7D5b S2 / ADR 0110 M7/M10: the trade is decided on 7D5's kitchen, before the threshold
        // drawer (M2, *"dishwasher first"*), and the threshold drawer on the kitchen it leaves.
        const traded = derivedDishwasherTrade(s2.run, basis);
        const threshold = derivedThreshold(traded?.run ?? s2.run, basis);
        const dishwasher = derivedDishwasherOf(threshold.run, basis);
        const isSwapped = dishwasher.decision === DRAWER_SWAP;
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
        // 7D5b S2 / ADR 0110 M7/M10: (b) and (c) each give the dishwasher exactly one column, which
        // the owner allows as the threshold drawer's one is allowed; (d) gives none.
        const columnsTheTradeMayCost =
          traded !== undefined && traded.trade !== "(d) the bottle" ? 1 : 0;
        const losses = lossesAgainstS1(
          actual,
          s1,
          columnsItMayCost + columnsTheTradeMayCost,
        );
        if (losses.length > 0)
          census.lossesAgainstS1.push(`${where}: ${losses.join("; ")}`);
        if (actual.columnBodies.length < s1.columnBodies.length) {
          if (traded === undefined)
            census.columnToTheThresholdDrawerAgainstS1 += 1;
          else census.columnToTheDishwasherAgainstS1 += 1;
        }
        if (traded !== undefined) {
          census.dishwasherTrades[traded.trade] += 1;
          countTheTradeAgainstTheKitchenBeforeIt(census.tradeFaults, {
            where,
            trade: traded.trade,
            before: decidedByS2,
            after: actual,
          });
        }

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
          // 7D5b S2 / ADR 0110 M7(c): M11 kept the tower over the bottle, and where no door cabinet
          // then stood free the dishwasher took that tower last of all. M11's faults are read on the
          // kitchen M11 decided; the finished one is the derivation's (`disagreementsWithS2`).
          const towerKeptFor = traded === undefined ? actual : decidedByS2;
          if (traded !== undefined)
            census.towerKeptThenTraded[traded.trade] += 1;
          const faults = towerKeptOverTheBottleFaults(towerKeptFor, s1);
          if (faults.length > 0)
            census.towerKeptOverTheBottleFaults.push(
              `${where}: ${faults.join("; ")}`,
            );
        }
        countKitchenShape(census.decidedByS2, decidedByS2);
        countKitchenShape(census.finished, actual);
        // 7D5b S2 / ADR 0110 M12 (B1c) and plan E1's counters, over every placed kitchen: at least
        // one oven — a tower, or the hob's own — and no run-end remainder of a whole module.
        const hasAnOven =
          actual.columnBodies.includes("tall-oven-tower") ||
          actual.hobBody === HOB_WITH_ITS_OWN_OVEN;
        if (!hasAnOven) census.kitchensWithoutAnOven.push(where);
        if (
          Object.values(plan.remainderMm).some((mm) => mm >= STORAGE_MODULE_MM)
        )
          census.remaindersOfAModuleOrMore.push(where);
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
        countTheDishwasher(census, {
          where,
          plan,
          threshold,
          dishwasher: dishwasher.decision,
          beforeTheDishwasherOrder: derivedThreshold(
            s2.run,
            basis,
            plainCabinetsCountingTheDishwasherOf,
          ),
          drawerCabinets: drawerCabinetsOfRun(
            threshold.run,
            derivedSlotsOf(threshold.run, basis),
          ),
          basis,
        });
        if (!actual.hasPanDrawer) continue;

        census.panDrawer += 1;
        const faults = panDrawerPlacementFaults(plan, isSwapped);
        if (faults.length > 0)
          census.placementFaults.push(`${where}: ${faults.join("; ")}`);
        const drawerSlots = composedDrawerSlotsIn(plan).length;
        if (drawerSlots === 0) census.oneSlotClass += 1;
        if (drawerSlots === 1) census.twoSlotClass += 1;
        if (drawerSlots === 1 && widthMm !== APPROVED_L.wallA.maxMm)
          census.twoSlotClassOffWallA6000.push(where);
        const drawerFault = drawerCountFault(plan, { drawerSlots, isSwapped });
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
    //
    // 7D5b S1 / ADR 0110 M1/M2/M9: the dishwasher is derived from the run's own layout, and every
    // room's plan agrees with it through the summary (`disagreementsWithS2` stays empty). M1 converts
    // a door cabinet beside the sink in 141 261 rooms — 1 055 on the sink's wall, 140 206 across the
    // corner — and (e) swaps the drawer cabinets in 24 160 more (24 100 with two, 60 with three);
    // 79 790 stand none. M2: *D* is counted with the dishwasher decided, so 10 070 of 7D5's 15 795
    // threshold drawers go and none is added — 7 010 give their module back to a tall column and
    // 3 060 give the bottle its place back (in-the-bottle's-place 6 195 -> 3 135, and the finished
    // kitchen's bothStand / panDrawerOnly move by exactly those 3 060). The threshold drawer now
    // costs a column against S1 in 2 590 rooms (was 9 600): 2 100 after the bottle, 490 after the
    // hob. Totals: bottles 173 231 -> 176 291, columns 389 018 -> 396 028, oven-tower rooms 167 286.
    // Matched against the implementer's measurement at `4e88ae0` + S1 (plan E1-E3, E6).
    //
    // 7D5b S2 / ADR 0110 M7/M10: the trades are derived above and every room's plan agrees with the
    // derivation (`disagreementsWithS2` stays empty). Of S1's 79 790 kitchens without a dishwasher,
    // 31 200 trade for one — (b) 18 200, (d) 2 600, (c) 10 400 — and 48 590 stay without (plan E1). No
    // trade moves a threshold drawer, a pan drawer or S2's own decisions. (d) moves 2 600 finished
    // kitchens from bottleOnly to neither (122 560 -> 119 960, 30 205 -> 32 805). Against the
    // `c67b4ee` kitchen the dishwasher now costs a column in 26 000 rooms: every (b) and (c) room but
    // the 2 600 (c) rooms whose tower M11 had kept over S1's bottle. Totals: bottles 176 291 ->
    // 173 691, columns 396 028 -> 367 428, oven-tower rooms 167 286 -> 156 886. B1c: no kitchen ends
    // without an oven, and no remainder reaches a module.
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
        bothStand: 53_731,
        panDrawerOnly: 38_715,
        bottleOnly: 119_960,
        neither: 32_805,
      },
      panDrawerBesideS1Bottle: 11_240,
      bottleGaveWayToThePanDrawer: 11_440,
      bottleGaveWayToATallColumn: 24_140,
      s1BottleBecamePanDrawerOnly: 35_580,
      towerKeptOverTheBottle: 5_260,
      towerKeptOverTheBottleFaults: [],
      totals: { bottles: 173_691, ovenTowerRooms: 156_886, columns: 367_428 },
      thresholdDrawer: 5_725,
      thresholdDecisions: {
        "not short of drawers": 239_486,
        "in the bottle's place": 3_135,
        "after the bottle, for a column": 2_100,
        "after the hob, for a column": 490,
        "after the hob, at no cost": 0,
        "after the bottle, at no cost": 0,
        "refused, it would cost two columns": 0,
        "refused, it does not fit": 0,
      },
      thresholdDrawerBesideThePanDrawer: 5_725,
      columnToTheThresholdDrawerAgainstS1: 2_590,
      columnToTheDishwasherAgainstS1: 26_000,
      dishwasherTrades: {
        "(b) a pantry column": 18_200,
        "(d) the bottle": 2_600,
        "(c) the oven tower": 10_400,
      },
      towerKeptThenTraded: {
        "(b) a pantry column": 0,
        "(d) the bottle": 0,
        "(c) the oven tower": 2_600,
      },
      tradeFaults: [],
      kitchensWithoutAnOven: [],
      remaindersOfAModuleOrMore: [],
      refusedDisagreements: [],
      disagreementsWithS2: [],
      lossesAgainstS1: [],
      placementFaults: [],
      thresholdPlacementFaults: [],
      inTheBottlesPlaceWhereKeepingItWasFree: [],
      keepingTheBottleInTheBottlesPlaceRooms: {
        costsAColumn: 3_135,
        doesNotFit: 0,
      },
      leftShortOfDrawers: [],
      drawerCountFaults: [],
      twoSlotClassOffWallA6000: [],
      dishwasher: {
        none: 48_590,
        "M1, on the sink's wall": 1_055,
        "M1, across the corner": 140_206,
        [DRAWER_SWAP]: 24_160,
        [TRADED_IN]: 31_200,
      },
      drawerSwapByDrawerCabinets: { two: 24_100, three: 60, more: 0 },
      dishwasherPlacementFaults: [],
      theDishwasherFirst: {
        thresholdDrawersItRemoved: 10_070,
        aColumnReturned: 7_010,
        theBottleReturned: 3_060,
        thresholdDrawersItAdded: [],
      },
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

function emptyDishwasherCensus(): Record<DishwasherDecision, number> {
  return {
    none: 0,
    "M1, on the sink's wall": 0,
    "M1, across the corner": 0,
    [DRAWER_SWAP]: 0,
    [TRADED_IN]: 0,
  };
}

function emptyTradeCensus(): Record<DishwasherTrade, number> {
  return {
    "(b) a pantry column": 0,
    "(d) the bottle": 0,
    "(c) the oven tower": 0,
  };
}

/** 7D5b S2 / ADR 0110 M7/M10/M12, read off the finished plan against the kitchen before the trade:
 *  (b) one pantry column fewer, the tower and the hob's body kept; (d) the bottle gone, every column
 *  and the hob's body kept; (c) the tower gone with no column left, and the hob carrying the oven
 *  (owner: *"only if hub is with oven"*). Everything else in the kitchen is the derivation's. */
function countTheTradeAgainstTheKitchenBeforeIt(
  faults: string[],
  room: {
    readonly where: string;
    readonly trade: DishwasherTrade;
    readonly before: KitchenSummary;
    readonly after: KitchenSummary;
  },
): void {
  const { before, after } = room;
  const found: string[] = [];
  const columnsLostToIt =
    before.columnBodies.length - after.columnBodies.length;
  const keepsTheTower = after.columnBodies[0] === "tall-oven-tower";
  if (room.trade === "(b) a pantry column") {
    if (columnsLostToIt !== 1 || !keepsTheTower) found.push("not one pantry");
    if (after.hobBody !== before.hobBody) found.push("hob body moved");
    if (after.hasBottle !== before.hasBottle) found.push("bottle moved");
  }
  if (room.trade === "(d) the bottle") {
    if (!before.hasBottle || after.hasBottle) found.push("not the bottle");
    if (columnsLostToIt !== 0) found.push("a column moved");
    if (after.hobBody !== before.hobBody) found.push("hob body moved");
  }
  if (room.trade === "(c) the oven tower") {
    if (JSON.stringify(before.columnBodies) !== '["tall-oven-tower"]')
      found.push(`before ${JSON.stringify(before.columnBodies)}`);
    if (after.columnBodies.length !== 0) found.push("a column stands");
    if (after.hobBody !== HOB_WITH_ITS_OWN_OVEN) found.push("no oven");
    if (after.hasBottle !== before.hasBottle) found.push("bottle moved");
  }
  if (after.dishwasher !== TRADED_IN) found.push(`read as ${after.dishwasher}`);
  if (found.length > 0) faults.push(`${room.where}: ${found.join("; ")}`);
}

/** The dishwasher part of the census: which answer the derivation gave (the plan must agree, through
 *  the summary), how many drawer cabinets an (e) room had to give one up, what the plan stood, and
 *  what the owner's *"dishwasher first"* (M2) changed against the order 7D5 used. */
function countTheDishwasher(
  census: {
    readonly dishwasher: Record<DishwasherDecision, number>;
    readonly drawerSwapByDrawerCabinets: {
      two: number;
      three: number;
      more: number;
    };
    readonly dishwasherPlacementFaults: string[];
    readonly theDishwasherFirst: {
      thresholdDrawersItRemoved: number;
      aColumnReturned: number;
      theBottleReturned: number;
      readonly thresholdDrawersItAdded: string[];
    };
  },
  room: {
    readonly where: string;
    readonly plan: KitchenCompositionPlan;
    readonly threshold: DerivedThreshold;
    readonly beforeTheDishwasherOrder: DerivedThreshold;
    readonly dishwasher: DishwasherDecision;
    readonly drawerCabinets: number;
    readonly basis: DerivationBasis;
  },
): void {
  census.dishwasher[room.dishwasher] += 1;
  if (room.dishwasher === DRAWER_SWAP) {
    const swaps = census.drawerSwapByDrawerCabinets;
    if (room.drawerCabinets === 2) swaps.two += 1;
    else if (room.drawerCabinets === 3) swaps.three += 1;
    else swaps.more += 1;
  }
  const faults = dishwasherPlacementFaults(room.plan);
  if (faults.length > 0)
    census.dishwasherPlacementFaults.push(
      `${room.where}: ${faults.join("; ")}`,
    );

  const hasDrawer = (run: DerivedRun) =>
    run.items.some((item) => item.kind === THRESHOLD_DRAWER_ID);
  const hasBottle = (run: DerivedRun) =>
    run.items.some((item) => item.kind === "bottle");
  const now = room.threshold.run;
  const before = room.beforeTheDishwasherOrder.run;
  const first = census.theDishwasherFirst;
  if (hasDrawer(now) && !hasDrawer(before))
    first.thresholdDrawersItAdded.push(room.where);
  if (!hasDrawer(before) || hasDrawer(now)) return;
  first.thresholdDrawersItRemoved += 1;
  if (columnCountOf(now, room.basis) > columnCountOf(before, room.basis))
    first.aColumnReturned += 1;
  if (hasBottle(now) && !hasBottle(before)) first.theBottleReturned += 1;
}

// ---------------------------------------------------------------------------------------------
// Witnesses for the owner's Q-H6b and Q-H6c, the coordinator's fallback and ADR 0110 J5, each read
// in full and each with its precondition stated as arithmetic on the room's own run, so a witness
// that stopped discriminating goes red at the precondition rather than passing quietly.
// ---------------------------------------------------------------------------------------------
//
// 7D5b S1 / ADR 0110 M1/M2/M9: every room below holds the fridge alone (or nothing) on its narrower
// wall, so no door cabinet stands beside the sink, and its two drawer cabinets are the preparation
// 3-drawer and the pan drawer beyond it. (e) swaps them in every row: the dishwasher stands in the
// 3-drawer's module and the pan drawer carries the preparation id and role. Each subject — which of
// the pan drawer, the bottle and the columns stand, and where — is untouched by that identity-only
// change, so each row is restated in place with the dishwasher present, and its precondition is
// unchanged because no width moves.

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

      const plan = planFor(room);

      expect(readingOf(plan)).toEqual([
        ["fridge-free", fridge],
        ["base-sink", hobWall],
        [DISHWASHER_BODY, hobWall],
        [PAN_DRAWER_BODY, hobWall],
        [HOB_WITH_ITS_OWN_OVEN, hobWall],
      ]);
      expectTheDrawerSwapBeforeTheHob(plan);
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

      const plan = planFor(room);

      expect(readingOf(plan)).toEqual([
        ["fridge-free", fridge],
        ["base-sink", hobWall],
        [DISHWASHER_BODY, hobWall],
        [PAN_DRAWER_BODY, hobWall],
        ["base-hob-2drawer", hobWall],
        ["tall-oven-tower", hobWall],
        ["tall-pantry", hobWall],
        ["tall-pantry", hobWall],
      ]);
      expectTheDrawerSwapBeforeTheHob(plan);
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

      const plan = planFor(room);

      expect(readingOf(plan)).toEqual([
        ["fridge-free", fridge],
        ["base-sink", hobWall],
        [DISHWASHER_BODY, hobWall],
        [PAN_DRAWER_BODY, hobWall],
        [HOB_WITH_ITS_OWN_OVEN, hobWall],
        [BOTTLE_BODY, hobWall],
      ]);
      expectTheDrawerSwapBeforeTheHob(plan);
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
      [DISHWASHER_BODY, "B", 1500, 2100],
      [PAN_DRAWER_BODY, "B", 2100, 2700],
      [HOB_WITH_ITS_OWN_OVEN, "B", 2700, 3300],
    ]);
    expect(plan.remainderMm).toEqual({ A: 0, B: 0 });
    expectTheDrawerSwapBeforeTheHob(plan);
  });

  it("is a witness only because the clause is what refuses the block", () => {
    const coreFreeMm = hobWallCapacityMm(room) - CORE_ON_THE_HOB_WALL_MM;

    expect(runWidthMm(lShellFloorRuns(room).A)).toBe(0);
    expect(coreFreeMm).toBe(STORAGE_MODULE_MM);
    expect(columnsOnAFreeEnd(room, coreFreeMm)).toBe(1);
    expect(columnsOnAFreeEnd(room, coreFreeMm - PAN_DRAWER_WIDTH_MM)).toBe(0);
  });
});
