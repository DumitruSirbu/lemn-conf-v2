import { describe, expect, it } from "vitest";

import type {
  BodyMeasurement,
  BodyProbe,
  BodyProbeRequest,
} from "../../src/body-probe.js";
import {
  EXTRACTOR_HOOD_KIND,
  INSERTABLE_BODY_DEFINITIONS,
  resolveBuildableSizes,
} from "../../src/catalog.js";
import { setWidth } from "../../src/commands/set-width.js";
import type { Design, DesignPlacement } from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { deriveColumnKeyAt } from "../../src/void-engine.js";
import {
  clearBodies,
  insertInto,
  OCCURRED_AT,
  resizeTo,
} from "../support/commands.js";
import { createFakeProbe } from "../support/fake-probe.js";
import {
  advance,
  advanceWithColumns,
  createWorld,
  type KitchenWorld,
} from "../support/kitchen-world.js";
import { syntheticWorld } from "../support/synthetic-world.js";
import { LEGACY_ENUM_FINISHES } from "../../src/materials.js";

function kitchen(): KitchenWorld {
  return createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);
}

/** The nine columns of the shipped kitchen whose every member is deletable. The other three each
 *  hold a structural corner (§13.1), so none of them can ever become empty space. */
const CLEARABLE: readonly {
  readonly key: string;
  readonly ids: readonly string[];
}[] = [
  { key: "A|0.30", ids: ["p8", "p15"] },
  { key: "A|0.75", ids: ["p10", "p16"] },
  { key: "A|1.30", ids: ["p0", "p11", "p17"] },
  { key: "A|2.00", ids: ["p1", "p12", "p18"] },
  { key: "A|2.60", ids: ["p2", "p13", "p19"] },
  { key: "A|3.20", ids: ["p4", "p14", "p20"] },
  { key: "B|1.20", ids: ["p5", "p22"] },
  { key: "B|1.80", ids: ["p6", "p23"] },
  { key: "B|2.45", ids: ["p7", "p24"] },
];

/** Every width any shipped body lists, so the sweep cannot miss an accepted tap by guessing the
 *  chip set. Wider than §9 renders on purpose. */
const ALL_WIDTHS_MM: readonly number[] = [
  200, 300, 400, 450, 600, 700, 800, 900,
];

function acceptedTaps(world: KitchenWorld): readonly string[] {
  const accepted: string[] = [];
  for (const placement of world.design.placements) {
    for (const widthMm of ALL_WIDTHS_MM) {
      if (resizeTo(world, placement.id, widthMm).ok) {
        accepted.push(`${placement.id}@${String(widthMm)}`);
      }
    }
  }
  return accepted.sort();
}

/** The along-wall span of every body, in millimetres — the only thing a boundary move is about. */
function spansMm(design: Design): readonly string[] {
  return design.placements
    .map(
      (placement) =>
        `${placement.id}:${String(placement.alongMm - placement.body.widthMm / 2)}..${String(placement.alongMm + placement.body.widthMm / 2)}`,
    )
    .sort();
}

function openingKeys(world: KitchenWorld): readonly string[] {
  return world.voids
    .map(
      (opening) =>
        `${opening.col}@${opening.y0.toFixed(2)}+${opening.h.toFixed(2)}`,
    )
    .sort();
}

function placementAt(
  id: string,
  alongMm: number,
  y0Mm: number,
  buildId: string,
  widthMm: number,
  heightMm: number,
): DesignPlacement {
  return {
    id,
    wall: "A",
    alongMm,
    y0Mm,
    body: { buildId, widthMm, heightMm },
  };
}

/** Every tap the coarse width set accepts on the shipped kitchen at load; each one is a shrink (ADR 0035
 *  decision 7). Subtracted below so each clear is pinned by what it adds, not by the repeated load census. */
const LOAD_ACCEPTED_TAPS: readonly string[] = [
  // `A|1.30`, the 800 mm sink run, down to the sink aperture's floor.
  "p0@600",
  "p0@700",
  "p10@200",
  "p11@600",
  "p11@700",
  // `A|2.00`, whose 450/600 dishwasher makes the whole column discrete (§11 row 14).
  "p12@450",
  "p14@300",
  "p14@400",
  "p14@450",
  "p15@200",
  // No `p15@300` or `p8@300`: narrowing `A|0.30` to 300 vacates 0.30–0.60, which keys as `A|0.45`, the corner
  // leg's column, so the shrink refuses. Both return once `A|0.75` is cleared and there is an empty column.
  "p15@400",
  "p15@450",
  "p16@200",
  "p17@600",
  "p17@700",
  "p18@450",
  "p1@450",
  "p20@300",
  "p20@400",
  "p20@450",
  // `B|1.80`: the pantry `p6` and the wall cabinet `p23` above it move as one column (ADR 0048).
  "p23@400",
  "p23@450",
  "p4@300",
  "p4@400",
  "p4@450",
  "p6@400",
  "p6@450",
  "p8@200",
  "p8@400",
  "p8@450",
];

