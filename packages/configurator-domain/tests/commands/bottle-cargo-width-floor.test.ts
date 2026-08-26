// ADR 0026: §2's `MIN_W` is the **default** width floor, and one catalogue entry declares a floor
// below it.
//
// The whole design intent is that the two floors stay distinguishable, so every case here asserts
// the **rejection code**, not merely that something was refused. Below §2's default a cabinet does
// not exist at all and the sentence is about cabinets in general (`WIDTH_NOT_SUPPORTED`, naming the
// widths the body has); below `base-bottle-cargo`'s own 200 mm it is *this product* that cannot be
// made (`WIDTH_TOO_SMALL`, naming the millimetres it needs). A customer who reads the wrong one
// goes looking for the wrong opening.
import { describe, expect, it } from "vitest";

import { INSERTABLE_BODY_DEFINITIONS } from "../../src/catalog.js";
import { offersFor } from "../../src/queries/offers.js";
import { MIN_WIDTH_M } from "../../src/void-engine.js";
import { clearBodies, insertInto } from "../support/commands.js";
import { voidAt, type KitchenWorld } from "../support/kitchen-world.js";
import { columnWorld } from "../support/synthetic-world.js";

const CARGO_BUILD_ID = "base-bottle-cargo";
const CARGO_MIN_WIDTH_MM = 200;
const CARGO_WIDTHS_MM = [200, 300];
/** An entry that declares no floor of its own, so §2's default governs it. */
const PLAIN_BASE_BUILD_ID = "base-2door";
const GENERAL_MIN_WIDTH_MM = 300;

const OPENING_ALONG_MM = 1000;
const OPENING_COLUMN = "A|1.00";

/** A base/wall/top stack of the given width, so clearing the base member leaves an opening exactly
 *  that wide whose free span stops at its own level. */
function baseOpeningWorld(widthMm: number): KitchenWorld {
  return clearBodies(
    columnWorld(OPENING_ALONG_MM, [
      { id: "s0", y0Mm: 0, heightMm: 820, widthMm },
      {
        id: "s1",
        y0Mm: 1500,
        heightMm: 700,
        buildId: "wall-2door-600",
        widthMm,
      },
      {
        id: "s2",
        y0Mm: 2200,
        heightMm: 400,
        buildId: "wall-2door-600-top",
        widthMm,
      },
    ]),
    ["s0"],
  );
}

function baseVoidTarget(world: KitchenWorld) {
  return { kind: "void", id: voidAt(world, OPENING_COLUMN, 0).id } as const;
}

function insertIntoBaseOpening(widthMm: number, buildId: string) {
  const world = baseOpeningWorld(widthMm);
  return insertInto(world, baseVoidTarget(world), buildId);
}

/** The refusal code for this body in an opening of this width, or `undefined` when it goes in. */
function refusalAt(widthMm: number, buildId: string): string | undefined {
  const result = insertIntoBaseOpening(widthMm, buildId);
  return result.ok ? undefined : result.reason.code;
}

function builtWidthMmAt(widthMm: number, buildId: string): number | undefined {
  const result = insertIntoBaseOpening(widthMm, buildId);
  if (!result.ok) return undefined;
  return result.design.placements.at(-1)?.body.widthMm;
}

/** The six openings this wave turns on, either side of both floors. */
const BOUNDARY_WIDTHS_MM = [199, 200, 201, 299, 300, 301] as const;

describe("§2's default floor still governs an entry that declares none", () => {
  it.each(BOUNDARY_WIDTHS_MM)(
    "refuses a plain base cabinet at %i mm with the general code, or accepts it",
    (widthMm) => {
      const expected =
        widthMm < GENERAL_MIN_WIDTH_MM ? "WIDTH_NOT_SUPPORTED" : undefined;

      expect(refusalAt(widthMm, PLAIN_BASE_BUILD_ID)).toBe(expected);
    },
  );

  // The constant itself, so a future edit to it cannot pass this file by leaving the numbers above
  // in place. Backlog entry 2: it stays at 300, and the cargo is an exception rather than a new
  // general floor.
  it("leaves §2's MIN_W at 300 mm", () => {
    expect(MIN_WIDTH_M * 1000).toBe(GENERAL_MIN_WIDTH_MM);
  });
});

