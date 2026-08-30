// Column identity across an ADR 0031 resize — ADR 0011 Gap D, and the half of M5 that is silent
// today.
//
// A column's key comes from a body's **centre** (§3.2), and a resize is the only operation that
// moves a body horizontally. Get this wrong in one direction and a whole column's worth of empty
// slots appears where nothing was deleted; get it wrong in the other and §10's delete stops
// producing openings at all. Each test below is named for the failure it catches.
//
// **Two keys move, never one.** Under ADR 0031 the resized column moves off its key and the empty
// column funding it moves off its own — the second is the part `rederiveTouchedColumns` cannot do,
// because an empty column has no member to re-derive an extent from.
import { describe, expect, it } from "vitest";

import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import {
  derivePlacementRecords,
  rederiveTouchedColumns,
  recomputeVoids,
  type BodyCatalog,
  type Column,
  type PlacementRecord,
  type VoidRecord,
} from "../../src/void-engine.js";
import { setWidth } from "../../src/commands/set-width.js";
import { clearBodies, OCCURRED_AT, resizeTo } from "../support/commands.js";
import { createFakeProbe } from "../support/fake-probe.js";
import { extentOf } from "../support/column-extents.js";
import {
  advance,
  advanceWithColumns,
  createWorld,
  type KitchenWorld,
} from "../support/kitchen-world.js";
import { syntheticWorld } from "../support/synthetic-world.js";

function kitchen(): KitchenWorld {
  return createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);
}

/** The shipped kitchen with `A|2.00` emptied through the real delete. It is the fixture almost
 *  every test here needs, because the shipped kitchen has **no empty column at load** and ADR 0031
 *  funds a resize from nowhere else — width editing is in practice a second step of deleting. */
function kitchenWithEmptyColumn(): KitchenWorld {
  return clearBodies(kitchen(), ["p1", "p12", "p18"]);
}

/** A missing column is a defect in the thing under test, so it fails loudly here rather than
 *  turning into an `undefined` that a `toEqual` might quietly accept. */
function nonNull(column: Column | undefined): Column {
  if (!column) throw new Error("Expected a column");
  return column;
}

/** A void's identity for comparison purposes: which column it belongs to and which slice of the
 *  wall it covers. Its `id` is regenerated on every recompute, so it cannot be used. */
function openingKey(record: VoidRecord): string {
  return `${record.col}@${record.y0.toFixed(3)}+${record.h.toFixed(3)}`;
}

function openingKeys(voids: readonly VoidRecord[]): string[] {
  return voids.map(openingKey).sort();
}

/** Applies a resize the way the store must — design **and** the columns the command published. */
function applyResize(
  world: KitchenWorld,
  placementId: string,
  widthMm: number,
): KitchenWorld {
  const result = resizeTo(world, placementId, widthMm);
  if (!result.ok) {
    throw new Error(`Resize of ${placementId} refused: ${result.reason.code}`);
  }
  return advanceWithColumns(world, result.design, result.effect.columns);
}

/** Whether a body physically stands inside an opening — the assertion `RESIZE_OPENS_GAP` became.
 *  Restated here rather than imported, so the test measures the property and not the code. */
function overlapsBody(
  opening: VoidRecord,
  records: readonly PlacementRecord[],
): boolean {
  return records.some((record) => {
    if (record.wall !== opening.wall) return false;
    const bodyAlong = record.wall === "A" ? record.frame.x : record.frame.z;
    const openAlong = opening.wall === "A" ? opening.x : opening.z;
    const along =
      Math.min(bodyAlong + record.frame.w / 2, openAlong + opening.w / 2) -
      Math.max(bodyAlong - record.frame.w / 2, openAlong - opening.w / 2);
    const vertical =
      Math.min(record.frame.y0 + record.frame.h, opening.y0 + opening.h) -
      Math.max(record.frame.y0, opening.y0);
    return along > 1e-6 && vertical > 1e-6;
  });
}