describe("Q1 — the legal-resize population, enumerated independently", () => {
  it("has no empty column at load, and every tap it accepts there is a shrink", () => {
    // Every accepted tap is a shrink: a growth has to consume an empty column and the kitchen has none at load.
    const world = kitchen();
    expect(world.voids).toEqual([]);

    const accepted = acceptedTaps(world);
    for (const tap of accepted) {
      const [placementId, widthMm] = tap.split("@");
      const placement = world.design.placements.find(
        (candidate) => candidate.id === placementId,
      );
      expect(Number(widthMm)).toBeLessThan(placement?.body.widthMm ?? 0);
    }
    expect(accepted).toEqual(LOAD_ACCEPTED_TAPS);
  });

  it("is dead on wall B apart from the pantry column ADR 0048 unfroze", () => {
    const blockers = new Map<string, string>();
    for (const record of kitchen().records.filter(
      (candidate) => candidate.wall === "B",
    )) {
      const definition = KITCHEN_L_BODY_CATALOG.get(record.buildId);
      const blocked =
        definition?.fixedWidth === true ||
        definition?.structuralReason === "corner" ||
        definition?.catalogEquivalentId === undefined;
      if (blocked && !blockers.has(record.col)) {
        blockers.set(record.col, record.id);
      }
    }
    expect([...blockers.keys()].sort()).toEqual([
      "B|0.61",
      "B|0.73",
      "B|1.20",
      "B|2.45",
    ]);

    // `p6` and `p23` are the pantry column and are meant to move, so they are not in the blocked list.
    const wallB = CLEARABLE.filter((column) => column.key.startsWith("B|"));
    for (const cleared of wallB) {
      const taps = acceptedTaps(clearBodies(kitchen(), cleared.ids));
      expect(
        taps.filter(
          (tap) =>
            tap.startsWith("p5") ||
            tap.startsWith("p7") ||
            tap.startsWith("p22") ||
            tap.startsWith("p24"),
        ),
      ).toEqual([]);
    }
  });

  // Pins the delta over the load census: a growth consumes an adjacent empty column (ADR 0031 rule 2).
  it("gains only moves in the columns adjacent to the clear", () => {
    const gains = CLEARABLE.map((cleared) => ({
      key: cleared.key,
      gained: acceptedTaps(clearBodies(kitchen(), cleared.ids))
        .filter((tap) => !LOAD_ACCEPTED_TAPS.includes(tap))
        .sort(),
    }));

    expect(gains).toEqual([
      // `A|0.75` grows into the 600 mm `A|0.30` frees, up to the 800 mm ceiling (ADR 0043).
      {
        key: "A|0.30",
        gained: [
          "p10@400",
          "p10@450",
          "p10@600",
          "p10@700",
          "p10@800",
          "p16@400",
          "p16@450",
          "p16@600",
          "p16@700",
          "p16@800",
        ],
      },
      // `p8@300` and `p15@300` return `A|0.30`'s width to the freed `A|0.75`, so no strip is created. The 700 and 800
      // growths leave a remainder, which is legal (ADR 0043).
      {
        key: "A|0.75",
        gained: ["p15@300", "p15@700", "p15@800", "p8@300", "p8@700", "p8@800"],
      },
      // The 800 mm clear is the largest, so `A|0.75` reaches the ceiling from 300.
      {
        key: "A|1.30",
        gained: [
          "p10@400",
          "p10@450",
          "p10@600",
          "p10@700",
          "p10@800",
          "p16@400",
          "p16@450",
          "p16@600",
          "p16@700",
          "p16@800",
        ],
      },
      // Its neighbours are `A|1.30` at the ceiling and `A|2.60`, frozen by the hob base.
      { key: "A|2.00", gained: [] },
      // `A|3.20` grows into the hob column's 600 mm. The hood `p13` is `fixedWidth`, so it gains nothing itself.
      {
        key: "A|2.60",
        gained: [
          "p14@700",
          "p14@800",
          "p20@700",
          "p20@800",
          "p4@700",
          "p4@800",
        ],
      },
      // The end of the run: one occupied neighbour, and it is the frozen hob column.
      { key: "A|3.20", gained: [] },
      // Clearing a neighbour of `B|1.80` gives the pantry column an empty column to grow into (ADR 0048). Clearing
      // `B|1.80` itself gains nothing: the column that would grow is the one just emptied.
      { key: "B|1.20", gained: ["p23@700", "p23@800", "p6@700", "p6@800"] },
      { key: "B|1.80", gained: [] },
      { key: "B|2.45", gained: ["p23@700", "p23@800", "p6@700", "p6@800"] },
    ]);
  });

  it("accepts 278 taps across the nine clears", () => {
    // 9 × 30 load taps − 30 taps on deleted bodies − 2 lost to the corner leg + 40 gained.
    const total = CLEARABLE.flatMap((cleared) =>
      acceptedTaps(clearBodies(kitchen(), cleared.ids)),
    ).length;
    expect(total).toBe(278);
  });

  it("opens no new column move when a second column is cleared", () => {
    const pairs: string[] = [];
    for (let left = 0; left < CLEARABLE.length; left += 1) {
      for (let right = left + 1; right < CLEARABLE.length; right += 1) {
        const first = CLEARABLE[left];
        const second = CLEARABLE[right];
        if (!first || !second) continue;
        const world = clearBodies(kitchen(), [...first.ids, ...second.ids]);
        for (const tap of acceptedTaps(world)) {
          const [id, widthMm] = tap.split("@");
          const column = kitchen().records.find(
            (record) => record.id === id,
          )?.col;
          pairs.push(`${column ?? ""}@${widthMm ?? ""}`);
        }
      }
    }
    expect([...new Set(pairs)].sort()).toEqual([
      "A|0.30@200",
      "A|0.30@300",
      "A|0.30@400",
      "A|0.30@450",
      "A|0.30@700",
      "A|0.30@800",
      "A|0.75@200",
      "A|0.75@400",
      "A|0.75@450",
      "A|0.75@600",
      "A|0.75@700",
      "A|0.75@800",
      "A|1.30@600",
      "A|1.30@700",
      "A|2.00@450",
      "A|3.20@300",
      "A|3.20@400",
      "A|3.20@450",
      "A|3.20@700",
      "A|3.20@800",
      // The pantry column (ADR 0048): the same four widths a single clear already reaches.
      "B|1.80@400",
      "B|1.80@450",
      "B|1.80@700",
      "B|1.80@800",
    ]);
  });
});