describe("the bottle cargo's own floor stands in place of §2's", () => {
  it("refuses one millimetre under its own floor, naming its own floor", () => {
    const result = insertIntoBaseOpening(
      CARGO_MIN_WIDTH_MM - 1,
      CARGO_BUILD_ID,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatchObject({
      code: "WIDTH_TOO_SMALL",
      params: { requiredMm: CARGO_MIN_WIDTH_MM, availableMm: 199 },
    });
    // §11 row 5: the millimetres reach the customer, not just the params.
    expect(result.reason.message).toContain(String(CARGO_MIN_WIDTH_MM));
    expect(result.reason.message).toContain("199");
  });

  it.each(BOUNDARY_WIDTHS_MM)(
    "goes into a %i mm opening unless it is under 200",
    (widthMm) => {
      const expected =
        widthMm < CARGO_MIN_WIDTH_MM ? "WIDTH_TOO_SMALL" : undefined;

      expect(refusalAt(widthMm, CARGO_BUILD_ID)).toBe(expected);
    },
  );

  // The two codes at the same opening, which is the point of keeping them distinct: at 250 mm one
  // body is refused because no cabinet is that narrow and the other is not, and at 199 mm both are
  // refused for *different* reasons.
  it("reads the two floors apart in the same opening", () => {
    expect(refusalAt(250, PLAIN_BASE_BUILD_ID)).toBe("WIDTH_NOT_SUPPORTED");
    expect(refusalAt(250, CARGO_BUILD_ID)).toBeUndefined();

    expect(refusalAt(199, PLAIN_BASE_BUILD_ID)).toBe("WIDTH_NOT_SUPPORTED");
    expect(refusalAt(199, CARGO_BUILD_ID)).toBe("WIDTH_TOO_SMALL");
  });

  // `FIT_TOLERANCE_M` is 12 mm, so a tolerance allowed to reach the floor would admit the cargo at
  // 189 mm. It is slack on the *fit*, never on a floor — ADR 0015's sibling finding R1.1, and the
  // reason the substituted floor is checked before any width is chosen.
  it("does not let the fit tolerance reach under its floor", () => {
    for (const widthMm of [188, 190, 195, 199]) {
      expect(refusalAt(widthMm, CARGO_BUILD_ID), `${String(widthMm)} mm`).toBe(
        "WIDTH_TOO_SMALL",
      );
    }
  });
});

describe("the bottle cargo builds at its own widths, never to the opening", () => {
  it("takes 200 mm from every opening between its two sizes", () => {
    for (const widthMm of [200, 201, 250, 287]) {
      expect(
        builtWidthMmAt(widthMm, CARGO_BUILD_ID),
        `${String(widthMm)} mm`,
      ).toBe(200);
    }
  });

  // The direction `FIT_TOLERANCE_M` is allowed to work in: a body slightly *wider* than its
  // opening still goes in, so from 288 mm up the 300 mm size is the widest that fits. That is the
  // same slack every fixed-set entry gets and it is the opposite of lowering a floor.
  it("takes 300 mm once the tolerance reaches it, at 288 mm", () => {
    expect(builtWidthMmAt(287, CARGO_BUILD_ID)).toBe(200);
    expect(builtWidthMmAt(288, CARGO_BUILD_ID)).toBe(300);
  });

  // The reason it is a millimetre set and not a `'fit'` body: a cargo stretched to fill an 800 mm
  // opening would be an 800 mm cabinet with one front, which is not the product. 300 is the widest
  // width it has, and a wide opening does not change that.
  it("stops at 300 mm however wide the opening is", () => {
    for (const widthMm of [300, 400, 600, 800]) {
      expect(
        builtWidthMmAt(widthMm, CARGO_BUILD_ID),
        `${String(widthMm)} mm`,
      ).toBe(300);
    }
  });

  it("lists 200 and 300 as its width chips, and nothing standard", () => {
    const entry = INSERTABLE_BODY_DEFINITIONS.find(
      ([buildId]) => buildId === CARGO_BUILD_ID,
    )?.[1];

    expect(entry?.sizesMm).toEqual(CARGO_WIDTHS_MM);
    expect(entry?.minWidthMm).toBe(CARGO_MIN_WIDTH_MM);
    expect(entry?.band).toBe("base");
  });
});

describe("§9's offer list reads the substituted floor too", () => {
  it("offers the cargo, and only the cargo, in a sub-300 base opening", () => {
    for (const widthMm of [200, 250, 299]) {
      const world = baseOpeningWorld(widthMm);
      const offered = offersFor({ ...world, target: baseVoidTarget(world) });

      expect(
        offered.map((offer) => offer.buildId),
        `${String(widthMm)} mm`,
      ).toEqual([CARGO_BUILD_ID]);
    }
  });

  it("offers nothing at all below the cargo's floor", () => {
    const world = baseOpeningWorld(199);

    expect(offersFor({ ...world, target: baseVoidTarget(world) })).toEqual([]);
  });

  it("still offers the cargo alongside everything else in a wide opening", () => {
    const world = baseOpeningWorld(600);
    const offered = offersFor({ ...world, target: baseVoidTarget(world) });

    expect(offered.map((offer) => offer.buildId)).toContain(CARGO_BUILD_ID);
    expect(offered.map((offer) => offer.buildId)).toContain(
      PLAIN_BASE_BUILD_ID,
    );
  });

  // The invariant ADR 0017 bought, extended over the range ADR 0026 opened: across every width
  // either floor can turn on, an offer is never a refusal waiting to happen — in both directions.
  it("offers nothing across 190–320 mm that the insert command would refuse", () => {
    let offersSeen = 0;

    for (let widthMm = 190; widthMm <= 320; widthMm += 1) {
      const world = baseOpeningWorld(widthMm);
      const target = baseVoidTarget(world);
      for (const offer of offersFor({ ...world, target })) {
        offersSeen += 1;
        const result = insertInto(world, target, offer.buildId);
        expect(result.ok, `${String(widthMm)} mm -> ${offer.buildId}`).toBe(
          true,
        );
      }
    }

    // Strengthened: without this the sweep passes if `offersFor` returns nothing at any width, and
    // an offer list that went empty is exactly the regression the range above was chosen to catch.
    // 121 openings, offers from 200 mm upward — the counter's siblings in
    // `qa-waves-ac.adversarial.test.ts` carry the same guard.
    expect(offersSeen).toBeGreaterThanOrEqual(100);
  });
});
