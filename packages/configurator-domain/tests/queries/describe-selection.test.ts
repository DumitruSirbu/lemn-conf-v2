import { describe, expect, it } from "vitest";

import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { describeSelection } from "../../src/queries/describe-selection.js";
import { clearBodies } from "../support/commands.js";
import { createWorld, voidAt } from "../support/kitchen-world.js";

const seeded = () => createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);

describe("describeSelection — an occupied body", () => {
  it("reports the numbers §9 disables its sections from", () => {
    const world = seeded();
    const meta = describeSelection({
      ...world,
      target: { kind: "placement", id: "p0" },
    });
    expect(meta).toMatchObject({
      id: "p0",
      empty: false,
      kind: "base_cabinet",
      band: "base",
      wall: "A",
      widthMm: 800,
      heightMm: 820,
      openWmm: 800,
      openHmm: 820,
      canFinish: true,
      canDelete: true,
      accessory: false,
    });
    expect(meta?.bandLabel.length).toBeGreaterThan(0);
  });

  it("reports the hob as an accessory that cannot be replaced or deleted", () => {
    const world = seeded();
    const meta = describeSelection({
      ...world,
      target: { kind: "placement", id: "p3" },
    });
    expect(meta).toMatchObject({
      accessory: true,
      canReplace: false,
      canDelete: false,
    });
  });

  // ADR 0011 Gap C: `top` stays a row in the header even though the gate normalises it to `wall`.
  it("keeps the top row's own label", () => {
    const world = seeded();
    const meta = describeSelection({
      ...world,
      target: { kind: "placement", id: "p15" },
    });
    expect(meta?.band).toBe("top");
  });

  it("returns nothing for an id that no longer resolves", () => {
    const world = seeded();
    expect(
      describeSelection({
        ...world,
        target: { kind: "placement", id: "p999" },
      }),
    ).toBeUndefined();
  });
});

describe("describeSelection — a void", () => {
  it("reports the level opening, its span, and the sections a void has nothing to fill", () => {
    const world = clearBodies(seeded(), ["p7", "p24"]);
    const slot = voidAt(world, "B|2.45", 0);
    const meta = describeSelection({
      ...world,
      target: { kind: "void", id: slot.id },
    });
    expect(meta).toMatchObject({
      empty: true,
      kind: "void",
      band: "base",
      wall: "B",
      openWmm: 700,
      openHmm: 860,
      spanHmm: 2600,
      canFinish: false,
      canHandle: false,
      canReplace: true,
      canDelete: false,
      sizesMm: [],
    });
  });

  it("returns nothing for a stale void id", () => {
    const world = seeded();
    expect(
      describeSelection({
        ...world,
        target: { kind: "void", id: "A|9.99:v0:0.00" },
      }),
    ).toBeUndefined();
  });
});

describe("describeSelection — width chips", () => {
  it("carries the catalogue's own size set for an insertable body", () => {
    const world = clearBodies(seeded(), ["p1"]);
    expect(world.catalog.get("base-dishwasher")?.sizesMm).toEqual([450, 600]);
    expect(world.catalog.get("hood")?.sizesMm).toEqual([600, 900]);
  });
});