describe("Q2 — conservation and the inverse", () => {
  const INVERSES = [
    { clear: ["p8", "p15"], id: "p10", to: 400, back: 300 },
    { clear: ["p8", "p15"], id: "p10", to: 200, back: 300 },
    { clear: ["p10", "p16"], id: "p0", to: 600, back: 800 },
    { clear: ["p0", "p11", "p17"], id: "p10", to: 400, back: 300 },
    { clear: ["p1", "p12", "p18"], id: "p0", to: 600, back: 800 },
    { clear: ["p2", "p13", "p19"], id: "p4", to: 800, back: 600 },
  ] as const;

  it.each(INVERSES)(
    "$id $to then $back restores every span and every column extent",
    ({ clear, id, to, back }) => {
      const base = clearBodies(kitchen(), [...clear]);
      const spansBefore = spansMm(base.design);
      const columnsBefore = [...base.columns.values()]
        .map((column) => `${column.key}:${column.w.toFixed(4)}`)
        .sort();

      const grown = resizeTo(base, id, to);
      expect(grown.ok).toBe(true);
      if (!grown.ok) return;
      const middle = advanceWithColumns(
        base,
        grown.design,
        grown.effect.columns,
      );

      const shrunk = resizeTo(middle, id, back);
      expect(shrunk.ok).toBe(true);
      if (!shrunk.ok) return;
      const end = advanceWithColumns(
        middle,
        shrunk.design,
        shrunk.effect.columns,
      );

      expect(spansMm(end.design)).toEqual(spansBefore);
      expect(
        [...end.columns.values()]
          .map((column) => `${column.key}:${column.w.toFixed(4)}`)
          .sort(),
      ).toEqual(columnsBefore);
    },
  );

  it("conserves the run total on every accepted tap, to the millimetre", () => {
    // Includes the un-cleared kitchen: shrinking `A|0.30` must not replace the corner leg's frozen `A|0.45` column.
    const worlds = [
      kitchen(),
      ...CLEARABLE.map((cleared) => clearBodies(kitchen(), cleared.ids)),
    ];
    for (const base of worlds) {
      for (const placement of base.design.placements) {
        for (const widthMm of ALL_WIDTHS_MM) {
          const result = resizeTo(base, placement.id, widthMm);
          if (!result.ok) continue;
          const after = advanceWithColumns(
            base,
            result.design,
            result.effect.columns,
          );
          for (const wall of ["A", "B"] as const) {
            const total = (world: KitchenWorld): number =>
              [...world.columns.values()]
                .filter((column) => column.wall === wall)
                .reduce((sum, column) => sum + Math.round(column.w * 1000), 0);
            expect(total(after)).toBe(total(base));
          }
        }
      }
    }
  });
});

