// What the overflow mark puts on screen, not what its constant declares: the wash is translucent, so
// every pixel it covers is `OVERFLOW_MARK_OPACITY` of the mark over the body beneath, and that blend is
// what the desktop e2e's counter and `pixels.ts`'s void counter see. A wash over a warm, bright front
// composites much closer to signal red than the constant does (ADR 0091 decision 4).
// The fixture sweeps quantify over the finishes the pixel-counting e2e specs actually put on screen,
// derived from their fixtures; the breach block records the base colours that break the count as facts.
// The wood breach is arithmetic on the model colours: tone mapping means the rendered app spends less of it.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  freeColourFinish,
  KITCHEN_L_DESIGN,
  LEGACY_ENUM_FINISHES,
  materialById,
  materialOffersFinish,
  NARROWED_ROOM_OVERFLOWING_DESIGN,
  paletteFinish,
  PALETTE_ENTRIES,
  type Finish,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { swatchOf } from "../src/finishes.js";
import {
  OVERFLOW_MARK_COLOR,
  OVERFLOW_MARK_OPACITY,
} from "../src/overflow-mark.js";
import {
  SELECTION_HIGHLIGHT_COLOR,
  SELECTION_OUTLINE_CASING_COLOR,
} from "../src/selection-outline.js";

/** `editor-rail.desktop.e2e.spec.ts`'s `HIGHLIGHT_TOLERANCE`, and `pixels.ts`'s `near` test is a
 *  Euclidean RGB ball of exactly that radius around `SELECTION_HIGHLIGHT_COLOR`. */
const SELECTION_PIXEL_TOLERANCE = 60;

/** The same spec's `VOID_BLUE_EXCESS`: `pixels.ts` counts a void's translucent fill as any pixel
 *  whose blue exceeds its red by this much. */
const VOID_BLUE_EXCESS = 25;

/** `overflow-mark.e2e.spec.ts`'s `MARK_MIN_RED_EXCESS`: `pixels.ts` counts a marked pixel as any
 *  pixel whose red exceeds **both** its green and its blue by this much. */
const MARK_MIN_RED_EXCESS = 50;

/** The material whose control is ADR 0071 decision 3's RAL picker. Named by id rather than found by
 *  shape, so the witness below is asserted *through* `materialOffersFinish` and never about it. */
const MDF_MATERIAL_ID = "material.painted-mdf";

/** How far a recorded margin may drift before this file is wrong about it. An exact float is not pinned:
 *  *Stejar Halifax* measures 59.31 composing its tint in floating point and 59.61 rounding to integers
 *  first (ADR 0091 finding 1). The window is narrower than the closest gap between two recorded values
 *  (the *Stejar* decors, 59.80 and 59.31): a wider one lets them swap in `RECORDED_WOOD_MARGINS` with the
 *  table still green, turning "a named set, not a minimum" (ADR 0091 decision 4b) back into a minimum. */
const MARGIN_TOLERANCE_UNITS = 0.1;

type Rgb = readonly [number, number, number];

function kitchenPartsSource(): string {
  return readFileSync(
    resolve(import.meta.dirname, "../src/kitchen-parts.ts"),
    "utf8",
  );
}

/** A wood's swatch hex is a tint, not the colour on screen: the grain it multiplies is what the
 *  framebuffer sees. The two oak tones are read out of the call that builds them, not copied. */
