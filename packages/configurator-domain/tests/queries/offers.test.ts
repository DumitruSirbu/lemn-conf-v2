import { describe, expect, it } from "vitest";

import type { Design } from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { offersFor } from "../../src/queries/offers.js";
import type { BodyDefinition } from "../../src/void-engine.js";
import { clearBodies, insertInto } from "../support/commands.js";
import { createWorld, voidAt } from "../support/kitchen-world.js";

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

  it("reports the width and height each offer would actually build to", () => {
    const world = clearBodies(seeded(), ["p9"]);
    const slot = voidAt(world, "B|0.61", 1.5);
    const offered = offersFor({
      ...world,
      target: { kind: "void", id: slot.id },
    });
    const wall2door = offered.find((offer) => offer.buildId === "wall-2door");
    expect(wall2door).toMatchObject({ widthMm: 570, heightMm: 700 });
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

  it("returns nothing for a stale void id", () => {
    const world = seeded();
    expect(
      offersFor({ ...world, target: { kind: "void", id: "A|9.99:v0:0.00" } }),
    ).toEqual([]);
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
      "base-2door",
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
    ).toEqual(["base-2door"]);
  });

  // §11 row 24: a fallback set once produced six guaranteed-refused rows for the hob.
  it("row 24: an unknown kind gets no list at all", () => {
    const catalog = new Map<string, BodyDefinition>(KITCHEN_L_BODY_CATALOG);
    catalog.set("teleporter-600", {
      kind: "teleporter",
      band: "base",
      frameDepthMm: 580,
      canFinish: true,
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

  it("gives an accessory no list, since it has no swap set of its own", () => {
    const world = seeded();
    expect(
      offersFor({ ...world, target: { kind: "placement", id: "p3" } }),
    ).toEqual([]);
  });
});
