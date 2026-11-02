// **M6-AUD-006 / ADR 0100 decision 5: the copy and the coefficient move together, and neither moves
// alone.**
//
// A 700 mm carcass eats more board and, before the cut-over, priced identically to a 600 mm one. The owner ruled the
// shape — one dashboard-editable percentage on the cabinets that get deeper — and the cut-over (M10 P3) ships it as the
// book's depth rule and a depth line. The sentence that used to say depth does not change the estimate,
// `globalSettings.depthNote`, is retired (M10 T2); the settings sheet shows `globalSettings.depthNotePriced` instead.
//
// The danger a half-move leaves behind is a sentence that promises one price while the book charges another. The price
// half is asserted here, where the coefficient shipped. The copy half is asserted where the sentence is shown:
// `tests/settings/q1-depth-note.dom.test.ts` pins the note on the sheet to `depthNotePriced` at the published
// percentage, and `tests/settings/qa-q1-depth-note.adversarial.test.ts` pins the old leaf out of both catalogues.
//
// **What "the kitchen really got deeper" has to mean here.** The first version of this file asserted
// that some `buildId` changed, which proves a *rename* and not a rebuild: `resolveRebuildBody`
// renames to the catalogue equivalent on any rebuild, including a 600 -> 600 no-op, so a command
// that renamed all 26 bodies while building every one of them at 600 mm would have passed. What is
// asserted instead is a **depth-bearing quantity**: every body's built frame deepens except the
// freestanding fridge, whose 742 mm is a machine's and follows no setting, and wall B's run slides
// by its chain's own delta — `base-formula` +100 as the corner reach goes 560 -> 660, `wall-map`
// +70 as it goes 291 -> 361.
//
// **The depth line is measured, not assumed.** `price-design.ts` reads `widthMm` and `heightMm` only and resolves each
// priced row through `resolveCatalogEquivalent`, so no depth quantity reaches a cabinet's own amount; which cabinets
// take the percentage is `deepeningRows`, measured from the catalogue at the two depths (ADR 0177 A-6).
import {
  KITCHEN_L_DESIGN,
  buildKitchenLBodyCatalog,
  priceDesign,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  type Design,
  type PricingResult,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows";
import { NOTHING_DISABLED } from "../support/availability";

const OCCURRED_AT = "2026-09-08T12:00:00.000Z";
const DEFAULT_MM = 600;
const DEEPER_MM = 700;

/** The one body in this kitchen whose depth no setting reaches: a freestanding machine. */
const MANUFACTURED_SIZE_ID = "p7";

/** What each chain gains at the corner between the two settings — ADR 0089's own deltas. */
const ALONG_WALL_SLIDE_MM = { baseFormula: 100, wallMap: 70 } as const;

function createStore() {
  return createConfiguratorStore({
    design: KITCHEN_L_DESIGN,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    now: () => OCCURRED_AT,
  });
}

type Store = ReturnType<typeof createStore>;

interface DepthChange {
  readonly shallow: Design;
  readonly deep: Design;
  readonly frameDepthsBefore: ReadonlyMap<string, number>;
  readonly frameDepthsAfter: ReadonlyMap<string, number>;
  readonly alongBefore: ReadonlyMap<string, number>;
}

function frameDepthsOf(store: Store): Map<string, number> {
  return new Map(store.getState().records.map((r) => [r.id, r.frame.d]));
}

function alongOf(design: Design): Map<string, number> {
  return new Map(design.placements.map((p) => [p.id, p.alongMm]));
}

/** **A fresh store per case.** Running the command once at collection time would leave four tests
 *  sharing one mutation, and a failure in the first would change what the others were measuring. */
function deepenTheKitchen(): DepthChange {
  const store = createStore();
  const shallow = store.getState().design;
  const frameDepthsBefore = frameDepthsOf(store);
  const alongBefore = alongOf(shallow);

  store.getState().setCabinetDepth(DEEPER_MM);

  return {
    shallow,
    deep: store.getState().design,
    frameDepthsBefore,
    frameDepthsAfter: frameDepthsOf(store),
    alongBefore,
  };
}

/** Priced exactly as `usePricedDesign` prices it — same book, same version, same selections. */
function priceOf(design: Design): PricingResult {
  return priceDesign({
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
    design,
    catalog: buildKitchenLBodyCatalog(
      design.settings?.cabinetDepthMm ?? DEFAULT_MM,
    ),
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    selections: design.settings,
  });
}

describe("depth reaches the price as one depth line", () => {
  it("rebuilds every body to a new depth except the machine that follows no setting", () => {
    const change = deepenTheKitchen();

    expect(change.shallow.settings?.cabinetDepthMm ?? DEFAULT_MM).toBe(
      DEFAULT_MM,
    );
    expect(change.deep.settings?.cabinetDepthMm).toBe(DEEPER_MM);

    const unchanged = [...change.frameDepthsAfter]
      .filter(([id, depthM]) => change.frameDepthsBefore.get(id) === depthM)
      .map(([id]) => id);
    // Named, not counted: "25 of 26 moved" would also hold if the wrong one stood still.
    expect(unchanged).toEqual([MANUFACTURED_SIZE_ID]);
    expect(change.frameDepthsAfter.size).toBeGreaterThan(20);
  });

  it("slides wall B's run by each chain's own delta, which no rename could imitate", () => {
    const change = deepenTheKitchen();

    const slides = new Set(
      change.deep.placements
        .filter((placement) => placement.wall === "B")
        .map(
          (placement) =>
            placement.alongMm - (change.alongBefore.get(placement.id) ?? 0),
        ),
    );
    expect([...slides].sort((a, b) => a - b)).toEqual([
      ALONG_WALL_SLIDE_MM.wallMap,
      ALONG_WALL_SLIDE_MM.baseFormula,
    ]);
    // And wall A does not move at all: the slide is the corner's, not the whole kitchen's.
    for (const placement of change.deep.placements.filter(
      (p) => p.wall === "A",
    ))
      expect([placement.id, placement.alongMm]).toEqual([
        placement.id,
        change.alongBefore.get(placement.id),
      ]);
  });

  it("prices the seeded kitchen at all, so an equality of two refusals cannot pass", () => {
    const change = deepenTheKitchen();
    const atSixHundred = priceOf(change.shallow);

    expect(atSixHundred.ok).toBe(true);
    if (!atSixHundred.ok) return;
    expect(atSixHundred.priced.lines.length).toBeGreaterThan(0);
    expect(atSixHundred.priced.totalMinor).toBeGreaterThan(0);
  });

  it("adds the one depth line at 700 and moves no other line", () => {
    const change = deepenTheKitchen();
    const atSixHundred = priceOf(change.shallow);
    const atSevenHundred = priceOf(change.deep);
    if (!atSixHundred.ok || !atSevenHundred.ok) throw new Error("refused");

    const depthLines = atSevenHundred.priced.lines.filter(
      (line) => line.kind === "depth",
    );
    expect(depthLines).toHaveLength(1);
    expect(depthLines[0]?.amountMinor).toBeGreaterThan(0);
    expect(
      atSevenHundred.priced.lines
        .filter((line) => line.kind !== "depth")
        .map((line) => line.amountMinor),
    ).toEqual(atSixHundred.priced.lines.map((line) => line.amountMinor));
    expect(atSevenHundred.priced.totalMinor).toBe(
      atSixHundred.priced.totalMinor + (depthLines[0]?.amountMinor ?? 0),
    );
  });
});