function oakWoodColors(): readonly [Rgb, Rgb] {
  // Matched on the binding and on every declaration of it: identifying the grain by its seed argument
  // would read whichever `woodTex` call came first, so a second texture seeded the same way would be
  // swept in oak's place with nothing going red.
  const calls = [
    ...kitchenPartsSource().matchAll(
      /const oakTex = woodTex\("(#[0-9a-f]{6})",\s*"(#[0-9a-f]{6})"/g,
    ),
  ];
  const call = calls[0];
  if (calls.length !== 1 || !call?.[1] || !call[2])
    throw new Error(
      `kitchen-parts.ts declares ${String(calls.length)} oak wood textures to read, not one`,
    );
  return [rgbOfHex(call[1]), rgbOfHex(call[2])];
}

/** What a front with no finish is painted, read out of the kit like `oakWoodColors` so it keeps
 *  tracking `M.door`: it is the colour every front in both pixel-counting fixtures wears. */
function doorFrontColor(): Rgb {
  const declaration = /door: phys\("door_matte_white", "(#[0-9a-f]{6})"/.exec(
    kitchenPartsSource(),
  );
  if (!declaration?.[1])
    throw new Error("kitchen-parts.ts declares no door material to read");
  return rgbOfHex(declaration[1]);
}

function rgbOfHex(hex: string): Rgb {
  const packed = new THREE.Color(hex).getHex();
  return [(packed >> 16) & 0xff, (packed >> 8) & 0xff, packed & 0xff];
}

function rgbOf(packed: number): Rgb {
  return [(packed >> 16) & 0xff, (packed >> 8) & 0xff, packed & 0xff];
}

/** The blend the framebuffer performs: a front-facing, `depthWrite: false` wash at its declared
 *  opacity over whatever the renderer already drew there. */
function composite(base: Rgb): Rgb {
  const mark = rgbOf(OVERFLOW_MARK_COLOR);
  const wash = OVERFLOW_MARK_OPACITY;
  return [0, 1, 2].map(
    (channel) =>
      wash * (mark[channel] ?? 0) + (1 - wash) * (base[channel] ?? 0),
  ) as unknown as Rgb;
}

function distanceTo(colour: Rgb, target: Rgb): number {
  return Math.hypot(
    colour[0] - target[0],
    colour[1] - target[1],
    colour[2] - target[2],
  );
}

/** `pixels.ts`'s `redTint` predicate, which compares red against **both** other channels. */
function redExcess(colour: Rgb): number {
  return Math.min(colour[0] - colour[1], colour[0] - colour[2]);
}

function roundedTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundedHundredth(value: number): number {
  return Math.round(value * 100) / 100;
}

/** What one finish puts in the framebuffer: a flat decor or free colour is its own hex on `M.door`; a
 *  wood is `M.oak`'s grain (both tones) multiplied by the declared tint. The multiply stays in floating
 *  point, as on the GPU: rounding the tinted base first moves *Stejar Halifax* by 0.3 (ADR 0091 finding 1). */
function renderedBasesOf(finish: Finish): readonly Rgb[] {
  const swatch = swatchOf(finish);
  const tint = rgbOfHex(swatch.color);
  if (!swatch.isWood) return [tint];
  return oakWoodColors().map(
    (tone) =>
      tone.map(
        (channel, index) => (channel * (tint[index] ?? 0)) / 255,
      ) as unknown as Rgb,
  );
}

/** Every finish the two pixel-counting e2e specs put on a front, read off the designs they load:
 *  `KITCHEN_L_DESIGN` (`editor-rail.desktop.e2e.spec.ts`) and `NARROWED_ROOM_OVERFLOWING_DESIGN`
 *  (`overflow-mark.e2e.spec.ts`). Derived, not declared (ADR 0091 decision 4a): empty today, and the day
 *  a fixture wears a decor the sweeps below re-measure against it. */
function finishesWornByTheFixtures(): readonly Finish[] {
  return [
    ...KITCHEN_L_DESIGN.placements,
    ...NARROWED_ROOM_OVERFLOWING_DESIGN.placements,
  ].flatMap((placement) => placement.body.finish ?? []);
}

/** The fronts as those two specs photograph them: a fixture wearing no finish renders in `M.door`'s colour. */
function fixtureFrontBases(): readonly (readonly [string, Rgb])[] {
  const worn = finishesWornByTheFixtures();
  if (worn.length === 0) return [["unfinished front", doorFrontColor()]];
  return worn.flatMap((finish) =>
    renderedBasesOf(finish).map(
      (base, tone) =>
        [`${swatchOf(finish).color} tone ${String(tone)}`, base] as const,
    ),
  );
}

/** What the pixel-counting specs have on screen: the fixtures' fronts, plus the two greys `globals.css`
 *  sets behind the scene. The background hexes stay literal: another package's stylesheet authors them. */
const FIXTURE_PALETTE: readonly (readonly [string, Rgb])[] = [
  ...fixtureFrontBases(),
  ["paper", rgbOfHex("#faf8f4")] as const,
  ["stage", rgbOfHex("#f2f0ea")] as const,
];

/** Lighting and ACES tone mapping move a declared colour a long way both ways, so each entry is swept
 *  from deep shadow to a highlight that clamps every channel, past the point where the minimum stops
 *  moving. Per channel and clamped: red clamps first on a warm colour, so the far end is a
 *  differently-hued colour, which is where a warm base composites nearest the selection's red. */
const BRIGHTNESS_FACTORS = Array.from(
  { length: 78 },
  (_, step) => 0.15 + step * 0.05,
);

function litVariants(base: Rgb): Rgb[] {
  return BRIGHTNESS_FACTORS.map(
    (factor) =>
      base.map((channel) =>
        Math.min(255, Math.round(channel * factor)),
      ) as unknown as Rgb,
  );
}

function closestCompositeOver(
  bases: readonly (readonly [string, Rgb])[],
): number {
  const selection = rgbOf(SELECTION_HIGHLIGHT_COLOR);
  return Math.min(
    ...bases.flatMap(([, base]) =>
      litVariants(base).map((lit) => distanceTo(composite(lit), selection)),
    ),
  );
}

describe("a washed pixel is never counted as a selection pixel, on the fixture", () => {
  const selection = rgbOf(SELECTION_HIGHLIGHT_COLOR);

  it("is quantified over fronts that wear no finish, and says so", () => {
    // Neither pixel-counting spec touches the finish control and `placement()` in `kitchen-l-design.ts`
    // writes no `finish` key, so every front is `M.door`'s own white. Fronts must exist at all:
    // `finishesWornByTheFixtures()` is also empty for a design with no bodies.
    expect(KITCHEN_L_DESIGN.placements.length).toBeGreaterThan(0);
    expect(NARROWED_ROOM_OVERFLOWING_DESIGN.placements.length).toBeGreaterThan(
      0,
    );
    expect(finishesWornByTheFixtures()).toEqual([]);
    expect(FIXTURE_PALETTE.map(([name]) => name)).toEqual([
      "unfinished front",
      "paper",
      "stage",
    ]);
    expect(doorFrontColor()).toEqual(rgbOfHex("#eceeeb"));
  });

  for (const [name, base] of FIXTURE_PALETTE) {
    it(`stays outside the ball over ${name}, at every brightness`, () => {
      for (const lit of litVariants(base)) {
        expect(
          distanceTo(composite(lit), selection),
          `${name} lit to ${JSON.stringify(lit)}`,
        ).toBeGreaterThan(SELECTION_PIXEL_TOLERANCE);
      }
    });
  }

  it("records the measured margin, and on this fixture it exceeds the constants' 90", () => {
    // ADR 0091's 128.5 is the fronts' margin (its finding 6, `#eceeeb`) and changes the day a fixture
    // wears a decor; the paper and stage greys sit nearer at 126.7, so the whole sweep's minimum is
    // pinned beside it. Over near-white fronts the blend lands further from the selection than the
    // constants' 90; the warm cases are asserted as reached in the breach block below.
    const closestOverTheFronts = closestCompositeOver(fixtureFrontBases());
    const closestOverEverything = closestCompositeOver(FIXTURE_PALETTE);

    expect(closestOverEverything).toBeGreaterThan(SELECTION_PIXEL_TOLERANCE);
    expect(roundedTenth(closestOverTheFronts)).toBe(128.5);
    expect(roundedTenth(closestOverEverything)).toBe(126.7);
    expect(closestOverEverything).toBeGreaterThan(
      distanceTo(rgbOf(OVERFLOW_MARK_COLOR), selection),
    );
  });
});

describe("a washed pixel is never counted as a void's blue fill, on the fixture", () => {
  for (const [name, base] of FIXTURE_PALETTE) {
    it(`reads redder than it is blue over ${name}, at every brightness`, () => {
      for (const lit of litVariants(base)) {
        const [red, , blue] = composite(lit);
        expect(
          blue - red,
          `${name} lit to ${JSON.stringify(lit)}`,
        ).toBeLessThan(VOID_BLUE_EXCESS);
      }
    });
  }
});

/** The five woods ADR 0071 declares, found by how each is drawn (painted onto `M.oak`'s grain): a sixth
 *  wood enters this set on its own and the margin table below goes red naming it. */
function declaredWoodFinishes(): readonly Finish[] {
  return PALETTE_ENTRIES.map((entry) => paletteFinish(entry.entryId)).filter(
    (finish) => swatchOf(finish).isWood,
  );
}

function labelOf(finish: Finish): string {
  return finish.kind === "palette-entry" ? finish.entryId : finish.value;
}

/** The composite margins ADR 0091 measured for the five woods, as a set with each entry named: a single
 *  minimum would hide which decor moved. */
const RECORDED_WOOD_MARGINS: Readonly<Record<string, number>> = {
  "pal.stejar-bardolino": 59.8,
  "pal.stejar-halifax": 59.31,
  "pal.nuc-warmia": 44.62,
  "veneer.stejar": 55.87,
  "veneer.nuc": 43.04,
};

/** One wood's red excess as two measurements: the sweep's maximum alone does not name a wood, since
 *  *Nuc Warmia* and veneer *Nuc* both reach 137 (the bright end clamps red at 255). The tint's own tone
 *  differs, so the pair identifies the wood. */
interface UnmarkedRedExcess {
  /** The highest the brightness sweep reaches, against `MARK_MIN_RED_EXCESS`'s 50. */
  readonly atItsBrightest: number;
  /** The same excess at each rendered tone's own value — the grain multiplied by the tint, unlit. */
  readonly perTone: readonly number[];
}

/** The unmarked red-excesses ADR 0091 measured, named the same way. Matched exactly: every figure is an
 *  integer, and a window of even 1 would let the two *Stejar* decors (108 and 109) swap places. */
const RECORDED_UNMARKED_RED_EXCESS: Readonly<
  Record<string, UnmarkedRedExcess>
> = {
  "pal.stejar-bardolino": { atItsBrightest: 108, perTone: [63, 44] },
  "pal.stejar-halifax": { atItsBrightest: 109, perTone: [52, 36] },
  "pal.nuc-warmia": { atItsBrightest: 137, perTone: [53, 36] },
  "veneer.stejar": { atItsBrightest: 115, perTone: [64, 44] },
  "veneer.nuc": { atItsBrightest: 137, perTone: [45, 31] },
};

function closestCompositeToTheSelection(finish: Finish): number {
  const selection = rgbOf(SELECTION_HIGHLIGHT_COLOR);
  return Math.min(
    ...renderedBasesOf(finish).flatMap((base) =>
      litVariants(base).map((lit) => distanceTo(composite(lit), selection)),
    ),
  );
}

function unmarkedRedExcessOf(finish: Finish): UnmarkedRedExcess {
  return {
    atItsBrightest: Math.max(
      ...renderedBasesOf(finish).flatMap((base) =>
        litVariants(base).map((lit) => redExcess(lit)),
      ),
    ),
    perTone: renderedBasesOf(finish).map((base) =>
      redExcess(base.map((channel) => Math.round(channel)) as unknown as Rgb),
    ),
  };
}

/** Why the e2e gate is honest today: a fact about the fixture, so it lives outside the breach block below. */
describe("an unwashed pixel of the fixture's own fronts is counted by nothing", () => {
  const selection = rgbOf(SELECTION_HIGHLIGHT_COLOR);

  for (const [name, base] of fixtureFrontBases())
    it(`reads as neither a mark, a void nor a selection over ${name}`, () => {
      for (const lit of litVariants(base)) {
        const where = `${name} lit to ${JSON.stringify(lit)}`;
        expect(redExcess(lit), where).toBeLessThan(MARK_MIN_RED_EXCESS);
        expect(lit[2] - lit[0], where).toBeLessThan(VOID_BLUE_EXCESS);
        expect(distanceTo(lit, selection), where).toBeGreaterThan(
          SELECTION_PIXEL_TOLERANCE,
        );
      }
    });
});

/**
 * `overflow-mark.e2e.spec.ts` counts the mark by red-over-both-channels and asserts that a screen full
 * of mark contains no highlight. The converse does not hold: the outline's red core is
 * `SELECTION_HIGHLIGHT_COLOR`, whose red exceeds both other channels by 210 against a threshold of 50,
 * so a selection is counted as a wash. The mark gate is sound because it counts with nothing selected.
 * The casing pass is swept too: near-black is neither red- nor blue-dominant, 242.49 from the selection.
 */
describe("the selection outline's own two colours, against all three counters", () => {
  const selection = rgbOf(SELECTION_HIGHLIGHT_COLOR);
  const casing = rgbOf(SELECTION_OUTLINE_CASING_COLOR);

  it("is counted as a mark by the mark's own threshold, which is why that gate counts nothing selected", () => {
    expect(redExcess(selection)).toBe(210);
    expect(redExcess(selection)).toBeGreaterThan(MARK_MIN_RED_EXCESS);
  });

  it("keeps the casing pass out of all three counters", () => {
    expect(redExcess(casing)).toBeLessThan(MARK_MIN_RED_EXCESS);
    expect(casing[2] - casing[0]).toBeLessThan(VOID_BLUE_EXCESS);
    expect(roundedHundredth(distanceTo(casing, selection))).toBe(242.49);
    expect(distanceTo(casing, selection)).toBeGreaterThan(
      SELECTION_PIXEL_TOLERANCE,
    );
  });
});

/** Every finish that is one flat colour, found by how each is drawn (`declaredWoodFinishes` negated):
 *  the palette's non-wood decors and the free colours `LEGACY_ENUM_FINISHES` names, which a document
 *  written under the old enum carries. Entries dedupe by label; a new decor or legacy name joins the
 *  set and turns the table below red naming it. */
function flatFinishes(): readonly Finish[] {
  const byLabel = new Map<string, Finish>();
  for (const finish of [
    ...PALETTE_ENTRIES.map((entry) => paletteFinish(entry.entryId)),
    ...Object.values(LEGACY_ENUM_FINISHES),
  ])
    if (!swatchOf(finish).isWood) byLabel.set(labelOf(finish), finish);
  return [...byLabel.values()];
}

/** What each flat finish is, and how far its washed pixel lands from the selection's ball. The hex is
 *  recorded beside the margin because a margin alone does not name a colour: `pal.gri-havanna` has no
 *  legacy name, so `qa-6p-bridge-values.adversarial.test.ts` does not pin its `#9a938a`. */
interface FlatFinishRecord {
  readonly hex: string;
  readonly margin: number;
}

const RECORDED_FLAT_FINISHES: Readonly<Record<string, FlatFinishRecord>> = {
  "pal.alb": { hex: "#eceeeb", margin: 128.47 },
  "pal.antracit": { hex: "#2b2d30", margin: 134.19 },
  "pal.gri-havanna": { hex: "#9a938a", margin: 122.29 },
  "#cbc3b8": { hex: "#cbc3b8", margin: 123.1 },
  "#8d9a84": { hex: "#8d9a84", margin: 129.13 },
};

/** The nearest either counter's threshold comes to a flat finish in the sweep. *Antracit*, the darkest
 *  and bluest decor, owns the void margin washed and unwashed; *Gri Havanna* owns the mark margin at 11
 *  against 50. Recorded so a warmer or bluer decor added later moves a visible number. */
const RECORDED_FLAT_WORST_CASES = {
  washedBlueOverRed: -35.04,
  unwashedBlueOverRed: 20,
  unwashedRedExcess: 11,
} as const;

/** The flat finishes the fixture does not wear: the three flat decors and the two legacy free colours.
 *  "Benign" is a measurement here, not an assumption: the day a decor is repainted warmer this block says so. */
describe("a flat finish the fixture does not wear is counted by nothing either", () => {
  const selection = rgbOf(SELECTION_HIGHLIGHT_COLOR);

  it("sweeps every flat finish the product declares, and names each", () => {
    expect(flatFinishes().map(labelOf).sort()).toEqual(
      Object.keys(RECORDED_FLAT_FINISHES).sort(),
    );
  });

  for (const finish of flatFinishes()) {
    const label = labelOf(finish);

    it(`paints ${label} the colour this table records`, () => {
      expect(swatchOf(finish).color).toBe(RECORDED_FLAT_FINISHES[label]?.hex);
    });

    it(`keeps ${label} out of all three counters, at every brightness`, () => {
      for (const lit of litVariants(renderedBasesOf(finish)[0] ?? [0, 0, 0])) {
        const where = `${label} lit to ${JSON.stringify(lit)}`;
        const washed = composite(lit);

        expect(distanceTo(washed, selection), where).toBeGreaterThan(
          SELECTION_PIXEL_TOLERANCE,
        );
        expect(washed[2] - washed[0], where).toBeLessThan(VOID_BLUE_EXCESS);
        expect(distanceTo(lit, selection), where).toBeGreaterThan(
          SELECTION_PIXEL_TOLERANCE,
        );
        expect(lit[2] - lit[0], where).toBeLessThan(VOID_BLUE_EXCESS);
        expect(redExcess(lit), where).toBeLessThan(MARK_MIN_RED_EXCESS);
      }
    });

    it(`records ${label}'s margin from the selection's ball`, () => {
      const margin = closestCompositeToTheSelection(finish);
      expect(
        Math.abs(margin - (RECORDED_FLAT_FINISHES[label]?.margin ?? 0)),
        `${label} measured ${margin.toFixed(2)}`,
      ).toBeLessThanOrEqual(MARGIN_TOLERANCE_UNITS);
    });
  }

  it("records how much headroom the two other counters have over the whole set", () => {
    const lits = flatFinishes().flatMap((finish) =>
      litVariants(renderedBasesOf(finish)[0] ?? [0, 0, 0]),
    );
    const worst = {
      washedBlueOverRed: roundedHundredth(
        Math.max(
          ...lits.map((lit) => {
            const washed = composite(lit);
            return washed[2] - washed[0];
          }),
        ),
      ),
      unwashedBlueOverRed: Math.max(...lits.map((lit) => lit[2] - lit[0])),
      unwashedRedExcess: Math.max(...lits.map((lit) => redExcess(lit))),
    };

    expect(worst).toEqual(RECORDED_FLAT_WORST_CASES);
  });
});

describe("the base colours that break the count, and the control that reaches them", () => {
  const selection = rgbOf(SELECTION_HIGHLIGHT_COLOR);

  it("maps the region: only a saturated red composites into the selection's ball", () => {
    // The offending region, swept over the whole cube rather than argued.
    const offending: Rgb[] = [];
    for (let red = 0; red < 256; red += 3)
      for (let green = 0; green < 256; green += 3)
        for (let blue = 0; blue < 256; blue += 3) {
          const base: Rgb = [red, green, blue];
          if (
            distanceTo(composite(base), selection) <= SELECTION_PIXEL_TOLERANCE
          )
            offending.push(base);
        }

    expect(offending.length).toBeGreaterThan(0);
    const leastSaturated = Math.min(
      ...offending.map((base) => base[0] - base[1]),
    );
    const palestRed = Math.min(...offending.map((base) => base[0]));
    expect(leastSaturated).toBe(102);
    expect(palestRed).toBe(204);
  });

  it("offers the highlight's own hex through MDF's picker", () => {
    // ADR 0078 decision 1, asserted through the query the reset rule and both load seams read: a RAL
    // picker offers every free colour `FinishSchema` admits, and `#ff2d2d` is one.
    expect(
      materialOffersFinish(
        materialById(MDF_MATERIAL_ID),
        freeColourFinish("#ff2d2d"),
      ),
    ).toBe(true);
  });

  it("paints a front the counter cannot tell from a selection, with nothing selected", () => {
    // Model-independent: a front painted the highlight's own hex is at distance 0 by identity, so every
    // pixel is counted as selection with no body selected (the product hole ADR 0091 records).
    const painted = renderedBasesOf(freeColourFinish("#ff2d2d"));

    expect(painted).toHaveLength(1);
    expect(distanceTo(painted[0] ?? selection, selection)).toBe(0);
  });

  it("keeps that front inside the ball once the overflow wash covers it", () => {
    // Model-independent: one blend at a declared opacity. Marked or not, an MDF kitchen in this colour
    // is counted as selected.
    const closest = closestCompositeToTheSelection(freeColourFinish("#ff2d2d"));

    expect(closest).toBeLessThan(SELECTION_PIXEL_TOLERANCE);
    expect(Math.abs(closest - 25.09)).toBeLessThanOrEqual(
      MARGIN_TOLERANCE_UNITS,
    );
  });

  it("puts every declared wood inside the ball under the wash, and names each", () => {
    // Under ADR 0071 decision 2 the woods are one grain at five tints that multiply, so every wood is
    // darker and more red-dominant than untinted oak. Clearing the ball would need green/red around 0.87
    // (a near-neutral warm grey), which ADR 0091 decision 2 refuses: a test instrument gets no vote on
    // the product's look.
    const measured = Object.fromEntries(
      declaredWoodFinishes().map((finish) => [
        labelOf(finish),
        closestCompositeToTheSelection(finish),
      ]),
    );

    expect(Object.keys(measured).sort()).toEqual(
      Object.keys(RECORDED_WOOD_MARGINS).sort(),
    );
    for (const [entryId, recorded] of Object.entries(RECORDED_WOOD_MARGINS)) {
      const margin = measured[entryId] ?? Number.NaN;
      expect(margin, `${entryId} margin`).toBeLessThan(
        SELECTION_PIXEL_TOLERANCE,
      );
      expect(
        Math.abs(margin - recorded),
        `${entryId} measured ${margin.toFixed(2)}, recorded ${recorded.toFixed(1)}`,
      ).toBeLessThanOrEqual(MARGIN_TOLERANCE_UNITS);
    }
  });

  it("lets an unmarked wood front clear the mark's own red-excess threshold", () => {
    // `redTint`'s premise, that red over green and blue is what only the mark is, is false: `M.oak`'s
    // untinted grain alone reaches 78 against a threshold of 50, and every wood reaches further. It is
    // invisible today only because the seeded fixture writes no `finish` key.
    const untintedOak = Math.max(
      ...oakWoodColors().flatMap((tone) =>
        litVariants(tone).map((lit) => redExcess(lit)),
      ),
    );
    expect(untintedOak).toBeGreaterThan(MARK_MIN_RED_EXCESS);
    expect(untintedOak).toBe(78);

    const measured = Object.fromEntries(
      declaredWoodFinishes().map((finish) => [
        labelOf(finish),
        unmarkedRedExcessOf(finish),
      ]),
    );
    expect(Object.keys(measured).sort()).toEqual(
      Object.keys(RECORDED_UNMARKED_RED_EXCESS).sort(),
    );
    for (const [entryId, recorded] of Object.entries(
      RECORDED_UNMARKED_RED_EXCESS,
    )) {
      const excess = measured[entryId];
      expect(
        excess?.atItsBrightest ?? 0,
        `${entryId} red excess`,
      ).toBeGreaterThan(MARK_MIN_RED_EXCESS);
      expect(excess, `${entryId} red excess`).toEqual(recorded);
    }
  });
});
