// What the overflow mark actually puts on screen, as opposed to what its constant declares.
//
// `overflow-mark.test.ts` pins `OVERFLOW_MARK_COLOR` at 90 units from `SELECTION_HIGHLIGHT_COLOR`
// and concludes that the mark can never be counted as a highlight. **That is arithmetic on two
// constants, and no pixel on screen is either of them.** The wash is translucent: every pixel it
// covers is `OVERFLOW_MARK_OPACITY` of the mark over `1 - OVERFLOW_MARK_OPACITY` of the body
// underneath, and it is that blend the desktop e2e's counter and `pixels.ts`'s void counter see. A
// wash over a warm, bright front composites much closer to signal red than the constant does.
//
// **Re-quantified 2026-09-06 under ADR 0091 decision 4**, which this file is the subject of.
//
// Wave 6M shipped it sweeping a `KITCHEN_PALETTE` of the five §5.5 enum finishes and resting on
// "the kitchen contains no such colour". Wave 6R retires that premise from both ends: ADR 0071
// decision 4 tints five woods warmer than anything the old sweep covered, and ADR 0078 decision 1
// gives MDF a picker that admits **every** six-digit hex — including `SELECTION_HIGHLIGHT_COLOR`'s
// own `#ff2d2d`. So the two sweeping blocks below are re-quantified onto **the finishes the
// pixel-counting e2e specs actually put on screen**, derived by reading the fixtures those specs
// load rather than restated beside them; a fixture that starts wearing a finish makes them go red,
// which is the point — the instrument's validity is a fact about the fixture and now says so. The
// third block is not softened but **inverted**: the base colours that break the count are asserted
// as reached facts, each with the control that reaches it named.
//
// **These three counters are unfit for an open palette, and wave 6V replaces them.** `pixels.ts`'s
// `near`, `blueTint` and `redTint` all identify a thing by its colour, which only works while the
// product's colours are closed and warm; after 6R a customer's own front can be any of the three
// signal colours, so `redTint` is already breached by every wood and `near` is breached by one
// picker value. Wave 6V retires colour identity from all three — counting what *changed* between
// two otherwise identical captures instead — and closes the product half, the selection outline
// that vanishes against a front painted its own hex. The breach block below is 6V's success
// criterion and 6V does not edit it: it is a fact about the colour space, not about the instrument.
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
import { SELECTION_HIGHLIGHT_COLOR } from "../src/selection-outline.js";

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

/** How far a recorded margin may have drifted before this file is wrong about it. ADR 0091's
 *  finding 1 is the reason it is stated at all: *Stejar Halifax* measures 59.31 composing its tint
 *  in floating point and 59.61 rounding the tinted base to integers first, so a criterion pinned to
 *  an exact float is decided by where a `Math.round` was placed rather than by the colour.
 *
 *  **0.1, and the number is chosen against the table it polices rather than against that 0.3.** At
 *  0.5 the two *Stejar* decors — 59.80 and 59.31 apart — could be swapped in `RECORDED_WOOD_MARGINS`
 *  with this file still green, which is ADR 0091 decision 4b's *"a named set, not a minimum"*
 *  decaying back into a minimum. The recorded values are therefore two-decimal measurements and the
 *  window is narrower than the closest gap between any two of them; the rounding hazard finding 1
 *  names is a different composition of the same colour, and a re-composition that moves a wood by
 *  0.3 is meant to be read, not absorbed. */
const MARGIN_TOLERANCE_UNITS = 0.1;

type Rgb = readonly [number, number, number];

function kitchenPartsSource(): string {
  return readFileSync(
    resolve(import.meta.dirname, "../src/kitchen-parts.ts"),
    "utf8",
  );
}

/** A wood's swatch hex is a **tint**, not the colour on screen: the grain it multiplies is what the
 *  framebuffer sees, so the two wood tones are read out of the call that builds them. Reading beats
 *  repeating: oak is the warmest thing in the kitchen and therefore the case that matters most, and
 *  a second copy of those hexes is how this sweep would stop tracking the material. */
