// Adversarial QA for ADR 0017's domain fix (M3 Wave 3B, round 2).
//
// `minimum-width.test.ts` proves the floor on the path it was written for: filling an **empty base
// void** through `offersFor` and `insertBody`. This file attacks the paths it does not cover — the
// swap in place of §5.3, the wall and column bands, the fixed-set width branch the new guard is not
// wired into, and the exact boundary the epsilon sits on.
import { describe, expect, it } from "vitest";

import {
  buildableSizes,
  INSERTABLE_BODY_DEFINITIONS,
  toInsertableBody,
} from "../../src/catalog.js";
import { evaluateInsertFit } from "../../src/commands/insert-fit.js";
import { FIT_TOLERANCE_M } from "../../src/void-engine.js";
import { toMetres } from "../../src/millimetres.js";
import { renderRejection } from "../../src/commands/rejection.js";
import { offersFor } from "../../src/queries/offers.js";
import type { Column, InsertOpening } from "../../src/index.js";
import { clearBodies, insertInto } from "../support/commands.js";
import { voidAt, type KitchenWorld } from "../support/kitchen-world.js";
import { columnWorld } from "../support/synthetic-world.js";

const SINK_MIN_WIDTH_MM = 560;
const OPENING_ALONG_MM = 1000;
const OPENING_COLUMN = "A|1.00";

/** A base body of the given width, with a wall row and a top row above it so the base level is a
 *  level of its own. Nothing is cleared: the base body is the **swap target**. */
function occupiedBaseWorld(widthMm: number): KitchenWorld {
  return columnWorld(OPENING_ALONG_MM, [
    { id: "s0", y0Mm: 0, heightMm: 820, widthMm },
    { id: "s1", y0Mm: 1500, heightMm: 700, buildId: "wall-2door-600", widthMm },
    {
      id: "s2",
      y0Mm: 2200,
      heightMm: 400,
      buildId: "wall-2door-600-top",
      widthMm,
    },
  ]);
}

const SWAP_TARGET = { kind: "placement", id: "s0" } as const;

// §5.3 runs the identical path with the current body's frame as the opening, and takes the width
// from the body itself. A 500 mm base cabinet therefore asks the sink base for a 500 mm build — the
// same impossible request as the empty-void case, arriving by the other route.
describe("§5.3's swap in place hits the same floor", () => {
  it("refuses a sink base swapped into a 500 mm body", () => {
    const world = occupiedBaseWorld(500);

    const result = insertInto(world, SWAP_TARGET, "base-sink");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("WIDTH_TOO_SMALL");
    expect(result.reason.params).toMatchObject({
      requiredMm: SINK_MIN_WIDTH_MM,
      availableMm: 500,
    });
  });

  it("does not offer the sink base as a swap for a 500 mm body", () => {
    const world = occupiedBaseWorld(500);

    const offered = offersFor({ ...world, target: SWAP_TARGET });

    expect(offered.length).toBeGreaterThan(0);
    expect(offered.map((offer) => offer.buildId)).not.toContain("base-sink");
  });

  it("offers and performs the swap at 600 mm", () => {
    const world = occupiedBaseWorld(600);
    const offered = offersFor({ ...world, target: SWAP_TARGET });

    expect(offered.map((offer) => offer.buildId)).toContain("base-sink");
    const result = insertInto(world, SWAP_TARGET, "base-sink");
    expect(result.ok).toBe(true);
  });

  // "Every catalogue row offered for an occupied body actually performs a swap" — the milestone's
  // own criterion, enumerated rather than sampled, across the whole width range the floor spans.
  it("performs every offered swap across 300–800 mm", () => {
    for (let widthMm = 300; widthMm <= 800; widthMm += 20) {
      const world = occupiedBaseWorld(widthMm);
      for (const offer of offersFor({ ...world, target: SWAP_TARGET })) {
        const result = insertInto(world, SWAP_TARGET, offer.buildId);
        expect(result.ok, `${String(widthMm)} mm -> ${offer.buildId}`).toBe(
          true,
        );
      }
    }
  });
});