describe("no opening ever appears where a body physically stands", () => {
  it("holds after the resize, with the empty column moved onto its new key", () => {
    const world = kitchenWithEmptyColumn();

    const resized = applyResize(world, "p0", 600);

    expect(
      resized.voids.filter((opening) => overlapsBody(opening, resized.records)),
    ).toEqual([]);
    // The openings did move — the empty column shrank into 800 mm at a new key — which is exactly
    // why the old "the opening set must not change at all" rule had to be re-stated.
    expect(openingKeys(resized.voids)).toEqual([
      "A|1.90@0.000+0.860",
      "A|1.90@1.500+0.700",
      "A|1.90@2.200+0.400",
    ]);
    expect(resized.voids.map((opening) => opening.w)).toEqual([0.8, 0.8, 0.8]);
  });

  it("holds across every resize the shipped kitchen accepts after one column is cleared", () => {
    const accepted: string[] = [];
    for (const cleared of CLEARABLE_COLUMNS) {
      const world = clearBodies(kitchen(), cleared.ids);
      for (const placement of world.design.placements) {
        for (const widthMm of [200, 300, 400, 450, 600, 700, 800, 900]) {
          const result = resizeTo(world, placement.id, widthMm);
          if (!result.ok) continue;
          accepted.push(`${cleared.key}:${placement.id}@${String(widthMm)}`);
          const resized = advanceWithColumns(
            world,
            result.design,
            result.effect.columns,
          );
          expect(
            resized.voids.filter((opening) =>
              overlapsBody(opening, resized.records),
            ),
          ).toEqual([]);
        }
      }
    }
    // **Counted here, and named in `qa-w5c.adversarial.test.ts`.** The list used to be spelled out
    // in this file so the sweep could not pass by accepting nothing, and so that what the shipped
    // kitchen reaches after one delete was visible in the source. ADR 0035 decision 7 took that
    // population from 44 to 230 by making every shrink self-funding, and 230 lines of fixture in a
    // test whose subject is a *phantom opening* buries the assertion above them.
    //
    // The itemisation did not go away: the adversarial file pins the 26 taps accepted at load, the
    // 24 each clear gains, and the 2 lost to this very refusal, from the same width list. What is
    // left here is the guard against a vacuous sweep, which is what the number was always for.
    expect(accepted.length).toBe(230);
  });
});

/** Every column of the shipped kitchen whose members are all deletable. The three that are missing
 *  hold a structural corner, which §13.1 makes non-deletable — so they can never become the empty
 *  space ADR 0031 spends. */
