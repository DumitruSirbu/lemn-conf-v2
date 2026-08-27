import { describe, expect, it } from "vitest";

import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { setFinish, setHandle } from "../../src/commands/set-appearance.js";
import { describeSelection } from "../../src/queries/describe-selection.js";
import { clearBodies, OCCURRED_AT } from "../support/commands.js";
import { advance, createWorld, voidAt } from "../support/kitchen-world.js";
import { preMigrationHobDesign } from "../support/pre-migration-hob.js";
import type { BodyCatalog } from "../../src/void-engine.js";

const seeded = () => createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);

/** The seeded catalogue with one entry given a width set, for the `canWidth` true case: no seeded
 *  entry ships `sizesMm`, and M4's plan carries that gap into M5. */
function withSizes(buildId: string, sizesMm: readonly number[]): BodyCatalog {
  const entry = KITCHEN_L_BODY_CATALOG.get(buildId);
  if (!entry) throw new Error(`no seeded entry ${buildId}`);
  return new Map(KITCHEN_L_BODY_CATALOG).set(buildId, { ...entry, sizesMm });
}

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

  // ADR 0027: the shipped design's hob is a mesh inside `p2`'s body, so the accessory §9 has to
  // describe now only reaches the panel from a document saved before that migration.
  it("reports the hob as an accessory that cannot be replaced or deleted", () => {
    const world = createWorld(preMigrationHobDesign(), KITCHEN_L_BODY_CATALOG);
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

describe("describeSelection — §9's canWidth flag", () => {
  it("is true for a body whose width the catalogue lets move", () => {
    const world = createWorld(
      KITCHEN_L_DESIGN,
      withSizes("base-sink-800", [600, 800]),
    );
    const meta = describeSelection({
      ...world,
      target: { kind: "placement", id: "p0" },
    });
    expect(meta).toMatchObject({ fixedWidth: false, canWidth: true });
  });

  // FINDING R2.7. This asserted `canWidth: false` for a movable-width body with no widths — the
  // R1.3 rule, which folded "has widths to offer" into the flag and made `canWidth: true,
  // sizesMm: []` a representable contradiction. §9 states the rule as "selected · not empty · not
  // `fixedWidth`" and nothing more, so the flag is that again and the panel's width *section*
  // declines when there are no chips (asserted in `apps/web/tests/panel/panel-model.test.ts`). The
  // consequence that matters: M5's missing seeded width sets now fail loudly instead of hiding
  // behind a silently-false capability.
  it("is true for a movable-width body even when the catalogue gives it no widths", () => {
    const world = seeded();
    const meta = describeSelection({
      ...world,
      target: { kind: "placement", id: "p0" },
    });
    expect(meta).toMatchObject({
      fixedWidth: false,
      sizesMm: [],
      canWidth: true,
    });
  });

  // FINDING R2.9. `meta.sizesMm` published the catalogue row RAW while `offersFor` published it
  // through `buildableSizes`. They agreed only because `base-sink`'s row was pre-filtered to
  // [600, 800] by hand; the next entry to declare a `minWidthMm` without pre-filtering would break
  // the width chips and not the offer rows. One function now decides both.
  it("drops a width below the entry's own builder floor from the chips", () => {
    const entry = KITCHEN_L_BODY_CATALOG.get("base-sink-800");
    if (!entry) throw new Error("no seeded entry base-sink-800");
    // Deliberately NOT pre-filtered: 400 and 500 are under the floor and still in the row.
    const catalog: BodyCatalog = new Map(KITCHEN_L_BODY_CATALOG).set(
      "base-sink-800",
      { ...entry, sizesMm: [400, 500, 600, 800], minWidthMm: 560 },
    );
    const world = createWorld(KITCHEN_L_DESIGN, catalog);
    const meta = describeSelection({
      ...world,
      target: { kind: "placement", id: "p0" },
    });
    expect(meta?.sizesMm).toEqual([600, 800]);
  });

  // §11 rows 14 and 16: a fixed-width body has no width section to render.
  it("is false for every fixed-width body", () => {
    const world = seeded();
    const fixed = world.records.filter((record) => record.fixedWidth);
    expect(fixed.length).toBeGreaterThan(0);
    for (const record of fixed) {
      const meta = describeSelection({
        ...world,
        target: { kind: "placement", id: record.id },
      });
      expect(meta?.canWidth).toBe(false);
    }
  });

  it("is false for a void, which has nothing to resize", () => {
    const world = clearBodies(seeded(), ["p1"]);
    const opening = voidAt(world, "A|2.00", 0);
    const meta = describeSelection({
      ...world,
      target: { kind: "void", id: opening.id },
    });
    expect(meta).toMatchObject({ empty: true, canWidth: false });
  });
});

describe("describeSelection — the appearance the chips must mark", () => {
  it("carries no finish or handle until one is chosen", () => {
    const world = seeded();
    const meta = describeSelection({
      ...world,
      target: { kind: "placement", id: "p0" },
    });
    expect(meta?.finish).toBeUndefined();
    expect(meta?.handle).toBeUndefined();
  });

  it("carries the finish and handle a command applied", () => {
    const world = seeded();
    const finished = setFinish({
      design: world.design,
      catalog: world.catalog,
      target: { kind: "placement", id: "p0" },
      finish: "sage",
      occurredAt: OCCURRED_AT,
    });
    if (!finished.ok) throw new Error(finished.reason.code);
    const handled = setHandle({
      design: finished.design,
      catalog: world.catalog,
      target: { kind: "placement", id: "p0" },
      handle: "black",
      occurredAt: OCCURRED_AT,
    });
    if (!handled.ok) throw new Error(handled.reason.code);

    const meta = describeSelection({
      ...advance(world, handled.design),
      target: { kind: "placement", id: "p0" },
    });
    expect(meta).toMatchObject({ finish: "sage", handle: "black" });
  });

  // §6.5 / §11 row 13: the default follows the module line the body stands on, not its band.
  it("defaults a top-row body to push-to-open and a base body to a bar handle", () => {
    const world = seeded();
    const top = describeSelection({
      ...world,
      target: { kind: "placement", id: "p15" },
    });
    const base = describeSelection({
      ...world,
      target: { kind: "placement", id: "p0" },
    });
    expect(top?.defaultHandle).toBe("push");
    expect(base?.defaultHandle).toBe("steel");
  });
});
