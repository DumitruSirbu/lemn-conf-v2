// `DEVELOPMENT-SPEC.md` §11's engine rows for insert and swap: 3, 4, 5, 6, 7, 8, 14, 20, 23.
// Every refusal asserts the **code** and the presence of a non-empty sentence, never the prose.
import { describe, expect, it } from "vitest";

import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { offersFor } from "../../src/queries/offers.js";
import { offered as offeredRows } from "../support/offers.js";
import { createFakeProbe } from "../support/fake-probe.js";
import { clearBodies, insertInto, OCCURRED_AT } from "../support/commands.js";
import {
  advance,
  advancePast,
  createWorld,
  voidAt,
} from "../support/kitchen-world.js";
import {
  collapsedSpanWorld,
  narrowColumnWorld,
} from "../support/narrow-column.js";

const seeded = () => createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);

function voidTarget(world: ReturnType<typeof seeded>, col: string, y0: number) {
  return { kind: "void", id: voidAt(world, col, y0).id } as const;
}

describe("insert — the band gate (§11 rows 3, 4)", () => {
  it("row 3: refuses a wall body from a floor slot, and says why", () => {
    const world = clearBodies(seeded(), ["p1"]);
    const result = insertInto(
      world,
      voidTarget(world, "A|2.00", 0),
      "wall-cabinet",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("BAND_MISMATCH");
    expect(result.reason.message).toContain("soclu");
  });

  it("row 4: refuses a base cabinet from the top slot", () => {
    const world = clearBodies(seeded(), ["p18"]);
    const result = insertInto(
      world,
      voidTarget(world, "A|2.00", 2.2),
      "base-cabinet",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("BAND_MISMATCH");
  });

  // Row 4's other half: only `band: 'column'` may exceed a level — never a height threshold. An
  // 1850 mm freestanding fridge is full-height and an `h >= 1.9` test refuses it.
  it("row 4: accepts an 1850 mm column body into an 860 mm base slot", () => {
    const world = clearBodies(seeded(), ["p7", "p24"]);
    const result = insertInto(
      world,
      voidTarget(world, "B|2.45", 0),
      "fridge-free",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const placed = result.design.placements.at(-1);
    expect(placed?.body.heightMm).toBe(1850);
    expect(placed?.y0Mm).toBe(0);
  });
});

describe("insert — fit (§11 rows 5, 6, 7, 14, 20)", () => {
  // The oven tower rather than the pantry, since ADR 0048: the pantry is a bound now and states its
  // refusal as a set, which is the case below. A column built around an appliance is still one
  // width, and row 5's "with the millimetres" is what that single width reads as.
  it("row 5: refuses a column into a 300 mm opening, with the millimetres in code and sentence", () => {
    const world = clearBodies(seeded(), ["p10"]);
    const result = insertInto(
      world,
      voidTarget(world, "A|0.75", 1.5),
      "tall-oven-tower",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("WIDTH_TOO_LARGE");
    expect(result.reason.params).toMatchObject({
      requiredMm: 600,
      availableMm: 300,
    });
    expect(result.reason.message).toContain("600");
    expect(result.reason.message).toContain("300");
  });

  // ADR 0048: 300 is below the pantry's own 400 mm floor, so row 5's refusal survives the row
  // becoming resizable — with the widths it *is* made at in the sentence instead of the one it was.
  it("row 5: refuses the resizable pantry into the same 300 mm opening, naming its bound", () => {
    const world = clearBodies(seeded(), ["p10"]);
    const result = insertInto(
      world,
      voidTarget(world, "A|0.75", 1.5),
      "tall-pantry",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("WIDTH_NOT_SUPPORTED");
    expect(result.reason.params).toMatchObject({
      widthRangesMm: [{ minMm: 400, maxMm: 800 }],
      availableMm: 300,
    });
    expect(result.reason.message).toContain("400");
    expect(result.reason.message).toContain("300");
  });

  // Row 6 needs both halves: never offering it is the correct behaviour, refusing it is the safety
  // net, and asserting them separately means passing one cannot mask the other.
  it("row 6: never offers the hood for a 400 mm top slot", () => {
    const world = clearBodies(seeded(), ["p18"]);
    const target = voidTarget(world, "A|2.00", 2.2);
    const offered = offeredRows(offersFor({ ...world, target })).map(
      (offer) => offer.buildId,
    );
    expect(offered).not.toContain("hood");
    expect(offered.length).toBeGreaterThan(0);
  });

  it("row 6: refuses the hood from a 400 mm top slot", () => {
    const world = clearBodies(seeded(), ["p18"]);
    const result = insertInto(world, voidTarget(world, "A|2.00", 2.2), "hood");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("HEIGHT_EXCEEDS_LEVEL");
    expect(result.reason.message.length).toBeGreaterThan(0);
  });

  // Row 7: the sink base once measured 1220 mm because of its faucet and was refused from an
  // opening it fits perfectly. Fit is judged on the carcass.
  it("row 7: accepts a sink base whose full extent overflows the opening but whose carcass does not", () => {
    const world = clearBodies(seeded(), ["p1"]);
    const probe = createFakeProbe();
    const result = insertInto(
      world,
      voidTarget(world, "A|2.00", 0),
      "base-sink",
      probe,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [request] = probe.requests;
    expect(request).toBeDefined();
    const measured = probe.measure(
      request ?? { buildId: "", widthM: 0, heightM: 0, depthM: 0 },
    );
    expect(measured.fullHeightM).toBeGreaterThan(0.86);
    expect(measured.carcassHeightM).toBeLessThanOrEqual(0.86);
  });

  it("row 14: the dishwasher niche takes 600 in a 600 opening and 450 in a 450 one", () => {
    const wide = clearBodies(narrowColumnWorld(600), ["s0"]);
    const wideResult = insertInto(
      wide,
      voidTarget(wide, "A|0.60", 0),
      "base-dishwasher",
    );
    expect(wideResult.ok).toBe(true);
    if (wideResult.ok) {
      expect(wideResult.design.placements.at(-1)?.body.widthMm).toBe(600);
    }

    const narrow = clearBodies(narrowColumnWorld(450), ["s0"]);
    const narrowResult = insertInto(
      narrow,
      voidTarget(narrow, "A|0.45", 0),
      "base-dishwasher",
    );
    expect(narrowResult.ok).toBe(true);
    if (narrowResult.ok) {
      expect(narrowResult.design.placements.at(-1)?.body.widthMm).toBe(450);
    }
  });

  it("row 14: refuses the dishwasher niche from a 400 mm opening and names its sizes", () => {
    const world = clearBodies(narrowColumnWorld(400), ["s0"]);
    const result = insertInto(
      world,
      voidTarget(world, "A|0.40", 0),
      "base-dishwasher",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("WIDTH_NOT_SUPPORTED");
    expect(result.reason.params).toMatchObject({ sizesMm: [450, 600] });
  });

  // A **ladder** entry, since ADR 0032 gave a bounded set its bite on this path: `wall-2door`, which
  // this case used to name, is refused at 570 now and `offers.test.ts` asserts that refusal. §5.2's
  // "a `'fit'` body fills its void" is unchanged for every entry whose set is the standard modules,
  // and that is what row 20 is about.
  //
  // **This covers half of §11 row 20, and the other half is no longer reachable** (QA finding Q1.2).
  // Row 20 reads "insert into a 570 mm opening → the body builds to 570, and the door count follows
  // the width". What is asserted here is the first clause, honestly and end to end — but through
  // `open-shelf`, which has no doors at all, so it says nothing about the second.
  //
  // The second clause has no end-to-end path left. ADR 0033's merged hinged cabinet declares
  // `[200, 300, 400, 600, 800]` and ADR 0032 made that set bind the `'fit'` path, so no command in
  // the product hands the wall builder a 570 mm width. `catalog-bodies.adversarial.test.ts` still
  // asserts 570 → two doors, but by calling `buildCatalogBody` directly — a builder-fidelity claim
  // rather than a demonstration of the row, and it says so on the case.
  //
  // **Do not "fix" this by widening a set or reaching past the engine.** The gap is a question about
  // the *spec*: row 20 was written when a `'fit'` wall cabinet filled any opening, and whether it
  // should be amended alongside ADR 0032 and ADR 0033 is the M5 architect's call, not this file's.
  // Recorded here so the next reader does not mistake a half-covered row for a covered one.
  it("row 20: builds to exactly 570 in a 570 mm opening", () => {
    // §13.1 makes the corner return at B|0.61 non-deletable, so its span is opened at load.
    const world = advancePast(seeded(), ["p9"]);
    const result = insertInto(
      world,
      voidTarget(world, "B|0.61", 1.5),
      "open-shelf",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.placements.at(-1)?.body.widthMm).toBe(570);
  });
});

describe("insert — height flex and snapping", () => {
  it("fills a 750 mm over-fridge slot with a 750 mm unit, not a 700 mm one", () => {
    const cleared = clearBodies(seeded(), ["p7", "p24"]);
    const fridge = insertInto(
      cleared,
      voidTarget(cleared, "B|2.45", 0),
      "fridge-free",
    );
    expect(fridge.ok).toBe(true);
    if (!fridge.ok) return;
    const world = advance(cleared, fridge.design);
    const above = voidAt(world, "B|2.45", 1.85);
    expect(above.h).toBeCloseTo(0.75, 6);

    // `open-shelf` because the subject here is the **height** a `heightFlex` body fills, and a shelf
    // is the plainest body that has one. The over-fridge slot's 700 mm is an ordinary hinged width
    // since ADR 0033's amendment, so a hinged cabinet would work too — this is a choice of the
    // simplest body, not a width the engine refuses.
    const result = insertInto(
      world,
      { kind: "void", id: above.id },
      "open-shelf",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.placements.at(-1)?.body.heightMm).toBe(750);
  });

  it("builds its nominal height in an opening larger than a cabinet", () => {
    const world = clearBodies(collapsedSpanWorld(), ["s1"]);
    const opening = voidAt(world, "A|0.60", 1.6);
    expect(opening.h).toBeGreaterThan(0.9);
    const result = insertInto(
      world,
      { kind: "void", id: opening.id },
      "wall-cabinet",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.placements.at(-1)?.body.heightMm).toBe(700);
  });

  it("lands a wall unit on the 1500 mm module line in a cleared column", () => {
    const world = clearBodies(seeded(), ["p7", "p24"]);
    // Snapping is the subject here, so the body is the plainest one that fills its opening. The
    // column's 700 mm is inside the hinged cabinet's 600–800 two-door range (ADR 0033's amendment),
    // so this is not a width the engine refuses either — `swap-depth.test.ts` builds a hinged
    // cabinet at exactly this opening.
    const result = insertInto(
      world,
      voidTarget(world, "B|2.45", 1.5),
      "open-shelf",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.placements.at(-1)?.y0Mm).toBe(1500);
  });
});

describe("insert — the document it writes", () => {
  it("derives the id from the design, so the same command twice yields the same document", () => {
    const world = clearBodies(seeded(), ["p1"]);
    const target = voidTarget(world, "A|2.00", 0);
    const first = insertInto(world, target, "base-cabinet");
    const second = insertInto(world, target, "base-cabinet");
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.effect.placementId).toBe("n0");
    expect(JSON.stringify(first.design)).toBe(JSON.stringify(second.design));
  });

  it("writes integer millimetres and its own measured seat depth", () => {
    const world = clearBodies(seeded(), ["p1"]);
    const result = insertInto(
      world,
      voidTarget(world, "A|2.00", 0),
      "base-cabinet",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const placed = result.design.placements.at(-1);
    expect(placed).toMatchObject({
      wall: "A",
      alongMm: 2000,
      y0Mm: 0,
      body: {
        buildId: "base-cabinet",
        widthMm: 600,
        heightMm: 860,
        seatDepthMm: 580,
      },
    });
    for (const value of [
      placed?.alongMm,
      placed?.y0Mm,
      placed?.body.widthMm,
      placed?.body.heightMm,
      placed?.body.seatDepthMm,
    ]) {
      expect(Number.isInteger(value)).toBe(true);
    }
    expect(result.design.updatedAt).toBe(OCCURRED_AT);
  });

  // ADR 0011 Gap B: the seat comes from the body's own measurement, never from the void's `x`/`z`
  // pair — on wall B those two are different numbers.
  it("seats a wall-B body from its own measurement, not from the opening's coordinates", () => {
    // §13.1 makes the corner return at B|0.61 non-deletable, so its span is opened at load.
    const world = advancePast(seeded(), ["p9"]);
    const probe = createFakeProbe({ seatOffsetM: 0.2 });
    const result = insertInto(
      world,
      voidTarget(world, "B|0.61", 1.5),
      "open-shelf",
      probe,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const placed = result.design.placements.at(-1);
    expect(placed?.body.seatDepthMm).toBe(400);
    expect(placed?.alongMm).toBe(615);
  });
});

describe("insert — refusals that guard the engine", () => {
  it("refuses a seeded id: it describes one already-built body, not a catalogue entry", () => {
    const world = clearBodies(seeded(), ["p1"]);
    const result = insertInto(
      world,
      voidTarget(world, "A|2.00", 0),
      "base-sink-800",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("NOT_INSERTABLE");
  });

  it("refuses an id that is in no catalogue at all", () => {
    const world = clearBodies(seeded(), ["p1"]);
    const result = insertInto(
      world,
      voidTarget(world, "A|2.00", 0),
      "teleporter",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("NOT_IN_LIBRARY");
  });

  // ADR 0025's corner leg is one of the seeded population's non-replaceable bodies, and since
  // ADR 0027 folded the hob into its cabinet they are exactly the four corner bodies — `p25`, `p26`, `p9` and `p21`:
  // §13.1 says a corner is not a body the customer chooses, so each declares `canReplace: false`
  // and the swap is refused by name.
  it("refuses a non-replaceable body as a swap target", () => {
    const world = seeded();
    const result = insertInto(
      world,
      { kind: "placement", id: "p25" },
      "base-cabinet",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("TARGET_NOT_REPLACEABLE");
  });

  it("refuses a body the probe did not build to the size that was asked for", () => {
    const world = clearBodies(seeded(), ["p1"]);
    const result = insertInto(
      world,
      voidTarget(world, "A|2.00", 0),
      "base-cabinet",
      createFakeProbe({ carcassWidthM: 0.8 }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("BUILT_SIZE_MISMATCH");
    expect(result.reason.params).toMatchObject({
      requiredMm: 600,
      builtMm: 800,
    });
  });

  // ADR 0011 Gap D: a target outside the frozen column map is a phantom column, refused rather
  // than placed.
  it("refuses a target whose column is not in the frozen map", () => {
    const world = clearBodies(seeded(), ["p1"]);
    const target = voidTarget(world, "A|2.00", 0);
    const result = insertInto(
      { ...world, columns: new Map() },
      target,
      "base-cabinet",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("TARGET_NOT_FOUND");
  });

  it("refuses a stale void id", () => {
    const world = clearBodies(seeded(), ["p1"]);
    const result = insertInto(
      world,
      { kind: "void", id: "A|9.99:v0:0.00" },
      "base-cabinet",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("TARGET_NOT_FOUND");
  });
});

describe("insert — every refusal leaves the design untouched", () => {
  const cases = [
    ["seeded id", "base-sink-800"],
    ["unknown id", "teleporter"],
    ["wrong band", "wall-cabinet"],
  ] as const;

  it.each(cases)("returns the exact original design (%s)", (_case, buildId) => {
    const world = clearBodies(seeded(), ["p1"]);
    const snapshot = JSON.stringify(world.design);
    const result = insertInto(world, voidTarget(world, "A|2.00", 0), buildId);
    expect(result.ok).toBe(false);
    expect(result.design).toBe(world.design);
    expect(JSON.stringify(world.design)).toBe(snapshot);
    expect(result).not.toHaveProperty("effect");
  });
});