const CLEARABLE_COLUMNS: readonly {
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

describe("the anti-invariant: frozen columns through a resize", () => {
  it("would report the whole resized column as free space", () => {
    // Demonstrated rather than asserted in the abstract. Run the resize's design through the frozen
    // map the store holds for every *other* command and `A|1.30` still carries the regions of three
    // bodies that have moved to `A|1.20` — three openings on a stretch of wall where the sink and
    // two cabinets are standing — while the empty column at `A|2.00` is counted a second time at
    // its old 600 mm.
    const world = kitchenWithEmptyColumn();
    const result = resizeTo(world, "p0", 600);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const frozen = advance(world, result.design);

    expect(openingKeys(frozen.voids)).toEqual([
      "A|1.30@0.000+0.860",
      "A|1.30@1.500+0.700",
      "A|1.30@2.200+0.400",
      "A|2.00@0.000+0.860",
      "A|2.00@1.500+0.700",
      "A|2.00@2.200+0.400",
    ]);
    expect(
      frozen.voids.filter((opening) => overlapsBody(opening, frozen.records)),
    ).toHaveLength(3);
  });
});

describe("a delete after a resize produces openings at the resized width", () => {
  it("gives 600 mm openings where the column now stands, not 800 at the old key", () => {
    const resized = applyResize(kitchenWithEmptyColumn(), "p0", 600);

    const cleared = clearBodies(resized, ["p0", "p11", "p17"]);

    const opened = cleared.voids.filter((record) => record.col === "A|1.20");
    expect(
      opened.map((record) => [
        Math.round(record.y0 * 1000),
        Math.round(record.w * 1000),
      ]),
    ).toEqual([
      [0, 600],
      [1500, 600],
      [2200, 600],
    ]);
    expect(cleared.voids.some((record) => record.col === "A|1.30")).toBe(false);
  });
});

describe("delete alone still keeps every column frozen", () => {
  it("clears the fridge column into three openings, never zero", () => {
    // §10's signature flow, and ADR 0011 Gap D verbatim: a global recompute on delete makes the
    // delete do nothing at all. This wave adds a per-operation update, and this is the assertion
    // that it stayed per-operation.
    const cleared = clearBodies(kitchen(), ["p7", "p24"]);
    const opened = cleared.voids.filter((record) => record.col === "B|2.45");

    expect(
      opened.map((record) => [
        Math.round(record.y0 * 1000),
        Math.round(record.w * 1000),
        Math.round(record.h * 1000),
      ]),
    ).toEqual([
      [0, 700, 860],
      [1500, 700, 700],
      [2200, 700, 400],
    ]);
  });

  it("leaves the whole column map untouched", () => {
    const world = kitchen();
    const cleared = clearBodies(world, ["p7", "p24"]);
    expect(extentsOf(cleared.columns)).toEqual(extentsOf(world.columns));
  });
});

function extentsOf(columns: ReadonlyMap<string, Column>) {
  return [...columns.entries()]
    .map(([key, column]) => [key, extentOf(column)] as const)
    .sort((left, right) => left[0].localeCompare(right[0]));
}

describe("only the two keys the resize moved change", () => {
  it("leaves every other key byte-identical, regions and top included", () => {
    const world = kitchenWithEmptyColumn();
    const resized = applyResize(world, "p0", 600);
    const moved = new Set(["A|1.30", "A|2.00", "A|1.20", "A|1.90"]);

    for (const [key, column] of world.columns) {
      if (moved.has(key)) continue;
      expect(extentOf(nonNull(resized.columns.get(key)))).toEqual(
        extentOf(column),
      );
    }
    // And the keys it did move really are those four, so the exclusion above is not hiding a
    // change somewhere else.
    expect(
      [...resized.columns.keys()]
        .filter((key) => !world.columns.has(key))
        .sort(),
    ).toEqual(["A|1.20", "A|1.90"]);
    expect(
      [...world.columns.keys()]
        .filter((key) => !resized.columns.has(key))
        .sort(),
    ).toEqual(["A|1.30", "A|2.00"]);
  });

  it("carries the empty column's frozen regions and top onto its new key", () => {
    // ADR 0031 rule 4, and the reason the empty column is patched in `setWidth` rather than left to
    // `rederiveTouchedColumns`: it has no member to derive an extent from, and its regions are the
    // openings the delete freed. Re-deriving them would take them away — §10's flow, verbatim.
    const world = kitchenWithEmptyColumn();
    const before = nonNull(world.columns.get("A|2.00"));

    const resized = applyResize(world, "p0", 600);
    const after = nonNull(resized.columns.get("A|1.90"));

    expect(after.regions).toEqual(before.regions);
    expect(after.top).toBe(before.top);
    expect(after.d).toBe(before.d);
    // Only the width and the along-wall centre moved.
    expect(after.w).toBeCloseTo(0.8, 9);
    expect(after.x).toBeCloseTo(1.9, 9);
    expect(after.z).toBe(before.z);
  });

  it("removes the empty column's key entirely when the resize consumes it", () => {
    const world = clearBodies(
      syntheticWorld([
        ...runMember("l", 1300, 600, 0, 820, "base-drawer2-600"),
        ...runMember("lw", 1300, 600, 1500, 700, "open-shelf-600"),
        ...runMember("r", 1700, 200, 0, 820, "base-drawer2-600"),
        ...runMember("rw", 1700, 200, 1500, 700, "open-shelf-600"),
      ]),
      ["r", "rw"],
    );

    const resized = applyResize(world, "l", 800);

    expect(resized.columns.has("A|1.70")).toBe(false);
    expect(nonNull(resized.columns.get("A|1.40")).w).toBeCloseTo(0.8, 9);
    expect(
      resized.voids.filter((opening) => overlapsBody(opening, resized.records)),
    ).toEqual([]);
  });
});

function runMember(
  id: string,
  alongMm: number,
  widthMm: number,
  y0Mm: number,
  heightMm: number,
  buildId: string,
) {
  return [
    {
      id,
      wall: "A" as const,
      alongMm,
      y0Mm,
      body: { buildId, widthMm, heightMm },
    },
  ];
}

describe("the resized column keeps the openings a delete freed (FINDING Q1.1)", () => {
  it("moves the freed slot with the column instead of dropping it", () => {
    // ADR 0011 Gap D, in the one column the ADR's own protection did not reach.
    // `rederiveTouchedColumns` answers a key from the members **left** under it, so a column that
    // had a member deleted earlier in the session lost that member's region the moment a resize
    // re-derived it — and the opening the customer had just freed vanished, with no void and no way
    // back. ADR 0031 is what made it reachable: before column scope, a resize never moved a key
    // with a deleted sibling under it.
    //
    // Clear `A|0.30` for the empty space, delete `p10`, and the wall slot at `A|0.75` is derived.
    // Narrow the top cabinet still standing above it and the slot must move, not disappear.
    const world = clearBodies(kitchen(), ["p8", "p15", "p10"]);
    expect(openingKeys(world.voids)).toContain("A|0.75@1.500+0.700");

    const resized = applyResize(world, "p16", 400);

    expect(openingKeys(resized.voids)).toContain("A|0.70@1.500+0.700");
    expect(
      resized.voids.filter((opening) => overlapsBody(opening, resized.records)),
    ).toEqual([]);
  });

  it("keeps the base slot under a wall run that narrows", () => {
    // The same defect one level down, and the more expensive one: the freed base slot is the only
    // place a base cabinet can go back.
    const world = clearBodies(kitchen(), ["p0", "p1", "p12", "p18"]);
    expect(openingKeys(world.voids)).toContain("A|1.30@0.000+0.860");

    const resized = applyResize(world, "p11", 600);

    expect(openingKeys(resized.voids)).toContain("A|1.20@0.000+0.860");
  });

  it("carries the resized column's frozen regions, top and depth onto its new key", () => {
    // The same guarantee the empty column already had, now stated for the run that moved. Only
    // `w`, the along-wall centre and the key change.
    const world = kitchenWithEmptyColumn();
    const before = nonNull(world.columns.get("A|1.30"));

    const resized = applyResize(world, "p0", 600);
    const after = nonNull(resized.columns.get("A|1.20"));

    expect(after.regions).toEqual(before.regions);
    expect(after.top).toBe(before.top);
    expect(after.d).toBe(before.d);
    expect(after.ry).toBe(before.ry);
    expect(after.w).toBeCloseTo(0.6, 9);
    expect(after.x).toBeCloseTo(1.2, 9);
  });
});

describe("the funding side is chosen with the phantom test, not before it (FINDING Q1.2)", () => {
  it("falls through to the left when the right would open a gap", () => {
    // Right is tried first. With `A|1.30` empty it funds the move geometrically and then derives a
    // 900 mm opening over the corner leg `p25`; the scan must carry on to `A|0.30`, which funds it
    // and stands over nothing. Before this, clearing a *second* column made a move that was legal
    // with one clear illegal with two — more space, fewer options.
    const leftOnly = clearBodies(kitchen(), ["p8", "p15"]);
    expect(resizeTo(leftOnly, "p10", 200).ok).toBe(true);

    const bothEmpty = clearBodies(kitchen(), ["p8", "p15", "p0", "p11", "p17"]);
    const result = resizeTo(bothEmpty, "p10", 200);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Funded from the left: `A|0.30` widens from 600 to 700 and `A|1.30` is untouched.
    expect(result.effect.emptyColumnKey).toBe("A|0.30");
    expect(result.effect.emptyColumnWidthMm).toBe(700);
    expect(nonNull(result.effect.columns.get("A|1.30")).w).toBeCloseTo(0.8, 9);
  });

  it("refuses only when no side can fund the move without a phantom", () => {
    // With just the right column empty there is nowhere to fall through to, so the refusal stands —
    // and it names both sides, so the customer knows which one to clear.
    const rightOnly = clearBodies(kitchen(), ["p0", "p11", "p17"]);

    const result = resizeTo(rightOnly, "p10", 200);

    expect(result.ok).toBe(false);
    if (result.ok || result.reason.code !== "RESIZE_OPENS_GAP") {
      expect.unreachable("expected RESIZE_OPENS_GAP");
    }
    expect(result.reason.params.sides).toEqual([
      { side: "right", reason: "opens_a_gap" },
      { side: "left", reason: "absent" },
    ]);
  });
});

describe("the effect names the empty column on both sides of the move (GAP Q1.4)", () => {
  it("publishes the key it had and the key it holds now", () => {
    const world = kitchenWithEmptyColumn();

    const result = resizeTo(world, "p0", 600);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effect.emptyColumnKey).toBe("A|2.00");
    expect(result.effect.columns.has("A|2.00")).toBe(false);
    expect(result.effect.emptyColumnNewKey).toBe("A|1.90");
    expect(result.effect.columns.has("A|1.90")).toBe(true);
  });

  it("names no new key when the resize consumed the space exactly", () => {
    const world = clearBodies(
      syntheticWorld([
        ...runMember("l", 1300, 600, 0, 820, "base-drawer2-600"),
        ...runMember("lw", 1300, 600, 1500, 700, "open-shelf-600"),
        ...runMember("r", 1700, 200, 0, 820, "base-drawer2-600"),
        ...runMember("rw", 1700, 200, 1500, 700, "open-shelf-600"),
      ]),
      ["r", "rw"],
    );

    const result = resizeTo(world, "l", 800);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effect.emptyColumnWidthMm).toBe(0);
    expect(result.effect.emptyColumnNewKey).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// §2's whole-millimetre rule binds what the **document** stores, and nothing else.
// ---------------------------------------------------------------------------

/** A catalogue with one entry whose widths are odd, which the shipped one has no way to express —
 *  every real set is a multiple of 50. It is the only way to reach an odd empty-column remainder at
 *  all: a member's centre moves by half the delta, so the delta must be even for the move to be
 *  persistable, and the remainder is then odd only if the empty column's own width is.
 *
 *  801 is the even-delta width (601 → 801 moves each centre 100 mm) and 800 the odd-delta one
 *  (601 → 800 moves them 99.5), so both halves of §2's rule are reachable from one entry. */
const ODD_WIDTHS_MM = [601, 800, 801];
const ODD_BUILD_ID = "qa-odd-widths";

function oddWidthCatalog(): BodyCatalog {
  const panbank = KITCHEN_L_BODY_CATALOG.get("base-panbank");
  if (!panbank) throw new Error("base-panbank is missing from the catalogue");
  return new Map([
    ...KITCHEN_L_BODY_CATALOG,
    [
      ODD_BUILD_ID,
      {
        ...panbank,
        sizesMm: ODD_WIDTHS_MM,
        // Both fields, never one. Overriding `sizesMm` alone would leave the pan bank's own
        // 300–800 cabinetry bound behind from the spread, and 801 would be refused by a rule this
        // fixture is not about — the footgun ADR 0035's `discreteWidths` helper exists to close.
        widthRangesMm: ODD_WIDTHS_MM.map((size) => ({
          minMm: size,
          maxMm: size,
        })),
      },
    ],
  ]);
}

/** Two abutting single-member columns of odd width, with the right one emptied. Their shared edge
 *  falls on a half-millimetre, which is exactly why both have to be odd for them to abut at all. */
function oddWidthRun(widthMm: number): KitchenWorld {
  const leftCentreMm = 1300;
  const rightCentreMm = leftCentreMm + widthMm;
  const world = createWorld(
    {
      room: { shape: "L", widthMm: 3600, depthMm: 2400, heightMm: 2600 },
      presetId: null,
      placements: [
        ["l", leftCentreMm],
        ["r", rightCentreMm],
      ].map(([id, alongMm]) => ({
        id: id as string,
        wall: "A" as const,
        alongMm: alongMm as number,
        y0Mm: 0,
        body: { buildId: ODD_BUILD_ID, widthMm, heightMm: 860 },
      })),
      createdAt: "2026-08-25T00:00:00.000Z",
      updatedAt: "2026-08-25T00:00:00.000Z",
    },
    oddWidthCatalog(),
  );
  return clearBodies(world, ["r"]);
}

describe("the empty column's centre is derived state, not a persisted one (R1.5)", () => {
  it("accepts a move that leaves the empty column at an odd width", () => {
    // 601 → 801 spends 200 of a 601 mm empty column and leaves 401. Its new centre is whatever it
    // is; nothing writes it as millimetres, so §2 has nothing to say about it. Refusing here — as
    // the command used to, under a code naming `alongMm`, a placement field this value is not —
    // rejected a state the model represents perfectly.
    const world = oddWidthRun(601);

    const result = resizeTo(world, "l", 801);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effect.emptyColumnWidthMm).toBe(401);
    const moved = nonNull(
      result.effect.columns.get(String(result.effect.emptyColumnNewKey)),
    );
    expect(moved.w).toBeCloseTo(0.401, 9);
    // And the members, which *are* persisted, landed on whole millimetres.
    for (const placement of result.design.placements) {
      expect(Number.isInteger(placement.alongMm)).toBe(true);
    }
  });

  it("still refuses a member centre that is not a whole millimetre", () => {
    // The half of the rule that binds the document: 601 → 800 is a delta of 199, so each member's
    // centre would move by 99.5 mm and `DesignSchema` stores an integer.
    const world = oddWidthRun(601);
    const result = setWidth({
      design: world.design,
      catalog: world.catalog,
      columns: world.columns,
      target: { kind: "placement", id: "l" },
      widthMm: 800,
      probe: createFakeProbe(),
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok || result.reason.code !== "NON_INTEGER_MILLIMETRES") {
      expect.unreachable("expected NON_INTEGER_MILLIMETRES");
    }
    expect(result.reason.params.field).toBe("alongMm");
  });

  it("refuses that identically whichever side would fund it (R1.4)", () => {
    // Why returning immediately is right rather than a second Q1.2. A member's centre is
    // `columnCentre ± (newWidth − oldWidth) / 2`, so its parity is a fact about the two widths —
    // the other side would answer the same, and ending the scan costs nothing.
    const left = oddWidthRun(601);
    const bothSides = clearBodies(
      createWorld(
        {
          ...left.design,
          placements: [
            ...left.design.placements,
            {
              id: "far",
              wall: "A" as const,
              alongMm: 1300 - 601,
              y0Mm: 0,
              body: { buildId: ODD_BUILD_ID, widthMm: 601, heightMm: 860 },
            },
          ],
        },
        oddWidthCatalog(),
      ),
      ["far"],
    );

    for (const world of [left, bothSides]) {
      const result = setWidth({
        design: world.design,
        catalog: world.catalog,
        columns: world.columns,
        target: { kind: "placement", id: "l" },
        widthMm: 800,
        probe: createFakeProbe(),
        occurredAt: OCCURRED_AT,
      });
      expect(result.ok).toBe(false);
      if (!result.ok)
        expect(result.reason.code).toBe("NON_INTEGER_MILLIMETRES");
    }
  });
});

describe("a body that lands on an existing column key merges into it", () => {
  it("takes the MIN width, the MAX depth, and keeps every member's region", () => {
    // ADR 0031 makes this **unreachable through `setWidth`**: every member of a column moves by the
    // same amount into space that is empty at every level, so a resized column can never come to
    // rest on a key another run already holds. The merge rule still has to be right, because
    // backlog 2's re-split will reach it — so it is asserted on the mechanism directly, with a
    // record set in which one body has moved onto a key that is already occupied.
    const before = recordsFor([
      { id: "b", alongMm: 1400, widthMm: 400, y0Mm: 1500 },
      { id: "c", alongMm: 1300, widthMm: 800, y0Mm: 2200 },
    ]);
    const after = recordsFor([
      { id: "b", alongMm: 1300, widthMm: 600, y0Mm: 1500 },
      { id: "c", alongMm: 1300, widthMm: 800, y0Mm: 2200 },
    ]);
    const frozen = createWorld(
      runDesign([
        { id: "b", alongMm: 1400, widthMm: 400, y0Mm: 1500 },
        { id: "c", alongMm: 1300, widthMm: 800, y0Mm: 2200 },
      ]),
      KITCHEN_L_BODY_CATALOG,
    ).columns;

    const merged = nonNull(
      rederiveTouchedColumns(frozen, before, after).get("A|1.30"),
    );

    expect(merged.w).toBeCloseTo(0.6, 9);
    expect(merged.regions).toEqual([
      [1.5, 2.2],
      [2.2, 2.6],
    ]);
    // Nothing was dropped: both members resolve to the merged key.
    expect(after.filter((record) => record.col === "A|1.30")).toHaveLength(2);
  });
});

describe("the column update is expressible for a re-split", () => {
  it("yields a coherent map when one body becomes two, without touching the function", () => {
    // Backlog 2's re-split, fed straight to the update: the record set before holds one 800 mm
    // body and the set after holds two 400 mm bodies at the same total width. The function takes
    // the two record sets and the frozen map, and knows nothing about donors or targets — which is
    // exactly why it survived ADR 0031's pivot untouched.
    const before = recordsFor([
      { id: "x", alongMm: 1300, widthMm: 800, y0Mm: 1500 },
      { id: "y", alongMm: 2000, widthMm: 600, y0Mm: 1500 },
    ]);
    const after = recordsFor([
      { id: "x1", alongMm: 1100, widthMm: 400, y0Mm: 1500 },
      { id: "x2", alongMm: 1500, widthMm: 400, y0Mm: 1500 },
      { id: "y", alongMm: 2000, widthMm: 600, y0Mm: 1500 },
    ]);
    const frozen = createWorld(
      runDesign([
        { id: "x", alongMm: 1300, widthMm: 800, y0Mm: 1500 },
        { id: "y", alongMm: 2000, widthMm: 600, y0Mm: 1500 },
      ]),
      KITCHEN_L_BODY_CATALOG,
    ).columns;

    const updated = rederiveTouchedColumns(frozen, before, after);

    expect([...updated.keys()].sort()).toEqual(["A|1.10", "A|1.50", "A|2.00"]);
    expect(updated.get("A|1.10")?.w).toBeCloseTo(0.4, 9);
    expect(updated.get("A|1.50")?.w).toBeCloseTo(0.4, 9);
    // The untouched key comes through exactly as it was.
    expect(extentOf(nonNull(updated.get("A|2.00")))).toEqual(
      extentOf(nonNull(frozen.get("A|2.00"))),
    );
    // And the split produces no phantom opening: the two halves cover what the one body covered.
    expect(recomputeVoids(after, updated)).toEqual([]);
  });
});

interface RunSpec {
  readonly id: string;
  readonly alongMm: number;
  readonly widthMm: number;
  readonly y0Mm: number;
}

function runDesign(members: readonly RunSpec[]) {
  return {
    room: { shape: "L" as const, widthMm: 3600, depthMm: 2400, heightMm: 2600 },
    presetId: null,
    placements: members.map((member) => ({
      id: member.id,
      wall: "A" as const,
      alongMm: member.alongMm,
      y0Mm: member.y0Mm,
      body: {
        buildId: member.y0Mm >= 2200 ? "wall-2door-600-top" : "wall-2door-600",
        widthMm: member.widthMm,
        heightMm: member.y0Mm >= 2200 ? 400 : 700,
      },
    })),
    createdAt: "2026-08-25T00:00:00.000Z",
    updatedAt: "2026-08-25T00:00:00.000Z",
  };
}

function recordsFor(members: readonly RunSpec[]): PlacementRecord[] {
  return derivePlacementRecords(runDesign(members), KITCHEN_L_BODY_CATALOG);
}
