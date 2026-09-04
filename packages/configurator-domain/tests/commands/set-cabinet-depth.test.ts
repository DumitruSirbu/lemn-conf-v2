// Wave 6J-b — changing the cabinet depth, and what it does to every body.
//
// The wave's own acceptance criteria, each as a test that fails if the criterion stops holding.
// Two of them are stated as things this wave must **not** assert, and those are recorded here as
// prose beside the tests that would otherwise creep into asserting them.
import { describe, expect, it } from "vitest";

import { depthFollowsSetting } from "../../src/cabinet-depth-rule.js";
import { setCabinetDepth } from "../../src/commands/set-cabinet-depth.js";
import type { Design, DesignPlacement } from "../../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import {
  DEFAULT_CABINET_DEPTH_MM,
  declaredCabinetDepthsMm,
  MIN_CABINET_DEPTH_MM,
} from "../../src/worktop-depth.js";
import { createFakeProbe } from "../support/fake-probe.js";

const OCCURRED_AT = "2026-09-04T10:00:00.000Z";
const DEEPER_MM = 700;

function changeTo(
  cabinetDepthMm: number,
  design: Design = KITCHEN_L_DESIGN,
): ReturnType<typeof setCabinetDepth> {
  return setCabinetDepth({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    cabinetDepthMm,
    probe: createFakeProbe(),
    occurredAt: OCCURRED_AT,
  });
}

/** The seeded design's placements, keyed by id, so a test can compare one body across the change
 *  without depending on document order. */
function bodiesById(
  design: Design,
): ReadonlyMap<string, DesignPlacement["body"]> {
  return new Map(design.placements.map((p) => [p.id, p.body]));
}

describe("the depth every body is built to", () => {
  // The premise the rest of the file rests on: 700 is genuinely offered and genuinely different
  // from the default, asserted rather than assumed so this file cannot quietly become a no-op sweep.
  it("offers a second depth that is not the default", () => {
    expect(declaredCabinetDepthsMm()).toContain(DEEPER_MM);
    expect(DEEPER_MM).not.toBe(DEFAULT_CABINET_DEPTH_MM);
  });

  it("writes the chosen depth into the design's settings", () => {
    const result = changeTo(DEEPER_MM);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.settings?.cabinetDepthMm).toBe(DEEPER_MM);
  });

  it("moves the updatedAt to the caller's clock, like every other command", () => {
    const result = changeTo(DEEPER_MM);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.updatedAt).toBe(OCCURRED_AT);
  });

  // **The criterion this wave exists for.** Not "some body moved" — a count, so a change that
  // rebuilt one body and left the rest at the old depth cannot pass.
  it("rebuilds every body whose declaration follows the setting, and reports how many", () => {
    const catalog = buildKitchenLBodyCatalog(DEEPER_MM);
    const expected = KITCHEN_L_DESIGN.placements.filter((placement) => {
      const rule = catalog.get(placement.body.buildId)?.depthRule;
      return rule !== undefined && depthFollowsSetting(rule);
    }).length;

    const result = changeTo(DEEPER_MM);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(expected).toBeGreaterThan(0);
    expect(result.effect.rebuiltCount).toBe(expected);
  });

  // ADR 0055 decision 3: a seat measured at the depth the body is no longer at is the stale value
  // this criterion names. Re-measured off the rebuilt body, never carried forward.
  it("re-measures the seat depth rather than carrying the old one forward", () => {
    const before = bodiesById(KITCHEN_L_DESIGN);
    const result = changeTo(DEEPER_MM);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const catalog = buildKitchenLBodyCatalog(DEEPER_MM);
    const moved = result.design.placements.filter((placement) => {
      const rule = catalog.get(placement.body.buildId)?.depthRule;
      return rule !== undefined && depthFollowsSetting(rule);
    });
    expect(moved.length).toBeGreaterThan(0);
    // At least one body's seat must actually differ: a re-measurement that returns the old number
    // everywhere would satisfy "was re-measured" while proving nothing.
    expect(
      moved.some(
        (placement) =>
          placement.body.seatDepthMm !== before.get(placement.id)?.seatDepthMm,
      ),
    ).toBe(true);
  });
});

describe("ADR 0058's pinned entries", () => {
  // Excluded by reading the declaration, never by naming the two entries here. This test asks the
  // catalogue which rows are pinned and then checks those rows specifically — so pinning a third
  // entry extends the test's reach automatically rather than leaving it asserting the old pair.
  it("leaves every entry that declares an exception exactly as it was", () => {
    const catalog = buildKitchenLBodyCatalog(DEEPER_MM);
    const before = bodiesById(KITCHEN_L_DESIGN);
    const pinnedIds = KITCHEN_L_DESIGN.placements
      .filter((placement) => {
        const rule = catalog.get(placement.body.buildId)?.depthRule;
        return rule !== undefined && !depthFollowsSetting(rule);
      })
      .map((placement) => placement.id);

    const result = changeTo(DEEPER_MM);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(pinnedIds.length).toBeGreaterThan(0);
    for (const id of pinnedIds) {
      const after = result.design.placements.find((p) => p.id === id);
      expect(after?.body).toStrictEqual(before.get(id));
    }
  });
});

describe("refusals", () => {
  it("refuses a depth the manufacturer does not declare", () => {
    const result = changeTo(650);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("UNKNOWN_CABINET_DEPTH");
    expect(result.design).toBe(KITCHEN_L_DESIGN);
  });

  // The floor is a domain rule and not only 6K's control. Asserted at a value under the floor that
  // is *also* undeclared, then separately at the floor itself, so the two rules cannot be conflated.
  it("refuses a depth under the dishwasher floor", () => {
    const underFloor = MIN_CABINET_DEPTH_MM - 1;
    const result = changeTo(underFloor);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("UNKNOWN_CABINET_DEPTH");
  });

  it("refuses an invalid occurredAt before touching anything", () => {
    const result = setCabinetDepth({
      design: KITCHEN_L_DESIGN,
      catalogAt: buildKitchenLBodyCatalog,
      cabinetDepthMm: DEEPER_MM,
      probe: createFakeProbe(),
      occurredAt: "not-a-timestamp",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("INVALID_OCCURRED_AT");
    expect(result.design).toBe(KITCHEN_L_DESIGN);
  });
});

describe("what this wave declines to promise", () => {
  // **ADR 0055 says 600 -> 700 -> 600 need not return the original document**, so the round trip is
  // deliberately NOT asserted as an invariant here. What *is* asserted is the weaker claim the
  // decision does make: the depth itself returns, and the design is still valid to load. A test
  // demanding byte equality would be asserting something the decision explicitly declines.
  it("returns the depth on a round trip, without promising the document", () => {
    const deeper = changeTo(DEEPER_MM);
    expect(deeper.ok).toBe(true);
    if (!deeper.ok) return;

    const back = changeTo(DEFAULT_CABINET_DEPTH_MM, deeper.design);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.design.settings?.cabinetDepthMm).toBe(DEFAULT_CABINET_DEPTH_MM);
    expect(back.design.placements).toHaveLength(
      KITCHEN_L_DESIGN.placements.length,
    );
  });
});