// The floor lives in the `'fit'` branch, so the bands that reach it through a *void* need the same
// agreement the base level has. A wall opening is where a mis-scoped guard would show up as an
// offer list that still refuses.
describe("the offer list and the guard agree on every band", () => {
  const LEVELS_UNDER_TEST = [
    { name: "the base level", y0: 0, clear: ["s0"] },
    { name: "the wall level", y0: 1.5, clear: ["s1"] },
    { name: "the top level", y0: 2.2, clear: ["s2"] },
  ] as const;

  it.each(LEVELS_UNDER_TEST)("agrees at $name", (level) => {
    for (let widthMm = 300; widthMm <= 800; widthMm += 20) {
      const world = clearBodies(occupiedBaseWorld(widthMm), [...level.clear]);
      const target = {
        kind: "void",
        id: voidAt(world, OPENING_COLUMN, level.y0).id,
      } as const;
      for (const offer of offersFor({ ...world, target })) {
        const result = insertInto(world, target, offer.buildId);
        expect(result.ok, `${String(widthMm)} mm -> ${offer.buildId}`).toBe(
          true,
        );
      }
    }
  });
});

// The converse direction, which no criterion states and which I therefore report rather than fail:
// `insertBody` is strictly **more permissive** than `offersFor` on a swap. §9 scopes a swap list to
// the outgoing body's own normalised band (`isInOfferedBand`, `queries/offers.ts`), while §5.2's
// gate lets a `column` body into any slot (`isBandAccepted`, `bands.ts`). So a full-height unit is
// an accepted swap for a base cabinet standing alone in a 2.6 m column, and is never offered there.
// That is one-directional by design — the cross-cutting rule is "never offer what cannot be
// satisfied", not the reverse — but it means a caller that ever built its own list would diverge
// from the engine, so it is pinned here.
describe("insertBody accepts a swap the offer list does not show", () => {
  /** A column whose frozen `top` is 2.6 m but whose only remaining member is the base body: the
   *  vacated span is the whole column, so a 2.2 m unit fits where it stands. */
  function tallColumnWithOnlyABase(): KitchenWorld {
    return clearBodies(
      columnWorld(OPENING_ALONG_MM, [
        { id: "s0", y0Mm: 0, heightMm: 820, widthMm: 600 },
        {
          id: "s2",
          y0Mm: 2200,
          heightMm: 400,
          buildId: "wall-2door-600-top",
          widthMm: 600,
        },
      ]),
      ["s2"],
    );
  }

  it("swaps a base cabinet for a full-height unit that was never in its list", () => {
    const world = tallColumnWithOnlyABase();

    const offered = offersFor({ ...world, target: SWAP_TARGET });
    const result = insertInto(world, SWAP_TARGET, "tall-pantry");

    expect(offered.map((offer) => offer.buildId)).not.toContain("tall-pantry");
    expect(result.ok).toBe(true);
  });
});

describe("the boundary the epsilon sits on", () => {
  function refusalAt(widthMm: number): string | undefined {
    const world = clearBodies(occupiedBaseWorld(widthMm), ["s0"]);
    const target = {
      kind: "void",
      id: voidAt(world, OPENING_COLUMN, 0).id,
    } as const;
    const result = insertInto(world, target, "base-sink");
    return result.ok ? undefined : result.reason.code;
  }

  it("refuses every millimetre below the aperture and accepts every one above", () => {
    for (const widthMm of [300, 400, 550, 558, 559]) {
      expect(refusalAt(widthMm), `${String(widthMm)} mm`).toBe(
        "WIDTH_TOO_SMALL",
      );
    }
    for (const widthMm of [560, 561, 600, 800]) {
      expect(refusalAt(widthMm), `${String(widthMm)} mm`).toBeUndefined();
    }
  });

  it("still reports the general floor below 300 mm rather than the entry's own", () => {
    // 299 mm is under §2's `MIN_WIDTH_M`, which no cabinet may go under. The sentence a customer
    // reads there is about cabinets in general, not about this product — different fact, different
    // code, and the sink base is the one entry where both could plausibly fire.
    expect(refusalAt(299)).toBe("WIDTH_NOT_SUPPORTED");
  });
});

