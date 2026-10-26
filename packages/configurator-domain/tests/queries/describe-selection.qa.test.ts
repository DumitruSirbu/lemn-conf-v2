// Adversarial pass over the three fields M4 wave 4A added to `meta`: `canWidth`, `finish`/`handle`,
// and `defaultHandle`.
//
// The wave's own suite proves each with one or two placements. This sweeps the whole seeded
// population and pins §6.5's module line at the millimetre either side of it, because a default
// decided by a `>=` on a metre value is exactly the kind of rule that is right for the example that
// was checked and wrong one module line up.
import { describe, expect, it } from "vitest";

import { TOP_ROW_Y0_M } from "../../src/bands.js";
import { setHandle } from "../../src/commands/set-appearance.js";
import type { Design, DesignPlacement } from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  KITCHEN_L_PLACEMENTS,
} from "../../src/fixtures/kitchen-l-design.js";
import { describeSelection } from "../../src/queries/describe-selection.js";
import { clearBodies, OCCURRED_AT } from "../support/commands.js";
import { advance, createWorld } from "../support/kitchen-world.js";

const seeded = () => createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);

function metaFor(world: ReturnType<typeof seeded>, id: string) {
  return describeSelection({
    kitchenSettings: {},
    ...world,
    target: { kind: "placement", id },
  });
}

describe("§9's canWidth, over the whole seeded population", () => {
  // `canWidth` is §9 section 6's own words and nothing more: "selected · not empty · not
  // `fixedWidth`". No §11 row states it.
  // Folding "has widths to offer" into it makes `canWidth: true, sizesMm: []` a representable
  // contradiction and hides M5's missing seeded width sets behind a silently-false capability.
  // Whether there is anything to RENDER is the panel's width section to decide, and it declines
  // when there are no chips.
  it("is 'not fixed width' for every seeded body, both answers present", () => {
    const world = seeded();
    let fixed = 0;
    let flexible = 0;
    for (const record of world.records) {
      const meta = metaFor(world, record.id);
      expect([record.id, meta?.canWidth]).toEqual([
        record.id,
        !record.fixedWidth,
      ]);
      if (record.fixedWidth) fixed += 1;
      else flexible += 1;
    }
    expect(fixed).toBeGreaterThan(0);
    expect(flexible).toBeGreaterThan(0);
    // M5 wave 5B turned this over. It used to state the tension rather than assume it — every
    // flexible seeded body published `canWidth` while none of them had a single width to offer —
    // and it now states the resolved fact: the sets arrived, through each row's declared
    // `catalogEquivalentId` (ADR 0022), so **no** willing body is left chipless.
    //
    // What the pair of assertions guards is unchanged, and it is why neither was replaced by the
    // other. `willing.length === flexible` pins §9's rule itself: `canWidth` is `!fixedWidth` and
    // has not quietly acquired a "has widths to offer" clause. The list below pins the data: a
    // seeded row that loses its pointer stops resolving a set, and this fails instead of the width
    // section silently disappearing from the panel.
    const willing = world.records
      .filter((record) => metaFor(world, record.id)?.canWidth)
      .map((record) => record.id);
    expect(willing.length).toBe(flexible);
    expect(
      willing.filter((id) => (metaFor(world, id)?.sizesMm ?? []).length === 0),
    ).toEqual([]);
  });

  // §9: an empty slot hides Finisaj, Mâner and Lățime. The panel gates on these three flags alone,
  // so a void that published any of them true would render a section with nothing behind it.
  it("leaves a void with no finish, handle or width flag, for every derived slot", () => {
    const world = clearBodies(seeded(), ["p1", "p7", "p12", "p24"]);
    expect(world.voids.length).toBeGreaterThan(0);
    let swept = 0;
    for (const record of world.voids) {
      const meta = describeSelection({
        kitchenSettings: {},
        ...world,
        target: { kind: "void", id: record.id },
      });
      expect([
        record.id,
        meta?.empty,
        meta?.canFinish,
        meta?.canHandle,
        meta?.canWidth,
      ]).toEqual([record.id, true, false, false, false]);
      expect(meta?.sizesMm).toEqual([]);
      swept += 1;
    }
    expect(swept).toBeGreaterThan(0);
  });
});

describe("§6.5's default handle at the module line itself", () => {
  const line = Math.round(TOP_ROW_Y0_M * 1000);

  function designAt(y0Mm: number): Design {
    const placement: DesignPlacement = {
      id: "probe",
      wall: "A",
      alongMm: 300,
      y0Mm,
      body: { buildId: "wall-2door-600-top", widthMm: 600, heightMm: 400 },
    };
    return { ...KITCHEN_L_DESIGN, placements: [placement] };
  }

  it("switches to push-to-open exactly at the line, not a millimetre either side", () => {
    for (const [y0Mm, expected] of [
      [line - 1, "steel"],
      [line, "push"],
      [line + 1, "push"],
      [0, "steel"],
    ] as const) {
      const world = createWorld(designAt(y0Mm), KITCHEN_L_BODY_CATALOG);
      expect([y0Mm, metaFor(world, "probe")?.defaultHandle]).toEqual([
        y0Mm,
        expected,
      ]);
    }
  });

  it("agrees with the rule the scene hides handles by, for every seeded placement", () => {
    const world = seeded();
    let swept = 0;
    for (const placement of KITCHEN_L_PLACEMENTS) {
      const record = world.records.find(
        (candidate) => candidate.id === placement.id,
      );
      const meta = metaFor(world, placement.id);
      const rendered =
        Math.round((record?.frame.y0 ?? 0) * 1000) >= line ? "push" : "steel";
      expect([placement.id, meta?.defaultHandle]).toEqual([
        placement.id,
        rendered,
      ]);
      swept += 1;
    }
    expect(swept).toBe(KITCHEN_L_PLACEMENTS.length);
  });

  // A recorded mode never changes the default: the panel needs both, so it can say the mark came
  // from a choice rather than from §6.5.
  it("keeps publishing the default a body would fall back to after a handle is chosen", () => {
    const world = seeded();
    const result = setHandle({
      design: world.design,
      catalog: world.catalog,
      target: { kind: "placement", id: "p15" },
      handle: "steel",
      occurredAt: OCCURRED_AT,
    });
    if (!result.ok) throw new Error(result.reason.code);
    const meta = metaFor(advance(world, result.design), "p15");
    expect(meta).toMatchObject({ handle: "steel", defaultHandle: "push" });
  });

  it("never omits defaultHandle, for any selection in the kitchen", () => {
    const world = clearBodies(seeded(), ["p1", "p7", "p24"]);
    let swept = 0;
    for (const target of [
      ...world.records.map((record) => ({
        kind: "placement" as const,
        id: record.id,
      })),
      ...world.voids.map((record) => ({
        kind: "void" as const,
        id: record.id,
      })),
    ]) {
      const meta = describeSelection({ kitchenSettings: {}, ...world, target });
      expect(["steel", "black", "push"]).toContain(meta?.defaultHandle);
      swept += 1;
    }
    expect(swept).toBeGreaterThan(0);
  });
});

describe("the appearance fields are absent, never defaulted", () => {
  it("omits finish and handle on every untouched seeded body", () => {
    const world = seeded();
    let swept = 0;
    for (const record of world.records) {
      const meta = metaFor(world, record.id);
      expect([record.id, meta?.finish, meta?.handle]).toEqual([
        record.id,
        undefined,
        undefined,
      ]);
      swept += 1;
    }
    expect(swept).toBeGreaterThan(0);
  });
});
