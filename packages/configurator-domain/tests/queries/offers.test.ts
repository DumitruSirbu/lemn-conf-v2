import { describe, expect, it } from "vitest";

import {
  listInsertableBodies,
  resolveWidthRangesMm,
} from "../../src/catalog.js";

import { CHOOSES_ITS_OWN_COLOUR } from "../../src/body-finish-rule.js";
import { baseFinishedDepthMm } from "../../src/catalog.js";
import { WORKTOP_DEPTH_MM } from "../../src/worktop-depth.js";
import type { Design } from "../../src/design.js";
import { finishesAtMm } from "../../src/occupied-depth.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { buildableWidthSpanMm, offersFor } from "../../src/queries/offers.js";
import { offeredIds, offerFor } from "../support/offers.js";
import type { BodyDefinition } from "../../src/void-engine.js";
import { clearBodies, insertInto } from "../support/commands.js";
import { advancePast, createWorld, voidAt } from "../support/kitchen-world.js";

const seeded = () => createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);

describe("offersFor — a void", () => {
  it("offers the slot's own band plus the full-height bodies a column allows", () => {
    const world = clearBodies(seeded(), ["p7", "p24"]);
    const slot = voidAt(world, "B|2.45", 0);
    const offered = offersFor({
      ...world,
      target: { kind: "void", id: slot.id },
    });
    const bands = new Set(offered.map((offer) => offer.band));
    expect(bands).toEqual(new Set(["base", "column"]));
    expect(offered.some((offer) => offer.isCurrent)).toBe(false);
  });

  // A discrete row publishes one degenerate range per size, and a cabinetry row one bounded range —
  // so a renderer reads the same field for every row and never has to know which shape it has.
  it("publishes a range per size for an appliance, and one bound for a cabinetry row", () => {
    const world = clearBodies(seeded(), ["p1"]);
    const slot = voidAt(world, "A|2.00", 0);
    const offered = offersFor({
      ...world,
      target: { kind: "void", id: slot.id },
    });

    expect(offerFor(offered, "base-dishwasher").widthRangesMm).toEqual([
      { minMm: 450, maxMm: 450 },
      { minMm: 600, maxMm: 600 },
    ]);
    // ADR 0035 decision 2: §2's default floor to §7's ceiling. It was `[300, ∞)` while the row
    // carried the standard ladder, which was the ladder having no opinion above 800 rather than a
    // rule anybody decided.
    expect(
      offered.find((offer) => offer.buildId === "base-panbank")?.widthRangesMm,
    ).toEqual([{ minMm: 300, maxMm: 800 }]);
  });

  it("reports the width and height each offer would actually build to", () => {
    // §13.1 makes the corner return at B|0.61 non-deletable, so its span is opened at load.
    const world = advancePast(seeded(), ["p9"]);
    const slot = voidAt(world, "B|0.61", 1.5);
    const offered = offersFor({
      ...world,
      target: { kind: "void", id: slot.id },
    });
    // 570 is inside `open-shelf`'s 300–800 bound, so the shelf is built at the opening's own width.
    // ADR 0035 decision 2 did not change this row's answer, only the reason for it: the bound is now
    // stated rather than inferred from a ladder that declined to bound anything above 400.
    const shelf = offerFor(offered, "open-shelf");
    expect([shelf.buildsToWidthMm, shelf.buildsToHeightMm]).toEqual([570, 700]);
  });

  // **570 is now a hinged cabinet**, and that is ADR 0035 decision 4 arriving where it is visible.
  // ADR 0033's amendment recorded "570 is correctly refused and must stay so", on the reasoning that
  // ADR 0029 kept two doors off anything under 600; ADR 0035 rejected "forbid 500 and 550" by name,
  // and the shipped 570 mm corner return is the width the owner's relative stepper was written for.
  it("builds a hinged cabinet at the 570 mm opening it used to refuse", () => {
    const world = advancePast(seeded(), ["p9"]);
    const slot = voidAt(world, "B|0.61", 1.5);
    const offered = offersFor({
      ...world,
      target: { kind: "void", id: slot.id },
    });

    const row = offerFor(offered, "wall-cabinet");
    // One range, not two: the owner retired ADR 0030's one-door cap on 2026-08-28, so the (400, 500)
    // hole this row used to publish is gone and a hinged cabinet is continuous across its bound.
    expect(row.widthRangesMm).toEqual([{ minMm: 200, maxMm: 800 }]);
    expect([row.buildsToWidthMm, row.buildsToHeightMm]).toEqual([570, 700]);
  });

  // **The reversal of ADR 0032, on the row that provoked it.** That decision kept a row that cannot
  // be built here in the list, refused, carrying what it *can* be built at; the owner ruled on
  // 2026-09-10 that a greyed hood in a floor opening reads as *"WTF is this"* and must not be shown.
  //
  // Asserted on the hood, which is the row ADR 0035 decision 5 floors at 600 — 570 is under it. What
  // it used to publish as a `WIDTH_NOT_SUPPORTED` verdict it now publishes as nothing at all, and
  // the pairing with the 700 mm opening is what keeps the absence from being vacuous: the same
  // catalogue row is offered the moment its floor is met.
  it("drops a bounded entry the opening is too narrow for, rather than greying it", () => {
    const world = advancePast(seeded(), ["p9"]);
    const slot = voidAt(world, "B|0.61", 1.5);
    const offered = offersFor({
      ...world,
      target: { kind: "void", id: slot.id },
    });

    expect(offered.length).toBeGreaterThan(0);
    expect(offeredIds(offered)).not.toContain("hood");
  });

  // §9: never offer what cannot be satisfied — every remaining refusal is a bug in a list.
  it("offers nothing that the insert command would then refuse", () => {
    const world = clearBodies(seeded(), ["p7", "p24"]);
    for (const y0 of [0, 1.5, 2.2]) {
      const slot = voidAt(world, "B|2.45", y0);
      const target = { kind: "void", id: slot.id } as const;
      const offered = offersFor({ ...world, target });
      expect(offered.length, `slot ${String(y0)}`).toBeGreaterThan(0);
      for (const offer of offered) {
        const result = insertInto(world, target, offer.buildId);
        expect(result.ok, `${String(y0)} -> ${offer.buildId}`).toBe(true);
      }
    }
  });

  // **The converse, restated for the list the owner ruled on 2026-09-10.** ADR 0032 made this
  // assertable by publishing refusals; with them gone the claim is that an entry the list left out
  // is one the command will not take. Same "one evaluation, two ends" property, and the direction
  // that matters more: a list that quietly dropped something insertable hides a cabinet the
  // customer could have had.
  it("refuses everything it leaves out, at every height in the column", () => {
    const world = clearBodies(seeded(), ["p7", "p24"]);
    let seen = 0;
    for (const y0 of [0, 1.5, 2.2]) {
      const slot = voidAt(world, "B|2.45", y0);
      const target = { kind: "void", id: slot.id } as const;
      const offered = new Set(offeredIds(offersFor({ ...world, target })));
      for (const body of listInsertableBodies(world.catalog)) {
        if (offered.has(body.buildId)) continue;
        seen += 1;
        const result = insertInto(world, target, body.buildId);
        expect(result.ok, `${String(y0)} -> ${body.buildId}`).toBe(false);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  // §5.2, restated as a claim the filter change could plausibly have broken: the band filter admits
  // every full-height row into a base slot, and the fit filter that now follows it must not be what
  // takes them away. Asserted on the population rather than on a count, so a column row that stopped
  // being reachable names itself.
  it("still reaches the column rows from a base slot after the fit filter", () => {
    const world = clearBodies(seeded(), ["p7", "p24"]);
    const slot = voidAt(world, "B|2.45", 0);
    const offered = offersFor({
      ...world,
      target: { kind: "void", id: slot.id },
    });

    expect(
      offered.filter((offer) => offer.band === "column").map((o) => o.buildId)
        .length,
    ).toBeGreaterThan(0);
  });

  it("returns nothing for a stale void id", () => {
    const world = seeded();
    expect(
      offersFor({ ...world, target: { kind: "void", id: "A|9.99:v0:0.00" } }),
    ).toEqual([]);
  });
});

describe("buildableWidthSpanMm — what §9 says when nothing fits", () => {
  // The bound §9's two informative empty sentences name. It came off the offer list until the owner
  // ruled a refused row off the panel on 2026-09-10, and the list an unfillable opening publishes is
  // now empty — so this reads the catalogue directly, and these are the numbers a customer is told.
  it("spans the narrowest floor and the widest ceiling in the catalogue", () => {
    const span = buildableWidthSpanMm(KITCHEN_L_BODY_CATALOG);
    const ranges = listInsertableBodies(KITCHEN_L_BODY_CATALOG).flatMap(
      (body) => resolveWidthRangesMm(body),
    );

    expect(ranges.length).toBeGreaterThan(0);
    expect(span).toEqual({
      minMm: Math.min(...ranges.map((range) => range.minMm)),
      maxMm: Math.max(...ranges.map((range) => range.maxMm)),
    });
  });

  it("answers undefined for a catalogue with nothing insertable in it", () => {
    // Absence rather than an invented bound: `describeEmptyLine` then leaves §9's original sentence
    // in place instead of naming a width nobody can build.
    expect(buildableWidthSpanMm(new Map())).toBeUndefined();
  });
});

describe("offersFor — an occupied body", () => {
  it("is band-scoped: a wall body never appears in a base list", () => {
    const world = seeded();
    const offered = offersFor({
      ...world,
      target: { kind: "placement", id: "p0" },
    });
    expect(offered.length).toBeGreaterThan(0);
    expect(offered.every((offer) => offer.band === "base")).toBe(true);
  });

  // ADR 0011 Gap C: a top-row body must be offered rows in its own frame.
  it("offers wall rows for a seeded top-row body", () => {
    const world = seeded();
    const offered = offersFor({
      ...world,
      target: { kind: "placement", id: "p15" },
    });
    expect(offered.length).toBeGreaterThan(0);
    expect(offered.every((offer) => offer.band === "wall")).toBe(true);
  });

  it("badges the current row rather than hiding it", () => {
    const world = clearBodies(seeded(), ["p1"]);
    const slot = voidAt(world, "A|2.00", 0);
    const inserted = insertInto(
      world,
      { kind: "void", id: slot.id },
      "base-cabinet",
    );
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    const after = createWorld(inserted.design, world.catalog);
    const offered = offersFor({
      ...after,
      columns: world.columns,
      target: { kind: "placement", id: inserted.effect.placementId },
    });
    expect(
      offered.filter((offer) => offer.isCurrent).map((o) => o.buildId),
    ).toEqual(["base-cabinet"]);
  });

  // FINDING R2.2. `isCurrent` compared the placement's own `buildId` against the offer's, and ADR
  // 0011 Gap A gives every seeded placement a NON-insertable id — so the badge was false for all 21
  // seeded bodies and appeared only after a body had already been swapped once, where it matters
  // least. The seeded entry now declares its catalogue equivalent.
  it("badges the seeded body's declared catalogue equivalent", () => {
    const world = seeded();
    const offered = offersFor({
      ...world,
      target: { kind: "placement", id: "p0" },
    });
    expect(
      offered.filter((offer) => offer.isCurrent).map((offer) => offer.buildId),
    ).toEqual(["base-sink"]);
  });

  // Absent means "no equivalent", carried absent rather than defaulted: the corner returns and the
  // hob have nothing in §7 that builds them, and no badge is the correct answer for them.
  it("badges nothing for a seeded body that declares no equivalent", () => {
    const entry = KITCHEN_L_BODY_CATALOG.get("base-sink-800");
    if (!entry) throw new Error("no seeded entry base-sink-800");
    const withoutEquivalent = { ...entry };
    delete (withoutEquivalent as { catalogEquivalentId?: string })
      .catalogEquivalentId;
    const catalog = new Map<string, BodyDefinition>(KITCHEN_L_BODY_CATALOG).set(
      "base-sink-800",
      withoutEquivalent,
    );
    const world = createWorld(KITCHEN_L_DESIGN, catalog);
    const offered = offersFor({
      ...world,
      target: { kind: "placement", id: "p0" },
    });
    expect(offered.length).toBeGreaterThan(0);
    expect(offered.some((offer) => offer.isCurrent)).toBe(false);
  });

  // The pointer is a seeded-entry affordance only. An insertable entry is already its own id, and
  // must never be redirected by a stray pointer on it.
  it("badges an insertable placement by its own id, not by any pointer", () => {
    const entry = KITCHEN_L_BODY_CATALOG.get("base-cabinet");
    if (!entry) throw new Error("no catalogue entry base-cabinet");
    const catalog = new Map<string, BodyDefinition>(KITCHEN_L_BODY_CATALOG).set(
      "base-cabinet",
      { ...entry, catalogEquivalentId: "base-cabinet" },
    );
    const world = clearBodies(createWorld(KITCHEN_L_DESIGN, catalog), ["p1"]);
    const slot = voidAt(world, "A|2.00", 0);
    const inserted = insertInto(
      world,
      { kind: "void", id: slot.id },
      "base-cabinet",
    );
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    const after = createWorld(inserted.design, catalog);
    const offered = offersFor({
      ...after,
      columns: world.columns,
      target: { kind: "placement", id: inserted.effect.placementId },
    });
    expect(
      offered.filter((offer) => offer.isCurrent).map((offer) => offer.buildId),
    ).toEqual(["base-cabinet"]);
  });

  // §11 row 24: a fallback set once produced six guaranteed-refused rows for the hob.
  it("row 24: an unknown kind gets no list at all", () => {
    const catalog = new Map<string, BodyDefinition>(KITCHEN_L_BODY_CATALOG);
    catalog.set("teleporter-600", {
      kind: "teleporter",
      band: "base",
      frameDepthMm: 580,
      occupiedDepth: finishesAtMm(baseFinishedDepthMm(WORKTOP_DEPTH_MM)),
      canFinish: true,
      // An unknown *kind* is what this row is about; its colour is ordinary, and
      // `derivePlacementRecords` refuses an entry that declares nothing about one.
      finishRule: CHOOSES_ITS_OWN_COLOUR,
      canHandle: true,
      canReplace: true,
      canDelete: true,
      fixedWidth: false,
      insertable: false,
    });
    const design: Design = {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.map((placement) =>
        placement.id === "p0"
          ? {
              ...placement,
              body: { ...placement.body, buildId: "teleporter-600" },
            }
          : placement,
      ),
    };
    const world = createWorld(design, catalog);
    expect(
      offersFor({ ...world, target: { kind: "placement", id: "p0" } }),
    ).toEqual([]);
  });

  // §13.1: a corner is not a body the customer chooses, so it publishes no swap list of its own.
  // Run on a real seeded placement rather than a synthetic one, so an id that stops resolving
  // cannot make this pass by describing nothing.
  it("gives a non-replaceable body no list, since it has no swap set of its own", () => {
    const world = seeded();
    expect(world.records.map((record) => record.id)).toContain("p25");
    expect(
      offersFor({ ...world, target: { kind: "placement", id: "p25" } }),
    ).toEqual([]);
  });
});