describe("Q3 — ADR 0011 Gap D through the resized column", () => {
  it("FINDING Q1.1: keeps the opening a delete freed in the column being resized", () => {
    // `p10`'s freed 700 mm slot must survive narrowing the top cabinet `p16` above it (ADR 0011 Gap D).
    const world = clearBodies(kitchen(), ["p8", "p15", "p10"]);
    expect(openingKeys(world)).toContain("A|0.75@1.50+0.70");

    const result = resizeTo(world, "p16", 400);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = advanceWithColumns(
      world,
      result.design,
      result.effect.columns,
    );

    // The column moved from `A|0.75` to `A|0.70`, so the opening moves with it rather than vanishing.
    expect(openingKeys(after)).toContain("A|0.70@1.50+0.70");
  });

  it("FINDING Q1.1 (second shape): the sink's freed floor space survives narrowing the wall run", () => {
    // The base slot is the only place a base cabinet can go back.
    const world = clearBodies(kitchen(), ["p0", "p1", "p12", "p18"]);
    expect(openingKeys(world)).toContain("A|1.30@0.00+0.86");

    const result = resizeTo(world, "p11", 600);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = advanceWithColumns(
      world,
      result.design,
      result.effect.columns,
    );

    expect(openingKeys(after)).toContain("A|1.20@0.00+0.86");
  });
});

describe("Q4 — choosing which empty column funds the move", () => {
  it("refuses on the right rather than falling back to the left, when only the left works", () => {
    const leftOnly = clearBodies(kitchen(), ["p8", "p15"]);
    expect(resizeTo(leftOnly, "p10", 200).ok).toBe(true);

    // With only the right column empty it is refused: widening `A|1.30` to 900 mm puts a base opening over `p25`.
    const rightOnly = clearBodies(kitchen(), ["p0", "p11", "p17"]);
    const refusedRight = resizeTo(rightOnly, "p10", 200);
    expect(refusedRight.ok).toBe(false);
    if (!refusedRight.ok) {
      expect(refusedRight.reason.code).toBe("RESIZE_OPENS_GAP");
    }
  });

  it("FINDING Q1.2: accepts the move when the left column can fund it and the right cannot", () => {
    // The right column (`A|1.30`) is tried first (`EMPTY_SPACE_ORDER`) and would widen to 900 mm over the corner
    // leg; the left (`A|0.30`) is legal, so the resize must fall back to it.
    const bothEmpty = clearBodies(kitchen(), ["p8", "p15", "p0", "p11", "p17"]);
    // Every opening the two clears derived stands over empty space, so any refusal comes from the choice of side.
    expect(openingKeys(bothEmpty)).toEqual([
      "A|0.30@1.50+0.70",
      "A|0.30@2.20+0.40",
      "A|1.30@0.00+0.86",
      "A|1.30@1.50+0.70",
      "A|1.30@2.20+0.40",
    ]);

    const result = resizeTo(bothEmpty, "p10", 200);

    expect(result.ok).toBe(true);
  });
});

describe("Q5 — a column's legal widths are the intersection of its members' sets", () => {
  it("keeps a two-door column off every width below 600", () => {
    const world = clearBodies(kitchen(), ["p10", "p16"]);
    for (const widthMm of [200, 300, 400, 450]) {
      const result = resizeTo(world, "p0", widthMm);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason.code).toBe("WIDTH_NOT_SUPPORTED");
    }
    expect(resizeTo(world, "p0", 600).ok).toBe(true);
  });

  it("resolves each member's set through its declared catalogue equivalent", () => {
    // None of the three members declares its own set; each resolves through `catalogEquivalentId` (ADR 0022) to
    // `base-dishwasher` {450, 600}, `open-shelf` 300–800 and `wall-cabinet` 200–800.
    const world = clearBodies(kitchen(), ["p2", "p13", "p19"]);
    for (const widthMm of [400, 800]) {
      const result = resizeTo(world, "p1", widthMm);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason.code).toBe("WIDTH_NOT_SUPPORTED");
    }
    expect(resizeTo(world, "p1", 450).ok).toBe(true);
    const unchanged = resizeTo(world, "p1", 600);
    expect(unchanged.ok).toBe(false);
    if (!unchanged.ok) expect(unchanged.reason.code).toBe("WIDTH_UNCHANGED");
  });

  it("has no empty intersection left to refuse: the hood was its only half", () => {
    // The hood is outside the column's width membership (ADR 0035 decision 6). Swept over every base row under
    // every non-hood wall row.
    const bands = [...INSERTABLE_BODY_DEFINITIONS];
    const baseRows = bands.filter(([, entry]) => entry.band === "base");
    const wallRows = bands.filter(([, entry]) => entry.band === "wall");
    const disjoint: string[] = [];
    for (const [baseId, baseEntry] of baseRows) {
      for (const [wallId, wallEntry] of wallRows) {
        if (wallEntry.kind === EXTRACTOR_HOOD_KIND) continue;
        const shared = resolveBuildableSizes(
          KITCHEN_L_BODY_CATALOG,
          baseId,
        ).filter((widthMm) =>
          resolveBuildableSizes(KITCHEN_L_BODY_CATALOG, wallId).includes(
            widthMm,
          ),
        );
        if (shared.length === 0) disjoint.push(`${baseId}+${wallId}`);
        expect(baseEntry.band).toBe("base");
      }
    }
    expect(disjoint).toEqual([]);
  });

  it("freezes a column whose hood is wider than anything its members are built at", () => {
    // A hood floors its column (ADR 0035 decision 6): `base-bottle-cargo` is built at 200 and 300 only, both below
    // the hood's 600, so the column has no legal width and is frozen in both directions.
    const world = clearBodies(
      syntheticWorld([
        placementAt("a-base", 700, 0, "base-bottle-cargo", 300, 860),
        placementAt("a-wall", 700, 1500, "hood", 600, 710),
        placementAt("b-base", 1600, 0, "base-panbank", 600, 860),
        placementAt("b-wall", 1600, 1500, "open-shelf", 600, 700),
      ]),
      ["b-base", "b-wall"],
    );

    const refused = resizeTo(world, "a-base", 200);

    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.reason.code).toBe("COLUMN_HOOD_FLOOR");
  });

  it("FINDING Q1.3: does not let a 'fit' member narrow the intersection", () => {
    // A `'fit'` base carcass does not narrow the intersection (ADR 0031 rule 5), so the 400 mm wall cabinet above
    // it may still go to 300.
    const world = clearBodies(
      syntheticWorld([
        placementAt("a-base", 600, 0, "base-panbank", 400, 860),
        placementAt("a-wall", 600, 1500, "wall-cabinet", 400, 700),
        placementAt("b-base", 1100, 0, "base-panbank", 600, 860),
        placementAt("b-wall", 1100, 1500, "base-panbank", 600, 700),
      ]),
      ["b-base", "b-wall"],
    );

    const result = resizeTo(world, "a-wall", 300);

    expect(result.ok).toBe(true);
  });
});

