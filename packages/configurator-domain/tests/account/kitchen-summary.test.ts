import { describe, expect, it } from "vitest";

import { kitchenSummaryOf } from "../../src/account/index.js";
import type { Design } from "../../src/design.js";
import { KITCHEN_L_DESIGN } from "../../src/fixtures/kitchen-l-design.js";
import { presetNameFactsOf } from "../../src/preset/preset-name-facts.js";

const LINEAR_ROOM: Design["room"] = {
  shape: "linear",
  widthMm: 3000,
  depthMm: 2400,
  heightMm: 2600,
};

const U_ROOM: Design["room"] = {
  shape: "U",
  widthMm: 4000,
  depthMm: 2800,
  wallCMm: 3200,
  heightMm: 2600,
};

const FREE_COLOUR = { kind: "free-colour", value: "#336699" } as const;

function inRoom(room: Design["room"]): Design {
  return { ...KITCHEN_L_DESIGN, room };
}

describe("kitchenSummaryOf: what a kitchen's card says about it", () => {
  it("gives the shape, the walls in millimetres and the finish", () => {
    const summary = kitchenSummaryOf(KITCHEN_L_DESIGN);

    expect(summary.shape).toBe("L");
    expect(summary.wallsMm).toEqual([
      KITCHEN_L_DESIGN.room.widthMm,
      KITCHEN_L_DESIGN.room.depthMm,
    ]);
    expect(summary.finish).toEqual(presetNameFactsOf(KITCHEN_L_DESIGN).finish);
  });

  it("is exactly the facts a preset's generated name is made of: one definition of them", () => {
    for (const design of [
      KITCHEN_L_DESIGN,
      inRoom(LINEAR_ROOM),
      inRoom(U_ROOM),
    ]) {
      expect(kitchenSummaryOf(design)).toEqual(presetNameFactsOf(design));
    }
  });

  it("gives a straight room one wall: its depth is the drawn floor's and no wall", () => {
    const summary = kitchenSummaryOf(inRoom(LINEAR_ROOM));

    expect(summary.shape).toBe("linear");
    expect(summary.wallsMm).toEqual([3000]);
  });

  it("gives a U three walls in the order A, B, C", () => {
    const summary = kitchenSummaryOf(inRoom(U_ROOM));

    expect(summary.shape).toBe("U");
    expect(summary.wallsMm).toEqual([4000, 2800, 3200]);
  });

  it("reports a chosen free colour as the finish", () => {
    const design: Design = {
      ...KITCHEN_L_DESIGN,
      settings: { ...KITCHEN_L_DESIGN.settings, finish: FREE_COLOUR },
    };

    expect(kitchenSummaryOf(design).finish).toEqual(FREE_COLOUR);
  });

  it("changes when the room changes and when the colour changes", () => {
    const base = kitchenSummaryOf(KITCHEN_L_DESIGN);

    expect(
      kitchenSummaryOf({
        ...KITCHEN_L_DESIGN,
        room: { ...KITCHEN_L_DESIGN.room, widthMm: 4100 },
      }).wallsMm[0],
    ).toBe(4100);
    expect(
      kitchenSummaryOf({
        ...KITCHEN_L_DESIGN,
        settings: { ...KITCHEN_L_DESIGN.settings, finish: FREE_COLOUR },
      }),
    ).not.toEqual(base);
  });

  it("is deterministic and leaves its input untouched", () => {
    const before = structuredClone(KITCHEN_L_DESIGN);

    const first = kitchenSummaryOf(KITCHEN_L_DESIGN);
    const second = kitchenSummaryOf(KITCHEN_L_DESIGN);

    expect(second).toEqual(first);
    expect(KITCHEN_L_DESIGN).toEqual(before);
  });

  it("carries codes and numbers, never a sentence", () => {
    const summary = kitchenSummaryOf(KITCHEN_L_DESIGN);
    const stringLeaves = JSON.stringify(summary).match(/"[^"]*"/g) ?? [];

    expect(Object.keys(summary).sort()).toEqual(["finish", "shape", "wallsMm"]);
    expect(stringLeaves.filter((leaf) => /\s/.test(leaf))).toEqual([]);
  });
});