// R2.1, flipped. This block recorded the gap — the floor was read only on the `'fit'` path, so a
// millimetre-set entry silently ignored its own `minWidthMm` — and the gap is now closed:
// `resolveWidth` filters the set through `buildableSizes` before the fit. What follows asserts the
// rule rather than the old behaviour, keeping the case that made the gap legible (a 450 mm size
// under a 500 mm floor) as the case that now proves the fix.
//
// No shipped entry is affected either way: `base-sink` is the only entry declaring a floor and it
// is `'fit'`. The last block below is the independent check of exactly that claim.
describe("a millimetre-set entry honours its own minimum width too", () => {
  const OPENING_COLUMN_KEY = OPENING_COLUMN;

  /** Runs §5.2's pre-probe guards for a synthetic dishwasher niche with the given size set and
   *  floor, against a base opening of the given width. */
  function fitOf(
    widthFlex: readonly number[],
    minWidthMm: number | undefined,
    openingWidthMm: number,
  ) {
    const entry = INSERTABLE_BODY_DEFINITIONS.find(
      ([buildId]) => buildId === "base-dishwasher",
    );
    if (!entry) throw new Error("no dishwasher entry");
    const body = toInsertableBody(entry[0], {
      ...entry[1],
      widthFlex,
      ...(minWidthMm === undefined ? {} : { minWidthMm }),
    });
    if (!body) throw new Error("dishwasher entry is not insertable");
    const widthM = toMetres(openingWidthMm);
    const opening: InsertOpening = {
      col: OPENING_COLUMN_KEY,
      wall: "A",
      alongM: 1,
      w: widthM,
      d: 0.58,
      y0: 0,
      h: 0.86,
      spanY0: 0,
      spanH: 0.86,
    };
    const column: Column = {
      key: OPENING_COLUMN_KEY,
      wall: "A",
      ry: 0,
      x: 1,
      z: 0.29,
      w: widthM,
      d: 0.58,
      top: 0.86,
      regions: [[0, 0.86]],
      hasFullHeightUnder: true,
    };
    return evaluateInsertFit({ body, opening, column });
  }

  // The original demonstrating case. A 460 mm opening used to select the 450 mm size and hand the
  // probe a width the builder cannot make; now the size is filtered out before the fit, and what
  // is left (600) does not fit the opening.
  it("refuses a 450 mm size under a 500 mm floor instead of selecting it", () => {
    const fit = fitOf([450, 600], 500, 460);

    expect(fit.ok).toBe(false);
    if (fit.ok) return;
    expect(fit.detail.code).toBe("WIDTH_TOO_LARGE");
    expect(fit.detail.params).toMatchObject({ requiredMm: 600 });
  });

  it("still selects the widest size that fits, once the sub-floor ones are gone", () => {
    const fit = fitOf([400, 450, 600], 450, 500);

    expect(fit.ok).toBe(true);
    if (!fit.ok) return;
    // 450, not 400: the widest *buildable* size that fits, not the widest listed one.
    expect(fit.plan.widthM).toBeCloseTo(0.45, 9);
  });

  // The case the fix introduced and nothing else covers: contradictory catalogue data, where every
  // listed width is under the entry's own floor. There is then no width at which the body can be
  // made, whatever the opening measures — a refusal, never a throw, because the command's contract
  // is a value.
  it("refuses when the whole set is under the floor", () => {
    for (const openingWidthMm of [300, 460, 800]) {
      const fit = fitOf([450], 500, openingWidthMm);

      expect(fit.ok, `${String(openingWidthMm)} mm`).toBe(false);
      if (fit.ok) return;
      expect(fit.detail.code, `${String(openingWidthMm)} mm`).toBe(
        "WIDTH_TOO_SMALL",
      );
      expect(fit.detail.params).toMatchObject({
        requiredMm: 500,
        availableMm: openingWidthMm,
      });
    }
  });

  // §9's sentence is rendered verbatim by the panel, so a partially filtered set must not name a
  // width the body cannot be built at — "se face doar în 400, 450, 600 mm" would be a lie about
  // 400, and the customer would go looking for an opening that could never take one.
  it("names only the buildable widths in the refusal it renders", () => {
    const fit = fitOf([400, 450, 600], 450, 300);

    expect(fit.ok).toBe(false);
    if (fit.ok) return;
    expect(fit.detail.code).toBe("WIDTH_NOT_SUPPORTED");
    expect(fit.detail.params).toMatchObject({ sizesMm: [450, 600] });
    expect(renderRejection(fit.detail)).not.toContain("400");
  });

  it("leaves an entry that declares no floor with its whole set", () => {
    const fit = fitOf([400, 450, 600], undefined, 460);

    expect(fit.ok).toBe(true);
    if (!fit.ok) return;
    expect(fit.plan.widthM).toBeCloseTo(0.45, 9);
  });
});