describe("Q6 — a mixed-width column", () => {
  it("is reachable with one ordinary insert, and is squared up rather than locked out", () => {
    // Clear a column's base slot and insert the bottle cargo: the column holds 300 mm under 600 mm, and a resize
    // squares it up (ADR 0035 decision 6).
    let world = clearBodies(
      syntheticWorld([
        placementAt("a-base", 1000, 0, "base-panbank", 600, 860),
        placementAt("a-wall", 1000, 1500, "wall-cabinet", 600, 700),
        placementAt("b-base", 1600, 0, "base-panbank", 600, 860),
        placementAt("b-wall", 1600, 1500, "wall-cabinet", 600, 700),
      ]),
      ["a-base"],
    );
    const slot = world.voids.find(
      (opening) => opening.col === "A|1.00" && opening.y0 < 0.1,
    );
    expect(slot).toBeDefined();
    if (!slot) return;

    const inserted = insertInto(
      world,
      { kind: "void", id: slot.id },
      "base-bottle-cargo",
    );
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    world = advance(world, inserted.design);

    const withSpace = clearBodies(world, ["b-base", "b-wall"]);
    const columnKey = withSpace.records.find(
      (record) => record.id === "a-wall",
    )?.col;
    const memberIds = withSpace.records
      .filter((record) => record.col === columnKey)
      .map((record) => record.id);
    const widthsOf = (design: Design): readonly number[] =>
      design.placements
        .filter((placement) => memberIds.includes(placement.id))
        .map((placement) => placement.body.widthMm);
    expect(new Set(widthsOf(withSpace.design)).size).toBeGreaterThan(1);

    let squaredUp = 0;
    for (const widthMm of ALL_WIDTHS_MM) {
      const result = resizeTo(withSpace, "a-wall", widthMm);
      if (!result.ok) {
        // A refusal here is about widths or space, never alignment.
        expect([
          "WIDTH_NOT_SUPPORTED",
          "WIDTH_UNCHANGED",
          "NO_EMPTY_SPACE",
          "RESIZE_OPENS_GAP",
        ]).toContain(result.reason.code);
        continue;
      }
      squaredUp += 1;
      const after = result.design.placements.filter((placement) =>
        memberIds.includes(placement.id),
      );
      // Squared up: one width and one centre at every level.
      for (const placement of after) {
        expect(placement.body.widthMm).toBe(widthMm);
        expect(placement.alongMm).toBe(after[0]?.alongMm);
      }
    }
    expect(squaredUp).toBeGreaterThan(0);
  });

  it("is produced by 13 of the 129 single-body inserts the shipped kitchen accepts", () => {
    // For each clearable column, member, opening and insertable entry: does the column stay flush?
    const locked: string[] = [];
    let accepted = 0;
    for (const cleared of CLEARABLE) {
      for (const removed of cleared.ids) {
        const world = clearBodies(kitchen(), [removed]);
        for (const opening of world.voids.filter(
          (candidate) => candidate.col === cleared.key,
        )) {
          for (const [buildId] of INSERTABLE_BODY_DEFINITIONS) {
            const inserted = insertInto(
              world,
              { kind: "void", id: opening.id },
              buildId,
            );
            if (!inserted.ok) continue;
            accepted += 1;
            const after = advance(world, inserted.design);
            const members = after.design.placements.filter((placement) =>
              after.records.some(
                (record) =>
                  record.id === placement.id && record.col === cleared.key,
              ),
            );
            const first = members[0];
            const flush = members.every(
              (placement) =>
                first !== undefined &&
                placement.alongMm === first.alongMm &&
                placement.body.widthMm === first.body.widthMm,
            );
            if (!flush) locked.push(`${cleared.key}<-${buildId}`);
          }
        }
      }
    }

    expect(accepted).toBe(129);
    expect(locked.sort()).toEqual(
      [
        "A|1.30<-base-bottle-cargo",
        "A|1.30<-base-dishwasher",
        "A|1.30<-base-hob-2drawer",
        "A|1.30<-base-hob-oven",
        "A|2.00<-base-bottle-cargo",
        "A|2.60<-base-bottle-cargo",
        "A|3.20<-base-bottle-cargo",
        "B|1.20<-base-bottle-cargo",
        "B|1.80<-base-bottle-cargo",
        "B|2.45<-base-bottle-cargo",
        "B|2.45<-base-dishwasher",
        "B|2.45<-base-hob-2drawer",
        "B|2.45<-base-hob-oven",
      ].sort(),
    );
  });
});

