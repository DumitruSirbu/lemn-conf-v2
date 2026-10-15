// M7 wave 7D5b slice S0 — the plan's witness rooms, read at HEAD `acb7b6f` before any 7D5b production
// edit, and E5's two prices read from the sample price book.
//
// Each witness is the room the plan (`docs/milestones/M7-room-and-presets.md`, *Wave 7D5b*) names for
// a population, and each is asserted as the shape the plan says it has **before** the wave: where the
// door cabinet beside the sink stands (E2, E4), which drawer cabinets stand (E6), what S1's bottle
// cost (E7) and where the threshold drawer stands (E3). A witness that stopped being the shape it is
// cited for goes red here, at S0, rather than being reasoned from later.
//
// The census of each population is `qa-7d5b-s0-pre-state-census.adversarial.test.ts`; this file is
// the room-level evidence. Every body, id and position is a literal (ADR 0121 decision 3(b)).
//
// **Restated for S0b (ADR 0110 Amendment M11, narrowed).** S0b keeps the oven tower in two of these
// rooms, so their HEAD shape can no longer be read off the live planner: E7's reference room and
// 900 x 4100 now read HEAD's shape **from the pre-tower recording** (`7d5b-pre-tower-baseline.json`,
// captured at `acb7b6f`), and assert the live post-S0b shape beside it. Every other witness here is
// untouched by S0b — the full-grid comparison and the recordings agree that only M11's rooms moved —
// so it is still read live, and is S1's to restate where S1 moves it.
//
// **Restated for S1 (ADR 0110 Amendment M1, M2, M7(e)).** S1 moves seven of these witnesses — the door
// slot beside the sink becomes the dishwasher (2100 x 2200, 1500 x 2800, 1510 x 2800), the preparation
// 3-drawer does (900 x 3400, 6000 x 1700), and the threshold drawer is re-planned away (4600 x 5200,
// 4600 x 5800) — so their HEAD shape is now read **from the pre-tower recording** too; none of them is an
// M11 room, so HEAD's shape is also S0b's (`qa-7d5b-post-tower-recorded` compares the two recordings).
// Each is followed by S1's live shape, spans unchanged. 1500 x 3500 and 4650 x 1000, which S1 must not
// reach, are still read live.
//
// **Restated for S2 (ADR 0110 Amendment M7 (b), (d), (c), M10).** S2 trades a dishwasher in where S1
// placed none, and reaches two witnesses S1 left: 900 x 4100 (the tower M11 kept goes, (c)) and
// 4650 x 1000 (the owner's nearest room, (c)). Their S0b and S1 shapes are now read from the planner
// with the later slices switched off — `beforeS1` (S0b: no leaf, no trades) and `withS1Alone` (the leaf,
// no trades), both proved against the post-tower recording by `qa-7d5b-post-tower-recorded` — and each
// is followed by its live S2 shape.
import { describe, expect, it, vi } from "vitest";

import {
  amountForBody,
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredColumnSizes,
  isComposedStorageSlot,
  KITCHEN_L_DESIGN,
  lShellFloorRuns,
  planKitchenComposition,
  SAMPLE_PRICE_BOOK,
  widthDerivedDoorLeafCount,
  type DesignWall,
  type KitchenCompositionPlan,
  type PlannedGenerationBase,
} from "../../src/index.js";
import {
  beforeS1,
  withS1Alone,
} from "../support/composition-context-capture.js";
import { readPreTowerRunRecording } from "../support/pre-tower-run-recording.js";
import { parseRecordedCanonicalPlan } from "../support/pre-width-run-recording.js";

vi.mock(
  "../../src/generation/dishwasher-beside-the-sink.js",
  async (importOriginal) => {
    const { withTheDishwasherLeafSwitchable } = await import(
      "../support/composition-context-capture.js"
    );
    return withTheDishwasherLeafSwitchable(await importOriginal());
  },
);

const CATALOG = buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN));
const DECLARED_COLUMNS = declaredColumnSizes(CATALOG);
const WITNESS_CEILING_MM = 2600;
const PRE_TOWER = readPreTowerRunRecording();
const DRAWER_CABINET_BODIES: ReadonlySet<string> = new Set([
  "base-3drawer",
  "base-panbank",
]);

function planFor(widthMm: number, depthMm: number): KitchenCompositionPlan {
  const room = {
    shape: "L" as const,
    widthMm,
    depthMm,
    heightMm: WITNESS_CEILING_MM,
  };
  return planKitchenComposition({
    room,
    runs: lShellFloorRuns(room),
    columns: DECLARED_COLUMNS,
  });
}