// My independent read on dev-sink's claim that no shipped entry changed behaviour. Not taken on
// trust and not argued from "no entry declares a floor": every fixed-set entry is swept against the
// **pre-fix** formula — the widest listed size within `FIT_TOLERANCE_M` of the opening — and must
// still resolve to exactly that. If a floor is ever added to one of these entries, this is what
// says so.
describe("the shipped fixed-set entries resolve exactly as they did before the floor existed", () => {
  const FIXED_SET_ENTRIES = INSERTABLE_BODY_DEFINITIONS.filter(
    ([, definition]) => definition.widthFlex !== "fit",
  );

  it.each(FIXED_SET_ENTRIES)(
    "%s is unchanged across 300–1000 mm",
    (buildId, definition) => {
      const sizesMm = definition.widthFlex;
      if (sizesMm === undefined || sizesMm === "fit") {
        throw new Error(`${buildId} is not a fixed-set entry`);
      }
      const body = toInsertableBody(buildId, definition);
      if (!body) throw new Error(`${buildId} is not insertable`);
      // Not "this entry declares no floor" any more — ADR 0026's `base-bottle-cargo` declares 200
      // and lists 200/300. The precondition this sweep actually needs is that the floor removes
      // nothing from the set, which is what makes the pre-fix formula still the right reference.
      // A floor that *would* drop a listed width still fails here, which is the case this line was
      // written to catch.
      expect(buildableSizes(definition.minWidthMm, sizesMm), buildId).toEqual(
        sizesMm,
      );

      for (
        let openingWidthMm = 300;
        openingWidthMm <= 1000;
        openingWidthMm += 10
      ) {
        const widthM = toMetres(openingWidthMm);
        const expectedFitting = sizesMm.filter(
          (size) => toMetres(size) <= widthM + FIT_TOLERANCE_M,
        );
        const fit = evaluateInsertFit({
          body,
          opening: {
            col: OPENING_COLUMN,
            wall: "A",
            alongM: 1,
            w: widthM,
            d: 0.58,
            y0: 0,
            h: 2.6,
            spanY0: 0,
            spanH: 2.6,
          },
          column: {
            key: OPENING_COLUMN,
            wall: "A",
            ry: 0,
            x: 1,
            z: 0.29,
            w: widthM,
            d: 0.58,
            top: 2.6,
            regions: [[0, 2.6]],
            hasFullHeightUnder: true,
          },
        });
        const label = `${buildId} @ ${String(openingWidthMm)} mm`;
        if (expectedFitting.length === 0) {
          expect(fit.ok, label).toBe(false);
          continue;
        }
        expect(fit.ok, label).toBe(true);
        if (!fit.ok) continue;
        expect(fit.plan.widthM, label).toBeCloseTo(
          toMetres(Math.max(...expectedFitting)),
          9,
        );
      }
    },
  );
});