describe("Q7 — no opening may appear where a body physically stands", () => {
  it("holds on every accepted tap in the whole population", () => {
    for (const cleared of CLEARABLE) {
      const base = clearBodies(kitchen(), cleared.ids);
      for (const placement of base.design.placements) {
        for (const widthMm of ALL_WIDTHS_MM) {
          const result = resizeTo(base, placement.id, widthMm);
          if (!result.ok) continue;
          const after = advanceWithColumns(
            base,
            result.design,
            result.effect.columns,
          );
          const phantom = after.voids.filter((opening) =>
            after.records.some((record) => {
              if (record.wall !== opening.wall) return false;
              const bodyAlong =
                record.wall === "A" ? record.frame.x : record.frame.z;
              const openingAlong = opening.wall === "A" ? opening.x : opening.z;
              const along =
                Math.min(
                  bodyAlong + record.frame.w / 2,
                  openingAlong + opening.w / 2,
                ) -
                Math.max(
                  bodyAlong - record.frame.w / 2,
                  openingAlong - opening.w / 2,
                );
              const vertical =
                Math.min(
                  record.frame.y0 + record.frame.h,
                  opening.y0 + opening.h,
                ) - Math.max(record.frame.y0, opening.y0);
              return along > 1e-6 && vertical > 1e-6;
            }),
          );
          expect(phantom).toEqual([]);
        }
      }
    }
  });

  it("does not refuse a run that merely meets the empty column on a boundary", () => {
    // Touching is not overlapping: if the predicate counted a shared edge, no tap would be accepted.
    const world = clearBodies(kitchen(), ["p1", "p12", "p18"]);
    const result = resizeTo(world, "p0", 600);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = advanceWithColumns(
      world,
      result.design,
      result.effect.columns,
    );
    const resized = after.records.find((record) => record.id === "p0");
    const empty = after.voids.find((opening) => opening.y0 < 0.1);
    expect(resized).toBeDefined();
    expect(empty).toBeDefined();
    if (!resized || !empty) return;
    expect(resized.frame.x + resized.frame.w / 2).toBeCloseTo(
      empty.x - empty.w / 2,
      9,
    );
  });
});