/** What a wall reading needs of a module, so a recorded plan reads the same way as a live one. */
type WallModule = Pick<
  PlannedGenerationBase,
  "id" | "buildId" | "wall" | "startMm" | "endMm"
>;

/** A wall's modules corner outward as `body [start, end]`, composed slots marked as such. */
function wallAsBuilt(
  plan: { readonly bases: readonly WallModule[] },
  wall: DesignWall,
): readonly string[] {
  return plan.bases
    .filter((base) => base.wall === wall)
    .sort((left, right) => left.startMm - right.startMm)
    .map(
      (base) =>
        `${describedBody(base)} [${String(base.startMm)}, ${String(base.endMm)}]`,
    );
}

function describedBody(base: WallModule): string {
  return isComposedStorageSlot(base) ? `slot ${base.buildId}` : base.buildId;
}

function drawerCabinetsIn(plan: {
  readonly bases: readonly WallModule[];
}): readonly string[] {
  return plan.bases
    .filter((base) => DRAWER_CABINET_BODIES.has(base.buildId))
    .map((base) => {
      const identity = isComposedStorageSlot(base) ? "slot" : base.id;
      return `${identity}/${base.buildId}`;
    });
}

/** HEAD `acb7b6f`'s plan for a witness at 2600 mm, as the pre-tower recording holds it. */
function recordedAtHead(widthMm: number, depthMm: number) {
  const key = `${String(widthMm)}x${String(depthMm)}x${String(WITNESS_CEILING_MM)}`;
  const recorded = PRE_TOWER.witnesses.get(key);
  if (recorded === undefined) {
    throw new Error(`the 7D5b pre-tower recording holds no witness ${key}`);
  }
  return parseRecordedCanonicalPlan(recorded);
}

describe("7D5b S0 — E7's witnesses: what S1's bottle cost at HEAD (recorded), and what S0b makes of it (live)", () => {
  it("3560 x 2920, the reference room: at HEAD wall A ended hob-with-oven, bottle [2700, 3000] and 560 mm bare, with no tower", () => {
    const atHead = recordedAtHead(3560, 2920);

    expect(wallAsBuilt(atHead, "A")).toEqual([
      "base-sink [900, 1500]",
      "base-3drawer [1500, 2100]",
      "base-hob-oven [2100, 2700]",
      "base-bottle-cargo [2700, 3000]",
    ]);
    expect(atHead.remainderMm.A).toBe(560);
  });

  it("900 x 4100: at HEAD hob-with-oven, bottle and 300 mm bare, with no tower", () => {
    const atHead = recordedAtHead(900, 4100);

    expect(wallAsBuilt(atHead, "B").slice(-2)).toEqual([
      "base-hob-oven [2800, 3400]",
      "base-bottle-cargo [3400, 3700]",
    ]);
    expect(atHead.remainderMm.B).toBe(300);
    expect(atHead.bases.some((base) => base.buildId.startsWith("tall-"))).toBe(
      false,
    );
  });

  it("900 x 4100 with S1 alone: no dishwasher, the S0b wall unchanged", () => {
    const plan = withS1Alone(() => planFor(900, 4100));

    expect(wallAsBuilt(plan, "B")).toEqual(
      wallAsBuilt(
        beforeS1(() => planFor(900, 4100)),
        "B",
      ),
    );
    expect(plan.bases.map((base) => base.buildId)).not.toContain(
      "base-dishwasher",
    );
  });

  it("900 x 4410: pan drawer, hob-with-oven and bottle — the pan drawer stands because of the bottle, at HEAD and after S0b alike", () => {
    const expected = [
      "base-panbank [2800, 3400]",
      "base-hob-oven [3400, 4000]",
      "base-bottle-cargo [4000, 4300]",
    ];

    expect(wallAsBuilt(recordedAtHead(900, 4410), "B").slice(-3)).toEqual(
      expected,
    );
    expect(wallAsBuilt(planFor(900, 4410), "B").slice(-3)).toEqual(expected);
  });
});