function oakWoodColors(): readonly [Rgb, Rgb] {
  // Matched on the **binding**, and on every declaration of it rather than the first. Identifying
  // the grain by its third argument — the seed `7` — read whichever `woodTex` call came first in the
  // file, so a second texture seeded the same way, added above `oakTex`, would have been swept here
  // in oak's place with nothing going red. The floor texture is seeded 19 today; that is a value,
  // not a guarantee.
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

/** What a front with **no finish on it** is painted, read out of the kit that paints it for the
 *  same reason as `oakWoodColors` — this is the colour every front in both pixel-counting fixtures
 *  actually wears, and a copy of it here would stop tracking `M.door` the day the kit is repainted. */
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

/** **What one finish actually puts in the framebuffer**, which is `buildFinishMaterial`'s two arms
 *  expressed as colours: a flat decor or a free colour is its own hex on `M.door`, and a wood is
 *  `M.oak`'s single grain — both of its tones — **multiplied** by the declared tint.
 *
 *  The multiply stays in floating point because that is where the GPU does it. Rounding the tinted
 *  base to integers first moves *Stejar Halifax* by 0.3 units, which is ADR 0091 finding 1. */
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

/** **Every finish the two pixel-counting e2e specs put on a front**, read off the designs they
 *  load. `editor-rail.desktop.e2e.spec.ts` opens `/configurator/configure`, which seeds
 *  `KITCHEN_L_DESIGN`; `overflow-mark.e2e.spec.ts` stores `NARROWED_ROOM_OVERFLOWING_DESIGN`, which
 *  is the same placements in a narrower room.
 *
 *  Derived rather than declared, per ADR 0091 decision 4a: this returns nothing today, and the day
 *  a fixture wears a decor it returns that decor's rendered bases and the sweeps below re-measure
 *  against them. */
function finishesWornByTheFixtures(): readonly Finish[] {
  return [
    ...KITCHEN_L_DESIGN.placements,
    ...NARROWED_ROOM_OVERFLOWING_DESIGN.placements,
  ].flatMap((placement) => placement.body.finish ?? []);
}

/** The fronts as those two specs photograph them. A fixture wearing no finish renders in `M.door`'s
 *  own colour, which is why the door hex is here and the eight declared decors are not. */
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

/** **What the pixel-counting specs actually have on screen**: the fixtures' fronts, plus the two
 *  greys `globals.css` sets behind the scene. The background hexes stay literal because they are
 *  authored in another package's stylesheet, and ADR 0091 decision 4a names `kitchen-l-design.ts`
 *  and `kitchen-parts.ts` as the sources to derive from. */
const FIXTURE_PALETTE: readonly (readonly [string, Rgb])[] = [
  ...fixtureFrontBases(),
  ["paper", rgbOfHex("#faf8f4")] as const,
  ["stage", rgbOfHex("#f2f0ea")] as const,
];

/** Lighting and ACES tone mapping move a material's declared colour a long way in both directions
 *  before it reaches the framebuffer, so each entry is **swept** rather than sampled at its nominal
 *  value — from deep shadow to a highlight that clamps every channel. Carried past the point where
 *  the minimum stops moving: extending the sweep to 8 finds no closer composite, so this range
 *  contains the worst case rather than merely ending before it.
 *
 *  Per channel and clamped, which matters: red clamps first on a warm colour, so the far end of the
 *  sweep is not the near end scaled — it is a differently-hued colour, and that is where a warm
 *  base's composite comes nearest to the selection's red. */
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
    // The non-obvious fact the whole block rests on, asserted rather than assumed: neither
    // pixel-counting spec ever touches the finish control, and `placement()` in
    // `kitchen-l-design.ts` writes no `finish` key, so every front in both is `M.door`'s own white.
    // The e2e's "zero pixels clear 50 in any camera preset" is a true fact **about this fixture**,
    // and wave 6M universally-quantified it into a fact about the palette.
    // **The fixtures have fronts at all**, asserted first: `finishesWornByTheFixtures()` is empty
    // for a design that wears no finish *and* for a design that has no bodies, and the second reads
    // as a green tick under a thesis about what the specs photograph. Emptying `placements` in
    // either fixture must break this file, not satisfy it.
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
    // Recorded so a later reader sees the real number rather than re-deriving it from two hexes.
    //
    // Two figures, because the fronts and the background are different claims. ADR 0091's 128.5 is
    // the **front's** margin — its finding 6's `#eceeeb` row — and it is what changes the day a
    // fixture wears a decor. The paper and stage greys the same block sweeps sit slightly nearer at
    // 126.7, so the whole sweep's minimum is pinned beside it rather than rounded up to the ADR's
    // headline number.
    //
    // **The comparison against the constants' 90 has flipped, and the flip is the finding.** Wave
    // 6M swept oak and measured 76.1 — a third of the declared headroom spent by the blend, which
    // was this file's original point. Quantified onto fronts that are near-white, the blend lands
    // *further* from the selection than the two constants are from each other. Nothing improved:
    // the warm cases moved out of this sweep and into the breach block below, where they are
    // asserted as reached rather than as absent.
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

/** The five woods ADR 0071 declares, **found by asking how each is drawn** rather than listed: a
 *  palette entry is a wood when the adapter paints it onto `M.oak`'s grain. A sixth wood added to
 *  the domain enters this set on its own and the margin table below goes red naming it. */
function declaredWoodFinishes(): readonly Finish[] {
  return PALETTE_ENTRIES.map((entry) => paletteFinish(entry.entryId)).filter(
    (finish) => swatchOf(finish).isWood,
  );
}

function labelOf(finish: Finish): string {
  return finish.kind === "palette-entry" ? finish.entryId : finish.value;
}

/** The composite margins ADR 0091 measured for the five woods, **as a set with each entry named**.
 *  A single minimum would hide which decor moved, which is the failure mode the relayed table that
 *  put *Halifax* at 60.0 actually had. */
const RECORDED_WOOD_MARGINS: Readonly<Record<string, number>> = {
  "pal.stejar-bardolino": 59.8,
  "pal.stejar-halifax": 59.31,
  "pal.nuc-warmia": 44.62,
  "veneer.stejar": 55.87,
  "veneer.nuc": 43.04,
};

/** **What one wood's red excess is**, as two measurements rather than one.
 *
 *  The sweep's maximum alone is not a name. *Nuc Warmia* and veneer *Nuc* both reach 137 — the
 *  sweep's bright end clamps red at 255 on every wood, so two different tints arrive at the same
 *  ceiling and the table cannot tell them apart however tight its tolerance is. The tint's own tone
 *  is where they differ, so it is recorded beside the ceiling and the pair identifies the wood. */
interface UnmarkedRedExcess {
  /** The highest the brightness sweep reaches, against `MARK_MIN_RED_EXCESS`'s 50. */
  readonly atItsBrightest: number;
  /** The same excess at each rendered tone's own value — the grain multiplied by the tint, unlit. */
  readonly perTone: readonly number[];
}

/** The unmarked red-excesses ADR 0091 measured, named the same way. `redTint` has never had a block
 *  in this file, which is why a breach that predates wave 6R went unrecorded until now.
 *
 *  **Matched exactly**, with no tolerance: every figure here is a `Math.round` of a channel
 *  difference and therefore an integer, so a window of even 1 would let the two *Stejar* decors —
 *  108 and 109 — swap places with this file still green. */
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

/** The counters' other side, and the one that says why the e2e gate is still honest today. It is a
 *  fact about the **fixture**, so it lives outside the breach block below — which ADR 0091 makes
 *  wave 6V's success criterion and forbids 6V to edit. This is the property wave 6V's work item 3
 *  turns into an executable assertion at the e2e seam. */
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

/** **Every finish that is one flat colour**, found by asking how each is drawn rather than listed —
 *  the same derivation `declaredWoodFinishes` uses, negated. Two sources, because a front can be
 *  wearing either: the declared palette's non-wood decors, and the two free colours
 *  `LEGACY_ENUM_FINISHES` still names, which are what a document written under the shipped enum is
 *  carrying when it reaches the migration. `white` and `graphite` are palette entries and dedupe
 *  onto their own rows; `oak` is a wood and is filtered out here.
 *
 *  A ninth decor, or a sixth legacy name, joins this set on its own and the table below goes red
 *  naming it. */
function flatFinishes(): readonly Finish[] {
  const byLabel = new Map<string, Finish>();
  for (const finish of [
    ...PALETTE_ENTRIES.map((entry) => paletteFinish(entry.entryId)),
    ...Object.values(LEGACY_ENUM_FINISHES),
  ])
    if (!swatchOf(finish).isWood) byLabel.set(labelOf(finish), finish);
  return [...byLabel.values()];
}

/** What each flat finish is, and how far its washed pixel lands from the selection's ball.
 *
 *  **The hex is recorded beside the margin because a margin alone does not name a colour.**
 *  `pal.gri-havanna`'s `#9a938a` is declared in `finishes.ts` and was, until this table, the one
 *  finish colour in the product that no test read — the other four are pinned by
 *  `qa-6p-bridge-values.adversarial.test.ts` through their legacy names, and a decor with no legacy
 *  name inherited no pin. */
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

/** The nearest either counter's threshold comes to a flat finish anywhere in the sweep — the two
 *  numbers that say how much of this block is headroom rather than luck. Both belong to one decor:
 *  *Antracit* is the darkest and bluest thing the palette declares, so it owns the void margin
 *  washed and unwashed alike, and *Gri Havanna* owns the mark margin at 11 against a threshold of
 *  50. Recorded so a warmer or bluer decor added later moves a number a reader can see. */
const RECORDED_FLAT_WORST_CASES = {
  washedBlueOverRed: -35.04,
  unwashedBlueOverRed: 20,
  unwashedRedExcess: 11,
} as const;

/** **The rest of the palette, swept.** The two fixture blocks above quantify over the fronts the
 *  pixel-counting specs photograph, which today wear no finish at all; the block below them
 *  quantifies over the woods, every one of which breaches a counter. Between the two sat five
 *  finishes a customer can choose and no block measured — the three flat decors and the two legacy
 *  free colours. `pal.antracit` used to be swept, as one of wave 6M's five enum finishes, and lost
 *  its sweep when that premise was retired.
 *
 *  They are all benign, and that is the point of recording them: *benign* is a measurement here and
 *  not an assumption, and the day a decor is repainted warmer this block is what says so. */
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
    // The map of the offending region, swept over the whole cube rather than argued. Both bounds
    // are unchanged from wave 6M — they are true, and they are what wave 6V needs to know which
    // colours its replacement counter has to survive.
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
    // ADR 0078 decision 1, asserted through the query the reset rule and both load seams read
    // rather than restated about it: a RAL picker offers every free colour `FinishSchema` admits,
    // and `#ff2d2d` is one. Storable, loadable, and — since wave 6R's free-colour arm — painted.
    expect(
      materialOffersFinish(
        materialById(MDF_MATERIAL_ID),
        freeColourFinish("#ff2d2d"),
      ),
    ).toBe(true);
  });

  it("paints a front the counter cannot tell from a selection, with nothing selected", () => {
    // The load-bearing number, and it is model-independent: a front painted the highlight's own hex
    // is at distance 0 by identity, so every pixel of it is counted as selection pixels while no
    // body is selected at all. This is the product hole ADR 0091 records and wave 6V's item 1 owns.
    const painted = renderedBasesOf(freeColourFinish("#ff2d2d"));

    expect(painted).toHaveLength(1);
    expect(distanceTo(painted[0] ?? selection, selection)).toBe(0);
  });

  it("keeps that front inside the ball once the overflow wash covers it", () => {
    // The other model-independent number: one blend at a declared opacity. Marked or unmarked, an
    // MDF kitchen painted this colour is counted as selected.
    const closest = closestCompositeToTheSelection(freeColourFinish("#ff2d2d"));

    expect(closest).toBeLessThan(SELECTION_PIXEL_TOLERANCE);
    expect(Math.abs(closest - 25.09)).toBeLessThanOrEqual(
      MARGIN_TOLERANCE_UNITS,
    );
  });

  it("puts every declared wood inside the ball under the wash, and names each", () => {
    // All five, not two. Under ADR 0071 decision 2 the woods are one grain at five tints and the
    // tint multiplies, so every wood is darker and more red-dominant than the untinted oak the old
    // sweep measured at 76.1. Clearing the ball would need green/red around 0.87 — a near-neutral
    // warm grey — which ADR 0091 decision 2 refuses by name: a test instrument gets no vote on what
    // the product looks like.
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
    // `redTint`'s premise — "red over green **and** blue is what only the mark is" — has been false
    // since M1 and no block in this file has ever tested it. `M.oak`'s untinted grain alone reaches
    // 78 against a threshold of 50; every declared wood reaches further, because the tint deepens
    // the same grain. It is invisible today only because the seeded fixture writes no `finish` key.
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