describe("Q8 — the empty column's frozen extent, and §10", () => {
  it("still yields three openings from a cleared fridge column, before and after a resize elsewhere", () => {
    const cleared = clearBodies(kitchen(), ["p7", "p24"]);
    const fridge = (world: KitchenWorld): readonly string[] =>
      openingKeys(world).filter((key) => key.startsWith("B|2.45@"));
    expect(fridge(cleared)).toEqual([
      "B|2.45@0.00+0.86",
      "B|2.45@1.50+0.70",
      "B|2.45@2.20+0.40",
    ]);

    const world = clearBodies(cleared, ["p8", "p15"]);
    const result = resizeTo(world, "p10", 400);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = advanceWithColumns(
      world,
      result.design,
      result.effect.columns,
    );

    expect(fridge(after)).toEqual([
      "B|2.45@0.00+0.86",
      "B|2.45@1.50+0.70",
      "B|2.45@2.20+0.40",
    ]);
  });

  it("carries the empty column's regions, top and depth onto its new key unchanged", () => {
    const world = clearBodies(kitchen(), ["p8", "p15"]);
    const before = world.columns.get("A|0.30");
    expect(before).toBeDefined();
    if (!before) return;

    const result = resizeTo(world, "p10", 400);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const moved = result.effect.columns.get("A|0.25");
    expect(moved).toBeDefined();
    if (!moved) return;

    expect(moved.regions).toEqual(before.regions);
    expect(moved.top).toBe(before.top);
    expect(moved.d).toBe(before.d);
    expect(moved.ry).toBe(before.ry);
    expect(moved.w).toBeCloseTo(0.5, 9);
    expect(result.effect.columns.has("A|0.30")).toBe(false);
  });

  it("GAP Q1.4: names the empty column by a key its own published map no longer holds", () => {
    // `BodyResizedEffect.emptyColumnKey` is the key before the move, so it misses `effect.columns` whenever the
    // column survived; the new key is not published in the effect.
    const world = clearBodies(kitchen(), ["p8", "p15"]);
    const result = resizeTo(world, "p10", 400);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.effect.emptyColumnKey).toBe("A|0.30");
    expect(result.effect.emptyColumnWidthMm).toBe(500);
    expect(result.effect.columns.has(result.effect.emptyColumnKey)).toBe(false);
    expect(result.effect.columns.has("A|0.25")).toBe(true);
  });

  it("derives the moved empty column's key the way an occupied one is derived", () => {
    const world = clearBodies(kitchen(), ["p8", "p15"]);
    const result = resizeTo(world, "p10", 400);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([...result.effect.columns.keys()]).toContain(
      deriveColumnKeyAt("A", 0.25),
    );
  });

  it("takes a body inserted into the moved empty column under a key the map holds", () => {
    const world = clearBodies(kitchen(), ["p8", "p15"]);
    const result = resizeTo(world, "p10", 400);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = advanceWithColumns(
      world,
      result.design,
      result.effect.columns,
    );
    expect(after.voids.map((opening) => opening.col)).toEqual([
      "A|0.25",
      "A|0.25",
    ]);

    for (const opening of after.voids) {
      // `open-shelf` fits every opening here, so column identity is the only subject.
      const inserted = insertInto(
        after,
        { kind: "void", id: opening.id },
        "open-shelf",
      );
      expect(inserted.ok).toBe(true);
      if (!inserted.ok) continue;
      const reloaded = advance(after, inserted.design);
      for (const record of reloaded.records) {
        expect(after.columns.has(record.col)).toBe(true);
      }
    }
  });
});