describe("7D5b S0 — E2 and E4's witnesses: a door cabinet beside the sink, or not", () => {
  it("2100 x 2200: at HEAD the door cabinet stood beside the sink on the sink's own wall", () => {
    expect(wallAsBuilt(recordedAtHead(2100, 2200), "A")).toEqual([
      "slot base-cabinet [900, 1500]",
      "base-sink [1500, 2100]",
    ]);
  });

  it("2100 x 2200 with S1: that door cabinet is the dishwasher, in its span", () => {
    expect(wallAsBuilt(planFor(2100, 2200), "A")).toEqual([
      "base-dishwasher [900, 1500]",
      "base-sink [1500, 2100]",
    ]);
  });

  it("1500 x 2800: at HEAD the sink started wall B's corner end and the door cabinet wall A's, across the corner", () => {
    const atHead = recordedAtHead(1500, 2800);

    expect(wallAsBuilt(atHead, "A")).toEqual(["slot base-cabinet [900, 1500]"]);
    expect(wallAsBuilt(atHead, "B")[0]).toBe("base-sink [900, 1500]");
  });

  it("1500 x 2800 with S1: the door cabinet across the corner is the dishwasher", () => {
    const plan = planFor(1500, 2800);

    expect(wallAsBuilt(plan, "A")).toEqual(["base-dishwasher [900, 1500]"]);
    expect(wallAsBuilt(plan, "B")[0]).toBe("base-sink [900, 1500]");
  });

  it("1500 x 3500: a door cabinet stands, but the fridge, not the sink, is across the corner from it — and S1 leaves it", () => {
    const plan = planFor(1500, 3500);

    expect(wallAsBuilt(plan, "A")).toEqual(["slot base-cabinet [900, 1500]"]);
    expect(wallAsBuilt(plan, "B").slice(0, 2)).toEqual([
      "fridge-free [900, 1600]",
      "base-sink [1600, 2200]",
    ]);
  });

  it("1510 x 2800: at HEAD the door cabinet beside the sink was the last module on its wall, with 10 mm bare after it", () => {
    const atHead = recordedAtHead(1510, 2800);

    expect(wallAsBuilt(atHead, "A")).toEqual(["slot base-cabinet [900, 1500]"]);
    expect(atHead.remainderMm.A).toBe(10);
  });

  it("1510 x 2800 with S1: the dishwasher in that span, the 10 mm still bare", () => {
    const plan = planFor(1510, 2800);

    expect(wallAsBuilt(plan, "A")).toEqual(["base-dishwasher [900, 1500]"]);
    expect(plan.remainderMm.A).toBe(10);
  });
});

describe("7D5b S0 — E6's witnesses: the drawer cabinets where no door cabinet is beside the sink", () => {
  it("900 x 3400: at HEAD two — the preparation 3-drawer beside the sink and the pan drawer directly beyond it", () => {
    const atHead = recordedAtHead(900, 3400);

    expect(wallAsBuilt(atHead, "B")).toEqual([
      "base-sink [900, 1500]",
      "base-3drawer [1500, 2100]",
      "base-panbank [2100, 2700]",
      "base-hob-oven [2700, 3300]",
    ]);
    expect(drawerCabinetsIn(atHead)).toEqual([
      "preparation/base-3drawer",
      "pan-drawer/base-panbank",
    ]);
  });

  it("900 x 3400 with S1: the 3-drawer is the dishwasher and the pan drawer carries the preparation", () => {
    const plan = planFor(900, 3400);

    expect(wallAsBuilt(plan, "B")).toEqual([
      "base-sink [900, 1500]",
      "base-dishwasher [1500, 2100]",
      "base-panbank [2100, 2700]",
      "base-hob-oven [2700, 3300]",
    ]);
    expect(drawerCabinetsIn(plan)).toEqual(["preparation/base-panbank"]);
  });

  it("6000 x 1700: at HEAD three — those two and the drawer slot after the hob", () => {
    const atHead = recordedAtHead(6000, 1700);

    expect(drawerCabinetsIn(atHead)).toEqual([
      "preparation/base-3drawer",
      "pan-drawer/base-panbank",
      "slot/base-3drawer",
    ]);
    expect(atHead.bases.some((base) => base.buildId === "base-cabinet")).toBe(
      false,
    );
  });

  it("6000 x 1700 with S1: two stay — the pan drawer as the preparation and the slot after the hob", () => {
    expect(drawerCabinetsIn(planFor(6000, 1700))).toEqual([
      "preparation/base-panbank",
      "slot/base-3drawer",
    ]);
  });

  it("4650 x 1000, the owner's nearest room: one drawer cabinet, the oven tower standing, no pan drawer — and S1 leaves it", () => {
    const plan = withS1Alone(() => planFor(4650, 1000));

    expect(wallAsBuilt(plan, "A")).toEqual(
      wallAsBuilt(
        beforeS1(() => planFor(4650, 1000)),
        "A",
      ),
    );

    expect(wallAsBuilt(plan, "A")).toEqual([
      "fridge-free [900, 1600]",
      "base-sink [1600, 2200]",
      "base-3drawer [2200, 2800]",
      "base-hob-2drawer [2800, 3400]",
      "base-bottle-cargo [3400, 3700]",
      "tall-oven-tower [3700, 4300]",
    ]);
    expect(drawerCabinetsIn(plan)).toEqual(["preparation/base-3drawer"]);
  });

  it("4650 x 1000 with S2, live: (c) — the 3-drawer and the bottle kept, the tower traded for the dishwasher", () => {
    const plan = planFor(4650, 1000);

    expect(wallAsBuilt(plan, "A")).toEqual([
      "fridge-free [900, 1600]",
      "base-sink [1600, 2200]",
      "base-dishwasher [2200, 2800]",
      "base-3drawer [2800, 3400]",
      "base-hob-oven [3400, 4000]",
      "base-bottle-cargo [4000, 4300]",
    ]);
    expect(drawerCabinetsIn(plan)).toEqual(["preparation/base-3drawer"]);
  });
});