describe("Q9 — atomicity", () => {
  it("writes nothing when a member half-way down the column fails its built-size re-check", () => {
    const world = clearBodies(kitchen(), ["p10", "p16"]);
    const asked: string[] = [];
    const probe: BodyProbe = {
      measure(request: BodyProbeRequest): BodyMeasurement {
        asked.push(request.buildId);
        const broken = request.buildId === "wall-cabinet";
        return {
          carcassWidthM: broken ? 0.123 : request.widthM,
          carcassHeightM: request.heightM,
          fullHeightM: request.heightM + 0.36,
          seatOffsetM: request.depthM / 2,
        };
      },
    };

    const result = setWidth({
      design: world.design,
      catalog: world.catalog,
      columns: world.columns,
      target: { kind: "placement", id: "p0" },
      widthMm: 600,
      probe,
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("BUILT_SIZE_MISMATCH");
    // The sink was built first and passed; the wall cabinet failed. Nothing was written.
    expect(asked).toEqual(["base-sink", "wall-cabinet"]);
    expect(result.design).toEqual(world.design);
  });
});

describe("Q10 — §11 rows 12 and 13, for every member", () => {
  it("carries the finish and the handle onto every member that can take them", () => {
    const design: Design = {
      room: { shape: "L", widthMm: 3600, depthMm: 2400, heightMm: 2600 },
      presetId: null,
      placements: [
        {
          id: "a-base",
          wall: "A",
          alongMm: 400,
          y0Mm: 0,
          body: {
            buildId: "base-panbank",
            widthMm: 600,
            heightMm: 860,
            finish: LEGACY_ENUM_FINISHES.sage,
            handle: "black",
          },
        },
        {
          id: "a-wall",
          wall: "A",
          alongMm: 400,
          y0Mm: 1500,
          body: {
            buildId: "wall-cabinet",
            widthMm: 600,
            heightMm: 700,
            finish: LEGACY_ENUM_FINISHES.sage,
            handle: "black",
          },
        },
        placementAt("a-top", 400, 2200, "open-shelf", 600, 400),
        placementAt("b-base", 1000, 0, "base-panbank", 600, 860),
        placementAt("b-wall", 1000, 1500, "wall-cabinet", 600, 700),
        placementAt("b-top", 1000, 2200, "open-shelf", 600, 400),
      ],
      createdAt: "2026-08-25T00:00:00.000Z",
      updatedAt: "2026-08-25T00:00:00.000Z",
    };
    const world = clearBodies(createWorld(design, KITCHEN_L_BODY_CATALOG), [
      "b-base",
      "b-wall",
      "b-top",
    ]);

    const result = resizeTo(world, "a-base", 800);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const body = (id: string) =>
      result.design.placements.find((placement) => placement.id === id)?.body;
    expect(body("a-base")?.finish).toEqual(LEGACY_ENUM_FINISHES.sage);
    expect(body("a-base")?.handle).toBe("black");
    // The wall cabinet above the selected base must keep its finish and handle too.
    expect(body("a-wall")?.finish).toEqual(LEGACY_ENUM_FINISHES.sage);
    expect(body("a-wall")?.handle).toBe("black");
    // An open shelf carries neither, and must not be given one.
    expect(body("a-top")?.finish).toBeUndefined();
    expect(body("a-top")?.handle).toBeUndefined();
  });
});

describe("Q11 — what a resize changes besides the width", () => {
  it("migrates a seeded base cabinet from its 820 mm frame to §7's 860 mm one, once", () => {
    // Seeded base rows are 820 mm tall and §7's base carcass is 860, so the first resize migrates `buildId`,
    // `heightMm` and `seatDepthMm` once; the migration is idempotent.
    const world = clearBodies(kitchen(), ["p10", "p16"]);
    expect(
      world.design.placements.find((placement) => placement.id === "p0")?.body,
    ).toEqual({ buildId: "base-sink-800", widthMm: 800, heightMm: 820 });

    const shrunk = resizeTo(world, "p0", 600);
    expect(shrunk.ok).toBe(true);
    if (!shrunk.ok) return;
    const middle = advanceWithColumns(
      world,
      shrunk.design,
      shrunk.effect.columns,
    );
    expect(
      middle.design.placements.find((placement) => placement.id === "p0")?.body,
    ).toEqual({
      buildId: "base-sink",
      widthMm: 600,
      heightMm: 860,
      seatDepthMm: 580,
    });

    const grown = resizeTo(middle, "p0", 800);
    expect(grown.ok).toBe(true);
    if (!grown.ok) return;
    expect(
      grown.design.placements.find((placement) => placement.id === "p0")?.body,
    ).toEqual({
      buildId: "base-sink",
      widthMm: 800,
      heightMm: 860,
      seatDepthMm: 580,
    });
  });

  it("never changes a member's wall or module line", () => {
    for (const cleared of CLEARABLE) {
      const base = clearBodies(kitchen(), cleared.ids);
      for (const placement of base.design.placements) {
        for (const widthMm of ALL_WIDTHS_MM) {
          const result = resizeTo(base, placement.id, widthMm);
          if (!result.ok) continue;
          for (const after of result.design.placements) {
            const before = base.design.placements.find(
              (candidate) => candidate.id === after.id,
            );
            expect(after.wall).toBe(before?.wall);
            expect(after.y0Mm).toBe(before?.y0Mm);
          }
        }
      }
    }
  });

  it("resizes only the members of the selected column, and nothing else", () => {
    for (const cleared of CLEARABLE) {
      const base = clearBodies(kitchen(), cleared.ids);
      for (const placement of base.design.placements) {
        for (const widthMm of ALL_WIDTHS_MM) {
          const result = resizeTo(base, placement.id, widthMm);
          if (!result.ok) continue;
          const moved = new Set(result.effect.columnPlacementIds);
          for (const after of result.design.placements) {
            if (moved.has(after.id)) continue;
            const before = base.design.placements.find(
              (candidate) => candidate.id === after.id,
            );
            expect(after).toEqual(before);
          }
        }
      }
    }
  });
});

describe("Q12 — the request itself", () => {
  it("refuses a void, a missing target and an unusable timestamp before anything else", () => {
    const world = clearBodies(kitchen(), ["p10", "p16"]);
    const probe = createFakeProbe();
    const call = (
      target: Parameters<typeof setWidth>[0]["target"],
      occurredAt: string,
    ) =>
      setWidth({
        design: world.design,
        catalog: world.catalog,
        columns: world.columns,
        target,
        widthMm: 600,
        probe,
        occurredAt,
      });

    const onVoid = call({ kind: "void", id: "anything" }, OCCURRED_AT);
    expect(onVoid.ok).toBe(false);
    if (!onVoid.ok) expect(onVoid.reason.code).toBe("VOID_SELECTED");

    const missing = call({ kind: "placement", id: "nope" }, OCCURRED_AT);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason.code).toBe("TARGET_NOT_FOUND");

    const stamped = call({ kind: "placement", id: "p0" }, "not-a-date");
    expect(stamped.ok).toBe(false);
    if (!stamped.ok) expect(stamped.reason.code).toBe("INVALID_OCCURRED_AT");

    expect(probe.requests).toEqual([]);
  });

  it("refuses a width that is not one of the column's, however it is expressed", () => {
    const world = clearBodies(kitchen(), ["p10", "p16"]);
    for (const widthMm of [
      Number.NaN,
      -600,
      0,
      599.5,
      601,
      Number.POSITIVE_INFINITY,
    ]) {
      const result = resizeTo(world, "p0", widthMm);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason.code).toBe("WIDTH_NOT_SUPPORTED");
    }
  });
});