describe("7D5b S0 — E3's witnesses: the threshold drawer at HEAD, and what dishwasher-first makes of it", () => {
  it("4600 x 5200: at HEAD, after the hob, threshold drawer, oven tower, pantry", () => {
    expect(wallAsBuilt(recordedAtHead(4600, 5200), "B").slice(-4)).toEqual([
      "base-hob-2drawer [2700, 3300]",
      "base-3drawer [3300, 3900]",
      "tall-oven-tower [3900, 4500]",
      "tall-pantry [4500, 5100]",
    ]);
  });

  it("4600 x 5200 with S1: after the hob, oven tower, pantry, pantry — the threshold drawer gone", () => {
    const plan = planFor(4600, 5200);

    expect(wallAsBuilt(plan, "B").slice(-4)).toEqual([
      "base-hob-2drawer [2700, 3300]",
      "tall-oven-tower [3300, 3900]",
      "tall-pantry [3900, 4500]",
      "tall-pantry [4500, 5100]",
    ]);
    expect(plan.bases.some((base) => base.id === "threshold-drawer")).toBe(
      false,
    );
  });

  it("4600 x 5800: at HEAD the threshold drawer stood in the bottle's place", () => {
    const atHead = recordedAtHead(4600, 5800);

    expect(
      atHead.bases.find((base) => base.id === "threshold-drawer"),
    ).toMatchObject({ wall: "B", startMm: 3300, endMm: 3900 });
    expect(
      atHead.bases.some((base) => base.buildId === "base-bottle-cargo"),
    ).toBe(false);
  });

  it("4600 x 5800 with S1: the bottle is back at [3300, 3600] and the threshold drawer gone", () => {
    const plan = planFor(4600, 5800);

    expect(
      plan.bases.find((base) => base.buildId === "base-bottle-cargo"),
    ).toMatchObject({ wall: "B", startMm: 3300, endMm: 3600 });
    expect(plan.bases.some((base) => base.id === "threshold-drawer")).toBe(
      false,
    );
  });
});

describe("7D5b S0 — E5: the two bodies an M1 conversion swaps, priced by the sample book", () => {
  it.each([
    { buildId: "base-cabinet", amountMinor: 396_000 },
    { buildId: "base-dishwasher", amountMinor: 320_000 },
  ])(
    "prices $buildId at 600 mm at $amountMinor minor",
    ({ buildId, amountMinor }) => {
      expect(amountAt600Mm(buildId)).toBe(amountMinor);
    },
  );
});

const PRICED_WIDTH_MM = 600;

function amountAt600Mm(buildId: string): number {
  const definition = CATALOG.get(buildId);
  const rule = SAMPLE_PRICE_BOOK.cabinetRules.find(
    (candidate) => candidate.buildId === buildId,
  );
  const heightMm = definition?.nominalHeightMm;
  if (!definition || !rule || heightMm === undefined) {
    throw new Error(`${buildId} is not priced`);
  }
  const amount = amountForBody(rule.formula, {
    widthMm: PRICED_WIDTH_MM,
    heightMm,
    doorLeafCount: widthDerivedDoorLeafCount({
      buildId,
      rule: definition.cabinetHandles,
      widthMm: PRICED_WIDTH_MM,
    }),
  });
  if (amount === undefined) throw new Error(`${buildId} has no amount`);
  return amount;
}
